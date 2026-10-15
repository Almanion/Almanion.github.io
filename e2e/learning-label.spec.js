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
        await expect(page.locator('#kcSelectOverlay')).toBeVisible();
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
    await expect(page.locator('#kcSelectOverlay')).toBeVisible();
    await expect(page.locator('#kcSelectTitle')).toHaveText('Учить');
    await page.screenshot({path:'playwright-report/learning-label-phone.png'});
});
test('English learning launcher, heading and accessible review label are translated',async ({page})=>{
    await page.goto('/physics-10.html');
    await page.evaluate(()=>{document.documentElement.lang='en';document.body.dataset.uiLanguage='en';});
    await page.addScriptTag({url:'/english-ui.js'});
    await expect(page.locator('#knowledgeCheckBtn')).toHaveAccessibleName('Learn');
    await page.locator('#knowledgeCheckBtn').click();
    await expect(page.locator('#kcSelectTitle')).toHaveText('Learn');
    await expect(page.locator('#kcReviewModal')).toHaveAttribute('aria-label','Learning session');
});
