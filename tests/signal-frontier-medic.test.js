"use strict";
const test = require("node:test"), assert = require("node:assert/strict"),
  { E, frames, barracksField, graduate } = require("./helpers/signal-frontier-medic.cjs"),
  { build } = require("./helpers/signal-frontier-construction.cjs"),
  care = E.support.fieldCare;
function valid(s) {
  E.refreshRecon(s);
  const saved = E.snapshot(s), copy = E.restore(saved);
  assert.deepEqual(copy, saved);
  return copy;
}
function place(u, x, y) { Object.assign(u, { x, y, path: [], order: null, target: null, cool: 0 }); }
function squad() {
  const s = barracksField(), medic = graduate(s), hero = E.hero(s), rifle = E.living(s, "rifle");
  place(medic, 520, 2200); place(hero, 595, 2200); place(rifle, 520, 2260);
  E.refreshRecon(s);
  return { s, medic, hero, rifle };
}
test("the barracks unlocks a support choice at tier II, with the same price, training time and supply as a rifle", () => {
  for (const profile of ["frontier-9", "frontier-10"]) {
    const s = barracksField(profile), b = E.living(s, "barracks"), D = E.development,
      pop = D.population(s), funds = s.economy.alloy, spec = D.items(s).medic;
    assert.deepEqual(spec, { ...D.items(s).rifle, label: "Медик" });
    s.campaign.tier = 1; assert.equal(E.purchase(s, "medic", b.id).reason, "network");
    s.campaign.tier = 2; assert.equal(E.purchase(s, "medic", E.living(s, "base").id).allowed, false);
    for (let i = 0; i < 3; i++) assert(E.purchase(s, "medic", b.id).allowed);
    assert.equal(E.purchase(s, "medic", b.id).reason, "queue");
    assert.equal(D.population(s), pop + 3); assert.equal(s.economy.alloy, funds - spec.cost * 3);
    const copy = valid(s); copy.campaign.tier = 1; assert.equal(E.restore(copy), null);
    const cancel = (j) => E.purchase(s, "cancel", b.id + ":" + j.id);
    assert(cancel(b.jobs[1]).allowed); assert.equal(s.economy.alloy, funds - 2 * spec.cost);
    E.step(s);
    const advanced = b.jobs[0], wallet = s.economy.alloy;
    assert(cancel(advanced).allowed); assert.equal(D.population(s), pop + 1);
    assert.equal(s.economy.alloy, wallet + Math.floor(spec.cost * .75));
    assert.equal(cancel(advanced).allowed, false);
    frames(s, Math.ceil(spec.time / E.DT) + 1);
    assert.equal(E.living(s, "medic").group, 1); assert.equal(D.population(s), pop + 1); valid(s);
    const old = E.make(profile);
    assert.equal(D.items(old).medic, undefined); assert.equal(E.purchase(old, "medic").reason, "unknown");
    old.units.push({ ...E.living(s, "medic"), id: ++old.seq }); assert.equal(E.restore(old), null);
  }
});
test("triage prioritizes the wounded, clamps health, has a real cooldown and resumes exactly", () => {
  const { s, medic, hero, rifle } = squad();
  hero.hp = 75; rifle.hp = 30;
  E.step(s); assert.equal(rifle.hp, 30 + care.amount); assert.equal(hero.hp, 75);
  assert(s.events.some((e) => e.type === "field-heal" && e.medic === medic.id && e.patient === rifle.id));
  const copy = valid(s); frames(s, 60); frames(copy, 60);
  assert.equal(rifle.hp, 30 + care.amount); assert.deepEqual(E.snapshot(s), E.snapshot(copy));
  frames(s, 330); assert(hero.hp > 75); assert(rifle.hp > 45);
  hero.hp = E.C.hero.hp - 1; rifle.hp = E.C.rifle.hp; medic.cool = 0;
  E.step(s); assert.equal(hero.hp, E.C.hero.hp);
  const d = E.living(s, "drone"); place(d, medic.x + 15, medic.y); d.hp = 10; medic.hp = 12;
  rifle.hp = 0; medic.cool = 0; E.step(s);
  assert.equal(d.hp, 10); assert.equal(medic.hp, 12); assert.equal(rifle.hp, 0);
  assert(!s.events.some((e) => e.type === "field-heal")); assert(!s.bullets.some((b) => b.owner === medic.id));
});
test("a medic respects a building between allies and walks to a reachable treatment position", () => {
  const { s, medic, hero } = squad(), b = E.living(s, "barracks"), wall = E.construction.rect(b);
  // A straight segment clips the near corner, although both patients are in range.
  place(medic, wall.x - 16, wall.y + 34); place(hero, wall.x + 34, wall.y - 16); hero.hp = 50;
  const clear = () => E.fireClear({ ...medic, map: E.navigation(s) }, hero);
  assert(!clear()); assert(E.dist(medic, hero) < care.range);
  const start = { ...medic };
  for (let i = 0; i < 480 && hero.hp === 50; i++) {
    const blocked = !clear(); E.step(s);
    if (blocked) assert.equal(hero.hp, 50);
  }
  assert.equal(hero.hp, 50 + care.amount); assert(clear()); assert(E.dist(start, medic) > 12); valid(s);
});
test("entering a bunker stops field care, a saved garrison can leave and resume healing", () => {
  const s = barracksField(), medic = graduate(s), hero = E.hero(s), bunker = build(s, "bunker", hero),
    door = E.construction.exit(bunker, E.C.medic.r);
  place(medic, door.x, door.y);
  assert(E.support.admit(s, [medic.id], bunker.id).allowed);
  frames(s, 4); assert(medic.care.inside);
  // The hero remains just outside the same door. No base repair or incoming fire.
  const bedside = E.construction.advance(bunker, door, 60, 0);
  place(hero, bedside.x, bedside.y); hero.hp = 40; hero.repair = 3;
  frames(s, 90); assert.equal(hero.hp, 40);
  const copy = valid(s), member = E.living(copy, "medic");
  assert(E.support.evacuate(copy, bunker.id)); assert(!member.care);
  frames(copy, 50); assert(E.hero(copy).hp > 40); valid(copy);
});
test("movement overrides healing, escorts keep their orders, and a mixed attack keeps the medic behind a fighter", () => {
  const { s, medic, hero, rifle } = squad();
  hero.hp = 40;
  assert(E.commandSelection(s, [medic.id], { x: 760, y: 2200 }));
  E.step(s); assert.equal(hero.hp, 40); assert(medic.x > 520);
  assert(E.followUnits(s, [medic.id], hero.id)); frames(s, 130);
  assert(hero.hp > 40); assert.equal(medic.order.followId, hero.id);
  const enemy = s.units.find((u) => u.kind === "sentinel");
  place(enemy, 840, 2200); enemy.hp = E.C.sentinel.hp; delete enemy.deadAt; E.refreshRecon(s);
  assert.equal(E.commandSelection(s, [medic.id], enemy, enemy.id), false);
  assert.equal(medic.order.followId, hero.id);
  assert(E.commandSelection(s, [rifle.id, medic.id], enemy, enemy.id));
  assert.equal(medic.order.followId, rifle.id); assert.equal(medic.target, null);
  assert.equal(rifle.target.id, enemy.id); valid(s);
  const closer = s.units.find((u) => u.kind === "rifle" && u !== rifle);
  place(closer, medic.x + 14, medic.y); place(rifle, medic.x - 120, medic.y);
  assert(E.commandSelection(s, [rifle.id, medic.id, closer.id], enemy, enemy.id));
  assert.equal(medic.order.followId, closer.id); valid(s);
});

test("at equal cost an extra rifle wins the open engagement sooner while a medic keeps a wounded hero alive", () => {
  function encounter(kind, heroHp) {
    const s = barracksField(), recruit = graduate(s, kind), hero = E.hero(s), guard = E.living(s, "sentinel");
    place(hero, 590, 2200); hero.hp = heroHp;
    place(recruit, 520, 2200);
    s.units.filter((u) => u.kind === "rifle" && u !== recruit).forEach((u, i) => place(u, 480, 2150 + i * 50));
    place(guard, 855, 2200); guard.ai.home = { x: guard.x, y: guard.y };
    E.refreshRecon(s);
    let defeatedAt = null;
    for (let i = 1; i <= 360 && s.status === "playing"; i++) {
      E.step(s);
      if (guard.hp === 0 && defeatedAt === null) defeatedAt = i;
    }
    valid(s);
    return { defeatedAt, heroHp: hero.hp, status: s.status };
  }
  const gun = encounter("rifle", E.C.hero.hp), aid = encounter("medic", E.C.hero.hp);
  assert(gun.defeatedAt > 0 && aid.defeatedAt > gun.defeatedAt);
  assert(aid.heroHp > gun.heroHp);
  const wounded = encounter("rifle", 16), rescued = encounter("medic", 16);
  assert.equal(wounded.status, "lost"); assert.equal(rescued.status, "playing");
  assert(rescued.heroHp > 16 && rescued.defeatedAt > 0);
});
