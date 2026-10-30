"use strict";
const assert = require("node:assert/strict"),
  { E, scene } = require("./helpers/signal-frontier-tank-fire.cjs");
let checks = 0;
function test(name, run) {
  run();
  checks++;
  console.log("PASS " + name);
}
test("district tank and infantry exchange real damage on ground occupied only by an obsolete map wall", () => {
  const { s, tank, rifle } = scene(
    "frontier-9",
    { x: 1111.5, y: 2019 },
    { x: 1271.5, y: 2019 },
  );
  assert(
    E.terrain.map.walls.some(
      (w) =>
        tank.x > w.x &&
        tank.x < w.x + w.w &&
        tank.y > w.y &&
        tank.y < w.y + w.h,
    ),
  );
  assert(E.free(tank.x, tank.y, E.C.tank.r, E.map(s)));
  assert(E.fireClear(tank, rifle));
  assert(E.fireClear(rifle, tank));
  const shots = { tank: 0, rifle: 0 };
  for (let i = 0; i < 90; i++) {
    E.step(s);
    for (const e of s.events)
      if (e.type === "shot" && e.kind in shots) shots[e.kind]++;
  }
  assert(shots.tank > 0 && shots.rifle > 0);
  assert(tank.hp < E.C.tank.hp && rifle.hp < E.C.rifle.hp);
  assert(E.restore(s));
});
for (const [profile, tankPoint, riflePoint] of [
  ["frontier-5", { x: 510, y: 1146 }, { x: 810, y: 1146 }],
  ["frontier-9", { x: 1770, y: 359 }, { x: 1200, y: 359 }],
]) {
  test(
    "tank turns onto its reachable firing lane and resumes fire: " + profile,
    () => {
      const { s, tank, rifle } = scene(profile, tankPoint, riflePoint);
      assert(E.clear(tank, rifle));
      assert(!E.fireClear(tank, rifle));
      assert(E.dist(tank, rifle) < E.stats(s, tank, rifle).range);
      const route = E.firingPath(tank, rifle);
      assert(route.length);
      let shots = 0;
      for (let i = 0; i < 600; i++) {
        const before = { x: tank.x, y: tank.y, angle: tank.combat.angle };
        E.step(s);
        assert(E.dist(before, tank) <= E.C.tank.speed * E.DT + 1e-6);
        assert(E.travelClear(before, tank, E.C.tank.r, E.navigation(s)));
        const turn = Math.acos(
          Math.max(-1, Math.min(1, Math.cos(tank.combat.angle - before.angle))),
        );
        assert(
          turn <= (Math.PI / 3) * E.DT + 1e-6,
          "Chassis must retain its slow turn",
        );
        shots += s.events.filter(
          (e) => e.type === "shot" && e.kind === "tank",
        ).length;
        if (shots && rifle.hp < E.C.rifle.hp) break;
      }
      assert(
        E.dist(tank, tankPoint) > 2,
        "Tank waited at a reachable blocked lane",
      );
      assert(shots > 0, "Tank never resumed firing");
      assert(
        rifle.hp < E.C.rifle.hp,
        "Shot must reach the target, not pass through cover",
      );
      assert(E.restore(s));
    },
  );
  test(
    "saving during the turn preserves the firing route and outcome: " + profile,
    () => {
      const { s, tank } = scene(profile, tankPoint, riflePoint);
      for (let i = 0; i < 12; i++) E.step(s);
      assert(tank.path.length);
      const loaded = E.restore(E.snapshot(s));
      assert(loaded);
      let shots = 0;
      for (let i = 0; i < 300; i++) {
        E.step(s);
        E.step(loaded);
        shots += s.events.filter(
          (e) => e.type === "shot" && e.kind === "tank",
        ).length;
      }
      assert(shots > 0);
      assert.deepEqual(E.snapshot(s), E.snapshot(loaded));
    },
  );
}
console.log(checks + " tank-fire checks passed.");
