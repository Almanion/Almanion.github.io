"use strict";
const assert = require("node:assert/strict");
const E = require("../game-source/signal-frontier/src/engine");
let checks = 0;
function test(name, run) {
  run();
  console.log("PASS " + name);
  checks++;
}
function quiet(profile = "classic") {
  const s = E.make(profile);
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  if (s.campaign) s.campaign.camps.forEach((c) => (c.reserve = 0));
  E.refreshRecon(s);
  return s;
}
function advance(s, frames, input = {}) {
  for (let i = 0; i < frames; i++) E.step(s, input);
}
function field() {
  const s = quiet(),
    h = E.hero(s),
    r = s.units.filter((u) => u.group === 1);
  Object.assign(h, { x: 300, y: 650 });
  r.forEach((u, i) =>
    Object.assign(u, {
      x: 140 + i * 32,
      y: 650 + i * 32,
      path: [],
      order: null,
      target: null,
    }),
  );
  return { s, h, r };
}

test("follow commands affect only selected escorts and keep time, economy and rally points", () => {
  const { s, h, r } = field(),
    before = E.snapshot(s);
  assert(E.followUnits(s, [h.id, r[0].id], h.id));
  assert.equal(r[0].order.followId, h.id);
  assert.equal(r[0].target, null);
  assert.deepEqual(
    r[1],
    before.units.find((u) => u.id === r[1].id),
  );
  assert.deepEqual(
    h,
    before.units.find((u) => u.id === h.id),
  );
  assert.deepEqual(s.economy, before.economy);
  assert.equal(s.t, before.t);
  assert(E.restore(s));
  const encoded =
    require("../game-source/signal-frontier/src/cloud-core").encode(s);
  assert.equal(
    E.restore(JSON.parse(encoded)).units.find((u) => u.id === r[0].id).order
      .followId,
    h.id,
  );
});
test("an escort tracks a walking leader continuously, settles and resumes after a turn", () => {
  const { s, h, r } = field(),
    u = r[0];
  assert(E.followUnits(s, [u.id], h.id));
  let stopped = 0,
    longest = 0;
  for (let i = 0; i < 220; i++) {
    const p = { x: u.x, y: u.y };
    E.step(s, { x: 0.4 });
    if (i > 110) {
      stopped = E.dist(u, p) < 0.001 ? stopped + 1 : 0;
      longest = Math.max(longest, stopped);
    }
    assert(E.free(u.x, u.y, E.C[u.kind].r, "classic"));
    assert(E.dist(u, p) <= E.C[u.kind].speed * E.DT + 0.001);
  }
  assert(longest <= 1, `Stopped for ${longest} fixed steps`);
  advance(s, 180);
  assert(E.dist(u, h) > 30 && E.dist(u, h) < 100);
  const still = { x: u.x, y: u.y };
  advance(s, 60);
  assert(E.dist(u, still) < 0.001);
  advance(s, 120, { y: 0.3 });
  assert(u.y > still.y + 60);
  assert.equal(u.order.followId, h.id);
});
test("selecting a group member as leader excludes it and preserves its ground order", () => {
  const { s, r } = field();
  assert(E.orderUnits(s, [r[0].id], 500, 650));
  const before = E.snapshot(s).units.find((u) => u.id === r[0].id);
  assert(
    E.followUnits(
      s,
      r.map((u) => u.id),
      r[0].id,
    ),
  );
  assert.deepEqual(r[0], before);
  assert(r.slice(1).every((u) => u.order.followId === r[0].id));
  assert(E.restore(s));
});
test("moving and attack commands replace follow and invalid follow commands are atomic", () => {
  const { s, h, r } = field(),
    u = r[0];
  E.followUnits(s, [u.id], h.id);
  assert(E.orderUnits(s, [u.id], 400, 650));
  assert.equal(u.order.followId, undefined);
  E.followUnits(s, [u.id], h.id);
  const enemy = s.units.find((u) => u.kind === "citadel");
  assert(E.attackUnits(s, [u.id], enemy.id));
  assert.equal(u.order.followId, undefined);
  const before = E.snapshot(s);
  for (const target of [enemy.id, E.living(s, "base").id, 999999, u.id])
    assert.equal(E.followUnits(s, [u.id], target), false);
  assert.equal(E.followUnits(s, [], h.id), false);
  assert.deepEqual(E.snapshot(s), before);
});
test("cycles are rejected and a selected new leader can take over a following group", () => {
  const { s, r } = field(),
    [a, b, c] = r;
  assert(E.followUnits(s, [a.id], b.id));
  assert(E.followUnits(s, [b.id], c.id));
  const before = E.snapshot(s);
  assert.equal(E.followUnits(s, [c.id], a.id), false);
  assert.deepEqual(E.snapshot(s), before);
  assert(
    E.followUnits(
      s,
      r.map((u) => u.id),
      a.id,
    ),
  );
  assert.equal(a.order, null);
  assert.equal(b.order.followId, a.id);
  assert.equal(c.order.followId, a.id);
  assert(E.restore(s));
});
test("losing a leader clears following without chasing another unit", () => {
  const { s, r } = field(),
    [u, leader] = r;
  assert(E.followUnits(s, [u.id], leader.id));
  leader.hp = 0;
  assert(
    E.restore(s),
    "A leader killed at the end of a step must remain a valid save",
  );
  E.step(s);
  assert.equal(u.order, null);
  assert.equal(u.target, null);
  assert.deepEqual(u.path, []);
});
test("escorts fire at nearby threats without abandoning follow for a pursuit", () => {
  const { s, h, r } = field(),
    u = r[0],
    enemy = s.units.find((u) => u.kind === "sentinel");
  Object.assign(enemy, {
    hp: E.C.sentinel.hp,
    x: 330,
    y: 690,
    cool: 5,
    path: [],
  });
  u.cool = 0;
  E.followUnits(s, [u.id], h.id);
  E.step(s, { x: 0.2 });
  assert.equal(u.order.followId, h.id);
  assert.equal(u.target, null);
  assert(
    s.bullets.some((b) => b.team === 0 && b.tx === enemy.x && b.ty === enemy.y),
  );
});
test("follow survives saving deterministically in every supported operation", () => {
  for (const profile of [
    "classic",
    ...Array.from({ length: 9 }, (_, i) => "frontier-" + (i + 1)),
  ]) {
    const s = E.make(profile),
      u = s.units.find((u) => u.group === 1),
      h = E.hero(s);
    assert(E.followUnits(s, [u.id], h.id), profile);
    advance(s, 45);
    const loaded = E.restore(E.snapshot(s));
    assert(loaded, profile);
    for (let i = 0; i < 90; i++) {
      const input = { x: i < 50 ? 0.25 : 0 };
      E.step(s, input);
      E.step(loaded, input);
    }
    assert.deepEqual(E.snapshot(s), E.snapshot(loaded), profile);
    assert.equal(loaded.version, s.version);
  }
});
test("forged follow references, offsets and cycles cannot be loaded", () => {
  for (const profile of ["classic", "frontier-9"]) {
    const s = E.make(profile),
      u = s.units.find((u) => u.group === 1),
      h = E.hero(s);
    E.followUnits(s, [u.id], h.id);
    for (const change of [
      (o) => (o.followId = u.id),
      (o) => (o.followId = 99999),
      (o) => (o.followId = E.living(s, "base").id),
      (o) => (o.followId = "1"),
      (o) => (o.followX = Infinity),
      (o) => (o.followY = 513),
      (o) => delete o.followY,
    ]) {
      const bad = E.snapshot(s);
      change(bad.units.find((v) => v.id === u.id).order);
      assert.equal(E.restore(bad), null, profile);
    }
    const bad = E.snapshot(s),
      another = bad.units.find((v) => v.group === 1 && v.id !== u.id);
    bad.units.find((v) => v.id === u.id).order.followId = another.id;
    another.order = {
      x: another.x,
      y: another.y,
      followId: u.id,
      followX: 50,
      followY: 0,
    };
    assert.equal(E.restore(bad), null, profile);
  }
});
test("routes stay safe around cover and a stationary leader does not cause repeated replans", () => {
  const { s, h, r } = field(),
    u = r[0];
  Object.assign(h, { x: 800, y: 450 });
  Object.assign(u, { x: 520, y: 450 });
  E.followUnits(s, [u.id], h.id);
  const route = u.path;
  assert(route.length > 1);
  for (let i = 0; i < 45; i++) {
    const p = { x: u.x, y: u.y };
    E.step(s);
    assert(E.travelClear(p, u, E.C[u.kind].r, "classic"));
  }
  assert.equal(u.path, route, "An unchanged safe route should be retained");
  advance(s, 650);
  assert(E.dist(u, h) < 130);
  assert.equal(u.order.followId, h.id);
});
test("a scout follows across real height routes and never cuts a cliff", () => {
  const s = quiet("frontier-7"),
    u = s.units.find((u) => u.kind === "rifle"),
    h = E.hero(s);
  u.kind = "scout";
  u.hp = E.C.scout.hp;
  Object.assign(u, { x: 1360, y: 1400 });
  Object.assign(h, { x: 1200, y: 1880 });
  E.refreshRecon(s);
  assert(E.followUnits(s, [u.id], h.id));
  for (let i = 0; i < 1600; i++) {
    const p = { x: u.x, y: u.y };
    E.step(s);
    assert(E.travelClear(p, u, E.C.scout.r, u.map));
  }
  assert(E.dist(u, h) < 150);
  assert.equal(u.order.followId, h.id);
  assert(E.restore(s));
});
test("a heavy escort waits safely at an infantry-only bridge without per-frame replanning", () => {
  const s = quiet("frontier-7"),
    u = s.units.find((u) => u.kind === "rifle"),
    h = E.hero(s);
  Object.assign(u, {
    kind: "artillery",
    hp: E.C.artillery.hp,
    group: 2,
    x: 1360,
    y: 1400,
  });
  Object.assign(h, { x: 1300, y: 1670 });
  E.refreshRecon(s);
  assert(E.followUnits(s, [u.id], h.id));
  let changes = 0,
    previous = u.path;
  for (let i = 0; i < 600; i++) {
    E.step(s);
    if (u.path !== previous) changes++;
    previous = u.path;
    assert(E.free(u.x, u.y, E.C.artillery.r, u.map));
  }
  assert(changes < 35, `Path changed ${changes} times in ten seconds`);
  assert.equal(u.order.followId, h.id);
  assert(E.dist(u, h) > E.C.hero.r + E.C.artillery.r);
});
test("follow replans around a newly paid building using the current navigation world", () => {
  const s = quiet("frontier-9"),
    u = s.units.find((u) => u.kind === "rifle"),
    h = E.hero(s);
  Object.assign(u, { x: 360, y: 2100 });
  Object.assign(h, { x: 1100, y: 2100 });
  E.refreshRecon(s);
  assert(E.followUnits(s, [u.id], h.id));
  assert.equal(u.path.length, 1);
  assert(E.purchase(s, "barracks", { x: 660, y: 2100, turn: 0 }).allowed);
  for (let i = 0; i < 800; i++) {
    const p = { x: u.x, y: u.y };
    E.step(s);
    assert(E.travelClear(p, u, E.C[u.kind].r, E.navigation(s)));
  }
  assert(E.dist(u, h) < 130);
  assert.equal(u.order.followId, h.id);
  assert(E.restore(s));
});
console.log(`${checks} follow-order checks passed.`);
