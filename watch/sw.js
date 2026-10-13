'use strict';
const SHELL = 'almanion-watch-shell-__WATCH_VERSION__', READINGS = 'almanion-watch-readings';
const assets = ['./', './watch.css?v=20261013-1', './watch.js?v=20261013-1', './catalogue.json', '../safe-html.js'];
self.addEventListener('install', event => event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(assets)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('almanion-watch-shell-') && key !== SHELL).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
    const request = event.request, url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin || !/^\/(?:watch\/|vendor\/katex\/|images\/|content\/|safe-html\.js)/.test(url.pathname)) return;
    event.respondWith((async () => {
        const shell = await caches.open(SHELL), reading = await caches.open(READINGS);
        if (url.pathname.startsWith('/watch/data/')) { const saved = await reading.match(request); if (saved) return saved; }
        try {
            const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 4500);
            let response; try { response = await fetch(request, { signal:controller.signal }); } finally { clearTimeout(timer); }
            if (!response.ok) throw new Error('HTTP ' + response.status);
            if (Number(response.headers.get('content-length') || 0) < 1500000) {
                try {
                    await reading.put(request, response.clone());
                    const keys = await reading.keys(), metadata = key => /\/data\/[a-z][a-z0-9-]*-[a-f0-9]{16}\.json$/.test(new URL(key.url).pathname);
                    const expendable = keys.filter(key => !/catalogue\.json$/.test(new URL(key.url).pathname) && !metadata(key)).concat(keys.filter(metadata));
                    await Promise.all(expendable.slice(0, Math.max(0, keys.length - 80)).map(key => reading.delete(key)));
                } catch (_) { /* Storage may be full; a valid network response must still reach the reader. */ }
            }
            return response;
        } catch (_) {
            return await shell.match(request) || await reading.match(request) || (request.mode === 'navigate' && await shell.match('./')) || Response.error();
        }
    })());
});
