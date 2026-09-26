'use strict';
const assert=require('node:assert/strict');
require('../game-source/orbital-courier/src/levels');
const O=globalThis.Orbital,G=require('../game-source/orbital-courier/src/progression'),P=require('../game-source/orbital-courier/src/physics'),C=O.Campaign;
assert.equal(C.tiers.length,5);assert.equal(new Set(C.order).size,80);assert.equal(C.order.length,80);
assert.deepEqual([...C.order].sort((a,b)=>a-b),O.LEVELS.map(l=>l.id));
assert.equal(O.LEVELS.some(l=>l.stops?.length),false);
const fresh=G.fresh();assert.deepEqual(C.order.filter(id=>G.unlocked(fresh,id)),[0]);
let prior=0;const profile=G.fresh();
for(const id of C.order){const l=O.LEVELS[id],tier=C.tiers.indexOf(C.tier(id));assert.ok(tier>=prior);prior=tier;
 assert.equal(G.nextLevel(profile),id);assert.ok(G.unlocked(profile,id));
 const c=l.solution,state=P.simulate(P.prepareLevel(l),c.angle,c.speed).state;assert.equal(state.status,'won');G.complete(profile,l,state);
}
assert.equal(C.count(profile),80);assert.equal(C.adjacent(79,1),-1);assert.equal(C.adjacent(19,1),16);assert.equal(C.number(18),17);
const historical=require('../game-source/orbital-courier/docs/completed-v8-profile.json'),save=G.sanitize(historical);
for(const key of ['records','credits','data','xp','upgrades','receipts','courses','skin','trail'])assert.deepEqual(save[key],historical[key],key+' retained');
assert.equal(C.count(save),76);assert.equal(G.nextLevel(save),76);assert.equal(G.viewRecord(save,76).currentMedals,0);assert.equal(G.viewRecord(save,76).legacyMedals,7);
assert.ok(C.order.every(id=>G.unlocked(save,id)));assert.deepEqual(G.sanitize(save),save);
const l=O.LEVELS[76],s=P.simulate(P.prepareLevel(l),l.solution.angle,l.solution.speed).state,before={credits:save.credits,xp:save.xp};
const result=G.complete(save,l,s);assert.equal(C.current(save,76),true);assert.equal(save.records[76].routeVersion,11);assert.equal(result.first,false);assert.equal(result.newMedals,0);
const same=G.complete(save,l,s);assert.equal(same.totalCredits,0);assert.equal(same.totalXP,0);assert.equal(same.data,0);assert.ok(save.credits>=before.credits&&save.xp>=before.xp);
assert.equal(G.sanitize(save).records[76].routeVersion,11);assert.equal(G.nextLevel(save),77);
// Old partially played profiles keep the earlier available sectors and remembered courses.
const partial=structuredClone(historical);for(const id in partial.records)if(+id>=24)delete partial.records[id];partial.lastLevel=23;partial.courses={'23:normal':[{angle:15,speed:155},null]};
const migrated=G.sanitize(partial);assert.ok(G.unlocked(migrated,68));assert.ok(G.unlocked(migrated,76));assert.deepEqual(migrated.courses,partial.courses);
assert.equal(G.sanitize({...save,settings:{...save.settings,volume:2}}).settings.volume,1);assert.equal(G.sanitize({...save,settings:{...save.settings,volume:-1}}).settings.volume,0);
console.log('campaign: five ordered tiers, all 80 courses, stable IDs, archived finals, no repeat farming, old access and volume settings passed');
