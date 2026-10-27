"use strict";
const assert = require("node:assert/strict"),
  E = require("../game-source/signal-frontier/src/engine"),
  { play } = require("./helpers/signal-frontier-expedition-pilot.cjs");
const routes = process.env.SIGNAL_QA_ROUTE
  ? [process.env.SIGNAL_QA_ROUTE]
  : ["siege", "infiltration"];
for (const route of routes) {
  const begin = performance.now(),
    {
      state: s,
      pilot,
      trace,
    } = play(route, 180000, "frontier-7", (s, p) => {
      if (Math.round(s.t) % 300 === 0) {
        assert(E.restore(s));
        if (process.env.SIGNAL_QA_SHOTS)
          require("node:fs").writeFileSync(
            require("node:path").join(
              process.env.SIGNAL_QA_SHOTS,
              "terrain-" + route + "-" + Math.round(s.t) + ".json",
            ),
            JSON.stringify({ state: E.snapshot(s), pilot: p }),
          );
      }
      if (Math.round(s.t) % 300 === 0)
        console.log(
          JSON.stringify({
            route,
            t: Math.round(s.t),
            stage: p.stage,
            hero: Math.round(E.hero(s).hp),
            base: Math.round(E.living(s, "base")?.hp || 0),
            army: E.development.population(s),
            tier: s.campaign.tier,
            alloy: s.economy.alloy,
            goal: p.goal,
          }),
        );
    });
  console.log(
    JSON.stringify({
      route,
      status: s.status,
      time: Math.round(s.t),
      stage: pilot.stage,
      kills: s.kills,
      wallSeconds: Math.round((performance.now() - begin) / 1000),
      saveBytes: JSON.stringify(s).length,
    }),
  );
  if (s.status !== "won")
    console.log(
      JSON.stringify({
        hero: E.hero(s),
        base: E.living(s, "base"),
        log: pilot.log,
        trace,
        survivors: s.units
          .filter((u) => u.hp > 0)
          .map((u) => [
            u.id,
            u.kind,
            Math.round(u.hp),
            Math.round(u.x),
            Math.round(u.y),
          ]),
        stage: pilot.stage,
        goal: pilot.goal,
      }),
    );
  assert.equal(s.status, "won");
  assert.equal(s.approach, route);
  assert(E.restore(s));
  assert(s.t > 900 && s.t < 3000);
  assert(s.kills > 40);
  assert(JSON.stringify(s).length < 2000000);
}
console.log(
  "PASS terrain operations: " +
    routes.join(", ") +
    "; visible-target controls and valid final saves",
);
