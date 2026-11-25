'use strict';

const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

test('profile offers a way back and a retry when the account service is unavailable', async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto('/profile.html');
    await expect(page.getByRole('heading', { name: 'Мой профиль' })).toBeVisible();
    await expect(page.locator('#profileGateAction')).toHaveText('Повторить');
    await expect(page.getByRole('link', { name: 'На главную', exact: true })).toHaveAttribute('href', 'index.html');
    await expect(page.locator('#profileEditor')).toBeHidden();
});

// Run against loopback Auth and Realtime Database emulators. No production credentials or requests.
test('profile survives sign-out, merges edits from two tabs and clears private fields on account change', async ({ page, context }) => {
    const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    const dbHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    test.skip(!authHost || !dbHost, 'Requires the local Firebase Auth and Database emulators');
    expect(authHost).toMatch(/^127\.0\.0\.1:\d+$/);
    expect(dbHost).toMatch(/^127\.0\.0\.1:\d+$/);
    const sdk = path.dirname(require.resolve('firebase/package.json'));
    const projectId = 'almanion-rules-test';
    const config = { projectId, apiKey: 'local-emulator', authDomain: 'localhost', databaseURL: 'https://' + projectId + '.firebaseio.com', appId: '1:12345:web:local' };
    await context.route('**/*', route => {
        const u = new URL(route.request().url());
        if (u.hostname === 'www.gstatic.com' && /^\/firebasejs\/[\d.]+\/firebase-(app|auth|database)-compat\.js$/.test(u.pathname)) {
            return route.fulfill({ contentType: 'application/javascript', path: path.join(sdk, path.basename(u.pathname)) });
        }
        if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return route.abort();
        if (u.pathname === '/firebase-config.js') {
            const code = 'const firebaseConfig=' + JSON.stringify(config) + ';firebase.initializeApp(firebaseConfig);' +
                'firebase.auth().useEmulator(' + JSON.stringify('http://' + authHost) + ',{disableWarnings:true});' +
                'firebase.database().useEmulator("127.0.0.1",' + Number(dbHost.split(':')[1]) + ');';
            return route.fulfill({ contentType: 'application/javascript', body: code });
        }
        return route.continue();
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const email = 'reader-' + randomUUID() + '@example.test';
    const password = 'local-profile-test';
    const register = async address => {
        await page.locator('#profileGateAction').click();
        await page.locator('#accToggle').click();
        await page.locator('#accEmail').fill(address);
        await page.locator('#accPass').fill(password);
        await page.locator('#accPassConfirm').fill(password);
        await page.locator('#accSubmit').click();
        await expect(page.locator('#profileEditor')).toBeVisible();
    };
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/profile.html');
    await expect(page.locator('#profileGateAction')).toHaveText('Войти');
    await register(email);
    await page.getByLabel('Ник', { exact: true }).fill('Северный Лис');
    await page.locator('#profileTelegram').fill('https://example.org/reader');
    await page.locator('#profileSave').click();
    await expect(page.locator('#telegramError')).toBeVisible();
    await page.locator('#profileTelegram').fill('https://t.me/north_reader/');
    await page.locator('label[title="Орбита"]').click();
    await page.locator('label[title="Мята"]').click();
    await expect(page.locator('#profilePreviewName')).toHaveText('Северный Лис');
    await expect(page.locator('#profilePreviewTelegram')).toHaveAttribute('href', 'https://t.me/north_reader');
    await page.locator('#profileSave').click();
    await expect(page.locator('#profileStatus')).toHaveText('Изменения сохранены');
    await expect(page.locator('#accountBtn')).toHaveAttribute('title', 'Северный Лис');
    for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }

    const other = await context.newPage();
    await other.goto('/profile.html');
    await expect(other.locator('#profileNickname')).toHaveValue('Северный Лис');
    await page.locator('#profileNickname').fill('Новый ник');
    await other.locator('label[title="Янтарь"]').click();
    await other.locator('#profileSave').click();
    await expect(page.locator('#profileColorName')).toHaveText('Янтарь');
    await expect(page.locator('#profileNickname')).toHaveValue('Новый ник');
    await page.locator('#profileSave').click();
    await expect(other.locator('#profileNickname')).toHaveValue('Новый ник');
    await other.close();

    await page.evaluate(() => firebase.database().goOffline());
    await expect(page.locator('#profileStatus')).toContainText('Нет связи');
    await page.locator('#profileNickname').fill('Черновик');
    await expect(page.locator('#profileSave')).toBeDisabled();
    await page.evaluate(() => firebase.database().goOnline());
    await expect(page.locator('#profileSave')).toBeEnabled();
    await page.locator('#profileReset').click();
    await expect(page.locator('#profileNickname')).toHaveValue('Новый ник');

    await page.goto('/duty-10-1.html');
    await expect(page.locator('#accountBtn')).toHaveAttribute('title', 'Новый ник');
    await page.locator('#accountBtn').click();
    await page.getByRole('link', { name: 'Мой профиль' }).click();
    await expect(page.locator('#profileTelegram')).toHaveValue('north_reader');
    await page.locator('#accountBtn').click();
    await page.locator('#accSignout').click();
    await expect(page.locator('#profileEditor')).toBeHidden();
    await expect(page.locator('#profileTelegram')).toHaveValue('');
    await page.locator('#profileGateAction').click();
    await page.locator('#accEmail').fill(email);
    await page.locator('#accPass').fill(password);
    await page.locator('#accSubmit').click();
    await expect(page.locator('#profilePreviewName')).toHaveText('Новый ник');
    await expect(page.locator('#profileCard')).toHaveAttribute('data-profile-color', 'amber');
    await page.locator('#profileTelegram').fill('');
    await page.locator('#profileSave').click();
    await expect(page.locator('#profileStatus')).toHaveText('Изменения сохранены');
    await page.reload();
    await expect(page.locator('#profileEditor')).toBeVisible();
    await expect(page.locator('#profilePreviewTelegram')).toBeHidden();
    await page.locator('#accountBtn').click();
    await page.locator('#accSignout').click();
    await expect(page.locator('#profileGateAction')).toHaveText('Войти');
    await register('new-' + randomUUID() + '@example.test');
    await expect(page.locator('#profileNickname')).toHaveValue('');
    await expect(page.locator('#profileCard')).toHaveAttribute('data-profile-color', 'iris');
    expect(errors).toEqual([]);
});
