/* First five actions: point to a choice, perform it, then leave the text clear.
   Resting points are derived from the real DOM and shared by forward/back/replay. */
const OpeningGuidance=(()=>{
 const smooth=t=>t*t*t*(10+t*(-15+6*t));
 const screen=(r,p=pose)=>({x:p.x+p.tx+r.x*p.z,y:p.y+42+p.ty+r.y*p.z,w:r.width*p.z,h:r.height*p.z});
 function ink(selector,d=doc(),p=pose){
  const n=d.querySelector(selector),range=d.createRange();range.selectNodeContents(n);
  const r=[...range.getClientRects()].filter(r=>r.width&&r.height).at(-1)||n.getBoundingClientRect();return screen(r,p);
 }
 function point(s,d=doc(),p=pose){
  let r;if(s===1){r=screen(d.querySelector('#gradePanel10 a[href="physics-10.html"]').getBoundingClientRect(),p);return{x:r.x+r.w*.84,y:r.y+r.h*.64};}
  if(s===2||s===3){r=ink(s===2?'h1':'#'+TOPIC+' h3',d,p);return{x:Math.min(p.x+p.w-52,r.x+r.w+46),y:r.y+r.h*.76+13};}
  if(s===4){r=screen(d.querySelector(FORMULA+' .base').getBoundingClientRect(),p);return{x:r.x+r.w+54,y:r.y+r.h+25};}
  if(s===5){r=screen(d.querySelector('.search-result-item').getBoundingClientRect(),p);return{x:r.x+r.w+30,y:r.y+38};}
 }
 function hit(selector){const r=box(selector);return{x:r.x+r.w*.87,y:r.y+r.h*.65};}
 function path(from,to,t,bend=24){
  const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy)||1,q=smooth(t),arc=4*q*(1-q)*Math.min(Math.abs(bend),length*.12)*Math.sign(bend);
  return{x:from.x+dx*q-dy/length*arc,y:from.y+dy*q+dx/length*arc};
 }
 async function glide(to,ms=440,bend=24){
  const from={...cursor};if(Math.hypot(to.x-from.x,to.y-from.y)<.5){Object.assign(cursor,to);paintCursor();return;}
  await tween(ms,t=>{Object.assign(cursor,path(from,to,t,bend));paintCursor()},true);Object.assign(cursor,to);paintCursor();
 }
 async function press(selector,to=hit(selector),action=null,ms=440){
  await glide(to,ms,-22);focus(selector);await wait(110);
  actionLog.push({selector,point:{...cursor},rect:box(selector),pose:{...pose}});
  Cosmos.press(cursor.x,cursor.y,reduced);await wait(140);action?.();await wait(70);$('focus').style.opacity=0;
 }
 async function park(s,ms=400){await glide(point(s),ms,s===3?-22:22);if(s===1)focus(anchors[2]);if(s===5)focus('.search-result-item');}
 return{point,hit,ink,screen,path,glide,press,park,smooth};
})();

async function openingSearch(){
 const d=doc(),f=frames.physics,pointer=$('cursor'),main=find('.main-content');
 try{
  await OpeningGuidance.press('.sidebar-expand-btn');
  await animateReaderCollapse(false);
  // Keep the equation as reading context. A search does not open a new topic.
  const from={...pose},fw=parseFloat(f.style.width),fh=parseFloat(f.style.height);
  const gutter={x:620,y:236};
  await Promise.all([OpeningGuidance.glide(gutter,620,-45),tween(620,t=>{
   f.style.width=(fw+(READER_WIDTH-fw)*t)+'px';f.style.height=(fh+(READER_HEIGHT-fh)*t)+'px';$('camera').style.width=f.style.width;
   pose.z=from.z+(READER_ZOOM-from.z)*t;pose.tx=pose.ty=0;drawPose();main.style.opacity=String(1-.28*Math.sin(Math.PI*t));
  })]);
  ensureVisible('#searchInput');await scrollToTarget(FORMULA,420,260);
  await OpeningGuidance.press('#searchInput',OpeningGuidance.hit('#searchInput'));
  const input=find('#searchInput');input.value='';
  await OpeningGuidance.glide({x:box('#searchInput').x+box('#searchInput').w+30,y:box('#searchInput').y+35},260,8);
  for(const c of SEARCH_QUERY){input.value+=c;await wait(42);}
  hide('searchResultsPanel',false);const results=find('#searchResultsPanel');
  await results.animate([{opacity:0,transform:'translateY(-8px)'},{opacity:1,transform:'none'}],{duration:280,easing:'cubic-bezier(.22,.7,.2,1)'}).finished;
  await wait(100);
  step=5;resetUI(5);mathState(5);await layout(5,false);await OpeningGuidance.park(5,420);readingFocus(5);
 }finally{main.style.opacity='';pointer.style.opacity='';}
}
