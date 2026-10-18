'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const root = path.resolve(__dirname, '..');
const accountSource = fs.readFileSync(path.join(root, 'account.js'), 'utf8');
const accountStyles = fs.readFileSync(path.join(root, 'styles', 'site', '00-components.css'), 'utf8');

// Exercise the real account module with an isolated SDK; never send email or
// connect to the project's Firebase account/database from these tests.
function installAccountStub({ persistenceFailure = false } = {}) {
    const state = window.accountTest = { resetCalls: [], loginCalls: [], registerCalls: [], googleCalls: 0, resetError: '', resetPending: false };
    const auth = {
        useDeviceLanguage() {},
        setPersistence: () => persistenceFailure ? Promise.reject({ code: 'auth/web-storage-unsupported' }) : Promise.resolve(),
        onAuthStateChanged(callback) { setTimeout(() => callback(null), 0); return () => {}; },
        sendPasswordResetEmail(email) {
            state.resetCalls.push(email);
            if (state.resetPending) return new Promise((resolve, reject) => { state.finishReset = code => code ? reject({ code }) : resolve(); });
            return state.resetError ? Promise.reject({ code: state.resetError, message: 'Private account details' }) : Promise.resolve();
        },
        signInWithEmailAndPassword(email, password) { state.loginCalls.push({ email, password }); return Promise.resolve(); },
        createUserWithEmailAndPassword(email, password) { state.registerCalls.push({ email, password }); return Promise.resolve(); },
        signInWithPopup() { state.googleCalls++; return Promise.resolve(); }
    };
    const authFactory = () => auth;
    authFactory.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } };
    authFactory.GoogleAuthProvider = function () { this.setCustomParameters = () => {}; };
    window.firebaseConfig = {};
    window.firebase = { apps: [{}], auth: authFactory, database: () => ({ ref: () => ({ off() {} }) }) };
}

async function openAccount(page, options = {}) {
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1') return route.abort();
        if (url.pathname === '/__account-password-reset-test.html') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Account test</title><link rel="stylesheet" href="/__account-test.css"><style>:root { --text-primary: #122030; --text-secondary: #536173; --bg-primary: white; --bg-secondary: #f5f6f8; --bg-tertiary: #eef1f6; --border-color: #ccd3dd; --accent-color: #2868bd; --error-color: #b82020; } body { font-family: sans-serif; }</style><body class="home-page"><div id="homeControls"></div><script src="/__account-test.js"></script></body></html>' });
        if (url.pathname === '/__account-test.js') return route.fulfill({ contentType: 'text/javascript', body: accountSource });
        if (url.pathname === '/__account-test.css') return route.fulfill({ contentType: 'text/css', body: accountStyles });
        return route.abort();
    });
    await page.addInitScript(installAccountStub, options);
    await page.goto('/__account-password-reset-test.html');
    await page.getByRole('button', { name: 'Войти в аккаунт', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Вход в аккаунт' })).toBeVisible();
}

test.use({ serviceWorkers: 'block' });

test('recovery validates the email, deduplicates pending requests and returns to login', async ({ page }) => {
    await openAccount(page);
    await page.getByLabel('Почта', { exact: true }).fill('student@example.invalid');
    await page.getByLabel('Пароль', { exact: true }).fill('oldpassword');
    await page.getByRole('button', { name: 'Забыли пароль?' }).click();
    await expect(page.getByRole('dialog', { name: 'Восстановление пароля' })).toBeVisible();
    await expect(page.getByLabel('Почта', { exact: true })).toHaveValue('student@example.invalid');
    await expect(page.locator('#accPass')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.accountTest.resetCalls.length)).toBe(0);

    await page.getByLabel('Почта', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Отправить письмо' }).click();
    await page.getByLabel('Почта', { exact: true }).fill('invalid');
    await page.getByRole('button', { name: 'Отправить письмо' }).click();
    expect(await page.evaluate(() => window.accountTest.resetCalls)).toEqual([]);
    await page.getByLabel('Почта', { exact: true }).fill(' student@example.invalid ');
    await page.evaluate(() => { window.accountTest.resetPending = true; });
    await page.getByRole('button', { name: 'Отправить письмо' }).click();
    await expect(page.getByRole('status')).toHaveText('Отправляем письмо…');
    await expect(page.locator('#accForm')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('button', { name: 'Отправляем…' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Вернуться ко входу' })).toBeDisabled();
    await page.locator('#accForm').dispatchEvent('submit');
    expect(await page.evaluate(() => window.accountTest.resetCalls)).toEqual(['student@example.invalid']);
    await page.evaluate(() => window.accountTest.finishReset());
    await expect(page.getByRole('status')).toContainText('Если для этой почты доступно восстановление пароля');
    await expect(page.getByRole('button', { name: 'Отправить письмо' })).toBeEnabled();
    await page.getByRole('button', { name: 'Вернуться ко входу' }).click();
    await expect(page.getByLabel('Почта', { exact: true })).toHaveValue('student@example.invalid');
    await expect(page.getByLabel('Пароль', { exact: true })).toHaveValue('');
    await page.getByLabel('Пароль', { exact: true }).fill('newpassword');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(await page.evaluate(() => window.accountTest.loginCalls)).toEqual([{ email: 'student@example.invalid', password: 'newpassword' }]);
});

for (const code of ['auth/user-not-found', 'auth/user-disabled']) {
    test(`recovery does not reveal account existence for ${code}`, async ({ page }) => {
        await openAccount(page);
        await page.getByRole('button', { name: 'Забыли пароль?' }).click();
        await page.getByLabel('Почта', { exact: true }).fill('student@example.invalid');
        await page.evaluate(error => { window.accountTest.resetError = error; }, code);
        await page.getByRole('button', { name: 'Отправить письмо' }).click();
        await expect(page.getByRole('status')).toContainText('Если для этой почты доступно восстановление пароля');
        await expect(page.getByRole('alert')).toBeHidden();
    });
}

test('a failed recovery shows a useful error and permits retry', async ({ page }) => {
    await openAccount(page);
    await page.getByRole('button', { name: 'Забыли пароль?' }).click();
    await page.getByLabel('Почта', { exact: true }).fill('student@example.invalid');
    await page.evaluate(() => { window.accountTest.resetError = 'auth/network-request-failed'; });
    await page.getByRole('button', { name: 'Отправить письмо' }).click();
    await expect(page.getByRole('alert')).toContainText('нет связи с сервером');
    await expect(page.getByRole('status')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Отправить письмо' })).toBeEnabled();
    await page.evaluate(() => { window.accountTest.resetError = ''; });
    await page.getByRole('button', { name: 'Отправить письмо' }).click();
    await expect(page.getByRole('alert')).toBeHidden();
    await expect(page.getByRole('status')).toContainText('Проверьте входящие');
});

test('a pending recovery can be dismissed without writing its later error into a new login form', async ({ page }) => {
    await openAccount(page);
    await page.getByRole('button', { name: 'Забыли пароль?' }).click();
    await page.getByLabel('Почта', { exact: true }).fill('student@example.invalid');
    await page.evaluate(() => { window.accountTest.resetPending = true; });
    await page.getByRole('button', { name: 'Отправить письмо' }).click();
    await expect(page.getByRole('status')).toHaveText('Отправляем письмо…');
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('button', { name: 'Войти в аккаунт', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Вход в аккаунт' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeDisabled();
    await page.evaluate(() => window.accountTest.finishReset('auth/network-request-failed'));
    await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeEnabled();
    await expect(page.getByRole('alert')).toBeHidden();
    expect(await page.evaluate(() => window.accountTest.resetCalls)).toEqual(['student@example.invalid']);
    expect(await page.evaluate(() => window.accountTest.loginCalls)).toEqual([]);
    expect(await page.evaluate(() => window.accountTest.registerCalls)).toEqual([]);
});

test('password recovery works even when sign-in persistence is blocked', async ({ page }) => {
    await openAccount(page, { persistenceFailure: true });
    await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Забыли пароль?' }).click();
    await page.getByLabel('Почта', { exact: true }).fill('student@example.invalid');
    await expect(page.getByRole('button', { name: 'Отправить письмо' })).toBeEnabled();
    await page.getByRole('button', { name: 'Отправить письмо' }).click();
    await expect(page.getByRole('status')).toContainText('Проверьте входящие');
    await expect(page.getByRole('alert')).toBeHidden();
});

test('registration validation and Google login remain available', async ({ page }) => {
    await openAccount(page);
    await page.getByRole('button', { name: 'Нет аккаунта? Зарегистрироваться' }).click();
    await page.getByLabel('Почта', { exact: true }).fill('student@example.invalid');
    await page.getByLabel('Пароль', { exact: true }).fill('newpassword');
    await page.getByLabel('Повторите пароль', { exact: true }).fill('differentpassword');
    await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Пароли не совпадают');
    expect(await page.evaluate(() => window.accountTest.registerCalls)).toEqual([]);
    await page.getByLabel('Повторите пароль', { exact: true }).fill('newpassword');
    await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(await page.evaluate(() => window.accountTest.registerCalls)).toEqual([{ email: 'student@example.invalid', password: 'newpassword' }]);
    await page.getByRole('button', { name: 'Войти в аккаунт', exact: true }).click();
    await page.getByRole('button', { name: 'Войти через Google' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(await page.evaluate(() => window.accountTest.googleCalls)).toBe(1);
    expect(await page.evaluate(() => window.accountTest.resetCalls)).toEqual([]);
});
