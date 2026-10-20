'use strict';
const {test,expect}=require('@playwright/test');

async function finish(page,{moving=false,failed=false}={}){
 return page.evaluate(({moving,failed})=>{
  const O=Orbital,A=O.App,P=O.Physics;
  const id=moving?O.Campaign.order.find(id=>O.LEVELS[id].target.motion):O.Campaign.order[0];
  A.profile.campaignAccess=[id];A.profile.upgrades.engine=3;A.loadLevel(id);
  const level=A.level(),aim=failed?{angle:180,speed:60}:level.solution;
  A.setAim(aim.angle,aim.speed);A.launch();let ticks=0;
  while(A.state.status==='flying'){
   const before=A.state;A.state=P.step(before,level);O.Review.observe(before,A.state,level);
   if(++ticks%3===0||A.state.status!=='flying')A.trail.push({x:A.state.x,y:A.state.y,t:A.state.t});
   if(ticks>30000)throw new Error('Synthetic flight did not terminate');
  }
  A.finish();document.querySelector('#toastArea').replaceChildren();
  const state=A.state,target=P.bodyAt(level.target,state.t);
  return {status:state.status,time:state.t,x:state.x,y:state.y,targetX:target.x,targetY:target.y,moving:!!level.target.motion};
 },{moving,failed});
}

for(const [width,height]of [[1366,768],[320,568],[390,844],[568,320]])test(`actual final frame is visible and immutable ${width}x${height}`,async({browser},info)=>{
 const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 try{
  await page.goto('/games/orbital-courier/offline.html');
  await page.evaluate(()=>{Orbital.App.profile=Orbital.Progress.fresh();Orbital.App.profile.xp=600;Orbital.App.profile.model='swift';Orbital.App.profile.settings.reducedMotion=true;Orbital.App.profile.settings.sound=false;});
  const final=await finish(page);expect(final.status).toBe('won');
  const canvas=page.locator('#resultDockingCanvas');await expect(canvas).toHaveAttribute('data-ready','true');
  await expect(canvas).toHaveAttribute('data-ship-model','swift');
  await expect(canvas).toBeInViewport();await expect(page.locator('#resultTitle')).toBeInViewport();await expect(page.locator('#resultNext')).toBeInViewport();
  for(const medal of await page.locator('.completion-medal').all())await expect(medal).toBeInViewport();
  expect(await canvas.getAttribute('data-final-time')).toBe(String(final.time));
  expect(await canvas.getAttribute('data-target-x')).toBe(String(final.targetX));expect(await canvas.getAttribute('data-target-y')).toBe(String(final.targetY));
  expect(await canvas.getAttribute('data-ship-x')).toBe(String(final.x));expect(await canvas.getAttribute('data-ship-y')).toBe(String(final.y));
  const pixels=await canvas.evaluate(el=>el.toDataURL());await page.evaluate(()=>{Orbital.App.profile.model='courier';});const profile=await page.evaluate(()=>JSON.stringify(Orbital.App.profile));
  await page.screenshot({path:info.outputPath('final-frame.png')});
  await page.locator('.completion-docking-button').click();await expect(page.locator('#dockingDetailCanvas')).toHaveAttribute('data-ready','true');
  expect(await page.locator('#dockingDetailCanvas').getAttribute('data-final-time')).toBe(String(final.time));
  await expect(page.locator('#dockingDetailCanvas')).toHaveAttribute('data-ship-model','swift');
  await page.locator('#modal .modal-actions [data-action="close"]').click();
  await page.locator('#resultReview').click();await page.locator('#reviewRange').fill('0');await page.locator('#resultBack').click();
  expect(await canvas.evaluate(el=>el.toDataURL())).toBe(pixels);expect(await page.evaluate(()=>JSON.stringify(Orbital.App.profile))).toBe(profile);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('moving station uses its final time; a failed flight keeps its actual endpoint',async({page})=>{
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('/games/orbital-courier/offline.html');
 await page.evaluate(()=>{Orbital.App.profile=Orbital.Progress.fresh();Orbital.App.profile.settings.reducedMotion=true;Orbital.App.profile.settings.sound=false;});
 const moving=await finish(page,{moving:true});expect(moving.moving).toBe(true);expect(moving.status).toBe('won');
 const canvas=page.locator('#resultDockingCanvas');await expect(canvas).toHaveAttribute('data-ready','true');
 expect(await canvas.getAttribute('data-target-x')).toBe(String(moving.targetX));expect(await canvas.getAttribute('data-target-y')).toBe(String(moving.targetY));
 await page.locator('#resultRetry').click();
 const failed=await finish(page,{failed:true});expect(failed.status).not.toBe('won');
 await expect(canvas).toHaveAttribute('data-ready','true');await expect(canvas).toHaveAttribute('aria-label',/Стыковка не подтверждена/);
 expect(await canvas.getAttribute('data-ship-x')).toBe(String(failed.x));expect(await canvas.getAttribute('data-ship-y')).toBe(String(failed.y));
 await page.locator('.completion-docking-button').click();await expect(page.locator('#modal')).toContainText('Рейс не завершён доставкой');
});
