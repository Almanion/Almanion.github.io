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

    await expect(page.locator('.home-header h1')).toContainText('Конспекты');
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

test('mobile note menu opens and closes without page overflow', async function ({ page }) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/physics.html', { waitUntil: 'domcontentloaded' });

    const mobileMenuButton = page.getByRole('navigation', { name: 'Быстрая навигация' })
        .getByRole('button', { name: 'Меню' });
    await expect(mobileMenuButton).toBeVisible();
    await mobileMenuButton.click();
    await expect(page.locator('#sidebar')).toHaveClass(/open/);
    await expect(page.locator('#sidebar')).toBeVisible();
    await page.locator('#closeSidebar').click();
    await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
    await expectNoHorizontalOverflow(page);
});

test('protected pages are complete in the assembled site', async function ({ request }) {
    const pages = [
        { route: '/matcenter.html', marker: 'МатЦентр 2025/2026' },
        { route: '/english.html', marker: 'Checking access…' }
    ];
    for (const entry of pages) {
        const response = await request.get(entry.route);
        expect(response.ok()).toBeTruthy();
        expect(await response.text()).toContain(entry.marker);
    }
});

test('class tour renders its offline-safe overview on desktop and mobile', async function ({ page }) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/tour-10-1.html', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Туристический слёт', level: 1 })).toBeVisible();
    await expect(page.getByText('Ориентирование', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Дима Петров', { exact: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('navigation', { name: 'Разделы страницы' })).toBeVisible();
    await expect(page.getByText('Озеро Уловное', { exact: true })).toBeVisible();
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
