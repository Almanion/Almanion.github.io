"use strict";
const assert = require("node:assert/strict");
const { E, barracksField } = require("./signal-frontier-medic.cjs");
const { fund, build, frames } = require("./signal-frontier-construction.cjs");

const fields = new Map();
function foundryField(profile = "frontier-9") {
  if (!fields.has(profile)) {
    const s = barracksField(profile);
    fund(s, 1500);
    build(s, "foundry", E.hero(s));
    fields.set(profile, E.snapshot(s));
  }
  const s = E.restore(fields.get(profile));
  assert.ok(s);
  return s;
}
function train(s, kind, count = 1) {
  const factory = E.living(s, ["rifle","scout"].includes(kind) ? "barracks" : "foundry"), first = s.seq;
  for (let i = 0; i < count; i++) {
    if (factory.jobs.length === 3) frames(s, Math.ceil(factory.jobs[0].remaining / E.DT) + 1);
    assert.ok(E.purchase(s, kind, factory.id).allowed);
  }
  frames(s, Math.ceil(factory.jobs.reduce((n, job) => n + job.remaining, 0) / E.DT) + count + 1);
  const team = s.units.filter(u => u.kind === kind && u.id > first);
  assert.equal(team.length, count);
  return team;
}
function place(u, x, y) {
  Object.assign(u, { x, y, order: null, target: null, path: [], think: 0, cool: 0 });
  if (u.drive) Object.assign(u.drive, { heading: 0, speed: 0 });
  if (u.ai) Object.assign(u.ai, { home: { x, y }, seen: null });
}
module.exports = { E, foundryField, train, place, frames };
