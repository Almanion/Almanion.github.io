const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    // Exercise the real account UI without reaching Firebase or writing user data.
    await page.addInitScript(() => {
        const snapshot = { val: () => null, exists: () => false, forEach() {} };
        const ref = () => ({
            on() {}, off() {}, child: ref, once: async () => snapshot,
            set: async () => {}, update: async () => {}, remove: async () => {},
            transaction: async () => ({ snapshot, committed: false }),
            push: ref, onDisconnect: () => ({ remove: async () => {}, cancel: async () => {} })
        });
        const auth = {
            currentUser: null, useDeviceLanguage() {}, setPersistence: async () => {},
            onAuthStateChanged: callback => { setTimeout(() => callback(null), 0); return () => {}; },
            signInAnonymously: async () => { throw new Error('Offline test'); }
        };
        const authFactory = () => auth;
        authFactory.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } };
        const database = () => ({ ref });
        database.ServerValue = { TIMESTAMP: 0 };
        const app = { options: {}, auth: authFactory, database };
        window.firebase = { apps: [app], app: () => app, initializeApp: () => app, auth: authFactory, database };
    });
});

for (const width of [320, 390, 768, 820, 1024, 1440]) {
    test(`home hierarchy, themes and keyboard navigation at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 900 });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('/');
        await page.waitForFunction(() => window.AlmanionHomeDashboard && window.AlmanionSettings?.ready);
        await expect(page.locator('#homeControls #accountBtn')).toBeVisible();
        await expect(page.locator('#homeControls #settingsButton')).toBeVisible();
        await expect(page.locator('#homePrivilegedActions')).toBeHidden();
        for (const settings of [
            { experimental: true, expMode: 'prism', expTheme: 'light' },
            { experimental: true, expMode: 'prism', expTheme: 'dark' },
            { experimental: true, expMode: 'graphite', expTheme: 'dark' },
            { experimental: false, theme: 'sepia' }
        ]) {
            await page.evaluate(settings => window.AlmanionSettings.update(settings), settings);
            await page.locator('#gradeTab10').click();
            await page.waitForTimeout(250);
            const geometry = await page.evaluate(() => {
                const r = selector => {
                    const box = document.querySelector(selector).getBoundingClientRect();
                    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
                };
                const cards = [...document.querySelectorAll('.subject-card:not([hidden])')]
                    .filter(el => el.getClientRects().length);
                return {
                    overflow: document.documentElement.scrollWidth - innerWidth,
                    title: r('.home-header h1'), controls: r('#homeControls'),
                    account: r('#accountBtn'), settings: r('#settingsButton'),
                    tabs: [...document.querySelectorAll('.grade-tab')].map(el => el.getBoundingClientRect().top),
                    cards: cards.map(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right })),
                    labels: cards.map(el => el.querySelector('h2')).map(el => el.scrollWidth - el.clientWidth)
                };
            });
            expect(geometry.overflow).toBeLessThan(2);
            expect(geometry.title.right).toBeLessThanOrEqual(geometry.controls.left);
            expect(geometry.account.right).toBeLessThan(geometry.settings.left);
            expect(Math.max(...geometry.tabs) - Math.min(...geometry.tabs)).toBeLessThan(1);
            for (const card of geometry.cards) {
                expect(card.left).toBeGreaterThanOrEqual(0);
                expect(card.right).toBeLessThanOrEqual(width);
            }
            for (const overflow of geometry.labels) expect(overflow).toBeLessThan(2);
            await expect(page.locator('.home-additional-section')).toBeVisible();
            await page.screenshot({ path: info.outputPath(`home-${settings.experimental ? settings.expMode + '-' + settings.expTheme : 'sepia'}.png`), fullPage: true });
        }
        await page.locator('#gradeTab10').focus();
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('#gradeTab11')).toBeFocused();
        await expect(page.locator('#gradePanel11')).toBeVisible();
        await expect(page.locator('#homeDutyCard')).toBeVisible();
        await page.keyboard.press('End');
        await expect(page.locator('#gradePanelArchive')).toBeVisible();
        await expect(page.locator('#homeTourCard')).toBeVisible();
        await expect(page.locator('.home-additional-section a[href="matcenter.html"]')).toBeVisible();
        await page.reload();
        await expect(page.locator('#gradeTabArchive')).toHaveAttribute('aria-selected', 'true');
        await page.locator('#accountBtn').click();
        await expect(page.locator('#accountOverlay')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('#accountOverlay')).toBeHidden();
        await page.locator('#settingsButton').click();
        await expect(page.locator('#settingsDoneBtn')).toBeInViewport();
        await page.locator('#settingsDoneBtn').click();
        expect(errors).toEqual([]);
    });
}

test('five personalized shortcuts can be edited, saved and restored without hiding services', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/');
    await page.waitForFunction(() => window.AlmanionHomeDashboard && window.AlmanionSettings?.ready);
    const signIn = () => page.evaluate(() => {
        window.AlmanionAccount = { getUser: () => ({ uid: 'home-fixture' }), hasEnglishAccess: async () => true };
        dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user: { uid: 'home-fixture' } } }));
    });
    await signIn();
    await expect(page.locator('#homeAdditionalEnglish')).toBeVisible();
    await page.locator('#homeQuickCustomize').click();
    await expect(page.locator('#homeQuickDialog')).toBeVisible();
    await expect(page.locator('#homeQuickSave')).toBeInViewport();
    while (await page.locator('#homeQuickDialog .home-quick-option.is-selected').count()) {
        await page.locator('#homeQuickDialog .home-quick-option.is-selected').first().click();
    }
    for (const id of ['physics-10', 'russian-ege', 'duty-10-1', 'likbez', 'matcenter']) {
        await page.locator(`#homeQuickOptions [data-quick-id="${id}"]`).click();
    }
    await expect(page.locator('#homeQuickCount')).toContainText('5 из 5');
    await page.locator('#homeQuickSave').click();
    await expect(page.locator('#homeQuickGrid a')).toHaveCount(5);
    await page.reload();
    await page.waitForFunction(() => window.AlmanionHomeDashboard && window.AlmanionSettings?.ready);
    await signIn();
    await expect(page.locator('#homeQuickGrid a')).toHaveCount(5);
    await expect(page.locator('.home-additional-section a[href="matcenter.html"]')).toBeVisible();
    await expect(page.locator('.home-additional-section a[href="likbez.html"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThan(2);
});
