'use strict';
const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
for (const width of [390, 1440]) {
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
