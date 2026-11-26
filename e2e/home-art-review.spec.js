'use strict';

const { test, expect } = require('@playwright/test');

function reviewFixture() {
    const now = Date.now();
    const stroke = { color: '#5651e6', size: 5, erase: false, points: [1000, 1500, 8000, 7600] };
    const drawing = JSON.stringify([stroke]);
    const entries = [
        { id: 'first', authorEmail: 'editor@example.com', baseRevision: 'original', submittedAt: now, drawing },
        { id: 'second', authorEmail: 'writer@example.com', baseRevision: 'older', submittedAt: now - 2000, drawing }
    ];
    const pendingListeners = new Set();
    const publishedListeners = new Set();
    const calls = [];
    const counts = [];
    let published = { revision: 'original', drawing, publishedAt: now };
    let denyPending = true;
    const notifyPending = () => pendingListeners.forEach(({ callback }) => callback([...entries]));
    const notifyPublished = () => publishedListeners.forEach(callback => callback(published));
    const remove = id => {
        entries.splice(entries.findIndex(entry => entry.id === id), 1);
        notifyPending();
    };
    const client = {
        watchPending(callback, error) {
            const pair = { callback, error };
            pendingListeners.add(pair);
            if (denyPending) error();
            else notifyPending();
            return () => pendingListeners.delete(pair);
        },
        watchPublished(callback) {
            publishedListeners.add(callback);
            notifyPublished();
            return () => publishedListeners.delete(callback);
        },
        async readPublished() { return published; },
        async approve(entry) {
            calls.push({ id: entry.id, status: 'published' });
            published = { revision: entry.id, drawing: entry.drawing, publishedAt: Date.now() };
            remove(entry.id);
            notifyPublished();
        },
        async returnForRevision(entry, note) {
            calls.push({ id: entry.id, status: 'returned', note });
            remove(entry.id);
        }
    };
    const host = document.querySelector('main');
    const review = window.AlmanionHomeArtReview.create({ host, client, onPendingCount: count => counts.push(count) });
    window.homeArtReviewFixture = {
        resume: () => { denyPending = false; },
        reads: () => ({ calls, counts }),
        stop: () => review.stop(),
        subscriptions: () => pendingListeners.size + publishedListeners.size
    };
    review.start();
}

async function startReview(page) {
    await page.route('**/home-art-review-fixture.html', route => route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html>
            <html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
            <link rel="stylesheet" href="/styles/home-art-review.css"></head><body><main></main>
            <script src="/home-art-canvas.js"></script>
            <script src="/home-art-review.js"></script>
            <script>(${reviewFixture.toString()})();</script></body></html>`
    }));
    await page.goto('/home-art-review-fixture.html');
    await expect(page.getByText('Не удалось загрузить версии.')).toBeVisible();
    await page.evaluate(() => window.homeArtReviewFixture.resume());
    await page.getByRole('button', { name: 'Повторить', exact: true }).click();
    await expect(page.getByRole('button', { name: /editor@example/ })).toBeVisible();
}

test('owner compares and moderates homepage drawings in a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await startReview(page);
    const current = page.locator('#homeArtReviewCurrent');
    const proposal = page.locator('#homeArtReviewProposed');
    await expect(current).toBeHidden();
    await expect(proposal).toBeVisible();
    await page.getByRole('button', { name: 'На сайте', exact: true }).click();
    await expect(current).toBeVisible();
    await expect(proposal).toBeHidden();
    await expect.poll(() => current.locator('canvas').evaluate(canvas => {
        const context = canvas.getContext('2d');
        return context.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0);
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

    await page.getByRole('button', { name: /writer@example/ }).click();
    await expect(page.getByText('Фон уже обновился. Верните рисунок редактору для сверки.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Опубликовать фон' })).toBeDisabled();
    await page.getByRole('button', { name: 'Вернуть', exact: true }).click();
    const note = page.getByRole('textbox', { name: 'Комментарий редактору' });
    await expect(note).toBeFocused();
    await note.fill(' Сверь с текущим фоном. ');
    await page.getByRole('button', { name: 'Вернуть рисунок' }).click();
    await expect(page.getByText('Рисунок возвращён.')).toBeVisible();
    await expect(page.getByRole('button', { name: /writer@example/ })).toBeHidden();

    await page.getByRole('button', { name: 'Опубликовать фон' }).click();
    await expect(page.getByText('Фон опубликован.')).toBeVisible();
    await expect(page.getByText('Фонов на проверке пока нет.')).toBeVisible();
    expect(await page.evaluate(() => window.homeArtReviewFixture.reads())).toEqual({
        calls: [
            { id: 'second', status: 'returned', note: 'Сверь с текущим фоном.' },
            { id: 'first', status: 'published' }
        ],
        counts: [2, 1, 0]
    });
});

test('owner can compare both previews at once and closing the review detaches listeners', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await startReview(page);
    await expect(page.locator('#homeArtReviewCurrent')).toBeVisible();
    await expect(page.locator('#homeArtReviewProposed')).toBeVisible();
    expect(await page.evaluate(() => window.homeArtReviewFixture.subscriptions())).toBe(2);
    await page.evaluate(() => window.homeArtReviewFixture.stop());
    expect(await page.evaluate(() => window.homeArtReviewFixture.subscriptions())).toBe(0);
    await expect(page.getByRole('button', { name: 'Опубликовать фон' })).toBeHidden();
});
