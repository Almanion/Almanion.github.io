"use strict";
const assert = require("node:assert/strict"),
  E = require("../game-source/signal-frontier/src/engine"),
  D = E.development;
let n = 0;
function test(name, fn) {
  fn();
  console.log("PASS " + name);
  n++;
}
const advance = (s, t) => {
  for (let i = 0; i < t * 60; i++) E.step(s);
};
function fund(s, amount) {
  for (const m of s.campaign.mines) {
    const a = Math.min(amount, m.remaining);
    m.remaining -= a;
    s.campaign.deposited += a;
    s.economy.alloy += a;
    amount -= a;
  }
  assert.equal(amount, 0);
}
test("new expedition extends both sides of the landing area and all objectives are reachable", () => {
  const s = E.make(),
    h = E.hero(s);
  assert.equal(s.version, 5);
  assert.equal(E.map(s).H, 2560);
  assert.equal(D.pads(s).length, 5);
  assert.ok(D.pads(s).some((p) => p.y < h.y - 1000));
  assert.ok(D.pads(s).some((p) => p.y > h.y + 500));
  for (const p of [
    ...D.pads(s),
    ...s.units.filter((u) => u.kind === "bastion"),
    s.terminal,
    s.relay,
  ]) {
    const path = E.pathTo(h, p);
    assert.ok(path.length);
    assert.ok(E.dist(path.at(-1), p) < 60, JSON.stringify(p));
  }
  assert.ok(E.restore(s));
  for (const u of s.units) assert.ok(E.free(u.x, u.y, E.C[u.kind].r, u.map));
});
test("versions 2, 3 and 4 retain geometry, prices, reserves and round trips", () => {
  for (const [profile, version, width, cost] of [
    ["classic", 2, 1440, 20],
    ["frontier-1", 3, 1920, 35],
    ["frontier-2", 4, 1920, 65],
  ]) {
    const s = E.make(profile);
    assert.equal(s.version, version);
    assert.equal(E.map(s).W, width);
    assert.equal(s.campaign ? D.items(s).rifle.cost : E.COSTS.rifle, cost);
    assert.deepEqual(E.restore(E.snapshot(s)), s);
  }
});
test("barracks rally affects future recruits without moving the current squad", () => {
  const s = E.make();
  assert.ok(E.purchase(s, "barracks").allowed);
  advance(s, 31);
  const b = E.living(s, "barracks"),
    orders = s.units.filter((u) => u.group).map((u) => u.order);
  assert.ok(E.setRally(s, b.id, 440, 1700));
  assert.deepEqual(
    s.units.filter((u) => u.group).map((u) => u.order),
    orders,
  );
  assert.equal(E.setRally(s, b.id, NaN, 1700), false);
  assert.equal(E.setRally(s, b.id, 1500, 1200), false);
  fund(s, 1000);
  assert.ok(E.purchase(s, "rifle").allowed);
  advance(s, 25);
  const recruit = s.units.filter((u) => u.kind === "rifle").at(-1);
  assert.ok(E.dist(recruit.order, b.rally) < 1);
  assert.ok(E.restore(s));
  b.hp = 0;
  b.jobs = [];
  assert.equal(E.setRally(s, b.id, 440, 1700), false);
});
test("three enemy bases assemble mixed squads and a destroyed base stops its own reinforcements", () => {
  const s = E.make();
  s.t = 500;
  const camp = s.campaign.camps[0];
  camp.cooldown = 0;
  D.operation(s, {}, E.DT);
  assert.equal(camp.warning, 9);
  for (let i = 0; i < 542; i++) D.operation(s, {}, E.DT);
  const squad = s.units.filter((u) => u.ai?.squad === 1);
  assert.ok(squad.length >= 5);
  assert.ok(squad.some((u) => u.kind === "warden"));
  assert.ok(squad.every((u) => u.ai.assembleUntil > s.t));
  const before = camp.reserve;
  s.units.find((u) => u.id === camp.source).hp = 0;
  camp.cooldown = 0;
  for (let i = 0; i < 600; i++) D.operation(s, {}, E.DT);
  assert.equal(camp.reserve, before);
  assert.ok(E.restore(s));
});
test("unseen expansions are not available to enemy target selection", () => {
  const s = E.make();
  fund(s, 300);
  const p = D.pads(s).find((p) => p.id === "north");
  Object.assign(E.hero(s), { x: p.x + 50, y: p.y });
  assert.ok(E.purchase(s, "outpost", "north").allowed);
  // No enemy vision is advanced here; a new building is not magically shared with the director.
  s.campaign.camps[0].cooldown = 0;
  D.operation(s, {}, E.DT);
  const b = E.living(s, "base");
  assert.deepEqual(s.campaign.camps[0].target, { x: b.x, y: b.y });
});
test("new sector, map, squad and mine corruption is rejected", () => {
  const s = E.make();
  for (const corrupt of [
    (v) => (v.units.find((u) => u.kind === "bastion").sector = "fake"),
    (v) => (v.units[0].map = "frontier"),
    (v) => (v.campaign.mines[4].remaining = 999999),
    (v) => (v.campaign.id = "frontier-2"),
    (v) => (v.units.find((u) => u.team).ai.squad = 999),
  ]) {
    const x = E.snapshot(s);
    corrupt(x);
    assert.equal(E.restore(x), null);
  }
  assert.ok(E.restore(s));
});
test("new enemies cannot be injected into legacy snapshots", () => {
  for (const profile of ["classic", "frontier-1", "frontier-2"]) {
    const s = E.make(profile);
    const u = s.units.find((u) => u.kind === "sentinel");
    u.kind = "warden";
    assert.equal(E.restore(s), null);
  }
});
const { play } = require("./helpers/signal-frontier-expedition-pilot.cjs");
for (const route of ["siege", "infiltration"])
  test(
    "full expedition " +
      route +
      " wins with finite resources and a restorable result",
    () => {
      const { state: s, pilot } = play(route, 132000);
      assert.equal(
        s.status,
        "won",
        JSON.stringify({ t: s.t, stage: pilot.stage, money: s.economy.alloy }),
      );
      assert.equal(s.approach, route);
      assert.ok(s.t >= 1200 && s.t <= 2100, s.t);
      assert.ok(E.restore(s));
      assert.ok(s.units.some((u) => u.kind === "bastion" && u.hp === 0));
      assert.ok(s.units.some((u) => u.kind === "bastion" && u.hp > 0));
      assert.ok(s.units.length <= D.rules(s).unitLimit);
      assert.ok(JSON.stringify(s).length < 2000000);
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
console.log(n + " expedition checks passed.");
