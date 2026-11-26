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

test('the scale slider fill follows keyboard, pointer and numeric input', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 680 });
    await page.evaluate(() => openSettingsModal());
    const range = page.getByRole('slider', { name: 'Масштаб конспекта' });
    const number = page.locator('#noteScaleInput');
    await expect(range).toHaveCSS('height', '44px');
    await expect(range).toHaveCSS('appearance', 'none');
    await expect(range).toHaveCSS('--note-scale-fraction', '0.5');
    await range.press('ArrowRight');
    await expect(number).toHaveValue('101');
    await expect(range).toHaveAttribute('aria-valuetext', '101%');
    await expect(range).toHaveCSS('--note-scale-fraction', '0.52');

    await number.fill('75');
    await number.press('Tab');
    await expect(range).toHaveValue('75');
    await expect(range).toHaveCSS('--note-scale-fraction', '0');
    const bounds = await range.boundingBox();
    await range.click({ position: { x: bounds.width - 1, y: bounds.height / 2 } });
    await expect(number).toHaveValue('125');
    await expect(range).toHaveCSS('--note-scale-fraction', '1');

    await page.locator('[data-note-scale-action="reset"]').click();
    await expect(range).toBeFocused();
    await expect(number).toHaveValue('100');
    await expect(range).toHaveCSS('--note-scale-fraction', '0.5');
});

test('touch scrolling settings body does not drag or close the sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.evaluate(() => {
        openSettingsModal();
        const body = document.querySelector('.settings-modal-body');
        body.scrollTop = 400;
        for (const [type, y] of [['touchstart', 300], ['touchmove', 340], ['touchmove', 500], ['touchend', 500]]) {
            const event = new Event(type, { bubbles: true, cancelable: true });
            Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ identifier: 1, clientX: 100, clientY: y }] });
            body.dispatchEvent(event);
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
    await page.evaluate(async id => {
        await document.fonts.ready;
        const settled = new Promise(resolve => document.addEventListener('scrollend', resolve, { once: true }));
        experimentalReader.goToId(id, { animate: false });
        await settled;
    }, id);
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
    await expect.poll(async () => Math.abs(await top() - oldTop)).toBeLessThan(4);
    expect(await chrome()).toEqual(before);
    const other = topics.nth(5);
    await page.mouse.move(width - 40, 450);
    // Release the saved position with a real wheel event. Browsers cap a single wheel delta differently.
    const previousY = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 80);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(previousY);
    await other.evaluate(el => {
        const toolbar = document.querySelector('.note-reader-controls').getBoundingClientRect();
        window.scrollBy({ top: el.getBoundingClientRect().top - toolbar.bottom + 120, behavior: 'instant' });
    });
    const nextId = await other.getAttribute('id');
    await expect(current).toHaveAttribute('id', nextId);
    await expect(page.locator('.nav-link[aria-current="location"]')).toHaveAttribute('href', '#' + nextId);
    const feedTop = await top();
    await switchLayout('sections');
    await expect(page.locator('.content-section > .topic:visible')).toHaveCount(1);
    await expect(current).toHaveAttribute('id', nextId);
    await expect.poll(async () => Math.abs(await top() - feedTop)).toBeLessThan(4);
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

test('landscape previews each motion level and replays by keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => openSettingsModal());
    const preview = page.getByRole('button', { name: 'Повторить анимацию' });
    const names = () => preview.evaluate(el => el.getAnimations({ subtree: true }).map(a => a.animationName));
    const cloudDuration = () => preview.locator('.prefs-cloud').evaluate(el => parseFloat(getComputedStyle(el).animationDuration) * 1000);
    await expect(page.locator('#settingsDoneBtn')).toBeFocused();
    await expect.poll(names).toContain('prefs-trail');
    expect(await cloudDuration()).toBeCloseTo(2400 / 1.3, 1);
    await preview.evaluate(el => el.getAnimations({ subtree: true }).forEach(a => a.finish()));
    await preview.focus();
    await page.keyboard.press('Enter');
    await expect.poll(names).toContain('prefs-trail');
    await page.locator('[data-level="medium"]').click();
    await expect.poll(names).toContain('prefs-cloud-drift');
    expect(await cloudDuration()).toBeCloseTo(800 / 1.3, 1);
    expect(await names()).not.toContain('prefs-hills');
    await page.locator('[data-level="off"]').click();
    await expect(preview).toBeDisabled();
    await expect.poll(names).toEqual([]);
    await page.locator('[data-level="max"]').click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(preview).toBeDisabled();
    await expect.poll(names).toEqual([]);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(preview).toBeEnabled();
    await page.locator('#settingsDoneBtn').click();
    await expect(page.locator('.prefs-preview')).not.toHaveClass(/playing/);
});

test('sun sets behind the ridge and the moon completes the orbit in both directions', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    await page.evaluate(() => openSettingsModal());
    const scene = page.locator('.prefs-sky');
    const readArc = () => scene.evaluate(async sky => {
        const arc = sky.getAnimations().find(a => a.transitionProperty === '--prefs-nightfall');
        if (!arc) throw new Error('No day/night transition');
        arc.pause();
        await arc.ready;
        const duration = arc.effect.getTiming().duration;
        const elapsed = [0, .25, .5, .75, 1];
        const orbit = sky.querySelector('.prefs-orbit');
        const points = elapsed.map(part => {
            arc.currentTime = duration * part;
            const matrix = new DOMMatrix(getComputedStyle(orbit).transform);
            const offset = new DOMPoint(12, -22).matrixTransform(matrix);
            return {
                x: 44 + offset.x, y: 31 + offset.y,
                moon: Number(getComputedStyle(sky.querySelector('.prefs-moon')).opacity),
                twilight: Number(getComputedStyle(sky.querySelector('.prefs-twilight')).opacity)
            };
        });
        arc.finish();
        return { duration, points };
    });
    const switchTo = async theme => {
        await page.locator(`[data-exp-theme="${theme}"]`).click();
        await expect.poll(() => scene.evaluate(el => el.getAnimations().some(a => a.transitionProperty === '--prefs-nightfall'))).toBe(true);
    };

    await switchTo('dark');
    const { duration, points: sunset } = await readArc();
    expect(duration).toBeCloseTo(2400 / 1.3, 1);
    expect(sunset[0].moon).toBe(0);
    expect(sunset[1].x).toBeLessThan(44);
    expect(sunset[2].y).toBeGreaterThan(44);
    expect(sunset[2].twilight).toBeGreaterThan(.3);
    expect(sunset[3].x).toBeGreaterThan(56);
    expect(sunset[4]).toMatchObject({ x: 56, y: 9, moon: 1, twilight: 0 });

    await switchTo('light');
    const { points: sunrise } = await readArc();
    expect(sunrise[0].moon).toBe(1);
    expect(sunrise[1].x).toBeGreaterThan(56);
    expect(sunrise[3].x).toBeLessThan(56);
    expect(sunrise[4]).toMatchObject({ x: 56, y: 9, moon: 0, twilight: 0 });
});

test('a second theme tap reverses the visible day/night arc', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    await page.evaluate(() => openSettingsModal());
    const sky = page.locator('.prefs-sky');
    await page.locator('[data-exp-theme="dark"]').click();
    const { before, after } = await sky.evaluate(async el => {
        const phase = () => Number(getComputedStyle(el).getPropertyValue('--prefs-nightfall'));
        while (phase() < .3) await new Promise(requestAnimationFrame);
        const before = phase();
        el.closest('#settingsModal').querySelector('[data-exp-theme="light"]').click();
        return { before, after: phase() };
    });
    expect(before).toBeLessThan(.9);
    expect(Math.abs(after - before)).toBeLessThan(.05);
    await expect(sky.locator('.prefs-night')).toHaveCSS('opacity', '0');
    await expect(page.locator('[data-exp-theme="light"]')).toHaveAttribute('aria-pressed', 'true');
});
