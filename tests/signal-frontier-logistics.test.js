"use strict";
const assert = require("node:assert/strict"),
  { E, fund, findSite, build, frames } = require("./helpers/signal-frontier-construction.cjs");
const D = E.development;
let checks = 0, cached;
function test(name, run) { run(); console.log("PASS " + name); checks++; }
function quiet() {
  const s = E.make("frontier-9");
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((c) => c.reserve = 0);
  E.refreshRecon(s); return s;
}
function valid(s) {
  E.refreshRecon(s);
  const snap = E.snapshot(s), restored = E.restore(snap);
  assert(restored, "Save must restore"); assert.deepEqual(restored, snap); return restored;
}
function fixture() {
  if (!cached) {
    const s = quiet(); fund(s, 2400);
    build(s, "logistics"); build(s, "barracks");
    Object.assign(E.hero(s), { x: 800, y: 2440 }); E.refreshRecon(s);
    build(s, "outpost", s.campaign.mines.find((m) => m.id === "west"));
    cached = E.snapshot(valid(s));
  }
  return E.restore(cached);
}
function fill(s, kind, count) {
  const army = s.units.filter((u) => u.kind === kind && u.hp > 0);
  while (army.length < count) {
    const u = { ...structuredClone(army[0]), id: ++s.seq, cargo: 0, path: [], order: null, target: null };
    delete u.deadAt; delete u.buildingId; delete u.workerTask; delete u.workTarget;
    s.units.push(u); army.push(u);
  }
  return army;
}

test("new operations separate army supply and workers; old saves retain their rules", () => {
  const s = quiet();
  assert.deepEqual([D.capacity(s), D.workerCapacity(s), D.population(s)], [24, 16, 3]);
  assert.equal(D.items(s).artillery.pop, 4); assert.equal(D.miningCapacity(s), 6);
  assert.deepEqual(D.items(s).logistics, { cost: 90, time: 24, pop: 0, label: "Узел снабжения" });
  valid(s); delete s.campaign.logistics; delete s.campaign.retired;
  const legacy = valid(s);
  assert.equal(D.capacity(legacy), 6); assert.equal(D.miningCapacity(legacy), 4);
  assert.equal(D.items(legacy).logistics, undefined); assert.equal(D.items(legacy).artillery.pop, 3);
  assert.equal(E.purchase(legacy, "logistics", E.hero(legacy)).allowed, false);
});

test("supply activates only after construction and cancelled foundations never grant capacity", () => {
  const s = quiet(); fund(s, 500);
  const p = findSite(s, "logistics"), order = E.purchase(s, "logistics", p);
  assert(order.allowed); assert.equal(D.capacity(s), 24);
  const node = s.units.find((u) => u.id === order.buildingId);
  assert.equal(node.hp, 90); assert.equal(node.build, 24);
  valid(s);
  assert(E.purchase(s, "cancel-build", node.id).allowed);
  assert.equal(D.capacity(s), 24); valid(s);
  const ready = build(s, "logistics");
  assert.equal(ready.hp, 360); assert.equal(D.capacity(s), 36); assert.equal(D.workerCapacity(s), 20);
  valid(s);
});

test("eight completed nodes reach the fixed 120 / 48 ceiling and refuse a ninth", () => {
  const s = quiet(); fund(s, 2000);
  const nodes = [];
  for (let i = 0; i < 8; i++) {
    nodes.push(build(s, "logistics", E.hero(s), i % 4));
    assert.equal(D.capacity(s), 24 + (i + 1) * 12);
    assert.equal(D.workerCapacity(s), 16 + (i + 1) * 4);
  }
  const alloy = s.economy.alloy;
  const ninth = E.purchase(s, "logistics", { x: 1200, y: 2400 });
  assert.equal(ninth.allowed, false); assert.equal(ninth.reason, "supply-maximum");
  assert.equal(s.economy.alloy, alloy); valid(s);
  nodes[0].hp = 0; E.step(s);
  assert.equal(D.capacity(s), 108); assert.equal(D.workerCapacity(s), 44);
  build(s, "logistics"); assert.equal(D.capacity(s), 120); valid(s);
  fill(s, "rifle", 120); fill(s, "drone", 48);
  const maximum = valid(s);
  assert.equal(D.population(maximum), 120);
  assert.equal(E.purchase(maximum, "drone", E.living(maximum, "base").id).reason, "worker-limit");
  frames(maximum, 90); valid(maximum);
  fill(maximum, "drone", 49);
  assert.equal(E.restore(maximum), null, "A forged 49th worker cannot bypass the ceiling");
});

test("queues reserve supply atomically and cancellation immediately frees the reservation", () => {
  const original = fixture(); fill(original, "rifle", 35);
  const s = valid(original), b = E.living(s, "barracks");
  assert(E.purchase(s, "rifle", b.id).allowed);
  assert.equal(D.population(s), 36); assert.equal(D.summary(s).armyReserved, 1);
  const alloy = s.economy.alloy;
  assert.equal(E.purchase(s, "rifle", b.id).reason, "capacity");
  assert.equal(s.economy.alloy, alloy); valid(s);
  assert(E.purchase(s, "cancel", b.id + ":" + b.jobs[0].id).allowed);
  assert.equal(D.population(s), 35); assert(E.purchase(s, "scout", b.id).allowed); valid(s);
});

test("destroyed supply preserves the army and pauses production across save / restore until rebuilt", () => {
  const original = fixture(); fill(original, "rifle", 35);
  const s = valid(original), b = E.living(s, "barracks");
  assert(E.purchase(s, "rifle", b.id).allowed);
  E.living(s, "logistics").hp = 0; E.step(s);
  const remaining = b.jobs[0].remaining, hp = s.units.filter((u) => u.kind === "rifle").map((u) => u.hp);
  const copy = valid(s); frames(copy, 90);
  assert.equal(E.living(copy, "barracks").jobs[0].remaining, remaining);
  assert.deepEqual(copy.units.filter((u) => u.kind === "rifle").map((u) => u.hp), hp);
  assert(D.supplyBlocked(copy, E.living(copy, "barracks").jobs[0]));
  build(copy, "logistics"); frames(copy, 90);
  assert(E.living(copy, "barracks").jobs[0].remaining < remaining); valid(copy);
});

test("worker reservations respect their own capacity and pause independently of the army", () => {
  const original = fixture(); fill(original, "drone", 19);
  const s = valid(original), b = E.living(s, "base");
  assert(E.purchase(s, "drone", b.id).allowed);
  assert.equal(D.summary(s).workerReserved, 1);
  assert.equal(E.purchase(s, "drone", b.id).reason, "worker-limit");
  assert.equal(D.population(s), 3); valid(s);
  E.living(s, "logistics").hp = 0; E.step(s);
  const time = b.jobs[0].remaining; frames(s, 90);
  assert.equal(b.jobs[0].remaining, time); valid(s);
  assert(E.purchase(s, "cancel", b.id + ":" + b.jobs[0].id).allowed);
  assert.equal(D.summary(s).workerReserved, 0); valid(s);
});

test("six probes share a resource; a seventh stays idle and builders release their mining slot", () => {
  const original = fixture(); fill(original, "drone", 7);
  const s = valid(original), b = E.living(s, "outpost"), drones = s.units.filter((u) => u.kind === "drone" && u.hp > 0), mine = s.campaign.mines.find((m) => m.id === "west");
  for (const u of drones) { u.node = b.id; delete u.mineId; }
  frames(s, 1200);
  assert.equal(drones.filter((u) => u.work === "idle").length, 1);
  const extra = drones[6], before = E.snapshot(s);
  assert.equal(E.support.assignResource(s, [extra.id], mine.id).allowed, false);
  assert.deepEqual(E.snapshot(s), before);
  assert(E.commandSelection(s, [drones[0].id], { x: 500, y: 2500 }));
  assert(drones[0].workerTask);
  assert(E.support.assignResource(s, [extra.id], mine.id).allowed);
  assert.equal(D.mineWorkers(s, mine).filter((u) => !u.workerTask).length, 6);
  valid(s);
});

test("overflow probes move to another connected resource and continue depositing cargo", () => {
  const original = fixture(); fill(original, "drone", 8);
  const s = valid(original), west = E.living(s, "outpost"), southMine = s.campaign.mines.find((m) => m.id === "south");
  Object.assign(E.hero(s), { x: southMine.x, y: southMine.y }); E.refreshRecon(s);
  const south = build(s, "outpost", southMine), probes = fill(s, "drone", 8);
  probes.forEach((u) => { u.node = west.id; u.mineId = "west"; s.campaign.lostCargo += u.cargo; u.cargo = 0; });
  E.step(s);
  assert.equal(probes.filter((u) => u.node === south.id).length, 2);
  assert.equal(probes.filter((u) => u.mineId === "west").length, 6);
  const before = southMine.remaining; frames(s, 3000);
  assert(southMine.remaining < before); valid(s);
});

test("dead mobile records retire after the visual grace period; projectile owners remain", () => {
  const s = quiet(), army = fill(s, "rifle", 30), dead = army.slice(3);
  dead.forEach((u) => { u.hp = 0; u.deadAt = 0; });
  s.t = 14; D.compact(s); assert(dead.every((u) => s.units.includes(u)));
  s.t = 16; s.bullets.push({ owner: dead[0].id }); D.compact(s);
  assert(s.units.includes(dead[0])); assert.equal(s.campaign.retired.allies, dead.length - 1);
  s.bullets = []; D.compact(s); assert.equal(s.campaign.retired.allies, dead.length);
  assert.equal(D.population(s), 3); valid(s);
});

test("120-unit orders have walkable routes, distinct destinations and valid saves", () => {
  const s = quiet(), army = fill(s, "rifle", 120);
  army.forEach((u, i) => Object.assign(u, { x: 160 + i % 12 * 32, y: 2624 + Math.floor(i / 12) * 32 }));
  assert(E.orderUnits(s, army.map((u) => u.id), 2200, 600));
  const endpoints = new Set();
  for (const u of army) {
    let previous = u;
    for (const p of u.path) { assert(E.travelClear(previous, p, E.C.rifle.r, E.navigation(s)), `Unsafe route ${u.id}`); previous = p; }
    assert(u.path.length); endpoints.add(JSON.stringify(u.path.at(-1)));
  }
  assert.equal(endpoints.size, 120); valid(s);
  const before = E.snapshot(s); assert.equal(E.orderUnits(s, army.map((u) => u.id), NaN, 10), false);
  assert.deepEqual(E.snapshot(s), before);
});

test("more than 160 simultaneous projectiles survive their next step and save / restore", () => {
  const s = quiet(); E.step(s, { fire: true, aim: { x: 650, y: 2400 } });
  assert(s.bullets.length); const shot = s.bullets[0];
  s.bullets = Array.from({ length: 240 }, () => structuredClone(shot));
  valid(s); E.step(s); assert.equal(s.bullets.length, 240); valid(s);
  delete s.campaign.logistics; delete s.campaign.retired;
  for (const u of s.units) delete u.deadAt;
  assert.equal(E.restore(s), null, "Legacy projectile guard is unchanged");
});

test("a distant explicit attack keeps its target revealed by a forward scout", () => {
  const s = quiet(), army = s.units.filter((u) => u.kind === "rifle"),
    target = s.units.find((u) => u.kind === "sentinel");
  Object.assign(target, { x: 1600, y: 2400, hp: E.C.sentinel.hp });
  Object.assign(army[1], { x: 1580, y: 2420, kind: "scout", hp: E.C.scout.hp });
  E.refreshRecon(s); assert(E.visible(s, 0, target));
  assert(E.attackUnits(s, [army[0].id], target.id));
  frames(s, 20); assert.equal(army[0].target.id, target.id); valid(s);
});

test("optimized exploration matches the reference scan converter exactly", () => {
  const s = E.make("frontier-9");
  for (let step = 0; step < 16; step++) {
    frames(s, 7); E.refreshRecon(s);
    const fog = E.observe(s).fog, { cols, rows } = fog, reference = new Uint8Array(cols * rows);
    for (const u of fog.observers) {
      const points = E.visionArea(s, u, u.radius).points;
      for (let y = Math.max(0, Math.floor((u.y - u.radius) / 40)); y <= Math.min(rows - 1, Math.floor((u.y + u.radius) / 40)); y++) {
        const yy = y * 40 + 20, edges = [];
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const a = points[i], b = points[j];
          if (a.y > yy !== b.y > yy) edges.push(a.x + ((yy - a.y) * (b.x - a.x)) / (b.y - a.y));
        }
        edges.sort((a, b) => a - b);
        for (let i = 0; i + 1 < edges.length; i += 2) {
          const left = Math.max(0, Math.ceil((edges[i] - 20) / 40)), right = Math.min(cols - 1, Math.floor((edges[i + 1] - 20) / 40));
          if (right >= left) reference.fill(1, y * cols + left, y * cols + right + 1);
        }
      }
      const x = Math.floor(u.x / 40), y = Math.floor(u.y / 40);
      if (x >= 0 && y >= 0 && x < cols && y < rows) reference[y * cols + x] = 1;
    }
    assert.deepEqual(fog.visible, reference);
  }
});

console.log(checks + " logistics checks passed.");
