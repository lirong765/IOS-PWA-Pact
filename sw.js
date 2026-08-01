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

// ============ Message: Listen for commands from client ============
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data && event.data.action === 'clearShellCache') {
    caches.open(CACHE_NAME).then((cache) => {
      APP_SHELL.forEach((file) => {
        cache.delete(new Request(file));
      });
    });
  }
});

// Track if we've already notified this session
let updateNotified = false;

// ============ Fetch: stale-while-revalidate + instant update notification ============
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and non-http(s)
  if (event.request.method !== 'GET' || !url.protocol.startsWith('http')) return;

  const isShell = APP_SHELL.some((f) => url.pathname.endsWith(f));

  // Cache-busted requests (e.g., check update): network-first, don't cache
  if (url.searchParams.has('t')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        // Fire background update
        const fetched = fetch(event.request).then((response) => {
          if (response.ok) {
            // Compare with cached version for app shell files
            if (isShell && cached && !updateNotified) {
              response.clone().text().then((newText) => {
                cached.text().then((oldText) => {
                  if (newText !== oldText) {
                    updateNotified = true;
                    // Tell all open clients: content has been updated
                    self.clients.matchAll().then((clients) => {
                      clients.forEach((client) => {
                        client.postMessage({ action: 'content-updated' });
                      });
                    });
                  }
                });
              });
            }
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
