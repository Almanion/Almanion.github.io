'use strict';
const {test,expect}=require('@playwright/test');
const historical=require('../game-source/orbital-courier/docs/completed-v8-profile.json');

async function open(browser,width,height){
 const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,serviceWorkers:'block'}),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:4173/games/orbital-courier/');
 await page.evaluate(()=>{Orbital.App.profile.settings.reducedMotion=true;Orbital.App.loadLevel(0);});
 return {context,page,errors};
}
async function finish(page,{id=0,training=false,failed=false}={}){
 await expect.poll(()=>page.evaluate(()=>Orbital.App.transitioning)).toBe(false);
 await page.evaluate(({id,training,failed})=>{
  const O=Orbital,A=O.App,P=O.Physics;A.profile.upgrades.engine=3;A.loadLevel(id);A.assisted=training;
  const l=A.level(),q=failed?{angle:180,speed:60}:l.solution;A.setAim(q.angle,q.speed);A.launch();
  while(A.state.status==='flying'){const before=A.state;A.state=P.step(before,l);O.Review.observe(before,A.state,l);}
  A.finish();
 },{id,training,failed});
}

for(const [width,height]of [[320,568],[390,844],[430,932],[568,320],[844,390],[768,1024]]){
 test(`mobile flight geometry and reachable actions ${width}x${height}`,async({browser},info)=>{
  const {context,page,errors}=await open(browser,width,height);
  try{
   await expect(page.locator('#mobileLaunch')).toBeInViewport();
   const geometry=await page.evaluate(()=>{
    const canvas=document.querySelector('#gameCanvas'),m=Orbital.FlightView.metrics(canvas.getBoundingClientRect());
    const controls=[...document.querySelectorAll('#play button,#play summary')].filter(e=>!e.disabled&&e.getClientRects().length);
    return {rotated:m.rotated,worldHeight:m.fit*(m.rotated?1200:700),viewportHeight:m.r.height,overflow:document.documentElement.scrollWidth-innerWidth,
     controls:controls.map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {id:e.id||e.dataset.action||e.tagName,w:r.width,h:r.height,reachable:hit===e||e.contains(hit)};})};
   });
   expect(geometry.overflow).toBeLessThanOrEqual(1);expect(geometry.rotated).toBe(height>width);
   expect(geometry.worldHeight/geometry.viewportHeight).toBeGreaterThan(.84);
   for(const control of geometry.controls){expect(control.w,control.id).toBeGreaterThanOrEqual(44);expect(control.h,control.id).toBeGreaterThanOrEqual(44);expect(control.reachable,control.id).toBe(true);}
   await page.screenshot({path:info.outputPath('aiming.png')});
   await page.locator('#flightPlan summary').tap();await expect(page.locator('#flightDrawer .medal-card')).toHaveCount(3);
   await page.locator('#flightDrawer .sheet-footer button').tap();
   await page.locator('#mobileLaunch').tap();await page.locator('#mobileLaunch').tap();
   expect(await page.evaluate(()=>Orbital.App.paused)).toBe(true);
   await page.locator('#mobileReadout').tap();await expect(page.locator('#liveVelocity')).toBeVisible();
   await page.locator('#flightDrawer .sheet-footer button').tap();expect(await page.evaluate(()=>Orbital.App.paused)).toBe(true);
   await page.locator('.mobile-retry').tap();expect(await page.evaluate(()=>Orbital.App.state)).toBeNull();
   await expect(page.locator('#modal')).not.toBeVisible();expect(errors).toEqual([]);
  }finally{await context.close();}
 });
}

for(const [width,height]of [[320,568],[390,844],[568,320]])test(`phone result, scrubbed victory, failure, training and final contract ${width}x${height}`,async({browser},info)=>{
 const {context,page,errors}=await open(browser,width,height);
 try{
  await finish(page);expect(await page.evaluate(()=>Orbital.App.state.status)).toBe('won');
  await expect(page.locator('#mobileTimeline #reviewRange')).toBeVisible();
  const balance=await page.evaluate(()=>JSON.stringify(Orbital.App.profile));
  await expect(page.locator('#mobileNext')).toBeVisible();await expect(page.locator('#mobileLaunch')).toContainText('Ещё раз');
  await expect(page.locator('#mobileNext')).toBeInViewport();await expect(page.locator('#mobileLaunch')).toBeInViewport();
  expect(await page.locator('#reviewRange').count()).toBe(1);
  await page.screenshot({path:info.outputPath('won.png')});
  await page.locator('#mobileReadout').tap();await expect(page.locator('#reviewRange')).toBeVisible();
  await page.locator('#reviewRange').focus();await page.locator('#reviewRange').press('Home');
  expect(await page.evaluate(()=>Orbital.App.displayState().status)).toBe('flying');
  await page.screenshot({path:info.outputPath('review.png')});
  await page.locator('#flightDrawer .sheet-footer button').tap();await expect(page.locator('#mobileNext')).toBeVisible();
  expect(await page.evaluate(()=>JSON.stringify(Orbital.App.profile))).toBe(balance);
  await page.locator('#mobileNext').tap();await expect.poll(()=>page.evaluate(()=>Orbital.App.currentId)).toBe(1);
  await finish(page,{failed:true});await expect(page.locator('#mobileNext')).not.toBeVisible();await expect(page.locator('#mobileReadoutLabel')).toContainText('НЕ ДОСТАВЛЕНО');
  await page.screenshot({path:info.outputPath('failed.png')});
  const before=await page.evaluate(()=>[Orbital.App.profile.credits,Orbital.App.profile.xp]);
  await finish(page,{training:true});await expect(page.locator('#mobileNext')).not.toBeVisible();await expect(page.locator('#mobileReadoutLabel')).toContainText('БЕЗ НАГРАД');
  expect(await page.evaluate(()=>[Orbital.App.profile.credits,Orbital.App.profile.xp])).toEqual(before);
  await page.evaluate(profile=>{Orbital.App.profile=Orbital.Progress.sanitize(profile);Orbital.App.profile.settings.reducedMotion=true;},historical);
  await finish(page,{id:79});await expect(page.locator('#mobileNext')).toContainText('Маршруты');
  await page.locator('#mobileNext').tap();await expect(page.locator('#campaign')).toBeVisible();expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('portrait projection, camera anchor, orientation change and cancelled aim',async({browser})=>{
 const {context,page,errors}=await open(browser,390,844);
 try{
  await page.evaluate(()=>Orbital.App.setAim(0,155));
  const start=await page.evaluate(()=>{const s=Orbital.App.level().start;return Orbital.UI9.worldToScreen(s.x,s.y);});
  await page.touchscreen.tap(start.x,start.y-65);expect(await page.evaluate(()=>Orbital.App.angle)).toBe(0);
  const cdp=await context.newCDPSession(page),touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
  const prior=await page.evaluate(()=>[Orbital.App.angle,Orbital.App.speed]);
  await touch('touchStart',[{id:0,x:start.x-45,y:start.y-50}]);await touch('touchMove',[{id:0,x:start.x-60,y:start.y-70}]);await touch('touchCancel',[]);
  expect(await page.evaluate(()=>[Orbital.App.angle,Orbital.App.speed])).toEqual(prior);
  const delta=await page.evaluate(()=>{const U=Orbital.UI9,m=document.querySelector('#gameCanvas').getBoundingClientRect(),x=m.x+m.width/2,y=m.y+m.height/2;const a=U.worldPoint(x,y);U.zoom(2,x,y);const b=U.worldPoint(x,y);return Math.hypot(a.x-b.x,a.y-b.y);});expect(delta).toBeLessThan(.001);
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(100);
  expect(await page.evaluate(()=>Orbital.FlightView.portrait())).toBe(false);
  expect(await page.evaluate(()=>[Orbital.App.angle,Orbital.App.speed])).toEqual(prior);
  await page.locator('#mobileReadout').tap();await page.locator('#angleInput').fill('31,2');
  await page.setViewportSize({width:390,height:420});await expect(page.locator('#flightDrawer .sheet-footer button')).toBeInViewport();
  await page.locator('#flightDrawer .sheet-footer button').tap();expect(await page.evaluate(()=>Orbital.App.angle)).toBe(31.2);
  await page.setViewportSize({width:390,height:844});await expect(page.locator('#mobileLaunch')).toBeInViewport();expect(errors).toEqual([]);
 }finally{await context.close();}
});
