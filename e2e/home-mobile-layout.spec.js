'use strict';

const { test, expect } = require('@playwright/test');

const DEFAULT_SHORTCUTS = ['physics-10', 'russian-ege', 'duty-10-1'];
const FIVE_SHORTCUTS = ['physics-10', 'russian-ege', 'duty-10-1', 'matcenter', 'likbez'];
const MONDAY_PEOPLE = ['Максим Казаков', 'Даня Луконин', 'Федя Гринь', 'Саша Деревягин', 'Олег Чуднов'];
const pageErrors = new WeakMap();

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
    const errors = [];
    pageErrors.set(page, errors);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
        ? route.continue() : route.abort());
    await page.addInitScript(() => {
        localStorage.setItem('almanion:visual-defaults:2026-09-05-v1', '1');
        if (!localStorage.getItem('siteSettings')) localStorage.setItem('siteSettings', JSON.stringify({
            visualDefaultsVersion: 1, experimental: true, expMode: 'prism',
            expTheme: 'light', expDark: false, animationLevel: 'off'
        }));
        const snapshot = { val: () => null, exists: () => false, forEach() {} };
        const ref = () => ({
            on() {}, off() {}, child: ref, once: async () => snapshot,
            set: async () => {}, update: async () => {}, remove: async () => {},
            transaction: async () => ({ snapshot, committed: false }), push: ref,
            onDisconnect: () => ({ remove: async () => {}, cancel: async () => {} })
        });
        const auth = {
            currentUser: null, useDeviceLanguage() {}, setPersistence: async () => {},
            onAuthStateChanged: callback => { setTimeout(() => callback(null), 0); return () => {}; },
            signInAnonymously: async () => { throw new Error('Offline test'); }
        };
        const authFactory = () => auth;
        authFactory.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } };
        const database = () => ({ ref });
        database.ServerValue = { TIMESTAMP: 0 };
        const app = { options: {}, auth: authFactory, database };
        window.firebase = { apps: [app], app: () => app, initializeApp: () => app, auth: authFactory, database };
    });
});

test.afterEach(async ({ page }) => {
    expect(pageErrors.get(page)).toEqual([]);
});

async function openHome(page, width, date = '2026-10-19') {
    await page.setViewportSize({ width, height: 740 });
    await page.clock.setFixedTime(new Date(`${date}T12:00:00+03:00`));
    await page.goto('/');
    await page.waitForFunction(() => window.AlmanionHomeDashboard && window.AlmanionSettings?.ready);
}

async function setTheme(page, dark) {
    await page.evaluate(darkTheme => window.AlmanionSettings.update({
        experimental: true, expMode: 'prism', expTheme: darkTheme ? 'dark' : 'light',
        expDark: darkTheme, animationLevel: 'off'
    }), dark);
    if (dark) await expect(page.locator('body')).toHaveClass(/\bexp-dark\b/);
    else await expect(page.locator('body')).not.toHaveClass(/\bexp-dark\b/);
}

async function shortcutIds(page) {
    return page.locator('#homeQuickGrid > a').evaluateAll(links => links.map(link => link.dataset.quickId));
}

async function signInFixture(page) {
    // The real account module loads asynchronously. Let its initial guest
    // callback finish before emitting the synthetic signed-in state.
    await expect(page.locator('#accountBtn')).toBeVisible();
    await expect(page.locator('#accountBtn')).not.toHaveClass(/\bis-loading\b/);
    await page.evaluate(() => {
        const user = { uid: 'mobile-home-fixture' };
        window.AlmanionAccount = { getUser: () => user, hasEnglishAccess: async () => false };
        dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user } }));
    });
    await expect(page.locator('#homeQuickCustomize')).toBeVisible();
}

async function expectReadingOrder(page) {
    const order = await page.evaluate(() => {
        const quick = document.querySelector('.home-quick-section');
        const daily = document.querySelector('#homeDailyDuty');
        const subjects = document.querySelector('.subjects-section');
        return {
            quickBeforeDaily: !!(quick.compareDocumentPosition(daily) & Node.DOCUMENT_POSITION_FOLLOWING),
            dailyBeforeSubjects: !!(daily.compareDocumentPosition(subjects) & Node.DOCUMENT_POSITION_FOLLOWING)
        };
    });
    expect(order).toEqual({ quickBeforeDaily: true, dailyBeforeSubjects: true });
}

async function expectShortcutsFirst(page, ids) {
    await page.evaluate(() => scrollTo(0, 0));
    const quick = page.locator('.home-quick-section');
    await expect(quick).toBeInViewport({ ratio: 1 });
    expect(await shortcutIds(page)).toEqual(ids);
    for (const link of await page.locator('#homeQuickGrid > a').all()) {
        await expect(link).toBeInViewport({ ratio: 1 });
    }
    const geometry = await page.evaluate(() => {
        const quick = document.querySelector('.home-quick-section').getBoundingClientRect();
        const daily = document.querySelector('#homeDailyDuty').getBoundingClientRect();
        const subjects = document.querySelector('.subjects-section').getBoundingClientRect();
        const grid = document.querySelector('#homeQuickGrid').getBoundingClientRect();
        return {
            overflow: document.documentElement.scrollWidth - innerWidth,
            quick: { top: quick.top, bottom: quick.bottom },
            dailyTop: daily.top, subjectsTop: subjects.top,
            grid: { left: grid.left, right: grid.right },
            cards: [...document.querySelectorAll('#homeQuickGrid > a')].map(link => {
                const rect = link.getBoundingClientRect();
                return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
            })
        };
    });
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(geometry.quick.top).toBeGreaterThanOrEqual(0);
    expect(geometry.quick.bottom).toBeLessThanOrEqual(geometry.dailyTop + 1);
    expect(geometry.quick.bottom).toBeLessThanOrEqual(geometry.subjectsTop + 1);
    if (ids.length === 5) {
        const fifth = geometry.cards[4];
        expect(Math.abs(fifth.left - geometry.grid.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(fifth.right - geometry.grid.right)).toBeLessThanOrEqual(1);
        expect(fifth.top).toBeGreaterThanOrEqual(Math.max(...geometry.cards.slice(0, 4).map(card => card.bottom)) - 1);
    }
    await expectReadingOrder(page);
}

async function expectReadableDailyNames(page, names) {
    const daily = page.locator('#homeDailyDuty');
    await expect(daily).toBeVisible();
    await expect(page.locator('#homeDailyDutyPeople li')).toHaveText(names);
    await daily.scrollIntoViewIfNeeded();
    for (const person of await page.locator('#homeDailyDutyPeople li').all()) await expect(person).toBeVisible();
    const geometry = await daily.evaluate(section => {
        const bounds = section.getBoundingClientRect();
        return {
            pageOverflow: document.documentElement.scrollWidth - innerWidth,
            sectionOverflow: section.scrollWidth - section.clientWidth,
            bounds: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom },
            names: [...section.querySelectorAll('li')].map(person => {
                const rect = person.getBoundingClientRect();
                return {
                    left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                    horizontalOverflow: person.scrollWidth - person.clientWidth,
                    verticalOverflow: person.scrollHeight - person.clientHeight
                };
            })
        };
    });
    expect(geometry.pageOverflow).toBeLessThanOrEqual(1);
    expect(geometry.sectionOverflow).toBeLessThanOrEqual(1);
    for (const person of geometry.names) {
        expect(person.left).toBeGreaterThanOrEqual(geometry.bounds.left);
        expect(person.right).toBeLessThanOrEqual(geometry.bounds.right);
        expect(person.top).toBeGreaterThanOrEqual(geometry.bounds.top);
        expect(person.bottom).toBeLessThanOrEqual(geometry.bounds.bottom);
        expect(person.horizontalOverflow).toBeLessThanOrEqual(1);
        expect(person.verticalOverflow).toBeLessThanOrEqual(1);
    }
}

for (const width of [320, 360, 390]) {
    test(`default shortcuts precede today's readable duty and subjects at ${width}x740`, async ({ page }) => {
        await openHome(page, width);
        for (const dark of [false, true]) {
            await setTheme(page, dark);
            await expectShortcutsFirst(page, DEFAULT_SHORTCUTS);
            await expectReadableDailyNames(page, MONDAY_PEOPLE);
        }
    });

    test(`five shortcuts save in order and fit the first screen at ${width}x740`, async ({ page }) => {
        await openHome(page, width);
        await signInFixture(page);
        await page.locator('#homeQuickCustomize').click();
        await expect(page.locator('#homeQuickDialog')).toBeVisible();
        await expect(page.locator('#homeQuickSave')).toBeInViewport();
        while (await page.locator('#homeQuickDialog .home-quick-option.is-selected').count()) {
            await page.locator('#homeQuickDialog .home-quick-option.is-selected').first().click();
        }
        for (const id of FIVE_SHORTCUTS) await page.locator(`#homeQuickOptions [data-quick-id="${id}"]`).click();
        await expect(page.locator('#homeQuickCount')).toHaveText('5 из 5');
        await page.locator('#homeQuickSave').click();
        await expect(page.locator('#homeQuickDialog')).toBeHidden();
        await expect(page.locator('#homeQuickCustomize')).toBeFocused();
        for (const dark of [false, true]) {
            await setTheme(page, dark);
            await expectShortcutsFirst(page, FIVE_SHORTCUTS);
            await expectReadableDailyNames(page, MONDAY_PEOPLE);
        }
        await page.reload();
        await page.waitForFunction(() => window.AlmanionHomeDashboard && window.AlmanionSettings?.ready);
        await signInFixture(page);
        await expectShortcutsFirst(page, FIVE_SHORTCUTS);
        await expect(page.locator('.home-additional-section a[href="matcenter.html"]')).toBeVisible();
        await expect(page.locator('.home-additional-section a[href="likbez.html"]')).toBeVisible();
    });

    test(`Thursday has a compact notice and the expired week leaves no reserved gap at ${width}x740`, async ({ page }) => {
        await openHome(page, width, '2026-10-22');
        const daily = page.locator('#homeDailyDuty');
        await expect(page.locator('#homeDailyDutyTitle')).toHaveText('Сегодня без дежурства');
        await expect(page.locator('#homeDailyDutyPeople')).toBeHidden();
        await expect(page.locator('#homeDailyDutyMessage')).toBeVisible();
        await expectShortcutsFirst(page, DEFAULT_SHORTCUTS);
        const withNotice = await page.evaluate(() => {
            const quick = document.querySelector('.home-quick-section').getBoundingClientRect();
            const duty = document.querySelector('#homeDailyDuty').getBoundingClientRect();
            const subjects = document.querySelector('.subjects-section').getBoundingClientRect();
            const heading = document.querySelector('.home-daily-duty-heading').getBoundingClientRect();
            const message = document.querySelector('#homeDailyDutyMessage').getBoundingClientRect();
            return {
                dutyHeight: duty.height, subjectsGap: subjects.top - quick.bottom,
                noticeGap: message.top - heading.bottom, noticeHeight: message.height, headingHeight: heading.height
            };
        });
        expect(withNotice.noticeGap).toBeGreaterThanOrEqual(0);
        expect(withNotice.noticeGap).toBeLessThanOrEqual(withNotice.noticeHeight + withNotice.headingHeight);
        await page.clock.setFixedTime(new Date('2026-10-26T12:00:00+03:00'));
        await page.reload();
        await page.waitForFunction(() => window.AlmanionHomeDashboard && window.AlmanionSettings?.ready);
        await expect(daily).toBeHidden();
        const withoutNotice = await page.evaluate(() => {
            const quick = document.querySelector('.home-quick-section').getBoundingClientRect();
            const duty = document.querySelector('#homeDailyDuty').getBoundingClientRect();
            const subjects = document.querySelector('.subjects-section').getBoundingClientRect();
            return {
                dutyHeight: duty.height, subjectsGap: subjects.top - quick.bottom,
                overflow: document.documentElement.scrollWidth - innerWidth
            };
        });
        expect(withoutNotice.dutyHeight).toBe(0);
        expect(withoutNotice.subjectsGap).toBeGreaterThanOrEqual(0);
        expect(withNotice.subjectsGap - withoutNotice.subjectsGap).toBeGreaterThanOrEqual(withNotice.dutyHeight - 1);
        expect(withoutNotice.overflow).toBeLessThanOrEqual(1);
        await expect(page.locator('.home-quick-section')).toBeInViewport({ ratio: 1 });
        await expectReadingOrder(page);
    });
}

test('long daily surnames remain complete on the narrowest mobile screen', async ({ page }) => {
    await openHome(page, 320, '2026-10-24');
    for (const dark of [false, true]) {
        await setTheme(page, dark);
        await expectReadableDailyNames(page, ['Саша Михлин', 'Ваня Кисмерешкин', 'Дима Белоцерковцев', 'Катя Айзикович']);
    }
});

test('desktop and mobile resizing keep reading order, keyboard order and focus aligned', async ({ page }) => {
    await openHome(page, 1366);
    for (const width of [1366, 390, 768, 769, 1366, 360]) {
        const lastShortcut = page.locator('#homeQuickGrid > a').last();
        await lastShortcut.focus();
        await page.setViewportSize({ width, height: 740 });
        await expectReadingOrder(page);
        await expect(lastShortcut).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(page.locator('#homeDailyDuty a')).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(page.locator('#gradeTab10')).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(page.locator('#gradePanel10 a').first()).toBeFocused();
        expect(await shortcutIds(page)).toEqual(DEFAULT_SHORTCUTS);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
});
