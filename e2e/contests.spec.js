'use strict';

const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });

async function setup(page, allowed = true) {
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1') return route.abort();
        if (/\/(account|firebase-config)\.js$/.test(url.pathname)) return route.fulfill({ body: '' });
        return route.continue();
    });
    await page.addInitScript(({ allowed }) => {
        const listeners = new Map();
        let sourceCallback;
        let user = allowed ? { uid: 'viewer', email: 'viewer@example.test' } : null;
        let role = true;
        const config = { title: 'Контесты', spreadsheetId: 'example-contest-sheet', apiKey: 'read-only-example-key', range: "'Scores'!A1:Z1000", totalColumn: 5 };
        const db = { ref(path) {
            return {
                on(event, callback) {
                    listeners.set(path, callback);
                    if (path === 'contestTable') sourceCallback = callback;
                    callback({ val: () => path === 'contestTable' ? config : role });
                },
                off() { listeners.delete(path); }
            };
        } };
        window.AlmanionAccount = { database: db, getUser: () => user, openLogin: () => { window.loginOpened = true; } };
        window.contestFixture = {
            replaySource() { sourceCallback?.({ val: () => config }); },
            access(value) {
                role = value;
                listeners.get('adminRoles/viewer/contestsAccess')?.({ val: () => role });
            },
            signOut() {
                user = null;
                window.dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user } }));
            }
        };
    }, { allowed });
    const row = (...values) => ({ values: values.map(value => ({ formattedValue: value })) });
    const data = { sheets: [{ properties: { sheetId: 0 }, data: [{ rowData: [
        row('https://example.test/contest/1', 'a', 'b', 'c', 'd'),
        row('Алексей', '0', '', '30', '100', '130'),
        row('Мария', '0', '0', '0', '0', '0'),
        row('SCHOOL26DAY1')
    ] }] }] };
    await page.route('https://sheets.googleapis.com/**', route => route.fulfill({ json: data }));
    return data;
}

for (const [width, dark] of [[360, false], [1366, false], [390, true], [1366, true]]) {
    test('registered viewer reads and filters scores at ' + width + ' dark=' + dark, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 850 });
        await setup(page);
        await page.addInitScript(dark => {
            localStorage.setItem('almanion:visual-defaults:2026-09-05-v1', '1');
            localStorage.setItem('siteSettings', JSON.stringify({
                visualDefaultsVersion: 1, experimental: true, expMode: 'prism', expTheme: dark ? 'dark' : 'light', expDark: dark, animationLevel: 'off'
            }));
        }, dark);
        await page.goto('/contests.html');
        if (dark) await expect(page.locator('body')).toHaveClass(/exp-dark/);
        await expect(page.locator('#contestStatus')).toContainText('Обновлено');
        await expect(page.locator('.contest-title')).toHaveText('SCHOOL26DAY1');
        const scores = page.locator(width < 640 ? '.contest-people' : 'tbody');
        await expect(scores).toContainText('Алексей');
        await expect(scores).toContainText('130');
        await expect(scores).toContainText('—');
        await page.screenshot({ path: info.outputPath('contests-' + width + '-' + dark + '.png'), fullPage: true });
        await page.locator('#contestSearch').fill('мар');
        await expect(scores).toContainText('Мария');
        await expect(scores).not.toContainText('Алексей');
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThan(2);
        await page.screenshot({ path: info.outputPath('contests-' + width + '.png'), fullPage: true });
        await page.evaluate(() => window.contestFixture.access(false));
        await expect(page.locator('#contestGateTitle')).toHaveText('Доступ закрыт');
        await expect(page.locator('#contestResults')).toBeEmpty();
        await expect(page.locator('#contestSource')).not.toHaveAttribute('href');
        await page.evaluate(() => window.contestFixture.replaySource());
        await expect(page.locator('#contestGateTitle')).toHaveText('Доступ закрыт');
        await expect(page.locator('#contestResults')).toBeEmpty();
        await page.evaluate(() => window.contestFixture.access(true));
        await expect(page.locator('#contestContent')).toBeVisible();
        await page.evaluate(() => window.contestFixture.signOut());
        await expect(page.locator('#contestContent')).toBeHidden();
        await expect(page.locator('#contestResults')).toBeEmpty();
    });
}

test('signed-out visitors cannot request the source or results', async ({ page }) => {
    await setup(page, false);
    const requests = [];
    page.on('request', request => { if (request.url().includes('sheets.googleapis.com')) requests.push(request.url()); });
    await page.goto('/contests.html');
    await expect(page.locator('#contestGateTitle')).toHaveText('Войдите в аккаунт');
    expect(requests).toHaveLength(0);
    await page.locator('#contestLogin').click();
    expect(await page.evaluate(() => window.loginOpened)).toBe(true);
});

test('revocation cancels an in-flight response and refresh errors keep current results', async ({ page }) => {
    await setup(page);
    await page.goto('/contests.html');
    await expect(page.locator('#contestStatus')).toContainText('Обновлено');
    await page.route('https://sheets.googleapis.com/**', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.locator('#contestRefresh').click();
    await expect(page.locator('#contestStatus')).toContainText('Не удалось обновить');
    await expect(page.locator('#contestResults')).toContainText('Алексей');
    let reply;
    const waiting = new Promise(resolve => { reply = resolve; });
    await page.route('https://sheets.googleapis.com/**', async route => { await waiting; await route.fulfill({ json: { sheets: [] } }).catch(() => {}); });
    await page.locator('#contestRefresh').click();
    await page.evaluate(() => window.contestFixture.access(false));
    reply();
    await expect(page.locator('#contestGateTitle')).toHaveText('Доступ закрыт');
    await expect(page.locator('#contestResults')).toBeEmpty();
});

test('a stalled access check has a retry and can recover', async ({ page }) => {
    await page.clock.install();
    await setup(page);
    await page.addInitScript(() => {
        const database = window.AlmanionAccount.database;
        window.resumeContestConnection = database.ref;
        database.ref = () => ({ on() {}, off() {} });
    });
    await page.goto('/contests.html');
    await expect(page.locator('#contestGateTitle')).toHaveText('Проверяем доступ');
    await page.clock.fastForward(13000);
    await expect(page.locator('#contestGateTitle')).toHaveText('Не удалось проверить доступ');
    await expect(page.locator('#contestLogin')).toHaveText('Повторить');
    await page.evaluate(() => { window.AlmanionAccount.database.ref = window.resumeContestConnection; });
    await page.locator('#contestLogin').click();
    await expect(page.locator('#contestContent')).toBeVisible();
    await expect(page.locator('#contestResults')).toContainText('Алексей');
});

test('mobile comparison keeps names visible, supports sorting and remembers the view', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await setup(page);
    await page.goto('/contests.html');
    await expect(page.locator('.contest-people')).toBeVisible();
    await page.getByRole('button', { name: 'Таблица', exact: true }).click();
    const scroll = page.locator('.contest-table-scroll');
    await expect(scroll).toBeVisible();
    await page.evaluate(() => { document.querySelector('.contest-table-scroll').scrollLeft = 240; });
    const left = await page.locator('tbody th').first().boundingBox();
    const frame = await scroll.boundingBox();
    expect(Math.abs(left.x - frame.x)).toBeLessThan(2);
    await page.getByRole('button', { name: 'Итого: по убыванию баллов' }).click();
    await expect(page.locator('tbody tr').first()).toContainText('Алексей');
    await expect(page.locator('#contestOrder')).toHaveValue('total');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThan(2);
    await page.reload();
    await expect(scroll).toBeVisible();
    await expect(page.getByRole('button', { name: 'Таблица', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('notes are touch and keyboard accessible, remain stable on refresh and disappear on revocation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const data = await setup(page);
    data.sheets[0].data[0].rowData[1].values[3].note = 'Разбор\n<script>bad()</script>';
    await page.goto('/contests.html');
    const note = page.locator('.contest-people').getByRole('button', { name: /Алексей, c: 30/ });
    await note.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('#contestNoteText')).toHaveText('Разбор\n<script>bad()</script>');
    expect(await page.locator('#contestNoteText script').count()).toBe(0);
    await page.evaluate(() => document.getElementById('contestRefresh').click());
    await expect(page.locator('#contestStatus')).toContainText('Обновлено');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(note).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.evaluate(() => window.contestFixture.access(false));
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.locator('#contestNoteText')).toBeEmpty();
});

test('polling preserves the DOM, scrolling and filters; changed scores replace only the results', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const data = await setup(page);
    await page.goto('/contests.html');
    await expect(page.locator('#contestStatus')).toContainText('Обновлено');
    await page.getByRole('button', { name: 'Таблица', exact: true }).click();
    await page.locator('#contestSearch').fill('алекс');
    await page.evaluate(() => {
        window.originalContestTable = document.querySelector('table');
        document.querySelector('.contest-table-scroll').scrollLeft = 180;
    });
    await page.locator('#contestRefresh').click();
    await expect(page.locator('#contestStatus')).toContainText('Обновлено');
    expect(await page.evaluate(() => window.originalContestTable === document.querySelector('table'))).toBe(true);
    const left = await page.locator('.contest-table-scroll').evaluate(node => node.scrollLeft);
    data.sheets[0].data[0].rowData[1].values[5].formattedValue = '150';
    await page.locator('#contestRefresh').click();
    await expect(page.locator('tbody')).toContainText('150');
    await expect(page.locator('#contestSearch')).toHaveValue('алекс');
    expect(await page.locator('.contest-table-scroll').evaluate(node => node.scrollLeft)).toBe(left);
    await page.locator('#contestSearch').fill('неизвестный');
    await expect(page.locator('#contestEmpty')).toContainText('Участники не найдены');
    await page.getByRole('button', { name: 'Сбросить поиск' }).click();
    await expect(page.locator('tbody')).toContainText('Мария');
    await expect(page.locator('#contestSearch')).toBeFocused();
});

test('offline results stay available and refresh when the connection returns', async ({ page, context }) => {
    const data = await setup(page);
    await page.goto('/contests.html');
    await expect(page.locator('#contestStatus')).toContainText('Обновлено');
    await context.setOffline(true);
    await expect(page.locator('#contestStatus')).toContainText('Нет сети');
    await expect(page.locator('#contestResults')).toContainText('Алексей');
    await page.locator('#contestRefresh').click();
    await expect(page.locator('#contestStatus')).toContainText('Нет сети');
    data.sheets[0].data[0].rowData[1].values[5].formattedValue = '200';
    await context.setOffline(false);
    await expect(page.locator('tbody')).toContainText('200');
    await expect(page.locator('#contestStatus')).toContainText('Обновлено');
});

test('multiple contests, missing totals, long names and loading errors work without overflow', async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const data = await setup(page);
    const rows = data.sheets[0].data[0].rowData;
    rows[1].values[0].formattedValue = 'ОченьДлиннаяФамилияБезПробеловОченьДлиннаяФамилия';
    rows.push({ values: [{ formattedValue: 'https://example.test/contest/2' }, { formattedValue: 'Длинное название задачи' }] });
    rows.push({ values: [{ formattedValue: 'Мария' }, { formattedValue: '42' }] });
    rows.push({ values: [{ formattedValue: 'Тур 2' }] });
    await page.goto('/contests.html');
    await expect(page.locator('.contest-section')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThan(2);
    expect(await page.locator('.contest-person-total .contest-score').first().evaluate(node => node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight))).toBeLessThan(1.8);
    await page.screenshot({ path: info.outputPath('contests-long-mobile.png'), fullPage: true });
    await page.locator('#contestSelection').selectOption({ label: 'Тур 2' });
    await expect(page.locator('.contest-section')).toHaveCount(1);
    await expect(page.locator('.contest-title')).toHaveText('Тур 2');
    await expect(page.locator('.contest-rank')).toHaveCount(0);
    await page.locator('#contestRefresh').click();
    await expect(page.locator('#contestStatus')).toContainText('Обновлено');
    await expect(page.locator('.contest-title')).toHaveText('Тур 2');
    await page.route('https://sheets.googleapis.com/**', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.reload();
    await expect(page.locator('#contestStatus')).toContainText('Не удалось загрузить');
    await expect(page.locator('#contestLoading')).toBeHidden();
    await expect(page.locator('#contestEmpty')).toBeHidden();
    await expect(page.locator('#contestRefresh')).toBeEnabled();
});

for (const dark of [false, true]) {
    test('updated source titles, totals and colors render in both views dark=' + dark, async ({ page }, info) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const data = await setup(page);
        data.properties = { title: 'Контест 2026 · День 2 — результаты' };
        data.sheets[0].properties.title = 'Scores';
        const rows = data.sheets[0].data[0].rowData;
        rows[0].values[5] = { formattedValue: 'Сумма' };
        const formatting = structuredClone(data);
        const colors = [{ red: 0.96, green: 0.8, blue: 0.8 }, null, { red: 1, green: 0.95, blue: 0.8 }, { red: 0.85, green: 0.92, blue: 0.83 }];
        formatting.sheets[0].data[0].rowData[1].values.forEach((cell, index) => {
            if (colors[index - 1]) cell.effectiveFormat = { backgroundColor: colors[index - 1] };
        });
        const ranges = [];
        await page.route('https://sheets.googleapis.com/**', route => {
            const url = new URL(route.request().url());
            if (url.searchParams.get('fields').includes('effectiveFormat')) {
                ranges.push(url.searchParams.getAll('ranges'));
                return route.fulfill({ json: formatting });
            }
            return route.fulfill({ json: data });
        });
        await page.addInitScript(dark => {
            localStorage.setItem('almanion:visual-defaults:2026-09-05-v1', '1');
            localStorage.setItem('siteSettings', JSON.stringify({ visualDefaultsVersion: 1, experimental: true, expMode: 'prism', expTheme: dark ? 'dark' : 'light', expDark: dark, animationLevel: 'off' }));
        }, dark);
        await page.goto('/contests.html');
        await expect(page.locator('#contestStatus')).toContainText('Обновлено');
        await expect(page.locator('.contest-title')).toHaveText(data.properties.title);
        expect(ranges).toEqual([["'Scores'!B1:F4"]]);
        const cards = page.locator('.contest-people');
        await expect(cards.locator('[data-sheet-color]')).toHaveCount(3);
        await expect(cards.locator('.contest-person-total').first()).toContainText('Сумма');
        const backgrounds = await cards.locator('[data-sheet-color]').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor));
        expect(new Set(backgrounds).size).toBe(3);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThan(2);
        await page.screenshot({ path: info.outputPath('updated-source-mobile.png'), fullPage: true });
        await page.getByRole('button', { name: 'Таблица', exact: true }).click();
        await page.setViewportSize({ width: 1366, height: 900 });
        await expect(page.locator('tbody [data-sheet-color]')).toHaveCount(3);
        await page.screenshot({ path: info.outputPath('updated-source-desktop.png'), fullPage: true });
        // A color-only edit must be reflected, even when scores did not change.
        formatting.sheets[0].data[0].rowData[1].values[1].effectiveFormat.backgroundColor = colors[3];
        await page.locator('#contestRefresh').click();
        await expect(page.locator('tbody [data-sheet-color]').first()).toHaveAttribute('style', /107/);
    });
}

test('formatting failure does not hide scores, and revocation aborts the second request', async ({ page }) => {
    const data = await setup(page);
    data.sheets[0].properties.title = 'Scores';
    await page.route('https://sheets.googleapis.com/**', route => {
        const formatting = new URL(route.request().url()).searchParams.get('fields').includes('effectiveFormat');
        return formatting ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.fulfill({ json: data });
    });
    await page.goto('/contests.html');
    await expect(page.locator('#contestStatus')).toContainText('цвета временно недоступны');
    await expect(page.locator('#contestResults')).toContainText('130');
    let finish;
    const delayed = new Promise(resolve => { finish = resolve; });
    let started;
    const secondRequest = new Promise(resolve => { started = resolve; });
    await page.route('https://sheets.googleapis.com/**', async route => {
        if (new URL(route.request().url()).searchParams.get('fields').includes('effectiveFormat')) {
            started();
            await delayed;
        }
        await route.fulfill({ json: data }).catch(() => {});
    });
    await page.locator('#contestRefresh').click();
    await secondRequest;
    await page.evaluate(() => window.contestFixture.access(false));
    finish();
    await expect(page.locator('#contestGateTitle')).toHaveText('Доступ закрыт');
    await expect(page.locator('#contestResults')).toBeEmpty();
});
