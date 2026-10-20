'use strict';
const assert=require('node:assert/strict');
require('../game-source/orbital-courier/src/levels');
const G=require('../game-source/orbital-courier/src/progression'),O=globalThis.Orbital,F=O.Fleet;
const old=structuredClone(require('../game-source/orbital-courier/docs/completed-v8-profile.json'));
assert.equal(G.fresh().model,'courier');
const migrated=G.sanitize(old);assert.equal(migrated.model,'courier');assert.deepEqual(G.sanitize(migrated),migrated);
assert.equal(G.sanitize({...G.fresh(),model:'manta'}).model,'courier');
assert.equal(G.sanitize({...old,model:'unknown'}).model,'courier');
assert.equal(new Set(F.MODELS.map(m=>m.id)).size,5);
const base=G.sanitize({...old,xp:25000}),stats=G.stats(base),funds=[base.credits,base.data,base.xp];
for(const model of F.MODELS){
 const profile=G.sanitize({...base,model:model.id});assert.equal(profile.model,model.id);
 assert.deepEqual(G.stats(profile),stats,'hull cannot alter flight stats');
 assert.deepEqual([profile.credits,profile.data,profile.xp],funds);
 assert.deepEqual(G.sanitize(profile),profile,'hull survives import/cloud normalization');
}
console.log('Fleet save compatibility, access gates and unchanged flight stats verified.');
