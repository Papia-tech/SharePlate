const CACHE_NAME = 'share-plate-v2'; // ⬅️ CHANGE VERSION ON EVERY UPDATE

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './login.html',
  './style.css',
  './login.css',
  './script.js',
  './login.js',
  './SharePlate.png',
  './Favicon.png'
];

// INSTALL — cache files & activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting(); // 🔥 important
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

// ACTIVATE — remove old caches & take control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim(); // 🔥 important
});

// FETCH — cache-first, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
