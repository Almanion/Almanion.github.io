'use strict';
const {test,expect}=require('@playwright/test');
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('/games/orbital-courier/offline.html');});
for(const [width,height]of [[1366,768],[390,844],[320,568]])test('settings save immediately and awards stay readable '+width,async({page},info)=>{
 await page.setViewportSize({width,height});await page.evaluate(()=>Orbital.V8.settings('display'));
 await page.locator('[data-setting=grid]').check();await expect(page.locator('[data-setting=grid]')).toBeChecked();
 await page.locator('#settings-flight').click();await page.locator('[data-setting=fineAim]').check();
 await page.locator('#settings-control').click();await expect(page.locator('#settings-control')).toBeFocused();await page.locator('#soundVolume').fill('23');
 await page.locator('#settings-control').press('ArrowRight');await expect(page.locator('#settings-save')).toBeFocused();await expect(page.locator('.storage-status')).toContainText('На этом устройстве');
 const download=page.waitForEvent('download');await page.locator('[data-action=export]').click();const file=await download;const saved=JSON.parse(require('node:fs').readFileSync(await file.path(),'utf8'));expect(saved.settings).toMatchObject({grid:true,fineAim:true,volume:.23});expect(saved.layouts).toEqual({});
 await page.screenshot({path:info.outputPath('settings-progress.png')});await page.keyboard.press('Escape');await page.reload();expect(await page.evaluate(()=>Orbital.App.profile.settings)).toMatchObject({grid:true,fineAim:true,volume:.23});
 await page.evaluate(()=>Orbital.App.go('awards'));await expect(page.locator('[data-achievement]')).toHaveCount(98);await expect(page.locator('#awardTotal')).toContainText('/ 98');const profile=await page.evaluate(()=>JSON.stringify(Orbital.App.profile));
 await page.locator('[data-action="v8:award-category"][data-category=engineering]').click();await expect(page.locator('#awardSectionTitle')).toHaveText('Инженерия');await page.locator('#awardSearch').fill('Архитектор');await expect(page.locator('[data-achievement=architect-8]')).toBeVisible();
 await page.locator('[data-filter=earned]').click();await expect(page.locator('.award-empty')).toBeVisible();await page.locator('[data-action="personal:clear"]').click();await expect(page.locator('[data-achievement]')).toHaveCount(98);
 expect(await page.evaluate(()=>JSON.stringify(Orbital.App.profile))).toBe(profile);expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.screenshot({path:info.outputPath('award-collection.png')});
});

test('hangar flight preview changes ship position, follows each trail and freezes with reduced motion',async({page})=>{
 await page.clock.install();await page.evaluate(()=>{Orbital.App.profile.settings.reducedMotion=false;Orbital.App.go('hangar');});await page.locator('#hangarStyleTab').click();await page.locator('#trailTab').click();
 const position=()=>page.locator('#hangarShip').evaluate(c=>[+c.dataset.flightX,+c.dataset.flightY]);await page.clock.runFor(100);const before=await position();await page.clock.runFor(1000);const after=await position();expect(Math.hypot(after[0]-before[0],after[1]-before[1])).toBeGreaterThan(40);
 await page.evaluate(()=>Orbital.App.profile.settings.reducedMotion=true);await page.clock.runFor(100);const still=await page.locator('#hangarShip').evaluate(c=>c.toDataURL());await page.clock.runFor(1000);expect(await page.locator('#hangarShip').evaluate(c=>c.toDataURL())).toBe(still);
});
