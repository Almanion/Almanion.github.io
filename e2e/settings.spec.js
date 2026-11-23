const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
    await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
    await page.goto('/physics-10.html');
    await page.waitForFunction(() => window.AlmanionNoteFilter && typeof openSettingsModal === 'function');
});

test('block filter follows reader width at every scale and viewport', async ({ page }) => {
    for (const width of [1920, 1500, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        for (const scale of [.75, 1, 1.25]) {
            const boxes = await page.evaluate(scale => {
                document.documentElement.style.setProperty('--note-scale', scale);
                const rect = selector => {
                    const r = document.querySelector(selector).getBoundingClientRect();
                    return { x: r.x, width: r.width };
                };
                return { filter: rect('.note-filter'), reader: rect('.note-reader-controls'), overflow: document.documentElement.scrollWidth - innerWidth };
            }, scale);
            expect(boxes.filter.x, `${width}px / ${scale}`).toBeGreaterThanOrEqual(boxes.reader.x - 2);
            expect(boxes.filter.x + boxes.filter.width).toBeLessThanOrEqual(boxes.reader.x + boxes.reader.width + 2);
            expect(boxes.overflow).toBeLessThan(2);
        }
    }
});

for (const width of [1440, 390, 320]) test(`settings controls fit and persist at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => openSettingsModal());
    await expect(page.locator('#settingsDoneBtn')).toBeInViewport();
    await page.locator('#noteScaleInput').fill('113');
    await page.locator('#noteScaleInput').press('Tab');
    await expect(page.locator('#noteScaleRange')).toHaveValue('113');
    await page.locator('[data-note-scale-action="reset"]').click();
    await expect(page.locator('#noteScaleInput')).toHaveValue('100');
    const swatches = await page.locator('[data-exp-mode]').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().top));
    expect(Math.abs(swatches[0] - swatches[1])).toBeLessThan(1);
    await page.locator('[data-exp-theme="dark"]').click();
    await page.locator('[data-exp-mode="graphite"]').click();
    await page.locator('[data-level="medium"]').click();
    await page.locator('.prefs-hover').filter({ has: page.locator('#hoverToggle') }).click();
    const geometry = await page.locator('.settings-modal-content').evaluate(el => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, bottom: r.bottom, overflow: el.scrollWidth - el.clientWidth,
            bodyOverflow: el.querySelector('.settings-modal-body').scrollWidth - el.querySelector('.settings-modal-body').clientWidth };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(width);
    expect(geometry.bottom).toBeLessThanOrEqual(801);
    expect(geometry.overflow).toBeLessThan(2);
    expect(geometry.bodyOverflow).toBeLessThan(2);
    await expect(page.locator('#settingsDoneBtn')).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('settings-dark.png') });
    await page.locator('.settings-modal-body').evaluate(el => el.scrollTop = 0);
    await page.screenshot({ path: testInfo.outputPath('settings-top.png') });
    await page.locator('#settingsDoneBtn').click();
    await expect(page.locator('#settingsModal')).toHaveClass(/hidden/);
    await page.reload();
    await page.waitForFunction(() => typeof openSettingsModal === 'function');
    await page.evaluate(() => openSettingsModal());
    await expect(page.locator('[data-exp-theme="dark"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-exp-mode="graphite"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#hoverToggle')).not.toBeChecked();
    await page.locator('[data-reader-layout="feed"]').click();
    await expect(page.locator('body')).toHaveClass(/exp-reader-feed/);
    await expect(page.locator('html')).toHaveAttribute('data-exp', 'graphite-dark');
    await page.locator('[data-exp-mode="sepia"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-exp', 'sepia-dark');
    await page.keyboard.press('Escape');
    await expect(page.locator('#settingsModal')).toHaveClass(/hidden/);
});

test('touch scrolling settings body does not drag or close the sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.evaluate(() => {
        openSettingsModal();
        const body = document.querySelector('.settings-modal-body');
        body.scrollTop = 400;
        for (const [type, y] of [['touchstart', 300], ['touchmove', 340], ['touchmove', 500], ['touchend', 500]]) {
            body.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true,
                touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: body, clientX: 100, clientY: y })] }));
        }
    });
    await page.waitForTimeout(350);
    await expect(page.locator('#settingsModal')).not.toHaveClass(/hidden/);
    expect(await page.locator('.settings-modal-content').evaluate(el => el.style.transform)).toBe('');
});

test('shared settings remain usable on the home page, Matcenter and English', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    for (const path of ['/index.html', '/matcenter.html', '/english.html']) {
        await page.goto(path);
        // Layout-only fixture: account-gate behavior is covered separately.
        if (path === '/matcenter.html') await page.addStyleTag({ content: '.matcenter-auth-fullscreen { display: none !important; }' });
        await page.waitForFunction(() => typeof openSettingsModal === 'function');
        await page.evaluate(() => openSettingsModal());
        await expect(page.locator('#settingsDoneBtn')).toBeInViewport();
        if (path === '/index.html') await expect(page.locator('#hoverToggle')).toHaveCount(0);
        if (path === '/matcenter.html') await expect(page.locator('[data-solved-animation="strike"]')).toBeVisible();
        if (path === '/english.html') {
            await expect(page.locator('#settingsDoneBtn')).toHaveText('Done');
            await expect(page.locator('#settingsResetBtn')).toContainText('Reset settings');
        }
        await page.locator('.settings-modal-body').evaluate(el => el.scrollTop = el.scrollHeight);
        await expect(page.locator('#settingsDoneBtn')).toBeInViewport();
        await page.locator('#settingsDoneBtn').click();
        await expect(page.locator('#settingsModal')).toHaveClass(/hidden/);
    }
});

test('sync and confirmed reset update the open sheet in place', async ({ page }) => {
    const opener = page.locator('#settingsButtonSidebar');
    await opener.click();
    await page.evaluate(() => {
        const settings = window.AlmanionSettings;
        settings.applySynced({ ...settings.get(), noteScale: 1.17, animationLevel: 'off' });
        window.settingsDialogBeforeReset = document.querySelector('#settingsModal');
    });
    await expect(page.locator('#noteScaleInput')).toHaveValue('117');
    await expect(page.locator('[data-level="off"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#settingsResetBtn').click();
    await expect(page.locator('#prefsCancel')).toBeFocused();
    await page.locator('#prefsCancel').click();
    await expect(page.locator('#noteScaleInput')).toHaveValue('117');
    await page.locator('#settingsResetBtn').click();
    await page.locator('#prefsConfirm').click();
    await expect(page.locator('#noteScaleInput')).toHaveValue('100');
    await expect(page.locator('[data-level="max"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.querySelector('#settingsModal') === window.settingsDialogBeforeReset)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
});

test('theme illustration and choice highlights follow the active settings with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await page.evaluate(() => openSettingsModal());
    const scene = page.locator('.prefs-sky');
    await expect(scene.locator('.prefs-day')).toHaveCSS('opacity', '0');
    await expect(scene.locator('.prefs-night')).toHaveCSS('opacity', '1');
    await expect(scene).toHaveCSS('animation-name', 'none');
    await page.locator('[data-exp-theme="light"]').click();
    await expect(scene.locator('.prefs-day')).toHaveCSS('opacity', '1');
    await expect(scene.locator('.prefs-night')).toHaveCSS('opacity', '0');
    const highlight = await page.locator('[aria-labelledby="prefsTheme"]').evaluate(group => {
        const style = getComputedStyle(group, '::before');
        const offset = new DOMMatrix(style.transform).m41;
        const active = group.querySelector('[aria-pressed="true"]');
        return { actual: offset + parseFloat(style.left), expected: active.offsetLeft, duration: style.transitionDuration };
    });
    expect(Math.abs(highlight.actual - highlight.expected)).toBeLessThan(1);
    expect(highlight.duration).toBe('0s');
});

for (const width of [390, 1366]) test(`switching note layout preserves reading position and controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => AlmanionSettings.update({ animationLevel: 'off', expMode: 'sepia', expTheme: 'light' }));
    const current = page.locator('.topic.exp-reader-current');
    const topics = page.locator('.content-section > .topic[id]');
    const id = await topics.nth(3).getAttribute('id');
    await page.evaluate(id => experimentalReader.goToId(id, { animate: false }), id);
    await expect(current).toHaveAttribute('id', id);
    const chrome = () => page.locator('.note-reader-controls, .sidebar-header, .mobile-bottom-nav').evaluateAll(elements =>
        elements.map(el => { const s = getComputedStyle(el); return [s.display, s.backgroundColor, s.color, s.borderRadius, el.offsetWidth, el.offsetHeight]; }));
    const before = await chrome();
    const switchLayout = async (layout) => {
        await page.evaluate(() => openSettingsModal());
        await page.locator(`[data-reader-layout="${layout}"]`).click();
        await page.locator('#settingsDoneBtn').click();
    };
    const top = () => current.evaluate(el => el.getBoundingClientRect().top);
    const oldTop = await top();
    await switchLayout('feed');
    await expect(page.locator('.content-section > .topic:visible')).toHaveCount(await topics.count());
    await expect(current).toHaveAttribute('id', id);
    expect(Math.abs(await top() - oldTop)).toBeLessThan(4);
    expect(await chrome()).toEqual(before);
    const other = topics.nth(5);
    const distance = await other.evaluate(el => el.getBoundingClientRect().top - document.querySelector('.note-reader-controls').getBoundingClientRect().bottom + 120);
    await page.mouse.move(width - 40, 450);
    await page.mouse.wheel(0, distance);
    const nextId = await other.getAttribute('id');
    await expect(current).toHaveAttribute('id', nextId);
    await expect(page.locator('.nav-link[aria-current="location"]')).toHaveAttribute('href', '#' + nextId);
    const feedTop = await top();
    await switchLayout('sections');
    await expect(page.locator('.content-section > .topic:visible')).toHaveCount(1);
    await expect(current).toHaveAttribute('id', nextId);
    expect(Math.abs(await top() - feedTop)).toBeLessThan(4);
    await expect(page.locator('html')).toHaveAttribute('data-exp', 'sepia-light');
    await page.reload();
    await expect(page.locator('.topic.exp-reader-current')).toHaveAttribute('id', nextId);
});

test('a saved feed applies to older notes and leaves other site pages in the same palette', async ({ page }) => {
    await page.evaluate(() => AlmanionSettings.update({ readerLayout: 'feed', expMode: 'sepia', expTheme: 'dark' }));
    for (const path of ['/likbez.html', '/physics.html']) {
        await page.goto(path);
        await expect(page.locator('body')).toHaveClass(/exp-reader-feed/);
        const topics = page.locator('.content-section > .topic[id]');
        await expect(page.locator('.content-section > .topic[id]:visible')).toHaveCount(await topics.count());
    }
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-exp', 'sepia-dark');
    await expect(page.locator('body')).not.toHaveAttribute('data-reader-layout', /.+/);
    await page.waitForFunction(() => window.AlmanionSettings?.ready);
    const card = page.locator('.subject-card:visible').first();
    const appearance = () => card.evaluate(el => {
        const style = getComputedStyle(el);
        return [style.color, style.background, style.border, el.clientWidth, el.clientHeight];
    });
    const before = await appearance();
    await page.evaluate(() => openSettingsModal());
    await page.locator('[data-reader-layout="sections"]').click();
    await page.locator('#settingsDoneBtn').click();
    expect(await appearance()).toEqual(before);
    await expect(page.locator('html')).toHaveAttribute('data-exp', 'sepia-dark');
});
