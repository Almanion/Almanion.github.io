"use strict";
const assert = require("node:assert/strict"),
  { E, fund, findSite, build } = require("./helpers/signal-frontier-construction.cjs"),
  D = require("../game-source/signal-frontier/src/districts"), C = E.construction;
let checks = 0;
function test(name, fn) { fn(); checks++; console.log("PASS " + name); }
function ready() {
  const s = E.make("frontier-9");
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((c) => c.reserve = 0); fund(s, 2000);
  return s;
}
test("base defences have front lines, armour and support with reachable non-overlapping positions", () => {
  const s = E.make("frontier-9");
  for (const [sector, expected] of [["S08",16],["S11",16],["S09",20]]) {
    const guards = D.guards.filter((g) => g.sector === sector);
    assert.equal(guards.length, expected);
    for (const type of ["sentinel", "warden", "tank", "rocket"]) assert(guards.some((g) => g.kind === type));
    for (const g of guards) {
      const u = s.units.find((u) => u.team && u.x === g.x && u.y === g.y && u.kind === g.kind);
      assert(u && !u.ai.raid);
      assert(E.free(u.x, u.y, E.C[u.kind].r, "districts"));
      assert(E.pathTo(E.hero(s), u, E.C[u.kind].r).length);
      for (const v of s.units.filter((v) => v.hp > 0 && v.id !== u.id))
        assert(E.dist(u, v) > E.C[u.kind].r + E.C[v.kind].r, `${u.id} overlaps ${v.id}`);
    }
  }
  // A load must not refill defeated defenders or alter a battle in progress.
  const victim = s.units.find((u) => u.kind === "tank"); victim.hp = 0;
  E.refreshRecon(s); assert.deepEqual(E.restore(E.snapshot(s)), E.snapshot(s));
});
test("every expansion mine still offers a safe extractor in all four orientations", () => {
  const s = ready();
  for (const mine of s.campaign.mines.filter((m) => m.id !== "home")) {
    Object.assign(E.hero(s), { x: mine.x, y: mine.y }); E.refreshRecon(s);
    for (let turn = 0; turn < 4; turn++) {
      const p = findSite(s, "outpost", mine, turn); assert(p, `${mine.id}, orientation ${turn}`);
      const o = C.check(s, "outpost", p); assert(o.allowed);
      assert(C.oreDistance(C.rect(o.preview), mine) >= 128);
      assert(o.oreRoute.length && E.dist(o.oreRoute.at(-1), mine) < 1);
    }
  }
});
test("a too-close extractor is rejected without spending or reserving a worker", () => {
  const s = ready(), mine = s.campaign.mines.find((m) => m.id === "west");
  Object.assign(E.hero(s), { x: mine.x, y: mine.y }); E.refreshRecon(s);
  let rejected;
  for (let y = mine.y - 200; y <= mine.y + 200 && !rejected; y += 40)
    for (let x = mine.x - 200; x <= mine.x + 200; x += 40) {
      const o = C.check(s, "outpost", { x, y });
      if (o.reason === "ore-clearance") { rejected = { x, y }; break; }
    }
  assert(rejected); const before = E.snapshot(s);
  assert.equal(E.purchase(s, "outpost", rejected).reason, "ore-clearance");
  assert.deepEqual(E.snapshot(s), before);
});
test("legacy extractor locations remain loadable; new clearance metadata is enforced", () => {
  const s = ready(), mine = s.campaign.mines.find((m) => m.id === "west");
  Object.assign(E.hero(s), { x: mine.x, y: mine.y }); E.refreshRecon(s);
  const b = build(s, "outpost", mine), original = E.snapshot(s); let legacy;
  for (let y = mine.y - 200; y <= mine.y + 200 && !legacy; y += 40)
    for (let x = mine.x - 200; x <= mine.x + 200; x += 40) {
      const copy = E.restore(original), u = copy.units.find((v) => v.id === b.id), p = C.snap("outpost", x, y);
      const distance = C.oreDistance(C.rect(p), mine);
      if (distance < 48 || distance >= 128) continue;
      Object.assign(u, { x: p.x, y: p.y, hp: 280 });
      delete u.construction.resourceSpacing; u.construction.work = C.exit(u);
      C.replan(copy); E.refreshRecon(copy);
      if (E.restore(copy)) { legacy = copy; break; }
    }
  assert(legacy, "Old legal placement must remain loadable");
  const restored = E.restore(legacy); assert.deepEqual(restored, E.snapshot(legacy));
  const u = restored.units.find((v) => v.id === b.id);
  assert.equal(u.hp, 280); assert.equal(E.C.outpost.hp, 520);
  u.construction.resourceSpacing = 1;
  assert.equal(E.restore(restored), null, "New placement cannot violate its recorded clearance rule");
});
console.log(`${checks} fortification checks passed.`);
