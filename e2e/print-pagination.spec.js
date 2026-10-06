'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto('/physics-10.html');
});

test('contents use actual section pages, include only exported headings and keep every footer serial', async ({ page }, info) => {
    test.setTimeout(90000);
    await page.addScriptTag({ url: '/pdf-download.js' });
    const result = await page.evaluate(async () => {
        const fixture = document.createElement('div');
        fixture.innerHTML = '<section class="content-section"><h2 class="part-title">Первый раздел</h2><article class="topic" id="selected-first"><h3 class="topic-title">Первый параграф</h3><h4 class="subsection-title">Первый подраздел</h4><div class="definition-box"><p><strong>Термин</strong> — проверка определения.</p><div class="formula-box">\\[pV=nRT\\]</div></div><div class="proof-box">' + Array.from({ length: 35 }, (_, i) => '<p>Шаг ' + (i + 1) + '. Длинный текст доказательства переносится между страницами и меняет место следующего подраздела. При этом в содержании должен остаться настоящий номер его страницы.</p>').join('') + '</div><h4 class="subsection-title">Второй подраздел</h4><div class="remark-box">Второй подраздел после длинного доказательства.</div></article><article class="topic" id="excluded"><h3>Исключённый параграф</h3><p>Не входит в экспорт.</p></article></section><section class="content-section"><h2 class="part-title">Второй раздел</h2><article class="topic" id="selected-last"><h3 class="topic-title">Последний параграф</h3><div class="example-box">Последний пример.</div></article></section>';
        const items = ['selected-first', 'selected-last'].map(id => ({ element: fixture.querySelector('#' + id) }));
        await AlmanionPdfDownload.generate([{ element: fixture.querySelector('#selected-last') }], 'Подготовка');
        const pagination = AlmanionPdfPagination;
        let headings, locations, actual;
        window.AlmanionPdfPagination = { ...pagination,
            contents(entries, pages, english) { headings = entries; if (pages) locations = pages; return pagination.contents(entries, pages, english); },
            locate(pages, entries) { actual = pagination.locate(pages, entries); return actual; }
        };
        const blob = await AlmanionPdfDownload.generate(items, 'Проверка содержания');
        return { bytes: Array.from(new Uint8Array(await blob.arrayBuffer())), entries: headings.map(entry => ({ ...entry, page: locations[entry.id] })), locations, actual };
    });
    fs.writeFileSync(info.outputPath('print-contents.pdf'), Buffer.from(result.bytes));
    fs.writeFileSync(info.outputPath('print-contents.json'), JSON.stringify(result.entries, null, 2));
    expect(result.actual).toEqual(result.locations);
    expect(result.entries.map(entry => entry.text)).toEqual(['Первый раздел', 'Первый параграф', 'Первый подраздел', 'Второй подраздел', 'Второй раздел', 'Последний параграф']);
    expect(result.entries[0].page).toBe(1);
    expect(result.entries[3].page).toBeGreaterThan(2);
    expect(result.entries[4].page).toBeGreaterThan(result.entries[3].page);
    expect(result.entries.every(entry => entry.page > 0)).toBe(true);
});

test('long contents can continue without orphaned headings or incorrect page references; English is localized', async ({ page }) => {
    test.setTimeout(90000);
    await page.addScriptTag({ url: '/pdf-download.js' });
    const result = await page.evaluate(async () => {
        document.documentElement.lang = 'en';
        const element = document.createElement('article');
        element.innerHTML = '<h3>First section</h3><p>First body.</p>' + Array.from({ length: 65 }, (_, i) => '<h4>Subsection ' + (i + 1) + '</h4><p>Section body.</p>').join('');
        await AlmanionPdfDownload.generate([{ element }], 'Contents test');
        const pagination = AlmanionPdfPagination;
        let title, pages, actual;
        window.AlmanionPdfPagination = { ...pagination,
            contents(entries, locations, english) { const toc = pagination.contents(entries, locations, english); title = toc.stack[0].text; if (locations) pages = locations; return toc; },
            locate(layout, entries) { actual = pagination.locate(layout, entries); return actual; }
        };
        const blob = await AlmanionPdfDownload.generate([{ element }], 'Contents test');
        return { title, pages, actual, size: blob.size };
    });
    expect(result.title).toBe('Contents');
    expect(result.actual).toEqual(result.pages);
    expect(Object.values(result.pages)[0]).toBeGreaterThan(1);
    expect(Object.keys(result.pages)).toHaveLength(66);
    expect(result.size).toBeGreaterThan(10000);
});

test('Ctrl+P loads export on first intent and print uses the generated PDF instead of HTML', async ({ page }, info) => {
    test.setTimeout(90000);
    await expect(page.locator('#printExportButton')).toBeVisible();
    expect(await page.evaluate(() => !!window.AlmanionPrintExport)).toBe(false);
    await page.keyboard.press('Control+p');
    await expect(page.locator('#printExportDialog')).toBeVisible();
    await page.locator('[data-print-preset="current"]').click();
    await page.evaluate(() => { window.print = () => { throw new Error('Must not print the differently paginated HTML'); }; });
    await page.locator('#printExportPrint').click();
    await expect(page.locator('#printExportPreviewPanel')).toBeVisible({ timeout: 80000 });
    await expect(page.locator('#printExportPreviewFrame')).toHaveAttribute('src', /^blob:/);
    const result = await page.evaluate(async () => {
        const response = await fetch(document.getElementById('printExportPreviewFrame').src);
        const blob = await response.blob();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        return { type: blob.type, size: blob.size, header: new TextDecoder().decode(bytes.slice(0, 5)), bytes: Array.from(bytes) };
    });
    expect(result).toMatchObject({ type: 'application/pdf', header: '%PDF-' });
    expect(result.size).toBeGreaterThan(10000);
    fs.writeFileSync(info.outputPath('prepared-print.pdf'), Buffer.from(result.bytes));
    expect(Buffer.from(result.bytes).toString('latin1')).toMatch(/\/OpenAction\s+\d+\s+0\s+R/);
    expect(Buffer.from(result.bytes).toString('latin1')).toMatch(/\/S\s+\/Named\s+\/N\s+\/Print/);
    await expect(page.locator('#printExportDownload')).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.locator('#printExportDialog')).toBeHidden();
    expect(await page.locator('#printExportPreviewFrame').evaluate(frame => frame.onload)).toBe(null);
    await expect(page.locator('#printExportPreviewFrame')).toHaveAttribute('src', 'about:blank');
});
