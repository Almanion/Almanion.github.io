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
test("partial visibility uploads exactly match a complete fog redraw",async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem("signal-frontier-v1",JSON.stringify({settings:{reduced:true,volume:0}}));
  Object.defineProperty(window,"SignalGraphics",{configurable:true,set(value){const create=value.create;value.create=c=>{window.gpuView=create(c);return gpuView;};Object.defineProperty(window,"SignalGraphics",{value,configurable:true});}});
 });
 await page.goto("/games/signal-frontier/?renderer=babylon");await page.waitForFunction(()=>window.SignalGame);
 await page.locator("#start").click();await page.waitForFunction(()=>SignalGame.cameraSettled()&&!gpuView.memoryNeedsRefine);
 const result=await page.evaluate(async()=>{
  const v=gpuView,s=SignalEngine.restore(SignalGame.snapshot()),ui={mode:"tactical",reduced:true,selectionIds:[]},hero=SignalEngine.hero(s),render=v.render.bind(v);
  // Keep the app's RAF from rendering its separate live state while readPixels awaits the GPU.
  v.render=()=>{};
  render(s,ui,0);const fullSize=v.gpuMap.width*v.gpuMap.height*4,rows=[];
  for(const action of [()=>{hero.x+=7;hero.y+=5;},()=>{const u=s.units.find(u=>!u.team&&u.kind==="rifle");u.hp=0;},()=>{hero.x+=320;SignalEngine.refreshRecon(s);}]){
   action();render(s,ui,0);const bytes=v.fogUploadBytes,cpuPartial=v.maskContext.getImageData(0,0,v.gpuMap.width,v.gpuMap.height).data,partial=await v.mask.readPixels();
   v.maskKey=null;render(s,ui,0);const cpuFull=v.maskContext.getImageData(0,0,v.gpuMap.width,v.gpuMap.height).data,full=await v.mask.readPixels();let mismatch=0,maxDifference=0;const first=[];
   for(let i=0;i<partial.length;i++)if(partial[i]!==full[i]){mismatch++;maxDifference=Math.max(maxDifference,Math.abs(partial[i]-full[i]));if(first.length<5)first.push([i,partial[i],full[i],cpuPartial[i],cpuFull[i]]);}
   rows.push({bytes,mismatch,maxDifference,first});
  }
  return {fullSize,rows,cpuCanvas:v.maskContext.getContextAttributes().willReadFrequently};
 });
 expect(result.cpuCanvas).toBe(true);expect(result.rows.every(r=>r.mismatch===0),JSON.stringify(result)).toBe(true);
 expect(result.rows[0].bytes).toBeLessThan(result.fullSize*.35);
 expect(result.rows[1].bytes).toBeLessThan(result.fullSize*.35);
 expect(result.rows[2].bytes).toBeLessThan(result.fullSize*.5);
});
