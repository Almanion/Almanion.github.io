"use strict";
const {test,expect}=require("@playwright/test"),{PNG}=require("pngjs");
test.use({launchOptions:{args:["--enable-unsafe-swiftshader"]},viewport:{width:1280,height:800}});
async function capture(page){
 await page.addInitScript(()=>Object.defineProperty(window,"SignalGraphics",{configurable:true,set(value){
  const create=value.create;value.create=function(c){window.terrainTestView=create(c);const render=terrainTestView.render;terrainTestView.testFrames=0;
   terrainTestView.render=function(...args){this.testFrames++;return render.apply(this,args);};return terrainTestView;};
  Object.defineProperty(window,"SignalGraphics",{value,writable:true,configurable:true});
 }}));
}
for(const renderer of ["babylon","canvas"]){
 test(renderer+": delayed materials update a stationary tactical pause and return to idle",async({page})=>{
  await capture(page);const errors=[];page.on("pageerror",e=>errors.push(e.message));
  let release;const gate=new Promise(r=>release=r),requests=[];
  await page.route("**/assets/terrain/*.webp*",async route=>{requests.push(route.request().url());await gate;await route.continue();});
  await page.goto("/games/signal-frontier/?renderer="+renderer);await page.waitForFunction(()=>window.SignalGame);
  await page.locator("#start").click();await expect.poll(()=>page.evaluate(()=>SignalGame.mode())).toBe("tactical");
  await page.waitForFunction(()=>SignalGame.cameraSettled()&&!terrainTestView.memoryNeedsRefine);
  const initial=PNG.sync.read(await page.screenshot()),state=await page.evaluate(()=>SignalGame.snapshot());
  release();
  await page.waitForFunction(renderer=>renderer==="babylon"?
    terrainTestView.gpuMap?.terrain.art.ground==="ready"&&terrainTestView.gpuMap?.terrain.art.cliff==="ready":
    SignalTerrainArt.peek("districts")&&SignalTerrainArt.peek("cliff")&&!terrainTestView.groundArtPending,renderer);
  await page.waitForFunction(()=>!terrainTestView.memoryNeedsRefine&&SignalGame.cameraSettled());
  const after=PNG.sync.read(await page.screenshot());let changed=0;
  for(let y=160;y<480;y++)for(let x=300;x<1100;x++){const i=(y*initial.width+x)*4;if(Math.abs(initial.data[i]-after.data[i])+Math.abs(initial.data[i+1]-after.data[i+1])>15)changed++;}
  expect(changed).toBeGreaterThan(5000);
  const frames=await page.evaluate(()=>terrainTestView.testFrames);await page.waitForTimeout(200);
  expect(await page.evaluate(()=>terrainTestView.testFrames)).toBe(frames);
  expect(await page.evaluate(()=>SignalGame.snapshot())).toEqual(state);
  // The animated home preview uses the older expedition map before deployment.
  expect(requests.length).toBeLessThanOrEqual(renderer==="babylon"?4:3);expect(errors).toEqual([]);
  if(renderer==="babylon"){
   const geometry=await page.evaluate(()=>{const mesh=terrainTestView.gpuMap.terrain.mesh,p=mesh.getVerticesData("position"),uv=mesh.getVerticesData("uv"),kind=mesh.getVerticesData("uv2"),world=SignalEngine.map("districts");let error=0;
    for(let i=0;i<p.length/3;i++)if(kind[i*2]===0)error=Math.max(error,Math.abs(uv[i*2]-p[i*3]/world.W),Math.abs(uv[i*2+1]+p[i*3+2]/world.H));
    return {error,kinds:[...new Set(kind.filter((_,i)=>i%2===0))].sort(),draws:SignalGame.renderer().details.drawCalls,batches:SignalGame.renderer().details.activeBatches};});
   expect(geometry.error).toBeLessThan(.000001);expect(geometry.kinds).toEqual([0,1,2,3]);expect(geometry.draws).toBeLessThanOrEqual(geometry.batches*2+1);
  }
 });
 test(renderer+": missing artwork keeps the map usable without retrying every frame",async({page})=>{
  await capture(page);let requests=0;
  await page.route("**/assets/terrain/*.webp*",route=>{requests++;return route.fulfill({status:404,body:"missing test asset"});});
  await page.goto("/games/signal-frontier/?renderer="+renderer);await page.waitForFunction(()=>window.SignalGame);
  await page.locator("#start").click();await page.waitForFunction(()=>SignalGame.cameraSettled()&&!terrainTestView.memoryNeedsRefine);
  expect(await page.evaluate(()=>SignalGame.renderer().active)).toBe(renderer);
  const screenshot=PNG.sync.read(await page.screenshot());let visible=0;
  for(let y=160;y<480;y++)for(let x=300;x<1100;x++){if(screenshot.data[(y*screenshot.width+x)*4+1]>40)visible++;}
  expect(visible).toBeGreaterThan(5000);
  const frames=await page.evaluate(()=>terrainTestView.testFrames),requested=requests;await page.waitForTimeout(200);
  expect(await page.evaluate(()=>terrainTestView.testFrames)).toBe(frames);expect(requests).toBe(requested);
  expect(requests).toBeLessThanOrEqual(renderer==="babylon"?4:3);
 });
}
