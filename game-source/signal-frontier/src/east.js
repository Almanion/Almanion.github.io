/* The eastern operation owns its geometry and scenario data. Legacy maps never mutate. */
(function(root){
  'use strict';
  const T=typeof module!=='undefined'&&module.exports?require('./terrain'):root.SignalTerrain,
    D=typeof module!=='undefined'&&module.exports?require('./districts'):root.SignalDistricts;
  const regions=[
    ['S14','Грузовой шлюз',3720,1640,560,880,1],['S15','Силовая галерея',3720,840,1280,520,2],
    ['S16','Сервисная палуба',3720,2800,1280,640,0],['S17','Распределительный двор',4360,1640,560,880,1],['S18','Орбитальный док',5040,1520,440,1200,1]
  ].map(([id,name,x,y,w,h,level])=>({id,name,x,y,w,h,level}));
  const links=[['E01',3440,1960,400,240,2,1,'x'],['E02',3920,1280,240,480,2,1,'y'],['E03',4200,1960,240,240,1,1],['E04',4600,1280,240,480,2,1,'y'],['E05',3920,2400,240,520,1,0,'y'],['E06',4920,2880,480,240,0,0],['E07',5160,2560,240,440,1,0,'y'],['E08',4840,1960,280,240,1,1]].map(([id,x,y,w,h,from,to,axis])=>({id,x,y,w,h,from,to,axis}));
  const walls=[[3760,1680,120,160],[4200,2440,80,80],[3840,880,240,120],[4680,880,240,120],[3920,3280,160,80],[4520,2840,200,80],[4360,1680,80,160],[4360,2320,80,160],[4800,2400,120,80],[5040,1560,120,200],[5040,2360,80,160],[5400,2360,80,160]].map(([x,y,w,h])=>({x,y,w,h}));
  const guards=[['sentinel',4160,1960],['sentinel',4160,2200],['sentinel',3880,1880],['warden',4080,2240],['sentinel',4040,1120],['sentinel',4600,1160],['warden',4360,1160],['rocket',4880,1160],['sentinel',3880,3040],['sentinel',4800,3080],['runner',4240,3000],['runner',4600,3040],['flamer',4840,2960],['sentinel',4480,2000],['sentinel',4560,2080],['sentinel',4640,2280],['warden',4480,1880],['warden',4680,2200],['tank',4520,1800],['tank',4560,2360],['rocket',4840,2320],['mortar',4840,1840],['sentinel',5160,1960],['sentinel',5200,2280],['sentinel',5360,2200],['warden',5360,1960],['rocket',5280,1800],['tank',5280,2480]].map(([kind,x,y])=>({kind,x,y}));
  const mines=[...D.mines,{id:'east-gate',x:3880,y:2280,stock:1440},{id:'service-deck',x:4520,y:3240,stock:1440}],
    caches=[...D.caches,{id:'E-C01',x:3800,y:2440},{id:'E-C02',x:4800,y:3320}];
  let terrain,baseMap;const worlds=new WeakMap();
  function geometry(){return terrain ||= T.create({W:5600,regions,links});}
  function map(base){return baseMap ||= {...base,id:'districts-east',W:5600,regions:[...D.regions,...regions],districts:[...D.regions,...regions],links:[...base.links,...links],walls:[...base.walls,...walls]};}
  function world(s,base){
    if(!s?.east)return map(base);
    const key=s.east.revision,old=worlds.get(s);
    if(old?.key===key)return old.world;
    const g=actor(s,'gate'),d=actor(s,'depot'),p=actor(s,'power');
    const gates=[];
    if(!s.east.entrance)gates.push({x:3580,y:1960,w:40,h:240,gate:'entrance'});
    if(!s.east.power&&g?.hp!==0)gates.push({x:4300,y:1960,w:40,h:240,gate:'direct',unitId:g?.id});
    if(!s.east.service)gates.push({x:4980,y:2880,w:40,h:240,gate:'service'});
    if(d?.hp>0)gates.push({x:4640,y:1720,w:160,h:160,mission:true,unitId:d.id});
    if(p?.hp>0)gates.push({x:4440,y:1040,w:80,h:80,mission:true,unitId:p.id});
    const layout=[s.east.entrance,s.east.power,s.east.service,g?.hp>0,d?.hp>0,p?.hp>0].join(':');
    const value={...map(base),walls:[...map(base).walls,...gates],revision:layout};worlds.set(s,{key,world:value});return value;
  }
  const dock={x:5280,y:2080},consolePoint={x:5360,y:2040};
  const enabled=s=>s?.campaign?.id==='frontier-10',carrier=s=>s.units.find(u=>u.kind==='carrier');
  const actor=(s,role)=>s.units.find(u=>u.eastRole===role);
  function seed(s,E,init,arm,kind,x,y,role,team=1){
    const u=init(E.unit(s,kind,team,x,y,kind==='carrier'?1:0));u.eastRole=role;
    if(team){arm(u);u.ai={home:{x,y},goal:null,seen:null,seenAt:0,vx:0,vy:0,route:0,role:'line',raid:false,patrol:0};}
    return u;
  }
  function initialize(s,E,init,arm){
    s.east={open:false,entrance:false,claimed:false,power:false,service:false,charge:0,serviceCharge:0,powerCharge:0,repair:0,upload:0,transmitting:false,immobilized:false,openedAt:0,nextRaid:0,reserve:24,waves:0,warned:-1,revision:0,solids:7,reroute:[],approach:'siege'};
    s.campaign.mines=mines.map(m=>({...m,remaining:m.stock}));s.caches=caches.map(c=>({...c,taken:false,charge:0}));
    for(const p of guards)seed(s,E,init,arm,p.kind,p.x,p.y,'guard');
    seed(s,E,init,arm,'turret',4480,2160,'turret');seed(s,E,init,arm,'turret',5360,1720,'turret');
    seed(s,E,init,arm,'archive-depot',4720,1800,'depot');seed(s,E,init,arm,'power-node',4480,1080,'power');seed(s,E,init,arm,'archive-gate',4320,2080,'gate');
    seed(s,E,init,arm,'carrier',3960,2040,'carrier',0).group=0;
    worlds.delete(s);E.construction.replan(s);E.initializeRecon(s);return s;
  }
  function interaction(s,E){
    if(!enabled(s)||!s.east.open||E.hero(s).care)return null;
    const e=s.east,h=E.hero(s),c=carrier(s),power=actor(s,'power'),candidates=[];
    const add=(type,target,progress,label)=>{if(E.dist(h,target)<80)candidates.push({type,target,progress,label,allowed:(type!=='archive-repair'||h.repair<=0)&&!s.units.some(u=>u.team&&u.hp>0&&E.C[u.kind].damage>0&&E.dist(u,target)<140)});};
    if(!e.claimed)add('archive',c,e.charge,'Получить носитель архива');
    else if(c.hp<360)add('archive-repair',c,e.repair,'Аварийный ремонт носителя');
    if(!e.power&&power?.hp>0)add('archive-power',power,e.powerCharge,'Отключить питание обороны');
    if(!e.service)add('archive-service',{x:4880,y:3000},e.serviceCharge,'Открыть нижний путь');
    if(e.claimed&&!e.immobilized&&c.hp>0&&E.dist(c,dock)<56&&!e.transmitting)add('archive-send',consolePoint,e.charge,'Отправить архив');
    return candidates.sort((a,b)=>E.dist(h,a.target)-E.dist(h,b.target))[0]||null;
  }
  function objective(s,E){
    if(!enabled(s)||!s.east.open)return null;
    const e=s.east,c=carrier(s)||{x:3960,y:2040,hp:900};
    if(!e.claimed)return {id:'archive',target:c,radius:45,title:'Получить носитель архива',hint:'Грузовой шлюз открыт · удерживайте E у транспортёра'};
    if(c.hp<=0||e.immobilized)return {id:'archive-repair',target:c,radius:45,title:'Восстановить носитель · '+Math.floor(c.hp/360*100)+'%',hint:'Подведите зонды или удерживайте E рядом с корпусом'};
    return {id:'archive-deliver',intel:true,target:e.transmitting?dock:E.dist(c,dock)<56?consolePoint:dock,radius:50,title:e.transmitting?'Передача архива · '+Math.floor(e.upload*100)+'%':'Доставить архив в док',hint:e.transmitting?'Освободите стыковочную площадку от врагов':e.power?'Питание обороны отключено · проведите носитель к доку':e.service?'Нижний путь открыт · проведите носитель через сервисную палубу':'Выберите носитель: «Двигаться к доку» · можно отключить питание или открыть нижний путь'};
  }
  function tick(s,input,dt,E,init,arm){
    if(!enabled(s))return;
    const e=s.east,c=carrier(s),power=actor(s,'power'),depot=actor(s,'depot'),gate=actor(s,'gate');
    let changed=false;
    const solids=(gate.hp>0?1:0)+(depot.hp>0?2:0)+(power.hp>0?4:0);
    if(e.solids!==solids){e.solids=solids;changed=true;}
    if(!e.open&&!E.living(s,'citadel')){
      e.open=true;e.openedAt=s.t;e.nextRaid=s.t+105;e.approach=s.terminal.window>0?'infiltration':'siege';changed=true;
      for(const camp of s.campaign.camps)camp.warning=0;
      E.emit(s,'archive-open',3960,2040);
    }
    if(!e.power&&power.hp<=0){e.power=true;changed=true;}
    if(e.open&&!e.entrance&&s.t-e.openedAt>=1.2){e.entrance=true;changed=true;}
    if(gate.hp<=0||depot.hp<=0||e.power){if(gate.hp>0){gate.hp=0;changed=true;}}
    if(!e.open){if(changed)refreshWorld(s,E);return;}
    const act=interaction(s,E);
    if(input.interact&&act?.allowed&&s.dashT===0){
      const field=act.type==='archive-power'?'powerCharge':act.type==='archive-service'?'serviceCharge':act.type==='archive-repair'?'repair':'charge',duration=field==='repair'?20:field==='serviceCharge'?6:3;
      e[field]=Math.min(1,e[field]+dt/duration);
      if(e[field]===1){
        if(act.type==='archive'){e.claimed=true;c.group=1;e.charge=0;E.emit(s,'archive-claimed',c.x,c.y);}
        if(act.type==='archive-power'){e.power=true;changed=true;}
        if(act.type==='archive-service'){e.service=true;changed=true;}
        if(act.type==='archive-repair'){c.hp=Math.max(c.hp,360);delete c.deadAt;e.immobilized=false;e.repair=0;}
        if(act.type==='archive-send')e.transmitting=true;
      }
    }
    if(e.claimed&&c.hp<900){
      let crew=0;
      for(const w of s.units)if(w.kind==='drone'&&w.hp>0&&w.eastRepair===c.id){
        if(E.dist(w,c)>75){if(!w.path.length || (Math.floor(s.t*2)!==Math.floor((s.t-dt)*2) && E.dist(w.path.at(-1),c)>60))w.path=E.pathTo(w,c,E.C.drone.r);E.follow(w,dt);}else{w.path=[];crew++;}
      }
      if(crew){c.hp=Math.min(900,c.hp+Math.min(crew,2)*6*dt);if(c.hp>=360){delete c.deadAt;e.immobilized=false;}}
    }
    if(c.hp>=900)for(const w of s.units)if(w.eastRepair===c.id){delete w.eastRepair;w.path=[];w.order=null;}
    if(e.transmitting&&!e.immobilized&&c.hp>0&&E.dist(c,dock)<56&&!s.units.some(u=>u.team&&u.hp>0&&E.C[u.kind].damage>0&&E.dist(u,dock)<220))e.upload=Math.min(1,e.upload+dt/12);
    if(c.hp<=0){c.path=[];e.immobilized=true;}
    if(depot.hp>0&&e.reserve>=6&&e.warned!==e.waves&&s.t>=e.nextRaid-30){e.warned=e.waves;E.emit(s,'archive-warning',depot.x,depot.y);}
    if(depot.hp>0&&e.reserve>=6&&s.t>=e.nextRaid){
      const active=s.units.filter(u=>u.team&&u.hp>0&&u.ai?.raid),local=active.filter(u=>u.eastRole==='raid'),groups=new Set(active.map(u=>u.ai.squad));
      const target=s.units.filter(u=>!u.team&&u.hp>0&&(u.kind!=='carrier'||e.claimed)&&E.visible(s,1,u)).sort((a,b)=>E.dist(depot,a)-E.dist(depot,b))[0];
      if(active.length<=26&&local.length<=6&&groups.size<2&&target){
        const compositions=[['sentinel','sentinel','runner','runner','rocket','warden'],['sentinel','sentinel','warden','rocket','flamer','tank'],['sentinel','warden','warden','rocket','tank','mortar'],['sentinel','sentinel','warden','rocket','runner','tank']],spots=[[4520,1920],[4600,1960],[4680,1960],[4760,1960],[4800,2040],[4720,2120]];
        // An occupied exit delays the whole order. No partial group or reserve loss.
        if(spots.every(([x,y],i)=>E.free(x,y,E.C[compositions[e.waves][i]].r,s)&&!s.units.some(u=>u.hp>0&&E.dist(u,{x,y})<E.C[u.kind].r+28))){
          const squad=++s.campaign.squadSeq;
          compositions[e.waves].forEach((kind,i)=>{const u=seed(s,E,init,arm,kind,...spots[i],'raid');Object.assign(u.ai,{goal:{x:target.x,y:target.y},raid:true,squad,assembleUntil:s.t+8,regroupUntil:0,rally:{x:4600,y:2080},waypoints:[]});});
          e.waves++;e.reserve-=6;e.nextRaid=s.t+90;E.emit(s,'raid',depot.x,depot.y,{team:1});
        }else e.nextRaid=s.t+1;
      }else e.nextRaid=s.t+2;
    }
    if(changed){refreshWorld(s,E);E.emit(s,'archive-route',c.x,c.y);}
    // Opening a gate only removes obstacles: existing paths remain safe. Keep
    // their original orders and shorten affected routes one per tick, instead
    // of rebuilding the entire army's paths in the same input/render frame.
    const id=e.reroute.shift(),u=id&&s.units.find(v=>v.id===id);
    if(u?.hp>0&&u.order&&!u.order.followId)u.path=E.pathTo(u,u.order,E.C[u.kind].r);
  }
  function refreshWorld(s,E){
    s.east.revision++;worlds.delete(s);E.construction.invalidate(s);
    s.east.reroute=s.units.filter(u=>!u.team&&u.hp>0&&[1,2].includes(u.group)&&u.order&&!u.order.followId&&(u.x>3200||u.order.x>3600)).map(u=>u.id);
    E.refreshRecon(s);
  }
  function validate(s,E){
    const e=s.east,c=carrier(s),finite=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b;
    return e&&['open','entrance','claimed','power','service','transmitting','immobilized'].every(k=>typeof e[k]==='boolean')&&
      ['charge','serviceCharge','powerCharge','repair','upload'].every(k=>finite(e[k],0,1))&&
      finite(e.openedAt,0,s.t)&&finite(e.nextRaid,0,s.t+106)&&Number.isInteger(e.waves)&&e.waves>=0&&e.waves<=4&&Number.isInteger(e.warned)&&e.warned>=-1&&e.warned<=4&&e.reserve===24-e.waves*6&&
      Number.isInteger(e.revision)&&e.revision>=0&&e.revision<=32&&Number.isInteger(e.solids)&&e.solids>=0&&e.solids<=7&&['siege','infiltration'].includes(e.approach)&&
      Array.isArray(e.reroute)&&e.reroute.length<=121&&e.reroute.every(id=>Number.isInteger(id)&&id>0&&id<=s.seq)&&
      s.units.filter(u=>u.kind==='carrier').length===1&&c.team===0&&['depot','power','gate'].every(role=>s.units.filter(u=>u.eastRole===role).length===1)&&
      (!e.claimed||e.open)&&(!e.entrance||e.open)&&(!e.transmitting||e.claimed)&&(!e.upload||e.transmitting)&&
      (s.status!=='won'||e.upload===1)&&(!e.open||!E.living(s,'citadel'));
  }
  const API={regions,links,walls,guards,mines,caches,geometry,map,world,initialize,interaction,objective,tick,validate,carrier,dock};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.SignalEast=API;
})(typeof globalThis!=='undefined'?globalThis:window);
