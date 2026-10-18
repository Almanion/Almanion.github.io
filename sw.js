/* The build writes sw-manifest.js with a content-derived version and a small shell. */
let manifestImported = false;
try { importScripts('/sw-manifest.js'); manifestImported = true; } catch (_) {}

const MANIFEST_READY = manifestImported && validManifest(self.__ALMANION_SW_MANIFEST);
// A failed manifest download must never replace a complete installed shell
// with a smaller development fallback. Installation rejects before any writes.
const GENERATED_MANIFEST = MANIFEST_READY ? self.__ALMANION_SW_MANIFEST : { version: 'unavailable', shell: [] };
const CACHE_VERSION = 'almanion-pwa-' + GENERATED_MANIFEST.version;
const APP_SHELL_CACHE = CACHE_VERSION + '-shell';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';
const NETWORK_TIMEOUT_MS = 5000;
const RUNTIME_MAX_ENTRIES = 80;
const RUNTIME_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const APP_SHELL = GENERATED_MANIFEST.shell;
// Icons are optional; the pages, scripts and styles must form a usable shell.
const REQUIRED_SHELL = APP_SHELL.filter(url => !/\.(?:svg|png|ico)(?:[?#]|$)/i.test(url));
const OFFLINE_INDEX = 'almanion-offline-index-v1';
const OFFLINE_PREFIX = 'almanion-offline-pack-';
let offlinePacks = null;

const CACHEABLE_CROSS_ORIGINS = new Set([
    'https://cdn.jsdelivr.net',
    'https://www.gstatic.com'
]);

self.addEventListener('install', function (event) {
    event.waitUntil(precacheAppShell());
});

self.addEventListener('activate', function (event) {
    event.waitUntil((async function () {
        if (!MANIFEST_READY || !await shellReady(await caches.open(APP_SHELL_CACHE))) {
            throw new Error('Offline shell is incomplete; keeping the previous caches');
        }
        const keep = new Set([APP_SHELL_CACHE, RUNTIME_CACHE]);
        const keys = await caches.keys();
        await Promise.all(keys.map(function (key) { return !key.startsWith('almanion-pwa-') || keep.has(key) || key === OFFLINE_INDEX || key.startsWith(OFFLINE_PREFIX) || key.startsWith('almanion-watch-') ? null : caches.delete(key); }));
        await pruneRuntimeCache();
        await self.clients.claim();
    })());
});

self.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
    if (event.data?.type === 'OFFLINE_LIBRARY_PING') event.ports[0]?.postMessage({ offlineLibrary: 1 });
    if (event.data?.type === 'OFFLINE_LIBRARY_CHANGED') offlinePacks = null;
});

self.addEventListener('fetch', function (event) {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    // Verification/downloads must never be satisfied by an older cached copy.
    if (url.searchParams.has('publication') || url.searchParams.has('offline-download')) return;

    if (url.origin !== self.location.origin) {
        if (CACHEABLE_CROSS_ORIGINS.has(url.origin)) event.respondWith(staleWhileRevalidate(request, event));
        return;
    }
    if (request.mode === 'navigate' || url.pathname.endsWith('.html')) {
        event.respondWith(networkFirst(request, '/offline.html'));
        return;
    }
    if (isStaticAsset(request, url)) {
        event.respondWith(staleWhileRevalidate(request, event));
        return;
    }
    event.respondWith(networkFirst(request));
});

async function precacheAppShell() {
    if (!MANIFEST_READY) throw new Error('Generated offline manifest is unavailable or invalid');
    const existed = await caches.has(APP_SHELL_CACHE);
    // A code-only worker update can share the same immutable content version.
    // Reuse a complete shell without overwriting a working offline copy.
    if (existed && await shellReady(await caches.open(APP_SHELL_CACHE))) return;
    const stagingName = APP_SHELL_CACHE + '-staging';
    await caches.delete(stagingName);
    const staged = await caches.open(stagingName);
    try {
        const failed = [];
        await Promise.all(APP_SHELL.map(async function (url) {
            try {
                const request = new Request(url, { cache: 'reload' });
                const response = await fetchPrecacheResponse(request, NETWORK_TIMEOUT_MS);
                if (!await cacheableResponse(request, response)
                    || (REQUIRED_SHELL.includes(url) && !response.ok)) throw new Error('Invalid shell response');
                await staged.put(url, response);
            } catch (_) {
                if (REQUIRED_SHELL.includes(url)) failed.push(url);
            }
        }));
        if (failed.length || !await shellReady(staged)) throw new Error('Required offline resources unavailable');
        const cache = await caches.open(APP_SHELL_CACHE);
        for (const request of await staged.keys()) {
            await cache.put(request, await staged.match(request));
        }
        if (!await shellReady(cache)) throw new Error('Offline shell could not be saved');
    } catch (error) {
        if (!existed) await caches.delete(APP_SHELL_CACHE);
        throw error;
    } finally {
        await caches.delete(stagingName);
    }
}

function validManifest(manifest) {
    if (!manifest || typeof manifest.version !== 'string' || !/^[a-z\d._-]+$/i.test(manifest.version)
        || !Array.isArray(manifest.shell) || !manifest.shell.length) return false;
    try {
        return manifest.shell.every(url => typeof url === 'string' && url.startsWith('/')
            && new URL(url, self.location.origin).origin === self.location.origin);
    } catch (_) { return false; }
}

async function fetchPrecacheResponse(request, timeoutMs) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer;
    const deadline = new Promise(function (_, reject) {
        timer = setTimeout(function () {
            if (controller) controller.abort();
            reject(new Error('Offline resource download timed out'));
        }, timeoutMs);
    });
    try {
        const download = Promise.resolve().then(function () {
            return fetch(request, controller ? { signal: controller.signal } : undefined);
        }).then(async function (response) {
            // Keep the original Response metadata, but finish its body while
            // the timeout is still armed. Headers alone do not make it safe
            // to promote a resource into the offline shell.
            if (response.ok) await response.clone().arrayBuffer();
            return response;
        });
        return await Promise.race([download, deadline]);
    } finally {
        clearTimeout(timer);
    }
}

async function shellReady(cache) {
    for (const url of REQUIRED_SHELL) {
        const response = await cache.match(url);
        if (!response || !response.ok) return false;
    }
    return REQUIRED_SHELL.length > 0;
}

function isStaticAsset(request, url) {
    if (['style', 'script', 'worker', 'font', 'image'].includes(request.destination)) return true;
    return /\.(?:css|js|mjs|svg|png|jpg|jpeg|webp|gif|ico|woff2?|ttf|otf|json)$/i.test(url.pathname);
}

async function networkFirst(request, fallbackUrl) {
    try {
        const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
        if (response.status >= 500) return await offlineResponse(request, fallbackUrl) || response;
        if (await cacheableResponse(request, response)) await storeRuntimeResponse(request, response.clone());
        return response;
    } catch (_) {
        const cached = await offlineResponse(request, fallbackUrl);
        if (cached) return cached;
        return new Response('Offline', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

async function offlineResponse(request, fallbackUrl) {
    return await pinnedResponse(request) || await freshCachedResponse(request)
        || (fallbackUrl ? await caches.match(fallbackUrl) : null);
}

async function staleWhileRevalidate(request, event) {
    const cached = await freshCachedResponse(request);
    const fetched = fetch(request).then(async function (response) {
        if (await cacheableResponse(request, response)) await storeRuntimeResponse(request, response.clone());
        return response;
    }).catch(function () { return null; });
    // Finish refreshes after returning a cached response. Offline packs are
    // fallbacks, not overrides of newer online resources.
    if (event) event.waitUntil(fetched);
    if (cached) return cached;
    const response = await fetched;
    if (response && response.status < 500) return response;
    return await pinnedResponse(request) || response || new Response('', { status: 504, statusText: 'Offline' });
}

async function pinnedResponse(request) {
    if (!offlinePacks) {
        const index = await caches.open(OFFLINE_INDEX);
        offlinePacks = [];
        for (const key of await index.keys()) {
            if (!new URL(key.url).pathname.startsWith('/__offline/')) continue;
            try {
                const record = await (await index.match(key)).json();
                if (record.cacheName?.startsWith(OFFLINE_PREFIX)) offlinePacks.push(record);
            } catch (_) {}
        }
        offlinePacks.sort((a, b) => b.downloadedAt - a.downloadedAt);
    }
    const url = new URL(request.url); url.search = ''; url.hash = '';
    for (const record of offlinePacks) {
        if (!await caches.has(record.cacheName)) continue;
        const cache = await caches.open(record.cacheName);
        const response = await cache.match(url.href);
        if (response) return response;
    }
    return null;
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
    // A new ?v= must never resolve to the old unversioned precache entry.
    const shellHit = await shell.match(request);
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
