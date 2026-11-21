'use strict';

const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

test('tablet contents overlay preserves reading width and the desktop preference', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1000 });
    await page.goto('/physics-10.html');
    const topic = page.locator('article.exp-reader-current');
    const opener = page.getByRole('button', { name: 'Развернуть меню навигации' });
    const sidebar = page.locator('#sidebar');
    for (const width of [769, 820, 1024]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(opener).toBeVisible();
        const before = await topic.boundingBox();
        expect(before.width).toBeGreaterThan(570);
        await opener.click();
        await expect(sidebar).toHaveJSProperty('inert', false);
        expect(Math.abs((await topic.boundingBox()).width - before.width)).toBeLessThan(2);
        await page.keyboard.press('Escape');
        await expect(opener).toBeFocused();
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(sidebar).toHaveJSProperty('inert', false);
    await page.getByRole('button', { name: 'Свернуть меню навигации' }).click();
    await page.setViewportSize({ width: 820, height: 1000 });
    await opener.click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(sidebar).toHaveJSProperty('inert', true);
});

test('home searches across subjects on demand, restores focus and opens the exact paragraph', async ({ page }) => {
    const indices = [];
    page.on('request', request => { if (request.url().endsWith('/search-index.json')) indices.push(request.url()); });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const quick = page.getByRole('button', { name: 'Поиск по конспектам' });
    await quick.click();
    await expect(page.locator('#searchInput')).toBeFocused();
    expect(indices).toHaveLength(0);
    await page.keyboard.press('Escape');
    await expect(quick).toBeFocused();
    await page.keyboard.press('Control+k');
    await page.locator('#searchInput').fill('Дальтона');
    const result = page.locator('.search-result-item').filter({ hasText: 'Закон Дальтона' }).first();
    await expect(result).toBeVisible();
    expect(await result.innerText()).not.toMatch(/\\[()[\]]|Дальтонадавление/);
    const target = await result.getAttribute('href');
    await page.locator('#searchInput').fill('Дальтон');
    await expect(result).toBeVisible();
    expect(indices).toHaveLength(1);
    await result.click();
    await expect(page).toHaveURL(url => url.pathname.endsWith(target.split('#')[0]) && url.hash === '#' + target.split('#')[1]);
});

test('broad searches reveal additional matches without another download', async ({ page }) => {
    let downloads = 0;
    const entries = Array.from({ length: 42 }, (_, i) => ({
        page: 'physics-10.html', id: 'law-' + i, subject: 'Физика', title: 'Закон ' + i, text: 'Закон давления ' + i
    }));
    await page.route('**/search-index.json', route => {
        downloads++;
        return route.fulfill({ json: { schemaVersion: 1, version: 'sample', entries } });
    });
    await page.goto('/');
    await page.locator('#homeSearchOpen').click();
    await page.locator('#searchInput').fill('закон');
    await expect(page.getByRole('option')).toHaveCount(36);
    await page.getByRole('button', { name: 'Показать ещё' }).click();
    await expect(page.getByRole('option')).toHaveCount(42);
    await expect(page.locator('#searchInput')).toHaveAttribute('aria-activedescendant', 'siteSearchOption36');
    expect(downloads).toBe(1);
});

test('the current paragraph starts a scoped session and preserves the custom deck', async ({ page }) => {
    await page.goto('/physics-10.html');
    await page.locator('#knowledgeCheckBtn').click();
    const paragraph = await page.locator('article.exp-reader-current').getAttribute('id');
    await expect(page.locator('#kcQuickTopic')).toHaveText(await page.locator('article.exp-reader-current .topic-title').innerText());
    await expect(page.locator('#kcCustomOptions')).toBeHidden();
    await page.locator('#kcConfigure').click();
    await page.locator('[data-limit="15"]').click();
    await page.locator('#kcConfigure').click();
    await page.locator('#kcQuickStart').click();
    await expect(page.locator('#kcReviewOverlay')).toBeVisible();
    const saved = await page.evaluate(() => Object.keys(localStorage).map(key => {
        try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    }).find(value => Array.isArray(value?.selectedTopicIds)));
    expect(saved.selectedTopicIds).toEqual([paragraph]);
    await page.reload();
    await page.locator('#knowledgeCheckBtn').click();
    await expect(page.locator('#kcResumeSession')).toBeVisible();
    await page.locator('#kcConfigure').click();
    await expect(page.locator('[data-limit="15"]')).toHaveAttribute('aria-pressed', 'true');
});

test('course navigation follows published sections and browser history', async ({ page }) => {
    await page.goto('/likbez.html');
    const courses = page.getByRole('combobox', { name: 'Курс ликбеза' });
    const names = await courses.locator('option').allTextContents();
    expect(names).toEqual(expect.arrayContaining(['Интеграл Римана', 'Линейная алгебра', 'Теория чисел']));
    await courses.selectOption({ label: 'Линейная алгебра' });
    const algebra = await courses.inputValue();
    await expect(page.locator('article.exp-reader-current')).toHaveAttribute('id', algebra);
    await courses.selectOption({ label: 'Теория чисел' });
    await expect(page.locator('article.exp-reader-current')).toHaveAttribute('id', await courses.inputValue());
    await page.goBack();
    await expect(courses).toHaveValue(algebra);
    await expect(page.locator('article.exp-reader-current')).toHaveAttribute('id', algebra);
});

test('the alphabet jumps to the first matching stress word, above the fold and clear of the toolbar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/russian-ege.html#stress-all');
    const words = page.locator('#stress-all [data-stress-all-grid] > .accent-word-card');
    const alphabet = page.getByRole('combobox', { name: 'Перейти к словам на букву' });
    const actual = await words.evaluateAll(cards => [...new Set(cards.map(c => c.dataset.searchWord[0].toUpperCase()))].sort((a,b) => a.localeCompare(b,'ru')));
    expect(await alphabet.locator('option').allTextContents()).toEqual(['Выбрать букву', ...actual]);
    const count = await words.count();
    await alphabet.selectOption('Ш');
    const first = page.locator('#stress-all [data-search-word^="ш"]').first();
    await expect(first).toBeFocused();
    await expect(first).toBeInViewport();
    expect((await first.boundingBox()).y).toBeGreaterThanOrEqual((await page.locator('.note-reader-controls').boundingBox()).height);
    expect(await words.count()).toBe(count);
});

async function scrollToBottom(page, offset = 0) {
    return page.evaluate(px => {
        const root = document.scrollingElement;
        window.scrollTo({ top: root.scrollHeight - root.clientHeight - px, behavior: 'instant' });
        return window.scrollY;
    }, offset);
}

test('the wheel reveals the next title, waits for another scroll and ignores momentum', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/physics-10.html#izoprotsessy-gazovye-zakony');
    const current = page.locator('article.exp-reader-current');
    const preview = page.locator('.reader-pull-preview');
    const nextTitle = await page.locator('.exp-reader-footer-next strong').innerText();
    await scrollToBottom(page, 45);
    await page.mouse.move(850, 845);
    for (let step = 0; step < 3; step++) await page.mouse.wheel(0, 120);
    await expect(preview).toBeHidden();
    await expect(current).toHaveAttribute('id', 'izoprotsessy-gazovye-zakony');

    await scrollToBottom(page);
    await page.waitForTimeout(300); // A new wheel gesture, after the scroll that reached the bottom.
    await page.mouse.wheel(0, 120);
    await expect(preview).toBeVisible();
    await expect(preview).toHaveText(nextTitle);
    await expect(current).toHaveAttribute('id', 'izoprotsessy-gazovye-zakony');
    await expect(preview).toBeHidden(); // An abandoned wheel preview settles back.

    await page.mouse.wheel(0, 120);
    await expect(preview).toBeVisible();
    await page.evaluate(() => {
        window.addEventListener('wheel', event => {
            // Deliver the momentum tail in the same burst even when CI is recording a heavy page.
            const target = document.elementFromPoint(event.clientX, event.clientY);
            const tail = new WheelEvent('wheel', { deltaY: 24, bubbles: true, cancelable: true });
            window.readerConsumedMomentum = !target.dispatchEvent(tail);
        }, { once: true, passive: true });
    });
    await page.mouse.wheel(0, 120);
    await expect(current.locator('.topic-title')).toHaveText(nextTitle);
    expect(await page.evaluate(() => window.readerConsumedMomentum)).toBe(true);
});

test('a short tablet topic reveals its successor from the bottom margin with reduced motion', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/physics-10.html');
    const preview = page.locator('.reader-pull-preview');
    const current = page.locator('article.exp-reader-current');
    await expect(current).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => {
        const root = document.scrollingElement;
        return root.scrollHeight - root.clientHeight;
    })).toBeLessThanOrEqual(4);
    const origin = await scrollToBottom(page);
    const nextTitle = await page.locator('.exp-reader-footer-next strong').innerText();
    await page.mouse.move(410, 1130);
    await page.mouse.wheel(0, 65);
    await expect(preview).toHaveText(nextTitle);
    // Settings can finish loading during the pull and reapply the current reader mode.
    await page.evaluate(() => window.dispatchEvent(new Event('experimental-mode-changed')));
    await expect(preview.locator('strong')).toBeInViewport();
    await expect(preview.locator('strong')).toHaveCSS('transform', 'none');
    await expect(current).toHaveCSS('scale', 'none');
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(origin + 10);
    await page.mouse.wheel(0, 80);
    await expect(current.locator('.topic-title')).toHaveText(nextTitle);
});

test.describe('touch reader', () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    test('a fresh upward pull at the bottom advances exactly once', async ({ page, browserName }) => {
        test.skip(browserName !== 'chromium', 'Native touch input below uses the Chromium debugging protocol');
        await page.goto('/physics-10.html');
        const current = page.locator('article.exp-reader-current');
        const ids = await page.locator('.main-content .content-section > .topic[id]').evaluateAll(nodes => nodes.map(n => n.id));
        const client = await page.context().newCDPSession(page);
        async function start() {
            const point = await page.evaluate(() => {
                for (let y = innerHeight - 100; y > 180; y -= 12) {
                    for (const x of [40, 120, innerWidth / 2]) {
                        const el = document.elementFromPoint(x, y);
                        if (el?.closest('.main-content') && !el.closest('a,button,input,textarea,select,label,img,table,pre,code,.katex-display')) return { x, y };
                    }
                }
                throw Error('There is no reading area for the touch');
            });
            await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
            return {
                move: dy => client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y - dy }] }),
                end: () => client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
                cancel: () => client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
            };
        }
        async function pull(distance) {
            const drag = await start();
            for (let i = 1; i <= 6; i++) await drag.move(distance * i / 6);
            await drag.end();
        }
        const preview = page.locator('.reader-pull-preview');
        const title = preview.locator('strong');
        await expect(current).toHaveAttribute('id', ids[0]);
        await scrollToBottom(page, 65);
        await pull(130);
        await expect(current).toHaveAttribute('id', ids[0]);
        const origin = await scrollToBottom(page);
        const partial = await start();
        await partial.move(30);
        await expect(title).toHaveText(await page.locator('.exp-reader-footer-next strong').innerText());
        const small = await title.boundingBox();
        await partial.move(80);
        expect((await title.boundingBox()).width).toBeGreaterThan(small.width);
        expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(origin + 30);
        await expect(current).toHaveAttribute('id', ids[0]);
        await partial.cancel();
        await expect(preview).toBeHidden();
        expect(Math.abs(await page.evaluate(() => window.scrollY) - origin)).toBeLessThan(3);

        const full = await start();
        await full.move(32);
        await full.move(78);
        await expect(current).toHaveAttribute('id', ids[0]);
        await full.move(110);
        await expect(current).toHaveAttribute('id', ids[1]);
        await full.move(145);
        await full.end();
        await expect(current).toHaveAttribute('id', ids[1]);
        await page.evaluate(last => window.experimentalReader.goToId(last), ids.at(-1));
        await scrollToBottom(page);
        await pull(115);
        await expect(preview).toBeHidden();
        await expect(current).toHaveAttribute('id', ids.at(-1));
    });
});
