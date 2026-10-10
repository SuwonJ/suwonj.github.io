import { stripMetadataTags } from './editor-tools.js?v=22';
import { TEXT_MARKER as THREAD_MARKER, MEDIA_MARKER, statusPlainText, removeInternalMarker, fetchDocumentStructure, fetchDocumentRoots, mediaDescriptors } from './mastodon_document.js?v=22';

const INSTANCE_URL = "https://maximux.suwonmars.com";

export const REDIRECT_URI = window.location.origin + (window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/');
const SCOPES = "read write";
const FALLBACK_MAX_CHARACTERS = 500;
const THREAD_SAFETY_MARGIN = 12;
let cachedMaxCharacters = null;
let cachedAccount = null;
let cachedAccountToken = null;
let accountRequest = null;

function generateRandomString(length) {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let result = "";
  const values = new Uint8Array(length);
  window.crypto.getRandomValues(values);
  for (let i = 0; i < length; i++) result += charset[values[i] % charset.length];
  return result;
}

function supportsPkceS256() {
  return Boolean(window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === "function");
}

async function generateCodeChallenge(codeVerifier) {
  if (!supportsPkceS256()) throw new Error("PKCE S256 is not available in this browser context");
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function getStoredToken() {
  return localStorage.getItem("mastodon_access_token");
}

export function getStoredClientId() {
  return localStorage.getItem("mastodon_client_id");
}

export function setStoredClientId(clientId) {
  if (clientId) localStorage.setItem("mastodon_client_id", clientId.trim());
  else localStorage.removeItem("mastodon_client_id");
}

export function logout() {
  localStorage.removeItem("mastodon_access_token");
  localStorage.removeItem("pkce_code_verifier");
  window.location.href = REDIRECT_URI;
}

export async function getOrRegisterApp() {
  let clientId = getStoredClientId();
  if (clientId) return clientId;

  const body = new URLSearchParams();
  body.set("client_name", "Sulog Studio");
  body.set("redirect_uris", REDIRECT_URI);
  body.set("scopes", SCOPES);
  body.set("website", window.location.origin);

  const res = await fetch(`${INSTANCE_URL}/api/v1/apps`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`앱 자동 등록 실패: ${await res.text()}`);

  const appData = await res.json();
  setStoredClientId(appData.client_id);
  if (appData.client_secret) localStorage.setItem("mastodon_client_secret", appData.client_secret);
  return appData.client_id;
}

export async function initiateOAuth(clientId) {
  if (!clientId) clientId = await getOrRegisterApp();

  if (!supportsPkceS256() && !localStorage.getItem("mastodon_client_secret")) {
    localStorage.removeItem("mastodon_client_id");
    clientId = await getOrRegisterApp();
  }

  setStoredClientId(clientId);
  localStorage.removeItem("pkce_code_verifier");

  const authUrl = new URL(`${INSTANCE_URL}/oauth/authorize`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId.trim());
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", SCOPES);

  if (supportsPkceS256()) {
    const verifier = generateRandomString(64);
    localStorage.setItem("pkce_code_verifier", verifier);
    const challenge = await generateCodeChallenge(verifier);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
  } else {
    console.warn("Web Crypto subtle API unavailable; continuing OAuth without PKCE S256.");
  }

  window.location.href = authUrl.toString();
}

export async function handleOAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code");
  if (!code) return false;

  const clientId = getStoredClientId();
  if (!clientId) return false;

  const verifier = localStorage.getItem("pkce_code_verifier");
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", clientId);

  const clientSecret = localStorage.getItem("mastodon_client_secret");
  if (clientSecret) body.set("client_secret", clientSecret);

  body.set("code", code);
  body.set("redirect_uri", REDIRECT_URI);
  if (verifier) body.set("code_verifier", verifier);
  body.set("scope", SCOPES);

  const res = await fetch(`${INSTANCE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    console.error("Token exchange failed", await res.text());
    alert("OAuth 인증 실패: 인증 정보를 확인해 주세요.");
    return false;
  }

  const data = await res.json();
  localStorage.setItem("mastodon_access_token", data.access_token);
  localStorage.removeItem("pkce_code_verifier");
  window.history.replaceState({}, document.title, window.location.pathname);
  return true;
}

export async function fetchAccountInfo() {
  const token = getStoredToken();
  if (!token) return null;

  if (cachedAccount && cachedAccountToken === token) return cachedAccount;
  if (accountRequest && cachedAccountToken === token) return accountRequest;

  cachedAccountToken = token;
  accountRequest = (async () => {
    try {
      const res = await fetch(`${INSTANCE_URL}/api/v1/accounts/verify_credentials`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      cachedAccount = await res.json();
      return cachedAccount;
    } catch (e) {
      return null;
    } finally {
      accountRequest = null;
    }
  })();

  return accountRequest;
}

export async function uploadMediaFile(file) {
  const token = getStoredToken();
  if (!token) throw new Error("로그인이 필요합니다.");

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${INSTANCE_URL}/api/v1/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) throw new Error(`Media upload failed: ${await res.text()}`);
  return await res.json();
}

async function getMaxCharacters() {
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
    console.warn("Could not read Mastodon character limit:", error);
  }
  cachedMaxCharacters = FALLBACK_MAX_CHARACTERS;
  return cachedMaxCharacters;
}

function extractTrailingTagBlock(statusText) {
  const text = String(statusText || '').trim();
  const match = text.match(/\n\n((?:#[^\s#]+(?:\s+|$))+?)$/u);
  if (!match) return { markdown: text, tags: '' };
  return {
    markdown: text.slice(0, match.index).trim(),
    tags: match[1].trim()
  };
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

function splitPlainBlock(text, limit) {
  const chunks = [];
  let rest = text.trim();
  while (rest.length > limit) {
    const windowText = rest.slice(0, limit + 1);
    const minCut = Math.floor(limit * 0.45);
    const candidates = [
      windowText.lastIndexOf('\n'),
      Math.max(windowText.lastIndexOf('. '), windowText.lastIndexOf('! '), windowText.lastIndexOf('? '), windowText.lastIndexOf('。 ')),
      windowText.lastIndexOf(' ')
    ];
    let cut = candidates.find(index => index >= minCut);
    if (cut == null || cut < 1) cut = limit;
    else if (['. ', '! ', '? '].includes(windowText.slice(cut, cut + 2))) cut += 1;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function packBlocks(blocks, limit) {
  const chunks = [];
  let current = '';
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const block of blocks) {
    if (block.text.length > limit) {
      flush();
      if (block.protected) {
        throw new Error(`하나의 코드/수식 블록이 Mastodon 한도(${limit}자)를 넘습니다. 블록을 나눠 주세요.`);
      }
      chunks.push(...splitPlainBlock(block.text, limit));
      continue;
    }
    const next = current ? `${current}\n\n${block.text}` : block.text;
    if (next.length <= limit) current = next;
    else {
      flush();
      current = block.text;
    }
  }
  flush();
  return chunks;
}

async function splitStatusText(statusText) {
  const maxCharacters = await getMaxCharacters();
  const limit = Math.max(100, maxCharacters - THREAD_SAFETY_MARGIN);
  const { markdown, tags } = extractTrailingTagBlock(statusText);
  const suffix = tags ? `\n\n${tags}` : '';
  const firstLimit = limit - suffix.length;
  if (firstLimit < 100) throw new Error('태그가 너무 길어 첫 타래에 본문을 넣을 공간이 없습니다.');

  let chunks = packBlocks(tokenizeMarkdownBlocks(markdown), limit);
  if (!chunks.length) chunks = [''];

  if (chunks[0].length > firstLimit) {
    const first = chunks.shift();
    const firstBlocks = tokenizeMarkdownBlocks(first);
    const firstChunks = packBlocks(firstBlocks, firstLimit);
    chunks = [...firstChunks, ...chunks];
  }

  chunks[0] = `${chunks[0]}${suffix}`.trim();
  return chunks;
}

async function rawPostStatus({ statusText, spoilerText, mediaIds = [], inReplyToId = null, visibility = 'public', idempotencyKey = null }) {
  const token = getStoredToken();
  if (!token) throw new Error("로그인이 필요합니다.");

  const body = new URLSearchParams();
  body.set("status", statusText);
  if (spoilerText) body.set("spoiler_text", spoilerText);
  if (inReplyToId) body.set("in_reply_to_id", String(inReplyToId));
  body.set("visibility", visibility);
  mediaIds.forEach(id => body.append("media_ids[]", id));

  const res = await fetch(`${INSTANCE_URL}/api/v1/statuses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Post creation failed: ${await res.text()}`);
  return await res.json();
}

async function rawUpdateStatus({ id, statusText, spoilerText, mediaIds = [] }) {
  const token = getStoredToken();
  if (!token) throw new Error("로그인이 필요합니다.");

  const body = new URLSearchParams();
  body.set("status", statusText);
  if (spoilerText !== undefined) body.set("spoiler_text", spoilerText);
  mediaIds.forEach(mediaId => body.append("media_ids[]", mediaId));

  const res = await fetch(`${INSTANCE_URL}/api/v1/statuses/${id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Post update failed: ${await res.text()}`);
  return await res.json();
}

async function rawDeleteStatus(id) {
  const token = getStoredToken();
  if (!token) throw new Error("로그인이 필요합니다.");
  const res = await fetch(`${INSTANCE_URL}/api/v1/statuses/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Post deletion failed: ${await res.text()}`);
  return await res.json();
}

// The protocol is append-only for media. Text statuses may still be edited in place.
function sourceText(status) {
  return removeInternalMarker(statusPlainText(status));
}

function selectedVisibility() {
  return document.getElementById('write-visibility')?.value || 'public';
}

function vaultVisibility(rootVisibility) {
  // Do not use direct/private mentions: they can be omitted from context and
  // direct visibility requires an explicit recipient.
  return rootVisibility === 'private' || rootVisibility === 'direct' ? 'private' : 'unlisted';
}

function mediaGroups(items) {
  const groups = [];
  let imageGroup = [];
  const flush = () => {
    if (imageGroup.length) groups.push(imageGroup);
    imageGroup = [];
  };
  for (const item of items) {
    if (item.type === 'image') {
      imageGroup.push(item);
      if (imageGroup.length === 4) flush();
    } else {
      flush();
      groups.push([item]); // video, audio, GIF are not mixed with images
    }
  }
  flush();
  return groups;
}

function normalizedMedia(media = [], mediaIds = []) {
  const candidates = media.length ? media : mediaIds.map(id => ({ id, type: 'image' }));
  const unique = new Map();
  for (const value of candidates) {
    const id = typeof value === 'string' ? value : value?.id;
    if (!id) continue;
    unique.set(String(id), { ...(typeof value === 'object' ? value : {}), id: String(id), type: value?.type || 'image' });
  }
  return [...unique.values()];
}

function newIdempotencyKey() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function postMediaVaults({ rootId, media, visibility, createdIds = [] }) {
  const results = [];
  for (const group of mediaGroups(media)) {
    const vault = await rawPostStatus({
      statusText: MEDIA_MARKER,
      inReplyToId: rootId,
      mediaIds: group.map(item => item.id),
      visibility: vaultVisibility(visibility),
      idempotencyKey: newIdempotencyKey()
    });
    createdIds.push(String(vault.id));
    results.push(vault);
  }
  return results;
}

async function loadDocument(root) {
  const structure = await fetchDocumentStructure(root.id, {
    instanceUrl: INSTANCE_URL,
    accountId: root.account?.id,
    token: getStoredToken()
  });
  return structure;
}

async function getStatusForEdit(id) {
  const token = getStoredToken();
  const res = await fetch(`${INSTANCE_URL}/api/v1/statuses/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`문서 원본을 불러오지 못했습니다. (${res.status})`);
  return res.json();
}

function attachDocumentInfo(root, textStatuses, mediaVaults) {
  const chunks = textStatuses.map(status => ({ id: String(status.id), text: sourceText(status) }));
  return {
    ...root,
    sulog_thread_chunk_ids: chunks.map(chunk => chunk.id),
    sulog_thread_chunks: chunks,
    sulog_media_vaults: mediaVaults,
    sulog_document_media: mediaDescriptors([root, ...mediaVaults])
  };
}

export async function postStatus({ statusText, spoilerText, mediaIds = [], media = [], visibility = null }) {
  const chunks = await splitStatusText(statusText);
  const chosenVisibility = visibility || selectedVisibility();
  const inputMedia = normalizedMedia(media, mediaIds);
  const created = [];
  let root;
  try {
    root = await rawPostStatus({
      statusText: chunks[0],
      spoilerText,
      visibility: chosenVisibility,
      idempotencyKey: newIdempotencyKey()
    });
    created.push(String(root.id));
    let parentId = root.id;
    const textStatuses = [];
    for (const chunk of chunks.slice(1)) {
      const child = await rawPostStatus({
        statusText: `${THREAD_MARKER}${chunk}`,
        inReplyToId: parentId,
        visibility: chosenVisibility,
        idempotencyKey: newIdempotencyKey()
      });
      created.push(String(child.id));
      textStatuses.push(child);
      parentId = child.id;
    }
    const mediaVaults = await postMediaVaults({
      rootId: root.id, media: inputMedia, visibility: chosenVisibility, createdIds: created
    });
    return attachDocumentInfo(root, textStatuses, mediaVaults);
  } catch (error) {
    // A failed new document must not leave incomplete public posts behind.
    for (const id of created.reverse()) {
      try { await rawDeleteStatus(id); } catch (cleanupError) {
        console.error('Could not roll back status', id, cleanupError);
      }
    }
    throw error;
  }
}

export async function updateStatus({ id, statusText, spoilerText, mediaIds = [], media = [] }) {
  const chunks = await splitStatusText(statusText);
  const original = await getStatusForEdit(id);
  const { textStatuses: existing, mediaVaults: existingVaults } = await loadDocument(original);
  const alreadyAttached = new Set(mediaDescriptors([original, ...existingVaults]).map(item => item.id));
  const desiredMedia = normalizedMedia(media, mediaIds);
  const additionalMedia = desiredMedia.filter(item => !alreadyAttached.has(item.id));

  // Preserve legacy root attachments. On new documents all media is vault-backed.
  const root = await rawUpdateStatus({
    id, statusText: chunks[0], spoilerText,
    mediaIds: (original.media_attachments || []).map(item => item.id)
  });
  const desired = chunks.slice(1);
  const common = Math.min(existing.length, desired.length);
  const finalText = [];

  for (let i = 0; i < common; i += 1) {
    let status = existing[i];
    if (sourceText(status) !== desired[i]) {
      status = await rawUpdateStatus({
        id: status.id,
        statusText: `${THREAD_MARKER}${desired[i]}`,
        spoilerText: '',
        mediaIds: []
      });
    }
    finalText.push(status);
  }

  let parentId = common ? existing[common - 1].id : id;
  for (let i = common; i < desired.length; i += 1) {
    const child = await rawPostStatus({
      statusText: `${THREAD_MARKER}${desired[i]}`,
      inReplyToId: parentId,
      visibility: original.visibility || 'public',
      idempotencyKey: newIdempotencyKey()
    });
    parentId = child.id;
    finalText.push(child);
  }
  // Delete only surplus tail chunks. Internal vault statuses remain untouched.
  for (let i = existing.length - 1; i >= desired.length; i -= 1) {
    await rawDeleteStatus(existing[i].id);
  }
  const newVaults = await postMediaVaults({
    rootId: id,
    media: additionalMedia,
    visibility: original.visibility || 'public'
  });
  return attachDocumentInfo(root, finalText, [...existingVaults, ...newVaults]);
}

export async function deleteStatus(id) {
  const root = await getStatusForEdit(id);
  const { textStatuses, mediaVaults } = await loadDocument(root);
  for (const child of [...textStatuses].reverse()) await rawDeleteStatus(child.id);
  for (const vault of [...mediaVaults].reverse()) await rawDeleteStatus(vault.id);
  return rawDeleteStatus(id);
}

async function enrichStatusWithThread(status) {
  if (!status) return status;
  const { textStatuses, mediaVaults } = await loadDocument(status);
  const result = attachDocumentInfo(status, textStatuses, mediaVaults);
  return {
    ...result,
    sulog_root_content: status.content,
    content: [status.content, ...textStatuses.map(child => child.content)].join('<p></p>')
  };
}

export async function fetchStatusWithThread(status) {
  return enrichStatusWithThread(status);
}

export async function fetchMyStatuses({ limit = 40, maxId = null } = {}) {
  const token = getStoredToken();
  if (!token) throw new Error("로그인이 필요합니다.");
  const user = await fetchAccountInfo();
  if (!user?.id) throw new Error("사용자 정보를 불러올 수 없습니다.");

  return fetchDocumentRoots({
    instanceUrl: INSTANCE_URL,
    accountId: user.id,
    token,
    limit,
    maxId
  });
}

// Editing must use the authenticated source endpoint, not lossy display HTML.
export async function fetchEditableStatus(status) {
  const fresh = await fetch(`${INSTANCE_URL}/api/v1/statuses/${status.id}`, {
    headers: { Authorization: `Bearer ${getStoredToken()}` }
  });
  if (!fresh.ok) throw new Error(`게시글 조회 실패 (${fresh.status})`);
  const combined = await fetchStatusWithThread(await fresh.json());
  const ids = [status.id, ...(combined.sulog_thread_chunks || []).map(chunk => chunk.id)];
  const sources = await Promise.all(ids.map(async id => {
    const response = await fetch(`${INSTANCE_URL}/api/v1/statuses/${id}/source`, {
      headers: { Authorization: `Bearer ${getStoredToken()}` }
    });
    if (response.status === 404 || response.status === 403) return null;
    if (!response.ok) throw new Error(`원문 조회 실패 (${response.status})`);
    return response.json();
  }));
  if (sources.every(Boolean)) {
    const tags = (combined.tags || []).map(tag => tag.name);
    combined.sulog_source_text = sources.map((source, index) => {
      const text = index === 0 ? source.text : removeInternalMarker(source.text);
      return index === 0 ? stripMetadataTags(text, tags) : text;
    }).join('\n\n');
  }
  return combined;
}
