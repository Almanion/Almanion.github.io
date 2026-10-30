"use strict";
const assert = require("node:assert/strict"),
  E = require("../game-source/signal-frontier/src/engine"),
  M = require("../game-source/signal-frontier/src/minimap");
let checks = 0;
function test(name, fn) {
  fn();
  console.log("PASS " + name);
  checks++;
}
function visit(s, p) {
  Object.assign(E.hero(s), { x: p.x, y: p.y });
  E.refreshRecon(s);
}
const item = (s, key) => M.collect(s).find((p) => p.key === key);

test("projection preserves world proportions, north and round trips at every supported aspect", () => {
  for (const profile of ["classic", "frontier-6", "frontier-8", "frontier-9"])
    for (const [width, height] of [
      [192, 205],
      [110, 117],
      [280, 170],
    ]) {
      const world = E.map(E.make(profile)),
        g = M.geometry(world, width, height);
      for (const p of [
        { x: 0, y: 0 },
        { x: world.W, y: world.H },
        { x: 337, y: 947 },
      ]) {
        const projected = M.project(g, p),
          restored = M.unproject(g, projected.x, projected.y);
        assert(Math.abs(restored.x - p.x) < 1e-9);
        assert(Math.abs(restored.y - p.y) < 1e-9);
        assert(projected.x >= 4.99 && projected.x <= width - 4.99);
        assert(projected.y >= 4.99 && projected.y <= height - 4.99);
      }
      assert.deepEqual(M.unproject(g, -1e6, -1e6), { x: 0, y: 0 });
      assert.deepEqual(M.unproject(g, 1e6, 1e6), { x: world.W, y: world.H });
    }
});

test("raw state and faction observation produce identical markers without revealing hidden actors", () => {
  for (const profile of ["frontier-6", "frontier-8", "frontier-9"]) {
    const s = E.make(profile),
      before = E.snapshot(s),
      seen = E.observe(s),
      markers = M.collect(s);
    assert.deepEqual(markers, M.collect(seen));
    for (const u of s.units.filter((u) => u.team && u.hp > 0))
      assert.equal(
        markers.some((p) => p.unitId === u.id),
        E.visible(s, 0, u),
      );
    for (const mine of s.campaign.mines)
      assert.equal(
        markers.some((p) => p.key === "mine:" + mine.id),
        E.visible(s, 0, mine),
      );
    assert.deepEqual(E.snapshot(s), before);
  }
});

test("mobile enemies disappear in fog; building memory retains only its last observed position", () => {
  const s = E.make("frontier-6"),
    home = { ...E.hero(s) },
    b = E.living(s, "bastion"),
    u = E.living(s, "sentinel");
  visit(s, { x: 1740, y: 330 });
  const known = item(s, "unit:" + b.id);
  assert(known && !known.memory && known.unitId === b.id);
  visit(s, { x: 850, y: 1250 });
  assert(item(s, "unit:" + u.id));
  visit(s, home);
  Object.assign(u, { x: 1850, y: 1850 });
  Object.assign(b, { x: b.x + 50, hp: 0 });
  E.refreshRecon(s);
  assert(!item(s, "unit:" + u.id));
  const memory = item(s, "unit:" + b.id);
  assert(memory.memory);
  assert.equal(memory.unitId, null);
  assert.equal(memory.symbol, "fortress");
  assert.deepEqual([memory.x, memory.y], [known.x, known.y]);
  visit(s, b);
  assert(!item(s, "unit:" + b.id));
});

test("known resources keep their observed reserve until revisited, then update or disappear", () => {
  const s = E.make("frontier-6"),
    home = { ...E.hero(s) },
    mine = s.campaign.mines.find((p) => p.id === "north");
  visit(s, mine);
  const known = item(s, "mine:" + mine.id);
  assert(known && !known.memory);
  visit(s, home);
  mine.remaining = 0;
  E.refreshRecon(s);
  const memory = item(s, "mine:" + mine.id);
  assert(memory.memory && !memory.empty);
  assert.equal(memory.label, known.label);
  visit(s, mine);
  assert(item(s, "mine:" + mine.id).empty);
  const cache = s.caches.find((p) => !p.taken);
  visit(s, cache);
  assert(item(s, "cache:" + cache.id));
  cache.taken = true;
  E.refreshRecon(s);
  assert(!item(s, "cache:" + cache.id));
});

test("an unknown mission target is never revealed by its objective marker", () => {
  const s = E.make("frontier-6");
  s.campaign.tier = 3;
  s.approach = "infiltration";
  s.economy.kit = true;
  E.refreshRecon(s);
  assert(E.objective(s).target);
  assert.equal(E.observe(s).observationTask.target, null);
  assert(!item(s, "objective"));
});

test("all legacy profiles retain their public map, while symbols distinguish hero, workers and selection", () => {
  for (const profile of ["classic", "frontier-1", "frontier-5"]) {
    const s = E.make(profile),
      before = E.snapshot(s),
      markers = M.collect(s, [3]);
    assert.equal(
      markers.filter((p) => p.unitId).length,
      s.units.filter((u) => u.hp > 0).length,
    );
    assert.equal(markers.find((p) => p.kind === "hero").symbol, "hero");
    assert.equal(markers.find((p) => p.unitId === 3).selected, true);
    assert(markers.find((p) => p.kind === "base").symbol === "building");
    if (s.campaign) assert(markers.find((p) => p.kind === "drone").scale < 1);
    assert.deepEqual(E.snapshot(s), before);
    const enemy = s.units.find((u) => u.team);
    enemy.hp = 0;
    assert(!item(s, "unit:" + enemy.id));
  }
});

test("marker hit testing ignores remembered buildings and returns only current selectable units", () => {
  const g = M.geometry({ W: 1000, H: 1000 }, 110, 110),
    live = { x: 400, y: 400, unitId: 7, priority: 6 },
    memory = { x: 800, y: 800, unitId: null, memory: true };
  const mini = Object.assign(Object.create(M.MiniMap.prototype), {
    g,
    markers: [live, memory],
  });
  const p = M.project(g, live),
    q = M.project(g, memory);
  assert.equal(mini.pick(p.x, p.y), live);
  assert.equal(mini.pick(q.x, q.y), null);
  assert.equal(mini.pick(p.x + 12, p.y), null);
});

console.log(`${checks} mini-map checks passed.`);
