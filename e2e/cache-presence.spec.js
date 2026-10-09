'use strict';
const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { createServer } = require('../tools/serve-static');

test('new homepage styles bypass an installed legacy worker and work offline', async ({ browser }, info) => {
    const server = createServer(path.resolve(__dirname, '../_site'));
    const original = server.listeners('request')[0];
    const oldWorker = `
        self.addEventListener('install', e => e.waitUntil((async () => {
            const c = await caches.open('almanion-pwa-legacy-shell');
            await c.put('/styles/home-dashboard.css', new Response('body.home-page .home-content-grid{display:block!important}', {headers:{'Content-Type':'text/css'}}));
            await self.skipWaiting();
        })()));
        self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
        self.addEventListener('fetch', e => e.respondWith((async () => {
            const c = await caches.open('almanion-pwa-legacy-shell');
            return await c.match(e.request, {ignoreSearch:true}) || fetch(e.request);
        })()));`;
    let legacy = true;
    server.removeAllListeners('request');
    server.on('request', (request, response) => {
        if (legacy && request.url.startsWith('/sw.js')) {
            response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
            response.end(oldWorker);
        } else original(request, response);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
        await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin + '/offline.html');
        await page.evaluate(async () => {
            await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
        });
        await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
        // Reproduce the actual broken old ?v= behavior before testing the fix.
        expect(await page.evaluate(async () => (await fetch('/styles/home-dashboard.css?v=brand-new')).text())).toContain('display:block!important');
        await page.goto(origin + '/');
        await expect(page.locator('.home-content-grid')).toHaveCSS('display', 'grid');
        await page.waitForTimeout(900);
        const stylesheet = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => link.href).find(href => /home-dashboard\.[a-f\d]{16}\.css/.test(href)));
        expect(stylesheet).toBeTruthy();
        await page.screenshot({ path: info.outputPath('legacy-cache-desktop.png'), fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.locator('.home-content-grid')).toHaveCSS('display', 'flex');
        await page.waitForTimeout(500);
        await page.screenshot({ path: info.outputPath('legacy-cache-mobile.png'), fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
        legacy = false;
        await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
        await expect.poll(() => page.evaluate(async () => (await caches.keys()).some(key => key.includes('legacy'))), { timeout: 15000 }).toBe(false);
        // New versioned requests may not resolve to an unversioned shell entry.
        await page.evaluate(async () => {
            const key = (await caches.keys()).find(key => key.endsWith('-shell'));
            await (await caches.open(key)).put('/home-motion.js', new Response('stale-asset'));
        });
        expect(await page.evaluate(async () => (await fetch('/home-motion.js?v=uncached-new-version')).text())).not.toBe('stale-asset');
        await page.reload();
        await expect(page.locator('.home-content-grid')).toHaveCSS('display', 'flex');
        await context.setOffline(true);
        await page.reload();
        await expect(page.locator('.home-content-grid')).toHaveCSS('display', 'flex');
        await expect(page.locator('#homeQuickGrid')).toBeVisible();
        expect(errors).toEqual([]);
    } finally {
        await context.close();
        await new Promise(resolve => server.close(resolve));
    }
});

test('admin online counter expires stale records, deduplicates and recovers connection', async ({ page }) => {
    await page.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.addInitScript(() => {
        const owner = { uid: '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2', email: 'dmb23930@gmail.com' };
        const subscribers = new Map();
        const offset = 3600000;
        const now = Date.now() + offset;
        const values = {
            '.info/connected': true, '.info/serverTimeOffset': offset,
            presence: {
                one: { visitorId: 'one', timestamp: now, page: '/physics-10.html', userAgent: 'Desktop' },
                duplicate: { visitorId: 'one', timestamp: now - 5000, page: '/old' },
                expired: { visitorId: 'expired', timestamp: now - 150000 },
                two: { visitorId: 'two', timestamp: now - 85000, page: '/math.html', userAgent: 'Mobile' }
            }
        };
        const snapshot = value => ({ val: () => value ?? null, forEach() {}, exists: () => !!value });
        const ref = key => {
            const api = {
                on: (_event, callback, cancel) => { subscribers.set(key, { callback, cancel }); setTimeout(() => callback(snapshot(values[key])), 0); },
                off() {}, once: async () => snapshot(values[key]),
                orderByChild: () => api, push: () => ({ key: 'mock' }),
                set: async () => {}, update: async () => {}, remove: async () => {}
            };
            return api;
        };
        const auth = { currentUser: owner, onAuthStateChanged: fn => setTimeout(() => fn(owner), 0), signOut: async () => {} };
        const database = () => ({ ref }); database.ServerValue = { TIMESTAMP: 0 };
        window.firebase = { initializeApp() {}, auth: () => auth, database };
        window.__presenceTest = {
            emit: (key, value) => { values[key] = value; subscribers.get(key).callback(snapshot(value)); },
            deny: () => subscribers.get('presence').cancel(new Error('permission denied')),
            expire: () => { values.presence.one.timestamp -= 100000; values.presence.duplicate.timestamp -= 100000; }
        };
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install();
    await page.goto('/admin.html');
    await expect(page.locator('#onlineCount')).toHaveText('2');
    await expect(page.locator('#onlineTableBody tr')).toHaveCount(2);
    await expect(page.locator('#broadcastCount')).toHaveText('2');
    // Let the real refresh timer expire the second record, without a DB event.
    await page.clock.fastForward(10001);
    await expect(page.locator('#onlineCount')).toHaveText('1');
    await page.evaluate(() => window.__presenceTest.emit('.info/connected', false));
    await expect(page.locator('#onlineCount')).toHaveText('—');
    await expect(page.locator('#broadcastCount')).toHaveText('0');
    await expect(page.locator('#onlineTableBody')).toContainText('Ожидаем соединения');
    await page.evaluate(() => window.__presenceTest.emit('.info/connected', true));
    await expect(page.locator('#onlineCount')).toHaveText('1');
    await page.evaluate(() => window.__presenceTest.expire());
    await page.clock.fastForward(10001);
    await expect(page.locator('#onlineCount')).toHaveText('0');
    await expect(page.locator('#onlineTableBody')).toContainText('Никого нет онлайн');
    await page.evaluate(() => window.__presenceTest.deny());
    await expect(page.locator('#onlineCount')).toHaveText('—');
    expect(errors).toEqual([]);
});
