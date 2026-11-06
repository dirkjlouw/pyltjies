// Offline: cache the app shell. The cache name carries the release version (same as package.json).
const VERSION = 'pyltjies-0.1.3';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'games.js', 'rating.js', 'banter.js', 'version.js', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('pyltjies-') && key !== VERSION).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

// Network first, so updates arrive, with the cache as a fallback offline. The API is never cached.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('index.html'))),
  );
});
