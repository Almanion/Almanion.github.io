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
