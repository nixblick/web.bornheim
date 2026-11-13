// Service Worker für Bornheim – Frankfurt am Main
// Speichert 3D-Modelle, Texturen, Three.js sowie besuchte Stadtkacheln (JSON + Höhenmodell) lokal im Cache.
// Programmdateien (*.js, *.html) nutzen Network-First mit Offline-Fallback, damit Updates sofort ankommen.

const CACHE_STATIC = 'bornheim-static-v2';
const CACHE_TILES = 'bornheim-tiles-v4';

// Bilder, Modelle und three.js: eigener Cache, der Programm-Deploys überlebt. pages.yml benennt ihn nur um,
// wenn sich assets/ oder vendor/ geändert haben (vorher lud jeder Deploy rund 25 MB neu).
const CACHE_ASSETS = 'bornheim-assets-v1';

// Nur Adressen, die sich je Deploy nicht ändern. game.js und die Module holt die Seite mit ?v=<Commit>,
// die legt Zweig 3 beim ersten Laden unter der echten Adresse ab (eine Liste hier lud sie nur doppelt).
const CORE_ASSETS = [
  './',
  './play.html',
  './data/tiles/index.json'
];
const CORE_VENDOR = [
  './vendor/three/build/three.module.js'
];

self.addEventListener('install', event => {
  event.waitUntil(Promise.all([
    caches.open(CACHE_STATIC).then(cache => cache.addAll(CORE_ASSETS)).catch(() => {}),
    caches.open(CACHE_ASSETS).then(cache => cache.addAll(CORE_VENDOR)).catch(() => {})
  ]));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_STATIC && k !== CACHE_TILES && k !== CACHE_ASSETS).map(k => caches.delete(k))
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
      caches.open(CACHE_ASSETS).then(cache =>
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
