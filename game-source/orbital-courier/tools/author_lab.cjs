/* Reproducible inverse authoring. Accepted curves are integrated by the game's
   own Verlet solver, then checked again with cargo, gates and swept collisions. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),P=require('../src/physics');
let seed=13021;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},range=(a,b)=>a+(b-a)*random(),round=n=>Math.round(n*100)/100;
const candidates=[];
for(let n=0;n<60000;n++){
 const two=n>=30000,mirror=n%2?1:-1;
 const planets=two?[{x:range(320,480),y:350+mirror*range(70,160),r:31,mu:range(200000,950000)},{x:range(710,850),y:350-mirror*range(70,160),r:30,mu:range(200000,950000)}]:[{x:range(430,660),y:range(180,520),r:35,mu:range(350000,2400000)}];
 for(const p of planets){p.x=Math.round(p.x);p.y=Math.round(p.y);p.mu=Math.round(p.mu);}
 const angle=Math.round((two?mirror*range(8,45):range(-40,40))*10)/10,speed=Math.round(range(155,240));
 let s={x:90,y:350,vx:Math.cos(P.rad(angle))*speed,vy:-Math.sin(P.rad(angle))*speed,t:0},points=[{...s}],clear=Infinity,ok=true,maxSpeed=0;
 for(let k=0;k<1800;k++){
  const next=P.integrate(s,planets);s={...next,t:s.t+P.DT};
  clear=Math.min(clear,...planets.map(p=>Math.hypot(s.x-p.x,s.y-p.y)-p.r));maxSpeed=Math.max(maxSpeed,Math.hypot(s.vx,s.vy));
  if(clear<40||s.x<55||s.y<70||s.y>630||maxSpeed>440){ok=false;break;}
  points.push({...s});if(s.x>=1060)break;
 }
 if(!ok||s.x<1060||s.t<4||s.t>11||Math.abs(s.y-350)<30||Math.abs(s.y-350)>220)continue;
 const detour=Math.max(...points.map(p=>Math.abs(p.y-(350+(s.y-350)*(p.x-90)/(s.x-90)))));
 if(detour<120||detour>330)continue;
 const mid=points.find(p=>p.x>550);
 if(two&&(!mid||Math.sign(mid.y-350)===Math.sign(s.y-mid.y)))continue;
 candidates.push({two,angle,speed,planets,points,detour,clear});
}
const themes=[
 ['Ледяной заслон','ice','Расположи Ниву так, чтобы её поле провело корабль под ледяной грядой. Прямая линия к шлюзу закрыта.','Начни с середины зоны. Смотри, где прогноз пересекает гряду: сначала добейся обхода, затем попади в кольца.'],
 ['Теневая сторона','moon','Обойди расколотую луну с обратной стороны. Точка поворота важнее силы старта: слишком близкая планета уводит к обломкам.','Сдвиг планеты по вертикали меняет глубину дуги. Перемещай её небольшими шагами и сравнивай прогноз.'],
 ['Мёртвый док','wreck','Остов старого дока перекрывает кратчайший путь. Создай плавную гравитационную дугу между секциями корпуса.','У секций видны точные границы столкновения. Оставь запас для корпуса корабля и проверь оба контрольных кольца.'],
 ['Осколки перигея','moon','Груз рассеян по трём участкам дуги. Отведи планету от первого контейнера, обогни обломки и выровняй заход.','Меняй только один параметр за попытку. Планета ближе к трассе сильнее поворачивает корабль, но может сорвать приём груза.'],
 ['Двойной изгиб','ice','Два мира делят работу: первый уводит от гряды, второй возвращает к станции. Настрой их по очереди.','Сначала проведи курс через первое кольцо первой планетой. Затем двигай второй мир и следи за конечным участком.'],
 ['Коридор молчания','wreck','Секции заброшенного ретранслятора образуют два заслона. Проведи капсулу через оба прохода без дополнительной тяги.','Положение первого мира влияет на вход в коридор, второго — на выход. Сохрани рабочий вариант в A перед экспериментом.'],
 ['Холодный лабиринт','ice','Собери все три контейнера, меняя кривизну у двух ледяных миров. Крайние льдины дрейфуют: обход должен оставаться безопасным к моменту встречи.','Пунктирные овалы показывают дрейф льдин. После первой гряды уточняй второй мир по горизонтали: он меняет место второго изгиба.'],
 ['Последний просвет','wreck','Два центра притяжения, три контрольных кольца и узкий шлюз. Секции старых кораблей дрейфуют между заслонами. Построй трассу с запасом.','Фаза движения всегда начинается заново при запуске. Прогноз учитывает будущие положения обломков. После трёх колец уточни скорость и положение второго мира.']
];
const selected=[],levels=[];
for(let i=0;i<8;i++){
 const two=i>=4,sign=i%2?1:-1;
 const pool=candidates.filter(c=>c.two===two&&Math.sign(c.points.at(-1).y-350)===sign&&!selected.some(s=>Math.abs(s.angle-c.angle)<3&&Math.abs(s.speed-c.speed)<12));
 pool.sort((a,b)=>(i%4>=2?b.detour-a.detour:a.clear-b.clear));
 let accepted;
 for(const c of pool){
  const [name,kind,brief,hint]=themes[i],end=c.points.at(-1),at=f=>c.points[Math.round((c.points.length-1)*f)],solutionLayout=c.planets.map((p,j)=>({planet:j,x:p.x,y:p.y}));
  const planets=c.planets.map((p,j)=>({...p,name:j?'Веста':'Нива',tint:j?'#bdafdb':'#a5c7e4',surface:kind==='ice'?'ice':j?'gas':'rock'}));
  const zones=planets.map((p,j)=>({planet:j,x:Math.max(240,p.x-105),y:Math.max(95,p.y-100),w:200,h:190}));
  // A bank of collidable bodies lies on the direct start-to-station chord.
  // Add flanking fragments only where the accepted route has real clearance.
  const chord=x=>350+(end.y-350)*(x-90)/(end.x-90),rocks=[];
  const xs=two?[390,710,835]:[430,570,720];
  for(const x of xs)for(let j=-2;j<=2;j++){
   const p={x:x+(j%2)*14,y:round(chord(x)+j*38),r:j===0?32:24,kind};
   if(p.y<45||p.y>655||planets.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<q.r+p.r+32))continue;
   if(c.points.every(q=>Math.hypot(q.x-p.x,q.y-p.y)>p.r+28))rocks.push(p);
  }
  if(rocks.length<5)continue;
  if(i>=6)for(const j of [0,rocks.length-1]){const p=rocks[j];p.motion={cx:p.x,cy:p.y,rx:10,ry:16,period:6.4+(j%3)*.8,phase:j*.7,direction:j%2?-1:1};}
  const gates=(i===7?[.26,.53,.78]:[.32,.69]).map(f=>({...at(f),r:i>=6?23:29})).map(({x,y,r})=>({x:round(x),y:round(y),r}));
  const cargo=[.18,.48,.81].map((f,j)=>({x:round(at(f).x),y:round(at(f).y),label:String(j+1)}));
  const l={id:80+i,sector:20+(i>=4?1:0),routeRevision:13,newIn:13,name,brief,hint,start:{x:90,y:350},planets,target:{x:round(end.x),y:round(end.y),r:22},rocks,cargo,gates,flybys:[],timeLimit:round(end.t+3),qualityTime:round(end.t*1.12),parSpeed:c.speed+8,initialAngle:round(c.angle+(i%2?4:-4)),initialSpeed:c.speed+6,expert:true,maneuver:true,placement:{preview:12,zones,theme:kind},rules:{minCargo:i>=6?3:2,captureCap:i>=6?19:23,proCaptureCap:i>=6?13:16,proGateScale:.9},solution:{angle:c.angle,speed:c.speed,layout:solutionLayout},proSolution:{angle:c.angle,speed:c.speed,layout:solutionLayout},medalRules:[{type:'delivery'},{type:'precision',limit:.85},{type:'cargo'}]};
  if(P.layoutProblem(l,solutionLayout))continue;
  if(!['normal','pro'].every(mode=>P.simulate(P.prepareLevel(l,mode,solutionLayout),c.angle,c.speed).state.status==='won'))continue;
  // A zero-field copy must fail: the new mechanic is part of the puzzle.
  if(P.simulate({...P.prepareLevel(l,'normal',solutionLayout),planets:planets.map(p=>({...p,mu:0}))},c.angle,c.speed).state.status==='won')continue;
  // Start in a different valid, unsolved layout. The training command can show
  // the authored example, but ordinary play never silently installs it.
  let initial;
  for(const dx of [-65,65,-40,40]){
   const q=solutionLayout.map((p,j)=>({planet:j,x:p.x+dx,y:p.y+(j?35:-35)}));
   const layout=P.planetLayout(l,q);if(P.layoutProblem(l,layout))continue;
   if(P.simulate(P.prepareLevel(l,'normal',layout),c.angle,c.speed).state.status==='won')continue;
   initial=layout;break;
  }
  if(!initial)continue;
  l.planets=l.planets.map((p,j)=>({...p,...initial.find(q=>q.planet===j)}));
  accepted=l;selected.push(c);break;
 }
 if(!accepted)throw Error('No verified curve for '+i);levels.push(accepted);
}
const sectors=[{id:20,name:'Архитекторы тяготения',color:'#b5c8e3',description:'Четыре задачи с расстановкой одного мира: ледяные гряды, расколотая луна и заброшенный док.'},{id:21,name:'Защитный периметр',color:'#c2b4e2',description:'Два управляемых центра притяжения, двойные заслоны и точная доставка через космические обломки.'}];
const code='/* Authored by tools/author_lab.cjs; stable appended save IDs 80–87. */\n(function(root){const O=root.Orbital=root.Orbital||{};O.SECTORS.push(...'+JSON.stringify(sectors)+');O.LEVELS.push(...'+JSON.stringify(levels)+');})(typeof globalThis!==\'undefined\'?globalThis:window);\n';
fs.writeFileSync(path.join(__dirname,'../src/architect-levels.js'),code);
console.log(levels.map(l=>({id:l.id,name:l.name,obstacles:l.rocks.length,angle:l.solution.angle,speed:l.solution.speed,layout:l.solution.layout})));
