'use strict';
const assert=require('node:assert/strict');
const {LEVELS,SECTORS}=require('../game-source/orbital-courier/src/levels');
const P=require('../game-source/orbital-courier/src/physics');
const G=require('../game-source/orbital-courier/src/progression');
const C=Orbital.Campaign,base=LEVELS[88],q=base.solution;
const original=structuredClone(base),profile=G.fresh(),stats=G.stats(profile);
assert.equal(SECTORS[base.sector].name,'Приливная линия');
assert.equal(C.requirement(base.id).completed,12);
assert.equal(G.unlocked(profile,base.id),false);
for(const id of C.order.slice(0,12)){
  const level=LEVELS[id],course=level.solution;
  assert.equal(G.unlocked(profile,base.id),false);
  G.complete(profile,level,P.simulate(P.prepareLevel(level),course.angle,course.speed,stats).state);
}
assert.equal(G.unlocked(profile,base.id),true);
const watch=LEVELS[89];
assert.deepEqual(C.requirement(watch.id).prerequisites,[base.id]);
assert.equal(G.unlocked(profile,watch.id),false);

const prepare=(mode,delay)=>P.prepareLevel(base,mode,undefined,delay);
const timely=prepare('normal',q.launchDelay);
const rescheduled=P.prepareLevel(timely,'normal',undefined,1.7);
for(const t of [0,1.25,4.02,7]){
  for(const [level,delay] of [[timely,2.6],[rescheduled,1.7]]){
    const at=P.bodyAt(level.target,t),expected=P.bodyAt(base.target,t+delay);
    for(const key of ['x','y','vx','vy'])assert.ok(Math.abs(at[key]-expected[key])<1e-10,key);
  }
}
assert.equal(P.createState(timely,q.angle,q.speed,stats).t,0);
assert.equal(P.forecastDuration(timely,0.9),timely.timeLimit);
assert.equal(P.forecastDuration(timely,10),timely.timeLimit);
assert.equal(P.forecastDuration(LEVELS[4],0.9),0.9);
assert.deepEqual(base,original,'preparing several epochs leaves the catalogue untouched');
assert.deepEqual(P.prepareLevel(LEVELS[52],'normal',null,4),P.prepareLevel(LEVELS[52]));

for(const mode of ['normal','pro']){
  const wins=[];
  for(let tenth=0;tenth<=50;tenth++){
    const delay=tenth/10,level=prepare(mode,delay);
    const flight=P.simulate(level,base.initialAngle,base.initialSpeed,stats,P.forecastDuration(level,stats.preview),4);
    const meeting=P.stationForecast(level,flight);
    assert.equal(meeting.contact,flight.state.status==='won');
    assert.deepEqual(meeting.station,P.bodyAt(level.target,meeting.ship.t));
    assert.equal(meeting.radius,P.captureRadius(level,stats));
    if(meeting.contact){
      assert.equal(meeting.ship,flight.state);
      assert.equal(flight.state.cargo.length,3);
      assert.ok(flight.state.t>4&&flight.state.t<4.2);
      wins.push(delay);
    }else assert.ok(meeting.gap>0);
  }
  assert.ok(wins.includes(2.5)&&wins.includes(2.6)&&wins.includes(2.7),mode+' touch-friendly launch window');
  assert.ok(!wins.includes(0)&&!wins.includes(5),mode+' the initial course needs a timed start');
}

const delivery=P.simulate(timely,q.angle,q.speed,stats).state;
G.complete(profile,base,{...delivery,assisted:true});
assert.equal(G.unlocked(profile,watch.id),false);
G.complete(profile,base,delivery);
assert.equal(G.unlocked(G.sanitize(profile),watch.id),true);
const solution=watch.solution,oldLevel=LEVELS.find(l=>l.rules?.window&&!l.launchTiming);
assert.equal(P.stationTime(oldLevel,3.5),3.5);

for(const mode of ['normal','pro']){
  const levelAt=delay=>P.prepareLevel(watch,mode,undefined,delay);
  const planned=levelAt(solution.launchDelay);
  for(let tenth=0;tenth<=50;tenth++){
    const flight=P.simulate(levelAt(tenth/10),watch.initialAngle,watch.initialSpeed,stats);
    assert.notEqual(flight.state.status,'won',mode+' timing alone cannot solve the initial course');
  }
  assert.ok(watch.timeLimit<planned.rules.window[0],mode+' no flight can arrive after opening on immediate launch');
  const early=levelAt(0),earlyFlight=P.simulate(early,solution.angle,solution.speed,stats);
  assert.equal(earlyFlight.state.reason,'window',mode+' course alone reaches the closed dock');
  const late=levelAt(5),lateFlight=P.simulate(late,0,188,stats);
  assert.equal(lateFlight.state.reason,'window');
  assert.ok(P.stationTime(late,lateFlight.state.t)>late.rules.window[1]);

  // The open arc represents the shift schedule, even when the departure time changes.
  for(const [level,flight] of [[early,earlyFlight],[late,lateFlight]]){
    const [receptionArc]=P.stationForecast(level,flight).receptionArcs;
    for(const [i,p] of [receptionArc[0],receptionArc.at(-1)].entries()){
      const point=P.bodyAt(watch.target,level.rules.window[i]);
      assert.ok(Math.hypot(p.x-point.x,p.y-point.y)<1e-9);
    }
  }
  for(const angle of [solution.angle-.5,solution.angle,solution.angle+.5]){
    const attempt=P.simulate(planned,angle,solution.speed,stats).state;
    assert.equal(attempt.status,'won',mode+' nearby courses are playable');
    assert.ok(attempt.t<planned.rules.window[0],'replay uses flight time');
    const arrival=P.stationTime(planned,attempt.t);
    assert.ok(arrival>=planned.rules.window[0]&&arrival<=planned.rules.window[1]);
  }
  for(const delay of [4,4.1,4.2]){
    const flight=P.simulate(levelAt(delay),solution.angle,solution.speed,stats);
    assert.equal(flight.state.status,'won',mode+' nearby departure times are playable');
    assert.equal(flight.state.cargo.length,3);
  }
}

const pair=LEVELS[90],M=Orbital.Medals;
const finale=LEVELS[91];
assert.deepEqual(C.requirement(finale.id).prerequisites,[pair.id]);
assert.equal(G.unlocked(profile,finale.id),false);
assert.deepEqual(C.requirement(pair.id).prerequisites,[watch.id]);
assert.equal(G.unlocked(profile,pair.id),false);
const watchFlight=P.simulate(P.prepareLevel(watch,'normal',undefined,solution.launchDelay),solution.angle,solution.speed,stats);
G.complete(profile,watch,watchFlight.state);
assert.equal(G.unlocked(G.sanitize(profile),pair.id),true);

const flyPair=(mode,course,shipStats=stats)=>{
  const level=P.prepareLevel(pair,mode,undefined,course.launchDelay);
  return {level,...P.simulate(level,course.angle,course.speed,shipStats,level.timeLimit,4)};
};
const pathLength=points=>points.slice(1).reduce((length,p,i)=>length+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);
for(const mode of ['normal','pro']){
  const early=flyPair(mode,pair.earlySolution),late=flyPair(mode,pair.solution);
  for(const [index,flight] of [early,late].entries()){
    const {level,state}=flight;
    const reception=P.receptionAt(level,state.t);
    assert.equal(state.status,'won');
    assert.equal(reception.open,true);
    assert.equal(reception.index,index);
    assert.deepEqual([...state.cargo].sort(),index===0?[0]:[0,1]);
    assert.equal(M.mask(level,state),index===0?3:7);
    const arcs=P.stationForecast(level,flight).receptionArcs;
    for(const [n,arc] of arcs.entries())for(const [i,p] of [arc[0],arc.at(-1)].entries()){
      const point=P.bodyAt(pair.target,reception.windows[n][i]);
      assert.ok(Math.hypot(p.x-point.x,p.y-point.y)<1e-9);
    }
  }
  assert.ok(pathLength(late.points)>pathLength(early.points)+75);
  assert.ok(late.state.t>early.state.t+1.5);
  for(const [index,q] of [pair.earlySolution,pair.solution].entries()){
    for(const da of [-.2,.2])for(const dt of [-.1,.1]){
      const {level,state}=flyPair(mode,{...q,angle:q.angle+da,launchDelay:q.launchDelay+dt});
      assert.equal(state.status,'won',mode+' has room for small control adjustments');
      assert.equal(P.receptionAt(level,state.t).index,index);
      assert.equal(state.cargo.length,index+1);
    }
  }
  for(let upgrade=0;upgrade<=5;upgrade++){
    const equipped=G.fresh();
    equipped.upgrades={scanner:upgrade,engine:upgrade,docking:upgrade,magnet:upgrade};
    for(const [index,course] of [pair.earlySolution,pair.solution].entries()){
      const {state}=flyPair(mode,course,G.stats(equipped));
      assert.equal(state.status,'won');
      assert.equal(state.cargo.length,index+1);
    }
  }
  const schedule=P.prepareLevel(pair,mode);
  for(const [opens,closes] of P.receptionWindows(schedule)){
    assert.equal(P.receptionAt(schedule,opens).open,true);
    assert.equal(P.receptionAt(schedule,closes).open,true);
  }
  assert.deepEqual(P.receptionAt(schedule,7.5),{windows:schedule.rules.windows,time:7.5,index:1,open:false});
}
const gap=flyPair('normal',{angle:-41,speed:165,launchDelay:2.8});
assert.equal(gap.state.reason,'window');
assert.equal(P.stationForecast(gap.level,gap).contact,true);
assert.equal(P.receptionAt(gap.level,gap.state.t).index,1);
const first=flyPair('normal',pair.earlySolution),second=flyPair('normal',pair.solution);
assert.ok(G.complete(profile,pair,first.state).totalCredits>0);
assert.equal(G.unlocked(G.sanitize(profile),finale.id),true);
const upgraded=G.complete(profile,pair,second.state);
assert.ok(upgraded.totalCredits>0);
assert.equal(upgraded.newMask,4);
assert.equal(G.complete(profile,pair,second.state).totalCredits,0);

const catchUp=finale.solution;
const flyFinale=(mode,q,shipStats=stats)=>{
  const level=P.prepareLevel(finale,mode,undefined,q.launchDelay);
  return {level,...P.simulate(level,q.angle,q.speed,shipStats,level.timeLimit,4)};
};
for(const mode of ['normal','pro']){
  for(let tick=0;tick<=50;tick++){
    const flight=flyFinale(mode,{angle:finale.initialAngle,speed:finale.initialSpeed,launchDelay:tick/10});
    assert.notEqual(flight.state.status,'won',mode+' start time alone cannot solve the initial course');
  }
  assert.notEqual(flyFinale(mode,{...catchUp,launchDelay:0}).state.status,'won');
  const direct=flyFinale(mode,{angle:-45,speed:160,launchDelay:0});
  assert.equal(direct.state.reason,'flybys');
  assert.equal(direct.state.flybyIndex,0);
  assert.equal(P.stationForecast(direct.level,direct).contact,true);
  const fast=flyFinale(mode,{...catchUp,launchDelay:2.4});
  assert.equal(fast.state.reason,'overspeed');
  assert.equal(fast.state.flybyIndex,1);
  assert.ok(fast.state.dockSpeed>fast.level.rules.maxDockSpeed);
  assert.equal(P.stationForecast(fast.level,fast).ship,fast.state);

  const flight=flyFinale(mode,catchUp),{level,state}=flight;
  const dock=P.bodyAt(level.target,state.t),shipSpeed=Math.hypot(state.vx,state.vy),dockSpeed=Math.hypot(dock.vx,dock.vy);
  assert.equal(state.status,'won');
  assert.equal(state.flybyIndex,1);
  assert.equal(state.dockSpeed,Math.hypot(state.vx-dock.vx,state.vy-dock.vy));
  assert.ok(state.dockSpeed<level.rules.maxDockSpeed&&state.dockSpeed<shipSpeed/3);
  assert.ok(shipSpeed>dockSpeed&&state.vx*dock.vx+state.vy*dock.vy>.97*shipSpeed*dockSpeed,'ship follows dock heading');
  assert.ok((dock.x-state.x)*dock.vx+(dock.y-state.y)*dock.vy>0,'dock is ahead at contact');
  assert.ok(state.t>6.5&&state.t<8);
  assert.deepEqual(state.cargo,[0,1,2]);
  assert.equal(M.mask(level,state),7);
  for(const delay of [2.7,2.9])assert.equal(flyFinale(mode,{...catchUp,launchDelay:delay}).state.status,'won');
  for(const da of [-.5,.5])for(const ds of [-1,1]){
    assert.ok([2.8,2.9].some(delay=>flyFinale(mode,
      {angle:catchUp.angle+da,speed:catchUp.speed+ds,launchDelay:delay}).state.status==='won'),
    mode+' small course changes have reachable intercept times');
  }
  for(let upgrade=0;upgrade<=5;upgrade++){
    const equipped=G.fresh();
    equipped.upgrades={scanner:upgrade,engine:upgrade,docking:upgrade,magnet:upgrade};
    const result=flyFinale(mode,catchUp,G.stats(equipped));
    assert.equal(result.state.status,'won');
    assert.equal(M.mask(result.level,result.state),7);
  }
}

const course=(delay)=>({angle:q.angle,speed:q.speed,launchDelay:delay});
profile.courses={'88:normal':[course(2.64),course(100)],'88:pro':[course(-10),course('2.6')],'4:normal':[course(2.6)]};
const restored=G.sanitize(profile);
assert.deepEqual(restored.courses['88:normal'],[course(2.6),course(5)]);
assert.deepEqual(restored.courses['88:pro'],[course(0),course(0)]);
assert.equal(restored.courses['4:normal'][0].launchDelay,undefined);
assert.deepEqual(G.sanitize(restored),restored);
console.log('launch timing: phase, reception windows, cargo tradeoff, post-flyby pursuit and A/B saves passed');
