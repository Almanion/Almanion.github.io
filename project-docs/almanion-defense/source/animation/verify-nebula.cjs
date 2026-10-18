/* Camera / cursor travel, complete-route cleanup and reproducible checkpoints. */
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'../../../..'),out=path.resolve(__dirname,'../..'),ev=path.join(root,'.qa/nebula');
(async()=>{fs.mkdirSync(ev,{recursive:true});const browser=await chromium.launch({channel:'msedge'});try{
 const p=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],requests=[];p.on('pageerror',e=>errors.push(e.stack));await p.route(/^https?:/,r=>{requests.push(r.request().url());r.abort()});await p.context().setOffline(true);
 await p.goto('file:///'+path.join(out,'Almanion.html').replace(/\\/g,'/'));await p.waitForFunction(()=>window.DEMO);
 const go=async(s,options={instant:true})=>{await p.waitForTimeout(270);if(await p.evaluate(()=>DEMO.step)===s&&!options.replay)return;assert(await p.evaluate(([s,o])=>DEMO.go(s,o),[s,options]));};
 const snapshot=()=>p.evaluate(()=>({step:DEMO.step,pose:DEMO.pose,cursor:DEMO.cursor,sky:$('cosmos').toDataURL(),clouds:$('learning-nebulae').toDataURL(),text:$('panel').textContent,visibility:getComputedStyle($('site')).visibility,nebulaActive:$('stage').dataset.nebulaActive}));
 const order=await p.evaluate(()=>DEMO.order);assert.equal(order.length,43);const expected={};
 for(const s of order){await go(s);assert.equal(await p.locator('#caption').isVisible(),false,'no lower captions '+s);assert.equal(await p.locator('#account-site-label').isVisible(),false);expected[s]=await snapshot();}
 await go(31);assert(!/вымышлен|локальная демонстрация|учебный профиль/.test(await p.locator('#account-story').innerText()),'account copy cleanup');
 await go(15);const intro=await p.evaluate(()=>({clouds:NebulaJourney.stats.clouds,button:DEMO.frames.physics.contentDocument.getElementById('knowledgeCheckBtn').textContent.trim(),nodes:NebulaJourney.nodes.length}));assert.equal(intro.clouds,3);assert.equal(intro.button,'Учить');assert.equal(intro.nodes,20);
 const trips=[];
 for(const pair of [[15,16],[17,35],[24,38],[27,41]])for(const [from,to] of [pair,[...pair].reverse()]){
  await go(from);await p.waitForTimeout(270);await p.evaluate(to=>{window.trace=[];window.travelRun=DEMO.go(to);const take=()=>{if(NebulaJourney.travelling){const s=NebulaJourney.stats;trace.push({...s.flight,starCamera:Cosmos.telemetry.camera,drawMs:s.drawMs});}if(DEMO.busy)requestAnimationFrame(take);};requestAnimationFrame(take);},to);
  await p.waitForFunction(()=>NebulaJourney.travelling&&+document.getElementById('stage').dataset.nebulaProgress>.43);await p.screenshot({path:path.join(ev,`travel-${from}-${to}.png`)});await p.evaluate(()=>travelRun);
  const frames=await p.evaluate(()=>trace);assert(frames.length>15,'camera has continuous frames');assert(frames.some(f=>f.progress>.35&&f.progress<.6&&f.copy<.02),'copy is concealed inside the cloud');assert(frames.some(f=>f.progress>.94&&f.copy>.85),'copy appears after entry');
  for(const f of frames){assert.deepEqual(f.camera,f.starCamera,'one shared camera');assert(Number.isFinite(f.cursor.x)&&Number.isFinite(f.cursor.y));assert(f.cursor.x>-50&&f.cursor.x<1970&&f.cursor.y>-50&&f.cursor.y<1130,'cursor stays on stage');}
  assert.deepEqual(await snapshot(),expected[to],`travel restores canonical state ${from}->${to}`);assert.equal(await p.evaluate(()=>Cosmos.active||NebulaJourney.travelling),false,'no background loop');
  trips.push({from,to,frames:frames.length,cameraFrom:frames[0].camera,cameraTo:frames.at(-1).camera,maxDrawMs:Math.max(...frames.map(f=>f.drawMs))});
 }
 for(const s of [15,35,36,38,39,42,41]){await go(s);const a=await p.screenshot();await p.waitForTimeout(350);assert(a.equals(await p.screenshot()),'still learning stop '+s);}
 await go(38);await p.evaluate(()=>DEMO.setReduced(true));await go(39,{});assert.deepEqual(await snapshot(),expected[39]);assert.equal(await p.evaluate(()=>NebulaJourney.travelling),false);
 await go(34);assert.equal(await p.locator('#pulsar-ending').isVisible(),true);assert.equal(await p.locator('#learning-nebulae').evaluate(n=>n.getContext('2d').getImageData(0,0,1920,1080).data.some((x,i)=>i%4===3&&x!==0)),false,'clouds cleared at ending');
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);const report={sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(out,'Almanion.html'))).digest('hex'),states:43,learningStops:21,intro,trips,sharedCamera:true,canonicalReturn:true,stationary:true,reducedMotion:true,offline:true,errors,requests};fs.writeFileSync(path.join(ev,'travel-verification.json'),JSON.stringify(report,null,2));console.log('PASS: 43 checkpoints, eight nebula flights, shared camera, cleanup, still pauses and reduced motion.');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
