"use strict";
const assert = require("node:assert/strict"),
  E = require("../game-source/signal-frontier/src/engine"),
  Models = require("../game-source/signal-frontier/src/unit-models");
const models = Models.create(E, { MAT: {} });
assert.deepEqual([...Models.types].sort(), Object.keys(E.C).sort());
let checked = 0;
for (const kind of Models.types)
  for (const hp of [0, E.C[kind].hp])
    for (const angle of [0, Math.PI / 4, Math.PI, Math.PI * 1.5]) {
      const u = { kind, hp, angle, combat: { angle, mode: "idle" } },
        p = { angle, move: 1 },
        before = JSON.stringify([u, p]);
      const parts = models.shadows(u, p);
      assert(parts.length > 0, kind);
      for (const part of parts) {
        assert(Number.isFinite(part.height) && part.height >= 0, kind);
        assert(Number.isFinite(part.angle), kind);
        assert(part.shape.length >= 3, kind);
        assert(
          part.shape.every(
            (point) => point.length === 2 && point.every(Number.isFinite),
          ),
          kind,
        );
      }
      assert.equal(JSON.stringify([u, p]), before);
      checked++;
    }
for (const kind of ["scout", "drone"]) {
  const parts = models.shadows(
    { kind, hp: 1, angle: 0 },
    { angle: 0, move: 0 },
  );
  assert(
    parts.every((part) =>
      part.shape.every(([x, y]) => Math.hypot(x, y) < E.C[kind].r + 8),
    ),
    "Unarmed sensor gained a gun shadow",
  );
}
const moving = models.shadows(
    { kind: "mortar", hp: 1, angle: 0, combat: { mode: "idle", angle: 0 } },
    { angle: 0, move: 1 },
  ),
  deployed = models.shadows(
    { kind: "mortar", hp: 1, angle: 0, combat: { mode: "aim", angle: 0 } },
    { angle: 0, move: 0 },
  );
assert(
  Math.max(...deployed.map((p) => p.height)) >
    Math.max(...moving.map((p) => p.height)),
);
console.log(
  `PASS registry, ${checked} finite immutable silhouettes, unarmed sensors and mortar deployment`,
);

// A planted foot cancels body travel, and gait phase does not depend on RAF rate.
for (const kind of Object.keys(Models.gaits)) {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const poses = new Map(),
      u = { id: 17, kind, x: 0, y: 0, hp: 1, angle: 0 };
    Models.motion(poses, u, 0);
    let pose;
    for (let i = 1; i <= hz; i++) {
      u.x = (E.C[kind].speed * i) / hz;
      pose = Models.motion(poses, u, i / hz);
    }
    const paused = Models.motion(poses, u, 1);
    assert.deepEqual(paused, pose, `${kind} changed pose during pause`);
    traces.push(pose.phase);
    const stopped = Models.motion(poses, u, 1.1);
    assert.equal(stopped.move, 0, `${kind} runs against a blocked route`);
    const before = JSON.stringify(u);
    Models.motion(poses, u, 1.1, true);
    assert.equal(JSON.stringify(u), before);
  }
  assert(
    Math.max(...traces) - Math.min(...traces) < 1e-10,
    `${kind} depends on refresh rate`,
  );
}
for (const cycle of Object.values(Models.gaits)) {
  const p = { cycle, move: 1, phase: 0.2 * Math.PI * 2 },
    d = 0.1,
    a = Models.contact(p),
    b = Models.contact({ ...p, phase: p.phase + (d / cycle) * Math.PI * 2 });
  assert(a.planted && b.planted);
  assert(Math.abs(b.x + d - a.x) < 1e-10, "Planted foot slides in world space");
}
const poses = new Map(),
  tank = { id: 1, kind: "tank", hp: 1, x: 0, y: 0, angle: 0 };
Models.motion(poses, tank, 0);
tank.angle = Math.PI / 4;
const turned = Models.motion(poses, tank, 0.1);
assert(turned.left < 0 && turned.right > 0, "Tank tracks do not counterrotate");
for (let id = 2; id < 800; id++) Models.motion(poses, { ...tank, id }, 0);
assert(poses.size <= 512, "Animation cache grew without a limit");
const heroPoses = new Map(),
  walkingHero = { id: 1, kind: "hero", hp: 1, x: 0, y: 0, angle: 0 };
Models.motion(heroPoses, walkingHero, 0);
walkingHero.x = -2;
const backwards = Models.motion(heroPoses, walkingHero, 1 / 60);
assert(
  backwards.move > 0 && backwards.move < 1,
  "The first step jumps immediately to full reach",
);
assert.equal(
  backwards.angle,
  0,
  "Hero's feet force the aim into the direction of travel",
);
assert(Math.abs(backwards.direction - Math.PI) < 1e-12);
const settle = Models.motion(heroPoses, walkingHero, 2 / 60);
assert(
  settle.settle > 0 && settle.move === 0,
  "Last step snaps straight to rest",
);
assert.equal(Models.motion(heroPoses, walkingHero, 1).settle, 0);
console.log(
  "PASS distance-based gaits at 30/60/120 Hz, planted contacts, pause, stops, counterrotation and bounded state",
);
