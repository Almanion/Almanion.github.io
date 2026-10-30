"use strict";
const assert = require("node:assert/strict"),
  { E, fund, build, frames } = require("./signal-frontier-construction.cjs");
let cached;
function field() {
  if (!cached) {
    const s = E.make("frontier-9");
    s.units.filter((u) => u.team && u.kind !== "citadel").forEach((u) => u.hp = 0);
    s.campaign.camps.forEach((c) => c.reserve = 0);
    fund(s, 1200); E.refreshRecon(s);
    build(s, "bunker");
    for (const u of s.units.filter((u) => u.kind === "drone")) E.commandSelection(s, [u.id], u);
    E.refreshRecon(s); cached = E.snapshot(s);
  }
  const s = E.restore(cached); assert(s, "Bunker fixture restores"); return s;
}
function enter(s, u, b = E.living(s, "bunker")) {
  assert(E.support.admit(s, [u.id], b.id).allowed);
  for (let i = 0; i < 2400 && !u.care?.inside; i++) E.step(s);
  assert(u.care?.inside, "Troop walks to the real door"); E.refreshRecon(s); return u;
}
function valid(s) {
  E.refreshRecon(s); const snap = E.snapshot(s), copy = E.restore(snap);
  assert(copy, "Save restores"); assert.deepEqual(copy, snap); return copy;
}
module.exports = { E, field, enter, valid, fund, build, frames };
