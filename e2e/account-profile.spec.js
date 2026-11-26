'use strict';

const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { test, expect } = require('@playwright/test');
const { mailScript, emulatorTransport } = require('../tests/helpers/email-code-script');

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
    const mailbox = mailScript({ transport: emulatorTransport(authHost) });
    await context.route('**/*', route => {
        const u = new URL(route.request().url());
        if (u.hostname === 'www.gstatic.com' && /^\/firebasejs\/[\d.]+\/firebase-(app|auth|database)-compat\.js$/.test(u.pathname)) {
            return route.fulfill({ contentType: 'application/javascript', path: path.join(sdk, path.basename(u.pathname)) });
        }
        if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return route.abort();
        if (u.pathname === '/__account/email-code') {
            return route.fulfill({ json: mailbox.request(route.request().postDataJSON(), route.request().method()) });
        }
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
        await expect(page.getByRole('heading', { name: 'Аккаунт создан' })).toBeVisible();
        await page.getByRole('link', { name: 'Подтвердить почту' }).click();
        await expect(page.locator('#profileEditor')).toBeVisible();
    };
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/profile.html');
    await expect(page.locator('#profileGateAction')).toHaveText('Войти');
    await register(email);
    await page.locator('#accountBtn').click();
    await page.getByRole('link', { name: 'Подтвердить почту' }).click();
    await page.locator('#emailSend').click();
    await expect(page.locator('#emailState')).toContainText('Письмо отправлено');
    expect(mailbox.mail).toHaveLength(1);
    expect(mailbox.mail[0].to).toBe(email);
    const digits = mailbox.mail[0].body.match(/\b\d{6}\b/)[0];
    await page.locator('#emailCode').fill(digits === '111111' ? '222222' : '111111');
    await page.locator('#emailCodeForm button').click();
    await expect(page.locator('#emailError')).toContainText('Код не подошёл');
    await page.reload();
    await expect(page.locator('#emailCode')).toBeVisible();
    await expect(page.locator('#emailSend')).toBeDisabled();
    await page.locator('#emailCode').fill(digits);
    await page.locator('#emailCodeForm button').click();
    await expect(page.locator('#emailTitle')).toHaveText('Почта подтверждена');
    expect(await page.evaluate(async () => (await firebase.auth().currentUser.getIdTokenResult()).claims.email_verified)).toBe(true);
    await page.locator('#profileMonogram').fill('сл');
    await expect(page.locator('input[name="shape"]')).toHaveCount(0);
    await expect(page.locator('#profilePreviewAvatar .profile-mark')).toHaveCSS('border-radius', '25%');
    await page.locator('label[title="Волны"]').click();
    await page.locator('#rankVisible').check();
    await expect(page.locator('#profilePreviewAvatar .profile-mark')).toHaveText('СЛ');
    await expect(page.locator('#profileCard [data-art="waves"]')).toBeVisible();
    await expect(page.locator('#profileCard [data-art="orbit"]')).toBeHidden();
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
        await expect(page.getByRole('button', { name: 'Настройки', exact: true })).toHaveCount(1);
    }
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await expect(page.locator('#settingsModal')).toBeVisible();
    await page.locator('#settingsDoneBtn').click();

    const other = await context.newPage();
    await other.goto('/profile.html');
    await expect(other.locator('#profileNickname')).toHaveValue('Северный Лис');
    await expect(other.locator('#emailTitle')).toHaveText('Почта подтверждена');
    await expect(other.locator('#profileCard')).toHaveAttribute('data-cover', 'waves');
    await expect(other.locator('#profilePreviewAvatar .profile-mark')).toHaveCSS('border-radius', '25%');
    await expect(other.locator('#rankVisible')).toBeChecked();
    await expect(other.locator('#profileMemeIcons label[title="67"]')).toBeVisible();
    await expect(other.locator('#profileMemeIcons label[title="Z"]')).toBeVisible();
    for (const [group, value] of [['avatar', 'sixseven'], ['background', 'plasma'], ['cover', 'fireflies']]) {
        await other.locator(`label:has(input[name="${group}"][value="${value}"])`).click();
    }
    await other.locator('#profileSave').click();
    await expect(other.locator('#profileStatus')).toHaveText('Изменения сохранены');
    await expect(page.locator('#profileCard')).toHaveAttribute('data-cover', 'fireflies');
    await expect(page.locator('#profileCard [data-art="fireflies"]')).toBeVisible();
    await page.locator('#profileCard').scrollIntoViewIfNeeded();
    await expect(page.locator('#profileCoverArt .profile-cover-float').first()).toHaveCSS('animation-name', 'profile-cover-drift');
    await expect(page.locator('#profileCoverArt .profile-cover-float').first()).toHaveCSS('animation-play-state', 'running');
    await expect(page.locator('#profileCovers [data-art="fireflies"] .profile-cover-float').first()).toHaveCSS('animation-name', 'none');
    await expect(page.locator('#accountBtn .profile-mark')).toHaveAttribute('data-profile-background', 'plasma');
    await expect(page.locator('#accountBtn .profile-mark')).toHaveCSS('border-radius', '25%');
    await page.locator('#profileNickname').fill('Новый ник');
    await other.locator('label[title="Янтарь"]').click();
    await other.locator('#profileSave').click();
    await expect(page.locator('#profileColorName')).toHaveText('Янтарь');
    await expect(page.locator('#profileNickname')).toHaveValue('Новый ник');
    // A rejected save must leave the typed name available for a second attempt.
    await page.evaluate(() => {
        const prototype = Object.getPrototypeOf(firebase.database().ref());
        const original = prototype.update;
        prototype.update = function (patch, ...rest) {
            if (!Object.hasOwn(patch, 'identity/nickname')) return original.call(this, patch, ...rest);
            prototype.update = original;
            return Promise.reject(new Error('Simulated save refusal'));
        };
    });
    await page.locator('#profileSave').click();
    await expect(page.locator('#profileStatus')).toContainText('Не удалось сохранить');
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

    await page.setViewportSize({ width: 390, height: 844 });
    const image = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 720;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#206ca6';
        ctx.fillRect(0, 0, 720, 480);
        ctx.fillStyle = '#f09568';
        ctx.fillRect(280, 70, 350, 300);
        return canvas.toDataURL('image/png').split(',')[1];
    });
    const file = { name: 'profile-picture.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') };
    for (const [fileInput, label] of [
        ['#profileAvatarFile', 'Кадрирование аватара'],
        ['#profileCoverFile', 'Кадрирование обложки']
    ]) {
        await page.locator(fileInput).setInputFiles(file);
        const crop = page.getByRole('dialog', { name: label });
        const apply = crop.getByRole('button', { name: 'Применить', exact: true });
        await expect(apply).toBeEnabled();
        await apply.click();
        await expect(crop).toBeHidden();
    }
    const avatarPhoto = page.locator('#profilePreviewAvatar .profile-photo');
    const coverPhoto = page.locator('#profileCoverArt .profile-cover-photo');
    await expect.poll(() => avatarPhoto.evaluate(img => [img.naturalWidth, img.naturalHeight])).toEqual([320, 320]);
    await expect.poll(() => coverPhoto.evaluate(img => [img.naturalWidth, img.naturalHeight])).toEqual([1080, 360]);
    await expect(page.locator('#accountBtn .profile-photo')).toHaveCount(0);
    await page.locator('#profileSave').click();
    await expect(page.locator('#profileStatus')).toHaveText('Изменения сохранены');
    await expect(page.locator('#accountBtn .profile-photo')).toBeVisible();
    await page.reload();
    await expect(avatarPhoto).toBeVisible();
    await expect(coverPhoto).toBeVisible();
    await page.locator('#profileAvatarRemove').click();
    await page.locator('label[title="Светлячки"]').click();
    await expect(avatarPhoto).toHaveCount(0);
    await expect(coverPhoto).toHaveCount(0);
    await expect(page.locator('#profileCard [data-art="fireflies"]')).toBeVisible();
    await page.locator('#profileSave').click();
    await expect(page.locator('#profileStatus')).toHaveText('Изменения сохранены');
    await expect(page.locator('#accountBtn .profile-photo')).toHaveCount(0);

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
