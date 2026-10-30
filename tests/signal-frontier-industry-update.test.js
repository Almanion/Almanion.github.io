"use strict";
const assert = require("node:assert/strict"),
  {
    E,
    field,
    fund,
    findSite,
    build,
    frames,
  } = require("./helpers/signal-frontier-construction.cjs"),
  C = E.construction;
let checks = 0;
function test(name, fn) {
  fn();
  console.log("PASS " + name);
  checks++;
}
function ready(profile = "frontier-9") {
  const s = profile === "frontier-8" ? field() : E.make(profile);
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((c) => (c.reserve = 0));
  fund(s, 1000);
  E.refreshRecon(s);
  return s;
}
function visit(s, p) {
  Object.assign(E.hero(s), { x: p.x, y: p.y });
  E.refreshRecon(s);
}

test("four orientations share one footprint rule, service exit and outward spawn basis", () => {
  const expected = [
    { x: 0, y: 1 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: -1, y: 0 },
  ];
  for (let turn = 0; turn < 4; turn++) {
    const preview = C.snap("foundry", 1000, 2000, turn),
      box = C.rect(preview),
      dir = C.direction(preview),
      exit = C.exit(preview);
    assert.deepEqual([box.w, box.h], turn % 2 ? [120, 160] : [160, 120]);
    assert.deepEqual(dir, expected[turn]);
    assert.equal(
      exit.x,
      preview.x + dir.x * ((dir.x ? box.w : box.h) / 2 + 36),
    );
    assert.equal(
      exit.y,
      preview.y + dir.y * ((dir.x ? box.w : box.h) / 2 + 36),
    );
    const beyond = C.advance(preview, exit, 80);
    assert.equal((beyond.x - exit.x) * dir.x + (beyond.y - exit.y) * dir.y, 80);
    const square = C.snap("outpost", 1000, 2000, turn);
    assert.deepEqual([C.rect(square).w, C.rect(square).h], [160, 160]);
  }
  for (const turn of [-1, 4, 1.5, "1", NaN])
    assert.equal(C.snap("foundry", 1000, 2000, turn), null);
});

test("each extractor orientation completes, spawns a real drone outside its footprint and mines its automatically chosen deposit", () => {
  for (const profile of ["frontier-8", "frontier-9"])
    for (let turn = 0; turn < 4; turn++) {
      const s = ready(profile),
        mine = s.campaign.mines.find((m) => m.id === "west");
      visit(s, mine);
      const u = build(s, "outpost", mine, turn),
        b = C.rect(u);
      assert.equal(E.development.items(s).outpost.label, "Экстрактор");
      assert.equal(u.site, mine.id);
      assert.equal(u.construction.turn, turn);
      assert.equal(u.construction.footprint, 4);
      assert.deepEqual([b.w, b.h], [160, 160]);
      const ids = new Set(s.units.map((v) => v.id)),
        stock = mine.remaining;
      assert(E.purchase(s, "drone", u.id).allowed);
      let drone;
      for (let i = 0; i < 1500 && !drone; i++) {
        E.step(s);
        drone = s.units.find((v) => !ids.has(v.id) && v.kind === "drone");
      }
      assert(drone, "Training must finish");
      const dir = C.direction(u),
        exit = C.exit(u, E.C.drone.r);
      assert(
        (drone.x - exit.x) * dir.x + (drone.y - exit.y) * dir.y >=
          -E.C.drone.speed * E.DT - 0.01,
      );
      assert(E.free(drone.x, drone.y, E.C.drone.r, E.navigation(s)));
      assert.equal(drone.node, u.id);
      const deposits = s.campaign.deposited;
      frames(s, 3600);
      assert(
        mine.remaining < stock,
        "Drone must reach and harvest its assigned source",
      );
      assert(
        s.campaign.deposited > deposits,
        "Cargo must reach a service exit",
      );
      E.refreshRecon(s);
      const restored = E.restore(E.snapshot(s));
      assert(restored, profile + " turn " + turn + " must restore");
      assert.deepEqual(restored, E.snapshot(s));
    }
});

test("all barracks orientations reserve a safe rally and train soldiers through the matching door", () => {
  for (let turn = 0; turn < 4; turn++) {
    const s = ready(),
      u = build(s, "barracks", E.hero(s), turn),
      dir = C.direction(u),
      ids = new Set(s.units.map((v) => v.id));
    const exit = C.exit(u);
    assert.equal(
      (u.rally.x - exit.x) * dir.x + (u.rally.y - exit.y) * dir.y,
      70,
    );
    assert(E.purchase(s, "rifle", u.id).allowed);
    let rifle;
    for (let i = 0; i < 1700 && !rifle; i++) {
      E.step(s);
      rifle = s.units.find((v) => !ids.has(v.id) && v.kind === "rifle");
    }
    assert(rifle);
    const door = C.exit(u, E.C.rifle.r);
    assert(
      (rifle.x - door.x) * dir.x + (rifle.y - door.y) * dir.y >=
        -E.C.rifle.speed * E.DT - 0.01,
    );
    E.refreshRecon(s);
    assert(E.restore(s));
  }
});

test("legacy 3x3 extractors retain their original reserved area, queues and orientation on load", () => {
  const s = ready(),
    mine = s.campaign.mines.find((m) => m.id === "west");
  visit(s, mine);
  const u = build(s, "outpost", mine, 0);
  delete u.construction.footprint;
  u.x += 20;
  u.y += 20;
  u.construction.work = C.exit(u);
  C.replan(s);
  E.refreshRecon(s);
  assert(E.purchase(s, "drone", u.id).allowed);
  const before = E.snapshot(s),
    restored = E.restore(before);
  assert(restored);
  assert.deepEqual(restored, before);
  assert.deepEqual([C.rect(u).w, C.rect(u).h], [120, 120]);
  assert.deepEqual(
    [
      C.rect(C.snap("outpost", u.x + 300, u.y, 0)).w,
      C.rect(C.snap("outpost", u.x + 300, u.y, 0)).h,
    ],
    [160, 160],
  );
});

test("one source cannot receive duplicate extractors and malformed construction metadata is rejected", () => {
  const s = ready(),
    mine = s.campaign.mines.find((m) => m.id === "west");
  visit(s, mine);
  const u = build(s, "outpost", mine, 2);
  E.refreshRecon(s);
  for (const change of [
    (v) => (v.construction.footprint = 3),
    (v) => (v.construction.footprint = 5),
    (v) => (v.construction.turn = 4),
    (v) => (v.construction.work.x += 1),
  ]) {
    const copy = E.snapshot(s);
    change(copy.units.find((v) => v.id === u.id));
    assert.equal(E.restore(copy), null);
  }
  const before = E.snapshot(s);
  let duplicate;
  for (let y = mine.y - 300; y <= mine.y + 300; y += 40)
    for (let x = mine.x - 300; x <= mine.x + 300; x += 40) {
      const o = C.check(s, "outpost", { x, y });
      if (o.reason === "occupied-mine") duplicate = o;
    }
  assert(duplicate);
  assert.deepEqual(E.snapshot(s), before);
});
console.log(`${checks} industry-update checks passed.`);
