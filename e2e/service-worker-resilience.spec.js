'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const worker = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

async function fixture() {
    const state = { version: 'one', failScript: false, failPage: false, failManifest: false, stallScriptBody: false };
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost');
        response.setHeader('Cache-Control', 'no-store');
        if (url.pathname === '/sw.js') {
            response.setHeader('Content-Type', 'text/javascript');
            response.end(worker + '\n// fixture ' + state.version);
        } else if (url.pathname === '/sw-manifest.js') {
            response.setHeader('Content-Type', 'text/javascript');
            if (state.failManifest) {
                response.statusCode = 503;
                response.end('Manifest unavailable');
                return;
            }
            response.end('self.__ALMANION_SW_MANIFEST = ' + JSON.stringify({
                version: state.version, shell: ['/', '/index.html', '/offline.html', '/app.js', '/styles.css']
            }) + ';');
        } else if (url.pathname === '/app.js') {
            response.setHeader('Content-Type', 'text/javascript');
            if (state.stallScriptBody) {
                response.write('/* The headers and part of the body arrived, but the stream stalled. */');
                return;
            }
            response.statusCode = state.failScript ? 503 : 200;
            response.end(state.failScript ? 'Unavailable' : 'document.documentElement.dataset.boot = "ready";');
        } else if (url.pathname === '/styles.css') {
            response.setHeader('Content-Type', 'text/css');
            response.end('body { color: rgb(20, 40, 60); }');
        } else if (url.pathname === '/manifest.json') {
            // A valid web manifest makes the old four-resource development
            // fallback installable; this regression must reject that downgrade.
            response.setHeader('Content-Type', 'application/json');
            response.end('{}');
        } else if (['/', '/index.html', '/offline.html'].includes(url.pathname)) {
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.statusCode = state.failPage && url.pathname !== '/offline.html' ? 503 : 200;
            response.end(response.statusCode === 503 ? '<h1>Server unavailable</h1>'
                : '<!doctype html><title>Saved ' + state.version + '</title><link rel="stylesheet" href="/styles.css"><h1>Saved ' + state.version + '</h1><script src="/app.js"></script>');
        } else {
            response.statusCode = 404;
            response.end('Not found');
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return {
        state,
        origin: 'http://127.0.0.1:' + server.address().port,
        close: () => new Promise(resolve => server.close(resolve))
    };
}

async function register(page, origin) {
    await page.goto(origin + '/index.html');
    await page.evaluate(async () => {
        await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
        await navigator.serviceWorker.ready;
    });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

async function update(page) {
    await page.evaluate(async () => {
        window.__workerState = 'requested';
        const registration = await navigator.serviceWorker.getRegistration();
        registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            window.__workerState = installing.state;
            installing.addEventListener('statechange', () => { window.__workerState = installing.state; });
        }, { once: true });
        await registration.update();
    });
}

test('a failed shell update preserves offline reading, then a successful retry activates safely', async ({ browser }) => {
    const site = await fixture();
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();
    try {
        await register(page, site.origin);
        await page.evaluate(async () => {
            for (const name of ['almanion-offline-pack-saved', 'almanion-watch-reading', 'another-app-cache']) {
                await (await caches.open(name)).put('/preserved', new Response('keep me'));
            }
        });
        site.state.version = 'two';
        site.state.failScript = true;
        await update(page);
        await expect.poll(() => page.evaluate(() => window.__workerState)).toBe('redundant');
        const failedKeys = await page.evaluate(() => caches.keys());
        expect(failedKeys).toContain('almanion-pwa-one-shell');
        expect(failedKeys).not.toContain('almanion-pwa-two-shell');
        expect(failedKeys.some(name => name.endsWith('-staging'))).toBe(false);

        await context.setOffline(true);
        await page.reload();
        await expect(page.getByRole('heading')).toHaveText('Saved one');
        await expect(page.locator('html')).toHaveAttribute('data-boot', 'ready');
        await expect(page.locator('body')).toHaveCSS('color', 'rgb(20, 40, 60)');

        await context.setOffline(false);
        site.state.failScript = false;
        await update(page);
        await expect.poll(() => page.evaluate(() => window.__workerState)).toBe('installed');
        await page.evaluate(async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        });
        await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes('almanion-pwa-one-shell'))).toBe(false);
        const successfulKeys = await page.evaluate(() => caches.keys());
        expect(successfulKeys).toContain('almanion-pwa-two-shell');
        for (const name of ['almanion-offline-pack-saved', 'almanion-watch-reading', 'another-app-cache']) expect(successfulKeys).toContain(name);
        await context.setOffline(true);
        await page.reload();
        await expect(page.getByRole('heading')).toHaveText('Saved two');
        await expect(page.locator('html')).toHaveAttribute('data-boot', 'ready');
    } finally {
        await context.close();
        await site.close();
    }
});

test('a transient HTTP 503 serves the saved page and recovers when the server returns', async ({ browser }) => {
    const site = await fixture();
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();
    try {
        await register(page, site.origin);
        site.state.failPage = true;
        const fallback = await page.reload();
        expect(fallback.status()).toBe(200);
        await expect(page.getByRole('heading')).toHaveText('Saved one');
        site.state.failPage = false;
        const recovered = await page.reload();
        expect(recovered.status()).toBe(200);
        await expect(page.getByRole('heading')).toHaveText('Saved one');
    } finally {
        await context.close();
        await site.close();
    }
});

for (const failure of ['manifest', 'body']) {
    test(`an update with a failed ${failure} download keeps the complete offline shell`, async ({ browser }) => {
        const site = await fixture();
        const context = await browser.newContext({ serviceWorkers: 'allow' });
        const page = await context.newPage();
        try {
            await register(page, site.origin);
            site.state.version = 'two';
            site.state.failManifest = failure === 'manifest';
            site.state.stallScriptBody = failure === 'body';
            await update(page);
            await expect.poll(() => page.evaluate(() => window.__workerState), { timeout: 12000 }).toBe('redundant');
            const keys = await page.evaluate(() => caches.keys());
            expect(keys).toContain('almanion-pwa-one-shell');
            expect(keys).not.toContain('almanion-pwa-two-shell');
            expect(keys.some(name => name.endsWith('-staging') || name.includes('unavailable'))).toBe(false);
            await context.setOffline(true);
            await page.reload();
            await expect(page.getByRole('heading')).toHaveText('Saved one');
            await expect(page.locator('html')).toHaveAttribute('data-boot', 'ready');
            await expect(page.locator('body')).toHaveCSS('color', 'rgb(20, 40, 60)');
        } finally {
            await context.close();
            await site.close();
        }
    });
}
