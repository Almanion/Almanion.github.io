'use strict';

const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

test('the grade 10 literature card opens the playable illustrated activity', async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto('/');
    await page.getByRole('tab', { name: '10 класс', exact: true }).click();
    const card = page.locator('#gradePanel10 a[href="literature-10.html"]');
    await expect(card).not.toContainText('Готовится');
    await card.click();
    await expect(page.getByRole('heading', { name: 'Бюро находок Обломова', exact: true })).toBeVisible();
    const launch = page.getByRole('link', { name: 'Открыть игру в новой вкладке' });
    const opened = page.waitForEvent('popup');
    await launch.click();
    const game = await opened;
    await expect(game).toHaveTitle(/Бюро находок Обломова/);
    await game.getByRole('button', { name: 'Начать игру', exact: true }).click();
    await expect(game.locator('#caseTitle')).toHaveText('Что это за вещь?');
    await game.getByRole('button', { name: 'Показать ответ' }).click();
    await expect(game.locator('#caseTitle')).toHaveText('Халат');
    await expect.poll(() => game.locator('.object-art').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    await game.close();
    await expect(launch).toBeVisible();
});
