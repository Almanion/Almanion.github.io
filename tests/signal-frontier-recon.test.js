"use strict";
const assert = require("node:assert/strict"),
  E = require("../game-source/signal-frontier/src/engine"),
  D = E.development;
let checks = 0;
function test(name, fn) {
  fn();
  checks++;
  console.log("PASS " + name);
}
const copy = (x) => JSON.parse(JSON.stringify(x));
function quiet() {
  const s = E.make("frontier-6");
  for (const c of s.campaign.camps) c.reserve = 0;
  return s;
}
function home(s) {
  Object.assign(E.hero(s), { x: 180, y: 1610 });
  E.refreshRecon(s);
}
function visit(s, p) {
  Object.assign(E.hero(s), p);
  E.refreshRecon(s);
}
const remembered = (s, id) =>
  s.recon.memory[0].find((p) => p.key === "u:" + id);
function fund(s, n = 1000) {
  for (const m of s.campaign.mines) {
    const a = Math.min(n, m.remaining);
    m.remaining -= a;
    s.campaign.deposited += a;
    s.economy.alloy += a;
    n -= a;
  }
  assert.equal(n, 0);
}
function frames(s, n) {
  for (let i = 0; i < n; i++) E.step(s);
}

test("vision geometry matches the combat cover polygon while skipping unreachable walls", () => {
  const s = E.make("frontier-6");
  for (const p of [
    { x: 180, y: 1610 },
    { x: 900, y: 1850 },
    { x: 1050, y: 300 },
    { x: 1740, y: 330 },
    { x: 30, y: 30 },
    { x: 2110, y: 2490 },
  ])
    for (const radius of [120, 380, 600, 780])
      assert.deepEqual(
        E.visionArea(s, p, radius).points,
        E.impactArea(s, p, radius).points,
      );
});
test("released recon operations retain fog, prices, mining and maps", () => {
  const s = E.make("frontier-6"),
    old = E.make("frontier-5");
  assert.equal(s.version, 8);
  assert(E.fogged(s));
  assert.equal(s.campaign.id, "frontier-6");
  assert.deepEqual(E.map(s), E.map(old));
  assert.deepEqual(s.campaign.mines, old.campaign.mines);
  assert.deepEqual(s.units, old.units);
  for (const [a, item] of Object.entries(D.items(old)))
    assert.deepEqual(D.items(s)[a], item);
  assert.deepEqual(D.items(s).scout, {
    cost: 50,
    time: 18,
    pop: 1,
    label: "Дозорный",
  });
  for (const id of [
    "classic",
    "frontier-1",
    "frontier-2",
    "frontier-3",
    "frontier-4",
    "frontier-5",
  ]) {
    const v = E.make(id);
    assert(!E.fogged(v));
    assert.equal(v.recon, undefined);
    assert.deepEqual(E.restore(E.snapshot(v)), v);
    assert.equal(E.observe(v), v);
  }
});
test("unexplored terrain contains no known enemy, objective or remotely selectable target", () => {
  const s = quiet(),
    p = E.observe(s),
    b = E.living(s, "bastion"),
    before = E.snapshot(s);
  assert(!E.visible(s, 0, b));
  assert(!E.explored(s, 0, b));
  assert(!p.units.some((u) => u.id === b.id));
  assert(p.terminal.unknown);
  assert(!p.fog.memory.units.some((u) => u.id === b.id));
  assert.equal(E.attackUnits(s, [3], b.id), false);
  assert.deepEqual(E.snapshot(s), before);
  assert.deepEqual(
    E.pads(s).map((p) => p.id),
    ["west"],
  );
  assert.equal(E.supplyStatus(s, "outpost", "north").reason, "unexplored");
  assert.equal(E.orderUnits(s, [3], 1050, 300), true);
  assert(E.hero(s).hp > 0);
});
test("walls block both faction vision and memory at close range", () => {
  const s = quiet(),
    h = E.hero(s),
    u = E.living(s, "sentinel");
  visit(s, { x: 550, y: 1030 });
  Object.assign(u, { x: 750, y: 1030 });
  E.refreshRecon(s);
  assert(E.dist(h, u) < 600);
  assert(!E.clear(h, u));
  assert(!E.visible(s, 0, u));
  assert(!E.visible(s, 1, h));
  assert(!E.observe(s).units.some((v) => v.id === u.id));
});
test("gray building memory survives hidden damage, repair, replacement and demolition until scouting", () => {
  const s = quiet(),
    b = E.living(s, "bastion");
  visit(s, { x: 1740, y: 330 });
  assert(E.visible(s, 0, b));
  const known = copy(remembered(s, b.id));
  assert(known);
  home(s);
  assert(!E.visible(s, 0, b));
  for (const hp of [20, b.hp, 0]) {
    b.hp = hp;
    E.refreshRecon(s);
    assert.deepEqual(remembered(s, b.id), known);
    assert(!E.observe(s).units.some((u) => u.id === b.id));
  }
  b.hp = E.C.bastion.hp;
  b.kind = "citadel";
  E.refreshRecon(s);
  assert.deepEqual(remembered(s, b.id), known);
  b.kind = "bastion";
  b.hp = 0;
  E.refreshRecon(s);
  assert(E.restore(s));
  visit(s, { x: 1740, y: 330 });
  assert.equal(remembered(s, b.id).hp, 0);
  assert.notDeepEqual(remembered(s, b.id), known);
});
test("exploration persists while mobile enemies disappear instead of leaving live silhouettes", () => {
  const s = quiet(),
    u = E.living(s, "sentinel");
  visit(s, { x: 850, y: 1250 });
  assert(E.visible(s, 0, u));
  assert(E.observe(s).units.some((v) => v.id === u.id));
  const at = { x: u.x, y: u.y };
  home(s);
  Object.assign(u, { x: 1850, y: 1850 });
  E.refreshRecon(s);
  assert(E.explored(s, 0, at));
  assert(!E.observe(s).units.some((v) => v.id === u.id));
  assert(!s.recon.memory[0].some((v) => v.id === u.id && v.type === "unit"));
});
test("observer death removes current sight immediately, but never erases exploration", () => {
  const s = quiet();
  visit(s, { x: 1700, y: 330 });
  const p = { x: 1770, y: 330 };
  assert(E.visible(s, 0, p));
  E.hero(s).hp = 0;
  assert(!E.visible(s, 0, p));
  E.refreshRecon(s);
  assert(!E.visible(s, 0, p));
  assert(E.explored(s, 0, p));
});
test("observation points require a nearby military unit and cannot be held by mining drones", () => {
  const s = quiet(),
    p = { x: 1050, y: 300 };
  visit(s, p);
  let post = E.observe(s).watch.find((v) => v.id === "north");
  assert.equal(post.side, 0);
  assert(E.observe(s).fog.observers.some((v) => v.id === "post-north"));
  visit(s, { x: 1050, y: 390 });
  assert(!E.observe(s).fog.observers.some((v) => v.id === "post-north"));
  const drone = E.living(s, "drone");
  Object.assign(drone, p);
  home(s);
  assert(!E.observe(s).fog.observers.some((v) => v.id === "post-north"));
  const foe = E.living(s, "runner");
  Object.assign(foe, p);
  E.refreshRecon(s);
  assert(E.observe(s, 1).fog.observers.some((v) => v.id === "post-north"));
});
test("map edges and unfinished own buildings obey bounded visibility", () => {
  const s = quiet();
  visit(s, { x: 30, y: 30 });
  for (const p of [
    { x: -1, y: 0 },
    { x: 2240, y: 10 },
    { x: 10, y: 2560 },
  ])
    assert(!E.visible(s, 0, p));
  assert(E.visible(s, 0, { x: 30, y: 30 }));
  home(s);
  assert(E.purchase(s, "barracks").allowed);
  assert(E.restore(s));
  const b = E.living(s, "barracks");
  assert(
    E.observe(s).fog.observers.some((v) => v.id === b.id && v.radius === 120),
  );
  b.build = 0;
  E.refreshRecon(s);
  assert(
    E.observe(s).fog.observers.some((v) => v.id === b.id && v.radius === 280),
  );
});
test("hidden enemy effects and spatial sound events disappear; own remote orders remain nonspatial", () => {
  const s = quiet(),
    p = E.living(s, "bastion");
  s.events = [
    ...["shot", "blast", "hit", "destroy", "raid", "reinforce", "charge"].map(
      (type) => ({ type, x: p.x, y: p.y, team: 1 }),
    ),
    { type: "order", x: p.x, y: p.y },
    { type: "shot", x: E.hero(s).x, y: E.hero(s).y, team: 0 },
  ];
  const known = E.knownEvents(s);
  assert.deepEqual(
    known.map((e) => e.type),
    ["order", "shot"],
  );
  assert.equal(known[0].radio, true);
  assert(!known[1].radio);
  assert.deepEqual(E.observe(s).events, known);
});
test("gray relay remembers its observed progress after remote mission phases change", () => {
  const s = quiet();
  s.phase = s.checkpoint = 2;
  s.relay.charge = 1;
  s.relay.stability = 0.4;
  visit(s, { x: 1320, y: 1420 });
  assert(E.visible(s, 0, s.relay));
  home(s);
  s.phase = s.checkpoint = 3;
  s.relay.online = true;
  s.relay.stability = 1;
  E.refreshRecon(s);
  assert(E.observe(s).relay.unknown);
  assert.equal(E.observe(s).fog.memory.relay.progress, 0.4);
});
test("visible citadel keeps its actual shield state when the remote relay is outside sight", () => {
  const s = quiet();
  s.phase = s.checkpoint = 3;
  s.relay.online = true;
  s.relay.charge = s.relay.stability = 1;
  visit(s, { x: 1980, y: 1450 });
  const p = E.observe(s);
  assert(p.relay.unknown);
  assert(E.visible(s, 0, E.living(s, "citadel")));
  assert.equal(p.units.find((u) => u.kind === "citadel").shielded, false);
  assert.equal(
    s.recon.memory[0].find((u) => u.kind === "citadel").shielded,
    false,
  );
});
test("a missile drops guidance when its faction loses sight, and never reacquires", () => {
  const s = quiet(),
    h = E.hero(s),
    r = E.living(s, "rocket");
  for (const u of s.units) if (u.team && u !== r) u.hp = 0;
  Object.assign(r, { x: 900, y: 1850, path: [], cool: 0, wind: 0, think: 0 });
  Object.assign(r.ai, {
    home: { x: 900, y: 1850 },
    raid: false,
    seen: null,
    seenAt: 0,
  });
  visit(s, { x: 1200, y: 1850 });
  s.bullets.push({
    kind: "missile",
    x: 930,
    y: 1850,
    map: "expedition",
    vx: 260,
    vy: 0,
    life: 3,
    age: 0,
    team: 1,
    owner: r.id,
    damage: 32,
    tx: h.x,
    ty: h.y,
    lockId: h.id,
    guided: true,
  });
  const b = s.bullets[0];
  assert(E.visible(s, 1, h));
  r.hp = 0;
  E.refreshRecon(s);
  E.step(s);
  assert.equal(b.guided, false);
  assert.equal(b.tx, 1200);
  r.hp = E.C.rocket.hp;
  E.refreshRecon(s);
  E.step(s);
  assert.equal(b.guided, false);
  assert(E.restore(s));
});
test("lost attack targets keep their last known point and cannot update through fog", () => {
  const s = quiet(),
    r = E.living(s, "rifle"),
    foe = E.living(s, "sentinel");
  Object.assign(r, { x: 900, y: 1850 });
  Object.assign(foe, { x: 1200, y: 1850 });
  E.refreshRecon(s);
  assert(E.attackUnits(s, [r.id], foe.id));
  const known = copy(r.target);
  Object.assign(foe, { x: 1900, y: 1850 });
  E.refreshRecon(s);
  E.step(s);
  assert(r.target === null || r.target.x === known.x);
  assert(!s.bullets.some((b) => b.team === 0 && b.lockId === foe.id));
});
test("both factions maintain independent knowledge and hidden simulation continues", () => {
  const s = quiet(),
    p = E.living(s, "bastion");
  assert(!E.explored(s, 0, p));
  assert(E.explored(s, 1, p));
  const t = s.t;
  frames(s, 60);
  assert(s.t > t);
  assert(s.units.some((u) => u.team && u.path.length));
  assert(!E.observe(s).units.some((u) => u.id === p.id));
  assert(E.restore(s));
});
test("scout uses existing population, queue, refunds, rallies and group commands without firing", () => {
  const s = quiet();
  fund(s);
  assert(E.purchase(s, "barracks").allowed);
  frames(s, 1810);
  const b = E.living(s, "barracks");
  assert(b && !b.build);
  assert(E.setRally(s, b.id, 420, 1700));
  const n = D.population(s),
    money = s.economy.alloy;
  assert(E.purchase(s, "scout").allowed);
  assert.equal(D.population(s), n + 1);
  assert.equal(s.economy.alloy, money - 50);
  assert(E.restore(s));
  const job = b.jobs[0];
  assert.equal(job.duration, 18);
  assert(E.purchase(s, "cancel", b.id + ":" + job.id).allowed);
  assert.equal(s.economy.alloy, money - 13);
  assert(E.purchase(s, "scout").allowed);
  frames(s, 1085);
  const u = E.living(s, "scout");
  assert(u);
  assert.equal(u.group, 1);
  assert.equal(E.C.scout.damage, 0);
  assert(
    E.observe(s).fog.observers.some((v) => v.id === u.id && v.radius === 720),
  );
  const at = { x: u.x, y: u.y };
  assert(E.orderUnits(s, [u.id], 450, 1850));
  frames(s, 60);
  assert(E.dist(u, at) > 5);
  assert(!s.events.some((e) => e.type === "shot" && e.id === u.id));
  assert(E.restore(s));
});
test("whole saves carry compact masks and remembered world objects across devices without canvas data", () => {
  const s = quiet();
  visit(s, { x: 1740, y: 330 });
  home(s);
  const payload = JSON.stringify(E.snapshot(s)),
    restored = E.restore(JSON.parse(payload));
  assert(restored);
  assert.deepEqual(restored.recon, s.recon);
  assert(payload.length < 100000);
  assert(!/data:image|canvas|ImageData/.test(payload));
  const before = E.snapshot(s);
  for (let i = 0; i < 5; i++) {
    E.observe(s);
    E.visible(s, 0, E.hero(s));
    E.knownEvents(s);
  }
  assert.deepEqual(E.snapshot(s), before);
  E.step(s);
  E.step(restored);
  assert.deepEqual(E.snapshot(restored), E.snapshot(s));
});
test("corrupt, mixed-profile, oversized, impossible or duplicate recon saves are rejected", () => {
  const s = quiet();
  for (const corrupt of [
    (p) => delete p.recon,
    (p) => (p.fog = {}),
    (p) => (p.recon.cell = 20),
    (p) => (p.recon.visible[0] = "z".repeat(896)),
    (p) => (p.recon.explored[0] = "0".repeat(896)),
    (p) => (p.recon.sources[0] = ""),
    (p) => p.recon.memory[0].push(copy(p.recon.memory[0][0])),
    (p) => (p.recon.memory[0][0].hp = -1),
    (p) => (p.recon.memory[0][0].seenAt = 2),
    (p) => (p.recon.memory[0][0].x = 9000),
    (p) => {
      p.campaign.id = "frontier-5";
      p.version = 7;
    },
  ]) {
    const v = copy(s);
    corrupt(v);
    assert.equal(E.restore(v), null);
  }
  const legacy = E.make("classic");
  legacy.recon = copy(s.recon);
  assert.equal(E.restore(legacy), null);
});
console.log(checks + " recon checks passed.");
