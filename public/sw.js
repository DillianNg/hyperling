/**
 * Service worker.
 *
 * Deliberately conservative. Caching the wrong thing in a multi-user app means
 * showing one learner another learner's page, so:
 *   - only GET requests, only same-origin
 *   - build output under /_next/static is cache-first (content-hashed, immutable)
 *   - everything else is network-only, including every page and every API call
 *   - the offline page appears only when the network actually fails
 *
 * Nothing containing learner data is ever stored.
 */

const VERSION = 'v1';
const STATIC_CACHE = `hyperling-static-${VERSION}`;
const OFFLINE_URL = '/ngoai-tuyen';

const PRECACHE = [OFFLINE_URL, '/icon.svg', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Auth callbacks and anything under /api must always hit the network.
  if (url.pathname.startsWith('/auth') || url.pathname.startsWith('/api')) return;

  // Build output is content-hashed, so a cache hit can never be stale.
  if (url.pathname.startsWith('/_next/static/') || PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Pages: network only, with an offline page if the network is gone. Nothing
  // is written to the cache, because pages are per-learner.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error())),
    );
  }
});
