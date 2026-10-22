'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const E = require('../game-source/orbital-courier/eclipse/engine.js');
const B = require('../game-source/orbital-courier/eclipse/battle.js');

// A transport discontinuity must discard exhaust as well as snap the heading.
const track = new B.MotionTrack();
track.update({x:10,y:20},0,{heading:0,power:1});
track.update({x:15,y:20},.1,{heading:0,power:1});
assert.ok(track.samples.length > 1);
track.update({x:800,y:500},.2,{heading:Math.PI/2,power:1,jump:true});
assert.equal(track.samples.length,1);
assert.equal(track.angle,Math.PI/2);
assert.ok(track.samples[0].x > 790 && track.samples[0].y > 480);

const calls = [], gradient = {addColorStop() {}}, noop = () => {};
const context = new Proxy({measureText:text=>({width:String(text).length*7})},{get(target,key) {
  if (key in target) return target[key];
  if (String(key).startsWith('create')) return () => gradient;
  return (...args) => { assert.ok(args.filter(a=>typeof a==='number').every(Number.isFinite),'finite canvas arguments: '+String(key)); if (key === 'moveTo' || key === 'lineTo') calls.push([key,...args]); };
},set(target,key,value) { target[key]=value; return true; }});
const canvas = {getContext:()=>context,getBoundingClientRect:()=>({left:0,top:0,width:820,height:490})};
const objects = [
  {kind:'dust',id:'cover',x:350,y:370,r:100},
  {kind:'sensor',id:'scan',x:700,y:260,r:200,angle:2.5,spread:.65,active:true},
  {kind:'rift',id:'a',x:280,y:150,r:28,angle:.8,pairedX:650,pairedY:450},
  {kind:'relay',id:'beacon',x:580,y:120,r:24,active:true},
  {kind:'asteroid',id:'rock',x:650,y:450,r:44,vx:18,vy:-10,safe:false},
  {kind:'colony',id:'city',x:900,y:530,r:65},
  {kind:'terminal',id:'archive',x:820,y:170,r:105,progress:.5},
  {kind:'patrol',id:'watch',x:700,y:260,r:16,angle:2.5},
  {kind:'wreck',id:'wreck',x:450,y:550,r:25},
  {kind:'exit',id:'escape',x:120,y:100,r:35,active:false},
  {kind:'exit',id:'safety',x:820,y:330,r:220,line:true},
  {kind:'target',id:'danger',x:900,y:530,r:129},
  {kind:'tether',id:'rope',x:120,y:500,toX:650,toY:450,tension:.5,maxTension:1}
];
const presentationEngine = {...E,isExpedition:s=>['seam','sisyphus','archive'].includes(s?.operation),scene:s=>({theme:s.operation}),missionObjects:()=>objects};
const sandbox = {window:null,EclipseEngine:presentationEngine,EclipseBattle:B,devicePixelRatio:1,document:{createElement:()=>canvas},ResizeObserver:class {observe() {}},Orbital:{Fleet:{draw:noop}},Math,Map};
sandbox.window=sandbox; vm.runInNewContext(fs.readFileSync(require.resolve('../game-source/orbital-courier/eclipse/renderer.js'),'utf8'),sandbox);
const renderer = new sandbox.EclipseRenderer(canvas);
calls.length=0;
renderer.line([{x:1,y:2},{x:3,y:4},{x:800,y:500,jump:true},{x:805,y:501}],'#ffffff');
assert.deepEqual(calls,[['moveTo',1,2],['lineTo',3,4],['moveTo',800,500],['lineTo',805,501]],'map telemetry never bridges a portal');
for (const operation of ['seam','sisyphus','archive']) for (const reduced of [false,true]) for (const camera of ['overview','follow']) {
  const state = {operation,phase:0,tactic:'breach',x:120,y:500,vx:70,vy:-20,t:1,flightT:1,status:'running',shield:0,quiet:false,detection:.3,path:[{x:100,y:500},{x:120,y:500}],events:[]};
  const battle = new B.Timeline(); battle.time=1;
  for (const type of ['portal','objective','grapple','release','tether-warning','tether-break','download','scan','alert','quiet','won','lost','boost','brake','shield']) battle.emit(type,{x:200,y:150},{toX:650,toY:450});
  const view = {state,battle,phase:0,tactic:'breach',plan:{angle:-15,speed:80},mode:'plan',reduced,camera,showForecast:true,aiming:true,prediction:{path:state.path,status:'running',finish:{x:500,y:500}},previous:{path:state.path}};
  const before = JSON.stringify(state); renderer.draw(view,1); assert.equal(JSON.stringify(state),before,'rendering cannot change physics');
  view.mode='running'; state.events.push({type:'portal'}); renderer.draw(view,1.1); assert.equal(renderer.playerPortalCount,1);
  assert.ok(renderer.motion.size <= 4,'presentation tracks remain bounded');
}

// Real descriptors also render during a live expedition, without a mutation or
// dependence on fortress geometry that belongs to the original five operations.
const actualSandbox={...sandbox,EclipseEngine:E}; actualSandbox.window=actualSandbox;
vm.runInNewContext(fs.readFileSync(require.resolve('../game-source/orbital-courier/eclipse/renderer.js'),'utf8'),actualSandbox);
const actualRenderer=new actualSandbox.EclipseRenderer(canvas);
for (const operation of ['seam','sisyphus','archive']) {
  const state=E.create(0,'breach',E.hint(0,'breach',operation),{},operation),battle=new B.Timeline();
  for (let frame=0;frame<8;frame++) {
    for (let i=0;i<45&&state.status==='running';i++)E.step(state);
    battle.advance(.1,{state,phase:0,running:state.status==='running',flightTime:state.t});
    const before=JSON.stringify(state);
    actualRenderer.draw({state,battle,phase:0,tactic:'breach',plan:state.plan,mode:'running',reduced:false,camera:'follow',showForecast:false},state.t);
    assert.equal(JSON.stringify(state),before,'real descriptor rendering is immutable: '+operation);
  }
}

const oldEngine = globalThis.EclipseEngine;
try {
  globalThis.EclipseEngine=presentationEngine;
  const state = {operation:'archive',x:50,y:100};
  const timeline = new B.Timeline();
  for (let i=0;i<90;i++) timeline.advance(.1,{phase:0,running:true,flightTime:i/10,state});
  assert.equal(timeline.takeCues().length,0,'expeditions have no invisible fortress charge or salvo');
  timeline.receive({type:'portal',x:280,y:150,toX:650,toY:450},state);
  assert.equal(timeline.effects[0].toX,650); assert.equal(timeline.effects[0].type,'portal');
  const frozen=JSON.stringify(timeline); timeline.advance(.1,{paused:true,state}); assert.equal(JSON.stringify(timeline),frozen,'pause freezes mission effects');
  for (const type of ['portal','grapple','release','tether-warning','tether-break','download','scan','alert','quiet','won','lost']) {
    const voices=[]; B.playCue({voice:v=>voices.push(v)},{type,pan:0}); assert.ok(voices.length>0&&voices.length<=2); assert.ok(voices.every(v=>Number.isFinite(v.duration)&&v.volume<=.1));
  }
} finally { globalThis.EclipseEngine=oldEngine; }
console.log('Eclipse expedition art: three independent locations, truthful sensors and objects, portal trail discontinuities, bounded tracks, quiet timelines and pause passed');
