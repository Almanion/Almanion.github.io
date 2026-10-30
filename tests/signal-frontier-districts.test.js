"use strict";
const assert = require("node:assert/strict"),
  E = require("../game-source/signal-frontier/src/engine"),
  M = require("../game-source/signal-frontier/src/districts"),
  { findSite } = require("./helpers/signal-frontier-construction.cjs");
let checks = 0;
function test(name, fn) {
  fn();
  console.log("PASS " + name);
  checks++;
}
test("new layout has all planned districts, garrisons and finite resources", () => {
  const s = E.make("frontier-9"),
    m = E.map(s);
  assert.equal(m.id, "districts");
  assert.equal(s.version, 11);
  assert.equal(m.regions.length, 13);
  assert.equal(m.links.length, 11);
  assert.equal(s.units.filter((u) => u.team && E.C[u.kind].speed).length, 78);
  assert.deepEqual(["S08", "S11", "S09"].map((id) => M.guards.filter((u) => u.sector === id).length), [16, 16, 20]);
  assert.equal(s.units.filter((u) => u.kind === "turret").length, 8);
  assert.equal(s.campaign.mines.length, 8);
  assert.equal(
    s.campaign.mines.reduce((n, m) => n + m.remaining, 0),
    16560,
  );
  assert.equal(s.caches.length, 6);
  assert.deepEqual(
    s.campaign.camps.map((c) => c.reserve),
    [60, 60, 72],
  );
  assert.equal(s.economy.alloy, 180);
  assert(E.restore(s));
  assert.deepEqual(
    E.development.items(s),
    { ...E.development.items(E.make("frontier-8")),
      artillery: { ...E.development.items(E.make("frontier-8")).artillery, pop: 4 },
      logistics: { cost: 90, time: 24, pop: 0, label: "Узел снабжения" } },
  );
});
test("all actors and objectives occupy real walkable ground", () => {
  const s = E.make("frontier-9");
  for (const u of s.units)
    assert(E.free(u.x, u.y, E.C[u.kind].r, u.map), u.kind + " " + u.id);
  for (const p of [
    ...s.campaign.mines,
    ...s.caches,
    ...E.terminalSites(s),
    s.relay,
  ])
    assert(E.free(p.x, p.y, 14, "districts"));
  for (const b of E.map(s).walls)
    for (const [x, y] of [
      [b.x, b.y],
      [b.x + b.w - 1, b.y + b.h - 1],
    ])
      assert(E.terrain.level(x, y) >= 0);
});
test("heavy and infantry paths reach every economy and final area", () => {
  const s = E.make("frontier-9"),
    from = E.hero(s);
  for (const radius of [8, 20, 24])
    for (const p of [
      ...s.campaign.mines,
      ...M.bases,
      ...M.terminals,
      s.relay,
    ]) {
      const route = E.pathTo(from, p, radius);
      assert(
        route.length && E.dist(route.at(-1), p) < 1,
        "Unreachable " + JSON.stringify({ p, radius }),
      );
      let a = from;
      for (const b of route) {
        assert(E.travelClear(a, b, radius, "districts"));
        a = b;
      }
    }
  assert(
    !E.travelClear({ x: 1300, y: 1560 }, { x: 1300, y: 1800 }, 24, "districts"),
  );
});
test("warehouse geometry affects both paths and line of sight without changing the old map", () => {
  const a = { x: 580, y: 760, map: "districts" },
    b = { x: 860, y: 760, map: "districts" };
  assert(!E.clear(a, b));
  const route = E.pathTo(a, b, 14);
  assert(route.length > 1);
  const old = E.make("frontier-8"),
    before = JSON.stringify(old);
  E.make("frontier-9");
  assert.equal(JSON.stringify(E.make("frontier-8")), before);
  assert.equal(E.map(old).id, "highlands");
});
test("ordinary starting funds buy a real building and survive reload and cancellation", () => {
  const s = E.make("frontier-9"),
    p = findSite(s, "barracks");
  assert(p);
  const paid = E.purchase(s, "barracks", p);
  assert(paid.allowed);
  assert.equal(s.economy.alloy, 60);
  assert.equal(s.economy.spent, 120);
  const restored = E.restore(s);
  assert(restored);
  assert.deepEqual(
    restored.units.find((u) => u.id === paid.buildingId).construction,
    s.units.find((u) => u.id === paid.buildingId).construction,
  );
  assert(E.purchase(restored, "cancel-build", paid.buildingId).allowed);
  assert.equal(restored.economy.alloy, 150);
  assert(!E.purchase(restored, "cancel-build", paid.buildingId).allowed);
  assert(E.restore(restored));
});
test("both infiltration approaches are usable and preserve the selected terminal", () => {
  for (const p of M.terminals) {
    const s = E.make("frontier-9");
    s.campaign.tier = 3;
    s.economy.kit = true;
    Object.assign(E.hero(s), { x: p.x - 20, y: p.y + 60 });
    E.refreshRecon(s);
    assert.equal(E.interaction(s).type, "terminal");
    E.development.strategy(s, { interact: true }, E.DT);
    assert.equal(s.terminal.x, p.x);
    assert.equal(s.terminal.y, p.y);
    assert(s.terminal.charge > 0);
    assert(E.restore(s));
  }
  const s = E.make("frontier-9");
  s.terminal.y = 2000;
  assert.equal(E.restore(s), null);
});
test("the second terminal cannot be buried under a player building", () => {
  const s = E.make("frontier-9");
  // Clear the stronger local garrison to isolate the terminal's reserved space.
  for (const u of s.units) if (u.team && E.C[u.kind].speed) u.hp = 0;
  Object.assign(E.hero(s), { x: 2700, y: 2540 });
  E.refreshRecon(s);
  const o = E.construction.check(s, "barracks", { x: 2800, y: 2480, turn: 0 });
  assert.equal(o.allowed, false);
  assert.equal(o.reason, "objective-space");
});
test("fog hides unseen bases, resource stock and both remote terminals", () => {
  const s = E.make("frontier-9"),
    known = E.observe(s);
  assert.equal(known.terminals.length, 0);
  assert(!known.units.some((u) => u.kind === "citadel"));
  assert(!known.campaign.mines.some((m) => m.id === "factory"));
  assert(E.restore(s));
  for (let i = 0; i < 600; i++) E.step(s);
  assert(E.restore(s));
});
test("garrisons hold their district and the two planned patrol areas move", () => {
  const s = E.make("frontier-9"),
    north = s.units
      .filter(
        (u) =>
          u.team &&
          M.guards.some(
            (p) => p.sector === "S08" && p.x === u.x && p.y === u.y,
          ),
      )
      .map((u) => ({ id: u.id, x: u.x, y: u.y })),
    patrol = s.units.find((u) => u.team && u.x === 960 && u.y === 2360),
    start = { x: patrol.x, y: patrol.y };
  for (let i = 0; i < 600; i++) E.step(s);
  for (const p of north) {
    const u = s.units.find((u) => u.id === p.id);
    assert.equal(u.x, p.x);
    assert.equal(u.y, p.y);
  }
  assert(E.dist(patrol, start) > 1);
  assert(E.restore(s));
});
test("finite base reserves, two squads and destroyed-source suppression share one limit", () => {
  const s = E.make("frontier-9");
  s.campaign.camps.forEach((c) => (c.cooldown = 0));
  E.development.operation(s, {}, 1);
  E.development.operation(s, {}, 9);
  const spawned = s.units.filter((u) => u.team && u.ai?.raid);
  assert.equal(new Set(spawned.map((u) => u.ai.squad)).size, 2);
  assert.equal(spawned.length, 4);
  assert.equal(
    s.campaign.camps.reduce((n, c) => n + c.reserve, 0),
    188,
  );
  const source = s.units.find((u) => u.id === s.campaign.camps[0].source);
  source.hp = 0;
  s.campaign.camps[0].warning = 9;
  E.development.operation(s, {}, 9);
  assert.equal(s.campaign.camps[0].warning, 0);
  assert.equal(s.units.filter((u) => u.team && u.ai?.raid).length, 4);
  E.refreshRecon(s);
  assert(E.restore(s));
});
test("new map technology does not require the base it is meant to assault", () => {
  const { fund, build } = require("./helpers/signal-frontier-construction.cjs"),
    s = E.make("frontier-9");
  for (const u of s.units)
    if (u.team && !["bastion", "citadel"].includes(u.kind)) u.hp = 0;
  s.campaign.camps.forEach((c) => (c.reserve = 0));
  s.campaign.tier = 2;
  fund(s, 2000);
  for (const id of ["west", "relay"]) {
    const mine = s.campaign.mines.find((m) => m.id === id);
    Object.assign(E.hero(s), { x: mine.x - 80, y: mine.y + 160 });
    E.refreshRecon(s);
    build(s, "outpost", mine);
  }
  assert(s.units.filter((u) => u.kind === "bastion").every((u) => u.hp > 0));
  assert.equal(E.supplyStatus(s, "command").allowed, true);
  assert(E.restore(s));
});
test("the ordinary expedition pilot uses free map waypoints for infantry and heavy units", () => {
  const {
      DISTRICT_POINTS,
    } = require("./helpers/signal-frontier-expedition-pilot.cjs"),
    s = E.make("frontier-9");
  assert.equal(Object.keys(DISTRICT_POINTS).length, 19);
  for (const [x, y] of Object.values(DISTRICT_POINTS))
    for (const r of [14, 20])
      assert(
        E.free(x, y, r, E.map(s)),
        "Blocked pilot waypoint " + x + "," + y,
      );
});
console.log("PASS " + checks + " district-map checks");
