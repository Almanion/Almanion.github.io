/* Four depth bands, a deterministic perspective camera and shutter trails.
   Every checkpoint has a stable pose; reverse travel retraces the same route. */
window.Cosmos=(()=>{
 const sky=document.getElementById('cosmos'),fx=document.getElementById('cosmos-fx');
 const bg=sky.getContext('2d'),fg=fx.getContext('2d'),stage=document.getElementById('stage'),pointer=document.getElementById('cursor');
 const nightSky=createNightSky(),volume=createStarVolume(nightSky);
 let frame=0,started=0,destination=0,mode='drift',bursts=[],quiet=true,flight=null,motion=null,focus={x:960,y:510};
 const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
 let themePhase=null;
 let camera=volume.at(0),route=null,lastStats=null;
 let telemetry={speed:0,travel:0,centerX:960,centerY:540,streaks:0,layers:[]};
 function opaqueWindows(){
  const windows=[],portal=document.querySelector('.physics-portal,.navigation-portal');
  if(portal&&portal.style.visibility!=='hidden')windows.push({x:parseFloat(portal.style.left),y:parseFloat(portal.style.top),w:parseFloat(portal.style.width),h:parseFloat(portal.style.height)});
  const site=document.getElementById('site');
  if(window.DEMO&&Number(site.style.opacity||1)===1&&!site.style.transform)windows.push({x:pose.x,y:pose.y,w:pose.w,h:pose.h});
  return windows;
 }
 function scenery(now=performance.now()){
  let previous=camera,speed=0,cx=960,cy=540;
  if(flight){
   const start=flight.start??.12,span=flight.span??.64,duration=flight.duration??1.85;const time=clamp((flight.progress-start)/span),prior=clamp((flight.progress-.036/duration-start)/span),from=volume.at(flight.from??(flight.reverse?2:1)),to=volume.at(flight.to??(flight.reverse?1:2));
   camera=volume.path(from,to,time);previous=volume.path(from,to,prior);speed=16*time*time*(1-time)*(1-time);cx=flight.x;cy=flight.y;
  }else if(route){
   const t=clamp((now-route.start)/route.duration),previousT=clamp((now-route.start-36)/route.duration);
   camera=volume.path(route.from,route.to,t);previous=volume.path(route.from,route.to,previousT);speed=16*t*t*(1-t)*(1-t);
  }
  const moving=Math.hypot(camera.x-previous.x,camera.y-previous.y,camera.z-previous.z)>.0000001;
  const stats=moving?volume.render(bg,camera,previous,.036,opaqueWindows()):volume.still(bg,camera);lastStats=stats;
  telemetry={speed:moving?speed:0,travel:camera.z,centerX:cx,centerY:cy,...stats,camera:{...camera}};
 }
 function particles(now){
  fg.clearRect(0,0,1920,1080);bursts=bursts.filter(b=>now-b.at<760);
  for(const b of bursts){const t=clamp((now-b.at)/760),alpha=Math.min(1,t/.055)*Math.pow(1-t,1.6),g=fg.createRadialGradient(b.x,b.y,0,b.x,b.y,43);
   g.addColorStop(0,'rgba(166,197,233,'+(alpha*.19)+')');g.addColorStop(1,'rgba(133,165,203,0)');fg.fillStyle=g;fg.fillRect(b.x-43,b.y-43,86,86);
   for(const s of b.stars){
    const distance=s.speed*(1-Math.exp(-3.8*t)),trail=(3+16*s.depth)*Math.exp(-3*t),dx=Math.cos(s.angle),dy=Math.sin(s.angle);
    const x=b.x+dx*distance,y=b.y+dy*distance+7*t*t*s.depth,a=alpha*s.alpha,r=s.radius*(1-.3*t);
    const tail=fg.createLinearGradient(x-dx*trail,y-dy*trail,x,y);tail.addColorStop(0,`rgba(${s.color},0)`);tail.addColorStop(1,`rgba(${s.color},${a*.7})`);fg.strokeStyle=tail;fg.lineWidth=r*.75;fg.beginPath();fg.moveTo(x-dx*trail,y-dy*trail);fg.lineTo(x,y);fg.stroke();
    const halo=fg.createRadialGradient(x,y,0,x,y,r*5);halo.addColorStop(0,`rgba(${s.color},${a*.55})`);halo.addColorStop(.25,`rgba(${s.color},${a*.2})`);halo.addColorStop(1,`rgba(${s.color},0)`);fg.fillStyle=halo;fg.fillRect(x-r*5,y-r*5,r*10,r*10);
    fg.fillStyle=`rgba(${s.color},${a})`;fg.beginPath();fg.arc(x,y,r,0,Math.PI*2);fg.fill();
    if(s.sparkle){fg.strokeStyle=`rgba(${s.color},${a*.5})`;fg.lineWidth=.65;fg.beginPath();fg.moveTo(x-r*3.2,y);fg.lineTo(x+r*3.2,y);fg.moveTo(x,y-r*3.2);fg.lineTo(x,y+r*3.2);fg.stroke();}
   }
  }
  const newest=bursts.at(-1),ms=newest?now-newest.at:1000;
  pointer.style.scale=String(ms<80?1-.07*Math.sin(ms/80*Math.PI/2):ms<520?1-.07*Math.exp(-(ms-80)/105)*Math.cos((ms-80)/82):1);
 }
 function tick(now){scenery(now);if(themePhase!==null){bg.globalAlpha=Math.sin(Math.PI*themePhase)*.24;bg.globalCompositeOperation='screen';bg.drawImage(sky,0,0);bg.globalAlpha=1;bg.globalCompositeOperation='source-over';}particles(now);if(currentPage==='home'){const t=now-started;HomeBackground.tick(t,(cursor.x-pose.x-pose.tx)/pose.z,(cursor.y-pose.y-42-pose.ty)/pose.z,Math.min(1,t/260));}frame=requestAnimationFrame(tick);}
 function stop(s=destination){HomeBackground.stop();cancelAnimationFrame(frame);frame=0;destination=s;flight=null;motion=null;route=null;camera=volume.at(s);themePhase=null;bursts=[];fg.clearRect(0,0,1920,1080);pointer.style.scale='1';pointer.style.rotate='0deg';stage.style.setProperty('--space-pulse','0');scenery();stage.dataset.spaceMoving='false';stage.dataset.flight='false';}
 function begin(from,to,reduced){stop(from);destination=to;quiet=reduced;mode=[2,10,14,28,29].includes(to)?'warp':[15,16,19,20,23,26].includes(to)?'orbit':'drift';stage.dataset.spaceMode=mode;if(quiet)return;started=performance.now();
  const a=volume.at(from),b=volume.at(to),distance=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  if(distance>.00001&&pageForStep(from)===pageForStep(to)&&!([3,6].includes(to)&&to===from+1))route={from:a,to:b,start:started,duration:Math.min(1350,520+distance*580)};
  HomeBackground.begin();stage.dataset.spaceMoving='true';frame=requestAnimationFrame(tick);}
 function press(x,y,reduced){if(reduced||quiet)return;let seed=(Math.round(x*31+y*17)^20261012)>>>0;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};const stars=Array.from({length:28},(_,i)=>{const depth=rand();return{angle:i/28*Math.PI*2+(rand()-.5)*.24,depth,speed:38+depth*104,radius:.6+depth*1.25,alpha:.5+rand()*.5,color:i%7===0?'239,208,164':'176,211,250',sparkle:i%9===0}});bursts.push({x,y,stars,at:performance.now()});bursts=bursts.slice(-3);focus={x,y};}
 async function settle(){const remaining=Math.max(0,route?route.start+route.duration-performance.now():0,...bursts.map(b=>760-(performance.now()-b.at)));if(remaining>0)await new Promise(r=>setTimeout(r,remaining));}
 // The deterministic camera route supplies continuous movement across several
 // UI tweens; individual UI callbacks no longer restart a short star impulse.
 function cameraMove(from,to,t){if(quiet||flight)return;const distance=Math.hypot((to.x??from.x)-from.x,(to.y??from.y)-from.y)/700+Math.abs((to.z??from.z)-from.z);stage.style.setProperty('--space-pulse',String(Math.sin(Math.PI*t)*Math.min(1,distance)*.45));}
 function holdFlight(from){if(quiet)return;route=null;camera=volume.at(from);flight={progress:0,x:960,y:540,from,to:destination};}
 function setFlight(progress,x,y,reverse=false,options={}){if(quiet)return;route=null;flight={progress,x,y,reverse,...options};stage.dataset.flight='true';}
 function finishFlight(){flight=null;route=null;camera=volume.at(destination);scenery();stage.dataset.flight='false';}
 function steer(){pointer.style.rotate='0deg';}
 stop(0);return{themeProgress:p=>{themePhase=p},begin,stop,press,settle,steer,cameraMove,holdFlight,setFlight,finishFlight,get active(){return !!frame},get particleCount(){return bursts.reduce((n,b)=>n+b.stars.length,0)},get burstState(){return bursts.map(b=>({x:b.x,y:b.y,age:performance.now()-b.at,count:b.stars.length}))},get mode(){return mode},get telemetry(){return {...telemetry}},volume};
})();
