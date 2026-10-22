import { dbGet, dbSet } from '../components/drafts.js?v=27';
const ACCOUNT_KEY = 'mastodon-account';
const VISIBILITY_KEY = 'sulog_write_visibility';
const mode = localStorage.getItem('sulog_write_editor_mode');
document.body.classList.add(`write-mode-${mode === 'preview' ? 'preview' : 'source'}`);

function installVisibilityControl() {
  const configBar = document.querySelector('.config-bar');
  if (!configBar || document.getElementById('write-visibility')) return;

  const row = document.createElement('div');
  row.className = 'metadata-field visibility-control';
  row.innerHTML = `
    <label class="field-label" for="write-visibility">공개 범위</label>
    <select id="write-visibility">
      <option value="public">공개</option>
      <option value="unlisted">비목록</option>
      <option value="private">팔로워 전용</option>
    </select>
  `;
  (configBar.querySelector('.metadata-row') || configBar).appendChild(row);

  const footer = document.querySelector('.footer-connection');
  if (footer && !document.getElementById('write-offline-state')) {
    const status = document.createElement('span');
    status.id = 'write-offline-state';
    footer.prepend(status);
  }

  const select = row.querySelector('#write-visibility');
  select.value = localStorage.getItem(VISIBILITY_KEY) || 'public';
  select.addEventListener('change', () => localStorage.setItem(VISIBILITY_KEY, select.value));
}

function simplifyWriteUi() {
  document.querySelector('.toolbar').append(document.getElementById('write-settings'));

  const settings = document.getElementById('write-settings');
  document.addEventListener('pointerdown', event => {
    if (!settings.contains(event.target)) settings.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && settings.open) { settings.open = false; settings.querySelector('summary').focus(); }
  });

  const categoryButtons = document.querySelector('.cat-selector');
  if (categoryButtons && !document.getElementById('write-category')) {
    const compact = document.createElement('select');
    compact.id = 'write-category';
    compact.className = 'write-category-select';
    compact.setAttribute('aria-label', '게시 위치');
    for (const option of categoryButtons.querySelectorAll('.cat-opt[data-cat]')) {
      const item = document.createElement('option');
      item.value = option.dataset.cat;
      item.textContent = option.textContent.trim();
      compact.append(item);
    }
    categoryButtons.before(compact);
    compact.addEventListener('change', () => {
      categoryButtons.querySelector(`[data-cat="${compact.value}"]`)?.click();
    });
    const syncCategory = () => {
      const active = categoryButtons.querySelector('.cat-opt.active');
      if (active && compact.value !== active.dataset.cat) compact.value = active.dataset.cat;
    };
    new MutationObserver(syncCategory).observe(categoryButtons, {
      subtree: true, attributes: true, attributeFilter: ['class']
    });
    syncCategory();
  }
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
  if (state) state.textContent = navigator.onLine ? '온라인' : '오프라인 · 로컬 저장 중';
  if (state) state.dataset.online = String(navigator.onLine);

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

installFetchLayer();
installVisibilityControl();
simplifyWriteUi();
localStorage.setItem('sulog_admin_sidebar_open', 'false');
const { adminReady } = await import('../admin/admin.js?v=27');
await adminReady;
updateConnectionState();
window.addEventListener('online', updateConnectionState);
window.addEventListener('offline', updateConnectionState);
registerServiceWorker();
