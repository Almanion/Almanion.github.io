'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
test.use({ serviceWorkers: 'block' });
const production = fs.readFileSync(path.join(__dirname, '..', 'personal-notes.js'), 'utf8');
const bookmarks = fs.readFileSync(path.join(__dirname, '..', 'bookmarks.js'), 'utf8');
const instrumented = `(function () {
    const original = window.AlmanionBookmarks;
    window.__noteWrites = [];
    window.AlmanionBookmarks = Object.freeze({ ...original, saveNote(...args) {
        if (window.__failNoteSave) throw new Error('Isolated test save failure');
        window.__noteWrites.push(args);
        return original.saveNote(...args);
    } });
}());\n` + production;

test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1') return route.abort();
        if (url.pathname === '/bookmarks.js') return route.fulfill({ contentType: 'application/javascript', body: bookmarks });
        if (url.pathname === '/personal-notes.js') return route.fulfill({ contentType: 'application/javascript', body: instrumented });
        return route.continue();
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/physics-10.html');
    await page.waitForFunction(() => !!window.AlmanionPersonalNotes);
});
async function openBlock(page, index = 0) {
    await page.evaluate(index => window.AlmanionPersonalNotes.open(document.querySelectorAll('.definition-box')[index]), index);
}
async function openList(page) { await page.evaluate(() => window.AlmanionPersonalNotes.open()); }
async function owner(page, uid) {
    await page.evaluate(uid => {
        const user = uid ? { uid } : null;
        window.AlmanionAccount = { getUser: () => user };
        dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user } }));
    }, uid);
}
async function draftCount(page) {
    return page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('almanion_personal_note_draft_v1:')).length);
}

test('unfinished text survives Back, close, Escape and reload without committing a note', async ({ page }) => {
    const text = 'Unfinished <img src=x onerror=alert(1)> explanation';
    await openBlock(page); await page.locator('#personalNoteText').fill(text);
    await expect(page.locator('.personal-note-draft-status')).toContainText('Черновик сохранён');
    expect(await page.evaluate(() => window.__noteWrites.length)).toBe(0);
    await page.locator('[data-note-back]').click();
    await expect(page.locator('.personal-note-card')).toContainText('Черновик');
    await expect(page.locator('.personal-note-card img')).toHaveCount(0);
    await page.locator('[data-note-edit]').click();
    await expect(page.locator('#personalNoteText')).toHaveValue(text);
    await page.locator('[data-note-close]').click();
    await openBlock(page); await expect(page.locator('#personalNoteText')).toHaveValue(text);
    await page.keyboard.press('Escape');
    await page.reload(); await page.waitForFunction(() => !!window.AlmanionPersonalNotes);
    await openList(page); await expect(page.locator('.personal-note-card')).toContainText(text);
    await page.locator('[data-note-edit]').click();
    await expect(page.locator('#personalNoteText')).toHaveValue(text);
    await page.locator('[data-note-save]').click();
    await expect(page.locator('.personal-notes-dialog')).not.toBeVisible();
    expect(await page.evaluate(() => window.__noteWrites.length)).toBe(1);
    expect(await draftCount(page)).toBe(0);
    await openBlock(page); await expect(page.locator('#personalNoteText')).toHaveValue(text);
});

test('drafts stay with their guest/account and block through account switches', async ({ page }) => {
    await openBlock(page); await page.locator('#personalNoteText').fill('Guest private draft');
    await owner(page, 'draft-reader-one');
    await expect(page.locator('.personal-notes-dialog')).not.toBeVisible();
    await expect(page.locator('#personalNoteText')).toHaveCount(0);
    await openList(page); await expect(page.locator('.personal-note-card')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await openBlock(page); await expect(page.locator('#personalNoteText')).toHaveValue('');
    await page.locator('#personalNoteText').fill('Account one, block one');
    await openBlock(page, 1); await page.locator('#personalNoteText').fill('Account one, block two');
    await owner(page, 'draft-reader-two');
    await openBlock(page); await expect(page.locator('#personalNoteText')).toHaveValue('');
    await page.locator('#personalNoteText').fill('Account two private draft');
    await owner(page, 'draft-reader-one');
    await openBlock(page); await expect(page.locator('#personalNoteText')).toHaveValue('Account one, block one');
    await openBlock(page, 1); await expect(page.locator('#personalNoteText')).toHaveValue('Account one, block two');
    await owner(page, null);
    await openBlock(page); await expect(page.locator('#personalNoteText')).toHaveValue('Guest private draft');
    expect(await page.evaluate(() => window.__noteWrites.length)).toBe(0);
    expect(await draftCount(page)).toBe(4);
});

test('discard restores the saved note and failed Save preserves the editor and draft', async ({ page }) => {
    await openBlock(page); await page.locator('#personalNoteText').fill('Previously saved');
    await page.locator('[data-note-save]').click();
    await openBlock(page); await page.locator('#personalNoteText').fill('Draft to discard');
    await page.locator('[data-note-discard]').click();
    await expect(page.locator('#personalNoteText')).toHaveValue('Previously saved');
    await expect(page.locator('[data-note-discard]')).toBeHidden();
    expect(await draftCount(page)).toBe(0);
    expect(await page.evaluate(() => window.__noteWrites.length)).toBe(1);
    await page.locator('#personalNoteText').fill('Must survive a failed save');
    await page.evaluate(() => { window.__failNoteSave = true; });
    await page.locator('[data-note-save]').click();
    await expect(page.locator('.personal-notes-dialog')).toBeVisible();
    await expect(page.locator('#personalNoteText')).toHaveValue('Must survive a failed save');
    await expect(page.locator('.personal-note-draft-status')).toContainText('Не удалось сохранить пометку');
    await page.reload(); await page.waitForFunction(() => !!window.AlmanionPersonalNotes);
    await openBlock(page); await expect(page.locator('#personalNoteText')).toHaveValue('Must survive a failed save');
    await page.locator('[data-note-save]').click();
    expect(await draftCount(page)).toBe(0);
    await openBlock(page); await expect(page.locator('#personalNoteText')).toHaveValue('Must survive a failed save');
});

test('storage failure warns and retains an in-memory draft until persistence recovers', async ({ page }) => {
    await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
            if (key.startsWith('almanion_personal_note_draft_v1:')) throw new Error('Isolated quota failure');
            return original.call(this, key, value);
        };
        window.__restoreDraftStorage = () => { Storage.prototype.setItem = original; };
    });
    await openBlock(page); await page.locator('#personalNoteText').fill('Memory fallback');
    await expect(page.locator('.personal-note-draft-status')).toContainText('Не удалось сохранить черновик');
    await page.keyboard.press('Escape'); await openBlock(page);
    await expect(page.locator('#personalNoteText')).toHaveValue('Memory fallback');
    await expect(page.locator('.personal-note-draft-status')).toContainText('Не удалось сохранить черновик');
    await page.evaluate(() => window.__restoreDraftStorage());
    await page.keyboard.press('Escape');
    await page.reload(); await page.waitForFunction(() => !!window.AlmanionPersonalNotes);
    await openBlock(page); await expect(page.locator('#personalNoteText')).toHaveValue('Memory fallback');
    expect(await page.evaluate(() => window.__noteWrites.length)).toBe(0);
});

test('a memory-only bookmark save must not delete the durable draft', async ({ page }) => {
    await openBlock(page); await page.locator('#personalNoteText').fill('Durable draft while bookmark storage fails');
    await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
            if (key.startsWith('almanion_bookmarks')) throw new Error('Isolated bookmark-storage failure');
            return original.call(this, key, value);
        };
        window.__restoreBookmarkStorage = () => { Storage.prototype.setItem = original; };
    });
    await page.locator('[data-note-save]').click();
    await expect(page.locator('.personal-notes-dialog')).toBeVisible();
    await expect(page.locator('.personal-note-draft-status')).toContainText('Не удалось сохранить пометку');
    expect(await page.evaluate(() => {
        const id = window.AlmanionBookmarks.blockId(document.querySelector('.definition-box'));
        return window.AlmanionBookmarks.record(id)?.noteText;
    })).toBe('Durable draft while bookmark storage fails');
    expect(await draftCount(page)).toBe(1);
    await page.keyboard.press('Escape'); await openBlock(page);
    await expect(page.locator('#personalNoteText')).toHaveValue('Durable draft while bookmark storage fails');
    await page.keyboard.press('Escape');
    expect(await draftCount(page)).toBe(1);
    await openBlock(page);
    await page.evaluate(() => window.__restoreBookmarkStorage());
    await page.locator('[data-note-save]').click();
    await expect(page.locator('.personal-notes-dialog')).not.toBeVisible();
    expect(await draftCount(page)).toBe(0);
    await page.reload(); await page.waitForFunction(() => !!window.AlmanionPersonalNotes);
    await openBlock(page);
    await expect(page.locator('#personalNoteText')).toHaveValue('Durable draft while bookmark storage fails');
});
