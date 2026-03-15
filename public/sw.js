const CACHE_NAME = 'fuel-station-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Basic core footprint for PWA heuristic
      return cache.addAll(['/', '/manifest.json', '/icon-192x192.png']);
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Simple network-first fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
