// Sulog document protocol. All persistent data lives in Mastodon statuses/media.
export const TEXT_MARKER = "\u2063\u2063"; // legacy continuation marker; do not change
export const MEDIA_MARKER = "\u2063\u2064"; // media vault, always a direct reply to root
const MAX_CONTEXT_WINDOWS = 80;
const PUBLIC_CONTEXT_DEPTH = 20;

export function statusPlainText(status) {
  const doc = new DOMParser().parseFromString(status?.content || '', 'text/html');
  doc.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
  doc.querySelectorAll('p').forEach(el => el.insertAdjacentText('afterend', '\n\n'));
  return (doc.body.textContent || '').replace(/\r\n?/g, '\n').trim();
}

export function internalStatusKind(status) {
  const text = statusPlainText(status).trimStart();
  if (text.startsWith(TEXT_MARKER)) return 'text';
  if (text.startsWith(MEDIA_MARKER)) return 'media';
  return null;
}

export function removeInternalMarker(text) {
  return String(text || '').replace(/^[\s\u200b]*(?:\u2063\u2063|\u2063\u2064)/u, '').trim();
}

function directChildren(statuses, parentId, accountId, kind) {
  return statuses
    .filter(status => String(status.in_reply_to_id || '') === String(parentId))
    .filter(status => String(status.account?.id || '') === String(accountId))
    .filter(status => internalStatusKind(status) === kind)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

// A public context response is depth-limited. Continue from the last text node
// instead of assuming the root context contains the entire long document.
export async function fetchDocumentStructure(rootId, {
  instanceUrl,
  accountId,
  token = null,
  strict = true
} = {}) {
  if (!accountId) throw new Error('문서 소유자 정보를 확인할 수 없습니다.');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const visitedContexts = new Set();
  const used = new Set();
  const textStatuses = [];
  const mediaVaults = [];
  let contextId = String(rootId);
  let parentId = String(rootId);

  for (let windowNumber = 0; windowNumber < MAX_CONTEXT_WINDOWS; windowNumber += 1) {
    if (visitedContexts.has(contextId)) throw new Error('문서 타래에서 순환 참조가 발견되었습니다.');
    visitedContexts.add(contextId);
    const response = await fetch(`${instanceUrl}/api/v1/statuses/${contextId}/context`, { headers });
    if (!response.ok) {
      if (strict) throw new Error(`문서 타래를 불러오지 못했습니다. (${response.status})`);
      return { textStatuses, mediaVaults };
    }
    const context = await response.json();
    const descendants = context.descendants || [];

    if (contextId === String(rootId)) {
      mediaVaults.push(...directChildren(descendants, rootId, accountId, 'media'));
    }

    let advanced = 0;
    while (true) {
      const next = directChildren(descendants, parentId, accountId, 'text')
        .find(status => !used.has(String(status.id)));
      if (!next) break;
      used.add(String(next.id));
      textStatuses.push(next);
      parentId = String(next.id);
      advanced += 1;
    }

    // Avoid making an extra request for small documents. Public contexts are
    // 20 levels deep; a full context can also be truncated at the status limit.
    const possibleTruncation = token ? 4000 : 55;
    if (advanced < PUBLIC_CONTEXT_DEPTH - 2 && descendants.length < possibleTruncation) {
      return { textStatuses, mediaVaults };
    }
    if (!advanced) {
      // No direct continuation exists in the current window. Do not silently
      // loop forever or return a partial document when the context is full.
      if (descendants.length >= possibleTruncation) {
        throw new Error('문서 context가 잘려 타래를 복원할 수 없습니다.');
      }
      return { textStatuses, mediaVaults };
    }
    contextId = parentId;
  }
  throw new Error('문서가 너무 길어 자동 복원을 중단했습니다.');
}

export function mediaDescriptors(statuses) {
  return statuses.flatMap(status => (status.media_attachments || []).map(media => ({
    id: String(media.id),
    url: media.url || media.preview_url || '',
    type: media.type || 'unknown',
    description: media.description || ''
  })));
}


// Mastodon's exclude_replies filters replies to OTHER accounts; replies to
// yourself can still appear in account timelines. Only top-level statuses
// represent Sulog documents. All TEXT/MEDIA replies belong to their root.
export function isDocumentRootStatus(status) {
  return Boolean(status && status.in_reply_to_id == null);
}

// Fetch enough timeline pages to return requested DOCUMENTS instead of counting
// internal reply chunks against the listing limit.
export async function fetchDocumentRoots({
  instanceUrl,
  accountId,
  token = null,
  tag = null,
  limit = 40,
  maxId = null
} = {}) {
  const roots = [];
  let cursor = maxId;
  const seenCursors = new Set();

  for (let page = 0; page < 20 && roots.length < limit; page++) {
    const url = new URL(`${instanceUrl}/api/v1/accounts/${accountId}/statuses`);
    url.searchParams.set('exclude_reblogs', 'true');
    url.searchParams.set('exclude_replies', 'true');
    url.searchParams.set('limit', '40');
    if (tag) url.searchParams.set('tagged', tag);
    if (cursor) url.searchParams.set('max_id', String(cursor));

    const response = await fetch(url.toString(), {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) {
      throw new Error(`게시글 목록을 불러오지 못했습니다. (${response.status})`);
    }
    const statuses = await response.json();
    if (!Array.isArray(statuses)) throw new Error('잘못된 게시글 목록 응답입니다.');
    roots.push(...statuses.filter(isDocumentRootStatus).slice(0, limit - roots.length));

    if (statuses.length < 40 || roots.length >= limit) break;
    const nextCursor = String(statuses[statuses.length - 1]?.id || '');
    if (!nextCursor || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  return roots;
}
