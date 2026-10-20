/* Bounded counters, seven sections; awards never pay credits. */
(function(root){'use strict';const O=root.Orbital=root.Orbital||{};
const CATEGORIES=[['campaign','Экспедиция','✧'],['mastery','Мастерство','★'],['routes','Маршруты','⌁'],['portals','Разломы','◎'],['courier','Курьерская служба','▣'],['engineering','Инженерия','⚙'],['legacy','Наследие','◇']];
function create(legacy){let all=legacy.map(a=>({...a,category:'legacy'}));const records=p=>Object.values(p.records),L=()=>O.Campaign.order.filter(id=>id<80).map(id=>O.LEVELS[id]),done=(p,id)=>!!(p.records[id]?.medals&1);const add=(id,name,text,category,target,get,xp=80)=>all.push({id,name,text,category,target,progress:p=>Math.min(target,get(p)),test:p=>get(p)>=target,xp,icon:CATEGORIES.find(c=>c[0]===category)[2]});
for(let s=3;s<20;s++)add('sector-'+s,`${O.SECTORS[s].name}: полный маршрут`,`Завершить четыре контракта «${O.SECTORS[s].name}».`,'campaign',4,p=>L().filter(l=>l.sector===s&&(l.routeRevision>8?O.Campaign.current(p,l.id):done(p,l.id))).length,80+5*s);
// Keep the saved award IDs gold-80/pro-80 while making their final objective
// attainable in the active catalogue. Already earned awards are never revoked.
const series=(key,title,cat,ts,get,xp=80)=>ts.forEach((n,i)=>{const target=n===80?O.Campaign.order.filter(id=>id<80).length:n;add(key+'-'+n,`${title} ${i+1}`,`${title}: ${target} разных подтверждений.` ,cat,target,get,xp+i*20);});
series('gold','Три актуальные медали','mastery',[5,15,30,60,80],p=>L().filter(l=>p.records[l.id]?.currentMedals===7&&(!(l.routeRevision>8)||p.records[l.id].routeVersion===l.routeRevision)).length);
series('pro','Профессиональные рейсы','mastery',[1,4,20,40,80],p=>L().filter(l=>p.records[l.id]?.proWon).length);
series('precision','Заход не хуже 95%','mastery',[5,20,40],p=>records(p).filter(r=>r.bestPrecision>=.95).length);
series('loops','Завершённые облёты','routes',[25,60,110,160],p=>records(p).reduce((n,r)=>n+(r.bestLoops||0),0));
series('portals','Разные переходы','portals',[8,20,35,50,68],p=>records(p).reduce((n,r)=>n+(r.bestPortals||0),0));
series('moving','Подвижные миры','routes',[8,16,24,30],p=>L().filter(l=>l.planets.some(q=>q.motion)&&done(p,l.id)).length);
series('proofs','Подтверждённые ветви','routes',[4,12,20,24],p=>records(p).reduce((n,r)=>n+(r.routes?.length||0),0));
series('both','Обе стороны карты','routes',[1,4,8,12],p=>records(p).filter(r=>r.routes?.length>=2).length);
series('multi','Предел навигации','courier',[1,4],p=>L().filter(l=>l.sector===19&&O.Campaign.current(p,l.id)).length);
series('addresses','Облёты за пределом','courier',[3,6,11],p=>L().filter(l=>l.sector===19&&O.Campaign.current(p,l.id)).reduce((n,l)=>n+(p.records[l.id]?.bestLoops||0),0));
series('tractor-run','Рейсы с притяжением груза','engineering',[6,20,40],p=>records(p).filter(r=>r.tractorProof).length);
add('full-kit','Четыре системы','Установить по одной ступени всех четырёх модулей.','engineering',4,p=>Object.values(p.upgrades).filter(n=>n>0).length);
add('specialist','Двойная специализация','Два модуля не ниже IV ступени.','engineering',2,p=>Object.values(p.upgrades).filter(n=>n>=4).length);
add('respec','Новая конфигурация','Пересобрать хотя бы один оплаченный модуль.','engineering',1,p=>p.flags?.respec?1:0,40);
add('backup','Резервный канал','Экспортировать JSON прогресса.','engineering',1,p=>p.flags?.export?1:0,40);
for(const s of [20,21])add('sector-'+s,O.SECTORS[s].name,'Завершить четыре контракта сектора «'+O.SECTORS[s].name+'».','engineering',4,p=>O.LEVELS.filter(l=>l.sector===s&&O.Campaign.current(p,l.id)).length,180);
for(const n of [1,4,8])add('architect-'+n,['Первое поле','Собственная орбита','Архитектор тяготения'][[1,4,8].indexOf(n)],'Завершить '+n+' '+(n===1?'контракт':n===4?'контракта':'контрактов')+' с самостоятельной расстановкой планет.','engineering',n,p=>O.LEVELS.filter(l=>l.placement&&O.Campaign.current(p,l.id)).length,100+n*25);
if(all.length!==98)throw Error('Expected 98 achievements, got '+all.length);return all;}
O.Achievements={CATEGORIES,create};if(typeof module!=='undefined'&&module.exports)module.exports=O.Achievements;
})(typeof globalThis!=='undefined'?globalThis:window);
