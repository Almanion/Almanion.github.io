"use strict";
const assert = require("node:assert/strict"),
  E = require("../game-source/signal-frontier/src/engine"),
  { play } = require("./helpers/signal-frontier-expedition-pilot.cjs");
const fs = require("node:fs"),
  path = require("node:path"),
  evidence = process.env.SIGNAL_QA_DIR || ".local-qa/map-validation";
fs.mkdirSync(evidence, { recursive: true });
const outcomes = [];
for (const route of process.env.SIGNAL_QA_ROUTE
  ? [process.env.SIGNAL_QA_ROUTE]
  : ["siege", "infiltration"]) {
  const start = performance.now();
  const resume =
    process.env.SIGNAL_QA_CHECKPOINT &&
    route === (process.env.SIGNAL_QA_ROUTE || "siege")
      ? JSON.parse(
          require("node:fs").readFileSync(
            process.env.SIGNAL_QA_CHECKPOINT,
            "utf8",
          ),
        )
      : null;
  if (resume && resume.pilot?.route !== route)
    throw Error("Checkpoint route does not match the requested operation");
  const result = play(
    route,
    180000,
    "frontier-9",
    (s, p) => {
      if (Math.round(s.t) % 300 === 0) {
        assert(E.restore(s), "Saved map state must restore");
        require("node:fs").writeFileSync(
          path.join(evidence, "checkpoint-" + route + ".json"),
          JSON.stringify({ state: E.snapshot(s), pilot: p }),
        );
        console.log(
          JSON.stringify({
            route,
            time: Math.round(s.t),
            stage: p.stage,
            tier: s.campaign.tier,
            alloy: s.economy.alloy,
            hero: Math.round(E.hero(s).hp),
            base: E.living(s, "base")?.hp,
            goal: p.goal,
          }),
        );
      }
    },
    resume,
  );
  const s = result.state;
  require("node:fs").writeFileSync(
    path.join(evidence, "final-" + route + ".json"),
    JSON.stringify({ state: E.snapshot(s), pilot: result.pilot }),
  );
  console.log(
    JSON.stringify({
      route,
      status: s.status,
      time: s.t,
      wall: Math.round((performance.now() - start) / 1000),
      stages: result.pilot?.log,
    }),
  );
  outcomes.push({ route, status: s.status, time: s.t });
  if (s.status !== "won") continue;
  assert.equal(s.approach, route);
  assert(E.restore(s));
  assert(s.economy.spent > 0);
  assert(
    s.units.filter((u) => u.kind === "outpost" && u.construction).length >= 2,
  );
}

assert.deepEqual(
  outcomes.map((o) => o.status),
  outcomes.map(() => "won"),
  "Every route must win: " + JSON.stringify(outcomes),
);
