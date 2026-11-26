'use strict';

const { test, expect } = require('@playwright/test');
const { setupAdmin } = require('./helpers/admin-fixture.cjs');

function reviewFixture(reviewLinkId) {
    const revisions = {
        first: {
            id: 'first', authorUid: 'editor-1', authorEmail: 'editor@example.com', subject: 'physics',
            sectionId: 'mechanics', title: 'Механика', revision: 2, submittedAt: Date.now(), status: 'pending'
        },
        stale: {
            id: 'stale', authorUid: 'editor-1', authorEmail: 'editor@example.com', subject: 'physics',
            sectionId: 'optics', title: 'Оптика', revision: 2, submittedAt: Date.now() - 1000, status: 'pending'
        },
        recovery: {
            id: 'recovery', authorUid: 'editor-1', authorEmail: 'editor@example.com', subject: 'physics',
            sectionId: 'heat', title: 'Теплота', revision: 3, submittedAt: Date.now() - 2000, status: 'publishing'
        }
    };
    if (reviewLinkId) {
        revisions[reviewLinkId] = { ...revisions.recovery, id: reviewLinkId };
        delete revisions.recovery;
    }
    const listeners = new Set();
    const calls = [];
    const notify = () => {
        const entries = Object.values(revisions).sort((a, b) => b.submittedAt - a.submittedAt).map(entry => ({ ...entry }));
        listeners.forEach(callback => callback(entries));
    };
    const block = content => ({ id: 'explanation', type: 'paragraph', content });
    window.NoteReview = {
        readBase({ sectionId }) {
            return Promise.resolve({
                hash: sectionId === 'mechanics' ? 'original' : 'changed',
                section: { title: Object.values(revisions).find(entry => entry.sectionId === sectionId)?.title, blocks: [block('Текст на сайте')] }
            });
        },
        create() {
            return {
                watchPending(callback) {
                    listeners.add(callback);
                    queueMicrotask(notify);
                    return () => listeners.delete(callback);
                },
                getVersion(id) {
                    const entry = revisions[id];
                    return Promise.resolve({ ...entry, baseHash: 'original', files: [], section: {
                        title: entry.title, revision: entry.revision, blocks: [block('<script>window.__reviewInjected = true</script>')]
                    } });
                },
                decide(id, decision) {
                    calls.push({ id, ...decision });
                    delete revisions[id];
                    notify();
                    return Promise.resolve();
                },
                publish(id, version) {
                    calls.push({ id, version: version.id, status: 'published' });
                    delete revisions[id];
                    notify();
                    return Promise.resolve({ commit: 'test' });
                }
            };
        }
    };
    window.reviewFixture = {
        calls: () => [...calls],
        listenerCount: () => listeners.size,
        submit() {
            revisions.new = { ...revisions.first, id: 'new', title: 'Новая версия', submittedAt: Date.now() + 1000 };
            notify();
        }
    };
}

async function setupReview(page, options) {
    await setupAdmin(page, options);
    await page.route('**/constructor/review.js*', route => route.fulfill({
        contentType: 'application/javascript',
        body: '(' + reviewFixture.toString() + ')(' + JSON.stringify(options?.reviewLinkId) + ');'
    }));
}

test('owner reviews and decides the selected snapshot on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await setupReview(page);
    await page.goto('/admin.html#reviews');
    await expect(page.locator('#view-reviews')).toBeVisible();
    await expect(page.locator('#tab-reviews')).toHaveAttribute('aria-selected', 'true');
    expect(await page.locator('#tab-reviews').evaluate(tab => {
        const rail = tab.parentElement.getBoundingClientRect(), active = tab.getBoundingClientRect();
        return active.left >= rail.left - 1 && active.right <= rail.right + 1;
    })).toBe(true);
    await expect(page.locator('#reviewTabCount')).toHaveText('3');
    await expect(page.locator('#reviewTitle')).toHaveText('Механика');
    await expect(page.locator('#reviewDiff')).toContainText('Текст на сайте');
    await expect(page.locator('#reviewDiff')).toContainText('<script>window.__reviewInjected = true</script>');
    expect(await page.evaluate(() => window.__reviewInjected)).toBeUndefined();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
    await page.locator('[data-review-id="first"]').click();
    await expect(page.locator('#reviewTitle')).toBeFocused();

    await page.locator('[data-review-id="stale"]').click();
    await expect(page.locator('#reviewStale')).toContainText('Опубликованный раздел обновился');
    await expect(page.locator('#reviewPublish')).toBeDisabled();
    await page.locator('#reviewReturn').click();
    await page.getByLabel('Комментарий редактору').fill('Учти свежую версию текста.');
    await page.locator('#reviewReturnSubmit').click();
    await expect(page.locator('#reviewTabCount')).toHaveText('2');

    await page.locator('[data-review-id="recovery"]').click();
    await expect(page.locator('#reviewReturn')).toBeHidden();
    await expect(page.locator('#reviewPublish')).toHaveText('Проверить публикацию');
    await page.locator('#reviewPublish').click();
    await expect(page.locator('#reviewTabCount')).toHaveText('1');

    await page.locator('#reviewPublish').click();
    await expect(page.getByRole('dialog', { name: 'Утвердить версию' })).toBeVisible();
    await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
    await expect(page.locator('#reviewInboxStatus')).toHaveText('Новых версий на проверку пока нет.');
    expect(await page.evaluate(() => window.reviewFixture.calls())).toEqual([
        { id: 'stale', status: 'returned', note: 'Учти свежую версию текста.' },
        { id: 'recovery', version: 'recovery', status: 'published' },
        { id: 'first', version: 'first', status: 'published' }
    ]);
});

test('a new version notifies the owner and the queue detaches on an account change', async ({ page }) => {
    await setupReview(page);
    await page.goto('/admin.html');
    await expect(page.locator('#reviewTabCount')).toHaveText('3');
    await page.evaluate(() => window.reviewFixture.submit());
    await expect(page.locator('.admin-toast').last()).toContainText('Новая версия');
    await expect(page.locator('#reviewTabCount')).toHaveText('4');
    await page.locator('#tab-reviews').click();
    await expect(page.locator('#view-reviews')).toBeVisible();
    await page.evaluate(() => window.adminFixture.admin());
    await expect(page.locator('#tab-reviews')).toBeHidden();
    await expect(page.locator('#view-reviews')).toBeHidden();
    expect(await page.evaluate(() => window.reviewFixture.listenerCount())).toBe(0);
});

test('an owner link opens a specific version once, including a publication in progress', async ({ page }) => {
    const reviewLinkId = '1234567890abcdefghij';
    await setupReview(page, { reviewLinkId });
    const link = '/admin.html?review=' + reviewLinkId + '&keep=1#reviews';
    await page.goto(link);
    await expect(page.locator('#reviewTitle')).toHaveText('Теплота');
    await expect(page.locator('#reviewTitle')).toBeFocused();
    await expect(page.locator('#reviewPublish')).toHaveText('Проверить публикацию');
    await expect(page).toHaveURL(/\/admin\.html\?keep=1#reviews$/);
    await page.locator('[data-review-id="first"]').click();
    await page.evaluate(() => window.reviewFixture.submit());
    await expect(page.locator('#reviewTitle')).toHaveText('Механика');
    await page.goto(link);
    await expect(page.locator('#reviewTitle')).toHaveText('Теплота');
});

test('a resolved note link does not select another version for approval', async ({ page }) => {
    await setupReview(page);
    await page.goto('/admin.html?review=00000000000000000000#reviews');
    await expect(page.locator('#reviewInboxStatus')).toHaveText('Эта версия уже недоступна для проверки.');
    await expect(page.locator('#reviewDetail')).toBeHidden();
    await page.evaluate(() => window.reviewFixture.submit());
    await expect(page.locator('#reviewDetail')).toBeHidden();
    await page.locator('[data-review-id="first"]').click();
    await expect(page.locator('#reviewTitle')).toHaveText('Механика');
    await expect(page.locator('#reviewInboxStatus')).toHaveText('');
});
