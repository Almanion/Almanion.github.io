const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const out=path.resolve(__dirname,'../..'),ev=path.join(out,'evidence-v2');
async function go(p,s,o={}){await p.waitForTimeout(260);assert.equal(await p.evaluate(([s,o])=>DEMO.go(s,o),[s,o]),true);}
async function snap(p){return p.evaluate(()=>{const d=DEMO.frames.physics.contentDocument,w=d.defaultView;return{step:DEMO.step,topic:d.querySelector('.exp-reader-current').id,count:d.querySelector('.exp-reader-count').textContent,pose:DEMO.pose,cursor:DEMO.cursor,scroll:w.scrollY,dark:d.body.classList.contains('exp-dark'),colors:['.settings-modal-content','.design-mode-option.active','.exp-mode-card.active'].map(s=>w.getComputedStyle(d.querySelector(s)).backgroundColor)}});}
(async()=>{const b=await chromium.launch({channel:'msedge'});try{
 const p=await b.newPage({viewport:{width:1920,height:1080}}),errors=[],requests=[];
 p.on('pageerror',e=>errors.push(e.message));await p.route(/^https?:/,r=>{requests.push(r.request().url());r.abort()});await p.context().setOffline(true);
 await p.goto('file:///'+path.join(out,'Almanion.html').replace(/\\/g,'/'));await p.waitForFunction(()=>window.DEMO);
 const samples=[];
 for(const width of [1920,1366]){
  await p.setViewportSize({width,height:width===1920?1080:768});await go(p,4,{instant:true});await go(p,5);
  const search=await p.evaluate(()=>{const d=DEMO.frames.physics.contentDocument;return{query:d.querySelector('#searchInput').value,results:[...d.querySelectorAll('.search-result-meta strong')].map(n=>n.textContent),count:d.querySelector('.site-search-count').textContent};});
  assert.equal(search.query,'погрешности');assert.equal(search.results[0],'2.2 Погрешности измерений');assert.equal(search.results.length,3);
  await p.screenshot({path:path.join(ev,`search-other-section-${width}.png`)});await go(p,6);const found=await snap(p);assert.equal(found.topic,'pogreshnosti-izmereniy');assert.equal(found.count,'11 / 13');assert(await p.evaluate(()=>DEMO.frames.physics.contentDocument.querySelectorAll('#pogreshnosti-izmereniy .katex').length>=4),'rendered math in new topic');
  await p.screenshot({path:path.join(ev,`search-destination-${width}.png`)});await go(p,6,{replay:true});assert.deepEqual(await snap(p),found);
  await go(p,7);const light=await snap(p);await p.screenshot({path:path.join(ev,`theme-light-${width}.png`)});
  for(const [target,direction] of [[8,'dark'],[7,'light']]){
   await p.waitForTimeout(270);await p.evaluate(t=>{window.themeFrames=[];window.themeRead=setInterval(()=>{if(!document.getElementById('stage').dataset.themeTransition)return;const d=DEMO.frames.physics.contentDocument,w=d.defaultView,c=document.createElement('canvas').getContext('2d');const colors=['.settings-modal-content','.design-mode-option.active','.exp-mode-card.active'].map(s=>{const value=w.getComputedStyle(d.querySelector(s)).backgroundColor;c.clearRect(0,0,1,1);c.fillStyle=value;c.fillRect(0,0,1,1);return [...c.getImageData(0,0,1,1).data];});themeFrames.push(colors);},35);window.themeAction=DEMO.go(t);},target);
   await p.waitForFunction(()=>document.getElementById('stage').dataset.themeTransition);
   await p.waitForTimeout(430);await p.screenshot({path:path.join(ev,`theme-${direction}-mid-${width}.png`)});
   await p.evaluate(()=>themeAction);const rows=await p.evaluate(()=>{clearInterval(themeRead);return themeFrames;});
   assert(rows.length>=5);assert(new Set(rows.map(n=>n[0].join())).size>4);
   for(const row of rows)assert(row[1][0]>=30,'color(srgb) must not flash near black');
   const end=await snap(p);assert.equal(end.dark,direction==='dark');if(target===7)assert.deepEqual(end,light,'reverse restores exact state');
   assert.equal(await p.evaluate(()=>DEMO.frames.physics.contentDocument.getAnimations().filter(a=>a.playState==='running'||a.playState==='paused').length),0,'no theme animations left');
   samples.push({width,direction,frames:rows.length,colors:rows});
  }
  await go(p,8,{replay:true});await p.screenshot({path:path.join(ev,`theme-dark-${width}.png`)});
  const dark=await snap(p);await go(p,9);assert.equal((await snap(p)).topic,'pogreshnosti-izmereniy');
  await go(p,8,{instant:true});assert.deepEqual(await snap(p),dark,'outline restoration');await go(p,7,{instant:true});assert.deepEqual(await snap(p),light);
  await p.evaluate(()=>DEMO.setReduced(true));await go(p,8);assert.deepEqual(await snap(p),dark,'reduced motion');await p.evaluate(()=>DEMO.setReduced(false));
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 fs.writeFileSync(path.join(ev,'search-theme-verification.json'),JSON.stringify({htmlSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(out,'Almanion.html'))).digest('hex'),query:'погрешности',destination:'pogreshnosti-izmereniy',results:3,forward:true,reverse:true,replay:true,outline:true,reducedMotion:true,offline:true,viewports:[1920,1366],errors,requests,samples},null,2));
 console.log('PASS: real alternate search, topic navigation, native color interpolation, light/dark reverse, replay, outline, reduced motion, offline, two resolutions.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
