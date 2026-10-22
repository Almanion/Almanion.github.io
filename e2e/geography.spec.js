'use strict';

const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

async function homeAccountFixture(page) {
    await page.goto('/');
    await page.waitForFunction(() => window.AlmanionHomeDashboard);
    await page.evaluate(() => {
        window.geographyFixtureUser = null;
        window.AlmanionAccount = {
            getUser: () => window.geographyFixtureUser,
            hasEnglishAccess: () => new Promise(resolve => { window.resolveGeographyEnglish = resolve; })
        };
    });
}

async function setUser(page, user) {
    await page.evaluate(user => {
        window.geographyFixtureUser = user;
        window.dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user } }));
    }, user);
}

test('homepage geography link belongs only to the requested account and clears on logout', async ({ page }) => {
    await homeAccountFixture(page);
    const card = page.locator('#homeAdditionalGeography');
    await expect(card).toBeHidden();
    await expect(card).not.toHaveAttribute('href');
    for (const user of [
        { uid: 'geography-other', email: 'other@example.com', siteAdmin: true },
        { uid: 'geography-empty' },
        { uid: 'geography-alias', email: 'dmb23930+alias@gmail.com' }
    ]) {
        await setUser(page, user);
        await expect(card).toBeHidden();
        await expect(card).not.toHaveAttribute('href');
    }
    await setUser(page, { uid: 'geography-owner', email: 'DMB23930@gmail.com' });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('href', 'geography/');
    await setUser(page, null);
    await page.evaluate(() => window.resolveGeographyEnglish(true));
    await expect(card).toBeHidden();
    await expect(card).not.toHaveAttribute('href');
    await setUser(page, { uid: 'geography-owner', email: 'dmb23930@gmail.com' });
    await card.click();
    await expect(page).toHaveURL(/\/geography\/$/);
    const homeUrl = new URL('/', page.url()).href;
    await page.getByRole('link', { name: '← На главную' }).click();
    await expect(page).toHaveURL(homeUrl);
    await expect(page.locator('#homeMain')).toBeVisible();
});

test('cached homepage clears the private link and checks the current account when restored', async ({ page }) => {
    await homeAccountFixture(page);
    const card = page.locator('#homeAdditionalGeography');
    await setUser(page, { uid: 'geography-owner', email: 'dmb23930@gmail.com' });
    await expect(card).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    await expect(card).toBeHidden();
    await expect(card).not.toHaveAttribute('href');
    await page.evaluate(() => {
        window.geographyFixtureUser = { uid: 'geography-other', email: 'other@example.com' };
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await expect(card).toBeHidden();
    await page.reload();
    await expect(card).toBeHidden();
    await expect(card).not.toHaveAttribute('href');
});

for (const width of [1366, 390, 320]) for (const dark of [false, true]) {
    test(`standalone geography map, groups and self-check at ${width}px, dark=${dark}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
        const errors = [];
        const external = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url()); });
        await page.goto('/geography/');
        const map = page.frameLocator('#codex-visualization');
        await expect(map.locator('#study-country-key button')).toHaveCount(20);
        expect(await map.locator('#study-main-map path[data-iso]').count()).toBeGreaterThan(150);
        await map.locator('#study-main-map g[data-capital="JPN"] circle[fill="transparent"]').first().click();
        await expect(map.locator('#study-selection')).toContainText('Япония — Токио');
        for (const [group, count] of [['1', 3], ['2', 5], ['3', 5], ['4', 5], ['5', 5], ['0', 20]]) {
            await map.locator('#study-group').selectOption(group);
            await expect(map.locator('#study-country-key button')).toHaveCount(count);
        }
        await map.locator('#study-country-key button[data-iso="FRA"]').click();
        await expect(map.locator('#study-main-map [data-map-label="FRA"]')).toContainText('Париж');
        await map.locator('#study-hide').check();
        await expect(map.locator('#study-selection')).toContainText('Франция — ?');
        await expect(map.locator('#study-main-map [data-map-label="FRA"]')).not.toContainText('Париж');
        await map.locator('#study-reveal').click();
        await expect(map.locator('#study-selection')).toContainText('Франция — Париж');
        await expect(map.locator('#study-main-map [data-map-label="FRA"]')).toContainText('Париж');
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        expect(await map.locator('html').evaluate(element => element.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        expect(errors).toEqual([]);
        expect(external).toEqual([]);
        await page.screenshot({ path: info.outputPath(`geography-${width}-${dark ? 'dark' : 'light'}.png`), fullPage: true });
        await map.locator('#study-country-key button[data-iso="AUT"]').scrollIntoViewIfNeeded();
        await expect(map.locator('#study-country-key button[data-iso="AUT"]')).toBeInViewport();
        await page.screenshot({ path: info.outputPath(`geography-bottom-${width}-${dark ? 'dark' : 'light'}.png`) });
        await page.reload();
        await expect(map.locator('#study-country-key button')).toHaveCount(20);
        await expect(page.getByRole('link', { name: '← На главную' })).toHaveAttribute('href', '../');
    });
}
