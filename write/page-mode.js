const VISIBILITY_KEY = 'sulog_write_visibility';

function setPageVisibilityDefault() {
  const select = document.getElementById('write-visibility');
  if (!select) return;
  select.value = 'unlisted';
  localStorage.setItem(VISIBILITY_KEY, 'unlisted');
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function relabelPageCards() {
  document.querySelectorAll('.post-card').forEach(card => {
    const view = card.querySelector('.view-btn');
    if (!view || !/\/page\/\?id=/.test(view.getAttribute('href') || '')) return;
    const badge = card.querySelector('.badge-tag');
    if (badge) {
      badge.textContent = '#page';
      badge.style.background = 'rgba(52,211,153,.12)';
      badge.style.color = '#a7f3d0';
    }
  });
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

  const postsList = document.getElementById('posts-list');
  if (postsList) {
    new MutationObserver(relabelPageCards).observe(postsList, { childList: true, subtree: true });
  }

  syncMode();
  relabelPageCards();
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
