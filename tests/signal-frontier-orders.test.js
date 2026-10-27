"use strict";
const assert = require("node:assert/strict");
const E = require("../game-source/signal-frontier/src/engine");
let count = 0;
function test(name, run) {
  run();
  console.log("PASS " + name);
  count++;
}
function setup() {
  const s = E.make("classic"),
    troops = s.units.filter((u) => u.group === 1);
  troops.forEach((u, i) =>
    Object.assign(u, {
      x: 180 + i * 35,
      y: 450,
      cool: 0,
      path: [],
      target: null,
    }),
  );
  const foes = s.units.filter((u) => u.team && u.kind !== "citadel");
  foes.forEach((u, i) => {
    u.hp = i < 2 ? E.C[u.kind].hp : 0;
  });
  Object.assign(foes[0], { x: 340, y: 470 });
  Object.assign(foes[1], { x: 430, y: 420 });
  return { s, troops, foes };
}
test("focused attack affects selected combat units only and is saved without a schema change", () => {
  const { s, troops, foes } = setup(),
    before = E.snapshot(s);
  assert.equal(
    E.attackUnits(s, [troops[0].id, E.hero(s).id, foes[0].id], foes[1].id),
    true,
  );
  assert.equal(troops[0].target.id, foes[1].id);
  assert.deepEqual(
    troops[1],
    before.units.find((u) => u.id === troops[1].id),
  );
  assert.deepEqual(s.economy, before.economy);
  assert.equal(s.t, before.t);
  const loaded = E.restore(E.snapshot(s));
  assert.ok(loaded);
  assert.equal(
    loaded.units.find((u) => u.id === troops[0].id).target.id,
    foes[1].id,
  );
  assert.equal(loaded.version, before.version);
});
test("focused fire prefers the ordered enemy over a nearer opponent", () => {
  const { s, troops, foes } = setup();
  troops.slice(1).forEach((u) => (u.hp = 0));
  assert.ok(E.attackUnits(s, [troops[0].id], foes[1].id));
  E.step(s);
  assert.ok(
    s.bullets.some(
      (b) => b.team === 0 && b.tx === foes[1].x && b.ty === foes[1].y,
    ),
  );
});
test("movement replaces focused fire and losing a target clears the lock", () => {
  const { s, troops, foes } = setup(),
    u = troops[0];
  E.attackUnits(s, [u.id], foes[1].id);
  E.orderUnits(s, [u.id], 280, 600);
  assert.equal(u.target, null);
  E.attackUnits(s, [u.id], foes[1].id);
  foes[1].hp = 0;
  E.step(s);
  assert.equal(u.target, null);
  assert.ok(E.restore(E.snapshot(s)));
});
test("invalid attack targets never change existing orders", () => {
  const { s, troops } = setup();
  E.orderUnits(s, [troops[0].id], 300, 600);
  const before = E.snapshot(s);
  assert.equal(E.attackUnits(s, [troops[0].id], E.hero(s).id), false);
  assert.equal(E.attackUnits(s, [], 999999), false);
  assert.deepEqual(E.snapshot(s), before);
});
test("blocked destination uses the reachable endpoint shown in the order", () => {
  const { s, troops } = setup(),
    u = troops[0];
  Object.assign(u, { x: 550, y: 450 });
  assert.ok(E.orderUnits(s, [u.id], 650, 450));
  assert.ok(E.free(u.order.x, u.order.y, E.C[u.kind].r, "classic"));
  assert.deepEqual(u.order, u.path.at(-1));
  assert.ok(E.dist(u.order, { x: 650, y: 450 }) > 10);
});
test("restored focused pursuit continues deterministically in every supported profile", () => {
  for (const profile of [
    "classic",
    "frontier-1",
    "frontier-2",
    "frontier-3",
    "frontier-4",
    "frontier-5",
  ]) {
    const s = E.make(profile),
      u = s.units.find((u) => u.group === 1),
      enemy = s.units.find((u) => u.kind === "sentinel");
    assert.ok(E.attackUnits(s, [u.id], enemy.id));
    const loaded = E.restore(E.snapshot(s));
    assert.ok(loaded, profile);
    for (let i = 0; i < 60; i++) {
      E.step(s);
      E.step(loaded);
    }
    assert.deepEqual(E.snapshot(s), E.snapshot(loaded), profile);
  }
});
console.log(count + " tactical order checks passed.");
