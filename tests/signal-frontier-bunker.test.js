"use strict";
const assert = require("node:assert/strict"),
  { E, field, enter, valid, frames } = require("./helpers/signal-frontier-bunker.cjs"),
  { findSite } = require("./helpers/signal-frontier-construction.cjs");
let checks = 0;
function test(name, fn) { fn(); checks++; console.log("PASS " + name); }
function enemy(s, p, kind = "sentinel") {
  let u = s.units.find((u) => u.kind === kind);
  if (!u) {
    u = structuredClone(E.make("frontier-9").units.find((v) => v.kind === kind));
    u.id = ++s.seq; s.units.push(u);
  }
  delete u.deadAt;
  Object.assign(u, p, { hp: E.C[kind].hp, path: [], order: null, target: null, cool: 0, wind: 0 });
  if (u.combat) Object.assign(u.combat, { mode: "idle", time: 0, total: 0 });
  E.refreshRecon(s); return u;
}
test("bunker construction, four door orientations, cost, repair and cancellation", () => {
  const s = field(), b = E.living(s, "bunker");
  assert.equal(b.hp, 800); assert.equal(b.construction.paid, 180);
  assert.deepEqual(E.construction.shape(b), [3, 3]);
  for (let turn = 0; turn < 4; turn++) {
    const sample = { ...b, construction: { ...b.construction, turn } }, p = E.construction.exit(sample);
    assert(E.dist(p, b) > 60); assert.equal(E.support.port(sample, 0).mountHeight, 42);
  }
  b.hp -= 100; assert(E.construction.repairable(b)); assert(E.construction.repairOffer(s, b.id).allowed);
  assert(E.purchase(s, "repair", b.id).allowed); valid(s);
  for (const d of s.units.filter((u) => u.kind === "drone")) E.construction.resumeWorker(s, d);
  const site = findSite(s, "bunker"), before = s.economy.alloy;
  assert(site); const order = E.purchase(s, "bunker", site); assert(order.allowed);
  const next = s.units.find((u) => u.id === order.buildingId);
  assert.equal(s.economy.alloy, before - 180);
  assert.equal(E.support.admit(s, [s.heroId], next.id).allowed, false);
  assert(E.purchase(s, "cancel-build", next.id).allowed);
  assert.equal(s.economy.alloy, before - 45); valid(s);
});
test("healthy troops reserve four distinct slots; repeated orders and a fifth troop do not overbook", () => {
  const s = field(), b = E.living(s, "bunker"), units = s.units.filter(E.support.patient);
  assert.equal(units.length, 4);
  assert(E.support.admit(s, units.map((u) => u.id), b.id).allowed);
  assert.equal(new Set(units.map((u) => u.care.slot)).size, 4);
  assert(E.support.admit(s, [units[1].id], b.id).allowed);
  const extra = { ...structuredClone(units[1]), id: ++s.seq }; delete extra.care; s.units.push(extra);
  assert.equal(E.support.admit(s, [extra.id], b.id).reason, "bunker-full");
  assert(!E.support.admit(s, [s.units.find((u) => u.kind === "drone").id], b.id).allowed);
  valid(s);
});
test("bonuses start only inside, sheltered troops do not heal and their slot survives save/load", () => {
  const s = field(), u = s.units.find((u) => u.kind === "rifle"), b = E.living(s, "bunker");
  u.hp = 30; assert(E.commandSelection(s, [u.id], b, b.id));
  assert.equal(E.stats(s, u).range, 440); assert.equal(E.sightRange(s, u), 640);
  enter(s, u); assert.equal(E.stats(s, u).range, 550); assert.equal(E.sightRange(s, u), 800);
  assert(!E.visible(s, 1, u)); assert.equal(u.hp, 30);
  const copy = valid(s); frames(s, 600); frames(copy, 600);
  assert.deepEqual(E.snapshot(s), E.snapshot(copy)); assert.equal(u.hp, 30);
  assert(E.support.leave(s, u)); assert.equal(E.stats(s, u).range, 440); assert.equal(E.sightRange(s, u), 640);
  valid(s);
});
test("rifle fires from its roof socket beyond ordinary range and keeps stationary", () => {
  const s = field(), u = enter(s, s.units.find((u) => u.kind === "rifle")), from = E.support.origin(s, u),
    target = enemy(s, { x: from.x + 500, y: from.y });
  assert(E.fireClear(from, target)); assert(E.visible(s, 0, target, u));
  frames(s, 15); const shot = s.bullets.find((b) => b.owner === u.id);
  assert(shot, "Garrison fires beyond 440"); assert.equal(shot.z0, E.terrain.height(from.x, from.y) + 42);
  assert.equal(shot.damage, E.C.rifle.damage); assert.equal(u.path.length, 0);
  const x = u.x, y = u.y, copy = valid(s); frames(s, 50); frames(copy, 50);
  assert.deepEqual(E.snapshot(s), E.snapshot(copy), "Target and roof ballistics resume deterministically");
  assert(target.hp < E.C.sentinel.hp, "Roof shot reaches the enemy, not the floor");
  assert.equal(u.x, x); assert.equal(u.y, y); assert(u.care.inside);
});
test("garrison does not fire beyond its bonus range or through solid cover", () => {
  const s = field(), u = enter(s, s.units.find((u) => u.kind === "rifle")), from = E.support.origin(s, u);
  enemy(s, { x: from.x + 700, y: from.y }); E.step(s);
  assert(!s.bullets.some((b) => b.owner === u.id));
  const wall = { x: from.x + 100, y: from.y - 50, w: 80, h: 100 };
  const walls = E.map(s).walls; walls.push(wall);
  try {
    const target = enemy(s, { x: from.x + 300, y: from.y });
    assert(!E.fireClear(from, target)); frames(s, 40);
    assert(!s.bullets.some((b) => b.owner === u.id));
  } finally { walls.pop(); }
});
test("scout improves vision but never gains a gun; artillery retains its ballistic weapon", () => {
  for (const kind of ["scout", "artillery"]) {
    const s = field(), u = s.units.find((u) => u.kind === "rifle");
    Object.assign(u, { kind, hp: E.C[kind].hp, group: kind === "artillery" ? 2 : 1 });
    enter(s, u);
    assert.equal(E.sightRange(s, u), E.balance.units[kind].sight * 1.25);
    const from = E.support.origin(s, u); enemy(s, { x: from.x + 400, y: from.y }); frames(s, 15);
    const shot = s.bullets.find((b) => b.owner === u.id);
    if (kind === "scout") assert(!shot);
    else { assert(shot); assert.equal(shot.kind, "shell"); assert.equal(shot.damage, E.C.artillery.damage); }
  }
});
test("hero shoots accurately from every rotated socket, uses ammunition, reloads and exits on movement", () => {
  for (let turn = 0; turn < 4; turn++) {
    const s = field(), h = E.hero(s), b = E.living(s, "bunker");
    // These fixtures are isolated ballistic tests; real placement validates the door.
    b.construction.turn = turn; enter(s, h);
    const origin = E.support.origin(s, h), aim = { x: origin.x + 400, y: origin.y + 100 };
    E.step(s, { fire: true, aim });
    const bullet = s.bullets.find((v) => v.owner === h.id); assert(bullet);
    const cross = (aim.x - bullet.x) * bullet.vy - (aim.y - bullet.y) * bullet.vx;
    assert(Math.abs(cross) < 1e-7, "Cursor lies exactly on projectile line");
    assert.equal(s.ammo, 11); E.step(s, { reload: true }); assert(s.reload > 0);
    frames(s, 70); assert.equal(s.ammo, 12); assert(h.care.inside);
    E.step(s, { x: 1 }); assert(!h.care); assert(E.free(h.x, h.y, E.C.hero.r, E.navigation(s)));
  }
});
test("single exit keeps the other slots, group movement and destruction evacuate safely", () => {
  const s = field(), b = E.living(s, "bunker"), army = s.units.filter((u) => u.kind === "rifle");
  army.forEach((u) => enter(s, u)); const slots = army.map((u) => u.care.slot);
  assert(E.support.leave(s, army[1])); assert.equal(army[2].care.slot, slots[2]);
  assert(E.followUnits(s, [army[0].id], s.heroId)); assert(!army[0].care);
  const hp = army[2].hp;
  s.bullets.push({ kind: "shell", team: 1, owner: E.living(s, "citadel").id,
    x: b.x, y: b.y, tx: b.x, ty: b.y, vx: 0, vy: 0, life: .01, age: 0, damage: 50, radius: 100 });
  E.step(s); assert(b.hp < 800); assert.equal(army[2].hp, hp);
  b.hp = 0; E.construction.onDeath(s, b); E.support.onDeath(s, b);
  assert(!army[2].care); assert.equal(army[2].hp, hp);
  assert(E.free(army[2].x, army[2].y, E.C.rifle.r, E.navigation(s))); valid(s);
});
test("enemy tanks can return fire against the bunker while occupants remain protected", () => {
  const s = field(), b = E.living(s, "bunker"), patients = s.units.filter(E.support.patient);
  patients.forEach((u) => enter(s, u));
  s.units.filter((u) => u.kind === "drone").forEach((u, i) => Object.assign(u, { x: 1200 + i * 30, y: 2400, path: [] }));
  const tank = enemy(s, { x: b.x + 350, y: b.y }, "tank"); frames(s, 600);
  assert(b.hp < E.C.bunker.hp, "The tank hits the fortified structure");
  assert(tank.hp < E.C.tank.hp, "Garrison returns fire");
  assert(patients.every((u) => u.hp === E.C[u.kind].hp)); valid(s);
});
test("a lethal explosion evacuates a later-trained occupant without hitting it again in the same blast", () => {
  const s = field(), b = E.living(s, "bunker"), original = s.units.find((u) => u.kind === "rifle"),
    recruit = { ...structuredClone(original), id: ++s.seq };
  s.units.push(recruit); enter(s, recruit); b.hp = 10;
  s.bullets.push({ kind: "shell", team: 1, owner: E.living(s, "citadel").id,
    x: b.x, y: b.y, tx: b.x, ty: b.y, vx: 0, vy: 0, life: .01, age: 0, damage: 50, radius: 160 });
  E.step(s); assert.equal(b.hp, 0); assert(!recruit.care);
  assert.equal(recruit.hp, E.C.rifle.hp, "The shell struck the bunker, not the sheltered recruit");
  valid(s);
});
test("blocked bunker exits wait without per-frame route searches or continuing to fire", () => {
  const s = field(), h = enter(s, E.hero(s)); let searches = 0;
  const support = require("../game-source/signal-frontier/src/support").create({ ...E,
    free: () => { searches++; return false; }, follow: () => {}, emit: () => {} });
  for (let i = 0; i < 180; i++) support.tick(s, { x: 1 }, E.DT);
  assert(h.care.inside && h.care.exit); assert(searches > 0 && searches <= 81 * 5);
  const ammo = s.ammo;
  // The simulation must suppress hero firing while this exit request is pending.
  h.care.retry = .8; E.step(s, { fire: true, aim: { x: h.x + 300, y: h.y } });
  assert.equal(s.ammo, ammo); assert(h.care.inside);
});
test("save validation rejects forged, duplicate or out-of-range sockets and preserves old saves", () => {
  const s = field(), army = s.units.filter((u) => u.kind === "rifle");
  army.slice(0, 2).forEach((u) => enter(s, u)); valid(s);
  for (const mutate of [
    (s) => delete s.units.find((u) => u.care).care.garrison,
    (s) => s.units.find((u) => u.care).care.slot = 4,
    (s) => s.units.find((u) => u.care).care.slot = .5,
    (s) => s.units.filter((u) => u.care)[1].care.slot = s.units.find((u) => u.care).care.slot,
    (s) => s.units.find((u) => u.care).care.facility = s.heroId,
  ]) { const copy = E.snapshot(s); mutate(copy); assert.equal(E.restore(copy), null); }
  for (const id of ["frontier-8", "frontier-9"]) assert(E.restore(E.snapshot(E.make(id))));
});
console.log(`${checks} bunker checks passed.`);
