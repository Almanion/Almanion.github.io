/* One world, one camera. The ordinary pulsar has no private position, scale
   tween or clock. Cosmos supplies its camera atomically with each star frame. */
window.PulsarScene=(()=>{
 const FINAL=34,BEACON_TIME=1.6,END_TIME=8.5,DURATION=6600,BREAK=.27,SHATTER=.25,CAPTURE=.94,clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x))},mix=(a,b,t)=>a+(b-a)*t;
 let renderer,shards,frame=0,epoch=0,clock=END_TIME,lastPaint=0,paused=false,quiet=false,current=0,travel=false,flightFrame=null,spaceKey='',spaceCamera=null;
 const finalView={...Cosmos.volume.pulsar.arrival},layers=['site','panel','opening','caption','final','connector','focus','account-story','account-site-label','math-site-label','intro-cue'];
 function viewAt(camera){const world=Cosmos.volume.pulsar,p=Cosmos.volume.project(world,camera);return{x:p.x,y:p.y,r:Cosmos.volume.focal*world.radius/(world.z-camera.z)};}
 const viewFor=s=>viewAt(Cosmos.volume.at(s));
 function halt(){cancelAnimationFrame(frame);frame=0;}
 function paintFinal(t){renderer.draw(t,finalView,{full:true});shards.draw(finalView,1,t,renderer,finalView);}
 function loop(now){frame=0;if(current!==FINAL||paused||quiet||document.hidden)return;const dt=now-lastPaint;if(dt>=1000/60){lastPaint=now-dt%(1000/60);clock=END_TIME+(now-epoch)/1000;paintFinal(clock);}frame=requestAnimationFrame(loop);}
 function resume(){halt();lastPaint=0;if(current===FINAL&&!paused&&!quiet&&!document.hidden){epoch=performance.now()-(clock-END_TIME)*1000;frame=requestAnimationFrame(loop);}}
 function pauseControl(){$('pulsar-pause').disabled=quiet;$('pulsar-pause').textContent=quiet?'Движение отключено':paused?'Продолжить вращение':'Приостановить вращение';$('pulsar-pause').setAttribute('aria-pressed',String(paused||quiet));}
 function decorate(s){
  const on=s===FINAL;$('stage').dataset.pulsarFinal=String(on);$('pulsar-ending').style.opacity=on?'1':'0';$('pulsar-ending').style.visibility=on?'visible':'hidden';$('pulsar-ending').setAttribute('aria-hidden',String(!on));
  $('cursor').style.opacity='1';$('cursor').style.visibility=on?'hidden':'visible';if(!on)shards?.clear();
 }
 function paintSpace(camera){
  if(!renderer||travel||current===FINAL)return;spaceCamera={...camera};const key=[camera.x,camera.y,camera.z].join(',');if(key===spaceKey)return;spaceKey=key;renderer.draw(BEACON_TIME,viewAt(camera));
 }
 function checkpoint(s,reduced){if(!renderer)return;halt();travel=false;flightFrame=null;current=s;quiet=reduced;paused=false;clock=END_TIME;spaceKey='';decorate(s);
  if(s===FINAL){paintFinal(clock);resume();}else paintSpace(Cosmos.volume.at(s));pauseControl();
 }
 function begin(from,to,reduced){halt();quiet=reduced;travel=false;}
 function setMotion(value){quiet=value;pauseControl();if(current===FINAL){halt();if(value)paintFinal(clock);else resume();}}
 async function init(){
  renderer=createPulsarRenderer($('pulsar'));renderer.prepareBeacon();const img=$('cursor-art');await img.decode();shards=createCursorFragments($('cursor-fragments'),img);
  $('pulsar-pause').onclick=()=>{paused=!paused;pauseControl();if(paused)halt();else resume();};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)halt();else resume();});
 }
 async function transition(target){
  if(reduced){await direct(target);return;}
  const from=step,reverse=from===FINAL,anchor=reverse?target:from,arrivalTime=reverse?clock:END_TIME;
  if(reverse){const previous=reduced;reduced=true;try{await direct(target)}finally{reduced=previous}}
  const source={...cursor},saved=layers.map(id=>{const n=$(id);return{n,opacity:n?.style.opacity,transform:n?.style.transform,alpha:n?Number(getComputedStyle(n).opacity):0};});
  const fromCamera=Cosmos.volume.at(anchor),toCamera=Cosmos.volume.at(FINAL);
  // Steer towards the visible landmark, rather than its future screen position.
  // The arrow is already approaching it when the first pieces detach.
  const carrier=p=>{const v=viewAt(Cosmos.volume.flightPath(fromCamera,toCamera,clamp((p-.13)/.78),Cosmos.volume.pulsar));return OpeningGuidance.path(source,{x:v.x-60,y:v.y+55},clamp(p/.62),24);};
  const materialRoute=shards.flightRoute(carrier,BREAK,SHATTER,CAPTURE);
  if(reverse)step=from;halt();travel=true;spaceKey='';$('stage').dataset.pulsarFinal='false';$('stage').dataset.pulsarFlight='true';$('pulsar-ending').style.visibility='visible';$('cursor').style.opacity='1';Cosmos.holdFlight(from);
  function frameAt(raw){
   const p=reverse?1-raw:raw,time=mix(BEACON_TIME,arrivalTime,smooth(p));
   // An explicit frame owns BOTH canvases. No independent interpolation and
   // no one-frame lag between the landmark and the surrounding stars.
   Cosmos.setFlight(raw,960,540,reverse,{from,to:target,duration:DURATION/1000,start:reverse?.09:.13,span:.78,external:true});Cosmos.paintFlight();
   spaceCamera={...Cosmos.telemetry.camera};const v=viewAt(spaceCamera),fade=1-smooth(p/.28);
   for(const item of saved)if(item.n)item.n.style.opacity=String(item.alpha*fade);
   $('site').style.transform=`translate(${-135*smooth(p/.35)}px,${-18*smooth(p/.35)}px) scale(${1-.11*smooth(p/.35)})`;
   $('pulsar-ending').style.opacity=String(smooth((p-.81)/.19));
   const point=carrier(p);
   Object.assign(cursor,point);paintCursor();renderer.draw(time,v,{full:true});
   const fracture=clamp((p-BREAK)/SHATTER),replaced=p>=BREAK;$('cursor').style.visibility=replaced?'hidden':'visible';
   if(replaced)shards.draw(point,fracture,time,renderer,v,{progress:p,route:materialRoute});else shards.clear();
   flightFrame={progress:p,cursor:{...cursor},fracture,view:v,time,replaced};$('stage').dataset.pulsarProgress=p.toFixed(4);
  }
  try{frameAt(0);await tween(DURATION,frameAt,true);}
  finally{
   for(const item of saved)if(item.n){item.n.style.opacity=item.opacity;item.n.style.transform=item.transform;}
   $('stage').dataset.pulsarFlight='false';delete $('stage').dataset.pulsarProgress;travel=false;await direct(target);Cosmos.finishFlight();
  }
 }
 return{init,decorate,checkpoint,begin,paintSpace,setMotion,transition,viewFor,viewAt,reconstructionError:()=>shards.reconstructionError(),get active(){return !!frame},get paused(){return paused},get stats(){return{...renderer?.stats,fragmentCount:shards?.count,fragments:shards?.stats,camera:spaceCamera,time:clock,flight:flightFrame}},FINAL};
})();
