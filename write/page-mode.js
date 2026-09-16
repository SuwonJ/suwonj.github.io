const VISIBILITY_KEY = 'sulog_write_visibility';

function setPageVisibilityDefault() {
  const select = document.getElementById('write-visibility');
  if (!select) return;
  select.value = 'unlisted';
  localStorage.setItem(VISIBILITY_KEY, 'unlisted');
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function ensurePageMode() {
  const pageOption = document.querySelector('.cat-opt[data-cat="page"]');
  const visibility = document.getElementById('write-visibility');
  if (!pageOption || !visibility) return false;

  let previousActive = null;
  const syncMode = () => {
    const active = document.querySelector('.cat-opt.active')?.dataset.cat || null;
    if (active === 'page' && previousActive !== 'page') {
      setPageVisibilityDefault();
    }
    previousActive = active;
  };

  pageOption.addEventListener('click', () => queueMicrotask(syncMode));

  const selector = document.querySelector('.cat-selector');
  if (selector) {
    new MutationObserver(syncMode).observe(selector, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  syncMode();
  return true;
}

function install() {
  if (ensurePageMode()) return;
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (ensurePageMode() || tries > 40) clearInterval(timer);
  }, 100);
}

install();
