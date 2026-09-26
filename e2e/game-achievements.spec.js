'use strict';
const {test,expect}=require('@playwright/test');
const historical=require('../game-source/orbital-courier/docs/completed-v8-profile.json');
test.beforeEach(async({page})=>{await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());});
for(const width of [390,1366])test('awards and medal results survive all playback speeds and scrubbing '+width,async({page},info)=>{
 test.setTimeout(90000);await page.setViewportSize({width,height:844});await page.clock.install();await page.goto('/games/orbital-courier/');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));let expected;
 for(const rate of [.5,1,2,4,10]){
  const duration=await page.evaluate(rate=>{
   const O=Orbital,A=O.App,l=O.LEVELS[0];A.profile=O.Progress.fresh();A.profile.settings.sound=false;A.profile.settings.reducedMotion=true;A.profile.upgrades.engine=3;
   A.loadLevel(0);A.setAim(l.solution.angle,l.solution.speed);A.timeScale=rate;A.launch();
   return O.Physics.simulate(A.level(),A.angle,A.speed,A.stats()).state.t*1000/rate+400;
  },rate);
  await expect(page.locator('#speedButton')).toHaveText('×'+rate);
  await page.clock.runFor(duration);
  const result=await page.evaluate(()=>{const A=Orbital.App;return{status:A.state.status,t:A.state.t,records:A.profile.records,awards:A.profile.achievements,xp:A.profile.xp,credits:A.profile.credits};});
  expect(result.status).toBe('won');if(expected)expect(result).toEqual(expected);else expected=result;
  await expect(page.locator('#flightReview .award-chip')).toContainText(['Есть контакт']);
  const next=await page.locator('.review-next').boundingBox(),panel=await page.locator('#flightReview').boundingBox();
  expect(next.y+next.height).toBeLessThanOrEqual(panel.y+panel.height);
  const medals=await page.locator('.medal-card').evaluateAll(es=>es.map(e=>({state:e.dataset.state,text:e.textContent})));
  const before=await page.evaluate(()=>JSON.stringify(Orbital.App.profile));
  await page.locator('#reviewRange').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.clock.runFor(120);
  expect(await page.evaluate(()=>Orbital.App.displayState().status)).toBe('flying');
  expect(await page.locator('.medal-card').evaluateAll(es=>es.map(e=>({state:e.dataset.state,text:e.textContent})))).toEqual(medals);
  expect(await page.evaluate(()=>JSON.stringify(Orbital.App.profile))).toBe(before);
 }
 await page.locator('#speedButton').click();await expect(page.locator('#speedButton')).toHaveText('×0.5');
 for(const rate of [1,2,4,10]){await page.locator('#speedButton').click();await expect(page.locator('#speedButton')).toHaveText('×'+rate);}
 await page.screenshot({path:info.outputPath('medals-after-rewind.png'),fullPage:true});expect(errors).toEqual([]);
});
test('module purchase shows simultaneous awards, export refreshes collection and reload keeps XP',async({page})=>{
 await page.goto('/games/orbital-courier/');
 await page.evaluate(profile=>{const A=Orbital.App,G=Orbital.Progress;A.profile=G.sanitize(profile);A.profile.upgrades={scanner:1,magnet:0,docking:1,engine:1};A.profile.receipts=[];A.profile.achievements=[];A.profile.flags={};G.awardAchievements(A.profile);A.go('hangar');},historical);
 await page.locator('[data-action=upgrade][data-key=magnet]').click();await page.locator('[data-action=confirm-upgrade]').click();
 await expect(page.locator('#toastArea')).toContainText('Модуль улучшен');await expect(page.locator('#toastArea')).toContainText('Четыре системы');await expect(page.locator('#toastArea')).toContainText('Своя гравитация');
 await page.evaluate(()=>{const A=Orbital.App;A.go('awards');Orbital.V8.settings('save');});
 const download=page.waitForEvent('download');await page.locator('[data-action=export]').click();await download;await page.evaluate(()=>Orbital.App.closeModal());
 await expect(page.locator('[data-achievement=backup]')).toHaveClass(/earned/);
 await expect(page.locator('#toastArea')).toContainText('Резервный канал');const xp=await page.evaluate(()=>Orbital.App.profile.xp);
 await page.reload();expect(await page.evaluate(()=>Orbital.App.profile.xp)).toBe(xp);
});
test('partial achievement progress follows displayed order and renders each definition once',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/games/orbital-courier/');
 const result=await page.evaluate(profile=>{
  const O=Orbital,A=O.App;A.profile=O.Progress.fresh();for(const id of O.Campaign.order.slice(0,23))A.profile.records[id]=profile.records[id];
  O.Progress.awardAchievements(A.profile);let calls=0;const originals=O.Progress.achievements.map(a=>a.progress);O.Progress.achievements.forEach((a,i)=>{a.progress=p=>{calls++;return originals[i](p);};});
  A.go('awards');O.Progress.achievements.forEach((a,i)=>a.progress=originals[i]);return {calls,count:O.Progress.achievements.length};
 },historical);
 expect(result.calls).toBeLessThanOrEqual(result.count);await page.locator('#awardSearch').fill('Внешняя граница');
 await expect(page.locator('[data-achievement=frontier]')).toContainText('23 / 24');await expect(page.locator('[data-achievement=frontier]')).not.toHaveClass(/earned/);
 await page.screenshot({path:info.outputPath('achievement-progress-mobile.png'),fullPage:true});
});
