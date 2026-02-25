/**
 * MILESTONE COUNTER — sw.js (Service Worker)
 *
 * What this does:
 *  - On install: pre-caches all app shell files so the app works offline.
 *  - On fetch: serves cached files first ("cache-first" strategy).
 *    If a file isn't cached, it falls through to the network.
 *
 * Cache versioning:
 *  Increment CACHE_VERSION whenever you deploy changes. This forces the old
 *  cache to be cleared and the new files to be fetched.
 *
 * Trade-off:
 *  Cache-first means users always get the last installed version even when
 *  online. This is ideal for a personal app where consistent offline behaviour
 *  matters more than always-fresh content. For a content site you'd use
 *  network-first instead.
 */

'use strict';

const CACHE_VERSION = 'milestone-v1';

/**
 * The "app shell" — every file needed to run the app offline.
 * If you add new files (e.g. more icons), add them here.
 */
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // Google Fonts — these are cached on first load; not available on very first offline visit
  // but that's acceptable because the fallback fonts (monospace / sans-serif) look fine.
];


/* ── Install event ─────────────────────────────────
   Triggered once when the service worker is first installed.
   We open (or create) our named cache and add all app shell files to it.
── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then(cache => {
        console.log('[SW] Pre-caching app shell');
        // addAll fetches and caches every URL; if any fail, install fails.
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        // Skip waiting so the new service worker activates immediately
        // rather than waiting for all existing tabs to close.
        return self.skipWaiting();
      })
  );
});


/* ── Activate event ────────────────────────────────
   Triggered after install, once the worker takes control.
   We clean up any stale caches from previous versions here.
── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_VERSION)  // keep only current version
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        // Claim all open clients (tabs) immediately
        return self.clients.claim();
      })
  );
});


/* ── Fetch event ───────────────────────────────────
   Intercepts every network request the page makes.
   Strategy: cache-first with network fallback.
── */
self.addEventListener('fetch', event => {
  // Only handle GET requests; skip POST, etc.
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Serve from cache — fast and offline-capable
        return cached;
      }

      // Not in cache — try the network
      return fetch(event.request).then(networkResponse => {
        // Cache the new resource so it's available next time
        // (Important for Google Fonts and any dynamic resources)
        if (networkResponse && networkResponse.status === 200) {
          const cloned = networkResponse.clone(); // responses can only be consumed once
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, cloned));
        }
        return networkResponse;
      }).catch(() => {
        // Network failed and not in cache — nothing to show.
        // For an app shell file this shouldn't happen after first load.
        console.warn('[SW] Network fetch failed and resource not cached:', event.request.url);
      });
    })
  );
});
