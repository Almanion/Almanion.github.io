const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const out=path.resolve(__dirname,'../..');
(async()=>{const b=await chromium.launch({channel:'msedge'}),p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.context().setOffline(true);
const snapshot=()=>p.evaluate(()=>({step:DEMO.step,pose:DEMO.pose,cursor:DEMO.cursor,opening:[...document.querySelector('#opening').children].map(n=>[n.style.opacity,n.style.transform]),focus:document.querySelector('#focus').style.opacity==='1'?document.querySelector('#focus').getAttribute('style'):'hidden',physics:{theme:DEMO.frames.physics.contentDocument.body.className,review:DEMO.frames.physics.contentDocument.getElementById('kcReviewOverlay').hidden,topic:DEMO.frames.physics.contentDocument.querySelector('.exp-reader-current').id}}));
const go=async(s,o={})=>{await p.waitForTimeout(270);assert(await p.evaluate(([s,o])=>DEMO.go(s,o),[s,o]));};
for(const width of [1920,1366]){
 await p.setViewportSize({width,height:width===1920?1080:768});await p.goto('file:///'+path.join(out,'Almanion.html').replace(/\\/g,'/'));await p.waitForFunction(()=>window.DEMO);await p.screenshot({path:path.join(out,'evidence-v2',`opening-1-${width}.png`)});const initial=await snapshot();
 await go(33);await go(1);const second=await snapshot();await p.screenshot({path:path.join(out,'evidence-v2',`opening-2-${width}.png`)});
 await p.waitForTimeout(270);await p.evaluate(()=>{window.flight=DEMO.go(2)});await p.waitForFunction(()=>Number(document.querySelector('.physics-portal')?.dataset.progress)>.42);
 assert(await p.evaluate(()=>{const d=document.querySelector('.portal-document iframe').contentDocument;return !d.body.classList.contains('exp-dark')&&d.getElementById('kcReviewOverlay').hidden&&d.querySelector('.sidebar')}),'portal contains actual light physics document');
 await p.screenshot({path:path.join(out,'evidence-v2',`opening-flight-${width}.png`)});await p.evaluate(()=>flight);const third=await snapshot();

 assert(await p.evaluate(()=>DEMO.frames.physics.parentElement.id==='camera'&&DEMO.frames.physics.contentDocument.getElementById('kcReviewOverlay').hidden));
 await p.screenshot({path:path.join(out,'evidence-v2',`opening-3-${width}.png`)});
 await go(1);assert.deepEqual(await snapshot(),second,'restore second');await go(0);assert.deepEqual(await snapshot(),initial,'restore intro');
 await go(1,{instant:true});assert.deepEqual(await snapshot(),second,'reduced opening');await go(2,{instant:true});assert.deepEqual(await snapshot(),third,'reduced portal');await go(2,{replay:true});assert.deepEqual(await snapshot(),third,'portal replay');
 assert.equal(await p.locator('.physics-portal').count(),0);assert(!await p.evaluate(()=>Cosmos.active));
}
assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'evidence-v2/opening-verification.json'),JSON.stringify({htmlSha256:require('crypto').createHash('sha256').update(fs.readFileSync(path.join(out,'Almanion.html'))).digest('hex'),viewports:[1920,1366],opening:true,physicsPortal:true,replay:true,backward:true,reducedMotion:true,offline:true,errors},null,2));await b.close();console.log('PASS: first two scenes, physics portal content, animated/reduced equivalence, replay, backwards, offline, two sizes.');
})().catch(e=>{console.error(e.message.slice(0,1800));process.exit(1)});
