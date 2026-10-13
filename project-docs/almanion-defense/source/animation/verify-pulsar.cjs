const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const out=path.resolve(__dirname,'../..'),ev=path.join(out,'evidence-v2');
(async()=>{const browser=await chromium.launch({channel:'msedge'});try{
 const p=await browser.newPage(),errors=[],requests=[],metrics=[];p.on('pageerror',e=>errors.push(e.message));await p.route(/^https?:/,r=>{requests.push(r.request().url());r.abort()});await p.context().setOffline(true);
 const go=async(s,o={})=>{await p.waitForTimeout(280);assert(await p.evaluate(([s,o])=>DEMO.go(s,o),[s,o]));};
 const snap=()=>p.evaluate(()=>({step:DEMO.step,pose:DEMO.pose,cursor:DEMO.cursor,visible:getComputedStyle($('site')).visibility,ending:getComputedStyle($('pulsar-ending')).visibility,opacity:$('cursor').style.opacity,final:$('stage').dataset.pulsarFinal,sky:$('cosmos').toDataURL(),pulsar:$('pulsar').toDataURL(),page:currentPage,scroll:doc().defaultView.scrollY}));
 for(const width of [1920,1366]){
  await p.setViewportSize({width,height:width===1920?1080:768});await p.goto('file:///'+path.join(out,'Almanion.html').replace(/\\/g,'/'));await p.waitForFunction(()=>window.DEMO);await p.evaluate(()=>DEMO.setReduced(true));
  const journey=await p.evaluate(()=>DEMO.order.map(s=>({s,...PulsarScene.viewFor(s)})));for(let i=1;i<journey.length;i++)assert(journey[i].r>journey[i-1].r,'each stop approaches the destination');
  const expected={};for(const s of [0,29,34]){if(s)await go(s);expected[s]=await snap();}
  assert.equal(await p.evaluate(()=>PulsarScene.active),false);assert(await p.locator('#pulsar-pause').isDisabled());assert.equal(expected[34].opacity,'0');assert.equal(expected[34].visible,'hidden');
  await go(29);await p.evaluate(()=>DEMO.setReduced(false));await p.waitForTimeout(280);
  await p.evaluate(()=>{window.framesP=[];window.pulsarRun=DEMO.go(34);window.rejected=DEMO.go(1);function take(t){framesP.push({t,...PulsarScene.stats,opacity:Number($('cursor').style.opacity||1),cursor:DEMO.cursor,star:Cosmos.telemetry});if(DEMO.busy)requestAnimationFrame(take)}requestAnimationFrame(take)});
  assert.equal(await p.evaluate(()=>rejected),false);
  for(const q of [.20,.67,.77,.89]){await p.waitForFunction(q=>Number(document.getElementById('stage').dataset.pulsarProgress)>=q,q);if(width===1920)await p.screenshot({path:path.join(ev,`pulsar-flight-${Math.round(q*100)}.png`)});}
  await p.evaluate(()=>pulsarRun);assert.equal(await p.evaluate(()=>DEMO.step),34);assert(await p.evaluate(()=>PulsarScene.active));assert(await p.locator('#next').isDisabled());
  const frames=await p.evaluate(()=>framesP),travel=frames.filter(f=>f.flight),dissolving=travel.filter(f=>f.flight.progress>.64&&f.flight.progress<.8);
  assert(travel.at(-1).t-travel[0].t>=6400);assert(dissolving.some(f=>f.flight.dissolve>.2&&f.opacity<.9),'visible material transfer');assert(travel.some(f=>f.flight.progress>.80&&f.opacity===0),'cursor fully joins particles');assert(travel[0].fragmentCount>100);
  for(let i=1;i<frames.length;i++){const a=frames[i-1],b=frames[i];if(b.t-a.t<30&&a.opacity>.2&&b.opacity>.2)assert(Math.hypot(a.cursor.x-b.cursor.x,a.cursor.y-b.cursor.y)<75,'no visible cursor teleport');}
  const picture=await p.screenshot();const phase=await p.evaluate(()=>PulsarScene.stats.rotation);await p.waitForTimeout(850);assert(!picture.equals(await p.screenshot()),'final remains alive');assert(await p.evaluate(()=>PulsarScene.stats.rotation)>phase);
  await p.screenshot({path:path.join(ev,`pulsar-final-${width}.png`)});
  await p.locator('#pulsar-pause').click();assert(!await p.evaluate(()=>PulsarScene.active));const paused=await p.screenshot();await p.waitForTimeout(300);assert(paused.equals(await p.screenshot()),'pause is pixel stable');await p.locator('#pulsar-pause').click();assert(await p.evaluate(()=>PulsarScene.active));
  await go(29);assert.deepEqual(await snap(),expected[29],'exact restoration after reverse');assert(!await p.evaluate(()=>PulsarScene.active));
  await go(34,{replay:true});assert(await p.evaluate(()=>PulsarScene.active));await p.evaluate(()=>DEMO.setReduced(true));assert(!await p.evaluate(()=>PulsarScene.active));await go(34,{replay:true,instant:true});assert.deepEqual(await snap(),expected[34],'reproducible still final');
  await p.waitForTimeout(280);await p.keyboard.press('Home');await p.waitForFunction(()=>!DEMO.busy);assert.deepEqual(await snap(),expected[0],'Home clears final loop and restores initial sky');
  await p.waitForTimeout(280);await p.keyboard.press('End');await p.waitForFunction(()=>!DEMO.busy);assert.equal(await p.evaluate(()=>DEMO.step),34);
  await p.locator('#controls-toggle').click();await p.locator('#toc-open').click();await p.locator('#toc-items [data-step="0"]').click();await p.waitForFunction(()=>!DEMO.busy);assert.deepEqual(await snap(),expected[0]);
  const draw=travel.map(f=>f.drawMs).sort((a,b)=>a-b);metrics.push({width,flightMs:travel.at(-1).t-travel[0].t,fragments:travel[0].fragmentCount,drawP95:draw[Math.floor(draw.length*.95)],maxStarTrails:Math.max(...travel.map(f=>f.star.streaks)),journey});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);const report={htmlSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(out,'Almanion.html'))).digest('hex'),viewports:[1920,1366],offline:true,monotonicApproach:true,continuousFinal:true,cursorDissolution:true,reverse:true,replay:true,pause:true,reduced:true,home:true,end:true,outline:true,errors,requests,metrics};fs.writeFileSync(path.join(ev,'pulsar-verification.json'),JSON.stringify(report,null,2));console.log('PASS: gradual approach, 6.6s flight, cursor dissolution, live pulsar, pause, reverse/replay, reduced motion, Home/End, outline, offline, both resolutions.');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
