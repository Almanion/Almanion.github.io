const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const out=path.resolve(__dirname,'../..'),ev=path.join(out,'evidence-v2');
(async()=>{const b=await chromium.launch({channel:'msedge'});try{
 const p=await b.newPage(),errors=[],requests=[],measurements=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route(/^https?:/,r=>{requests.push(r.request().url());r.abort()});await p.context().setOffline(true);
 const go=async(s,options={})=>{await p.waitForTimeout(260);assert(await p.evaluate(([s,o])=>DEMO.go(s,o),[s,options]));};
 const snapshot=()=>p.evaluate(()=>({step:DEMO.step,cursor:DEMO.cursor,pose:DEMO.pose,scroll:doc().defaultView.scrollY,focus:$('focus').style.opacity==='1'?$('focus').getAttribute('style'):'hidden',query:find('#searchInput')?.value}));
 for(const width of [1920,1366]){
  await p.setViewportSize({width,height:width===1920?1080:768});await p.goto('file:///'+path.join(out,'Almanion.html').replace(/\\/g,'/'));await p.waitForFunction(()=>window.DEMO);
  const expected={};for(let s=1;s<=5;s++){
   await go(s,{instant:true});expected[s]=await snapshot();
   const geometry=await p.evaluate(()=>{const s=DEMO.step,c=DEMO.cursor,p=DEMO.pose,r=s===1?box('#gradePanel10 a[href="physics-10.html"]'):s===2||s===3?OpeningGuidance.ink(s===2?'h1':'#'+TOPIC+' h3'):s===4?box(FORMULA+' .base'):box('.search-result-item');return{s,c,p,r,formula:s===5?box(FORMULA+' .base'):null}});
   assert(geometry.c.x>geometry.p.x&&geometry.c.x<geometry.p.x+geometry.p.w&&geometry.c.y>geometry.p.y+42&&geometry.c.y<geometry.p.y+geometry.p.h,'cursor stays in the presentation window');
   if(s===1)assert(geometry.c.x>geometry.r.x+geometry.r.w*.75&&geometry.c.x<geometry.r.x+geometry.r.w,'card whitespace');
   else assert(geometry.c.x>geometry.r.x+geometry.r.w+20,'cursor leaves the text/result clear '+s);
   if(s===4)assert(geometry.c.y>geometry.r.y+geometry.r.h+15);
   if(s===5)assert(geometry.formula.y>geometry.p.y+42&&geometry.formula.y+geometry.formula.h<geometry.p.y+geometry.p.h,'search keeps the equation visible');
  }
  await go(0,{instant:true});
  for(let s=1;s<=5;s++){
   await p.waitForTimeout(270);await p.evaluate(s=>{window.guidedFrames=[];window.guidedRun=DEMO.go(s);function sample(t){guidedFrames.push({t,...DEMO.cursor,opacity:Number($('cursor').style.opacity||1)});if(DEMO.busy)requestAnimationFrame(sample)}requestAnimationFrame(sample)},s);
   await p.waitForTimeout(s===2?1200:700);await p.screenshot({path:path.join(ev,`guided-${s}-mid-${width}.png`)});await p.evaluate(()=>guidedRun);
   assert.deepEqual(await snapshot(),expected[s],'animated/restored state '+s);
   const frames=await p.evaluate(()=>guidedFrames),jumps=frames.slice(1).filter((f,i)=>f.t-frames[i].t<25&&f.opacity>.4&&frames[i].opacity>.4&&Math.hypot(f.x-frames[i].x,f.y-frames[i].y)>90);
   assert.deepEqual(jumps,[],'no visible teleport '+s);
   await p.screenshot({path:path.join(ev,`guided-${s}-stop-${width}.png`)});const frozen=await snapshot();await p.waitForTimeout(300);assert.deepEqual(await snapshot(),frozen,'stationary pause');
   measurements.push({width,step:s,samples:frames.length,cursor:frozen.cursor});
  }
  for(let s=4;s>=1;s--){await go(s);assert.deepEqual(await snapshot(),expected[s],'back '+s);}
  for(let s=1;s<=5;s++){await go(s,{replay:true});assert.deepEqual(await snapshot(),expected[s],'replay '+s);}
  await p.evaluate(()=>DEMO.setReduced(true));await go(0);
  for(let s=1;s<=5;s++){
   await go(s);assert.deepEqual(await snapshot(),expected[s],'reduced motion '+s);
   assert.equal(await p.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length),0);
  }
  await p.evaluate(()=>DEMO.setReduced(false));
  assert.equal(await p.evaluate(()=>Cosmos.active||Cosmos.particleCount>0),false);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 fs.writeFileSync(path.join(ev,'first-five-verification.json'),JSON.stringify({htmlSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(out,'Almanion.html'))).digest('hex'),viewports:[1920,1366],forward:true,backward:true,replay:true,reducedMotion:true,stationaryPauses:true,textClearance:true,searchKeepsEquation:true,noVisibleTeleport:true,offline:true,measurements,errors,requests},null,2));
 console.log('PASS: five guided transitions, deliberate cursor stops, text clearance, no visible teleport, back/replay, offline, both viewports.');
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
