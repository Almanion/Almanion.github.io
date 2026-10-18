/* Focused regression and visual-QA evidence for slides 19–31 (steps 15–27).
   Run after build.cjs. Artifacts stay in .qa; historical evidence is untouched. */
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'../../../..');
const out=path.resolve(__dirname,'../..');
const evidence=path.join(root,'.qa','presentation-explanations');
const steps=Array.from({length:13},(_,i)=>i+15);
const html=fs.readFileSync(path.join(out,'Almanion.html'));
assert(html.equals(fs.readFileSync(path.join(root,'presentation/index.html'))),'standalone and published HTML are byte-identical');
assert(html.length<=5*1024*1024,`autonomous HTML exceeds 5 MiB: ${html.length}`);
const excerpts=require('./fsrs-excerpts.cjs');
const canonical=v=>v.replace(/\r\n/g,'\n').trim().split('\n').map(l=>l.trim()).join('\n');
const citations=[];
for(const key of ['selection','extraction','rating','state','retention','schedule','save','confirmations']){
 const excerpt=excerpts[key];assert(excerpt,`missing excerpt ${key}`);
 assert(excerpt.code&&excerpt.file&&excerpt.fn&&Number.isInteger(excerpt.startLine)&&Number.isInteger(excerpt.endLine),`complete source attribution ${key}`);
 const file=path.resolve(__dirname,'../reference',excerpt.file);assert(file.startsWith(path.resolve(__dirname,'../reference')+path.sep),`source path stays within pinned reference ${key}`);
 const lines=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n').split('\n');
 assert(excerpt.startLine>0&&excerpt.endLine>=excerpt.startLine&&excerpt.endLine<=lines.length,`valid source range ${key}`);
 assert(canonical(lines.slice(excerpt.startLine-1,excerpt.endLine).join('\n')).includes(canonical(excerpt.code)),`verbatim source excerpt ${key}`);
 citations.push({key,file:excerpt.file,fn:excerpt.fn,startLine:excerpt.startLine,endLine:excerpt.endLine});
}
fs.mkdirSync(evidence,{recursive:true});

(async()=>{const browser=await chromium.launch({channel:'msedge',timeout:20000});try{
 const p=await browser.newPage(),errors=[],requests=[],measurements=[],compositionIssues=[],displayed=new Set();
 p.on('pageerror',e=>errors.push(e.stack||e.message));
 await p.route(/^https?:/,r=>{requests.push(r.request().url());r.abort()});await p.context().setOffline(true);
 const go=async(s,o={})=>{await p.waitForTimeout(260);if(await p.evaluate(()=>DEMO.step)===s&&!o.replay)return;assert(await p.evaluate(([s,o])=>DEMO.go(s,o),[s,o]),`accepted navigation to ${s}`)};
 const snap=()=>p.evaluate(()=>({step:DEMO.step,index:DEMO.index,pose:DEMO.pose,cursor:DEMO.cursor,
  panel:document.getElementById('panel').textContent.replace(/\s+/g,' ').trim(),
  children:[...document.getElementById('panel').children].map(n=>({id:n.id,display:getComputedStyle(n).display})),
  graph:document.getElementById('graph').innerHTML,
  focus:document.getElementById('focus').style.opacity==='1'?document.getElementById('focus').getAttribute('style'):'hidden',
  page:currentPage,scroll:doc().defaultView.scrollY,body:doc().body.className,
  busy:DEMO.busy,cosmos:Cosmos.active,particles:Cosmos.particleCount}));
 const geometry=()=>p.evaluate(()=>{
  const panel=document.getElementById('panel'),owner=document.getElementById('model-owner'),stage=document.getElementById('stage'),pr=panel.getBoundingClientRect(),or=owner.getBoundingClientRect(),sr=stage.getBoundingClientRect(),unit=sr.width/1920;
  const rect=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
  const visible=n=>{const cs=getComputedStyle(n),r=n.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0};
  const nodes=[...panel.children].filter(visible),body=nodes.filter(n=>n!==owner),bad=[],overlap=[];
  for(const n of nodes){const r=n.getBoundingClientRect();if(r.left<pr.left-unit||r.right>pr.right+unit||r.top<pr.top-unit||r.bottom>pr.bottom+unit)bad.push({id:n.id||n.className,rect:rect(n),reason:'outside panel'});if(n!==owner&&r.bottom>or.top-7*unit)bad.push({id:n.id||n.className,rect:rect(n),reason:'owner footer clearance'});if(n.scrollWidth>n.clientWidth+2&&!['graph','formula'].includes(n.id))bad.push({id:n.id||n.className,reason:'horizontal overflow',scrollWidth:n.scrollWidth,clientWidth:n.clientWidth});}
  for(let i=0;i<body.length;i++)for(let j=i+1;j<body.length;j++){const a=body[i].getBoundingClientRect(),b=body[j].getBoundingClientRect();if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>2*unit&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2*unit)overlap.push([body[i].id||body[i].className,body[j].id||body[j].className]);}
  const site=document.getElementById('site').getBoundingClientRect(),caption=document.getElementById('caption').getBoundingClientRect();
  if(site.right>pr.left-20*unit)bad.push({reason:'site/panel gap',siteRight:site.right,panelLeft:pr.left});
  if(caption.width&&caption.top<Math.max(pr.bottom,DEMO.step>=19?site.bottom:0)+12*unit)bad.push({reason:'caption clearance',captionTop:caption.top,panelBottom:pr.bottom,siteBottom:site.bottom});
  const style=getComputedStyle(panel),heading=getComputedStyle(document.getElementById('panel-title'));
  return{step:DEMO.step,index:DEMO.index,panel:rect(panel),owner:rect(owner),bad,overlap,headingSize:parseFloat(heading.fontSize),codeSize:visible(document.getElementById('code'))?parseFloat(getComputedStyle(document.getElementById('code')).fontSize):null,background:style.backgroundColor,border:style.borderTopWidth,shadow:style.boxShadow,unit};
 });
 for(const width of [1920,1366]){
  await p.setViewportSize({width,height:width===1920?1080:768});await p.goto('file:///'+path.join(out,'Almanion.html').replace(/\\/g,'/'));await p.waitForFunction(()=>window.DEMO);
  assert.equal(await p.evaluate(()=>DEMO.order.length),35,'managed state count');assert.deepEqual(await p.evaluate(()=>FSRS_EXCERPTS),excerpts,'embedded excerpts match the verified source');
  const expected={};for(const s of steps){await go(s,{instant:true});expected[s]=await snap();await p.screenshot({path:path.join(evidence,`slide-${s+4}-step-${s}-${width}.png`)});assert.equal(expected[s].index,s+4,`UI slide ${s+4} maps to step ${s}`);const m=await geometry();if(m.bad.length||m.overlap.length)compositionIssues.push({width,step:s,bad:m.bad,overlap:m.overlap});assert(m.headingSize>=44,`clear editorial heading ${s}/${width}`);if(m.codeSize!==null)assert(m.codeSize>=22,`readable source code ${s}/${width}`);assert(m.background==='rgba(0, 0, 0, 0)'&&m.border==='0px'&&m.shadow==='none',`unboxed explanation style ${s}/${width}`);measurements.push({width,...m});fs.writeFileSync(path.join(evidence,'all-geometry.json'),JSON.stringify(measurements,null,2));
   const shown=await p.evaluate(()=>{const n=document.getElementById('code');if(getComputedStyle(n).display==='none')return null;return{key:n.dataset.excerpt||n.dataset.key||null,text:n.querySelector('code')?.textContent,label:n.querySelector('.code-source')?.textContent}});
   if(shown){const keys=shown.key?[shown.key]:Object.keys(excerpts).filter(key=>shown.text.includes(excerpts[key].code));assert(keys.length,`visible real source excerpt ${s}`);for(const key of keys){assert.equal(shown.text,excerpts[key].code,`rendered excerpt exactly matches ${key}`);assert(shown.label.includes(excerpts[key].file)&&shown.label.includes(excerpts[key].fn)&&shown.label.includes(String(excerpts[key].startLine))&&shown.label.includes(String(excerpts[key].endLine)),`visible source attribution ${key}`);displayed.add(key);}}
  }
  console.log('Captured and checked all explanation states',width);
  await go(14,{instant:true});
  for(const s of steps){await go(s);assert.deepEqual(await snap(),expected[s],`animated forward restores state ${s}/${width}`);}
  for(const s of steps.slice(0,-1).reverse()){await go(s);assert.deepEqual(await snap(),expected[s],`back restores state ${s}/${width}`);}
  for(const s of steps){await go(s,{replay:true});assert.deepEqual(await snap(),expected[s],`replay restores state ${s}/${width}`);}
  console.log('PASS animated forward, backward and replay',width);
  await p.evaluate(()=>DEMO.setReduced(true));await go(14);
  for(const s of steps){await go(s);assert.deepEqual(await snap(),expected[s],`reduced motion restores state ${s}/${width}`);assert.equal(await p.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length),0,`no running motion ${s}/${width}`);}
  for(const s of [15,20,24,27]){await go(s);const before=await p.screenshot();await p.waitForTimeout(350);const after=await p.screenshot();assert(before.equals(after),`stationary presentation pause ${s}/${width}`);}
  await go(29);assert(await p.evaluate(()=>{const n=document.getElementById('final'),cs=getComputedStyle(n);return !n.textContent.trim()&&n.hidden&&n.getAttribute('aria-hidden')==='true'&&(cs.display==='none'||cs.visibility==='hidden'||Number(cs.opacity)===0)}),'summary plaque removed from penultimate state');await p.screenshot({path:path.join(evidence,`penultimate-${width}.png`)});
  await go(34);assert(!/Найти\.\s*Разобраться\.\s*Повторить\./.test(await p.locator('#pulsar-ending').innerText()),'slogan removed from final state');assert.equal(await p.locator('#pulsar-ending h2').innerText(),'Almanion');await p.screenshot({path:path.join(evidence,`ending-${width}.png`)});
  await p.evaluate(()=>DEMO.setReduced(false));console.log('PASS explanations, navigation and final states',width);
 }
 assert.deepEqual([...displayed].sort(),Object.keys(excerpts).sort(),'every verified source excerpt appears in the presentation');
 assert.deepEqual(errors,[],'no JavaScript errors');assert.deepEqual(requests,[],'no external requests while offline');
 assert(html.equals(fs.readFileSync(path.join(out,'Almanion.html')))&&html.equals(fs.readFileSync(path.join(root,'presentation/index.html'))),'the tested build did not change during verification');
 fs.writeFileSync(path.join(evidence,'verification.json'),JSON.stringify({htmlSha256:crypto.createHash('sha256').update(html).digest('hex'),htmlBytes:html.length,viewports:[1920,1366],citations,forward:true,backward:true,replay:true,reducedMotion:true,stationaryPauses:true,unboxedExplanations:true,offline:true,identicalBuildCopies:true,measurements,compositionIssues,errors,requests},null,2));
 assert.deepEqual(compositionIssues,[],'all explanation blocks fit without overlap at both viewports');
 console.log('PASS: slides 19–31, source excerpts, composition, forward/back/replay/reduced motion, offline and final cleanup.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
