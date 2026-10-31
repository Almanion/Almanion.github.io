"use strict";
const assert = require("node:assert/strict"),
  {
    E,
    fund,
    field,
    findSite,
    frames,
    finish,
    build,
  } = require("./helpers/signal-frontier-construction.cjs");
let checks = 0;
function test(name, fn) {
  fn();
  checks++;
  console.log("PASS " + name);
}
function restored(s) {
  E.refreshRecon(s);
  assert(E.restore(E.snapshot(s)), "Save must restore");
}
test("new profile and all legacy operations restore independently", () => {
  assert.equal(E.make().campaign.id, "frontier-8");
  assert.equal(E.make().version, 10);
  for (const id of [
    "classic",
    ...Array.from({ length: 8 }, (_, i) => "frontier-" + (i + 1)),
  ])
    restored(E.make(id));
});
test("preview never charges; commit revalidates visibility and occupants", () => {
  const s = field(),
    p = findSite(s, "barracks"),
    before = s.economy.alloy;
  assert(p);
  for (let i = 0; i < 3; i++)
    assert(E.construction.check(s, "barracks", p).allowed);
  assert.equal(s.economy.alloy, before);
  Object.assign(E.hero(s), p);
  E.refreshRecon(s);
  assert.equal(E.purchase(s, "barracks", p).reason, "occupied");
  assert.equal(s.economy.alloy, before);
  assert.equal(E.purchase(s, "barracks").reason, "placement");
  assert.equal(
    E.construction.check(s, "barracks", { x: 3550, y: 70 }).allowed,
    false,
  );
});
test("unknown actions and ended operations cannot offer or charge construction", () => {
  const s = field(),
    before = E.snapshot(s);
  for (const action of ["unknown", "constructor", "__proto__"]) {
    assert.equal(E.construction.snap(action, 500, 2500), null);
    assert.equal(
      E.construction.check(s, action, { x: 500, y: 2500 }).allowed,
      false,
    );
    assert.equal(E.supplyStatus(s, action).reason, "unknown");
    assert.equal(E.purchase(s, action).reason, "unknown");
  }
  assert.deepEqual(E.snapshot(s), before);
  const o = E.purchase(s, "barracks", findSite(s, "barracks"));
  assert(o.allowed);
  s.status = "lost";
  const ended = E.snapshot(s);
  for (const action of ["assign-builder", "cancel-build", "barracks"]) {
    assert.equal(E.supplyStatus(s, action, o.buildingId).reason, "ended");
    assert.equal(E.purchase(s, action, o.buildingId).reason, "ended");
  }
  assert.deepEqual(E.snapshot(s), ended);
});
test("construction reserves full footprint and a real worker; save resumes travel and work", () => {
  let s = field();
  const p = findSite(s, "barracks"),
    before = s.economy.alloy,
    o = E.purchase(s, "barracks", p);
  assert(o.allowed);
  assert.equal(s.economy.alloy, before - 120);
  let u = s.units.find((u) => u.id === o.buildingId),
    worker = s.units.find((w) => w.id === u.construction.builderId);
  assert.equal(worker.work, "build");
  assert.equal(E.free(u.x, u.y, 8, E.navigation(s)), false);
  assert.equal(E.construction.check(s, "barracks", p).allowed, false);
  const cargo = worker.cargo;
  frames(s, 120);
  assert.equal(worker.cargo, cargo);
  restored(s);
  s = E.restore(s);
  u = s.units.find((u) => u.id === o.buildingId);
  finish(s, u);
  assert.equal(u.hp, E.C.barracks.hp);
  assert.equal(u.construction.builderId, null);
  restored(s);
});
test("lost builder pauses construction; explicit replacement and cancellation are single transactions", () => {
  const s = field(),
    o = E.purchase(s, "barracks", findSite(s, "barracks")),
    u = s.units.find((u) => u.id === o.buildingId),
    w = s.units.find((w) => w.id === u.construction.builderId);
  w.hp = 0;
  E.construction.onDeath(s, w);
  const remaining = u.build;
  frames(s, 90);
  assert.equal(u.build, remaining);
  restored(s);
  assert(E.purchase(s, "assign-builder", u.id).allowed);
  assert.notEqual(u.construction.builderId, w.id);
  restored(s);
  const before = s.economy.alloy;
  assert(E.purchase(s, "cancel-build", u.id).allowed);
  assert.equal(s.economy.alloy, before + 90);
  assert.equal(E.purchase(s, "cancel-build", u.id).allowed, false);
  assert.equal(E.free(u.x, u.y, 8, E.navigation(s)), true);
  restored(s);
});
test("independent producer queues choose shortest remaining time and deterministic ties", () => {
  const s = field();
  fund(s, 1400);
  const a = build(s, "barracks"),
    b = build(s, "barracks");
  const ids = [a.id, b.id].join(",");
  assert.equal(E.supplyStatus(s, "rifle", ids).producer.id, a.id);
  assert(E.purchase(s, "rifle", ids).allowed);
  assert.equal(a.jobs.length, 1);
  assert.equal(E.supplyStatus(s, "rifle", ids).producer.id, b.id);
  assert(E.purchase(s, "rifle", ids).allowed);
  assert.equal(b.jobs.length, 1);
  const remaining = a.jobs[0].remaining;
  frames(s, 30);
  assert(a.jobs[0].remaining < remaining);
  assert(b.jobs[0].remaining < remaining);
  assert(E.setRally(s, a.id, 300, 2200));
  assert(E.setRally(s, b.id, 650, 2500));
  assert.notDeepEqual(a.rally, b.rally);
  restored(s);
  frames(s, 1500);
  assert(
    s.units.filter((u) => u.kind === "rifle" && !u.team && u.hp > 0).length >=
      5,
  );
  for (const r of s.units.filter((u) => u.kind === "rifle" && u.hp > 0))
    assert(E.free(r.x, r.y, E.C.rifle.r, E.navigation(s)));
  restored(s);
});
test("rectangular rotation, global research and damaged-building saves remain coherent", () => {
  const s = field();
  fund(s, 1900);
  s.campaign.tier = 2;
  const a = build(s, "arsenal", E.hero(s), 1),
    b = build(s, "arsenal", E.hero(s), 0);
  assert.deepEqual(
    [E.construction.rect(a).w, E.construction.rect(a).h],
    [80, 120],
  );
  assert.deepEqual(
    [E.construction.rect(b).w, E.construction.rect(b).h],
    [120, 80],
  );
  const before = s.economy.alloy;
  assert(E.purchase(s, "weapons", a.id).allowed);
  assert.equal(E.supplyStatus(s, "weapons", b.id).reason, "researching");
  assert.equal(E.purchase(s, "weapons", b.id).allowed, false);
  assert.equal(s.economy.alloy, before - E.development.items(s).weapons.cost);
  frames(s, Math.ceil(E.development.items(s).weapons.time * 60) + 1);
  assert(s.campaign.weapons);
  a.hp = 0;
  E.construction.onDeath(s, a);
  assert.equal(E.supplyStatus(s, "weapons", b.id).reason, "installed");
  b.angle = 1.7;
  b.hp -= 10;
  restored(s);
});
test("save validator rejects forged footprint, duplicate builder, invalid work point and tier", () => {
  const s = field(),
    o = E.purchase(s, "barracks", findSite(s, "barracks"));
  restored(s);
  for (const change of [
    (u) => (u.x += 1),
    (u) => (u.construction.turn = 4),
    (u) => (u.construction.paid = 1),
    (u) => (u.construction.work.x += 30),
    (u) => (u.construction.builderId = 999),
  ]) {
    const copy = E.snapshot(s);
    change(copy.units.find((u) => u.id === o.buildingId));
    assert.equal(E.restore(copy), null);
  }
});
test("all three heights support legal sites; bridges, slopes and unseen land do not", () => {
  const s = field();
  fund(s, 1000);
  for (const [x, y, level] of [
    [500, 3400, 0],
    [500, 2500, 1],
    [3000, 1850, 2],
  ]) {
    Object.assign(E.hero(s), { x, y });
    E.refreshRecon(s);
    const p = findSite(s, "barracks", { x, y });
    assert(p);
    assert.equal(E.terrain.level(p.x, p.y), level);
  }
  for (const p of [
    { x: 860, y: 1660 },
    { x: 2300, y: 500 },
    { x: 80, y: 2640 },
  ]) {
    Object.assign(E.hero(s), p);
    E.refreshRecon(s);
    assert.equal(E.construction.check(s, "barracks", p).allowed, false);
  }
  Object.assign(E.hero(s), { x: 500, y: 2500 });
  E.refreshRecon(s);
  const p = findSite(s, "barracks");
  for (const u of s.units.filter((u) => !u.team))
    Object.assign(u, { x: 3000, y: 1850 });
  E.refreshRecon(s);
  assert(
    ["no-vision", "unexplored"].includes(
      E.construction.check(s, "barracks", p).reason,
    ),
  );
});
test("construction cannot cover an existing exit or a mining objective", () => {
  const s = field();
  fund(s, 1000);
  const b = build(s, "barracks"),
    exit = E.construction.exit(b);
  assert.equal(
    E.construction.check(s, "barracks", { x: exit.x, y: exit.y + 100 }).allowed,
    false,
  );
  const m = s.campaign.mines[0];
  assert.equal(E.construction.check(s, "barracks", m).allowed, false);
  assert.equal(
    E.construction.check(s, "outpost", findSite(s, "barracks")).allowed,
    false,
  );
});
test("wide buildings can be reached and damaged by melee attackers at their footprint", () => {
  const s = field();
  fund(s, 1000);
  s.campaign.tier = 2;
  const b = build(s, "foundry"),
    box = E.construction.rect(b),
    enemy = s.units.find((u) => u.kind === "runner");
  Object.assign(enemy, {
    hp: E.C.runner.hp,
    // Approach from the side away from the base, so this exercises the foundry.
    x: b.x,
    y: b.y - 220,
    cool: 0,
    wind: 0,
    path: [],
    target: null,
  });
  enemy.ai.raid = true;
  enemy.ai.goal = { x: b.x, y: b.y };
  enemy.ai.home = { x: enemy.x, y: enemy.y };
  for (const u of s.units.filter((u) => !u.team && E.C[u.kind].speed))
    Object.assign(u, { x: 500, y: 3400, path: [] });
  E.refreshRecon(s);
  const path = E.firingPath(enemy, b);
  assert(path.length);
  assert(E.rangeDistance(path.at(-1), b) < E.stats(s, enemy, b).range);
  const before = b.hp;
  frames(s, 600);
  assert(b.hp < before, JSON.stringify({ enemy, b }));
  assert(
    E.insideArea({ kind: "circle", x: box.x - 30, y: b.y, radius: 40 }, b),
  );
});

test("an exhausted home can train a paid builder and restart mining without free resources", () => {
  const legacy = E.make("frontier-7");
  fund(legacy, 1440);
  assert.equal(
    E.supplyStatus(legacy, "drone", E.living(legacy, "base").id).reason,
    "exhausted",
  );
  const s = field();
  fund(s, 1440);
  for (const u of s.units) if (u.kind === "drone") u.hp = 0;
  E.refreshRecon(s);
  const base = E.living(s, "base");
  const before = s.economy.alloy;
  const deposited = s.campaign.deposited;
  assert.equal(s.campaign.mines.find((m) => m.id === "home").remaining, 0);
  assert.equal(E.supplyStatus(s, "drone", base.id).allowed, true);
  assert.equal(E.purchase(s, "drone", base.id).allowed, true);
  assert.equal(s.economy.alloy, before - 50);
  assert.equal(base.jobs[0].duration, 18);
  restored(s);
  frames(s, 19 * 60);
  const worker = s.units.find((u) => u.kind === "drone" && u.hp > 0);
  assert(worker);
  assert.equal(s.economy.alloy, before - 50);
  assert.equal(s.campaign.deposited, deposited);
  const post = build(
    s,
    "outpost",
    s.campaign.mines.find((m) => m.id === "west"),
  );
  assert.equal(s.economy.spent, 210);
  const balanceAfterPayment = before - 210;
  for (let i = 0; i < 120 * 60 && s.economy.alloy <= balanceAfterPayment; i++)
    E.step(s);
  assert.equal(worker.node, post.id);
  assert(s.economy.alloy > balanceAfterPayment);
  assert(s.campaign.deposited > deposited);
  assert.equal(s.campaign.mines.find((m) => m.id === "home").remaining, 0);
  restored(s);
});

test("the control pilot spends the recovery budget on one builder and its first mining node", () => {
  const s = field();
  fund(s, 1440);
  // Fixture models earlier paid losses while preserving the resource ledger.
  s.economy.spent += s.economy.alloy - 233;
  s.economy.alloy = 233;
  for (const u of s.units) if (u.kind === "drone") u.hp = 0;
  E.refreshRecon(s);
  restored(s);
  const {
    ExpeditionPilot,
  } = require("./helpers/signal-frontier-expedition-pilot.cjs");
  const pilot = new ExpeditionPilot("siege", 22);
  pilot.stage = 4;
  pilot.rushCleared = true;
  const order = pilot
    .decide(s)
    .commands.find((c) => c.kind === "purchase" && c.action === "drone");
  assert(order, "Controller must buy the paid replacement worker first");
  assert(E.purchase(s, order.action, order.site).allowed);
  assert.equal(s.economy.alloy, 183);
  frames(s, 19 * 60);
  const node = pilot
    .decide(s)
    .commands.find((c) => c.kind === "purchase" && c.action === "outpost");
  assert(
    node,
    "An existing builder can staff the recovered node without reserving a second worker",
  );
  assert(E.purchase(s, node.action, node.site).allowed);
  assert.equal(s.economy.alloy, 23);
  assert.equal(s.campaign.deposited, 1440);
  restored(s);
});

test("the control pilot reserves command research before replacements and can spend that reserve", () => {
  const s = field();
  fund(s, 2500);
  s.campaign.tier = 2;
  build(s, "barracks", E.hero(s));
  build(s, "outpost", s.campaign.mines.find(m => m.id === "west"));
  const north = s.campaign.mines.find(m => m.id === "north");
  Object.assign(E.hero(s), { x: north.x, y: north.y });
  E.refreshRecon(s);
  build(s, "outpost", north);
  // Model the completed defences and earlier paid losses, with an exact ledger.
  for (const u of s.units) if (u.hp > 0 && ["base", "outpost"].includes(u.kind)) u.defense = true;
  const mining = E.snapshot(s);
  fund(s, s.campaign.mines.reduce((n, m) => n + m.remaining, 0) - 1);
  const wanted = E.development.items(s).command.cost + E.development.items(s).drone.cost;
  s.economy.spent += s.economy.alloy - (wanted - 1);
  s.economy.alloy = wanted - 1;
  restored(s);
  const { ExpeditionPilot } = require("./helpers/signal-frontier-expedition-pilot.cjs"),
    pilot = Object.assign(new ExpeditionPilot("siege", 22), { stage: 4, rushCleared: true });
  const before = E.snapshot(s);
  assert(!pilot.decide(s).commands.some(c => c.kind === "purchase"), "Do not spend the research fund on replacements");
  assert.deepEqual(E.snapshot(s), before);
  fund(s, 1);
  const command = pilot.decide(s).commands.find(c => c.kind === "purchase" && c.action === "command");
  assert(command, "Do not require the research price twice");
  assert(E.purchase(s, command.action, command.site).allowed);
  assert.equal(s.economy.alloy, E.development.items(s).drone.cost);
  restored(s);
  // Income staffing must remain possible while replacements wait for research.
  for (const mine of mining.campaign.mines) if (mine.id !== "north") {
    mining.campaign.deposited += mine.remaining;
    mining.economy.alloy += mine.remaining;
    mine.remaining = 0;
  }
  mining.economy.spent += mining.economy.alloy - (wanted - 1);
  mining.economy.alloy = wanted - 1;
  const worker = mining.units.find(u => u.kind === "drone" && u.hp > 0);
  assert(E.support.assignResource(mining, [worker.id], "north"));
  const staffed = mining.units.find(u => u.kind === "outpost" && u.site === "north");
  assert(E.development.usedSlots(mining, staffed) > 0);
  restored(mining);
  const miner = Object.assign(new ExpeditionPilot("siege", 22), { stage: 4, rushCleared: true })
    .decide(mining).commands.find(c => c.kind === "purchase" && c.action === "drone");
  assert(miner, "Research must not leave a working mine permanently understaffed");
  assert(E.purchase(mining, miner.action, miner.site).allowed);
});

test("the control pilot routes serialized snapshots around buildings and replans after cancellation", () => {
  const s = field();
  fund(s, 400);
  const placed = E.purchase(s, "barracks", { x: 540, y: 2180, turn: 0 });
  assert(placed.allowed);
  Object.assign(E.hero(s), { x: 360, y: 2245 });
  E.refreshRecon(s);
  restored(s);
  const {
    ExpeditionPilot,
  } = require("./helpers/signal-frontier-expedition-pilot.cjs");
  const pilot = new ExpeditionPilot("siege", 22);
  const snapshot = E.snapshot(s),
    before = JSON.stringify(snapshot);
  pilot.decide(snapshot);
  assert(
    pilot.path.length > 1,
    "A direct segment would pass through the building",
  );
  let from = E.hero(snapshot);
  for (const to of pilot.path) {
    assert(
      E.travelClear(from, to, E.C.hero.r, E.navigation(snapshot)),
      "Every planned segment must clear the actual footprint",
    );
    from = to;
  }
  assert.equal(JSON.stringify(snapshot), before);
  const goal = pilot.goal;
  assert(E.purchase(s, "cancel-build", placed.buildingId).allowed);
  const withoutBuilding = E.snapshot(s);
  pilot.decide(withoutBuilding);
  assert.equal(pilot.goal, goal);
  assert.equal(
    pilot.path.length,
    1,
    "Removing the obstacle must refresh a route to the same destination",
  );
  assert(
    E.travelClear(
      E.hero(withoutBuilding),
      pilot.path[0],
      E.C.hero.r,
      E.navigation(withoutBuilding),
    ),
  );
});

console.log(`PASS ${checks} construction checks`);
