"use strict";
const E = require("../../game-source/signal-frontier/src/engine"),
  D = E.development;
class CampaignPilot {
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
    let budget = s.economy.alloy;
    const h = E.hero(s),
      commands = [],
      alive = (k) => s.units.filter((u) => u.kind === k && u.hp > 0),
      post = (id) => alive("outpost").find((u) => u.site === id),
      buy = (action, site) => {
        const o = E.supplyStatus(s, action, site);
        if (o.allowed && o.cost <= budget) {
          commands.push({ kind: "purchase", action, site });
          budget -= o.cost;
        }
      },
      order = (g, p) => {
        const key = p.x + "," + p.y;
        if (this.orders[g] !== key) {
          commands.push({ kind: "order", group: g, ...p });
          this.orders[g] = key;
        }
      };
    let dest = { x: 420, y: 1020 },
      interact = false;
    // Four home workers, then a secured expansion. Research competes with recruitment for actual deliveries.
    if (!alive("barracks").length) buy("barracks");
    if (D.usedSlots(s, E.living(s, "base")) < 4) buy("drone");
    if (!post("west")) buy("outpost", "west");
    const west = post("west");
    if (west && !west.build) {
      if (D.usedSlots(s, west) < 4) buy("drone", west.id);
      buy("network");
    }
    const rifleCount = alive("rifle").length + D.queued(s, "rifle").length;
    if (
      (s.campaign.tier === 2 || D.queued(s, "network").length) &&
      rifleCount < 6
    )
      buy("rifle");
    if (s.campaign.tier === 2) {
      buy("weapons");
      if (this.route === "infiltration") buy("hack");
      else buy("foundry");
    }
    const prepared =
      s.campaign.weapons &&
      rifleCount >= 6 &&
      (this.route === "infiltration"
        ? s.economy.kit
        : !!alive("foundry").find((u) => !u.build));
    if (!prepared && this.stage === 0) {
      order(1, { x: 500, y: 1020 });
    } else {
      if (this.stage === 0) {
        this.stage = 1;
        this.log.push(["depart", s.t]);
      }
      const steps =
        this.route === "siege"
          ? [
              { x: 530, y: 650 },
              { x: 980, y: 600 },
              { x: 1320, y: 380 },
              { x: 1440, y: 350 },
            ]
          : [
              { x: 530, y: 650 },
              { x: 980, y: 640 },
              { x: 1340, y: 900 },
              { x: 1660, y: 930 },
              { x: 1830, y: 500 },
              { x: 1780, y: 430 },
            ];
      if (this.stage <= steps.length) {
        dest = steps[this.stage - 1];
        order(1, dest);
        const near = alive("rifle").filter((u) => E.dist(u, dest) < 190).length;
        if (
          E.dist(h, dest) < 30 &&
          near >= Math.min(3, alive("rifle").length)
        ) {
          this.log.push(["waypoint" + this.stage, s.t]);
          this.stage++;
        }
      } else if (this.route === "siege") {
        if (E.living(s, "jammer")) dest = { x: 1440, y: 350 };
        else if (s.phase < 3) {
          dest = { x: 1320, y: 830 };
          order(1, { x: 1320, y: 850 });
          interact = E.dist(h, s.relay) < 75;
          buy("outpost", "relay");
        } else {
          buy("artillery");
          dest = { x: 1640, y: 900 };
          order(1, { x: 1660, y: 900 });
          order(2, { x: 1680, y: 920 });
        }
      } else {
        dest = { x: 1780, y: 445 };
        order(1, { x: 1740, y: 640 });
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
      if (
        E.free(h.x - (dy / len) * 35, h.y + (dx / len) * 35, 14, "frontier")
      ) {
        x = -dy / len;
        y = dx / len;
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
function play(route, maxFrames = 72000) {
  const s = E.make(),
    pilot = new CampaignPilot(route),
    trace = [];
  for (let i = 0; i < maxFrames && s.status === "playing"; i++) {
    const d = pilot.decide(s);
    for (const c of d.commands)
      c.kind === "purchase"
        ? E.purchase(s, c.action, c.site)
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
module.exports = { CampaignPilot, play };
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
