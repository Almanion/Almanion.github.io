'use strict';
const {test,expect}=require('@playwright/test');
const url='/games/orbital-courier/eclipse/';
async function start(page,viewport={width:1366,height:768}){await page.setViewportSize(viewport);await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.clock.install();await page.goto(url);await page.locator('#begin').click();}
async function tacticalPanel(page){if(await page.locator('#tacticalButton').isVisible()&&!await page.locator('#tacticalSheet').isVisible())await page.locator('#tacticalButton').click();}
async function tacticChoice(page,tactic){await tacticalPanel(page);await page.locator('[data-tactic='+tactic+']').click();}
async function hint(page){await tacticalPanel(page);await page.locator('#hintButton').click();await expect(page.locator('#applyHint')).toBeEnabled();await page.locator('#applyHint').click();await page.clock.runFor(50);await expect(page.locator('#forecastTitle')).toHaveText('Манёвр достижим');}
async function fly(page){const duration=await page.evaluate(()=>EclipseApp.prediction.t*1000/parseFloat(document.getElementById('rate').textContent)+(EclipseApp.phase===1?(EclipseApp.saved.settings.reduced?1100:4200):0)+300);await page.locator('#launch').click();await page.clock.runFor(duration);await expect(page.locator('#outcome')).toBeVisible();expect(await page.evaluate(()=>EclipseApp.state.status)).toBe('won');}
for(const tactic of ['breach','rebound','escort'])test('Eclipse completes all three phases with '+tactic,async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await start(page,tactic==='escort'?{width:390,height:844}:undefined);
 await page.evaluate(()=>localStorage.setItem('orbital-courier-save-v8','campaign-must-stay-byte-identical'));
 await hint(page);await fly(page);await page.locator('#outcomePrimary').click();await tacticChoice(page,tactic);await hint(page);
 await page.screenshot({path:info.outputPath('tactic-'+tactic+'.png'),fullPage:true});await fly(page);await page.locator('#outcomePrimary').click();await hint(page);await fly(page);
 await expect(page.locator('#outcomeTitle')).toHaveText('Коридор открыт.');
 expect(await page.evaluate(()=>localStorage.getItem('orbital-courier-save-v8'))).toBe('campaign-must-stay-byte-identical');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('orbital-eclipse-operation-v1')).finished)).toBe(true);
 await page.reload();await expect(page.locator('#outcomeTitle')).toHaveText('Коридор открыт.');await page.locator('#outcomePrimary').click();expect(await page.evaluate(()=>EclipseApp.phase)).toBe(0);expect(errors).toEqual([]);
});
test('Eclipse checkpoints survive reload and settings pause an active flight',async({page})=>{
 await start(page);await hint(page);await page.locator('#launch').click();await page.clock.runFor(500);await page.locator('#settings').click();const time=await page.evaluate(()=>EclipseApp.state.t);await page.clock.runFor(5000);expect(await page.evaluate(()=>EclipseApp.state.t)).toBe(time);
 await page.locator('#closeSettings').click();await page.clock.runFor(8000);await expect(page.locator('#outcomeTitle')).toHaveText('Узел наш.');
 await page.reload();await expect(page.locator('#begin')).toContainText('контрольной точки');await page.locator('#begin').click();expect(await page.evaluate(()=>EclipseApp.phase)).toBe(1);expect(await page.evaluate(()=>EclipseApp.state.fleet)).toBe(5);
 await page.locator('#anchorX').fill('870');await page.locator('#anchorY').fill('325');await page.clock.runFor(50);await expect(page.locator('#forecastDetail')).toContainText('Якорь слишком близко');
 await page.locator('#settings').click();await page.locator('#reducedMotion').check();await page.locator('#showForecast').uncheck();await page.locator('#closeSettings').click();await page.reload();await page.locator('#begin').click();await expect(page.locator('#forecastToggle')).toHaveAttribute('aria-pressed','false');await expect(page.locator('body')).toHaveAttribute('data-reduced','true');
});
test('Eclipse handles failure, keyboard, shield, retry and denied storage',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('denied','SecurityError');};});await start(page,{width:320,height:568});
 await page.locator('#angle').fill('-25');await page.locator('#speed').fill('120');await page.locator('#battlefield').focus();await page.keyboard.press('Space');await page.clock.runFor(100);await page.keyboard.press('KeyE');expect(await page.evaluate(()=>EclipseApp.state.shieldUsed)).toBe(true);await page.keyboard.press('Space');const time=await page.evaluate(()=>EclipseApp.state.t);await page.clock.runFor(2000);expect(await page.evaluate(()=>EclipseApp.state.t)).toBe(time);await page.keyboard.press('Space');await page.clock.runFor(5000);
 await expect(page.locator('#outcomeTitle')).toHaveText('Скорректируем курс.');await page.locator('#outcomePrimary').click();await expect(page.locator('#saveStatus')).toContainText('недоступно');expect(await page.evaluate(()=>EclipseApp.mode)).toBe('plan');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('Eclipse entry is discoverable through native links on home and contracts',async({page})=>{
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 for(const path of ['/games/orbital-courier/','/games/orbital-courier/contracts/']){await page.goto(path);const link=page.locator('.screen.active .eclipse-entry');await expect(link).toBeVisible();await link.click();await expect(page).toHaveURL(/\/eclipse\/$/);await expect(page.locator('#briefing')).toBeVisible();await page.locator('#begin').click();await page.locator('.back').click();await expect(page).toHaveURL(/\/contracts\/$/);}
});
test('Eclipse numeric typing and anchor dragging edit the actual forecast',async({page})=>{
 await start(page);await page.locator('#speed').fill('');await page.locator('#speed').pressSequentially('100');await expect(page.locator('#speed')).toHaveValue('100');expect(await page.evaluate(()=>EclipseApp.plan.speed)).toBe(100);
 await hint(page);await fly(page);await page.locator('#outcomePrimary').click();await page.locator('[data-tactic=rebound]').click();await hint(page);
 const box=await page.locator('#battlefield').boundingBox(),scale=Math.min(box.width/1100,box.height/660),point={x:box.x+(box.width-1100*scale)/2+735*scale,y:box.y+(box.height-660*scale)/2+335*scale};
 await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x-55*scale,point.y+65*scale,{steps:4});await page.mouse.up();await page.clock.runFor(100);const p=await page.evaluate(()=>EclipseApp.plan);expect(p.ax).toBeCloseTo(680,0);expect(p.ay).toBeCloseTo(400,0);await expect(page.locator('#anchorX')).toHaveValue('680');
});

test('Eclipse breakthrough saves immediately, pauses its presentation and can be skipped',async({page},info)=>{
 await page.emulateMedia({reducedMotion:'no-preference'});await start(page);await hint(page);await fly(page);await page.locator('#outcomePrimary').click();await hint(page);
 await page.locator('#rate').click();await page.locator('#rate').click();const duration=await page.evaluate(()=>EclipseApp.prediction.t);
 await page.locator('#launch').click();await page.clock.runFor(duration*250+550);
 expect(await page.evaluate(()=>EclipseApp.mode)).toBe('cinematic');await expect(page.locator('#outcome')).not.toBeVisible();await expect(page.locator('#skipBattle')).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('orbital-eclipse-operation-v1')).phase)).toBe(2);
 const result=await page.evaluate(()=>({x:EclipseApp.state.x,y:EclipseApp.state.y,t:EclipseApp.state.t,fleet:EclipseApp.state.fleet}));
 await page.locator('#pause').click();const frozen=await page.evaluate(()=>EclipseApp.battle);await page.clock.runFor(3000);expect(await page.evaluate(()=>EclipseApp.battle)).toEqual(frozen);
 await page.locator('#pause').click();await page.clock.runFor(1300);await page.screenshot({path:info.outputPath('fleet-breakthrough.png'),fullPage:true});
 await page.locator('#settings').click();const settingsPause=await page.evaluate(()=>EclipseApp.battle);await page.clock.runFor(3000);expect(await page.evaluate(()=>EclipseApp.battle)).toEqual(settingsPause);await page.locator('#closeSettings').click();
 expect(await page.evaluate(()=>({x:EclipseApp.state.x,y:EclipseApp.state.y,t:EclipseApp.state.t,fleet:EclipseApp.state.fleet}))).toEqual(result);
 await page.locator('#skipBattle').click();await expect(page.locator('#outcomeTitle')).toHaveText('Крепость открыта.');await page.reload();await page.locator('#begin').click();expect(await page.evaluate(()=>EclipseApp.phase)).toBe(2);
});

test('Eclipse reduced motion shortens the battle scene and fits a narrow phone',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await start(page,{width:320,height:568});await hint(page);await fly(page);await page.locator('#outcomePrimary').click();await hint(page);
 await page.locator('#rate').click();await page.locator('#rate').click();const duration=await page.evaluate(()=>EclipseApp.prediction.t);
 await page.locator('#launch').click();await page.clock.runFor(duration*250+250);expect(await page.evaluate(()=>EclipseApp.mode)).toBe('cinematic');
 const skip=await page.locator('#skipBattle').boundingBox();expect(skip.x).toBeGreaterThanOrEqual(0);expect(skip.x+skip.width).toBeLessThanOrEqual(320);expect(skip.y).toBeGreaterThanOrEqual(0);expect(skip.y+skip.height).toBeLessThanOrEqual(568);
 await page.clock.runFor(1300);await expect(page.locator('#outcomeTitle')).toHaveText('Крепость открыта.');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for(const operation of ['rift','pulsar'])for(const tactic of ['breach','rebound','escort'])test(operation+' completes with '+tactic+' and preserves other operations',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await start(page,tactic==='escort'?{width:390,height:844}:undefined);
 await page.locator('#angle').fill('-53');await page.locator('#operationsButton').click();await page.locator('[data-operation='+operation+']').click();expect(await page.evaluate(()=>EclipseApp.operation)).toBe(operation);
 await page.locator('#rate').click();await page.locator('#rate').click();await hint(page);await fly(page);await page.locator('#outcomePrimary').click();await tacticChoice(page,tactic);await hint(page);await fly(page);await page.locator('#outcomePrimary').click();await hint(page);await fly(page);
 await expect(page.locator('#outcomeTitle')).toHaveText('Коридор открыт.');await page.locator('#chooseNextOperation').click();await page.locator('[data-operation=eclipse]').click();await expect(page.locator('#angle')).toHaveValue('-53');
 await page.locator('#operationsButton').click();await page.locator('[data-operation='+operation+']').click();await expect(page.locator('#outcomeTitle')).toHaveText('Коридор открыт.');await page.reload();await expect(page.locator('#outcomeTitle')).toHaveText('Коридор открыт.');expect(await page.evaluate(()=>EclipseApp.operation)).toBe(operation);expect(errors).toEqual([]);
});

test('original Eclipse checkpoint migrates without losing progress or preferences',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('orbital-eclipse-operation-v1',JSON.stringify({version:1,phase:1,tactic:'rebound',carry:{fleet:5},completed:[{phase:0,time:6.44,hull:3,fleet:5}],settings:{sound:false,reduced:true,forecast:false},plans:{'1:rebound':{angle:165,speed:65,ax:735,ay:335}},attempts:4,hints:1,best:{breach:{time:20,fleet:4}}})));
 await start(page);expect(await page.evaluate(()=>EclipseApp.phase)).toBe(1);await expect(page.locator('#angle')).toHaveValue('165');await expect(page.locator('#forecastToggle')).toHaveAttribute('aria-pressed','false');
 await page.locator('#operationsButton').click();await page.locator('[data-operation=rift]').click();await page.locator('#operationsButton').click();await page.locator('[data-operation=eclipse]').click();expect(await page.evaluate(()=>EclipseApp.saved.attempts)).toBe(4);expect(await page.evaluate(()=>EclipseApp.saved.best.breach)).toEqual({time:20,fleet:4});expect(await page.evaluate(()=>EclipseApp.saved.completed.length)).toBe(1);
 const storage=await page.evaluate(()=>JSON.parse(localStorage.getItem('orbital-eclipse-operation-v1')));expect(storage.version).toBe(2);expect(storage.operations.eclipse.phase).toBe(1);expect(storage.operations.rift.phase).toBe(0);
});

test.describe('touch cockpit',()=>{
 test.use({hasTouch:true,isMobile:true,viewport:{width:390,height:844}});
 test('precision controls, camera, anchor placement and landscape stay usable',async({page},info)=>{
  await start(page,{width:390,height:844});const initial=await page.evaluate(()=>EclipseApp.plan.angle);await page.locator('[data-adjust=angle][data-step="0.5"]').tap();expect(await page.evaluate(()=>EclipseApp.plan.angle)).toBe(initial+.5);
  await page.locator('#cameraToggle').tap();await page.clock.runFor(80);await expect(page.locator('#cameraToggle')).toHaveAttribute('aria-pressed','true');await page.screenshot({path:info.outputPath('phone-close-camera.png')});
  const map=await page.locator('#battlefield').boundingBox(),before=await page.evaluate(()=>EclipseApp.plan.angle);await page.touchscreen.tap(map.x+25,map.y+map.height-25);await page.clock.runFor(60);await expect(page.locator('#cameraToggle')).toHaveAttribute('aria-pressed','false');expect(await page.evaluate(()=>EclipseApp.plan.angle)).toBe(before);
  await hint(page);await page.locator('#rate').click();await page.locator('#rate').click();await fly(page);await page.locator('#outcomePrimary').click();await page.locator('#anchorTool').tap();await page.clock.runFor(60);
  const box=await page.locator('#battlefield').boundingBox(),scale=Math.min(box.width/1100,box.height/660);await page.touchscreen.tap(box.x+(box.width-1100*scale)/2+810*scale,box.y+(box.height-660*scale)/2+200*scale);await page.clock.runFor(60);expect(await page.evaluate(()=>EclipseApp.plan.ax)).toBeCloseTo(810,0);expect(await page.evaluate(()=>EclipseApp.plan.ay)).toBeCloseTo(200,0);
  for(const viewport of [{width:320,height:568},{width:844,height:390},{width:390,height:844}]){await page.setViewportSize(viewport);await page.clock.runFor(100);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);for(const id of ['launch','angle','speed','anchorTool','tacticalButton']){const r=await page.locator('#'+id).boundingBox();expect(r.y).toBeGreaterThanOrEqual(0);expect(r.y+r.height).toBeLessThanOrEqual(viewport.height);expect(r.height).toBeGreaterThanOrEqual(44);}await page.screenshot({path:info.outputPath('phone-phase2-'+viewport.width+'.png')});}
  await page.locator('#tacticalButton').tap();await page.locator('[data-tactic=escort]').tap();await page.locator('#delay').press('Home');for(let i=0;i<5;i++)await page.locator('#delay').press('ArrowRight');expect(await page.evaluate(()=>EclipseApp.plan.delay)).toBe(1.25);await page.locator('#closeTactics').tap();await page.locator('#settings').tap();await page.locator('#helpFromSettings').tap();await expect(page.locator('#briefing')).toBeVisible();await page.locator('#begin').tap();
 });
});
