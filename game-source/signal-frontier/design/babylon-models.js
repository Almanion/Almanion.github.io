import {BabylonView} from '../../../games/signal-frontier/babylon-view.js';
const E=window.SignalEngine,$=id=>document.getElementById(id),catalog=await fetch('BABYLON_ART_REFERENCES.json').then(r=>r.json()),
  view=new BabylonView($('field')),origin={x:180,y:750};
let scene,unit,kind,reference,time=0,previous=0,running=true,frame=0,pose=null;
for(const item of catalog.assets){const option=document.createElement('option');option.value=item.kind;option.textContent=item.title;$('model').append(option);}
function layout(){
  const aside=document.querySelector('aside'),stage=$('stage');
  if(innerWidth<=700&&innerHeight>innerWidth){
    const top=document.querySelector('header').getBoundingClientRect().bottom+10,bottom=document.querySelector('footer').getBoundingClientRect().top-12,
      height=Math.min(170,Math.max(104,(bottom-top)*.28));
    aside.style.top=top+'px';aside.style.height=height+'px';$('reference').style.height=(height-16)+'px';
    stage.style.top=(top+height+12)+'px';stage.style.bottom=(innerHeight-bottom)+'px';
  }else {aside.removeAttribute('style');stage.removeAttribute('style');$('reference').removeAttribute('style');}
}
function choose(value){
  reference=catalog.assets.find(a=>a.kind===value)||catalog.assets[0];kind=reference.engineKind||reference.kind;
  $('model').value=reference.kind;$('reference').src=reference.preview;$('reference').alt=reference.title+' — выбранный рисунок';
  $('reference-note').textContent=reference.note||reference.promptId+' · исходный рисунок из вашей библиотеки.';
  $('angle').value=E.C[kind].speed?'35':'0';
  scene=E.make('classic');unit={...E.hero(scene),id:1,kind,team:['rocket','runner'].includes(kind)?1:0,hp:E.C[kind].hp,
    ...origin,angle:0,jobs:[],build:0,cargo:0,path:[],work:'idle',combat:{mode:'idle',angle:0,time:0,total:.65}};
  if(E.construction.shapes[kind])unit.construction={turn:0,footprint:[...E.construction.shapes[kind]],builderId:null};
  if(reference.sector)unit.sector=reference.sector;
  scene.units=[unit];scene.heroId=unit.id;scene.bullets=[];scene.events=[];scene.caches=[];
  scene.relay.unknown=true;scene.terminal.unknown=true;view.reset(scene);time=0;previous=0;pose=null;
  history.replaceState(null,'','#'+reference.kind);layout();paint();
}
function paint(){
  const state=$('state').value,angle=Number($('angle').value)*Math.PI/180,walking=state==='walk'&&E.C[kind].speed>0,
    rect=$('stage').getBoundingClientRect(),building=!E.C[kind].speed,
    w=unit.construction?E.construction.shape(unit)[0]*40:building?E.C[kind].r*1.8:75,
    h=unit.construction?E.construction.shape(unit)[1]*40:building?E.C[kind].r*1.6:70,
    zoom=Math.max(.3,Math.min(building?4:8,rect.width/(w+35),rect.height/((h+(building?95:40))*.73)));
  scene.t=time;scene.reload=state==='reload'?1.1-(time%1.1):0;scene.dashT=0;
  unit.x=origin.x+(walking?Math.cos(angle)*Math.sin(time*.75)*14:0);unit.y=origin.y+(walking?Math.sin(angle)*Math.sin(time*.75)*14:0);
  unit.angle=angle;unit.hp=state==='wreck'?0:state==='damage'?E.C[kind].hp*.35:E.C[kind].hp;
  unit.hit=state==='damage'&&time%1<.1?.1:0;unit.flash=state==='fire'&&time%.8<.1?.1-time%.8:0;
  unit.combat={mode:state==='aim'?'aim':'idle',angle,time:state==='aim'?.65-(time%.65):0,total:.65};unit.wind=unit.combat.time;
  unit.build=state==='build'?6*(1-(time%8)/8):0;unit.cargo=kind==='drone'?Math.floor(time%5):0;unit.work=state==='work'?'gather':'idle';
  if(unit.construction)unit.construction.turn=((Math.round(-angle/(Math.PI/2))%4)+4)%4;
  scene.observationTask={target:null};scene.fog=undefined;
  view.tactical={overview:false,x:origin.x,y:origin.y-12,zoom};
  const ui={mode:'tactical',modelPreview:true,reduced:false,selectionIds:[],mapArea:{x:rect.left,y:rect.top,right:rect.right,bottom:rect.bottom}};
  // Exercise the real memory path without inventing new activity in explored fog.
  view.camera={x:origin.x,y:origin.y-12,scale:zoom};
  const draw=view.models.draw,service=view.serviceActivity;
  view.serviceActivity=s=>{service.call(view,s);if(kind==='bunker'&&state==='occupied')view.garrisonActivity.set(unit.id,Array.from({length:4},()=>({care:{inside:true}})));};
  if(state==='memory')view.models.draw=(u,s,ui)=>draw.call(view.models,u,s,{...ui,memory:true},true);
  view.render(scene,ui,1/60);view.models.draw=draw;view.serviceActivity=service;
  $('degrees').value=$('angle').value+'°';const d=view.diagnostics();$('stats').textContent=d.parts+' подвижных узлов · '+d.drawCalls+' вызовов сцены';
  pose={time,state,angle,kind};
  if(!running&&!document.hidden&&view.memoryNeedsRefine&&!frame)frame=requestAnimationFrame(()=>{frame=0;paint();});
}
function tick(now){frame=0;if(previous)time+=Math.min(.05,(now-previous)/1000);previous=now;paint();if(running&&!document.hidden)frame=requestAnimationFrame(tick);}
function playback(){if(frame)cancelAnimationFrame(frame);frame=0;previous=0;$('pause').textContent=running?'Остановить анимацию':'Продолжить';$('pause').setAttribute('aria-pressed',String(!running));layout();if(running&&!document.hidden)frame=requestAnimationFrame(tick);else paint();}
$('model').addEventListener('change',()=>choose($('model').value));$('state').addEventListener('change',()=>{time=0;view.reset(scene);paint();});$('angle').addEventListener('input',paint);
$('pause').addEventListener('click',()=>{running=!running;playback();});addEventListener('resize',()=>{view.resize();layout();paint();});document.addEventListener('visibilitychange',playback);
choose(location.hash.slice(1)||'hero');playback();
window.SignalModelGallery={choose,pause(){running=false;playback();},state(value,preserveActivity=false){$('state').value=value;if(!preserveActivity){time=0;view.reset(scene);}paint();},
  angle(value){$('angle').value=String(value);paint();},advance(seconds){time+=seconds;paint();},snapshot:()=>structuredClone(scene),diagnostics:()=>({pose,graphics:view.diagnostics()}),view:()=>view};
