/* Active catalogue and access graph; saved IDs and reward sectors never move. */
(function(root){
 'use strict';const O=root.Orbital=root.Orbital||{};
 const tiers=[
  {name:'Начальная',description:'Обход планет, свободный выбор маршрута и доставка.',sectors:[1,2,3],color:'#80ddbf'},
  {name:'Средняя',description:'Каменные проходы, полный груз и точная стыковка.',sectors:[4,6,10],color:'#91d3ff'},
  {name:'Сложная',description:'Возвратные петли, порталы и выбор ветви.',sectors:[7,8,15,5],color:'#d5b1ff'},
  {name:'Экспертная',description:'Движущиеся планеты, портальные каскады и встречные ветви.',sectors:[11,16,18,17],color:'#ffc68f'},
  {name:'Предельная',description:'Резонансы, точные перехваты и собственные гравитационные трассы среди преград.',sectors:[14,12,13,9,19,20,21],color:'#d1b5d8'}
 ];
 const blocks={4:[18,17,19,16],6:[26,24,25,27],10:[41,43,42,40],8:[35,34,33,32],11:[46,47,44,45],12:[49,50,48,51],13:[54,52,55,53],14:[58,59,56,57]};
 const revision=12,retired=Object.freeze([0,1,2,3]);
 const sectors=tiers.flatMap(t=>t.sectors),block=s=>blocks[s]||[s*4,s*4+1,s*4+2,s*4+3];
 const legacyOrder=Object.freeze([0,1,2,3,...sectors.filter(s=>s<20).flatMap(block)]),order=Object.freeze(sectors.flatMap(block));
 const active=new Set(order),isActive=id=>Number.isInteger(id)&&active.has(id);
 const position=id=>order.indexOf(id),number=id=>isActive(id)?position(id)+1:0;
 const adjacent=(id,d)=>isActive(id)?order[position(id)+d]??-1:-1;
 const tier=id=>isActive(id)?tiers.find(t=>t.sectors.includes(O.LEVELS[id].sector)):undefined;
 const current=(p,id)=>{if(!isActive(id))return false;const l=O.LEVELS[id],r=p.records?.[id];return !!(r?.medals&1)&&(!(l.routeRevision>8)||(r.routeVersion===l.routeRevision&&!!(r.currentMedals&1)));};
 // Block entries offer a choice by lifetime experience. The following three
 // contracts require their named predecessor: experience cannot skip the lesson.
 // The two late "either" entries also recognise a relevant mastered route.
 const entries=[
  [1,0],[2,0],[3,2],[4,6],[6,8],[10,10],[7,14],[8,16],[15,18],[5,20],
  [11,26],[16,29],[18,32],[17,35],[14,42,[71]],[12,46],[13,50],[9,54],[19,64,[39]],
  [20,12,[19]],[21,28,[83]]
 ];
 const requirements=new Map();
 for(const [sector,completed,prerequisites=[]]of entries){
  const ids=block(sector);
  requirements.set(ids[0],Object.freeze({kind:completed===0?'free':prerequisites.length?'either':'count',completed,prerequisites:Object.freeze(prerequisites)}));
  for(let i=1;i<ids.length;i++)requirements.set(ids[i],Object.freeze({kind:'after',completed:null,prerequisites:Object.freeze([ids[i-1]])}));
 }
 const requirement=id=>requirements.get(id)||null;
 O.Campaign={revision,retired,legacyOrder,tiers,sectors,order,isActive,requirement,position,number,adjacent,tier,current,count:p=>order.filter(id=>current(p,id)).length};
 if(typeof module!=='undefined'&&module.exports)module.exports=O.Campaign;
})(typeof globalThis!=='undefined'?globalThis:window);
