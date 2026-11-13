// Service Worker für Bornheim – Frankfurt am Main
// Speichert 3D-Modelle, Texturen, Three.js sowie besuchte Stadtkacheln (JSON + Höhenmodell) lokal im Cache.
// Programmdateien (*.js, *.html) nutzen Network-First mit Offline-Fallback, damit Updates sofort ankommen.

const CACHE_STATIC = 'bornheim-static-v2';
const CACHE_TILES = 'bornheim-tiles-v4';

const CORE_ASSETS = [
  './',
  './play.html',
  './game.js?v=2',
  './weapons.js',
  './demo.js',
  './story.js',
  './shops.js',
  './interiors.js',
  './progress.js',
  './fire.js',
  './heli.js',
  './eulen.js',
  './vokabaum.js',
  './touch.js',
  './feedback.js',
  './vendor/three/build/three.module.js',
  './data/tiles/index.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => cache.addAll(CORE_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_STATIC && k !== CACHE_TILES).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // 1) Stadtkacheln & Höhenmodelle (data/tiles/*.json, data/dem/*.bin): Cache-First (unveränderliche Kartendaten)
  if ((path.includes('/data/tiles/') && !path.endsWith('/index.json')) || path.includes('/data/dem/')) {
    event.respondWith(
      caches.open(CACHE_TILES).then(cache =>
        cache.match(req).then(cached => {
          if (cached) return cached;
          return fetch(req).then(res => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // 2) 3D-Modelle, Texturen & Vendor-Bibliotheken: Cache-First
  if (path.includes('/assets/') || path.includes('/vendor/')) {
    event.respondWith(
      caches.open(CACHE_STATIC).then(cache =>
        cache.match(req).then(cached => {
          if (cached) return cached;
          return fetch(req).then(res => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // 3) HTML, Haupt-JS und Kachel-Index: Network-First mit Offline-Fallback
  event.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_STATIC).then(cache => cache.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
