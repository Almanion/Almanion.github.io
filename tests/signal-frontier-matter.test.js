"use strict";
const test = require("node:test"), assert = require("node:assert/strict"),
  { E, fund, findSite, build, frames, finish } = require("./helpers/signal-frontier-construction.cjs");
const M = E.development.matter;
function field(profile = "frontier-9") {
  const s = E.make(profile, { resources: 2 });
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((c) => c.reserve = 0);
  fund(s, 2000);
  return s;
}
function visit(s, mine) {
  Object.assign(E.hero(s), { x: mine.x + 200, y: mine.y });
  E.refreshRecon(s);
}
function valid(s) {
  E.refreshRecon(s);
  const restored = E.restore(E.snapshot(s));
  assert.ok(restored, "Operation must restore with both resource ledgers");
  assert.deepEqual(restored, E.snapshot(s));
  return restored;
}
function matter(s, n) {
  const m = s.campaign.mines.find((p) => p.resource === "matter");
  assert.ok(m.remaining >= n); m.remaining -= n;
  s.campaign.matter.deposited += n; s.economy.matter += n;
}
function industry(s) {
  s.campaign.tier = 2;
  const home = E.hero(s);
  build(s, "barracks", home);
  build(s, "arsenal", home);
  build(s, "foundry", home);
  return s;
}

test("second-resource rules are explicit; all previous profiles and saves keep their exact rules", () => {
  for (const p of ["frontier-8", "frontier-9", "frontier-10"]) {
    const old = E.make(p), restored = E.restore(E.snapshot(old));
    assert.deepEqual(restored, E.snapshot(old));
    assert.equal(M.enabled(old), false); assert.equal(E.development.items(old).condenser, undefined);
    assert.equal(E.development.items(old).artillery.matter, undefined);
    if (p === "frontier-8") continue;
    const s = E.make(p, { resources: 2 });
    assert.equal(s.units.filter((u) => u.kind === "drone").length, 4);
    assert.equal(old.units.filter((u) => u.kind === "drone").length, 2);
    assert.equal(s.version, p === "frontier-10" ? 14 : 13);
    assert.equal(s.economy.matter, 0); assert.equal(E.development.items(s).command.matter, 80);
    assert.equal(s.campaign.mines.filter((m) => m.resource === "matter").length, 4); valid(s);
  }
});

test("all four craters allow every orientation, a real worker route and a restorable foundation", () => {
  for (const m of M.craters) for (let turn = 0; turn < 4; turn++) {
    const s = field(); visit(s, m);
    const p = findSite(s, "condenser", m, turn); assert.ok(p, m.id + " orientation " + turn);
    const result = E.purchase(s, "condenser", p); assert.ok(result.allowed);
    const u = s.units.find((u) => u.id === result.buildingId);
    assert.equal(u.site, m.id); assert.equal(u.build, 40); valid(s);
    assert.equal(E.purchase(s, "condenser", p).allowed, false);
  }
});

test("a completed condenser reassigns its builder; only delivered cargo credits matter", () => {
  const s = field(), mine = s.campaign.mines.find((p) => p.id === "M01"); visit(s, mine);
  const u = build(s, "condenser", mine), w = s.units.find((w) => w.node === u.id);
  assert.ok(w); assert.equal(w.mineId, mine.id);
  for (let i = 0; i < 1800 && !w.cargo; i++) E.step(s);
  assert.equal(w.cargoType, "matter"); assert.equal(w.cargo, 4);
  assert.equal(s.economy.matter, 0); assert.equal(mine.remaining, mine.stock - 4); valid(s);
  for (let i = 0; i < 300 && w.cargo; i++) E.step(s);
  assert.equal(s.economy.matter, 4); assert.equal(s.campaign.matter.deposited, 4); valid(s);
});

test("staffing has two slots; cargo retains its resource when workers change assignment", () => {
  const s = field(), mine = s.campaign.mines.find((p) => p.id === "M01"); visit(s, mine);
  const b = build(s, "condenser", mine), second = s.units.find((u) => u.kind === "drone" && u.node !== b.id);
  const home = s.campaign.mines.find((p) => p.resource !== "matter" && p.remaining >= 4);
  home.remaining -= 4; second.cargo = 4; second.cargoType = "alloy";
  assert.ok(E.purchase(s, "staff-condenser", b.id).allowed);
  assert.equal(E.purchase(s, "staff-condenser", b.id).reason, "staff-full");
  assert.equal(second.cargoType, "alloy");
  const deposited = s.campaign.deposited; frames(s, 1800);
  assert.ok(s.campaign.deposited >= deposited + 4); assert.ok(s.economy.matter > 0); valid(s);
});

test("a condenser assigns existing probes but never opens an unsupported production or paid repair queue", () => {
  const s = field(), mine = s.campaign.mines.find((p) => p.id === "M01"); visit(s, mine);
  const b = build(s, "condenser", mine); b.hp--;
  const before = E.snapshot(s);
  for (const action of ["drone", "repair"]) {
    assert.equal(E.purchase(s, action, b.id).allowed, false);
    assert.deepEqual(E.snapshot(s), before);
  }
  assert.ok(E.purchase(s, "staff-condenser", b.id).allowed);
  valid(s);
});

test("a second price is atomic, then both queue costs are paid and refunded exactly once", () => {
  const s = industry(field()), arsenal = E.living(s, "arsenal");
  const before = E.snapshot(s), offer = E.purchase(s, "weapons", arsenal.id);
  assert.equal(offer.reason, "matter"); assert.deepEqual(E.snapshot(s), before);
  matter(s, 100); const alloy = s.economy.alloy, balance = s.economy.matter;
  assert.ok(E.purchase(s, "weapons", arsenal.id).allowed);
  assert.equal(s.economy.alloy, alloy - 220); assert.equal(s.economy.matter, balance - 30);
  const j = arsenal.jobs[0]; valid(s);
  const result = E.purchase(s, "cancel", arsenal.id + ":" + j.id);
  assert.equal(result.cost, -220); assert.equal(result.matter, -30);
  assert.equal(s.economy.alloy, alloy); assert.equal(s.economy.matter, balance);
  const once = E.snapshot(s); assert.equal(E.purchase(s, "cancel", arsenal.id + ":" + j.id).allowed, false);
  assert.deepEqual(E.snapshot(s), once); valid(s);
});

test("started orders return 75 percent of both prices; waiting orders return 100 percent", () => {
  const s = industry(field()), b = E.living(s, "arsenal"); matter(s, 100);
  assert.ok(E.purchase(s, "weapons", b.id).allowed);
  assert.ok(E.purchase(s, "armor", b.id).allowed);
  E.step(s); valid(s);
  const [started, waiting] = b.jobs;
  assert.deepEqual(M.refund(s, started), { alloy: 165, matter: 22 });
  assert.deepEqual(M.refund(s, waiting), { alloy: 220, matter: 30 });
  assert.ok(E.purchase(s, "cancel", b.id + ":" + started.id).allowed);
  assert.ok(E.purchase(s, "cancel", b.id + ":" + waiting.id).allowed); valid(s);
});

test("lost cargo is charged to its resource; a destroyed condenser never produces passive income", () => {
  const s = field(), mine = s.campaign.mines.find((p) => p.id === "M01"); visit(s, mine);
  const b = build(s, "condenser", mine), w = s.units.find((u) => u.node === b.id);
  for (let i = 0; i < 1800 && !w.cargo; i++) E.step(s);
  w.hp = 0; E.development.onDeath(s, w);
  assert.equal(s.campaign.matter.lostCargo, 4); assert.equal(w.cargo, 0); valid(s);
  b.hp = 0; E.development.onDeath(s, b);
  const balance = s.economy.matter; frames(s, 1200);
  assert.equal(s.economy.matter, balance); valid(s);
});

test("cancelling untouched foundations returns the full alloy price; progress returns 75 percent", () => {
  for (const started of [false, true, "damaged"]) {
    const s = field(), mine = s.campaign.mines.find((p) => p.id === "M01"); visit(s, mine);
    const result = E.purchase(s, "condenser", findSite(s, "condenser", mine)), b = s.units.find((u) => u.id === result.buildingId);
    if (started === "damaged") b.hp--;
    else if (started) for (let i = 0; i < 6000 && b.build === 40; i++) E.step(s);
    const o = E.purchase(s, "cancel-build", b.id);
    assert.equal(o.cost, started ? -135 : -180); valid(s);
  }
});

test("corrupt resource ledgers, source types, prices and cross-version data are rejected", () => {
  const s = industry(field()); matter(s, 100); E.purchase(s, "weapons", E.living(s, "arsenal").id); valid(s);
  for (const mutate of [
    (v) => v.economy.matter++, (v) => v.campaign.matter.deposited++,
    (v) => v.campaign.matter.lostCargo++, (v) => v.campaign.resources = 1,
    (v) => v.campaign.mines.at(-1).resource = "alloy",
    (v) => v.units.find((u) => u.jobs.length).jobs[0].matter = 0,
    (v) => v.units.find((u) => u.kind === "drone").cargoType = "unknown",
  ]) { const v = E.snapshot(s); mutate(v); assert.equal(E.restore(v), null); }
  const old = E.make("frontier-9"); old.economy.matter = 10; assert.equal(E.restore(old), null);
});

test("exhaustion stops extraction and workers never move to another matter crater automatically", () => {
  const s = field(), mine = s.campaign.mines.find((p) => p.id === "M01"); visit(s, mine);
  const b = build(s, "condenser", mine), amount = mine.remaining - 4;
  mine.remaining = 4; s.economy.matter += amount; s.campaign.matter.deposited += amount;
  frames(s, 3000);
  assert.equal(mine.remaining, 0); assert.equal(s.economy.matter, mine.stock);
  assert.equal(E.purchase(s, "staff-condenser", b.id).reason, "empty-resource");
  const value = s.economy.matter; frames(s, 600); assert.equal(s.economy.matter, value); valid(s);
});

test("a surviving worker delivers matter cargo to the base after losing its condenser", () => {
  const s = field(), mine = s.campaign.mines.find((p) => p.id === "M01"); visit(s, mine);
  const b = build(s, "condenser", mine), w = s.units.find((u) => u.node === b.id);
  for (let i = 0; i < 1800 && !w.cargo; i++) E.step(s);
  b.hp = 0; E.development.onDeath(s, b); valid(s);
  frames(s, 2400);
  assert.equal(s.economy.matter, 4); assert.equal(s.campaign.matter.lostCargo, 0); valid(s);
});

test("global research survives the loss of its arsenal; repeated unpaid starts cannot inflate either wallet", () => {
  const s = industry(field()), b = E.living(s, "arsenal"); matter(s, 100);
  const before = { alloy: s.economy.alloy, matter: s.economy.matter };
  for (let i = 0; i < 300; i++) {
    assert.ok(E.purchase(s, "weapons", b.id).allowed);
    assert.ok(E.purchase(s, "cancel", b.id + ":" + b.jobs[0].id).allowed);
  }
  assert.deepEqual({ alloy: s.economy.alloy, matter: s.economy.matter }, before); valid(s);
  assert.ok(E.purchase(s, "weapons", b.id).allowed); frames(s, 4600);
  assert.equal(s.campaign.weapons, true);
  b.hp = 0; E.development.onDeath(s, b); valid(s);
  assert.equal(s.campaign.weapons, true);
});

test("the expanded operation retains both ledgers through the archive phase and its final victory", () => {
  const s = field("frontier-10");
  for (const u of s.units) if (u.team) u.hp = 0;
  E.step(s); assert.equal(s.east.open, true); valid(s);
  const c = E.east.carrier(s); s.east.claimed = true; c.group = 1;
  assert.ok(E.orderUnits(s, [c.id], E.east.dock.x, E.east.dock.y));
  for (let i = 0; i < 3600 && E.dist(c, E.east.dock) > 10; i++) E.step(s);
  assert.ok(E.dist(c, E.east.dock) < 10); valid(s);
  Object.assign(E.hero(s), { x: 5360, y: 2040 }); E.refreshRecon(s);
  for (let i = 0; i < 1000 && s.status === "playing"; i++) E.step(s, { interact: true });
  assert.equal(s.status, "won"); valid(s);
});

test("automatic construction and repair preserve matter crews; explicit worker orders take precedence", () => {
  const s = field(), mine = s.campaign.mines.find((p) => p.id === "M01"); visit(s, mine);
  const b = build(s, "condenser", mine), miner = s.units.find((u) => u.node === b.id),
    other = s.units.find((u) => u.kind === "drone" && u.id !== miner.id);
  b.hp -= 20;
  assert.notEqual(E.construction.repairOffer(s, b.id).plans[0].worker.id, miner.id);
  assert.equal(E.construction.repairOffer(s, b.id, [miner.id]).plans[0].worker.id, miner.id);
  const p = findSite(s, "barracks", E.hero(s)), offer = E.construction.check(s, "barracks", p);
  assert.notEqual(offer.builder.id, miner.id);
  const explicit = E.construction.check(s, "barracks", { ...p, builderId: miner.id });
  assert.equal(explicit.builder.id, miner.id); valid(s);
});

test("right click repairs a damaged condenser and assigns mining to a healthy condenser", () => {
  const s = field(), mine = s.campaign.mines.find((p) => p.id === "M01"); visit(s, mine);
  const b = build(s, "condenser", mine), miner = s.units.find((u) => u.node === b.id);
  b.hp -= 20;
  assert.ok(E.commandSelection(s, [miner.id], b, b.id));
  assert.equal(miner.workerTask.kind, "repair");
  frames(s, 900); assert.equal(b.hp, E.C.condenser.hp);
  assert.ok(E.commandSelection(s, [miner.id], b, b.id));
  assert.equal(miner.workerTask, undefined); assert.equal(miner.mineId, mine.id); valid(s);
});

test("cloud transfer round trips the complete new save and both resource balances", async () => {
  const { CloudSync, encode } = require("../game-source/signal-frontier/src/cloud-core");
  const a = industry(field("frontier-10")); matter(a, 100);
  E.purchase(a, "weapons", E.living(a, "arsenal").id); valid(a);
  let record = null;
  const transport = {
    read: async () => record,
    write: async (uid, revision, save, allowed) => {
      if (!allowed() || (record?.revision || 0) !== revision) return { committed: false, record };
      record = { version: 1, revision: revision + 1, save, updatedAt: Date.now() };
      return { committed: true, record };
    },
  };
  function client(state, fresh) {
    const cache = new Map(), current = { state };
    current.sync = new CloudSync({ storage: { getItem: (k) => cache.get(k) || null, setItem: (k, v) => cache.set(k, v) },
      transport, getSave: () => encode(E.snapshot(current.state)),
      validateSave: (value) => assert.ok(E.restore(JSON.parse(value))),
      isFresh: () => fresh, canApply: () => true,
      applySave: (value) => current.state = E.restore(JSON.parse(value)) });
    return current;
  }
  const first = client(a, false), second = client(E.make("frontier-10", { resources: 2 }), true);
  await first.sync.setUser("matter-test"); await first.sync.sync();
  await second.sync.setUser("matter-test");
  assert.equal(first.sync.status, "synced"); assert.equal(second.sync.status, "synced");
  assert.deepEqual(E.snapshot(second.state), E.snapshot(a));
  assert.equal(second.state.economy.matter, 70); assert.equal(second.state.version, 14);
});

test("miners react to visible firing range before the old 170-unit radius and resume deterministically", () => {
  const s = E.make("frontier-9", { resources: 2 }), w = s.units.find((u) => u.kind === "drone"),
    gunner = s.units.find((u) => u.kind === "sentinel");
  Object.assign(gunner, { x: w.x + 400, y: w.y }); E.refreshRecon(s);
  assert.ok(E.free(gunner.x, gunner.y, E.C.sentinel.r, s));
  assert.ok(E.dist(w, gunner) > 170); assert.equal(M.threat(s, w, E)?.id, gunner.id);
  E.step(s); assert.ok(w.fright > 0); assert.ok(w.miningShelter); assert.equal(w.work, "shelter");
  const restored = valid(s);
  for (let i = 0; i < 180; i++) { E.step(s); E.step(restored); }
  assert.deepEqual(E.snapshot(restored), E.snapshot(s));
});

test("shelter destinations stay fixed across small enemy movements, avoiding per-frame route rebuilds", () => {
  const s = E.make("frontier-9", { resources: 2 }), w = s.units.find((u) => u.kind === "drone"), base = E.living(s, "base"),
    enemy = { x: base.x + 400, y: base.y + 30 };
  const point = M.shelter(s, w, base, enemy, E); assert.ok(point); w.miningShelter = point;
  for (let i = 0; i < 100; i++) assert.equal(M.shelter(s, w, base, { x: enemy.x + i * .01, y: enemy.y }, E), point);
});

test("worker safety does not reveal an unseen attacker", () => {
  const s = field(), w = s.units.find((u) => u.kind === "drone"), gunner = s.units.find((u) => u.kind === "turret");
  Object.assign(w, { x: 2200, y: 3520 }); Object.assign(gunner, { x: 2600, y: 3520, hp: E.C.turret.hp });
  E.refreshRecon(s); assert.equal(E.visible(s, 0, gunner), false);
  assert.equal(M.threat(s, w, E), null);
});
