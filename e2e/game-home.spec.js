'use strict';
const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());});
for(const [width,height] of [[320,568],[390,844],[844,390],[1366,768],[1920,1080]])test(`fullscreen home and navigation ${width}x${height}`,async({page},info)=>{
 await page.setViewportSize({width,height});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/games/orbital-courier/');
 await expect(page.locator('#continueButton')).toBeVisible();await page.waitForTimeout(1100);
 const geometry=await page.evaluate(()=>{const c=document.getElementById('heroCanvas'),r=c.getBoundingClientRect(),m=c.getContext('2d').getTransform();return{x:r.x,y:r.y,w:r.width,h:r.height,overflow:document.documentElement.scrollWidth-innerWidth,sx:m.a,sy:m.d};});
 expect(geometry).toMatchObject({x:0,y:0,w:width,h:height});expect(geometry.overflow).toBeLessThanOrEqual(1);expect(geometry.sx).toBe(geometry.sy);
 await page.screenshot({path:info.outputPath('home.png'),fullPage:true});
 await page.locator('#homeMotionToggle').click();await expect(page.locator('#homeMotionToggle')).toHaveAttribute('aria-pressed','true');await page.waitForTimeout(100);
 const frozen=await page.locator('#heroCanvas').evaluate(c=>c.toDataURL());await page.mouse.move(width*.8,height*.5);await page.waitForTimeout(160);expect(await page.locator('#heroCanvas').evaluate(c=>c.toDataURL())).toBe(frozen);
 await page.locator('#homeMotionToggle').click();await page.waitForTimeout(100);expect(await page.locator('#heroCanvas').evaluate(c=>c.toDataURL())).not.toBe(frozen);
 await page.locator('#continueButton').click();await expect(page.locator('#play')).toBeVisible();await expect(page.locator('#heroCanvas')).not.toBeVisible();
 expect(errors).toEqual([]);
});
test('system reduced motion stays still and primary action is keyboard accessible',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/games/orbital-courier/');await page.waitForTimeout(120);
 const canvas=page.locator('#heroCanvas'),before=await canvas.evaluate(c=>c.toDataURL());await page.mouse.move(700,300);await page.waitForTimeout(150);expect(await canvas.evaluate(c=>c.toDataURL())).toBe(before);
 await expect(page.locator('#homeMotionToggle')).toBeDisabled();await page.locator('#continueButton').focus();await page.keyboard.press('Enter');await expect(page.locator('#play')).toBeVisible();
});
test('touch reacts without trapping the page and releases after lifting the finger',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/games/orbital-courier/');
 const touch=await page.context().newCDPSession(page);await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true});
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:330,y:480}]});
 await expect.poll(()=>page.evaluate(()=>Orbital.App.heroPointer.strength)).toBeGreaterThan(.7);
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(()=>page.evaluate(()=>Orbital.App.heroPointer.strength)).toBeLessThan(.1);
 await page.locator('#continueButton').click();await expect(page.locator('#play')).toBeVisible();
});
