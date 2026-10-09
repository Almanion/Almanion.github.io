'use strict';
const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});
async function select(page, text) {
    await page.evaluate(text => {
        let el = document.getElementById('definition-selection-fixture');
        if (!el) { el = document.createElement('p'); el.id = 'definition-selection-fixture'; document.querySelector('.topic.exp-reader-current').prepend(el); }
        el.textContent = text; el.scrollIntoView({ block: 'center' });
        const range = document.createRange(); range.selectNodeContents(el);
        const selected = getSelection(); selected.removeAllRanges(); selected.addRange(range);
    }, text);
}

test('older WebViews recover from one failed dictionary request', async ({ page }) => {
    await page.addInitScript(() => { AbortSignal.timeout = undefined; });
    let attempts = 0;
    await page.route('**/definition-index.json*', async route => {
        attempts++;
        if (attempts === 1) await route.fulfill({ status: 503, body: 'Temporary failure' });
        else await route.continue();
    });
    await page.goto('/physics-10.html');
    await expect(page.locator('.topic.exp-reader-current')).toBeVisible();
    await select(page, 'Эллипс');
    await expect(page.locator('.selection-definition-popover .definition-box').first()).toContainText(/эллипс/i);
    expect(attempts).toBe(2);
    expect(await page.evaluate(() => !!localStorage.getItem(AlmanionDefinitions.INDEX_CACHE_KEY))).toBe(true);
    await page.reload();
    await page.route('**/definition-index.json*', route => route.abort());
    await select(page, 'Эллипс');
    await expect(page.locator('.selection-definition-popover .definition-box').first()).toContainText(/эллипс/i);
});

test('retry retains the selected word even when clicking the button clears native selection', async ({ page }) => {
    let offline = true;
    await page.route('**/definition-index.json*', route => offline ? route.abort() : route.continue());
    await page.goto('/physics-10.html');
    await expect(page.locator('.topic.exp-reader-current')).toBeVisible();
    await select(page, 'Эллипс');
    const popup = page.locator('.selection-definition-popover');
    await expect(popup).toContainText('Словарь сайта пока недоступен');
    await page.evaluate(() => getSelection().removeAllRanges());
    offline = false;
    await popup.getByRole('button', { name: 'Повторить поиск' }).click();
    await expect(popup.locator('.definition-box').first()).toContainText(/эллипс/i);
    expect(await page.evaluate(() => getSelection().toString())).toBe('Эллипс');
});

test('local definitions appear immediately while the shared dictionary is slow', async ({ page }) => {
    await page.route('**/definition-index.json*', () => {});
    await page.goto('/physics-10.html');
    await expect(page.locator('.topic.exp-reader-current')).toBeVisible();
    await select(page, 'Молекулярная физика');
    await expect(page.locator('.selection-definition-popover .definition-box').first()).toContainText('Молекулярная физика');
});

for (const width of [320, 390, 1440]) {
    test(`selected word opens a cross-site definition at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
        const requests = [];
        page.on('request', request => { if (request.url().includes('definition-index.json')) requests.push(request.url()); });
        await page.goto('/physics-10.html');
        await expect(page.locator('.topic.exp-reader-current')).toBeVisible();
        expect(requests).toHaveLength(0);
        await select(page, 'Эллипс');
        const popup = page.locator('.selection-definition-popover');
        await expect(popup).toBeVisible();
        await expect(popup.locator('.definition-box').first()).toContainText(/эллипс/i);
        await expect(popup.locator('[data-definition-source]').first()).toHaveAttribute('href', /geometry.*\.html#/);
        const bounds = await popup.boundingBox();
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(width === 320 ? 568 : 900);
        expect(await page.evaluate(() => getSelection().toString())).toBe('Эллипс');
        await page.screenshot({ path: info.outputPath('definition.png') });
        await page.keyboard.press('Escape');
        await expect(popup).toBeHidden();
        await page.waitForTimeout(1100);
        await select(page, 'несуществующийтермин');
        await expect(popup).toContainText('Определение не найдено на сайте');
        expect(requests).toHaveLength(1);
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user: null } })));
        await expect(popup).toBeVisible();
        await page.evaluate(() => {
            document.body.classList.add('english-page');
            window.dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user: null } }));
        });
        await expect(popup).toBeHidden();
        await page.emulateMedia({ media: 'print' });
        await expect(popup).toBeHidden();
    });
}

test('word search reveals its subsection and direct nested links survive reload', async ({ page }) => {
    await page.goto('/russian-ege.html');
    await page.locator('.nav-link[href="#stress-verbs"]').click();
    await expect(page.locator('#stress-verbs')).toHaveClass(/exp-reader-current/);
    await page.locator('#searchInput').fill('жалюзи');
    await page.locator('.search-result-item').click();
    await expect(page.locator('#stress-nouns')).toHaveClass(/exp-reader-current/);
    await expect(page.locator('#stress-055')).toBeVisible();
    await expect(page).toHaveURL(/#stress-055$/);
    await page.reload();
    await expect(page.locator('#stress-nouns')).toHaveClass(/exp-reader-current/);
    await expect(page.locator('#stress-055')).toBeVisible();
});

test('inflected selections prefer the full definition over literal words inside compound terms', async ({ page }) => {
    await page.goto('/physics-10.html');
    await expect(page.locator('.topic.exp-reader-current')).toBeVisible();
    const popup = page.locator('.selection-definition-popover');
    for (const [query, term] of [['молекулы', 'Молекула'], ['силы', 'Сила'], ['механического движения', 'Механическое движение']]) {
        await select(page, query);
        await expect(popup.locator('.definition-box')).toHaveCount(1);
        await expect(popup.locator('.definition-box strong').first()).toHaveText(term);
        expect(await page.evaluate(() => getSelection().toString())).toBe(query);
    }
});

test('duty starts on the current month, preserves whole-year access and searches across months', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-04T12:00:00+03:00') });
    await page.goto('/duty-10-1.html');
    await expect(page.locator('.duty-month-filter.is-active')).toHaveAttribute('data-month', '2026-10');
    await expect(page.locator('.duty-month-title')).toHaveText('Октябрь 2026');
    await page.locator('[data-month="all"]').click();
    await expect(page.locator('.duty-month-title')).toHaveCount(9);
    await page.locator('[data-month="2026-10"]').click();
    await page.locator('#dutySearchInput').fill('Близнец');
    expect(await page.locator('.duty-month-title').count()).toBeGreaterThan(1);
});

test('small-screen filters scroll internally at 125% scale and native selection is enabled', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto(test.info().project.use.baseURL + '/physics-10.html');
    await page.waitForFunction(() => window.AlmanionSettings?.ready);
    await page.evaluate(() => AlmanionSettings.update({ noteScale: 125 }));
    await page.locator('.note-filter summary').click();
    expect(await page.locator('.note-reader-controls').evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(360);
    const options = page.locator('.note-filter-options');
    expect(await options.evaluate(el => getComputedStyle(el).overflowY)).toBe('auto');
    expect(await options.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    const block = page.locator('.copyable-block').first();
    expect(await block.evaluate(el => getComputedStyle(el).userSelect)).toBe('text');
    const buttons = await block.locator(':scope > button').evaluateAll(nodes => nodes.map(el => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height, left: r.left, right: r.right }; }));
    for (const button of buttons) { expect(button.width).toBeGreaterThanOrEqual(44); expect(button.height).toBeGreaterThanOrEqual(44); }
    const ordered = buttons.sort((a,b) => a.left-b.left);
    for (let i=1;i<ordered.length;i++) expect(ordered[i].left).toBeGreaterThanOrEqual(ordered[i-1].right - 1);
    await context.close();
});
