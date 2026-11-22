"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { E, frames, barracksField, graduate } = require("./helpers/signal-frontier-medic.cjs");
const { build, fund } = require("./helpers/signal-frontier-construction.cjs");

function stand(u, x, y) {
  Object.assign(u, { x, y, path: [], order: null, target: null, think: 0 });
  if (u.ai) u.ai.home = { x, y };
}
const fields = new Map();
function encounter(kind = "grenadier", points = [[825,2200]]) {
  if (!fields.has(kind)) {
    const s = barracksField(), u = graduate(s, kind);
    fields.set(kind, { save: E.snapshot(s), id: u.id });
  }
  const { save, id } = fields.get(kind), s = E.restore(save);
  for (const member of s.units.filter(v => !v.team && E.C[v.kind].speed)) stand(member, 400 + member.id % 4 * 45, 2710);
  const u = s.units.find(v => v.id === id), foe = E.living(s, "sentinel");
  stand(u, 570, 2200); u.cool = 0;
  const enemies = points.map(([x,y], i) => {
    const v = i ? structuredClone(foe) : foe;
    if (i) { v.id = ++s.seq; s.units.push(v); }
    stand(v, x, y); v.cool = 4;
    return v;
  });
  E.refreshRecon(s);
  return { s, u, enemies };
}
function saved(s) {
  const copy = E.snapshot(s), loaded = E.restore(copy);
  assert.ok(loaded, "valid state restores");
  assert.deepEqual(loaded, copy);
  return loaded;
}
function advance(s, predicate, max = 150) {
  for (let i = 0; i < max; i++) { E.step(s); if (predicate()) return; }
  assert.fail("expected combat event within " + max + " frames");
}
const launched = s => s.bullets.find(b => b.kind === "grenade");

test("both modern operations train, refund and restore a grenadier at rifle price and supply", () => {
  for (const map of ["frontier-9", "frontier-10"]) {
    const s = barracksField(map), b = E.living(s, "barracks"), D = E.development, item = D.items(s).grenadier;
    assert.deepEqual(item, { ...D.items(s).rifle, label: "Гранатомётчик" });
    const alloy = s.economy.alloy, supply = D.population(s);
    s.campaign.tier = 1; assert.equal(E.purchase(s, "grenadier", b.id).reason, "network");
    s.campaign.tier = 2;
    assert(!E.purchase(s, "grenadier", E.living(s, "base").id).allowed);
    for (let i = 0; i < 2; i++) assert(E.purchase(s, "grenadier", b.id).allowed);
    assert(E.purchase(s, "cancel", b.id + ":" + b.jobs[1].id).allowed);
    assert.equal(s.economy.alloy, alloy - 65); assert.equal(D.population(s), supply + 1);
    frames(s, 25);
    const copy = saved(s); assert(E.purchase(copy, "cancel", b.id + ":" + b.jobs[0].id).allowed);
    assert.equal(copy.economy.alloy, s.economy.alloy + Math.floor(65 * .75));
    frames(s, 24 / E.DT + 2); assert.equal(E.living(saved(s), "grenadier").group, 1);
    const old = E.make(map); assert.equal(D.items(old).grenadier, undefined); saved(old);
  }
});

test("a ground mark, launch and hit have identical timing through saves, with corruption rejected", () => {
  const { s, u, enemies: [foe] } = encounter();
  advance(s, () => u.grenadeAim);
  const ground = { x: u.grenadeAim.x, y: u.grenadeAim.y };
  frames(s, 14); const midAim = saved(s);
  for (const [key,val] of [["remaining", .9], ["remaining", 0], ["x", -2], ["id", u.id]]) {
    const bad = E.snapshot(s); E.living(bad, "grenadier").grenadeAim[key] = val; assert.equal(E.restore(bad), null);
  }
  const foreign = E.snapshot(s); E.hero(foreign).grenadeAim = u.grenadeAim; assert.equal(E.restore(foreign), null);
  // A visible enemy leaves the chosen point while the soldier is still bracing.
  stand(foe, ground.x + 175, ground.y); E.refreshRecon(s);
  stand(E.living(midAim, "sentinel"), foe.x, foe.y); E.refreshRecon(midAim);
  for (let i = 0; i < 25; i++) { E.step(s); E.step(midAim); }
  assert.deepEqual(E.snapshot(s), E.snapshot(midAim));
  const b = launched(s); assert(b); assert.equal(b.tx, ground.x); assert.equal(b.ty, ground.y);
  assert.equal(b.radius, 80); assert.equal(b.z0, E.elevation(u.x, u.y, u.map) + E.MOUNTS.grenadier);
  const midFlight = saved(s);
  for (const [key,val] of [["radius", 82], ["owner", E.hero(s).id], ["team", 1], ["damage", 55], ["guided", true], ["vx", 0], ["life", 2], ["tx", -10]]) {
    const bad = E.snapshot(s); launched(bad)[key] = val; assert.equal(E.restore(bad), null, key);
  }
  const hp = foe.hp; frames(s, 55); frames(midFlight, 55);
  assert.deepEqual(E.snapshot(s), E.snapshot(midFlight)); assert.equal(foe.hp, hp);
});

test("auto fire favours visible groups, explicit orders take priority and movement cancels bracing", () => {
  const { s, u, enemies } = encounter("grenadier", [[765,2200],[872,2190],[890,2200],[910,2185]]);
  advance(s, () => u.grenadeAim); assert(enemies.slice(1).some(v => v.id === u.grenadeAim.id));
  assert(E.attackUnits(s, [u.id], enemies[0].id));
  assert.equal(u.grenadeAim, undefined); advance(s, () => u.grenadeAim);
  assert.equal(u.grenadeAim.id, enemies[0].id);
  assert(E.commandSelection(s, [u.id], { x: 450, y: 2190 }));
  assert.equal(u.grenadeAim, undefined); frames(s, 20);
  assert(!launched(s)); assert(!u.grenadeAim); assert.equal(u.cool, 0);
});

test("loss of sight cancels preparation, solid cover shields a nearby enemy and allies survive the blast", () => {
  const first = encounter(), foe = first.enemies[0];
  advance(first.s, () => first.u.grenadeAim); stand(foe, 3100, 2970); E.refreshRecon(first.s);
  E.step(first.s); assert(!first.u.grenadeAim); assert(!launched(first.s));
  const { s, u, enemies: [near, hidden] } = encounter("grenadier", [[760,2216],[760,2291]]);
  for (const turret of [near, hidden]) {
    turret.kind = "turret"; turret.hp = E.C.turret.hp;
    delete turret.ai; delete turret.combat;
  }
  const ally = E.living(s, "rifle"); stand(ally, 790, 2205); ally.cool = 5;
  const hp = near.hp, unhurt = hidden.hp, friendly = ally.hp; E.refreshRecon(s);
  assert(E.attackUnits(s, [u.id], near.id)); advance(s, () => launched(s));
  assert(E.commandSelection(s, [u.id], { x: 430, y: 2190 }));
  advance(s, () => s.events.some(e => e.type === "blast" && e.kind === "grenade"));
  assert(near.hp < hp); assert.equal(hidden.hp, unhurt); assert.equal(ally.hp, friendly);
});

test("the field medic can treat grenadiers and their bunker uses a roof port", () => {
  const s = barracksField(), u = graduate(s, "grenadier"), medic = graduate(s),
    b = build(s, "bunker", E.hero(s)), door = E.construction.exit(b, E.C.grenadier.r);
  stand(u, door.x, door.y); stand(medic, door.x - 20, door.y); u.hp = 60; medic.cool = 0;
  E.refreshRecon(s); E.step(s); assert.equal(u.hp, 75);
  assert(E.support.admit(s,[u.id],b.id).allowed); frames(s, 8); assert(u.care.inside);
  const p = E.support.origin(s,u), v = E.living(s, "sentinel");
  stand(v, p.x + 180, p.y); v.cool = 4; E.refreshRecon(s);
  advance(s, () => u.grenadeAim); const next = saved(s); advance(next, () => launched(next));
  const shot = launched(next); assert.equal(shot.z0, E.elevation(p.x,p.y,u.map) + p.mountHeight);
  assert(E.support.evacuate(s, b.id)); assert(!u.grenadeAim); assert(!u.care);
});

test("a lob needs clearance at both faces of a wall and only a launched round survives its owner", () => {
  const { u, enemies: [v] } = encounter();
  stand(u,760,2160); stand(v,760,2320); assert(E.fireClear(u,v));
  stand(v,760,2290); assert(!E.fireClear(u,v));
  stand(u,760,2210); stand(v,760,2320); assert(!E.fireClear(u,v));
  for (const fired of [false, true]) {
    const { s, u, enemies: [foe] } = encounter();
    advance(s, () => fired ? launched(s) : u.grenadeAim);
    s.bullets.push({ kind:"bolt", team:1, owner:foe.id, map:u.map, x:u.x+17, y:u.y,
      vx:-600, vy:0, tx:u.x, ty:u.y, damage:u.hp+5, age:0, life:1 });
    advance(s, () => !u.hp, 5);
    assert(!u.grenadeAim); assert.equal(!!launched(s), fired);
    const copy = saved(s);
    if (fired) advance(copy, () => copy.events.some(e => e.type === "blast" && e.kind === "grenade"));
    else { frames(copy,50); assert(!launched(copy)); }
  }
});

test("an order against the eastern gate marks the exposed face and damages the gate", () => {
  const s = E.make("frontier-10", { resources:2 });
  for (const enemy of s.units) if (enemy.team && E.C[enemy.kind].speed) enemy.hp = 0;
  s.campaign.camps.forEach(c => c.reserve = 0);
  fund(s,500); build(s,"barracks",E.hero(s)); s.campaign.tier = 2;
  const u = graduate(s,"grenadier"), gate = E.living(s,"archive-gate"), hp = gate.hp,
    wall = E.map(s).walls.find(w=>w.unitId===gate.id);
  assert(!E.observe(s).units.some(v=>v.id===gate.id));
  stand(u,4050,2080); stand(E.hero(s),4070,2070); E.refreshRecon(s);
  assert(E.observe(s).units.some(v=>v.id===gate.id));
  assert(E.attackUnits(s,[u.id],gate.id)); advance(s, () => u.grenadeAim);
  assert(u.grenadeAim.x < wall.x && wall.x - u.grenadeAim.x <= 3);
  advance(s, () => launched(s)); const copy = saved(s); advance(copy, () => !launched(copy));
  const hit = E.living(copy,"archive-gate"); assert(hit.hp < hp);
  E.refreshRecon(copy); stand(E.hero(copy),400,2400); stand(E.living(copy,"grenadier"),440,2400);
  E.refreshRecon(copy); hit.hp -= 10;
  const view = E.observe(copy);
  assert(!view.units.some(v=>v.id===hit.id));
  assert.equal(view.fog.memory.units.find(v=>v.id===hit.id).hp, hit.hp+10);
  saved(copy);
});

test("two rifle-price slots favour different squads against clustered or spread sentinels", () => {
  function fight(kind, spacing) {
    const { s, u, enemies } = encounter(kind, [[862,2200],[862,2200-spacing],[862,2200+spacing]]),
      partner = s.units.find(v => v.kind === "rifle" && v.id !== u.id);
    stand(partner, 550, 2200); partner.cool = u.cool = .35; E.refreshRecon(s);
    const hp = enemies.reduce((n,v) => n + v.hp, 0);
    frames(s, Math.round(10 / E.DT));
    return Math.round(hp - enemies.reduce((n,v) => n + v.hp, 0));
  }
  const clustered = [fight("grenadier", 28), fight("rifle", 28)],
    spread = [fight("grenadier", 175), fight("rifle", 175)];
  assert(clustered[0] > clustered[1] + 25, clustered);
  assert(spread[1] > spread[0] + 25, spread);
});
