"use strict";
const assert = require("node:assert/strict"),
  { E, field, fund, build, findSite, frames } = require("./helpers/signal-frontier-construction.cjs"),
  C = E.construction;
let checks = 0;
function test(name, fn) { fn(); checks++; console.log("PASS " + name); }
function ready(profile = "frontier-9") {
  const s = profile === "frontier-8" ? field() : E.make(profile);
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps?.forEach((c) => c.reserve = 0);
  fund(s, 1000);
  for (const u of s.units.filter((u) => u.kind === "drone"))
    assert(E.commandSelection(s, [u.id], u));
  E.refreshRecon(s);
  return s;
}
function valid(s) {
  E.refreshRecon(s);
  const copy = E.restore(E.snapshot(s));
  assert(copy, "Operation must restore during worker activity");
  assert.deepEqual(copy, E.snapshot(s));
  return copy;
}
function arrive(s, worker) {
  Object.assign(worker, worker.workerTask.point);
  worker.path = [];
  E.refreshRecon(s);
}

test("a probe walks to a real service point before healing and paying; loaded repair continues identically", () => {
  const s = ready(), b = E.living(s, "base"), d = s.units.find((u) => u.kind === "drone");
  b.hp -= 240;
  const stock = s.economy.alloy, spent = s.economy.spent, hp = b.hp;
  assert(E.commandSelection(s, [d.id], b, b.id));
  assert.equal(s.events.at(-1).intent, "repair");
  assert.equal(s.economy.alloy, stock);
  assert(E.free(d.workerTask.point.x, d.workerTask.point.y, E.C.drone.r, E.navigation(s)));
  let walked = false;
  for (let i = 0; i < 600 && !C.activity(s, d)?.arrived; i++) {
    E.step(s); walked = true;
    assert.equal(b.hp, hp, "No remote healing");
    assert.equal(s.economy.alloy, stock, "No remote material charge");
  }
  assert(walked && C.activity(s, d).arrived);
  frames(s, 90);
  assert(b.hp > hp && b.hp < E.C.base.hp);
  const loaded = valid(s);
  for (let i = 0; i < 1300; i++) { E.step(s); E.step(loaded); }
  assert.deepEqual(E.snapshot(s), E.snapshot(loaded), "Save/load must preserve paid material and timing");
  assert.equal(b.hp, E.C.base.hp);
  assert.equal(s.economy.spent - spent, 30);
  assert.equal(d.workerTask, undefined);
  assert(["out", "return", "gather"].includes(d.work));
  valid(s);
});

test("shortage pauses the weld and resumes with new alloy; repeating an order preserves prepaid material", () => {
  const s = ready(), b = E.living(s, "base"), d = s.units.find((u) => u.kind === "drone");
  b.hp -= 100;
  assert(C.repair(s, b.id, [d.id]).allowed);
  arrive(s, d);
  s.economy.spent += s.economy.alloy; s.economy.alloy = 0;
  frames(s, 120);
  assert.equal(b.hp, 600);
  assert(C.activity(s, d).waiting);
  valid(s);
  fund(s, 1);
  frames(s, 20);
  const hp = b.hp, credit = d.workerTask.credit, stock = s.economy.alloy;
  assert(C.repair(s, b.id, [d.id]).allowed);
  assert.equal(d.workerTask.credit, credit);
  assert.equal(s.economy.alloy, stock);
  frames(s, 120);
  assert(Math.abs(b.hp - 608) < 1e-6);
  assert(b.hp > hp);
  assert(C.activity(s, d).waiting);
  fund(s, 12);
  frames(s, 700);
  assert.equal(b.hp, 700);
  valid(s);
});

test("repair crews occupy separate points, combine their work and respect the four-probe limit", () => {
  const s = ready(), b = E.living(s, "base"), first = s.units.find((u) => u.kind === "drone");
  // Isolate a four-worker crew without waiting for unrelated production queues.
  while (s.units.filter((u) => u.kind === "drone").length < 5)
    s.units.push({ ...JSON.parse(JSON.stringify(first)), id: ++s.seq, workerTask: undefined,
      x: first.x + 30, y: first.y + 30 });
  const workers = s.units.filter((u) => u.kind === "drone");
  b.hp = 100;
  assert(C.repair(s, b.id, workers.map((u) => u.id)).allowed);
  const crew = workers.filter((u) => u.workerTask?.kind === "repair");
  assert.equal(crew.length, 4);
  assert.equal(C.repairOffer(s, b.id).reason, "repair-crew");
  for (const w of crew) arrive(s, w);
  const spent = s.economy.spent;
  frames(s, 60);
  assert(Math.abs(b.hp - 148) < 1e-6);
  assert.equal(s.economy.spent - spent, 8);
  assert(C.stopRepair(s, b.id).allowed);
  assert(crew.every((w) => !w.workerTask));
  valid(s);
});

test("manual moves interrupt repair; cargo and the mining assignment survive return to work", () => {
  const s = ready(), b = E.living(s, "base"), d = s.units.find((u) => u.kind === "drone");
  const mine = s.campaign.mines.find((m) => m.id === "home");
  mine.remaining -= 4; d.cargo = 4;
  const node = d.node;
  b.hp -= 100;
  assert(C.repair(s, b.id, [d.id]).allowed);
  arrive(s, d); frames(s, 30);
  assert.equal(d.cargo, 4);
  assert.equal(d.node, node);
  assert(E.commandSelection(s, [d.id], { x: d.x + 25, y: d.y + 10 }));
  assert.equal(d.workerTask.kind, "move");
  const hp = b.hp;
  frames(s, 120);
  assert.equal(b.hp, hp);
  assert.equal(d.work, "idle");
  valid(s);
  C.resumeWorker(s, d);
  const deposited = s.campaign.deposited;
  frames(s, 600);
  assert(s.campaign.deposited >= deposited + 4);
  assert.equal(d.node, node);
  valid(s);
});

test("a selected builder can repair another building, then resume the paused construction", () => {
  const s = ready("frontier-8"), b = E.living(s, "base"), d = s.units.find((u) => u.kind === "drone");
  for (const u of s.units.filter((u) => u.kind === "drone")) C.resumeWorker(s, u);
  const p = findSite(s, "barracks"), placed = E.purchase(s, "barracks", { ...p, builderId: d.id });
  assert(placed.allowed);
  const site = s.units.find((u) => u.id === placed.buildingId), remaining = site.build;
  b.hp -= 20;
  assert(E.commandSelection(s, [d.id], b, b.id));
  assert.equal(site.construction.builderId, null);
  valid(s);
  arrive(s, d); frames(s, 120);
  assert.equal(site.build, remaining);
  assert.equal(b.hp, 700);
  assert(E.commandSelection(s, [d.id], site, site.id));
  assert.equal(d.buildingId, site.id);
  assert.equal(site.construction.builderId, d.id);
  frames(s, 3600);
  assert.equal(site.build, 0);
  valid(s);
});

test("repair points follow rotated rectangular footprints and destroyed sites release their workers", () => {
  for (const turn of [0, 1, 2, 3]) {
    const s = ready("frontier-8");
    for (const u of s.units.filter((u) => u.kind === "drone")) C.resumeWorker(s, u);
    s.campaign.tier = 2;
    const b = build(s, "foundry", E.hero(s), turn), d = s.units.find((u) => u.kind === "drone");
    b.hp -= 90;
    assert(C.repair(s, b.id, [d.id]).allowed);
    const box = C.rect(b), p = d.workerTask.point;
    assert(p.x < box.x || p.x > box.x + box.w || p.y < box.y || p.y > box.y + box.h);
    valid(s);
    b.hp = 0; C.onDeath(s, b);
    assert.equal(d.workerTask, undefined);
    valid(s);
  }
});

test("legacy campaign probes can repair their buildings and old saves need no migration", () => {
  for (const profile of ["frontier-1", "frontier-2", "frontier-5", "frontier-9"]) {
    const s = ready(profile), b = E.living(s, "base"), d = s.units.find((u) => u.kind === "drone");
    valid(s);
    b.hp -= 16;
    assert(C.repair(s, b.id, [d.id]).allowed);
    arrive(s, d); frames(s, 90);
    assert.equal(b.hp, 700);
    valid(s);
  }
});

test("production finishes while its building is being repaired", () => {
  const s = ready(), b = E.living(s, "base"), d = s.units.find((u) => u.kind === "drone"),
    workers = s.units.filter((u) => u.kind === "drone").length;
  b.hp = 200;
  assert(C.repair(s, b.id, [d.id]).allowed);
  arrive(s, d);
  assert(E.purchase(s, "drone", b.id).allowed);
  frames(s, 1200);
  assert.equal(s.units.filter((u) => u.kind === "drone").length, workers + 1);
  assert.equal(b.jobs.length, 0);
  assert(b.hp > 200 && b.hp < 700);
  assert.equal(d.workerTask.kind, "repair");
  valid(s);
});

test("forged tasks, enemy targets, intact buildings and oversized material credit are rejected", () => {
  const s = ready(), b = E.living(s, "base"), d = s.units.find((u) => u.kind === "drone");
  assert.equal(C.repairOffer(s, b.id).reason, "intact");
  assert.equal(E.commandSelection(s, [d.id], E.living(s, "citadel"), E.living(s, "citadel").id), false);
  assert.equal(C.repairOffer(s, E.hero(s).id).reason, "repair-target");
  b.hp -= 100;
  assert(C.repair(s, b.id, [d.id]).allowed);
  for (const patch of [{ credit: 9 }, { targetId: E.hero(s).id }, { point: { x: 0, y: 0 } },
    { retry: Infinity }, { kind: "attack" }, { targetId: -1 }]) {
    const copy = E.snapshot(s), w = copy.units.find((u) => u.id === d.id);
    Object.assign(w.workerTask, patch);
    assert.equal(E.restore(copy), null, JSON.stringify(patch));
  }
  const copy = E.snapshot(s), w = copy.units.find((u) => u.id === d.id);
  w.hp = 0;
  assert.equal(E.restore(copy), null);
  valid(s);
});

test("unreachable worker routes are retried at a bounded cadence and cannot heal at a distance", () => {
  const s = ready(), b = E.living(s, "base"), d = s.units.find((u) => u.kind === "drone");
  b.hp -= 100;
  assert(C.repair(s, b.id, [d.id]).allowed);
  d.path = [];
  let searches = 0;
  const service = require("../game-source/signal-frontier/src/construction").create({
    ...E, development: E.development, follow: () => {}, pathTo: () => { searches++; return []; },
  });
  for (let i = 0; i < 300; i++) service.serviceTick(s, E.DT);
  assert(searches > 0 && searches <= 7, "Path searches must not run every tick");
  assert.equal(b.hp, 600);
});

console.log(`${checks} repair checks passed.`);
