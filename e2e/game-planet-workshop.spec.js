'use strict';
const {test,expect}=require('@playwright/test');
const historical=require('../game-source/orbital-courier/docs/completed-v8-profile.json');
test.use({serviceWorkers:'block'});
async function setup(page){await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('/games/orbital-courier/offline.html');await page.evaluate(p=>{const A=Orbital.App;A.profile=Orbital.Progress.sanitize(p);A.profile.settings.sound=false;A.profile.settings.reducedMotion=true;A.loadLevel(80);},historical);}
for(const [width,height]of [[1366,768],[390,844],[320,568]])test('planet placement, A/B, reload and actual docking '+width,async({browser},info)=>{
 test.setTimeout(60000);const context=await browser.newContext({viewport:{width,height},hasTouch:width<700,isMobile:width<700,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await setup(page);await expect(page.locator('#mapPlanets')).toHaveAttribute('aria-pressed','true');
  const positions=await page.evaluate(()=>{const A=Orbital.App,p=A.level().planets[0],q=A.level().solution.layout[0];return{from:Orbital.UI9.worldToScreen(p.x,p.y),to:Orbital.UI9.worldToScreen(q.x,q.y),q,aim:[A.angle,A.speed]};});
  if(width<700){const cdp=await context.newCDPSession(page);for(const [type,p]of [['touchStart',positions.from],['touchMove',positions.to]])await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[{id:0,x:p.x,y:p.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else {await page.mouse.move(positions.from.x,positions.from.y);await page.mouse.down();await page.mouse.move(positions.to.x,positions.to.y,{steps:8});await page.mouse.up();}
  const placed=await page.evaluate(()=>({layout:Orbital.App.level().layout,save:Orbital.App.profile.layouts['80:normal'],aim:[Orbital.App.angle,Orbital.App.speed]}));
  expect(Math.abs(placed.layout[0].x-positions.q.x)).toBeLessThanOrEqual(1);expect(Math.abs(placed.layout[0].y-positions.q.y)).toBeLessThanOrEqual(1);expect(placed.save).toEqual(placed.layout);expect(placed.aim).toEqual(positions.aim);
  if(width<700)await page.locator('#mobileReadout').click();
  await page.locator('#planetWorkshop summary').click();await expect(page.locator('#planetX')).toBeVisible();
  // Numeric editing uses the same geometry and never replaces planet mass.
  await page.locator('#planetX').fill(String(positions.q.x));await page.locator('#planetX').press('Tab');await page.locator('#planetY').fill(String(positions.q.y));await page.locator('#planetY').press('Tab');
  await page.locator('#planetWorkshop summary').click();
  const course=await page.evaluate(()=>Orbital.LEVELS[80].solution);
  await page.locator('#angleInput').fill(String(course.angle));await page.locator('#angleInput').press('Tab');await page.locator('#speedInput').fill(String(course.speed));await page.locator('#speedInput').press('Tab');
  await page.locator('#memoryTab').click();await page.locator('[data-action=store-course][data-slot="0"]').click();
  expect(await page.evaluate(()=>Orbital.App.profile.courses['80:normal'][0].layout)).toEqual(placed.layout);
  if(width<700)await page.locator('[data-action="ui:close-sheet"]').first().click();
  await page.reload();await page.evaluate(()=>Orbital.App.loadLevel(80));expect(await page.evaluate(()=>Orbital.App.level().layout)).toEqual(placed.layout);
  await page.evaluate(()=>{Orbital.App.recallCourse(0);Orbital.App.timeScale=50;});
  await page.screenshot({path:info.outputPath('planned-flight.png')});
  await page.locator(width<700?'#mobileLaunch':'#launchButton').click();
  expect(await page.evaluate(()=>Orbital.App.setLayout([]))).toBe(false);
  await expect.poll(()=>page.evaluate(()=>Orbital.App.state?.status),{timeout:10000}).toBe('won');
  expect(await page.evaluate(()=>Orbital.Campaign.current(Orbital.App.profile,80))).toBe(true);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem(Orbital.Progress.SAVE_KEY)).records[80].routeVersion)).toBe(13);
  await expect(page.locator('#resultDockingCanvas')).toBeVisible();
  await page.screenshot({path:info.outputPath('new-contract-docked.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('invalid layouts block launch, cancellation restores geometry, keyboard moves selected world and training stays unrewarded',async({page})=>{
 await setup(page);await page.locator('#gameCanvas').focus();const before=await page.evaluate(()=>({p:Orbital.App.level().layout,angle:Orbital.App.angle}));await page.keyboard.press('ArrowRight');
 expect(await page.evaluate(()=>Orbital.App.level().layout[0].x)).toBe(before.p[0].x+2);expect(await page.evaluate(()=>Orbital.App.angle)).toBe(before.angle);
 const bad=await page.evaluate(()=>{const A=Orbital.App,l=A.level(),z=l.placement.zones[0];for(let x=z.x;x<=z.x+z.w;x+=10)for(let y=z.y;y<=z.y+z.h;y+=10){const q=[{planet:0,x,y}];if(Orbital.Physics.layoutProblem(l,q))return q;}throw Error('test needs a blocked position');});
 await page.evaluate(q=>Orbital.App.setLayout(q),bad);await expect(page.locator('#launchButton')).toBeDisabled();expect(await page.evaluate(()=>{Orbital.App.launch();return Orbital.App.state;})).toBeNull();
 await page.locator('#planetWorkshop summary').click();await page.locator('[data-action="planets:reset"]').click();await expect(page.locator('#launchButton')).toBeEnabled();
 const initial=await page.evaluate(()=>Orbital.App.level().layout);const point=await page.evaluate(()=>{const p=Orbital.App.level().planets[0];return Orbital.UI9.worldToScreen(p.x,p.y);});await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+20,point.y+10);await page.locator('#gameCanvas').dispatchEvent('pointercancel');await page.mouse.up();expect(await page.evaluate(()=>Orbital.App.level().layout)).toEqual(initial);
 const snapshot=await page.evaluate(()=>JSON.stringify(Orbital.App.profile));await page.evaluate(()=>{const A=Orbital.App;A.applySolution();A.timeScale=50;A.launch();});await expect.poll(()=>page.evaluate(()=>Orbital.App.state?.status)).toBe('won');expect(await page.evaluate(()=>JSON.stringify(Orbital.App.profile))).not.toBe(snapshot); // attempt counter only
 expect(await page.evaluate(()=>Orbital.App.lastResult.training)).toBe(true);expect(await page.evaluate(()=>Orbital.App.profile.records[80]?.medals||0)).toBe(0);expect(await page.evaluate(()=>Orbital.App.profile.layouts['80:normal'])).toEqual(initial);
});

test('all eight authored layouts fly through the real application and grant their engineering awards',async({page})=>{
 test.setTimeout(60000);await setup(page);
 for(let id=80;id<88;id++){
  await page.evaluate(id=>{const A=Orbital.App,q=Orbital.LEVELS[id].solution;A.loadLevel(id);A.setLayout(q.layout);A.setAim(q.angle,q.speed);A.timeScale=50;A.launch();},id);
  await expect.poll(()=>page.evaluate(()=>Orbital.App.state?.status),{timeout:10000}).toBe('won');
  expect(await page.evaluate(id=>Orbital.Campaign.current(Orbital.App.profile,id),id)).toBe(true);
 }
 await page.evaluate(()=>Orbital.App.go('awards'));await page.locator('#awardSearch').fill('Архитектор тяготения');await expect(page.locator('[data-achievement=architect-8]')).toHaveClass(/earned/);
});
