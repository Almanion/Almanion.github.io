"use strict";
const assert = require("node:assert/strict"),
  E = require("../../game-source/signal-frontier/src/engine");
function scene(profile, tankPoint, riflePoint) {
  const s = E.make(profile),
    tank = s.units.find((u) => u.kind === "tank"),
    rifle = s.units.find((u) => u.kind === "rifle");
  for (const u of s.units)
    if (u.team && u !== tank && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((camp) => (camp.reserve = 0));
  const angle = Math.atan2(
    riflePoint.y - tankPoint.y,
    riflePoint.x - tankPoint.x,
  );
  Object.assign(tank, tankPoint, {
    cool: 0,
    think: 0,
    path: [],
    wind: 0,
    target: null,
    angle,
  });
  Object.assign(tank.ai, {
    home: { ...tankPoint },
    raid: true,
    seen: null,
    seenAt: 0,
    goal: { ...riflePoint },
  });
  Object.assign(tank.combat, {
    mode: "idle",
    angle,
    time: 0,
    total: 0,
    burst: 0,
    gap: 0,
  });
  Object.assign(rifle, riflePoint, {
    cool: 0,
    think: 0,
    path: [],
    target: null,
    order: null,
  });
  E.refreshRecon(s);
  assert(E.restore(s), "Fixture must be a valid complete operation");
  return { s, tank, rifle };
}
module.exports = { E, scene };
