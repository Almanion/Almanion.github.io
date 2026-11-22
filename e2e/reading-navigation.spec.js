'use strict';

const { test, expect } = require('@playwright/test');

const physics = '/physics-10.html';
const phrase = 'Универсальная газовая постоянная';
const gasLaws = 'izoprotsessy-gazovye-zakony';
const physicsUrl = id => physics + '#' + id;
const current = page => page.locator('.topic.exp-reader-current');

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

for (const origin of ['subject', 'home']) {
    test('search lands on the matching words from ' + origin, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(origin === 'home' ? '/' : physics);
        await page.locator(origin === 'home' ? '#homeSearchOpen' : '#expBottomNav [aria-label="Поиск"]').click();
        await page.locator('#searchInput').fill(phrase);
        const result = page.locator('.search-result-item').filter({ hasText: 'Изопроцессы. Газовые законы' }).first();
        await expect(result).toBeVisible();
        await result.click();
        await expect(current(page)).toHaveAttribute('id', gasLaws);
        await expect.poll(() => page.evaluate(() => {
            const hit = window.CSS.highlights.get('note-search-match')?.values().next().value;
            if (!hit) return null;
            const y = hit.getBoundingClientRect().top;
            const toolbar = document.querySelector('.note-reader-controls').getBoundingClientRect();
            return y >= toolbar.bottom && y < innerHeight * .55 ? hit.toString().toLowerCase() : null;
        })).toBe(phrase.toLowerCase());
    });
}

test('filtered arrows, preview and keyboard skip empty paragraphs in both directions', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('note-block-filter:/physics-10.html', '["experiment"]'));
    await page.clock.install();
    await page.goto(physicsUrl('raspredelenie-molekul-po-skorostyam'));
    const next = page.locator('.exp-reader-footer-next');
    await expect(next).toContainText('Количество теплоты');
    await page.clock.pauseAt(new Date(Date.now() + 2000));
    await page.evaluate(() => scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'instant' }));
    const box = await current(page).boundingBox();
    await page.mouse.move(box.x + 20, Math.min(500, (await page.viewportSize()).height - 140));
    await page.mouse.wheel(0, 60);
    await expect(page.locator('.reader-pull-preview')).toContainText('Количество теплоты');
    for (let step = 0; step < 4; step++) {
        await page.clock.runFor(16);
        await page.mouse.wheel(0, 100);
    }
    await expect(current(page)).toHaveAttribute('id', 'kolichestvo-teploty-pervoe-nachalo');
    await page.clock.resume();
    await page.keyboard.press('ArrowLeft');
    await expect(current(page)).toHaveAttribute('id', 'raspredelenie-molekul-po-skorostyam');
    await page.locator('.exp-reader-toolbar [data-reader-action="next"]').click();
    await expect(current(page)).toHaveAttribute('id', 'kolichestvo-teploty-pervoe-nachalo');
});

test('a shared search link reveals its words inside an excluded block without changing the saved filter', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('note-block-filter:/physics-10.html', '[]'));
    await page.goto(physics + '?find=' + encodeURIComponent(phrase) + '#' + gasLaws);
    await expect(current(page)).toHaveAttribute('id', gasLaws);
    await expect.poll(() => page.evaluate(() => {
        const hit = CSS.highlights.get('note-search-match')?.values().next().value;
        const rect = hit?.getBoundingClientRect();
        return rect?.height > 0 && rect.top > 0 && rect.top < innerHeight / 2;
    })).toBe(true);
    await expect(page.locator('.note-filter input:checked')).toHaveCount(0);
    await expect(current(page).locator('.note-filter-empty')).toBeHidden();
});

test('back and forward restore the selected topic and reading position', async ({ page }) => {
    await page.goto(physicsUrl(gasLaws));
    await expect(current(page)).toHaveAttribute('id', gasLaws);
    await page.waitForFunction(() => window.AlmanionPersonalNotes);
    await page.mouse.move(850, 450);
    await expect.poll(async () => {
        await page.mouse.wheel(0, 460);
        return page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(scrollY)))));
    }).toBeGreaterThan(1200);
    const position = await page.evaluate(() => scrollY);
    const nav = page.locator('#sidebar .nav-link');
    await nav.filter({ hasText: 'Закон Дальтона' }).click();
    await expect(current(page)).toHaveAttribute('id', 'zakon-daltona');
    await nav.filter({ hasText: 'Энтропия. Закон' }).click();
    await page.goBack();
    await expect(current(page)).toHaveAttribute('id', 'zakon-daltona');
    await page.goBack();
    await expect(current(page)).toHaveAttribute('id', gasLaws);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(position, -1);
    await page.goForward();
    await expect(current(page)).toHaveAttribute('id', 'zakon-daltona');
});

for (const width of [390, 820]) {
    test('contents opens at the current topic with three compact tools at ' + width, async ({ page }) => {
        await page.setViewportSize({ width, height: 850 });
        await page.goto(physicsUrl('entropiya'));
        await expect(current(page)).toHaveAttribute('id', 'entropiya');
        const opener = width === 820 ? page.locator('.exp-reader-topic') : page.locator('#expBottomNav [aria-label="Меню"]');
        if (width === 820) await expect(opener).toContainText('Энтропия');
        await opener.click();
        const sidebar = page.locator('#sidebar');
        const entry = sidebar.locator('.nav-link[aria-current="location"]');
        await expect(entry).toHaveAttribute('href', '#entropiya');
        await expect(entry).toBeInViewport({ ratio: .99 });
        const room = await entry.evaluate(el => {
            const menu = el.closest('.nav-menu').getBoundingClientRect(), link = el.getBoundingClientRect();
            return Math.min(link.top - menu.top, menu.bottom - link.bottom);
        });
        expect(room).toBeGreaterThan(25);
        await expect(sidebar.locator('.print-export-menu-slot button')).toHaveCount(3);
        const boxes = await sidebar.locator('.print-export-menu-slot button').evaluateAll(nodes => nodes.map(el => el.getBoundingClientRect().toJSON()));
        expect(Math.max(...boxes.map(r => r.y)) - Math.min(...boxes.map(r => r.y))).toBeLessThan(2);
        expect(boxes.every(r => r.height >= 40 && r.height < 58)).toBe(true);
    });
}

test('methane headings avoid actions and the entire inline diagram opens and zooms', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/chemistry-10.html#stroenie-metana');
    await page.waitForFunction(() => window.AlmanionPersonalNotes);
    const titles = current(page).locator('.chem-block-title');
    for (const heading of await titles.all()) {
        const fits = await heading.evaluate(el => {
            const rect = el.getBoundingClientRect();
            const icons = el.parentElement.querySelectorAll(':scope > :is(.copy-block-btn,.personal-note-btn,.bookmark-btn)');
            return [...icons].every(icon => rect.right <= icon.getBoundingClientRect().left + 1 || rect.top >= icon.getBoundingClientRect().bottom);
        });
        expect(fits).toBe(true);
    }
    const svg = current(page).locator('figure svg').first();
    await expect(svg).toHaveAttribute('aria-haspopup', 'dialog');
    await svg.click();
    const image = page.locator('#lightboxOverlay.open img');
    await expect(image).toBeVisible();
    expect(await image.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
    expect((await image.boundingBox()).width).toBeLessThanOrEqual(360);
    await image.dblclick();
    await expect.poll(() => image.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)).toBeGreaterThan(2);
    await page.keyboard.press('Escape');
    await expect(svg).toBeFocused();
});

test('proportional text fits 80 characters per line while diagrams keep their space', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(physics);
    await page.waitForFunction(() => window.AlmanionNoteFilter && document.querySelector('script[src^="reader-measure"]'));
    const sample = current(page).locator('[data-measure-fixture]');
    await current(page).evaluate(topic => {
        const text = document.createElement('p');
        text.dataset.measureFixture = '';
        text.textContent = 'три или пять линий '.repeat(65);
        const wide = document.createElement('p');
        wide.innerHTML = '<svg viewBox="0 0 900 40" aria-label="схема"></svg>';
        topic.append(text, wide);
        window.dispatchEvent(new CustomEvent('almanion:content-ready', { detail: { root: topic } }));
    });
    await sample.scrollIntoViewIfNeeded();
    await expect.poll(() => sample.evaluate(el => {
        const lines = new Map(), text = el.firstChild, range = document.createRange();
        for (let i = 0; i < text.length; i++) {
            range.setStart(text, i); range.setEnd(text, i + 1);
            const y = range.getBoundingClientRect().top;
            lines.set(y, (lines.get(y) || '') + text.data[i]);
        }
        return Math.max(...[...lines.values()].map(line => line.trim().length));
    })).toBeLessThanOrEqual(80);
    expect(await sample.evaluate(el => getComputedStyle(el.nextElementSibling).maxInlineSize)).toBe('none');
});
