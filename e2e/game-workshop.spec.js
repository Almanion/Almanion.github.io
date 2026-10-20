'use strict';
const {test,expect}=require('@playwright/test');
const base='/games/orbital-courier/hangar/';
test.beforeEach(async({context})=>{await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());});
for(const [width,height]of [[320,568],[390,844],[844,390],[1366,768]])test(`workshop systems remain reachable without changing progress ${width}x${height}`,async({page},info)=>{
 await page.setViewportSize({width,height});await page.goto(base);
 await page.evaluate(()=>{Orbital.App.profile.settings.reducedMotion=true;});
 const before=await page.evaluate(()=>JSON.stringify(Orbital.App.profile));
 await expect(page.locator('#hangarShip')).toBeVisible();
 for(const key of ['scanner','magnet','docking','engine']){
  await page.locator('#hangar-tab-'+key).click();await expect(page.locator('#hangar-tab-'+key)).toHaveAttribute('aria-selected','true');
  await expect(page.locator('.module-card:visible')).toHaveCount(1);await expect(page.locator('#hangar-module-'+key)).toBeVisible();
  await expect(page.locator('#dockSystemValue')).toContainText('0 / 5');
 }
 await page.locator('#hangar-tab-scanner').focus();await page.keyboard.press('ArrowRight');await expect(page.locator('#hangar-tab-magnet')).toBeFocused();
 await page.keyboard.press('Home');await expect(page.locator('#hangar-tab-scanner')).toBeFocused();
 const buy=page.locator('#hangar-module-scanner [data-action=upgrade]');
 if(width>=1000){await expect(buy).toBeInViewport();await expect(page.locator('#hangarShip')).toBeInViewport();}
 else await buy.scrollIntoViewIfNeeded();
 const box=await buy.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);expect(box.width).toBeGreaterThanOrEqual(44);
 expect(await page.evaluate(()=>JSON.stringify(Orbital.App.profile))).toBe(before);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.screenshot({path:info.outputPath('workshop.png'),fullPage:true});
});
for(const width of [320,1366])test('locked appearances can be tried without granting them or saving the fitting '+width,async({page})=>{
 await page.setViewportSize({width,height:844});await page.goto(base);await page.evaluate(()=>{Orbital.App.profile.settings.reducedMotion=true;});
 const before=await page.evaluate(()=>({profile:JSON.stringify(Orbital.App.profile),save:localStorage.getItem('orbital-courier-save-v8')}));
 await page.locator('#hangarStyleTab').click();await page.waitForTimeout(80);
 const canvas=page.locator('#hangarShip'),original=await canvas.evaluate(c=>c.toDataURL());
 await page.locator('#skinGrid .skin-card.locked').first().click();
 await expect(page.locator('#dockFittingState')).toContainText('ещё не применено');
 await expect(page.locator('[data-action="hangar:apply"]')).toBeDisabled();
 await expect.poll(()=>canvas.evaluate(c=>c.toDataURL())).not.toBe(original);
 await page.locator('#trailTab').click();await expect(page.locator('#trailTab')).toHaveAttribute('aria-selected','true');await expect(page.locator('#trailPanel')).toBeVisible();
 await page.locator('#trailGrid .trail-card.locked').first().click();
 await expect(page.locator('#dockSystemLabel')).toContainText('ПРЕДПРОСМОТР СЛЕДА');
 expect(await page.evaluate(()=>({profile:JSON.stringify(Orbital.App.profile),save:localStorage.getItem('orbital-courier-save-v8')}))).toEqual(before);
});
for(const width of [390,1366])test('applying earned paint and a trail keeps resources and survives reload '+width,async({page})=>{
 await page.setViewportSize({width,height:844});await page.goto(base);
 const choices=await page.evaluate(()=>{
  const O=Orbital,A=O.App;A.profile=O.Progress.fresh();A.profile.xp=2000;A.save();A.renderHangar();
  return {skin:O.Progress.SKINS.find(s=>s.id!==A.profile.skin&&O.Cosmetics.unlocked(A.profile,s)).id,trail:O.Cosmetics.TRAILS.find(t=>t.id!==A.profile.trail&&O.Cosmetics.unlocked(A.profile,t)).id,credits:A.profile.credits,data:A.profile.data,xp:A.profile.xp};
 });
 await page.locator('#hangarStyleTab').click();await page.locator('#skinGrid [data-key="'+choices.skin+'"]').click();
 await expect(page.locator('[data-action="hangar:apply"]')).toBeEnabled();await page.locator('[data-action="hangar:apply"]').click();
 await page.locator('#trailTab').click();await page.locator('#trailGrid [data-key="'+choices.trail+'"]').click();await page.locator('[data-action="hangar:apply"]').click();
 await page.reload();expect(await page.evaluate(()=>{const p=Orbital.App.profile;return {skin:p.skin,trail:p.trail,credits:p.credits,data:p.data,xp:p.xp};})).toEqual(choices);
});
