// 泡泡选片 service worker: app shell precache, network-first pages, cache-first hashed assets.
const CACHE = 'paopao-select-v2';
const scope = new URL(self.registration.scope);
const at = (path) => new URL(path, scope).href;
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'].map(at);
const OPTIONAL = ['./good-will-hunting.jpg'].map(at);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(CORE);
      try {
        const html = await (await fetch(at('./'), { cache: 'no-store' })).text();
        const assets = [...html.matchAll(/(?:src|href)="((?:\.\/|\/)?assets\/[^"]+)"/g)].map((m) => at(m[1]));
        await cache.addAll([...new Set(assets)]);
      } catch (e) {
        /* assets get cached on first use instead */
      }
      await Promise.all(OPTIONAL.map((u) => cache.add(u).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3500)),
    ]);
    if (response && response.ok) cache.put(fallbackUrl || request, response.clone());
    return response;
  } catch (e) {
    return (await cache.match(fallbackUrl || request)) || (await cache.match(at('./index.html'))) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (e) {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scope.origin || url.pathname.includes('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, at('./')));
    return;
  }
  event.respondWith(url.pathname.includes('/assets/') ? cacheFirst(request) : networkFirst(request));
});
