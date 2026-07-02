const CACHE_VERSION = 'almanion-pwa-2026-07-01';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
    '/',
    '/index.html',
    '/offline.html',
    '/manifest.json',
    '/style.css',
    '/style-new.css',
    '/script.js',
    '/settings.js',
    '/bookmarks.js',
    '/newyear.js',
    '/account.js',
    '/poll.js',
    '/knowledge-check.js',
    '/knowledge-check-exam.js',
    '/firebase-config.js',
    '/firebase-analytics.js',
    '/matcenter.js',
    '/styles/tokens.css',
    '/styles/buttons.css',
    '/styles/mobile-overrides.css',
    '/styles/copy-blocks.css',
    '/styles/chemistry-interactive-hub.css',
    '/favicons/favicon.svg',
    '/favicons/favicon-al.svg',
    '/favicons/favicon-ch.svg',
    '/favicons/favicon-geo.svg',
    '/favicons/favicon-lik.svg',
    '/favicons/favicon-mc.svg',
    '/favicons/favicon-ph.svg',
    '/math.html',
    '/physics.html',
    '/physics-exam.html',
    '/chemistry.html',
    '/geometry.html',
    '/geometry-formulas.html',
    '/likbez.html',
    '/matcenter.html'
];

const CACHEABLE_CROSS_ORIGINS = new Set([
    'https://cdn.jsdelivr.net',
    'https://www.gstatic.com'
]);

self.addEventListener('install', (event) => {
    event.waitUntil(precacheAppShell());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keep = new Set([APP_SHELL_CACHE, RUNTIME_CACHE]);
        const keys = await caches.keys();
        await Promise.all(keys.map(key => keep.has(key) ? null : caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    if (url.origin !== self.location.origin) {
        if (CACHEABLE_CROSS_ORIGINS.has(url.origin)) {
            event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
        }
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request, APP_SHELL_CACHE, '/offline.html'));
        return;
    }

    if (isStaticAsset(request, url)) {
        event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
        return;
    }

    if (url.pathname.endsWith('.html')) {
        event.respondWith(networkFirst(request, APP_SHELL_CACHE, '/offline.html'));
        return;
    }

    event.respondWith(networkFirst(request, RUNTIME_CACHE));
});

async function precacheAppShell() {
    const cache = await caches.open(APP_SHELL_CACHE);
    await Promise.all(APP_SHELL.map(async (url) => {
        try {
            const request = new Request(url, { cache: 'reload' });
            const response = await fetch(request);
            if (response.ok) await cache.put(url, response);
        } catch (err) {
            // Часть страниц может отсутствовать в локальной сборке — PWA не должна падать целиком.
            console.warn('SW: failed to precache', url, err);
        }
    }));
}

function isStaticAsset(request, url) {
    if (['style', 'script', 'worker', 'font', 'image'].includes(request.destination)) return true;
    return /\.(?:css|js|mjs|svg|png|jpg|jpeg|webp|gif|ico|woff2?|ttf|otf)$/i.test(url.pathname);
}

async function networkFirst(request, cacheName, fallbackUrl) {
    const cache = await caches.open(cacheName);

    try {
        const response = await fetch(request);
        if (canCache(response)) cache.put(request, response.clone());
        return response;
    } catch (_) {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (fallbackUrl) {
            const fallback = await caches.match(fallbackUrl);
            if (fallback) return fallback;
        }
        return new Response('Offline', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    const fetched = fetch(request)
        .then((response) => {
            if (canCache(response)) cache.put(request, response.clone());
            return response;
        })
        .catch(() => null);

    return cached || await fetched || new Response('', { status: 504, statusText: 'Offline' });
}

function canCache(response) {
    return response && (response.ok || response.type === 'opaque');
}
