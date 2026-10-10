'use strict';
const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto('/physics-10.html');
    await page.waitForFunction(() => window.AlmanionNoteFilter && window.AlmanionSettings?.ready);
});

for (const width of [320, 390, 1440]) {
    test(`block picker stays anchored and its actions fit at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
        for (const scale of [75, 100, 125]) {
            await page.evaluate(scale => AlmanionSettings.update({ noteScale: scale / 100 }), scale);
            await expect(page.locator('body')).toHaveAttribute('data-note-scale', String(scale));
            const before = await page.locator('.topic.exp-reader-current').boundingBox();
            await page.locator('.note-filter summary').click();
            const menu = page.locator('.note-filter-popover');
            await expect(menu).toBeVisible();
            await expect(page.locator('.note-filter-done')).toBeInViewport();
            const geometry = await menu.evaluate(el => {
                const r = el.getBoundingClientRect();
                const dock = document.querySelector('.exp-bottom-nav').getBoundingClientRect();
                return { left: r.left, right: r.right, bottom: r.bottom, limit: dock.height ? dock.top : innerHeight, overflow: el.scrollWidth - el.clientWidth };
            });
            expect(geometry.left).toBeGreaterThanOrEqual(0);
            expect(geometry.right).toBeLessThanOrEqual(width);
            expect(geometry.bottom).toBeLessThanOrEqual(geometry.limit + 1);
            expect(geometry.overflow).toBeLessThan(2);
            const after = await page.locator('.topic.exp-reader-current').boundingBox();
            expect(after.y).toBeCloseTo(before.y, 0);
            expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThan(2);
            for (const theme of ['dark', 'light']) {
                await page.evaluate(expTheme => AlmanionSettings.update({ expTheme }), theme);
                await page.waitForTimeout(250);
                await page.screenshot({ path: info.outputPath(`picker-${theme}-${scale}.png`) });
            }
            await page.locator('.note-filter-done').click();
            await expect(menu).toBeHidden();
            await expect(page.locator('.note-filter summary')).toBeFocused();
        }
    });
}

test('checkboxes update immediately, remain open and restore across reload', async ({ page }) => {
    const trigger = page.locator('.note-filter summary');
    await expect(page.locator('.note-filter-count')).toHaveText('Все');
    await trigger.click();
    await expect(page.locator('.note-filter-reset')).toBeDisabled();
    const remark = page.locator('.note-filter input[value="remark"]');
    await remark.uncheck();
    await expect(remark).not.toBeChecked();
    await expect(page.locator('.note-filter')).toHaveAttribute('open', '');
    await expect(page.locator('.note-filter-count')).toHaveText(/^\d+\/\d+$/);
    await expect(page.locator('.remark-box').first()).toBeHidden();
    await page.reload();
    await trigger.click();
    await expect(remark).not.toBeChecked();
    await expect(page.locator('.note-filter-reset')).toBeEnabled();
    await page.locator('.note-filter-reset').click();
    await expect(page.locator('.note-filter-popover')).toBeVisible();
    await expect(page.locator('.note-filter-count')).toHaveText('Все');
    await expect(remark).toBeChecked();
    await expect(page.locator('.remark-box').first()).not.toHaveAttribute('data-note-filter-hidden', '');
});

test('picker closes on Escape, outside click and keyboard focus exit', async ({ page }) => {
    const trigger = page.locator('.note-filter summary');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.note-filter-popover')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('.note-filter input').first()).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.locator('.note-filter input').first()).not.toBeChecked();
    const topic = await page.locator('.topic.exp-reader-current').getAttribute('id');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(page.locator('.note-filter-popover')).toBeHidden();
    await expect(page.locator('.topic.exp-reader-current')).toHaveAttribute('id', topic);
    await trigger.click();
    await page.locator('.page-header h1').click();
    await expect(page.locator('.note-filter-popover')).toBeHidden();
    await trigger.click();
    await page.locator('.note-filter-done').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('.note-filter-popover')).toBeHidden();
});

test('legacy themes keep the picker readable and printing hides it', async ({ page }, info) => {
    await page.evaluate(() => AlmanionSettings.update({ experimental: false, theme: 'sepia' }));
    await page.locator('.note-filter summary').click();
    await expect(page.locator('.note-filter-done')).toBeVisible();
    await page.screenshot({ path: info.outputPath('picker-legacy-sepia.png') });
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.note-filter')).toBeHidden();
});

test('touch selection and a short viewport keep the footer reachable', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 700 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    try {
        await page.goto(test.info().project.use.baseURL + '/physics-10.html');
        await page.waitForFunction(() => window.AlmanionNoteFilter && window.AlmanionSettings?.ready);
        await page.locator('.note-filter summary').tap();
        const input = page.locator('.note-filter input').first();
        await input.tap();
        await expect(input).not.toBeChecked();
        await expect(page.locator('.note-filter-popover')).toBeVisible();
        await page.locator('.note-filter-done').tap();
        await page.evaluate(() => AlmanionSettings.update({ noteScale: 1.25 }));
        await page.setViewportSize({ width: 390, height: 390 });
        await page.locator('.note-filter summary').tap();
        await expect(page.locator('.note-filter-done')).toBeInViewport();
        const r = await page.locator('.note-filter-popover').boundingBox();
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.y + r.height).toBeLessThanOrEqual(390);
        await page.locator('.note-filter-reset').tap();
        await expect(page.locator('.note-filter-count')).toHaveText('Все');
        await page.locator('.note-filter-done').tap();
        await expect(page.locator('.note-filter-popover')).toBeHidden();
    } finally { await context.close().catch(() => {}); }
});

test('English block types and picker controls stay fully localized', async ({ page }) => {
    // Protected vocabulary is not accessed. Test the shared picker on a small local fixture.
    await page.route('**/block-filter-fixture.html', route => route.fulfill({
        contentType: 'text/html', body: '<!doctype html><html lang="en"><head><link rel="stylesheet" href="/styles/site/reader.css"></head><body data-note-subject="english"><main class="main-content"><section class="content-section"><div class="topic"><div class="english-word-card"><strong>Term</strong> — Definition</div></div></section></main></body></html>'
    }));
    await page.goto('/block-filter-fixture.html');
    await page.addScriptTag({ url: '/note-filter.js' });
    await page.addStyleTag({ url: '/styles/note-filter.css' });
    await page.locator('.note-filter summary').click();
    await expect(page.locator('.note-filter-title')).toHaveText('Show blocks');
    await expect(page.locator('.note-filter-count')).toHaveText('All');
    await expect(page.locator('.note-filter-options')).toContainText('Definitions');
    await expect(page.locator('.note-filter-options')).toContainText('Other text');
    await expect(page.locator('.note-filter-done')).toHaveText('Done');
    await expect(page.locator('.note-filter-reset')).toHaveText('Show all');
});
