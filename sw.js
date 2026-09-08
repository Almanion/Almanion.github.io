/* The build writes sw-manifest.js with a content-derived version and a small shell. */
try { importScripts('/sw-manifest.js'); } catch (_) {}

const GENERATED_MANIFEST = self.__ALMANION_SW_MANIFEST || {
    version: 'development',
    shell: ['/', '/index.html', '/offline.html', '/manifest.json']
};
const CACHE_VERSION = 'almanion-pwa-' + GENERATED_MANIFEST.version;
const APP_SHELL_CACHE = CACHE_VERSION + '-shell';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';
const NETWORK_TIMEOUT_MS = 5000;
const RUNTIME_MAX_ENTRIES = 80;
const RUNTIME_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const APP_SHELL = GENERATED_MANIFEST.shell;

const CACHEABLE_CROSS_ORIGINS = new Set([
    'https://cdn.jsdelivr.net',
    'https://www.gstatic.com'
]);

self.addEventListener('install', function (event) {
    event.waitUntil(precacheAppShell());
});

self.addEventListener('activate', function (event) {
    event.waitUntil((async function () {
        const keep = new Set([APP_SHELL_CACHE, RUNTIME_CACHE]);
        const keys = await caches.keys();
        await Promise.all(keys.map(function (key) { return keep.has(key) ? null : caches.delete(key); }));
        await pruneRuntimeCache();
        await self.clients.claim();
    })());
});

self.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    if (url.origin !== self.location.origin) {
        if (CACHEABLE_CROSS_ORIGINS.has(url.origin)) event.respondWith(staleWhileRevalidate(request));
        return;
    }
    if (request.mode === 'navigate' || url.pathname.endsWith('.html')) {
        event.respondWith(networkFirst(request, '/offline.html'));
        return;
    }
    if (isStaticAsset(request, url)) {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }
    event.respondWith(networkFirst(request));
});

async function precacheAppShell() {
    const cache = await caches.open(APP_SHELL_CACHE);
    await Promise.all(APP_SHELL.map(async function (url) {
        try {
            const request = new Request(url, { cache: 'reload' });
            const response = await fetch(request);
            if (await cacheableResponse(request, response)) await cache.put(url, response);
        } catch (_) {
            // One unavailable optional asset must not prevent offline installation.
        }
    }));
}

function isStaticAsset(request, url) {
    if (['style', 'script', 'worker', 'font', 'image'].includes(request.destination)) return true;
    return /\.(?:css|js|mjs|svg|png|jpg|jpeg|webp|gif|ico|woff2?|ttf|otf|json)$/i.test(url.pathname);
}

async function networkFirst(request, fallbackUrl) {
    try {
        const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
        if (await cacheableResponse(request, response)) await storeRuntimeResponse(request, response.clone());
        return response;
    } catch (_) {
        const cached = await freshCachedResponse(request);
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

async function staleWhileRevalidate(request) {
    const cached = await freshCachedResponse(request);
    const fetched = fetch(request).then(async function (response) {
        if (await cacheableResponse(request, response)) await storeRuntimeResponse(request, response.clone());
        return response;
    }).catch(function () { return null; });
    return cached || await fetched || new Response('', { status: 504, statusText: 'Offline' });
}

async function cacheableResponse(request, response) {
    if (!response || (!response.ok && response.type !== 'opaque')) return false;
    if (response.type === 'opaque') return true;
    const url = new URL(request.url);
    if (!url.pathname.endsWith('.json')) return true;
    try {
        const value = await response.clone().json();
        if (url.pathname.includes('/content/') && url.pathname.endsWith('/manifest.json')) {
            return !!value && Array.isArray(value.sections);
        }
        if (url.pathname.includes('/content/') && url.pathname.includes('/sections/')) {
            return !!value && typeof value === 'object' && !!value.id
                && (Array.isArray(value.blocks) || Array.isArray(value.subsections));
        }
        if (url.pathname.endsWith('/search-index.json')) return !!value && Array.isArray(value.entries);
        return value !== null && typeof value === 'object';
    } catch (_) {
        return false;
    }
}

async function fetchWithTimeout(request, timeoutMs) {
    if (typeof AbortController !== 'function' || !timeoutMs) return fetch(request);
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, timeoutMs);
    try {
        return await fetch(request, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function timestampedResponse(response) {
    if (response.type === 'opaque') return response;
    const headers = new Headers(response.headers);
    headers.set('x-almanion-cached-at', String(Date.now()));
    return new Response(await response.blob(), {
        status: response.status,
        statusText: response.statusText,
        headers: headers
    });
}

async function storeRuntimeResponse(request, response) {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, await timestampedResponse(response));
    await pruneRuntimeCache(cache);
}

async function freshCachedResponse(request) {
    const shell = await caches.open(APP_SHELL_CACHE);
    const shellHit = await shell.match(request, { ignoreSearch: true });
    if (shellHit) return shellHit;
    const cache = await caches.open(RUNTIME_CACHE);
    const response = await cache.match(request);
    if (!response) return null;
    const cachedAt = Number(response.headers.get('x-almanion-cached-at'));
    if (cachedAt && Date.now() - cachedAt > RUNTIME_MAX_AGE_MS) {
        await cache.delete(request);
        return null;
    }
    return response;
}

async function pruneRuntimeCache(existingCache) {
    const cache = existingCache || await caches.open(RUNTIME_CACHE);
    const keys = await cache.keys();
    const expired = [];
    for (const key of keys) {
        const response = await cache.match(key);
        const cachedAt = response && Number(response.headers.get('x-almanion-cached-at'));
        if (cachedAt && Date.now() - cachedAt > RUNTIME_MAX_AGE_MS) expired.push(key);
    }
    await Promise.all(expired.map(function (key) { return cache.delete(key); }));
    const remaining = await cache.keys();
    const overflow = remaining.length - RUNTIME_MAX_ENTRIES;
    if (overflow > 0) {
        await Promise.all(remaining.slice(0, overflow).map(function (key) { return cache.delete(key); }));
    }
}
