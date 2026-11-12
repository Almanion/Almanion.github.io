const { test, expect } = require('@playwright/test');

async function blockExternal(page) {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
}
async function notes(page) {
    await page.goto('/physics-10.html');
    await page.waitForFunction(() => !!window.AlmanionPersonalNotes);
}

test('reader progress resets per section while next and previous cross section boundaries', async ({ page }) => {
    const topics = (prefix, count) => Array.from({ length: count }, (_, index) =>
        `<article class="topic" id="${prefix}-${index + 1}"><h3 class="topic-title">${prefix} ${index + 1}</h3></article>`).join('');
    await page.route('**/reader-progress-fixture', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body:
        `<body class="experimental animations-off"><main class="main-content"><section class="content-section"><h2 class="part-title">Молекулярная физика</h2>${topics('molecular', 27)}</section><section class="content-section"><h2 class="part-title">Измерения и погрешности</h2>${topics('measurement', 4)}</section></main><script src="/experimental-reader.js"></script></body>` }));
    // Exercise the actual reader source without coupling this regression to lesson counts.
    await page.route('**/experimental-reader.js', route => route.fulfill({ contentType: 'application/javascript; charset=utf-8', path: require.resolve('../experimental-reader.js') }));
    for (const width of [1366, 360]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/reader-progress-fixture');
        await page.waitForFunction(() => window.experimentalReader?.isActive());
        const toolbar = page.locator('.exp-reader-toolbar');
        const progress = toolbar.locator('[role="progressbar"]');
        const next = toolbar.locator('[data-reader-action="next"]');
        const previous = toolbar.locator('[data-reader-action="prev"]');
        const go = id => page.evaluate(id => experimentalReader.goToId(id, { animate: false }), id);
        const expectProgress = async (number, total) => {
            await expect(toolbar.locator('.exp-reader-count')).toHaveText(`${number} / ${total}`);
            await expect(progress).toHaveAttribute('aria-label', 'Прогресс по подразделам текущего раздела');
            await expect(progress).toHaveAttribute('aria-valuenow', String(number));
            await expect(progress).toHaveAttribute('aria-valuemax', String(total));
            await expect(progress).toHaveAttribute('aria-valuetext', `Подраздел ${number} из ${total}`);
            const percent = await progress.locator('span').evaluate(span => parseFloat(span.style.width));
            expect(percent).toBeCloseTo(number / total * 100);
        };
        await go('molecular-20');
        await expectProgress(20, 27);
        await expect(previous).toBeEnabled(); await expect(next).toBeEnabled();
        await go('molecular-27');
        await expectProgress(27, 27);
        await expect(next).toBeEnabled();
        await expect(page.locator('body')).not.toHaveClass(/exp-reader-at-end/);
        await next.click();
        await expectProgress(1, 4);
        await expect(toolbar.locator('.exp-reader-part')).toHaveText('Измерения и погрешности');
        await expect(page).toHaveURL(/#measurement-1$/);
        await expect(previous).toBeEnabled();
        await expect(page.locator('body')).not.toHaveClass(/exp-reader-at-start/);
        await previous.click();
        await expectProgress(27, 27);
        await expect(page).toHaveURL(/#molecular-27$/);
        await go('measurement-4');
        await expectProgress(4, 4);
        await expect(next).toBeDisabled();
        await expect(page.locator('body')).toHaveClass(/exp-reader-at-end/);
        await go('molecular-1');
        await expectProgress(1, 27);
        await expect(previous).toBeDisabled();
        await expect(page.locator('body')).toHaveClass(/exp-reader-at-start/);
    }
});

test.describe('properties block actions', () => {
    test.use({ serviceWorkers: 'block' });
    for (const width of [320, 390]) test(`properties copy, bookmark and note controls fit a ${width}px phone at 125% scale`, async ({ page, context }, info) => {
        await blockExternal(page);
        await page.setViewportSize({ width, height: 844 });
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.goto('/chemistry.html');
        await page.waitForFunction(() => !!window.AlmanionPersonalNotes && window.AlmanionSettings?.ready);
        await page.evaluate(() => AlmanionSettings.update({ noteScale: 125 }));
        // Nested properties share their enclosing block's bookmark/note;
        // the standalone properties block has all three independent actions.
        const block = page.locator('.topic.exp-reader-current > .properties-box').first();
        await expect(block).toHaveClass(/copyable-block/);
        await expect(block.locator(':scope > .copy-block-btn')).toHaveCount(1);
        const buttons = block.locator(':scope > :is(.copy-block-btn, .bookmark-btn, .personal-note-btn)');
        await expect(buttons).toHaveCount(3);
        const rects = await buttons.evaluateAll(nodes => nodes.map(el => { const r = el.getBoundingClientRect(); const svg = el.querySelector('svg'); const icon = svg.getBoundingClientRect(); const style = getComputedStyle(svg); return { width: r.width, height: r.height, left: r.left, right: r.right, iconWidth: icon.width, iconHeight: icon.height, centerY: icon.top + icon.height / 2, stroke: style.strokeWidth, cap: style.strokeLinecap, join: style.strokeLinejoin }; }));
        for (const r of rects) {
            expect(r.width).toBeGreaterThanOrEqual(44); expect(r.height).toBeGreaterThanOrEqual(44);
            expect(r.iconWidth).toBeLessThanOrEqual(20); expect(r.iconHeight).toBeLessThanOrEqual(20);
            expect(r.iconWidth).toBeCloseTo(rects[0].iconWidth, 1);
            expect(r.iconHeight).toBeCloseTo(rects[0].iconHeight, 1);
            expect(r.centerY).toBeCloseTo(rects[0].centerY, 1);
            expect(r.stroke).toBe('1.8px'); expect(r.cap).toBe('round'); expect(r.join).toBe('round');
        }
        rects.sort((a, b) => a.left - b.left);
        for (let i = 1; i < rects.length; i++) expect(rects[i].left).toBeGreaterThanOrEqual(rects[i - 1].right - 1);
        await block.locator(':scope > .copy-block-btn').click();
        await expect(block.locator(':scope > .copy-block-btn')).toHaveClass(/is-copied/);
        expect(await block.locator(':scope > .copy-block-btn svg').evaluate(el => getComputedStyle(el).strokeWidth)).toBe('1.8px');
        expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Атомный номер');
        await block.locator(':scope > .bookmark-btn').click();
        await expect(block.locator(':scope > .bookmark-btn')).toHaveClass(/bookmarked/);
        expect(await block.locator(':scope > .bookmark-btn svg').evaluate(el => getComputedStyle(el).fill)).not.toBe('none');
        await block.locator(':scope > .bookmark-btn').click();
        await expect(block.locator(':scope > .bookmark-btn')).not.toHaveClass(/bookmarked/);
        expect(await block.locator(':scope > .bookmark-btn svg').evaluate(el => getComputedStyle(el).fill)).toBe('none');
        await block.locator(':scope > .personal-note-btn').click();
        await page.locator('#personalNoteText').fill('Properties test note');
        await page.locator('[data-note-save]').click();
        await expect(block.locator(':scope > .personal-note-btn')).toHaveClass(/has-note/);
        await block.scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath('properties-actions-' + width + '.png') });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThan(2);
        await page.reload();
        await expect(block.locator(':scope > .copy-block-btn')).toHaveCount(1);
        await expect(block.locator(':scope > .personal-note-btn')).toHaveClass(/has-note/);
    });
});

test('block action icons share geometry and hover/focus styling across desktop themes', async ({ page }, info) => {
    await blockExternal(page);
    await page.setViewportSize({ width: 1366, height: 900 });
    await notes(page);
    await page.waitForFunction(() => window.AlmanionSettings?.ready);
    const block = page.locator('.definition-box').first();
    const buttons = block.locator(':scope > :is(.copy-block-btn, .personal-note-btn, .bookmark-btn)');
    await expect(buttons).toHaveCount(3);
    for (const theme of ['prism-light', 'prism-dark', 'graphite-light', 'graphite-dark', 'legacy-light', 'legacy-dark']) {
        await page.evaluate(theme => AlmanionSettings.update(theme.startsWith('legacy') ? { experimental: false, theme: theme.split('-')[1] } : { experimental: true, expMode: theme.split('-')[0], expTheme: theme.split('-')[1] }), theme);
        await block.hover();
        await page.waitForTimeout(180);
        const geometry = await buttons.evaluateAll(nodes => nodes.map(el => {
            const icon = el.querySelector('svg'), r = icon.getBoundingClientRect(), style = getComputedStyle(icon), button = getComputedStyle(el);
            return { width: r.width, height: r.height, centerY: r.top + r.height / 2, stroke: style.strokeWidth, cap: style.strokeLinecap, join: style.strokeLinejoin, color: button.color, radius: button.borderRadius };
        }));
        for (const item of geometry) {
            expect(item.width).toBe(16); expect(item.height).toBe(16);
            expect(item.centerY).toBeCloseTo(geometry[0].centerY, 1);
            expect(item.stroke).toBe('1.8px'); expect(item.cap).toBe('round'); expect(item.join).toBe('round');
            expect(item.color).toBe(geometry[0].color); expect(item.radius).toBe('8px');
        }
        let hover;
        for (const button of await buttons.all()) {
            await button.hover();
            await page.waitForTimeout(180);
            const state = await button.evaluate(el => ({ color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderColor, transform: getComputedStyle(el).transform, iconTransform: getComputedStyle(el.querySelector('svg')).transform }));
            hover ||= state;
            expect(state).toEqual(hover);
            await page.keyboard.press('Tab');
            await button.focus();
            expect(await button.evaluate(el => ({ outline: getComputedStyle(el).outlineStyle, width: getComputedStyle(el).outlineWidth, offset: getComputedStyle(el).outlineOffset }))).toEqual({ outline: 'solid', width: '2px', offset: '2px' });
        }
        await page.evaluate(() => document.activeElement?.blur());
        await block.hover();
        await page.waitForTimeout(180);
        await block.screenshot({ path: info.outputPath(`block-actions-${theme}.png`) });
    }
});

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

test.describe('isolated account fixtures', () => {
// Route interception must also cover SDK requests: a worker can otherwise
// bypass page.route and restore a real anonymous session over the fixture.
test.use({ serviceWorkers: 'block' });
test('personal notes are isolated on account switch and ignore stale store callbacks', async ({ page }) => {
    await blockExternal(page); await notes(page);
    await page.evaluate(() => {
        window.__noteStoreCallbacks = {};
        for (const name of ['createCollection', 'migrateGuest']) {
            const original = window.AlmanionDataSync[name];
            window.AlmanionDataSync[name] = options => {
                window.__noteStoreCallbacks[options.owner] = options.onChange;
                return original(options);
            };
        }
        window.AlmanionAccount = { getUser: () => ({ uid: 'reader-one' }) };
        dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user: { uid: 'reader-one' } } }));
    });
    await page.locator('.definition-box').first().locator('.personal-note-btn').click();
    await page.locator('#personalNoteText').fill('Only reader one');
    await page.locator('[data-note-save]').click();
    await page.evaluate(() => {
        window.__previousReaderNotes = Object.fromEntries(window.AlmanionBookmarks.notes().map(note => [note.id, note]));
        window.AlmanionAccount = { getUser: () => ({ uid: 'reader-two' }) };
        dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user: { uid: 'reader-two' } } }));
        window.__noteStoreCallbacks['reader-one'](window.__previousReaderNotes, { type: 'error', error: 'Delayed old-account request' });
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

test('offline download can be cancelled while service worker preparation is stalled', async ({ page }) => {
    await blockExternal(page); await notes(page);
    await page.locator('#offlineLibraryButton').click();
    await expect(page.locator('.offline-subject')).toHaveCount(9);
    await page.evaluate(() => {
        navigator.serviceWorker.register = () => Promise.resolve({});
        Object.defineProperty(navigator.serviceWorker, 'ready', { configurable: true, value: new Promise(() => {}) });
        window.__offlinePreparing = window.AlmanionOffline.download('physics-10').then(() => { window.__offlineCancelled = true; });
    });
    await page.locator('[data-offline-cancel]').click();
    await expect.poll(() => page.evaluate(() => window.__offlineCancelled), { timeout: 3000 }).toBe(true);
    await expect(page.locator('.offline-message')).toHaveText('Загрузка отменена.');
    await expect(page.locator('[data-offline-subject="physics-10"] [data-offline-download]')).toBeEnabled();
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
            const footerVisible = await page.locator('.offline-dialog').evaluate(dialog => dialog.querySelector('.reader-tool-footer').getBoundingClientRect().bottom <= dialog.getBoundingClientRect().bottom + 1);
            expect(footerVisible).toBe(true);
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
