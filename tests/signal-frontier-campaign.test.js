"use strict";
const assert = require("node:assert/strict"),
  E = require("../game-source/signal-frontier/src/engine"),
  D = E.development;
let checks = 0;
function test(name, fn) {
  fn();
  console.log("PASS " + name);
  checks++;
}
function frames(s, n, input = {}) {
  for (let i = 0; i < n; i++) E.step(s, input);
}
// Isolated economy fixtures keep the same extraction ledger as delivered ore.
function fund(s, n) {
  let left = n;
  for (const m of s.campaign.mines) {
    const amount = Math.min(m.remaining, left);
    m.remaining -= amount;
    left -= amount;
  }
  assert.equal(left, 0);
  s.campaign.deposited += n;
  s.economy.alloy += n;
}
function build(s, kind, site) {
  if (site) {
    const p = D.PADS.find((p) => p.id === site);
    Object.assign(E.hero(s), { x: p.x - 80, y: p.y });
  }
  assert.equal(E.purchase(s, kind, site).allowed, true);
  frames(s, Math.ceil(D.ITEMS[kind].time * 60) + 2);
  return E.living(s, kind);
}
// A quiet test field retains the objective and silences its production, without altering unit economics.
function field() {
  const s = E.make("frontier-1");
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((c) => (c.reserve = 0));
  return s;
}

test("0.4 deployments use the larger map; legacy operations keep their original map and rules", () => {
  const s = E.make("frontier-1"),
    old = E.make("classic");
  assert.equal(s.version, 3);
  assert.equal(E.map(s).W, 1920);
  assert.equal(E.map(old).W, 1440);
  assert.equal(E.supplyStatus(old, "hack").cost, 60);
  assert.equal(E.supplyStatus(s, "hack").reason, "network");
  assert.ok(E.restore(s));
  assert.deepEqual(E.restore(E.snapshot(old)), E.snapshot(old));
});
test("drones carry finite ore; credit is given only after the return trip", () => {
  const s = field();
  const drones = s.units.filter((u) => u.kind === "drone");
  drones[1].hp = 0;
  let loaded = false;
  for (let i = 0; i < 1800; i++) {
    E.step(s);
    if (drones[0].cargo) {
      loaded = true;
      assert.equal(s.economy.alloy, 180);
      assert.equal(s.campaign.mines[0].remaining, 716);
      break;
    }
  }
  assert.ok(loaded);
  for (let i = 0; i < 1800 && s.campaign.deposited === 0; i++) E.step(s);
  assert.equal(s.campaign.deposited, 4);
  assert.equal(s.economy.alloy, 184);
  assert.ok(E.restore(s));
});
test("queue costs are atomic, worker slots are reserved and cancellation returns exactly 75 percent", () => {
  const s = E.make("frontier-1"),
    base = E.living(s, "base");
  assert.ok(E.purchase(s, "drone").allowed);
  assert.ok(E.purchase(s, "drone").allowed);
  const before = E.snapshot(s);
  assert.equal(E.purchase(s, "drone").reason, "worker-limit");
  assert.deepEqual(E.snapshot(s), before);
  const id = base.jobs[0].id;
  assert.equal(E.purchase(s, "cancel", base.id + ":" + id).cost, -26);
  assert.equal(s.economy.alloy, 136);
  assert.equal(s.economy.recovered, 26);
  assert.equal(E.purchase(s, "cancel", base.id + ":" + id).allowed, false);
  assert.ok(E.restore(s));
});
test("production runs one job at a time in simulation, and waiting in pause cannot finish it", () => {
  const s = field();
  const b = build(s, "barracks");
  assert.ok(E.purchase(s, "rifle").allowed);
  assert.ok(E.purchase(s, "rifle").allowed);
  const snap = E.snapshot(s),
    time = b.jobs[0].remaining;
  for (let i = 0; i < 20; i++) E.snapshot(s);
  assert.equal(b.jobs[0].remaining, time);
  frames(s, Math.ceil(12 * 60) + 2);
  assert.equal(s.units.filter((u) => u.kind === "rifle" && u.hp > 0).length, 4);
  assert.equal(b.jobs.length, 1);
  assert.ok(b.jobs[0].remaining > 11.9);
  assert.ok(E.restore(s));
  assert.ok(E.restore(snap));
});
test("army capacity counts queued troops; destroying a node blocks production but preserves paid orders", () => {
  const s = field();
  fund(s, 1000);
  const b = build(s, "barracks");
  for (let i = 0; i < 3; i++) assert.ok(E.purchase(s, "rifle").allowed);
  assert.equal(E.supplyStatus(s, "rifle").reason, "capacity");
  frames(s, 2200);
  const post = build(s, "outpost", "west");
  assert.equal(D.capacity(s), 9);
  assert.ok(E.purchase(s, "rifle").allowed);
  post.hp = 0;
  D.onDeath(s, post);
  const remaining = b.jobs[0].remaining;
  frames(s, 60);
  assert.equal(b.jobs[0].remaining, remaining);
  assert.equal(s.economy.recovered, 0);
  assert.ok(E.restore(s));
});
test("network and specialisation require completed infrastructure and real research time", () => {
  const s = field();
  fund(s, 1800);
  assert.equal(E.supplyStatus(s, "network").reason, "barracks");
  build(s, "barracks");
  assert.equal(E.supplyStatus(s, "network").reason, "expansion");
  build(s, "outpost", "west");
  assert.ok(E.purchase(s, "network").allowed);
  assert.equal(E.supplyStatus(s, "network").reason, "researching");
  assert.equal(E.supplyStatus(s, "foundry").reason, "network");
  frames(s, 3002);
  assert.equal(s.campaign.tier, 2);
  assert.ok(E.purchase(s, "hack").allowed);
  assert.equal(s.economy.kit, false);
  frames(s, 2102);
  assert.equal(s.economy.kit, true);
  assert.ok(E.restore(s));
});
test("destroyed production loses its queue and can be rebuilt without a refund exploit", () => {
  const s = field();
  fund(s, 600);
  const b = build(s, "barracks");
  E.purchase(s, "rifle");
  const money = s.economy.alloy;
  b.hp = 0;
  D.onDeath(s, b);
  assert.deepEqual(b.jobs, []);
  assert.equal(s.economy.alloy, money);
  assert.equal(E.purchase(s, "cancel", b.id + ":1").allowed, false);
  assert.ok(E.purchase(s, "barracks").allowed);
  assert.ok(E.restore(s));
});
test("cancelled research can be ordered again, but completed research cannot be bought twice", () => {
  const s = field();
  fund(s, 1500);
  build(s, "barracks");
  build(s, "outpost", "west");
  E.purchase(s, "network");
  const base = E.living(s, "base");
  E.purchase(s, "cancel", base.id + ":" + base.jobs[0].id);
  assert.ok(E.purchase(s, "network").allowed);
  frames(s, 3002);
  assert.equal(E.supplyStatus(s, "network").reason, "installed");
  assert.ok(E.restore(s));
});
test("forward construction waits for the scout and new nodes do not create free workers", () => {
  const s = field();
  fund(s, 200);
  const p = D.PADS[0],
    h = E.hero(s);
  h.x = p.x - 80;
  h.y = p.y;
  assert.ok(E.purchase(s, "outpost", p.id).allowed);
  const post = E.living(s, "outpost");
  h.x = 180;
  h.y = 1050;
  frames(s, 120);
  assert.equal(post.build, 24);
  h.x = p.x - 80;
  h.y = p.y;
  frames(s, 1442);
  assert.equal(post.build, 0);
  assert.equal(s.units.filter((u) => u.kind === "drone").length, 2);
  assert.ok(E.purchase(s, "drone", post.id).allowed);
  frames(s, 722);
  assert.equal(
    s.units.filter((u) => u.kind === "drone" && u.node === post.id).length,
    1,
  );
  assert.ok(E.restore(s));
});
test("rally orders cover the eastern sector and are inherited by newly trained units", () => {
  const s = field();
  fund(s, 500);
  const b = build(s, "barracks");
  assert.ok(E.order(s, 1, 1760, 840));
  assert.deepEqual(b.rally, { x: 1760, y: 840 });
  E.purchase(s, "rifle");
  frames(s, 722);
  const rifle = s.units.filter((u) => u.kind === "rifle").at(-1);
  assert.ok(rifle.path.some((p) => p.x > 1440));
  assert.ok(E.restore(s));
});
test("new snapshots preserve queues, cargo, research and combat deterministically", () => {
  const a = E.make("frontier-1");
  E.purchase(a, "barracks");
  E.purchase(a, "drone");
  frames(a, 900);
  const b = E.restore(E.snapshot(a));
  assert.ok(b);
  for (let i = 0; i < 900; i++) {
    E.step(a);
    E.step(b);
  }
  assert.deepEqual(E.snapshot(a), E.snapshot(b));
});
test("malformed ore, queues, capacity, coordinates and research are rejected", () => {
  const good = E.make("frontier-1");
  E.purchase(good, "drone");
  for (const corrupt of [
    (s) => s.economy.alloy++,
    (s) => s.campaign.mines[0].remaining--,
    (s) => (E.living(s, "base").jobs[0].cost = 0),
    (s) => (E.living(s, "base").jobs[0].remaining = -1),
    (s) => (s.campaign.tier = 3),
    (s) => (s.units[0].map = "classic"),
    (s) => (s.units[0].x = 2000),
    (s) => (s.campaign.intel[0].x = NaN),
    (s) => (s.campaign.camps[0].reserve = 100),
    (s) => (s.campaign.weapons = true),
  ]) {
    const bad = E.snapshot(good);
    corrupt(bad);
    assert.equal(E.restore(bad), null);
  }
});
test("guards patrol without crossing solid geometry and do not see the scout through cover", () => {
  const s = E.make("frontier-1"),
    guard = s.units.find((u) => u.kind === "sentinel");
  guard.x = 570;
  guard.y = 450;
  guard.ai.home = { x: 570, y: 450 };
  const h = E.hero(s);
  h.x = 760;
  h.y = 450;
  for (const u of s.units)
    if (u.team === 0 && u !== h && u.kind !== "base") u.hp = 0;
  let moved = false;
  for (let i = 0; i < 240; i++) {
    E.step(s);
    assert.ok(E.free(guard.x, guard.y, E.C.sentinel.r, "frontier"));
    moved ||= E.dist(guard, guard.ai.home) > 5;
    if (i < 30) assert.equal(guard.ai.seen, null);
  }
  assert.ok(moved);
});
test("warning locks the shot before firing, allowing a change of direction to evade it", () => {
  const s = E.make("frontier-1"),
    u = s.units.find((u) => u.kind === "sentinel"),
    h = E.hero(s);
  u.x = 500;
  u.y = 900;
  u.ai.home = { x: 500, y: 900 };
  u.cool = 0;
  h.x = 300;
  h.y = 900;
  for (const v of s.units)
    if (!v.team && v !== h && v.kind !== "base") v.hp = 0;
  E.step(s);
  assert.ok(u.wind > 0);
  const lock = { ...u.target };
  for (let i = 0; i < 12; i++) E.step(s, { y: -1 });
  assert.deepEqual(u.target, lock);
  assert.ok(E.dist(h, lock) > 20);
});
test("enemy reserves are finite and a destroyed source cannot dispatch more units", () => {
  const s = E.make("frontier-1"),
    camp = s.campaign.camps[0];
  camp.cooldown = 0;
  D.operation(s, {}, E.DT);
  assert.equal(camp.warning, 9);
  const source = s.units.find((u) => u.id === camp.source);
  source.hp = 0;
  const before = s.units.length;
  for (let i = 0; i < 700; i++) D.operation(s, {}, E.DT);
  assert.equal(s.units.length, before);
  assert.equal(camp.reserve, 24);
});

test("destroyed cargo is lost once, never credited to the wallet", () => {
  const s = field(),
    u = s.units.find((u) => u.kind === "drone");
  while (!u.cargo) E.step(s);
  const wallet = s.economy.alloy;
  u.hp = 0;
  D.onDeath(s, u);
  D.onDeath(s, u);
  assert.equal(s.campaign.lostCargo, 4);
  assert.equal(s.economy.alloy, wallet);
  assert.ok(E.restore(s));
});
test("finite extraction stops at zero", () => {
  const s = field();
  fund(s, 716);
  const mine = s.campaign.mines[0];
  frames(s, 1800);
  assert.equal(mine.remaining, 0);
  const wallet = s.economy.alloy;
  frames(s, 1800);
  assert.equal(s.economy.alloy, wallet);
  assert.ok(E.restore(s));
});
test("enemy production spends its finite reserves and warns before each dispatch", () => {
  const s = E.make("frontier-1"),
    camp = s.campaign.camps[0];
  let before = s.units.length;
  for (let i = 0; i < 7; i++) {
    camp.cooldown = 0;
    D.operation(s, {}, E.DT);
    assert.equal(s.units.length, before);
    for (let t = 0; t < 542; t++) D.operation(s, {}, E.DT);
    before = s.units.length;
    for (const u of s.units) if (u.ai?.raid) u.hp = 0;
  }
  assert.equal(camp.reserve, 0);
  assert.equal(
    s.units.filter((u) => u.ai?.raid && u.ai.home.x === 1470).length,
    24,
  );
});
test("a destroyed base ends cleanly even when drones need to return", () => {
  const s = field();
  E.living(s, "base").hp = 0;
  assert.doesNotThrow(() => E.step(s));
  assert.equal(s.status, "lost");
  assert.ok(E.restore(s));
});
const { play } = require("./helpers/signal-frontier-campaign-pilot.cjs");
for (const route of ["siege", "infiltration"])
  test(
    "complete 0.4 " + route + " operation using only legal commands",
    () => {
      const { state: s } = play(route);
      assert.equal(s.status, "won");
      assert.equal(s.approach, route);
      assert.ok(s.t > 180 && s.t < 600);
      assert.ok(s.campaign.deposited > 500);
      assert.ok(E.restore(s));
      if (route === "infiltration") {
        assert.ok(E.living(s, "jammer"));
        assert.equal(s.relay.online, false);
        assert.equal(
          s.units.some((u) => u.kind === "artillery"),
          false,
        );
      } else {
        assert.equal(s.relay.online, true);
        assert.ok(s.units.some((u) => u.kind === "artillery"));
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
test("ignoring development and enemy attacks eventually loses the operation", () => {
  const s = E.make("frontier-1");
  frames(s, 36000);
  assert.equal(s.status, "lost");
  assert.ok(s.t > 90 && s.t < 600);
});

test("workers displaced by a destroyed expansion return home without exceeding four active miners", () => {
  const s = field(),
    mine = s.campaign.mines.at(-1);
  mine.remaining -= 500;
  s.campaign.deposited += 500;
  s.economy.alloy += 500;
  E.purchase(s, "drone");
  E.purchase(s, "drone");
  frames(s, 1500);
  const post = build(s, "outpost", "west");
  E.purchase(s, "drone", post.id);
  E.purchase(s, "drone", post.id);
  frames(s, 1500);
  post.hp = 0;
  D.onDeath(s, post);
  frames(s, 1800);
  const base = E.living(s, "base"),
    workers = D.workers(s, base);
  assert.equal(workers.length, 6);
  assert.ok(
    workers.slice(4).every((u) => u.work === "idle" && E.dist(u, base) < 100),
  );
  assert.ok(workers.filter((u) => u.work === "gather").length <= 4);
  assert.ok(E.restore(s));
});
test("breaching after enemy reserves are exhausted does not invent another wave", () => {
  const s = field();
  fund(s, 1400);
  build(s, "barracks");
  build(s, "outpost", "west");
  E.purchase(s, "network");
  frames(s, 3002);
  E.purchase(s, "hack");
  frames(s, 2102);
  Object.assign(E.hero(s), { x: s.terminal.x, y: s.terminal.y });
  const camp = s.campaign.camps[2],
    waves = camp.waves;
  frames(s, 220, { interact: true });
  assert.equal(s.terminal.alarm, true);
  assert.equal(camp.waves, waves);
  assert.equal(camp.reserve, 0);
  assert.ok(E.restore(s));
  const bad = E.snapshot(s);
  Object.assign(E.hero(bad), { x: 650, y: 400 });
  assert.equal(E.restore(bad), null);
});
console.log(checks + " campaign checks passed.");
