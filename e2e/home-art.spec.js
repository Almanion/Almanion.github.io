'use strict';

const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

const reviewSources = { notes: 'noteReviewInbox', art: 'homeArt/submissions' };
const sharedReviewId = 'pending0000000000000';

async function prepareHomepage(page, { actor = 'editor', existing = false, unavailable = [], initialArt = [] } = {}) {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(({ actor, existing, unavailable, initialArt, reviewSources, sharedReviewId }) => {
        const owner = '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';
        const userFor = uid => uid ? { uid, email: uid + '@example.com', emailVerified: true } : null;
        const publishedStroke = { color: '#78d8b7', size: 15, erase: false, points: [3500, 5000, 6500, 5000] };
        const data = {
            'adminRoles/editor': { contentEditor: true }, 'adminRoles/editor/contentEditor': true,
            'homeArt/published': existing ? { revision: 'published00000000000', drawing: JSON.stringify([publishedStroke]), publishedAt: Date.now() } : null,
            [reviewSources.art]: {},
            [reviewSources.notes]: {}
        };
        const snapshot = value => ({
            val: () => value ?? null,
            exists: () => value != null,
            forEach(fn) {
                Object.entries(value || {}).forEach(([key, child]) => fn({ ...snapshot(child), key }));
            }
        });
        const listeners = new Set();
        const failures = new Set(unavailable.map(kind => reviewSources[kind]));
        const reads = [];
        const notify = path => {
            for (const item of listeners) if (item.path === path) item.notify();
        };
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
                on(type, fn, onError) {
                    if (failures.has(path)) {
                        queueMicrotask(() => onError?.(new Error('Test source unavailable')));
                        return;
                    }
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
                            notify(path);
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
            reviewListenerCount: () => [...listeners].filter(item => Object.values(reviewSources).includes(item.path)).length,
            recover(kind) { failures.delete(reviewSources[kind]); },
            publish(row) {
                data['homeArt/published'] = {
                    revision: 'published00000000000', drawing: row.drawing, photo: row.photo, aspect: row.aspect, publishedAt: Date.now()
                };
                notify('homeArt/published');
            },
            incoming(kind = 'art', id = sharedReviewId, fields = {}) {
                const path = reviewSources[kind];
                const details = kind === 'notes'
                    ? { title: 'Тепловые явления', subject: 'physics-10', sectionId: 'heat', revision: 2 }
                    : { baseRevision: 'none', drawing: JSON.stringify([publishedStroke]) };
                data[path][id] = {
                    ...details, authorUid: 'editor', authorEmail: 'editor@example.com',
                    status: 'pending', submittedAt: Date.now(), ...fields
                };
                notify(path);
            },
            resolve(kind, id = sharedReviewId) {
                const path = reviewSources[kind];
                data[path][id].status = 'published';
                notify(path);
            }
        };
        for (const { id, ...fields } of initialArt) window.artFixture.incoming('art', id, fields);
    }, { actor, existing, unavailable, initialArt, reviewSources, sharedReviewId });
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
    await expect(publicPhoto).toHaveCSS('object-fit', 'cover');
    await expect(publicPhoto).toHaveCSS('object-position', '50% 50%');
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
    expect(entry.aspect).toBeCloseTo(320 / 740, 4);

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

test('homepage drawings keep their proportions from portrait to a wide display', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await prepareHomepage(page);
    await page.getByRole('button', { name: 'Фон главной' }).click();
    const dialog = page.getByRole('dialog', { name: 'Фон главной' });
    await expect(dialog).toBeVisible();
    await page.mouse.move(104, 250);
    await page.mouse.down();
    for (const [x, y] of [[194, 250], [194, 340], [104, 340], [104, 250]]) {
        await page.mouse.move(x, y, { steps: 6 });
    }
    await page.mouse.up();
    await dialog.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
    const canvas = page.locator('#homeArtBackground');
    await expect(canvas).toBeVisible();
    await page.setViewportSize({ width: 1060, height: 690 });
    await expect.poll(() => canvas.evaluate(scene => {
        if (scene.width / scene.height < 1.5) return false;
        const { width, height } = scene;
        const pixels = scene.getContext('2d').getImageData(0, 0, width, height).data;
        let left = width, top = height, right = -1, bottom = -1;
        for (let offset = 3; offset < pixels.length; offset += 4) {
            if (pixels[offset] < 32) continue;
            const index = (offset - 3) / 4;
            const x = index % width, y = Math.floor(index / width);
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
        }
        return right > left && bottom > top && Math.abs((right - left) / (bottom - top) - 1) < .037;
    })).toBe(true);
});

test('visitors see the approved art and only the owner receives review notices', async ({ page }) => {
    await prepareHomepage(page, { actor: 'owner', existing: true });
    await expect(page.locator('#homeArtBackground')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Фон главной' })).toBeVisible();
    const bell = page.locator('#accountNotificationsBtn');
    await bell.click();
    const inbox = page.getByRole('dialog', { name: 'Уведомления', exact: true });
    await expect(inbox.getByText('Нет заявок на проверку')).toBeVisible();
    await page.evaluate(() => window.artFixture.incoming());
    await expect(bell.locator('.account-review-count')).toHaveText('1');
    await expect(inbox.locator('a[data-kind="art"]')).toBeVisible();
    await page.evaluate(() => window.artFixture.switchUser('student'));
    await expect(inbox).toBeHidden();
    await expect(bell).toBeHidden();
    await expect(page.getByText('editor@example.com', { exact: true })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.artFixture.reviewListenerCount())).toBe(0);
    await page.evaluate(() => window.artFixture.switchUser(null));
    await expect(page.getByRole('button', { name: 'Фон главной' })).toBeHidden();
    await expect(page.locator('#accountBtn .account-review-count')).toHaveCount(0);
    await expect(page.locator('#homeArtBackground')).toBeVisible();
});

test('owner sees live grouped review types and exact links from the bell', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await prepareHomepage(page, { actor: 'owner' });
    await page.evaluate(() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        artFixture.incoming('notes', undefined, { submittedAt: yesterday.getTime() });
        artFixture.incoming('art');
    });

    const bell = page.locator('#accountNotificationsBtn');
    const badge = bell.locator('.account-review-count');
    await expect(badge).toHaveText('2');
    await bell.focus();
    await page.keyboard.press('Enter');
    const inbox = page.getByRole('dialog', { name: 'Уведомления', exact: true });
    await expect(inbox).toBeVisible();
    await expect(inbox.getByRole('button', { name: 'Все' })).toHaveAttribute('aria-pressed', 'true');
    const note = inbox.locator('a[href*="admin.html?review="]');
    const art = inbox.locator('a[href*="#background-review"][href*="?review="]');
    await expect(note).toHaveText(/Тепловые явления/);
    await expect(note).toHaveAttribute('href', new RegExp('admin\\.html\\?review=' + sharedReviewId + '#reviews$'));
    await expect(art).toHaveAttribute('href', new RegExp('index\\.html\\?review=' + sharedReviewId + '#background-review$'));
    const reviewUrls = await inbox.locator('a[href*="?review="]').evaluateAll(links => links.map(link => link.hash));
    expect(reviewUrls).toEqual(['#background-review', '#reviews']);
    await expect(inbox.getByText(/^Сегодня$/)).toBeVisible();
    await expect(inbox.getByText(/^Вчера$/)).toBeVisible();

    await inbox.getByRole('button', { name: 'Конспекты' }).click();
    await expect(note).toBeVisible();
    await expect(art).toBeHidden();
    await inbox.getByRole('button', { name: 'Фон', exact: true }).click();
    await expect(note).toBeHidden();
    await expect(art).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(inbox).toBeHidden();
    await expect(bell).toBeFocused();
    await expect(badge).toHaveText('2');
    await page.evaluate(() => artFixture.resolve('notes'));
    await expect(badge).toHaveText('1');
    await bell.click();
    await expect(art).toBeVisible();
    await page.evaluate(() => artFixture.resolve('art'));
    await expect(inbox.getByText('Нет заявок на проверку')).toBeVisible();
    await expect(badge).toBeHidden();
});

test('clicking the older artwork notification opens that version in homepage review', async ({ page }) => {
    await prepareHomepage(page, {
        actor: 'owner',
        initialArt: [
            { id: 'newer000000000000000', authorEmail: 'newer@example.com' },
            { id: sharedReviewId, authorEmail: 'target@example.com', submittedAt: Date.now() - 300_000 }
        ]
    });
    await page.locator('#accountNotificationsBtn').click();
    const inbox = page.getByRole('dialog', { name: 'Уведомления', exact: true });
    await inbox.locator('a[href*="?review=' + sharedReviewId + '#background-review"]').click();
    await expect(page.locator('.home-art-review-title')).toContainText('target@example.com');
    await expect(page).toHaveURL(/index\.html#background-review$/);
});

test('on a narrow phone the notification panel stays usable while retrying an unavailable source', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await prepareHomepage(page, { actor: 'owner', unavailable: ['notes'] });
    await page.evaluate(() => {
        for (let i = 0; i < 11; i++) {
            artFixture.incoming('art', String(i).padStart(20, '0'), { submittedAt: Date.now() - i * 60_000 });
        }
    });
    const bell = page.locator('#accountNotificationsBtn');
    await bell.click();
    const inbox = page.getByRole('dialog', { name: 'Уведомления', exact: true });
    const retry = inbox.getByRole('button', { name: 'Повторить' });
    const close = inbox.getByRole('button', { name: 'Закрыть уведомления' });
    await expect(retry).toBeVisible();
    await expect(inbox.locator('a[href*="#background-review"][href*="?review="]')).toHaveCount(11);
    await expect.poll(() => inbox.evaluate(panel => {
        const bounds = panel.getBoundingClientRect();
        return bounds.left >= -1 && bounds.right <= innerWidth + 1
            && bounds.top >= -1 && bounds.bottom <= innerHeight + 1
            && panel.scrollWidth <= panel.clientWidth + 1
            && document.documentElement.scrollWidth <= innerWidth + 1;
    })).toBe(true);

    await page.evaluate(() => {
        artFixture.incoming('notes');
        artFixture.recover('notes');
    });
    await retry.click();
    await expect(retry).toBeHidden();
    await expect(inbox.getByRole('link', { name: /Тепловые явления/ })).toBeVisible();
    await expect(bell.locator('.account-review-count')).toHaveText('12');
    const lastCard = inbox.locator('a[href*="#background-review"][href*="?review="]').last();
    await lastCard.scrollIntoViewIfNeeded();
    await expect(lastCard).toBeInViewport();
    await expect(close).toBeInViewport();
    await close.click();
    await expect(bell).toBeFocused();
});
