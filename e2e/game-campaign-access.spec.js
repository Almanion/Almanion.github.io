'use strict';
const {test,expect}=require('@playwright/test');
const base='/games/orbital-courier/';
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
});

for(const width of [390,1366])test('catalogue explains count and predecessor access with two starting choices '+width,async({page},info)=>{
 await page.setViewportSize({width,height:844});
 await page.goto(base+'contracts/');
 await expect(page.locator('#campaignTotal')).toContainText('/ 88');
 const initial=await page.locator('a[data-action=mission]').evaluateAll(nodes=>nodes.map(n=>+n.dataset.id));
 expect(initial).toEqual([4,8]);
 await expect(page.locator('#availableCount')).toHaveText('2');
 const filters=page.getByRole('button',{name:'Поиск и фильтры'});
 await expect(page.locator('#contractSearch')).toBeHidden();
 await filters.click();
 await page.locator('[data-action=contract-filter][data-filter=all]').click();
 await expect(page.locator('[data-action=mission]')).toHaveCount(88);
 for(const id of [0,1,2,3])await expect(page.locator('[data-action=mission][data-id="'+id+'"]')).toHaveCount(0);
 await expect(page.locator('[data-action=mission][data-id="5"]')).toBeDisabled();
 await expect(page.locator('[data-action=mission][data-id="5"] .mission-status')).toContainText('После');
 await expect(page.locator('[data-action=mission][data-id="12"] .mission-status')).toContainText('2');
 await page.locator('#contractSearch').fill('Последний перицентр');
 await expect(page.locator('[data-action=mission]')).toHaveCount(1);
 await expect(page.getByRole('button',{name:'Последний перицентр'})).toBeDisabled();
 await page.locator('#contractSearch').clear();
 await expect(page.locator('[data-action=mission]')).toHaveCount(88);
 await page.screenshot({path:info.outputPath('campaign-access.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 // Solve two independently available contracts, without fabricating records or rewards.
 await page.evaluate(()=>{
  const O=Orbital,A=O.App;
  for(const id of [4,8]){
   const l=O.LEVELS[id],q=l.solution,s=O.Physics.simulate(O.Physics.prepareLevel(l),q.angle,q.speed).state;
   if(s.status!=='won')throw Error('Authored starting course must deliver');
   O.Progress.complete(A.profile,l,s);
  }
  A.save();
 });
 await page.reload();
 await page.locator('[data-action=available-contracts]').click();
 await expect(filters).toHaveAttribute('aria-expanded','false');
 const choices=await page.locator('a[data-action=mission]').evaluateAll(nodes=>nodes.map(n=>+n.dataset.id));
 for(const id of [5,9,12])expect(choices).toContain(id);
 expect(choices).not.toContain(6);
 await page.locator('a[data-action=mission][data-id="12"]').click();
 await expect(page).toHaveURL(/flight\/\?contract=12$/);
 await page.waitForFunction(()=>globalThis.Orbital?.App?.currentId===12);
 expect(await page.evaluate(()=>Orbital.App.currentId)).toBe(12);
});

// Read geometry before dispatching input. Locator.click() would scroll a
// covered route into view and mask the regression these checks are for.
async function firstScreenPoint(locator){
 const layout=await locator.evaluate(node=>{
  const r=node.getBoundingClientRect(),nav=document.querySelector('.mobile-nav'),x=r.x+r.width/2,y=r.y+r.height/2;
  const cutoff=nav.offsetHeight?nav.getBoundingClientRect().top:innerHeight;
  return {x,y,height:r.height,scroll:scrollY,overflow:document.documentElement.scrollWidth-innerWidth,
   fits:r.top>=0&&r.left>=0&&r.right<=innerWidth+.5&&r.bottom<=cutoff+.5,
   hit:node.contains(document.elementFromPoint(x,y))};
 });
 expect(layout).toMatchObject({scroll:0,fits:true,hit:true});
 expect(layout.height).toBeGreaterThanOrEqual(44);
 expect(layout.overflow).toBeLessThanOrEqual(1);
 return layout;
}

for(const [width,height,path] of [
 [320,568,''],[320,568,'offline.html'],[390,844,''],[568,320,''],[1366,768,'']
]){
 test.describe(`dispatch ${width}×${height} ${path||'online'}`,()=>{
  const touch=width<1000;
  test.use({viewport:{width,height},isMobile:touch,hasTouch:touch});
  test('both starting choices are readable and operable from the first screen',async({page},info)=>{
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   const press=async locator=>{
    const {x,y}=await firstScreenPoint(locator);
    if(touch)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
   };
   await page.goto(base+path);
   await expect(page.locator('#homeFlightName')).toHaveText('Кольца Титана');
   await expect(page.locator('#homeFlightTask')).toContainText('состыкуйся');
   await expect(page.locator('#homeCompleted')).toHaveText('0 / 88');
   await firstScreenPoint(page.locator('#continueButton'));
   await page.screenshot({path:info.outputPath('home-first-screen.png')});
   await press(page.locator('#home [data-page=campaign]'));
   await expect(page.locator('body')).toHaveAttribute('data-page','campaign');
   const first=page.locator('#missionGrid [data-id="4"]'),second=page.locator('#missionGrid [data-id="8"]');
   await expect(first).toContainText('Кольца Титана');
   await expect(second).toContainText('Тройная система');
   await expect(page.locator('#campaignOptions')).toBeHidden();
   await firstScreenPoint(first);
   await firstScreenPoint(second);
   await page.screenshot({path:info.outputPath('contracts-first-screen.png')});
   const alternative=width===390;
   await press(alternative?second:first);
   await expect(page.locator('#flightTitle')).toHaveText(alternative?'Тройная система':'Кольца Титана');
   expect(await page.evaluate(()=>[Orbital.App.currentId,Orbital.App.state])).toEqual([alternative?8:4,null]);
   expect(errors).toEqual([]);
  });
 });
}

test('the most recently opened route is offered on both pages and resumes its course',async({page})=>{
 await page.setViewportSize({width:1366,height:768});
 await page.goto(base+'flight/?contract=8');
 await expect(page.locator('#flightTitle')).toHaveText('Тройная система');
 await page.evaluate(()=>Orbital.App.setAim(15.5,177));
 await page.locator('.brand').click();
 await expect(page.locator('#homeFlightName')).toHaveText('Тройная система');
 await expect(page.locator('#homeFlightSector')).toContainText('Последний рейс');
 await expect(page.locator('#continueButton')).toHaveAttribute('href',base+'flight/?contract=8');
 await page.locator('#home [data-page=campaign]').click();
 const current=page.locator('#missionGrid [data-action=mission]').first();
 await expect(current).toHaveAttribute('data-id','8');
 await expect(current).toHaveAttribute('href',base+'flight/?contract=8');
 await page.getByRole('button',{name:'Поиск и фильтры'}).click();
 await page.getByRole('searchbox',{name:'Поиск контрактов'}).fill('Каменный дождь');
 await expect(current).toHaveAttribute('data-id','5');
 await page.locator('.brand').click();
 await page.locator('#home [data-page=campaign]').click();
 await expect(current).toHaveAttribute('data-id','8');
 await expect(page.locator('#campaignOptions')).toBeHidden();
 await page.locator('.brand').click();
 await page.locator('#continueButton').click();
 await expect(page.locator('#flightTitle')).toHaveText('Тройная система');
 expect(await page.evaluate(()=>[Orbital.App.angle,Orbital.App.speed])).toEqual([15.5,177]);
});

test.describe('returning pilot on a short landscape phone',()=>{
 test.use({viewport:{width:568,height:320},isMobile:true,hasTouch:true});
 test('the long briefing leaves the recent route and actions on the first screen',async({page})=>{
  await page.goto(base);
  await page.evaluate(()=>{const A=Orbital.App;A.profile.campaignAccess=[58];A.save();});
  await page.goto(base+'flight/?contract=58');
  await expect(page.locator('#flightTitle')).toHaveText('Резонансный маятник');
  await page.goto(base);
  await expect(page.locator('#homeFlightName')).toHaveText('Резонансный маятник');
  await firstScreenPoint(page.locator('#continueButton'));
  const choose=await firstScreenPoint(page.locator('#home [data-view="open"]'));
  await page.touchscreen.tap(choose.x,choose.y);
  await expect(page).toHaveURL(/\/contracts\/$/);
  const card=page.locator('#missionGrid [data-action=mission]').first();
  await expect(card).toHaveAttribute('data-id','58');
  const point=await firstScreenPoint(card);
  await page.touchscreen.tap(point.x,point.y);
  await expect(page.locator('#flightTitle')).toHaveText('Резонансный маятник');
 });
});
