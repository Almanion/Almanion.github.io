'use strict';
const assert=require('node:assert/strict');
const E=require('../game-source/orbital-courier/eclipse/engine.js');
const X=require('../game-source/orbital-courier/eclipse/expeditions.js');
const advance=(s,dt=E.DT)=>{let ticks=0;while(s.status==='running'){E.step(s,dt);assert.ok(++ticks<12000,'every expedition terminates');}return s;};
const make=(id,plan=E.hint(0,'breach',id))=>E.create(0,'breach',plan,{},id);
assert.equal(E.OPERATIONS.length,8);
assert.equal(E.phaseCount('eclipse'),3);
for(const id of ['seam','sisyphus','archive']){
 assert.equal(E.isExpedition(id),true);assert.equal(E.phaseCount(id),1);
 const initial=E.create(0,'breach',undefined,{},id);assert.equal(advance(initial).status,'lost','the initial plan presents a problem instead of silently solving it: '+id);
 for(const plan of X.REFERENCES[id]){
  const live=advance(make(id,plan)),forecast=E.simulate(0,'breach',plan,{},id);
  assert.equal(live.status,'won',id+' distinct complete solution '+JSON.stringify(plan));
  assert.deepEqual(live,forecast,'forecast uses the exact live rules: '+id);
  assert.ok(E.missionInfo(live).steps.every(step=>step.done),'all three internal objectives completed');
  const refined=advance(make(id,plan),E.DT/2);
  assert.equal(refined.status,'won','half-step solution remains valid: '+id);
  assert.ok(Math.abs(live.t-refined.t)<.1,'convergence of objective timing: '+id);
  assert.ok(E.distance(live,refined)<5,'convergence of ship movement: '+id);
  assert.ok(E.distance(live.asteroid,refined.asteroid)<5,'convergence of asteroid movement');
  assert.ok(live.path.length<=1000&&live.events.length<=200,'bounded memory');
  const saved={x:live.x,y:live.y,t:live.t,mission:E.missionSnapshot(live)};
  const restored=E.restoreFinal(make(id,plan),JSON.parse(JSON.stringify(saved)));
  assert.equal(restored.status,'won');assert.ok(E.missionInfo(restored).steps.every(step=>step.done));
  assert.deepEqual(E.missionSnapshot(restored),E.missionSnapshot(live),'final reload preserves mission-specific results');
 }
 const plan=E.hint(0,'breach',id);let alternatives=0;
 for(const da of [-1,-.5,0,.5,1])for(const dv of [-1,0,1])if(advance(make(id,{...plan,angle:plan.angle+da,speed:plan.speed+dv})).status==='won')alternatives++;
 assert.ok(alternatives>=8,id+' has a usable solution region instead of a single magic angle');
 const partial=make(id);for(let i=0;i<80;i++)E.step(partial);const before=JSON.stringify(partial),prediction=E.project(partial);
 assert.equal(JSON.stringify(partial),before,'forecast cannot modify the live ship');assert.deepEqual(advance(partial),prediction,'resuming a checkpoint matches prediction');
 const invalid=make(id,{angle:NaN,speed:Infinity,delay:-Infinity,ax:'bad',ay:null});advance(invalid);
 assert.ok([invalid.x,invalid.y,invalid.vx,invalid.vy,invalid.t].every(Number.isFinite),'invalid plan is sanitized');
}

// The seam is a sequence in disconnected spaces, not three unrelated circles.
const seam=advance(make('seam'));
assert.equal(seam.beacons,3);assert.equal(seam.portalUses,2);
assert.deepEqual(seam.events.filter(e=>e.type==='objective'||e.type==='portal').map(e=>e.type),['objective','portal','objective','portal','objective']);
assert.equal(seam.path.filter(p=>p.jump).length,2,'rendering cannot connect teleports with a fake straight exhaust trail');
for(const p of seam.events.filter(e=>e.type==='portal'))assert.ok(Number.isFinite(p.toX)&&Number.isFinite(p.toY));
const bypass=make('seam');Object.assign(bypass,{x:700,y:426,vx:0,vy:0,beacons:2,portalUses:0});E.step(bypass);assert.equal(bypass.status,'lost','last relay cannot be activated without its spatial transition');
const skip=make('seam');Object.assign(skip,{x:365,y:358,vx:0,vy:0});E.step(skip);assert.equal(skip.status,'lost','the first relay must be restored before entering its portal');
const turn=make('seam');const pristine=E.project(turn);assert.equal(E.interact(turn),true);assert.equal(turn.portalTurn,1);const turned=E.project(turn);assert.notDeepEqual(turned.path,pristine.path,'D rotates actual velocity and changes prediction');E.interact(turn);E.interact(turn);assert.equal(turn.portalTurn,0);assert.deepEqual(E.project(turn).path,pristine.path,'D cycles back to the original orientation');
const tele=make('seam');let beforeSpeed=0;while(tele.portalUses===0&&tele.status==='running'){beforeSpeed=Math.hypot(tele.vx,tele.vy);E.step(tele);}assert.ok(Math.abs(Math.hypot(tele.vx,tele.vy)-beforeSpeed)<1e-9,'teleports preserve kinetic speed');const transitions=tele.portalUses;for(let i=0;i<30;i++)E.step(tele);assert.equal(tele.portalUses,transitions,'portal cooldown prevents re-entry loops');
const exitAngle=(s,id)=>E.missionObjects(s).find(o=>o.id===id+'-exit').angle*180/Math.PI;
const nearAngle=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-8,label+': '+actual+' versus '+expected);
const seamPreview=make('seam');nearAngle(exitAngle(seamPreview,'rift1'),60,'alpha preview includes initial direction and its rotation');nearAngle(exitAngle(seamPreview,'rift2'),-15,'beta preview includes both alpha and beta rotations');
seamPreview.vx=Math.cos(-20*Math.PI/180)*100;seamPreview.vy=Math.sin(-20*Math.PI/180)*100;nearAngle(exitAngle(seamPreview,'rift1'),70,'next portal preview uses actual current velocity');nearAngle(exitAngle(seamPreview,'rift2'),-5,'distant portal preview accumulates rotations from actual velocity');
for(const [angle,turnCount] of [[-24,2],[-36,1]]){
 const plan={angle,speed:100};assert.equal(advance(make('seam',plan)).status,'lost','uncorrected course misses a later relay');
 const rescue=make('seam',plan);for(let i=0;i<turnCount;i++)assert.equal(E.interact(rescue),true);
 const predicted=E.project(rescue);assert.equal(predicted.status,'won','a ±6 degree correction rescues the actual course');
 while(rescue.portalUses===0&&rescue.status==='running')E.step(rescue);
 nearAngle(exitAngle(rescue,'rift1'),60,'completed portal keeps its actual historical exit direction');
 nearAngle(exitAngle(rescue,'rift2'),-15,'next portal starts from the corrected actual velocity');
 E.interact(rescue);nearAngle(exitAngle(rescue,'rift1'),60,'turning the next portal does not redraw completed history');nearAngle(exitAngle(rescue,'rift2'),-9,'next portal displays its own selected correction');E.interact(rescue);E.interact(rescue);
 const complete=advance(rescue);assert.equal(complete.status,'won');nearAngle(exitAngle(complete,'rift2'),-15,'completed beta direction is the real final direction');
 const restored=E.restoreFinal(make('seam',plan),{x:complete.x,y:complete.y,t:complete.t,mission:E.missionSnapshot(complete)});nearAngle(exitAngle(restored,'rift1'),60,'restored result preserves alpha correction history');nearAngle(exitAngle(restored,'rift2'),-15,'restored result preserves beta history');
}

// A real tension-only tow transfers momentum; merely flying the ship to safety is insufficient.
const tow=make('sisyphus');while(!tow.tether.attached&&tow.status==='running')E.step(tow);assert.equal(tow.tether.attached,true);assert.equal(tow.captured,true);
const momentum={x:tow.vx+3*tow.asteroid.vx,y:tow.vy+3*tow.asteroid.vy},initialRockVelocity={vx:tow.asteroid.vx,vy:tow.asteroid.vy};
for(let i=0;i<450&&tow.status==='running';i++)E.step(tow);
assert.ok(Math.abs(tow.vx+3*tow.asteroid.vx-momentum.x)<1e-8);assert.ok(Math.abs(tow.vy+3*tow.asteroid.vy-momentum.y)<1e-8,'internal cable forces conserve total momentum');assert.ok(Math.hypot(tow.asteroid.vx-initialRockVelocity.vx,tow.asteroid.vy-initialRockVelocity.vy)>3,'asteroid trajectory is physically changed by the tow');
const released=make('sisyphus');while(!released.tether.attached)E.step(released);assert.equal(E.interact(released),true);const releaseCount=released.events.filter(e=>e.type==='grapple').length;for(let i=0;i<30&&released.status==='running';i++)E.step(released);assert.equal(released.tether.attached,false);assert.equal(released.events.filter(e=>e.type==='grapple').length,releaseCount,'manual release cannot silently auto-grapple on the next tick');
const breaking=make('sisyphus');Object.assign(breaking,{x:550,y:330,vx:140,vy:0,captured:true});Object.assign(breaking.asteroid,{x:360,y:330,vx:28,vy:0});breaking.tether.attached=true;for(let i=0;i<30&&breaking.status==='running';i++)E.step(breaking);assert.equal(breaking.tether.attached,false);assert.equal(breaking.events.filter(e=>e.type==='tether-break').length,1);assert.equal(breaking.events.filter(e=>e.type==='grapple').length,0,'break requires conscious recapture rather than an auto-grapple loop');
const shipOnly=make('sisyphus');Object.assign(shipOnly,{x:850,y:100,vx:0,vy:0});E.step(shipOnly);assert.equal(shipOnly.status,'running','placing the ship beyond the line does not rescue the asteroid');
const unsafe=make('sisyphus');Object.assign(unsafe,{x:750,y:200,vx:0,vy:0,captured:true});Object.assign(unsafe.asteroid,{x:825,y:350,vx:28,vy:0});E.step(unsafe);assert.notEqual(unsafe.status,'won','an asteroid across the line still aimed at the colony is not safe');
for(const plan of X.REFERENCES.sisyphus){const result=advance(make('sisyphus',plan));assert.equal(result.tether.attached,false,'confirmation explicitly releases the cable');assert.ok(result.events.some(e=>e.type==='release'&&e.text.includes('Автоотцепка')));const colony=E.missionObjects(result).find(o=>o.kind==='colony'),rock={...result.asteroid};let minimum=Infinity;for(let i=0;i<4000;i++){minimum=Math.min(minimum,E.distance(rock,colony));rock.x+=rock.vx*E.DT;rock.y+=rock.vy*E.DT;}assert.ok(minimum>colony.r+rock.r+32,'free future asteroid flight really misses the colony');}
const falling=make('sisyphus',{angle:-29,speed:95,delay:4});E.step(falling);assert.equal(falling.x,falling.start.x);assert.ok(falling.asteroid.x>360,'launch delay does not freeze the approaching asteroid');

// Archive progress, patrol cones and an active jammer are actual simulation rules.
const noData=make('archive');Object.assign(noData,{x:1000,y:220,vx:0,vy:0});E.step(noData);assert.equal(noData.status,'lost','escape without the archive is not a win');
const tooFast=make('archive');Object.assign(tooFast,{x:650,y:260,vx:120,vy:0});for(let i=0;i<20;i++)E.step(tooFast);assert.equal(tooFast.download,0,'a high-speed pass cannot download');
const download=make('archive');Object.assign(download,{x:650,y:260,vx:0,vy:0});for(let i=0;i<120;i++)E.step(download);assert.ok(download.download>.99&&download.download<1.01,'download measures time in actual range');download.x=800;const retained=download.download;E.step(download);assert.equal(download.download,retained,'download pauses outside range');
const sensor=E.missionObjects(make('archive'),0).find(o=>o.kind==='sensor');assert.ok(sensor.spread>0&&sensor.spread<Math.PI);
const lit=make('archive');lit.x=sensor.x+Math.cos(sensor.angle)*240;lit.y=sensor.y+Math.sin(sensor.angle)*240;const signal=X.scanStrength(lit,0);assert.ok(signal>30,'inside the drawn full cone width');const outside={...lit,x:sensor.x+Math.cos(sensor.angle+sensor.spread)*240,y:sensor.y+Math.sin(sensor.angle+sensor.spread)*240};assert.equal(X.scanStrength(outside,0),0,'outside the drawn cone cannot detect');
assert.equal(E.interact(lit),true);assert.equal(lit.quiet,3);assert.equal(E.interact(lit),false,'jammer has one charge');assert.ok(X.scanStrength(lit,0)<signal*.09,'jammer genuinely suppresses sensor accumulation');lit.quiet=0;lit.noise=4;lit.shield=2;assert.ok(X.scanStrength(lit,0)>signal*3,'burn and shield make the ship visible');
const alarm=make('archive');alarm.detection=100;E.step(alarm);assert.equal(alarm.status,'lost','full alert cannot be erased into a win by touching the exit');
const clocks=E.missionObjects(make('archive'),0).filter(o=>o.kind==='patrol'),moving=E.missionObjects(make('archive'),2).filter(o=>o.kind==='patrol');assert.notDeepEqual(clocks,moving,'patrols move and sweep independently of the player');
for(const [id,angle] of [['seam',-30],['sisyphus',-29]])assert.equal(advance(make(id,{...E.defaults(0,'breach',id),angle})).status,'won','a course correction repairs the initial problem: '+id);
const slow=E.create(0,'breach',undefined,{},'archive');while(slow.t<.1)E.step(slow);assert.equal(E.maneuver(slow,'brake'),true);assert.equal(advance(slow).status,'won','an early brake is a valid active solution to the initial archive plan');
console.log('Eclipse expeditions: six full routes, nearby solutions, three distinct objectives, live forecast parity, convergence, spatial topology, physical towing, future asteroid clearance, stealth, downloads, jammer and final reload passed');
