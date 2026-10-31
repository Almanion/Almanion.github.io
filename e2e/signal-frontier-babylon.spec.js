"use strict";
const { test, expect }=require("@playwright/test"),{PNG}=require("pngjs"),
  E=require("../game-source/signal-frontier/src/engine");
const route="/games/signal-frontier/?renderer=babylon";
test.use({launchOptions:{args:['--enable-unsafe-swiftshader']}});
async function ready(page) {
  await page.waitForFunction(()=>window.SignalGame);
  expect(await page.evaluate(()=>SignalGame.renderer().active)).toBe("babylon");
}
async function captureView(page) {
  await page.addInitScript(()=>{
    Object.defineProperty(window,"SignalGraphics",{configurable:true,set(value){
      const create=value.create;value.create=function(canvas){window.gpuTestView=create(canvas);return gpuTestView;};
      Object.defineProperty(window,"SignalGraphics",{value,writable:true,configurable:true});
    }});
  });
}
for(const [width,height]of [[1440,900],[390,844],[844,390]])test(`3D field is visible, aligned and frozen in tactical pause ${width}x${height}`,async({page})=>{
  const errors=[];page.on("pageerror",e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.setViewportSize({width,height});await captureView(page);
  await page.goto(route);await ready(page);await page.locator("#start").click();
  await page.waitForFunction(()=>SignalGame.cameraSettled()&&!gpuTestView.memoryNeedsRefine);
  const frameBefore=await page.evaluate(()=>gpuTestView.scene.getFrameId());
  const before=await page.evaluate(()=>SignalGame.snapshot());
  await page.waitForTimeout(180);expect(await page.evaluate(()=>SignalGame.snapshot())).toEqual(before);
  expect(await page.evaluate(()=>gpuTestView.scene.getFrameId())).toBe(frameBefore);
  const metrics=await page.evaluate(()=>({renderer:SignalGame.renderer(),alpha:document.querySelector('#field').getContext('2d').getContextAttributes().alpha,
    clipping:document.documentElement.scrollWidth>innerWidth,canvases:document.querySelectorAll('#world3d').length}));
  expect(metrics.renderer.details.units).toBeGreaterThan(0);expect(metrics.renderer.details.drawCalls).toBeGreaterThan(0);
  expect(metrics.renderer.details.drawCalls).toBeLessThanOrEqual(metrics.renderer.details.activeBatches*2+1);expect(metrics.alpha).toBe(true);expect(metrics.canvases).toBe(1);expect(metrics.clipping).toBe(false);
  const projection=await page.evaluate(()=>{
    const v=gpuTestView,h=SignalEngine.hero(SignalGame.snapshot());let error=0;
    for(const dx of [-100,0,100])for(const height of [0,19.5,72]){
      const p=v.project(h.x+dx,h.y,height),q=v.screen(h.x+dx,h.y);q.y-=height*v.camera.scale*.73;
      error=Math.max(error,Math.hypot(p.x-q.x,p.y-q.y));
    }return error;
  });
  expect(projection).toBeLessThan(.1);
  const png=PNG.sync.read(await page.screenshot());let surface=0;
  for(let y=Math.floor(height*.2);y<height*.65;y++)for(let x=Math.floor(width*.3);x<width*.8;x++){
    const i=(y*png.width+x)*4;if(png.data[i+1]>35&&png.data[i+1]>png.data[i])surface++;
  }
  expect(surface).toBeGreaterThan(width*height*.015);expect(errors).toEqual([]);
});

test("GPU and overlay keep the same physical resolution on HiDPI screens and resize",async({browser})=>{
  const page=await browser.newPage({viewport:{width:600,height:800},deviceScaleFactor:2});
  try {
    await captureView(page);await page.goto(route);await ready(page);await page.locator('#start').click();
    for(const size of [{width:600,height:800},{width:900,height:650}]){
      await page.setViewportSize(size);await page.waitForFunction(()=>SignalGame.cameraSettled());
      expect(await page.evaluate(()=>{
        const a=document.querySelector('#field'),b=document.querySelector('#world3d');
        return [a.width,a.height,b.width,b.height];
      })).toEqual([size.width*2,size.height*2,size.width*2,size.height*2]);
    }
  } finally {await page.close();}
});

test("a GPU context loss pauses combat and restoration allows the same operation to resume",async({page})=>{
  await captureView(page);await page.goto(route);await ready(page);await page.locator('#start').click();
  await page.keyboard.press('Tab');await page.waitForFunction(()=>SignalGame.snapshot().t>.05);
  const supported=await page.evaluate(()=>{
    window.lostContext=gpuTestView.engine._gl.getExtension('WEBGL_lose_context');
    lostContext?.loseContext();return !!lostContext;
  });
  expect(supported).toBe(true);await page.waitForFunction(()=>SignalGame.mode()==='paused');
  const before=await page.evaluate(()=>SignalGame.snapshot());await page.waitForTimeout(180);
  expect(await page.evaluate(()=>SignalGame.snapshot())).toEqual(before);
  await page.evaluate(()=>lostContext.restoreContext());await page.waitForFunction(()=>!SignalGame.renderer().details.lost);
  expect(await page.evaluate(()=>SignalGame.snapshot())).toEqual(before);
  await page.locator('#resume').click();await page.waitForFunction(t=>SignalGame.snapshot().t>t,before.t);
  expect(await page.evaluate(()=>SignalGame.renderer().active)).toBe('babylon');
});

test("GPU projection shares the aim plane and a live shot damages its cursor target",async({page})=>{
  const s=E.make("frontier-9"),target=s.units.find(u=>u.kind==="sentinel");
  for(const u of s.units)if(u.team&&u!==target&&u.kind!=="citadel")u.hp=0;
  s.campaign.camps.forEach(c=>c.reserve=0);
  Object.assign(E.hero(s),{x:400,y:3600,angle:0});Object.assign(target,{x:650,y:3600,hp:E.C.sentinel.hp,cool:5,path:[],target:null,order:null});
  Object.assign(target.ai,{home:{x:650,y:3600},goal:null,raid:false,seen:null,seenAt:0,vx:0,vy:0});E.refreshRecon(s);expect(E.restore(s)).not.toBeNull();
  await captureView(page);await page.addInitScript(s=>localStorage.setItem("signal-frontier-v1",JSON.stringify({save:s,settings:{reduced:true,volume:0}})),E.snapshot(s));
  await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));
  await page.goto(route);await ready(page);await page.locator("#continue").click();await page.clock.runFor(100);
  const point=await page.evaluate(t=>{const p=SignalGame.screen(t.x,t.y);p.y-=SignalEngine.MOUNTS.hero*SignalGame.camera().scale*.73;return p;},target);
  await page.mouse.move(point.x,point.y);await page.mouse.down();await page.clock.runFor(800);await page.mouse.up();
  const current=await page.evaluate(()=>SignalGame.snapshot());expect(current.shots).toBeGreaterThan(s.shots);expect(current.units.find(u=>u.id===target.id).hp).toBeLessThan(target.hp);
  await page.keyboard.press("Tab");const frozen=await page.evaluate(()=>SignalGame.snapshot());await page.clock.runFor(250);expect(await page.evaluate(()=>SignalGame.snapshot())).toEqual(frozen);
  expect(E.restore(current)).not.toBeNull();
});

test("all model types render without mutating an operation and instances stay bounded at 500",async({page})=>{
  const path=require('node:path');
  await page.route('**/game-source/signal-frontier/design/BABYLON_LAB.html',r=>r.fulfill({path:path.resolve('game-source/signal-frontier/design/BABYLON_LAB.html'),contentType:'text/html; charset=utf-8'}));
  await page.route('**/game-source/signal-frontier/design/babylon-lab.js',r=>r.fulfill({path:path.resolve('game-source/signal-frontier/design/babylon-lab.js'),contentType:'text/javascript; charset=utf-8'}));
  await page.goto('/game-source/signal-frontier/design/BABYLON_LAB.html');await page.waitForFunction(()=>window.SignalBabylonLab);
  const results=await page.evaluate(()=>{
    const lab=SignalBabylonLab;lab.pause();const results=[];
    for(const count of [100,300,500,100]){lab.setCount(count);for(let i=0;i<4;i++)lab.advance(1/60);results.push(lab.diagnostics());}
    const v=lab.view(),s=SignalEngine.make("classic"),kinds=Object.keys(SignalEngine.C);
    s.units=kinds.map((kind,i)=>({id:2000+i,kind,team:0,x:100+i%6*200,y:100+Math.floor(i/6)*200,hp:SignalEngine.C[kind].hp,angle:.4,flash:0,hit:0,build:0,jobs:[],path:[],
      ...(SignalEngine.construction.shapes[kind]?{construction:{turn:i%4}}:{})}));
    s.heroId=s.units.find(u=>u.kind==='hero').id;
    s.bullets=[];s.events=[];const saved=JSON.stringify(s);v.reset(s);v.render(s,{mode:'tactical',reduced:true,selectionIds:[]},1/60);
    return {results,pure:saved===JSON.stringify(s),types:kinds.length,meshes:v.scene.meshes.length,maxMeshes:v.diagnostics().maxBatches*2+1};
  });
  expect(results.pure).toBe(true);expect(results.types).toBe(24);expect(results.meshes).toBeLessThanOrEqual(results.maxMeshes);expect(results.maxMeshes).toBeLessThanOrEqual(87);
  for(const row of results.results){expect(row.gpu.units).toBe(row.count);expect(row.gpu.batches).toBeGreaterThan(4);expect(row.gpu.batches).toBeLessThanOrEqual(43);expect(row.gpu.drawCalls).toBeLessThanOrEqual(row.gpu.activeBatches*2+1);expect(row.gpu.parts).toBeLessThan(row.count*60+100);}
  expect(results.results.map(r=>r.gpu.batches)).toEqual(Array(4).fill(results.results[0].gpu.batches));
});

test("an unavailable GPU module restores a usable Canvas game",async({page})=>{
  await page.route('**/babylon-view.js*',route=>route.abort());await page.goto(route);await page.waitForFunction(()=>window.SignalGame);
  expect(await page.evaluate(()=>SignalGame.renderer().active)).toBe("canvas");await expect(page.locator('#renderer-loading')).toContainText('обычная версия');
  await expect(page.locator('#start')).toBeEnabled();await page.locator('#start').click();await expect(page.locator('#command-dock')).toBeVisible();expect(await page.locator('#world3d').count()).toBe(0);
});

test("an unavailable WebGL context falls back without leaving an extra canvas",async({page})=>{
  await page.addInitScript(()=>{
    const get=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){return /^(webgl2?|experimental-webgl)$/.test(type)?null:get.call(this,type,...args);};
  });
  await page.goto(route);await page.waitForFunction(()=>window.SignalGame);
  expect(await page.evaluate(()=>SignalGame.renderer().active)).toBe('canvas');
  expect(await page.locator('#world3d').count()).toBe(0);
  await page.locator('#start').click();await expect(page.locator('#command-dock')).toBeVisible();
  await page.keyboard.press('Tab');await page.waitForFunction(()=>SignalGame.snapshot().t>.05);
  expect(E.restore(await page.evaluate(()=>SignalGame.snapshot()))).not.toBeNull();
});
