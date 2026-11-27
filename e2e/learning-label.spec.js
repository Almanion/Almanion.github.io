'use strict';
const {test,expect} = require('@playwright/test');
test.use({serviceWorkers:'block'});
test.beforeEach(async ({page})=>{
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());
});
for(const route of ['physics.html','physics-10.html','likbez.html','russian-ege.html']) {
    test('learning launcher and dialog: '+route,async ({page})=>{
        await page.goto('/'+route);
        await expect(page.locator('#knowledgeCheckBtn')).toHaveAccessibleName('Учить');
        await page.locator('#knowledgeCheckBtn').click();
        await expect(page.locator('#kcFront')).toBeVisible();
        await page.getByRole('button', {name:'Выбрать темы'}).click();
        await expect(page.locator('#kcCustomOptions')).toBeVisible();
        await expect(page.locator('#kcSelectTitle')).toHaveText('Учить');
        await expect(page.locator('#kcReviewModal')).toHaveAttribute('aria-label','Сессия обучения');
        await page.locator('#kcSelectClose').click();
        await expect(page.locator('#kcSelectOverlay')).toBeHidden();
    });
}
test('mobile learning navigation opens the renamed dialog',async ({page})=>{
    await page.setViewportSize({width:390,height:844});
    await page.goto('/physics-10.html');
    const action = page.locator('.exp-bottom-nav').getByRole('button',{name:'Учить',exact:true});
    await expect(action).toBeVisible();
    await action.click();
    await expect(page.locator('#kcFront')).toBeVisible();
    await expect(page.locator('#kcSelectOverlay')).toBeHidden();
    await page.screenshot({path:'playwright-report/learning-label-phone.png'});
});
test('English learning launcher, heading and accessible review label are translated',async ({page})=>{
    await page.goto('/physics-10.html');
    await page.evaluate(()=>{document.documentElement.lang='en';document.body.dataset.uiLanguage='en';});
    await page.addScriptTag({url:'/english-ui.js'});
    await expect(page.locator('#knowledgeCheckBtn')).toHaveAccessibleName('Learn');
    await page.locator('#knowledgeCheckBtn').click();
    await expect(page.locator('#kcFront')).toBeVisible();
    await page.getByRole('button',{name:'Choose topics'}).click();
    await expect(page.locator('#kcSelectTitle')).toHaveText('Learn');
    await expect(page.locator('#kcReviewModal')).toHaveAttribute('aria-label','Learning session');
});

test('a paragraph without cards opens topic selection directly', async ({page}) => {
    await page.goto('/physics-10.html');
    await page.locator('article.exp-reader-current').evaluate(article => {
        article.replaceChildren(article.querySelector('.topic-title'));
    });
    await page.locator('#knowledgeCheckBtn').click();
    await expect(page.locator('#kcSelectNotice')).toContainText('В этом параграфе нет карточек');
    await expect(page.locator('#kcCustomOptions')).toBeVisible();
    await expect(page.locator('#kcReviewOverlay')).toBeHidden();
});

test('a finished paragraph offers other topics without starting an unrelated card', async ({page}) => {
    await page.goto('/physics-10.html');
    const learn = page.locator('#knowledgeCheckBtn');
    await learn.click();
    await page.locator('#kcFront').click();
    await page.locator('#kcGrades [data-g="4"]').click();
    await page.locator('#kcDone').click();
    await learn.click();
    await expect(page.locator('#kcSelectNotice')).toContainText('В этом параграфе всё повторено');
    await expect(page.locator('#kcTopicOptions')).toBeVisible();
    await expect(page.locator('#kcConfigure')).toBeHidden();
});
