"use strict";
const assert = require("node:assert/strict");
const E = require("../game-source/signal-frontier/src/engine");
const { play } = require("./helpers/signal-frontier-expedition-pilot.cjs");
const routes = process.env.SIGNAL_QA_ROUTE
  ? [process.env.SIGNAL_QA_ROUTE]
  : ["siege", "infiltration"];
for (const route of routes) {
  const start = performance.now();
  const result = play(route, 180000, "frontier-8", (s, p) => {
    if (Math.round(s.t) % 300 === 0) {
      assert(E.restore(s), "Checkpoint restore");
      console.log(
        JSON.stringify({
          route,
          t: Math.round(s.t),
          stage: p.stage,
          tier: s.campaign.tier,
          alloy: s.economy.alloy,
        }),
      );
    }
  });
  const s = result.state;
  console.log(
    JSON.stringify({
      route,
      status: s.status,
      time: Math.round(s.t),
      seconds: Math.round((performance.now() - start) / 1000),
    }),
  );
  assert.equal(s.status, "won");
  assert.equal(s.approach, route);
  assert(E.restore(s));
  assert(s.units.some((u) => u.kind === "arsenal" && u.construction));
  assert(
    s.units.filter((u) => u.kind === "outpost" && u.construction).length >= 2,
  );
  assert(s.economy.spent > 0 && s.t > 900 && s.t < 3000);
  assert(JSON.stringify(s).length < 2000000);
}
