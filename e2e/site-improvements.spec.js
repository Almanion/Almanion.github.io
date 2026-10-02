const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

test('study and export load on first intent; displayed formulas are study cards', async ({ page }) => {
    await page.goto('/physics-10.html');
    await page.waitForFunction(() => typeof openSettingsModal === 'function');
    expect(await page.evaluate(() => !!window.__kcFSRS || !!window.AlmanionPrintExport || !!window.AlmanionPdfDownload)).toBe(false);
    await page.locator('#knowledgeCheckBtn').click();
    await expect(page.locator('#kcSelectOverlay')).toBeVisible();
    const formulas = await page.evaluate(() => window.__kcFSRS.extractCards(Array.from(document.querySelectorAll('article.topic[id]')).map(node => node.id), ['formula']));
    expect(formulas.length).toBeGreaterThan(20);
    expect(formulas.every(card => !card.backHTML.includes('\\begin{aligned}'))).toBe(true);
    expect(new Set(formulas.map(card => card.id)).size).toBe(formulas.length);
    await expect(page.locator('#kcTypeList [data-kind="formula"]')).toBeEnabled();
    await expect(page.locator('#kcTypeList button:disabled')).toHaveCount(0);
});

test('search includes physics 10 even with an old cached index', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('almanion_search_prebuilt_v3', JSON.stringify({ entries: [{ page: 'physics.html', id: 'old', title: 'Old', text: 'Old' }] })));
    await page.goto('/physics-10.html');
    await page.locator('#searchInput').fill('Термодинамический');
    await expect(page.locator('#searchResultsPanel')).toContainText('Термодинамический');
    await page.locator('[data-search-scope="page"]').click();
    await expect(page.locator('#searchResultsPanel')).toContainText('Термодинамический');
    await page.locator('.search-result-item').filter({ hasText: 'Термодинамический и статистический методы' }).first().click();
    await expect(page).toHaveURL(/#metody-molekulyarnoy-fiziki$/);
});

test('closed settings cannot take keyboard focus, open settings trap and restore it', async ({ page }) => {
    await page.goto('/physics-10.html');
    await page.waitForFunction(() => typeof openSettingsModal === 'function');
    await expect(page.locator('#settingsModal')).toHaveJSProperty('inert', true);
    const opener = page.locator('#settingsButtonSidebar');
    await opener.click();
    await expect(page.locator('#settingsModal')).toHaveJSProperty('inert', false);
    await page.locator('#settingsDoneBtn').focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('#settingsModal'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    await page.evaluate(() => document.getElementById('noteScaleInput').focus());
    await expect(opener).toBeFocused();
});

test('header subtitles and links have readable contrast in all reading themes', async ({ page }) => {
    await page.goto('/physics.html');
    await page.waitForFunction(() => typeof openSettingsModal === 'function');
    await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' });
    for (const theme of ['', 'dark-theme', 'experimental exp-prism', 'experimental exp-prism exp-dark', 'experimental exp-graphite', 'experimental exp-graphite exp-dark']) {
        const ratios = await page.evaluate(async theme => {
            document.body.className = theme;
            await new Promise(resolve => requestAnimationFrame(resolve));
            const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
            const lum = color => color.map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
            const header = document.querySelector('.page-header');
            const bg = rgb(getComputedStyle(header).backgroundColor);
            return Array.from(header.querySelectorAll('p, a')).map(node => {
                const css = getComputedStyle(node), opacity = Number(css.opacity), ink = rgb(css.color).map((x, i) => x * opacity + bg[i] * (1 - opacity));
                const a = lum(ink), b = lum(bg);
                return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
            });
        }, theme);
        expect(ratios.length).toBeGreaterThan(0);
        for (const ratio of ratios) expect(ratio, theme).toBeGreaterThanOrEqual(4.5);
    }
});

test('PDF is a direct download with selectable Cyrillic, vectors and fixed A4 margins', async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/physics-10.html');
    await page.locator('#printExportButton').click();
    await expect(page.locator('#printExportDialog')).toBeVisible();
    await page.locator('[data-print-preset="none"]').click();
    // Definitions, long derivations, inline fractions and SVG graphs.
    const selected = ['metody-molekulyarnoy-fiziki', 'razmery-i-massy-molekul', 'izoprotsessy-gazovye-zakony'];
    for (const id of selected) await page.locator('[data-print-item]').evaluateAll((inputs, id) => {
        const input = inputs.find(el => el.dataset.printItem.endsWith(id));
        if (!input) throw new Error('missing PDF item: ' + id);
        input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true }));
    }, id);
    const downloadPromise = page.waitForEvent('download', { timeout: 80000 });
    await page.locator('#printExportDownload').click();
    const download = await downloadPromise;
    const file = testInfo.outputPath('direct-notes.pdf');
    await download.saveAs(file);
    const fs = require('node:fs');
    const buffer = fs.readFileSync(file);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(10000);
    expect(errors).toEqual([]);
    await expect(page.locator('#printExportDownload')).toBeEnabled();
    await expect(page.locator('body')).not.toHaveClass(/print-export-active/);
    await page.locator('#printExportPreview').click();
    await expect(page.locator('#printExportPreviewPanel')).toBeVisible({ timeout: 80000 });
    await expect(page.locator('#printExportPreviewFrame')).toHaveAttribute('src', /^blob:/);
    await expect(page.locator('.print-export-dialog-body')).toHaveJSProperty('inert', true);
    await expect(page.locator('#printExportPreviewClose')).toBeFocused();
    await page.locator('#printExportPreviewClose').click();
    await expect(page.locator('.print-export-dialog-body')).toHaveJSProperty('inert', false);
    await expect(page.locator('#printExportPreview')).toBeFocused();
});

test('PDF keeps inline SVG illustrations and rejects bad layout without hanging', async ({ page }) => {
    await page.goto('/physics-10.html');
    await page.addScriptTag({ url: '/pdf-download.js?v=20261002-1' });
    const result = await page.evaluate(async () => {
        const article = document.createElement('article');
        article.innerHTML = '<h3>Проверка схемы</h3><div class="definition-box"><strong>Термин</strong> — текст.<span><svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><path d="M10 90 L100 10 L190 90 Z" fill="none" stroke="#17191d"/></svg></span></div>';
        const blob = await AlmanionPdfDownload.generate([{ element: article }], 'Схема');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        article.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 -1 -1"><path d="bad"/></svg>';
        let rejected = false;
        try { await AlmanionPdfDownload.generate([{ element: article }], 'Ошибка'); } catch (_) { rejected = true; }
        return { type: blob.type, bytes: bytes.length, header: new TextDecoder().decode(bytes.slice(0, 5)), rejected };
    });
    expect(result).toMatchObject({ type: 'application/pdf', header: '%PDF-', rejected: true });
    expect(result.bytes).toBeGreaterThan(1000);
});
