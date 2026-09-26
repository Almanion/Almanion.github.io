'use strict';
const assert=require('node:assert/strict');
require('../game-source/orbital-courier/src/levels');
const O=globalThis.Orbital,G=require('../game-source/orbital-courier/src/progression'),P=require('../game-source/orbital-courier/src/physics'),M=O.Medals,C=O.Campaign;
const def=id=>G.achievements.find(a=>a.id===id);
const historical=require('../game-source/orbital-courier/docs/completed-v8-profile.json');
const measured=(ids)=>{const p=G.fresh();for(const id of ids)p.records[id]=structuredClone(historical.records[id]);return p;};
// The displayed contract numbers, not historical IDs, define "first N".
for(const [id,n] of Object.entries({ring:4,titan:8,final:12,ice:16,storms:20,frontier:24,deep:28,campaign32:44,campaign56:56,campaign64:64,campaign68:68})){
 const p=measured(C.order.slice(0,n-1)),a=def(id);assert.equal(a.progress(p),n-1,id);assert.equal(a.test(p),false,id);
 p.records[C.order[n-1]]=structuredClone(historical.records[C.order[n-1]]);assert.equal(a.test(p),true,id);assert.equal(a.progress(p),n,id);
}
const first44=measured(C.order.slice(0,44));for(const id of ['manifest96','medals96']){assert.equal(def(id).test(first44),true,id);const missing=structuredClone(first44);delete missing.records[C.order[43]];assert.equal(def(id).test(missing),false,id);}
const experts=C.order.filter(id=>C.tiers[3].sectors.includes(O.LEVELS[id].sector));assert.equal(def('expert12').test(measured(experts.slice(0,11))),false);assert.equal(def('expert12').test(measured(experts.slice(0,12))),true);
// Upgrade rewards happen on the purchase itself and survive a refund/reload.
for(const key of Object.keys(G.fresh().upgrades)){
 const p=G.sanitize(historical);p.upgrades=G.fresh().upgrades;p.receipts=[];p.achievements=[];G.awardAchievements(p);
 for(let tier=1;tier<=5;tier++){
  const result=G.buy(p,key);assert.equal(result.ok,true,key+' '+tier);
  assert.equal(result.awards.some(a=>a.id==='engineer'),tier===3);
  assert.equal(result.awards.some(a=>a.id==='master'),tier===5);
  assert.equal(result.awards.some(a=>a.id==='tractor'),key==='magnet'&&tier===1);
 }
 const xp=p.xp;G.respec(p);const refundedXP=p.xp;assert.ok(refundedXP>=xp);
 assert.equal(G.respec(p).awards.length,0);assert.equal(p.xp,refundedXP);
 const restored=G.sanitize(p);assert.ok(restored.achievements.includes('master'));assert.equal(G.awardAchievements(restored).length,0);assert.equal(restored.xp,refundedXP);
}
// Every definition has attainable, bounded progress; every reward is issued once.
const full=G.sanitize(historical);full.achievements=[];full.upgrades={scanner:5,magnet:5,docking:5,engine:5};full.flags={export:true,respec:true};
for(const l of O.LEVELS.slice(76)){const s=P.simulate(P.prepareLevel(l),l.solution.angle,l.solution.speed).state;G.complete(full,l,s);}
for(const a of G.achievements){assert.ok(Number.isFinite(a.progress(full))&&a.progress(full)>=0&&a.progress(full)<=a.target,a.id);if(a.id!=='skim')assert.equal(a.test(full),true,a.id);}
G.awardAchievements(full,{status:'won',nearMiss:true});assert.equal(new Set(full.achievements).size,93);const xp=full.xp;assert.equal(G.awardAchievements(full,{status:'won',nearMiss:true}).length,0);assert.equal(full.xp,xp);
// Engine I–V changes fuel accounting, not the actual route or its timing.
let runs=0;
for(const l of O.LEVELS)for(const mode of ['normal','pro']){
 const course=(mode==='pro'?l.proSolution:null)||l.solution,prepared=P.prepareLevel(l,mode),base=P.simulate(prepared,course.angle,course.speed,G.stats(G.fresh())).state;
 assert.equal(base.status,'won',l.id+' '+mode);
 for(let tier=1;tier<=5;tier++){
  const p=G.fresh();p.upgrades.engine=tier;const s=P.simulate(prepared,course.angle,course.speed,G.stats(p)).state;
  assert.deepEqual([s.status,s.t,s.x,s.y,s.cargo],[base.status,base.t,base.x,base.y,base.cargo]);
  for(const [i,rule] of M.rules(prepared).entries())if(rule.type==='economy')assert.equal(!!(M.mask(prepared,s)&(1<<i)),course.speed*(1-.03*tier)<=rule.limit+1e-8);
  runs++;
 }
}
const training=G.fresh(),l=O.LEVELS[0],s=P.simulate(l,l.solution.angle,l.solution.speed).state,before=JSON.stringify(training);
G.complete(training,l,{...s,assisted:true});assert.equal(JSON.stringify(training),before);assert.throws(()=>G.complete(training,l,{...s,status:'failed'}));assert.equal(JSON.stringify(training),before);
console.log(`achievements: all 93 attainable once; campaign thresholds, upgrades/refunds, training and ${runs} engine flights passed`);
