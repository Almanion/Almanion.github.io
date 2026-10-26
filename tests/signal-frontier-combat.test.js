const assert = require("node:assert/strict"),
  E = require("../game-source/signal-frontier/src/engine");
let count = 0;
function test(name, fn) {
  fn();
  console.log("PASS " + name);
  count++;
}
function setup(profile = "classic", team = 0, grazing = false) {
  const s = E.make(profile),
    offset = E.map(s).id === "expedition" ? 560 : 0;
  const u = s.units.find((u) => (team ? u.kind === "sentinel" : u.group === 1)),
    target = team ? E.hero(s) : E.living(s, "jammer");
  for (const v of s.units)
    if (
      v !== u &&
      v !== target &&
      v.kind !== "citadel" &&
      v.kind !== "base" &&
      v.kind !== "hero"
    )
      v.hp = 0;
  if (s.campaign) s.campaign.camps.forEach((c) => (c.reserve = 0));
  Object.assign(u, {
    x: 550,
    y: (grazing ? 319 : 450) + offset,
    cool: 0,
    path: [],
    target: null,
    think: 0,
    wind: 0,
  });
  Object.assign(target, { x: 800, y: (grazing ? 319 : 450) + offset });
  if (u.ai)
    Object.assign(u.ai, {
      home: { x: u.x, y: u.y },
      seen: { x: target.x, y: target.y, id: target.id },
      seenAt: 0,
      raid: true,
      goal: { x: target.x, y: target.y },
      waypoints: [],
      squad: 0,
    });
  return { s, u, target };
}
function walk(from, path) {
  let length = 0,
    last = from;
  for (const p of path) {
    assert(E.free(p.x, p.y, E.C[from.kind].r, from.map));
    assert(E.clear({ ...last, map: from.map }, p, E.C[from.kind].r - 1e-7));
    length += E.dist(last, p);
    last = p;
  }
  return length;
}
test("firing positions route around cover for light, heavy and melee troops on every map", () => {
  for (const map of ["classic", "frontier", "expedition"])
    for (const kind of ["rifle", "artillery", "sentinel", "warden", "runner"]) {
      const offset = map === "expedition" ? 560 : 0,
        from = { kind, map, x: 550, y: 450 + offset },
        target = { x: 800, y: 450 + offset };
      const path = E.firingPath(from, target);
      assert(path.length, JSON.stringify({ map, kind }));
      walk(from, path);
      const end = { ...path.at(-1), kind, map };
      assert(E.dist(end, target) <= E.C[kind].range * 0.9 + 1e-6);
      assert(E.fireClear(end, target));
    }
});
test("the firing route chooses the nearer end of a long wall", () => {
  const from = { kind: "rifle", map: "classic", x: 550, y: 560 },
    target = { x: 800, y: 560 },
    path = E.firingPath(from, target);
  assert(path.length);
  assert(path.some((p) => p.y > 585));
  assert(path.every((p) => p.y > 500));
  assert(walk(from, path) < 270);
});
test("a visible grazing aim is not a clear bolt corridor", () => {
  const u = { kind: "rifle", x: 550, y: 319 },
    target = { x: 800, y: 319 };
  assert(E.clear(u, target));
  assert(!E.fireClear(u, target));
  const path = E.firingPath(u, target);
  assert(path.length);
  assert(walk(u, path) < 60);
  assert(E.fireClear({ ...path.at(-1), kind: u.kind }, target));
});
for (const profile of ["classic", "frontier-4"])
  for (const grazing of [false, true])
    test(
      "allied attack reaches a firing lane without wasting shots on cover " +
        profile +
        " " +
        grazing,
      () => {
        const { s, u, target } = setup(profile, 0, grazing);
        assert(E.attackUnits(s, [u.id], target.id));
        let shots = 0,
          travelled = 0;
        for (let i = 0; i < 900 && target.hp > 0; i++) {
          const before = { x: u.x, y: u.y };
          E.step(s);
          travelled += E.dist(before, u);
          assert(E.dist(before, u) <= E.C[u.kind].speed * E.DT + 1e-6);
          assert(E.free(u.x, u.y, E.C[u.kind].r, u.map));
          if (
            s.events.some(
              (e) => e.type === "shot" && e.kind === u.kind && e.team === 0,
            )
          ) {
            shots++;
            assert(E.fireClear(u, target));
          }
          assert(!s.events.some((e) => e.type === "spark"));
          if (shots >= 3) break;
        }
        assert(shots >= 3);
        assert(travelled > 0);
        assert(target.hp < E.C[target.kind].hp);
      },
    );
for (const grazing of [false, true])
  test(
    "enemy follows its last observation around cover, then fires from a clear lane " +
      grazing,
    () => {
      const { s, u, target } = setup("frontier-4", 1, grazing);
      let shots = 0;
      for (let i = 0; i < 900 && s.status === "playing"; i++) {
        E.step(s);
        if (
          s.events.some(
            (e) => e.type === "shot" && e.kind === u.kind && e.team === 1,
          )
        ) {
          shots++;
          assert(E.fireClear(u, target));
        }
        assert(!s.events.some((e) => e.type === "spark"));
        if (shots === 2) break;
      }
      assert(shots >= 2);
    },
  );
test("pursuit never updates unseen enemy coordinates and resumes deterministically after reload", () => {
  const { s, u, target } = setup();
  E.attackUnits(s, [u.id], target.id);
  Object.assign(target, { x: 1300, y: 450 });
  for (let i = 0; i < 30; i++) E.step(s);
  assert.equal(u.target.x, 800);
  const loaded = E.restore(E.snapshot(s));
  assert(loaded);
  for (let i = 0; i < 60; i++) {
    E.step(s);
    E.step(loaded);
  }
  assert.deepEqual(E.snapshot(s), E.snapshot(loaded));
});
test("an enemy approaches the nearest firing lane, not the remembered target centre", () => {
  const { s, u, target } = setup("frontier-4", 1);
  u.y = 1120;
  target.y = 1120;
  u.ai.home = { x: u.x, y: u.y };
  u.ai.seen = { x: target.x, y: target.y, id: target.id };
  E.development.enemy(s, u, E.DT, [target]);
  assert(u.path.length);
  assert(walk(u, u.path) < 270);
  assert(E.dist(u.path.at(-1), target) > 60);
  assert(E.fireClear({ ...u.path.at(-1), kind: u.kind, map: u.map }, target));
});
console.log(count + " combat navigation checks passed.");
