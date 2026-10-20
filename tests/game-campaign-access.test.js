'use strict';
const assert=require('node:assert/strict');
require('../game-source/orbital-courier/src/levels');
const O=globalThis.Orbital,G=require('../game-source/orbital-courier/src/progression'),C=O.Campaign,Cosmetics=O.Cosmetics;
const historical=require('../game-source/orbital-courier/docs/completed-v8-profile.json');
const proof=id=>({...structuredClone(historical.records[id]),proWon:true,medals:7,currentMedals:7,routeVersion:O.LEVELS[id].routeRevision||0});
const measured=ids=>{const p=G.fresh();for(const id of ids)p.records[id]=proof(id);return p;};

assert.deepEqual(C.order.filter(id=>G.unlocked(G.fresh(),id)),[4,8]);
assert.equal(C.number(4),1);assert.equal(C.number(8),5);
for(const id of [...C.retired,-1,88,NaN,null,'4']){
 assert.equal(C.isActive(id),false);assert.equal(G.unlocked(G.fresh(),id),false);assert.equal(C.current(historical,id),false);
 assert.equal(C.adjacent(id,1),-1);
}
for(const id of C.retired){
 const p=G.sanitize(historical),before=JSON.stringify(p);
 assert.throws(()=>G.launch(p,id),/ещё не открыт/);assert.throws(()=>G.complete(p,O.LEVELS[id],{status:'won'}),/закрытый контракт/);
 assert.equal(JSON.stringify(p),before,'retired profiles cannot be launched, rewarded or erased');
}

// Two arbitrary deliveries open another block, while its follow-up still needs
// the named route. Even 74 unrelated completions cannot bypass a strict edge.
const choice=measured([4,8]);assert.equal(G.unlocked(choice,12),true);assert.equal(G.unlocked(choice,13),false);
for(const id of C.order){
 const rule=C.requirement(id);assert.ok(['free','count','after','either'].includes(rule.kind));
 for(const previous of rule.prerequisites){assert.ok(C.isActive(previous));assert.ok(C.position(previous)<C.position(id),'access graph is acyclic');}
 if(rule.kind==='after'){
  const missing=new Set([id,...rule.prerequisites]),p=measured(C.order.filter(q=>!missing.has(q)));
  assert.equal(G.unlocked(p,id),false,'strict previous route '+id);
  assert.equal(G.unlockRequirement(p,id).remaining,null);assert.match(G.lockReason(p,id),/После контракта №/);
  p.records[rule.prerequisites[0]]=proof(rule.prerequisites[0]);assert.equal(G.unlocked(p,id),true);
 }
}
const counted=G.unlockRequirement(G.fresh(),12);
assert.deepEqual({kind:counted.kind,required:counted.required,completed:counted.completed,remaining:counted.remaining},{kind:'count',required:2,completed:0,remaining:2});
assert.equal(G.lockReason(G.fresh(),12),'Ещё 2 доставки (0/2)');
assert.ok(G.lockReason(G.fresh(),5).includes(O.LEVELS[4].name));
for(const id of [58,76]){
 const rule=C.requirement(id);assert.equal(rule.kind,'either');
 assert.equal(G.unlocked(measured(rule.prerequisites),id),true,'specific mastery opens the alternate entry');
 const byCount=measured(C.order.filter(q=>q!==id&&!rule.prerequisites.includes(q)).slice(0,rule.completed));
 assert.equal(G.unlocked(byCount,id),true,'total experience opens the alternate entry');
 assert.match(G.lockReason(G.fresh(),id),/или после контракта №/);
}
// Explore the available choices in reverse order, rather than following the
// printed catalogue. The graph must always offer a route until it is complete.
const explorer=G.fresh();let explored=0;
while(C.count(explorer)<C.order.length){
 const options=C.order.filter(id=>G.unlocked(explorer,id)&&!C.current(explorer,id));assert.ok(options.length,'no campaign dead end');
 const id=options.at(-1);explorer.records[id]=proof(id);assert.ok(++explored<=C.order.length);
}
assert.equal(explored,84);

function oldCurrent(p,id){const l=O.LEVELS[id],r=p.records[id];return !!(r?.medals&1)&&(!(l.routeRevision>8)||(r.routeVersion===l.routeRevision&&!!(r.currentMedals&1)));}
function oldAccess(p,id){const i=C.legacyOrder.indexOf(id),r=p.records[id];return i===0||!!(r?.medals&1)||r?.attempts>0||p.campaignAccess.includes(id)||i>0&&oldCurrent(p,C.legacyOrder[i-1]);}
// Test every old-chain boundary, including a remembered distant opening.
for(let prefix=0;prefix<=C.legacyOrder.length;prefix++){
 const raw=measured(C.legacyOrder.slice(0,prefix));raw.campaignRevision=11;raw.campaignAccess=[75];
 const previouslyOpen=C.order.filter(id=>oldAccess(raw,id)),p=G.sanitize(raw);
 for(const id of previouslyOpen)assert.equal(G.unlocked(p,id),true,'revision 11 opening retained '+prefix+':'+id);
 assert.equal(p.campaignRevision,12);assert.deepEqual(G.sanitize(p),p,'campaign migration is idempotent');
}
const prior=measured([0,1,2,3,18]);prior.campaignRevision=11;prior.credits=1234;prior.xp=9876;prior.achievements=['first','gold-80','pro-80'];
prior.records[17]={...G.record(G.fresh(),17),attempts:1};prior.campaignAccess=[45];prior.lastLevel=0;
prior.courses={'0:normal':[{angle:8.9,speed:220},null],'17:pro':[null,{angle:15,speed:155}]};
const migrated=G.sanitize(prior);
for(const key of ['records','credits','data','xp','upgrades','receipts','courses','achievements'])assert.deepEqual(migrated[key],prior[key],key+' survives retiring definitions');
assert.equal(migrated.lastLevel,4);assert.equal(G.completed(migrated),5);assert.equal(C.count(migrated),1);
assert.equal(G.unlocked(migrated,17),true);assert.equal(G.unlocked(migrated,45),true);
assert.equal(G.unlocked(migrated,0),false);

// Final achievement IDs remain recognised in imports; a new player can earn
// both with 76 active contracts, without needing the four retired records.
const full=measured(C.order);full.xp=30000;
for(const id of ['gold-80','pro-80']){
 const a=G.achievements.find(q=>q.id===id);assert.equal(a.target,76);assert.equal(a.test(full),true);assert.match(a.text,/76/);
}
const atlas=G.SKINS.find(q=>q.id==='atlas'),trail=Cosmetics.TRAILS.find(q=>q.id==='cartographer');
assert.equal(atlas.gate,'all80');assert.equal(trail.gate,'all80');assert.equal(Cosmetics.unlocked(full,atlas),true);assert.equal(Cosmetics.unlocked(full,trail),true);
delete full.records[79];assert.equal(Cosmetics.unlocked(full,atlas),false);assert.equal(Cosmetics.unlocked(full,trail),false);
console.log('campaign access: choice, strict prerequisites, count alternatives, DAG reachability, revision-11 retention and attainable final awards passed');
