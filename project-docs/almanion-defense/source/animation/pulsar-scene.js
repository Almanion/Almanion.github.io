/* The distant destination belongs to the whole route. Only the final stop
   has an autonomous loop; ordinary teaching checkpoints remain still. */
window.PulsarScene=(()=>{
 const FINAL=34,END_TIME=8.5,DURATION=6600,clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x))},mix=(a,b,t)=>a+(b-a)*t;
 let renderer,frame=0,epoch=0,clock=END_TIME,lastPaint=0,paused=false,quiet=false,current=0,route=null,travel=false,fragments=[],finalView={x:1230,y:535,r:97},flightFrame=null;
 const layers=['site','panel','opening','caption','final','connector','focus','account-story','account-site-label','math-site-label','intro-cue'];
 function viewFor(s){if(s===FINAL)return{...finalView};const index=SCENE_ORDER.indexOf(s),u=Math.max(0,index)/(SCENE_ORDER.length-2);return{x:1878,y:522,r:1.8/(1-.865*u),progress:u};}
 function phaseFor(s){return Math.max(0,SCENE_ORDER.indexOf(s))*.19;}
 function halt(){cancelAnimationFrame(frame);frame=0;}
 function paintFinal(t){renderer.draw(t,finalView,{full:true});renderer.fragments(fragments,{x:finalView.x,y:finalView.y},1,t);}
 function loop(now){frame=0;if(current!==FINAL||paused||quiet||document.hidden)return;const dt=now-lastPaint;if(dt>=1000/60){lastPaint=now-dt%(1000/60);clock=END_TIME+(now-epoch)/1000;paintFinal(clock);}frame=requestAnimationFrame(loop);}
 function resume(){halt();lastPaint=0;if(current===FINAL&&!paused&&!quiet&&!document.hidden){epoch=performance.now()-(clock-END_TIME)*1000;frame=requestAnimationFrame(loop);}}
 function pauseControl(){$('pulsar-pause').disabled=quiet;$('pulsar-pause').textContent=quiet?'Движение отключено':paused?'Продолжить вращение':'Приостановить вращение';$('pulsar-pause').setAttribute('aria-pressed',String(paused||quiet));}
 function decorate(s){
  const on=s===FINAL;$('stage').dataset.pulsarFinal=String(on);$('pulsar-ending').style.opacity=on?'1':'0';$('pulsar-ending').style.visibility=on?'visible':'hidden';$('pulsar-ending').setAttribute('aria-hidden',String(!on));
  $('cursor').style.opacity=on?'0':'';
 }
 function checkpoint(s,reduced){if(!renderer)return;halt();route=null;travel=false;flightFrame=null;current=s;quiet=reduced;paused=false;clock=END_TIME;decorate(s);
  if(s===FINAL){paintFinal(clock);resume();}else renderer.draw(phaseFor(s),viewFor(s));
  pauseControl();
 }
 function begin(from,to,reduced){halt();quiet=reduced;travel=false;route={from:viewFor(from),to:viewFor(to),start:performance.now(),phaseFrom:phaseFor(from),phaseTo:phaseFor(to)};if(from===FINAL||to===FINAL)route=null;}
 function tickTravel(now){
  if(!renderer||quiet||travel||!route)return;const q=smooth((now-route.start)/1000),a=route.from,b=route.to;renderer.draw(mix(route.phaseFrom,route.phaseTo,q),{x:mix(a.x,b.x,q),y:mix(a.y,b.y,q),r:mix(a.r,b.r,q)});
 }
 function setMotion(value){quiet=value;pauseControl();if(current===FINAL){halt();if(value)paintFinal(clock);else resume();}}
 async function init(){
  renderer=createPulsarRenderer($('pulsar'));
  const img=$('cursor-art');await img.decode();const c=document.createElement('canvas');c.width=c.height=80;const x=c.getContext('2d');x.drawImage(img,0,0,80,80);const p=x.getImageData(0,0,80,80).data;
  for(let y=0;y<80;y++)for(let k=0;k<80;k++){const i=(y*80+k)*4;if(p[i+3]<170)continue;const n=fragments.length;fragments.push({x:k*2-64,y:y*2-65,delay:(n%9)/45,drift:Math.sin(n*2.399)*100,lift:30+(n%13)*7,size:.55+(n%4)*.16});}
  $('pulsar-pause').onclick=()=>{paused=!paused;pauseControl();if(paused)halt();else resume();};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)halt();else resume();});
 }
 async function transition(target){
  if(reduced){await direct(target);return;}
  const from=step,reverse=from===FINAL,anchor=reverse?target:from,arrivalTime=reverse?clock:END_TIME;
  // End may be pressed from any chapter. Capture that chapter's actual view.
  if(reverse){const previous=reduced;reduced=true;try{await direct(target)}finally{reduced=previous}}const source={...cursor},far=viewFor(anchor),saved=layers.map(id=>{const n=$(id);return{n,opacity:n?.style.opacity,transform:n?.style.transform,alpha:n?Number(getComputedStyle(n).opacity):0};});
  if(reverse)step=from;
  halt();route=null;travel=true;$('stage').dataset.pulsarFinal='false';$('stage').dataset.pulsarFlight='true';$('pulsar-ending').style.visibility='visible';$('cursor').style.opacity='1';Cosmos.holdFlight(from);
  function frameAt(raw){
   const p=reverse?1-raw:raw,q=Cosmos.volume.flightProgress(clamp((p-.13)/.78)),v={x:mix(far.x,finalView.x,smooth(q)),y:mix(far.y,finalView.y,smooth(q)),r:finalView.r/(1+(finalView.r/far.r-1)*(1-q))},time=mix(phaseFor(anchor),arrivalTime,smooth(p));
   const fade=1-smooth(p/.28);
   for(const item of saved){if(!item.n)continue;item.n.style.opacity=String(item.alpha*fade);}
   $('site').style.transform=`translate(${-135*smooth(p/.35)}px,${-18*smooth(p/.35)}px) scale(${1-.11*smooth(p/.35)})`;
   $('pulsar-ending').style.opacity=String(smooth((p-.81)/.19));
   const lead=OpeningGuidance.path(source,{x:far.x-30,y:far.y+32},clamp(p/.24),-60);
   const orbit=.5+q*1.5,near={x:v.x-Math.cos(orbit)*v.r*2.6,y:v.y+Math.sin(orbit)*v.r*1.8};
   const coupling=smooth((p-.24)/.30);Object.assign(cursor,{x:mix(lead.x,near.x,coupling),y:mix(lead.y,near.y,coupling)});paintCursor();
   const dissolve=smooth((p-.60)/.28);$('cursor').style.opacity=String(1-smooth((p-.63)/.16));
   renderer.draw(time,v,{full:v.r>=8});renderer.fragments(fragments,cursor,dissolve,time);
   Cosmos.setFlight(raw,v.x,v.y,reverse,{from,to:target,duration:DURATION/1000,start:reverse?.09:.13,span:.78});
   flightFrame={progress:p,cursor:{...cursor},dissolve,view:v,time};$('stage').dataset.pulsarProgress=p.toFixed(4);
  }
  try{frameAt(0);await tween(DURATION,frameAt,true);}
  finally{
   for(const item of saved){if(item.n){item.n.style.opacity=item.opacity;item.n.style.transform=item.transform;}}
   $('stage').dataset.pulsarFlight='false';delete $('stage').dataset.pulsarProgress;travel=false;await direct(target);Cosmos.finishFlight();
  }
 }
 return{init,decorate,checkpoint,begin,tickTravel,setMotion,transition,viewFor,get active(){return !!frame},get paused(){return paused},get stats(){return{...renderer?.stats,fragmentCount:fragments.length,time:clock,flight:flightFrame}},FINAL};
})();
