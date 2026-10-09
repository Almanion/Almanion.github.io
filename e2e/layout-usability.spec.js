const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

for (const width of [320, 390, 430, 768, 1024, 1440]) {
    test(`home services and balanced cards at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
        await page.goto('/');
        await page.waitForFunction(() => !!window.AlmanionHomeDashboard);
        const services = page.locator('.home-additional-section');
        await expect(services.getByRole('link', { name: 'МатЦентр' })).toBeVisible();
        await expect(services.getByRole('link', { name: 'Ликбезы' })).toBeVisible();
        await expect(page.locator('#homeAdditionalEnglish')).toBeHidden();
        await page.locator('#gradeTab10').click();
        await page.waitForTimeout(450);
        const layout = await page.evaluate(() => {
            const r = el => el.getBoundingClientRect();
            const cards = [...document.querySelectorAll('#gradePanel10 > .subjects-grid > .subject-card')].map(r);
            const quick = r(document.querySelector('.home-quick-section'));
            const extra = r(document.querySelector('.home-additional-section'));
            const title = r(document.querySelector('#homeSubjectsTitle'));
            const tabs = r(document.querySelector('.grade-tabs'));
            return { overflow: document.documentElement.scrollWidth - innerWidth,
                cardY: cards.map(el => el.y), extraTop: extra.top, quickHeight: quick.height,
                toolbarOverlap: title.bottom - tabs.top,
                serviceY: [...document.querySelectorAll('.home-additional-grid > a:not([hidden])')].map(el => r(el).y),
                dutyBottom: r(document.querySelector('#homeDutyCard')).bottom };
        });
        expect(layout.overflow).toBeLessThan(2);
        if (width < 769) expect(layout.quickHeight).toBeLessThan(185);
        if (width > 1000) {
            expect(layout.toolbarOverlap).toBeLessThan(1);
            const settingsBounds = await page.locator('.settings-button').boundingBox();
            const headerBounds = await page.locator('.home-header').boundingBox();
            expect(settingsBounds.y).toBeGreaterThanOrEqual(headerBounds.y);
            expect(settingsBounds.y + settingsBounds.height).toBeLessThanOrEqual(headerBounds.y + headerBounds.height);
            expect(Math.abs(layout.cardY[0] - layout.cardY[1])).toBeLessThan(2);
            expect(Math.abs(layout.cardY[2] - layout.cardY[3])).toBeLessThan(2);
            expect(layout.dutyBottom).toBeLessThan(900);
            const duty = page.locator('#homeDutyCard');
            const bounds = await duty.boundingBox();
            const grid = await duty.locator('..').boundingBox();
            expect(bounds.width).toBeGreaterThan(grid.width - 2);
        } else {
            expect(layout.extraTop).toBeLessThan(layout.cardY[0]);
            expect(Math.abs(layout.serviceY[0] - layout.serviceY[1])).toBeLessThan(2);
        }
        for (const grade of ['9', '11', 'Archive']) {
            await page.locator('#gradeTab' + grade).click();
            await expect(services).toBeVisible();
        }
        await page.locator('#gradeTab10').click();
        await page.waitForTimeout(450);
        await page.screenshot({ path: info.outputPath('home.png'), fullPage: true });
    });

    test(`study body scrolls without covering actions at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
        await page.goto('/physics-10.html');
        await page.locator('#knowledgeCheckBtn').evaluate(el => el.click());
        await expect(page.locator('#kcSelectOverlay')).toBeVisible();
        await page.waitForTimeout(350);
        const layout = await page.locator('#kcSelectModal').evaluate(modal => {
            const body = modal.querySelector('.kc-select-scroll');
            const actions = modal.querySelector('.kc-actions');
            return { bodyBottom: body.getBoundingClientRect().bottom, actionTop: actions.getBoundingClientRect().top,
                bodyOverflow: body.scrollHeight - body.clientHeight,
                labelStyles: [...modal.querySelectorAll('.kc-type-name')].map(el => ({ whitespace: getComputedStyle(el).whiteSpace, overflow: el.scrollWidth - el.clientWidth })) };
        });
        expect(layout.bodyBottom).toBeLessThanOrEqual(layout.actionTop + 1);
        expect(layout.bodyOverflow).toBeGreaterThan(0);
        for (const style of layout.labelStyles) { expect(style.whitespace).toBe('normal'); expect(style.overflow).toBeLessThan(2); }
        await page.screenshot({ path: info.outputPath('study-top.png') });
        await page.locator('.kc-select-scroll').evaluate(el => el.scrollTop = el.scrollHeight);
        await expect(page.locator('[data-limit="all"]')).toBeInViewport();
        await expect(page.locator('#kcStart')).toBeInViewport();
        await page.screenshot({ path: info.outputPath('study-bottom.png') });
        if (width < 769) {
            await page.locator('.kc-select-scroll').evaluate(el => {
                for (const [type, y] of [['touchstart', 300], ['touchmove', 340], ['touchmove', 430], ['touchend', 430]]) {
                    el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: el, clientX: 100, clientY: y })] }));
                }
            });
            await page.waitForTimeout(300);
            await expect(page.locator('#kcSelectOverlay')).toBeVisible();
        }
    });
}

test('additional services survive a personalized quick access and English remains permission-gated', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.AlmanionHomeDashboard && window.AlmanionSettings?.ready);
    await page.evaluate(() => {
        window.AlmanionAccount = { getUser: () => ({ uid: 'layout-fixture' }), hasEnglishAccess: async () => false };
        dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user: { uid: 'layout-fixture' } } }));
    });
    await expect.poll(() => page.evaluate(() => window.AlmanionHomeDashboard.saveSelection(['russian-ege', 'duty-10-1']))).toBe(true);
    await expect(page.locator('#homeQuickGrid a')).toHaveCount(2);
    await expect(page.locator('.home-additional-section a[href="matcenter.html"]')).toBeVisible();
    await expect(page.locator('.home-additional-section a[href="likbez.html"]')).toBeVisible();
    await page.evaluate(() => {
        window.AlmanionAccount.hasEnglishAccess = async () => true;
        dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user: { uid: 'layout-fixture' } } }));
    });
    await expect(page.locator('#homeAdditionalEnglish')).toBeVisible();
    await page.evaluate(() => dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user: null } })));
    await expect(page.locator('#homeAdditionalEnglish')).toBeHidden();
});

test('five shortcuts and permanent services fit dark and legacy home layouts', async ({ page }, info) => {
    await page.goto('/');
    await page.waitForFunction(() => window.AlmanionHomeDashboard && window.AlmanionSettings?.ready);
    await page.evaluate(() => {
        window.AlmanionAccount = { getUser: () => ({ uid: 'layout-fixture' }), hasEnglishAccess: async () => false };
        dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user: { uid: 'layout-fixture' } } }));
    });
    await expect.poll(() => page.evaluate(() => window.AlmanionHomeDashboard.saveSelection(['physics-10', 'russian-ege', 'duty-10-1', 'likbez', 'matcenter']))).toBe(true);
    await page.evaluate(() => window.layoutQuickCard = document.querySelector('#homeQuickGrid a'));
    for (const experimental of [true, false]) for (const width of [390, 1024]) {
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(experimental => window.AlmanionSettings.update({ experimental, expMode: 'graphite', expTheme: 'dark', theme: 'dark' }), experimental);
        await expect(page.locator('#homeQuickGrid a')).toHaveCount(5);
        expect(await page.locator('#homeQuickGrid a').first().evaluate(el => el === window.layoutQuickCard)).toBe(true);
        await page.waitForTimeout(450);
        expect(await page.locator('#homeQuickGrid a').first().evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
        const labels = await page.locator('#homeQuickGrid h2').evaluateAll(elements => elements.map(el => ({
            whitespace: getComputedStyle(el).whiteSpace, overflow: el.scrollWidth - el.clientWidth
        })));
        for (const label of labels) { expect(label.whitespace).toBe('normal'); expect(label.overflow).toBeLessThan(2); }
        await expect(page.locator('.home-additional-section')).toBeVisible();
        const geometry = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth,
            cards: [...document.querySelectorAll('#homeQuickGrid a, .home-additional-grid a:not([hidden])')].map(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right })) }));
        expect(geometry.overflow).toBeLessThan(2);
        for (const card of geometry.cards) { expect(card.left).toBeGreaterThanOrEqual(0); expect(card.right).toBeLessThanOrEqual(width); }
        await page.screenshot({ path: info.outputPath(`home-${experimental ? 'new' : 'legacy'}-${width}.png`), fullPage: true });
    }
});

test('stress dictionary ignores obsolete generic block filters and retains search and study', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('note-block-filter:/russian-ege.html', '[]'));
    await page.goto('/russian-ege.html');
    await expect(page.locator('.accent-word-card').first()).toBeVisible();
    await expect(page.locator('.note-filter')).toHaveCount(0);
    await expect(page.locator('[data-note-filter-hidden]')).toHaveCount(0);
    await expect(page.locator('.nav-link[href="#stress-verbs"]')).toBeVisible();
    await page.locator('#searchInput').fill('вероисповедание');
    await expect(page.locator('#searchResultsPanel')).toContainText('вероисповЕдание');
    await page.locator('#knowledgeCheckBtn').click();
    await expect(page.locator('#kcTypeList [data-kind="stress"]')).toBeEnabled();
});

test('compact reading controls scale together, stick correctly and hide for printing', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/physics-10.html');
    await expect(page.locator('.note-reader-controls > .note-filter')).toBeAttached();
    expect(await page.locator('.definition-box').first().evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(350);
    await page.screenshot({ path: info.outputPath('reading.png') });
    await page.evaluate(() => scrollTo(0, 400));
    expect(await page.locator('.note-reader-controls').evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(2);
    await page.locator('[data-reader-action="next"]').first().click();
    await expect(page.locator('.topic.exp-reader-current')).toHaveAttribute('id', 'osnovnye-polozheniya-mkt');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.note-reader-controls')).toBeHidden();
});

test('duty months have visible navigation and selection preserves strip position and focus', async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/duty-10-1.html');
    await expect(page.locator('#dutyMonthsNext')).toBeVisible();
    await expect(page.locator('#dutyMonthsPrev')).toBeDisabled();
    await page.locator('#dutyMonthsNext').click();
    await expect.poll(() => page.locator('#dutyMonthFilters').evaluate(el => el.scrollLeft)).toBeGreaterThan(50);
    await expect(page.locator('#dutyMonthsPrev')).toBeEnabled();
    const months = page.locator('#dutyMonthFilters');
    const visibleMonth = await months.evaluate(el => {
        const r = el.getBoundingClientRect();
        return [...el.children].find(button => { const b = button.getBoundingClientRect(); return b.left >= r.left && b.right <= r.right; }).dataset.month;
    });
    const month = page.locator('[data-month="' + visibleMonth + '"]');
    await month.click();
    await expect(month).toBeFocused();
    await expect(month).toHaveAttribute('aria-pressed', 'true');
    expect(await months.evaluate(el => el.scrollLeft)).toBeGreaterThan(50);
    await months.evaluate(el => el.scrollLeft = el.scrollWidth);
    await expect(page.locator('#dutyMonthsNext')).toBeDisabled();
    await page.screenshot({ path: info.outputPath('duty.png') });
});
