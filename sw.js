const CACHE_NAME = 'share-plate-v1';
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

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
});

// Fetch Event (Allows app to load from cache when offline)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});