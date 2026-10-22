/* Three independent, deterministic flight expeditions. No campaign save access. */
(function (root) {
  'use strict';
  const DT=1/120, W=1100,H=660, TAU=Math.PI*2;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const finite=(v,d,a,b)=>Number.isFinite(v)?clamp(v,a,b):d;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const radians=a=>a*Math.PI/180;
  const OPERATIONS=Object.freeze([
    {id:'seam',kind:'expedition',name:'Шов',tag:'ПРОСТРАНСТВЕННАЯ СЕТЬ',description:'Восстанови три маяка за разорванным пространством. Разлом переносит корабль и поворачивает весь его импульс.',detail:'Сначала маяк I, затем две пары разломов и маяки II–III. Курс сохраняется относительно ориентации выхода; D корректирует следующий выход на ±6°.',titles:['Сшить пространство']},
    {id:'sisyphus',kind:'expedition',name:'Сизиф',tag:'БУКСИРОВКА АСТЕРОИДА',description:'Перехвати падающий астероид и измени его траекторию. Спастись самому недостаточно: колония должна остаться цела.',detail:'Автозахват — до 88 м при относительной скорости до 90 м/с. Пройди сбоку: трос может порваться. Победа зависит от траектории астероида у контрольного рубежа.',titles:['Сдвинуть неизбежное']},
    {id:'archive',kind:'expedition',name:'Чёрный архив',tag:'СКРЫТНОЕ ПРОНИКНОВЕНИЕ',description:'Пройди сканирующие патрули в пылевой туманности, скачай архив на ходу и доставь данные к теневому шлюзу.',detail:'Пыль скрывает от сканеров. Для загрузки набери 2,2 с в радиусе терминала при скорости до 90 м/с. Манёвровые двигатели выдают корабль; D включает трёхсекундный глушитель.',titles:['Украсть память']}
  ]);
  const STARTS={seam:{x:120,y:500},sisyphus:{x:150,y:500},archive:{x:110,y:380}};
  const LIMITS={seam:24,sisyphus:32,archive:24};
  const REFERENCES={seam:[{angle:-30,speed:100,delay:0},{angle:-29.5,speed:110,delay:.5}],sisyphus:[{angle:-29,speed:95,delay:0},{angle:-28,speed:100,delay:.5}],archive:[{angle:-12,speed:75,delay:0},{angle:-12.5,speed:70,delay:1}]};
  const DEFAULTS={seam:{angle:-22,speed:105,delay:0},sisyphus:{angle:-15,speed:100,delay:0},archive:{angle:-8,speed:95,delay:0}};
  const RELAYS=[{id:'relay1',x:225,y:439,r:29,label:'Маяк I'},{id:'relay2',x:695,y:282,r:31,label:'Маяк II'},{id:'relay3',x:700,y:426,r:34,label:'Маяк III'}];
  const PORTALS=[{id:'rift1',x:365,y:358,r:33,toX:610,toY:135,rotation:radians(90),label:'Разлом α'},{id:'rift2',x:760,y:395,r:34,toX:350,toY:520,rotation:radians(-75),label:'Разлом β'}];
  const TERMINAL={x:650,y:260,r:105}, EXIT={x:1000,y:220,r:49}, COLONY={x:940,y:350,r:72};
  const DUST=[{id:'dust1',x:350,y:330,r:112},{id:'dust2',x:645,y:260,r:127},{id:'dust3',x:835,y:224,r:89}];
  const WRECKS={seam:[{x:520,y:355,r:77},{x:850,y:180,r:55},{x:165,y:180,r:48}],sisyphus:[{x:550,y:85,r:55},{x:720,y:515,r:62}],archive:[{x:475,y:172,r:57},{x:485,y:456,r:67},{x:875,y:105,r:37}]};
  const id=value=>typeof value==='string'?value:value&&value.operation;
  const is=value=>OPERATIONS.some(o=>o.id===id(value));
  const hints=(value,index=0)=>({...REFERENCES[id(value)][index%2]});
  const defaults=value=>({...DEFAULTS[id(value)],ax:760,ay:410});
  function cleanPlan(raw,value) {const d=defaults(value);raw=raw||{};return {angle:finite(raw.angle,d.angle,-180,180),speed:finite(raw.speed,d.speed,55,170),delay:finite(raw.delay,0,0,4),ax:finite(raw.ax,760,540,1000),ay:finite(raw.ay,410,65,570)};}
  function create(value,raw) {
    const operation=id(value),plan=cleanPlan(raw,operation),start={...STARTS[operation]},angle=radians(plan.angle);
    return {operation,phase:0,tactic:'breach',plan,t:0,flightT:0,ticks:0,...start,vx:Math.cos(angle)*plan.speed,vy:Math.sin(angle)*plan.speed,start,finish:null,
      hull:3,fleet:6,allyHull:2,coverCount:0,shield:0,shieldUsed:false,boostUsed:false,brakeUsed:false,status:'running',reason:'',events:[],path:[{...start,t:0}],objectiveHits:{},charge:0,closest:Infinity,shots:0,signal:false,jam:0,minX:start.x,
      beacons:0,portalUses:0,portalCooldown:0,portalTurn:0,portalHistory:[],lastPortal:'',captured:false,deflected:false,manualRelease:false,asteroid:{x:360,y:410,vx:28,vy:-4,r:25},tether:{attached:false,tension:0,restLength:68,maxTension:310},
      detection:0,download:0,quiet:0,quietUsed:false,infiltrated:false,noise:0,warning:false};
  }
  function event(s,type,text,position=s,extra={}) {s.events.push({type,text,t:s.t,x:position.x,y:position.y,...extra});if(s.events.length>200)s.events.splice(0,s.events.length-200);}
  function end(s,status,reason) {if(s.status!=='running')return;s.status=status;s.reason=reason;s.finish={x:s.x,y:s.y,t:s.t};event(s,status,reason);}
  function segmentDistance(p,a,b) {const dx=b.x-a.x,dy=b.y-a.y,u=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(p.x-a.x-dx*u,p.y-a.y-dy*u);}
  function relativeSpeed(s) {return Math.hypot(s.vx-s.asteroid.vx,s.vy-s.asteroid.vy);}
  function grapple(s,manual=false) {
    if(s.tether.attached||!manual&&s.manualRelease||distance(s,s.asteroid)>(manual?112:88)||relativeSpeed(s)>(manual?110:90))return false;
    s.tether.attached=true;s.captured=true;s.tether.restLength=68;event(s,'grapple','Магнитный трос закреплён. Тяни астероид в сторону от колонии.',s.asteroid);return true;
  }
  function canInteract(s) {if(!is(s)||s.status!=='running')return false;if(s.operation==='seam')return s.portalUses<2;if(s.operation==='archive')return !s.quietUsed;return s.tether.attached||distance(s,s.asteroid)<=112&&relativeSpeed(s)<=110;}
  function interact(s) {
    if(!canInteract(s))return false;
    if(s.operation==='seam'){s.portalTurn=(s.portalTurn+1)%3;event(s,'phase-turn','Коррекция следующего выхода: '+[0,6,-6][s.portalTurn]+'°');return true;}
    if(s.operation==='archive'){s.quietUsed=true;s.quiet=3;event(s,'quiet','Глушитель включён на 3 секунды. Сканеры теряют сигнал.');return true;}
    if(s.tether.attached){s.tether.attached=false;s.tether.tension=0;s.manualRelease=true;event(s,'release','Трос отцеплен. Повторный захват — вручную кнопкой D.',s.asteroid);return true;}
    return grapple(s,true);
  }
  function canManeuver(s,kind){return s.status==='running'&&s.t>s.plan.delay+1e-8&&(kind==='boost'||kind==='brake')&&!s[kind+'Used'];}
  function maneuver(s,kind){if(!canManeuver(s,kind))return false;const factor=kind==='boost'?1.18:.75;s.vx*=factor;s.vy*=factor;s[kind+'Used']=true;s.noise=4;event(s,kind,kind==='boost'?'Разгонный импульс':'Тормозной импульс');return true;}
  function shield(s){if(s.status!=='running'||s.shieldUsed)return false;s.shieldUsed=true;s.shield=2;s.noise=4;event(s,'shield','Защитное поле включено. В архиве оно повышает заметность.');return true;}
  function patrols(t){return [{id:'patrol1',x:495+Math.sin(t*.34)*50,y:110+Math.sin(t*.5)*20,r:20,angle:1.5+Math.sin(t*.62)*.65,spread:.8,range:285},{id:'patrol2',x:830+Math.sin(t*.29+1)*65,y:430+Math.sin(t*.4)*22,r:22,angle:-1.1+Math.sin(t*.48+.8)*.55,spread:.7,range:280}];}
  function scanStrength(s,t) {
    let sum=0;const cover=DUST.some(d=>distance(s,d)<d.r),noise=1+(s.noise>0?1.1:0)+(s.shield>0?1.4:0),quiet=s.quiet>0?.08:1;
    for(const p of patrols(t)){let angle=Math.atan2(s.y-p.y,s.x-p.x)-p.angle;angle=Math.atan2(Math.sin(angle),Math.cos(angle));if(distance(s,p)<p.range&&Math.abs(angle)<p.spread/2)sum+=39*(cover?.12:1)*noise*quiet;}
    return sum;
  }
  function nearestMiss(rock){const vv=rock.vx*rock.vx+rock.vy*rock.vy;if(vv<.01)return Infinity;const t=Math.max(0,((COLONY.x-rock.x)*rock.vx+(COLONY.y-rock.y)*rock.vy)/vv);return Math.hypot(rock.x+rock.vx*t-COLONY.x,rock.y+rock.vy*t-COLONY.y);}
  function integrateTow(s,dt) {
    const r=s.asteroid,t=s.tether;let fx=0,fy=0;
    if(t.attached){const dx=s.x-r.x,dy=s.y-r.y,len=Math.hypot(dx,dy)||1,nx=dx/len,ny=dy/len,rate=(s.vx-r.vx)*nx+(s.vy-r.vy)*ny;
      // A cable transmits tension only. Damping dissipates relative motion while
      // equal and opposite forces preserve the momentum of the ship/rock pair.
      const force=Math.max(0,(len-t.restLength)*12+rate*5);t.tension=force;
      if(force>t.maxTension){t.attached=false;t.tension=0;s.manualRelease=true;event(s,'tether-break','Трос порвался от рывка. Сблизь скорости и перехвати астероид кнопкой D.',r);}
      else {fx=nx*force;fy=ny*force;if(force>t.maxTension*.78&&!s.warning){s.warning=true;event(s,'tether-warning','Критическое натяжение: убери разгон или отцепи трос.',r);}if(force<t.maxTension*.6)s.warning=false;}
    }
    s.x+=s.vx*dt-.5*fx*dt*dt;s.y+=s.vy*dt-.5*fy*dt*dt;r.x+=r.vx*dt+fx*dt*dt/6;r.y+=r.vy*dt+fy*dt*dt/6;
    s.vx-=fx*dt;s.vy-=fy*dt;r.vx+=fx*dt/3;r.vy+=fy*dt/3;
  }
  function step(s,dt=DT) {
    if(s.status!=='running')return s;dt=finite(dt,DT,1/10000,.1);const old={x:s.x,y:s.y};s.t+=dt;s.ticks++;s.flightT=Math.max(0,s.t-s.plan.delay);s.shield=Math.max(0,s.shield-dt);s.quiet=Math.max(0,s.quiet-dt);s.noise=Math.max(0,s.noise-dt);s.portalCooldown=Math.max(0,s.portalCooldown-dt);
    if(s.operation==='sisyphus'){
      // The asteroid keeps falling while the player waits at the launch cradle.
      if(s.t<=s.plan.delay+1e-8){s.asteroid.x+=s.asteroid.vx*dt;s.asteroid.y+=s.asteroid.vy*dt;}
      else {grapple(s);integrateTow(s,dt);}
    } else if(s.t>s.plan.delay+1e-8){s.x+=s.vx*dt;s.y+=s.vy*dt;}
    if(s.t<=s.plan.delay+1e-8)return s;
    s.minX=Math.min(s.minX,s.x);
    for(const rock of WRECKS[s.operation])if(segmentDistance(rock,old,s)<rock.r+6){end(s,'lost','Столкновение с обломком. Проведи курс через свободный проход.');return s;}
    if(s.operation==='seam'){
      const next=RELAYS[s.beacons];if(next&&segmentDistance(next,old,s)<next.r){if(s.portalUses!==s.beacons){end(s,'lost','Связь с маяком не открыта. Пройди предыдущую пару разломов.');return s;}s.beacons++;s.objectiveHits[next.id]=true;event(s,'objective',next.label+' восстановлен',next);if(s.beacons===3&&s.portalUses===2){end(s,'won','Три маяка синхронизированы. Пространственная сеть восстановлена.');return s;}}
      const p=PORTALS[s.portalUses];
      if(p&&s.portalCooldown<=0&&segmentDistance(p,old,s)<p.r){
        if(s.beacons<s.portalUses+1){end(s,'lost','Перед переходом восстанови ближайший маяк. Сеть нельзя сшить в обратном порядке.');return s;}
        const rotation=p.rotation+radians([0,6,-6][s.portalTurn]),incomingAngle=Math.atan2(s.vy,s.vx),cos=Math.cos(rotation),sin=Math.sin(rotation),vx=s.vx*cos-s.vy*sin,vy=s.vx*sin+s.vy*cos,v=Math.hypot(vx,vy)||1;
        s.portalHistory.push({incomingAngle,outgoingAngle:incomingAngle+rotation,rotation});
        s.path.push({x:s.x,y:s.y,t:s.t});s.x=p.toX+vx/v*48;s.y=p.toY+vy/v*48;s.vx=vx;s.vy=vy;s.portalUses++;s.lastPortal=p.id;s.portalCooldown=.65;s.portalTurn=0;
        s.path.push({x:s.x,y:s.y,t:s.t,jump:true});event(s,'portal','Переход выполнен. Импульс повёрнут на '+Math.round(rotation*180/Math.PI)+'°.',p,{toX:s.x,toY:s.y});
      }
    } else if(s.operation==='sisyphus'){
      const rock=s.asteroid;
      if(distance(s,rock)<rock.r+6){end(s,'lost','Удар об астероид. Заходи сбоку и сближай скорости; трос не остановит лобовое столкновение.');return s;}
      if(segmentDistance(COLONY,old,s)<COLONY.r+6){end(s,'lost','Столкновение с колонией. Камень и корабль должны пройти снаружи её защитного периметра.');return s;}
      if(distance(rock,COLONY)<COLONY.r+rock.r){end(s,'lost','Астероид достиг колонии. Измени его курс, а не только траекторию корабля.');return s;}
      const miss=nearestMiss(rock);s.deflected=s.captured&&miss>COLONY.r+rock.r+32;
      if(s.captured&&rock.x>=820&&s.deflected){if(s.tether.attached){s.tether.attached=false;s.tether.tension=0;s.manualRelease=true;event(s,'release','Автоотцепка: безопасный курс подтверждён. Астероид свободно пройдёт мимо колонии.',rock);}end(s,'won','Астероид прошёл контрольный рубеж по безопасной траектории. Колония спасена.');return s;}
      if(rock.x>1040||rock.y<35||rock.y>625){if(s.captured&&s.deflected){if(s.tether.attached){s.tether.attached=false;s.tether.tension=0;s.manualRelease=true;event(s,'release','Автоотцепка: астероид выведен из населённого коридора.',rock);}end(s,'won','Астероид выведен из населённого коридора. Колония спасена.');}else end(s,'lost','Безопасное отклонение не подтверждено. Перехвати астероид и передай ему боковой импульс.');return s;}
      if(!s.captured&&rock.x>820){end(s,'lost','Рубеж перехвата пропущен. Астероид всё ещё летит к колонии.');return s;}
    } else {
      s.infiltrated=s.infiltrated||s.x>430;
      if(s.detection>=100){end(s,'lost','Тревога уже поднята. Укройся в пыли или включи глушитель до полного обнаружения.');return s;}
      const scanning=scanStrength(s,s.t);s.detection=clamp(s.detection+(scanning>0?scanning:-8)*dt,0,100);
      if(s.detection>=100){end(s,'lost','Тревога: патруль обнаружил корабль. Укройся в пыли, смени окно старта или включи глушитель.');return s;}
      const inside=distance(s,TERMINAL)<TERMINAL.r&&Math.hypot(s.vx,s.vy)<=90;
      if(inside&&s.download<2.2){const before=s.download;s.download=Math.min(2.2,s.download+dt);if(before===0)event(s,'download','Загрузка архива началась. Оставайся в радиусе при скорости до 90 м/с.',TERMINAL);if(s.download>=2.2)event(s,'objective','Архив загружен. Доставь данные к теневому шлюзу.',TERMINAL);}
      if(segmentDistance(EXIT,old,s)<EXIT.r){if(s.download>=2.2)end(s,'won','Архив доставлен. Патрули не успели поднять тревогу.');else end(s,'lost','Данные не загружены. Проведи в круге терминала 2,2 с на скорости до 90 м/с.');return s;}
    }
    if(s.ticks%6===0)s.path.push({x:s.x,y:s.y,t:s.t});if(s.path.length>1000)s.path.splice(0,s.path.length-1000);
    if(s.x<15||s.x>W-15||s.y<20||s.y>H-20)end(s,'lost','Корабль покинул район операции. Скорректируй курс или используй торможение.');
    if(s.status==='running'&&s.t>=LIMITS[s.operation])end(s,'lost',s.operation==='sisyphus'?'Окно спасения закрыто. Перехвати астероид раньше и передай ему больше бокового импульса.':'Операция затянулась. Пересмотри маршрут и импульс.');
    return s;
  }
  function simulate(value,plan){const s=create(value,plan);while(s.status==='running')step(s);return s;}
  function missionInfo(s) {
    const won=s.status==='won',base={title:OPERATIONS.find(o=>o.id===s.operation).titles[0],timeLimit:LIMITS[s.operation],alert:false};
    if(s.operation==='seam')return {...base,objective:'Восстановить три маяка через две пары разломов',intel:'Переход сохраняет скорость, но поворачивает импульс. Маяки нужно пройти по порядку. D корректирует только следующий выход; три нажатия возвращают исходную ориентацию.',radio:s.beacons===0?'«Первый маяк перед разломом. Дальше пространство не будет прямым».':s.beacons===1?'«Второй сектор выше. Следи за направлением выхода α».':'«Последний маяк в нижней складке. Замкни сеть».',status:'Маяки: '+s.beacons+' / 3 · переходы: '+s.portalUses+' / 2',steps:RELAYS.map((p,i)=>({title:p.label+' · '+['перед первым разломом','верхняя складка','нижняя складка'][i],done:won||s.beacons>i,active:!won&&s.beacons===i})),actionLabel:'Повернуть выход '+[0,6,-6][s.portalTurn]+'°',actionHint:'D · следующий разлом: 0° → +6° → −6° → 0°',metricLabel:'Сеть маяков',metricValue:s.beacons+' / 3',metricRatio:s.beacons/3};
    if(s.operation==='sisyphus'){const miss=nearestMiss(s.asteroid);return {...base,objective:'Отвести астероид от колонии и подтвердить безопасный пролёт',intel:'Астероид дрейфует и до старта. Автозахват: до 88 м и относительная скорость ≤90 м/с. Трос передаёт импульс; рывок рвёт его. Красная линия показывает опасный коридор.',radio:!s.captured?'«Не врезайся в камень. Зацепи его сбоку и утащи от города».':!s.deflected?'«Связка тяжёлая. Судьба колонии теперь зависит от импульса астероида».':'«Курс чист. Доведи камень до контрольного рубежа или отцепись».',status:(s.tether.attached?'Трос '+Math.round(s.tether.tension)+' / '+s.tether.maxTension+' Н':'Трос свободен')+' · промах '+Math.round(miss)+' м',steps:[{title:'Перехватить и зацепить астероид',done:won||s.captured,active:!s.captured},{title:'Отклонить траекторию от колонии',done:won||s.deflected,active:s.captured&&!s.deflected},{title:'Вывести камень за контрольный рубеж',done:won,active:s.deflected&&!won}],actionLabel:s.tether.attached?'Отцепить трос':'Магнитный захват',actionHint:s.tether.attached?'D · отцепить; астероид сохранит свой импульс':'D · ручной захват до 112 м при относительной скорости ≤110 м/с',metricLabel:'Безопасный промах',metricValue:Math.round(miss)+' м',metricRatio:clamp(miss/200,0,1),alert:s.tether.tension>s.tether.maxTension*.78||miss<129,tether:s.tether};}
    return {...base,objective:'Скачать архив и незаметно доставить его к теневому шлюзу',intel:'Патрульные конусы движутся. Пыль снижает обнаружение; манёвровые двигатели усиливают его. Загрузка идёт 2,2 с внутри круга терминала на скорости ≤90 м/с. D — одно окно глушения на 3 с.',radio:s.download>=2.2?'«Данные у нас. Теперь только теневой шлюз — и ни одного лишнего импульса».':s.download>0?'«Держись в круге терминала. Канал ещё открыт».':'«Входи через пыль. Патруль ищет факел двигателя, а не корпус».',status:'Загрузка '+Math.round(s.download/2.2*100)+'% · обнаружение '+Math.round(s.detection)+'%',steps:[{title:'Пройти патрульный рубеж',done:won||s.infiltrated,active:!s.infiltrated},{title:'Скачать архив · 2,2 с в зоне',done:won||s.download>=2.2,active:s.infiltrated&&s.download<2.2},{title:'Доставить данные к теневому шлюзу',done:won,active:s.download>=2.2&&!won}],actionLabel:s.quiet>0?'Глушение '+s.quiet.toFixed(1)+' с':s.quietUsed?'Глушитель исчерпан':'Включить глушитель',actionHint:'D · одно включение на 3 с; заметность падает на 92%',metricLabel:s.download>=2.2?'Обнаружение':'Загрузка архива',metricValue:s.download>=2.2?Math.round(s.detection)+'%':Math.round(s.download/2.2*100)+'%',metricRatio:s.download>=2.2?s.detection/100:s.download/2.2,alert:s.detection>65};
  }
  function missionObjects(s,t=s.t) {
    const objects=WRECKS[s.operation].map((o,i)=>({kind:'wreck',id:'wreck'+i,...o,label:'Обломок'}));
    if(s.operation==='seam'){
      for(let i=0;i<RELAYS.length;i++)objects.push({kind:'relay',...RELAYS[i],done:i<s.beacons,active:i===s.beacons});
      let angle=Math.atan2(s.vy,s.vx),historicalAngle=radians(s.plan.angle);
      for(let i=0;i<PORTALS.length;i++){
        const p=PORTALS[i],rotation=p.rotation+radians(i===s.portalUses?[0,6,-6][s.portalTurn]:0);
        historicalAngle+=p.rotation;
        const history=i<s.portalUses&&s.portalHistory[i];
        const outgoingAngle=i<s.portalUses?(history?history.outgoingAngle:historicalAngle):angle+rotation;
        const actualRotation=history?history.rotation:rotation;
        objects.push({kind:'rift',...p,pairedX:p.toX,pairedY:p.toY,angle:outgoingAngle,rotation:actualRotation,active:i===s.portalUses,done:i<s.portalUses},{kind:'rift',id:p.id+'-exit',x:p.toX,y:p.toY,r:p.r,label:'Выход '+(i?'β':'α'),pairedX:p.x,pairedY:p.y,angle:outgoingAngle,rotation:actualRotation,exit:true,active:i===s.portalUses,done:i<s.portalUses});
        if(i>=s.portalUses)angle=outgoingAngle;
      }
    } else if(s.operation==='sisyphus'){
      objects.push({kind:'colony',id:'colony',...COLONY,label:'Колония «Новый дом»'}, {kind:'asteroid',id:'asteroid',...s.asteroid,label:'Сизиф',safe:s.deflected}, {kind:'exit',id:'safety',x:820,y:330,r:220,label:'Контрольный рубеж',line:true,active:s.captured}, {kind:'target',id:'impact',x:COLONY.x,y:COLONY.y,r:129,label:'Опасный коридор',active:!s.deflected});
      if(s.tether.attached)objects.push({kind:'tether',id:'tether',x:s.x,y:s.y,toX:s.asteroid.x,toY:s.asteroid.y,...s.tether});
    } else {
      objects.push(...DUST.map(d=>({kind:'dust',...d,label:'Пылевое укрытие',opacity:.2})),{kind:'terminal',id:'terminal',...TERMINAL,label:'Чёрный архив',done:s.download>=2.2,active:s.download<2.2,progress:s.download/2.2},{kind:'exit',id:'exit',...EXIT,label:'Теневой шлюз',active:s.download>=2.2});
      for(const p of patrols(t)){objects.push({kind:'patrol',...p,label:'Патруль'},{kind:'sensor',...p,id:p.id+'-sensor',r:p.range,label:'Сканер',active:true});}
    }
    return objects.map(o=>({...o,type:o.kind}));
  }
  function missionSnapshot(s){const out={};for(const key of ['beacons','portalUses','portalTurn','lastPortal','captured','deflected','manualRelease','detection','download','quietUsed','infiltrated'])out[key]=s[key];out.velocity={vx:s.vx,vy:s.vy};out.portalHistory=s.portalHistory.slice(0,2).map(p=>({...p}));out.asteroid={...s.asteroid};out.tether={...s.tether};return out;}
  function restoreFinal(s,record={}) {
    const m=record.mission||{};
    for(const key of ['beacons','portalUses','portalTurn','lastPortal','captured','deflected','manualRelease','detection','download','quietUsed','infiltrated'])if(typeof m[key]===typeof s[key])s[key]=m[key];
    if(Array.isArray(m.portalHistory))s.portalHistory=m.portalHistory.slice(0,2).filter(p=>p&&['incomingAngle','outgoingAngle','rotation'].every(k=>Number.isFinite(p[k]))).map(p=>({incomingAngle:clamp(p.incomingAngle,-TAU*4,TAU*4),outgoingAngle:clamp(p.outgoingAngle,-TAU*4,TAU*4),rotation:clamp(p.rotation,-TAU,TAU)}));
    if(m.velocity)for(const k of ['vx','vy'])s[k]=finite(m.velocity[k],s[k],-2000,2000);if(m.asteroid)for(const k of ['x','y','vx','vy'])s.asteroid[k]=finite(m.asteroid[k],s.asteroid[k],-2000,2000);
    if(m.tether){s.tether.attached=!!m.tether.attached;s.tether.tension=finite(m.tether.tension,0,0,310);}
    s.x=finite(record.x,s.x,15,W-15);s.y=finite(record.y,s.y,20,H-20);s.t=finite(record.t,0,0,45);s.flightT=Math.max(0,s.t-s.plan.delay);s.beacons=s.operation==='seam'?3:s.beacons;s.portalUses=s.operation==='seam'?2:s.portalUses;
    if(s.operation==='sisyphus')s.captured=s.deflected=true;if(s.operation==='archive'){s.download=2.2;s.infiltrated=true;}
    end(s,'won',s.operation==='seam'?'Пространственная сеть восстановлена.':s.operation==='sisyphus'?'Колония спасена.':'Архив доставлен без тревоги.');return s;
  }
  const api={DT,OPERATIONS,REFERENCES,LIMITS,is,hint:hints,defaults,cleanPlan,create,step,simulate,canInteract,interact,canManeuver,maneuver,shield,missionInfo,missionObjects,missionSnapshot,restoreFinal,nearestMiss,scanStrength};
  root.EclipseExpeditions=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
