'use strict';
const { test, expect } = require('@playwright/test');
const { setupAdmin } = require('./helpers/admin-fixture.cjs');
async function expectNoHorizontalOverflow(page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }
test('admin controls stay interactive after dialogs and list changes', async function ({ page }) {
    const pageErrors = [];
    page.on('pageerror', function (error) { pageErrors.push(error.message); });
    await setupAdmin(page, { failDirectoryStartup: true });
    await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#dashboard')).toBeVisible();

    await page.locator('#tab-analytics').click();
    await page.locator('#refreshUsageBtn').click();
    await expect(page.locator('.admin-toast').last()).toContainText('Аналитика обновлена');
    await page.locator('#tab-users').click();
    await page.locator('#refreshRegisteredAccountsBtn').click();
    await expect(page.locator('.admin-toast').last()).toContainText('Список аккаунтов обновлён');
    await page.locator('#registeredAccountsSearch').fill('editor@example.com');
    await expect(page.locator('#registeredAccountsList')).toContainText('editor@example.com');
    await page.locator('#registeredAccountsSearch').fill('');

    await page.locator('#tab-polls').click();
    const addOption = page.locator('#addOptionBtn');
    await expect(addOption).toBeVisible();
    await addOption.click();
    await expect(page.locator('#optionsList .option-row')).toHaveCount(3);
    await page.locator('#optionsList .remove-option').last().click();
    await expect(page.locator('#optionsList .option-row')).toHaveCount(2);
    await page.locator('#sendPollBtn').click();
    await expect(page.locator('.admin-toast').last()).toContainText('Введите вопрос');

    await page.locator('#tab-analytics').click();
    const visitorsToggle = page.locator('#allVisitorsToggle');
    await visitorsToggle.click();
    await expect(page.locator('#allVisitorsBody')).toBeHidden();
    await visitorsToggle.click();
    await expect(page.locator('#allVisitorsBody')).toBeVisible();
    await page.locator('[data-admin-command="load-visitors"][data-admin-value="today"]').click();
    await expect(page.locator('#allVisitorsList')).toContainText('Test visitor');

    await page.locator('#tab-polls').click();
    const pollDetails = page.locator('[data-admin-command="toggle-voters"]');
    await pollDetails.click();
    await expect(page.locator('.poll-voter-list')).toHaveClass(/open/);

    await page.locator('#poll-poll1 [data-admin-command="delete-poll"]').click();
    await expect(page.locator('.admin-dialog-overlay')).toBeVisible();
    await page.locator('.admin-dialog .btn-outline').click();
    await page.locator('#poll-poll2 [data-admin-command="close-poll"]').click();
    await expect(page.locator('.admin-dialog-overlay')).toBeVisible();
    await page.locator('.admin-dialog .btn-outline').click();

    await page.locator('#tab-overview').click();
    await page.locator('#onlineTableBody [data-admin-command="rename-visitor"]').first().click();
    await expect(page.locator('.admin-dialog-overlay')).toBeVisible();
    await page.locator('.admin-dialog .btn-outline').click();

    await page.locator('[data-admin-command="open-visitor-profile"]').first().click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await page.locator('.modal-overlay [data-admin-command="close-legacy-modal"]').click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);

    await page.locator('#tab-analytics').click();
    await page.locator('#allVisitorsList [data-admin-command="delete-visitor"]').click();
    await expect(page.locator('.admin-dialog-overlay')).toBeVisible();
    await page.locator('.admin-dialog .btn-outline').click();

    await page.locator('#tab-users').click();
    await page.locator('#adminRolesList .btn', { hasText: 'Изменить' }).click();
    await expect(page.locator('#adminRoleAccount')).toHaveValue('editor@example.com');
    await page.locator('#contestsAccessRole').check();
    await expect(page.getByRole('checkbox', { name: /Прогнозы/ })).toHaveCount(0);
    await page.locator('#adminRoleForm button[type="submit"]').click();
    await expect(page.locator('#adminRoleForm button[type="submit"]')).toBeEnabled();
    await expect(page.locator('#adminRolesList .admin-role-row').filter({ hasText: 'editor@example.com' })).toContainText('Контесты');
    await page.locator('#contestShareEnable').click();
    await expect(page.locator('#contestShareStatus')).toContainText('Включён');
    const firstLink = await page.locator('#contestShareUrl').inputValue();
    expect(firstLink).toMatch(/^https:\/\/almanion\.github\.io\/contests\.html#access=[a-f0-9]{64}$/);
    await page.locator('#contestShareRotate').click();
    await expect(page.locator('#contestShareUrl')).not.toHaveValue(firstLink);
    await page.locator('#contestShareDisable').click();
    await expect(page.locator('#contestShareStatus')).toHaveText('Выключен');
    await expect(page.locator('#contestShareUrl')).toHaveValue('');
    await expect(page.locator('#contestShareField')).toBeHidden();

    await page.locator('#tab-overview').click();
    await page.locator('[data-admin-command="open-direct-message"]').first().click();
    await page.locator('[data-admin-command="dm-mode"][data-admin-value="poll"]').click();
    await expect(page.locator('#dmPollForm')).toBeVisible();
    await page.locator('[data-admin-command="add-dm-option"]').click();
    await expect(page.locator('.dm-poll-option')).toHaveCount(3);
    await page.locator('.modal-overlay [data-admin-command="close-legacy-modal"]').click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);

    await page.locator('#tab-data').click();
    await page.locator('[data-admin-command="clear-daily-stats"]').click();
    await expect(page.locator('.admin-dialog-overlay')).toBeVisible();
    await page.locator('.admin-dialog .btn-outline').click();
    await expect(page.locator('.admin-dialog-overlay')).toHaveCount(0);
    await expect(page.locator('#dashboard')).not.toHaveAttribute('inert', '');

    await page.locator('[data-admin-command="clear-presence"]').click();
    await expect(page.locator('.admin-dialog-overlay')).toBeVisible();
    await page.evaluate(function () {
        document.querySelector('.admin-dialog-overlay').remove();
        window.dispatchEvent(new Event('pageshow'));
    });
    await expect(page.locator('.admin-dialog-overlay')).toHaveCount(0);
    await expect(page.locator('#dashboard')).not.toHaveAttribute('inert', '');
    await page.locator('#tab-polls').click();
    await addOption.click();
    await expect(page.locator('#optionsList .option-row')).toHaveCount(3);

    await page.locator('#tab-data').click();
    await page.locator('[data-admin-command="clear-all-data"]').click();
    await expect(page.locator('.admin-dialog-overlay')).toBeVisible();
    await page.locator('.admin-dialog .btn-outline').click();
    await expect(page.locator('.admin-dialog-overlay')).toHaveCount(0);

    await page.locator('#tab-polls').click();
    await page.locator('#broadcastText').fill('Test message');
    await page.locator('#broadcastBtn').click();
    await expect(page.locator('.admin-dialog-overlay')).toBeVisible();
    await page.locator('.admin-dialog .btn-outline').click();
    await expect(page.locator('.admin-dialog-overlay')).toHaveCount(0);
    await expect(page.locator('#broadcastBtn')).toBeEnabled();
    await page.locator('#tab-users').click();
    for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await page.locator('#registeredAccountsSection').scrollIntoViewIfNeeded();
        const refresh = page.locator('#refreshRegisteredAccountsBtn');
        const bounds = await refresh.boundingBox();
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        await refresh.click();
        await expect(refresh).toBeEnabled();
        await expectNoHorizontalOverflow(page);
    }
    expect(pageErrors).toEqual([]);
});


for (const [width, dark] of [[320, false], [390, true], [768, false], [1440, true]]) {
    test(`admin navigation and account access fit ${width}, dark=${dark}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await setupAdmin(page);
        await page.addInitScript(dark => {
            localStorage.setItem('almanion:visual-defaults:2026-09-05-v1', '1');
            localStorage.setItem('siteSettings', JSON.stringify({ experimental: true, expTheme: dark ? 'dark' : 'light' }));
        }, dark);
        await page.goto('/admin.html');
        await expect(page.locator('#dashboard')).toBeVisible();
        await expect(page.locator('#uniqueCount')).toHaveText('2');
        for (const key of ['overview', 'users', 'analytics', 'polls', 'data']) {
            await page.locator('#tab-' + key).click();
            await expect(page.locator('#view-' + key)).toBeVisible();
            await expect(page.locator('.admin-view:visible')).toHaveCount(1);
            await expect(page.locator('#tab-' + key)).toHaveAttribute('aria-selected', 'true');
            await expectNoHorizontalOverflow(page);
            const bounds = await page.locator('#tab-data').boundingBox();
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
        }
        await page.locator('#tab-users').click();
        await page.locator('#registeredAccountsSearch').fill('editor@');
        await expect(page.locator('.registered-account-row')).toHaveCount(1);
        await page.locator('.account-access-button').click();
        await expect(page.locator('#adminRoleAccount')).toHaveValue('editor@example.com');
        await expect(page.locator('#contentEditorRole')).toBeChecked();
        await page.locator('#contestsAccessRole').check();
        if (width <= 760) {
            const save = await page.locator('.admin-role-save').boundingBox();
            expect(save.y).toBeGreaterThanOrEqual(0);
            expect(save.y + save.height).toBeLessThanOrEqual(844);
        }
        await page.locator('#tab-polls').click();
        await page.goBack();
        await expect(page.locator('#view-users')).toBeVisible();
        await expect(page.locator('#contestsAccessRole')).toBeChecked();
        await page.locator('#adminRoleReset').click();
        await expect(page.locator('#adminRoleAccount')).toHaveValue('');
        await expect(page.locator('#contestsAccessRole')).not.toBeChecked();
        await page.locator('#tab-users').focus();
        await page.keyboard.press('End');
        await expect(page.locator('#view-data')).toBeVisible();
        await expect(page.locator('#tab-data')).toBeFocused();
        await page.keyboard.press('Home');
        await expect(page.locator('#view-overview')).toBeVisible();
        if (width <= 760) {
            await page.locator('#onlineTable').scrollIntoViewIfNeeded();
            await expect(page.locator('#onlineTable [data-admin-command="open-visitor-profile"]')).toBeInViewport();
        }
    });
}

test('sign-out clears private data and listeners, and repeated login restarts a single subscription', async ({ page }) => {
    await setupAdmin(page);
    await page.goto('/admin.html#users');
    await expect(page.locator('#registeredAccountsList')).toContainText('editor@example.com');
    await expect.poll(() => page.evaluate(() => adminFixture.listenerCount())).toBeGreaterThan(0);
    const listenerCount = await page.evaluate(() => adminFixture.listenerCount());
    await page.locator('#tab-polls').click();
    await page.locator('#broadcastText').fill('Private draft');
    await page.locator('#pollQuestion').fill('Private question');
    await page.locator('#tab-data').click();
    await page.locator('[data-admin-command="clear-presence"]').click();
    await expect(page.locator('.admin-dialog-overlay')).toBeVisible();
    await page.evaluate(() => adminFixture.logout());
    await expect(page.locator('#dashboard')).toBeHidden();
    await expect(page.locator('.admin-dialog-overlay')).toHaveCount(0);
    await expect(page.locator('#registeredAccountsList')).toBeEmpty();
    await expect(page.locator('#adminRolesList')).toBeEmpty();
    expect(await page.evaluate(() => adminFixture.listenerCount())).toBe(0);
    await page.locator('#loginEmail').fill('dmb23930@gmail.com');
    await page.locator('#loginPassword').fill('test-only');
    await page.locator('#loginBtn').click();
    await expect(page.locator('#dashboard')).toBeVisible();
    await expect(page.locator('#registeredAccountsList')).toContainText('editor@example.com');
    await expect.poll(() => page.evaluate(() => adminFixture.listenerCount())).toBe(listenerCount);
    await expect(page.locator('#broadcastText')).toHaveValue('');
    await expect(page.locator('#pollQuestion')).toHaveValue('');
    await expect(page.locator('#refreshRegisteredAccountsBtn')).toBeEnabled();
    await page.evaluate(() => adminFixture.owner());
    await expect.poll(() => page.evaluate(() => adminFixture.listenerCount())).toBe(listenerCount);
});

test('assigned administrator cannot see or request owner-only access controls', async ({ page }) => {
    await setupAdmin(page, { role: 'admin' });
    await page.goto('/admin.html#users');
    await expect(page.locator('#dashboard')).toBeVisible();
    await expect(page.locator('#registeredAccountsList')).toContainText('editor@example.com');
    await expect(page.locator('#adminRolesSection')).toBeHidden();
    await expect(page.locator('#contestSharingSection')).toBeHidden();
    await expect(page.locator('.account-access-button')).toHaveCount(0);
    const reads = await page.evaluate(() => adminFixture.reads());
    expect(reads).not.toContain('adminRoles');
    expect(reads).not.toContain('contestSharing');
});

test('forecast deep link is owner-only and the ledger is only subscribed while the tab is open', async ({page}) => {
    await setupAdmin(page, { role: 'admin' });
    await page.goto('/admin.html#forecasts');
    await expect(page.locator('#view-overview')).toBeVisible();
    await expect(page.locator('#tab-forecasts')).toBeHidden();
    expect(await page.evaluate(() => adminFixture.reads())).not.toContain('physicsForecast/events');
    await page.evaluate(() => adminFixture.owner());
    await expect(page.locator('#tab-forecasts')).toHaveAttribute('aria-selected','true');
    await expect(page.locator('#createRound')).toBeVisible();
    await expect(page.locator('#forecastOpen')).toHaveText('0');
    await expect(page.locator('#forecastEventData')).toBeHidden();
    await page.locator('#tab-overview').click();
    await expect(page.locator('#view-forecasts')).toBeHidden();
    const inactive = await page.evaluate(() => adminFixture.listenerCount());
    await page.locator('#tab-forecasts').click(); await expect(page.locator('#forecastOpen')).toHaveText('0');
    await expect.poll(() => page.evaluate(() => adminFixture.listenerCount())).toBe(inactive + 3);
    await page.evaluate(() => adminFixture.admin());
    await expect(page.locator('#view-overview')).toBeVisible();
    await expect(page.locator('#tab-forecasts')).toBeHidden();
    await expect(page.locator('#forecastTraders')).toBeEmpty();
    await expect(page.locator('#adminFeedback')).toBeEmpty();
});

test('late directory responses cannot restore an old admin session', async ({ page }) => {
    await setupAdmin(page, { deferDirectory: true });
    await page.goto('/admin.html#users');
    await expect(page.locator('#dashboard')).toBeVisible();
    await page.evaluate(() => { adminFixture.logout(); adminFixture.flushDirectory(); });
    await expect(page.locator('#loginScreen')).toBeVisible();
    await expect(page.locator('#registeredAccountsList')).toBeEmpty();
    await expect(page.locator('#adminRolesList')).toBeEmpty();
    await expect(page.locator('#adminRolesSection')).toBeHidden();
});

test('account permissions cannot be replaced before existing roles arrive', async ({ page }) => {
    await setupAdmin(page, { deferRoles: true });
    await page.goto('/admin.html#users');
    await expect(page.locator('#registeredAccountsList')).toContainText('editor@example.com');
    await expect(page.locator('.account-access-button')).toBeDisabled();
    await expect(page.locator('.admin-role-save')).toBeDisabled();
    await expect(page.locator('#adminRoleAccount')).toBeDisabled();
    await page.evaluate(() => adminFixture.flushRoles());
    await page.locator('.account-access-button').click();
    await expect(page.locator('#contentEditorRole')).toBeChecked();
    await expect(page.locator('.admin-role-save')).toBeEnabled();
});

test('login has an empty email field and a route back to the site', async ({ page }) => {
    await setupAdmin(page, { signedOut: true });
    await page.goto('/admin.html');
    await expect(page.locator('#loginEmail')).toHaveValue('');
    await expect(page.locator('.admin-login-home')).toHaveAttribute('href', 'index.html');
    await page.locator('#loginBtn').click();
    await expect(page.locator('#loginError')).toContainText('Заполните все поля');
    await expectNoHorizontalOverflow(page);
});
