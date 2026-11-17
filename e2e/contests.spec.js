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
        let user = allowed ? { uid: 'viewer', email: 'viewer@example.test' } : null;
        let role = true;
        const config = { title: 'Контесты', spreadsheetId: 'example-contest-sheet', apiKey: 'read-only-example-key', range: "'Scores'!A1:Z1000", totalColumn: 5 };
        const db = { ref(path) {
            return {
                on(event, callback) {
                    listeners.set(path, callback);
                    callback({ val: () => path === 'contestTable' ? config : role });
                },
                off() { listeners.delete(path); }
            };
        } };
        window.AlmanionAccount = { database: db, getUser: () => user, openLogin: () => { window.loginOpened = true; } };
        window.contestFixture = {
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
