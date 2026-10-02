const { test, expect } = require('@playwright/test');

async function blockExternal(page) {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
}
async function notes(page) {
    await page.goto('/physics-10.html');
    await page.waitForFunction(() => !!window.AlmanionPersonalNotes);
}

test('personal notes survive bookmark removal, reload and cannot become public HTML', async ({ page }) => {
    await blockExternal(page); await notes(page);
    const block = page.locator('.definition-box').first();
    await block.locator('.personal-note-btn').click();
    await page.locator('#personalNoteText').fill('My private note <img src=x onerror=alert(1)>');
    await page.locator('[data-note-save]').click();
    await expect(block.locator('.personal-note-btn')).toHaveClass(/has-note/);
    await block.locator('.bookmark-btn').click();
    await expect(block.locator('.bookmark-btn')).toHaveClass(/bookmarked/);
    await block.locator('.bookmark-btn').click();
    await expect(block.locator('.bookmark-btn')).not.toHaveClass(/bookmarked/);
    await expect(block.locator('.personal-note-btn')).toHaveClass(/has-note/);
    await page.reload(); await page.waitForFunction(() => !!window.AlmanionPersonalNotes);
    await page.locator('#personalNotesButton').click();
    await expect(page.locator('.personal-note-card')).toContainText('My private note');
    await expect(page.locator('.personal-note-card img')).toHaveCount(0);
    await page.locator('[data-note-edit]').click();
    await expect(page.locator('#personalNoteText')).toHaveValue('My private note <img src=x onerror=alert(1)>');
    await page.locator('[data-note-delete]').click();
    await expect(page.locator('.personal-note-card')).toHaveCount(0);
});

test('personal notes are isolated on account switch', async ({ page }) => {
    await blockExternal(page); await notes(page);
    await page.evaluate(() => {
        window.AlmanionAccount = { getUser: () => ({ uid: 'reader-one' }) };
        dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user: { uid: 'reader-one' } } }));
    });
    await page.locator('.definition-box').first().locator('.personal-note-btn').click();
    await page.locator('#personalNoteText').fill('Only reader one');
    await page.locator('[data-note-save]').click();
    await page.evaluate(() => {
        window.AlmanionAccount = { getUser: () => ({ uid: 'reader-two' }) };
        dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user: { uid: 'reader-two' } } }));
    });
    await page.locator('#personalNotesButton').click();
    await expect(page.locator('.personal-note-card')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
        window.AlmanionAccount = { getUser: () => ({ uid: 'reader-one' }) };
        dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user: { uid: 'reader-one' } } }));
    });
    await page.locator('#personalNotesButton').click();
    await expect(page.locator('.personal-note-card')).toContainText('Only reader one');
});

test('study skips intermediates, respects editor choices and gives formula-specific titles', async ({ page }) => {
    await blockExternal(page); await notes(page);
    await page.evaluate(() => window.AlmanionNoteRuntime.ensure('knowledge'));
    const cards = await page.evaluate(() => {
        const topic = document.createElement('article'); topic.id = 'study-policy-fixture'; topic.className = 'topic';
        topic.innerHTML = String.raw`<h3 class="topic-title">Gas</h3><div class="definition-box" data-kc-id="gas"><strong>Gas law</strong>\[pV=nRT\]\[n=m/M\]</div><div class="derivation-box" data-kc-id="step"><strong>Derivation</strong>\[a=b\]\[b=c\]</div><div class="definition-box" data-kc-id="excluded" data-kc-ignore="true"><strong>Excluded</strong>Definition \[x=y\]</div><div class="remark-box" data-kc-title="Custom term" data-kc-id="renamed">Text</div><div class="derivation-box" data-kc-formulas="include" data-kc-id="included">\[E=mc^2\]</div>`;
        document.querySelector('main').append(topic);
        return window.__kcFSRS.extractCards([topic.id]);
    });
    expect(cards.some(card => card.term.includes('Excluded'))).toBe(false);
    expect(cards.some(card => card.kind === 'formula' && card.backHTML.includes('a=b'))).toBe(false);
    expect(cards.some(card => card.term === 'Custom term')).toBe(true);
    const formulas = cards.filter(card => card.kind === 'formula');
    expect(formulas).toHaveLength(4);
    expect(new Set(formulas.map(card => card.term)).size).toBe(4);
});

test('offline library downloads a complete subject; math and images survive a new offline visit', async ({ page, context }, testInfo) => {
    test.setTimeout(120000);
    await blockExternal(page);
    await page.goto('/physics-10.html');
    await page.locator('#offlineLibraryButton').click();
    await expect(page.locator('.offline-subject')).toHaveCount(9);
    await page.evaluate(() => window.AlmanionOffline.download('physics-10'));
    await expect(page.locator('[data-offline-subject="physics-10"]')).toHaveClass(/is-ready/);
    await page.setViewportSize({ width: 360, height: 780 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath('offline-library-mobile.png') });
    await page.keyboard.press('Escape');
    await context.setOffline(true);
    await page.goto('/physics-10.html?offline-test=1#temperatura-i-uravnenie-sostoyaniya');
    await expect(page.locator('.katex').first()).toBeAttached();
    await expect.poll(() => page.evaluate(() => document.fonts.check('16px KaTeX_Main'))).toBe(true);
    const images = await page.evaluate(async () => {
        const img = document.querySelector('img[src*="electron-microscope"]');
        const response = await fetch(img.src); return response.ok && /\x3csvg\b/.test(await response.text());
    });
    expect(images).toBe(true);
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await page.locator('#offlineLibraryButton').click();
    await expect(page.locator('[data-offline-subject="physics-10"]')).toHaveClass(/is-ready/);
    await expect(page.locator('.offline-connection')).toContainText('Нет сети');
});

test('failed offline replacement preserves the previously downloaded copy', async ({ page }) => {
    test.setTimeout(120000);
    await blockExternal(page); await page.goto('/physics-10.html');
    await page.locator('#offlineLibraryButton').click();
    await expect(page.locator('.offline-subject')).toHaveCount(9);
    await page.evaluate(() => window.AlmanionOffline.download('physics-10'));
    const before = await page.evaluate(async () => (await window.AlmanionOffline.installedPacks())['physics-10']);
    expect(before).toBeTruthy();
    await page.route('**/offline-library.json?*', async route => {
        const value = await (await route.fetch()).json();
        const subject = value.subjects.find(subject => subject.id === 'physics-10');
        subject.version = 'broken-version'; subject.files[0].sha256 = '0'.repeat(64);
        await route.fulfill({ json: value });
    });
    await page.evaluate(() => window.AlmanionOffline.open());
    await page.evaluate(() => window.AlmanionOffline.download('physics-10'));
    await expect(page.locator('.offline-message')).toContainText('Сайт обновился');
    const after = await page.evaluate(async () => (await window.AlmanionOffline.installedPacks())['physics-10']);
    expect(after.cacheName).toBe(before.cacheName);
});

test('cancelling an offline update preserves the old complete package', async ({ page }) => {
    test.setTimeout(120000);
    await blockExternal(page); await page.goto('/physics-10.html');
    await page.locator('#offlineLibraryButton').click();
    await expect(page.locator('.offline-subject')).toHaveCount(9);
    await page.evaluate(() => window.AlmanionOffline.download('physics-10'));
    const before = await page.evaluate(async () => (await window.AlmanionOffline.installedPacks())['physics-10']);
    let pending = 0;
    await page.route('**/*offline-download=*', async route => {
        if (route.request().url().includes('offline-library.json')) return route.continue();
        pending++;
        await new Promise(resolve => setTimeout(resolve, 300));
        await route.continue().catch(() => {});
    });
    await page.evaluate(() => { window.offlineJob = window.AlmanionOffline.download('physics-10'); });
    await expect.poll(() => pending).toBeGreaterThan(0);
    await page.locator('[data-offline-cancel]').click();
    await page.evaluate(() => window.offlineJob);
    await expect(page.locator('.offline-message')).toContainText('Загрузка отменена');
    const after = await page.evaluate(async () => (await window.AlmanionOffline.installedPacks())['physics-10']);
    expect(after.cacheName).toBe(before.cacheName);
});

test('reading dialogs fit narrow screens and both site themes', async ({ page }, testInfo) => {
    await blockExternal(page); await notes(page);
    await page.locator('#offlineLibraryButton').click();
    await expect(page.locator('.offline-subject')).toHaveCount(9);
    await page.evaluate(() => window.AlmanionNoteRuntime.ensure('settings'));
    for (const theme of ['dark', 'light']) {
        await page.evaluate(theme => { siteSettings.expTheme = theme; applyExperimental(); }, theme);
        for (const width of [320, 360, 390, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            const geometry = await page.locator('.offline-dialog').evaluate(dialog => {
                const box = dialog.getBoundingClientRect();
                return { left: box.left, right: box.right, width: innerWidth, overflow: dialog.scrollWidth - dialog.clientWidth };
            });
            expect(geometry.left).toBeGreaterThanOrEqual(0);
            expect(geometry.right).toBeLessThanOrEqual(geometry.width);
            expect(Math.abs(geometry.left - (geometry.width - geometry.right))).toBeLessThanOrEqual(1);
            expect(geometry.overflow).toBeLessThanOrEqual(1);
            if (width === 320 || width === 1440) await page.screenshot({ path: testInfo.outputPath('offline-' + theme + '-' + width + '.png') });
        }
    }
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 320, height: 740 });
    await page.locator('.definition-box').first().locator('.personal-note-btn').click();
    await page.locator('#personalNoteText').fill('Мой вопрос к этому определению');
    await page.screenshot({ path: testInfo.outputPath('personal-note-mobile.png') });
    const actionRects = await page.locator('.definition-box').first().evaluate(box => {
        const controls = Array.from(box.querySelectorAll(':scope > .block-action-btn'));
        return controls.map(control => { const r = control.getBoundingClientRect(); return { left: r.left, right: r.right }; });
    });
    actionRects.sort((a, b) => a.left - b.left);
    for (let i = 1; i < actionRects.length; i++) expect(actionRects[i].left).toBeGreaterThanOrEqual(actionRects[i - 1].right);
});
