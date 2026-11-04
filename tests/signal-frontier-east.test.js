'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),E=require('../game-source/signal-frontier/src/engine');
const fresh=()=>E.make('frontier-10'),roundTrip=s=>{const r=E.restore(E.snapshot(s));assert.ok(r,'Valid expanded operation must restore');assert.deepEqual(E.snapshot(r),E.snapshot(s));return r;};
function open(s){E.living(s,'citadel').hp=0;E.step(s,{},E.DT);return s;}
function clearEast(s){for(const u of s.units)if(u.team&&u.eastRole==='guard')u.hp=0;}
function interact(s,x,y,seconds){Object.assign(E.hero(s),{x,y});for(let i=0;i<Math.ceil(seconds/E.DT)+2;i++)E.step(s,{interact:true},E.DT);}
test('expanded map owns its heights, preserves legacy saves and has finite resources and guards',()=>{
 const old=E.make('frontier-9'),s=fresh();assert.equal(E.map(old).W,3600);assert.equal(E.map(s).W,5600);
 assert.equal(E.terrain.level(3960,2040),-1);assert.equal(E.terrainFor(s).level(3960,2040),1);
 assert.equal(s.units.filter(u=>u.eastRole==='guard').length,28);assert.equal(s.campaign.mines.length,10);
 assert.equal(s.campaign.mines.reduce((n,m)=>n+m.stock,0),19440);
 assert.ok(s.units.every(u=>E.free(u.x,u.y,E.C[u.kind].r,u.map)));roundTrip(old);roundTrip(s);
});
test('both eastern routes admit a heavy chassis with actual terrain and pathfinding',()=>{
 const s=open(fresh());s.east.power=true;s.east.service=true;E.step(s,{},E.DT);
 for(const [name,blocks]of [['direct',['E02','E05','E06','E07']],['south',['E02','E03','E04','E08']]]){
  const map=E.map(s),nav={...map,navigation:true,key:name,state:s,connectivity:new Map(),walls:[...map.walls,...E.east.links.filter(l=>blocks.includes(l.id))]},from={x:3960,y:2080,map:nav},route=E.pathTo(from,E.east.dock,24);
  assert.ok(route.length,name+' route missing');assert.ok(E.dist(route.at(-1),E.east.dock)<1,name+' does not reach dock');
 }
});
test('citadel is a checkpoint only in the new mission, without resetting the army or economy',()=>{
 const s=fresh(),alloy=s.economy.alloy,ids=s.units.filter(u=>!u.team).map(u=>u.id);open(s);
 assert.equal(s.status,'playing');assert.equal(s.east.open,true);assert.equal(s.economy.alloy,alloy);assert.deepEqual(s.units.filter(u=>!u.team).map(u=>u.id),ids);roundTrip(s);
 const old=E.make('frontier-9');E.living(old,'citadel').hp=0;E.step(old,{},E.DT);assert.equal(old.status,'won');
});
test('claim, service opening, power shutdown, docking and transmission round trip',()=>{
 const s=open(fresh());clearEast(s);for(const u of s.units)if(u.team)u.hp=0;
 // Avoid old terminal work and keep all schema-owned objects in place.
 interact(s,3920,2040,3);assert.equal(s.east.claimed,true);roundTrip(s);
 interact(s,4880,3000,6);assert.equal(s.east.service,true);roundTrip(s);
 s.east.power=true;E.step(s,{},E.DT);assert.ok(s.units.filter(u=>u.eastRole==='turret').every(u=>!E.stats(s,u).range));roundTrip(s);
 Object.assign(E.east.carrier(s),E.east.dock);interact(s,5360,2040,3);assert.equal(s.east.transmitting,true);roundTrip(s);
 for(let i=0;i<730;i++)E.step(s,{},E.DT);assert.equal(s.east.upload,1);assert.equal(s.status,'won');roundTrip(s);
});
test('disabled transport remains present and emergency repair restores it without money',()=>{
 const s=open(fresh());for(const u of s.units)if(u.team)u.hp=0;s.east.claimed=true;E.east.carrier(s).group=1;const c=E.east.carrier(s);c.hp=0;c.deadAt=s.t;s.economy.alloy=0;
 E.step(s,{},E.DT);assert.equal(s.east.immobilized,true);
 // Economy is not round-tripped after the explicit test-only cash override.
 interact(s,c.x-55,c.y,20);assert.ok(c.hp>=360);assert.equal(s.east.immobilized,false);assert.ok(s.units.includes(c));
});
test('corrupt extension states cannot complete a mission or create reserve',()=>{
 const s=fresh();for(const mutate of [v=>v.east.upload=1,v=>v.east.reserve=30,v=>v.east.claimed=true,v=>v.east.waves=5,v=>v.east.charge=NaN]){const v=E.snapshot(s);mutate(v);assert.equal(E.restore(v),null);}
});
test('mission structures can actually be shot through their collision footprint',()=>{
 const s=open(fresh()),p=s.units.find(u=>u.eastRole==='power');for(const u of s.units)if(u.team&&u!==p)u.hp=0;
 Object.assign(E.hero(s),{x:4480,y:1260});E.refreshRecon(s);
 for(let i=0;i<900&&p.hp>0;i++)E.step(s,{fire:true,aim:{x:p.x,y:p.y}},E.DT);
 assert.equal(p.hp,0);assert.equal(s.east.power,true);roundTrip(s);
});
test('the transport physically reaches the dock with ordinary orders',()=>{
 const s=open(fresh());for(const u of s.units)if(u.team)u.hp=0;s.east.claimed=true;E.east.carrier(s).group=1;E.step(s,{},E.DT);
 const c=E.east.carrier(s);assert.ok(E.orderUnits(s,[c.id],5280,2080));
 for(let i=0;i<3600&&E.dist(c,E.east.dock)>10;i++)E.step(s,{},E.DT);
 assert.ok(E.dist(c,E.east.dock)<10,'Carrier failed to drive through the real route');roundTrip(s);
});
test('probe repair preserves cargo and workers return to mining when the carrier is full',()=>{
 const s=open(fresh());for(const u of s.units)if(u.team)u.hp=0;s.east.claimed=true;E.east.carrier(s).group=1;const c=E.east.carrier(s);c.hp=800;
 const workers=s.units.filter(u=>u.kind==='drone');workers.forEach((w,i)=>Object.assign(w,{x:c.x-60,y:c.y+i*30}));
 assert.ok(E.commandSelection(s,workers.map(w=>w.id),c,c.id));
 for(let i=0;i<650;i++)E.step(s,{},E.DT);
 assert.equal(c.hp,900);assert.ok(workers.every(w=>!w.eastRepair));roundTrip(s);
});
test('four actual production groups exhaust the eastern reserve and survive saving',()=>{
 const s=open(fresh());for(const u of s.units)if(u.team&&!['depot','turret'].includes(u.eastRole))u.hp=0;
 Object.assign(E.hero(s),{x:4520,y:2000});E.refreshRecon(s);
 for(let i=0;i<4;i++){
  for(const u of s.units)if(u.eastRole==='raid')u.hp=0;
  s.t=s.east.nextRaid+.01;E.step(s,{},E.DT);assert.equal(s.east.waves,i+1);assert.equal(s.east.reserve,24-(i+1)*6);roundTrip(s);
 }
 const n=s.seq;s.t+=300;E.step(s,{},E.DT);assert.equal(s.seq,n);assert.equal(s.east.reserve,0);
});
