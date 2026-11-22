'use strict';

const { test, expect } = require('@playwright/test');

async function blockThirdParty(page) {
    await page.route('**/*', function (route) {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') route.continue();
        else route.abort('blockedbyclient');
    });
}

async function expectNoHorizontalOverflow(page) {
    const overflow = await page.evaluate(function () {
        return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
}

test.beforeEach(async function ({ page }) {
    await blockThirdParty(page);
    await page.addInitScript(function () {
        localStorage.setItem('siteSettings', JSON.stringify({
            experimental: true,
            expMode: 'prism',
            expDark: false,
            animationLevel: 'all',
            haptics: true
        }));
    });
});

test('home page switches grades without losing its layout', async function ({ page }) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.home-header h1')).toContainText('Almanion');
    await expect(page.locator('.home-quick-section')).toBeVisible();
    await expect(page.locator('#homeQuickGrid .home-quick-card[href="russian-ege.html"]')).toBeVisible();
    await expect(page.locator('#homeQuickGrid .home-quick-card[href="duty-10-1.html"]')).toBeVisible();
    await expect(page.locator('.home-additional-grid [href="matcenter.html"]')).toBeVisible();
    await expect(page.locator('.home-additional-grid [href="likbez.html"]')).toBeVisible();
    const quickBounds = await page.locator('.home-quick-section').boundingBox();
    const subjectsBounds = await page.locator('.subjects-section').boundingBox();
    expect(quickBounds).not.toBeNull();
    expect(subjectsBounds).not.toBeNull();
    expect(quickBounds.y).toBeLessThan(subjectsBounds.y);
    await expect(page.locator('#gradeTab10')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#gradePanel10')).toBeVisible();
    await page.locator('#gradeTab9').click();
    await expect(page.locator('#gradeTab9')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#gradePanel9')).toBeVisible();
    await expect(page.locator('#gradePanel10')).toBeHidden();
    await expect(page.locator('#gradePanel9 .subject-card').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
});

test('note page renders first and loads the PDF interface on demand', async function ({ page }) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/physics.html', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.page-header h1')).toHaveText('Физика');
    await expect(page.locator('.content-section').first()).toBeVisible();
    await page.evaluate(function () { return window.AlmanionNoteRuntime.ensure('print'); });
    await expect(page.locator('#printExportButton')).toBeVisible();
    await page.locator('#printExportButton').click();
    await expect(page.locator('#printExportDialog')).toBeVisible();
    await expect(page.locator('#printExportDownload')).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.locator('#printExportDialog')).toBeHidden();
    await expectNoHorizontalOverflow(page);
});

test('note sidebar keeps study action icons compact', async function ({ page }) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/physics-10.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(function () { return window.AlmanionNoteRuntime.ensure('knowledge'); });

    const button = page.locator('#knowledgeCheckBtn');
    const icon = button.locator('.btn-icon');
    await expect(button).toBeVisible();
    await expect(icon).toBeVisible();

    const buttonBox = await button.boundingBox();
    const iconBox = await icon.boundingBox();
    expect(buttonBox.height).toBeLessThanOrEqual(52);
    expect(iconBox.width).toBeLessThanOrEqual(18);
    expect(iconBox.height).toBeLessThanOrEqual(18);
    await expectNoHorizontalOverflow(page);
});

test('knowledge check stays closed until requested and opens as an overlay', async function ({ page }) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/physics-10.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(function () { return window.AlmanionNoteRuntime.ensure('knowledge'); });

    const selectOverlay = page.locator('#kcSelectOverlay');
    const reviewOverlay = page.locator('#kcReviewOverlay');
    await expect(selectOverlay).toBeHidden();
    await expect(reviewOverlay).toBeHidden();

    await page.locator('#knowledgeCheckBtn').click();
    await expect(selectOverlay).toBeVisible();
    const geometry = await selectOverlay.evaluate(function (element) {
        const bounds = element.getBoundingClientRect();
        return {
            position: getComputedStyle(element).position,
            top: Math.round(bounds.top),
            bottom: Math.round(bounds.bottom),
            viewport: window.innerHeight
        };
    });
    expect(geometry).toEqual({ position: 'fixed', top: 0, bottom: 800, viewport: 800 });

    await page.locator('#kcSelectClose').click();
    await expect(selectOverlay).toBeHidden();
    await expectNoHorizontalOverflow(page);
});

test('bookmarks stay usable offline and behave as a responsive library', async function ({ page }) {
    await page.addInitScript(function () {
        localStorage.removeItem('almanion_bookmarks');
        localStorage.removeItem('almanion_bookmarks_guest');
    });
    await page.setViewportSize({ width: 1360, height: 820 });
    await page.goto('/physics-10.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(function () { return window.AlmanionNoteRuntime.ensure('bookmarks'); });
    await page.evaluate(function () {
        window.dispatchEvent(new CustomEvent('almanion:content-ready', { detail: { root: document } }));
    });

    const sourceButtons = page.locator('.main-content .bookmark-btn');
    await expect(sourceButtons.first()).toBeVisible();
    await page.evaluate(function () {
        Array.from(document.querySelectorAll('.main-content .bookmark-btn')).slice(0, 3).forEach(function (button) {
            button.click();
        });
    });
    await expect(sourceButtons.nth(0)).toHaveClass(/bookmarked/);
    const blockActionGeometry = await sourceButtons.first().evaluate(function (bookmark) {
        const block = bookmark.closest('.copyable-block');
        const copy = block && block.querySelector(':scope > .copy-block-btn');
        if (!block || !copy) return null;
        const bookmarkRect = bookmark.getBoundingClientRect();
        const copyRect = copy.getBoundingClientRect();
        return {
            topDelta: Math.abs(bookmarkRect.top - copyRect.top),
            gap: Math.round(bookmarkRect.left - copyRect.right)
        };
    });
    expect(blockActionGeometry).not.toBeNull();
    // The hidden copy control rests 2px higher and settles onto the same row on hover.
    expect(blockActionGeometry.topDelta).toBeLessThanOrEqual(2);
    expect(blockActionGeometry.gap).toBeGreaterThanOrEqual(4);
    expect(await page.evaluate(function () {
        return localStorage.getItem('almanion_bookmarks_guest') || '';
    })).toContain('__b__');

    const openButton = page.locator('#bookmarksBtn');
    await expect(openButton).toBeVisible();
    await openButton.click();
    await expect(page.locator('#bookmarksOverlay')).toBeVisible();
    await expect(page.locator('.bm-card')).toHaveCount(3);
    await page.waitForTimeout(300);
    const panelGeometry = await page.locator('#bookmarksModal').evaluate(function (element) {
        const bounds = element.getBoundingClientRect();
        return { right: Math.round(bounds.right), viewport: innerWidth, height: Math.round(bounds.height) };
    });
    expect(panelGeometry.right).toBe(panelGeometry.viewport);
    expect(panelGeometry.height).toBe(820);

    const orderBeforeDrag = await page.locator('#bookmarksList > .bm-card').evaluateAll(function (cards) {
        return cards.map(function (card) { return card.dataset.bmId; });
    });
    const dragHandle = page.locator('#bookmarksList > .bm-card .bm-drag-handle').first();
    const dragBounds = await dragHandle.boundingBox();
    const lastBounds = await page.locator('#bookmarksList > .bm-card').last().boundingBox();
    await page.mouse.move(dragBounds.x + dragBounds.width / 2, dragBounds.y + dragBounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(lastBounds.x + lastBounds.width / 2, lastBounds.y + lastBounds.height - 4, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#bookmarksList > .bm-card')).toHaveCount(3);
    const orderAfterDrag = await page.locator('#bookmarksList > .bm-card').evaluateAll(function (cards) {
        return cards.map(function (card) { return card.dataset.bmId; });
    });
    expect(new Set(orderAfterDrag).size).toBe(3);
    expect(orderAfterDrag).not.toEqual(orderBeforeDrag);
    await page.waitForTimeout(650);
    await expect(page.locator('#bookmarksList > .bm-card')).toHaveCount(3);

    const firstTitle = await page.locator('.bm-card-copy strong').first().textContent();
    await page.locator('#bookmarksSearch').fill(firstTitle.slice(0, 8));
    await expect.poll(async function () { return page.locator('.bm-card').count(); }).toBeLessThan(3);
    expect(await page.locator('.bm-card').count()).toBeGreaterThan(0);
    await page.locator('.bookmarks-search-clear').click();
    await expect(page.locator('.bm-card')).toHaveCount(3);

    await page.locator('.bm-card-delete').first().click();
    await expect(page.locator('.bm-card')).toHaveCount(2);
    await expect(page.locator('#bookmarksUndo')).toBeVisible();
    await page.locator('#bookmarksUndo button').click();
    await expect(page.locator('.bm-card')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await expect(page.locator('#bookmarksOverlay')).toBeHidden();
    await expect(openButton).toBeFocused();

    await sourceButtons.nth(0).click();
    await expect(sourceButtons.nth(0)).not.toHaveClass(/bookmarked/);
    expect(await sourceButtons.nth(0).locator('.bookmark-icon').evaluate(function (icon) {
        return getComputedStyle(icon).fill;
    })).toBe('none');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#expBottomNav .exp-bn-item[aria-label="Закладки"]').click();
    await expect(page.locator('#bookmarksOverlay')).toBeVisible();
    await page.waitForTimeout(300);
    const mobileGeometry = await page.locator('#bookmarksModal').evaluate(function (element) {
        const bounds = element.getBoundingClientRect();
        return { left: Math.round(bounds.left), bottom: Math.round(bounds.bottom), width: Math.round(bounds.width) };
    });
    expect(mobileGeometry).toEqual({ left: 0, bottom: 844, width: 390 });
    await expectNoHorizontalOverflow(page);
});

test('the mobile Menu button toggles the drawer without a separate close icon', async function ({ page }) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/physics.html', { waitUntil: 'domcontentloaded' });

    const mobileMenuButton = page.getByRole('navigation', { name: 'Быстрая навигация' })
        .getByRole('button', { name: 'Меню' });
    await expect(mobileMenuButton).toBeVisible();
    await mobileMenuButton.click();
    await expect(page.locator('#sidebar')).toHaveClass(/open/);
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('#closeSidebar')).toHaveCount(0);
    await expect(mobileMenuButton).toHaveAttribute('aria-expanded', 'true');
    await mobileMenuButton.click();
    await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
    await expect(mobileMenuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(mobileMenuButton).toBeFocused();
    await expectNoHorizontalOverflow(page);
});

test('protected pages are complete in the assembled site', async function ({ request }) {
    const pages = [
        { route: '/matcenter.html', marker: 'Матцентр' },
        { route: '/english.html', marker: 'Checking access…' },
        { route: '/planner.html', marker: 'Планировщик доступен только владельцу' },
        { route: '/sport.html', marker: 'Дневник доступен только владельцу' }
    ];
    for (const entry of pages) {
        const response = await request.get(entry.route);
        expect(response.ok()).toBeTruthy();
        expect(await response.text()).toContain(entry.marker);
    }
});

test('class tour renders its next event and content on desktop and mobile', async function ({ page }) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/tour-10-1.html', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Туристический слёт', level: 1 })).toBeVisible();
    await expect(page.getByText('Ориентирование', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Дима Петров', { exact: true }).first()).toBeVisible();
    await expect(page.locator('#next-event')).toBeVisible();
    await expect(page.locator('#tourNextEventTitle')).toBeVisible();
    await expect(page.locator('#overview')).toHaveCount(0);
    await page.locator('#tourPersonSearch').fill('Петров');
    await expect(page.locator('body')).toHaveClass(/tour-filtering/);
    await expect(page.locator('#tourPersonSearchStatus')).toContainText('Найдено:');
    await expect(page.locator('.tour-activity-card').first()).toBeVisible();
    expect((await page.locator('.tour-activity-card').allTextContents()).every(function (text) {
        return text.includes('Дима Петров');
    })).toBeTruthy();
    await page.locator('#tourPersonSearchClear').click();
    await expect(page.locator('body')).not.toHaveClass(/tour-filtering/);
    await expect(page.locator('.tour-hero')).toBeVisible();
    const lightBackground = await page.locator('body').evaluate(function (body) { return getComputedStyle(body).backgroundColor; });
    await page.locator('#settingsButtonSidebar').click();
    await page.locator('[data-exp-theme="dark"]').click();
    await expect(page.locator('body')).toHaveClass(/exp-dark/);
    await expect.poll(function () {
        return page.locator('body').evaluate(function (body) { return getComputedStyle(body).backgroundColor; });
    }).not.toBe(lightBackground);
    await page.keyboard.press('Escape');
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('navigation', { name: 'Разделы страницы' })).toBeVisible();
    await expect(page.locator('#tourNextEventCard')).toBeVisible();
    await expect(page.locator('#tourNextEventMeta')).not.toHaveText('');
    await expectNoHorizontalOverflow(page);
    expect(await page.locator('.tour-section-nav').evaluate(function (nav) { return nav.scrollWidth <= nav.clientWidth + 1; })).toBeTruthy();

    await page.evaluate(function () {
        const overlay = document.getElementById('tourEditorOverlay');
        overlay.hidden = false;
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('tour-modal-open');
    });
    const closeBounds = await page.locator('#tourEditorClose').boundingBox();
    const footerBounds = await page.locator('.tour-editor-footer').boundingBox();
    expect(closeBounds).not.toBeNull();
    expect(footerBounds).not.toBeNull();
    expect(closeBounds.x + closeBounds.width).toBeLessThanOrEqual(390);
    expect(footerBounds.y + footerBounds.height).toBeLessThanOrEqual(844);
});

test('Matcenter keeps LaTeX rendering in its core runtime', async function ({ page }) {
    await page.goto('/matcenter.html', { waitUntil: 'domcontentloaded' });
    await expect.poll(async function () {
        return page.evaluate(function () { return typeof window.renderLatexInElement; });
    }).toBe('function');

    const result = await page.evaluate(function () {
        let receivedOptions = null;
        window.renderMathInElement = function (element, options) {
            receivedOptions = options;
            element.textContent = 'rendered';
        };
        const element = document.createElement('div');
        element.id = 'matcenterLatexSmoke';
        element.textContent = 'Решите $x^2=4$';
        document.body.appendChild(element);
        const rendered = window.renderLatexInElement(element);
        return {
            rendered,
            marked: element.dataset.latexRendered,
            delimiters: receivedOptions && receivedOptions.delimiters.length
        };
    });

    expect(result).toEqual({ rendered: true, marked: 'true', delimiters: 4 });
});
