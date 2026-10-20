/* Preflight planet placement. Pointer projection belongs to the shared map
   controller; this editor changes coordinates only, never mass or flight time. */
(function(root){
 'use strict';const O=root.Orbital,A=O.App,P=O.Physics,$=id=>document.getElementById(id);let selected=0,lastId=-1;
 function active(){return A.screen==='play'&&!!A.level().placement&&!A.state;}
 function onLevel(){
  const l=A.level();lastId=l.id;selected=l.placement?.zones[0]?.planet||0;
  $('planetSelect').replaceChildren(...(l.placement?.zones||[]).map(z=>{const o=document.createElement('option');o.value=z.planet;o.textContent=l.planets[z.planet].name;return o;}));
  $('planetWorkshop').open=false;
  document.body.classList.toggle('has-placement',!!l.placement);
  if(l.placement){O.UI9.switchMap('planets');$('gameCanvas').setAttribute('aria-label','Карта проектирования. В режиме Планеты перетаскивай миры в отмеченных зонах. Стрелки перемещают выбранную планету, Shift ускоряет шаг.');}
  sync();
 }
 function sync(){
  if(A.screen!=='play')return;const l=A.level();$('planetWorkshop').hidden=!active();
  if(!l.placement)return;if(lastId!==l.id)return;
  const zone=l.placement.zones.find(z=>z.planet===selected)||l.placement.zones[0],p=l.planets[zone.planet];
  $('planetCount').textContent=l.placement.zones.length===1?'1 мир':'2 мира';$('planetSelect').value=selected;
  for(const axis of ['x','y']){const input=$('planet'+axis.toUpperCase());input.min=zone[axis];input.max=zone[axis]+zone[axis==='x'?'w':'h'];if(document.activeElement!==input)input.value=p[axis];input.disabled=!active();}
  const problem=P.layoutProblem(O.LEVELS[l.id],l.layout);$('planetProblem').textContent=problem||'Положение допустимо · можно запускать';$('planetProblem').classList.toggle('invalid',!!problem);
  $('scannerValue').textContent='Расчёт трассы: 12 с';
 }
 function move(id,x,y,persist=true){if(!active())return false;selected=id;const coords=A.level().layout.map(p=>p.planet===id?{planet:id,x,y}:p);return A.setLayout(coords,persist);}
 function pick(q){
  if(!active())return null;const l=A.level(),fit=O.FlightView.metrics($('gameCanvas').getBoundingClientRect()).fit*A.camera.zoom;
  const z=[...l.placement.zones].sort((a,b)=>Math.hypot(l.planets[a.planet].x-q.x,l.planets[a.planet].y-q.y)-Math.hypot(l.planets[b.planet].x-q.x,l.planets[b.planet].y-q.y))[0],p=l.planets[z.planet];
  if(Math.hypot(p.x-q.x,p.y-q.y)>Math.max(p.r+12,25/fit))return null;
  selected=z.planet;sync();return selected;
 }
 function nudge(key,step){const p=A.level().planets[selected];move(selected,p.x+(key==='arrowleft'?-step:key==='arrowright'?step:0),p.y+(key==='arrowup'?-step:key==='arrowdown'?step:0));}
 $('planetSelect').addEventListener('change',e=>{selected=+e.target.value;sync();});
 for(const axis of ['X','Y'])$('planet'+axis).addEventListener('change',e=>{if(e.target.value.trim()===''||!Number.isFinite(e.target.valueAsNumber)){sync();return;}const p=A.level().planets[selected];move(selected,axis==='X'?e.target.valueAsNumber:p.x,axis==='Y'?e.target.valueAsNumber:p.y);e.target.value=A.level().planets[selected][axis.toLowerCase()];});
 document.addEventListener('click',e=>{if(e.target.closest('[data-action="planets:reset"]')&&active()){A.setLayout(P.planetLayout(O.LEVELS[A.currentId]));A.syncControls();}});
 function draw(c,l,view,ui){
  if(!l.placement||view.state)return;const editing=document.body.dataset.mapMode==='planets',problem=P.layoutProblem(O.LEVELS[l.id],l.layout);c.save();
  for(const z of l.placement.zones){const p=l.planets[z.planet],chosen=z.planet===selected,color=problem&&chosen?'#ed9caa':chosen?'#c3d7f4':'#acb2c6';
   c.fillStyle=editing?color+'09':'#ffffff03';c.strokeStyle=color+(editing?'75':'25');c.lineWidth=1.2*ui;c.setLineDash([6*ui,6*ui]);c.fillRect(z.x,z.y,z.w,z.h);c.strokeRect(z.x,z.y,z.w,z.h);c.setLineDash([]);
   if(editing){c.beginPath();c.arc(p.x,p.y,p.r+9*ui,0,Math.PI*2);c.strokeStyle=color;c.stroke();
    for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){const x=p.x+d[0]*(p.r+16*ui),y=p.y+d[1]*(p.r+16*ui);c.beginPath();c.moveTo(x-d[1]*3*ui,y+d[0]*3*ui);c.lineTo(x+d[0]*4*ui,y+d[1]*4*ui);c.lineTo(x+d[1]*3*ui,y-d[0]*3*ui);c.stroke();}
   }
  }c.restore();
 }
 O.PlanetWorkshop={onLevel,sync,move,pick,nudge,draw};
})(window);
