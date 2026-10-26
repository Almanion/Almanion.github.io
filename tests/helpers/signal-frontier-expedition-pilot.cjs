"use strict";
const E = require("../../game-source/signal-frontier/src/engine"),
  D = E.development;
class ExpeditionPilot {
  constructor(route, waypointRadius = 10) {
    this.waypointRadius = waypointRadius;
    this.lastTime = 0;
    this.route = route;
    this.stage = 0;
    this.goal = "";
    this.path = [];
    this.orders = {};
    this.last = {};
    this.retreat = false;
    this.log = [];
  }
  decide(s) {
    const elapsed = Math.max(E.DT, s.t - this.lastTime);
    this.lastTime = s.t;
    let budget = s.economy.alloy,
      planned = null;
    const h = E.hero(s),
      commands = [],
      nextOrders = {},
      alive = (k) => s.units.filter((u) => (!k || u.kind === k) && u.hp > 0),
      post = (id) => alive("outpost").find((u) => u.site === id),
      buy = (action, site) => {
        const o = E.supplyStatus(planned || s, action, site);
        if (o.allowed && o.cost <= budget) {
          planned ||= E.snapshot(s);
          if (!E.purchase(planned, action, site).allowed)
            throw Error("Invalid planned purchase");
          commands.push({ kind: "purchase", action, site });
          budget -= o.cost;
        }
      },
      order = (g, p) => {
        nextOrders[g] = p;
      };
    let dest = { x: 420, y: 1580 },
      interact = false;
    const base = E.living(s, "base"),
      west = post("west"),
      relay = post(this.route === "siege" ? "flank" : "relay");
    const rifleCount = alive("rifle").length + D.queued(s, "rifle").length;
    if (!alive("barracks").length) buy("barracks");
    if (base && D.usedSlots(s, base) < 4) buy("drone");
    if (!west) buy("outpost", "west");
    if (west && !west.build) {
      if (D.usedSlots(s, west) < 4) buy("drone", west.id);
      buy("network");
    }
    for (const u of alive().filter((u) =>
      ["base", "outpost", "barracks", "foundry"].includes(u.kind),
    ))
      if (u.hp < E.C[u.kind].hp * 0.7) buy("repair", u.id);
    if (s.campaign.tier >= 2 || D.queued(s, "network").length) {
      if (rifleCount < 6) buy("rifle");
      buy("weapons");
      if (base && !base.defense) buy("defense", base.id);
      if (west && !west.defense) buy("defense", west.id);
    }
    if (relay && !relay.build) {
      if (D.usedSlots(s, relay) < 4) buy("drone", relay.id);
      if (!relay.defense) buy("defense", relay.id);
      buy("command");
      if (this.route === "siege") buy("foundry");
    }
    const extra = post("north");
    if (extra && !extra.build) {
      if (D.usedSlots(s, extra) < 4) buy("drone", extra.id);
      if (!extra.defense) buy("defense", extra.id);
    }
    if (s.campaign.tier === 3) {
      if (this.route === "infiltration") buy("hack");
      else {
        buy("foundry");
        buy("artillery");
      }
      if (this.route === "siege" && alive("artillery").length) buy("armor");
    }
    if (this.stage === 0) {
      const cache = s.caches[0];
      dest = cache.taken ? { x: 420, y: 1580 } : { x: cache.x, y: cache.y };
      interact = !cache.taken && E.dist(h, cache) < 65;
      order(1, { x: 500, y: 1580 });
      if (
        s.campaign.weapons &&
        alive("rifle").length >= 6 &&
        base.defense &&
        west?.defense
      ) {
        this.stage = 1;
        this.log.push(["depart", s.t]);
      }
    } else if (this.stage <= 3) {
      dest = (
        this.route === "siege"
          ? [
              { x: 530, y: 1210 },
              { x: 980, y: 1160 },
              { x: 1320, y: 940 },
            ]
          : [
              { x: 530, y: 1210 },
              { x: 980, y: 1200 },
              { x: 1110, y: 1450 },
            ]
      )[this.stage - 1];
      order(1, dest);
      if (
        E.dist(h, dest) < 30 &&
        alive("rifle").filter((u) => E.dist(u, dest) < 190).length >=
          Math.min(3, alive("rifle").length)
      ) {
        this.log.push(["waypoint" + this.stage, s.t]);
        this.stage++;
      }
    } else if (this.stage === 4) {
      dest =
        this.route === "siege" ? { x: 1340, y: 940 } : { x: 1140, y: 1440 };
      order(
        1,
        this.route === "siege" ? { x: 1380, y: 920 } : { x: 1190, y: 1440 },
      );
      buy("outpost", this.route === "siege" ? "flank" : "relay");
      const fort = alive("bastion").find(
        (u) => u.sector === (this.route === "siege" ? "north" : "south"),
      );
      if (
        relay &&
        !relay.build &&
        fort &&
        s.campaign.weapons &&
        alive("rifle").length >= 3
      ) {
        const way =
          this.route === "siege"
            ? [
                { x: 1020, y: 940 },
                { x: 560, y: 350 },
                { x: 1000, y: 300 },
                { x: 1310, y: 300 },
                { x: 1510, y: 320 },
              ]
            : [
                { x: 1320, y: 1850 },
                { x: 1160, y: 2360 },
                { x: 1450, y: 2300 },
              ];
        this.fortStage ||= 0;
        dest = way[Math.min(this.fortStage, way.length - 1)];
        order(1, dest);
        if (this.route === "siege" && this.fortStage === 1) {
          buy("outpost", "north");
          if (extra && !extra.build) this.fortStage++;
        } else if (E.dist(h, dest) < 40 && this.fortStage < way.length - 1)
          this.fortStage++;
      }
      if (
        relay &&
        !relay.build &&
        !E.living(s, this.route === "siege" ? "jammer" : "turret") &&
        (this.route === "siege"
          ? s.campaign.tier === 3 && !!alive("foundry").find((u) => !u.build)
          : s.economy.kit)
      ) {
        this.stage = 5;
        this.log.push(["advance", s.t]);
      }
    } else {
      const steps =
        this.route === "siege"
          ? [
              { x: 1320, y: 940 },
              { x: 1440, y: 910 },
            ]
          : [
              { x: 1340, y: 1460 },
              { x: 1660, y: 1490 },
              { x: 1830, y: 1490 },
              { x: 2080, y: 1530 },
            ];
      if (this.stage < 5 + steps.length) {
        dest = steps[this.stage - 5];
        order(1, dest);
        if (
          E.dist(h, dest) < 30 &&
          alive("rifle").filter((u) => E.dist(u, dest) < 190).length >=
            Math.min(3, alive("rifle").length)
        ) {
          this.log.push(["waypoint" + this.stage, s.t]);
          this.stage++;
        }
      } else if (this.route === "siege") {
        if (E.living(s, "jammer")) dest = { x: 1440, y: 910 };
        else if (s.phase < 3) {
          dest = { x: 1320, y: 1390 };
          order(1, { x: 1320, y: 1410 });
          interact = E.dist(h, s.relay) < 75;
        } else {
          dest = { x: 1800, y: 1450 };
          order(1, { x: 1840, y: 1440 });
          order(2, { x: 1850, y: 1460 });
        }
      } else {
        dest = { x: 2080, y: 1530 };
        order(1, { x: 2000, y: 1430 });
        interact = E.dist(h, s.terminal) < 75;
      }
    }
    // Heal at a completed nearby node instead of trading the scout for a static objective.
    if (h.hp < 55) this.retreat = true;
    if (this.retreat) {
      const node = D.nodes(s).sort((a, b) => E.dist(a, h) - E.dist(b, h))[0];
      dest = { x: node.x + 30, y: node.y - 40 };
      interact = false;
      if (h.hp > 135) this.retreat = false;
    }
    const enemies = s.units
      .filter(
        (u) =>
          u.team &&
          u.hp > 0 &&
          !(u.kind === "citadel" && E.shielded(s)) &&
          !(this.route === "infiltration" && u.kind === "jammer") &&
          E.dist(u, h) < 600 &&
          E.clear(h, u),
      )
      .sort((a, b) => E.dist(a, h) - E.dist(b, h));
    const target = enemies[0];
    let aim = target;
    if (target) {
      const prev = this.last[target.id],
        v = prev
          ? {
              x: (target.x - prev.x) / elapsed,
              y: (target.y - prev.y) / elapsed,
            }
          : { x: 0, y: 0 },
        lead = E.dist(h, target) / 800;
      aim = { x: target.x + v.x * lead, y: target.y + v.y * lead };
    }
    this.last = Object.fromEntries(
      s.units.map((u) => [u.id, { x: u.x, y: u.y }]),
    );
    const key = dest.x + "," + dest.y;
    if (key !== this.goal || (!this.path.length && E.dist(h, dest) > 22)) {
      this.goal = key;
      this.path = E.pathTo(h, dest);
    }
    while (
      this.path.length &&
      E.dist(h, this.path[0]) < this.waypointRadius &&
      (this.path.length === 1 || E.clear(h, this.path[1], E.C.hero.r))
    )
      this.path.shift();
    const p = interact ? null : this.path[0],
      d = p ? E.dist(h, p) : 0;
    let x = p ? (p.x - h.x) / Math.max(1, d) : 0,
      y = p ? (p.y - h.y) / Math.max(1, d) : 0;
    // Dodge a readable locked shot while keeping normal aiming and movement rules.
    const danger = s.units.find(
      (u) =>
        u.team &&
        u.hp > 0 &&
        u.wind > 0 &&
        u.target &&
        E.dist(h, u.target) < 35 &&
        E.dist(h, u) < 550,
    );
    if (danger && !interact) {
      const dx = h.x - danger.x,
        dy = h.y - danger.y,
        len = Math.hypot(dx, dy);
      if (E.free(h.x - (dy / len) * 35, h.y + (dx / len) * 35, 14, h.map)) {
        x = -dy / len;
        y = dx / len;
      }
    }
    for (const [g, p] of Object.entries(nextOrders)) {
      const key = p.x + "," + p.y;
      if (this.orders[g] !== key) {
        commands.push({ kind: "order", group: Number(g), ...p });
        this.orders[g] = key;
      }
    }
    return {
      commands,
      input: {
        x,
        y,
        aim,
        fire: !!target,
        interact,
        dash: !interact && s.bullets.some((b) => b.team && E.dist(b, h) < 70),
      },
    };
  }
}
function play(route, maxFrames = 144000) {
  const s = E.make("frontier-3"),
    pilot = new ExpeditionPilot(route),
    trace = [];
  for (let i = 0; i < maxFrames && s.status === "playing"; i++) {
    const d = pilot.decide(s);
    for (const c of d.commands)
      c.kind === "purchase"
        ? (() => {
            const result = E.purchase(s, c.action, c.site);
            if (!result.allowed)
              throw Error(
                JSON.stringify({ t: s.t, command: c, reason: result.reason }),
              );
            return result;
          })()
        : E.order(s, c.group, c.x, c.y);
    E.step(s, d.input);
    if (i % 3600 === 0)
      trace.push({
        t: Math.round(s.t),
        hp: Math.round(E.hero(s).hp),
        money: s.economy.alloy,
        army: D.population(s),
        stage: pilot.stage,
        kills: s.kills,
      });
  }
  return { state: s, pilot, trace };
}
module.exports = { ExpeditionPilot, play };
if (require.main === module)
  for (const route of ["siege", "infiltration"]) {
    const { state: s, pilot, trace } = play(route);
    console.log(
      JSON.stringify({
        route,
        status: s.status,
        time: s.t,
        hero: E.hero(s),
        economy: s.economy,
        phase: s.phase,
        stage: pilot.stage,
        goal: pilot.goal,
        log: pilot.log,
        trace,
        restore: !!E.restore(s),
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
