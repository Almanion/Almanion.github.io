'use strict';
const assert=require('node:assert/strict');
const E=require('../game-source/orbital-courier/eclipse/engine.js');
const reference={approach:{angle:-51,speed:85},breach:{angle:10,speed:145,ax:805,ay:195},rebound:{angle:165,speed:65,ax:735,ay:335},escort:{angle:45,speed:65,ax:560,ay:90}};
const approach=E.simulate(0,'breach',reference.approach);assert.equal(approach.status,'won');assert.equal(approach.fleet,5);
const advance=(phase,tactic,plan,carry,dt=E.DT)=>{const s=E.create(phase,tactic,plan,carry);while(s.status==='running')E.step(s,dt);return s;};
for(const tactic of E.TACTICS){
 const s=E.simulate(1,tactic,reference[tactic],{fleet:approach.fleet});assert.equal(s.status,'won',tactic);assert.ok(s.fleet>0);
 assert.deepEqual(s,advance(1,tactic,reference[tactic],{fleet:approach.fleet}),'forecast and live use the identical simulation');
 const refined=advance(1,tactic,reference[tactic],{fleet:5},E.DT/2);assert.equal(refined.status,'won');assert.ok(Math.abs(refined.t-s.t)<.03,'half-step convergence');
 if(tactic==='rebound'){assert.ok(s.minX<680);assert.ok(s.vx>0);assert.ok(s.t>2);}
 if(tactic==='escort'){assert.equal(s.coverCount,2);assert.equal(s.allyHull,2);}
 const carry={x:tactic==='rebound'?650:s.x,y:tactic==='rebound'?185:s.y,fleet:s.fleet};let exits=0;
 for(let angle=-180;angle<=-80;angle+=2)for(let speed=65;speed<=170;speed+=5){const out=E.simulate(2,tactic,{angle,speed},carry);if(out.status==='won')exits++;}
 assert.ok(exits>=3,'several valid extraction courses after '+tactic);
 let alternatives=0;for(const da of [-2,-1,0,1,2])for(const dv of [-3,0,3]){const out=E.simulate(1,tactic,{...reference[tactic],angle:reference[tactic].angle+da,speed:reference[tactic].speed+dv},{fleet:5});if(out.status==='won')alternatives++;}
 assert.ok(alternatives>=3,'tactic must have a forgiving solution region: '+tactic);
}
assert.equal(E.simulate(0,'breach',{angle:-25,speed:120}).status,'lost','a direct course hits the moon');
assert.equal(E.simulate(1,'escort',{angle:-80,speed:65,ax:600,ay:80},{fleet:5}).status,'lost','escort requires actual proximity');
assert.equal(E.simulate(1,'breach',{angle:10,speed:120,ax:870,ay:325}).status,'lost','cannot place anchor inside the fortress');
const shield=E.create(0,'breach',reference.approach);assert.equal(E.shield(shield),true);assert.equal(E.shield(shield),false);for(let i=0;i<250;i++)E.step(shield);assert.equal(shield.shield,0);
const pathological=E.create(99,'bad',{angle:NaN,speed:Infinity,ax:-Infinity,ay:'oops'},{fleet:NaN,x:Infinity,y:-Infinity});for(let i=0;i<500&&pathological.status==='running';i++)E.step(pathological);assert.ok([pathological.x,pathological.y,pathological.vx,pathological.vy].every(Number.isFinite));
console.log('Eclipse: three tactics, live/forecast parity, convergence, extraction, alternatives, collision, shield and sanitization passed');

const B=require('../game-source/orbital-courier/eclipse/battle.js');
const timeline=new B.Timeline(),victory=E.simulate(1,'breach',reference.breach,{fleet:5}),beforePresentation=JSON.stringify(victory);
timeline.beginBreak(victory);timeline.takeCues();
for(let i=0;i<12;i++)timeline.advance(.1);
const frozen=JSON.stringify(timeline);for(let i=0;i<100;i++)timeline.advance(.1,{paused:true});assert.equal(JSON.stringify(timeline),frozen,'pausing freezes effects, fleet and cinematic');
let volleys=0,impacts=0,fractures=0;
for(let i=0;i<40;i++){timeline.advance(.1);const cues=timeline.takeCues();volleys+=cues.filter(c=>c.type==='fleet-fire').length;impacts+=cues.filter(c=>c.type==='fort-impact').length;fractures+=cues.filter(c=>c.type==='fracture').length;}
assert.equal(volleys,15,'three coordinated waves from five surviving ships');assert.equal(impacts,15,'each projectile arrives once');assert.equal(fractures,1,'one shield rupture');assert.equal(JSON.stringify(victory),beforePresentation,'presentation cannot alter physical outcome or checkpoint');
timeline.reset();for(let i=0;i<1000;i++)timeline.emit('hit',{x:100,y:100});assert.ok(timeline.effects.length<=96,'bounded effect budget');timeline.takeCues();for(let i=0;i<80;i++)timeline.advance(.1);assert.equal(timeline.effects.length,0,'old effects expire');timeline.reset();assert.equal(timeline.breakAge,null);assert.equal(timeline.effects.length,0);
for(let i=0;i<6;i++)for(let advance=0;advance<=550;advance+=10){const p=B.fleetAt(i,advance);assert.ok(E.distance(p,E.MOON)>E.MOON.r+20,'fleet flies beneath the moon');assert.ok(p.x>=0&&p.x<=E.W&&p.y>=0&&p.y<=E.H);}
for(const type of ['enemy-charge','enemy-fire','fire','fleet-fire','hit','ally-hit','wreck','fort-impact','protect','blocked','shield','overload','fracture']){const voices=[];B.playCue({voice:v=>voices.push(v)},{type,pan:.5});assert.ok(voices.length>0&&voices.length<=3);assert.ok(voices.every(v=>Number.isFinite(v.duration)&&v.duration>0&&v.volume<=.25));}
console.log('Eclipse battle: synchronized waves, pause, immutable outcomes, bounded effects, clear fleet courses and audio envelopes passed');

// Every operation is physically solvable through each tactic, including the exit.
const approaches=Object.fromEntries(Object.entries(E.REFERENCES).map(([id,ref])=>[id,ref.approach]));
const bonuses=Object.fromEntries(Object.entries(E.REFERENCES).map(([id,ref])=>[id,ref.bonus]));
const exits=Object.fromEntries(Object.entries(E.REFERENCES).map(([id,ref])=>[id,ref.exit]));
for(const operation of E.OPERATIONS){
 const id=operation.id,entry=E.simulate(0,'breach',approaches[id],{},id);assert.equal(entry.status,'won',id+' approach');
 const bonus=E.simulate(0,'breach',bonuses[id],{},id);assert.equal(bonus.status,'won',id+' optional route');assert.equal(bonus.signal,true);assert.equal(bonus.jam,1,'unspent bonus carries into the attack');
 for(const tactic of E.TACTICS){
  const plan={...E.REFERENCES[id].attack[tactic]},attack=E.simulate(1,tactic,plan,{fleet:entry.fleet},id);assert.equal(attack.status,'won',id+' '+tactic);
  const live=E.create(1,tactic,plan,{fleet:entry.fleet},id);while(live.status==='running')E.step(live);assert.deepEqual(live,attack,'forecast includes the same obstacles and timing');
  const refined=E.create(1,tactic,plan,{fleet:entry.fleet},id);while(refined.status==='running')E.step(refined,E.DT/2);assert.equal(refined.status,'won');assert.ok(Math.abs(refined.t-attack.t)<.03);
  const carry={x:tactic==='rebound'?E.scene(id).node.x:attack.x,y:tactic==='rebound'?E.scene(id).node.y:attack.y,fleet:attack.fleet};assert.equal(E.simulate(2,tactic,exits[id][tactic],carry,id).status,'won',id+' '+tactic+' extraction');
  let alternatives=0;for(const da of [-1,0,1])for(const dv of [-1,0,1])if(E.simulate(1,tactic,{...plan,angle:plan.angle+da,speed:plan.speed+dv},{fleet:entry.fleet},id).status==='won')alternatives++;
  assert.ok(alternatives>=3,id+' '+tactic+' permits several nearby solutions');
 }
 const jammed=E.simulate(1,'escort',{...E.REFERENCES[id].attack.escort},{fleet:bonus.fleet,jam:bonus.jam},id);assert.equal(jammed.status,'won');assert.equal(jammed.fleet,bonus.fleet);assert.equal(jammed.events.filter(e=>e.type==='jammed').length,1);
 assert.equal(jammed.events.filter(e=>e.type==='torpedo').length,3,'three timed torpedo launches');
}
const blockedStorm=E.simulate(1,'breach',reference.breach,{fleet:5},'pulsar');assert.equal(blockedStorm.status,'lost');assert.ok(blockedStorm.reason.includes('разряд'));
assert.equal(E.simulate(1,'breach',{...reference.breach,delay:2},{fleet:5},'pulsar').status,'won','launch window changes the result');
const protectedStorm=E.create(1,'breach',reference.breach,{fleet:5},'pulsar');while(protectedStorm.status==='running'){if(protectedStorm.x>710&&!protectedStorm.shieldUsed)E.shield(protectedStorm);E.step(protectedStorm);}assert.equal(protectedStorm.status,'won');assert.ok(protectedStorm.events.some(e=>e.type==='blocked'),'a timed shield is an alternative to waiting');
const waiting=E.create(1,'escort',{...reference.escort,delay:2},{fleet:5},'pulsar');for(let i=0;i<120;i++)E.step(waiting);assert.equal(waiting.x,waiting.start.x);assert.equal(waiting.y,waiting.start.y);assert.equal(waiting.flightT,0);assert.equal(waiting.events.length,0);
assert.notDeepEqual(E.wreckageAt(E.create(0,'breach',{}, {},'rift'),0),E.wreckageAt(E.create(0,'breach',{}, {},'rift'),2),'ring debris moves during launch delay');assert.equal(E.create(0,'breach',{}, {},'bad').operation,'eclipse');
const silentCharge=new B.Timeline();silentCharge.advance(.1,{phase:0,running:true,flightTime:4.6,jammed:true});assert.equal(silentCharge.takeCues().length,0,'jammed batteries do not fire or charge');
for(const type of ['torpedo','signal','jammed','storm-hit']){const voices=[];B.playCue({voice:v=>voices.push(v)},{type,pan:0});assert.ok(voices.length>0&&voices.length<=3);}
console.log('Eclipse operations: fifteen complete routes, bonus capture, jammer, moving hazards, timing, shield alternatives, convergence and nearby solutions passed');

// New locations change the physical problem and demand an objective before arrival.
for(const id of ['binary','ark']){
 const layout=E.scene(id),entry=E.simulate(0,'breach',E.hint(0,'breach',id),{},id);
 assert.notDeepEqual(layout.moon,E.MOON);assert.notDeepEqual(layout.exit,E.EXIT);
 assert.ok(Object.isFrozen(layout)&&Object.isFrozen(layout.moon),'shared scene geometry cannot be mutated');
 assert.equal(E.scene(entry),layout);assert.ok(E.checkpoints(entry).length>0);
 assert.ok(E.checkpoints(entry).every(p=>p.done&&p.required),'required objective is actually intercepted');
 assert.ok(entry.events.some(e=>e.type==='objective'));
 let alternatives=0;const p=E.hint(0,'breach',id);
 for(const da of [-1,0,1])for(const dv of [-1,0,1])if(E.simulate(0,'breach',{...p,angle:p.angle+da,speed:p.speed+dv},{},id).status==='won')alternatives++;
 assert.ok(alternatives>=3,id+' approach has several playable courses');
 for(const tactic of E.TACTICS){
  const attack=E.simulate(1,tactic,E.hint(1,tactic,id),{fleet:entry.fleet},id);
  if(tactic==='escort')assert.equal(attack.coverCount,2,'advanced escort requires both defensive intercepts');
  const node=layout.node,carry={x:tactic==='rebound'?node.x:attack.x,y:tactic==='rebound'?node.y:attack.y,fleet:attack.fleet};
  let exits=0;const plan=E.hint(2,tactic,id);
  for(const da of [-1,0,1])for(const dv of [-1,0,1])if(E.simulate(2,tactic,{...plan,angle:plan.angle+da,speed:plan.speed+dv},carry,id).status==='won')exits++;
  assert.ok(exits>=3,id+' '+tactic+' permits multiple extraction courses');
 }
}
const missedCapsule=E.simulate(0,'breach',{angle:-51,speed:85},{},'ark');assert.equal(missedCapsule.status,'lost');assert.match(missedCapsule.reason,/Капсула/);
const missedNavigation=E.simulate(0,'breach',{angle:47,speed:105},{},'binary');assert.equal(missedNavigation.status,'lost');assert.match(missedNavigation.reason,/метка/);
assert.ok(E.scene('binary').companion.mu>0);assert.equal(E.validAnchor({ax:630,ay:105},'binary'),false,'cannot place an anchor inside the second moon');
const gateCourse={angle:-62.5,speed:65};assert.equal(E.simulate(0,'breach',gateCourse,{},'ark').status,'won');
const closedGate=E.simulate(0,'breach',{...gateCourse,delay:4},{},'ark');assert.equal(closedGate.status,'lost');assert.match(closedGate.reason,/створкой/,'the same course depends on the moving gate at launch time');
const gateState=E.create(0,'breach',{}, {},'ark');assert.notDeepEqual(E.hazardsAt(gateState,0),E.hazardsAt(gateState,3),'gate geometry moves before launch as well');
const openEdge=E.hazardsAt({...gateState,phase:2},8.52);assert.equal(openEdge.length,1,'a fully retracted upper section has no collision object');
for(const phase of [0,2])for(let t=0;t<=24;t+=.1)for(const gate of E.hazardsAt({...gateState,phase},t)){
 assert.ok(gate.halfHeight>0,'empty gate sections cannot acquire an invisible collision radius');
 assert.ok(gate.y-gate.halfHeight>=45-1e-8&&gate.y+gate.halfHeight<=615+1e-8,'moving sections remain clipped to the visible gate rails');
}
const crossGate=(time,y)=>{
 const s=E.create(2,'breach',{angle:0,speed:170},{x:450,y,fleet:5},'ark');
 s.ticks=Math.round(time/E.DT);s.t=s.flightT=s.ticks*E.DT;
 for(let i=0;i<30&&s.status==='running';i++)E.step(s);
 return s;
};
const upperEdgeFlight=crossGate(8.5,32);assert.equal(upperEdgeFlight.status,'running','a ship can cross the fully open upper edge without hitting a zero-height ghost section');assert.ok(upperEdgeFlight.x>490);
assert.equal(crossGate(8.5,80).status,'running','the retracted upper section opens a usable flight corridor');
const movingGateHit=crossGate(1,80);assert.equal(movingGateHit.status,'lost');assert.match(movingGateHit.reason,/створкой/,'the same flight corridor is blocked when the actual section moves down');

// Emergency burns are bounded, directional, and share the exact forecast integrator.
const burns=E.create(0,'breach',{...E.hint(0,'breach','binary'),delay:2},{},'binary');
assert.equal(E.canManeuver(burns,'boost'),false);assert.equal(E.maneuver(burns,'boost'),false);
for(let i=0;i<240;i++)E.step(burns);assert.equal(burns.flightT,0);assert.equal(E.maneuver(burns,'brake'),false);
E.step(burns);const velocity={x:burns.vx,y:burns.vy};assert.equal(E.maneuver(burns,'boost'),true);
assert.ok(Math.abs(burns.vx-velocity.x*1.18)<1e-10);assert.ok(Math.abs(burns.vy-velocity.y*1.18)<1e-10);
assert.equal(E.maneuver(burns,'boost'),false,'only one acceleration per stage');
for(let i=0;i<60;i++)E.step(burns);const fast={x:burns.vx,y:burns.vy};assert.equal(E.maneuver(burns,'brake'),true);
assert.ok(Math.abs(burns.vx-fast.x*.75)<1e-10);assert.ok(Math.abs(burns.vy-fast.y*.75)<1e-10);
assert.equal(E.maneuver(burns,'brake'),false);assert.equal(E.maneuver(burns,'invalid'),false);
assert.deepEqual(burns.events.filter(e=>e.type==='boost'||e.type==='brake').map(e=>e.type),['boost','brake']);
const beforeProjection=structuredClone(burns),projection=E.project(burns);assert.deepEqual(burns,beforeProjection,'forecast cannot alter any live state');
assert.notEqual(projection.events,burns.events);assert.notEqual(projection.path,burns.path);assert.notEqual(projection.objectiveHits,burns.objectiveHits);assert.notEqual(projection.plan,burns.plan);
while(burns.status==='running')E.step(burns);assert.deepEqual(burns,projection,'remaining forecast equals the live outcome after both burns');
assert.equal(E.maneuver(burns,'boost'),false,'finished flights cannot maneuver');
const projectile=E.create(1,'rebound',E.hint(1,'rebound','ark'),{},'ark');E.step(projectile);assert.equal(E.canManeuver(projectile,'boost'),false);assert.equal(E.maneuver(projectile,'brake'),false,'a reflected enemy projectile has no pilot engine');
const pristineHint=E.hint(1,'breach','binary');pristineHint.angle=0;assert.equal(E.hint(1,'breach','binary').angle,-10,'editing a hint cannot corrupt shared reference plans');
console.log('Eclipse expansion: required rescue/navigation, dual gravity, moving gate windows, advanced escort, alternative exits and immutable live burn forecasts passed');
