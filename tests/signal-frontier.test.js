"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const E = require("../game-source/signal-frontier/src/engine");
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("PASS " + name);
}
function frames(s, n, input = {}) {
  for (let i = 0; i < n; i++) E.step(s, input);
}
function removeEnemies(s) {
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
}
function phaseTwo() {
  const s = E.make();
  removeEnemies(s);
  const h = E.hero(s);
  h.x = 830;
  h.y = 480;
  frames(s, 170, { interact: true });
  return s;
}

test("fixed-step simulation is deterministic across render batching", () => {
  const a = E.make(),
    b = E.make();
  for (let i = 0; i < 600; i++)
    E.step(a, { x: i < 250 ? 1 : 0, aim: { x: 800, y: 500 }, fire: true });
  for (let frame = 0; frame < 150; frame++)
    for (let j = 0; j < 4; j++) {
      const i = frame * 4 + j;
      E.step(b, { x: i < 250 ? 1 : 0, aim: { x: 800, y: 500 }, fire: true });
    }
  assert.deepEqual(a, b);
  assert.throws(() => E.step(a, {}, 1 / 30));
});
test("movement, dash and route planning respect solid obstacles", () => {
  const s = E.make(),
    h = E.hero(s);
  removeEnemies(s);
  h.x = 570;
  h.y = 450;
  frames(s, 100, { x: 1, dash: true });
  assert.ok(h.x <= 586 && E.free(h.x, h.y));
  const route = E.pathTo({ x: 550, y: 450 }, { x: 800, y: 450 }, 14);
  assert.ok(route.length > 8);
  assert.ok(route.every((p) => E.free(p.x, p.y, 14)));
  assert.equal(E.order(s, 1, NaN, 10), false);
});
test("orders freeze until time advances and route around walls", () => {
  const s = E.make();
  removeEnemies(s);
  const u = s.units.find((u) => u.group === 1);
  u.x = 550;
  u.y = 450;
  const before = { x: u.x, y: u.y, t: s.t };
  E.order(s, 1, 810, 450);
  assert.equal(u.x, before.x);
  assert.equal(s.t, before.t);
  frames(s, 600);
  assert.ok(u.x > 760);
  assert.ok(E.free(u.x, u.y, E.C.rifle.r));
});
test("bullets hit cover rather than targets behind it", () => {
  const s = E.make();
  removeEnemies(s);
  const h = E.hero(s),
    j = s.units.find((u) => u.kind === "jammer");
  h.x = 560;
  h.y = 450;
  j.x = 760;
  j.y = 450;
  j.hp = 340;
  frames(s, 100, { aim: j, fire: true });
  assert.equal(j.hp, 340);
  assert.ok(s.shots > 0);
});
test("swept bullets hit a narrow target and reload completes", () => {
  const s = E.make();
  removeEnemies(s);
  const h = E.hero(s),
    j = s.units.find((u) => u.kind === "jammer");
  h.x = 650;
  h.y = 200;
  j.x = 900;
  j.y = 200;
  j.hp = 340;
  frames(s, 120, { aim: j, fire: true });
  assert.ok(j.hp < 340);
  E.step(s, { reload: true });
  assert.ok(s.reload > 0);
  frames(s, 80);
  assert.equal(s.ammo, 12);
  assert.equal(s.reload, 0);
});
test("citadel cannot be damaged while its shield is active", () => {
  const s = E.make();
  removeEnemies(s);
  const h = E.hero(s),
    c = E.living(s, "citadel");
  h.x = 950;
  h.y = 485;
  frames(s, 110, { aim: c, fire: true, dash: true });
  assert.equal(c.hp, E.C.citadel.hp);
});
test("relay requires jammer removal, proximity and uninterrupted action", () => {
  const s = E.make(),
    h = E.hero(s);
  h.x = 830;
  h.y = 480;
  frames(s, 10, { interact: true });
  assert.equal(s.relay.charge, 0);
  removeEnemies(s);
  frames(s, 60, { interact: true });
  assert.equal(s.phase, 1);
  assert.ok(s.relay.charge > 0.3);
  const charge = s.relay.charge;
  frames(s, 40);
  assert.ok(s.relay.charge < charge);
  h.x = 500;
  frames(s, 200, { interact: true });
  assert.equal(s.phase, 1);
  h.x = 830;
  frames(s, 180, { interact: true });
  assert.equal(s.phase, 2);
  assert.equal(s.relay.online, false);
  assert.equal(E.living(s, "artillery"), undefined);
});
test("enemy presence interrupts activation; two waves precede artillery", () => {
  const s = phaseTwo();
  assert.equal(s.phase, 2);
  const j = s.units.find((u) => u.kind === "jammer");
  j.hp = 340;
  j.x = 850;
  j.y = 480;
  frames(s, 120);
  assert.equal(s.relay.stability, 0);
  j.hp = 0;
  for (let i = 0; i < 1800 && s.phase === 2; i++) {
    removeEnemies(s);
    E.step(s);
  }
  assert.equal(s.wave, 2);
  assert.equal(s.phase, 3);
  assert.equal(s.relay.online, true);
  assert.ok(E.living(s, "artillery"));
});
test("victory and each defeat cause are terminal", () => {
  for (const cause of ["hero", "base", "citadel"]) {
    const s = E.make();
    s.units.find((u) => u.kind === cause).hp = 0;
    E.step(s);
    assert.equal(s.status, cause === "citadel" ? "won" : "lost");
    const copy = E.snapshot(s);
    frames(s, 100, { fire: true, x: 1 });
    assert.deepEqual(E.snapshot(s), copy);
  }
});
test("snapshot restores all combat state without sharing references", () => {
  const s = E.make();
  E.order(s, 1, 800, 550);
  frames(s, 100, { fire: true, aim: { x: 510, y: 540 }, x: 1 });
  const saved = E.snapshot(s),
    restored = E.restore(saved);
  assert.ok(restored);
  for (let i = 0; i < 100; i++) {
    E.step(s, { x: 1 });
    E.step(restored, { x: 1 });
  }
  assert.deepEqual(E.snapshot(restored), E.snapshot(s));
  assert.notEqual(saved.units[0].x, s.units[0].x);
});
test("corrupt saves are rejected safely", () => {
  for (const change of [
    (s) => (s.units[0].x = Infinity),
    (s) => (s.phase = 99),
    (s) => (s.units[0].target = { x: null, y: 3 }),
    (s) => (s.bullets = [{ kind: "shell" }]),
    (s) => s.units.push({ ...s.units[0], id: 999 }),
    (s) => (s.relay.stability = 2),
    (s) => (s.relay.online = true),
    (s) => (s.units[0].hp = 0),
    (s) => (s.units[0].cool = -4),
    (s) => (s.units[0].path = [null]),
  ]) {
    const s = E.snapshot(E.make());
    change(s);
    assert.equal(E.restore(s), null);
  }
  assert.equal(E.restore(null), null);
  assert.equal(E.restore("bad"), null);
});
test("complete operation is winnable through movement, firing and squad orders", () => {
  const s = E.make();
  E.order(s, 1, 500, 650);
  let route = [],
    goal = -1;
  const phases = new Set();
  for (let i = 0; i < 12000 && s.status === "playing"; i++) {
    const h = E.hero(s),
      target = s.units
        .filter(
          (u) =>
            u.team &&
            u.hp > 0 &&
            !(u.kind === "citadel" && !s.relay.online) &&
            E.dist(u, h) < 590 &&
            E.clear(u, h),
        )
        .sort((a, b) => E.dist(a, h) - E.dist(b, h))[0];
    const dest =
      s.phase === 0
        ? { x: 950, y: 210 }
        : s.phase <= 2
          ? { x: 830, y: 480 }
          : { x: 1010, y: 490 };
    if (s.phase !== goal || (!route.length && E.dist(h, dest) > 35)) {
      goal = s.phase;
      route = E.pathTo(h, dest);
      if (s.phase === 2) E.order(s, 1, 850, 600);
      if (s.phase === 3) {
        E.order(s, 1, 1080, 485);
        E.order(s, 2, 1040, 540);
      }
    }
    while (route.length && E.dist(h, route[0]) < 10) route.shift();
    const p = route[0],
      d = p ? E.dist(h, p) : 0;
    E.step(s, {
      x: p ? (p.x - h.x) / d : 0,
      y: p ? (p.y - h.y) / d : 0,
      aim: target,
      fire: !!target,
      dash: s.bullets.some((b) => b.team === 1 && E.dist(b, h) < 100),
      interact: s.phase === 1 && E.dist(h, s.relay) < 75,
    });
    phases.add(s.phase);
  }
  assert.equal(s.status, "won");
  assert.equal(phases.size, 4);
  assert.equal(s.wave, 2);
  assert.ok(s.t > 35 && s.t < 180);
  assert.ok(E.hero(s).hp > 0);
  assert.ok(E.restore(E.snapshot(s)));
});
test("published files exactly match canonical sources and stay self-contained", () => {
  const root = path.resolve(__dirname, "..");
  for (const f of ["index.html", "style.css", "engine.js", "view.js", "app.js"])
    assert.deepEqual(
      fs.readFileSync(path.join(root, "game-source/signal-frontier/src", f)),
      fs.readFileSync(path.join(root, "games/signal-frontier", f)),
    );
  const html = fs.readFileSync(
    path.join(root, "games/signal-frontier/index.html"),
    "utf8",
  );
  assert.doesNotMatch(html, /src="https?:|href="https?:/);
  const js = fs.readFileSync(
    path.join(root, "games/signal-frontier/app.js"),
    "utf8",
  );
  assert.doesNotMatch(js, /orbital-courier-save|orbital-eclipse|fetch\(/);
});
console.log(`${passed} Signal Frontier checks passed.`);
