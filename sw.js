/**
 * MILESTONE COUNTER — sw.js (Service Worker)
 *
 * Cache versioning:
 *  Bump CACHE_VERSION whenever you deploy changes. This forces the old
 *  cache to be cleared and the new files to be fetched fresh.
 *
 *  IMPORTANT: increment this number every time you commit a change.
 *  e.g. milestone-v11 -> milestone-v12 -> milestone-v13 etc.
 *
 *  Current version: milestone-v11
 *
 * Fetch strategy — NETWORK FIRST for app files:
 *  The previous version used cache-first, which meant the app could sit
 *  on a stale cached version for a long time even after you deployed
 *  an update to GitHub. This version flips to network-first:
 *
 *    1. Try to fetch the file from the network (GitHub Pages).
 *    2. If the network responds, serve that fresh version and update
 *       the cache in the background.
 *    3. If the network fails (offline), fall back to the cached version.
 *
 *  This means updates appear as soon as you open the app with an
 *  internet connection, without needing to clear Safari's cache or
 *  wait for the service worker to cycle.
 *
 *  Icons are still served cache-first (they almost never change and
 *  making an extra network request for them every load is wasteful).
 */

'use strict';

const CACHE_VERSION = 'milestone-v11';

// Files to pre-cache on install so the app works offline
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Files to serve cache-first (icons rarely change)
const CACHE_FIRST_PATTERNS = [
  /\/icons\//,
];

/* ── Install: pre-cache all app files ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE_URLS))
      // skipWaiting forces this new service worker to activate immediately,
      // replacing the old one without waiting for all tabs to close.
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: delete any old caches from previous versions ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_VERSION)
          .map(name => caches.delete(name))
      )
    // clients.claim() makes this service worker take control of open pages
    // immediately, so the network-first strategy kicks in right away.
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: network-first for app files, cache-first for icons ── */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // Icons: cache-first (they rarely change, no point hitting the network)
  if (CACHE_FIRST_PATTERNS.some(pattern => pattern.test(url))) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        // Not in cache yet — fetch and store it
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, cloned));
          }
          return response;
        });
      })
    );
    return;
  }

  // App files (HTML, CSS, JS, manifest): network-first.
  // Try the network; serve fresh content if available; fall back to cache if offline.
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Network succeeded — update the cache with the fresh response
        if (networkResponse && networkResponse.status === 200) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, cloned));
        }
        return networkResponse;
      })
      .catch(() => {
        // Network failed (offline) — serve from cache instead
        return caches.match(event.request);
      })
  );
});
