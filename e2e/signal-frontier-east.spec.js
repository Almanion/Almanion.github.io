const {test,expect}=require('@playwright/test');
test.use({launchOptions:{args:['--enable-unsafe-swiftshader']}});
for(const renderer of ['babylon','canvas'])test('archive operation starts and restores in '+renderer,async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('signal-frontier-v1',JSON.stringify({settings:{reduced:true,volume:0}})));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/games/signal-frontier/?renderer='+renderer+'&mission=east');await page.waitForFunction(()=>window.SignalGame);
 await page.locator('#start-east').click();await expect(page.locator('#hud')).toBeVisible();
 const result=await page.evaluate(()=>{const s=SignalGame.snapshot();return {id:s.campaign.id,valid:!!SignalEngine.restore(s),width:SignalEngine.map(s).W};});
 expect(result).toEqual({id:'frontier-10',valid:true,width:5600});expect(errors).toEqual([]);
});
for(const direct of [false,true])test('eastern fog uploads exact visible tiles and catches up when the camera moves · '+(direct?'canvas':'pixels'),async({page})=>{
 await page.setViewportSize({width:1280,height:800});
 await page.addInitScript(direct=>{localStorage.setItem('signal-frontier-v1',JSON.stringify({settings:{reduced:true,volume:0}}));Object.defineProperty(window,'SignalGraphics',{configurable:true,set(o){const f=o.create;o.create=c=>{window.gpuView=f(c);gpuView.canvasFogUpload=direct;return gpuView;};Object.defineProperty(window,'SignalGraphics',{value:o,configurable:true});}})},direct);
 await page.goto('/games/signal-frontier/?renderer=babylon&mission=east');await page.waitForFunction(()=>window.SignalGame);await page.locator('#start-east').click();
 await page.waitForFunction(()=>SignalGame.cameraSettled()&&!gpuView.memoryNeedsRefine);
 const result=await page.evaluate(async()=>{
  const v=gpuView,s=SignalEngine.restore(SignalGame.snapshot()),render=v.render.bind(v),ui={mode:'tactical',reduced:true,selectionIds:[]};v.render=()=>{};
  const camera=(x,y)=>{v.tactical.overview=false;v.tactical.x=x;v.tactical.y=y;v.tactical.zoom=1;v.camera.x=x;v.camera.y=y;v.camera.scale=1;};
  camera(500,2500);render(s,ui,0);const before=v.gpuMap.width*v.gpuMap.height*4;
  SignalEngine.living(s,'citadel').hp=0;SignalEngine.step(s,{},SignalEngine.DT);Object.assign(SignalEngine.hero(s),{x:4200,y:2080});SignalEngine.refreshRecon(s);
  render(s,ui,0);const first=v.fogUploadBytes;
  camera(4500,2100);render(s,ui,0);const panned=v.fogUploadBytes,partial=await v.mask.readPixels(),{width,height,world}=v.gpuMap,c=v.camera,
    x0=Math.max(0,Math.floor((c.x-v.origin.x/c.scale)*width/world.W)),x1=Math.min(width,Math.ceil((c.x+(v.width-v.origin.x)/c.scale)*width/world.W)),
    y0=Math.max(0,Math.floor((c.y-v.origin.y/(c.scale*.73))*height/world.H)),y1=Math.min(height,Math.ceil((c.y+(v.height-v.origin.y)/(c.scale*.73)+250)*height/world.H));
  v.maskKey=null;render(s,ui,0);const full=await v.mask.readPixels();let mismatch=0;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)for(let k=0;k<4;k++){const i=(y*width+x)*4+k;if(partial[i]!==full[i])mismatch++;}
  render(s,ui,0);return {before,first,panned,mismatch,stable:v.fogUploadBytes,pixelsPerWorld:width/world.W};
 });
 expect(result.mismatch,JSON.stringify(result)).toBe(0);expect(result.first).toBeLessThan(result.before*.5);
 expect(result.panned).toBeGreaterThan(0);expect(result.stable).toBe(0);expect(result.pixelsPerWorld).toBeGreaterThanOrEqual(2048/3840);
});
