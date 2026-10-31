'use strict';
const {test,expect}=require('@playwright/test'),path=require('node:path'),catalog=require('../game-source/signal-frontier/design/BABYLON_ART_REFERENCES.json');
test.use({launchOptions:{args:['--enable-unsafe-swiftshader']}});
async function open(page){
  const files=new Set(['BABYLON_MODELS.html','babylon-models.js','BABYLON_ART_REFERENCES.json',...catalog.assets.map(a=>a.preview)]);
  await page.route('**/game-source/signal-frontier/design/**',r=>{
    const relative=decodeURIComponent(new URL(r.request().url()).pathname.split('/design/')[1]);
    return files.has(relative)?r.fulfill({path:path.resolve('game-source/signal-frontier/design',relative)}):r.continue();
  });
  await page.goto('/game-source/signal-frontier/design/BABYLON_MODELS.html');
  await page.waitForFunction(()=>window.SignalModelGallery&&!SignalModelGallery.view().memoryNeedsRefine);
  await page.evaluate(()=>SignalModelGallery.pause());
}
test('selected references, eight directions, assembly phases and frozen memory use the real GPU models',async({page})=>{
  test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await open(page);expect(await page.locator('#model option').count()).toBe(20);
  for(const item of catalog.assets){
    await page.selectOption('#model',item.kind);await expect(page.locator('#reference')).toHaveAttribute('src',item.preview);
    await page.evaluate(async()=>{await SignalModelGallery.view().scene.whenReadyAsync();SignalModelGallery.advance(0);});
    for(const angle of [0,45,90,135,180,225,270,315])await page.evaluate(a=>SignalModelGallery.angle(a),angle);
  }
  const geometry=await page.evaluate(()=>SignalModelGallery.diagnostics().graphics);
  expect(geometry.batches).toBeLessThanOrEqual(43);expect(geometry.parts).toBeLessThan(120);
  for(const kind of ['hero','drone','artillery','rocket','bunker','outpost','foundry']){
    await page.evaluate(k=>{SignalModelGallery.choose(k);SignalModelGallery.angle(0);SignalModelGallery.state('idle');},kind);
    const before=await page.locator('#stage').screenshot();
    await page.evaluate(k=>{SignalModelGallery.state(k==='bunker'?'occupied':['outpost','foundry'].includes(k)?'build':k==='drone'?'work':k==='hero'?'reload':'fire');SignalModelGallery.advance(.05);},kind);
    expect(await page.locator('#stage').screenshot()).not.toEqual(before);
  }
  await page.evaluate(()=>{SignalModelGallery.choose('outpost');SignalModelGallery.state('memory');});
  const remembered=await page.locator('#stage').screenshot();
  await page.evaluate(()=>SignalModelGallery.advance(2));expect(await page.locator('#stage').screenshot()).toEqual(remembered);
  const data=await page.evaluate(()=>({saved:localStorage.getItem('signal-frontier-v1'),mode:SignalModelGallery.diagnostics()}));
  expect(data.saved).toBeNull();expect(errors).toEqual([]);
});

for(const [width,height]of [[1440,900],[390,844],[320,568],[844,390]])test(`model comparison fits ${width}x${height} and pause freezes the image`,async({page})=>{
  await page.setViewportSize({width,height});await open(page);
  await page.selectOption('#model','drone');await page.evaluate(()=>SignalModelGallery.state('work'));
  await page.waitForFunction(()=>!SignalModelGallery.view().memoryNeedsRefine);
  const before=await page.locator('#stage').screenshot();await page.waitForTimeout(150);
  expect(await page.locator('#stage').screenshot()).toEqual(before);
  const layout=await page.evaluate(()=>{
    const r=document.querySelector('#stage').getBoundingClientRect(),footer=document.querySelector('footer').getBoundingClientRect();
    const header=document.querySelector('header').getBoundingClientRect(),aside=document.querySelector('aside').getBoundingClientRect();
    return {overflow:document.documentElement.scrollWidth>innerWidth,w:r.width,h:r.height,bottom:r.bottom,footer:footer.top,header:header.bottom,reference:aside.top};
  });
  expect(layout.overflow).toBe(false);expect(layout.w).toBeGreaterThan(200);expect(layout.h).toBeGreaterThan(100);expect(layout.bottom).toBeLessThanOrEqual(layout.footer);
  expect(layout.reference).toBeGreaterThanOrEqual(layout.header);
});

test('real release events open the visible production doors, while remembered doors remain closed',async({page})=>{
  await open(page);
  for(const kind of ['base','outpost','barracks','foundry','bunker']){
    await page.evaluate(k=>SignalModelGallery.choose(k),kind);await page.waitForFunction(()=>!SignalModelGallery.view().memoryNeedsRefine);
    const closed=await page.locator('#stage').screenshot();
    await page.evaluate(()=>SignalModelGallery.state('memory',true));const memory=await page.locator('#stage').screenshot();
    await page.evaluate(()=>{
      const g=SignalModelGallery,s=g.snapshot(),u=s.units[0],v=g.view();g.state('idle',true);v.modelClock=s.t;
      v.add([{type:'reinforce',x:u.x,y:u.y,action:'rifle'}],true);g.advance(0);
    });
    const opened=await page.locator('#stage').screenshot();expect(opened).not.toEqual(closed);
    await page.evaluate(()=>SignalModelGallery.advance(0));expect(await page.locator('#stage').screenshot()).toEqual(opened);
    await page.evaluate(()=>SignalModelGallery.state('memory',true));expect(await page.locator('#stage').screenshot()).toEqual(memory);
    await page.evaluate(()=>{SignalModelGallery.state('idle',true);SignalModelGallery.advance(1);});expect(await page.locator('#stage').screenshot()).toEqual(closed);
  }
});
