'use strict';
// Offline search only. Each accepted world is then flown by the unmodified game.
const fs=require('node:fs'),path=require('node:path'),P=require('../src/physics.js');
let seed=20260927;const rand=(a,b)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return a+(b-a)*seed/4294967296;};
const tau=Math.PI*2,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),xy=s=>({x:s.x,y:s.y});
const designs=[
 {name:'Маятник разломов',centres:[[290,210],[870,235],[580,510]],order:[0,1,0,2],brief:'Вернись к первому миру после облёта второго. За время перелёта планета сместится: второй заход требует другого курса.'},
 {name:'Крест приливов',centres:[[285,185],[880,205],[860,510],[295,505]],order:[0,2,1,3,0],brief:'Пересекай систему по диагоналям и замкни маршрут у исходного мира. Каждый переход сохраняет направление и скорость.'},
 {name:'Окно синхронизации',centres:[[275,190],[865,200],[875,505],[280,510]],order:[0,1,3,2,1],brief:'Пять облётов, возврат к движущемуся миру и перехват станции. Подбери импульс так, чтобы совпали и путь, и время.'},
 {name:'За пределами карты',centres:[[220,185],[590,150],[985,225],[900,525],[295,520]],order:[0,2,4,1,3,0],brief:'Шесть облётов пяти миров. После перекрёстного каскада вернись к истоку и догони станцию. Груз расположен на трёх разных участках.'}
];
function generate(index){const d=designs[index],planets=d.centres.map(([x,y],i)=>{const m={cx:x+rand(-18,18),cy:y+rand(-15,15),rx:rand(8,14),ry:rand(6,12),period:rand(30,46),phase:rand(0,tau),direction:i%2?-1:1};const p={x:0,y:0,r:rand(24,31),mu:Math.round(rand(1.08e6,1.5e6)/1000)*1000,motion:m,name:['Иней','Астера','Кальдера','Наяда','Оникс'][i],tint:'#a5cddc',surface:['ice','rock','lava','ocean','gas'][i]};return {...p,...xy(P.bodyAt(p,0))};});
 const first=P.bodyAt(planets[0],0),theta=rand(-Math.PI,Math.PI),radius=rand(78,106),speed=Math.round(Math.sqrt(planets[0].mu/radius)*rand(.95,1.02)),angle=Math.round(-wrap(theta+Math.PI/2)*180/Math.PI*10)/10;
 const start={x:Math.round(first.x+radius*Math.cos(theta)),y:Math.round(first.y+radius*Math.sin(theta))};
 let s={...start,vx:speed*Math.cos(P.rad(angle)),vy:-speed*Math.sin(P.rad(angle)),t:0};const target={x:600,y:350,r:22};
 if(index>1)target.motion={cx:600,cy:350,rx:20,ry:12,period:23,phase:.4,direction:-1};
 const safe=s=>s.x>14&&s.x<1186&&s.y>14&&s.y<686&&planets.every(p=>{const q=P.bodyAt(p,s.t);return Math.hypot(s.x-q.x,s.y-q.y)>p.r+14;});
 const events=[],portals=[],points=[s];
 for(let k=0;k<d.order.length;k++){
  const body=d.order[k],p=planets[body],q=P.bodyAt(p,s.t);let last=Math.atan2(s.y-q.y,s.x-q.x),sum=0;const from=s.t;let done=false;
  for(let i=0;i<1900;i++){s=P.integrate(s,planets);if(!safe(s))return null;points.push(s);const q=P.bodyAt(p,s.t);if(Math.hypot(s.x-q.x,s.y-q.y)>167)return null;const a=Math.atan2(s.y-q.y,s.x-q.x);sum+=wrap(a-last);last=a;if(Math.abs(sum)>4.62){done=true;break;}}
  if(!done||s.t>36)return null;events.push({body,from,to:s.t,direction:Math.sign(sum)});
  const v=Math.hypot(s.vx,s.vy),ux=s.vx/v,uy=s.vy/v,entrance={x:s.x+ux*18,y:s.y+uy*18,r:18};let dest;
  if(k+1<d.order.length){const next=planets[d.order[k+1]],q=P.bodyAt(next,s.t),r=P.clamp(next.mu/(v*v)*rand(.97,1.025),52,124),a=Math.atan2(uy,ux)+(rand(0,1)<.5?-1:1)*Math.PI/2;dest={x:q.x+r*Math.cos(a),y:q.y+r*Math.sin(a)};}
  else{const q=P.bodyAt(target,s.t+.65);dest={x:q.x-s.vx*.65,y:q.y-s.vy*.65};for(let j=0;j<4;j++){let z={...s,...dest};for(let tick=0;tick<78;tick++)z=P.integrate(z,planets);dest.x+=q.x-z.x;dest.y+=q.y-z.y;}}
  portals.push({id:'R'+(k+1),afterFlybys:k+1,afterPortals:k,entrance,exit:{x:dest.x-ux*25,y:dest.y-uy*25,r:18},color:['#8ddcff','#ffb183','#c4abff','#80e2d3'][k%4]});s={...s,...dest};points.push({...s,break:true});if(!safe(s))return null;
 }
 const nearest=t=>points.reduce((a,b)=>Math.abs(a.t-t)<Math.abs(b.t-t)?a:b);
 const indices=[0,Math.floor(events.length/2),events.length-1],cargo=indices.map((i,j)=>({...xy(nearest(events[i].from+(events[i].to-events[i].from)*.52)),label:String(j+1)}));
 const area=Math.abs((cargo[1].x-cargo[0].x)*(cargo[2].y-cargo[0].y)-(cargo[1].y-cargo[0].y)*(cargo[2].x-cargo[0].x));if(area<13000)return null;
 const l={id:76+index,sector:19,routeRevision:11,newIn:11,name:d.name,brief:d.brief,hint:'Начни с касательного захода к первому миру. Сравни след попытки с порядком облётов; уточняй угол в режиме «Точно».',start,planets,target,rocks:[],cargo,portals,portalOrder:portals.map(p=>p.id),gates:events.map(e=>({...xy(nearest(e.from+(e.to-e.from)*.35)),r:30})),flybys:events.map(e=>({planet:e.body,direction:e.direction,degrees:225+index*3,radius:172})),timeLimit:Math.ceil(s.t+6),qualityTime:(s.t+.65)*1.18,parSpeed:speed+8,initialAngle:Math.round(P.clamp(angle+(index%2?-5:5),-179,179)*10)/10,initialSpeed:Math.max(60,speed-5),expert:true,dynamic:true,maneuver:true,motionKind:'mastery',rules:{minCargo:0,captureCap:19,proCaptureCap:14,proGateScale:.94},solution:{angle,speed},proSolution:{angle,speed}};
 // Small static hazards form readable gaps, outside the authored flight corridor.
 for(let j=0;j<5;j++){const rock={x:rand(100,1100),y:rand(90,610),r:rand(17,26)};if(points.every(q=>Math.hypot(q.x-rock.x,q.y-rock.y)>rock.r+35)&&planets.every(p=>Math.hypot(p.x-rock.x,p.y-rock.y)>p.r+rock.r+50)&&Math.hypot(target.x-rock.x,target.y-rock.y)>90)l.rocks.push(rock);}
 const runs=['normal','pro'].map(mode=>P.simulate(P.prepareLevel(l,mode),angle,speed).state);if(runs.some(s=>s.status!=='won'||s.cargo.length!==3))return null;
 if(index>1){const t=runs[0].t;l.rules.window=[t-2.8,t+2.8];}
 l.medalRules=[{type:'delivery'},{type:'precision',limit:Math.max(.4,Math.min(.85,Math.floor((Math.min(...runs.map(s=>s.dockPrecision))-.06)*100)/100))},{type:'cargo'}];
 let half=P.createState(P.prepareLevel(l),angle,speed);while(half.status==='flying')half=P.step(half,P.prepareLevel(l),P.DT/2);if(half.status!=='won'||half.cargo.length!==3)return null;
 const neighbours=[];for(const da of [-.2,-.1,0,.1,.2])for(const dv of [-1,0,1]){const s=P.simulate(P.prepareLevel(l),angle+da,speed+dv).state;if(s.status==='won'&&s.cargo.length===3)neighbours.push({angle:angle+da,speed:speed+dv});}if(neighbours.length<5)return null;
 for(let tier=0;tier<=5;tier++)for(const mode of ['normal','pro']){const stats={capture:[25,28,31,34,38,42][tier],dockingLevel:tier,gravity:[0,52,74,100,132,164][tier],gravityMu:[0,3e6,8e6,18e6,35e6,65e6][tier]},s=P.simulate(P.prepareLevel(l,mode),angle,speed,stats).state;if(s.status!=='won'||s.cargo.length!==3)return null;}
 return {level:l,validation:{neighbours,halfStep:true,allUpgradeTiers:true,time:runs[0].t,loops:runs[0].flybyIndex,portals:runs[0].portalIndex,precision:runs.map(s=>s.dockPrecision),minimumClearance:runs[0].minClearance}};
}
const accepted=[];for(let i=0;i<4;i++){let result;for(let attempt=0;attempt<60000;attempt++){result=generate(i);if(result){console.log('ACCEPT',i,attempt,result.level.name,result.validation.neighbours.length);break;}if(attempt%5000===0)console.log('search',i,attempt);}if(!result)throw Error('No stable route '+i);accepted.push(result);}
fs.writeFileSync(path.join(__dirname,'../docs/authored-v11.json'),JSON.stringify(accepted,null,2)+'\n');
