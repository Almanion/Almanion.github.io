"use strict";
const assert = require("node:assert/strict"),
  E = require("../game-source/signal-frontier/src/engine"),
  T = E.terrain;
let checks = 0;
function test(name, fn) {
  fn();
  checks++;
  console.log("PASS " + name);
}
const p = (x, y) => ({ x, y, map: "highlands" });
test("new operation has three heights and seven connected districts; old profiles remain flat", () => {
  const s = E.make();
  assert.equal(s.version, 9);
  assert.equal(s.campaign.id, "frontier-7");
  assert.equal(E.map(s).W, 3600);
  assert.equal(E.map(s).H, 3840);
  assert.equal(T.map.regions.length, 7);
  assert.deepEqual(
    [T.level(500, 3400), T.level(500, 2500), T.level(3100, 1900)],
    [0, 1, 2],
  );
  for (let n = 1; n <= 6; n++) {
    const old = E.make("frontier-" + n);
    assert(E.restore(old));
    assert.notEqual(E.map(old).id, "highlands");
    assert.equal(E.elevation(3100, 1900, E.map(old)), 0);
  }
});
test("every required objective, resource and production pad is reachable by the largest chassis", () => {
  const s = E.make(),
    h = E.hero(s),
    goals = [
      ...s.units.filter((u) =>
        ["bastion", "citadel", "jammer", "turret"].includes(u.kind),
      ),
      s.relay,
      s.terminal,
      ...E.development.pads(s),
      ...s.campaign.mines,
      ...s.caches,
      ...Object.values(E.development.buildings(s)),
    ];
  for (const g of goals) {
    assert(E.free(g.x, g.y, 24, "highlands"), JSON.stringify(g));
    const route = E.pathTo(h, g, 24);
    assert(route.length);
    assert(
      Math.hypot(route.at(-1).x - g.x, route.at(-1).y - g.y) < 1,
      JSON.stringify(g),
    );
    let a = h;
    for (const b of route) {
      assert(E.travelClear(a, b, 24, "highlands"), JSON.stringify({ a, b }));
      a = b;
    }
  }
});
test("cliffs reject a direct order and dash; routes use continuous ramps and a single bridge floor", () => {
  const a = p(2440, 2140),
    b = p(2760, 2140);
  assert(E.free(a.x, a.y, 14, a.map));
  assert(E.free(b.x, b.y, 14, b.map));
  assert(!E.travelClear(a, b, 14, a.map));
  const route = E.pathTo(a, b, 14);
  assert(route.length > 1);
  assert.deepEqual(route.at(-1), { x: b.x, y: b.y });
  const s = E.make();
  Object.assign(E.hero(s), a);
  E.refreshRecon(s);
  for (let i = 0; i < 15; i++) E.step(s, { x: 1, dash: true });
  assert(E.hero(s).x < 2520);
  assert.equal(T.level(2160, 2860), 1);
  assert.equal(T.level(1900, 2860), -1);
});
test("narrow bridge admits infantry, excludes heavy vehicles, which retain a main-road alternative", () => {
  const a = p(1300, 1500),
    b = p(1300, 1840);
  assert(E.travelClear(a, b, 12, a.map));
  assert(!E.travelClear(a, b, 24, a.map));
  const route = E.pathTo(p(1360, 1400), p(1200, 1880), 24);
  assert(route.length);
  assert(Math.hypot(route.at(-1).x - 1200, route.at(-1).y - 1880) < 1);
});
test("higher ledges block sight from below and direct fire; artillery clears them on its own arc", () => {
  const a = p(2440, 2140),
    b = p(2760, 2140);
  assert(!E.clear(a, b));
  assert(E.clear(b, a));
  assert(!E.fireClear({ ...a, kind: "rifle" }, b));
  assert(E.fireClear({ ...a, kind: "artillery" }, b));
  const s = E.make();
  for (const u of s.units) if (!u.team && u.kind !== "hero") u.hp = 0;
  Object.assign(E.hero(s), a);
  E.refreshRecon(s);
  assert(!E.visible(s, 0, b));
  Object.assign(E.hero(s), p(2760, 2180));
  E.refreshRecon(s);
  assert(E.visible(s, 0, b));
});
test("economy, valid saves, cloud payloads and height-aware projectile data round trip", () => {
  const s = E.make(),
    old = E.make("frontier-6");
  assert.deepEqual(E.development.items(s), E.development.items(old));
  assert.deepEqual(
    s.campaign.mines.map((m) => m.stock),
    old.campaign.mines.map((m) => m.stock),
  );
  for (let i = 0; i < 600; i++)
    E.step(s, { aim: { x: 900, y: 2400 }, fire: i < 15 });
  assert(E.restore(s));
  const bad = E.snapshot(s);
  bad.campaign.id = "frontier-6";
  assert.equal(E.restore(bad), null);
  const b = { kind: "shell", z0: 96, z1: 154, duration: 2, age: 1 };
  assert.equal(E.projectileHeight(b), 235);
  assert.equal(E.projectileHeight(b, 2), 154);
});

for (const kind of ["flamer", "bomber", "mortar"]) {
  const s = E.make(),
    u = s.units.find((u) => u.kind === kind);
  Object.assign(u.combat, {
    mode: kind === "flamer" ? "flame" : "aim",
    time: 0.5,
    total: 1,
  });
  u.target = { x: u.x + 60, y: u.y };
  assert(E.dangerArea(s, u));
}

test("a heavy ally follows complete ramp routes without sticking, falling or cutting a cliff", () => {
  const s = E.make();
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((c) => (c.reserve = 0));
  const u = s.units.find((u) => u.kind === "rifle");
  u.kind = "artillery";
  u.hp = E.C.artillery.hp;
  u.group = 2;
  for (const target of [
    p(2860, 720),
    p(940, 3440),
    p(2700, 3400),
    p(3100, 2400),
  ]) {
    assert(E.orderUnits(s, [u.id], target.x, target.y));
    for (let i = 0; i < 12000 && u.path.length; i++) {
      E.step(s);
      assert(E.free(u.x, u.y, 20, u.map));
    }
    assert(E.dist(u, target) < 1, JSON.stringify({ target, u }));
  }
});

test("terrain pilot returns to an unfinished economy node before waiting for research", () => {
  const {
      ExpeditionPilot,
    } = require("./helpers/signal-frontier-expedition-pilot.cjs"),
    s = E.make(),
    h = E.hero(s),
    pilot = new ExpeditionPilot("siege", 22);
  Object.assign(h, { x: 795, y: 2320 });
  E.refreshRecon(s);
  assert(E.purchase(s, "outpost", "west").allowed);
  const node = s.units.find((u) => u.kind === "outpost" && u.site === "west");
  Object.assign(h, { x: 2130, y: 1410 });
  E.refreshRecon(s);
  assert(E.restore(s));
  pilot.stage = 4;
  const before = JSON.stringify(s),
    decision = pilot.decide(s);
  assert.equal(JSON.stringify(s), before);
  assert(pilot.path.length && E.dist(pilot.path.at(-1), node) < 210);
  assert(decision.input.x || decision.input.y);
  Object.assign(h, pilot.path.at(-1));
  for (let i = 0; i < 180; i++) E.step(s);
  assert(node.build > 0 && node.build < 44);
  pilot.decide(s);
  assert(
    E.dist(h, {
      x: Number(pilot.goal.split(",")[0]),
      y: Number(pilot.goal.split(",")[1]),
    }) < 210,
  );
});

console.log(checks + " terrain checks passed");
