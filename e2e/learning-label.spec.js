'use strict';

const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
        ? route.continue() : route.abort());
});

for (const route of ['physics.html', 'physics-10.html', 'likbez.html', 'russian-ege.html']) {
    test('learning opens the full topic list directly on ' + route, async ({ page }) => {
        await page.goto('/' + route);
        const launch = page.locator('#knowledgeCheckBtn');
        await expect(launch).toHaveAccessibleName('Учить');
        await launch.click();
        await expect(page.locator('#kcSelectTitle')).toHaveText('Учить');
        await expect(page.locator('.kc-topic-group .kc-deck').first()).toBeInViewport();
        await expect(page.locator('#kcTopicOptions details')).toHaveCount(0);
        await expect(page.locator('#kcReviewOverlay')).toBeHidden();
        await expect(page.locator('#kcReviewModal')).toHaveAttribute('aria-label', 'Сессия обучения');
        await page.locator('#kcSelectClose').click();
        await expect(page.locator('#kcSelectOverlay')).toBeHidden();
        await expect(launch).toBeFocused();
    });
}

test('mobile learning opens the picker and shows pause help beside its setting', async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/physics-10.html');
    const launch = page.locator('.exp-bottom-nav').getByRole('button', { name: 'Учить', exact: true });
    await launch.click();
    const picker = page.locator('#kcSelectModal');
    const help = picker.getByRole('button', { name: 'Как работают паузы повторения' });
    const explanation = picker.locator('#kcPauseExplanation');
    const choices = picker.locator('#kcPauseChoices');
    await expect(picker).toBeVisible();
    await expect(picker.locator('#kcTopicSearch')).not.toBeFocused();
    await expect(picker.locator('#kcStart')).toBeInViewport();
    await expect(explanation).toBeHidden();
    await help.click();
    await expect(help).toHaveAttribute('aria-expanded', 'true');
    await expect(explanation).toContainText('можно учить другие');
    await expect(explanation).toBeInViewport();
    await expect(choices).toBeHidden();
    await expect(picker.locator('#kcPauseValue')).toHaveText('1 мин');
    expect(await picker.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath('pause-help-phone.png') });
    await page.keyboard.press('Escape');
    await expect(help).toBeFocused();
    await expect(explanation).toBeHidden();
    await expect(picker).toBeVisible();
    await help.click();
    await picker.locator('#kcPauseToggle').click();
    await expect(explanation).toBeHidden();
    await expect(choices).toBeVisible();
    await choices.getByRole('button', { name: '15 с', exact: true }).click();
    await expect(picker.locator('#kcPauseValue')).toHaveText('15 с');
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    await expect(launch).toBeFocused();
});

test('picker and pause help are available in English', async ({ page }) => {
    await page.goto('/physics-10.html');
    await page.evaluate(() => { document.documentElement.lang = 'en'; document.body.dataset.uiLanguage = 'en'; });
    await page.addScriptTag({ url: '/english-ui.js' });
    const launch = page.locator('#knowledgeCheckBtn');
    await expect(launch).toHaveAccessibleName('Learn');
    await launch.click();
    await expect(page.locator('#kcSelectTitle')).toHaveText('Learn');
    await expect(page.locator('#kcReviewModal')).toHaveAttribute('aria-label', 'Learning session');
    await expect(page.getByRole('button', { name: 'Show all', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'How review pauses work' }).click();
    await expect(page.locator('#kcPauseExplanation')).toContainText('You can study other cards');
});

test('legacy types select grouped filters and keep original card kinds in the queue', async ({ page }) => {
    await page.goto('/physics-10.html');
    const topicId = await page.locator('article.exp-reader-current').evaluate(article => {
        article.replaceChildren(article.querySelector('.topic-title'));
        for (const kind of ['definition', 'statement', 'theorem', 'formula', 'derivation', 'proof', 'example']) {
            const card = document.createElement('div');
            card.className = kind + '-box';
            card.dataset.kcId = 'grouped-' + kind;
            card.innerHTML = '<strong>Термин ' + kind + '</strong><p>Ответ.</p>';
            article.append(card);
        }
        AlmanionKCStorage.set('kc_preferences_v3_' + location.pathname, JSON.stringify({
            topics: [article.id], kinds: ['theorem', 'proof', 'example'], limit: 'all'
        }));
        return article.id;
    });
    await page.locator('#knowledgeCheckBtn').click();
    const primary = page.locator('#kcPrimaryTypeList');
    const extra = page.locator('#kcExtraTypeList');
    const toggle = page.getByRole('button', { name: 'Показать все', exact: true });
    await expect(primary.locator('.kc-type-name')).toHaveText(['Определения', 'Формулы', 'Выводы']);
    await expect(extra).toBeHidden();
    await expect(page.locator('#kcTypeList [data-kind="proof"], #kcTypeList [data-kind="statement"], #kcTypeList [data-kind="theorem"]')).toHaveCount(0);
    await expect(primary.locator('[data-kind="definition"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(primary.locator('[data-kind="derivation"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(primary.locator('[data-kind="formula"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(primary.locator('[data-kind="definition"] .kc-type-count')).toHaveText('3');
    await expect(primary.locator('[data-kind="derivation"] .kc-type-count')).toHaveText('2');
    await expect(page.locator('#kcExtraTypesSelected')).toHaveText('Дополнительно выбрано 1');
    await toggle.click();
    await expect(extra.locator('[data-kind="example"]')).toHaveAttribute('aria-pressed', 'true');
    await extra.locator('[data-kind="example"]').click();
    await expect(page.locator('#kcStartCount')).toHaveText('5');
    await page.getByRole('button', { name: 'Только основные' }).click();
    await expect(extra).toBeHidden();
    await expect(page.locator('#kcExtraTypesSelected')).toBeHidden();
    await page.locator('#kcStart').click();
    await expect(page.locator('.kc-kind-label')).toHaveText(/^(Определения|Выводы)$/);

    const saved = await page.evaluate(() => JSON.parse(AlmanionKCStorage.get('kc_session_v3_' + location.pathname)));
    expect(saved.selectedTopicIds).toEqual([topicId]);
    expect(saved.queue).toHaveLength(5);
    const cardIds = await page.evaluate(id =>
        ['definition', 'statement', 'theorem', 'derivation', 'proof'].map(kind =>
            __kcFSRS.stableCardId({ topicId: id, kind, sourceId: 'grouped-' + kind })), topicId);
    expect(saved.queue.map(entry => entry.cardId)).toEqual(expect.arrayContaining(cardIds));
});

test('a paragraph without cards still opens the other topics', async ({ page }) => {
    await page.goto('/physics-10.html');
    const emptyTopic = await page.locator('article.exp-reader-current').evaluate(article => {
        article.replaceChildren(article.querySelector('.topic-title'));
        return article.id;
    });
    await page.locator('#knowledgeCheckBtn').click();
    await expect(page.locator('#kcTopicOptions')).toBeVisible();
    await expect(page.locator('.kc-deck[data-topic="' + emptyTopic + '"]')).toHaveCount(0);
    await expect(page.locator('#kcReviewOverlay')).toBeHidden();
});

test('reopening a finished selection preserves its scope and waits for the user', async ({ page }) => {
    await page.goto('/physics-10.html');
    const launch = page.locator('#knowledgeCheckBtn');
    const topicId = await page.locator('article.exp-reader-current').getAttribute('id');
    const topic = page.locator('.kc-deck[data-topic="' + topicId + '"]');
    // The direct launcher itself is covered above. Avoid a pointer race while the sidebar hydrates.
    await launch.evaluate(button => button.click());
    await page.locator('#kcSelectAll').click();
    await topic.click();
    await page.locator('#kcStart').click();
    await page.locator('#kcFront').click();
    await page.locator('#kcGrades [data-g="4"]').click();
    await page.locator('#kcDone').click();
    await launch.click();
    await expect(topic).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.kc-deck[aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator('#kcRecommendation')).toHaveText('Пока нет карточек к повторению');
    await expect(page.locator('#kcStart')).toBeDisabled();
});
