"use strict";
const assert = require("node:assert/strict"),
  Campaign = require("../game-source/signal-frontier/src/campaign"),
  Districts = require("../game-source/signal-frontier/src/districts");
const original = Campaign.create;
let calls = 0,
  redundant = 0,
  blockedId = -1,
  blockedCalls = 0;
Campaign.create = function (api) {
  const pathTo = api.pathTo;
  api.pathTo = function (from, to, radius) {
    calls++;
    if (from.id === blockedId) {
      blockedCalls++;
      return [];
    }
    if (Math.hypot(from.x - to.x, from.y - to.y) < 0.001) redundant++;
    return pathTo(from, to, radius);
  };
  return original(api);
};
const E = require("../game-source/signal-frontier/src/engine");
let checks = 0;
function test(name, run) {
  run();
  console.log("PASS " + name);
  checks++;
}
function advance(s, frames) {
  for (let i = 0; i < frames; i++) E.step(s);
}

test("idle garrisons do not repeatedly request routes to their own position", () => {
  const s = E.make("frontier-9");
  calls = redundant = 0;
  advance(s, 1800);
  assert.equal(redundant, 0);
  assert(calls < 350, "Unchanged routes were searched again: " + calls);
  assert(E.restore(s));
  console.log("  30 seconds: " + calls + " paths, " + redundant + " redundant");
});

test("a patrol consumes successive destinations without decision-timer rests", () => {
  const s = E.make("frontier-9"),
    u = s.units.find((v) => v.team && v.x === 520 && v.y === 880),
    route = Districts.patrol(u.ai.home);
  for (const v of s.units)
    if (v.team && v !== u && v.kind !== "citadel") v.hp = 0;
  s.campaign.camps.forEach((c) => (c.reserve = 0));
  let stopped = 0,
    longest = 0;
  for (let i = 0; i < 1500; i++) {
    const p = { x: u.x, y: u.y };
    E.step(s);
    stopped = E.dist(u, p) < 0.001 ? stopped + 1 : 0;
    longest = Math.max(longest, stopped);
    assert(E.free(u.x, u.y, E.C[u.kind].r, u.map));
    assert(E.dist(u, p) <= E.C[u.kind].speed * E.DT + 0.001);
  }
  assert(u.ai.patrol >= route.length * 2);
  assert(longest <= 1, "Patrol stopped for " + longest + " fixed steps");
});

test("an existing movement order continues while tactical thinking is pending", () => {
  const s = E.make("frontier-9"),
    u = s.units.find((v) => v.team && v.x === 520 && v.y === 880);
  u.ai.patrol = 1;
  u.think = 0.7;
  u.path = E.pathTo(u, { x: 600, y: 1040 }, E.C[u.kind].r);
  const p = { x: u.x, y: u.y };
  E.step(s);
  assert(u.think > 0);
  assert(E.dist(u, p) > 1);
});

test("an unavailable route is retried at decision cadence without a per-frame search storm", () => {
  const s = E.make("frontier-9"),
    u = s.units.find((v) => v.team && v.x === 520 && v.y === 880);
  u.ai.patrol = 1;
  for (const v of s.units)
    if (v.team && v !== u && v.kind !== "citadel") v.hp = 0;
  s.campaign.camps.forEach((c) => (c.reserve = 0));
  blockedId = u.id;
  blockedCalls = 0;
  try {
    advance(s, 150);
    assert(
      blockedCalls >= 2 && blockedCalls <= 5,
      "Unbounded retry count: " + blockedCalls,
    );
  } finally {
    blockedId = -1;
  }
});

test("patrols, targeting and separation resume identically after saving", () => {
  for (const profile of ["frontier-8", "frontier-9"]) {
    const s = E.make(profile);
    advance(s, 240);
    const restored = E.restore(E.snapshot(s));
    assert(restored);
    for (let i = 0; i < 180; i++) {
      const input = { x: i < 100 ? 0.1 : 0, aim: { x: 900, y: 2450 } };
      E.step(s, input);
      E.step(restored, input);
    }
    assert.deepEqual(E.snapshot(s), E.snapshot(restored), profile);
  }
});

test("mixed raiding squads share a march and preserve valid terrain and saves", () => {
  const s = E.make("frontier-9");
  s.t = 700;
  s.campaign.camps[0].waves = 1;
  s.campaign.camps[0].cooldown = 0;
  E.development.operation(s, {}, 1);
  E.development.operation(s, {}, 9);
  const members = s.units.filter((u) => u.team && u.ai?.raid);
  assert(members.length >= 4);
  const start = members.map((u) => ({ id: u.id, x: u.x, y: u.y }));
  advance(s, 1800);
  for (const u of members) {
    assert(E.free(u.x, u.y, E.C[u.kind].r, u.map), u.kind);
    assert(
      E.dist(
        u,
        start.find((v) => v.id === u.id),
      ) > 120,
      u.kind + " never marched",
    );
    assert(u.path.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
  const restored = E.restore(E.snapshot(s));
  assert(restored);
  advance(s, 120);
  advance(restored, 120);
  assert.deepEqual(E.snapshot(s), E.snapshot(restored));
});

test("a replacement leader retains the squad's completed route stages", () => {
  const s = E.make("frontier-9");
  s.campaign.camps[0].cooldown = 0;
  E.development.operation(s, {}, 1);
  E.development.operation(s, {}, 9);
  const members = s.units.filter((u) => u.ai?.raid),
    first = { x: 2040, y: 500 },
    next = { x: 840, y: 1400 };
  for (const u of members) {
    Object.assign(u, { x: first.x, y: first.y, path: [], think: 0 });
    Object.assign(u.ai, {
      assembleUntil: 0,
      waypoints: [{ ...first }, { ...next }],
    });
  }
  E.step(s);
  for (const u of members) assert.deepEqual(u.ai.waypoints[0], next);
  members[0].hp = 0;
  E.step(s);
  assert.deepEqual(members[1].ai.waypoints[0], next);
});

test("lazy routes respect footprint, construction changes, cancellation and fresh restores", () => {
  const { findSite } = require("./helpers/signal-frontier-construction.cjs"),
    s = E.make("frontier-9"),
    target = Districts.bases[0],
    radii = [8, 14, 24],
    before = radii.map((r) => E.pathTo(E.hero(s), target, r)),
    oldWorld = E.navigation(s),
    site = findSite(s, "barracks"),
    paid = E.purchase(s, "barracks", site);
  assert(paid.allowed);
  assert.notEqual(E.navigation(s), oldWorld);
  const restored = E.restore(s);
  assert(restored);
  for (const r of radii) {
    const route = E.pathTo(E.hero(s), target, r),
      fresh = E.pathTo(E.hero(restored), target, r);
    assert.deepEqual(route, fresh);
    let a = E.hero(s);
    for (const b of route) {
      assert(E.travelClear(a, b, r, E.navigation(s)));
      a = b;
    }
  }
  assert(E.purchase(s, "cancel-build", paid.buildingId).allowed);
  for (let i = 0; i < radii.length; i++)
    assert.deepEqual(E.pathTo(E.hero(s), target, radii[i]), before[i]);
});

test("a local visibility witness matches full faction perception, including cover, death and stale masks", () => {
  const s = E.make("frontier-9"),
    u = s.units.find((v) => v.team && v.x === 960 && v.y === 2360),
    points = [
      ...s.units.map((v) => ({ x: v.x, y: v.y })),
      ...Array.from({ length: 120 }, (_, i) => ({
        x: (i * 367) % 3600,
        y: (i * 509) % 3840,
      })),
    ];
  for (const change of [{}, { x: u.x + 25 }, { hp: 0 }]) {
    Object.assign(u, change);
    const before = JSON.stringify(s);
    for (const team of [0, 1])
      for (const p of points)
        for (const witness of [u, E.hero(s), { ...u }, null])
          assert.equal(E.visible(s, team, p, witness), E.visible(s, team, p));
    assert.equal(JSON.stringify(s), before);
  }
});
function infiltrationFixture() {
  const s = E.make("frontier-9");
  s.t = 2100;
  s.campaign.tier = 3;
  s.economy.kit = true;
  s.economy.alloy = 0;
  Object.assign(E.hero(s), { x: 2440, y: 2400 });
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  E.refreshRecon(s);
  const {
      ExpeditionPilot,
    } = require("./helpers/signal-frontier-expedition-pilot.cjs"),
    p = new ExpeditionPilot("infiltration");
  p.stage = 9;
  p.lastTime = s.t;
  return { s, p };
}
test("the operation pilot regroups a depleted escort instead of rushing the terminal alone", () => {
  const { s, p } = infiltrationFixture(),
    before = JSON.stringify(s),
    node = E.living(s, "base"),
    d = p.decide(s);
  assert.equal(p.goal, node.x - 80 + "," + (node.y - 100));
  assert.equal(p.infilReady, false);
  assert.equal(d.input.interact, false);
  assert.equal(JSON.stringify(s), before);
});
test("a prepared infiltration escort uses the north approach and holds an open breach", () => {
  const { s, p } = infiltrationFixture(),
    r = s.units.find((u) => u.kind === "rifle"),
    h = E.hero(s);
  p.garrison = [r.id];
  for (let i = 0; i < 4; i++)
    s.units.push({
      ...structuredClone(r),
      id: ++s.seq,
      x: h.x - 40 - i * 15,
      y: h.y - 30,
      path: [],
      target: null,
    });
  E.refreshRecon(s);
  p.decide(s);
  const terminal = E.map(s).terminals[0];
  assert.equal(p.infilReady, true);
  assert.equal(p.goal, terminal.x + "," + terminal.y);
  Object.assign(h, { x: terminal.x, y: terminal.y });
  Object.assign(s.terminal, {
    ...terminal,
    window: 6,
    charge: 1,
    channeling: true,
  });
  E.refreshRecon(s);
  const before = JSON.stringify(s),
    d = p.decide(s);
  assert.equal(p.goal, terminal.x + "," + terminal.y);
  assert.equal(d.input.interact, true);
  assert.equal(d.input.x, 0);
  assert.equal(d.input.y, 0);
  assert.equal(JSON.stringify(s), before);
});
test("the operation pilot uses the hero's expanded weapon range instead of entering enemy fire", () => {
  const { scene } = require("./helpers/signal-frontier-balance.cjs"),
    { ExpeditionPilot } = require("./helpers/signal-frontier-expedition-pilot.cjs"),
    { s, target } = scene("rocket", 640);
  Object.assign(E.hero(s), { x: target.x, y: target.y });
  target.hp = 0;
  E.refreshRecon(s);
  const decision = new ExpeditionPilot("infiltration").decide(s);
  assert(decision.input.fire, "The 620–680 safe band must remain usable by the verification player");
  assert.deepEqual(decision.input.aim, { x: 400, y: 3600 });
  assert(E.restore(s));
});
test("the operation pilot intercepts a visible long-range attacker instead of waiting inside the old defence radius", () => {
  const { ExpeditionPilot } = require("./helpers/signal-frontier-expedition-pilot.cjs"), s = E.make("frontier-9");
  for (const u of s.units) if (!["hero", "base", "citadel"].includes(u.kind)) u.hp = 0;
  s.campaign.camps.forEach((c) => c.reserve = 0);
  const base = E.living(s, "base"), h = E.hero(s), rocket = s.units.find((u) => u.kind === "rocket");
  Object.assign(rocket, { hp: E.C.rocket.hp, x: 900, y: 2560, path: [], target: null });
  Object.assign(rocket.ai, { home: { x: 900, y: 2560 }, raid: true, goal: { x: base.x, y: base.y } });
  Object.assign(h, { x: 1700, y: 2560 }); base.hp = 500;
  E.refreshRecon(s);
  assert(E.visible(s, 0, rocket));
  assert(E.dist(rocket, base) > 480);
  const before = JSON.stringify(s), pilot = new ExpeditionPilot("infiltration");
  pilot.stage = 2;
  const decision = pilot.decide(s), [x, y] = pilot.goal.split(",").map(Number), point = { x, y };
  assert(pilot.defendHome);
  assert(E.dist(point, rocket) < E.stats(s, h).range);
  assert(E.dist(point, rocket) > E.stats(s, rocket).range);
  assert.equal(decision.input.x, -1);
  assert.equal(JSON.stringify(s), before);
  assert(E.restore(s));
});
test("reused actor sight follows both moving endpoints and the requested cover margin", () => {
  const observer = { kind: "rifle", map: "highlands", x: 2100, y: 500 },
    target = { kind: "tank", map: "highlands", x: 2000, y: 500 };
  assert(E.clear(observer, target));
  assert(E.clear(observer, target));
  target.x = 2500;
  assert(E.elevation(target.x, target.y, target.map) > E.elevation(observer.x, observer.y, observer.map) + 24);
  assert(!E.clear(observer, target), "A moving target must not remain visible above a ledge");
  observer.x = 2600;
  assert(E.clear(observer, target), "Climbing the ledge must reveal the same target");
  observer.x = 2100;
  assert(!E.clear(observer, target));
  Object.assign(observer, { map: "districts", x: 650, y: 2235 });
  Object.assign(target, { map: "districts", x: 870, y: 2235 });
  assert(E.clear(observer, target, 0));
  assert(!E.clear(observer, target, 14));
  assert(E.clear(observer, target, 0));
  observer.map = target.map = "highlands";
  assert(E.clear(observer, target, 14));
  observer.map = target.map = "districts";
  assert(!E.clear(observer, target, 14));
  const crowd = Array.from({ length: 260 }, (_, i) => ({
    kind: "rifle", map: "highlands", x: 1800 + (i % 26) * 30, y: 340 + Math.floor(i / 26) * 30,
  }));
  observer.map = "highlands";
  for (let frame = 0; frame < 3; frame++) {
    observer.x += 7;
    for (const unit of crowd) {
      unit.x += frame;
      assert.equal(E.clear(observer, unit), E.clear(
        { x: observer.x, y: observer.y, map: observer.map },
        { x: unit.x, y: unit.y, map: unit.map },
      ), "Each target in a moving crowd must retain its own exact sight result");
    }
  }
});
console.log(checks + " optimization checks passed.");
