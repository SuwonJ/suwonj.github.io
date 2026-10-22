import { assertSourceReady, fetchSourceDocument, fetchSourceText } from './source-api.js?v=26';
import { splitSourceThread, isReadableSource, joinSourceThread, readSourceChunk, decodeSourceThread, statusPlainText as rawStatusText } from './source-thread.js?v=26';
import { stripMetadataTags } from './editor-tools.js?v=26';
import { TEXT_MARKER as THREAD_MARKER, MEDIA_MARKER, statusPlainText, removeInternalMarker, internalStatusKind, fetchDocumentStructure, mediaDescriptors } from './mastodon_document.js?v=26';

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

async function splitStatusText(statusText, sourceText, visibility = selectedVisibility()) {
  // Source API deliberately never exposes non-public statuses. Respect the
  // author's visibility choice instead of silently changing it to public.
  if (visibility !== 'public')
    throw new Error('원문 API는 public 글만 지원합니다. 공개범위를 공개로 선택한 뒤 발행해 주세요.');
  const maxCharacters = await getMaxCharacters();
  const { markdown, tags: legacyTags } = extractTrailingTagBlock(statusText);
  const source = sourceText ?? markdown;
  const tags = sourceText == null ? legacyTags : statusText.slice(sourceText.length).replace(/^\n\n/, '');
  if ((sourceText != null && !statusText.startsWith(sourceText)) || tags && !/^#[^\s#]+(?:[ \t]+#[^\s#]+)*$/u.test(tags))
    throw new Error('본문과 메타데이터 태그 경계가 올바르지 않습니다.');
  const sourceAccountId = await assertSourceReady();
  const account = await fetchAccountInfo();
  if (String(account?.id) !== sourceAccountId) throw new Error('원문 API에 설정된 작성자 계정으로 로그인해 주세요.');
  return splitSourceThread(source, tags, maxCharacters - THREAD_SAFETY_MARGIN);
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
  return document.getElementById('write-visibility')?.value || localStorage.getItem('sulog_write_visibility') || 'public';
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

export async function postStatus({ statusText, sourceText: originalSource, spoilerText, mediaIds = [], media = [], visibility = null }) {
  const chosenVisibility = visibility || selectedVisibility();
  originalSource ??= extractTrailingTagBlock(statusText).markdown;
  const chunks = await splitStatusText(statusText, originalSource, chosenVisibility);
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
    if (await fetchSourceDocument([root.id, ...textStatuses.map(status => status.id)]) !== originalSource) throw new Error('게시된 원문 검증 실패');
    return { ...attachDocumentInfo(root, textStatuses, mediaVaults), sulog_source_text: originalSource };
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

export async function updateStatus({ id, statusText, sourceText: originalSource, spoilerText, mediaIds = [], media = [] }) {
  const original = await getStatusForEdit(id);
  if (original.visibility !== 'public') throw new Error('public 글만 원문 프로토콜로 수정할 수 있습니다.');
  originalSource ??= extractTrailingTagBlock(statusText).markdown;
  const chunks = await splitStatusText(statusText, originalSource);
  const { textStatuses: existing, mediaVaults: existingVaults } = await loadDocument(original);
  if (existing.some(status => status.visibility !== 'public')) throw new Error('모든 본문 청크가 public이어야 합니다.');
  const previous = [];
  for (const statusId of [id, ...existing.map(status => status.id)]) previous.push(await fetchSourceText(statusId));
  if (isReadableSource(previous[0])) joinSourceThread(previous);
  else if (readSourceChunk(previous[0])) decodeSourceThread(previous);
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
    if ((previous[i + 1].startsWith(THREAD_MARKER) ? previous[i + 1].slice(THREAD_MARKER.length) : previous[i + 1]) !== desired[i]) {
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
  if (await fetchSourceDocument([root.id, ...finalText.map(status => status.id)]) !== originalSource) throw new Error('수정된 원문 검증 실패');
  return { ...attachDocumentInfo(root, finalText, [...existingVaults, ...newVaults]), sulog_source_text: originalSource };
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

  // exclude_replies only excludes replies to OTHER accounts. Self-replies
  // are text/media chunks, not standalone Sulog documents.
  const roots = [];
  let cursor = maxId;
  const seenCursors = new Set();
  for (let page = 0; page < 20 && roots.length < limit; page++) {
    const url = new URL(`${INSTANCE_URL}/api/v1/accounts/${user.id}/statuses`);
    url.searchParams.set("exclude_reblogs", "true");
    url.searchParams.set("exclude_replies", "true");
    url.searchParams.set("limit", "40");
    if (cursor) url.searchParams.set("max_id", String(cursor));
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`게시글 목록 조회 실패: ${await response.text()}`);
    const statuses = await response.json();
    if (!Array.isArray(statuses)) throw new Error("잘못된 Mastodon 목록 응답입니다.");

    roots.push(...statuses
      .filter(status => status.in_reply_to_id == null && internalStatusKind(status) == null)
      .slice(0, limit - roots.length));

    if (statuses.length < 40 || roots.length >= limit) break;
    const nextCursor = String(statuses[statuses.length - 1]?.id || "");
    if (!nextCursor || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  return roots;
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
    if (!response.ok) throw new Error(`원문 조회 실패 (${response.status})`);
    return response.json();
  }));
  if (sources.every(Boolean)) {
    if (isReadableSource(sources[0].text)) { combined.sulog_source_text = joinSourceThread(sources.map(source => source.text)); return combined; }
    if (readSourceChunk(sources[0].text)) { combined.sulog_source_text = decodeSourceThread(sources.map(source => source.text)); return combined; }
    const tags = (combined.tags || []).map(tag => tag.name);
    combined.sulog_source_text = sources.map((source, index) => {
      const text = index === 0 ? source.text : removeInternalMarker(source.text);
      return index === 0 ? stripMetadataTags(text, tags) : text;
    }).join('\n\n');
  }
  return combined;
}
