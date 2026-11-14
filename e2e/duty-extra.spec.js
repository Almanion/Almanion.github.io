'use strict';

const { test, expect } = require('@playwright/test');

const assignments = [
    { date: '2026-10-19', people: ['Максим Казаков', 'Даня Луконин', 'Федя Гринь', 'Саша Деревягин', 'Олег Чуднов'] },
    { date: '2026-10-20', people: ['Андрей Кузь', 'Дима Петров', 'Миша Балуев', 'Ваня Щербак', 'Ваня Коршиков'] },
    { date: '2026-10-21', people: ['Артём Львов', 'Вова Дубейко', 'Саша Свердлов', 'Ярик Сысоев'] },
    { date: '2026-10-23', people: ['Аня Шубина', 'Полина Лубневская', 'Соня Гаранина', 'Уля Попова', 'Даша Волкова'] },
    { date: '2026-10-24', people: ['Саша Михлин', 'Ваня Кисмерешкин', 'Дима Белоцерковцев', 'Катя Айзикович'] }
];

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.clock.install({ time: new Date('2026-10-19T12:00:00+03:00') });
});

test('the dated daily duty matches the supplied assignments and remains independent of the annual schedule', async ({ page }) => {
    await page.goto('/duty-10-1.html');
    const extra = page.locator('#dutyExtraSchedule');
    await expect(extra.getByRole('heading', { name: 'Дежурство по дням', exact: true })).toBeVisible();
    await expect(extra.locator('.duty-extra-day')).toHaveCount(assignments.length);
    expect(await extra.locator('.duty-extra-day').evaluateAll(days => days.map(day => day.dataset.dutyDate)))
        .toEqual(assignments.map(day => day.date));

    for (const assignment of assignments) {
        const day = extra.locator('[data-duty-date="' + assignment.date + '"]');
        await expect(day.locator('h3')).toBeVisible();
        await expect(day.locator('time')).toHaveAttribute('datetime', assignment.date);
        await expect(day.locator('ul li')).toHaveText(assignment.people);
    }
    await expect(extra.locator('[data-duty-date="2026-10-22"]')).toHaveCount(0);
    await expect(page.locator('#dutyMonthFilters .duty-month-filter').first()).toBeVisible();
    await expect(page.locator('#dutyGroups .duty-week-card').first()).toBeVisible();
    await expect(page.locator('#dutyEditButton')).toBeHidden();

    await page.locator('#dutyMonthFilters [data-month="all"]').click();
    await expect(page.locator('#dutyGroups .duty-week-card')).toHaveCount(35);
    await expect(extra.locator('.duty-extra-day')).toHaveCount(5);
    await page.locator('#dutySearchInput').fill('Близнец');
    await expect(extra.locator('.duty-extra-day')).toHaveCount(5);
    await expect(extra.locator('[data-duty-date="2026-10-19"] ul li')).toHaveText(assignments[0].people);
});

test('current and next shifts precede the collapsed daily archive', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-14T12:00:00+03:00'));
    await page.goto('/duty-10-1.html');
    await expect(page.locator('#dutyFocusLabel')).toHaveText('Сейчас дежурят');
    await expect(page.locator('#dutyNext')).toBeVisible();
    const people = await page.locator('#dutyNextPeople').innerText();
    expect(people.length).toBeGreaterThan(0);
    expect(people).not.toBe(await page.locator('#dutyFocusTitle').innerText());
    const extra = page.locator('#dutyExtraDetails');
    await expect(extra).toHaveJSProperty('open', false);
    await extra.locator('summary').click();
    await expect(extra.locator('.duty-extra-day').first()).toBeVisible();
    await page.clock.setFixedTime(new Date('2027-01-04T12:00:00+03:00'));
    await page.reload();
    await expect(page.locator('#dutyFocusLabel')).toHaveText('Следующее дежурство');
    await expect(page.locator('#dutyNext')).toBeHidden();
});

for (const dark of [false, true]) {
    test(`daily duty remains readable without overflow in ${dark ? 'dark' : 'light'} theme`, async ({ page }, info) => {
        await page.addInitScript(darkTheme => {
            localStorage.setItem('almanion:visual-defaults:2026-09-05-v1', '1');
            localStorage.setItem('siteSettings', JSON.stringify({
                visualDefaultsVersion: 1,
                experimental: true,
                expMode: 'prism',
                expTheme: darkTheme ? 'dark' : 'light',
                expDark: darkTheme,
                animationLevel: 'off'
            }));
        }, dark);
        await page.goto('/duty-10-1.html');
        const extra = page.locator('#dutyExtraSchedule');
        await expect(extra).toBeVisible();
        await expect(page.locator('body')).toHaveClass(dark ? /\bexp-dark\b/ : /\bexp-prism\b/);
        if (!dark) await expect(page.locator('body')).not.toHaveClass(/\bexp-dark\b/);

        for (const width of [360, 390, 768, 1366]) {
            await page.setViewportSize({ width, height: 900 });
            await expect(extra.locator('.duty-extra-day')).toHaveCount(5);
            const geometry = await extra.evaluate(section => ({
                pageOverflow: document.documentElement.scrollWidth - innerWidth,
                cards: [...section.querySelectorAll('.duty-extra-day')].map(card => ({
                    left: card.getBoundingClientRect().left,
                    right: card.getBoundingClientRect().right,
                    overflow: card.scrollWidth - card.clientWidth
                })),
                names: [...section.querySelectorAll('li')].map(person => ({
                    overflow: person.scrollWidth - person.clientWidth,
                    height: person.getBoundingClientRect().height
                }))
            }));
            expect(geometry.pageOverflow, `page overflow at ${width}px`).toBeLessThan(2);
            for (const card of geometry.cards) {
                expect(card.left).toBeGreaterThanOrEqual(0);
                expect(card.right).toBeLessThanOrEqual(width + 1);
                expect(card.overflow).toBeLessThan(2);
            }
            for (const person of geometry.names) {
                expect(person.overflow).toBeLessThan(2);
                expect(person.height).toBeGreaterThan(0);
            }
            await extra.screenshot({ path: info.outputPath(`daily-duty-${dark ? 'dark' : 'light'}-${width}.png`) });
        }
    });
}

test('duty editors can restore a draft, resolve a newer revision and publish it', async ({ page }) => {
    // Only the Firebase and account boundaries are replaced. The page and editor run as shipped.
    await page.route('**/account.js*', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
    await page.route('**/firebase-analytics.js*', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
    await page.addInitScript(() => {
        const user = { uid: 'duty-test-editor' };
        let cloud;
        let onValue;
        const snapshot = () => ({ val: () => cloud });
        const writes = [];
        const ref = {
            on(event, listener) {
                onValue = listener;
                cloud = { ...window.AlmanionDuty.DEFAULT_SCHEDULE, revision: 3 };
                onValue(snapshot());
            },
            once: async () => snapshot(),
            async set(value) {
                cloud = value;
                writes.push(value);
                onValue(snapshot());
            }
        };
        const database = { ref: () => ref };
        window.AlmanionAccount = { database, getUser: () => null, hasDutyEditorAccess: async account => account.uid === user.uid };
        window.firebase = { database: Object.assign(() => database, { ServerValue: { TIMESTAMP: Date.now() } }) };
        window.dutyFixture = {
            writes,
            signIn(uid) {
                window.dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user: { uid } } }));
            },
            publishNewerRevision() {
                cloud = { ...cloud, revision: cloud.revision + 1 };
                onValue(snapshot());
            }
        };
    });
    await page.goto('/duty-10-1.html');
    const edit = page.locator('#dutyEditButton');
    const overlay = page.locator('#dutyEditorOverlay');
    const note = overlay.locator('[data-field="note"]').first();
    const people = overlay.locator('[data-field="people"]').first();
    const notice = page.locator('#dutyEditorNotice');
    await expect(page.locator('#dutySyncStatus')).toContainText('Синхронизировано');
    await expect(edit).toBeHidden();
    await page.evaluate(() => window.dutyFixture.signIn('reader'));
    await expect(edit).toBeHidden();
    await page.evaluate(() => window.dutyFixture.signIn('duty-test-editor'));
    await edit.click();
    await note.fill('Первая смена');
    await page.locator('#dutyEditorClose').click();
    await page.reload();
    await page.evaluate(() => window.dutyFixture.signIn('duty-test-editor'));
    await edit.click();
    await expect(note).toHaveValue('Первая смена');
    await expect(page.locator('#dutyDraftState')).toContainText('Восстановлен черновик');

    const originalPeople = await people.inputValue();
    await people.fill('');
    await page.locator('#dutyEditorSave').click();
    await expect(page.locator('#dutyEditorError')).toBeVisible();
    expect(await page.evaluate(() => window.dutyFixture.writes.length)).toBe(0);
    await people.fill(originalPeople);

    await page.evaluate(() => window.dutyFixture.publishNewerRevision());
    await expect(notice).toBeVisible();
    await page.locator('#dutyUseCloudButton').click();
    await expect(note).not.toHaveValue('Первая смена');
    await note.fill('Уточнённая смена');
    await page.evaluate(() => window.dutyFixture.publishNewerRevision());
    await page.locator('#dutyKeepDraftButton').click();
    await expect(note).toHaveValue('Уточнённая смена');
    await page.locator('#dutyEditorSave').click();
    await expect(overlay).toBeHidden();
    const writes = await page.evaluate(() => window.dutyFixture.writes);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ version: 2, revision: 6, updatedBy: 'duty-test-editor' });
    expect(Object.values(writes[0].entries).some(entry => entry.note === 'Уточнённая смена')).toBe(true);
    await page.locator('#dutyMonthFilters').getByRole('button', { name: 'Весь год', exact: true }).click();
    await expect(page.locator('#dutyGroups')).toContainText('Уточнённая смена');
    const draftKey = 'almanion:class-duty:grade10_1:draft:v2:duty-test-editor';
    expect(await page.evaluate(key => localStorage.getItem(key), draftKey)).toBeNull();
    await edit.click();
    await page.evaluate(() => window.dutyFixture.signIn('reader'));
    await expect(overlay).toBeHidden();
    await expect(edit).toBeHidden();
});
