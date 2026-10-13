const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const out=path.resolve(__dirname,'../..'),ev=path.join(out,'evidence-v2');
(async()=>{const browser=await chromium.launch({channel:'msedge'});try{
 const p=await browser.newPage(),errors=[],requests=[],flights=[];
 p.on('pageerror',e=>errors.push(e.message));await p.route(/^https?:/,r=>{requests.push(r.request().url());r.abort()});await p.context().setOffline(true);
 const go=async(s,o={})=>{await p.waitForTimeout(270);assert(await p.evaluate(([s,o])=>DEMO.go(s,o),[s,o]));};
 const snap=()=>p.evaluate(()=>({step:DEMO.step,pose:DEMO.pose,cursor:DEMO.cursor,page:currentPage,scroll:doc().defaultView.scrollY,grade:doc().querySelector('#gradeTab10')?.getAttribute('aria-selected'),layers:['intro-copy','intro-description','site','route-copy'].map(id=>{const n=$(id);return[id,n.style.visibility,n.style.opacity,n.style.transform]}),sky:Cosmos.telemetry.camera,focus:$('focus').style.opacity==='1'?$('focus').getAttribute('style'):'hidden'}));
 for(const width of [1920,1366]){
  await p.setViewportSize({width,height:width===1920?1080:768});await p.goto('file:///'+path.join(out,'Almanion.html').replace(/\\/g,'/'));await p.waitForFunction(()=>window.DEMO);
  assert.deepEqual(await p.evaluate(()=>DEMO.order.slice(0,4)),[0,33,1,2]);assert.equal(await p.locator('#controls-toggle').getAttribute('aria-expanded'),'false');
  assert(await p.locator('nav').isHidden(),'no persistent bottom menu');
  const expected={};for(const s of [0,33,1,2]){if(s)await go(s,{instant:true});expected[s]=await snap();}
  await go(0,{instant:true});
  for(const target of [33,1]){
   await p.waitForTimeout(270);await p.evaluate(s=>{window.introFrames=[];window.introRun=DEMO.go(s);window.rejected=DEMO.go(s);function sample(t){introFrames.push({t,p:Number($('stage').dataset.introProgress||0),phase:$('stage').dataset.introPhase,cursor:DEMO.cursor,opacity:getComputedStyle($('cursor')).opacity,...Cosmos.telemetry});if(DEMO.busy)requestAnimationFrame(sample)}requestAnimationFrame(sample)},target);
   assert.equal(await p.evaluate(()=>rejected),false,'no queued command during flight');
   if(width===1920)for(const progress of [.24,.50,.74,.91]){await p.waitForFunction(t=>Number(document.getElementById('stage').dataset.introProgress)>=t,progress);await p.screenshot({path:path.join(ev,`intro-${target}-flight-${Math.round(progress*100)}.png`)});}
   await p.evaluate(()=>introRun);assert.deepEqual(await snap(),expected[target],'canonical arrival '+target);
   const frames=await p.evaluate(()=>introFrames),moving=frames.filter(f=>f.phase),peak=Math.max(...frames.map(f=>f.streaks)),draw=frames.map(f=>f.drawMs).sort((a,b)=>a-b);
   assert(moving.at(-1).t-moving[0].t>=3300,'sustained deeper flight');assert(peak>120,'visible star motion');
   const distance=Math.abs(moving.at(-1).camera.z-moving[0].camera.z);assert(distance>4.8,'each opening leg covers a substantial world-space distance');
   const crossed=target===33?[6,7]:[4,5];for(const layer of crossed){assert(moving.some(f=>f.layers[layer].visible>15),'foreground stars are visibly present');assert(moving.some(f=>f.layers[layer].meanSpeed>1500),'nearby stars accelerate strongly');assert.equal(moving.at(-1).layers[layer].passed,180,'entire layer passes behind the camera');assert.equal(moving.at(-1).layers[layer].visible,0,'passed stars are no longer rendered');}
   assert(frames.every(f=>Number(f.opacity)===1),'cursor remains visible');
   for(let i=1;i<frames.length;i++){const a=frames[i-1],b=frames[i];if(b.t-a.t<30)assert(Math.hypot(a.cursor.x-b.cursor.x,a.cursor.y-b.cursor.y)<65,'continuous pointer '+JSON.stringify({width,target,a,b}));}
   const middle=frames.find(f=>f.speed>.98);assert(middle,'cruise phase');assert(Math.max(...middle.layers.slice(4).map(l=>l.meanSpeed))>middle.layers[1].meanSpeed*2,'foreground sweeps faster than the distant field');
   assert(await p.evaluate(()=>!Cosmos.active&&$('stage').dataset.flight==='false'&&document.getAnimations().every(a=>a.playState!=='running')));
   await p.screenshot({path:path.join(ev,`intro-stop-${target}-${width}.png`)});
   const frozen=await p.screenshot();await p.waitForTimeout(350);assert(frozen.equals(await p.screenshot()),'pixel-identical pause');
   flights.push({width,target,flightMs:moving.at(-1).t-moving[0].t,worldDistance:distance,crossedForegroundLayers:crossed,peakForegroundSpeed:Math.max(...moving.flatMap(f=>crossed.map(i=>f.layers[i].meanSpeed))),peakStreaks:peak,drawP95:draw[Math.floor(draw.length*.95)],samples:frames.length});
  }
  await go(2);assert.deepEqual(await snap(),expected[2],'continues to physics');await go(1);assert.deepEqual(await snap(),expected[1]);
  for(const s of [33,0]){await go(s);assert.deepEqual(await snap(),expected[s],'reverse '+s);}
  for(const s of [33,1]){await go(s,{replay:true});assert.deepEqual(await snap(),expected[s],'replay '+s);}
  await p.keyboard.press('m');assert(await p.locator('nav').isVisible());await p.locator('#toc-open').click();await p.locator('#toc-items [data-step="33"]').click();await p.waitForFunction(()=>!DEMO.busy);assert.deepEqual(await snap(),expected[33]);
  await p.keyboard.press('Escape');assert(await p.locator('nav').isHidden());
  await p.evaluate(()=>DEMO.setReduced(true));for(const s of [0,33,1,33,0]){await go(s);assert.deepEqual(await snap(),expected[s],'reduced '+s);}
  await p.waitForTimeout(270);await p.keyboard.down('ArrowRight');await p.keyboard.down('ArrowRight');await p.keyboard.up('ArrowRight');await p.waitForFunction(()=>!DEMO.busy);assert.equal(await p.evaluate(()=>DEMO.step),33);
  await p.waitForTimeout(270);await p.locator('#stage').dblclick({position:{x:20,y:200}});await p.waitForFunction(()=>!DEMO.busy);assert.equal(await p.evaluate(()=>DEMO.step),1);
  await p.waitForTimeout(270);await p.keyboard.press('Home');await p.waitForFunction(()=>!DEMO.busy);assert.deepEqual(await snap(),expected[0]);
  await p.screenshot({path:path.join(ev,`intro-stop-0-${width}.png`)});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 const report={htmlSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(out,'Almanion.html'))).digest('hex'),route:[0,33,1,2],viewports:[1920,1366],offline:true,forward:true,reverse:true,replay:true,reduced:true,stationary:true,cursorContinuous:true,controls:true,repeatGuard:true,doubleClickGuard:true,errors,requests,flights};
 fs.writeFileSync(path.join(ev,'intro-verification.json'),JSON.stringify(report,null,2));console.log('PASS: three opening planes, two guided flights, depth layers, exact reverse/replay, reduced motion, pixel-stationary stops, hidden controls, offline, both resolutions.');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
