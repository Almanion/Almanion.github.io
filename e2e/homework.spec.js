'use strict';
const { test, expect } = require('@playwright/test');
const core = require('../personal-planner-core.js');
const hw = require('../homework-core.js');
test.use({ serviceWorkers: 'block', timezoneId: 'Europe/Moscow' });

function mockAccount(initial) {
    const copy = value => JSON.parse(JSON.stringify(value));
    let data = JSON.parse(localStorage.getItem('hw-test-remote') || 'null') || initial;
    let listener, connection;
    window.__hwWrites = [];
    window.__hwDeny = false;
    const owner = { uid: '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2', getIdToken: () => Promise.resolve('test-only-token') };
    const emit = () => listener && listener({ val: () => copy(data) });
    const ref = {
        on: (_, fn) => { listener = fn; emit(); }, off: () => { listener = null; },
        set: value => { data = copy(value); localStorage.setItem('hw-test-remote', JSON.stringify(data)); emit(); return Promise.resolve(); },
        update: updates => {
            window.__hwWrites.push(copy(updates));
            if (window.__hwWrites.length > 30) throw new Error('write storm');
            if (window.__hwDeny) return Promise.reject(Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' }));
            for (const [key, value] of Object.entries(updates)) {
                const parts = key.split('/'), last = parts.pop();
                const parent = parts.reduce((node, part) => node[part] || (node[part] = {}), data);
                if (value === null) delete parent[last]; else parent[last] = copy(value);
            }
            localStorage.setItem('hw-test-remote', JSON.stringify(data)); emit(); return Promise.resolve();
        }
    };
    window.__hwData = () => copy(data);
    window.__hwOffline = value => connection({ val: () => !value });
    window.__hwAuth = [];
    window.AlmanionAccount = {
        database: { ref: p => p === '.info/connected' ? { on: (_, fn) => { connection = fn; fn({ val: () => true }); }, off: () => {} } : ref },
        auth: { onAuthStateChanged: fn => { window.__hwAuth.push(fn); fn(owner); } }, getUser: () => owner, openLogin() {}
    };
}

test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00+03:00'));
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/account.js') return route.fulfill({ contentType: 'application/javascript', body: '(' + mockAccount.toString() + ')(' + JSON.stringify(core.defaultData()) + ');' });
        if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
        return route.abort();
    });
});

async function create(page, title = 'Задачи 1–5') {
    await page.locator('#hwAdd').click();
    await page.locator('#hwSubject').fill('Физика');
    await page.locator('#hwTitle').fill(title);
    await page.locator('#hwDue').fill('2026-11-06');
    await page.locator('#hwNotes').fill('Решить задачи. <img src=x onerror=alert(1)>');
    await page.locator('#hwRequiresSubmission').check();
    await page.locator('#hwTotal').fill('5');
    await page.locator('#hwCompleted').fill('2');
    await page.locator('#hwForm button[type=submit]').click();
    await expect(page.locator('#hwEditor')).not.toBeVisible();
    await expect(page.locator('#hwDetailTitle')).toHaveText(title);
}

test('completion and manual submission remain separate, persist, and share a task with the planner', async ({ page }) => {
    await page.goto('/homework.html');
    await expect(page.locator('#hwApp')).toBeVisible();
    await expect(page.locator('#hwConnection')).toContainText('Пока не подключён');
    await expect(page.locator('#hwList')).toContainText('Добавьте первое задание');
    await create(page);
    await expect(page.locator('#hwDetail img')).toHaveCount(0);
    await page.locator('[data-progress=done]').click();
    await expect(page.locator('[data-count=send]')).toHaveText('1');
    await expect(page.locator('#hwDetail')).toContainText('Отправка не подтверждена');
    await page.locator('[data-action=submission]').click();
    await expect(page.locator('#hwDetail')).toContainText('Вы отметили отправку');
    await expect(page.locator('#hwDetail')).toContainText('eSchool пока не подтверждает');
    await expect(page.locator('[data-count=send]')).toHaveText('0');
    await page.reload();
    await page.locator('[data-view=all]').click();
    await page.locator('.hw-row').first().click();
    await expect(page.locator('#hwDetail')).toContainText('Вы отметили отправку');
    await page.locator('#hwDetail a[href^="planner.html"]').click();
    await expect(page.locator('#plannerContent')).toContainText('Задачи 1–5');
    const task = Object.values((await page.evaluate(() => window.__hwData())).tasks)[0];
    await page.locator('[data-edit-id="' + task.id + '"]').click();
    await page.locator('#plannerItemName').fill('Уточнённые задачи');
    await page.locator('#plannerItemForm button[type=submit]').click();
    expect(Object.values((await page.evaluate(() => window.__hwData())).tasks)).toHaveLength(1);
    expect((await page.evaluate(() => window.__hwData())).tasks[task.id].homework.reportedSubmission).toBe(true);
    await page.locator('.personal-topbar-links a[href="homework.html"]').click();
    await page.locator('[data-view=all]').click();
    await expect(page.locator('#hwList')).toContainText('Уточнённые задачи');
});

test('offline and rejected writes stay local; logout removes all private content and closes editors', async ({ page }) => {
    await page.goto('/homework.html');
    await expect(page.locator('#hwApp')).toBeVisible();
    await page.evaluate(() => window.__hwOffline(true));
    await create(page, 'Личная работа');
    await expect(page.locator('#personalSyncStatus')).toBeVisible();
    await expect(page.locator('#personalSyncStatus')).toContainText('Сохранено');
    expect(await page.evaluate(() => window.__hwWrites.length)).toBe(0);
    await page.reload();
    await expect(page.locator('#hwList')).toContainText('Личная работа');
    await expect(page.locator('#personalSyncStatus')).toContainText('Синхронизировано');
    await page.evaluate(() => { window.__hwDeny = true; });
    await page.locator('.hw-row').first().click();
    await page.locator('[data-progress=doing]').click();
    await expect(page.locator('#personalSyncStatus')).toContainText('Облако отклонило');
    const writes = await page.evaluate(() => window.__hwWrites.length);
    await page.locator('[data-progress=help]').click();
    expect(await page.evaluate(() => window.__hwWrites.length)).toBe(writes);
    await page.evaluate(() => { window.__hwDeny = false; });
    await page.locator('[data-sync-retry]').click();
    await expect(page.locator('#personalSyncStatus')).toContainText('Синхронизировано');
    await page.locator('[data-action=edit]').click();
    await page.evaluate(() => window.__hwAuth.forEach(fn => fn(null)));
    await expect(page.locator('#hwApp')).toBeHidden();
    await expect(page.locator('#hwEditor')).not.toBeVisible();
    await expect(page.locator('#hwList')).toHaveText('');
    await expect(page.locator('#hwNotes')).toHaveValue('');
    await expect(page.locator('#hwTitle')).toHaveValue('');
    await page.evaluate(() => window.__hwAuth.forEach(fn => fn({ uid: 'unrelated', email: 'dmb23930@gmail.com' })));
    await expect(page.locator('#personalGateTitle')).toHaveText('Нет доступа');
});

for (const width of [320, 390, 1440]) test('comfortable layout and usable editor at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 760 ? 900 : 750 });
    await page.goto('/homework.html');
    await expect(page.locator('#hwApp')).toBeVisible();
    await create(page, 'Длинное задание с подробным условием и подготовкой к следующему уроку');
    if (width < 760) {
        await expect(page.locator('#hwDetail')).toHaveAttribute('aria-modal', 'true');
        await page.keyboard.press('Escape');
        await expect(page.locator('#hwDetail')).toBeHidden();
        await page.locator('.hw-row').first().click();
        await expect(page.locator('#hwDetail')).toBeFocused();
    }
    await page.locator('[data-action=edit]').click();
    await page.locator('#hwSourceUrl').fill('https://app.eschool.center/Private/student/diary/1');
    await page.locator('#hwForm button[type=submit]').click();
    await expect(page.locator('#hwEditor')).not.toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
    if (width < 760) await page.locator('[data-action=close]').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'playwright-report/homework-' + width + '.png', fullPage: true });
});

test('search and archive hide irrelevant tasks and recommendations', async ({ page }) => {
    const sample = core.defaultData();
    for (const [title, subject] of [['Атомы', 'Физика'], ['Молекулы', 'Химия']]) {
        const task = hw.makeTask({ title, subject, date: '2026-11-06', minutes: 45 }); sample.tasks[task.id] = task;
    }
    await page.addInitScript(data => localStorage.setItem('hw-test-remote', JSON.stringify(data)), sample);
    await page.goto('/homework.html');
    await page.locator('#hwSubjectFilter').selectOption('Химия');
    await expect(page.locator('.hw-row')).toHaveCount(1);
    await expect(page.locator('#hwRecommendation')).toContainText('Молекулы');
    await page.locator('.hw-row').click();
    await page.locator('[data-action=archive]').click();
    await expect(page.locator('.hw-row')).toHaveCount(0);
    await page.locator('[data-view=archive]').click();
    await expect(page.locator('.hw-row')).toHaveCount(1);
    await page.locator('#hwSearch').fill('АТОМ');
    await expect(page.locator('.hw-row')).toHaveCount(0);
});

test('dark theme and mobile dialog keep text readable and controls inside the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.addInitScript(() => {
        localStorage.setItem('siteSettings', JSON.stringify({ experimental: true, expMode: 'prism', expTheme: 'dark', expDark: true }));
        localStorage.setItem('almanion:visual-defaults:2026-09-05-v1', '1');
    });
    await page.goto('/homework.html');
    await expect(page.locator('body')).toHaveClass(/exp-dark/);
    await create(page, 'Подготовиться к следующему занятию');
    await expect(page.locator('#hwDetail')).toHaveAttribute('aria-modal', 'true');
    await page.locator('[data-action=edit]').click();
    await page.locator('#hwSourceUrl').scrollIntoViewIfNeeded();
    const save = page.locator('#hwForm button[type=submit]');
    await expect(save).toBeVisible();
    const rect = await save.boundingBox();
    expect(rect.y + rect.height).toBeLessThanOrEqual(740);
    await page.screenshot({ path: 'playwright-report/homework-editor-dark.png' });
    await page.locator('#hwEditor [data-close-editor]').first().click();
    await page.screenshot({ path: 'playwright-report/homework-detail-dark.png' });
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'playwright-report/homework-dark-390.png', fullPage: true });
});
