'use strict';

const { test, expect } = require('@playwright/test');

const assignments = [
    { date: '2026-10-19', people: ['Максим Казаков', 'Даня Луконин', 'Федя Гринь', 'Саша Деревягин', 'Олег Чуднов'] },
    { date: '2026-10-20', people: ['Андрей Кузь', 'Дима Петров', 'Миша Балуев', 'Ваня Щербак', 'Ваня Коршиков'] },
    { date: '2026-10-21', people: ['Артём Львов', 'Вова Дубейко', 'Саша Свердлов', 'Ярик Сысоев'] },
    { date: '2026-10-23', people: ['Аня Шубина', 'Полина Лубневская', 'Соня Гаранина', 'Уля Попова', 'Даша Волкова'] },
    { date: '2026-10-24', people: ['Саша Михлин', 'Ваня Кисмерешкин', 'Дима Белоцерковцев', 'Катя Айзикович'] }
];

test.use({ serviceWorkers: 'block', timezoneId: 'America/Los_Angeles' });
test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
        ? route.continue() : route.abort());
});

async function openDate(page, date) {
    await page.clock.setFixedTime(new Date(`${date}T12:00:00+03:00`));
    await page.goto('/');
}

async function expectAssignment(page, assignment, title = 'Сегодня дежурят') {
    const card = page.locator('#homeDailyDuty');
    await expect(card).toBeVisible();
    await expect(page.locator('#homeDailyDutyTitle')).toHaveText(title);
    await expect(page.locator('#homeDailyDutyDate')).toHaveAttribute('datetime', assignment.date);
    await expect(page.locator('#homeDailyDutyPeople li')).toHaveText(assignment.people);
    await expect(card.locator('a[href="duty-10-1.html#dutyExtraSchedule"]')).toBeVisible();
}

for (const assignment of assignments) {
    test(`homepage shows the separate assignment for ${assignment.date}`, async ({ page }) => {
        await openDate(page, assignment.date);
        await expectAssignment(page, assignment);
    });
}

test('before the dated week the homepage previews Monday', async ({ page }) => {
    await openDate(page, '2026-10-18');
    await expectAssignment(page, assignments[0], 'Ближайшее дежурство');
});

test('Thursday explicitly has no separate assignment', async ({ page }) => {
    await openDate(page, '2026-10-22');
    await expect(page.locator('#homeDailyDuty')).toBeVisible();
    await expect(page.locator('#homeDailyDutyTitle')).toHaveText('Сегодня без дежурства');
    await expect(page.locator('#homeDailyDutyDate')).toHaveAttribute('datetime', '2026-10-22');
    await expect(page.locator('#homeDailyDutyPeople li')).toHaveCount(0);
    await expect(page.locator('#homeDailyDutyMessage')).toBeVisible();
    await expect(page.locator('#homeDailyDutyMessage')).not.toBeEmpty();
});

for (const date of ['2026-10-25', '2027-10-19']) {
    test(`the temporary homepage card is hidden on ${date}`, async ({ page }) => {
        await openDate(page, date);
        await expect(page.locator('#homeDailyDuty')).toBeHidden();
    });
}

test('an open homepage refreshes after Moscow midnight in another device timezone', async ({ page }) => {
    const beforeMidnight = new Date('2026-10-18T20:59:59Z');
    await page.clock.install({ time: new Date('2026-10-18T20:59:00Z') });
    await page.clock.pauseAt(beforeMidnight);
    await page.goto('/');
    await expectAssignment(page, assignments[0], 'Ближайшее дежурство');
    await page.clock.fastForward(61000);
    await expectAssignment(page, assignments[0]);
});

test('Firebase changes to the main weekly team do not replace the daily assignment', async ({ page }) => {
    await page.addInitScript(() => {
        const snapshot = { val: () => null, exists: () => false, forEach() {} };
        const ref = path => ({
            on(event, callback) {
                if (path === 'classDuty/grade10_1') window.__publishDuty = raw => callback({ val: () => raw });
            },
            off() {}, child: ref, once: async () => snapshot,
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
    await openDate(page, assignments[0].date);
    await expectAssignment(page, assignments[0]);
    await page.waitForFunction(() => window.__publishDuty);
    await page.evaluate(() => window.__publishDuty({ revision: 100, entries: {
        'week-2026-10-19': {
            start: '2026-10-19', end: '2026-10-24', people: ['Тестовый Основной', 'Сменный График']
        }
    } }));
    const summaries = page.locator('[data-duty-summary]');
    await expect(summaries).toHaveCount(2);
    for (const summary of await summaries.all()) await expect(summary).toHaveText('Основной, График');
    await expectAssignment(page, assignments[0]);
});

for (const dark of [false, true]) {
    test(`daily homepage card fits mobile and desktop in the ${dark ? 'dark' : 'light'} theme`, async ({ page }, info) => {
        await page.addInitScript(darkTheme => {
            localStorage.setItem('almanion:visual-defaults:2026-09-05-v1', '1');
            localStorage.setItem('siteSettings', JSON.stringify({
                visualDefaultsVersion: 1, experimental: true, expMode: 'prism',
                expTheme: darkTheme ? 'dark' : 'light', expDark: darkTheme, animationLevel: 'off'
            }));
        }, dark);
        await openDate(page, '2026-10-24');
        await expect(page.locator('body')).toHaveClass(dark ? /\bexp-dark\b/ : /\bexp-prism\b/);
        if (!dark) await expect(page.locator('body')).not.toHaveClass(/\bexp-dark\b/);
        for (const width of [360, 1366]) {
            await page.setViewportSize({ width, height: 900 });
            await expectAssignment(page, assignments[4]);
            const geometry = await page.locator('#homeDailyDuty').evaluate(card => ({
                pageOverflow: document.documentElement.scrollWidth - innerWidth,
                left: card.getBoundingClientRect().left,
                right: card.getBoundingClientRect().right,
                overflow: card.scrollWidth - card.clientWidth,
                names: [...card.querySelectorAll('li')].map(person => ({
                    overflow: person.scrollWidth - person.clientWidth,
                    height: person.getBoundingClientRect().height
                }))
            }));
            expect(geometry.pageOverflow, `page overflow at ${width}px`).toBeLessThan(2);
            expect(geometry.left).toBeGreaterThanOrEqual(0);
            expect(geometry.right).toBeLessThanOrEqual(width + 1);
            expect(geometry.overflow).toBeLessThan(2);
            for (const person of geometry.names) {
                expect(person.overflow).toBeLessThan(2);
                expect(person.height).toBeGreaterThan(0);
            }
            await page.locator('#homeDailyDuty').screenshot({
                path: info.outputPath(`home-daily-duty-${dark ? 'dark' : 'light'}-${width}.png`)
            });
        }
    });
}

test('the public daily assignment renders while Firebase CDN blocks page loading', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-19T12:00:00+03:00'));
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let stalled = false;
    let domReady = false;
    page.once('domcontentloaded', () => { domReady = true; });
    await page.route('https://www.gstatic.com/firebasejs/**', async route => {
        stalled = true;
        await held;
        await route.abort();
    });
    try {
        await page.goto('/', { waitUntil: 'commit' });
        await expect.poll(() => stalled).toBe(true);
        await expectAssignment(page, assignments[0]);
        expect(domReady, 'the card must not wait for DOMContentLoaded or Firebase').toBe(false);
        expect(await page.evaluate(() => document.readyState)).toBe('loading');
    } finally {
        release();
        await page.waitForLoadState('domcontentloaded');
    }
});
