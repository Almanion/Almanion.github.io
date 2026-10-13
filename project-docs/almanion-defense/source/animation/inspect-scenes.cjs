const {chromium}=require('playwright'),fs=require('fs'),path=require('path');
const out=path.resolve(__dirname,'../..');
(async()=>{const b=await chromium.launch({channel:'msedge'}),p=await b.newPage({viewport:{width:1920,height:1080}});
 await p.goto('file:///'+path.join(out,'Almanion.html').replace(/\\/g,'/'));await p.waitForFunction(()=>window.DEMO);
 for(const s of [2,3,4]){await p.waitForTimeout(260);await p.evaluate(s=>DEMO.go(s,{instant:true}),s);await p.screenshot({path:path.join(out,`evidence-v2/before-scene-${s}.png`)});}
 console.log('geometry',await p.evaluate(()=>{const d=DEMO.frames.physics.contentDocument;return{pose:DEMO.pose,sidebar:d.querySelector('.sidebar').textContent.slice(-1800),topic:d.querySelector('#temperatura-i-uravnenie-sostoyaniya').textContent.slice(0,1600)}}));
 await p.setViewportSize({width:1440,height:810});await p.goto('https://almanion.github.io/',{waitUntil:'domcontentloaded'});await p.waitForTimeout(1800);await p.screenshot({path:path.join(out,'evidence-v2/live-home-stars.png')});
 const live=await p.evaluate(()=>{const c=document.querySelector('.home-starfield');return{url:location.href,state:window.AlmanionHomeStars?.getState(),canvas:c?.outerHTML,style:c?{color:getComputedStyle(c).color,position:getComputedStyle(c).position,zIndex:getComputedStyle(c).zIndex}:null,scripts:[...document.scripts].map(s=>s.src).filter(s=>s.includes('home-stars'))}});console.log('live',live);
 if(live.scripts[0]){const bytes=await(await p.request.get(live.scripts[0])).body();fs.writeFileSync(path.join(out,'source/reference/home-stars.js'),bytes);}
 fs.writeFileSync(path.join(out,'evidence-v2/live-home-stars.json'),JSON.stringify(live,null,2));await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
