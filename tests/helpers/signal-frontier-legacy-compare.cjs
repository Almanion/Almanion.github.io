"use strict";
const path = require("node:path"),
  util = require("node:util"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
if (!process.argv[2])
  throw Error("Pass the extracted b940774 baseline directory");
const baseline = path.resolve(process.argv[2]),
  old = require(path.join(baseline, "game-source/signal-frontier/src/engine")),
  current = require(path.join(root, "game-source/signal-frontier/src/engine")),
  { ExpeditionPilot } = require(
    path.join(baseline, "tests/helpers/signal-frontier-expedition-pilot.cjs"),
  ),
  a = old.make("frontier-7"),
  b = current.make("frontier-7"),
  pilot = new ExpeditionPilot("siege");
function apply(E, state, command) {
  if (command.kind === "purchase")
    return E.purchase(state, command.action, command.site);
  const ids =
    command.ids ||
    state.units
      .filter((u) => u.hp > 0 && !u.team && u.group === command.group)
      .map((u) => u.id);
  return command.targetId
    ? E.attackUnits(state, ids, command.targetId)
    : E.orderUnits(state, ids, command.x, command.y);
}
assert(util.isDeepStrictEqual(a, b), "Legacy initial state differs");
for (let frame = 0; frame < 6000; frame++) {
  const decision = pilot.decide(a);
  for (const command of decision.commands) {
    apply(old, a, command);
    apply(current, b, command);
  }
  old.step(a, decision.input);
  current.step(b, decision.input);
  if ((frame + 1) % 60 === 0)
    assert(
      util.isDeepStrictEqual(a, b),
      "Legacy state differs at frame " + (frame + 1),
    );
}
console.log(
  "PASS frontier-7: identical initial state and 6000 steps against b940774",
);
