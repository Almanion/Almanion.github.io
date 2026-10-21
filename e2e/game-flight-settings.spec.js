'use strict';
const {test,expect}=require('@playwright/test');
const historical=require('../game-source/orbital-courier/docs/completed-v8-profile.json');
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());});

for(const [width,height]of [[1366,768],[390,844],[320,568],[844,390]])test('flight modes and settings are reachable '+width+'x'+height,async({page},info)=>{
 await page.setViewportSize({width,height});await page.goto('/games/orbital-courier/flight/?contract=4');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const selector of ['#normalMode','#modeChip','.flight-settings']){
  await expect(page.locator(selector)).toBeInViewport();
  expect(await page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return h===e||e.contains(h);})).toBe(true);
 }
 await page.locator('#modeChip').click();await expect(page.locator('#modeChip')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#stagePill')).toContainText('ПРО');
 await page.evaluate(()=>Orbital.App.setAim(17.3,200));await page.locator('#modeChip').click();
 expect(await page.evaluate(()=>Orbital.App.angle)).toBe(17.3);
 await page.locator('.mode-info').click();await expect(page.locator('#modal')).toHaveClass(/mode-modal/);
 const facts=await page.evaluate(()=>{const A=Orbital.App,P=Orbital.Physics,st=Orbital.Progress.stats(A.profile);return ['normal','pro'].map(mode=>{const l=P.prepareLevel(Orbital.LEVELS[A.currentId],mode);return [P.captureRadius(l,st).toFixed(1)+' ед.',Math.max(l.placement?.preview||0,st.preview*(mode==='pro'?.6:1)).toFixed(1)+' с'];});});
 for(let i=0;i<2;i++)for(const fact of facts[i])await expect(page.locator('.mode-option').nth(i)).toContainText(fact);
 await page.keyboard.press('Escape');await page.locator('.flight-settings').click();
 await expect(page.locator('#settings-flight')).toHaveAttribute('aria-selected','true');
 await page.locator('[data-action="flight:rate"][data-rate="50"]').click();await page.locator('[data-setting=fineAim]').check();
 await page.locator('#settings-flight').focus();await page.keyboard.press('End');await expect(page.locator('#settings-save')).toBeFocused();
 await page.keyboard.press('Home');await expect(page.locator('#settings-flight')).toBeFocused();
 const done=page.locator('.preferences-footer [data-action=close]');await done.scrollIntoViewIfNeeded();await expect(done).toBeInViewport();
 await page.screenshot({path:info.outputPath('flight-settings.png')});await done.click();await expect(page.locator('#modal')).not.toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.goto('/games/orbital-courier/contracts/');await page.goto('/games/orbital-courier/flight/?contract=4');
 expect(await page.evaluate(()=>({mode:Orbital.App.profile.difficulty,rate:Orbital.App.timeScale,fine:Orbital.App.profile.settings.fineAim}))).toEqual({mode:'pro',rate:50,fine:true});
 await page.locator('#normalMode').click();await expect(page.locator('#normalMode')).toHaveAttribute('aria-pressed','true');expect(errors).toEqual([]);
});

test('settings pause a real PRO flight, lock difficulty and preserve its outcome at 50x',async({page})=>{
 await page.clock.install();await page.goto('/games/orbital-courier/flight/?contract=4');await page.locator('#modeChip').click();
 const expected=await page.evaluate(()=>{const O=Orbital,A=O.App;A.profile.settings.sound=false;A.profile.upgrades.engine=3;A.loadLevel(4);const l=O.LEVELS[4],s=l.proSolution||l.solution;A.setAim(s.angle,s.speed);A.setPlaybackSpeed(.5);return O.Physics.simulate(A.level(),A.angle,A.speed,A.stats()).state;});
 expect(expected.status).toBe('won');await page.locator('#launchButton').click();await page.clock.runFor(100);
 await page.locator('.flight-settings').click();await expect(page.locator('#settingsPanel [data-mode=normal]')).toBeDisabled();await expect(page.locator('#settingsPanel [data-mode=pro]')).toBeDisabled();
 const pausedAt=await page.evaluate(()=>Orbital.App.state.t);await page.locator('[data-action="flight:rate"][data-rate="50"]').click();
 await page.locator('#settings-control').click();await expect(page.locator('#soundPreview')).toBeDisabled();await page.locator('#soundVolume').fill('19');await page.locator('[data-setting=sound]').check();await expect(page.locator('#soundPreview')).toBeEnabled();await page.locator('#soundPreview').click();
 await page.clock.runFor(1200);expect(await page.evaluate(()=>Orbital.App.state.t)).toBe(pausedAt);
 await page.locator('.preferences-footer [data-action=close]').click();expect(await page.evaluate(()=>Orbital.App.paused)).toBe(false);await page.clock.runFor(2000);
 expect(await page.evaluate(()=>({status:Orbital.App.state.status,t:Orbital.App.state.t,mode:Orbital.App.profile.difficulty}))).toEqual({status:'won',t:expected.t,mode:'pro'});
 expect(await page.evaluate(()=>Orbital.Progress.completed(Orbital.App.profile))).toBe(1);
 await page.reload();expect(await page.evaluate(()=>Orbital.App.profile.settings)).toMatchObject({playbackSpeed:50,volume:.19,sound:true});
});

test('closing settings restores an existing pause and laboratory rules show the full forecast',async({page})=>{
 await page.goto('/games/orbital-courier/offline.html');
 await page.evaluate(()=>{const A=Orbital.App;A.loadLevel(Orbital.Campaign.order[0]);A.launch();A.paused=true;});
 await page.locator('.flight-settings').click();await page.locator('#settings-display').click();await page.keyboard.press('Escape');expect(await page.evaluate(()=>Orbital.App.paused)).toBe(true);
 await page.evaluate(profile=>{const O=Orbital,A=O.App;A.profile=O.Progress.sanitize(profile);A.profile.difficulty='normal';A.loadLevel(80);},historical);
 await page.locator('.mode-info').click();
 await expect(page.locator('.mode-option[data-mode=normal]')).toContainText('12.0 с');await expect(page.locator('.mode-option[data-mode=pro]')).toContainText('12.0 с');
 await page.locator('.mode-option[data-mode=pro]').click();await expect(page.locator('.mode-option[data-mode=pro]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.mode-option[data-mode=pro]')).toContainText('12.0 с');
});
