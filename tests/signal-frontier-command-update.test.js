"use strict";
const assert = require("node:assert/strict"),
  {
    E,
    fund,
    build,
    frames,
  } = require("./helpers/signal-frontier-construction.cjs");
let count = 0;
function test(name, run) {
  run();
  count++;
  console.log("PASS " + name);
}
function field() {
  const s = E.make("frontier-9");
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((c) => (c.reserve = 0));
  E.refreshRecon(s);
  return s;
}
test("hero bolts run through the actual aim point from the offset muzzle", () => {
  for (const [dx, dy] of [
    [250, 0],
    [0, 250],
    [-200, 80],
    [150, -140],
    [12, 10],
  ]) {
    const s = field(),
      h = E.hero(s),
      target = {
        x: h.x + dx,
        y: h.y + dy,
        z: E.elevation(h.x, h.y, E.map(s)) + E.MOUNTS.hero,
      };
    E.step(s, { aim: target, fire: true });
    const b = s.bullets.find((b) => b.owner === h.id);
    assert(b);
    const cross = (target.x - b.x) * b.vy - (target.y - b.y) * b.vx;
    assert(Math.abs(cross) < 1e-6);
    assert(Math.abs(E.projectileHeight(b) - target.z) < 1e-7);
    assert(Math.abs(h.angle - E.aimAngle(h, target)) < 1e-9);
    assert(E.restore(s));
  }
});
test("aiming past a flat platform does not drive a bolt into the floor before the edge", () => {
  const s = field(),
    h = E.hero(s),
    aim = { x: 20, y: h.y };
  assert(E.terrain.level(aim.x, aim.y) < 0);
  E.step(s, { aim, fire: true });
  let crossed = false;
  for (let i = 0; i < 40; i++) {
    const b = s.bullets.find((b) => b.owner === h.id);
    assert(b, "Bolt hit the flat floor prematurely");
    assert(
      Math.abs(
        E.projectileHeight(b) -
          (E.elevation(h.x, h.y, E.map(s)) + E.MOUNTS.hero),
      ) < 1e-7,
    );
    if (b.x < 130) {
      crossed = true;
      break;
    }
    E.step(s);
  }
  assert(crossed);
});
test("mixed groups move troops and set building rally points atomically", () => {
  const s = field(),
    r = s.units.find((u) => u.kind === "rifle"),
    base = E.living(s, "base");
  const ids = [r.id, base.id];
  assert(E.commandSelection(s, ids, { x: 800, y: 2500 }));
  assert(r.path.length);
  assert.deepEqual(base.rally, { x: 800, y: 2500 });
  const before = E.snapshot(s);
  assert.equal(E.commandSelection(s, ids, { x: 800, y: 2500 }, 99999), false);
  assert.deepEqual(E.snapshot(s), before);
  assert(E.restore(s));
});
test("buildings track a friendly leader and stop tracking a dead leader without losing their rally", () => {
  const s = field(),
    base = E.living(s, "base"),
    h = E.hero(s);
  assert(E.commandSelection(s, [base.id], h, h.id));
  assert.equal(base.rally.followId, h.id);
  for (let i = 0; i < 20; i++) E.step(s, { x: 0.3 });
  assert.equal(base.rally.x, h.x);
  assert(E.restore(s));
  const previous = { x: base.rally.x, y: base.rally.y };
  const leader = s.units.find((u) => u.kind === "rifle");
  E.commandSelection(s, [base.id], leader, leader.id);
  leader.hp = 0;
  E.step(s);
  assert.equal(base.rally.followId, undefined);
  assert(Number.isFinite(base.rally.x));
});
test("attack acknowledgements are red intents and never target unseen enemies", () => {
  const s = field(),
    r = s.units.find((u) => u.kind === "rifle"),
    base = E.living(s, "base"),
    enemy = s.units.find((u) => u.kind === "sentinel");
  Object.assign(enemy, { hp: E.C.sentinel.hp, x: 760, y: 2420 });
  E.refreshRecon(s);
  assert(E.visible(s, 0, enemy));
  assert(E.commandSelection(s, [r.id, base.id], enemy, enemy.id));
  assert.equal(s.events.at(-1).intent, "attack");
  assert.equal(r.target.id, enemy.id);
  const hidden = E.living(s, "citadel"),
    before = E.snapshot(s);
  assert(!E.visible(s, 0, hidden));
  assert.equal(E.commandSelection(s, [base.id], hidden, hidden.id), false);
  assert.deepEqual(E.snapshot(s), before);
});
test("newly trained troops inherit a building follow rally and restore correctly", () => {
  const s = field();
  fund(s, 1200);
  const b = build(s, "barracks"),
    h = E.hero(s);
  assert(E.commandSelection(s, [b.id], h, h.id));
  assert(E.purchase(s, "rifle", String(b.id)).allowed);
  const before = new Set(s.units.map((u) => u.id));
  frames(s, 1800);
  const recruit = s.units.find((u) => u.kind === "rifle" && !before.has(u.id));
  assert(recruit);
  assert.equal(recruit.order.followId, h.id);
  assert(E.restore(s));
  const bad = E.snapshot(s);
  bad.units.find((u) => u.id === b.id).rally.followId = E.living(
    s,
    "citadel",
  ).id;
  assert.equal(E.restore(bad), null);
});
console.log(count + " command-update checks passed.");
