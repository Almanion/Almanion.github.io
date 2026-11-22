"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { E, foundryField, train, place, frames } = require("./helpers/signal-frontier-armored.cjs");
const { build } = require("./helpers/signal-frontier-construction.cjs");
const Models = require("../game-source/signal-frontier/src/unit-models.js");

function reload(s) {
  const save = E.snapshot(s), copy = E.restore(save);
  assert.ok(copy, "checkpoint must load"); assert.deepEqual(copy, save);
  return copy;
}

test("both two-resource operations release the reserve from the selected tier II foundry", () => {
  for (const map of ["frontier-9","frontier-10"]) {
    const s = foundryField(map), f = E.living(s, "foundry"), b = E.living(s,"barracks"),
      D = E.development, item = D.items(s).armored, alloy = s.economy.alloy, pop = D.population(s);
    assert.equal(item.cost, D.items(s).rifle.cost * 2); assert.equal(item.pop, 2);
    assert.equal(item.time, 38); assert.equal(item.matter, 0); assert.equal(s.economy.matter, 0);
    s.campaign.tier = 1; assert.equal(E.purchase(s,"armored",f.id).reason,"network");
    s.campaign.tier = 2; assert.equal(E.purchase(s,"artillery",f.id).reason,"command");
    assert.equal(E.purchase(s,"armored",b.id).allowed,false);
    for (let i=0;i<3;i++) assert.ok(E.purchase(s,"armored",f.id).allowed);
    assert.equal(E.purchase(s,"armored",f.id).reason,"queue"); assert.equal(D.population(s),pop+6);
    assert.equal(E.purchase(s,"cancel",f.id+":"+f.jobs[1].id).cost,-130);
    assert.equal(s.economy.alloy,alloy-260);
    frames(s,30);
    const loaded=reload(s), tail=loaded.units.find(u=>u.id===f.id).jobs;
    assert.equal(E.purchase(loaded,"cancel",f.id+":"+tail[0].id).cost,-97);
    assert.equal(D.population(loaded),pop+2);
    frames(loaded, Math.ceil(item.time/E.DT)+2);
    const car=E.living(reload(loaded),"armored"); assert.equal(car.group,2); assert.equal(car.hp,210);
    const old=E.make(map); assert.equal(D.items(old).armored,undefined);
    assert.equal(E.purchase(old,"armored").allowed,false); reload(old);
  }
});

test("reverse travel, a long order around obstacles and a saved turn preserve clearance and control", () => {
  const s=foundryField(), [u]=train(s,"armored"); place(u,650,2190);
  assert.ok(E.orderUnits(s,[u.id],600,2190)); frames(s,18);
  assert.ok(u.x<645 && u.drive.speed<0); assert.ok(Math.abs(u.drive.heading)<.001);
  const poses=new Map(); Models.motion(poses,u,s.t); frames(s,5);
  const reverse=Models.motion(poses,u,s.t); assert.ok(reverse.left<0 && reverse.right<0);
  assert.ok(E.orderUnits(s,[u.id],1650,2130)); frames(s,25);
  assert.ok(u.path.length); const copy=reload(s);
  for(const [key,value] of [["speed",216],["speed",-77],["heading",7]]) {
    const bad=E.snapshot(s); E.living(bad,"armored").drive[key]=value;
    assert.equal(E.restore(bad),null);
  }
  const foreign=E.snapshot(s); E.hero(foreign).drive={heading:0,speed:1}; assert.equal(E.restore(foreign),null);
  let peak=0;
  for(let i=0;i<1800&&u.path.length;i++) {
    const previous={x:u.x,y:u.y},angle=u.drive.heading; E.step(s); E.step(copy);
    assert.ok(E.travelClear(previous,u,E.C.armored.r,E.navigation(s)),"the chassis must clear terrain at each step");
    assert.ok(Math.abs(E.turnAngle(0,u.drive.heading-angle,Math.PI))<3*E.DT+1e-6);
    peak=Math.max(peak,u.drive.speed);
  }
  assert.deepEqual(E.snapshot(s),E.snapshot(copy));
  assert.equal(u.path.length,0); assert.ok(E.dist(u,{x:1650,y:2130})<2); assert.equal(peak,215);
  assert.equal(u.drive.speed,0);
});

test("turret tracks a visible side target while rolling; light plate has specific counters", () => {
  const s=foundryField(),[u]=train(s,"armored"),v=E.living(s,"sentinel");
  place(u,560,2170); u.angle=u.drive.heading=0;
  place(v,650,2000); v.cool=3;
  E.refreshRecon(s); assert.ok(E.orderUnits(s,[u.id],900,2170));
  let shot;
  for(let i=0;i<140&&!shot;i++) { E.step(s); shot=s.bullets.find(b=>b.owner===u.id); }
  assert.ok(shot && shot.kind==="bolt"); assert.ok(u.drive.speed>0);
  assert.ok(Math.abs(u.angle-u.drive.heading)>.7); assert.ok(E.fireClear(u,v));
  assert.ok(Math.abs(E.turnAngle(0,Math.atan2(shot.vy,shot.vx)-u.angle,Math.PI))<.01);
  reload(s);
  const fake=(kind,owner=v.id)=>({kind,owner,team:1});
  const damage=b=>E.development.armorDamage(s,u,b,40);
  assert.equal(damage(fake("bolt")),30); assert.equal(damage(fake("bolt",E.living(s,"citadel").id)),40);
  for(const kind of ["missile","shell","flamer","bomber","runner"]) assert.equal(damage(fake(kind)),40);
  s.campaign.armor=true; assert.equal(damage(fake("bolt")),25.5); assert.equal(damage(fake("shell")),34);
});

test("the extractor services a wounded chassis, the bunker has no vehicle bay", () => {
  const s=foundryField(), [u]=train(s,"armored"), b=build(s,"bunker",E.hero(s)),
    mine=s.campaign.mines.find(m=>m.id==="west");
  place(E.hero(s),mine.x,mine.y-75); E.refreshRecon(s);
  const out=build(s,"outpost",mine), door=E.construction.exit(out,E.C.armored.r);
  u.hp=162; place(u,door.x,door.y); E.refreshRecon(s);
  assert.equal(E.support.admit(s,[u.id],b.id).allowed,false); assert.ok(!u.care);
  assert.ok(E.commandSelection(s,[u.id],out,out.id)); frames(s,8); assert.ok(u.care.inside);
  const copy=reload(s); frames(copy,8/E.DT);
  const fixed=E.living(copy,"armored"); assert.equal(fixed.hp,E.C.armored.hp); assert.ok(!fixed.care);
  assert.equal(fixed.order.post,out.id);
  assert.ok(E.free(fixed.x,fixed.y,E.C.armored.r,E.navigation(copy))); reload(copy);
  const wrong=E.snapshot(copy); E.living(wrong,"armored").order.post=b.id; assert.equal(E.restore(wrong),null);
  assert.ok(E.orderUnits(copy,[fixed.id],door.x,door.y)); assert.equal(fixed.order.post,undefined);
});

test("a guard section keeps the hauling lane open and releases orders when its extractor falls", () => {
  const s=foundryField(), team=train(s,"armored",2), mine=s.campaign.mines.find(m=>m.id==="west");
  place(E.hero(s),mine.x,mine.y-75); E.refreshRecon(s);
  const post=build(s,"outpost",mine), ids=team.map(u=>u.id);
  assert.ok(E.commandSelection(s,ids,post,post.id));
  const stations=team.map(u=>({...u.order}));
  assert.ok(team.every(u=>u.order.post===post.id));
  assert.ok(E.dist(...stations)>=E.C.armored.r*2);
  assert.ok(E.commandSelection(s,ids,post,post.id)); assert.deepEqual(team.map(u=>u.order),stations);
  const door=E.construction.exit(post,22);
  assert.ok(stations.every(p=>E.dist(p,door)>2*E.C.armored.r));
  const raider=E.living(s,"sentinel"); post.hp=1;
  s.bullets.push({kind:"bolt",map:post.map,team:1,owner:raider.id,x:post.x,y:post.y,
    vx:500,vy:0,tx:post.x,ty:post.y,damage:20,life:1,age:0});
  frames(s,3); assert.equal(post.hp,0);
  for (const u of team) { assert.equal(u.order,null); assert.equal(u.target,null); }
  reload(s);
});
