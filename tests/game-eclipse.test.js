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
