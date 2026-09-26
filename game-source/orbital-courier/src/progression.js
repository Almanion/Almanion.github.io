/* Version 8: skill ratings, two resources, auditable receipts and lossless
   refund of actual v3 payments. Offline saves are not tamper-proof. */
(function(root){
  'use strict';
  const O=root.Orbital=root.Orbital||{};
  const E=O.Economy||(typeof require==='function'?require('./economy.js'):null);
  const C=O.Cosmetics||(typeof require==='function'?require('./cosmetics.js'):null);
  const A=O.Achievements||(typeof require==='function'?require('./achievements.js'):null);
  const M=O.Medals||(typeof require==='function'?require('./medals.js'):null);
  const Campaign=O.Campaign||(typeof require==='function'?require('./campaign.js'):null);
  const SAVE_KEY='orbital-courier-save-v8',LEGACY_KEY='orbital-courier-save-v2';
  const levels=()=>O.LEVELS||[],count=()=>levels().length;
  const UPGRADE_DEFS={
    scanner:{name:'Навигационный сканер',icon:'⌁',tag:'ПЛАНИРОВАНИЕ',
      description:'Показывает будущую траекторию. В ПРО прогноз короче.',
      values:[1.5,2.5,4,6,8,10],unit:'с',stat:'preview'},
    magnet:{name:'Гравитационный захват',icon:'◎',tag:'СОБСТВЕННОЕ ПОЛЕ КОРАБЛЯ',
      description:'Притягивает контейнеры на пролёте. Прокачка увеличивает радиус и силу поля.',
      values:[0,52,74,100,132,164],unit:'ед.',stat:'gravity'},
    docking:{name:'Стыковочный маяк',icon:'◉',tag:'ЗАХОД НА СТАНЦИЮ',
      description:'Повышает строгий допуск станции на 5,5% за ступень. Лимиты скорости и обязательный маршрут сохраняются.',
      values:[25,28,31,34,38,42],unit:'ед.',stat:'capture'},
    engine:{name:'Импульсный двигатель',icon:'↗',tag:'ДИАПАЗОН СКОРОСТЕЙ',
      description:'Больше доступных скоростей и −3% расчётного расхода за ступень. Реальный импульс полёта не уменьшается.',
      values:[250,270,290,315,340,365],unit:'ед./с',stat:'maxSpeed'}
  };
  for(const [k,d] of Object.entries(UPGRADE_DEFS))d.costs=[1,2,3,4,5].map(t=>E.price(k,t,0,0));
  const RANKS=[{xp:0,name:'Стажёр'},{xp:180,name:'Курьер'},{xp:600,name:'Навигатор'},
    {xp:1300,name:'Пилот дальних трасс'},{xp:2300,name:'Капитан'},{xp:3600,name:'Звёздный почтальон'},
    {xp:5200,name:'Исследователь границ'},{xp:7000,name:'Хранитель маяков'},{xp:8000,name:'Легенда маршрутов'},{xp:12000,name:'Мастер развилок'},{xp:18000,name:'Архитектор путей'},{xp:23000,name:'Хранитель горизонтов'},{xp:27000,name:'Голос созвездий'},{xp:29000,name:'За пределами карты'}];
  const SKINS=[{id:'mint',name:'Мята',color:'#6af4cd',xp:0},{id:'ice',name:'Полярис',color:'#8acfff',xp:600},
    {id:'gold',name:'Солнечный ветер',color:'#ffc37c',xp:2300},{id:'nova',name:'Сверхновая',color:'#c4a3ff',xp:3600},
    {id:'coral',name:'Коралловая заря',color:'#ff958a',xp:7000},{id:'pearl',name:'Белый карлик',color:'#f2f1d7',xp:8000},
    {id:'twin',name:'Двойная звезда',color:'#98b9ff',xp:10000,gate:'both4',requirement:'Обе ветви четырёх карт'},
    {id:'amber',name:'Янтарный резонанс',color:'#ffdd9b',xp:14000,gate:'sector18',requirement:'Все карты «Развилок приливов»'},
    {id:'rose',name:'Лента горизонта',color:'#ff9ec6',xp:18000,gate:'multi4',requirement:'Все карты «Предела навигации»'},
    {id:'atlas',name:'Полный атлас',color:'#dffaff',xp:22000,gate:'all80',requirement:'Все 80 контрактов'}];
  const medalCount=m=>(m&1?1:0)+(m&2?1:0)+(m&4?1:0);
  const blankRecord=()=>({medals:0,cargo:[],attempts:0,bestTime:null,paid:0,dataPaid:0,bestScore:0,proScore:0,proWon:false,routeVersion:0,currentMedals:0,legacyMedals:0,routes:[],bestLoops:0,bestPortals:0,bestDrops:0,bestPrecision:0,tractorProof:false});
  const int=(x,min,max,fallback=0)=>Number.isFinite(x)?Math.max(min,Math.min(max,Math.floor(x))):fallback;
  const record=(p,id)=>p.records[String(id)]||blankRecord();
  const viewRecord=(p,id)=>{const r=record(p,id),l=levels()[id];return l?.routeRevision>8&&r.routeVersion!==l.routeRevision?{...r,currentMedals:0,legacyMedals:r.medals|r.legacyMedals,cargo:[]}:r;};
  const completed=p=>Object.values(p.records).filter(r=>r.medals&1).length;
  const totalMedals=p=>Object.values(p.records).reduce((n,r)=>n+medalCount(r.medals),0);
  const cargoCount=p=>Object.values(p.records).reduce((n,r)=>n+r.cargo.length,0);
  const totalCargo=()=>levels().reduce((n,l)=>n+l.cargo.length,0);
  const firstN=(p,n)=>Array.from({length:n},(_,i)=>i).every(i=>record(p,i).medals&1);
  const milestones=[
    ['first','Есть контакт','Завершить первый контракт.','↗',25,p=>completed(p)>=1],
    ['perfect','Безупречная доставка','Три медали в одном контракте.','★',30,p=>Object.values(p.records).some(r=>r.medals===7)],
    ['ring','Связь установлена','Закрыть первые четыре контракта.','◉',40,p=>firstN(p,4)],
    ['titan','За кольцами Титана','Закрыть первые восемь контрактов.','◌',50,p=>firstN(p,8)],
    ['final','Первые маяки','Завершить исходные 12 контрактов.','✧',100,p=>firstN(p,12)],
    ['collector','Ничего не потеряно','Доставить 12 разных контейнеров.','◇',40,p=>cargoCount(p)>=12],
    ['allcargo','Первая полная опись','Доставить 36 разных контейнеров.','◈',70,p=>cargoCount(p)>=36],
    ['engineer','Главный инженер','Улучшить любой модуль до уровня III.','⚙',40,p=>Object.values(p.upgrades).some(v=>v>=3)],
    ['medalist','Золотой маршрут','Получить 36 медалей.','✦',150,p=>totalMedals(p)>=36],
    ['skim','По самой кромке','Успешно пролететь ближе 28 единиц к поверхности планеты.','⌁',40,()=>false],
    ['ice','Ледяной горизонт','Закрыть первые 16 контрактов.','❄',60,p=>firstN(p,16)],
    ['storms','Сквозь магнитные бури','Закрыть первые 20 контрактов.','ϟ',70,p=>firstN(p,20)],
    ['frontier','Внешняя граница','Закрыть первые 24 контракта.','⟡',80,p=>firstN(p,24)],
    ['deep','За гранью света','Закрыть первые 28 контрактов.','◐',90,p=>firstN(p,28)],
    ['campaign32','Новая сеть маяков','Завершить первые 44 контракта.','✺',150,p=>firstN(p,44)],
    ['manifest96','Абсолютная опись','Доставить все контейнеры первых 44 контрактов.','◈',130,p=>levels().slice(0,44).every(l=>record(p,l.id).cargo.length===l.cargo.length)],
    ['medals96','Совершенный маршрут','Получить все медали первых 44 контрактов.','✦',200,p=>levels().slice(0,44).every(l=>record(p,l.id).medals===7)],
    ['expert12','Вне зоны комфорта','Завершить 12 экспертных контрактов.','◉',250,p=>levels().filter(l=>l.expert&&(record(p,l.id).medals&1)).length>=12],
    ['pro10','Лицензия профессионала','Завершить 10 разных контрактов в режиме ПРО.','◆',180,p=>Object.values(p.records).filter(r=>r.proWon).length>=10],
    ['tractor','Своя гравитация','Установить гравитационный захват.','◎',50,p=>p.upgrades.magnet>=1],
    ['orbit4','Живые орбиты','Завершить первый блок с движущимися планетами.','◌',100,p=>[44,45,46,47].every(i=>record(p,i).medals&1)],
    ['dance4','В ритме планет','Завершить «Гравитационный танец».','✧',130,p=>[48,49,50,51].every(i=>record(p,i).medals&1)],
    ['intercept4','Точное свидание','Завершить четыре перехвата станции.','⌖',150,p=>[52,53,54,55].every(i=>record(p,i).medals&1)],
    ['campaign56','Небо не стоит на месте','Завершить все 56 контрактов.','✺',200,p=>firstN(p,56)],
    ['front64','В такт орбитам','Завершить «Резонансный фронт».','⌁',160,p=>[56,57,58,59].every(i=>record(p,i).medals&1)],
    ['rift4','По ту сторону','Доставить груз по всем четырём портальным маршрутам.','◎',180,p=>[60,61,62,63].every(i=>record(p,i).medals&1)],
    ['campaign64','Картограф разломов','Завершить первые 64 контракта.','✺',220,p=>firstN(p,64)],
    ['riftmasters','Архитектор разломов','Завершить четыре контракта сектора «Архитектура разломов».','◎',200,p=>[64,65,66,67].every(i=>record(p,i).medals&1)],
    ['campaign68','Сквозь пространство','Завершить первые 68 контрактов.','✺',240,p=>firstN(p,68)],
    ['master','Капсула будущего','Улучшить любой модуль до уровня V.','⚙',100,p=>Object.values(p.upgrades).some(v=>v===5)]
  ];
  const legacyAchievements=milestones.map(([id,name,text,icon,xp,test])=>({id,name,text,icon,xp,test,credits:0}));
  const achievements=A.create(legacyAchievements);
  function fresh(){return {game:'orbital-courier',version:8,credits:E.START_CREDITS,data:0,xp:0,
    upgrades:{scanner:0,magnet:0,docking:0,engine:0},records:{},flags:{},achievements:[],receipts:[],
    campaignRevision:11,campaignAccess:[],settings:{sound:true,volume:.6,grid:false,ghost:true,highContrast:false,reducedMotion:false,fineAim:false},courses:{},skin:'mint',trail:'vector',lastLevel:0,wishlist:null,difficulty:'normal'};}
  function legacyUnlocked(p,id){
    if(!Number.isInteger(id)||id<0||id>=count())return false;
    if(id===0)return true;
    if(id===68||id===76)return completed(p)>=20;
    if(id===72)return !!(record(p,71).medals&1);
    if(id===64)return !!(record(p,63).medals&1);
    if(id===56)return !!(record(p,51).medals&1);
    if(id===60)return !!(record(p,31).medals&1)||!!(record(p,47).medals&1);
    if(id===44)return levels().slice(0,32).filter(l=>record(p,l.id).medals&1).length>=12;
    if(id===52)return !!(record(p,47).medals&1);
    if(id===28)return levels().slice(0,28).filter(l=>record(p,l.id).medals&1).length>=12;
    if(id===32)return levels().slice(0,32).filter(l=>record(p,l.id).medals&1).length>=12;
    return !!(record(p,id-1).medals&1);
  }
  function unlocked(p,id){
    if(!Number.isInteger(id)||id<0||id>=count())return false;
    const i=Campaign.position(id),r=record(p,id);
    return i===0||!!(r.medals&1)||r.attempts>0||p.campaignAccess?.includes(id)||Campaign.current(p,Campaign.order[i-1]);
  }
  function nextLevel(p){for(const id of Campaign.order)if(unlocked(p,id)&&!Campaign.current(p,id))return id;return p.lastLevel;}
  function rank(p){let i=0;for(let j=1;j<RANKS.length;j++)if(p.xp>=RANKS[j].xp)i=j;return {...RANKS[i],index:i,next:RANKS[i+1]||null};}
  function research(p){return Object.values(p.records).reduce((n,r)=>n+(r.dataPaid||0),0);}
  function installed(p){return Object.values(p.upgrades).reduce((a,b)=>a+b,0);}
  function stats(p){
    const s={magnet:18};for(const [k,d] of Object.entries(UPGRADE_DEFS))s[d.stat]=d.values[p.upgrades[k]];
    s.dockingLevel=p.upgrades.docking;s.fuelFactor=1-.03*p.upgrades.engine;
    s.gravityMu=[0,3000000,8000000,18000000,35000000,65000000][p.upgrades.magnet];return s;
  }
  function awardAchievements(p,flight=null){
    const earned=[];
    for(const a of achievements){if(p.achievements.includes(a.id))continue;
      const valid=a.id==='skim'?flight?.status==='won'&&flight.nearMiss:a.test(p);
      if(valid){p.achievements.push(a.id);p.xp+=a.xp;earned.push(a);}}
    return earned;
  }
  function launch(p,id){if(!unlocked(p,id))throw Error('Контракт ещё не открыт.');const key=String(id);if(!p.records[key])p.records[key]=blankRecord();p.records[key].attempts++;p.lastLevel=id;}
  function complete(p,level,flight){
    if(flight.status!=='won')throw Error('Награды доступны только после доставки.');
    if(!Number.isInteger(level.id)||level.id<0||level.id>=count()||!unlocked(p,level.id))throw Error('Неизвестный или закрытый контракт.');
    const quality=E.rating(level,flight);
    if(flight.assisted)return {training:true,quality,totalCredits:0,totalXP:0,credits:0,data:0,awards:[],newMedals:0};
    const key=String(level.id),r=p.records[key]||(p.records[key]=blankRecord()),oldMask=r.medals,oldCargo=r.cargo.slice();
    const runCargo=[...new Set((flight.cargo||[]).filter(i=>Number.isInteger(i)&&i>=0&&i<level.cargo.length))];
    r.routes=Array.from(new Set([...(r.routes||[]),...(flight.branchId?[flight.branchId]:[])]));r.bestLoops=Math.max(r.bestLoops||0,flight.flybyIndex||0);r.bestPortals=Math.max(r.bestPortals||0,flight.portalIndex||0);r.bestDrops=Math.max(r.bestDrops||0,flight.dropIndex||0);r.bestPrecision=Math.max(r.bestPrecision||0,flight.dockPrecision||0);r.tractorProof=r.tractorProof||flight.pullCount>0;
    if(level.routeRevision>8&&r.routeVersion!==level.routeRevision){r.legacyMedals|=r.medals;r.currentMedals=0;}
    const runMask=M.mask(level,flight,r),newMask=runMask&~oldMask;r.currentMedals=(r.currentMedals||0)|runMask;
    r.routeVersion=level.routeRevision||0;r.medals|=runMask;r.cargo=[...new Set([...oldCargo,...runCargo])].sort((a,b)=>a-b);
    r.bestTime=r.bestTime===null?flight.t:Math.min(r.bestTime,flight.t);
    const first=!(oldMask&1),newCargo=r.cargo.length-oldCargo.length,newMedals=medalCount(newMask);
    const credits=Math.max(0,quality.potential-r.paid),data=Math.max(0,quality.data-r.dataPaid);
    r.paid=Math.max(r.paid,quality.potential);r.dataPaid=Math.max(r.dataPaid,quality.data);
    const oldScore=r.bestScore;r.bestScore=Math.max(r.bestScore,quality.score);
    if(quality.mode==='pro'){r.proWon=true;r.proScore=Math.max(r.proScore,quality.score);}
    const xp=(first?70:0)+newMedals*20+newCargo*8+Math.max(0,quality.score-oldScore);
    p.credits+=credits;p.data+=data;p.xp+=xp;p.lastLevel=level.id;
    const awards=awardAchievements(p,flight);
    return {first,runMask,newMask,newCargo,newMedals,quality,credits,data,xp,awards,
      totalCredits:credits,totalXP:xp+awards.reduce((n,a)=>n+a.xp,0),paid:r.paid,training:false};
  }
  function quote(p,key){
    if(!Object.hasOwn(UPGRADE_DEFS,key))return null;
    const lv=p.upgrades[key],max=lv>=5,cost=max?0:E.price(key,lv+1,installed(p),research(p));
    const required=max?0:E.TIER_UNLOCKS[lv],dataCost=max?0:E.DATA_COSTS[lv];
    const missing=Math.max(0,cost-p.credits),dataMissing=Math.max(0,dataCost-p.data);
    const eligible=completed(p)>=required;
    return {lv,max,cost,required,dataCost,missing,dataMissing,eligible,
      assembly:1+.025*installed(p),discount:Math.min(.08,.002*research(p)),
      canBuy:!max&&eligible&&!missing&&!dataMissing};
  }
  function buy(p,key){
    const q=quote(p,key);if(!q)return {ok:false,message:'Неизвестный модуль.'};
    if(q.max)return {ok:false,message:'Модуль уже улучшен до максимума.'};
    if(!q.eligible)return {ok:false,message:`Для этой ступени заверши ${q.required} контрактов.`};
    if(q.missing||q.dataMissing)return {ok:false,message:`Не хватает: ${q.missing} кредитов и ${q.dataMissing} данных.`};
    p.credits-=q.cost;p.data-=q.dataCost;p.upgrades[key]++;
    p.receipts.push({key,tier:p.upgrades[key],credits:q.cost,data:q.dataCost,inherited:false});
    if(p.wishlist===key)p.wishlist=null;
    return {ok:true,cost:q.cost,data:q.dataCost,awards:awardAchievements(p)};
  }
  function invested(p){return (p.receipts||[]).reduce((n,r)=>n+r.credits,0);}
  function dataInvested(p){return (p.receipts||[]).reduce((n,r)=>n+r.data,0);}
  function respec(p){
    const credits=invested(p),data=dataInvested(p),inherited=p.receipts.some(r=>r.inherited);
    p.credits+=credits;p.data+=data;const inheritedReceipts=p.receipts.filter(r=>r.inherited);for(const key of Object.keys(UPGRADE_DEFS))p.upgrades[key]=Math.max(0,...inheritedReceipts.filter(r=>r.key===key).map(r=>r.tier));p.receipts=inheritedReceipts;p.flags=p.flags||{};if(credits||data)p.flags.respec=true;awardAchievements(p);
    return {credits,data,inherited};
  }
  function earnedBudget(p){return E.START_CREDITS+Object.values(p.records).reduce((n,r)=>n+(r.paid||0),0);}
  function remainingRewards(p){return levels().reduce((n,l)=>n+Math.max(0,E.capReward(l)-(record(p,l.id).paid||0)),0);}
  function sanitize(raw){
    if(!raw||typeof raw!=='object'||raw.game!=='orbital-courier'||![1,2,3,4,5,6,7,8].includes(raw.version))throw Error('Нужен JSON игры версии 1–8.');
    const p=fresh(),legacy=raw.version<3;
    p.credits=int(raw.credits,0,10000000);p.data=int(raw.data,0,10000);p.xp=int(raw.xp,0,1000000);
    for(const k of Object.keys(UPGRADE_DEFS))p.upgrades[k]=int(raw.upgrades?.[k],0,raw.version===1?3:5);
    for(const l of levels()){
      const src=raw.records?.[String(l.id)];if(!src||typeof src!=='object')continue;
      const r=blankRecord(),mask=int(src.medals,0,7);r.medals=mask&1?mask:0;
      r.cargo=r.medals&1&&Array.isArray(src.cargo)?[...new Set(src.cargo.filter(x=>Number.isInteger(x)&&x>=0&&x<l.cargo.length))].sort((a,b)=>a-b):[];
      r.routeVersion=int(src.routeVersion,0,11);
      r.attempts=int(src.attempts,0,1000000);r.bestTime=Number.isFinite(src.bestTime)&&src.bestTime>0?Math.min(src.bestTime,10000):null;
      if(legacy&&(r.medals&1)){
        // Old saves have no precision rating: grant conservative legacy credit,
        // never pretend an unmeasured flight was S-grade or professional.
        r.bestScore=Math.round(50*r.cargo.length/Math.max(1,l.cargo.length)+(r.medals&2?15:0)+10);
        r.paid=Math.floor(E.baseReward(l)*(.25+.75*(r.bestScore/100)**1.65));
        r.dataPaid=r.bestScore>=80?1:0;
      }else if(r.medals&1){
        r.paid=int(src.paid,0,E.capReward(l));r.dataPaid=int(src.dataPaid,0,4);
        r.bestScore=int(src.bestScore,0,100);r.proScore=int(src.proScore,0,100);r.proWon=src.proWon===true;
      }
      r.currentMedals=raw.version===8?int(src.currentMedals,0,7):0;r.legacyMedals=raw.version<8?r.medals:int(src.legacyMedals,0,7);r.routes=raw.version===8&&Array.isArray(src.routes)?[...new Set(src.routes.filter(id=>l.branches?.some(b=>b.id===id)))]:[];for(const key of ['bestLoops','bestPortals','bestDrops'])r[key]=raw.version===8?int(src[key],0,200):0;r.bestPrecision=raw.version===8&&Number.isFinite(src.bestPrecision)?Math.max(0,Math.min(1,src.bestPrecision)):0;r.tractorProof=raw.version===8&&src.tractorProof===true;
      p.records[String(l.id)]=r;
    }
    const known=new Set();
    if(!legacy&&Array.isArray(raw.receipts))for(const r of raw.receipts){
      if(!r||!Object.hasOwn(UPGRADE_DEFS,r.key)||!Number.isInteger(r.tier)||r.tier<1||r.tier>p.upgrades[r.key])continue;
      const id=r.key+':'+r.tier;if(known.has(id))continue;known.add(id);
      p.receipts.push({key:r.key,tier:r.tier,credits:r.inherited?0:int(r.credits,0,20000),data:r.inherited?0:int(r.data,0,20),inherited:r.inherited===true});
    }
    for(const [key,lv] of Object.entries(p.upgrades))for(let tier=1;tier<=lv;tier++)if(!known.has(key+':'+tier))p.receipts.push({key,tier,credits:0,data:0,inherited:true});
    p.flags={export:raw.flags?.export===true,respec:raw.flags?.respec===true};
    p.achievements=Array.isArray(raw.achievements)?[...new Set(raw.achievements.filter(x=>achievements.some(a=>a.id===x)))]:[];
    for(const k of Object.keys(p.settings))if(typeof raw.settings?.[k]==='boolean')p.settings[k]=raw.settings[k];
    p.skin=SKINS.some(s=>s.id===raw.skin)?raw.skin:'mint';p.wishlist=Object.hasOwn(UPGRADE_DEFS,raw.wishlist)?raw.wishlist:null;
    p.trail=C.TRAILS.some(t=>t.id===raw.trail&&C.unlocked(p,t))?raw.trail:'vector';
    p.difficulty=raw.difficulty==='pro'?'pro':'normal';
    // Two finite, local aiming presets per level and difficulty. No scripts,
    // filenames or unbounded user data can be imported through this field.
    if (raw.courses && typeof raw.courses === 'object') for (const [key, value] of Object.entries(raw.courses)) {
      if (!/^(0|[1-9]\d*):(normal|pro)$/.test(key) || +key.split(':')[0] >= count() || !Array.isArray(value)) continue;
      p.courses[key] = value.slice(0,2).map(v => v && Number.isFinite(v.angle) && Number.isFinite(v.speed) && v.angle >= -180 && v.angle <= 180 && v.speed >= 60 && v.speed <= 1000 ? {angle:Math.round(v.angle*10)/10,speed:Math.round(v.speed)} : null);
    }
    p.settings.volume=Number.isFinite(raw.settings?.volume)?Math.max(0,Math.min(1,raw.settings.volume)):.6;
    p.campaignAccess=raw.campaignRevision===11&&Array.isArray(raw.campaignAccess)?[...new Set(raw.campaignAccess.filter(id=>Number.isInteger(id)&&id>=0&&id<count()))]:Campaign.order.filter(id=>legacyUnlocked(p,id));
    p.lastLevel=int(raw.lastLevel,0,Math.max(0,count()-1));if(!unlocked(p,p.lastLevel))p.lastLevel=nextLevel(p);
    if(legacy){
      const equivalent=Object.entries(p.upgrades).reduce((n,[key,lv])=>n+Array.from({length:lv},(_,i)=>E.price(key,i+1,0,0)).reduce((a,b)=>a+b,0),0);
      p.credits=Math.max(0,earnedBudget(p)-equivalent);p.data=research(p);
      p.migration={from:raw.version,oldCredits:int(raw.credits,0,10000000),newCredits:p.credits,preservedUpgrades:true};
    }else{
      p.data=Math.min(p.data,Math.max(0,research(p)-dataInvested(p)));
      if(raw.migration?.from===1||raw.migration?.from===2)p.migration=raw.migration;
    }
    return p;
  }
  function read(storage){
    try{
      storage.setItem(SAVE_KEY+'-probe','1');storage.removeItem(SAVE_KEY+'-probe');
      let text=storage.getItem(SAVE_KEY);
      if(!text)for(const key of ['orbital-courier-save-v7','orbital-courier-save-v6','orbital-courier-save-v5','orbital-courier-save-v4','orbital-courier-save-v3',LEGACY_KEY,'orbital-courier-save-v1']){
        text=storage.getItem(key);if(text)break;
      }
      const raw=text?JSON.parse(text):null;
      return {profile:raw?sanitize(raw):fresh(),available:true,error:null,
        migrated:!!raw&&raw.version<3,upgraded:!!raw&&raw.version>=3&&raw.version<8};
    }catch(error){return {profile:fresh(),available:false,error:error.message,migrated:false};}
  }
  function write(storage,p){try{storage.setItem(SAVE_KEY,JSON.stringify(p));return true;}catch{return false;}}
  O.Progress={SAVE_KEY,LEGACY_KEY,UPGRADE_DEFS,RANKS,SKINS,achievements,fresh,record,completed,totalMedals,cargoCount,
    viewRecord,unlocked,nextLevel,rank,stats,medalCount,launch,complete,buy,quote,invested,dataInvested,respec,research,installed,
    earnedBudget,remainingRewards,sanitize,read,write,awardAchievements};
  if(typeof module!=='undefined'&&module.exports)module.exports=O.Progress;
})(typeof globalThis!=='undefined'?globalThis:window);
