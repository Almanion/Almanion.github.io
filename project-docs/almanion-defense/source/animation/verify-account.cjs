const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const out=path.resolve(__dirname,'../..'),ev=path.join(out,'evidence-v2');
(async()=>{const b=await chromium.launch({channel:'msedge'});try{
 const p=await b.newPage(),errors=[],requests=[];p.on('pageerror',e=>errors.push(e.message));await p.route(/^https?:/,r=>{requests.push(r.request().url());r.abort()});await p.context().setOffline(true);
 const go=async(s,o={})=>{await p.waitForTimeout(260);assert(await p.evaluate(([s,o])=>DEMO.go(s,o),[s,o]));};
 const snap=()=>p.evaluate(()=>({step:DEMO.step,index:DEMO.index,pose:DEMO.pose,cursor:DEMO.cursor,scroll:doc().defaultView.scrollY,overlay:{html:find('#accountOverlay').innerHTML,hidden:find('#accountOverlay').hidden,classes:find('#accountOverlay').className},inputs:[...doc().querySelectorAll('#accountOverlay input')].map(n=>[n.id,n.value,n.type]),avatar:find('#accountBtn').outerHTML,panel:$('account-story').innerHTML,visible:$('account-story').style.visibility}));
 for(const width of [1920,1366]){
  await p.setViewportSize({width,height:width===1920?1080:768});await p.goto('file:///'+path.join(out,'Almanion.html').replace(/\\/g,'/'));await p.waitForFunction(()=>window.DEMO);
  assert.deepEqual(await p.evaluate(()=>DEMO.order.slice(9,14)),[9,30,31,32,10]);const expected={};
  assert(await p.evaluate(()=>DEMO.frames.home.contentDocument.getElementById('homeQuickCustomize').hidden),'guest cannot customize quick access');
  for(const s of [9,30,31,32,10]){await go(s,{instant:true});expected[s]=await snap();}
  await go(9,{instant:true});
  for(const s of [30,31,32,10]){
   await p.waitForTimeout(270);await p.keyboard.press('ArrowRight');await p.waitForFunction(()=>!DEMO.busy);assert.equal(await p.evaluate(()=>DEMO.step),s);if(s===10)assert.equal(await p.evaluate(()=>DEMO.frames.home.contentDocument.getElementById('homeQuickCustomize').hidden),false);assert.deepEqual(await snap(),expected[s],'forward checkpoint '+s);
   if(s>=30){await p.screenshot({path:path.join(ev,`account-${s}-${width}.png`)});const geom=await p.evaluate(()=>({modal:box('#accountOverlay .auth-modal'),pose:DEMO.pose,cursor:DEMO.cursor,panel:[...$('account-story').children].map(n=>({bottom:n.getBoundingClientRect().bottom/scale-(innerHeight/scale-1080)/2}))}));assert(geom.modal.x>=geom.pose.x&&geom.modal.x+geom.modal.w<=geom.pose.x+geom.pose.w,'modal width');assert(geom.modal.y>=geom.pose.y+42&&geom.modal.y+geom.modal.h<geom.pose.y+geom.pose.h,'modal height');assert(geom.cursor.x>geom.modal.x+geom.modal.w+15,'cursor clears form');assert(geom.panel.every(n=>n.bottom<950),'explanation fits');}
  }
  for(const s of [32,31,30,9]){await p.waitForTimeout(270);await p.keyboard.press('ArrowLeft');if(s===32)await p.waitForFunction(()=>document.querySelector('.navigation-portal')?.dataset.direction==='in');await p.waitForFunction(()=>!DEMO.busy);assert.deepEqual(await snap(),expected[s],'back '+s);}
  for(const s of [30,31,32,10]){await go(s,{replay:true});assert.deepEqual(await snap(),expected[s],'replay '+s);}
  await p.evaluate(()=>DEMO.setReduced(true));for(const s of [9,30,31,32,10]){await go(s);assert.deepEqual(await snap(),expected[s],'reduced '+s);}
  await p.evaluate(()=>DEMO.setReduced(false));await p.waitForTimeout(270);await p.locator('#toc-open').click();assert.equal(await p.locator('#toc-items button').count(),33);await p.locator('[data-step="31"]').click();await p.waitForFunction(()=>!DEMO.busy);assert.deepEqual(await snap(),expected[31]);
  await go(9,{instant:true});await p.waitForTimeout(270);await p.locator('#next').dblclick();await p.waitForFunction(()=>!DEMO.busy);assert.equal(await p.evaluate(()=>DEMO.step),30);
  const frozen=await snap();await p.waitForTimeout(400);assert.deepEqual(await snap(),frozen);assert.equal(await p.evaluate(()=>Cosmos.active||document.getAnimations().some(a=>a.playState==='running')),false);
 }
 const actions=await p.evaluate(()=>DEMO.actionLog);for(const a of actions){assert(a.point.x>=a.rect.x&&a.point.x<=a.rect.x+a.rect.w&&a.point.y>=a.rect.y&&a.point.y<=a.rect.y+a.rect.h,a.selector);assert(a.point.x>=a.pose.x&&a.point.x<=a.pose.x+a.pose.w&&a.point.y>=a.pose.y+42&&a.point.y<=a.pose.y+a.pose.h,'visible click '+a.selector)}
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);const report={htmlSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(out,'Almanion.html'))).digest('hex'),states:33,route:[9,30,31,32,10],viewports:[1920,1366],forward:true,back:true,replay:true,outline:true,reduced:true,offline:true,stationary:true,nativeRegistration:true,noRealAccount:true,errors,requests};fs.writeFileSync(path.join(ev,'account-verification.json'),JSON.stringify(report,null,2));console.log('PASS: native registration, account explanation, 33-stop route, forward/back/replay/outline, input guards, offline, reduced motion, both resolutions.');
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
