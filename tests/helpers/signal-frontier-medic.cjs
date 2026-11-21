"use strict";
const { E, fund, build, frames } = require("./signal-frontier-construction.cjs");

const fields = new Map();
function barracksField(profile = "frontier-9") {
  if (!fields.has(profile)) {
    const s = E.make(profile, { resources: 2 });
    const guard = s.units.filter((u) => u.kind === "sentinel").at(-1);
    for (const u of s.units) if (u.team && u.kind !== "citadel" && u !== guard) u.hp = 0;
    s.campaign.camps.forEach((camp) => camp.reserve = 0);
    fund(s, 500);
    build(s, "barracks", E.hero(s));
    s.campaign.tier = 2;
    E.refreshRecon(s);
    fields.set(profile, E.snapshot(s));
  }
  return E.restore(fields.get(profile));
}
function graduate(s, kind = "medic") {
  const b = E.living(s, "barracks"), before = s.seq;
  if (!E.purchase(s, kind, b.id).allowed) throw Error("Recruit unavailable: " + kind);
  frames(s, Math.ceil(E.development.items(s)[kind].time / E.DT) + 2);
  const u = s.units.find((v) => v.kind === kind && v.id > before);
  if (!u) throw Error("Recruit did not leave the barracks");
  return u;
}
module.exports = { E, frames, barracksField, graduate };
