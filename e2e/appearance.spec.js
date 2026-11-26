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
    window.setTestAvatar = appearance => {
        for (const listener of identityListeners) listener({ val: () => appearance });
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

test('avatar surfaces animate only with full site motion and respect reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
        ? route.continue() : route.abort());
    await page.addInitScript(mockAvatarAccount, 'dark');
    await page.goto('/');
    await page.waitForFunction(() => window.AlmanionSettings?.ready);
    const avatar = page.locator('#accountBtn .profile-mark');
    await expect(avatar).toBeVisible();
    await expect(page.locator('link[data-profile-motion]')).toHaveCount(0);
    await page.evaluate(() => {
        window.AlmanionSettings.update({ animationLevel: 'max' });
        window.setTestAvatar({ avatar: 'zed', background: 'scan' });
    });
    await expect(avatar).toHaveAttribute('data-profile-background', 'scan');
    const animation = () => avatar.evaluate(mark => getComputedStyle(mark, '::before').animationName);
    await expect.poll(animation).toBe('avatar-scan');
    await page.evaluate(() => window.AlmanionSettings.update({ animationLevel: 'medium' }));
    await expect.poll(animation).toBe('none');
    await page.evaluate(() => window.AlmanionSettings.update({ animationLevel: 'max' }));
    await expect.poll(animation).toBe('avatar-scan');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(animation).toBe('none');
});

for (const width of [390, 1440]) {
    test('signed-in avatars stay rounded squares across headers at ' + width + 'px', async ({ page }) => {
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
            await expect(mark).toHaveCSS('border-radius', '25%');
            await expect(button).toBeInViewport();

            for (const shape of ['circle', 'tile', 'pebble', 'shield']) {
                await page.evaluate(shape => window.setTestAvatarShape(shape), shape);
                await expect(mark).toHaveCSS('border-radius', '25%');
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
            await expect(page.locator('#accIdentityMark .profile-mark')).toHaveCSS('border-radius', '25%');
            await page.evaluate(() => window.setTestAvatar({ avatar: 'fox', color: 'terracotta', shape: 'shield', background: 'dust' }));
            for (const avatar of [mark, page.locator('#accIdentityMark .profile-mark')]) {
                await expect(avatar).toHaveCSS('border-radius', '25%');
                await expect(avatar).toHaveAttribute('data-profile-color', 'terracotta');
                await expect(avatar).toHaveAttribute('data-profile-background', 'dust');
                await expect(avatar.locator('svg')).toBeVisible();
            }
            await page.evaluate(() => {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 16;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#893a59';
                ctx.fillRect(0, 0, 16, 16);
                window.setTestAvatar({ shape: 'shield', avatarImage: canvas.toDataURL('image/jpeg').split(',')[1] });
            });
            for (const avatar of [mark, page.locator('#accIdentityMark .profile-mark')]) {
                const photo = avatar.locator('.profile-photo');
                await expect(photo).toBeVisible();
                await expect.poll(() => photo.evaluate(image => image.naturalWidth)).toBe(16);
                await expect(photo).toHaveCSS('border-radius', '25%');
            }
            await page.evaluate(() => window.setTestAvatar({ avatarImage: 'https://example.invalid/other-photo', avatar: 'compass' }));
            await expect(mark.locator('.profile-photo')).toHaveCount(0);
            await expect(mark.locator('svg')).toBeVisible();
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
