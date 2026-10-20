'use strict';
const assert=require('node:assert/strict');
require('../game-source/orbital-courier/src/levels');
const O=globalThis.Orbital,P=require('../game-source/orbital-courier/src/physics'),G=require('../game-source/orbital-courier/src/progression'),C=O.Campaign;
const levels=O.LEVELS.filter(l=>l.placement),source=JSON.stringify(levels);let flights=0;const report=[];
assert.equal(levels.length,8);assert.deepEqual(levels.map(l=>l.id),[80,81,82,83,84,85,86,87]);
for(const l of levels){
 const course=l.solution;assert.equal(l.routeRevision,13);assert.ok(l.rocks.length>=5);assert.ok(l.gates.length>=2);assert.ok(l.placement.preview>=l.timeLimit-3);
 assert.equal(P.layoutProblem(l,course.layout),'');assert.equal(P.layoutProblem(l,P.planetLayout(l)),'');
 assert.notEqual(P.simulate(P.prepareLevel(l),course.angle,course.speed).state.status,'won','initial layout is an unsolved puzzle '+l.id);
 assert.notEqual(P.obstacleHit(l.start,l.target,{planets:[],rocks:l.rocks},5),null,'the debris blocks the direct chord '+l.id);
 for(const mode of ['normal','pro'])for(let magnet=0;magnet<=5;magnet++)for(let docking=0;docking<=5;docking++){
  const profile=G.fresh();profile.upgrades.magnet=magnet;profile.upgrades.docking=docking;const prepared=P.prepareLevel(l,mode,course.layout),s=P.simulate(prepared,course.angle,course.speed,G.stats(profile)).state;
  assert.equal(s.status,'won',`${l.id} ${mode} magnet${magnet} docking${docking}: ${s.reason}`);assert.equal(s.cargo.length,3);assert.equal(s.gateIndex,l.gates.length);flights++;
 }
 const prepared=P.prepareLevel(l,'pro',course.layout),base=P.simulate(prepared,course.angle,course.speed).state;
 let half=P.createState(prepared,course.angle,course.speed);while(half.status==='flying')half=P.step(half,prepared,P.DT/2);
 assert.equal(half.status,'won');assert.ok(Math.abs(half.t-base.t)<.015);assert.ok(Math.hypot(half.x-base.x,half.y-base.y)<1);
 const flat={...prepared,planets:prepared.planets.map(p=>({...p,mu:0}))};assert.notEqual(P.simulate(flat,course.angle,course.speed).state.status,'won');
 for(let i=0;i<prepared.planets.length;i++)assert.notEqual(P.simulate({...prepared,planets:prepared.planets.map((p,j)=>({...p,mu:i===j?0:p.mu}))},course.angle,course.speed).state.status,'won','each placed world matters');
 if(l.id>=86){const b=l.rocks.find(p=>p.motion),a=P.bodyAt(b,0),later=P.bodyAt(b,2);assert.ok(Math.hypot(a.x-later.x,a.y-later.y)>10);assert.ok(P.layoutProblem(l,[{planet:0,x:b.motion.cx,y:b.motion.cy}]));}
 let neighbours=0,alternateLayouts=0;
 for(const da of [-.2,-.1,0,.1,.2])for(const ds of [-1,0,1])if(P.simulate(prepared,course.angle+da,course.speed+ds).state.status==='won')neighbours++;
 for(const dx of [-4,-2,2,4]){const q=course.layout.map(p=>({...p,x:p.x+dx}));if(!P.layoutProblem(l,q)&&P.simulate(P.prepareLevel(l,'pro',q),course.angle,course.speed).state.status==='won')alternateLayouts++;}
 assert.ok(neighbours>=3,l.id+' has a playable course neighbourhood');assert.ok(alternateLayouts>=1,l.id+' is not a single-coordinate lock');
 const far=P.planetLayout(l,[{planet:0,x:-1e12,y:1e12,mu:Infinity,r:0}]);assert.equal(far.length,l.placement.zones.length);assert.ok(far.every(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)));
 const s=G.fresh();s.layouts[l.id+':normal']=course.layout;s.courses[l.id+':normal']=[{angle:course.angle,speed:course.speed,layout:course.layout},null];
 const restored=G.sanitize(s);assert.deepEqual(restored.layouts,s.layouts);assert.deepEqual(restored.courses,s.courses);assert.deepEqual(G.sanitize(restored),restored);
 assert.deepEqual(P.prepareLevel(l,'normal',restored.layouts[l.id+':normal']).planets.map(p=>[p.mu,p.r]),l.planets.map(p=>[p.mu,p.r]));
 report.push({id:l.id,seconds:+base.t.toFixed(3),precision:+base.dockPrecision.toFixed(4),neighbours,alternateLayouts});
}
assert.equal(JSON.stringify(levels),source,'all preparation and simulation leaves authored data untouched');
const p=G.fresh();assert.equal(G.unlocked(p,80),false);p.records[19]={...G.record(p,19),medals:1};assert.equal(G.unlocked(p,80),true);assert.equal(G.unlocked(p,81),false);
const old=require('../game-source/orbital-courier/docs/completed-v8-profile.json'),migrated=G.sanitize(old);assert.deepEqual(migrated.layouts,{});assert.equal(G.unlocked(migrated,80),true);assert.equal(G.unlocked(migrated,84),true);assert.equal(G.unlocked(migrated,85),false);
console.log('planet placement:',flights,'upgrade/difficulty flights, half-step convergence, meaningful obstacles, gravity, local tolerance, save migration and access passed',JSON.stringify(report));
