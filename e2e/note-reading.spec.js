const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1' || url.hostname === 'cdn.jsdelivr.net') route.continue();
        else route.abort();
    });
    await page.goto('/physics-10.html');
    await page.evaluate(() => window.AlmanionNoteRuntime.ensure('print'));
    await page.waitForFunction(() => window.AlmanionNoteFilter && window.AlmanionPrintExport);
});

test('block filter preserves selected nested blocks, resets and survives reload', async ({ page }) => {
    await page.evaluate(() => {
        const topic = document.querySelector('.topic');
        topic.insertAdjacentHTML('beforeend', '<div class="definition-box" id="filter-fixture">Hidden term<p>Hidden definition</p><div class="proof-box" id="nested-proof"><p>Visible proof</p><div class="formula-box">Hidden formula</div></div></div>');
    });
    await expect(page.locator('.note-filter input[value="proof"]')).toHaveCount(1);
    await page.evaluate(() => {
        document.querySelectorAll('.note-filter input').forEach(input => { input.checked = input.value === 'proof'; });
        document.querySelector('.note-filter input').dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('#nested-proof p')).toBeVisible();
    await expect(page.locator('#filter-fixture > p')).toBeHidden();
    await expect(page.locator('#nested-proof .formula-box')).toBeHidden();
    expect(await page.locator('#filter-fixture').evaluate(el => getComputedStyle(el).display)).toBe('contents');
    await page.reload();
    await expect(page.locator('.note-filter-count')).toHaveText('Фильтр включён');
    await page.locator('.note-filter summary').click();
    await page.locator('.note-filter-reset').click();
    await expect(page.locator('[data-note-filter-hidden]')).toHaveCount(0);
    await page.setViewportSize({ width: 360, height: 780 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('filter hides plain text and disables empty PDF exports', async ({ page }) => {
    await page.evaluate(() => {
        document.querySelectorAll('.note-filter input').forEach(input => { input.checked = false; });
        document.querySelector('.note-filter input').dispatchEvent(new Event('change', { bubbles: true }));
        window.AlmanionPrintExport.open();
    });
    await expect(page.locator('#printExportDownload')).toBeDisabled();
    await expect(page.locator('#printExportDescription')).toContainText('выбранные типы');
    await page.keyboard.press('Escape');
    await expect(page.locator('.topic').first().locator('.note-filter-empty')).toBeVisible();
    await page.locator('.note-filter summary').click();
    await page.locator('.note-filter-reset').click();
    await expect(page.locator('.note-filter-empty')).toHaveCount(0);
});

for (const dark of [false, true, 'legacy']) {
    test(`A4 export has readable text and no reader controls (${dark === 'legacy' ? 'legacy' : dark ? 'dark' : 'light'})`, async ({ page }, testInfo) => {
        await page.evaluate(dark => {
            document.body.classList.toggle('exp-dark', dark);
            if (dark === 'legacy') {
                document.body.classList.remove('experimental', 'exp-prism', 'exp-dark');
                document.body.classList.add('dark-theme');
            }
            document.documentElement.style.setProperty('--note-scale', '1.25');
            window.AlmanionPrintExport.open();
        }, dark);
        await page.locator('[data-print-preset="current"]').click();
        await page.keyboard.press('Escape');
        await page.emulateMedia({ media: 'print' });
        await page.evaluate(() => {
            window.AlmanionPrintExport.prepare();
            dispatchEvent(new Event('beforeprint'));
        });
        const values = await page.locator('.content-section[data-print-selected-section]').evaluate(el => {
            const text = el.querySelector('p');
            return { color: getComputedStyle(text).color, fill: getComputedStyle(text).webkitTextFillColor,
                zoom: getComputedStyle(el).zoom, width: el.getBoundingClientRect().width };
        });
        expect(values.color).toBe('rgb(23, 25, 29)');
        expect(values.fill).toBe('rgb(23, 25, 29)');
        expect(values.zoom).toBe('1');
        expect(values.width).toBeLessThanOrEqual(690);
        await expect(page.locator('.note-filter')).toBeHidden();
        await expect(page.locator('.exp-reader-toolbar')).toBeHidden();
        await page.screenshot({ path: testInfo.outputPath('print.png'), fullPage: true });
        const pdf = await page.pdf({ path: testInfo.outputPath('notes.pdf'), preferCSSPageSize: true, printBackground: true });
        expect(pdf.length).toBeGreaterThan(10000);
        await page.evaluate(() => window.AlmanionPrintExport.restore());
        await page.emulateMedia({ media: 'screen' });
        await expect(page.locator('.note-filter')).toBeVisible();
        await expect(page.locator('[data-print-excluded]')).toHaveCount(0);
    });
}
