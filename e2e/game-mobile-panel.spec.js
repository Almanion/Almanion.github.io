'use strict';
const {test,expect}=require('@playwright/test');
for(const [width,height]of [[320,568],[390,844],[844,390]])test('compact cockpit and precision sheet '+width+'x'+height,async({browser},info)=>{
 const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();
 try{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto('http://127.0.0.1:4173/games/orbital-courier/');await page.evaluate(()=>{Orbital.App.profile.settings.reducedMotion=true;Orbital.App.loadLevel(0);});
  await expect(page.locator('#angleInput')).not.toBeVisible();await expect(page.locator('#mobileFine')).toBeVisible();
  const box=await page.locator('#gameCanvas').boundingBox();expect(box.height).toBeGreaterThan(height<480?180:height*.5);
  await expect(page.locator('#mobileLaunch')).toBeInViewport();expect((await page.locator('#mobileLaunch').boundingBox()).width).toBeGreaterThan(100);
  await page.screenshot({path:info.outputPath('cockpit.png')});
  await page.locator('.mobile-options').tap();await expect(page.locator('#flightDrawer')).toBeVisible();
  await expect(page.locator('#angleInput')).toBeVisible();await expect(page.locator('#angleRange')).toBeVisible();
  await page.locator('#angleInput').fill('23,7');await page.locator('#angleInput').press('Enter');expect(await page.evaluate(()=>Orbital.App.angle)).toBe(23.7);
  await page.locator('#speedInput').fill('170');await page.locator('#speedInput').press('Enter');expect(await page.evaluate(()=>Orbital.App.speed)).toBe(170);
  await page.locator('#speedRange').focus();await page.locator('#speedRange').press('ArrowRight');expect(await page.evaluate(()=>Orbital.App.speed)).toBe(171);
  await page.locator('[data-action=angle-up]').tap();expect(await page.evaluate(()=>Orbital.App.angle)).toBe(24.2);
  await page.screenshot({path:info.outputPath('precision-sheet.png')});
  await page.locator('#flightDrawer .sheet-footer button').tap();await expect(page.locator('#angleInput')).not.toBeVisible();expect(await page.evaluate(()=>Orbital.App.state)).toBeNull();
  // Fine mode keeps the old course at touch-down, then scales vector movement.
  await page.evaluate(()=>Orbital.App.setAim(0,155));await page.locator('#mobileFine').tap();await expect(page.locator('#mobileFine')).toHaveAttribute('aria-pressed','true');
  const cdp=await context.newCDPSession(page),touch=async(type,points)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y}))});await page.waitForTimeout(40);};
  const x=box.x+box.width*.6,y=box.y+box.height*.65;
  await touch('touchStart',[[0,x,y]]);expect(await page.evaluate(()=>Orbital.App.angle)).toBe(0);
  await touch('touchMove',[[0,x,y-60]]);const fine=await page.evaluate(()=>Orbital.App.angle);expect(fine).toBeGreaterThan(8);expect(fine).toBeLessThan(12);
  await touch('touchEnd',[]);expect(await page.evaluate(()=>Orbital.App.state)).toBeNull();
  // A new contact never jumps to the finger; pinch cancels a fine adjustment.
  const stable=await page.evaluate(()=>({angle:Orbital.App.angle,speed:Orbital.App.speed}));
  await touch('touchStart',[[0,x-50,y]]);expect(await page.evaluate(()=>({angle:Orbital.App.angle,speed:Orbital.App.speed}))).toEqual(stable);
  await touch('touchMove',[[0,x-50,y-20]]);await touch('touchStart',[[0,x-50,y-20],[1,x+30,y+20]]);
  expect(await page.evaluate(()=>({angle:Orbital.App.angle,speed:Orbital.App.speed}))).toEqual(stable);await touch('touchEnd',[]);
  // Reopening and rotation never duplicate inputs or strand controls in a hidden panel.
  await page.locator('.mobile-options').tap();await page.setViewportSize({width:height,height:width});await expect(page.locator('#angleInput')).toBeVisible();expect(await page.locator('#angleInput').count()).toBe(1);
  await page.locator('#angleInput').fill('-18,4');await page.locator('#flightDrawer .sheet-footer button').tap();expect(await page.evaluate(()=>Orbital.App.angle)).toBe(-18.4);
  await page.setViewportSize({width,height});await page.locator('#mobileLaunch').tap();await page.locator('.mobile-options').tap();expect(await page.evaluate(()=>Orbital.App.paused)).toBe(true);
  await expect(page.locator('#sheetFine')).toBeDisabled();await page.locator('#flightDrawer .sheet-footer button').tap();expect(await page.evaluate(()=>Orbital.App.paused)).toBe(false);
  expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('new planet surfaces and cargo retain deterministic artwork',async({page},info)=>{
 await page.goto('/games/orbital-courier/');
 const samples=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.id='artGallery';c.width=1100;c.height=420;c.style.cssText='position:fixed;inset:0;z-index:1000;width:1100px;height:420px;background:#07131e';document.body.append(c);
  const r=new Orbital.Renderer(c),ctx=r.ctx;ctx.fillStyle='#07131e';ctx.fillRect(0,0,1100,420);r.uiScale=1;
  const images=['ice','ocean','lava'].map((surface,i)=>{const p={x:185+i*360,y:170,r:116,tint:'#a2ccd2',name:surface,surface};r.planet(p);const a=r.planetTexture(p);return {same:a===r.planetTexture(p),image:a.toDataURL()};});
  ctx.save();ctx.translate(430,350);ctx.scale(3,3);r.cargo({x:0,y:0,label:'A'},0,0,false,false);r.cargo({x:60,y:0,label:'B'},1,0,false,true);ctx.restore();return images;
 });
 expect(samples.every(s=>s.same)).toBeTruthy();expect(new Set(samples.map(s=>s.image)).size).toBe(3);
 await page.locator('#artGallery').screenshot({path:info.outputPath('planet-cargo-gallery.png')});
});
