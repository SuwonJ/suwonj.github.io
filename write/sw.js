const CACHE_NAME = 'sulog-write-v19';
const APP_SHELL = [
  '/write/',
  '/write/index.html',
  '/write/write.js?v=19',
  '/write/editor.js?v=19',
  '/write/editor-guard.js?v=19',
  '/write/pdf.js?v=19',
  '/write/page-mode.js?v=19',
  '/admin/index.html?v=19',
  '/admin/admin.js?v=19',
  '/components/mastodon_oauth.js?v=19',
  '/components/mastodon.js?v=19',
  '/components/content-dependencies.js?v=19'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/oauth/')) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const network = await fetch(request);
      if (network && (network.ok || network.type === 'opaque')) {
        cache.put(request, network.clone()).catch(() => {});
      }
      return network;
    } catch (_) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }

    if (request.mode === 'navigate') {
      return (await cache.match('/write/index.html')) || Response.error();
    }

    return Response.error();
  })());
});
