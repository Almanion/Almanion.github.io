"use strict";
const assert = require("node:assert/strict");
const E = require("../game-source/signal-frontier/src/engine");
let passed = 0;
function test(name, fn) {
  fn();
  console.log("PASS " + name);
  passed++;
}
function safeRoute(from, route, radius, map) {
  let last = from;
  for (const p of route) {
    const count = Math.max(1, Math.ceil(E.dist(last, p)));
    for (let i = 0; i <= count; i++) {
      const x = last.x + ((p.x - last.x) * i) / count,
        y = last.y + ((p.y - last.y) * i) / count;
      assert.ok(
        E.free(x, y, radius, map),
        JSON.stringify({ map, radius, last, p, x, y }),
      );
    }
    last = p;
  }
}
test("open ground uses a direct diagonal instead of staircase cells", () => {
  const from = { x: 200, y: 430 },
    to = { x: 450, y: 600 };
  const route = E.pathTo(from, to, 12);
  assert.deepEqual(route, [to]);
});
test("a wall detour has gradual bends and clears the complete unit footprint", () => {
  const from = { x: 550, y: 450 },
    to = { x: 800, y: 450 };
  for (const r of [8, 12, 14, 20]) {
    const route = E.pathTo(from, to, r);
    assert.deepEqual(route.at(-1), to);
    safeRoute(from, route, r, "classic");
    const points = [from, ...route];
    let maxTurn = 0;
    for (let i = 2; i < points.length; i++) {
      const a = Math.atan2(
        points[i - 1].y - points[i - 2].y,
        points[i - 1].x - points[i - 2].x,
      );
      const b = Math.atan2(
        points[i].y - points[i - 1].y,
        points[i].x - points[i - 1].x,
      );
      maxTurn = Math.max(
        maxTurn,
        Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))),
      );
    }
    assert.ok(maxTurn < 0.65, JSON.stringify({ r, maxTurn }));
  }
});
test("all maps keep clear continuous routes for light and heavy units", () => {
  let seed = 314159;
  const random = () =>
    (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
  for (const map of ["classic", "frontier", "expedition"]) {
    const world = E.map(map);
    for (const radius of [8, 12, 20]) {
      const point = () => {
        let p;
        do {
          p = {
            x: 50 + random() * (world.W - 100),
            y: 50 + random() * (world.H - 100),
            map,
          };
        } while (!E.free(p.x, p.y, radius, map));
        return p;
      };
      for (let i = 0; i < 18; i++) {
        const from = point(),
          to = point(),
          route = E.pathTo(from, to, radius);
        assert.ok(route.length, JSON.stringify({ from, to, radius }));
        safeRoute(from, route, radius, map);
        assert.ok(
          E.dist(route.at(-1), to) < 0.001,
          JSON.stringify({ from, to, end: route.at(-1), radius }),
        );
      }
    }
  }
});
test("unreachable orders stop outside cover instead of cutting through it", () => {
  const from = { x: 550, y: 450 };
  for (const to of [
    { x: 650, y: 450 },
    { x: -500, y: 1500 },
    { x: 5000, y: 5000 },
  ]) {
    const route = E.pathTo(from, to, 20);
    safeRoute(from, route, 20, "classic");
    assert.ok(route.every((p) => E.free(p.x, p.y, 20)));
  }
});
test("subset orders preserve other troops, rallies, time and resources", () => {
  const s = E.make("frontier-6"),
    rifles = s.units.filter((u) => u.group === 1),
    h = E.hero(s);
  const other = JSON.stringify(rifles[2]),
    economy = JSON.stringify(s.economy),
    before = s.t;
  const enemy = s.units.find((u) => u.team),
    base = E.living(s, "base");
  base.rally = { x: 160, y: 1800 };
  assert.ok(
    E.orderUnits(
      s,
      [rifles[0].id, rifles[0].id, rifles[1].id, enemy.id, h.id, base.id, 9999],
      500,
      1500,
    ),
  );
  assert.ok(rifles[0].path.length && rifles[1].path.length);
  assert.equal(JSON.stringify(rifles[2]), other);
  assert.deepEqual(base.rally, { x: 160, y: 1800 });
  assert.equal(JSON.stringify(s.economy), economy);
  assert.equal(s.t, before);
  assert.equal(h.order, null);
  assert.equal(enemy.order, null);
  assert.equal(E.orderUnits(s, [], 500, 1500), false);
  assert.equal(E.orderUnits(s, [rifles[0].id], NaN, 1500), false);
});
test("movement stays at the speed cap, arrives exactly and resumes the same curve after reload", () => {
  let s = E.make("classic");
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  const u = s.units.find((u) => u.group === 1);
  Object.assign(u, { x: 550, y: 450 });
  E.orderUnits(s, [u.id], 800, 450);
  let restored = null;
  for (let i = 0; i < 1200 && u.path.length; i++) {
    const before = { x: u.x, y: u.y };
    E.step(s);
    assert.ok(E.dist(before, u) <= E.C.rifle.speed * E.DT + 1e-6);
    assert.ok(E.free(u.x, u.y, E.C.rifle.r));
    if (i === 100) {
      restored = E.restore(E.snapshot(s));
      assert.ok(restored);
    } else if (restored) {
      E.step(restored);
      assert.deepEqual(E.snapshot(restored), E.snapshot(s));
    }
  }
  assert.equal(u.path.length, 0);
  assert.ok(E.dist(u, { x: 800, y: 450 }) < 1e-6);
});
test("mixed selections leave room for heavy units without changing group orders", () => {
  const s = E.make("frontier-6"),
    rifle = s.units.find((u) => u.group === 1);
  const heavies = [0, 1].map((i) => ({
    ...rifle,
    id: ++s.seq,
    kind: "artillery",
    group: 2,
    hp: E.C.artillery.hp,
    x: 300 + i * 60,
    y: 1800,
    path: [],
    order: null,
  }));
  s.units.push(...heavies);
  assert.ok(
    E.orderUnits(s, [...heavies.map((u) => u.id), rifle.id], 700, 1700),
  );
  const units = [...heavies, rifle];
  for (let i = 0; i < units.length; i++)
    for (let j = i + 1; j < units.length; j++)
      assert.ok(
        E.dist(units[i].order, units[j].order) >=
          E.C[units[i].kind].r + E.C[units[j].kind].r + 4,
      );
});
console.log(passed + " movement and selection checks passed.");
