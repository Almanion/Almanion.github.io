'use strict';

const { test, expect } = require('@playwright/test');
const savedProfile = require('../game-source/orbital-courier/docs/completed-v8-profile.json');
const gameURL = '/games/orbital-courier/';
const saveKey = 'orbital-courier-save-v8';

test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => {
        const host = new URL(route.request().url()).hostname;
        return host === '127.0.0.1' || host === 'localhost' ? route.continue() : route.abort();
    });
});

test('home game button opens the new self-contained release', async ({ page }) => {
    await page.goto('/');
    await page.locator('.home-game-link').click();
    await expect(page).toHaveURL(/\/games\/orbital-courier\/$/);
    await expect(page).toHaveTitle(/Орбитальный курьер 10/);
    await expect(page.locator('#continueButton')).toBeVisible();
    expect(await page.evaluate(() => Orbital.LEVELS.length)).toBe(80);
});

for (const [width, height] of [[1366, 768], [320, 568], [390, 844], [844, 390]]) {
    test(`game launches with reachable controls at ${width}x${height}`, async ({ browser }, testInfo) => {
        const context = await browser.newContext({ viewport: { width, height },
            isMobile: width < 900, hasTouch: width < 900, serviceWorkers: 'block' });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
            await page.goto('http://127.0.0.1:4173' + gameURL);
            await page.locator('#continueButton').click();
            await expect(page.locator('#gameCanvas')).toBeVisible();
            await expect.poll(() => page.evaluate(() => Orbital.App.transitioning)).toBeFalsy();
            const launch = page.locator('#launchButton:visible, #mobileLaunch:visible').first();
            await expect(launch).toBeInViewport();
            expect(await page.evaluate(() => document.documentElement.scrollWidth -
                document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
            await page.screenshot({ path: testInfo.outputPath('game.png') });
            await launch.click();
            await expect.poll(() => page.evaluate(() => Orbital.App.state?.status)).toBe('flying');
            expect(errors).toEqual([]);
        } finally {
            await context.close();
        }
    });
}

test('version 8 save retains balances and progress through upgrade and reload', async ({ page }) => {
    // Seed an actual browser storage entry once, not a mocked storage implementation.
    await page.goto('/');
    await page.evaluate(({ key, profile }) => localStorage.setItem(key, JSON.stringify(profile)),
        { key: saveKey, profile: savedProfile });
    await page.goto(gameURL);
    for (let visit = 0; visit < 2; visit++) {
        await expect(page.locator('#continueButton')).toBeVisible();
        const profile = await page.evaluate(() => Orbital.App.profile);
        for (const key of ['credits', 'data', 'xp', 'upgrades', 'records', 'receipts', 'courses', 'skin', 'trail']) {
            expect(profile[key], key).toEqual(savedProfile[key]);
        }
        expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).version, saveKey)).toBe(8);
        if (visit === 0) await page.reload();
    }
});
