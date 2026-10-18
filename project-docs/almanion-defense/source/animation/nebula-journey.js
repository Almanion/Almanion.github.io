/* Real nebula texture (ESO, CC BY 4.0), projected by the shared star camera.
   No background timers: every frame belongs to the controlled transition. */
window.NebulaJourney=(()=>{
 const canvas=document.getElementById('learning-nebulae'),veil=document.getElementById('nebula-veil'),ctx=canvas.getContext('2d'),fog=veil.getContext('2d'),stage=document.getElementById('stage');
 const entry={x:.08,y:.12,z:1.45},colors=['#7aaed7','#a98bd2','#6caaa9','#ad9bc9','#9c91cd'];
 const homes=[[1250,620],[1630,710],[1520,470],[1740,570],[1190,430]],nodes=LEARNING_ORDER.slice(1).map((s,i)=>{
  const z=2.55+i*.14,[x,y]=homes[i%homes.length],d=z-entry.z;
  return{s,wx:entry.x+(x-960)*d/1100,wy:entry.y+(y-540)*d/1100,z,radius:.22,index:i,group:learningGroup(s)};
 });
 const sprites=[];let active=false,travel=false,position=15,progress=0,lastKey='',flight=null,stats={clouds:0,drawMs:0};
 const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x)},mix=(a,b,t)=>a+(b-a)*t;
 const owns=s=>LEARNING_ORDER.includes(s);
 const nodeAt=s=>nodes.find(n=>n.s===s);
 function cameraAt(s){if(!owns(s))return null;if(s===15)return{...entry};const n=nodeAt(s),d=.75;return{x:n.wx-(1340-960)*d/1100,y:n.wy-(530-540)*d/1100,z:n.z-d};}
 function pointerAt(s){const i=Math.max(0,LEARNING_ORDER.indexOf(s));return{x:1860,y:390+(i%4)*145};}
 async function init(){
  const image=new Image();image.src=NEBULA_IMAGE;await image.decode();
  for(const color of colors){const c=document.createElement('canvas');c.width=c.height=768;const g=c.getContext('2d');g.drawImage(image,0,0,768,768);
   g.globalCompositeOperation='source-atop';g.globalAlpha=.24;g.fillStyle=color;g.fillRect(0,0,768,768);g.globalAlpha=1;
   g.globalCompositeOperation='destination-in';const mask=g.createRadialGradient(384,384,40,384,384,370);mask.addColorStop(0,'#fff');mask.addColorStop(.35,'#fff');mask.addColorStop(.7,'#ffffff80');mask.addColorStop(1,'#ffffff00');g.fillStyle=mask;g.fillRect(0,0,768,768);sprites.push(c);
  }
 }
 function cloud(context,n,p,r,alpha){context.save();context.translate(p.x,p.y);context.rotate((n.index%3-1)*.28);context.globalAlpha=alpha;context.globalCompositeOperation='screen';context.drawImage(sprites[n.group],-r,-r*.82,r*2,r*1.64);context.restore();}
 function paint(camera){
  if(!sprites.length)return;const key=[active,position,travel,progress,...Object.values(camera)].join(':');if(key===lastKey)return;lastKey=key;const began=performance.now();ctx.clearRect(0,0,1920,1080);
  if(!active){stats={clouds:0,drawMs:performance.now()-began};return;}
  const index=Math.max(0,LEARNING_ORDER.indexOf(position)-1),map=position===15;let count=0;
  const range=map?nodes.slice(0,3):nodes.slice(Math.max(0,index-1),index+4);
  for(const n of range){const d=n.z-camera.z;if(d<.08)continue;const p=Cosmos.volume.project(n,camera),r=Math.min(1450,1100*n.radius/d),current=n.s===position;
   if(p.x+r<790||p.x-r>1920||p.y+r<80||p.y-r>1030)continue;
   const alpha=map?.57:travel?.26:current?.10:.025;cloud(ctx,n,p,map?Math.min(205,r):r*2.4,alpha);count++;
  }
  stats={clouds:count,drawMs:performance.now()-began,camera:{...camera}};
 }
 function decorate(s){
  const panel=$('panel');if(!owns(s))return;
  const group=learningGroup(s);panel.querySelector('.eyebrow').textContent=`УЧИТЬ · ${String(LEARNING_ORDER.indexOf(s)+1).padStart(2,'0')} / ${LEARNING_ORDER.length}`;
  $('model-route').innerHTML=LEARNING_GROUPS.map((name,i)=>`<span class="${i===group?'current':i<group?'passed':''}">${name}</span>`).join('');
 }
 function checkpoint(s){if(travel)return;active=owns(s);position=s;progress=0;stage.dataset.nebulaActive=String(active);decorate(s);lastKey='';fog.clearRect(0,0,1920,1080);paint(Cosmos.volume.at(s));}
 function handles(from,to){return owns(from)&&owns(to);}
 async function transition(target){
  if(reduced){await direct(target);return;}
  const from=step,reverse=LEARNING_ORDER.indexOf(target)<LEARNING_ORDER.indexOf(from),source={...cursor};let end=pointerAt(target);
  if(target===15){const motion=reduced;reduced=true;try{await direct(target);end={...cursor};await direct(from);}finally{reduced=motion;}}
  if(from===15&&target===16){await OpeningGuidance.press('#knowledgeCheckBtn');Object.assign(source,cursor);}
  travel=true;active=true;position=from;stage.dataset.nebulaActive='true';stage.dataset.nebulaTravel='true';Cosmos.holdFlight(from);
  const duration=2300,upper=reverse?from:target,targetNode=nodeAt(upper)||nodes[0],lo=reverse?end:source,hi=reverse?source:end;
  function frameAt(p){
   progress=p;Cosmos.setFlight(p,1340,530,reverse,{from,to:target,start:0,span:1,duration:duration/1000,external:true});Cosmos.paintFlight();
   const camera=Cosmos.telemetry.camera,projected=Cosmos.volume.project(targetNode,camera),portal={x:Math.max(1040,Math.min(1740,projected.x)),y:Math.max(350,Math.min(800,projected.y))};
   const q=reverse?1-p:p,arc=Math.sin(Math.PI*q),base=OpeningGuidance.path(lo,hi,q,-230);
   const capture=smooth((q-.12)/.27)*(1-smooth((q-.73)/.23));Object.assign(cursor,{x:mix(base.x,portal.x,capture),y:mix(base.y,portal.y,capture)});paintCursor();
   const incoming=smooth((p-.66)/.31),outgoing=1-smooth(p/.25),copy=p<.5?outgoing:incoming;
   if(p>.66){if(target===21)graph(5*incoming);if(target===22)graph(5+5*incoming);if(target===26)graph(GOOD.stability*incoming,true);if(target===25){$('sv').textContent=fmt(10+(GOOD.stability-10)*incoming);$('dv').textContent=fmt(5+(GOOD.difficulty-5)*incoming);}}
   stage.style.setProperty('--nebula-copy',copy);stage.style.setProperty('--nebula-scale',String(p<.5?1+.06*(1-outgoing):.91+.09*incoming));stage.style.setProperty('--nebula-offset',(p<.5?-15*(1-outgoing):24*(1-incoming))+'px');stage.style.setProperty('--nebula-reveal',(p<.5?1200:incoming*1400)+'px');stage.style.setProperty('--nebula-site',String(1-.38*arc));
   fog.clearRect(0,0,1920,1080);const wash=Math.pow(Math.sin(Math.PI*p),3);
   if(wash>.001){const shade=fog.createRadialGradient(1340,540,100,1340,540,1400);shade.addColorStop(0,`rgba(10,20,42,${wash*.96})`);shade.addColorStop(.7,`rgba(10,20,42,${wash*.8})`);shade.addColorStop(1,'rgba(5,10,24,0)');fog.fillStyle=shade;fog.fillRect(0,0,1920,1080);cloud(fog,targetNode,portal,320+wash*1050,wash*.78);}
   flight={from,to:target,progress:p,reverse,camera:{...camera},cursor:{...cursor},copy,clouds:stats.clouds};stage.dataset.nebulaProgress=p.toFixed(4);
  }
  try{
   frameAt(0);await tween(duration*.5,t=>frameAt(t*.5),true);
   await direct(target);position=target;decorate(target);
   await tween(duration*.5,t=>frameAt(.5+t*.5),true);
  }finally{
   travel=false;stage.dataset.nebulaTravel='false';delete stage.dataset.nebulaProgress;
   for(const key of ['copy','scale','offset','reveal','site'])stage.style.removeProperty('--nebula-'+key);
   fog.clearRect(0,0,1920,1080);await direct(target);Cosmos.finishFlight();checkpoint(target);
  }
 }
 return{init,owns,handles,cameraAt,pointerAt,checkpoint,paint,transition,get travelling(){return travel},get stats(){return{...stats,flight}},get nodes(){return nodes.map(n=>({...n}))}};
})();
