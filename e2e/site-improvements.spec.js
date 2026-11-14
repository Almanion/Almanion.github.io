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
    // Automatic extraction skips multiline derivations. An authored formula
    // block can intentionally keep related formulas together in one card.
    const automaticFormulas = formulas.filter(card => card.sourceId.startsWith('math:'));
    expect(automaticFormulas.length).toBeGreaterThan(0);
    expect(automaticFormulas.every(card => !card.backHTML.includes('\\begin{aligned}'))).toBe(true);
    const characteristicSpeeds = formulas.find(card => card.sourceId === 'maxwell-characteristic-speeds');
    expect(characteristicSpeeds).toBeDefined();
    for (const speed of ['наиболее вероятная', 'средняя квадратичная', 'средняя арифметическая']) {
        expect(characteristicSpeeds.backHTML).toContain(speed);
    }
    expect(new Set(formulas.map(card => card.id)).size).toBe(formulas.length);
    await expect(page.locator('#kcTypeList [data-kind="formula"]')).toBeEnabled();
    await expect(page.locator('#kcTypeList button:disabled')).toHaveCount(0);
});

test('search includes physics 10 even with an old cached index', async ({ page }) => {
    const requests = [];
    page.on('request', request => { if (new URL(request.url()).pathname === '/search-index.json') requests.push(request.url()); });
    await page.addInitScript(() => sessionStorage.setItem('almanion_search_prebuilt_v3', JSON.stringify({ entries: [{ page: 'physics.html', id: 'old', title: 'Old', text: 'Old' }] })));
    await page.goto('/physics-10.html#fizicheskie-velichiny-i-izmereniya');
    await page.locator('#searchInput').fill('Термодинамический');
    await expect(page.locator('[data-search-scope="section"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#searchResultsPanel')).toContainText('Ничего не найдено');
    await page.locator('[data-search-scope="page"]').click();
    await expect(page.locator('#searchResultsPanel')).toContainText('Термодинамический');
    expect(requests).toHaveLength(0);
    await page.locator('[data-search-scope="all"]').click();
    await expect(page.locator('.search-result-item').first()).toBeVisible();
    expect(requests).toHaveLength(1);
    await page.locator('[data-search-scope="page"]').click();
    await page.locator('.search-result-item').filter({ hasText: 'Термодинамический и статистический методы' }).first().click();
    await expect(page).toHaveURL(/#metody-molekulyarnoy-fiziki$/);
});

test('mobile menu and search own keyboard focus only while open', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/physics-10.html');
    const sidebar = page.locator('#sidebar');
    const menu = page.locator('#expBottomNav [aria-label="Меню"]');
    await expect(sidebar).toHaveJSProperty('inert', true);
    await menu.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => sidebar.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    await expect(sidebar).toHaveJSProperty('inert', true);
    const search = page.locator('#expBottomNav [aria-label="Поиск"]');
    await search.click();
    await expect(page.locator('#searchInput')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(search).toBeFocused();
    await menu.click();
    await page.setViewportSize({ width: 1200, height: 844 });
    await expect(sidebar).not.toHaveClass(/\bopen\b/);
    await expect(sidebar).toHaveJSProperty('inert', false);
    await page.locator('#searchInput').focus();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(sidebar).toHaveJSProperty('inert', true);
    await expect(menu).toBeFocused();
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
