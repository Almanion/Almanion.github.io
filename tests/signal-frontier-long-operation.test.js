"use strict";
const assert = require("node:assert/strict");
const E = require("../game-source/signal-frontier/src/engine"),
  D = E.development;
let checks = 0;
function test(name, fn) {
  fn();
  console.log("PASS " + name);
  checks++;
}
function advance(s, seconds) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) E.step(s);
}
function field() {
  const s = E.make("frontier-2");
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((c) => (c.reserve = 0));
  return s;
}
function fund(s, amount) {
  let left = amount;
  for (const m of [...s.campaign.mines].reverse()) {
    const n = Math.min(m.remaining, left);
    m.remaining -= n;
    left -= n;
  }
  assert.equal(left, 0);
  s.campaign.deposited += amount;
  s.economy.alloy += amount;
}
function build(s, kind, site) {
  if (site) {
    const p = D.PADS.find((p) => p.id === site);
    Object.assign(E.hero(s), { x: p.x - 80, y: p.y });
  }
  assert.ok(E.purchase(s, kind, site).allowed);
  advance(s, D.items(s)[kind].time + 0.1);
  return s.units.find(
    (u) => u.kind === kind && u.hp > 0 && (!site || u.site === site),
  );
}
function tierTwo() {
  const s = field();
  fund(s, 4000);
  build(s, "barracks");
  build(s, "outpost", "west");
  assert.ok(E.purchase(s, "network").allowed);
  advance(s, 90.1);
  return s;
}

test("new operation uses its own profile; versions two and three retain exact costs and saves", () => {
  const s = E.make("frontier-2"),
    old = E.make("frontier-1"),
    classic = E.make("classic");
  assert.equal(s.version, 4);
  assert.equal(s.campaign.id, "frontier-2");
  assert.equal(D.items(s).barracks.cost, 120);
  assert.equal(D.items(old).barracks.cost, 80);
  assert.equal(D.items(s).drone.time, 18);
  assert.equal(D.items(old).drone.time, 12);
  assert.equal(E.supplyStatus(classic, "hack").cost, 60);
  for (const v of [s, old, classic])
    assert.deepEqual(E.restore(E.snapshot(v)), E.snapshot(v));
  assert.equal(
    E.purchase(old, "defense", E.living(old, "base").id).allowed,
    false,
  );
  assert.equal(old.campaign.mines[0].stock, 720);
  assert.equal(s.campaign.mines[0].stock, 1080);
});
test("prices reserve real funds and rapid worker orders reserve separate slots", () => {
  const s = E.make("frontier-2"),
    b = E.living(s, "base");
  for (const action of ["missing", "__proto__", "constructor"]) {
    const before = E.snapshot(s);
    assert.equal(E.purchase(s, action).allowed, false);
    assert.deepEqual(E.snapshot(s), before);
  }
  assert.ok(E.purchase(s, "drone", b.id).allowed);
  assert.ok(E.purchase(s, "drone", b.id).allowed);
  assert.equal(s.economy.alloy, 80);
  assert.equal(b.jobs.length, 2);
  assert.equal(E.purchase(s, "drone", b.id).reason, "worker-limit");
  assert.equal(E.purchase(s, "cancel", b.id + ":" + b.jobs[0].id).cost, -37);
  assert.equal(s.economy.alloy, 117);
  assert.ok(E.restore(s));
});
test("long operation mining retains finite cargo and credits only delivery", () => {
  const s = field(),
    drone = s.units.find((u) => u.kind === "drone");
  for (const u of s.units) if (u.kind === "drone" && u !== drone) u.hp = 0;
  for (let i = 0; i < 1800 && !drone.cargo; i++) E.step(s);
  assert.equal(drone.cargo, 4);
  assert.equal(s.economy.alloy, 180);
  assert.equal(s.campaign.mines[0].remaining, 1076);
  for (let i = 0; i < 1800 && !s.campaign.deposited; i++) E.step(s);
  assert.equal(s.economy.alloy, 184);
  assert.ok(E.restore(s));
});
test("third tier needs two completed expansions and either defeated enemy production site", () => {
  const s = tierTwo();
  assert.equal(E.supplyStatus(s, "command").reason, "second-node");
  const pad = D.PADS[1];
  Object.assign(E.hero(s), { x: pad.x - 80, y: pad.y });
  assert.ok(E.purchase(s, "outpost", pad.id).allowed);
  assert.equal(E.supplyStatus(s, "command").reason, "second-node");
  advance(s, 45.1);
  const jammer = s.units.find((u) => u.kind === "jammer"),
    turret = s.units.find((u) => u.kind === "turret");
  jammer.hp = 340;
  turret.hp = 200;
  assert.equal(E.supplyStatus(s, "command").reason, "secure");
  for (const unit of [jammer, turret]) {
    unit.hp = 0;
    assert.ok(E.supplyStatus(s, "command").allowed);
    unit.hp = E.C[unit.kind].hp;
  }
  turret.hp = 0;
  assert.ok(E.purchase(s, "command").allowed);
  assert.equal(E.supplyStatus(s, "command").reason, "researching");
  assert.equal(E.supplyStatus(s, "hack").reason, "command");
  const snap = E.snapshot(s);
  assert.ok(E.restore(snap));
  assert.equal(s.campaign.tier, 2);
  advance(s, 119);
  assert.equal(s.campaign.tier, 2);
  advance(s, 1.1);
  assert.equal(s.campaign.tier, 3);
  assert.ok(E.supplyStatus(s, "hack").allowed);
  assert.equal(E.supplyStatus(s, "command").reason, "installed");
  assert.ok(E.restore(s));
});
test("third-tier research can finish after a node is lost, but cannot start without two nodes", () => {
  const s = tierTwo();
  build(s, "outpost", "relay");
  assert.ok(E.purchase(s, "command").allowed);
  const u = s.units.find((u) => u.site === "west");
  u.hp = 0;
  D.onDeath(s, u);
  advance(s, 120.1);
  assert.equal(s.campaign.tier, 3);
  assert.ok(E.restore(s));
});
test("defensive module is paid, local, queued once and restored mid-construction", () => {
  const s = field(),
    base = E.living(s, "base");
  fund(s, 500);
  assert.ok(E.purchase(s, "defense", base.id).allowed);
  assert.equal(s.economy.spent, 120);
  assert.equal(base.defense, undefined);
  assert.equal(E.supplyStatus(s, "defense", base.id).reason, "researching");
  advance(s, 20);
  const restored = E.restore(E.snapshot(s));
  assert.ok(restored);
  advance(restored, 20.1);
  assert.equal(E.living(restored, "base").defense, true);
  assert.equal(E.living(s, "base").defense, undefined);
  assert.equal(
    E.supplyStatus(restored, "defense", base.id).reason,
    "installed",
  );
  assert.equal(
    E.supplyStatus(restored, "defense", E.hero(restored).id).allowed,
    false,
  );
});
test("defended nodes fire on visible enemies and reduce incoming damage", () => {
  const s = field(),
    base = E.living(s, "base");
  assert.ok(E.purchase(s, "defense", base.id).allowed);
  advance(s, 40.1);
  const enemy = s.units.find((u) => u.kind === "runner");
  Object.assign(enemy, { hp: 55, x: 305, y: 1140 });
  enemy.ai.home = { x: 305, y: 1140 };
  E.step(s);
  assert.ok(s.bullets.some((b) => b.owner === base.id && b.team === 0));
  enemy.hp = 0;
  s.bullets = [
    {
      x: base.x - 50,
      y: base.y,
      vx: 800,
      vy: 0,
      life: 1,
      damage: 100,
      age: 0,
      tx: base.x,
      ty: base.y,
      kind: "bolt",
      team: 1,
      owner: enemy.id,
      map: "frontier",
    },
  ];
  const before = base.hp;
  E.step(s);
  assert.ok(Math.abs(before - base.hp - 35) < 1e-8);
});
test("node fire reaches melee enemies inside the visible gun footprint", () => {
  const s = field(),
    base = E.living(s, "base");
  E.purchase(s, "defense", base.id);
  advance(s, 40.1);
  for (const u of s.units) if (u.kind === "rifle") u.hp = 0;
  Object.assign(E.hero(s), { x: 500, y: 900 });
  const enemy = s.units.find((u) => u.kind === "runner");
  Object.assign(enemy, { hp: 55, x: base.x + 30, y: base.y });
  enemy.ai.home = { x: enemy.x, y: enemy.y };
  advance(s, 4);
  assert.equal(enemy.hp, 0);
  assert.ok(base.hp > 650);
});
test("paid repair completes once, clamps health and cannot resurrect destroyed infrastructure", () => {
  const s = field(),
    base = E.living(s, "base");
  fund(s, 400);
  assert.equal(E.supplyStatus(s, "repair", base.id).reason, "intact");
  base.hp = 200;
  assert.ok(E.purchase(s, "repair", base.id).allowed);
  assert.equal(E.supplyStatus(s, "repair", base.id).reason, "researching");
  advance(s, 19);
  assert.equal(base.hp, 200);
  const restored = E.restore(E.snapshot(s));
  assert.ok(restored);
  advance(restored, 1.1);
  assert.equal(E.living(restored, "base").hp, 585);
  assert.equal(restored.economy.spent, 50);
  assert.ok(E.purchase(restored, "repair", base.id).allowed);
  advance(restored, 20.1);
  assert.equal(E.living(restored, "base").hp, 700);
  const barracks = build(s, "barracks");
  barracks.hp = 80;
  assert.ok(E.purchase(s, "repair", barracks.id).allowed);
  barracks.hp = 0;
  D.onDeath(s, barracks);
  advance(s, 21);
  assert.equal(barracks.hp, 0);
  assert.equal(barracks.jobs.length, 0);
  assert.equal(E.purchase(s, "repair", barracks.id).allowed, false);
  assert.ok(E.restore(s));
});
test("repair cancellation refunds 75 percent exactly once", () => {
  const s = field(),
    base = E.living(s, "base");
  base.hp = 500;
  assert.ok(E.purchase(s, "repair", base.id).allowed);
  const key = base.id + ":" + base.jobs[0].id;
  assert.equal(E.purchase(s, "cancel", key).cost, -37);
  assert.equal(s.economy.alloy, 167);
  assert.equal(E.purchase(s, "cancel", key).allowed, false);
  advance(s, 25);
  assert.equal(base.hp, 500);
  assert.ok(E.restore(s));
});
test("profile, prices, local upgrades and premature specialisation cannot be forged in saves", () => {
  const s = field();
  fund(s, 700);
  const b = E.living(s, "base");
  b.hp = 300;
  E.purchase(s, "repair", b.id);
  for (const corrupt of [
    (v) => (v.version = 3),
    (v) => (v.campaign.id = "frontier-1"),
    (v) => (v.campaign.tier = 4),
    (v) => (v.units.find((u) => u.kind === "base").jobs[0].cost = 1),
    (v) =>
      v.units
        .find((u) => u.kind === "base")
        .jobs.push({
          ...v.units.find((u) => u.kind === "base").jobs[0],
          id: ++v.campaign.jobSeq,
        }),
    (v) => (v.units.find((u) => u.kind === "hero").defense = true),
    (v) => (v.economy.kit = true),
    (v) => (v.campaign.mines[0].stock = 9999),
    (v) => (v.campaign.camps[0].reserve = 49),
  ]) {
    const v = E.snapshot(s);
    corrupt(v);
    assert.equal(E.restore(v), null);
  }
  assert.ok(E.restore(s));
});
test("late enemy waves use finite reserves and a destroyed source cannot continue", () => {
  const s = E.make("frontier-2"),
    camp = s.campaign.camps[0];
  s.t = 1000;
  camp.cooldown = 0;
  D.operation(s, {}, E.DT);
  assert.equal(camp.warning, 9);
  assert.equal(camp.reserve, 48);
  for (let i = 0; i < 542; i++) D.operation(s, {}, E.DT);
  assert.equal(camp.reserve, 41);
  assert.ok(camp.cooldown > 99);
  s.units.find((u) => u.id === camp.source).hp = 0;
  for (let i = 0; i < 8000; i++) D.operation(s, {}, E.DT);
  assert.equal(camp.reserve, 41);
});
const { play } = require("./helpers/signal-frontier-long-pilot.cjs");
for (const route of ["siege", "infiltration"])
  test(
    "full " +
      route +
      " uses a distinct expansion and wins within the 15–20 minute target",
    () => {
      const { state: s, pilot } = play(route, 78000);
      assert.equal(
        s.status,
        "won",
        JSON.stringify({ time: s.t, stage: pilot.stage, economy: s.economy }),
      );
      assert.equal(s.approach, route);
      assert.equal(s.campaign.tier, 3);
      assert.ok(s.t >= 900 && s.t <= 1200, s.t.toFixed(1));
      assert.ok(s.campaign.deposited > 2000);
      assert.ok(E.restore(s));
      assert.ok(
        s.units.some(
          (u) =>
            u.kind === "outpost" &&
            u.site === (route === "siege" ? "flank" : "relay"),
        ),
      );
      if (route === "siege") {
        assert.ok(s.relay.online);
        assert.ok(s.units.some((u) => u.kind === "artillery"));
      } else {
        assert.ok(E.living(s, "jammer"));
        assert.equal(s.relay.online, false);
        assert.ok(!s.units.some((u) => u.kind === "artillery"));
      }
      console.log(
        "  " +
          route +
          ": " +
          Math.round(s.t) +
          " seconds; " +
          s.kills +
          " enemies defeated",
      );
    },
  );
console.log(checks + " long-operation checks passed.");
