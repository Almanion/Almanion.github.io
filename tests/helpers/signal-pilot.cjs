"use strict";
const E = require("../../game-source/signal-frontier/src/engine");
// An external pilot issues only legal game commands. It never edits simulation state.
class Pilot {
  constructor(route, waypointRadius = 12) {
    this.waypointRadius = waypointRadius;
    this.route = route;
    this.stage = 0;
    this.path = [];
    this.goal = "";
    this.ordered = new Set();
    this.last = { x: 0, y: 0 };
    this.stuck = 0;
  }
  decide(s) {
    const h = E.hero(s),
      commands = [];
    let dest = { x: h.x, y: h.y },
      interact = false;
    const order = (tag, group, x, y) => {
      if (!this.ordered.has(tag)) {
        this.ordered.add(tag);
        commands.push({ kind: "order", group, x, y });
      }
    };
    const buy = (action, site) => {
      if (E.supplyStatus(s, action, site).allowed)
        commands.push({ kind: "purchase", action, site });
    };
    if (this.route === "siege") {
      order("initial", 1, 500, 650);
      const post = s.units.find(
          (u) => u.kind === "outpost" && u.site === "west" && u.hp > 0,
        ),
        cache = s.caches[0];
      if (!post || post.build > 0) {
        dest = { x: 350, y: 650 };
        if (!post) buy("outpost", "west");
      } else if (!cache.taken) {
        dest = cache;
        interact = E.dist(h, cache) < 60;
      } else if (s.phase === 0) dest = { x: 950, y: 210 };
      else if (s.phase <= 2) {
        dest = { x: 830, y: 480 };
        interact = s.phase === 1 && E.dist(h, s.relay) < 75;
        if (s.phase === 2) order("defend", 1, 850, 600);
      } else {
        dest = { x: 1010, y: 490 };
        buy("artillery");
        if (E.living(s, "artillery")) order("artillery", 2, 1040, 540);
        order("assault", 1, 1100, 485);
      }
    } else {
      if (!s.economy.kit) buy("hack");
      const waypoints = [
        { x: 520, y: 600 },
        { x: 540, y: 275 },
        { x: 1030, y: 280 },
        { x: 1190, y: 280 },
      ];
      if (this.stage < waypoints.length) {
        dest = waypoints[this.stage];
        order("flank" + this.stage, 1, dest.x, dest.y + 30);
        const alive = s.units.filter((u) => u.group === 1 && u.hp > 0);
        if (E.dist(h, dest) < 40 && alive.every((u) => E.dist(u, dest) < 180)) {
          this.stage++;
        }
      } else {
        const post = s.units.find(
          (u) => u.kind === "outpost" && u.site === "flank" && u.hp > 0,
        );
        if (!post || post.build > 0) {
          dest = { x: 1200, y: 280 };
          buy("outpost", "flank");
        } else {
          dest = s.terminal;
          interact = E.dist(h, s.terminal) < 65;
          order("breach", 1, 1240, 280);
        }
      }
    }
    const key = dest.x + "," + dest.y;
    if (key !== this.goal) {
      this.goal = key;
      this.path = E.pathTo(h, dest);
      this.stuck = 0;
    }
    // Keyboard input is quantized: do not cut a corner merely because its waypoint is nearby.
    // Keep aligning with the corner until the scout's full footprint can reach the next point.
    while (
      this.path.length &&
      E.dist(h, this.path[0]) < this.waypointRadius &&
      (this.path.length === 1 || E.clear(h, this.path[1], E.C.hero.r))
    )
      this.path.shift();
    if (E.dist(h, this.last) < 0.1 && E.dist(h, dest) > 30) this.stuck++;
    else this.stuck = 0;
    if (this.stuck > 120) {
      this.path = E.pathTo(h, dest);
      this.stuck = 0;
    }
    this.last = { x: h.x, y: h.y };
    const p = interact ? null : this.path[0],
      d = p ? E.dist(h, p) : 0;
    const target = s.units
      .filter(
        (u) =>
          u.team &&
          u.hp > 0 &&
          !(u.kind === "citadel" && E.shielded(s)) &&
          !(this.route === "infiltration" && u.kind === "jammer") &&
          E.dist(u, h) < 590 &&
          E.clear(h, u),
      )
      .sort((a, b) => E.dist(a, h) - E.dist(b, h))[0];
    return {
      commands,
      input: {
        x: p ? (p.x - h.x) / d : 0,
        y: p ? (p.y - h.y) / d : 0,
        aim: target,
        fire: !!target,
        interact,
        dash: !interact && s.bullets.some((b) => b.team && E.dist(b, h) < 95),
      },
    };
  }
}
function play(route, maxFrames = 18000) {
  const s = E.make(),
    pilot = new Pilot(route),
    trace = [];
  let lastPhase = -1;
  for (let i = 0; i < maxFrames && s.status === "playing"; i++) {
    const decision = pilot.decide(s);
    for (const c of decision.commands) {
      if (c.kind === "order") E.order(s, c.group, c.x, c.y);
      else E.purchase(s, c.action, c.site);
    }
    E.step(s, decision.input);
    if (s.phase !== lastPhase) {
      trace.push({ phase: s.phase, time: s.t });
      lastPhase = s.phase;
    }
  }
  return { state: s, trace, pilot };
}
module.exports = { Pilot, play };
if (require.main === module)
  for (const route of ["siege", "infiltration"]) {
    const { state: s, trace, pilot } = play(route);
    console.log(
      route,
      JSON.stringify({
        status: s.status,
        time: s.t,
        phase: s.phase,
        hero: E.hero(s),
        alloy: s.economy,
        terminal: s.terminal,
        stage: pilot.stage,
        goal: pilot.goal,
        trace,
        survivors: s.units
          .filter((u) => u.hp > 0)
          .map((u) => [
            u.kind,
            Math.round(u.hp),
            Math.round(u.x),
            Math.round(u.y),
          ]),
      }),
    );
  }
