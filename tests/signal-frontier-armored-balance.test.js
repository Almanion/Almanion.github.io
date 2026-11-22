"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { E, foundryField, train, frames, place } = require("./helpers/signal-frontier-armored.cjs");
const { build } = require("./helpers/signal-frontier-construction.cjs");

// A working southern mine, the same technology and treasury in every trial.
// Training, hauling, enemy decisions, visibility, movement and hits run normally.
let base;
function deployment(kind, count) {
  if (!base) {
    const s = foundryField(), mine = s.campaign.mines.find(m => m.id === "south");
    place(E.hero(s), mine.x-150, mine.y); E.refreshRecon(s); build(s,"outpost",mine);
    place(E.hero(s),380,2400);
    const [scout] = train(s,"scout"); place(scout,440,2400);
    for (const u of s.units.filter(v=>v.kind==="rifle")) place(u,420,2580);
    s.phase=3; s.campaign.tier=3; Object.assign(s.relay,{online:true,charge:1,stability:1});
    const crater=s.campaign.mines.find(m=>m.id==="M01");
    crater.remaining-=40; s.campaign.matter.deposited+=40; s.economy.matter=40;
    for (const m of s.campaign.mines.filter(m=>m.resource!=="matter")) {
      const excess=Math.min(m.stock-m.remaining,s.economy.alloy-300);
      m.remaining+=excess; s.campaign.deposited-=excess; s.economy.alloy-=excess;
    }
    E.refreshRecon(s); base=E.snapshot(s);
  }
  const s=E.restore(base); assert.ok(s);
  assert.deepEqual([s.economy.alloy,s.economy.matter],[300,40]);
  const team=train(s,kind,count), ids=team.map(u=>u.id), spec=E.development.items(s)[kind];
  assert.equal(s.economy.spent-base.economy.spent,spec.cost*count);
  assert.equal(s.economy.matter,40-spec.matter*count);
  frames(s,Math.round((base.t+100-s.t)/E.DT));
  for(const [i,u] of team.entries()) place(u,560,2190+36*i);
  s.seed=77171; E.refreshRecon(s);
  return {s, team, ids, post:E.living(s,"outpost")};
}

function raid(s, post) {
  const original=E.living(s,"sentinel");
  return [0,1,2].map(i=>{
    const v=i?structuredClone(original):original;
    if(i){v.id=++s.seq;s.units.push(v);}
    place(v,925+i*32,3600+20*i); v.cool=.45;
    const goal={x:post.x,y:post.y};
    Object.assign(v.ai,{raid:true,goal,waypoints:[goal],assembleUntil:0,regroupUntil:0});
    return v;
  });
}
function trial(kind, testCase, anchor) {
  const {s,team,ids,post}=deployment(kind,kind==="armored"?1:2), destination={x:985,y:3490};
  const foes=testCase==="raid"?raid(s,post):[];
  E.refreshRecon(s);
  if(testCase==="raid" && kind==="armored") assert.ok(E.commandSelection(s,ids,post,post.id));
  else { const p=anchor||destination; assert.ok(E.orderUnits(s,ids,p.x,p.y)); }
  const station={x:team[0].order.x,y:team[0].order.y};
  let arrived, firstShot, cleared, savedFight=false;
  for(let i=1;i<=35/E.DT;i++){
    E.step(s);
    if(!arrived && team.every(u=>E.dist(u,destination)<48)) arrived=i*E.DT;
    if(!firstShot && s.events.some(e=>e.type==="shot" && e.team===0 && e.kind===kind)) firstShot=i*E.DT;
    if(!cleared && foes.length && foes.every(v=>!v.hp)) cleared=i*E.DT;
    if(!savedFight && testCase==="raid" && kind==="armored" && team[0].target && firstShot){
      const copy=E.restore(E.snapshot(s)); assert.ok(copy); assert.equal(E.living(copy,"armored").order.post,post.id);
      savedFight=true;
    }
  }
  const result={arrived,firstShot,cleared,station,hp:post.hp,workers:s.units.filter(u=>u.kind==="drone" && u.hp>0).length};
  if(testCase==="raid" && kind==="armored"){
    assert.ok(savedFight && cleared); assert.ok(E.dist(team[0],station)<2,"resumes the same post");
    const guard=team[0], raider=structuredClone(foes[0]);
    raider.id=++s.seq; delete raider.deadAt; s.units.push(raider);
    place(raider,post.x+250,post.y+140); raider.hp=E.C.sentinel.hp; E.refreshRecon(s);
    frames(s,35); assert.equal(guard.target?.id,raider.id);
    place(raider,2300,900); E.refreshRecon(s); assert.equal(E.visible(s,0,raider),false);
    frames(s,35); assert.equal(guard.target,null); assert.ok(guard.order.post===post.id);
  }
  return result;
}
test("opening the flank and protecting four mining probes at the price of two rifles", () => {
  const car=trial("armored","flank"), foot=trial("rifle","flank"),
    guard=trial("armored","raid"), infantry=trial("rifle","raid",guard.station);
  assert.ok(car.arrived < foot.arrived*.75);
  assert.ok(guard.firstShot < infantry.firstShot);
  assert.ok(guard.hp > infantry.hp+50 && infantry.hp > 0 && guard.workers===4 && infantry.workers===4);
  assert.ok(infantry.cleared < guard.cleared);
  console.log("Flank and mine",JSON.stringify({car:car.arrived,foot:foot.arrived,guard,infantry}));
});

test("with one scout and four supply the siege battery destroys the elevated citadel", () => {
  const trials={};
  for(const [kind,n] of [["armored",2],["rifle",4],["artillery",1]]){
    const {s,team,ids}=deployment(kind,n), citadel=E.living(s,"citadel"), scout=E.living(s,"scout");
    assert.equal(n*E.development.items(s)[kind].pop,4);
    team.forEach((u,i)=>place(u,2510+i%2*42,1880+Math.floor(i/2)*43));
    // Place the same unarmed spotter on the first navigable, sighted ledge
    // beyond the citadel's range. Its observation is a real fog reveal.
    for(let i=0;i<64;i++){
      const a=Math.PI+i*Math.PI/32,x=citadel.x+910*Math.cos(a),y=citadel.y+910*Math.sin(a);
      if(!E.free(x,y,E.C.scout.r,E.navigation(s)))continue;
      place(scout,x,y); E.refreshRecon(s); if(E.visible(s,0,citadel)) break;
    }
    assert.ok(E.attackUnits(s,ids,citadel.id)); let damage, finish;
    for(let i=1;i<=50/E.DT && s.status==="playing";i++){
      E.step(s); if(i===20/E.DT) damage=E.C.citadel.hp-citadel.hp;
      if(!citadel.hp){finish=i*E.DT;break;}
    }
    trials[kind]={damage:Math.round(damage),finish};
  }
  assert.ok(trials.artillery.finish && !trials.rifle.finish && !trials.armored.finish);
  assert.ok(trials.artillery.damage > 5*Math.max(trials.rifle.damage,trials.armored.damage));
  console.log("Citadel",JSON.stringify(trials));
});
