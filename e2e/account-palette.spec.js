const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

test('graphite gives the wordmark and remarks neutral ink and keeps signed-in actions readable', async ({ page }) => {
    await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
    await page.route('**/note-runtime.js*', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    // Supply only the auth state and empty database responses. The dialog HTML comes from account.js.
    await page.addInitScript(() => {
        window.firebaseConfig = {};
        const auth = () => ({
            useDeviceLanguage() {}, setPersistence: () => Promise.resolve(),
            onAuthStateChanged(callback) { setTimeout(() => callback({ uid: 'palette-test', email: 'reader@example.invalid' }), 0); }
        });
        auth.Auth = { Persistence: { LOCAL: 'local' } };
        const database = () => ({ ref: key => ({
            set: () => Promise.resolve(), update: () => Promise.resolve(),
            once: () => Promise.resolve({ val: () => key.endsWith('/contentEditor') || null }),
            on() {}, off() {}
        }) });
        database.ServerValue = { TIMESTAMP: 0 };
        window.firebase = { apps: [{}], auth, database };
    });
    await page.goto('/physics-10.html');
    await page.addScriptTag({ url: '/settings.js' });
    await page.waitForFunction(() => window.AlmanionSettings?.ready && window.experimentalReader?.isActive());
    await page.evaluate(() => experimentalReader.goToId(document.querySelector('.remark-box').closest('.topic').id, { animate: false }));
    await page.addScriptTag({ url: '/account.js' });
    await page.waitForFunction(() => window.AlmanionAccount?.getUser()?.uid === 'palette-test');
    await page.evaluate(() => window.AlmanionAccount.openAccount());
    const accountMenu = page.locator('#accountOverlay');
    const actions = accountMenu.locator('.auth-submit');
    await expect(accountMenu.getByRole('link', { name: 'Уведомления', exact: true })).toBeVisible();
    await expect(actions).toHaveCount(5);
    for (const expTheme of ['light', 'dark']) {
        await page.evaluate(expTheme => AlmanionSettings.update({ expTheme, expMode: 'graphite', animationLevel: 'off' }), expTheme);
        await expect(page.locator('.almanion-wordmark').first()).toHaveCSS('filter', 'grayscale(1)');
        const remark = page.locator('.remark-box:visible').first();
        await expect(remark).toBeVisible();
        await expect.poll(() => remark.evaluate(el => getComputedStyle(el, '::before').color)).toBe(
            expTheme === 'light' ? 'rgb(98, 98, 108)' : 'rgb(161, 161, 170)');
        const minimumContrast = () => actions.evaluateAll(buttons => {
            if (buttons.length !== 5) return 0;
            const luminance = rgb => rgb.match(/[\d.]+/g).map(Number).slice(0, 3)
                .map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
                .reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
            return Math.min(...buttons.map(button => {
                const s = getComputedStyle(button);
                const light = luminance(s.color), background = luminance(s.backgroundColor);
                return (Math.max(light, background) + .05) / (Math.min(light, background) + .05);
            }));
        });
        await expect.poll(minimumContrast).toBeGreaterThanOrEqual(4.5);
    }
});
