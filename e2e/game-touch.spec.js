'use strict';
const {test,expect}=require('@playwright/test');
for(const [width,height]of [[320,568],[390,844],[844,390]]){
 test('direct touch aim, zoom and launch at '+width+'x'+height,async({browser},info)=>{
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
   await page.goto('http://127.0.0.1:4173/games/orbital-courier/');
   await page.evaluate(()=>{Orbital.App.profile.settings.reducedMotion=true;Orbital.App.loadLevel(0);});
   await expect(page.locator('body')).toHaveAttribute('data-map-mode','aim');
   const cdp=await context.newCDPSession(page);
   const touch=async(type,points)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y}))});await page.waitForTimeout(35);};
   const aim=()=>page.evaluate(()=>({angle:Orbital.App.angle,speed:Orbital.App.speed}));
   const start=()=>page.evaluate(()=>{const r=document.getElementById('gameCanvas').getBoundingClientRect(),a=Orbital.App,f=Math.min(r.width/1200,r.height/700)*a.camera.zoom,s=a.level().start;return {x:r.left+r.width/2+(s.x-a.camera.cx)*f,y:r.top+r.height/2+(s.y-a.camera.cy)*f};});
   let p=await start();
   for(const [dx,dy,expected]of [[24,0,0],[0,-24,90],[0,24,-90],[-24,0,180]]){
    await page.touchscreen.tap(p.x+dx,p.y+dy);const value=(await aim()).angle;
    expect(Math.abs(((value-expected+540)%360)-180)).toBeLessThan(.2);
    expect(await page.evaluate(()=>Orbital.App.state)).toBeNull();
   }
   await page.touchscreen.tap(p.x+22,p.y);const slow=(await aim()).speed;
   await page.touchscreen.tap(p.x+92,p.y);const fast=(await aim()).speed;expect(fast).toBeGreaterThan(slow+50);
   await page.evaluate(p=>Orbital.UI9.zoom(2,p.x,p.y),p);p=await start();
   await page.touchscreen.tap(p.x+92,p.y);expect((await aim()).speed).toBe(fast);
   await page.touchscreen.tap(p.x+40,p.y-20);expect((await aim()).angle).toBeCloseTo(26.6,1);
   await page.evaluate(()=>Orbital.UI9.resetCamera());p=await start();
   const original=await aim();
   await touch('touchStart',[[0,p.x+45,p.y-15]]);
   await touch('touchMove',[[0,p.x+55,p.y-30]]);
   expect(await aim()).not.toEqual(original);
   await page.screenshot({path:info.outputPath('direct-aim.png')});
   await touch('touchStart',[[0,p.x+55,p.y-30],[1,p.x+110,p.y+30]]);
   expect(await aim()).toEqual(original);
   await touch('touchMove',[[0,p.x+35,p.y-45],[1,p.x+130,p.y+45]]);
   expect(await page.evaluate(()=>Orbital.App.camera.zoom)).toBeGreaterThan(1.2);
   await touch('touchEnd',[[1,p.x+130,p.y+45]]);
   await touch('touchMove',[[1,p.x+140,p.y+20]]);
   await touch('touchEnd',[]);expect(await aim()).toEqual(original);
   expect(await page.evaluate(()=>Orbital.App.state)).toBeNull();
   await page.evaluate(()=>Orbital.UI9.switchMap('pan'));
   p=await start();await touch('touchStart',[[0,p.x+70,p.y]]);await touch('touchMove',[[0,p.x+90,p.y+20]]);await touch('touchEnd',[]);expect(await aim()).toEqual(original);
   await page.evaluate(()=>{Orbital.UI9.resetCamera();Orbital.UI9.switchMap('aim');});p=await start();
   await touch('touchStart',[[0,p.x+40,p.y-20]]);await touch('touchCancel',[]);
   expect(await page.evaluate(()=>Orbital.App.aimPointer)).toBeNull();
   await page.touchscreen.tap(p.x+40,p.y-20);const chosen=await aim();
   await page.locator('#mobileLaunch:visible, #launchButton:visible').first().tap();
   expect(await page.evaluate(()=>Orbital.App.state.vx)).toBeGreaterThan(0);
   expect(await page.evaluate(()=>Orbital.App.state.vy)).toBeLessThan(0);
   await touch('touchStart',[[0,p.x+50,p.y]]);await touch('touchMove',[[0,p.x+75,p.y+15]]);await touch('touchEnd',[]);expect(await aim()).toEqual(chosen);
   expect(errors).toEqual([]);
  }finally{await context.close();}
 });
}
