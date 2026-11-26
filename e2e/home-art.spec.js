'use strict';

const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

async function prepareHomepage(page, { actor = 'editor', existing = false } = {}) {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(({ actor, existing }) => {
        const owner = '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';
        const userFor = uid => uid ? { uid, email: uid + '@example.com', emailVerified: true } : null;
        const publishedStroke = { color: '#78d8b7', size: 15, erase: false, points: [3500, 5000, 6500, 5000] };
        const data = {
            'adminRoles/editor': { contentEditor: true }, 'adminRoles/editor/contentEditor': true,
            'homeArt/published': existing ? { revision: 'published00000000000', drawing: JSON.stringify([publishedStroke]), publishedAt: Date.now() } : null,
            'homeArt/submissions': {}
        };
        const snapshot = value => ({
            val: () => value ?? null,
            exists: () => value != null,
            forEach(fn) {
                Object.entries(value || {}).forEach(([key, child]) => fn({ ...snapshot(child), key }));
            }
        });
        const listeners = new Set();
        const reads = [];
        let subscriptionId = 1;
        function ref(path, childKey, value) {
            function read() {
                if (!childKey) return snapshot(data[path]);
                return snapshot(Object.fromEntries(Object.entries(data[path] || {}).filter(([, row]) => row[childKey] === value)));
            }
            return {
                child: name => ref(path + '/' + name),
                orderByChild: key => ({ equalTo: expected => ref(path, key, expected) }),
                once: async () => read(),
                on(type, fn) {
                    const item = { path, fn, notify: () => fn(read()) };
                    listeners.add(item);
                    queueMicrotask(item.notify);
                },
                off(type, fn) { for (const item of listeners) if (item.fn === fn) listeners.delete(item); },
                push() {
                    const key = ('r' + subscriptionId++).padEnd(20, '0');
                    return {
                        key,
                        async set(row) {
                            data[path][key] = { ...row, submittedAt: Date.now() };
                            reads.push(row);
                            for (const item of listeners) if (item.path === path) item.notify();
                        }
                    };
                },
                set: async () => {}, update: async () => {}, remove: async () => {},
                transaction: async () => ({ snapshot: read(), committed: false }),
                onDisconnect: () => ({ remove: async () => {}, cancel: async () => {} })
            };
        }
        const authListeners = new Set();
        const auth = {
            currentUser: userFor(actor === 'owner' ? owner : actor),
            useDeviceLanguage() {}, setPersistence: async () => {},
            onAuthStateChanged(callback) {
                authListeners.add(callback);
                setTimeout(() => callback(auth.currentUser), 0);
                return () => authListeners.delete(callback);
            }
        };
        const authFactory = () => auth;
        authFactory.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } };
        const database = () => ({ ref });
        database.ServerValue = { TIMESTAMP: 0 };
        const app = { options: {}, auth: authFactory, database };
        window.firebase = { apps: [app], app: () => app, initializeApp: () => app, auth: authFactory, database };
        window.artFixture = {
            switchUser(uid) { auth.currentUser = userFor(uid); authListeners.forEach(callback => callback(auth.currentUser)); },
            submissions: () => reads,
            publish(row) {
                data['homeArt/published'] = {
                    revision: 'published00000000000', drawing: row.drawing, photo: row.photo, publishedAt: Date.now()
                };
                for (const item of listeners) if (item.path === 'homeArt/published') item.notify();
            },
            incoming() {
                data['homeArt/submissions']['pending0000000000000'] = {
                    authorEmail: 'editor@example.com', status: 'pending', baseRevision: 'none',
                    drawing: JSON.stringify([publishedStroke]), submittedAt: Date.now()
                };
                for (const item of listeners) if (item.path === 'homeArt/submissions') item.notify();
            }
        };
    }, { actor, existing });
    await page.goto('/');
    await expect(page.locator('#accountBtn')).toBeVisible();
    await expect(page.locator('#accountBtn')).not.toHaveClass(/\bis-loading\b/);
}

test('editor can draw, preview on the actual homepage, and submit a restored draft on a phone', async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await prepareHomepage(page);
    const open = page.getByRole('button', { name: 'Фон главной' });
    const dialog = page.getByRole('dialog', { name: 'Фон главной' });
    const submit = dialog.getByRole('button', { name: 'На проверку' });
    await open.click();
    await expect(dialog).toBeVisible();
    await expect(submit).toBeDisabled();
    const chrome = await dialog.evaluate(el => ({
        title: el.querySelector('header').getBoundingClientRect().bottom,
        history: el.querySelector('.home-art-history').getBoundingClientRect().top,
        controls: el.querySelector('.home-art-controls').getBoundingClientRect().bottom
    }));
    expect(chrome.title).toBeLessThan(chrome.history);
    expect(chrome.controls).toBeLessThanOrEqual(740);
    await dialog.getByRole('button', { name: 'Мятный' }).click();
    await page.mouse.move(38, 235);
    await page.mouse.down();
    await page.mouse.move(260, 350, { steps: 16 });
    await page.mouse.up();
    await expect(submit).toBeEnabled();
    await dialog.getByRole('button', { name: 'Отменить штрих' }).click();
    await expect(submit).toBeDisabled();
    await dialog.getByRole('button', { name: 'Повторить штрих' }).click();
    await page.screenshot({ path: info.outputPath('editor-phone.png') });
    await dialog.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#homeArtBackground')).toBeVisible();
    await expect(page.getByText('Предпросмотр фона')).toBeVisible();
    await page.getByRole('button', { name: 'К холсту' }).click();
    await expect(page.locator('#homeArtBackground')).toBeHidden();
    await dialog.getByRole('button', { name: 'Закрыть редактор' }).click();
    await page.reload();
    await open.click();
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(dialog.getByRole('button', { name: 'Отправлено' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Мои рисунки' }).click();
    await expect(dialog.locator('#homeArtOwn')).toContainText('На проверке');
    expect(await page.evaluate(() => JSON.parse(window.artFixture.submissions()[0].drawing)[0].color)).toBe('#78d8b7');
    expect(errors).toEqual([]);
});

test('phone editor keeps a photo beneath the drawing and sends the same composition for approval', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await prepareHomepage(page);
    const open = page.getByRole('button', { name: 'Фон главной' });
    const dialog = page.getByRole('dialog', { name: 'Фон главной' });
    await open.click();
    const photoAction = dialog.getByRole('button', { name: 'Загрузить фото' });
    await expect(photoAction).toBeVisible();
    const image = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 900;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#3a668b';
        ctx.fillRect(0, 0, 900, 600);
        ctx.fillStyle = '#f1b66b';
        ctx.fillRect(300, 220, 340, 190);
        return canvas.toDataURL('image/png').split(',')[1];
    });
    const chooser = page.waitForEvent('filechooser');
    await photoAction.click();
    await (await chooser).setFiles({ name: 'wallpaper.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
    const editorPhoto = dialog.locator('#homeArtCanvasPhoto');
    await expect.poll(() => editorPhoto.evaluate(el => el.naturalWidth)).toBe(900);
    const publicPhoto = page.locator('#homeArtBackgroundPhoto');
    await expect(publicPhoto).toBeHidden();
    await page.mouse.move(38, 235);
    await page.mouse.down();
    await page.mouse.move(235, 347, { steps: 12 });
    await page.mouse.up();
    await dialog.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
    await expect(publicPhoto).toBeVisible();
    await expect(page.locator('#homeArtBackground')).toBeVisible();
    await page.getByRole('button', { name: 'К холсту' }).click();
    await expect(publicPhoto).toBeHidden();
    await dialog.getByRole('button', { name: 'Закрыть редактор' }).click();
    await page.reload();
    await open.click();
    await expect(editorPhoto).toBeVisible();
    const src = await editorPhoto.getAttribute('src');
    await dialog.getByRole('button', { name: 'На проверку', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Отправлено', exact: true })).toBeDisabled();
    const entry = await page.evaluate(() => window.artFixture.submissions()[0]);
    expect('data:image/jpeg;base64,' + entry.photo).toBe(src);
    expect(JSON.parse(entry.drawing)).toHaveLength(1);

    await dialog.getByRole('button', { name: 'Фото фона', exact: true }).click();
    await dialog.getByRole('button', { name: 'Убрать фото', exact: true }).click();
    await expect(editorPhoto).toBeHidden();
    await expect(dialog.getByRole('button', { name: 'На проверку', exact: true })).toBeEnabled();
    await page.evaluate(row => window.artFixture.publish(row), entry);
    await page.evaluate(() => window.artFixture.switchUser(null));
    await expect(dialog).toBeHidden();
    await expect(publicPhoto).toHaveAttribute('src', src);
    await expect(publicPhoto).toBeVisible();
});

test('visitors see the approved art and only the owner receives review notices', async ({ page }) => {
    await prepareHomepage(page, { actor: 'owner', existing: true });
    await expect(page.locator('#homeArtBackground')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Фон главной' })).toBeVisible();
    await page.evaluate(() => window.artFixture.incoming());
    await expect(page.locator('#accountBtn .account-review-count')).toHaveText('1');
    await page.evaluate(() => window.artFixture.switchUser(null));
    await expect(page.getByRole('button', { name: 'Фон главной' })).toBeHidden();
    await expect(page.locator('#accountBtn .account-review-count')).toHaveCount(0);
    await expect(page.locator('#homeArtBackground')).toBeVisible();
});
