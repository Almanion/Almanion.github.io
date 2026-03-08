const CACHE_NAME = 'almanion-v1';
const STATIC_ASSETS = [
    '/docs/index.html',
    '/docs/style.css',
    '/docs/script.js',
    '/docs/settings.js',
    '/docs/bookmarks.js',
    '/docs/newyear.js',
    '/docs/firebase-config.js',
    '/docs/firebase-analytics.js',
    '/docs/knowledge-check.js',
    '/docs/knowledge-check-exam.js',
    '/docs/physics.html',
    '/docs/physics-exam.html',
    '/docs/physics%2007.02.html',
    '/docs/chemistry.html',
    '/docs/math.html',
    '/docs/geometry.html',
    '/docs/geometry-formulas.html',
    '/docs/likbez.html',
    '/docs/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch(() => {
                return STATIC_ASSETS.reduce((promise, url) => {
                    return promise.then(() =>
                        cache.add(url).catch(() => console.warn('SW: failed to cache', url))
                    );
                }, Promise.resolve());
            });
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);

    if (url.origin !== location.origin) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
