/**
 * 契约 Pact — Service Worker
 * Stale-while-revalidate: show cached version instantly, update in background.
 * Next time you open the app, you get the latest code — no manual version bump needed.
 */

const CACHE_NAME = 'pact-cache';
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
  self.skipWaiting();
});

// ============ Activate: Clean old caches & claim clients ============
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ============ Message: Listen for skip-waiting from client ============
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

// ============ Fetch: stale-while-revalidate for everything ============
// Strategy: return cached copy immediately, fetch latest in background.
// Next visit gets the updated version automatically.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and non-http(s)
  if (event.request.method !== 'GET' || !url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        // Fire background update
        const fetched = fetch(event.request).then((response) => {
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => cached);

        // Return cached immediately, falling back to network
        return cached || fetched;
      })
    )
  );
});
