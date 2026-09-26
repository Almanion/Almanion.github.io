'use strict';
const { test, expect } = require('@playwright/test');
const model = require('../matcenter/35-workspace-model.js');
test.use({ serviceWorkers: 'block' });
const legacy = Array.from({ length: 130 }, (_, i) => ({ number: i + 1, grade: 'grade-9',
    description: `Условие задачи ${i + 1}: найдите радиус окружности. $x^2=4$.`, hint: 'Закрытая подсказка', status: 'Н' }));
const future = [1, 2].flatMap(s => [1, 2, 12].map(number => ({ number, grade: 'grade-10',
    description: `Будущая задача ${number}: две окружности.`, hint: 'Не открывать автоматически', status: 'Н',
    taskId: `new-${s}-${number}`, seriesId: `2026-${s}`, seriesTitle: `Серия ${s}. Геометрия`, seriesDate: `2026-09-${25 + s}` })));
const summer = [{ number: 1, description: 'Летняя задача', grade: 'grade-summer-9-10' }];

async function setup(page, options = {}) {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'script.google.com') {
            const data = JSON.parse(route.request().postData() || '{}');
            const tasks = url.pathname.includes('AKfycbw_') ? summer : [...legacy, ...future];
            return route.fulfill({ json: data.action === 'capabilities' ? { success: true, authVersion: 3 }
                : data.action === 'accessStatus' ? { success: true, allowed: options.allowed !== false, isAdmin: false }
                : { success: true, tasks, isAdmin: false } });
        }
        if (['127.0.0.1', 'localhost'].includes(url.hostname)) {
            if (/\/(account|firebase-analytics|analytics)\.js$/.test(url.pathname)) return route.fulfill({ contentType: 'application/javascript', body: '' });
            return route.continue();
        }
        return route.abort();
    });
    await page.addInitScript(({ home, dark, old }) => {
        if (!sessionStorage.getItem('mc-test-initialized')) {
            localStorage.setItem('almanion:visual-defaults:2026-09-05-v1', '1');
            localStorage.setItem('siteSettings', JSON.stringify({ experimental: !old, theme: dark ? 'dark' : 'light', expTheme: dark ? 'dark' : 'light', expMode: 'prism', expDark: !!dark, animationLevel: 'off' }));
            if (home) localStorage.setItem('homeGrade', home);
            sessionStorage.setItem('mc-test-initialized', '1');
        }
        const user = { uid: 'mc-test', email: 'test@example.com', getIdToken: async () => 'test-token' };
        const auth = { currentUser: user, onAuthStateChanged(callback) { setTimeout(() => callback(user), 0); return () => {}; } };
        let data = JSON.parse(localStorage.getItem('mc-test-remote') || '{"grade-9__12":{"solved":true,"updatedAt":1}}');
        const callbacks = new Set();
        const snapshot = () => ({ val: () => data });
        const ref = { once: async () => snapshot(), on(_event, callback) { callbacks.add(callback); setTimeout(() => callback(snapshot()), 0); },
            off() { callbacks.clear(); }, async update(patch) { Object.assign(data, patch); localStorage.setItem('mc-test-remote', JSON.stringify(data)); callbacks.forEach(c => c(snapshot())); },
            child(key) { return { once: async () => ({ val: () => data[key] }), set: async value => ref.update({ [key]: value }) }; } };
        const database = () => ({ ref: () => ref });
        database.ServerValue = { TIMESTAMP: 1 };
        const authFactory = () => auth;
        authFactory.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } };
        auth.setPersistence = async () => {};
        window.firebase = { apps: [{}], app: () => ({ options: {} }), initializeApp() {}, auth: authFactory, database };
        window.renderMathInElement = el => { el.dataset.mathChecked = 'true'; };
    }, options);
    return errors;
}
async function ready(page) {
    await expect(page.locator('#authOverlay')).toBeHidden();
    await expect(page.locator('#tasksContainer .task-card').first()).toBeVisible();
}

test('compact layout, opt-in series, legacy progress, reading and exact archive search', async ({ page }, info) => {
    const errors = await setup(page);
    await page.setViewportSize({ width: 1440, height: 950 });
    await page.goto('/matcenter.html');
    await ready(page);
    await expect(page.locator('h1')).toHaveText('Матцентр');
    await expect(page.locator('#gradeSwitcher [data-grade="grade-10"]')).toHaveClass(/active/);
    await expect(page.locator('#mcSeriesRow')).toBeVisible();
    await expect(page.locator('#mcSeriesSelect option')).toHaveCount(3);
    await page.locator('#mcSeriesSelect').selectOption(JSON.stringify(['grade-10', 0, '2026-1']));
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(3);
    await expect(page.locator('#solvedTotal')).toHaveText('3');
    await page.locator('[data-mc-view="reading"]').click();
    await expect(page.locator('#tasksContainer .task-card.open')).toHaveCount(3);
    await expect(page.locator('#tasksContainer .task-description').first()).toHaveAttribute('data-math-checked', 'true');
    await expect(page.locator('#tasksContainer .hint-toggle').first()).toHaveAttribute('aria-expanded', 'false');
    await page.locator('[data-mc-view="compact"]').click();
    await expect(page.locator('#tasksContainer .task-card.open')).toHaveCount(0);
    await page.locator('#searchInput').fill('№12');
    await page.locator('#mcSearchScope').selectOption('archive');
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(3);
    await expect(page.locator('#tasksContainer .mc-task-context').first()).toBeVisible();
    expect(await page.locator('#tasksContainer .task-number-label').allTextContents()).toEqual(['Задача 12', 'Задача 12', 'Задача 12']);
    expect(await page.locator('#tasksContainer [id]').evaluateAll(nodes => new Set(nodes.map(n => n.id)).size === nodes.length)).toBe(true);
    await page.locator('#searchInput').fill('неттакогословавзадачах');
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(0);
    await expect(page.locator('.no-results-message')).toBeVisible();
    await page.locator('.no-results-clear').click();
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(3);
    await page.locator('#gradeSwitcher [data-grade="grade-9"]').click();
    await expect(page.locator('#mcSeriesRow')).toBeHidden();
    await page.locator('#searchInput').fill('12');
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(3); // archive scope persists
    await page.locator('#mcSearchScope').selectOption('section');
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(1);
    await expect(page.locator('#tasksContainer .task-solved-check')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#tasksContainer .task-solved-check').click();
    await expect(page.locator('#tasksContainer .task-solved-check')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#searchInput').fill('окружность');
    await expect(page.locator('#mcResultSummary')).toContainText('130');
    await page.locator('#gradeSwitcher [data-grade="grade-10"]').click();
    await page.screenshot({ path: info.outputPath('desktop.png') });
    expect(errors).toEqual([]);
});

test('deep link loads paginated task and restores position after reload', async ({ page }) => {
    const errors = await setup(page);
    const target = model.identity({ ...legacy[0], numberText: '1' });
    await page.goto('/matcenter.html?' + new URLSearchParams({ grade: 'grade-9', task: target, view: 'reading' }));
    const card = page.locator('.task-card').filter({ has: page.locator('.task-number-label', { hasText: /^Задача 1$/ }) });
    await expect(card).toBeFocused();
    await expect(card).toBeInViewport();
    await page.evaluate(() => { rememberMatcenterRoute(false); saveMatcenterReadingPlace(); });
    const offset = (await card.boundingBox()).y;
    await page.reload();
    await expect(card).toBeInViewport();
    await expect.poll(async () => Math.abs((await card.boundingBox()).y - offset)).toBeLessThan(40);
    expect(errors).toEqual([]);
});

test('mobile compact controls fit and keep one task column in both themes', async ({ page }, info) => {
    const errors = await setup(page, { dark: true });
    for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/matcenter.html?grade=grade-10');
        await ready(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        const cards = await page.locator('#tasksContainer .task-card').evaluateAll(nodes => nodes.slice(0, 2).map(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width }; }));
        expect(cards[0].x).toBe(cards[1].x);
        expect(cards[1].y).toBeGreaterThan(cards[0].y);
        for (const button of ['#mcSearchScope', '#statusFilter', '.mc-view-switch']) {
            const r = await page.locator(button).boundingBox();
            expect(r.x).toBeGreaterThanOrEqual(0);
            expect(r.x + r.width).toBeLessThanOrEqual(width + 1);
        }
        const shareBounds = await page.locator('.matcenter-share-solved-btn').boundingBox();
        expect(shareBounds.height).toBeLessThanOrEqual(44);
        expect(shareBounds.x + shareBounds.width).toBeLessThanOrEqual(width);
        await page.screenshot({ path: info.outputPath(`mobile-${width}.png`) });
    }
    expect(errors).toEqual([]);
});

test('home grade default, previous section, browser back and unchanged summer topics', async ({ page }) => {
    const errors = await setup(page, { home: '9' });
    await page.goto('/matcenter.html');
    await ready(page);
    await expect(page.locator('#gradeSwitcher [data-grade="grade-9"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#gradeSwitcher [data-grade="grade-10"]').click();
    await page.locator('#gradeSwitcher [data-grade="grade-summer-9-10"]').click();
    await expect(page.locator('#statsContainer')).toBeHidden();
    await expect(page.locator('#mcSeriesRow')).toBeHidden();
    await page.locator('#statusFilter').selectOption('topic-mayskie');
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(1);
    await expect(page.locator('#allTasksTitle')).toContainText('Майские сборы');
    await page.goBack();
    await expect(page.locator('#statusFilter')).toHaveValue('');
    await page.goBack();
    await expect(page.locator('#gradeSwitcher [data-grade="grade-10"]')).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/matcenter.html');
    await ready(page);
    await expect(page.locator('#gradeSwitcher [data-grade="grade-10"]')).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
});

test('legacy visual theme supports the toolbar and reading mode', async ({ page }, info) => {
    const errors = await setup(page, { old: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/matcenter.html');
    await ready(page);
    await expect(page.locator('body')).not.toHaveClass(/experimental/);
    await page.locator('[data-mc-view="reading"]').click();
    await expect(page.locator('#tasksContainer .task-card.open')).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath('legacy-mobile.png') });
    expect(errors).toEqual([]);
});

test('direct task links do not bypass access checks', async ({ page }) => {
    await setup(page, { allowed: false });
    await page.goto('/matcenter.html?grade=grade-9&task=1&view=reading');
    await expect(page.locator('#authOverlay')).toBeVisible();
    await expect(page.locator('.task-card')).toHaveCount(0);
});

test('sidebar exposes categories, compact grade selection and search on desktop and phone', async ({ page }, info) => {
    const errors = await setup(page, { dark: true });
    for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/matcenter.html?grade=grade-10');
        await ready(page);
        if (width < 769) await page.evaluate(() => openMobileMenu());
        await expect(page.locator('#mcSidebarGrade')).toHaveValue('grade-10');
        await expect(page.locator('#sidebar .nav-link')).toHaveCount(4);
        await page.locator('#sidebar a[href="#current-series"]').click();
        await expect(page.locator('#current-series')).toBeVisible();
        await expect(page.locator('#sidebar a[href="#current-series"]')).toHaveAttribute('aria-current', 'page');
        if (width < 769) await page.evaluate(() => openMobileMenu());
        await page.locator('#mcSidebarGrade').selectOption('grade-summer-9-10');
        await expect(page.locator('#sidebar .nav-link')).toHaveCount(9);
        await expect(page.locator('#mcSidebarGrade')).toBeFocused();
        await page.screenshot({ path: info.outputPath(`sidebar-${width}.png`) });
        const bounds = await page.locator('#mcSidebarGrade').boundingBox();
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        await page.locator('#sidebar a[href="#topic-mayskie"]').click();
        await expect(page.locator('#allTasksTitle')).toContainText('Майские сборы');
        if (width < 769) await page.evaluate(() => openMobileMenu());
        await page.locator('#mcSidebarSearch').click();
        await expect(page.locator('#searchInput')).toBeFocused();
        if (width < 769) await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
    }
    expect(errors).toEqual([]);
});
