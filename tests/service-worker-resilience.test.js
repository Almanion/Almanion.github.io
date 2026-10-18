'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const origin = 'https://almanion.test';
const assets = ['/', '/index.html', '/offline.html', '/app.js', '/styles.css', '/icon.svg'];
const oldShell = 'almanion-pwa-old-shell';
const shell = 'almanion-pwa-new-shell';

function harness({ manifest = { version: 'new', shell: assets }, importFailure = false, abortController = AbortController } = {}) {
    const stores = new Map();
    const listeners = new Map();
    const key = value => new URL(typeof value === 'string' ? value : value.url, origin).href;
    let fetchImpl = async request => new Response('fresh:' + new URL(request.url).pathname);
    let putFailure = null;
    const caches = {
        async has(name) { return stores.has(name); },
        async keys() { return [...stores.keys()]; },
        async delete(name) { return stores.delete(name); },
        async open(name) {
            if (!stores.has(name)) stores.set(name, new Map());
            const entries = stores.get(name);
            return {
                async put(request, response) {
                    if (putFailure && putFailure(name, key(request))) throw new Error('Quota exceeded');
                    entries.set(key(request), response.clone());
                },
                async match(request) { return entries.get(key(request))?.clone(); },
                async delete(request) { return entries.delete(key(request)); },
                async keys() { return [...entries.keys()].map(url => new Request(url)); }
            };
        },
        async match(request) {
            for (const name of stores.keys()) {
                const response = await (await caches.open(name)).match(request);
                if (response) return response;
            }
        }
    };
    class WorkerRequest extends Request {
        constructor(input, options) { super(typeof input === 'string' ? new URL(input, origin) : input, options); }
    }
    const context = vm.createContext({
        Request: WorkerRequest, Response, Headers, URL, Set, Promise, AbortController: abortController, Date,
        setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 20)), clearTimeout,
        caches, fetch: (request, options) => fetchImpl(request, options),
        importScripts() { if (importFailure) throw new Error('Manifest unavailable'); },
        self: {
            __ALMANION_SW_MANIFEST: manifest,
            location: { origin }, clients: { claim: async () => {} },
            addEventListener: (event, callback) => listeners.set(event, callback)
        }
    });
    vm.runInContext(source, context);
    const run = expression => vm.runInContext(expression, context);
    return {
        caches, run, stores,
        fetch: fn => { fetchImpl = fn; },
        failPut: fn => { putFailure = fn; },
        async seed(name, url, text) { await (await caches.open(name)).put(url, new Response(text)); },
        async activate() {
            let promise;
            listeners.get('activate')({ waitUntil(value) { promise = value; } });
            await promise;
        }
    };
}

(async () => {
    for (const options of [
        { importFailure: true }, { manifest: null }, { manifest: {} },
        { manifest: { version: 'new', shell: [] } },
        { manifest: { version: 'new', shell: ['/index.html', 'https://another.test/app.js'] } },
        { manifest: { version: 'new', shell: ['/index.html', '//another.test/app.js'] } },
        { manifest: { version: 'new', shell: ['/index.html', null] } }
    ]) {
        const h = harness(options);
        await h.seed(oldShell, '/index.html', 'last working page');
        h.fetch(async request => new Response(new URL(request.url).pathname.endsWith('.json') ? '{}' : 'fresh resource'));
        await assert.rejects(h.run('precacheAppShell()'), /manifest.*unavailable or invalid/i);
        await assert.rejects(h.activate(), /incomplete/);
        assert.deepEqual(await h.caches.keys(), [oldShell],
            'missing or invalid generated manifests must not write a replacement cache or delete the working shell');
    }

    for (const failure of ['network', 'http', 'timeout', 'body-timeout', 'quota']) {
        const h = harness();
        await h.seed(oldShell, '/index.html', 'last working page');
        h.fetch(async (request, options) => {
            if (new URL(request.url).pathname !== '/app.js') return new Response('fresh');
            if (failure === 'network') throw new Error('Network lost');
            if (failure === 'http') return new Response('Unavailable', { status: 503 });
            if (failure === 'timeout') return new Promise((resolve, reject) => {
                options.signal.addEventListener('abort', () => reject(new Error('Timeout')), { once: true });
            });
            if (failure === 'body-timeout') return new Response(new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('headers arrived; body never completes'));
                    options.signal.addEventListener('abort', () => controller.error(new Error('Body timeout')), { once: true });
                }
            }));
            return new Response('fresh');
        });
        if (failure === 'quota') h.failPut(name => name === shell);
        await assert.rejects(h.run('precacheAppShell()'), undefined, failure + ' must reject the new worker installation');
        assert.equal(await h.caches.has(oldShell), true, failure + ' must preserve the last working cache');
        assert.equal(await (await (await h.caches.open(oldShell)).match('/index.html')).text(), 'last working page');
        assert.equal(await h.caches.has(shell), false, 'a partial new shell must not remain ready to activate');
        assert.equal(await h.caches.has(shell + '-staging'), false, 'temporary caches must be removed after failure');
    }

    const noAbort = harness({ abortController: null });
    noAbort.fetch(async request => new URL(request.url).pathname === '/app.js'
        ? new Promise(() => {}) : new Response('fresh'));
    await assert.rejects(noAbort.run('precacheAppShell()'),
        'the install deadline must still reject when AbortController is unavailable');
    assert.equal(await noAbort.caches.has(shell), false);
    assert.equal(await noAbort.caches.has(shell + '-staging'), false);

    const incomplete = harness();
    await incomplete.seed(oldShell, '/index.html', 'working');
    await incomplete.seed(shell, '/index.html', 'incomplete');
    await assert.rejects(incomplete.activate(), /incomplete/);
    assert.equal(await incomplete.caches.has(oldShell), true, 'activation must validate before removing older versions');

    const success = harness();
    for (const name of [oldShell, 'almanion-pwa-old-runtime', 'almanion-offline-index-v1', 'almanion-offline-pack-saved', 'almanion-watch-reading', 'another-app-cache']) {
        await success.seed(name, '/preserved', name);
    }
    success.fetch(async request => {
        if (request.url.endsWith('/icon.svg')) throw new Error('Optional icon unavailable');
        return new Response('new shell');
    });
    await success.run('precacheAppShell()');
    await success.activate();
    assert.equal(await success.caches.has(oldShell), false, 'successful activation may remove the obsolete shell');
    assert.equal(await success.caches.has('almanion-pwa-old-runtime'), false);
    for (const name of ['almanion-offline-index-v1', 'almanion-offline-pack-saved', 'almanion-watch-reading', 'another-app-cache']) {
        assert.equal(await success.caches.has(name), true, name + ' must survive a site update');
    }
    for (const url of assets.slice(0, -1)) assert.ok(await (await success.caches.open(shell)).match(url));
    success.fetch(async () => { throw new Error('A complete immutable shell needs no overwrite'); });
    await success.run('precacheAppShell()');
    assert.equal(await (await (await success.caches.open(shell)).match('/index.html')).text(), 'new shell');

    for (const status of [500, 502, 503, 504]) {
        const h = harness();
        await h.seed(shell, '/index.html', 'cached page');
        h.fetch(async () => new Response('server failure', { status }));
        const response = await h.run("networkFirst(new Request('/index.html'), '/offline.html')");
        assert.equal(response.status, 200);
        assert.equal(await response.text(), 'cached page', 'HTTP ' + status + ' should use a saved page');
    }

    const unavailable = harness();
    unavailable.fetch(async () => new Response('real server failure', { status: 503 }));
    assert.equal(await (await unavailable.run("networkFirst(new Request('/index.html'))")).text(), 'real server failure',
        'without a fallback preserve the actual server response');
    await unavailable.seed(shell, '/offline.html', 'offline screen');
    assert.equal(await (await unavailable.run("networkFirst(new Request('/missing.html'), '/offline.html')")).text(), 'offline screen');
    unavailable.fetch(async () => new Response('not found', { status: 404 }));
    await unavailable.seed(shell, '/missing.html', 'old missing page');
    assert.equal((await unavailable.run("networkFirst(new Request('/missing.html'), '/offline.html')")).status, 404,
        'a genuine 404 must not masquerade as a cached successful page');

    const pack = harness();
    await pack.seed('almanion-offline-index-v1', '/__offline/subject', JSON.stringify({ cacheName: 'almanion-offline-pack-subject', downloadedAt: 1 }));
    await pack.seed('almanion-offline-pack-subject', '/book.js', 'downloaded subject script');
    pack.fetch(async () => new Response('server failure', { status: 503 }));
    assert.equal(await (await pack.run("staleWhileRevalidate(new Request('/book.js'))")).text(), 'downloaded subject script',
        'server errors must not bypass an independently downloaded content pack');

    console.log('service worker: failed updates preserve working caches; safe activation and HTTP 5xx fallbacks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
