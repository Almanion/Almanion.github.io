'use strict';
const {test,expect}=require('@playwright/test');
for(const [width,height]of [[320,568],[390,844],[844,390]]){
 test('direct touch aim, zoom and launch at '+width+'x'+height,async({browser},info)=>{
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
   await page.goto('http://127.0.0.1:4173/games/orbital-courier/offline.html');
   await page.evaluate(()=>{Orbital.App.profile.settings.reducedMotion=true;Orbital.App.loadLevel(Orbital.Campaign.order[0]);});
   await expect(page.locator('body')).toHaveAttribute('data-map-mode','aim');
   const cdp=await context.newCDPSession(page);
   const touch=async(type,points)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y}))});await page.waitForTimeout(35);};
   const aim=()=>page.evaluate(()=>({angle:Orbital.App.angle,speed:Orbital.App.speed}));
   const portrait=height>width;
   const offset=(p,dx,dy)=>({x:p.x+(portrait?dy:dx),y:p.y+(portrait?-dx:dy)});
   const tap=async(p,dx,dy)=>{const q=offset(p,dx,dy);await page.touchscreen.tap(q.x,q.y);};
   const start=()=>page.evaluate(()=>{const s=Orbital.App.level().start;return Orbital.UI9.worldToScreen(s.x,s.y);});
   let p=await start();
   for(const [dx,dy,expected]of [[24,0,0],[0,-24,90],[0,24,-90],[-24,0,180]]){
    await tap(p,dx,dy);const value=(await aim()).angle;
    expect(Math.abs(((value-expected+540)%360)-180)).toBeLessThan(.2);
    expect(await page.evaluate(()=>Orbital.App.state)).toBeNull();
   }
   await tap(p,22,0);const slow=(await aim()).speed;
   await tap(p,92,0);const fast=(await aim()).speed;expect(fast).toBeGreaterThan(slow+50);
   await page.evaluate(p=>Orbital.UI9.zoom(2,p.x,p.y),p);p=await start();
   await tap(p,92,0);expect((await aim()).speed).toBe(fast);
   await tap(p,40,-20);expect((await aim()).angle).toBeCloseTo(26.6,1);
   await page.evaluate(()=>Orbital.UI9.resetCamera());p=await start();
   const original=await aim();
   await touch('touchStart',[[0,offset(p,45,-15).x,offset(p,45,-15).y]]);
   await touch('touchMove',[[0,offset(p,55,-30).x,offset(p,55,-30).y]]);
   expect(await aim()).not.toEqual(original);
   await page.screenshot({path:info.outputPath('direct-aim.png')});
   await touch('touchStart',[[0,offset(p,55,-30).x,offset(p,55,-30).y],[1,offset(p,110,+30).x,offset(p,110,+30).y]]);
   expect(await aim()).toEqual(original);
   await touch('touchMove',[[0,offset(p,35,-45).x,offset(p,35,-45).y],[1,offset(p,130,+45).x,offset(p,130,+45).y]]);
   expect(await page.evaluate(()=>Orbital.App.camera.zoom)).toBeGreaterThan(1.2);
   await touch('touchEnd',[[1,offset(p,130,+45).x,offset(p,130,+45).y]]);
   await touch('touchMove',[[1,offset(p,140,+20).x,offset(p,140,+20).y]]);
   await touch('touchEnd',[]);expect(await aim()).toEqual(original);
   expect(await page.evaluate(()=>Orbital.App.state)).toBeNull();
   await page.evaluate(()=>Orbital.UI9.switchMap('pan'));
   p=await start();await touch('touchStart',[[0,offset(p,70,0).x,offset(p,70,0).y]]);await touch('touchMove',[[0,offset(p,90,+20).x,offset(p,90,+20).y]]);await touch('touchEnd',[]);expect(await aim()).toEqual(original);
   await page.evaluate(()=>{Orbital.UI9.resetCamera();Orbital.UI9.switchMap('aim');});p=await start();
   await touch('touchStart',[[0,offset(p,40,-20).x,offset(p,40,-20).y]]);await touch('touchCancel',[]);
   expect(await page.evaluate(()=>Orbital.App.aimPointer)).toBeNull();
   await tap(p,40,-20);const chosen=await aim();
   await page.locator('#mobileLaunch:visible, #launchButton:visible').first().tap();
   expect(await page.evaluate(()=>Orbital.App.state.vx)).toBeGreaterThan(0);
   expect(await page.evaluate(()=>Orbital.App.state.vy)).toBeLessThan(0);
   await touch('touchStart',[[0,offset(p,50,0).x,offset(p,50,0).y]]);await touch('touchMove',[[0,offset(p,75,+15).x,offset(p,75,+15).y]]);await touch('touchEnd',[]);expect(await aim()).toEqual(chosen);
   expect(errors).toEqual([]);
  }finally{await context.close();}
 });
}
