'use strict';
const {test,expect}=require('@playwright/test');
const url='/games/orbital-courier/eclipse/';
async function start(page,viewport={width:1366,height:768}){await page.setViewportSize(viewport);await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.clock.install();await page.goto(url);await page.locator('#begin').click();}
async function tacticalPanel(page){if(await page.locator('#tacticalButton').isVisible()&&!await page.locator('#tacticalSheet').isVisible())await page.locator('#tacticalButton').click();}
async function tool(page,id){if(!await page.locator('#toolsMenu').isVisible())await page.locator('#toolsButton').click();await page.locator('#'+id).click();await expect(page.locator('#toolsMenu')).toBeHidden();}
async function tacticChoice(page,tactic){await tacticalPanel(page);await page.locator('[data-tactic='+tactic+']').click();if(await page.locator('#tacticalSheet').isVisible())await page.locator('#closeTactics').click();}
async function hint(page){await tacticalPanel(page);await page.locator('#hintButton').click();await expect(page.locator('#applyHint')).toBeEnabled();await page.locator('#applyHint').click();await page.clock.runFor(50);await expect(page.locator('#forecastTitle')).toHaveText('Манёвр достижим');}
async function fly(page){const duration=await page.evaluate(()=>EclipseApp.prediction.t*1000/parseFloat(document.getElementById('rate').textContent)+(EclipseApp.phase===1?(EclipseApp.saved.settings.reduced?1100:4200):0)+300);await page.locator('#launch').click();await page.clock.runFor(duration);await expect(page.locator('#outcome')).toBeVisible();expect(await page.evaluate(()=>EclipseApp.state.status)).toBe('won');}
for(const tactic of ['breach','rebound','escort'])test('Eclipse completes all three phases with '+tactic,async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await start(page,tactic==='escort'?{width:390,height:844}:undefined);
 await page.evaluate(()=>localStorage.setItem('orbital-courier-save-v8','campaign-must-stay-byte-identical'));
 await hint(page);await fly(page);await page.locator('#outcomePrimary').click();await tacticChoice(page,tactic);await hint(page);
 await page.screenshot({path:info.outputPath('tactic-'+tactic+'.png'),fullPage:true});await fly(page);await page.locator('#outcomePrimary').click();await hint(page);await fly(page);
 await expect(page.locator('#outcomeTitle')).toHaveText('Миссия выполнена');
 expect(await page.evaluate(()=>localStorage.getItem('orbital-courier-save-v8'))).toBe('campaign-must-stay-byte-identical');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('orbital-eclipse-operation-v1')).finished)).toBe(true);
 await page.reload();await expect(page.locator('#outcomeTitle')).toHaveText('Миссия выполнена');await page.locator('#outcomePrimary').click();expect(await page.evaluate(()=>EclipseApp.phase)).toBe(0);expect(errors).toEqual([]);
});
test('Eclipse checkpoints survive reload and settings pause an active flight',async({page})=>{
 await start(page);await hint(page);await page.locator('#launch').click();await page.clock.runFor(500);await tool(page,'settings');const time=await page.evaluate(()=>EclipseApp.state.t);await page.clock.runFor(5000);expect(await page.evaluate(()=>EclipseApp.state.t)).toBe(time);
 await page.locator('#closeSettings').click();await page.clock.runFor(8000);await expect(page.locator('#outcomeTitle')).toHaveText('Этап выполнен');
 await page.reload();await expect(page.locator('#begin')).toContainText('контрольной точки');await page.locator('#begin').click();expect(await page.evaluate(()=>EclipseApp.phase)).toBe(1);expect(await page.evaluate(()=>EclipseApp.state.fleet)).toBe(5);
 await page.locator('#anchorX').fill('870');await page.locator('#anchorY').fill('325');await page.clock.runFor(50);await expect(page.locator('#forecastDetail')).toContainText('Якорь слишком близко');
 await tool(page,'settings');await page.locator('#reducedMotion').check();await page.locator('#showForecast').uncheck();await page.locator('#closeSettings').click();await page.reload();await page.locator('#begin').click();await expect(page.locator('#forecastToggle')).toHaveAttribute('aria-pressed','false');await expect(page.locator('body')).toHaveAttribute('data-reduced','true');
});
test('Eclipse handles failure, keyboard, shield, retry and denied storage',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('denied','SecurityError');};});await start(page,{width:320,height:568});
 await page.locator('#angle').fill('-25');await page.locator('#speed').fill('120');await page.locator('#battlefield').focus();await page.keyboard.press('Space');await page.clock.runFor(100);await page.keyboard.press('KeyE');expect(await page.evaluate(()=>EclipseApp.state.shieldUsed)).toBe(true);await page.keyboard.press('Space');const time=await page.evaluate(()=>EclipseApp.state.t);await page.clock.runFor(2000);expect(await page.evaluate(()=>EclipseApp.state.t)).toBe(time);await page.keyboard.press('Space');await page.clock.runFor(5000);
 await expect(page.locator('#outcomeTitle')).toHaveText('Попытка не завершена');await page.locator('#outcomePrimary').click();await expect(page.locator('#saveStatus')).toContainText('недоступно');expect(await page.evaluate(()=>EclipseApp.mode)).toBe('plan');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('Eclipse entry is discoverable through native links on home and contracts',async({page})=>{
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 for(const path of ['/games/orbital-courier/','/games/orbital-courier/contracts/']){await page.goto(path);const link=page.locator('.screen.active .eclipse-entry');await expect(link).toBeVisible();await link.click();await expect(page).toHaveURL(/\/eclipse\/$/);await expect(page.locator('#briefing')).toBeVisible();await page.locator('#begin').click();await page.locator('.back').click();await expect(page).toHaveURL(/\/contracts\/$/);}
});
test('Eclipse numeric typing and anchor dragging edit the actual forecast',async({page})=>{
 await start(page);await page.locator('#speed').fill('');await page.locator('#speed').pressSequentially('100');await expect(page.locator('#speed')).toHaveValue('100');expect(await page.evaluate(()=>EclipseApp.plan.speed)).toBe(100);
 await hint(page);await fly(page);await page.locator('#outcomePrimary').click();await tacticChoice(page,'rebound');await hint(page);
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
 await tool(page,'settings');const settingsPause=await page.evaluate(()=>EclipseApp.battle);await page.clock.runFor(3000);expect(await page.evaluate(()=>EclipseApp.battle)).toEqual(settingsPause);await page.locator('#closeSettings').click();
 expect(await page.evaluate(()=>({x:EclipseApp.state.x,y:EclipseApp.state.y,t:EclipseApp.state.t,fleet:EclipseApp.state.fleet}))).toEqual(result);
 await page.locator('#skipBattle').click();await expect(page.locator('#outcomeTitle')).toHaveText('Этап выполнен');await page.reload();await page.locator('#begin').click();expect(await page.evaluate(()=>EclipseApp.phase)).toBe(2);
});

test('Eclipse reduced motion shortens the battle scene and fits a narrow phone',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await start(page,{width:320,height:568});await hint(page);await fly(page);await page.locator('#outcomePrimary').click();await hint(page);
 await page.locator('#rate').click();await page.locator('#rate').click();const duration=await page.evaluate(()=>EclipseApp.prediction.t);
 await page.locator('#launch').click();await page.clock.runFor(duration*250+250);expect(await page.evaluate(()=>EclipseApp.mode)).toBe('cinematic');
 const skip=await page.locator('#skipBattle').boundingBox();expect(skip.x).toBeGreaterThanOrEqual(0);expect(skip.x+skip.width).toBeLessThanOrEqual(320);expect(skip.y).toBeGreaterThanOrEqual(0);expect(skip.y+skip.height).toBeLessThanOrEqual(568);
 await page.clock.runFor(1300);await expect(page.locator('#outcomeTitle')).toHaveText('Этап выполнен');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for(const operation of ['rift','pulsar','binary','ark'])for(const tactic of ['breach','rebound','escort'])test(operation+' completes with '+tactic+' and preserves other operations',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await start(page,tactic==='escort'?{width:390,height:844}:undefined);
 await page.locator('#angle').fill('-53');await page.locator('#operationsButton').click();await page.locator('[data-operation='+operation+']').click();expect(await page.evaluate(()=>EclipseApp.operation)).toBe(operation);
 await page.locator('#rate').click();await page.locator('#rate').click();await hint(page);await fly(page);if(['binary','ark'].includes(operation)){const targets=await page.evaluate(()=>EclipseEngine.checkpoints(EclipseApp.state));expect(targets.length).toBeGreaterThan(0);expect(targets.every(x=>x.done)).toBe(true);}await page.locator('#outcomePrimary').click();await tacticChoice(page,tactic);await hint(page);await fly(page);await page.locator('#outcomePrimary').click();await hint(page);await fly(page);
 await expect(page.locator('#outcomeTitle')).toHaveText('Миссия выполнена');await page.locator('#chooseNextOperation').click();await page.locator('[data-operation=eclipse]').click();await expect(page.locator('#angle')).toHaveValue('-53');
 await page.locator('#operationsButton').click();await page.locator('[data-operation='+operation+']').click();await expect(page.locator('#outcomeTitle')).toHaveText('Миссия выполнена');await page.reload();await expect(page.locator('#outcomeTitle')).toHaveText('Миссия выполнена');expect(await page.evaluate(()=>EclipseApp.operation)).toBe(operation);expect(errors).toEqual([]);
});

test('live engine actions change the trajectory once, recalculate prediction and preserve pause',async({page})=>{
 await start(page);await hint(page);await page.locator('#launch').click();await page.clock.runFor(150);await page.locator('#battlefield').focus();
 const speed=()=>page.evaluate(()=>Math.hypot(EclipseApp.state.vx,EclipseApp.state.vy)),initial=await speed();await page.keyboard.press('KeyQ');expect(await page.evaluate(()=>EclipseApp.state.boostUsed)).toBe(true);expect(await speed()).toBeGreaterThan(initial);expect(await page.evaluate(()=>EclipseApp.prediction.boostUsed)).toBe(true);await expect(page.locator('#boost')).toBeDisabled();await page.keyboard.press('KeyQ');expect(await page.evaluate(()=>EclipseApp.state.events.filter(e=>e.type==='boost').length)).toBe(1);
 await page.keyboard.press('Space');expect(await page.evaluate(()=>EclipseApp.mode)).toBe('paused');const frozen=await page.evaluate(()=>EclipseApp.state.t),beforeBrake=await speed();await page.keyboard.press('KeyF');expect(await page.evaluate(()=>EclipseApp.state.brakeUsed)).toBe(true);expect(await speed()).toBeCloseTo(beforeBrake*.75,6);expect(await page.evaluate(()=>EclipseApp.prediction.brakeUsed)).toBe(true);await page.clock.runFor(300);expect(await page.evaluate(()=>EclipseApp.state.t)).toBe(frozen);await expect(page.locator('#brake')).toBeDisabled();const projected=await page.evaluate(()=>EclipseEngine.project(EclipseApp.state));await tool(page,'forecastToggle');await tool(page,'forecastToggle');expect(await page.evaluate(()=>EclipseApp.prediction)).toEqual(projected);await page.locator('#battlefield').focus();
 await page.keyboard.press('KeyR');expect(await page.evaluate(()=>EclipseApp.mode)).toBe('plan');expect(await page.evaluate(()=>[EclipseApp.state.boostUsed,EclipseApp.state.brakeUsed,EclipseApp.state.shieldUsed])).toEqual([false,false,false]);await tool(page,'delayToggle');await page.locator('[data-delay="2"]').click();await page.locator('#closeWindow').click();await page.locator('#launch').click();await page.clock.runFor(500);await expect(page.locator('#boost')).toBeDisabled();await expect(page.locator('#brake')).toBeDisabled();await page.locator('#battlefield').focus();await page.keyboard.press('KeyQ');expect(await page.evaluate(()=>EclipseApp.state.boostUsed)).toBe(false);await page.clock.runFor(1700);await expect(page.locator('#boost')).toBeEnabled();
});

test.describe('mobile combat actions',()=>{
 test.use({hasTouch:true,isMobile:true,viewport:{width:320,height:568}});
 test('engine actions stay reachable in portrait and landscape without covering the map',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await start(page,{width:320,height:568});await page.locator('#launch').tap();await page.clock.runFor(150);await page.locator('#pause').tap();await page.locator('#boost').tap();await page.locator('#brake').tap();await page.locator('#shield').tap();expect(await page.evaluate(()=>[EclipseApp.state.boostUsed,EclipseApp.state.brakeUsed,EclipseApp.state.shieldUsed])).toEqual([true,true,true]);
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(viewport);await page.clock.runFor(100);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);for(const id of ['boost','brake','shield','pause','retry','rate']){const r=await page.locator('#'+id).boundingBox();expect(r.x).toBeGreaterThanOrEqual(0);expect(r.y).toBeGreaterThanOrEqual(0);expect(r.x+r.width).toBeLessThanOrEqual(viewport.width);expect(r.y+r.height).toBeLessThanOrEqual(viewport.height);expect(r.height).toBeGreaterThanOrEqual(44);}const map=await page.locator('#battlefield').boundingBox();expect(map.height).toBeGreaterThanOrEqual(150);await page.screenshot({path:info.outputPath('combat-'+viewport.width+'.png')});}expect(errors).toEqual([]);
 });
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
  await tool(page,'cameraToggle');await page.clock.runFor(80);await expect(page.locator('#cameraToggle')).toHaveAttribute('aria-pressed','true');await page.screenshot({path:info.outputPath('phone-close-camera.png')});
  const map=await page.locator('#battlefield').boundingBox(),before=await page.evaluate(()=>EclipseApp.plan.angle);await page.touchscreen.tap(map.x+25,map.y+map.height-25);await page.clock.runFor(60);await expect(page.locator('#cameraToggle')).toHaveAttribute('aria-pressed','false');expect(await page.evaluate(()=>EclipseApp.plan.angle)).toBe(before);
  await hint(page);await page.locator('#rate').click();await page.locator('#rate').click();await fly(page);await page.locator('#outcomePrimary').click();await page.locator('#anchorTool').tap();await page.clock.runFor(60);
  const box=await page.locator('#battlefield').boundingBox(),scale=Math.min(box.width/1100,box.height/660);await page.touchscreen.tap(box.x+(box.width-1100*scale)/2+810*scale,box.y+(box.height-660*scale)/2+200*scale);await page.clock.runFor(60);expect(await page.evaluate(()=>EclipseApp.plan.ax)).toBeCloseTo(810,0);expect(await page.evaluate(()=>EclipseApp.plan.ay)).toBeCloseTo(200,0);
  for(const viewport of [{width:320,height:568},{width:844,height:390},{width:390,height:844}]){await page.setViewportSize(viewport);await page.clock.runFor(100);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);for(const id of ['launch','angle','speed','anchorTool','tacticalButton']){const r=await page.locator('#'+id).boundingBox();expect(r.y).toBeGreaterThanOrEqual(0);expect(r.y+r.height).toBeLessThanOrEqual(viewport.height);expect(r.height).toBeGreaterThanOrEqual(44);}await page.screenshot({path:info.outputPath('phone-phase2-'+viewport.width+'.png')});}
  await page.locator('#tacticalButton').tap();await page.locator('[data-tactic=escort]').tap();await page.locator('#closeTactics').tap();await tool(page,'delayToggle');await page.locator('#delay').press('Home');for(let i=0;i<5;i++)await page.locator('#delay').press('ArrowRight');expect(await page.evaluate(()=>EclipseApp.plan.delay)).toBe(1.25);await page.locator('#closeWindow').tap();await tool(page,'settings');await page.locator('#helpFromSettings').tap();await expect(page.locator('#briefing')).toBeVisible();await page.locator('#begin').tap();
 });
});

test('desktop shortcuts and grouped undo keep course edits reversible',async({page})=>{
 await start(page);const initial=await page.evaluate(()=>EclipseApp.plan);await page.locator('#battlefield').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowUp');expect(await page.evaluate(()=>EclipseApp.plan.angle)).toBe(initial.angle+.5);expect(await page.evaluate(()=>EclipseApp.plan.speed)).toBe(initial.speed+.5);
 await page.keyboard.press('Control+z');expect(await page.evaluate(()=>EclipseApp.plan.speed)).toBe(initial.speed);await page.keyboard.press('Control+z');expect(await page.evaluate(()=>EclipseApp.plan)).toEqual(initial);await page.keyboard.press('Control+Shift+z');expect(await page.evaluate(()=>EclipseApp.plan.angle)).toBe(initial.angle+.5);
 await page.locator('#speed').fill('');await page.locator('#speed').pressSequentially('110');await page.locator('#speed').press('Enter');await expect(page.locator('#battlefield')).toBeFocused();await page.keyboard.press('Control+z');expect(await page.evaluate(()=>EclipseApp.plan.speed)).toBe(initial.speed);
 await page.keyboard.press('Shift+ArrowLeft');expect(await page.evaluate(()=>EclipseApp.plan.angle)).toBe(initial.angle-2);await page.keyboard.press('Space');await page.clock.runFor(150);await page.keyboard.press('KeyE');await expect(page.locator('#shield')).toBeDisabled();expect(await page.evaluate(()=>EclipseApp.state.shieldUsed)).toBe(true);await page.keyboard.press('Escape');expect(await page.evaluate(()=>EclipseApp.mode)).toBe('paused');const frozen=await page.evaluate(()=>EclipseApp.state.t);await page.clock.runFor(500);expect(await page.evaluate(()=>EclipseApp.state.t)).toBe(frozen);await page.keyboard.press('KeyR');expect(await page.evaluate(()=>EclipseApp.mode)).toBe('plan');
});

test('dragging previews course before release and Escape cancels without a history entry',async({page})=>{
 await start(page);const initial=await page.evaluate(()=>EclipseApp.plan),box=await page.locator('#battlefield').boundingBox(),scale=Math.min(box.width/1100,box.height/660),point=(x,y)=>({x:box.x+(box.width-1100*scale)/2+x*scale,y:box.y+(box.height-660*scale)/2+y*scale});
 const a=point(270,280),b=point(550,300);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});await page.clock.runFor(60);const preview=await page.evaluate(()=>EclipseApp.plan.angle);expect(preview).not.toBe(initial.angle);await page.mouse.up();await expect(page.locator('#undoPlan')).toBeEnabled();await tool(page,'undoPlan');expect(await page.evaluate(()=>EclipseApp.plan)).toEqual(initial);await tool(page,'redoPlan');expect(await page.evaluate(()=>EclipseApp.plan.angle)).toBe(preview);
 const before=await page.evaluate(()=>EclipseApp.plan);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x+50,b.y+80,{steps:4});await page.keyboard.press('Escape');await page.mouse.up();expect(await page.evaluate(()=>EclipseApp.plan)).toEqual(before);await page.mouse.click(a.x,a.y,{button:'right'});expect(await page.evaluate(()=>EclipseApp.plan)).toEqual(before);
 await tool(page,'undoPlan');expect(await page.evaluate(()=>EclipseApp.plan)).toEqual(initial);await expect(page.locator('#undoPlan')).toBeDisabled();
});

test.describe('touch input safety',()=>{
 test.use({hasTouch:true,isMobile:true,viewport:{width:320,height:568}});
 test('hold repeats once per gesture, release stops it and a second finger cancels aiming',async({page},info)=>{
  await start(page,{width:320,height:568});const initial=await page.evaluate(()=>EclipseApp.plan),session=await page.context().newCDPSession(page),button=await page.locator('[data-adjust=angle][data-step="0.5"]').boundingBox();
  const touch=(type,points)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:points});await touch('touchStart',[{x:button.x+button.width/2,y:button.y+button.height/2,id:1}]);await page.clock.runFor(900);await touch('touchEnd',[]);const afterHold=await page.evaluate(()=>EclipseApp.plan.angle);expect(afterHold).toBeGreaterThan(initial.angle+2);await page.clock.runFor(1200);expect(await page.evaluate(()=>EclipseApp.plan.angle)).toBe(afterHold);await tool(page,'undoPlan');expect(await page.evaluate(()=>EclipseApp.plan)).toEqual(initial);await expect(page.locator('#undoPlan')).toBeDisabled();
  const map=await page.locator('#battlefield').boundingBox(),one={x:map.x+map.width*.65,y:map.y+map.height*.35,id:1},two={x:map.x+map.width*.75,y:map.y+map.height*.65,id:2};await touch('touchStart',[one]);await touch('touchStart',[one,two]);await touch('touchMove',[{...one,x:one.x-30},{...two,x:two.x+20}]);await touch('touchEnd',[]);expect(await page.evaluate(()=>EclipseApp.plan)).toEqual(initial);await expect(page.locator('#undoPlan')).toBeDisabled();
  await tool(page,'delayToggle');await page.locator('[data-delay="2"]').tap();await page.clock.runFor(50);await expect(page.locator('#windowForecast')).not.toBeEmpty();await page.locator('#closeWindow').tap();await expect(page.locator('#delayToggle')).toHaveText('Старт +2.0 с');await tool(page,'undoPlan');expect(await page.evaluate(()=>EclipseApp.plan.delay)).toBe(0);
  await hint(page);await page.locator('#launch').tap();await page.clock.runFor(100);await page.locator('#shield').tap();await page.locator('#pause').tap();for(const id of ['pause','shield','retry','rate']){const r=await page.locator('#'+id).boundingBox();expect(r.x).toBeGreaterThanOrEqual(0);expect(r.x+r.width).toBeLessThanOrEqual(320);expect(r.y+r.height).toBeLessThanOrEqual(568);expect(r.height).toBeGreaterThanOrEqual(44);}await page.screenshot({path:info.outputPath('touch-battle-actions.png')});
 });
});

test('anchor mode exposes directional keyboard control and delay does not change the impulse',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('orbital-eclipse-operation-v1',JSON.stringify({version:2,phase:1,tactic:'breach',carry:{fleet:5},completed:[{phase:0,time:6.44,hull:3,fleet:5}],settings:{sound:false,reduced:true,forecast:true}})));await start(page);const initial=await page.evaluate(()=>EclipseApp.plan);await page.locator('#battlefield').focus();await page.keyboard.press('KeyA');await expect(page.locator('#anchorTool')).toHaveAttribute('aria-pressed','true');await page.keyboard.press('ArrowRight');await page.keyboard.press('Shift+ArrowDown');expect(await page.evaluate(()=>EclipseApp.plan.ax)).toBe(initial.ax+5);expect(await page.evaluate(()=>EclipseApp.plan.ay)).toBe(initial.ay+25);expect(await page.evaluate(()=>EclipseApp.plan.angle)).toBe(initial.angle);
 await page.keyboard.press('KeyC');await expect(page.locator('#courseTool')).toHaveAttribute('aria-pressed','true');await page.keyboard.press('ArrowRight');expect(await page.evaluate(()=>EclipseApp.plan.angle)).toBe(initial.angle+.5);await tool(page,'delayToggle');await page.locator('[data-delay="1"]').click();await page.locator('#closeWindow').click();expect(await page.evaluate(()=>EclipseApp.plan.speed)).toBe(initial.speed);expect(await page.evaluate(()=>EclipseApp.plan.delay)).toBe(1);
});

test('leaving during numeric input saves the course without an idle tab overwriting it',async({page,context})=>{
 await start(page);const idle=await context.newPage();await idle.goto('/games/orbital-courier/eclipse/');
 await page.bringToFront();await page.locator('#angle').fill('-48.5');await page.reload();await expect(page.locator('#angle')).toHaveValue('-48.5');
 await idle.close();await page.reload();await expect(page.locator('#angle')).toHaveValue('-48.5');
});

for(const mobile of [false,true])test.describe(mobile?'quiet mobile cockpit':'quiet desktop cockpit',()=>{
 test.use({viewport:mobile?{width:390,height:844}:{width:1366,height:768},hasTouch:mobile,isMobile:mobile});
 test('the map stays primary and task details open only when requested',async({page},info)=>{
  await start(page,mobile?{width:390,height:844}:undefined);await expect(page.locator('#objectiveText')).toBeHidden();await expect(page.locator('#radioText')).toBeHidden();
  const map=await page.locator('#battlefield').boundingBox();expect(map.height).toBeGreaterThan(mobile?224:300);
  for(const id of ['launch','retry','rate','tacticalButton','toolsButton','operationsButton']){const box=await page.locator('#'+id).boundingBox();expect(box).not.toBeNull();expect(box.height).toBeGreaterThanOrEqual(44);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(mobile?844:768);}
  for(const adjust of await page.locator('[data-adjust=angle],[data-adjust=speed]').all())if(await adjust.isVisible())expect((await adjust.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.locator('#tacticalButton').click();await expect(page.locator('#objectiveText')).toBeVisible();expect(await page.locator('#tacticalSheet').evaluate(el=>el.matches(':modal'))).toBe(true);await expect(page.locator('#hintButton')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#tacticalSheet')).toBeHidden();await expect(page.locator('#tacticalButton')).toBeFocused();
  await page.screenshot({path:info.outputPath('quiet-plan.png')});
 });
 test('tools and task dialogs pause flight and Escape returns focus to their opener',async({page})=>{
  await start(page,mobile?{width:390,height:844}:undefined);await hint(page);await page.locator('#launch').click();await page.clock.runFor(200);await page.locator('#toolsButton').click();await expect(page.locator('#toolsMenu')).toBeVisible();expect(await page.locator('#toolsMenu').evaluate(el=>el.matches(':modal'))).toBe(true);const time=await page.evaluate(()=>EclipseApp.state.t);await page.clock.runFor(2000);expect(await page.evaluate(()=>EclipseApp.state.t)).toBe(time);await page.keyboard.press('Escape');await expect(page.locator('#toolsMenu')).toBeHidden();await expect(page.locator('#toolsButton')).toBeFocused();await page.clock.runFor(100);expect(await page.evaluate(()=>EclipseApp.state.t)).toBeGreaterThan(time);
  await page.locator('#tacticalButton').click();const taskTime=await page.evaluate(()=>EclipseApp.state.t);await page.clock.runFor(1000);expect(await page.evaluate(()=>EclipseApp.state.t)).toBe(taskTime);await page.keyboard.press('Escape');await expect(page.locator('#tacticalSheet')).toBeHidden();await expect(page.locator('#tacticalButton')).toBeFocused();await page.clock.runFor(100);expect(await page.evaluate(()=>EclipseApp.state.t)).toBeGreaterThan(taskTime);
 });
});
