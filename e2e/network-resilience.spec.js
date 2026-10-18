'use strict';

const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });

// All Firebase requests terminate in this fixture. It never authenticates a
// real user or sends reads/writes to a backend.
function installSyntheticApp() {
    window.__firebaseEvents = ['app'];
    const snapshot = { val: () => null, exists: () => false, forEach() {} };
    const ref = () => ({
        on() {}, off() {}, child: ref, once: async () => snapshot,
        set: async () => {}, update: async () => {}, remove: async () => {},
        transaction: async () => ({ snapshot, committed: false }), push: ref,
        onDisconnect: () => ({ remove: async () => {}, cancel: async () => {} })
    });
    const auth = {
        currentUser: null, useDeviceLanguage() {}, setPersistence: async () => {},
        onAuthStateChanged(callback) { setTimeout(() => callback(null), 0); return () => {}; },
        signInAnonymously: async () => { throw new Error('Synthetic anonymous fixture'); }
    };
    const authFactory = () => auth;
    authFactory.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } };
    const database = () => ({ ref }); database.ServerValue = { TIMESTAMP: 0 };
    window.__syntheticAuth = authFactory;
    window.__syntheticDatabase = database;
    let app;
    window.firebase = {
        apps: [], app: () => app,
        initializeApp(options, name) {
            app = { options, name: name || '[DEFAULT]', auth: authFactory, database };
            this.apps.push(app); return app;
        }
    };
}

async function holdFirebase(page, fastTimeout = false) {
    if (fastTimeout) await page.addInitScript(() => {
        const original = window.setTimeout;
        window.setTimeout = (callback, delay, ...args) => original(callback, delay === 12000 ? 800 : delay, ...args);
    });
    const appRequests = [];
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1') return route.continue();
        if (url.hostname === 'www.gstatic.com' && url.pathname.includes('firebase-app-compat.js')) {
            appRequests.push(route); return;
        }
        if (url.hostname === 'www.gstatic.com' && url.pathname.includes('firebase-auth-compat.js')) {
            return route.fulfill({ contentType: 'application/javascript', body: 'window.__firebaseEvents.push("auth"); window.firebase.auth = window.__syntheticAuth;' });
        }
        if (url.hostname === 'www.gstatic.com' && url.pathname.includes('firebase-database-compat.js')) {
            return route.fulfill({ contentType: 'application/javascript', body: 'window.__firebaseEvents.push("database"); window.firebase.database = window.__syntheticDatabase;' });
        }
        return route.abort();
    });
    return {
        appRequests,
        async release() {
            expect(appRequests).toHaveLength(1);
            await appRequests[0].fulfill({ contentType: 'application/javascript', body: '(' + installSyntheticApp.toString() + ')();' });
        }
    };
}

test('PDF, bookmarks, personal notes and offline library work while Firebase SDK hangs', async ({ page }) => {
    const cloud = await holdFirebase(page);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/physics-10.html', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => cloud.appRequests.length).toBe(1);
    await page.waitForFunction(() => window.AlmanionSettings?.ready && window.AlmanionPersonalNotes);
    expect(await page.evaluate(() => !!window.AlmanionAccount)).toBe(false);
    const bookmark = page.locator('.definition-box').first().locator('.bookmark-btn');
    await bookmark.click();
    await expect(bookmark).toHaveClass(/bookmarked/);
    await page.locator('#printExportButton').click();
    await expect(page.locator('#printExportDialog')).toBeVisible();
    await expect(page.locator('#printExportButton')).toBeEnabled();
    await page.keyboard.press('Escape');
    await page.locator('#offlineLibraryButton').click();
    await expect(page.locator('.offline-subject')).toHaveCount(9);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => !!window.AlmanionAccount)).toBe(false);
    await cloud.release();
    await page.waitForFunction(() => !!window.AlmanionAccount);
    await expect(page.locator('#accountBtn')).toBeVisible();
    await expect(bookmark).toHaveClass(/bookmarked/);
    expect(errors).toEqual([]);
});

test('account timeout offers retry and initializes only once when the original SDK arrives', async ({ page }) => {
    const cloud = await holdFirebase(page, true);
    await page.goto('/physics-10.html', { waitUntil: 'domcontentloaded' });
    const reconnect = page.locator('#runtimeAccountButton');
    await expect(reconnect).toBeEnabled();
    await expect(reconnect).toHaveAttribute('aria-label', /повторить подключение/);
    await reconnect.click();
    await expect(reconnect).toBeDisabled();
    expect(cloud.appRequests).toHaveLength(1);
    await cloud.release();
    await expect(page.locator('#accountBtn')).toBeVisible();
    await expect(reconnect).toHaveCount(0);
    await expect(page.locator('#accountOverlay')).toBeVisible();
    expect(await page.evaluate(() => window.__firebaseEvents.filter(event => event === 'app').length)).toBe(1);
    expect(await page.evaluate(() => window.AlmanionAccount.getUser())).toBeNull();
});

test('late local account module replaces the reconnect button after its own timeout', async ({ page }) => {
    const cloud = await holdFirebase(page, true);
    const accountRequests = [];
    await page.route('**/account.js?*', route => { accountRequests.push(route); });
    await page.goto('/physics-10.html', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => cloud.appRequests.length).toBe(1);
    await cloud.release();
    await expect.poll(() => accountRequests.length).toBe(1);
    await expect(page.locator('#runtimeAccountButton')).toBeEnabled();
    expect(await page.evaluate(() => !!window.AlmanionAccount)).toBe(false);
    await accountRequests[0].fulfill({ response: await accountRequests[0].fetch() });
    await expect(page.locator('#accountBtn')).toBeVisible();
    await expect(page.locator('#runtimeAccountButton')).toHaveCount(0);
    await page.locator('#accountBtn').click();
    await expect(page.locator('#accountOverlay')).toBeVisible();
    expect(accountRequests).toHaveLength(1);
});

test('home settings and navigation initialize before a stalled SDK, then account restores after its timeout', async ({ page }) => {
    const cloud = await holdFirebase(page, true);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => cloud.appRequests.length).toBe(1);
    await page.waitForFunction(() => window.AlmanionSettings?.ready && window.AlmanionHomeDashboard);
    await page.locator('#gradeTab9').click();
    await expect(page.locator('#gradePanel9')).toBeVisible();
    await page.locator('#settingsButton').click();
    await expect(page.locator('#settingsModal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#runtimeAccountButton')).toBeEnabled();
    expect(await page.evaluate(() => !!window.AlmanionAccount)).toBe(false);
    // No second click: a late successful response must resume initialization.
    await cloud.release();
    await page.waitForFunction(() => !!window.AlmanionAccount);
    await expect(page.locator('#homeControls #accountBtn')).toBeVisible();
    await expect(page.locator('#runtimeAccountButton')).toHaveCount(0);
    await page.locator('#accountBtn').click();
    await expect(page.locator('#accountOverlay')).toBeVisible();
    expect(await page.evaluate(() => window.__firebaseEvents.slice().sort())).toEqual(['app', 'auth', 'database']);
    expect(errors).toEqual([]);
});
