const CACHE_NAME = 'gather-shell-v4';
const SHELL_FILES = [
  './', './index.html', './style.css', './config.js', './mock-api.js',
  './api.js', './supabase-client.js', './app.js', './manifest.json', './icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Only cache-serve this app's own static shell, and only as an offline
// fallback: always try the network first so updates show immediately, and
// fall back to cache when there's no connection. Requests to Supabase (a
// different origin) are left alone entirely — they always need the network.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
