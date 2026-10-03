import { dbGet, dbSet } from '../components/drafts.js?v=20';
const ACCOUNT_KEY = 'mastodon-account';
const VISIBILITY_KEY = 'sulog_write_visibility';
const mode = localStorage.getItem('sulog_write_editor_mode') || 'split';
document.body.classList.add(`write-mode-${['split','source','live','preview'].includes(mode) ? mode : 'split'}`);

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

function simplifyWriteUi() {
  document.querySelectorAll('.toolbar .tool-btn[data-cmd], .toolbar .tool-divider').forEach(element => element.remove());
  document.querySelector('.brand-logo .badge')?.remove();
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

// Auth fallback must be in place before the shared studio initializes.
installFetchLayer();
installVisibilityControl();
simplifyWriteUi();
const { adminReady } = await import('../admin/admin.js?v=20');
await adminReady;
updateConnectionState();
window.addEventListener('online', updateConnectionState);
window.addEventListener('offline', updateConnectionState);
registerServiceWorker();
