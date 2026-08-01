/**
 * 契约 Pact — Service Worker
 * Cache-first strategy for app shell, network-first for data
 * Auto-update notification when new version detected
 */

const CACHE_NAME = 'pact-v3';
const APP_SHELL = [
  '.',
  'index.html',
  'app.js',
  'manifest.json',
];

// ============ Install: Cache app shell ============
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Take over immediately (don't wait for old SW to release)
  self.skipWaiting();
});

// ============ Activate: Clean old caches & claim clients ============
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// ============ Message: Listen for skip-waiting from client ============
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

// ============ Fetch: Cache-first for shell, network-first for everything else ============
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and non-http(s)
  if (event.request.method !== 'GET' || !url.protocol.startsWith('http')) return;

  // APP_SHELL: cache-first
  if (APP_SHELL.some((f) => url.pathname.endsWith(f))) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
    return;
  }

  // Everything else: network-first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful GET responses
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
