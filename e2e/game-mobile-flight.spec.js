'use strict';
const {test,expect}=require('@playwright/test');

async function open(browser,width,height){
 const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000,serviceWorkers:'block'}),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:4173/games/orbital-courier/offline.html');
 await page.evaluate(()=>{Orbital.App.profile=Orbital.Progress.fresh();Orbital.App.profile.settings.reducedMotion=true;Orbital.App.profile.settings.sound=false;Orbital.App.loadLevel(Orbital.Campaign.order[0]);});
 return {context,page,errors};
}
async function finish(page,{id=4,training=false,failed=false}={}){
 await expect.poll(()=>page.evaluate(()=>Orbital.App.transitioning)).toBe(false);
 await page.evaluate(({id,training,failed})=>{
  const O=Orbital,A=O.App,P=O.Physics;A.profile.upgrades.engine=3;A.loadLevel(id);A.assisted=training;
  const q=failed?{angle:180,speed:60}:A.level().solution;if(q.layout)A.setLayout(q.layout);const l=A.level();A.setAim(q.angle,q.speed);A.launch();
  let ticks=0;
  while(A.state.status==='flying'){
   const before=A.state;A.state=P.step(before,l);O.Review.observe(before,A.state,l);
   if(A.state.portalJumps>before.portalJumps)for(const jump of A.state.teleports.slice(-(A.state.portalJumps-before.portalJumps)))A.trail.push({...jump.from,t:jump.t},{...jump.to,t:jump.t,break:true});
   if(++ticks%3===0||A.state.status!=='flying')A.trail.push({x:A.state.x,y:A.state.y,t:A.state.t});
  }
  A.finish();
 },{id,training,failed});
}

async function reachable(button,{touch=false}={}){
 await expect(button).toBeVisible();await expect(button).toBeEnabled();
 await button.scrollIntoViewIfNeeded();await expect(button).toBeInViewport();
 const hit=await button.evaluate(el=>{
  const r=el.getBoundingClientRect(),at=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
  return {width:r.width,height:r.height,reachable:at===el||el.contains(at)};
 });
 expect(hit.reachable).toBe(true);
 if(touch){expect(hit.width).toBeGreaterThanOrEqual(44);expect(hit.height).toBeGreaterThanOrEqual(44);}
}
async function summary(page,{won=true,training=false,touch=false}={}){
 await expect(page.locator('body')).toHaveAttribute('data-flight','review');
 await expect(page.locator('body')).toHaveAttribute('data-result-view','summary');
 await expect(page.locator('#resultScreen')).toBeVisible();
 await expect(page.locator('#resultScreen')).toHaveAttribute('data-outcome',training?'training':won?'won':'failed');
 await expect(page.locator('h2#resultTitle')).toHaveText(/\S/);
 await expect(page.locator('#play .flight-layout')).not.toBeVisible();
 await expect(page.locator('#flightReview')).not.toBeVisible();
 await expect(page.locator('#mobileDock')).not.toBeVisible();
 await expect(page.locator('#resultScreen .completion-medal[data-state]')).toHaveCount(3);
 if(won&&!training)await reachable(page.locator('#resultNext'),{touch});
 else await expect(page.locator('#resultNext')).not.toBeVisible();
 await reachable(page.locator('#resultRetry'),{touch});
 await reachable(page.locator('#resultReview'),{touch});
}
async function aiming(page){
 await expect.poll(()=>page.evaluate(()=>Orbital.App.transitioning)).toBe(false);
 expect(await page.evaluate(()=>Orbital.App.state)).toBeNull();
 await expect(page.locator('body')).toHaveAttribute('data-flight','aiming');
 await expect(page.locator('body')).not.toHaveAttribute('data-result-view',/summary|analysis/);
 await expect(page.locator('#resultScreen')).not.toBeVisible();
 await expect(page.locator('#gameCanvas')).toBeVisible();
 expect(await page.evaluate(()=>Orbital.Review.active)).toBeNull();
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

for(const [width,height]of [[1366,768],[320,568],[390,844],[568,320]])test(`result summary, analysis, failure, training and final contract ${width}x${height}`,async({browser},info)=>{
 const {context,page,errors}=await open(browser,width,height);
 const touch=width<1000;
 try{
  await finish(page);expect(await page.evaluate(()=>Orbital.App.state.status)).toBe('won');
  await summary(page,{touch});
  const balance=await page.evaluate(()=>JSON.stringify(Orbital.App.profile));
  const report=await page.locator('#resultScreen').textContent();
  await expect(page.locator('.completion-awards .award-chip')).toContainText(['Есть контакт']);
  await page.locator('#resultTitle').scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('won-summary.png')});
  await page.locator('#resultReview').focus();await expect(page.locator('#resultReview')).toBeFocused();
  await page.locator('#resultReview').press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-result-view','analysis');
  await expect(page.locator('#resultScreen')).not.toBeVisible();
  await expect(page.locator('#gameCanvas')).toBeVisible();
  await expect(page.locator('#reviewTimelineHome #reviewRange')).toBeVisible();
  await expect(page.locator('#mobileDock')).not.toBeVisible();
  await expect(page.locator('#cockpit')).not.toBeVisible();
  expect(await page.locator('#reviewRange').count()).toBe(1);
  await expect(page.locator('#flightReview [data-action=next]')).toHaveCount(0);
  await page.locator('#reviewRange').focus();await page.locator('#reviewRange').press('Home');
  expect(await page.evaluate(()=>Orbital.App.displayState().status)).toBe('flying');
  expect(await page.evaluate(()=>Orbital.App.state.status)).toBe('won');
  await page.screenshot({path:info.outputPath('won-analysis.png')});
  await reachable(page.locator('#resultBack'),{touch});await page.locator('#resultBack').click();
  await summary(page,{touch});expect(await page.locator('#resultScreen').textContent()).toBe(report);
  expect(await page.evaluate(()=>JSON.stringify(Orbital.App.profile))).toBe(balance);

  await page.locator('#resultRetry').click();await aiming(page);
  await finish(page);await summary(page,{touch});
  expect(await page.evaluate(()=>{const r=Orbital.App.lastResult;return [r.totalCredits,r.data,r.totalXP];})).toEqual([0,0,0]);
  const repeated=await page.evaluate(()=>JSON.stringify(Orbital.App.profile));
  await page.locator('#resultReview').click();
  const compare=page.locator('#flightReview [data-action="v8:compare"]');await expect(compare).toBeEnabled();
  await compare.click();expect(await page.evaluate(()=>Orbital.Review.active.compare)).toBe(true);await expect(compare).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>Orbital.Review.renderModel().ghost.length)).toBeGreaterThan(1);
  await compare.click();expect(await page.evaluate(()=>Orbital.Review.active.compare)).toBe(false);await expect(compare).toHaveAttribute('aria-pressed','false');
  await page.locator('#flightReview [data-action="v8:report"]').click();await expect(page.locator('#modal')).toBeVisible();
  await page.locator('#modal .modal-close').click();
  expect(await page.evaluate(()=>JSON.stringify(Orbital.App.profile))).toBe(repeated);
  await page.locator('#resultBack').click();await page.locator('#resultNext').click();
  await expect.poll(()=>page.evaluate(()=>Orbital.App.currentId)).toBe(5);await aiming(page);

  const resources=await page.evaluate(()=>{const p=Orbital.App.profile;return [p.credits,p.data,p.xp,p.achievements];});
  await finish(page,{failed:true});expect(await page.evaluate(()=>Orbital.App.state.status)).toBe('lost');
  await summary(page,{won:false,touch});
  expect(await page.evaluate(()=>Orbital.App.lastResult)).toBeNull();
  await page.locator('#resultTitle').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('failed-summary.png')});
  await page.locator('#resultRetry').click();await aiming(page);
  await finish(page,{training:true});await summary(page,{training:true,touch});
  expect(await page.evaluate(()=>Orbital.App.lastResult.training)).toBe(true);
  expect(await page.evaluate(()=>{const p=Orbital.App.profile;return [p.credits,p.data,p.xp,p.achievements];})).toEqual(resources);
  await page.locator('#resultReview').click();await expect(page.locator('#reviewTimelineHome #reviewRange')).toBeVisible();
  await page.locator('#resultBack').click();await summary(page,{training:true,touch});

  // Access is granted only to this synthetic, isolated browser profile.
  const final=await page.evaluate(()=>{const id=Orbital.Campaign.order.at(-1);Orbital.App.profile.campaignAccess=[id];return id;});
  await finish(page,{id:final});await summary(page,{touch});
  await expect(page.locator('#resultNext')).toContainText('Все маршруты');
  await page.locator('#resultNext').click();await expect(page.locator('#campaign')).toBeVisible();
  await expect(page.locator('#resultScreen')).not.toBeVisible();
  await page.evaluate(()=>{Orbital.App.actions.reset();Orbital.App.loadLevel(Orbital.Campaign.order[0]);});await aiming(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('short phone result scrolls to every action without horizontal overflow',async({browser},info)=>{
 const {context,page,errors}=await open(browser,320,400);
 try{
  await finish(page);await summary(page,{touch:true});
  const scrollers=await page.locator('#resultScreen').evaluate(root=>{
   const nodes=[root,...root.querySelectorAll('*')];for(let p=root.parentElement;p;p=p.parentElement)nodes.push(p);
   return nodes.filter(el=>el.clientHeight&&el.scrollHeight>el.clientHeight+1&&(/auto|scroll/.test(getComputedStyle(el).overflowY)||el===document.scrollingElement)).length;
  });
  expect(scrollers).toBeGreaterThan(0);
  for(const id of ['resultTitle','resultNext','resultRetry','resultReview']){
   const item=page.locator('#'+id);await item.scrollIntoViewIfNeeded();await expect(item).toBeInViewport();
   if(id!=='resultTitle')await reachable(item,{touch:true});
  }
  await page.screenshot({path:info.outputPath('short-result-scrolled.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('summary keyboard scrolling keeps the completed flight and its actions available',async({browser})=>{
 const {context,page,errors}=await open(browser,320,400);
 try{
  await finish(page);await summary(page,{touch:true});
  const scroller=page.locator('#resultScreen .completion-scroll'),title=page.locator('#resultTitle');
  await title.focus();await scroller.evaluate(el=>{el.scrollTop=0;});await expect(title).toBeFocused();
  const before=await page.evaluate(()=>JSON.stringify(Orbital.App.profile));
  await title.press('ArrowDown');
  await expect.poll(()=>scroller.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>Orbital.App.state.status)).toBe('won');
  // Let the browser finish its native keyboard scroll before testing Space separately.
  await page.waitForTimeout(200);
  const arrowPosition=await scroller.evaluate(el=>el.scrollTop);
  await title.press('Space');
  await expect.poll(()=>scroller.evaluate(el=>el.scrollTop)).toBeGreaterThan(arrowPosition);
  expect(await page.evaluate(()=>Orbital.App.state.status)).toBe('won');
  await expect(page.locator('body')).toHaveAttribute('data-result-view','summary');
  expect(await page.evaluate(()=>JSON.stringify(Orbital.App.profile))).toBe(before);
  for(const id of ['resultNext','resultRetry','resultReview'])await reachable(page.locator('#'+id),{touch:true});
  expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('result breakdown and display settings survive desktop and phone orientation changes',async({browser},info)=>{
 test.setTimeout(60000);
 for(const [name,initial,rotated,touch]of [
  ['desktop',{width:1366,height:768},{width:768,height:1366},false],
  ['phone',{width:390,height:844},{width:844,height:390},true]
 ]){
  const {context,page,errors}=await open(browser,initial.width,initial.height);
  try{
   await finish(page);await summary(page,{touch});
   const resources=()=>page.evaluate(()=>{
    const p=Orbital.App.profile;
    return JSON.stringify({credits:p.credits,data:p.data,xp:p.xp,upgrades:p.upgrades,records:p.records,receipts:p.receipts,courses:p.courses,achievements:p.achievements});
   });
   const before=await resources(),report=await page.locator('#resultScreen').textContent();
   const breakdown=page.locator('.completion-breakdown'),toggle=breakdown.locator('summary');
   await toggle.scrollIntoViewIfNeeded();await expect(toggle).toBeVisible();await toggle.click();
   await expect(breakdown).toHaveAttribute('open','');
   await expect(breakdown.locator('meter')).toHaveCount(4);
   for(const viewport of [initial,rotated,initial]){
    await page.setViewportSize(viewport);
    for(const [highContrast,reducedMotion]of [[true,true],[false,false],[false,true]]){
     await page.evaluate(()=>Orbital.V8.settings('display'));
     await page.locator('#modal input[data-setting="highContrast"]').setChecked(highContrast);
     await page.locator('#modal input[data-setting="reducedMotion"]').setChecked(reducedMotion);
     await page.locator('#modal .modal-close').click();
     const appearance=await page.locator('body').evaluate(el=>({contrast:el.classList.contains('high-contrast'),reduced:el.classList.contains('reduce-motion')}));
     expect(appearance).toEqual({contrast:highContrast,reduced:reducedMotion});
     await summary(page,{touch});
     await expect(breakdown).toHaveAttribute('open','');
     await toggle.scrollIntoViewIfNeeded();await expect(toggle).toBeInViewport();
     for(const meter of await breakdown.locator('meter').all()){
      await meter.scrollIntoViewIfNeeded();await expect(meter).toBeVisible();await expect(meter).toBeInViewport();
      expect(await meter.evaluate(el=>Number.isFinite(el.value)&&el.value>=el.min&&el.value<=el.max)).toBe(true);
     }
     expect(await resources()).toBe(before);
     expect(await page.locator('#resultScreen').textContent()).toBe(report);
     const overflow=await page.locator('#resultScreen').evaluate(el=>({document:document.documentElement.scrollWidth-innerWidth,result:el.scrollWidth-el.clientWidth}));
     expect(overflow.document).toBeLessThanOrEqual(1);expect(overflow.result).toBeLessThanOrEqual(1);
    }
   }
   await page.locator('#resultTitle').scrollIntoViewIfNeeded();
   await page.screenshot({path:info.outputPath(name+'-accessible-result.png')});expect(errors).toEqual([]);
  }finally{await context.close();}
 }
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

test('essential result content fits the initial desktop and phone viewport with readable type',async({browser},info)=>{
 for(const [width,height]of [[320,568],[390,844],[568,320],[1366,768]]){
  const {context,page,errors}=await open(browser,width,height);
  try{
   await finish(page);
   await expect(page.locator('body')).toHaveAttribute('data-result-view','summary');
   await expect(page.locator('#resultScreen')).toBeVisible();
   const scroller=page.locator('#resultScreen .completion-scroll');
   expect(await scroller.evaluate(el=>el.scrollTop)).toBe(0);
   await expect(page.locator('.completion-medal h4')).toHaveCount(3);
   await expect(page.locator('.completion-credits strong, .completion-resources strong')).toHaveCount(3);
   for(const selector of ['.completion-breakdown','.completion-awards']){
    await expect(page.locator(selector+' > summary')).toHaveCount(1);
    await expect(page.locator(selector)).not.toHaveAttribute('open','');
   }
   for(const selector of ['#resultTitle','#resultNext','#resultRetry','#resultReview','.completion-medal h4','.completion-credits strong','.completion-resources strong','.completion-breakdown > summary','.completion-awards > summary']){
    for(const item of await page.locator(selector).all()){
     await expect(item,selector+` at ${width}x${height}`).toBeVisible();
     await expect(item,selector+` at ${width}x${height}`).toBeInViewport({ratio:1});
     if(selector.startsWith('#result')&&selector!=='#resultTitle'){
      const bounds=await item.boundingBox();expect(bounds.width).toBeGreaterThanOrEqual(44);expect(bounds.height).toBeGreaterThanOrEqual(44);
     }
    }
   }
   for(const [selector,minimum]of [['#resultTitle',23],['.completion-medal h4',12],['.completion-credits strong, .completion-resources strong',18],['.completion-breakdown > summary, .completion-awards > summary',11]]){
    const sizes=await page.locator(selector).evaluateAll(items=>items.map(el=>parseFloat(getComputedStyle(el).fontSize)));
    for(const size of sizes)expect(size,selector+` at ${width}x${height}`).toBeGreaterThanOrEqual(minimum);
   }
   expect(await scroller.evaluate(el=>el.scrollTop)).toBe(0);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
   await page.screenshot({path:info.outputPath(`result-fit-${width}x${height}.png`)});expect(errors).toEqual([]);
  }finally{await context.close();}
 }
});
