'use strict';
const {test,expect}=require('@playwright/test');

for(const [width,height] of [[320,568],[390,844],[844,390],[1366,768]]){
 test(`cockpit course, memory and live instruments ${width}x${height}`,async({browser},info)=>{
  const phone=width<1000,context=await browser.newContext({viewport:{width,height},isMobile:phone,hasTouch:phone,serviceWorkers:'block'}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
   await page.goto('/games/orbital-courier/');
   await page.evaluate(()=>{Orbital.App.profile.settings.reducedMotion=true;Orbital.App.loadLevel(0);});
   if(phone)await page.locator('#mobileReadout').click();
   await expect(page.locator('#courseTab')).toHaveAttribute('aria-selected','true');
   await expect(page.locator('#memoryPane')).not.toBeVisible();
   // Each primary control is visible, large enough and actually receives its hit.
   const targets=await page.locator('#cockpit button:not(:disabled),#coursePane input').evaluateAll(nodes=>nodes.filter(e=>e.getClientRects().length).map(e=>{
    const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {id:e.id||e.dataset.action,w:r.width,h:r.height,hit:hit===e||e.contains(hit)};
   }));
   for(const t of targets){expect(t.w,t.id).toBeGreaterThanOrEqual(44);if(!['angleInput','speedInput'].includes(t.id))expect(t.h,t.id).toBeGreaterThanOrEqual(44);expect(t.hit,t.id).toBe(true);}
   await page.locator('#angleInput').fill('23,7');
   await page.locator('#memoryTab').click(); // Leaving a field commits the number.
   expect(await page.evaluate(()=>Orbital.App.angle)).toBe(23.7);
   await expect(page.locator('#memoryCurrent')).toContainText('23.7°');
   await expect(page.locator('[data-action=recall-course][data-slot="0"]')).toBeDisabled();
   await page.locator('[data-action=store-course][data-slot="0"]').click();
   const stored=await page.evaluate(()=>({...Orbital.App.profile.courses['0:normal'][0]}));
   await page.locator('#courseTab').click();await page.locator('#angleInput').fill('-11.2');await page.locator('#angleInput').press('Enter');
   await page.locator('#speedInput').fill('150');await page.locator('#speedInput').press('Enter');
   await page.locator('#memoryTab').click();await page.locator('[data-action=store-course][data-slot="1"]').click();
   await expect(page.locator('#courseTab')).toBeInViewport();
   await page.screenshot({path:info.outputPath('memory.png')});
   await page.locator('[data-action=recall-course][data-slot="0"]').click();
   expect(await page.evaluate(()=>({angle:Orbital.App.angle,speed:Orbital.App.speed}))).toEqual(stored);
   await expect(page.locator('#memoryCurrent')).toContainText('23.7°');
   // Roving tabs support keyboard navigation without nudging the course.
   await page.locator('#memoryTab').focus();await page.keyboard.press('ArrowLeft');
   await expect(page.locator('#courseTab')).toBeFocused();await expect(page.locator('#angleInput')).toBeVisible();
   expect(await page.evaluate(()=>Orbital.App.angle)).toBe(stored.angle);
   await page.locator('#fineAimButton').click();await expect(page.locator('#fineAimButton')).toHaveAttribute('aria-pressed','true');
   await page.locator('[data-action=angle-up]').click();expect(await page.evaluate(()=>Orbital.App.angle)).toBe(23.8);
   await page.screenshot({path:info.outputPath('course.png')});
   if(phone)await page.locator('#flightDrawer .sheet-footer button').click();
   // The same inputs return to the sidebar, and the live view cannot edit a flight.
   expect(await page.locator('#angleInput').count()).toBe(1);
   await page.locator(phone?'#mobileLaunch':'#launchButton').click();
   if(phone)await page.locator('#mobileReadout').click();else await page.evaluate(()=>{Orbital.App.paused=true;Orbital.UI9.sync();});
   await expect(page.locator('#liveVelocity')).toBeVisible();await expect(page.locator('.cockpit-tabs')).not.toBeVisible();
   await expect(page.locator('#angleInput')).toBeDisabled();await expect(page.locator('#livePortalRow')).not.toBeVisible();
   await page.screenshot({path:info.outputPath('flight.png')});
   if(phone)await page.locator('#flightDrawer .sheet-footer button').click();
   await page.locator(phone?'.mobile-retry':'#launchSecondary [data-action=retry]').click();
   if(phone)await page.locator('#mobileReadout').click();
   await expect(page.locator('#courseTab')).toHaveAttribute('aria-selected','true');
   await page.locator('#memoryTab').click();await expect(page.locator('#previousAimButton')).toBeEnabled();
   await page.locator('#previousAimButton').click();expect(await page.evaluate(()=>Orbital.App.angle)).toBe(23.8);
   expect(errors).toEqual([]);
  }finally{await context.close();}
 });
}

test('cockpit validates numbers and retains separate saved courses after reload',async({page})=>{
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('/games/orbital-courier/');await page.evaluate(()=>{Orbital.App.profile.settings.reducedMotion=true;Orbital.App.loadLevel(0);});
 await page.locator('#angleInput').fill('-37,6');await page.locator('#angleInput').press('Enter');
 await page.locator('#speedInput').fill('9999');await page.locator('#speedInput').press('Enter');
 expect(await page.evaluate(()=>Orbital.App.speed===Orbital.App.stats().maxSpeed)).toBe(true);
 await page.locator('#angleInput').fill('broken');await page.locator('#angleInput').press('Enter');expect(await page.evaluate(()=>Orbital.App.angle)).toBe(-37.6);
 await expect(page.locator('#aimFeedback')).toContainText('Введи число');
 await page.locator('#memoryTab').click();await page.locator('[data-action=store-course][data-slot="0"]').click();
 const stored=await page.evaluate(()=>Orbital.App.profile.courses['0:normal'][0]);
 await page.reload();await page.evaluate(()=>{Orbital.App.loadLevel(0);});await page.locator('#memoryTab').click();
 await page.locator('[data-action=recall-course][data-slot="0"]').click();expect(await page.evaluate(()=>({angle:Orbital.App.angle,speed:Orbital.App.speed}))).toEqual(stored);
 await page.locator('#modeChip').click();await page.locator('#memoryTab').click();
 await expect(page.locator('[data-action=recall-course][data-slot="0"]')).toBeDisabled();
 await page.locator('#modeChip').click();await page.locator('#memoryTab').click();
 await expect(page.locator('[data-action=recall-course][data-slot="0"]')).toBeEnabled();
});
