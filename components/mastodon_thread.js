import {
  postStatus,
  updateStatus,
  deleteStatus,
  fetchAccountInfo,
  getStoredToken
} from './mastodon_oauth.js';

const INSTANCE_URL = 'https://maximux.suwonmars.com';
const FALLBACK_MAX = 500;
const SAFETY_MARGIN = 12;

let cachedMaxCharacters = null;

export async function getStatusMaxCharacters() {
  if (cachedMaxCharacters) return cachedMaxCharacters;
  try {
    const res = await fetch(`${INSTANCE_URL}/api/v2/instance`);
    if (res.ok) {
      const data = await res.json();
      const max = Number(data?.configuration?.statuses?.max_characters);
      if (Number.isFinite(max) && max > 100) {
        cachedMaxCharacters = max;
        return max;
      }
    }
  } catch (error) {
    console.warn('Could not read Mastodon status limit:', error);
  }
  cachedMaxCharacters = FALLBACK_MAX;
  return FALLBACK_MAX;
}

function splitLongPlainBlock(text, limit) {
  const result = [];
  let rest = text.trim();

  while (rest.length > limit) {
    const window = rest.slice(0, limit + 1);
    const minCut = Math.floor(limit * 0.45);
    const candidates = [
      window.lastIndexOf('\n\n'),
      window.lastIndexOf('\n'),
      Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '), window.lastIndexOf('。 ')),
      window.lastIndexOf(' ')
    ];
    let cut = candidates.find(index => index >= minCut);
    if (cut == null || cut < 1) cut = limit;
    else if (window.slice(cut, cut + 2) === '. ' || window.slice(cut, cut + 2) === '! ' || window.slice(cut, cut + 2) === '? ') cut += 1;

    result.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }

  if (rest) result.push(rest);
  return result;
}

function tokenizeMarkdownBlocks(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let buffer = [];
  let protectedType = null;
  let fenceMarker = null;

  const flush = (protectedBlock = false) => {
    if (!buffer.length) return;
    const text = buffer.join('\n').trim();
    if (text) blocks.push({ text, protected: protectedBlock });
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (protectedType === 'code') {
      buffer.push(line);
      if (trimmed.startsWith(fenceMarker)) {
        flush(true);
        protectedType = null;
        fenceMarker = null;
      }
      continue;
    }

    if (protectedType === 'math') {
      buffer.push(line);
      if (trimmed === '$$' && buffer.length > 1) {
        flush(true);
        protectedType = null;
      }
      continue;
    }

    const fenceMatch = trimmed.match(/^(```+|~~~+)/);
    if (fenceMatch) {
      flush(false);
      protectedType = 'code';
      fenceMarker = fenceMatch[1][0].repeat(fenceMatch[1].length);
      buffer.push(line);
      continue;
    }

    if (trimmed === '$$') {
      flush(false);
      protectedType = 'math';
      buffer.push(line);
      continue;
    }

    if (!trimmed) {
      flush(false);
      continue;
    }

    buffer.push(line);
  }

  flush(Boolean(protectedType));
  return blocks;
}

function fitBlocks(blocks, limit) {
  const chunks = [];
  let current = '';

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const block of blocks) {
    if (block.text.length > limit) {
      pushCurrent();
      if (block.protected) {
        throw new Error(`하나의 코드/수식 블록이 Mastodon 한도(${limit}자)를 넘습니다. 블록을 나눠 주세요.`);
      }
      chunks.push(...splitLongPlainBlock(block.text, limit));
      continue;
    }

    const candidate = current ? `${current}\n\n${block.text}` : block.text;
    if (candidate.length <= limit) {
      current = candidate;
    } else {
      pushCurrent();
      current = block.text;
    }
  }

  pushCurrent();
  return chunks;
}

export async function splitDocumentForMastodon(markdown, formattedTags = '') {
  const maxCharacters = await getStatusMaxCharacters();
  const childLimit = Math.max(100, maxCharacters - SAFETY_MARGIN);
  const suffix = formattedTags ? `\n\n${formattedTags}` : '';
  const firstLimit = childLimit - suffix.length;
  if (firstLimit < 100) throw new Error('태그가 너무 길어 첫 타래에 본문을 넣을 공간이 없습니다.');

  const blocks = tokenizeMarkdownBlocks(markdown);
  const firstPass = fitBlocks(blocks, childLimit);
  if (!firstPass.length) return { chunks: [suffix.trim()], maxCharacters };

  // 첫 status만 태그 공간이 필요하므로, 첫 chunk가 넘치면 첫 chunk만 다시 작은 한도로 쪼갠다.
  let chunks = [...firstPass];
  if (chunks[0].length > firstLimit) {
    const firstBlocks = tokenizeMarkdownBlocks(chunks.shift());
    const splitFirst = fitBlocks(firstBlocks, firstLimit);
    chunks = [...splitFirst, ...chunks];
  }

  chunks[0] = `${chunks[0]}${suffix}`.trim();
  return { chunks, maxCharacters };
}

export async function fetchOwnThreadChain(rootId) {
  const token = getStoredToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const [contextRes, account] = await Promise.all([
    fetch(`${INSTANCE_URL}/api/v1/statuses/${rootId}/context`, { headers }),
    token ? fetchAccountInfo().catch(() => null) : Promise.resolve(null)
  ]);
  if (!contextRes.ok) return [];
  const context = await contextRes.json();
  const descendants = context.descendants || [];
  const accountId = account?.id || null;

  const chain = [];
  let parentId = String(rootId);
  const used = new Set();

  while (true) {
    const candidates = descendants
      .filter(status => !used.has(String(status.id)))
      .filter(status => String(status.in_reply_to_id || '') === parentId)
      .filter(status => !accountId || String(status.account?.id || '') === String(accountId))
      .filter(status => !(status.spoiler_text || '').trim())
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (!candidates.length) break;
    const next = candidates[0];
    chain.push(next);
    used.add(String(next.id));
    parentId = String(next.id);
  }

  return chain;
}

async function createChildChain(chunks, rootId) {
  const created = [];
  let parentId = rootId;
  for (const chunk of chunks) {
    const status = await postStatus({ statusText: chunk, inReplyToId: parentId });
    created.push(status);
    parentId = status.id;
  }
  return created;
}

export async function publishDocumentThread({ markdown, formattedTags, spoilerText, mediaIds = [] }) {
  const { chunks, maxCharacters } = await splitDocumentForMastodon(markdown, formattedTags);
  const root = await postStatus({
    statusText: chunks[0],
    spoilerText,
    mediaIds
  });
  const children = await createChildChain(chunks.slice(1), root.id);
  return { root, children, chunks, maxCharacters };
}

export async function updateDocumentThread({ rootId, markdown, formattedTags, spoilerText, mediaIds = [] }) {
  const { chunks, maxCharacters } = await splitDocumentForMastodon(markdown, formattedTags);
  const existingChildren = await fetchOwnThreadChain(rootId);

  const root = await updateStatus({
    id: rootId,
    statusText: chunks[0],
    spoilerText,
    mediaIds
  });

  const desiredChildren = chunks.slice(1);
  const common = Math.min(existingChildren.length, desiredChildren.length);

  for (let i = 0; i < common; i += 1) {
    await updateStatus({
      id: existingChildren[i].id,
      statusText: desiredChildren[i],
      spoilerText: '',
      mediaIds: []
    });
  }

  let parentId = common > 0 ? existingChildren[common - 1].id : rootId;
  const created = [];
  for (let i = common; i < desiredChildren.length; i += 1) {
    const status = await postStatus({ statusText: desiredChildren[i], inReplyToId: parentId });
    created.push(status);
    parentId = status.id;
  }

  // 뒤쪽부터 지워서 아직 필요한 reply chain을 건드리지 않는다.
  for (let i = existingChildren.length - 1; i >= desiredChildren.length; i -= 1) {
    await deleteStatus(existingChildren[i].id);
  }

  return { root, children: [...existingChildren.slice(0, common), ...created], chunks, maxCharacters };
}

export async function deleteDocumentThread(rootId) {
  const children = await fetchOwnThreadChain(rootId);
  for (let i = children.length - 1; i >= 0; i -= 1) {
    await deleteStatus(children[i].id);
  }
  return deleteStatus(rootId);
}
