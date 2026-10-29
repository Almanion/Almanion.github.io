"use strict";
const E = require("../../game-source/signal-frontier/src/engine");
function fund(s, n) {
  let left = n;
  for (const m of s.campaign.mines) {
    const amount = Math.min(left, m.remaining);
    m.remaining -= amount;
    left -= amount;
  }
  if (left) throw Error("Fixture exhausted");
  s.campaign.deposited += n;
  s.economy.alloy += n;
}
function field() {
  const s = E.make("frontier-8");
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((c) => (c.reserve = 0));
  E.refreshRecon(s);
  return s;
}
function findSite(s, kind, near = E.hero(s), turn = 0) {
  const candidates = [];
  for (let y = near.y - 400; y <= near.y + 400; y += 40)
    for (let x = near.x - 400; x <= near.x + 400; x += 40) {
      const p = { x, y, turn };
      if (E.dist(p, near) <= 420) candidates.push(p);
    }
  candidates.sort(
    (a, b) => E.dist(a, near) - E.dist(b, near) || a.y - b.y || a.x - b.x,
  );
  for (const p of candidates) {
    const o = E.construction.check(s, kind, p);
    if (o.allowed) return { x: o.preview.x, y: o.preview.y, turn };
  }
  return null;
}
function frames(s, n) {
  for (let i = 0; i < n && s.status === "playing"; i++) E.step(s);
}
function finish(s, u) {
  for (let i = 0; i < 18000 && u.build > 0 && s.status === "playing"; i++)
    E.step(s);
  if (u.build) throw Error("Builder did not finish " + u.id);
  return u;
}
function build(s, kind, near, turn = 0) {
  const p = findSite(s, kind, near, turn);
  if (!p) throw Error("No site for " + kind);
  const o = E.purchase(s, kind, p);
  if (!o.allowed) throw Error(o.reason);
  return finish(
    s,
    s.units.find((u) => u.id === o.buildingId),
  );
}
module.exports = { E, fund, field, findSite, frames, finish, build };
