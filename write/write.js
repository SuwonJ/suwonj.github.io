const DB_NAME = 'sulog-write';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const DRAFT_KEY = 'current-draft';
const ACCOUNT_KEY = 'mastodon-account';
const VISIBILITY_KEY = 'sulog_write_visibility';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function dbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function restoreIndexedDbDraft() {
  try {
    if (localStorage.getItem('sulog_admin_draft')) return;
    const cached = await dbGet(DRAFT_KEY);
    if (!cached?.draft) return;
    localStorage.setItem('sulog_admin_draft', JSON.stringify(cached.draft));
  } catch (error) {
    console.warn('IndexedDB draft restore failed:', error);
  }
}

function installVisibilityControl() {
  const configBar = document.querySelector('.config-bar');
  if (!configBar || document.getElementById('write-visibility')) return;

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:.5rem;padding:.45rem 0 0;font-size:.78rem;color:var(--text-muted);';
  row.innerHTML = `
    <span class="material-symbols-outlined" style="font-size:16px;">visibility</span>
    <label for="write-visibility">Mastodon 공개범위</label>
    <select id="write-visibility" style="background:var(--bg-main);color:var(--text-main);border:1px solid var(--border-color);border-radius:5px;padding:.25rem .45rem;font:inherit;">
      <option value="public">공개</option>
      <option value="unlisted">비목록</option>
      <option value="private">팔로워 전용</option>
    </select>
    <span id="write-offline-state" style="margin-left:auto;"></span>
  `;
  configBar.appendChild(row);

  const select = row.querySelector('#write-visibility');
  select.value = localStorage.getItem(VISIBILITY_KEY) || 'public';
  select.addEventListener('change', () => localStorage.setItem(VISIBILITY_KEY, select.value));
}

function installFetchLayer() {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();

    // 기존 Mastodon 래퍼는 application/x-www-form-urlencoded body를 문자열로 보낸다.
    // /write에서 새 포스트를 만들 때만 선택한 공개범위를 끼워 넣는다.
    if (method === 'POST' && /\/api\/v1\/statuses(?:\?|$)/.test(url) && init.body != null) {
      const rawBody = init.body instanceof URLSearchParams ? init.body.toString() : String(init.body);
      const body = new URLSearchParams(rawBody);
      if (!body.has('visibility')) {
        body.set('visibility', localStorage.getItem(VISIBILITY_KEY) || 'public');
      }
      init = { ...init, body: body.toString() };
    }

    // 오프라인에서 인증 확인 실패가 logout()으로 이어지는 것을 막는다.
    if (!navigator.onLine && /\/api\/v1\/accounts\/verify_credentials(?:\?|$)/.test(url)) {
      const cachedAccount = await dbGet(ACCOUNT_KEY).catch(() => null);
      const offlineAccount = cachedAccount || { id: 'offline', acct: 'offline', avatar: '' };
      return new Response(JSON.stringify(offlineAccount), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const response = await nativeFetch(input, init);

    if (response.ok && /\/api\/v1\/accounts\/verify_credentials(?:\?|$)/.test(url)) {
      response.clone().json().then(account => dbSet(ACCOUNT_KEY, account)).catch(() => {});
    }

    return response;
  };
}

function installDraftMirror() {
  const title = document.getElementById('input-title');
  const tags = document.getElementById('input-tags');
  const editor = document.getElementById('editor-textarea');
  if (!title || !tags || !editor) return;

  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const active = document.querySelector('.cat-opt.active');
      const draft = {
        category: active?.dataset.cat || 'blog',
        title: title.value,
        tags: tags.value,
        markdown: editor.value,
        updatedAt: new Date().toLocaleTimeString()
      };
      try {
        await dbSet(DRAFT_KEY, { draft, savedAt: Date.now() });
      } catch (error) {
        console.warn('IndexedDB draft backup failed:', error);
      }
    }, 250);
  };

  title.addEventListener('input', save);
  tags.addEventListener('input', save);
  editor.addEventListener('input', save);
  document.querySelectorAll('.cat-opt').forEach(el => el.addEventListener('click', save));
}

function updateConnectionState() {
  const state = document.getElementById('write-offline-state');
  if (!state) return;
  state.textContent = navigator.onLine ? '온라인' : '오프라인 · 로컬 저장 중';
  state.style.color = navigator.onLine ? 'var(--accent-green)' : '#fbbf24';

  const server = document.getElementById('status-server');
  if (server) {
    server.textContent = navigator.onLine
      ? '서버: maximux.suwonmars.com'
      : '오프라인: IndexedDB 캐시 사용 중';
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/write/sw.js', { scope: '/write/' });
  } catch (error) {
    console.warn('Service worker registration failed:', error);
  }
}

async function waitForAdminReady(timeoutMs = 8000) {
  const start = performance.now();

  // admin.js는 initAdminStudio()를 비동기로 호출하지만 그 Promise를 export하지 않는다.
  // import()가 끝났다고 loadDraft()/setupEditorAndPreview()까지 끝난 것은 아니므로,
  // 인증 UI가 준비된 뒤 한 프레임 더 기다려 초기화가 textarea를 늦게 덮어쓰는 race를 막는다.
  while (performance.now() - start < timeoutMs) {
    const authReady = document.querySelector('#btn-login, .user-chip');
    const textarea = document.getElementById('editor-textarea');
    if (authReady && textarea) {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  console.warn('Admin initialization readiness check timed out; continuing with textarea state as-is.');
}

await registerServiceWorker();
await restoreIndexedDbDraft();
installFetchLayer();
installVisibilityControl();

// 기존 CMS 로직을 그대로 재사용한다. DOM은 /admin/index.html과 동일하다.
// 중요: admin.js 내부 초기화가 끝나기 전에 CodeMirror를 붙이면 늦게 실행된 loadDraft()가
// 사용자가 막 입력한 내용을 textarea -> CodeMirror 방향으로 덮어쓸 수 있다.
await import('../admin/admin.js');
await waitForAdminReady();

installDraftMirror();
updateConnectionState();
window.addEventListener('online', updateConnectionState);
window.addEventListener('offline', updateConnectionState);

// CodeMirror 로딩에 실패해도 기존 textarea CMS는 그대로 쓸 수 있게 fallback한다.
try {
  const { installWriteEditor } = await import('./editor.js');
  await installWriteEditor();
} catch (error) {
  console.error('CodeMirror initialization failed; falling back to textarea:', error);
  const status = document.getElementById('status-draft');
  if (status) status.textContent = 'CodeMirror 로드 실패 · 기본 에디터 사용 중';
}
