/* Three permanent objects in the star field also mark the three chapters.
   Ordinary slides keep a fixed camera; only chapter boundaries move it. */
window.NebulaJourney=(()=>{
 const stage=document.getElementById('stage'),F=1100,insideZ=3.45,slideZ=3.78;
 const entry={x:.08,y:.12,z:1.45},isOverview=s=>s===15||s===NEBULA_RETURN;
 const homes=[[1230,520,145,-.32],[1670,520,145,.38],[1450,810,140,-.7]];
 const clouds=homes.map(([x,y,r,angle],group)=>{const z=4.65,d=z-entry.z;return{group,wx:entry.x+(x-960)*d/F,wy:entry.y+(y-540)*d/F,z,r:r*d/F,angle};});
 const cameras=clouds.map(n=>{const d=n.z-insideZ;return{x:n.wx-380*d/F,y:n.wy,z:insideZ};});
 const nodes=LEARNING_ORDER.slice(1).map((s,i)=>({s,index:i,group:learningGroup(s),camera:{...cameras[learningGroup(s)]}}));
 const textures=[];let active=false,travel=false,position=15,flight=null,stats={clouds:0,drawMs:0};
 const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x))},mix=(a,b,t)=>a+(b-a)*t;
 const owns=s=>LEARNING_ORDER.includes(s)||s===NEBULA_RETURN;
 function cameraAt(s){if(isOverview(s))return{...entry};return LEARNING_ORDER.includes(s)?{...cameras[learningGroup(s)]}:null;}
 const pointerAt=()=>({x:1856,y:976});
 async function init(){
  const image=new Image();image.src=NEBULA_IMAGE;await image.decode();
  for(const hue of [0,32,-28]){
   const sharp=document.createElement('canvas');sharp.width=960;sharp.height=1152;const g=sharp.getContext('2d');
   // Preserve the photographic dust lanes while dissolving the image into
   // the star field along a broad ellipse, with no straight edges or rim.
   g.filter=`saturate(.85) hue-rotate(${hue}deg)`;g.drawImage(image,250,180,800,960,0,0,960,1152);g.filter='none';g.globalCompositeOperation='destination-in';
   g.save();g.translate(480,576);g.scale(480,576);
   const mask=g.createRadialGradient(0,-.04,.08,0,0,.98);
   for(const [stop,alpha] of [[0,1],[.24,1],[.48,.86],[.68,.43],[.84,.09],[1,0]])mask.addColorStop(stop,`rgba(255,255,255,${alpha})`);
   g.fillStyle=mask;g.fillRect(-1,-1,2,2);g.restore();
   const soft=document.createElement('canvas');soft.width=960;soft.height=1152;const h=soft.getContext('2d');h.filter='blur(10px)';h.drawImage(sharp,0,0);textures.push({sharp,soft});
  }
 }
 function visibleClouds(camera){return clouds.filter(n=>{const d=n.z-camera.z;if(d<=.2)return false;const p=Cosmos.volume.project(n,camera),r=F*n.r/d;return p.x+r*1.6>=0&&p.x-r*1.6<=1920&&p.y+r*1.6>=0&&p.y-r*1.6<=1080;});}
 function paintBackdrop(context,camera){
  const began=performance.now(),visible=visibleClouds(camera),overview=clamp((insideZ-camera.z)/(insideZ-entry.z));
  if(textures.length){context.save();context.globalCompositeOperation='screen';
   for(const n of visible){const d=n.z-camera.z,p=Cosmos.volume.project(n,camera),r=F*n.r/d,t=textures[n.group];context.save();context.translate(p.x,p.y);context.rotate(n.angle);
    context.globalAlpha=(1-overview)*.32;context.drawImage(t.soft,-r,-r*1.2,r*2,r*2.4);
    context.globalAlpha=.10+.83*overview;context.drawImage(t.sharp,-r,-r*1.2,r*2,r*2.4);context.restore();
   }context.restore();
  }
  stats={...stats,clouds:visible.length,drawMs:performance.now()-began,amount:visible.length?1:0,camera:{...camera}};
 }
 function paint(camera){const count=visibleClouds(camera).length;stats={...stats,clouds:count,camera:{...camera},amount:count?1:0};}
 function decorate(s){
  if(!owns(s))return;const group=learningGroup(s),ids=LEARNING_CHAPTERS[group];
  $('panel').querySelector('.eyebrow').textContent=isOverview(s)?'УЧИТЬ · ТРИ РАЗДЕЛА':`УЧИТЬ · РАЗДЕЛ ${group+1} / 3 · ${ids.indexOf(s)+1} / ${ids.length}`;
  $('model-route').innerHTML=LEARNING_GROUPS.map((name,i)=>`<span class="${i===group?'current':i<group?'passed':''}">${name}</span>`).join('');
 }
 function checkpoint(s){if(travel)return;active=owns(s);position=s;stage.dataset.nebulaActive=String(active);decorate(s);Cosmos.paintFlight();}
 const handles=(from,to)=>owns(from)&&owns(to);
 async function turnPage(from,target){
  // The selection is an actual cursor sequence in the captured Учить menu.
  // Keep the site visible throughout; only the explanation has a transition.
  Cosmos.holdFlight(from);
  if(from===16&&target===17){
   ensureVisible('.kc-type-chip[data-kind="definition"]');await click('.kc-type-chip[data-kind="definition"]');
   const topic='.kc-deck[data-topic="'+TOPIC+'"]';ensureVisible(topic);await click(topic,()=>selection(true));await click('#kcStart');
  }
  const source={...cursor},end=pointerAt(target),html=document.documentElement;
  travel=true;position=from;stage.dataset.nebulaKind='page';html.classList.add('nebula-page-turn');html.classList.toggle('nebula-page-back',LEARNING_ORDER.indexOf(target)<LEARNING_ORDER.indexOf(from));
  const swap=async()=>{await direct(target);position=target;decorate(target);Object.assign(cursor,source);paintCursor();};
  const record=p=>{Cosmos.setFlight(p,1340,530,false,{from,to:target,start:0,span:1,duration:.55,external:true});Cosmos.paintFlight();flight={from,to:target,kind:'page',progress:p,camera:{...Cosmos.telemetry.camera},cursor:{...cursor},copy:1,offset:{x:0,y:0},scale:1,amount:1,clouds:stats.clouds,scene:position};stage.dataset.nebulaProgress=p.toFixed(4);};
  try{
   record(0);
   if(document.startViewTransition){const view=document.startViewTransition(swap);await view.updateCallbackDone;await view.ready.catch(()=>{});await Promise.all([view.finished.catch(()=>{}),tween(550,record,true)]);}
   else{await swap();await Promise.all([$('panel').animate([{transform:'translateY(10px)'},{transform:'translateY(0)'}],{duration:400,easing:'cubic-bezier(.22,.7,.2,1)'}).finished,tween(400,record,true)]);}
   await moveCursor(end,380);
  }finally{html.classList.remove('nebula-page-turn','nebula-page-back');travel=false;delete stage.dataset.nebulaKind;delete stage.dataset.nebulaProgress;await direct(target);Cosmos.finishFlight();checkpoint(target);}
 }
 async function transition(target){
  if(reduced){await direct(target);return;}
  const from=step,bothInside=!isOverview(from)&&!isOverview(target),kind=bothInside?(learningGroup(from)===learningGroup(target)?'page':'pan'):!isOverview(target)?'enter':'exit';
  if(kind==='page'){await turnPage(from,target);return;}
  const a=Cosmos.volume.at(from),b=Cosmos.volume.at(target),source={...cursor};let end=pointerAt(target);Cosmos.holdFlight(from);
  if(isOverview(target)){const motion=reduced;reduced=true;try{await direct(target);end={...cursor};await direct(from);}finally{reduced=motion;}}
  if(from===15&&target===16){await OpeningGuidance.press('#knowledgeCheckBtn');Object.assign(source,cursor);}
  travel=true;active=true;position=from;stage.dataset.nebulaActive='true';stage.dataset.nebulaTravel='true';stage.dataset.nebulaKind=kind;
  const duration=kind==='pan'?2400:2800,dx=b.x-a.x,dy=b.y-a.y;
  function frameAt(p){
   const q=Cosmos.volume.flightProgress(p),incoming=p>=.5;
   Cosmos.setFlight(p,1340,530,false,{from,to:target,start:0,span:1,duration:duration/1000,external:true});Cosmos.paintFlight();const camera=Cosmos.telemetry.camera,anchor=incoming?b:a;
   const copy=kind==='pan'?(incoming?smooth((q-.63)/.22):1-smooth((q-.15)/.22)):(incoming?smooth((p-.66)/.34):1-smooth(p/.30));
   const x=kind==='pan'?F*(anchor.x-camera.x)/(slideZ-camera.z):0,y=kind==='pan'?F*(anchor.y-camera.y)/(slideZ-camera.z):0;
   stage.style.setProperty('--nebula-copy',copy);stage.style.setProperty('--nebula-x',x+'px');stage.style.setProperty('--nebula-y',y+'px');stage.style.setProperty('--nebula-panel','1');
   const arc=Math.sin(Math.PI*p);Object.assign(cursor,{x:Math.max(40,Math.min(1868,mix(source.x,end.x,smooth(p))+Math.sign(dx)*75*arc)),y:Math.max(45,Math.min(1000,mix(source.y,end.y,smooth(p))+Math.sign(dy)*95*arc))});paintCursor();
   if(incoming&&copy>0){const t=smooth((p-.5)/.5);if(target===21)graph(5*t);if(target===22)graph(5+5*t);if(target===26)graph(GOOD.stability*t,true);if(target===25){$('sv').textContent=fmt(10+(GOOD.stability-10)*t);$('dv').textContent=fmt(5+(GOOD.difficulty-5)*t);}}
   flight={from,to:target,kind,progress:p,camera:{...camera},cursor:{...cursor},copy,offset:{x,y},scale:1,amount:1,clouds:stats.clouds,scene:position};stage.dataset.nebulaProgress=p.toFixed(4);
  }
  try{frameAt(0);await tween(duration*.5,t=>frameAt(t*.5),true);await direct(target);position=target;decorate(target);frameAt(.5);await tween(duration*.5,t=>frameAt(.5+t*.5),true);}
  finally{travel=false;stage.dataset.nebulaTravel='false';delete stage.dataset.nebulaProgress;delete stage.dataset.nebulaKind;for(const key of ['copy','x','y','panel'])stage.style.removeProperty('--nebula-'+key);await direct(target);Cosmos.finishFlight();checkpoint(target);}
 }
 return{init,owns,handles,cameraAt,pointerAt,checkpoint,paint,paintBackdrop,transition,backdropKey:'world',get travelling(){return travel},get stats(){return{...stats,flight}},get nodes(){return nodes.map(n=>({...n,camera:{...n.camera}}))}};
})();
