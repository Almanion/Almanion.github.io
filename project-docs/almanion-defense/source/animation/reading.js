/* The same real reader DOM reflows as the camera moves closer. No cropped
   paragraphs, replacement screenshots or independent topic mockups. */
const READER_WIDTH=1120,READER_ZOOM=1584/READER_WIDTH,READER_HEIGHT=890/READER_ZOOM;
function readerDimensions(s){return s===4?{w:960,h:890/1.65}:s===3?{w:READER_WIDTH,h:READER_HEIGHT}:s===28?{w:390,h:580}:{w:1440,h:810};}
function readerCollapsed(on){const d=frames.physics.contentDocument;d.body.classList.toggle('sidebar-collapsed',on);d.querySelector('.sidebar').classList.toggle('collapsed',on);}
async function animateReaderCollapse(on){
 const side=find('.sidebar'),main=find('.main-content'),style=n=>{const c=doc().defaultView.getComputedStyle(n);return{marginLeft:c.marginLeft,paddingLeft:c.paddingLeft,paddingRight:c.paddingRight,width:c.width}},from=style(main);
 readerCollapsed(on);if(!on)centreContents();const to=style(main);
 await Promise.all([main.animate([from,to],{duration:420,easing:'cubic-bezier(.22,.7,.2,1)'}).finished,side.animate([{transform:on?'translateX(0)':'translateX(-100%)'},{transform:on?'translateX(-100%)':'translateX(0)'}],{duration:420,easing:'cubic-bezier(.22,.7,.2,1)'}).finished]);
}
function centreContents(){
 const n=find(TOC);let p=n?.parentElement;
 while(p&&p!==doc().body){if(p.scrollHeight>p.clientHeight+10&&/auto|scroll/.test(doc().defaultView.getComputedStyle(p).overflowY)){const r=n.getBoundingClientRect(),pr=p.getBoundingClientRect();p.scrollTop=Math.max(0,Math.min(p.scrollHeight-p.clientHeight,p.scrollTop+r.top-pr.top+r.height/2-p.clientHeight*.52));}p=p.parentElement;}
}
async function readingTransition(target,reverse=false){
 $('focus').style.opacity=0;const pointer=$('cursor');
 try{
  if(target===3&&!reverse){
   const f=frames.physics,fw=parseFloat(f.style.width)||1440,fh=parseFloat(f.style.height)||810,from={...pose},fromCursor={...cursor};
   // Shrinking the underlying reader viewport gives genuine responsive reflow.
   await tween(720,t=>{f.style.width=(fw+(READER_WIDTH-fw)*t)+'px';f.style.height=(fh+(READER_HEIGHT-fh)*t)+'px';$('camera').style.width=f.style.width;pose.z=from.z+(READER_ZOOM-from.z)*t;pose.tx=from.tx*(1-t);pose.ty=from.ty*(1-t);Cosmos.cameraMove(from,{z:READER_ZOOM,x:pose.x-160},t);drawPose();const header=box('.sidebar-header');cursor.x=fromCursor.x+(header.x+header.w*.56-fromCursor.x)*t;cursor.y=fromCursor.y+(header.y+header.h*.6-fromCursor.y)*t;paintCursor();});
   const scrolling=[...doc().querySelectorAll('*')].filter(n=>n.scrollHeight>n.clientHeight+10&&/auto|scroll/.test(doc().defaultView.getComputedStyle(n).overflowY));const scrollFrom=scrolling.map(n=>n.scrollTop);centreContents();const to=scrolling.map(n=>n.scrollTop);scrolling.forEach((n,i)=>n.scrollTop=scrollFrom[i]);
   await tween(540,t=>{scrolling.forEach((n,i)=>n.scrollTop=scrollFrom[i]+(to[i]-scrollFrom[i])*t);Cosmos.cameraMove({x:0,y:0,z:1},{x:0,y:160,z:1},t);});
   await click(TOC,null,430);await topicFlight(TOPIC);
  }else if(target===4){
   // The real sidebar control clears space for reading.
   await click('.sidebar-collapse-btn',null,380);await animateReaderCollapse(true);
   const d=doc(),f=frames.physics,fw=parseFloat(f.style.width),fh=parseFloat(f.style.height),z=pose.z;
   await tween(420,t=>{f.style.width=(fw+(960-fw)*t)+'px';f.style.height=(fh+(890/1.65-fh)*t)+'px';$('camera').style.width=f.style.width;pose.z=z+(1.65-z)*t;pose.tx=pose.ty=0;drawPose();Cosmos.cameraMove({x:0,y:0,z},{x:0,y:0,z:1.65},t)});
   await tween(150,t=>pointer.style.opacity=1-t*.7);
   const fromScroll=d.defaultView.scrollY,n=find(FORMULA),from={...pose};
   d.defaultView.scrollTo(0,Math.max(0,fromScroll+n.getBoundingClientRect().top-260));
   const total=d.defaultView.scrollY,end={z:1.65,tx:0,ty:0};d.defaultView.scrollTo(0,fromScroll);
   await tween(1150,t=>{d.defaultView.scrollTo(0,fromScroll+(total-fromScroll)*t);for(const k in end)pose[k]=from[k]+(end[k]-from[k])*t;Cosmos.cameraMove({x:0,y:0,z:from.z},{x:300,y:-520,z:1.65},t);drawPose();});
  }else{
   await click('.sidebar-expand-btn',null,300);await animateReaderCollapse(false);await tween(150,t=>pointer.style.opacity=1-t*.7);
   const d=doc(),f=frames.physics,fw=parseFloat(f.style.width),fh=parseFloat(f.style.height),scroll=d.defaultView.scrollY,z=pose.z;await tween(680,t=>{f.style.width=(fw+(READER_WIDTH-fw)*t)+'px';f.style.height=(fh+(READER_HEIGHT-fh)*t)+'px';$('camera').style.width=f.style.width;pose.z=z+(READER_ZOOM-z)*t;pose.tx=pose.ty=0;drawPose();d.defaultView.scrollTo(0,scroll*(1-t));centreContents();Cosmos.cameraMove({x:0,y:0,z:1.65},{x:-220,y:440,z:1.414},t);});
  }
  step=target;resetUI(target);mathState(target);await layout(target,false);await endCursor(target);readingFocus(target);
  if(pointer.style.opacity&&pointer.style.opacity!=='1')await tween(160,t=>pointer.style.opacity=.3+.7*t);
 }finally{pointer.style.opacity='';}
}
function readingFocus(s){
 if(s===3)focus(TOC);
 if(s===4)focus(FORMULA+' .base');
}
