const INSTANCE_URL = "https://maximux.suwonmars.com";

export const REDIRECT_URI = window.location.origin + (window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/');
const SCOPES = "read write";
const THREAD_MARKER = "\u2063\u2063";
const FALLBACK_MAX_CHARACTERS = 500;
const THREAD_SAFETY_MARGIN = 12;
let cachedMaxCharacters = null;

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

  try {
    const res = await fetch(`${INSTANCE_URL}/api/v1/accounts/verify_credentials`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
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

async function rawPostStatus({ statusText, spoilerText, mediaIds = [], inReplyToId = null }) {
  const token = getStoredToken();
  if (!token) throw new Error("로그인이 필요합니다.");

  const body = new URLSearchParams();
  body.set("status", statusText);
  if (spoilerText) body.set("spoiler_text", spoilerText);
  if (inReplyToId) body.set("in_reply_to_id", String(inReplyToId));
  mediaIds.forEach(id => body.append("media_ids[]", id));

  const res = await fetch(`${INSTANCE_URL}/api/v1/statuses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
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

function htmlTextStartsWithThreadMarker(status) {
  const doc = new DOMParser().parseFromString(status?.content || '', 'text/html');
  return (doc.body.textContent || '').trimStart().startsWith(THREAD_MARKER);
}

async function fetchThreadChain(rootId, accountId = null) {
  const token = getStoredToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${INSTANCE_URL}/api/v1/statuses/${rootId}/context`, { headers });
  if (!res.ok) return [];
  const context = await res.json();
  const descendants = context.descendants || [];
  const chain = [];
  let parentId = String(rootId);
  const used = new Set();

  while (true) {
    const candidates = descendants
      .filter(status => !used.has(String(status.id)))
      .filter(status => String(status.in_reply_to_id || '') === parentId)
      .filter(status => !accountId || String(status.account?.id || '') === String(accountId))
      .filter(status => htmlTextStartsWithThreadMarker(status))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (!candidates.length) break;
    const next = candidates[0];
    chain.push(next);
    used.add(String(next.id));
    parentId = String(next.id);
  }
  return chain;
}

export async function postStatus({ statusText, spoilerText, mediaIds = [] }) {
  const chunks = await splitStatusText(statusText);
  const root = await rawPostStatus({ statusText: chunks[0], spoilerText, mediaIds });
  let parentId = root.id;

  for (const chunk of chunks.slice(1)) {
    const child = await rawPostStatus({
      statusText: `${THREAD_MARKER}${chunk}`,
      inReplyToId: parentId
    });
    parentId = child.id;
  }

  return root;
}

export async function updateStatus({ id, statusText, spoilerText, mediaIds = [] }) {
  const chunks = await splitStatusText(statusText);
  const account = await fetchAccountInfo();
  const existing = await fetchThreadChain(id, account?.id || null);

  const root = await rawUpdateStatus({ id, statusText: chunks[0], spoilerText, mediaIds });
  const desired = chunks.slice(1);
  const common = Math.min(existing.length, desired.length);

  for (let i = 0; i < common; i += 1) {
    await rawUpdateStatus({
      id: existing[i].id,
      statusText: `${THREAD_MARKER}${desired[i]}`,
      spoilerText: '',
      mediaIds: []
    });
  }

  let parentId = common > 0 ? existing[common - 1].id : id;
  for (let i = common; i < desired.length; i += 1) {
    const child = await rawPostStatus({
      statusText: `${THREAD_MARKER}${desired[i]}`,
      inReplyToId: parentId
    });
    parentId = child.id;
  }

  for (let i = existing.length - 1; i >= desired.length; i -= 1) {
    await rawDeleteStatus(existing[i].id);
  }

  return root;
}

export async function deleteStatus(id) {
  const account = await fetchAccountInfo();
  const children = await fetchThreadChain(id, account?.id || null);
  for (let i = children.length - 1; i >= 0; i -= 1) {
    await rawDeleteStatus(children[i].id);
  }
  return rawDeleteStatus(id);
}

async function enrichStatusWithThread(status, accountId) {
  if (!status || Number(status.replies_count || 0) < 1) return status;
  try {
    const chain = await fetchThreadChain(status.id, accountId);
    if (!chain.length) return status;
    return {
      ...status,
      content: [status.content, ...chain.map(child => child.content)].join('<p></p>'),
      sulog_thread_chunk_ids: chain.map(child => child.id)
    };
  } catch (error) {
    console.warn(`Failed to reassemble thread ${status.id}:`, error);
    return status;
  }
}

export async function fetchMyStatuses({ limit = 40, maxId = null } = {}) {
  const token = getStoredToken();
  if (!token) throw new Error("로그인이 필요합니다.");

  const user = await fetchAccountInfo();
  if (!user || !user.id) throw new Error("사용자 정보를 불러올 수 없습니다.");

  let url = `${INSTANCE_URL}/api/v1/accounts/${user.id}/statuses?exclude_reblogs=true&exclude_replies=true&limit=${limit}`;
  if (maxId) url += `&max_id=${maxId}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Failed to fetch statuses: ${await res.text()}`);

  const statuses = await res.json();
  return Promise.all(statuses.map(status => enrichStatusWithThread(status, user.id)));
}
