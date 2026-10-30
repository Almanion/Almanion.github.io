"use strict";
const assert = require("node:assert/strict"), { E, scene, frames } = require("./helpers/signal-frontier-balance.cjs"),
  legacy = require("./fixtures/signal-frontier-v17-repair.json");
let checks = 0;
function test(name, fn) { fn(); checks++; console.log("PASS " + name); }
test("range bands keep distinct roles and extend sight without changing health, damage or fire rate", () => {
  const s = E.make("frontier-9"), kinds = ["flamer", "sentinel", "rifle", "warden", "rocket", "tank", "hero", "artillery", "mortar"],
    ranges = kinds.map((kind) => E.stats(s, { kind }).range);
  assert(ranges.every((r, i) => i === 0 || r > ranges[i - 1]));
  assert.equal(E.stats(s, { kind: "rifle" }).range, 440);
  assert.equal(E.stats(s, { kind: "artillery" }).range, 800);
  assert(E.sightRange(s, { kind: "scout" }) > E.sightRange(s, E.hero(s)));
  for (const kind of kinds)
    for (const key of ["hp", "damage", "rate", "speed"])
      assert.equal(E.stats(s, { kind })[key], E.C[kind][key], kind + " " + key);
  for (const profile of ["classic", "frontier-1", "frontier-5", "frontier-6", "frontier-7", "frontier-8"]) {
    const old = E.make(profile);
    assert.equal(E.stats(old, { kind: "rifle" }).range, 300);
    assert.equal(E.sightRange(old, { kind: "artillery" }), 480);
    assert(E.restore(old));
  }
});

test("legacy 0.17 saves upgrade once, preserve paid repairs and construction, and reject tampered knowledge", () => {
  const before = JSON.parse(JSON.stringify(legacy)), migrated = E.restore(before);
  assert(migrated);
  assert.equal(migrated.campaign.balance, 1);
  for (const key of ["t", "units", "economy", "bullets", "seed", "phase"])
    assert.deepEqual(migrated[key], before[key], key);
  assert(migrated.units.some((u) => u.workerTask?.credit > 0));
  assert(migrated.units.some((u) => u.construction?.builderId));
  assert.deepEqual(before, legacy, "Loading must not mutate the supplied save");
  assert.deepEqual(E.restore(migrated), migrated);
  const bad = JSON.parse(JSON.stringify(legacy));
  bad.recon.sources[0] += "forged";
  assert.equal(E.restore(bad), null);
  const unknown = E.snapshot(migrated); unknown.campaign.balance = 99;
  assert.equal(E.restore(unknown), null);
  frames(migrated, 60);
  assert(E.restore(migrated));
});

for (const kind of ["sentinel", "warden", "rocket", "flamer", "tank", "mortar", "runner", "bomber"])
  test(kind + " uses its actual increased reach in combat, not a legacy search or sight limit", () => {
    const state = E.make("frontier-9"), range = E.stats(state, { kind }).range,
      { s, u, target } = scene(kind, range - 2);
    assert(E.visible(s, 1, target, u));
    let fired = false;
    for (let i = 0; i < 180 && u.hp > 0 && !fired; i++) {
      E.step(s);
      fired = s.events.some((e) => ["shot", "rocket", "mortar", "flame", "blast"].includes(e.type) &&
        (e.kind === kind || e.type === "blast"));
    }
    assert(fired, kind + " never attacked from its new range");
    assert(E.restore(s), kind + " must restore during its attack");
  });

test("infantry acquires enemies beyond its former range", () => {
  const { s, u, target } = scene("rifle", 430, false);
  E.step(s);
  assert(s.bullets.some((b) => b.owner === u.id));
  assert(E.dist(u, target) > E.C.rifle.range);
  assert(E.restore(s));
});

test("artillery needs spotting at maximum range and tracks a shared visible target beyond 620", () => {
  const alone = scene("artillery", 790, false);
  assert(!E.visible(alone.s, 0, alone.target));
  assert.equal(E.attackUnits(alone.s, [alone.u.id], alone.target.id), false);
  const { s, u, target } = scene("artillery", 790, false, true);
  assert(E.attackUnits(s, [u.id], target.id));
  const route = E.firingPath(u, target), end = route.at(-1) || u;
  assert(Math.abs(E.rangeDistance(end, target) - 720) < 1, "Firing position must use the new weapon data");
  E.step(s);
  assert(s.bullets.some((b) => b.owner === u.id && b.kind === "shell"));
  target.x += 50; E.refreshRecon(s); E.step(s);
  assert.equal(u.target?.x, target.x);
  target.x += 600; E.refreshRecon(s); E.step(s);
  assert(!E.visible(s, 0, target));
  assert.notEqual(u.target?.x, target.x, "A hidden target must not update its live coordinates");
  assert(E.restore(s));
});

test("a wounded rocket soldier closes an out-of-range gap instead of retreating indefinitely", () => {
  const { s, u, target } = scene("rocket", 700);
  u.ai.raid = true; u.ai.goal = { x: target.x, y: target.y }; u.hp = 20; u.cool = 2;
  const before = E.dist(u, target);
  for (let i = 0; i < 20; i++) E.development.enemy(s, u, E.DT, [target]);
  assert(E.dist(u, target) < before - 10);
  assert(E.restore(s));
});

test("bastion direct fire and counterbattery fire stay separate after their range increase", () => {
  const s = E.make("frontier-9"), b = E.living(s, "bastion"), rifle = s.units.find((u) => u.kind === "rifle"),
    direct = E.stats(s, b, rifle), artillery = { ...rifle, kind: "artillery" }, siege = E.stats(s, b, artillery);
  assert.equal(direct.range, 620); assert(!direct.siege);
  assert.equal(direct.rate, E.C.bastion.rate);
  assert.equal(siege.range, 860); assert(siege.siege);
  b.target = { x: rifle.x, y: rifle.y, id: rifle.id };
  b.combat.mode = "aim";
  assert.equal(E.dangerArea(s, b), null);
  rifle.kind = "artillery";
  assert.equal(E.dangerArea(s, b).radius, 78);
  const { s: flame, u } = scene("flamer", 200);
  u.combat.mode = "fire";
  const area = E.dangerArea(flame, u);
  assert(Math.abs(Math.max(...area.points.map((p) => E.dist(u, p))) - 240) < 0.01);
});

test("extractor defence accounts for its full foundation and spots outranging attackers", () => {
  const s = E.make("frontier-9"), post = { ...E.construction.snap("outpost", 800, 3600),
    hp: E.C.outpost.hp, build: 0, defense: true, team: 0 },
    half = E.construction.rect(post).w / 2,
    sentinel = { kind: "sentinel", team: 1, x: post.x + half + E.stats(s, { kind: "sentinel" }).range - 1, y: post.y };
  assert(E.rangeDistance(sentinel, post) < E.stats(s, sentinel).range);
  assert(E.rangeDistance(post, sentinel) < E.stats(s, post).range,
    "A basic sentry must not shoot the foundation from a safe band outside return fire");
  const rocketDistance = half + E.stats(s, { kind: "rocket" }).range;
  assert(E.sightRange(s, post) > rocketDistance, "The outpost must reveal a common siege threat");
  assert(E.stats(s, post).range < rocketDistance, "Longer-range attackers still require an army response");
  assert(E.sightRange(s, { kind: "scout" }) > half + E.stats(s, { kind: "mortar" }).range);
});

console.log(`${checks} balance checks passed.`);
