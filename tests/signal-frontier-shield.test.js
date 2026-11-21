"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { E, frames, barracksField, graduate } = require("./helpers/signal-frontier-medic.cjs");
const { build } = require("./helpers/signal-frontier-construction.cjs");
const plate = E.support.plate;

function stand(u, x, y) {
  Object.assign(u, { x, y, path: [], order: null, target: null });
}
function encounter(kind = "shield") {
  const s = barracksField(), soldier = graduate(s, kind), foe = E.living(s, "sentinel");
  stand(soldier, 570, 2200); stand(foe, 825, 2200);
  if (soldier.guard) soldier.guard.scan = 0;
  foe.ai.home = { x: foe.x, y: foe.y }; foe.cool = 5; soldier.cool = 5;
  E.refreshRecon(s);
  return { s, soldier, foe };
}
function inject(s, foe, u, angle, kind = "bolt", side = 0, ahead = 28) {
  const nx = Math.cos(angle), ny = Math.sin(angle);
  s.bullets.push({ kind, team: 1, owner: foe.id, map: foe.map, x: u.x + nx * ahead - ny * side,
    y: u.y + ny * ahead + nx * side, vx: -600 * nx, vy: -600 * ny, damage: 20, life: 2, age: 0,
    tx: u.x, ty: u.y, ...(kind === "missile" ? { lockId: u.id, guided: false } : {}) });
}
function valid(s) {
  E.refreshRecon(s);
  const saved = E.snapshot(s), restored = E.restore(saved);
  assert(restored, "snapshot with shield state must restore");
  assert.deepEqual(restored, saved);
  return restored;
}
function approx(n, expected) { assert(Math.abs(n - expected) < .00001, n + " vs " + expected); }

test("shield training uses a real tier II barracks, reserves a rifle's price and supply and survives reload on both maps", () => {
  for (const map of ["frontier-9", "frontier-10"]) {
    const s = barracksField(map), b = E.living(s, "barracks"), D = E.development;
    const item = D.items(s).shield, start = s.economy.alloy, population = D.population(s);
    assert.deepEqual(item, { ...D.items(s).rifle, label: "Щитоносец" });
    s.campaign.tier = 1; assert.equal(E.purchase(s, "shield", b.id).reason, "network");
    s.campaign.tier = 2;
    assert.equal(E.purchase(s, "shield", E.living(s, "base").id).allowed, false);
    assert(E.purchase(s, "shield", b.id).allowed); assert(E.purchase(s, "shield", b.id).allowed);
    assert(E.purchase(s, "cancel", b.id + ":" + b.jobs[1].id).allowed);
    assert.equal(s.economy.alloy, start - item.cost); assert.equal(D.population(s), population + 1);
    const next = valid(s); frames(next, Math.ceil(item.time / E.DT) + 2);
    const soldier = E.living(next, "shield"); assert(soldier.guard); assert.equal(soldier.group, 1); valid(next);
    for (const [key, value] of [["lift", -1], ["angle", 4], ["watch", -1], ["pulse", 8], ["scan", 3]]) {
      const corrupt = E.snapshot(next); E.living(corrupt, "shield").guard[key] = value; assert.equal(E.restore(corrupt), null);
    }
    const foreign = E.snapshot(next); E.hero(foreign).guard = soldier.guard; assert.equal(E.restore(foreign), null);
    const old = E.make(map); assert.equal(D.items(old).shield, undefined); assert.equal(E.restore(old).version, old.version);
  }
});

test("the plate takes time to rise and turn, tracks a visible threat and resumes the exact turn after loading", () => {
  const { s, soldier, foe } = encounter(), g = soldier.guard;
  frames(s, 12); assert(g.lift > 0 && g.lift < 1); assert.equal(g.watch, foe.id);
  const copy = valid(s); frames(copy, 18); frames(s, 18);
  assert.equal(g.lift, 1); assert.deepEqual(E.snapshot(s), E.snapshot(copy));
  stand(foe, 340, 2200); foe.ai.home = { x: foe.x, y: foe.y }; E.refreshRecon(s);
  const angle = g.angle; E.step(s); assert(Math.abs(g.angle - angle) <= plate.turnRate * E.DT + 1e-9);
  inject(s, foe, soldier, Math.PI); frames(s, 3); approx(soldier.hp, 95);
  const turning = valid(s); frames(s, 95); frames(turning, 95);
  assert(Math.cos(g.angle) < -.9); assert.deepEqual(E.snapshot(s), E.snapshot(turning));
  stand(foe, 3100, 2980); E.refreshRecon(s); frames(s, 48);
  assert.equal(g.watch, 0); assert.equal(g.lift, 0);
});

test("a threat seen by a teammate across a solid barrier does not turn or raise the shield", () => {
  const { s, soldier, foe } = encounter();
  stand(soldier, 760, 2210); stand(foe, 760, 2320);
  stand(E.living(s, "rifle"), 800, 2320);
  foe.ai.home = { x: foe.x, y: foe.y }; E.refreshRecon(s);
  assert(E.visible(s, 0, foe)); assert(!E.fireClear(soldier, foe));
  E.support.turnShield(s, soldier, [foe], E.DT);
  assert.equal(soldier.guard.watch, 0); assert.equal(soldier.guard.lift, 0);
});

test("frontal bolts, open flanks, missiles and explosions resolve different damage on the same soldier", () => {
  function damage(angle, kind) {
    const { s, soldier, foe } = encounter(); frames(s, 30);
    assert.equal(soldier.guard.lift, 1);
    const hp = soldier.hp;
    inject(s, foe, soldier, angle, kind);
    let block = false;
    for (let i = 0; i < 5; i++) { E.step(s); block ||= s.events.some((e) => e.type === "shield-block"); }
    return { damage: hp - soldier.hp, block, hit: soldier.hit };
  }
  const front = damage(0, "bolt"); approx(front.damage, 6); assert(front.block); assert.equal(front.hit, 0);
  for (const angle of [plate.halfAngle, -plate.halfAngle]) {
    approx(damage(angle, "bolt").damage, 6);
  }
  for (const angle of [plate.halfAngle + .02, -plate.halfAngle - .02, Math.PI / 2, Math.PI]) {
    const hit = damage(angle, "bolt"); approx(hit.damage, 20); assert(!hit.block && hit.hit > 0);
  }
  const rocket = damage(0, "missile"); approx(rocket.damage, 20); assert(!rocket.block);
  const shell = damage(0, "shell"); assert(shell.damage > 15); assert(!shell.block);
});

test("the raised edge intercepts a shot crossing beside the body but leaves open space and the rear exposed", () => {
  for (const [side, angle, intercepted] of [[19, 0, true], [25, 0, false], [19, Math.PI, false]]) {
    const { s, soldier, foe } = encounter(), buddy = E.living(s, "rifle"), direction = Math.cos(angle);
    stand(buddy, soldier.x - direction * 55, soldier.y + side * direction); E.refreshRecon(s);
    frames(s, 30); inject(s, foe, soldier, angle, "bolt", side, 48); frames(s, 14);
    approx(buddy.hp, E.C.rifle.hp - (intercepted ? 0 : 20));
    approx(soldier.hp, E.C.shield.hp - (intercepted ? 6 : 0));
  }
});

test("a mixed move reserves the front in either axis and a braced march slows down", () => {
  const { s, soldier, foe } = encounter(), rifle = E.living(s, "rifle");
  stand(rifle, soldier.x - 45, soldier.y); E.refreshRecon(s);
  for (const goal of [{ x: 735, y: 2200 }, { x: 460, y: 2200 }, { x: 545, y: 2090 }, { x: 545, y: 2290 }]) {
    assert(E.commandSelection(s, [rifle.id, soldier.id], goal));
    const dx = goal.x - (soldier.x + rifle.x) / 2, dy = goal.y - (soldier.y + rifle.y) / 2;
    assert((soldier.order.x - rifle.order.x) * dx + (soldier.order.y - rifle.order.y) * dy > 0);
  }
  assert(E.commandSelection(s, [soldier.id], { x: 750, y: 2200 })); frames(s, 30);
  const x = soldier.x; frames(s, 10); approx(soldier.x - x, plate.speed * 10 * E.DT);
  stand(foe, 3100, 2980); E.refreshRecon(s); frames(s, 50);
  const y = soldier.x; frames(s, 10); approx(soldier.x - y, E.C.shield.speed * 10 * E.DT);
});

test("a medic treats shield infantry, shelter folds the plate and saving a garrison keeps its occupants", () => {
  const s = barracksField(), soldier = graduate(s, "shield"), medic = graduate(s);
  stand(soldier, 570, 2200); stand(medic, 620, 2200); soldier.hp = 60; medic.cool = 0;
  E.refreshRecon(s); E.step(s); assert.equal(soldier.hp, 75);
  const b = build(s, "bunker", E.hero(s)), door = E.construction.exit(b, E.C.shield.r);
  stand(soldier, door.x, door.y); soldier.guard.lift = 1;
  assert(E.support.admit(s, [soldier.id], b.id).allowed); frames(s, 5);
  assert(soldier.care.inside); assert.equal(soldier.guard.lift, 0);
  const copy = valid(s), invalid = E.snapshot(s);
  E.living(invalid, "shield").guard.lift = 1; assert.equal(E.restore(invalid), null);
  assert(E.support.evacuate(copy, b.id)); assert(!E.living(copy, "shield").care); valid(copy);
});

test("an equal-price shield buys staying power while two rifles finish the same engagement sooner", () => {
  function fight(kind, distance, side) {
    const s = barracksField(), front = graduate(s, kind), remaining = s.units.filter(u => u !== front && u.kind === "rifle");
    const buddy = remaining[0], foe = E.living(s, "sentinel");
    stand(front, 610, 2200); stand(buddy, 558, 2200);
    for (const r of remaining.slice(1)) stand(r, 400, 2700 + 40 * r.id % 80);
    stand(E.hero(s), 440, 2690); stand(foe, front.x + distance, front.y + side);
    foe.ai.home = { x: foe.x, y: foe.y };
    for (const u of [front, ...remaining, E.hero(s), foe]) u.cool = .35;
    E.refreshRecon(s);
    let killedAt = 0, blocks = 0;
    for (let i = 1; i <= 15 / E.DT; i++) {
      E.step(s);
      blocks += s.events.filter(e => e.type === "shield-block").length;
      if (!killedAt && foe.hp === 0) killedAt = i * E.DT;
    }
    return { front: front.hp, buddy: buddy.hp, killedAt, blocks };
  }
  const shield = fight("shield", 265, -12), rifles = fight("rifle", 265, -12);
  assert(shield.killedAt > rifles.killedAt + 1 && rifles.killedAt > 0);
  assert(shield.front > rifles.front + 8 && shield.buddy === rifles.buddy);
  assert(shield.blocks > 0 && rifles.blocks === 0);
});
