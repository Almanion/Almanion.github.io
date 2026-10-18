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
    await page.clock.install({ time: new Date('2026-10-18T12:00:00+03:00') });
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
