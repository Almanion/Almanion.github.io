'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const root = path.resolve(__dirname, '..');
const accountSource = fs.readFileSync(path.join(root, 'account.js'), 'utf8');
const accountStyles = fs.readFileSync(path.join(root, 'styles', 'site', '00-components.css'), 'utf8');

// Exercise the real account module with an isolated SDK; never send email or
// connect to the project's Firebase account/database from these tests.
function installAccountStub({ persistenceFailure = false, appleEnabled = false, signedIn = false } = {}) {
    const state = window.accountTest = {
        resetCalls: [], loginCalls: [], registerCalls: [], googleCalls: 0,
        appleCalls: [], appleLinks: [], resetError: '', resetPending: false
    };
    const snapshotProvider = ({ providerId, scopes }) => ({ providerId, scopes });
    const member = {
        uid: 'existing-student',
        email: 'student@example.invalid',
        emailVerified: true,
        displayName: 'Ученик',
        providerData: [{ providerId: 'password' }],
        linkWithPopup(provider) {
            state.appleLinks.push({ uid: this.uid, ...snapshotProvider(provider) });
            this.providerData.push({ providerId: provider.providerId });
            return Promise.resolve({ user: this });
        }
    };
    const sessionListeners = new Set();
    const auth = {
        currentUser: signedIn ? member : null,
        useDeviceLanguage() {},
        setPersistence: () => persistenceFailure ? Promise.reject({ code: 'auth/web-storage-unsupported' }) : Promise.resolve(),
        onAuthStateChanged(callback) {
            sessionListeners.add(callback);
            setTimeout(() => callback(auth.currentUser), 0);
            return () => sessionListeners.delete(callback);
        },
        sendPasswordResetEmail(email) {
            state.resetCalls.push(email);
            if (state.resetPending) return new Promise((resolve, reject) => { state.finishReset = code => code ? reject({ code }) : resolve(); });
            return state.resetError ? Promise.reject({ code: state.resetError, message: 'Private account details' }) : Promise.resolve();
        },
        signInWithEmailAndPassword(email, password) { state.loginCalls.push({ email, password }); return Promise.resolve(); },
        createUserWithEmailAndPassword(email, password) { state.registerCalls.push({ email, password }); return Promise.resolve(); },
        signInWithPopup(provider) {
            if (provider.providerId !== 'apple.com') { state.googleCalls++; return Promise.resolve(); }
            state.appleCalls.push(snapshotProvider(provider));
            return new Promise((resolve, reject) => {
                state.finishApple = code => {
                    if (code) { reject({ code, message: 'Private OAuth response' }); return; }
                    auth.currentUser = {
                        uid: 'apple-student', email: 'student@privaterelay.appleid.com', emailVerified: true,
                        providerData: [{ providerId: 'apple.com' }]
                    };
                    sessionListeners.forEach(callback => callback(auth.currentUser));
                    resolve({ user: auth.currentUser });
                };
            });
        }
    };
    const authFactory = () => auth;
    authFactory.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } };
    authFactory.GoogleAuthProvider = function () { this.setCustomParameters = () => {}; };
    authFactory.OAuthProvider = class {
        constructor(providerId) { this.providerId = providerId; this.scopes = []; }
        addScope(scope) { this.scopes.push(scope); }
        setCustomParameters() {}
    };
    const database = () => ({ ref: () => ({ on() {}, off() {}, set: async () => {}, once: async () => ({ val: () => null }) }) });
    database.ServerValue = { TIMESTAMP: {} };
    window.appleAuthEnabled = appleEnabled;
    window.firebaseConfig = {};
    window.firebase = { apps: [{}], auth: authFactory, database };
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
    const name = options.signedIn ? 'Аккаунт: Ученик' : 'Войти в аккаунт';
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('dialog', { name: options.signedIn ? 'Ученик' : 'Вход в аккаунт' })).toBeVisible();
}

test.use({ serviceWorkers: 'block' });

test('forecast login on a phone waits for an input tap and fits above the keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(installAccountStub);
    await page.addInitScript(() => localStorage.setItem('almanion:forecast:guide-seen:v1', '1'));
    await page.goto('/physics-forecast.html');
    await page.locator('#gateAction').click();
    await expect(page.locator('#accTitle')).toBeFocused();
    const password = page.locator('#accPass');
    await password.click();
    await expect(password).toBeFocused();
    // Model the part of the viewport left above a soft keyboard.
    await page.evaluate(() => {
        Object.defineProperties(visualViewport, { offsetTop: { value: 36 }, height: { value: 250 } });
        visualViewport.dispatchEvent(new Event('resize'));
    });
    await expect.poll(() => page.locator('#accountOverlay').evaluate(overlay => {
        const frame = overlay.getBoundingClientRect();
        const active = document.activeElement.getBoundingClientRect();
        const close = overlay.querySelector('#accClose').getBoundingClientRect();
        return frame.top === 36 && frame.height === 250 && active.top >= frame.top
            && active.bottom <= frame.bottom && close.top >= frame.top && close.bottom <= frame.bottom;
    })).toBe(true);
    await page.locator('#accClose').click();
    await expect(page.getByRole('dialog', { name: 'Вход в аккаунт' })).toBeHidden();
});

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
    await expect(page.getByRole('link', { name: 'Подтвердить почту' })).toHaveAttribute('href', /profile\.html#email$/);
    await page.getByRole('button', { name: 'Позже' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(await page.evaluate(() => window.accountTest.registerCalls)).toEqual([{ email: 'student@example.invalid', password: 'newpassword' }]);
    await page.getByRole('button', { name: 'Войти в аккаунт', exact: true }).click();
    await page.getByRole('button', { name: 'Войти через Google' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(await page.evaluate(() => window.accountTest.googleCalls)).toBe(1);
    expect(await page.evaluate(() => window.accountTest.resetCalls)).toEqual([]);
});

test('Apple login is hidden until the provider is enabled', async ({ page }) => {
    await openAccount(page);
    await expect(page.locator('#accApple')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Войти через Google' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeEnabled();
});

test('Apple login requests the expected scopes and opens a registered session', async ({ page }) => {
    await openAccount(page, { appleEnabled: true });
    const apple = page.getByRole('button', { name: 'Вход с Apple', exact: true });
    const google = page.getByRole('button', { name: 'Войти через Google' });
    const emailLogin = page.getByRole('button', { name: 'Войти', exact: true });
    await apple.click();
    expect(await page.evaluate(() => window.accountTest.appleCalls)).toEqual([
        { providerId: 'apple.com', scopes: expect.arrayContaining(['email', 'name']) }
    ]);
    await expect(google).toBeDisabled();
    await expect(emailLogin).toBeDisabled();
    await page.evaluate(() => window.accountTest.finishApple());
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Аккаунт: student@privaterelay.appleid.com' })).toBeVisible();
    expect(await page.evaluate(() => window.AlmanionAccount.getUser().uid)).toBe('apple-student');
});

for (const [code, fallback] of [
    ['auth/popup-closed-by-user', 'email'],
    ['auth/popup-blocked', 'google']
]) {
    test(`Apple popup ${code} preserves the form and allows ${fallback} sign-in`, async ({ page }) => {
        await openAccount(page, { appleEnabled: true });
        const email = page.getByLabel('Почта', { exact: true });
        const password = page.getByLabel('Пароль', { exact: true });
        await email.fill('student@example.invalid');
        await password.fill('test-password-123');
        const apple = page.locator('#accApple');
        const google = page.getByRole('button', { name: 'Войти через Google' });
        await apple.click();
        await page.evaluate(error => window.accountTest.finishApple(error), code);
        await expect(apple).toBeEnabled();
        await expect(google).toBeEnabled();
        await expect(email).toHaveValue('student@example.invalid');
        await expect(password).toHaveValue('test-password-123');
        const error = page.getByRole('alert');
        await expect(error).toContainText('Apple');
        await expect(error).not.toContainText('Private OAuth response');
        if (fallback === 'google') {
            await google.click();
            expect(await page.evaluate(() => window.accountTest.googleCalls)).toBe(1);
        } else {
            await page.getByRole('button', { name: 'Войти', exact: true }).click();
            expect(await page.evaluate(() => window.accountTest.loginCalls)).toEqual([
                { email: 'student@example.invalid', password: 'test-password-123' }
            ]);
        }
        await expect(page.getByRole('dialog')).toBeHidden();
    });
}

test('an existing member can choose to link Apple while retaining the same UID', async ({ page }) => {
    await openAccount(page, { appleEnabled: true, signedIn: true });
    const link = page.getByRole('button', { name: 'Привязать Apple', exact: true });
    await expect(link).toBeHidden();
    await page.getByText('Добавить вход с Apple', { exact: true }).click();
    await expect(link).toBeVisible();
    expect(await page.evaluate(() => window.accountTest.appleLinks)).toEqual([]);
    await link.click();
    await expect(page.getByText('Вход с Apple подключён', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => ({
        user: window.AlmanionAccount.getUser().uid,
        links: window.accountTest.appleLinks,
        logins: window.accountTest.appleCalls
    }))).toEqual({
        user: 'existing-student',
        links: [{ uid: 'existing-student', providerId: 'apple.com', scopes: expect.arrayContaining(['email', 'name']) }],
        logins: []
    });
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await page.getByRole('button', { name: 'Аккаунт: Ученик' }).click();
    await expect(page.getByText('Вход с Apple подключён', { exact: true })).toBeVisible();
    await expect(link).toHaveCount(0);
});
