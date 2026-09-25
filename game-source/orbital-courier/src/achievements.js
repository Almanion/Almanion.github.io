/* Bounded counters, seven sections; awards never pay credits. */
(function(root){'use strict';const O=root.Orbital=root.Orbital||{};
const CATEGORIES=[['campaign','Экспедиция','✧'],['mastery','Мастерство','★'],['routes','Маршруты','⌁'],['portals','Разломы','◎'],['courier','Курьерская служба','▣'],['engineering','Инженерия','⚙'],['legacy','Наследие','◇']];
function create(legacy){let all=legacy.map(a=>({...a,category:'legacy',target:1,progress:p=>a.test(p)?1:0}));const records=p=>Object.values(p.records),L=()=>O.LEVELS||[],done=(p,id)=>!!p.records[id]?.medals;const add=(id,name,text,category,target,get,xp=80)=>all.push({id,name,text,category,target,progress:p=>Math.min(target,get(p)),test:p=>get(p)>=target,xp,icon:CATEGORIES.find(c=>c[0]===category)[2]});
for(let s=3;s<20;s++)add('sector-'+s,`Сектор ${s+1}: полный маршрут`,`Завершить все четыре контракта сектора ${s+1}.`,'campaign',4,p=>L().filter(l=>l.sector===s&&done(p,l.id)).length,80+5*s);
const series=(key,title,cat,ts,get,xp=80)=>ts.forEach((n,i)=>add(key+'-'+n,`${title} ${i+1}`,`${title}: ${n} разных подтверждений.` ,cat,n,get,xp+i*20));
series('gold','Три актуальные медали','mastery',[5,15,30,60,80],p=>records(p).filter(r=>r.currentMedals===7).length);
series('pro','Профессиональные рейсы','mastery',[1,4,20,40,80],p=>records(p).filter(r=>r.proWon).length);
series('precision','Заход не хуже 95%','mastery',[5,20,40],p=>records(p).filter(r=>r.bestPrecision>=.95).length);
series('loops','Завершённые облёты','routes',[25,60,110,160],p=>records(p).reduce((n,r)=>n+(r.bestLoops||0),0));
series('portals','Разные переходы','portals',[8,20,35,50,68],p=>records(p).reduce((n,r)=>n+(r.bestPortals||0),0));
series('moving','Подвижные миры','routes',[8,16,24,30],p=>L().filter(l=>l.planets.some(q=>q.motion)&&done(p,l.id)).length);
series('proofs','Подтверждённые ветви','routes',[4,12,20,24],p=>records(p).reduce((n,r)=>n+(r.routes?.length||0),0));
series('both','Обе стороны карты','routes',[1,4,8,12],p=>records(p).filter(r=>r.routes?.length>=2).length);
series('multi','Многоадресные рейсы','courier',[1,4],p=>L().filter(l=>l.stops?.length&&done(p,l.id)).length);
series('addresses','Промежуточные получатели','courier',[3,6,11],p=>records(p).reduce((n,r)=>n+(r.bestDrops||0),0));
series('tractor-run','Рейсы с притяжением груза','engineering',[6,20,40],p=>records(p).filter(r=>r.tractorProof).length);
add('full-kit','Четыре системы','Установить по одной ступени всех четырёх модулей.','engineering',4,p=>Object.values(p.upgrades).filter(n=>n>0).length);
add('specialist','Двойная специализация','Два модуля не ниже IV ступени.','engineering',2,p=>Object.values(p.upgrades).filter(n=>n>=4).length);
add('respec','Новая конфигурация','Пересобрать хотя бы один оплаченный модуль.','engineering',1,p=>p.flags?.respec?1:0,40);
add('backup','Резервный канал','Экспортировать JSON прогресса.','engineering',1,p=>p.flags?.export?1:0,40);
if(all.length!==93)throw Error('Expected 93 achievements, got '+all.length);return all;}
O.Achievements={CATEGORIES,create};if(typeof module!=='undefined'&&module.exports)module.exports=O.Achievements;
})(typeof globalThis!=='undefined'?globalThis:window);
