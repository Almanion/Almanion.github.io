'use strict';
const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

test('responsive home order prioritizes subjects and preserves desktop quick access', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('.home-content-grid > .subjects-section')).toBeAttached();
    await expect(page.locator('.subjects-section + .home-quick-section')).toBeAttached();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('main > .home-quick-section')).toBeAttached();
    const quick = await page.locator('.home-quick-section').boundingBox();
    const subjects = await page.locator('.subjects-section').boundingBox();
    expect(quick.y).toBeLessThan(subjects.y);
    await page.setViewportSize({ width: 320, height: 568 });
    await expect(page.locator('.subjects-section + .home-quick-section')).toBeAttached();
});

for (const width of [320, 390, 768]) {
    test(`mobile sticky controls stay one row and touch-sized at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
        await page.goto('/physics-10.html');
        await page.waitForFunction(() => window.AlmanionNoteFilter && window.AlmanionSettings?.ready);
        await page.evaluate(() => experimentalReader.goToId('temperatura-i-uravnenie-sostoyaniya', { animate: false }));
        for (const noteScale of [0.75, 1, 1.25]) {
            await page.evaluate(noteScale => AlmanionSettings.update({ noteScale }), noteScale);
            await page.evaluate(() => scrollTo(0, 400));
            await expect.poll(() => page.locator('.note-reader-controls').evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(2);
            const geometry = await page.locator('.note-reader-controls').evaluate(el => {
                const rect = node => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
                return { bar: rect(el), toolbar: rect(el.querySelector('.exp-reader-toolbar')), filter: rect(el.querySelector('summary')),
                    arrows: [...el.querySelectorAll('.exp-reader-arrow')].map(rect), overflow: document.documentElement.scrollWidth - innerWidth };
            });
            expect(geometry.bar.top).toBeGreaterThanOrEqual(-1);
            expect(geometry.bar.top).toBeLessThan(2);
            expect(geometry.bar.height).toBeLessThan(65);
            expect(geometry.filter.left).toBeGreaterThanOrEqual(geometry.toolbar.right - 1);
            expect(geometry.filter.bottom).toBeLessThanOrEqual(geometry.bar.bottom + 1);
            for (const button of [geometry.filter, ...geometry.arrows]) {
                expect(button.width).toBeGreaterThanOrEqual(43.9);
                expect(button.height).toBeGreaterThanOrEqual(43.9);
            }
            expect(geometry.overflow).toBeLessThan(2);
            await page.locator('.note-filter summary').click();
            await expect(page.locator('.note-filter-done')).toBeInViewport();
            await page.locator('.note-filter-done').click();
        }
        await page.screenshot({ path: info.outputPath('compact-reader.png') });
    });
}

test('copy controls have no permanent accent frame and retain keyboard focus indication', async ({ page }) => {
    await page.goto('/physics-10.html');
    const button = page.locator('.topic.exp-reader-current .copy-block-btn').first();
    await expect(button).toBeAttached();
    const idle = await button.evaluate(el => ({ border: getComputedStyle(el).borderTopColor, shadow: getComputedStyle(el).boxShadow }));
    expect(idle.border).toBe('rgba(0, 0, 0, 0)');
    expect(idle.shadow).toBe('none');
    await page.keyboard.press('Tab');
    await button.focus();
    expect(await button.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
});

test('remark type labels stay visible beside action buttons in both designs', async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/physics-10.html');
    await page.waitForFunction(() => window.experimentalReader && window.AlmanionSettings?.ready);
    const remark = page.locator('[data-note-block="thermos-remark"]');
    for (const experimental of [true, false]) for (const noteScale of [1, 1.25]) {
        await page.evaluate(({ experimental, noteScale }) => AlmanionSettings.update({ experimental, noteScale, expTheme: 'dark', theme: 'dark' }), { experimental, noteScale });
        await remark.evaluate(el => {
            if (window.experimentalReader.isActive()) window.experimentalReader.revealElement(el, { animate: false });
            el.scrollIntoView({ block: 'center' });
        });
        await expect(remark).toBeVisible();
        await expect(remark.locator(':scope > .bookmark-btn')).toBeAttached();
        const label = await remark.evaluate(el => {
            const chip = getComputedStyle(el, '::before');
            return { text: chip.content, display: chip.display, style: getComputedStyle(el).fontStyle };
        });
        expect(label.text).toBe('"Замечание"');
        expect(label.display).not.toBe('none');
        expect(label.style).toBe('normal');
        await page.screenshot({ path: info.outputPath(`remark-${experimental ? 'new' : 'legacy'}-${noteScale}.png`) });
    }
});
