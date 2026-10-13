/* The departure/arrival surfaces use the actual captured DOM, including
   viewport, theme and every scroll offset. No live site/network is involved. */
const pageForStep=s=>s<=1||s>=10&&s<=13||s===29?'home':'physics';
const navigationCache={};
async function initNavigationCache(){
 // Keep the frame roots attached: reparenting an iframe reloads its document.
 // The CSS/fonts are parsed once under the loading screen, not during a flight.
 for(const name of ['home','physics']){
  const root=document.createElement('div');root.className='navigation-cache';root.style.cssText='position:absolute;visibility:hidden;pointer-events:none';
  const content=document.createElement('div');content.className='navigation-content';
  const chrome=$('chrome').cloneNode(true);chrome.className='navigation-chrome';chrome.removeAttribute('id');chrome.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
  const viewport=document.createElement('div');viewport.className='navigation-viewport';
  const copy=document.createElement('iframe');copy.title='Переход между страницами';copy.setAttribute('sandbox','allow-same-origin');
  const ready=new Promise(resolve=>copy.onload=()=>{if(copy.contentDocument?.body?.id==='demo-offline')resolve()});
  viewport.append(copy);content.append(chrome,viewport);root.append(content);$('stage').append(root);
  copy.srcdoc='<!doctype html>'+frames[name].contentDocument.documentElement.outerHTML;
  await ready;await copy.contentDocument.fonts.ready;navigationCache[name]={root,content,copy,chrome};
 }
}
async function navigationSurface(){
 const original=doc(),f=frames[currentPage],saved={...pose},{root,content,copy,chrome}=navigationCache[currentPage];
 const offsets=[...original.querySelectorAll('*')].map(n=>[n.scrollLeft,n.scrollTop]);
 const target=copy.contentDocument;
 for(const a of [...target.documentElement.attributes])target.documentElement.removeAttribute(a.name);
 for(const a of original.documentElement.attributes)target.documentElement.setAttribute(a.name,a.value);
 target.body.replaceWith(target.importNode(original.body,true));
 root.className='navigation-surface';root.style.cssText='';Object.assign(root.style,{left:saved.x+'px',top:saved.y+'px',width:saved.w+'px',height:saved.h+'px',visibility:'hidden'});
 content.style.cssText='';Object.assign(content.style,{width:saved.w+'px',height:saved.h+'px'});
 chrome.children[chrome.children.length-2].textContent=$('address').textContent;
 Object.assign(copy.style,{width:f.style.width||'1440px',height:f.style.height||'810px',opacity:1,transformOrigin:'0 0',transform:`translate(${saved.tx}px,${saved.ty}px) scale(${saved.z})`});
 const nodes=target.querySelectorAll('*');offsets.forEach(([x,y],i)=>{if(x)nodes[i].scrollLeft=x;if(y)nodes[i].scrollTop=y});copy.contentWindow.scrollTo(original.defaultView.scrollX,original.defaultView.scrollY);
 root.style.visibility='visible';
 const release=()=>{root.querySelector('.navigation-face')?.remove();root.className='navigation-cache';root.style.cssText='position:absolute;visibility:hidden;pointer-events:none';content.style.visibility='';content.style.transform='';};
 return{root,content,pose:saved,release};
}
function navigationCard(){
 const candidates=['#homeQuickGrid [data-quick-id="physics-10"]','#gradePanel10 a[href="physics-10.html"]'];
 for(const selector of candidates){const n=find(selector),r=n&&box(n);if(r&&r.x>=pose.x&&r.y>=pose.y+42&&r.y+r.h<pose.y+pose.h)return{r,node:n,copy:styledClone(n)};}
 return{r:{x:pose.x+pose.w*.48,y:pose.y+pose.h*.45,w:pose.w*.25,h:pose.h*.25},node:null};
}
async function navigationFlight(target){
 const from=step,entering=currentPage==='home',clamp=x=>Math.max(0,Math.min(1,x)),soft=x=>{x=clamp(x);return x*x*(3-2*x)},mix=(a,b,t)=>a+(b-a)*t;
 Cosmos.holdFlight(from);
 // UI clicks belong to the ordinary route only; outline navigation has no fake click.
 if(target===14&&from===13){await prepareTarget(anchors[14]);await click(anchors[14],null,330)}
 if(target===10&&from===9){await prepareTarget('.sidebar-header a');await click('.sidebar-header a',null,330)}
 let card=entering?navigationCard():null,old=await navigationSurface(),arrival=null,portal=null;
 const hide=['panel','math-site-label','opening','cursor','connector','final'];
 try{
  hide.forEach(id=>$(id).style.visibility='hidden');$('site').style.visibility='hidden';
  step=target;resetUI(target);mathState(target);await layout(target,false);await endCursor(target);linkScene(target);readingFocus(target);
  if(!entering)card=navigationCard();
  arrival=await navigationSurface();arrival.root.style.zIndex='9';old.root.style.zIndex='10';
  const foreground=entering?arrival:old,background=entering?old:arrival,full=foreground.pose;
  portal=foreground.root;portal.classList.add('navigation-portal');portal.dataset.direction=entering?'in':'out';portal.style.zIndex='11';portal.style.transformOrigin='0 0';portal.style.left=portal.style.top='0px';portal.style.willChange='transform,opacity';
  const face=document.createElement('div');face.className='navigation-face';
  if(card.node){const n=card.copy;Object.assign(n.style,{width:'100%',height:'100%',margin:'0',position:'relative'});n.querySelectorAll('use').forEach(u=>{const symbol=frames.home.contentDocument.querySelector(u.getAttribute('href'));if(symbol){const g=document.createElementNS('http://www.w3.org/2000/svg','g');g.innerHTML=symbol.innerHTML;u.replaceWith(g)}});face.append(n)}else{face.innerHTML='<span>Физика</span>';}
  Object.assign(face.style,{width:card.r.w+'px',height:card.r.h+'px',right:'auto',bottom:'auto',transformOrigin:'0 0',transform:`scale(${full.w/card.r.w},${full.h/card.r.h})`});
  portal.append(face);$('stage').dataset.flight='true';Cosmos.holdFlight(from);
  await tween(1650,raw=>{
   const p=entering?raw:1-raw,g=Cosmos.volume.smooth(clamp((p-.08)/.80)),show=soft((p-.40)/.43),r=card.r;
   const x=mix(r.x,full.x,g),y=mix(r.y,full.y,g),w=mix(r.w,full.w,g),h=mix(r.h,full.h,g);
   portal.dataset.progress=raw.toFixed(4);portal.flightBounds={x,y,w,h};Object.assign(portal.style,{transform:`translate(${x}px,${y}px) scale(${w/full.w},${h/full.h})`,borderRadius:`${mix(18,23,g)*full.w/w}px / ${mix(18,23,g)*full.h/h}px`});
   foreground.content.style.visibility=p<.40?'hidden':'visible';
   face.style.opacity=String(1-show);face.firstElementChild.style.opacity=String(1-soft((p-.26)/.20));background.root.style.opacity=String(1-soft((p-.10)/.50));
   const center={x:r.x+r.w/2,y:r.y+r.h/2};background.root.style.transformOrigin=(center.x-background.pose.x)+'px '+(center.y-background.pose.y)+'px';background.root.style.transform=`scale(${1+.12*soft(p/.6)})`;
   Cosmos.setFlight(raw,mix(center.x,full.x+full.w/2,g),mix(center.y,full.y+full.h/2,g),!entering,{from,to:target,duration:1.65,start:.08,span:.80});
  },true);
  $('site').style.visibility='';old.release();arrival.release();Cosmos.finishFlight();
  hide.forEach(id=>$(id).style.visibility='');
  if(target>=15&&target<=27){await animateMathScene(target);mathState(target);linkScene(target);}
 }finally{
  old.release();arrival?.release();$('site').style.visibility='';hide.forEach(id=>$(id).style.visibility='');$('stage').dataset.flight='false';Cosmos.finishFlight();
 }
}
// A topic result travels into the reader plane rather than fading vertically.
async function topicFlight(id){
 const old=find('.exp-reader-current');if(!old)return;
 const from=step,to=id===SEARCH_TOPIC?6:3;Cosmos.holdFlight(from);
 const wrap=old.parentElement;wrap.style.perspective='1300px';
 await tween(220,t=>{old.style.opacity=1-t;old.style.transform=`translateZ(${t*170}px) scale(${1+t*.035})`;Cosmos.setFlight(t*.24,960,500,false,{from,to,duration:.9,start:0,span:1})});
 old.style.opacity='';old.style.transform='';topic(id);doc().defaultView.scrollTo(0,0);const next=find('#'+id);
 await tween(680,t=>{next.style.opacity=softTopic(t);next.style.transform=`translateZ(${-380*(1-t)}px) translateY(${24*(1-t)}px)`;Cosmos.setFlight(.24+t*.76,960,500,false,{from,to,duration:.9,start:0,span:1})});
 next.style.opacity='';next.style.transform='';wrap.style.perspective='';Cosmos.finishFlight();
}
function softTopic(t){return Math.min(1,t*2.5)}
