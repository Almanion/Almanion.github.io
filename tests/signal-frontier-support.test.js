"use strict";
const assert = require("node:assert/strict"),
  { E, fund, build, frames } = require("./helpers/signal-frontier-construction.cjs");
let checks = 0, cached;
function test(name, fn) { fn(); checks++; console.log("PASS " + name); }
function ready() {
  if (!cached) {
    const s = E.make("frontier-9");
    s.units.filter((u) => u.team && u.kind !== "citadel").forEach((u) => u.hp = 0);
    s.campaign.camps.forEach((c) => c.reserve = 0);
    fund(s, 1000);
    const mine = s.campaign.mines.find((m) => m.id === "west");
    Object.assign(E.hero(s), { x: 800, y: 2440 }); E.refreshRecon(s);
    build(s, "outpost", mine);
    E.refreshRecon(s); cached = E.snapshot(s);
  }
  const s = E.restore(cached); assert(s, "Valid fixture"); return s;
}
function valid(s) {
  E.refreshRecon(s); const snap = E.snapshot(s), copy = E.restore(snap);
  assert(copy, "Save must restore"); assert.deepEqual(copy, snap); return copy;
}
function enter(s, u, b) {
  u.hp = 30;
  const o = E.support.admit(s, [u.id], b.id); assert(o.allowed, JSON.stringify(o));
  let ticks = 0;
  while (!u.care?.inside && ticks++ < 2400) E.step(s);
  assert(u.care?.inside, "Must actually walk to entry");
}
test("resource click replaces a manual order, chooses a ready extractor, preserves cargo and collects the selected mine", () => {
  const s = ready(), b = E.living(s, "outpost"), d = s.units.find((u) => u.kind === "drone"),
    mine = s.campaign.mines.find((m) => m.id === "west");
  if (!d.cargo) { mine.remaining -= 4; d.cargo = 4; }
  assert(E.commandSelection(s, [d.id], d));
  const o = E.support.assignResource(s, [d.id], mine.id);
  assert(o.allowed); assert.equal(d.node, b.id); assert.equal(d.mineId, mine.id);
  assert(!d.workerTask); assert.equal(d.cargo, 4);
  const before = s.campaign.deposited, remaining = mine.remaining;
  valid(s); frames(s, 2400);
  assert(s.campaign.deposited > before); assert(mine.remaining < remaining); valid(s);
});
test("extractor capacity includes queued probes; full and unreachable orders preserve existing assignments", () => {
  const s = ready(), b = E.living(s, "outpost"), d = s.units.find((u) => u.kind === "drone");
  for (const u of s.units.filter((u) => u.kind === "drone")) u.node = b.id;
  for (let i = 0; i < 2; i++) assert(E.purchase(s, "drone", b.id).allowed);
  const extra = { ...structuredClone(d), id: ++s.seq, node: E.living(s, "base").id };
  s.units.push(extra);
  const before = structuredClone(extra);
  assert.equal(E.support.assignResource(s, [extra.id], "west").allowed, false);
  assert.deepEqual(extra, before);
  assert(E.support.assignResource(s, [d.id], "west").allowed, "Own slot may be reused");
  assert.equal(E.support.assignResource(s, [d.id], "missing").allowed, false);
});
test("resource routing skips a full nearby extractor for the next reachable one", () => {
  const s = ready(), nearest = E.living(s, "outpost"), mine = s.campaign.mines.find((m) => m.id === "south");
  Object.assign(E.hero(s), { x: mine.x, y: mine.y }); E.refreshRecon(s);
  const second = build(s, "outpost", mine), drones = s.units.filter((u) => u.kind === "drone");
  while (drones.length < 5) {
    const d = { ...structuredClone(drones[0]), id: ++s.seq, cargo: 0, workTime: 0, path: [] };
    s.units.push(d); drones.push(d);
  }
  drones.forEach((d, i) => d.node = i < 4 ? nearest.id : E.living(s, "base").id);
  const worker = drones[4];
  assert(E.support.assignResource(s, [worker.id], "west").allowed);
  assert.equal(worker.node, second.id); assert.equal(worker.mineId, "west"); valid(s);
});
test("patients heal inside and remain sheltered at full health, including after save and restore", () => {
  const s = ready(), u = s.units.find((u) => u.kind === "rifle"), b = E.living(s, "outpost");
  u.hp = 30; assert(E.commandSelection(s, [u.id], b, b.id));
  E.step(s); assert.equal(u.hp, 30, "No healing outside"); assert(!u.care.inside);
  enter(s, u, b); assert.equal(u.x, b.x); assert.equal(u.y, b.y);
  E.refreshRecon(s);
  assert.equal(E.sightRange(s, u), 0); assert(!E.visible(s, 1, u));
  const copy = valid(s);
  for (let i = 0; i < 900; i++) { E.step(s); E.step(copy); }
  assert.deepEqual(E.snapshot(s), E.snapshot(copy));
  assert.equal(u.hp, E.C.rifle.hp); assert(u.care.inside); assert.equal(u.care.exit, false);
  assert.equal(u.x, b.x); assert.equal(u.y, b.y);
  assert.equal(E.sightRange(s, u), 0); assert(!E.visible(s, 1, u));
  assert.equal(E.support.occupants(s, b.id).length, 1);
  const healed = valid(s); frames(healed, 600);
  const restored = healed.units.find((v) => v.id === u.id);
  assert.equal(restored.hp, E.C.rifle.hp); assert(restored.care.inside); assert(!restored.care.exit);
  assert(E.support.leave(healed, restored)); assert(!restored.care);
  assert(E.free(restored.x, restored.y, E.C.rifle.r, E.navigation(healed))); valid(healed);
});
test("manual movement releases sheltered troops, and a blocked order is atomic", () => {
  const s = ready(), u = s.units.find((u) => u.kind === "rifle"), b = E.living(s, "outpost");
  enter(s, u, b);
  frames(s, 900); assert.equal(u.hp, E.C.rifle.hp); assert(u.care.inside);
  assert(!E.orderUnits(s, [u.id], NaN, 0)); assert(u.care.inside);
  const p = E.construction.exit(b, E.C.rifle.r);
  assert(E.orderUnits(s, [u.id], p.x + 100, p.y + 100)); assert(!u.care);
  const hp = u.hp; frames(s, 120); assert.equal(u.hp, hp); valid(s);
});
test("four reservations cap the infirmary; repeat clicks never consume extra slots", () => {
  const s = ready(), b = E.living(s, "outpost"), members = s.units.filter((u) => u.kind === "rifle" || u.kind === "hero");
  members.forEach((u) => u.hp = 30);
  assert(E.support.admit(s, members.map((u) => u.id), b.id).allowed);
  assert.equal(E.support.occupants(s, b.id).length, 4);
  assert(E.support.admit(s, [members[0].id], b.id).allowed);
  const extra = { ...structuredClone(members[1]), id: ++s.seq }; delete extra.care;
  s.units.push(extra);
  assert.equal(E.support.admit(s, [extra.id], b.id).reason, "infirmary-full");
  assert(E.support.evacuate(s, b.id)); assert.equal(E.support.occupants(s, b.id).length, 0);
});
test("the hero cannot fire inside and moving manually cancels treatment", () => {
  const s = ready(), h = E.hero(s), b = E.living(s, "outpost");
  enter(s, h, b); const shots = s.shots, ammo = s.ammo;
  for (let i = 0; i < 1020; i++) E.step(s, { fire: true, interact: true, aim: { x: h.x + 200, y: h.y } });
  assert.equal(h.hp, E.C.hero.hp);
  assert.equal(s.shots, shots); assert.equal(s.ammo, ammo); assert(h.care.inside);
  E.step(s, { x: 1 }); assert(!h.care); valid(s);
});
test("patients are absent from mini-map markers and blasts damage the building instead", () => {
  const s = ready(), u = s.units.find((u) => u.kind === "rifle"), b = E.living(s, "outpost"),
    Mini = require("../game-source/signal-frontier/src/minimap");
  enter(s, u, b); E.refreshRecon(s);
  assert(!Mini.collect(s).some((p) => p.id === u.id));
  const hp = u.hp, buildingHP = b.hp;
  s.bullets.push({ kind: "shell", team: 1, owner: E.living(s, "citadel").id, x: b.x, y: b.y,
    tx: b.x, ty: b.y, vx: 0, vy: 0, age: 0, life: .01, damage: 50, radius: 100 });
  E.step(s);
  assert(b.hp < buildingHP); assert(u.hp >= hp, "Blast must not reach sheltered troops");
  assert(!s.bullets.some((v) => v.owner === u.id)); valid(s);
});
test("a new follow order releases a patient and resumes formation outside", () => {
  const s = ready(), u = s.units.find((u) => u.kind === "rifle"), b = E.living(s, "outpost");
  enter(s, u, b);
  assert(E.followUnits(s, [u.id], s.heroId)); assert(!u.care);
  assert.equal(u.order.followId, s.heroId); frames(s, 60); valid(s);
});
test("destroyed extractors evacuate living patients without teleporting them into obstacles", () => {
  const s = ready(), u = s.units.find((u) => u.kind === "rifle"), b = E.living(s, "outpost");
  enter(s, u, b); b.hp = 0; b.jobs = []; E.construction.onDeath(s, b); E.support.onDeath(s, b);
  assert(!u.care); assert.equal(u.hp, 30); assert(E.free(u.x, u.y, E.C.rifle.r, E.navigation(s))); valid(s);
});
test("a blocked exit waits safely and held movement retries at a bounded cadence", () => {
  const s = ready(), h = E.hero(s), b = E.living(s, "outpost"); enter(s, h, b);
  let checks = 0;
  const support = require("../game-source/signal-frontier/src/support").create({ ...E,
    free: () => { checks++; return false; }, follow: () => {}, emit: () => {} });
  for (let i = 0; i < 180; i++) support.tick(s, { x: 1 }, E.DT);
  assert(h.care.inside && h.care.exit); assert.equal(h.hp, 30);
  assert(checks > 0 && checks <= 81 * 5, "No per-frame blocked exit search");
  valid(s); assert(E.support.leave(s, h)); assert(!h.care); valid(s);
});
test("forged resources, distant shelters, over-capacity and non-patient shelter saves are rejected", () => {
  const s = ready(), u = s.units.find((u) => u.kind === "rifle"), b = E.living(s, "outpost");
  enter(s, u, b); const snap = E.snapshot(valid(s));
  for (const change of [
    (v) => v.units.find((v) => v.id === u.id).x += 100,
    (v) => v.units.find((v) => v.id === u.id).care.facility = v.heroId,
    (v) => v.units.find((v) => v.id === u.id).care.entry.x += 20,
    (v) => v.units.find((v) => v.kind === "drone").care = structuredClone(u.care),
    (v) => v.units.find((v) => v.kind === "drone").mineId = "missing",
    (v) => v.units.find((v) => v.id === u.id).mineId = "west",
  ]) { const v = structuredClone(snap); change(v); assert.equal(E.restore(v), null); }
});
console.log(checks + " support checks passed.");
