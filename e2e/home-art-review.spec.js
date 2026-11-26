'use strict';

const { test, expect } = require('@playwright/test');

function reviewFixture({ withPhotos, withAspect, reviewId }) {
    const now = Date.now();
    const points = withAspect
        ? [1000, 1000, 9000, 1000, 9000, 9000, 1000, 9000, 1000, 1000]
        : [1000, 1500, 8000, 7600];
    const stroke = { color: '#5651e6', size: 5, erase: false, points };
    const drawing = JSON.stringify([stroke]);
    function photo(color) {
        const canvas = document.createElement('canvas');
        canvas.width = 80;
        canvas.height = 48;
        const context = canvas.getContext('2d');
        context.fillStyle = color;
        context.fillRect(0, 0, 80, 48);
        context.fillStyle = '#f9d89c';
        context.fillRect(25, 15, 34, 19);
        return canvas.toDataURL('image/jpeg', .8).split(',')[1];
    }
    const beforePhoto = withPhotos ? photo('#237b70') : '';
    const afterPhoto = withPhotos ? photo('#545bc0') : '';
    const entries = [
        {
            id: 'first', authorEmail: 'editor@example.com', baseRevision: 'original', submittedAt: now,
            drawing: withPhotos ? '[]' : drawing, ...(withPhotos ? { photo: afterPhoto } : {}),
            ...(withAspect ? { aspect: .5 } : {})
        },
        { id: 'second', authorEmail: 'writer@example.com', baseRevision: 'older', submittedAt: now - 2000, drawing }
    ];
    if (withPhotos) entries.push({
        id: 'broken', authorEmail: 'broken@example.com', baseRevision: 'original',
        submittedAt: now - 4000, drawing: '[]', photo: 'not-a-jpeg'
    });
    const pendingListeners = new Set();
    const publishedListeners = new Set();
    const calls = [];
    const counts = [];
    const resolvedLinks = [];
    let published = {
        revision: 'original', drawing, publishedAt: now, ...(withPhotos ? { photo: beforePhoto } : {}),
        ...(withAspect ? { aspect: 2.4 } : {})
    };
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
            published = {
                revision: entry.id, drawing: entry.drawing, publishedAt: Date.now(),
                ...(entry.photo ? { photo: entry.photo } : {}),
                ...(entry.aspect ? { aspect: entry.aspect } : {})
            };
            remove(entry.id);
            notifyPublished();
        },
        async returnForRevision(entry, note) {
            calls.push({ id: entry.id, status: 'returned', note });
            remove(entry.id);
        }
    };
    const host = document.querySelector('main');
    const review = window.AlmanionHomeArtReview.create({
        host, client, reviewId,
        onPendingCount: count => counts.push(count),
        onReviewLinkResolved: id => resolvedLinks.push(id)
    });
    window.homeArtReviewFixture = {
        resume: () => { denyPending = false; },
        reads: () => ({ calls, counts }),
        resolvedLinks: () => resolvedLinks.slice(),
        stop: () => review.stop(),
        hasPublishedPhoto: () => !!afterPhoto && published.photo === afterPhoto && published.drawing === '[]',
        subscriptions: () => pendingListeners.size + publishedListeners.size
    };
    review.start();
}

async function startReview(page, options = {}) {
    await page.route('**/home-art-review-fixture.html', route => route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html>
            <html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
            <link rel="stylesheet" href="/styles/home-art-review.css"></head><body><main></main>
            <script src="/home-art-store.js"></script>
            <script src="/home-art-canvas.js"></script>
            <script src="/home-art-review.js"></script>
            <script>(${reviewFixture.toString()})(${JSON.stringify(options)});</script></body></html>`
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

test('the requested background is selected after a successful retry', async ({ page }) => {
    await startReview(page, { reviewId: 'second' });
    await expect(page.getByRole('heading', { name: 'writer@example.com' })).toBeFocused();
    await expect(page.getByRole('button', { name: /writer@example/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Опубликовать фон' })).toBeDisabled();
    await page.getByRole('button', { name: /editor@example/ }).click();
    await expect(page.getByRole('heading', { name: 'editor@example.com' })).toBeVisible();
    expect(await page.evaluate(() => window.homeArtReviewFixture.resolvedLinks())).toEqual(['second']);
});

test('a removed background link leaves the review queue visible without a selection', async ({ page }) => {
    await startReview(page, { reviewId: 'resolved' });
    await expect(page.getByText('Эта версия уже недоступна для проверки.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Опубликовать фон' })).toBeHidden();
    await page.getByRole('button', { name: /editor@example/ }).click();
    await expect(page.getByText('Эта версия уже недоступна для проверки.')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Опубликовать фон' })).toBeEnabled();
});

test('owner can compare and publish a photo-only homepage background', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await startReview(page, { withPhotos: true });
    const current = page.locator('#homeArtReviewCurrent');
    const proposal = page.locator('#homeArtReviewProposed');
    const photo = proposal.locator('.home-art-review-photo');
    const publish = page.getByRole('button', { name: 'Опубликовать фон' });

    await expect(photo).toBeVisible();
    await expect(photo).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
    await expect(photo).toHaveCSS('object-fit', 'cover');
    await expect(publish).toBeEnabled();
    expect(await photo.evaluate(image => image.naturalWidth > 0 && image.nextElementSibling.tagName === 'CANVAS')).toBe(true);
    await expect.poll(() => proposal.locator('canvas').evaluate(canvas => {
        const context = canvas.getContext('2d');
        return canvas.width > 0 && canvas.height > 0 &&
            !context.getImageData(0, 0, canvas.width, canvas.height).data.some(Boolean);
    })).toBe(true);

    await page.getByRole('button', { name: 'На сайте', exact: true }).click();
    const currentPhoto = current.locator('.home-art-review-photo');
    await expect(currentPhoto).toBeVisible();
    expect(await currentPhoto.getAttribute('src')).not.toBe(await photo.getAttribute('src'));

    await page.getByRole('button', { name: /broken@example/ }).click();
    await expect(page.getByText('Не удалось прочитать предложенное фото.')).toBeVisible();
    await expect(publish).toBeDisabled();
    await expect(photo).toHaveCount(0);
    await page.getByRole('button', { name: /editor@example/ }).click();
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(page.getByText('Фон опубликован.')).toBeVisible();
    expect(await page.evaluate(() => window.homeArtReviewFixture.hasPublishedPhoto())).toBe(true);
    await page.evaluate(() => window.homeArtReviewFixture.stop());
    await expect(page.locator('.home-art-review-photo')).toHaveCount(0);
});

test('review contains the original drawing proportions on a phone and desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await startReview(page, { withAspect: true });
    const current = page.locator('#homeArtReviewCurrent canvas');
    const proposal = page.locator('#homeArtReviewProposed canvas');

    async function expectCenteredArt(canvas, aspect) {
        await expect.poll(() => canvas.evaluate((element, wanted) => {
            const { width, height } = element;
            if (width < 40 || height < 40) return false;
            const rgba = element.getContext('2d').getImageData(0, 0, width, height).data;
            let left = width, top = height, right = -1, bottom = -1;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (rgba[(y * width + x) * 4 + 3] < 32) continue;
                    left = Math.min(left, x);
                    top = Math.min(top, y);
                    right = Math.max(right, x);
                    bottom = Math.max(bottom, y);
                }
            }
            return right >= left && bottom >= top &&
                Math.abs((right - left + 1) / (bottom - top + 1) - wanted) < .07 &&
                Math.abs(left + right + 1 - width) < 5 &&
                Math.abs(top + bottom + 1 - height) < 5;
        }, aspect)).toBe(true);
    }

    await expectCenteredArt(current, 2.4);
    await expectCenteredArt(proposal, .5);
    await page.setViewportSize({ width: 320, height: 740 });
    await expectCenteredArt(proposal, .5);
    await page.getByRole('button', { name: 'На сайте', exact: true }).click();
    await expectCenteredArt(current, 2.4);
    await page.getByRole('button', { name: /writer@example/ }).click();
    await expectCenteredArt(proposal, 16 / 9);
});
