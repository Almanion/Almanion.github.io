/* Presentation order is independent of stable save IDs and reward sectors. */
(function(root){
 'use strict';const O=root.Orbital=root.Orbital||{};
 const tiers=[
  {name:'Начальная',description:'Чтение дуги, обход планет и свободная доставка.',sectors:[0,1,2,3],color:'#80ddbf'},
  {name:'Средняя',description:'Каменные проходы, полный груз и точная стыковка.',sectors:[4,6,10],color:'#91d3ff'},
  {name:'Сложная',description:'Возвратные петли, порталы и выбор ветви.',sectors:[7,8,15,5],color:'#d5b1ff'},
  {name:'Экспертная',description:'Движущиеся планеты, портальные каскады и встречные ветви.',sectors:[11,16,18,17],color:'#ffc68f'},
  {name:'Предельная',description:'Три центра притяжения, резонансы, перехваты и узкие окна прибытия.',sectors:[14,12,13,9,19],color:'#ff9ead'}
 ];
 const blocks={4:[18,17,19,16],6:[26,24,25,27],10:[41,43,42,40],8:[35,34,33,32],11:[46,47,44,45],12:[49,50,48,51],13:[54,52,55,53],14:[58,59,56,57]};
 const sectors=tiers.flatMap(t=>t.sectors),order=sectors.flatMap(s=>blocks[s]||[s*4,s*4+1,s*4+2,s*4+3]);
 const position=id=>order.indexOf(id),number=id=>position(id)+1,adjacent=(id,d)=>order[position(id)+d]??-1;
 const tier=id=>tiers.find(t=>t.sectors.includes(O.LEVELS[id].sector));
 const current=(p,id)=>{const l=O.LEVELS[id],r=p.records?.[id];return !!(r?.medals&1)&&(!(l.routeRevision>8)||(r.routeVersion===l.routeRevision&&!!(r.currentMedals&1)));};
 O.Campaign={tiers,sectors,order,position,number,adjacent,tier,current,count:p=>order.filter(id=>current(p,id)).length};
 if(typeof module!=='undefined'&&module.exports)module.exports=O.Campaign;
})(typeof globalThis!=='undefined'?globalThis:window);
