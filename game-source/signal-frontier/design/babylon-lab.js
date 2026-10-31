import { BabylonView } from "../../../games/signal-frontier/babylon-view.js";
const E=window.SignalEngine,$=id=>document.getElementById(id),
  kinds=["rifle","rifle","scout","drone","runner","rocket","artillery","hero"],
  original=E.make("classic"),world=E.map(original),template=original.units.find(u=>u.kind==="rifle"),points=[];
for(let y=40;y<world.H-40;y+=28)for(let x=40;x<world.W-40;x+=28)if(E.free(x,y,25,world))points.push([x,y]);
let canvas=$("field"),view,scene,time=0,running=true,previous=0,request=0,samples=[],lastStats=0,lastCpu=0;
function build(count) {
  time=0;previous=0;
  scene={...original,units:[],bullets:[],events:[],t:time};
  for(let i=0;i<count;i++) {
    const kind=kinds[i%kinds.length],p=points[Math.floor(i*points.length/count)],enemy=["runner","rocket"].includes(kind);
    scene.units.push({...structuredClone(template),id:1000+i,kind,team:enemy?1:0,hp:E.C[kind].hp,
      x:p[0],y:p[1],home:p,group:0,angle:i*.618,combat:{mode:"idle",angle:0,time:0,total:.8},cargo:kind==="drone"?i%5:0,work:"idle"});
  }
  scene.heroId=scene.units.find(u=>u.kind==="hero").id;
  view?.reset(scene);samples=[];
}
function renderer(kind) {
  view?.dispose?.();const fresh=canvas.cloneNode(false);canvas.replaceWith(fresh);canvas=fresh;
  document.body.dataset.renderer=kind;view=kind==="babylon"?new BabylonView(canvas):new SignalView(canvas);
  view.tactical.overview=true;build(Number($("count").value));
}
function paint() {
  scene.t=time;
  for(let i=0;i<scene.units.length;i++) {
    const u=scene.units[i],phase=time+i*.137;
    u.x=u.home[0]+Math.sin(phase*1.6)*5;u.y=u.home[1]+Math.cos(phase*1.3)*4;
    u.angle=(i*.618+time*.2)%(Math.PI*2);u.combat.angle=u.angle;
    const period=((phase%2)+2)%2;u.combat.mode=period<.65?"aim":"idle";u.combat.time=.65-period;u.combat.total=.65;
    u.flash=period>.72&&period<.81?.065:0;u.wind=u.combat.mode==="aim"?Math.max(0,.65-period):0;
  }
  const header=document.querySelector('header').getBoundingClientRect(),footer=document.querySelector('footer').getBoundingClientRect(),
    start=performance.now();
  view.render(scene,{mode:"tactical",reduced:false,selectionIds:[],mapArea:{x:16,y:header.bottom+10,right:innerWidth-16,bottom:footer.top-10}},1/60);
  lastCpu=performance.now()-start;
}
function tick(now) {
  request=0;
  if(previous){const dt=now-previous;time+=Math.min(.1,dt/1000);samples.push(dt);if(samples.length>180)samples.shift();}
  previous=now;paint();
  if(now-lastStats>500&&samples.length) {
    const sorted=[...samples].sort((a,b)=>a-b),mean=samples.reduce((a,b)=>a+b,0)/samples.length;
    $("fps").textContent=(1000/mean).toFixed(1);$("p95").textContent=sorted[Math.floor(sorted.length*.95)].toFixed(1);
    $("cpu").textContent=lastCpu.toFixed(1);$("draws").textContent=view.diagnostics?.().drawCalls??"—";lastStats=now;
  }
  if(running&&!document.hidden)request=requestAnimationFrame(tick);
}
function playback(){if(request)cancelAnimationFrame(request);request=0;previous=0;$("pause").textContent=running?"Пауза":"Продолжить";$("pause").setAttribute("aria-pressed",String(!running));if(running&&!document.hidden)request=requestAnimationFrame(tick);else paint();}
$("renderer").addEventListener("change",()=>{renderer($("renderer").value);playback();});
$("count").addEventListener("change",()=>{build(Number($("count").value));playback();});
$("pause").addEventListener("click",()=>{running=!running;playback();});
addEventListener("resize",()=>{view.resize();paint();});document.addEventListener("visibilitychange",playback);
renderer("babylon");playback();
window.SignalBabylonLab={pause(){running=false;playback();},setRenderer(kind){$("renderer").value=kind;renderer(kind);playback();},setCount(count){$("count").value=String(count);build(count);playback();},advance(seconds){time+=seconds;paint();return this.diagnostics();},diagnostics(){return {count:scene.units.length,time,cpu:lastCpu,renderer:$("renderer").value,gpu:view.diagnostics?.()||null};},view:()=>view};
