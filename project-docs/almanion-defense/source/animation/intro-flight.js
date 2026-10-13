/* Three speaker-controlled planes. Absolute camera time, reversible transforms;
   no cloned website, accumulating CSS animations, timers or remote resources. */
const IntroFlight=(()=>{
 const owns=s=>s===0||s===33,clamp=t=>Math.max(0,Math.min(1,t));
 const smooth=t=>{t=clamp(t);return t*t*t*(10+t*(-15+6*t))};
 const demoPose={x:168,y:210,w:1584,h:779,z:1.1,tx:0,ty:0,panel:0};
 const parking={0:{x:1234,y:602},33:{x:1470,y:755}};
 const portal={0:{x:998,y:498},33:{x:1237,y:730}};
 function state(s){
  const title=$('intro-copy'),description=$('intro-description'),site=$('site');
  for(const [n,visible] of [[title,s===0],[description,s===33]]){
   n.style.opacity=visible?'1':'0';n.style.visibility=visible?'visible':'hidden';n.style.transform='none';
   n.setAttribute('aria-hidden',String(!visible));
  }
  site.style.visibility=owns(s)?'hidden':'visible';site.style.opacity='';site.style.transform='';site.style.transformOrigin='';
  $('intro-cue').style.opacity=owns(s)?'1':'0';
  $('route-copy').style.opacity=s===1?'1':'0';$('route-copy').style.transform='none';
  $('stage').dataset.intro=owns(s)?'true':'false';
  delete $('stage').dataset.introProgress;delete $('stage').dataset.introPhase;
 }
 async function park(s){Object.assign(cursor,parking[s]);paintCursor();}
 function pair(a,b){return (a===0&&b===33)||(a===33&&b===0)||(a===33&&b===1)||(a===1&&b===33);}
 async function transition(target){
  const from=step;
  if(reduced||!pair(from,target)){await direct(target);return;}
  const reverse=target===0||from===1,first=(from===0||target===0),sourceID=first?0:33,destID=first?33:1;
  const source=$(first?'intro-copy':'intro-description'),dest=first?$('intro-description'):$('site');
  const sourcePark=parking[sourceID],hit=portal[sourceID],ms=first?3000:3100;
  // Prepare the real homepage once, at its final layout, before animating only
  // its composited transform. The initial hidden surface never occludes stars.
  if(!first){resetUI(1);mathState(1);await layout(1,false);state(from);}
  const arrival=first?parking[33]:OpeningGuidance.point(1,frames.home.contentDocument,demoPose);
  Cosmos.holdFlight(from);
  if(!reverse){await OpeningGuidance.glide(hit,520,-35);Cosmos.press(cursor.x,cursor.y,false);await wait(130);}
  const initialPointer=reverse?arrival:hit,finalPointer=reverse?sourcePark:arrival;
  source.style.visibility='visible';dest.style.visibility='visible';
  source.style.willChange=dest.style.willChange='transform, opacity';
  $('focus').style.opacity=0;$('intro-cue').style.opacity=0;
  const center=first?{x:960,y:501}:{x:960,y:526};
  // The foreground plane is only 22% of the trip away. Pass it early, then
  // keep the distant destination visible throughout the remaining approach.
  // Both scales follow reciprocal depth; reverse retraces the same geometry.
  function paint(raw){
   const p=reverse?1-raw:raw,t=clamp((p-.04)/.90),q=Cosmos.volume.flightProgress(t);
   const departure=clamp(q/.22),out=1/Math.max(.08,1-departure),incoming=1/(5.6-4.6*q);
   source.style.transform=`scale(${out})`;
   source.style.opacity=String(1-smooth((departure-.38)/.62));
   dest.style.transform=`scale(${incoming})`;
   dest.style.transformOrigin='50% 50%';
   dest.style.opacity=String(smooth((q-.035)/.095));
   $('route-copy').style.opacity=first?'0':String(smooth((q-.79)/.21));
   $('intro-cue').style.opacity=first?String(smooth((q-.90)/.10)):String(reverse?smooth((1-q-.9)/.1):0);
   Object.assign(cursor,OpeningGuidance.path(initialPointer,finalPointer,raw,reverse?48:-48));paintCursor();
   $('stage').dataset.introProgress=p.toFixed(4);
   $('stage').dataset.introPhase=q<.22?'departure':q<.66?'passage':q<.9?'approach':'arrival';
   Cosmos.setFlight(raw,center.x,center.y,reverse,{from,to:target,duration:ms/1000,start:reverse?.06:.04,span:.90});
  }
  try{
   paint(0);await tween(ms,paint,true);
  }finally{
   source.style.willChange=dest.style.willChange='';
   // Rebuild the exact checkpoint, shared by Next, Back, Replay and outline.
   await direct(target);Cosmos.finishFlight();
  }
 }
 return{owns,handles:(a,b)=>owns(a)||owns(b),state,park,transition,parking,portal};
})();
