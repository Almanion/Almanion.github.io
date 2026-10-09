'use strict';
const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.clock.setFixedTime(new Date('2026-10-09T12:00:00+03:00'));
    await page.addInitScript(() => {
        const snapshot = { val: () => null, exists: () => false, forEach() {} };
        const ref = path => ({
            on(event, callback) { if (path === 'classDuty/grade10_1') window.__publishDuty = raw => callback({ val: () => raw }); },
            off() {}, child: ref, once: async () => snapshot,
            set: async () => {}, update: async () => {}, remove: async () => {},
            transaction: async () => ({ snapshot, committed: false }), push: ref,
            onDisconnect: () => ({ remove: async () => {}, cancel: async () => {} })
        });
        const auth = {
            currentUser: null, useDeviceLanguage() {}, setPersistence: async () => {},
            onAuthStateChanged: callback => { setTimeout(() => callback(null), 0); return () => {}; },
            signInAnonymously: async () => { throw new Error('Offline test'); }
        };
        const authFactory = () => auth;
        authFactory.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } };
        const database = () => ({ ref }); database.ServerValue = { TIMESTAMP: 0 };
        const app = { options: {}, auth: authFactory, database };
        window.firebase = { apps: [app], app: () => app, initializeApp: () => app, auth: authFactory, database };
    });
});

for (const width of [320, 390, 1440]) {
    test(`duty names and shortcut icons fit at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 900 });
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto('/');
        const names = page.locator('[data-duty-summary]');
        await expect(names).toHaveCount(2);
        for (const item of await names.all()) await expect(item).toHaveText('Луконин, Гринь');
        for (const icon of await page.locator('#homeQuickGrid .subject-icon').all()) await expect(icon).toBeVisible();
        await page.waitForFunction(() => window.__publishDuty);
        await page.evaluate(() => window.__publishDuty({ revision: 4, entries: {
            'week-2026-10-05': { start: '2026-10-05', end: '2026-10-10', people: ['Имя Кисмерешкин', 'Имя Белоцерковцев'] }
        } }));
        for (const item of await names.all()) await expect(item).toHaveText('Кисмерешкин, Белоцерковцев');
        await page.evaluate(() => window.AlmanionSettings.update({ experimental: true, expTheme: 'dark' }));
        await page.waitForTimeout(800);
        await page.screenshot({ path: info.outputPath('home-dark.png'), fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
        await page.reload();
        await expect(page.locator('#homeDutyCard [data-duty-summary]')).toHaveText('Кисмерешкин, Белоцерковцев');
        expect(errors).toEqual([]);
    });
}

test('settings hover rotates only the gear and honors reduced motion', async ({ page }) => {
    await page.goto('/');
    const button = page.locator('#settingsButton');
    await button.hover();
    await expect(button).toHaveCSS('transform', 'none');
    await expect(button.locator('svg')).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(button.locator('svg')).toHaveCSS('transform', 'none');
});

test('visible star canvas is bounded, non-blocking, pointer-responsive and stops with animations off', async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForFunction(() => window.AlmanionSettings?.ready);
    const canvas = page.locator('.home-starfield');
    await expect(canvas).toHaveAttribute('aria-hidden', 'true');
    await expect(canvas).toHaveCSS('pointer-events', 'none');
    expect(Number(await canvas.getAttribute('data-count'))).toBeGreaterThanOrEqual(140);
    expect(Number(await canvas.getAttribute('data-count'))).toBeLessThanOrEqual(180);
    await page.evaluate(() => {
        const field = document.querySelector('.home-starfield');
        window.__starFrame = field.getContext('2d').getImageData(0, 0, field.width, field.height).data.slice();
    });
    await page.mouse.move(400, 260);
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => {
        const field = document.querySelector('.home-starfield');
        const now = field.getContext('2d').getImageData(0, 0, field.width, field.height).data;
        return now.some((value, i) => value !== window.__starFrame[i]);
    })).toBe(true);
    await page.evaluate(() => window.AlmanionSettings.update({ animationLevel: 'off' }));
    await expect(canvas).toHaveAttribute('data-motion', 'off');
    const image = await canvas.evaluate(field => field.toDataURL());
    await page.mouse.move(500, 300);
    await page.waitForTimeout(200);
    expect(await canvas.evaluate(field => field.toDataURL())).toBe(image);
    await page.screenshot({ path: info.outputPath('stars-static.png'), fullPage: true });
});

for (const width of [390, 1440]) test(`stars are visible in both themes at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.waitForFunction(() => window.AlmanionSettings?.ready && window.AlmanionHomeStars);
    const canvas = page.locator('.home-starfield');
    for (const expTheme of ['light', 'dark']) {
        await page.evaluate(expTheme => window.AlmanionSettings.update({ experimental: true, expMode: 'prism', expTheme, animationLevel: 'off' }), expTheme);
        await page.waitForTimeout(800);
        await expect(canvas).toHaveCSS('opacity', '0.82');
        const pixels = await canvas.evaluate(field => {
            const data = field.getContext('2d').getImageData(0, 0, field.width, field.height).data;
            let visible = 0;
            for (let i = 3; i < data.length; i += 4) if (data[i] > 75) visible++;
            return visible;
        });
        expect(pixels).toBeGreaterThan(width < 500 ? 100 : 500);
        await page.screenshot({ path: info.outputPath(`stars-${expTheme}.png`), fullPage: true });
    }
});

test.describe('real mobile touch', () => {
test.use({ isMobile: true, hasTouch: true });
test('touch input leaves scrolling and navigation usable', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const canvas = page.locator('.home-starfield');
    await expect(canvas).toBeAttached();
    await page.touchscreen.tap(4, 150);
    expect(await page.evaluate(() => window.AlmanionHomeStars.getState().touchActive)).toBe(true);
    await page.waitForTimeout(1100);
    expect(await page.evaluate(() => window.AlmanionHomeStars.getState().touchActive)).toBe(false);
    await page.locator('#gradeTab9').tap();
    await expect(page.locator('#gradePanel9')).toBeVisible();
    await page.evaluate(() => scrollTo(0, 300));
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath('home-mobile-touch.png'), fullPage: true });
});
});
