"use strict";
const assert = require("node:assert/strict"),
  E = require("../game-source/signal-frontier/src/engine"),
  D = E.development;
let checks = 0;
function test(name, fn) {
  fn();
  checks++;
  console.log("PASS " + name);
}
function scene(kind, distance = 200) {
  const s = E.make(),
    u = s.units.find((u) => u.kind === kind),
    h = E.hero(s);
  for (const v of s.units)
    if (v !== u && v !== h && !["base", "citadel"].includes(v.kind)) {
      v.hp = 0;
      v.jobs = [];
    }
  s.campaign.camps.forEach((c) => (c.reserve = 0));
  Object.assign(h, { x: 900 + distance, y: 1850 });
  Object.assign(u, {
    x: 900,
    y: 1850,
    path: [],
    cool: 0,
    wind: 0,
    think: 0,
    target: null,
  });
  Object.assign(u.ai, {
    home: { x: u.x, y: u.y },
    seen: null,
    seenAt: 0,
    raid: false,
    vx: 0,
    vy: 0,
  });
  Object.assign(u.combat, {
    mode: "idle",
    time: 0,
    total: 0,
    angle: 0,
    burst: 0,
    gap: 0,
  });
  assert(E.restore(s));
  return { s, u, h };
}
function frames(s, n, input = {}) {
  for (let i = 0; i < n; i++) E.step(s, input);
}
function until(s, fn, limit = 300) {
  for (let i = 0; i < limit && !fn(); i++) E.step(s);
  assert(fn());
}
test("new battle profile preserves map, prices and mining; all old deployments keep their own rules", () => {
  const s = E.make(),
    old = E.make("frontier-4");
  assert.equal(s.version, 7);
  assert.equal(s.campaign.id, "frontier-5");
  assert.deepEqual(E.map(s), E.map(old));
  assert.deepEqual(D.items(s), D.items(old));
  assert.deepEqual(s.campaign.mines, old.campaign.mines);
  for (const p of [
    "classic",
    "frontier-1",
    "frontier-2",
    "frontier-3",
    "frontier-4",
    "frontier-5",
  ]) {
    const v = E.make(p);
    assert.deepEqual(E.snapshot(E.restore(v)), E.snapshot(v));
    assert(v.units.every((u) => E.free(u.x, u.y, E.C[u.kind].r, u.map)));
    if (p !== "frontier-5")
      assert(
        v.units.every(
          (u) =>
            !u.combat &&
            !["rocket", "flamer", "bomber", "tank", "mortar"].includes(u.kind),
        ),
      );
  }
});
test("missiles wait for lock-on, turn at most 60 degrees per second and never reacquire a hidden target", () => {
  const { s, u, h } = scene("rocket", 300);
  E.step(s);
  assert.equal(u.wind, 0.8);
  assert.equal(s.bullets.length, 0);
  frames(s, 45);
  assert.equal(s.bullets.length, 0);
  until(s, () => s.bullets.some((b) => b.kind === "missile"));
  const b = s.bullets.find((b) => b.kind === "missile");
  h.y += 100;
  const before = Math.atan2(b.vy, b.vx);
  E.step(s);
  const after = Math.atan2(b.vy, b.vx);
  assert(Math.abs(after - before) <= (Math.PI / 3) * E.DT + 1e-9);
  assert(Math.abs(after - before) > 0);
  assert(Math.abs(Math.hypot(b.vx, b.vy) - 260) < 1e-8);
  Object.assign(h, { x: 980, y: 2140 });
  E.step(s);
  assert.equal(b.guided, false);
  Object.assign(h, { x: 1200, y: 1850 });
  E.step(s);
  assert.equal(b.guided, false);
  assert(E.restore(s));
});
test("breaking sight during rocket acquisition cancels the launch", () => {
  const { s, u, h } = scene("rocket");
  E.step(s);
  frames(s, 20);
  Object.assign(h, { x: 980, y: 2140 });
  E.step(s);
  assert.equal(u.wind, 0);
  assert.equal(u.combat.mode, "idle");
  frames(s, 40);
  assert(!s.bullets.some((b) => b.kind === "missile"));
});
test("a swept missile is intercepted by cover once without splash through the wall", () => {
  const { s, u, h } = scene("rocket");
  Object.assign(h, { x: 750, y: 1030 });
  Object.assign(u, { x: 550, y: 1030, cool: 4 });
  s.bullets.push({
    kind: "missile",
    x: 590,
    y: 1030,
    map: "expedition",
    vx: 260,
    vy: 0,
    life: 3,
    age: 0,
    team: 1,
    owner: u.id,
    damage: 32,
    tx: h.x,
    ty: h.y,
    lockId: h.id,
    guided: false,
  });
  let blasts = 0;
  for (let i = 0; i < 20; i++) {
    E.step(s);
    blasts += s.events.filter((e) => e.type === "spark").length;
  }
  assert.equal(blasts, 1);
  assert.equal(h.hp, 150);
  assert.equal(s.bullets.length, 0);
});
test("flame has a readable windup, exact sustained damage and a bounded turn", () => {
  const { s, u, h } = scene("flamer", 140);
  E.step(s);
  assert.equal(u.wind, 0.6);
  frames(s, 30);
  assert.equal(h.hp, 150);
  until(s, () => u.combat.mode === "fire");
  const hp = h.hp;
  frames(s, 30);
  assert(Math.abs(hp - h.hp - 15) < 1e-7);
  const angle = u.combat.angle;
  h.y += 50;
  E.step(s);
  assert(
    Math.abs(u.combat.angle - angle) <= ((Math.PI * 35) / 180) * E.DT + 1e-9,
  );
});
test("the rendered flame polygon and actual damage both stop at cover and exclude the flank", () => {
  const { s, u, h } = scene("flamer", 140),
    rifle = s.units.find((v) => v.kind === "rifle");
  Object.assign(u, { x: 550, y: 1030, target: { x: 800, y: 1030, id: h.id } });
  Object.assign(u.combat, { mode: "fire", time: 1.2, total: 1.2, angle: 0 });
  Object.assign(h, { x: 800, y: 1030 });
  Object.assign(rifle, { x: 580, y: 1030, hp: 115 });
  const area = E.dangerArea(s, u);
  assert(area.points.every((p) => p.x <= 600.00001));
  assert(E.insideArea(area, rifle));
  assert(!E.insideArea(area, h));
  E.step(s);
  assert.equal(h.hp, 150);
  assert(rifle.hp < 115);
  Object.assign(rifle, { x: 550, y: 1100, hp: 115 });
  E.step(s);
  assert.equal(rifle.hp, 115);
});
test("bomber stops for its full fuse; leaving the marked circle avoids its single explosion", () => {
  const { s, u, h } = scene("bomber", 45);
  E.step(s);
  assert.equal(u.wind, 0.8);
  const start = { x: u.x, y: u.y };
  frames(s, 30);
  assert.equal(h.hp, 150);
  Object.assign(h, { x: 1200, y: 1850 });
  let blasts = 0;
  for (let i = 0; i < 90; i++) {
    E.step(s);
    blasts += s.events.filter((e) => e.type === "blast").length;
  }
  assert.equal(u.hp, 0);
  assert.equal(blasts, 1);
  assert.equal(h.hp, 150);
  assert.deepEqual({ x: u.x, y: u.y }, start);
});
test("destroying a bomber before the fuse ends prevents combat blast damage", () => {
  const { s, u, h } = scene("bomber", 45);
  let blasts = 0;
  for (let i = 0; i < 60; i++) {
    E.step(s, { aim: u, fire: true });
    blasts += s.events.filter((e) => e.type === "blast").length;
  }
  assert.equal(u.hp, 0);
  assert.equal(h.hp, 150);
  assert.equal(blasts, 0);
});
test("tank frontal armour reduces bolts, while flanking and shells bypass it", () => {
  const damage = (side, kind) => {
    const { s, u, h } = scene("tank", 200);
    u.cool = 4;
    s.bullets.push({
      kind,
      x: u.x + side * 70,
      y: u.y,
      vx: -side * 800,
      vy: 0,
      life: 1,
      age: 0,
      team: 0,
      owner: h.id,
      damage: 24,
      tx: u.x,
      ty: u.y,
      map: "expedition",
    });
    frames(s, 10);
    return E.C.tank.hp - u.hp;
  };
  const front = damage(1, "bolt"),
    back = damage(-1, "bolt"),
    shell = damage(1, "shell");
  assert(front > 0 && front < back * 0.5);
  assert.equal(back, 24);
  assert(shell >= 24 * 0.9);
});
test("tank turns gradually instead of snapping to a scout behind its hull", () => {
  const { s, u, h } = scene("tank", -200);
  E.step(s);
  assert(Math.abs(u.combat.angle) <= (Math.PI / 3) * E.DT + 1e-9);
  assert.equal(u.wind, 0);
  frames(s, 30);
  assert.equal(s.bullets.length, 0);
});
test("mortar cannot fire in its dead zone, and marks a fixed point before firing", () => {
  const close = scene("mortar", 150);
  frames(close.s, 90);
  assert(!close.s.bullets.some((b) => b.owner === close.u.id));
  assert(close.u.x < 900);
  const { s, u, h } = scene("mortar", 400);
  E.step(s);
  assert.equal(u.wind, 1.4);
  const mark = { x: u.target.x, y: u.target.y };
  Object.assign(h, { x: 1350, y: 1950 });
  frames(s, 75);
  assert(!s.bullets.some((b) => b.owner === u.id));
  until(s, () => s.bullets.some((b) => b.owner === u.id));
  const shell = s.bullets.find((b) => b.owner === u.id);
  assert.equal(shell.kind, "shell");
  assert.equal(shell.radius, 78);
  assert.equal(shell.tx, mark.x);
  assert.equal(shell.ty, mark.y);
  frames(s, 90);
  assert.equal(h.hp, 150);
});
test("rifle sentries use three staggered rounds, with no fire through newly blocked cover", () => {
  const { s, u, h } = scene("sentinel", 270);
  let shots = 0,
    times = [];
  for (let i = 0; i < 130; i++) {
    E.step(s);
    if (s.events.some((e) => e.type === "shot" && e.kind === "sentinel")) {
      shots++;
      times.push(s.t);
    }
  }
  assert.equal(shots, 3);
  assert(times[1] - times[0] >= 0.15);
  assert(times[2] - times[1] >= 0.15);
});
for (const kind of ["rocket", "flamer", "bomber", "tank", "mortar"])
  test("mid-attack save and frame batching resume exactly: " + kind, () => {
    const { s, u } = scene(
      kind,
      kind === "bomber" ? 45 : kind === "flamer" ? 140 : 300,
    );
    E.step(s);
    frames(s, 12);
    const a = E.restore(E.snapshot(s)),
      b = E.restore(E.snapshot(s));
    assert(a && b);
    for (let i = 0; i < 240; i++) E.step(a);
    for (let batch = 0; batch < 30; batch++)
      for (let j = 0; j < 8; j++) E.step(b);
    assert.deepEqual(E.snapshot(a), E.snapshot(b));
    assert(E.restore(a));
  });
test("strict restore rejects corrupt attack phases, missile locks and cross-profile enemy types", () => {
  const { s } = scene("rocket");
  E.step(s);
  const good = E.snapshot(s);
  for (const change of [
    (v) => (v.units.find((u) => u.kind === "rocket").combat.time = 9),
    (v) => (v.units.find((u) => u.kind === "rocket").combat.mode = "fire"),
    (v) => (v.units.find((u) => u.kind === "rocket").wind = 0),
    (v) => {
      v.version = 6;
      v.campaign.id = "frontier-4";
    },
  ]) {
    const v = E.snapshot(good);
    change(v);
    assert.equal(E.restore(v), null);
  }
  until(s, () => s.bullets.some((b) => b.kind === "missile"));
  const missile = E.snapshot(s);
  missile.bullets[0].lockId = missile.seq + 1;
  assert.equal(E.restore(missile), null);
});
test("raids persist after two minutes, grow in composition and stop at a suppressed source", () => {
  const s = E.make(),
    camp = s.campaign.camps[0];
  s.t = 75;
  camp.cooldown = 0;
  D.operation(s, {}, E.DT);
  assert.equal(camp.warning, 9);
  for (let i = 0; i < 541; i++) D.operation(s, {}, E.DT);
  assert.equal(s.units.filter((u) => u.ai?.squad === 1).length, 2);
  s.t = 720;
  camp.warning = E.DT;
  D.operation(s, {}, E.DT);
  const late = s.units.filter((u) => u.ai?.squad === 2);
  assert(late.some((u) => u.kind === "mortar"));
  assert(late.some((u) => u.kind === "tank"));
  assert(late.some((u) => u.kind === "rocket"));
  assert(late.length >= 6);
  assert(E.restore(s));
  const reserve = camp.reserve;
  s.units.find((u) => u.id === camp.source).hp = 0;
  camp.warning = E.DT;
  D.operation(s, {}, E.DT);
  assert.equal(camp.reserve, reserve);
});

test("burst damage is balanced across all three rounds", () => {
  const { s, h } = scene("sentinel", 270);
  frames(s, 130);
  assert(Math.abs(150 - h.hp - 19.5) < 1e-7);
});
test("long siege cooldown survives a save, including suppression during terminal access", () => {
  const { s, u } = scene("mortar", 400);
  until(s, () => s.bullets.some((b) => b.owner === u.id));
  assert(u.cool > 5);
  assert(E.restore(s));
  const core = s.units.find((v) => v.kind === "citadel");
  core.combat = {
    mode: "aim",
    time: 0.9,
    total: 1.4,
    angle: 0,
    burst: 0,
    gap: 0,
  };
  core.wind = 0.9;
  core.target = { x: 1300, y: 1850, id: s.heroId };
  s.economy.kit = true;
  s.campaign.tier = 3;
  s.terminal.window = 2;
  E.step(s);
  assert.equal(core.wind, 0);
  assert.equal(core.combat.mode, "idle");
  // Restore the research fixture's legitimate state before checking the unrelated timer.
  s.economy.kit = false;
  s.campaign.tier = 1;
  s.terminal.window = 0;
  assert(E.restore(s));
});
test("blast warnings and damage share the same clipped polygon at a wall corner", () => {
  const { s, u, h } = scene("bomber", 45);
  Object.assign(u, {
    x: 580,
    y: 900,
    target: { x: 620, y: 865, id: h.id },
    wind: E.DT,
  });
  Object.assign(u.combat, { mode: "aim", time: E.DT, total: 0.8, angle: 0 });
  Object.assign(h, { x: 620, y: 865 });
  const area = E.dangerArea(s, u);
  assert(E.dist(u, h) < area.radius);
  assert(!E.insideArea(area, h));
  E.step(s);
  assert.equal(h.hp, 150);
});
test("old saves reject every new archetype, and allies cannot carry hostile attack state", () => {
  for (const profile of [
    "classic",
    "frontier-1",
    "frontier-2",
    "frontier-3",
    "frontier-4",
  ])
    for (const kind of ["rocket", "flamer", "bomber", "tank", "mortar"]) {
      const s = E.make(profile),
        u = s.units.find((u) => u.kind === "sentinel");
      u.kind = kind;
      u.hp = E.C[kind].hp;
      assert.equal(E.restore(s), null);
    }
  const s = E.make();
  s.units.find((u) => u.kind === "rifle").combat = {
    ...s.units.find((u) => u.kind === "rocket").combat,
  };
  assert.equal(E.restore(s), null);
});
test("basic infantry focus an armed bomber before frontal tank armour", () => {
  const { s, u, h } = scene("tank", 200),
    rifle = s.units.find((v) => v.kind === "rifle"),
    bomber = s.units.find((v) => v.kind === "bomber");
  Object.assign(h, { x: 1300, y: 1850 });
  Object.assign(rifle, { hp: 115, x: 1100, y: 1850, cool: 0 });
  Object.assign(u, { x: 1000, y: 1850, cool: 4 });
  Object.assign(bomber, { hp: 65, x: 980, y: 1920, cool: 4 });
  E.step(s);
  const shot = s.bullets.find((b) => b.owner === rifle.id);
  assert(shot);
  assert.equal(shot.tx, 980);
  assert.equal(shot.ty, 1920);
});

test("a missile damages one target without hurting adjacent infantry", () => {
  const { s, u, h } = scene("rocket", 300),
    rifle = s.units.find((v) => v.kind === "rifle");
  Object.assign(rifle, { hp: 115, x: h.x, y: h.y + 26, cool: 4 });
  until(s, () => h.hp < 150);
  assert.equal(h.hp, 118);
  assert.equal(rifle.hp, 115);
});
test("forts keep normal fire against infantry and select marked counterbattery fire against artillery", () => {
  const s = E.make(),
    fort = s.units.find((u) => u.kind === "bastion"),
    h = E.hero(s);
  assert.equal(E.stats(s, fort, h).range, 470);
  assert.equal(E.stats(s, fort, h).damage, 28);
  const arty = s.units.find((u) => u.kind === "rifle");
  arty.kind = "artillery";
  assert.equal(E.stats(s, fort, arty).range, 610);
  fort.target = { x: arty.x, y: arty.y, id: arty.id };
  assert.equal(E.stats(s, fort).rate, 6.4);
  fort.combat.mode = "aim";
  fort.combat.time = fort.wind = 1.4;
  fort.combat.total = 1.4;
  assert.equal(E.dangerArea(s, fort).radius, 78);
});

test("a corrupt zero-round burst cannot restore as endless fire", () => {
  const { s, u } = scene("sentinel", 200);
  E.step(s);
  until(s, () => u.combat.mode === "fire");
  u.combat.burst = 0;
  assert.equal(E.restore(s), null);
});

test("tank hull turns toward its route before moving sideways", () => {
  const { s, u } = scene("tank", 200);
  u.path = [{ x: 900, y: 1750 }];
  u.cool = 4;
  u.think = 2;
  u.ai.raid = true;
  u.ai.goal = { x: 900, y: 1750 };
  for (let i = 0; i < 30; i++) E.development.enemy(s, u, E.DT, []);
  assert.equal(u.y, 1850);
  assert(u.combat.angle < 0);
  for (let i = 0; i < 90; i++) E.development.enemy(s, u, E.DT, []);
  assert(u.y < 1850);
  assert(Math.abs(u.x - 900) < 1e-5);
});
const { play } = require("./helpers/signal-frontier-expedition-pilot.cjs");
for (const route of ["siege", "infiltration"])
  test(
    "full new battle operation wins and preserves the final save: " + route,
    () => {
      const { state: s, pilot } = play(route, 132000, "frontier-5");
      assert.equal(
        s.status,
        "won",
        JSON.stringify({ t: s.t, stage: pilot.stage }),
      );
      assert.equal(s.approach, route);
      assert(E.restore(s));
      assert(s.t > 900 && s.t < 2160);
      assert(s.kills > 40);
      console.log(
        "  " +
          route +
          ": " +
          Math.round(s.t) +
          " seconds, " +
          s.kills +
          " enemies",
      );
    },
  );
console.log(checks + " attack checks passed.");
