'use strict';
const assert = require('node:assert/strict');
const { LEVELS } = require('../game-source/orbital-courier/src/levels');
const P = require('../game-source/orbital-courier/src/physics');
require('../game-source/orbital-courier/src/flight-review');
const O = globalThis.Orbital, review = O.Review;

// Reproduce the 3.15 s rejection using only a real contract and ordinary controls.
const level = P.prepareLevel(LEVELS[41]);
const flight = P.simulate(level, -31.6, 250).state;
assert.equal(flight.reason, 'fuel');
assert.equal(flight.t.toFixed(2), '3.15');
const original = JSON.stringify([level, flight]);
const fuel = review.failureReport(level, flight);
assert.equal(fuel.event, 'Прибытие на станцию · 3,15 с');
assert.deepEqual(fuel.facts, [['На старте','250','ед./с'],['Лимит контракта','198','ед./с']]);
assert.match(fuel.advice, /52 ед\.\/с/);
assert.equal(JSON.stringify([level, flight]), original);
assert.equal(P.dockingReason({...flight, launchSpeed:198}, level), null);
assert.equal(P.dockingReason({...flight, launchSpeed:199, stats:{fuelFactor:.5}}, level), 'fuel');

const moving = {x:100, y:100, motion:{cx:200, cy:200, rx:70, ry:50, period:6}};
const contract = {...level, target:moving, stops:[{...moving, id:'D1', name:'Маяк', maxSpeed:20}],
  rules:{...level.rules, maxDockSpeed:20, window:[2,3]}};
const t=2, target=P.bodyAt(moving,t);
const fast={...flight,t,vx:target.vx+24.5,vy:target.vy,dockSpeed:undefined};
for(const reason of ['overspeed','drop-speed']){
  const report=review.failureReport(contract,{...fast,reason});
  assert.equal(report.facts[0][1],'24,5');
  assert.equal(report.facts[1][1],'20');
}
assert.match(review.failureReport(contract,{...fast,reason:'overspeed',dockSpeed:20.0003}).facts[0][1],/> 20/);
assert.match(review.failureReport(contract,{...flight,t:1.99,reason:'window'}).title,/ещё не открылась/);
assert.match(review.failureReport(contract,{...flight,t:3.01,reason:'window'}).title,/закрылось/);
assert.match(review.failureReport(contract,{...flight,reason:'deliveries'}).advice,/Маяк/);

const fork=P.prepareLevel(LEVELS.find(l=>l.branches?.length),'pro'), arm=fork.branches[1];
const route={...P.createState(fork,0,100),status:'lost',branchId:arm.id};
const manifest=review.failureReport(fork,{...route,reason:'manifest',cargo:[arm.manifest[0],fork.branches[0].manifest[0]]});
assert.deepEqual(manifest.facts.map(f=>f[1]),[1,arm.minCargo]);
assert.match(manifest.advice,new RegExp(arm.id));
assert.ok(review.failureReport(fork,{...route,reason:'portals'}).advice.includes(arm.portalOrder[0]));
assert.match(review.failureReport(fork,{...route,reason:'gates',gateIndex:1}).advice,/№ 2/);
const resets=[{leg:0,branch:arm.id,degrees:125.6},{leg:0,branch:fork.branches[0].id,degrees:10}];
const flyby=review.failureReport(fork,{...route,reason:'flybys'},resets);
assert.equal(flyby.facts[0][1],125);
assert.ok(flyby.advice.includes(fork.planets[arm.flybys[0].planet].name));

const planet=level.planets[0];
const impact=review.failureReport(level,{...flight,reason:'planet',x:planet.x+planet.r+P.SHIP_RADIUS,y:planet.y});
assert.equal(impact.facts[0][1],planet.name);
for(const reason of ['asteroid','ice-debris','wreck','boundary','timeout','numeric','portal-loop','branch']){
  const report=review.failureReport(level,{...flight,reason});
  assert.notEqual(report.title,'Полёт прерван',reason);
  assert.ok(report.advice.length>0 && !/undefined|NaN/.test(JSON.stringify(report)));
}

// Even a terminal event at the exact timestamp of the previous frame is replayable.
O.App={currentId:level.id,profile:{difficulty:'normal'}};
const initial=P.createState(level,0,100);
review.start(initial);
review.finish({...initial,status:'lost',reason:'numeric'},[],level);
review.selectTime(0);
assert.equal(review.renderModel().state.reason,'numeric');
console.log('Courier flight feedback: real docking rejection, contract evidence and terminal replay passed.');
