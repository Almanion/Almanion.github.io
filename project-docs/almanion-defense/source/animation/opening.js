function openingState(s){
 const intro=$('intro-copy'),route=$('route-copy');
 intro.style.opacity=s===0?'1':'0';intro.style.transform=s===0?'none':'translateX(-55px)';
 route.style.opacity=s===1?'1':'0';route.style.transform='none';
}
async function openingToClass(){
 const next={x:168,y:210,w:1584,h:779,z:1.1,tx:0,ty:0,panel:0};
 const r=OpeningGuidance.screen(find('#gradeTab10').getBoundingClientRect(),next),tab={x:r.x+r.w*.72,y:r.y+r.h*.64};
 await Promise.all([
  movePose(next,950),OpeningGuidance.glide(tab,950,-48),
  tween(950,t=>{const out=Math.min(1,t*1.7),intro=$('intro-copy'),route=$('route-copy');intro.style.opacity=1-out;intro.style.transform=`translateX(${-55*out}px)`;const q=Math.max(0,(t-.46)/.54);route.style.opacity=q;route.style.transform=`translateY(${14*(1-q)}px)`})
 ]);
 await OpeningGuidance.press('#gradeTab10',tab,()=>grade(10),0);
 const cards=[...doc().querySelectorAll('#gradePanel10 .subject-card')];
 await tween(340,t=>cards.forEach((n,i)=>{const delay=Math.min(.3,i*.06),q=Math.max(0,(t-delay)/(1-delay));n.style.opacity=q;n.style.transform=`translateY(${18*(1-q)}px)`}));
 cards.forEach(n=>{n.style.opacity='';n.style.transform=''});
}
function styledClone(node){
 const copy=node.cloneNode(true),original=[node,...node.querySelectorAll('*')],cloned=[copy,...copy.querySelectorAll('*')];
 // Snapshot only painted/layout properties, not hundreds of custom/vendor
 // properties. Read the complete batch before writing the detached clone.
 const keys='display position box-sizing width height min-width min-height max-width max-height margin padding gap row-gap column-gap flex flex-direction flex-wrap align-items align-content align-self justify-content justify-items justify-self grid-template-columns grid-template-rows grid-column grid-row overflow border border-radius background color opacity box-shadow transform transform-origin font-family font-size font-weight font-style line-height letter-spacing text-align text-decoration white-space vertical-align object-fit fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray visibility'.split(' ');
 const styles=original.map(n=>{const css=n.ownerDocument.defaultView.getComputedStyle(n);return keys.map(k=>css.getPropertyValue(k))});
 cloned.forEach((n,i)=>{n.removeAttribute('id');n.style.cssText='';keys.forEach((k,j)=>n.style.setProperty(k,styles[i][j]))});
 return copy;
}

async function enterPhysics(reverse=false){
 Cosmos.holdFlight(step);
 const h=frames.home.contentDocument,source=h.querySelector(anchors[2]);
 const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x)},mix=(a,b,t)=>a+(b-a)*t;
 const home={x:168,y:210,w:1584,h:779,z:1.1},final={x:168,y:57,w:1584,h:932,z:1.1};
 const screenBox=n=>{const r=n.getBoundingClientRect();return{x:home.x+r.x*home.z,y:home.y+42+r.y*home.z,w:r.width*home.z,h:r.height*home.z}};
 const r=screenBox(source),labelSource=source.querySelector('h2'),labelBox=screenBox(labelSource),iconSource=source.querySelector('.subject-icon'),iconBox=screenBox(iconSource);
 const sourceStyle=h.defaultView.getComputedStyle(labelSource),sourceSize=parseFloat(sourceStyle.fontSize)*home.z;
 const portal=document.createElement('div');portal.className='physics-portal';portal.dataset.progress=reverse?'1':'0';
 const face=document.createElement('div');face.className='portal-face';
 const sheet=document.createElement('div');sheet.className='portal-document';sheet.innerHTML='<div class="portal-chrome"><i></i><i></i><i></i><span class="portal-address">almanion.github.io/physics-10.html</span><span class="portal-brand">ALMANION</span></div>';
 const label=document.createElement('div');label.className='portal-title';label.textContent='Физика';
 const icon=document.createElement('div');icon.className='portal-icon';const iconCopy=styledClone(iconSource);for(const use of iconCopy.querySelectorAll('use')){const symbol=h.querySelector(use.getAttribute('href'));if(symbol){const group=document.createElementNS('http://www.w3.org/2000/svg','g');group.innerHTML=symbol.innerHTML;use.replaceWith(group)}}icon.appendChild(iconCopy);
 const rim=document.createElement('div');rim.className='portal-glow';
 const physics=document.createElement('iframe');physics.setAttribute('sandbox','allow-same-origin');physics.title='Раскрытие конспекта по физике';const ready=new Promise(resolve=>physics.onload=()=>{if(physics.contentDocument?.querySelector('h1'))resolve()});sheet.appendChild(physics);portal.append(sheet,face,label,icon,rim);
 portal.style.visibility='hidden';$('stage').appendChild(portal);physics.srcdoc='<!doctype html>'+frames.physics.contentDocument.documentElement.outerHTML;await ready;await physics.contentDocument.fonts.ready;
 const d=physics.contentDocument,title=d.querySelector('h1'),tr=title.getBoundingClientRect(),ts=d.defaultView.getComputedStyle(title),target={x:final.x+tr.x*final.z,y:final.y+42+tr.y*final.z,size:parseFloat(ts.fontSize)*final.z};
 const cursorDeparture=OpeningGuidance.point(1,h,{...home,tx:0,ty:0}),cursorArrival=OpeningGuidance.point(2,d,{...final,tx:0,ty:0});
 label.style.fontFamily=sourceStyle.fontFamily;label.style.fontWeight=sourceStyle.fontWeight;label.style.letterSpacing=sourceStyle.letterSpacing;await document.fonts.load(sourceStyle.fontWeight+' '+target.size+'px Onest','Физика');
 // This single label is the card title AND the arriving page title.
 title.style.visibility='hidden';physics.style.transform='scale(1.1)';physics.style.width='1440px';physics.style.height='810px';
 let previousVisibility=source.style.visibility;
 function frameAt(raw){
  const p=reverse?1-raw:raw,q=clamp((p-.12)/.64),g=q*q*q*(10-15*q+6*q*q),reveal=smooth((p-.56)/.30);
  const x=mix(r.x,final.x,g),y=mix(r.y,final.y,g),w=mix(r.w,final.w,g),height=mix(r.h,final.h,g);
  portal.dataset.progress=p.toFixed(4);portal.dataset.phase=p<.12?'focus':p<.6?'flight':p<.86?'reveal':'arrival';
  Object.assign(portal.style,{left:x+'px',top:y+'px',width:w+'px',height:height+'px',borderRadius:mix(20,23,g)+'px',visibility:'visible'});
  Object.assign(label.style,{left:mix(labelBox.x,target.x,g)-x+'px',top:mix(labelBox.y,target.y,g)-y+'px',fontSize:mix(sourceSize,target.size,g)+'px',fontWeight:Math.round(mix(parseFloat(sourceStyle.fontWeight),parseFloat(ts.fontWeight),g)),lineHeight:mix(parseFloat(sourceStyle.lineHeight)*home.z,parseFloat(ts.lineHeight)*final.z,g)+'px',letterSpacing:mix((parseFloat(sourceStyle.letterSpacing)||0)*home.z,(parseFloat(ts.letterSpacing)||0)*final.z,g)+'px'});
  Object.assign(icon.style,{left:mix(iconBox.x,target.x-62,g)-x+'px',top:mix(iconBox.y,target.y,g)-y+'px',opacity:1-smooth((p-.18)/.30),transform:'scale('+home.z+')'});
  face.style.opacity=1-reveal;sheet.style.opacity=1;sheet.style.clipPath='none';
  // The opaque face clears before the page appears: no ghosted double-page.
  if(p<.56)sheet.style.visibility='hidden';else sheet.style.visibility='visible';
  $('site').style.opacity=1-smooth((p-.12)/.30);$('site').style.transformOrigin=(r.x+r.w/2-home.x)+'px '+(r.y+r.h/2-home.y)+'px';$('site').style.transform='scale('+(1+.09*smooth(p/.42))+')';$('site').style.filter='blur('+(smooth(p/.42)*2.5)+'px)';
  $('route-copy').style.opacity=1-smooth(p/.23);$('cursor').style.opacity=1-.82*Math.sin(Math.PI*g);$('focus').style.opacity=0;
  Object.assign(cursor,OpeningGuidance.path(cursorDeparture,cursorArrival,q,-48));paintCursor();
  rim.style.opacity=Math.sin(Math.PI*g)*.6;
  const flightProgress=raw,centerProgress=g;
  Cosmos.setFlight(flightProgress,mix(r.x+r.w/2,960,centerProgress),mix(r.y+r.h/2,510,centerProgress),reverse);
 }
 try{
  if(!reverse){await prepareTarget(anchors[2]);await OpeningGuidance.press(anchors[2],cursorDeparture,null,280);}
  if(reverse){resetUI(1);await layout(1,false);}
  frameAt(0);source.style.visibility='hidden';$('stage').dataset.flight='true';
  await tween(1850,frameAt,true);
  const targetStep=reverse?1:2;step=targetStep;resetUI(step);mathState(step);await layout(step,false);openingState(step);
  source.style.visibility=previousVisibility;$('site').style.opacity='';$('site').style.transform='';$('site').style.transformOrigin='';$('site').style.filter='';portal.remove();Cosmos.finishFlight();
  // The cursor arrives with the page; no invisible teleport to another corner.
  $('cursor').style.opacity='';await endCursor(step);
 }finally{
  source.style.visibility=previousVisibility;portal.remove();$('site').style.opacity='';$('site').style.transform='';$('site').style.transformOrigin='';$('site').style.filter='';$('cursor').style.opacity='';$('stage').dataset.flight='false';Cosmos.finishFlight();
 }
}
