const CACHE_NAME = 'sulog-write-v7';
const APP_SHELL = [
  '/write/',
  '/write/index.html',
  '/write/write.js',
  '/write/editor.js',
  '/write/editor-guard.js',
  '/write/pdf.js',
  '/write/page-mode.js',
  '/admin/index.html',
  '/admin/admin.js',
  '/components/mastodon_oauth.js',
  '/components/mastodon.js',
  '/components/content-dependencies.js'
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
    const cached = await cache.match(request);

    const networkPromise = fetch(request)
      .then(response => {
        if (response && (response.ok || response.type === 'opaque')) {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      })
      .catch(() => null);

    if (cached) {
      event.waitUntil(networkPromise);
      return cached;
    }

    const network = await networkPromise;
    if (network) return network;

    if (request.mode === 'navigate') {
      return (await cache.match('/write/index.html')) || Response.error();
    }

    return Response.error();
  })());
});
