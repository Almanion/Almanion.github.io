"use strict";
const {test,expect}=require("@playwright/test");
test.use({launchOptions:{args:["--enable-unsafe-swiftshader"]},viewport:{width:1280,height:800}});
test("stationary models survive camera motion without repeated GPU uploads; partial buffers remain exact",async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem("signal-frontier-v1",JSON.stringify({settings:{reduced:true,volume:0}}));
  Object.defineProperty(window,"SignalGraphics",{configurable:true,set(value){const create=value.create;value.create=c=>{window.gpuView=create(c);return gpuView;};Object.defineProperty(window,"SignalGraphics",{value,configurable:true});}});
 });
 await page.goto("/games/signal-frontier/?renderer=babylon");await page.waitForFunction(()=>window.SignalGame);
 await page.locator("#start").click();await page.waitForFunction(()=>SignalGame.cameraSettled()&&!gpuView.memoryNeedsRefine);
 const result=await page.evaluate(()=>{
  const v=gpuView,s=SignalEngine.restore(SignalGame.snapshot()),ui={mode:"tactical",reduced:true,selectionIds:[]};v.reset(s);
  for(let i=0;i<3;i++)v.render(s,ui,0);
  const counters=[];
  for(let i=0;i<4;i++){v.tactical.x+=1;v.camera.x+=1;v.render(s,ui,0);counters.push(v.parts.diagnostics().uploadBytes);}
  const gl=v.engine._gl,batch=v.parts.batches.get("box"),matrix=new Float32Array(16),color=new Float32Array([.2,.5,.7,1]);matrix[0]=matrix[5]=matrix[10]=matrix[15]=1;
  const previous=gl.getParameter(gl.ARRAY_BUFFER_BINDING);let mismatches=0,checks=0;const uploads=[];
  for(const count of [400,400,40,400,0,12]){
   batch.begin();
   for(let i=0;i<count;i++){matrix[12]=i*.37;matrix[13]=count===40?14:7;matrix[14]=-i*2;batch.put(matrix,color,i%3*72,count===40?.43:1);}
   batch.commit();uploads.push(batch.uploadBytes);
   for(const mesh of [batch.mesh,batch.shadow])for(const [kind,data,stride]of [["matrix",batch.matrices,16],["color",batch.colors,4],["floorHeight",batch.floors,1]]){
    if(!count)continue;
    const buffer=kind==="matrix"?mesh._thinInstanceDataStorage.matrixBuffer.getBuffer():mesh.getVertexBuffer(kind==="color"?"instanceColor":kind).getBuffer();
    const actual=new Float32Array(count*stride);gl.bindBuffer(gl.ARRAY_BUFFER,buffer.underlyingResource);gl.getBufferSubData(gl.ARRAY_BUFFER,0,actual);
    for(let i=0;i<actual.length;i++){checks++;if(actual[i]!==data[i])mismatches++;}
   }
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,previous);v.engine.wipeCaches(true);
  return {counters,uploads,mismatches,checks};
 });
 expect(result.counters).toEqual([0,0,0,0]);expect(result.mismatches).toBe(0);expect(result.checks).toBeGreaterThan(10000);
 expect(result.uploads[1]).toBe(0);expect(result.uploads[2]).toBeGreaterThan(0);expect(result.uploads[4]).toBe(0);
});
for(const transfer of ["pixels","canvas","rejected canvas"])test("partial visibility uploads exactly match a complete fog redraw · "+transfer,async({page})=>{
 await page.addInitScript(transfer=>{
  localStorage.setItem("signal-frontier-v1",JSON.stringify({settings:{reduced:true,volume:0}}));
  Object.defineProperty(window,"SignalGraphics",{configurable:true,set(value){const create=value.create;value.create=c=>{
   const v=window.gpuView=create(c);v.canvasFogUpload=transfer!=="pixels";
   if(transfer==="rejected canvas"){
    const upload=v.engine.updateTextureData;
    v.engine.updateTextureData=function(texture,data,...rest){
     if(data instanceof HTMLCanvasElement)throw Error("unsupported crop");
     return upload.call(this,texture,data,...rest);
    };
   }
   return v;
  };Object.defineProperty(window,"SignalGraphics",{value,configurable:true});}});
 },transfer);
 await page.goto("/games/signal-frontier/?renderer=babylon");await page.waitForFunction(()=>window.SignalGame);
 await page.locator("#start").click();await page.waitForFunction(()=>SignalGame.cameraSettled()&&!gpuView.memoryNeedsRefine);
 const result=await page.evaluate(async()=>{
  const v=gpuView,s=SignalEngine.restore(SignalGame.snapshot()),ui={mode:"tactical",reduced:true,selectionIds:[]},hero=SignalEngine.hero(s),render=v.render.bind(v);
  // Keep the app's RAF from rendering its separate live state while readPixels awaits the GPU.
  v.render=()=>{};
  render(s,ui,0);const fullSize=v.gpuMap.width*v.gpuMap.height*4,rows=[];
  for(const action of [()=>{hero.x+=7;hero.y+=5;},()=>{const u=s.units.find(u=>!u.team&&u.kind==="rifle");u.hp=0;},()=>{hero.x+=320;SignalEngine.refreshRecon(s);}]){
   action();render(s,ui,0);const bytes=v.fogUploadBytes,partial=await v.mask.readPixels();
   v.maskKey=null;render(s,ui,0);const full=await v.mask.readPixels();let mismatch=0,maxDifference=0;const first=[];
   for(let i=0;i<partial.length;i++)if(partial[i]!==full[i]){mismatch++;maxDifference=Math.max(maxDifference,Math.abs(partial[i]-full[i]));if(first.length<5)first.push([i,partial[i],full[i]]);}
   rows.push({bytes,mismatch,maxDifference,first});
  }
  return {fullSize,rows,transfer:v.diagnostics().fogTransfer};
 });
 expect(result.transfer).toBe(transfer==="canvas"?"canvas":"pixels");expect(result.rows.every(r=>r.mismatch===0),JSON.stringify(result)).toBe(true);
 expect(result.rows[0].bytes).toBeLessThan(result.fullSize*.35);
 expect(result.rows[1].bytes).toBeLessThan(result.fullSize*.35);
 expect(result.rows[2].bytes).toBeLessThan(result.fullSize*.5);
});

for(const profile of ['frontier-9','frontier-10'])test('partial CPU fog stays pixel-exact across movement, discovery and gates '+profile,async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('signal-frontier-v1',JSON.stringify({settings:{reduced:true,volume:0}}));
  Object.defineProperty(window,'SignalGraphics',{configurable:true,set(value){const create=value.create;value.create=c=>window.gpuView=create(c);Object.defineProperty(window,'SignalGraphics',{value,configurable:true});}});
 });
 await page.goto('/games/signal-frontier/?renderer=babylon');await page.waitForFunction(()=>window.SignalGame);
 await page.locator('#start').click();await page.waitForFunction(()=>SignalGame.cameraSettled()&&!gpuView.memoryNeedsRefine);
 const result=await page.evaluate(profile=>{
  const v=gpuView,E=SignalEngine,s=E.make(profile),h=E.hero(s),rifle=s.units.find(u=>!u.team&&u.kind==='rifle'),ui={mode:'tactical',reduced:true,selectionIds:[]},render=v.render.bind(v),rows=[];
  v.render=()=>{};v.reset(s);render(s,ui,0);
  const compare=label=>{
   E.refreshRecon(s);const before=JSON.stringify(E.snapshot(s));render(s,ui,0);
   const {width,height}=v.gpuMap,partial=v.maskContext.getImageData(0,0,width,height).data,painted=v.fogPaintPixels;
   // Reset only the mask cache to obtain the original full-raster reference.
   v.maskKey=null;render(s,ui,0);const full=v.maskContext.getImageData(0,0,width,height).data;let mismatch=0;
   for(let i=0;i<full.length;i++)if(partial[i]!==full[i])mismatch++;
   rows.push({label,mismatch,painted,total:width*height,pure:before===JSON.stringify(E.snapshot(s))});
  };
  h.x+=7.25;h.y+=3.5;compare('fractional movement');
  rifle.hp=0;compare('observer removed');
  rifle.hp=E.C.rifle.hp;compare('observer returned');
  if(profile==='frontier-10'){
   E.living(s,'citadel').hp=0;E.step(s);Object.assign(h,{x:4200,y:2080});compare('eastern entrance');
   s.units.find(u=>u.eastRole==='power').hp=0;E.step(s);compare('power and gate geometry');
  }else{h.x+=320;compare('newly explored contour');}
  h.x+=.35;h.y-=.25;compare('movement inside discovered territory');
  v.tactical.x+=30;v.camera.x+=30;render(s,ui,0);const cameraPaint=v.fogPaintPixels;
  v.maskKey=null;compare('context reinitialization');
  const clear={...E.observe(s),fog:null};v.visibility(clear);const {width,height}=v.gpuMap,a=v.maskContext.getImageData(0,0,width,height).data;
  v.maskKey=null;v.visibility(clear);const b=v.maskContext.getImageData(0,0,width,height).data;let clearMismatch=0;
  for(let i=0;i<a.length;i++)if(a[i]!==b[i])clearMismatch++;
  return {rows,cameraPaint,clearMismatch};
 },profile);
 expect(result.rows.every(r=>r.mismatch===0&&r.pure),JSON.stringify(result)).toBe(true);
 expect(result.rows[0].painted).toBeLessThan(result.rows[0].total*.35);
 expect(result.rows[1].painted).toBeLessThan(result.rows[1].total*.35);
 expect(result.cameraPaint).toBe(0);expect(result.clearMismatch).toBe(0);
});
