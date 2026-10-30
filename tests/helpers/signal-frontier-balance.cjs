"use strict";
const assert = require("node:assert/strict"), E = require("../../game-source/signal-frontier/src/engine");
function frames(s, n) { for (let i = 0; i < n && s.status === "playing"; i++) E.step(s); }
function scene(kind, distance, enemy = true, spotter = false) {
  const raw = E.make("frontier-9"),
    shooter = raw.units.find((u) => enemy ? u.kind === kind : u.kind === "rifle"),
    target = raw.units.find((u) => enemy ? u.kind === "rifle" : u.kind === "tank"),
    scout = spotter && raw.units.find((u) => u.kind === "rifle" && u !== shooter && u !== target);
  for (const u of raw.units)
    if (u !== shooter && u !== target && u !== scout && !["hero", "base", "citadel"].includes(u.kind)) u.hp = 0;
  raw.campaign.camps.forEach((c) => c.reserve = 0);
  raw.campaign.tier = 3;
  Object.assign(shooter, { kind, x: 400, y: 3600, hp: E.C[kind].hp, angle: 0,
    cool: 0, wind: 0, think: 0, path: [], order: null, target: null, group: enemy ? 0 : kind === "artillery" ? 2 : 1 });
  Object.assign(target, { x: 400 + distance, y: 3600, cool: 5, wind: 0, path: [], order: null, target: null });
  for (const u of [shooter, target].filter((u) => u.team)) {
    Object.assign(u.ai, { home: { x: u.x, y: u.y }, goal: null, raid: false, seen: null, seenAt: 0, vx: 0, vy: 0 });
    Object.assign(u.combat, { mode: "idle", time: 0, total: 0, angle: 0, burst: 0, gap: 0 });
  }
  if (scout) Object.assign(scout, { kind: "scout", x: 400, y: 3670, hp: E.C.scout.hp, group: 1, path: [], order: null });
  E.refreshRecon(raw);
  const s = E.restore(raw);
  assert(s, "Combat fixture must be a valid operation");
  return { s, u: s.units.find((u) => u.id === shooter.id), target: s.units.find((u) => u.id === target.id),
    scout: scout && s.units.find((u) => u.id === scout.id) };
}
module.exports = { E, scene, frames };
