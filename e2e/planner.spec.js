'use strict';

const { test, expect } = require('@playwright/test');
const core = require('../personal-planner-core.js');
test.use({ serviceWorkers: 'block' });

function installAccount(initial) {
    const clone = value => JSON.parse(JSON.stringify(value));
    let data = JSON.parse(localStorage.getItem('test-planner-remote') || 'null') || initial;
    let listener, connection;
    window.__writes = [];
    window.__denyWrites = false;
    window.__toasts = [];
    window.AlmanionToast = { show: message => window.__toasts.push(message) };
    const notify = () => listener && listener({ val: () => clone(data) });
    const saveRemote = () => localStorage.setItem('test-planner-remote', JSON.stringify(data));
    const account = {
        uid: '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2',
        getIdToken: () => Promise.resolve('test-only-token')
    };
    const ref = {
        on: (_, callback) => { listener = callback; notify(); },
        off: () => { listener = null; },
        set: value => { data = clone(value); saveRemote(); notify(); return Promise.resolve(); },
        update: updates => {
            window.__writes.push(clone(updates));
            if (window.__writes.length > 30) throw new Error('write storm');
            const before = clone(data);
            Object.entries(updates).forEach(([path, value]) => {
                const parts = path.split('/'), last = parts.pop();
                const parent = parts.reduce((obj, key) => obj[key] || (obj[key] = {}), data);
                if (value === null) delete parent[last]; else parent[last] = clone(value);
            });
            notify();
            return Promise.resolve().then(() => {
                if (window.__denyWrites) { data = before; notify(); throw Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' }); }
                saveRemote();
            });
        }
    };
    window.__plannerRemote = () => clone(data);
    window.__connection = value => connection({ val: () => value });
    window.__authListeners = [];
    window.AlmanionAccount = {
        database: { ref: path => path === '.info/connected' ? { on: (_, cb) => { connection = cb; cb({ val: () => true }); }, off: () => {} } : ref },
        auth: { onAuthStateChanged: cb => { window.__authListeners.push(cb); cb(account); } },
        getUser: () => account, openLogin: () => {}
    };
}

test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/account.js') return route.fulfill({ contentType: 'application/javascript', body: '(' + installAccount.toString() + ')(' + JSON.stringify(core.defaultData()) + ');' });
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return route.continue();
        return route.abort();
    });
});

async function openForm(page, type, name) {
    await page.locator('#plannerAddButton').click();
    await page.locator('label').filter({ has: page.locator('input[name="itemType"][value="' + type + '"]') }).click();
    await page.locator('#plannerItemName').fill(name);
    await page.locator('#plannerItemNotes').fill('Подробная заметка');
}
async function save(page) {
    await page.locator('#plannerItemForm button[type="submit"]').click();
    await expect(page.locator('#plannerItemModal')).toBeHidden();
    await expect(page.locator('#personalSyncStatus')).toContainText('Синхронизировано');
}

test('planner creates all record types, edits recurrence, changes type atomically and persists after reload', async ({ page }) => {
    await page.goto('/planner.html');
    await expect(page.locator('#plannerApp')).toBeVisible();
    await openForm(page, 'series', 'Серия № 1');
    await page.locator('#plannerSeriesTotal').fill('12');
    await save(page);
    await openForm(page, 'goal', 'Прочитать книгу');
    await page.locator('#plannerGoalTarget').fill('10');
    await save(page);
    await openForm(page, 'task', 'Записать решение');
    await save(page);
    await openForm(page, 'event', 'Консультация');
    await page.locator('#plannerItemRepeat').selectOption('daily');
    await page.locator('#plannerRepeatInterval').fill('2');
    await page.locator('#plannerRepeatUntil').fill('2030-12-31');
    await save(page);
    await page.reload();
    await expect(page.locator('#plannerContent')).toContainText('Серия № 1');
    let remote = await page.evaluate(() => window.__plannerRemote());
    expect(Object.values(remote.series)[0].solved).toBe(0);
    expect(Object.values(remote.goals)[0].current).toBe(0);
    expect(Object.values(remote.tasks)[0].done).toBe(false);
    const entry = Object.values(remote.events).find(item => item.title === 'Консультация');
    await page.locator('button[data-edit-id="' + entry.id + '"]').click();
    await expect(page.locator('#plannerRepeatInterval')).toHaveValue('2');
    await expect(page.locator('#plannerRepeatUntil')).toHaveValue('2030-12-31');
    await page.locator('#plannerItemNotes').fill('Изменённая заметка');
    await save(page);
    await page.locator('button[data-edit-id="' + entry.id + '"]').click();
    await page.locator('label').filter({ has: page.locator('[name="itemType"][value="task"]') }).click();
    await save(page);
    remote = await page.evaluate(() => window.__plannerRemote());
    expect(remote.events[entry.id]).toBeUndefined();
    expect(remote.tasks[entry.id].notes).toBe('Изменённая заметка');
    const writes = await page.evaluate(() => window.__writes);
    expect(writes.at(-1)['events/' + entry.id]).toBeNull();
    expect(writes.at(-1)['tasks/' + entry.id].done).toBe(false);
    await page.locator('[data-task-toggle="' + entry.id + '"]').click();
    await expect(page.locator('#personalSyncStatus')).toContainText('Синхронизировано');
    expect(Object.values((await page.evaluate(() => window.__plannerRemote())).tasks[entry.id].completedDates)).toEqual([true]);
    await page.locator('button[data-edit-id="' + entry.id + '"]').click();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#plannerDeleteButton').click();
    await expect(page.locator('#plannerItemModal')).toBeHidden();
    await expect(page.locator('#personalSyncStatus')).toContainText('Синхронизировано');
    expect((await page.evaluate(() => window.__plannerRemote())).tasks[entry.id]).toBeUndefined();
});

test('denied write stays local with one status, then manual retry saves it without a storm', async ({ page }) => {
    await page.goto('/planner.html');
    await expect(page.locator('#plannerApp')).toBeVisible();
    await page.evaluate(() => { window.__denyWrites = true; });
    await openForm(page, 'series', 'Серия с заметкой');
    await page.locator('#plannerItemForm button[type="submit"]').click();
    await expect(page.locator('#personalSyncStatus')).toContainText('Облако отклонило запись');
    expect(await page.evaluate(() => window.__writes.length)).toBe(1);
    expect(await page.evaluate(() => window.__toasts)).toEqual([]);
    await page.locator('[data-series-delta="1"]').click();
    expect(await page.evaluate(() => window.__writes.length)).toBe(1);
    await page.evaluate(() => { window.__denyWrites = false; });
    await page.locator('[data-sync-retry]').click();
    await expect(page.locator('#personalSyncStatus')).toContainText('Синхронизировано');
    expect(Object.values((await page.evaluate(() => window.__plannerRemote())).series)[0].solved).toBe(1);
    await page.reload();
    await expect(page.locator('#plannerContent')).toContainText('Серия с заметкой');
});

test('offline changes survive reload and logging out closes the editor', async ({ page }) => {
    await page.goto('/planner.html');
    await expect(page.locator('#plannerApp')).toBeVisible();
    await page.evaluate(() => window.__connection(false));
    await openForm(page, 'event', 'Без сети');
    await page.locator('#plannerItemForm button[type="submit"]').click();
    await expect(page.locator('#personalSyncStatus')).toContainText('ждём подключения');
    expect(await page.evaluate(() => window.__writes.length)).toBe(0);
    await page.reload();
    await expect(page.locator('#plannerContent')).toContainText('Без сети');
    await expect(page.locator('#personalSyncStatus')).toContainText('Синхронизировано');
    await page.locator('#plannerAddButton').click();
    await page.evaluate(() => window.__authListeners.forEach(callback => callback(null)));
    await expect(page.locator('#plannerApp')).toBeHidden();
    await expect(page.locator('#plannerItemModal')).toBeHidden();
    await page.keyboard.press('n');
    await expect(page.locator('#plannerItemModal')).toBeHidden();
});

test('planner forms and retry controls fit narrow phones', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/planner.html');
    await expect(page.locator('#plannerApp')).toBeVisible();
    await page.locator('#plannerMobileAdd').click();
    await page.locator('#plannerItemName').fill('Проверка телефона');
    await page.locator('#plannerItemNotes').fill('Заметка');
    await save(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.locator('#plannerMobileMore').click();
    await page.locator('[data-mobile-view="month"]').click();
    await expect(page.locator('.planner-month')).toBeVisible();
    const sunday = await page.locator('.planner-month-weekday').last().boundingBox();
    expect(sunday.x + sunday.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: 'test-results/planner-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.body.classList.add('experimental', 'exp-prism', 'exp-dark'));
    await page.screenshot({ path: 'test-results/planner-mobile-dark.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#plannerViewNav [data-view="today"]').click();
    await page.screenshot({ path: 'test-results/planner-desktop.png', fullPage: true });
});

test('sport measurements and historical zero-valued sets remain editable', async ({ page }) => {
    await page.goto('/sport.html');
    await expect(page.locator('#sportApp')).toBeVisible();
    await page.locator('[data-sport-view="metrics"]').click();
    await page.locator('[data-add-metric]').click();
    await page.locator('#sportMetricWeight').fill('70');
    await page.locator('#sportMetricForm button[type="submit"]').click();
    await expect(page.locator('#personalSyncStatus')).toContainText('Синхронизировано');
    await page.locator('[data-edit-metric]').first().click();
    await expect(page.locator('#sportMetricWeight')).toHaveValue('70');
    await page.locator('#sportMetricModal [data-close-modal]').first().click();
    await page.locator('#sportStartWorkout').click();
    await page.locator('[data-set-reps]').first().fill('10');
    await page.locator('[data-set-weight]').first().fill('0');
    await page.locator('[data-set-rir]').first().fill('0');
    await page.locator('#sportWorkoutForm button[type="submit"]').click();
    await expect(page.locator('#personalSyncStatus')).toContainText('Синхронизировано');
    await expect(page.locator('[data-edit-workout]').first()).toBeVisible();
    await page.locator('#sportWeekSelect').selectOption('5');
    await page.locator('[data-edit-workout]').first().click();
    await expect(page.locator('[data-set-weight]').first()).toHaveValue('0');
    await expect(page.locator('[data-set-rir]').first()).toHaveValue('0');
    await page.locator('#sportWorkoutForm button[type="submit"]').click();
    await expect(page.locator('#personalSyncStatus')).toContainText('Синхронизировано');
    expect(Object.values((await page.evaluate(() => window.__plannerRemote())).sport.workouts)[0].programWeek).toBe(1);
});

test('weekly validation, structured inbox import and backup export work together', async ({ page }) => {
    await page.goto('/planner.html');
    await openForm(page, 'event', 'Повторение');
    await page.locator('#plannerItemRepeat').selectOption('weekly');
    for (const checkbox of await page.locator('#plannerWeekdays input:checked').all()) await checkbox.uncheck();
    await page.locator('#plannerItemForm button[type="submit"]').click();
    await expect(page.locator('#plannerFormError')).toContainText('Выберите хотя бы один день');
    await page.locator('#plannerItemModal [data-close-modal]').first().click();
    await page.locator('#plannerIntegrationsButton').click();
    await page.locator('#plannerStructuredImport').fill(JSON.stringify({ tasks: [{ title: 'Из плана', date: core.dateKey(new Date()), notes: 'Импортированная заметка' }] }));
    await page.locator('[data-import-structured]').click();
    await expect(page.locator('#plannerImportStatus')).toContainText('Добавлено предложений: 1');
    await page.locator('#plannerUtilityModal [data-close-modal]').click();
    await page.locator('#plannerViewNav [data-view="inbox"]').click();
    await page.locator('[data-inbox-accept]').click();
    await expect(page.locator('#personalSyncStatus')).toContainText('Синхронизировано');
    const remote = await page.evaluate(() => window.__plannerRemote());
    expect(Object.values(remote.tasks).some(item => item.title === 'Из плана')).toBe(true);
    expect(Object.values(remote.inbox || {})).toHaveLength(0);
    const updates = (await page.evaluate(() => window.__writes)).at(-1);
    expect(Object.keys(updates).some(key => key.startsWith('inbox/'))).toBe(true);
    expect(Object.keys(updates).some(key => key.startsWith('tasks/'))).toBe(true);
    await page.locator('#plannerExportButton').click();
    const download = page.waitForEvent('download');
    await page.locator('[data-export-json]').click();
    expect((await download).suggestedFilename()).toBe('almanion-personal-backup.json');
});
