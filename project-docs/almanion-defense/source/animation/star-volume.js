/* Perspective star volume. Coordinates are world units; +Z looks into space.
   px = cx + focal * (X - camera.x) / (Z - camera.z).
   Design/reference notes: Starfield-research.txt. No accumulated frame deltas. */
function createStarVolume(nightSky){
 const W=1920,H=1080,F=1100,CX=960,CY=540,cache=new Map();
 // One fixed object in the SAME world as the star catalogue. Its final framing
 // is reached by moving the camera, never by scaling a separate screen sprite.
 const pulsar=Object.freeze({wx:0,wy:-1.6,z:8,radius:.032,arrival:{x:1230,y:535,r:97}});
 const bands=[{name:'cloud',min:95,max:180},{name:'far',min:25,max:60},{name:'middle',min:8,max:18},{name:'near',min:3.2,max:6.8}];
 let seed=410731;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const stars=nightSky.starCatalog.map((s,i)=>{
  const layer=i>=2900?0:i<1800?1:i<2650?2:3,b=bands[layer],z=b.min+random()*(b.max-b.min);
  return{...s,layer,z,wx:(s.x-CX)*z/F,wy:(s.y-CY)*z/F};
 });
 const groups=bands.map((_,i)=>stars.filter(s=>s.layer===i));
 // Small cached luminous sprites; no per-star gradient allocation per frame.
 const halos=new Map();
 for(const color of new Set(stars.map(s=>s.color))){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,`rgba(${color},.4)`);g.addColorStop(.25,`rgba(${color},.12)`);g.addColorStop(1,`rgba(${color},0)`);x.fillStyle=g;x.fillRect(0,0,64,64);halos.set(color,c);}
 const shade=document.createElement('canvas');shade.width=W;shade.height=H;const sh=shade.getContext('2d'),gradient=sh.createRadialGradient(320,485,80,340,485,660);gradient.addColorStop(0,'rgba(3,8,18,.8)');gradient.addColorStop(.58,'rgba(3,8,18,.4)');gradient.addColorStop(1,'rgba(3,8,18,0)');sh.fillStyle=gradient;sh.fillRect(0,0,W,H);
 function project(s,c){const depth=Math.max(.2,s.z-c.z);return{x:CX+F*(s.wx-c.x)/depth,y:CY+F*(s.wy-c.y)/depth,size:s.z/depth};}
 function render(ctx,camera,previous=camera,shutter=.036,occlusion=[]){
  const begin=performance.now(),motion=Array.from({length:4},()=>({count:0,distance:0,max:0}));let streaks=0,visible=0;
  ctx.clearRect(0,0,W,H);ctx.drawImage(nightSky.nebula,-4-camera.x*4,-4-camera.y*4,W+8,H+8);
  // Far-to-near painting preserves the depth hierarchy without depth sorting.
  for(let layer=0;layer<4;layer++)for(const s of groups[layer]){
   if(s.z-camera.z<=.25)continue; // Stars passed by the camera leave the volume.
   const p=project(s,camera),q=project(s,previous),dx=p.x-q.x,dy=p.y-q.y,distance=Math.hypot(dx,dy),stats=motion[layer];
   stats.count++;stats.distance+=distance/shutter;stats.max=Math.max(stats.max,distance/shutter);
   const radius=Math.min(3.4,s.r*Math.pow(p.size,.62));
   if(p.x< -70||p.x>W+70||p.y< -70||p.y>H+70)continue;
   // Opaque presentation windows hide these pixels. The 64px inset keeps
   // luminous edges and shutter trails intact around the rounded frame.
   if(occlusion.some(r=>p.x>r.x+64&&p.x<r.x+r.w-64&&p.y>r.y+64&&p.y<r.y+r.h-64))continue;
   visible++;
   const alpha=Math.min(.94,s.alpha*(1+Math.max(0,p.size-1)*.1));
   // Exposure is sampled from the same camera path, independent of FPS.
   if(distance>.55){
    const length=Math.min(55,distance),tx=dx/distance*length,ty=dy/distance*length;
    ctx.strokeStyle=`rgba(${s.color},${alpha*.18})`;ctx.lineWidth=Math.max(.45,radius*.85);ctx.beginPath();ctx.moveTo(p.x-tx,p.y-ty);ctx.lineTo(p.x,p.y);ctx.stroke();
    ctx.strokeStyle=`rgba(${s.color},${alpha*.36})`;ctx.lineWidth=Math.max(.4,radius*.65);ctx.beginPath();ctx.moveTo(p.x-tx*.48,p.y-ty*.48);ctx.lineTo(p.x,p.y);ctx.stroke();streaks++;
   }
   if(s.halo||layer===3&&s.r>.95){const size=radius*18;ctx.globalAlpha=alpha;ctx.drawImage(halos.get(s.color),p.x-size/2,p.y-size/2,size,size);ctx.globalAlpha=1;}
   ctx.fillStyle=`rgba(${s.color},${alpha})`;
   if(radius<.45)ctx.fillRect(p.x-radius,p.y-radius,radius*2,radius*2);else{ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();}
  }
  ctx.drawImage(shade,0,0);
  return{streaks,visible,drawMs:performance.now()-begin,layers:motion.map((s,i)=>({name:bands[i].name,count:s.count,meanSpeed:s.count?s.distance/s.count:0,maxSpeed:s.max}))};
 }
 function still(ctx,camera){const key=[camera.x,camera.y,camera.z].join(',');let item=cache.get(key);if(!item){const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const stats=render(canvas.getContext('2d'),camera);item={canvas,stats};cache.set(key,item);if(cache.size>4)cache.delete(cache.keys().next().value);}ctx.clearRect(0,0,W,H);ctx.drawImage(item.canvas,0,0);return{...item.stats,drawMs:0};}
 function at(s){
  if(s===34){const d=F*pulsar.radius/pulsar.arrival.r;return{x:pulsar.wx-(pulsar.arrival.x-CX)*d/F,y:pulsar.wy-(pulsar.arrival.y-CY)*d/F,z:pulsar.z-d};}
  if(s===33)return{x:-.035,y:.02,z:-1.05};
  const points=[
   [0,0,-2.2],[-.08,.04,.1],[-.42,.23,1.15],[-.46,.22,1.28],[-.40,.12,1.46],[-.49,.15,1.42],[-.41,.20,1.50],[-.40,.20,1.50],[-.40,.20,1.50],[-.41,.20,1.50],
   [-.08,.04,.1],[-.10,.02,.2],[-.10,.02,.2],[-.08,.04,.1],[-.42,.23,1.15],[.08,.12,1.45],[.04,.12,1.40],[.02,.08,1.58],
   [.02,.08,1.58],[.02,.08,1.58],[.02,.08,1.58],[.02,.08,1.58],[.02,.08,1.58],[.02,.08,1.58],[.02,.08,1.58],[.02,.08,1.58],[.02,.08,1.58],[.02,.08,1.58],[-.12,0,1.72],[0,0,0],[-.32,.20,1.67],[-.32,.20,1.67],[-.32,.20,1.67]
  ];const [x,y,z]=points[Math.max(0,Math.min(33,s))];return{x,y,z};
 }
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*t*(10+t*(-15+6*t));};
 function path(from,to,t){const q=smooth(t);return{x:from.x+(to.x-from.x)*q,y:from.y+(to.y-from.y)*q,z:from.z+(to.z-from.z)*q};}
 // Integrate a smooth velocity ramp, a short cruise, and its mirrored brake.
 // This gives the jump time to read without overshoot or a moving checkpoint.
 const ramp=.28;
 function flightSpeed(t){t=Math.max(0,Math.min(1,t));return smooth(Math.min(t,1-t)/ramp);}
 function flightProgress(t){
  t=Math.max(0,Math.min(1,t));
  if(t>1-ramp)return 1-flightProgress(1-t);
  if(t>=ramp)return(t-ramp/2)/(1-ramp);
  const u=t/ramp;return ramp*u*u*u*u*(2.5-3*u+u*u)/(1-ramp);
 }
 function flightPath(from,to,t,landmark=null){const q=flightProgress(t);
  if(landmark){
   // Logarithmic optical distance makes the long approach legible throughout.
   // Both the stars and destination use the resulting physical camera pose.
   const a=project(landmark,from),b=project(landmark,to),d=Math.exp(Math.log(landmark.z-from.z)*(1-q)+Math.log(landmark.z-to.z)*q),u=smooth(q),x=a.x+(b.x-a.x)*u,y=a.y+(b.y-a.y)*u;
   return{x:landmark.wx-(x-CX)*d/F,y:landmark.wy-(y-CY)*d/F,z:landmark.z-d};
  }
  return{x:from.x+(to.x-from.x)*q,y:from.y+(to.y-from.y)*q,z:from.z+(to.z-from.z)*q};
 }
 return{render,still,at,path,flightPath,flightProgress,flightSpeed,project,smooth,stars,bands,pulsar,focal:F,get cacheSize(){return cache.size}};
}
