const CACHE_NAME = 'sulog-write-v20';
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch('/write/precache.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('App shell manifest unavailable');
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(await response.json());
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('sulog-write-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      !/^\/(write|admin|components|assets)\//.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone()).catch(() => {});
      return response;
    } catch {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate' && url.pathname.startsWith('/write/')) return (await cache.match('/write/index.html')) || Response.error();
      return Response.error();
    }
  })());
});
