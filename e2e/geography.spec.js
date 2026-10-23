'use strict';

const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

async function homeAccountFixture(page) {
    await page.goto('/');
    await page.waitForFunction(() => window.AlmanionHomeDashboard);
    await page.evaluate(() => {
        window.geographyFixtureUser = null;
        window.AlmanionAccount = {
            getUser: () => window.geographyFixtureUser,
            hasEnglishAccess: () => new Promise(resolve => { window.resolveGeographyEnglish = resolve; })
        };
    });
}

async function setUser(page, user) {
    await page.evaluate(user => {
        window.geographyFixtureUser = user;
        window.dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user } }));
    }, user);
}

test('homepage geography link belongs only to the requested account and clears on logout', async ({ page }) => {
    await homeAccountFixture(page);
    const card = page.locator('#homeAdditionalGeography');
    await expect(card).toBeHidden();
    await expect(card).not.toHaveAttribute('href');
    for (const user of [
        { uid: 'geography-other', email: 'other@example.com', siteAdmin: true },
        { uid: 'geography-empty' },
        { uid: 'geography-alias', email: 'dmb23930+alias@gmail.com' }
    ]) {
        await setUser(page, user);
        await expect(card).toBeHidden();
        await expect(card).not.toHaveAttribute('href');
    }
    await setUser(page, { uid: 'geography-owner', email: 'DMB23930@gmail.com' });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('href', 'geography/');
    await setUser(page, null);
    await page.evaluate(() => window.resolveGeographyEnglish(true));
    await expect(card).toBeHidden();
    await expect(card).not.toHaveAttribute('href');
    await setUser(page, { uid: 'geography-owner', email: 'dmb23930@gmail.com' });
    await card.click();
    await expect(page).toHaveURL(/\/geography\/$/);
    const homeUrl = new URL('/', page.url()).href;
    await page.getByRole('link', { name: '← На главную' }).click();
    await expect(page).toHaveURL(homeUrl);
    await expect(page.locator('#homeMain')).toBeVisible();
});

test('cached homepage clears the private link and checks the current account when restored', async ({ page }) => {
    await homeAccountFixture(page);
    const card = page.locator('#homeAdditionalGeography');
    await setUser(page, { uid: 'geography-owner', email: 'dmb23930@gmail.com' });
    await expect(card).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    await expect(card).toBeHidden();
    await expect(card).not.toHaveAttribute('href');
    await page.evaluate(() => {
        window.geographyFixtureUser = { uid: 'geography-other', email: 'other@example.com' };
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await expect(card).toBeHidden();
    await page.reload();
    await expect(card).toBeHidden();
    await expect(card).not.toHaveAttribute('href');
});


async function chooseGroup(page, group) {
    const select = page.locator('#study-group');
    if (await select.isVisible()) await select.selectOption(group);
    else await page.locator(`[data-group="${group}"]`).click();
}

test.describe("standalone geography", () => {
    for (const width of [1366, 390, 320]) for (const dark of [false, true]) {
        test(`standalone geography map, groups and self-check at ${width}px, dark=${dark}`, async ({ page }, info) => {
            await page.setViewportSize({ width, height: 900 });
            await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
            const errors = [];
            const external = [];
            page.on('pageerror', error => errors.push(error.message));
            page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url()); });
            await page.goto('/geography/');
            const map = page;
            await expect(map.locator('#study-country-key button')).toHaveCount(21);
            expect(await map.locator('#study-main-map path[data-iso]').count()).toBeGreaterThan(150);
            await map.locator('#study-main-map g[data-capital="NZL"] circle[fill="transparent"]').first().click();
            await expect(map.locator('#study-selection')).toContainText('Новая Зеландия — Веллингтон');
            for (const [group, count] of [['1', 3], ['2', 5], ['3', 5], ['4', 5], ['5', 5], ['0', 21]]) {
                await chooseGroup(page, group);
                await expect(map.locator('#study-country-key button')).toHaveCount(count);
            }
            await map.locator('#study-country-key button[data-iso="PRT"]').click();
            await expect(map.locator('#study-main-map [data-map-label="PRT"]')).toContainText('Лиссабон');
            await map.locator('#study-hide').check();
            await expect(map.locator('#study-selection')).toContainText('Португалия — ?');
            await expect(map.locator('#study-main-map [data-map-label="PRT"]')).not.toContainText('Лиссабон');
            await map.locator('#study-reveal').click();
            await expect(map.locator('#study-selection')).toContainText('Португалия — Лиссабон');
            await expect(map.locator('#study-main-map [data-map-label="PRT"]')).toContainText('Лиссабон');
            expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
            expect(await map.locator('html').evaluate(element => element.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
            expect(errors).toEqual([]);
            expect(external).toEqual([]);
            await page.screenshot({ path: info.outputPath(`geography-${width}-${dark ? 'dark' : 'light'}.png`), fullPage: true });
            await map.locator('#study-country-key button[data-iso="VEN"]').scrollIntoViewIfNeeded();
            await expect(map.locator('#study-country-key button[data-iso="VEN"]')).toBeInViewport();
            await page.screenshot({ path: info.outputPath(`geography-bottom-${width}-${dark ? 'dark' : 'light'}.png`) });
            await page.reload();
            await expect(map.locator('#study-country-key button')).toHaveCount(21);
            await expect(map.locator('#study-hide')).toBeChecked();
            await expect(map.locator('#study-selection')).toContainText('Португалия — Лиссабон');
            await expect(page.getByRole('link', { name: '← На главную' })).toHaveAttribute('href', '../');
        });
    }
});

async function markCountry(page, iso) {
    const map = page.locator('#study-main-map');
    await map.scrollIntoViewIfNeeded();
    const point = await map.evaluate((svg, iso) => {
        const { width, height } = svg.viewBox.baseVal;
        const projection = d3.geoNaturalEarth1().fitExtent([[5, 5], [width - 5, height - 5]], { type: 'Sphere' });
        const country = svg.querySelector(`path[data-iso="${iso}"]`).__data__;
        const p = projection(d3.geoCentroid(country));
        const box = svg.getBoundingClientRect();
        return { x: box.x + p[0] * box.width / width, y: box.y + p[1] * box.height / height };
    }, iso);
    await page.mouse.click(point.x, point.y);
    await expect(page.locator(`[data-entry="${iso}"]`)).toBeVisible();
}

for (const width of [1366, 390]) for (const format of ['written', 'oral']) {
    test(`geography ${format} exam and saved progress at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('/geography/');
        await page.locator('#study-exam-mode').click();
        await chooseGroup(page, '5');
        await page.locator('#study-format').selectOption(format);
        await page.locator('#study-start').click();
        await expect(page.locator('#study-check')).toBeDisabled();
        const answers = [
            ['AUT', 'Австрия', 'Вена'], ['PAK', 'Пакистан', 'Исламабад'],
            ['NGA', 'Нигерия', 'Абуджа'], ['MEX', 'Мексика', 'Мехико'],
            ['VEN', 'Венесуэла', 'Каракас']
        ];
        for (const [iso, country, capital] of answers) {
            await markCountry(page, iso);
            if (format === 'written') {
                const row = page.locator(`[data-entry="${iso}"]`);
                await row.locator('[data-answer="countryAnswer"]').fill(country.toUpperCase());
                await row.locator('[data-answer="capitalAnswer"]').fill(capital);
            }
        }
        await expect.poll(() => page.evaluate(() => {
            const state = JSON.parse(localStorage.getItem('geopractice:study-state:v3'))?.privateContent;
            return state?.entries.length === 5 && (state.kind === 'oral' || state.entries[4].capitalAnswer === 'Каракас');
        })).toBe(true);
        await page.reload();
        await expect(page.locator('#study-world-map')).toHaveAttribute('data-status', 'active');
        await expect(page.locator('[data-entry]')).toHaveCount(5);
        if (format === 'written') {
            await expect(page.locator('[data-entry="VEN"] [data-answer="capitalAnswer"]')).toHaveValue('Каракас');
            await page.locator('[data-entry="VEN"] [data-answer="capitalAnswer"]').fill('Москва');
        }
        await page.locator('#study-check').click();
        if (format === 'oral') {
            await expect(page.locator('#study-result-score')).toHaveText('?/5');
            for (const select of await page.locator('[data-self]').all()) await select.selectOption('yes');
            await expect(page.locator('#study-result-score')).toHaveText('5/5');
        } else {
            await expect(page.locator('#study-result-score')).toHaveText('4/5');
            await expect(page.locator('[data-result-iso="VEN"]')).toHaveAttribute('data-correct', 'false');
        }
        await page.reload();
        await expect(page.locator('#study-result-score')).toHaveText(format === 'oral' ? '5/5' : '4/5');
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        expect(errors).toEqual([]);
    });
}
