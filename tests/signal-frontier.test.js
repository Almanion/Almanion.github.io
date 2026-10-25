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
test("enemy presence interrupts activation; two waves unlock the supply route", () => {
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
  assert.equal(E.living(s, "artillery"), undefined);
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

function quiet() {
  const s = E.make();
  removeEnemies(s);
  E.living(s, "citadel").cool = 5;
  return s;
}
function collect(s, index = 0) {
  const h = E.hero(s),
    cache = s.caches[index];
  h.x = cache.x;
  h.y = cache.y;
  frames(s, 75, { interact: true });
}
function post(s, site = "west") {
  const pad = E.PADS.find((p) => p.id === site),
    h = E.hero(s);
  h.x = pad.x - 50;
  h.y = pad.y;
  assert.equal(E.purchase(s, "outpost", site).allowed, true);
  frames(s, 361);
  return s.units.find(
    (u) => u.kind === "outpost" && u.site === site && u.hp > 0,
  );
}

test("finite salvage is collected once and only while holding nearby", () => {
  const s = quiet(),
    h = E.hero(s);
  frames(s, 100, { interact: true });
  assert.equal(s.economy.alloy, 120);
  const c = s.caches[0];
  h.x = c.x;
  h.y = c.y;
  frames(s, 30, { interact: true });
  assert.ok(c.charge > 0 && c.charge < 1);
  frames(s, 90);
  assert.equal(c.charge, 0);
  collect(s);
  assert.equal(s.economy.alloy, 160);
  frames(s, 150, { interact: true });
  assert.equal(s.economy.alloy, 160);
  assert.ok(c.taken);
  assert.ok(E.restore(E.snapshot(s)));
});
test("prices are atomic, double orders cannot spend twice, and insufficient funds are unchanged", () => {
  const s = quiet();
  assert.equal(E.purchase(s, "hack").allowed, true);
  assert.equal(s.economy.alloy, 60);
  const before = E.snapshot(s);
  assert.equal(E.purchase(s, "hack").reason, "installed");
  assert.deepEqual(E.snapshot(s), before);
  assert.equal(E.purchase(s, "bad").allowed, false);
  post(s);
  assert.equal(s.economy.alloy, 10);
  s.units.find((u) => u.kind === "rifle").hp = 0;
  const copy = E.snapshot(s);
  assert.equal(E.purchase(s, "rifle").reason, "funds");
  assert.deepEqual(E.snapshot(s), copy);
});
test("construction requires a clear nearby site, progresses only in simulation, and waits for the scout", () => {
  const s = E.make();
  assert.equal(E.purchase(s, "outpost", "flank").reason, "distance");
  const h = E.hero(s);
  h.x = 1170;
  h.y = 300;
  assert.equal(E.purchase(s, "outpost", "flank").reason, "hostiles");
  removeEnemies(s);
  assert.equal(E.purchase(s, "outpost", "flank").allowed, true);
  const u = E.living(s, "outpost"),
    money = s.economy.alloy;
  assert.equal(u.build, 6);
  assert.equal(E.purchase(s, "outpost", "flank").reason, "occupied");
  assert.equal(s.economy.alloy, money);
  h.x = 500;
  frames(s, 50);
  assert.equal(u.build, 6);
  h.x = 1170;
  frames(s, 60);
  assert.ok(u.build < 5.01 && u.build > 4.9);
  const resumed = E.restore(E.snapshot(s));
  assert.ok(resumed);
  assert.equal(E.living(resumed, "outpost").build, u.build);
});
test("dismantling refunds exactly once, including unfinished work; destroyed sites can be rebuilt", () => {
  const s = quiet(),
    h = E.hero(s);
  h.x = 450;
  h.y = 690;
  E.purchase(s, "outpost", "west");
  assert.equal(E.purchase(s, "salvage", "west").allowed, true);
  assert.equal(s.economy.alloy, 95);
  const copy = E.snapshot(s);
  assert.equal(E.purchase(s, "salvage", "west").allowed, false);
  assert.deepEqual(E.snapshot(s), copy);
  E.purchase(s, "outpost", "west");
  E.living(s, "outpost").hp = 0;
  collect(s);
  h.x = 450;
  h.y = 690;
  assert.equal(E.purchase(s, "outpost", "west").allowed, true);
  assert.ok(E.restore(E.snapshot(s)));
});
test("repair needs a complete post, time outside fire and line of sight; dead units stay dead", () => {
  const s = quiet(),
    u = post(s),
    rifle = s.units.find((u) => u.kind === "rifle");
  rifle.x = u.x + 55;
  rifle.y = u.y;
  rifle.hp = 50;
  rifle.repair = 3;
  frames(s, 120);
  assert.equal(rifle.hp, 50);
  frames(s, 120);
  assert.ok(rifle.hp > 56 && rifle.hp < 58);
  rifle.hp = 0;
  frames(s, 120);
  assert.equal(rifle.hp, 0);
  const q = quiet(),
    pad = post(q, "flank"),
    covered = q.units.find((u) => u.kind === "rifle");
  covered.x = 1203;
  covered.y = 170;
  covered.hp = 50;
  assert.ok(E.free(covered.x, covered.y, 12));
  assert.equal(E.clear(pad, covered), false);
  frames(q, 120);
  assert.equal(covered.hp, 50);
});
test("reinforcement fills losses at a valid position and artillery needs relay plus infrastructure", () => {
  const s = quiet();
  assert.equal(E.purchase(s, "artillery").reason, "relay");
  assert.equal(E.purchase(s, "rifle").reason, "squad-full");
  s.phase = 3;
  s.relay.online = true;
  s.relay.charge = s.relay.stability = 1;
  assert.equal(E.purchase(s, "artillery").reason, "post");
  const p = post(s);
  collect(s);
  assert.equal(E.purchase(s, "artillery").allowed, true);
  const arty = E.living(s, "artillery");
  assert.ok(E.free(arty.x, arty.y, E.C.artillery.r));
  assert.ok(E.dist(arty, p) > 50);
  assert.equal(E.purchase(s, "artillery").reason, "artillery-limit");
  const lost = s.units.find((u) => u.kind === "rifle");
  lost.hp = 0;
  assert.equal(E.purchase(s, "rifle").allowed, true);
  assert.equal(s.units.filter((u) => u.kind === "rifle" && u.hp > 0).length, 3);
  assert.equal(s.economy.alloy, 0);
});
test("two outposts are the limit and dismantling creates room for another location", () => {
  const s = quiet();
  post(s);
  collect(s);
  post(s, "relay");
  const h = E.hero(s);
  h.x = 1170;
  h.y = 300;
  assert.equal(E.purchase(s, "outpost", "flank").reason, "post-limit");
  assert.equal(E.purchase(s, "salvage", "west").allowed, true);
  assert.equal(E.purchase(s, "outpost", "flank").allowed, true);
  assert.ok(E.restore(E.snapshot(s)));
});
test("terminal needs the module; channeling prevents shooting, opens the shield and calls guards only once", () => {
  const s = quiet(),
    h = E.hero(s);
  h.x = 1280;
  h.y = 200;
  frames(s, 145, { interact: true });
  assert.equal(s.terminal.window, 0);
  assert.equal(E.interaction(s).allowed, false);
  E.purchase(s, "hack");
  const shots = s.shots;
  frames(s, 140, { interact: true, fire: true });
  assert.equal(s.shots, shots);
  assert.equal(E.shielded(s), false);
  assert.equal(s.terminal.alarm, true);
  const count = s.units.length;
  removeEnemies(s);
  frames(s, 100, { interact: true });
  assert.equal(s.units.length, count);
  assert.ok(s.terminal.window > 6.9);
  frames(s, 425);
  assert.equal(s.terminal.window, 0);
  assert.equal(E.shielded(s), true);
  assert.equal(E.objective(s).id, "terminal");
});
test("terminal snapshot resumes with the same countdown and does not repeat the alarm", () => {
  const s = quiet(),
    h = E.hero(s);
  h.x = 1280;
  h.y = 200;
  E.purchase(s, "hack");
  frames(s, 140, { interact: true });
  const copy = E.restore(E.snapshot(s));
  assert.ok(copy);
  frames(s, 60);
  frames(copy, 60);
  assert.deepEqual(E.snapshot(copy), E.snapshot(s));
});
test("version-one saves retain positions, damage, orders and the promised support", () => {
  const old = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "fixtures/signal-frontier-v1.json"),
        "utf8",
      ),
    ),
    s = E.restore(old);
  assert.ok(s);
  assert.equal(s.version, 2);
  assert.equal(s.t, old.t);
  assert.equal(s.ammo, old.ammo);
  assert.equal(s.dash, old.dash);
  assert.equal(E.hero(s).hp, 112);
  assert.deepEqual(s.relay, old.relay);
  assert.equal(s.economy.legacySupport, true);
  for (let i = 0; i < 1800 && s.phase < 3; i++) {
    removeEnemies(s);
    E.step(s);
  }
  assert.ok(E.living(s, "artillery"));
  assert.equal(s.economy.legacySupport, false);
  assert.equal(s.economy.alloy, 120);
  assert.ok(E.restore(E.snapshot(s)));
});
test("economy and strategy corruption cannot create money, malformed buildings or an unearned breach", () => {
  for (const change of [
    (s) => s.economy.alloy++,
    (s) => (s.economy.spent = -1),
    (s) => (s.economy.kit = "yes"),
    (s) => (s.terminal.window = 9),
    (s) => (s.terminal.window = 3),
    (s) => (s.caches[0].taken = true),
    (s) => (s.caches[0].x = 0),
    (s) => (s.approach = "other"),
    (s) => (s.units[5].kind = "__proto__"),
    (s) => (s.units[0].repair = Infinity),
  ]) {
    const s = E.make();
    change(s);
    assert.equal(E.restore(s), null);
  }
});
const { play } = require("./helpers/signal-pilot.cjs");
for (const route of ["siege", "infiltration"])
  test(
    route +
      " completes the whole operation with legal commands and distinct tradeoffs",
    () => {
      const { state: s } = play(route);
      assert.equal(s.status, "won");
      assert.equal(s.approach, route);
      assert.ok(E.restore(E.snapshot(s)));
      assert.ok(s.units.some((u) => u.kind === "outpost" && u.hp > 0));
      assert.ok(E.hero(s).hp > 0);
      assert.ok(s.t < 180);
      if (route === "siege") {
        assert.equal(s.relay.online, true);
        assert.equal(s.wave, 2);
        assert.ok(s.units.some((u) => u.kind === "artillery"));
        assert.equal(s.economy.kit, false);
        assert.equal(s.economy.spent, 140);
        assert.ok(s.caches.some((c) => c.taken));
      } else {
        assert.equal(s.relay.online, false);
        assert.equal(s.wave, 0);
        assert.equal(s.terminal.alarm, true);
        assert.equal(s.economy.kit, true);
        assert.equal(s.economy.spent, 110);
        assert.equal(
          s.units.some((u) => u.kind === "artillery"),
          false,
        );
      }
    },
  );
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
