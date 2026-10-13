/* Displayed stops 13–17. The editor has a draft; only Save changes the grid.
   Native labels/markup follow home-quick-editor.js and home-dashboard.js at
   f7f708a. The travelling items are a presentation explanation of that save. */
const QuickAccess=(()=>{
 const original=['physics-10','russian-ege','duty-10-1'],chosen=['physics-10','matcenter','russian-ege'];
 const width=1280,view={x:168,y:68,w:1584,h:860,z:1584/width,tx:0,ty:0,panel:0};
 const templates=new Map(),clamp=t=>Math.max(0,Math.min(1,t)),mix=(a,b,t)=>a+(b-a)*t,soft=t=>Cosmos.volume.smooth(clamp(t));
 const owns=s=>s>=10&&s<=13,option=id=>'.home-quick-option[data-quick-id="'+id+'"]';
 function init(){
  const d=frames.home.contentDocument,grid=d.getElementById('homeQuickGrid');
  for(const n of grid.children)templates.set(n.dataset.quickId,n.cloneNode(true));
  // Use the site's quick-card structure, including context and chevron.
  const item=d.querySelector(option('matcenter')),card=templates.get('physics-10').cloneNode(true);
  card.dataset.quickId='matcenter';card.dataset.subject=item.dataset.subject;card.href='matcenter.html';
  card.querySelector('.subject-icon').replaceChildren(item.querySelector('svg').cloneNode(true));
  card.querySelector('h2').textContent=item.querySelector('strong').textContent;
  card.querySelector('.home-quick-context').textContent=item.querySelector('small').textContent;
  templates.set('matcenter',card);
 }
 function update(ids,saved=false){
  const d=frames.home.contentDocument;
  d.querySelectorAll('.home-quick-option').forEach(n=>{const i=ids.indexOf(n.dataset.quickId);n.classList.toggle('is-selected',i>=0);n.setAttribute('aria-pressed',String(i>=0));n.querySelector('.home-quick-option-order').textContent=i<0?'+':i+1;});
  d.getElementById('homeQuickCount').textContent=ids.length+' из 5';d.getElementById('homeQuickSave').disabled=!ids.length;
  if(saved){const grid=d.getElementById('homeQuickGrid');grid.replaceChildren(...ids.map(id=>templates.get(id).cloneNode(true)));grid.dataset.count=String(ids.length);}
 }
 function reset(s){
  const f=frames.home;f.style.width=(owns(s)?width:1440)+'px';f.style.height=(owns(s)?(view.h-42)/view.z:810)+'px';
  update(s>=13&&s<=29?chosen:original,true);if(s===12)update(chosen);
  $('stage').dataset.quickPhase='';
 }
 async function layout(animate){$('camera').style.width=width+'px';await movePose(view,animate?650:0);doc().defaultView.scrollTo(0,0);}
 function point(s){
  if(s===14)return OpeningGuidance.point(3);
  if(s===10){const r=box('#homeQuickCustomize');return{x:r.x+r.w*.85,y:r.y+r.h+18};}
  if(s===11){const r=box('.home-quick-dialog-panel');return{x:r.x+r.w+34,y:r.y+205};}
  if(s===12){const r=box('#homeQuickSave');return{x:r.x+r.w*.84,y:r.y+r.h+17};}
  const r=box('#homeQuickGrid [data-quick-id="physics-10"]');return{x:r.x+r.w*.82,y:r.y+r.h+24};
 }
 async function park(s){await OpeningGuidance.glide(point(s),350,-22);}
 async function finish(s){step=s;resetUI(s);mathState(s);await layout(false);linkScene(s);readingFocus(s);await park(s);}
 async function press(sel){const badge=find(sel)?.querySelector('.home-quick-option-order'),r=box(badge||sel);await OpeningGuidance.press(sel,{x:r.x+r.w*.5,y:r.y+r.h*.52},null,380);}
 async function scrollOption(id){
  const n=find(option(id)),body=find('.home-quick-dialog-body'),r=n.getBoundingClientRect(),b=body.getBoundingClientRect();
  if(r.top>=b.top+22&&r.bottom<=b.bottom-22)return;
  await OpeningGuidance.glide(point(11),260,18);scrolled.add(body);
  const from=body.scrollTop,to=Math.max(0,Math.min(body.scrollHeight-body.clientHeight,from+r.top-b.top-body.clientHeight*.43));
  await tween(480,t=>body.scrollTop=mix(from,to,t));
 }
 async function open(reverse=false){
  const from=step,to=reverse?10:11;Cosmos.holdFlight(from);$('stage').dataset.quickPhase=reverse?'close':'open';
  if(!reverse){await press('#homeQuickCustomize');hide('homeQuickDialog',false);doc().body.classList.add('home-quick-dialog-open');}
  const overlay=find('#homeQuickDialog'),panel=find('.home-quick-dialog-panel'),start={...cursor},end=point(to);
  try{
   await tween(760,t=>{const p=reverse?1-t:t,q=soft(p);overlay.style.opacity=q;panel.style.transform=`translate(${32*(1-q)}px,${18*(1-q)}px) scale(${.965+.035*q})`;panel.style.transformOrigin='90% 15%';Object.assign(cursor,OpeningGuidance.path(start,end,t,-36));paintCursor();Cosmos.setFlight(t,960,510,reverse,{from,to,duration:.76,start:0,span:1,jump:false});},true);
  }finally{overlay.style.opacity='';panel.style.transform='';panel.style.transformOrigin='';Cosmos.finishFlight();}
  await finish(to);
 }
 async function select(reverse=false){
  $('stage').dataset.quickPhase='select';
  if(reverse){
   const nodes=[...doc().querySelectorAll('.home-quick-option')],before=nodes.map(n=>{const c=doc().defaultView.getComputedStyle(n);return{backgroundColor:c.backgroundColor,borderColor:c.borderColor}});
   update(original);await Promise.all(nodes.map((n,i)=>{const c=doc().defaultView.getComputedStyle(n);return n.animate([before[i],{backgroundColor:c.backgroundColor,borderColor:c.borderColor}],{duration:420,easing:'ease-in-out'}).finished}));await finish(11);return;
  }
  for(const [id,ids] of [['duty-10-1',['physics-10','russian-ege']],['russian-ege',['physics-10']],['matcenter',['physics-10','matcenter']],['russian-ege',chosen]]){
   await scrollOption(id);const sel=option(id),n=find(sel);await press(sel);
   const c=doc().defaultView.getComputedStyle(n),before={backgroundColor:c.backgroundColor,borderColor:c.borderColor};update(ids);
   const after=doc().defaultView.getComputedStyle(n);await Promise.all([n.animate([before,{backgroundColor:after.backgroundColor,borderColor:after.borderColor}],{duration:240,easing:'ease-out'}).finished,n.querySelector('.home-quick-option-order').animate([{transform:'scale(.78)'},{transform:'scale(1.08)',offset:.65},{transform:'scale(1)'}],{duration:270,easing:'ease-out'}).finished]);
  }
  const body=find('.home-quick-dialog-body'),from=body.scrollTop;await OpeningGuidance.glide(point(11),230,18);scrolled.add(body);await tween(430,t=>body.scrollTop=from*(1-t));await finish(12);
 }
 function resolveSvg(node,d){for(const use of node.querySelectorAll('use')){const symbol=d.querySelector(use.getAttribute('href'));if(symbol){const g=document.createElementNS('http://www.w3.org/2000/svg','g');g.innerHTML=symbol.innerHTML;use.replaceWith(g);}}return node;}
 function capture(n,kind){
  const d=n.ownerDocument,c=d.defaultView.getComputedStyle(n),spec=kind==='option'?['.home-quick-option-icon','strong','small','.home-quick-option-order']:['.subject-icon','h2','.home-quick-context','.home-quick-arrow'];
  return{rect:box(n),background:c.backgroundColor,border:c.borderColor,parts:spec.map(sel=>{const part=n.querySelector(sel),css=d.defaultView.getComputedStyle(part);return{rect:box(part),text:part.textContent.trim(),color:css.color,size:parseFloat(css.fontSize)*pose.z,weight:css.fontWeight,background:css.backgroundColor,svg:part.querySelector('svg')||part.tagName.toLowerCase()==='svg'?resolveSvg(styledClone(part.querySelector('svg')||part),d):null};})};
 }
 function makeGhost(id,source,target){
  const root=document.createElement('div');root.className='quick-flight-item';root.dataset.quickId=id;root.setAttribute('aria-hidden','true');root.style.background=target.background;
  const skins=[source,target].map(data=>{const el=document.createElement('div');el.className='quick-flight-skin';el.style.background=data.background;el.style.borderColor=data.border;root.append(el);return el;});
  const icon=document.createElement('div');icon.className='quick-flight-icon';icon.style.color=source.parts[0].color;const svg=source.parts[0].svg;svg.style.cssText='width:100%;height:100%;display:block';icon.append(svg);root.append(icon);
  const labels=[1,2].map(i=>{const el=document.createElement('span'),data=source.parts[i];el.className='quick-flight-copy';el.textContent=data.text;el.style.color=data.color;el.style.fontWeight=data.weight;root.append(el);return el;});
  const badge=document.createElement('span');badge.className='quick-flight-order';badge.textContent=source.parts[3].text;badge.style.color=source.parts[3].color;badge.style.background=source.parts[3].background;root.append(badge);
  const arrow=target.parts[3].svg;arrow.classList.add('quick-flight-arrow');root.append(arrow);$('stage').append(root);
  function frame(t){
   root.dataset.progress=t.toFixed(4);
   const q=soft(t/.82),a=source.rect,b=target.rect,envelope=soft(t/.22)*(1-soft((t-.6)/.4)),lift=({'physics-10':-125,matcenter:-100,'russian-ege':180})[id];
   const x=mix(a.x,b.x,q)+(id==='matcenter'?190*Math.sin(Math.PI*q):0),y=mix(a.y,b.y,q)+lift*envelope,w=mix(a.w,b.w,q),h=mix(a.h,b.h,q);
   Object.assign(root.style,{transform:`translate(${x}px,${y}px)`,width:w+'px',height:h+'px',borderRadius:mix(14,14,q)+'px'});skins[0].style.opacity=1-q;skins[1].style.opacity=q;
   function position(el,i){const r=source.parts[i].rect,s=target.parts[i].rect;Object.assign(el.style,{left:mix(r.x-a.x,s.x-b.x,q)+'px',top:mix(r.y-a.y,s.y-b.y,q)+'px',width:mix(r.w,s.w,q)+'px',height:mix(r.h,s.h,q)+'px'});}
   position(icon,0);labels.forEach((el,i)=>{position(el,i+1);el.style.fontSize=mix(source.parts[i+1].size,target.parts[i+1].size,q)+'px';});
   Object.assign(badge.style,{left:source.parts[3].rect.x-a.x+'px',top:source.parts[3].rect.y-a.y+'px',width:source.parts[3].rect.w+'px',height:source.parts[3].rect.h+'px',opacity:1-soft(q/.32)});
   const r=target.parts[3].rect;Object.assign(arrow.style,{left:w-(b.x+b.w-r.x)+'px',top:r.y-b.y+'px',width:r.w+'px',height:r.h+'px',opacity:soft((q-.65)/.35)});
  }
  frame(0);return{root,frame};
 }
 async function save(reverse=false){
  const from=step,to=reverse?12:13;Cosmos.holdFlight(from);$('stage').dataset.quickPhase=reverse?'unsave':'save';
  if(!reverse)await press('#homeQuickSave');
  const departure={...cursor};
  // Measure both native endpoints at one viewport; no layout reads during flight.
  hide('homeQuickDialog',false);doc().body.classList.add('home-quick-dialog-open');
  const overlay=find('#homeQuickDialog'),panel=find('.home-quick-dialog-panel'),body=find('.home-quick-dialog-body');scrolled.add(body);body.scrollTop=0;
  const sources=chosen.map(id=>capture(find(option(id)),'option'));update(chosen,true);
  const cards=chosen.map(id=>find('#homeQuickGrid [data-quick-id="'+id+'"]')),targets=cards.map(n=>capture(n,'card'));
  const ghosts=chosen.map((id,i)=>makeGhost(id,sources[i],targets[i])),arrival=point(to),secondary=find('.home-content-grid');
  cards.forEach(n=>n.style.opacity='0');chosen.forEach(id=>find(option(id)).style.opacity='0');$('caption').style.opacity='0';
  try{
   await tween(1640,t=>{
    const p=reverse?1-t:t,closing=soft(p/.34);overlay.style.opacity=1-closing;panel.style.transform=`translateY(${-12*closing}px) scale(${1-.022*closing})`;
    ghosts.forEach((g,i)=>{const timing=[[.06,.72],[.08,.76],[.15,.82]][i],q=clamp((p-timing[0])/timing[1]);g.frame(q);g.root.style.opacity=1-soft((q-.96)/.04);cards[i].style.opacity=soft((q-.96)/.04);});
    if(secondary)secondary.style.opacity=1-.62*Math.sin(Math.PI*p);
    Object.assign(cursor,OpeningGuidance.path(departure,arrival,t,-64));paintCursor();
    Cosmos.setFlight(t,960,500,reverse,{from,to,duration:1.64,start:0,span:1,jump:false});
   },true);
  }finally{ghosts.forEach(g=>g.root.remove());cards.forEach(n=>n.style.opacity='');chosen.forEach(id=>find(option(id)).style.opacity='');overlay.style.opacity='';panel.style.transform='';if(secondary)secondary.style.opacity='';Cosmos.finishFlight();}
  await finish(to);await tween(220,t=>$('caption').style.opacity=t);$('caption').style.opacity='';
 }
 const handles=(from,to)=>[[10,11],[11,10],[11,12],[12,11],[12,13],[13,12]].some(([a,b])=>a===from&&b===to);
 async function transition(to){if(to===11&&step===10||to===10)return open(to===10);if(to===12&&step===11||to===11)return select(to===11);return save(to===12);}
 return{init,update,reset,layout,point,park,owns,handles,transition,resolveSvg};
})();
