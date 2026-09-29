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
                return { filter: rect('.note-filter'), reader: rect('.exp-reader-toolbar'), overflow: document.documentElement.scrollWidth - innerWidth };
            }, scale);
            expect(Math.abs(boxes.filter.width - boxes.reader.width), `${width}px / ${scale}`).toBeLessThan(2);
            expect(Math.abs(boxes.filter.x - boxes.reader.x)).toBeLessThan(2);
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
    const swatches = await page.locator('.exp-mode-card').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().top));
    expect(Math.abs(swatches[0] - swatches[1])).toBeLessThan(1);
    await page.locator('[data-exp-theme="dark"]').click();
    await page.locator('[data-exp-mode="graphite"]').click();
    await page.locator('[data-level="medium"]').click();
    await page.locator('.toggle-switch').filter({ has: page.locator('#hoverToggle') }).click();
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
    await page.locator('[data-design-mode="legacy"]').click();
    await expect(page.locator('#themeSection')).toBeVisible();
    await page.locator('.theme-option[data-theme="sepia"]').click();
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
        if (path === '/english.html') {
            await expect(page.locator('#settingsDoneBtn')).toHaveText('Done');
            await expect(page.locator('#settingsResetBtn')).toContainText('Reset all');
        }
        await page.locator('.settings-modal-body').evaluate(el => el.scrollTop = el.scrollHeight);
        await expect(page.locator('#settingsDoneBtn')).toBeInViewport();
        await page.locator('#settingsDoneBtn').click();
        await expect(page.locator('#settingsModal')).toHaveClass(/hidden/);
    }
});
