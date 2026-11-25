'use strict';
const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

function mockAvatarAccount(expTheme) {
    localStorage.setItem('siteSettings', JSON.stringify({ expTheme }));
    const user = { uid: 'avatar-test', email: 'avatar@example.invalid', displayName: 'Профиль' };
    const identityListeners = new Set();
    const identitySnapshot = shape => ({ val: () => ({ shape, color: 'iris', avatar: 'compass' }) });
    window.setTestAvatarShape = shape => {
        for (const listener of identityListeners) listener(identitySnapshot(shape));
    };
    const auth = () => ({
        currentUser: user,
        useDeviceLanguage() {},
        setPersistence: async () => {},
        onAuthStateChanged(callback) { setTimeout(() => callback(user), 0); }
    });
    auth.Auth = { Persistence: { LOCAL: 'local' } };
    const database = () => ({
        ref(key) {
            const isIdentity = key === 'accountProfiles/' + user.uid + '/identity';
            const snapshot = { val: () => null, exists: () => false };
            return {
                once: async () => snapshot,
                set: async () => {},
                update: async () => {},
                on(_event, callback) {
                    if (isIdentity) {
                        identityListeners.add(callback);
                        setTimeout(() => callback(identitySnapshot('circle')), 0);
                    } else setTimeout(() => callback(snapshot), 0);
                },
                off(_event, callback) { identityListeners.delete(callback); }
            };
        }
    });
    database.ServerValue = { TIMESTAMP: 0 };
    window.firebase = { apps: [{}], initializeApp() {}, auth, database };
}

for (const width of [390, 1440]) {
    test('signed-in avatars keep their chosen shape across headers at ' + width + 'px', async ({ page }) => {
        await page.setViewportSize({ width, height: 840 });
        await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
            ? route.continue() : route.abort());
        await page.addInitScript(mockAvatarAccount, width < 768 ? 'dark' : 'light');

        for (const path of ['/', '/physics-10.html', '/duty-10-1.html']) {
            await page.goto(path);
            if (path === '/physics-10.html' && width < 768) {
                await page.evaluate(() => window.openMobileMenu());
            }
            const button = page.locator('#accountBtn.signed-in');
            const mark = button.locator('.profile-mark');
            await expect(mark).toHaveAttribute('data-profile-shape', 'circle');
            await expect(button).toBeInViewport();

            for (const [shape, radius] of [['circle', '50%'], ['tile', '25%'], ['pebble', '45% 60% 38% 56%']]) {
                await page.evaluate(shape => window.setTestAvatarShape(shape), shape);
                await expect(mark).toHaveAttribute('data-profile-shape', shape);
                await expect(mark).toHaveCSS('border-radius', radius);
                const { width, height } = await mark.boundingBox();
                expect(width).toBeGreaterThan(20);
                expect(Math.abs(width - height)).toBeLessThan(1);
            }

            await button.hover();
            await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
            await expect(button).toHaveCSS('box-shadow', 'none');
            await page.keyboard.press('Tab');
            await button.focus();
            await expect(mark).toHaveCSS('outline-style', 'solid');
            await expect(mark).toHaveCSS('outline-width', '2px');
            await page.keyboard.press('Enter');
            await expect(page.locator('#accIdentityMark .profile-mark')).toHaveCSS('border-radius', '45% 60% 38% 56%');
        }
    });

    test('wordmark and tab icons follow the palette at ' + width + 'px', async ({ page }) => {
        await page.setViewportSize({ width, height: 840 });
        await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
            ? route.continue() : route.abort());
        await page.goto('/');
        await page.waitForFunction(() => window.AlmanionSettings?.ready);
        const logo = page.locator('.home-header .almanion-wordmark');
        await expect(logo).toBeVisible();
        await logo.evaluate(img => img.decode());
        const icon = page.locator('link[rel~="icon"][type="image/svg+xml"]').first();
        for (const [expMode, expTheme, filename] of [
            ['prism', 'light', 'favicon.svg'], ['graphite', 'light', 'favicon-graphite.svg'],
            ['graphite', 'dark', 'favicon-graphite-dark.svg'], ['prism', 'dark', 'favicon-dark.svg']
        ]) {
            await page.evaluate(prefs => AlmanionSettings.update(prefs), { expMode, expTheme });
            await expect(logo).toHaveCSS('color-scheme', expTheme);
            await expect(logo).toHaveCSS('filter', expMode === 'graphite' ? 'grayscale(1)' : 'none');
            await expect.poll(() => icon.evaluate(el => new URL(el.href).pathname)).toBe('/favicons/' + filename);
            await icon.evaluate(async el => { const img = new Image(); img.src = el.href; await img.decode(); });
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThan(2);
        await page.goto('/physics-10.html');
        await page.getByAltText('Almanion', { exact: true }).first().evaluate(img => img.decode());
        await expect.poll(() => icon.evaluate(el => new URL(el.href).pathname)).toBe('/favicons/favicon-ph-dark.svg');
    });
}
