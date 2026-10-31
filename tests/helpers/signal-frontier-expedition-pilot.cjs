"use strict";
const E = require("../../game-source/signal-frontier/src/engine"),
  D = E.development;
const DISTRICT_POINTS = {
  "420,1580": [640, 2460],
  "500,1580": [780, 2460],
  "530,1210": [1160, 2040],
  "980,1200": [1640, 2040],
  "1110,1450": [2040, 2240],
  "1140,1440": [2040, 2240],
  "1190,1440": [2040, 2100],
  "1320,940": [2040, 1640],
  "1440,910": [2140, 1440],
  "1320,1410": [1880, 1640],
  "1800,1450": [2940, 1880],
  "1840,1440": [2940, 1880],
  "1850,1460": [3000, 1880],
  "1340,1460": [2160, 2440],
  "1660,1490": [2440, 2480],
  "1830,1490": [2760, 2400],
  "2080,1530": [2800, 2400],
  "2000,1430": [2800, 2240],
  "320,1550": [500, 2460],
};
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
    this.infilReady = false;
    this.log = [];
    this.steering = { x: 0, y: 0 };
  }
  keyboard(input) {
    // Short key pulses preserve small corrections without turning every vector
    // with a nonzero component into a full diagonal or getting stuck at a wall.
    const result = { ...input };
    for (const axis of ["x", "y"]) {
      if (!input[axis]) this.steering[axis] = 0;
      this.steering[axis] += input[axis];
      result[axis] =
        Math.abs(this.steering[axis]) >= 0.5
          ? Math.sign(this.steering[axis])
          : 0;
      this.steering[axis] -= result[axis];
    }
    return result;
  }
  decide(s) {
    const mapped = s.campaign.id === "frontier-9";
    const highlands = ["frontier-7", "frontier-8", "frontier-9"].includes(
        s.campaign.id,
      ),
      opening =
        mapped && this.stage <= 4
          ? "infiltration"
          : highlands && this.stage <= 4
            ? "siege"
            : this.route;
    const point = (x, y) =>
      mapped && DISTRICT_POINTS[x + "," + y]
        ? {
            x: DISTRICT_POINTS[x + "," + y][0],
            y: DISTRICT_POINTS[x + "," + y][1],
          }
        : highlands
          ? x === 500 && y === 1580
            ? mapped
              ? { x: 780, y: 2460 }
              : { x: 600, y: 2500 }
            : x === 1510 && y === 320
              ? { x: 2670, y: 980 }
              : E.terrain.point({ x, y })
          : { x, y };
    const elapsed = Math.max(E.DT, s.t - this.lastTime);
    this.lastTime = s.t;
    let budget = s.economy.alloy,
      planned = null,
      reserve = 0;
    const h = E.hero(s),
      walkMap = E.construction.enabled(s) ? E.navigation(s) : h.map,
      commands = [],
      nextOrders = {},
      alive = (k) => s.units.filter((u) => (!k || u.kind === k) && u.hp > 0),
      post = (id) => alive("outpost").find((u) => u.site === id),
      buy = (action, site) => {
        const restartingMine =
          E.construction.enabled(s) &&
          action === "outpost" &&
          alive("drone").some((u) => !u.buildingId) &&
          D.nodes(s).every((node) => !ore(node) || !D.usedSlots(s, node));

        if (E.construction.enabled(s) && E.construction.shapes[action]) {
          if (
            alive(action).some((u) => action !== "outpost" || u.site === site)
          )
            return;
          const available = E.construction.availability(planned || s, action);
          if (!available.allowed) return;
          const heldForWorker =
              this.stage && !restartingMine ? D.items(s).drone.cost : 0,
            heldForOther = action === "outpost" ? 0 : reserve;
          if (available.cost > budget - heldForWorker - heldForOther) return;
          const near =
            action === "outpost"
              ? s.campaign.mines.find((m) => m.id === site)
              : D.buildings(s)[action] || D.buildings(s).barracks;
          if (!E.explored(s, 0, near)) return;
          site = require("./signal-frontier-construction.cjs").findSite(
            planned || s,
            action,
            near,
          );
          if (!site) return;
        }
        const o = E.supplyStatus(planned || s, action, site);
        if (
          o.allowed &&
          o.cost <=
            budget -
              (action === "drone"
                ? (
                    highlands
                      ? D.usedSlots(planned || s, o.producer) > 0
                      : alive("drone").length
                  )
                  ? (reserveCommand ? 0 : reserve)
                  : 0
                : (this.stage && !restartingMine ? D.items(s).drone.cost : 0) +
                  (["outpost", "defense", "hack"].includes(action) ||
                  (action === "command" && reserveCommand) ? 0 : reserve))
        ) {
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
    if (highlands) {
      const garrisonLimit =
        mapped && this.route === "infiltration" && this.stage >= 9 ? 1 : 3;
      this.garrison = (this.garrison || [])
        .filter((id) => s.units.some((u) => u.id === id && u.hp > 0))
        .slice(0, garrisonLimit);
      if (this.stage >= 1 && alive("rifle").length >= 6)
        for (const u of alive("rifle")
          .filter((u) => !this.garrison.includes(u.id))
          .sort(
            (a, b) =>
              E.dist(a, E.living(s, "base")) - E.dist(b, E.living(s, "base")),
          )) {
          if (this.garrison.length >= garrisonLimit) break;
          this.garrison.push(u.id);
        }
    }
    const reserveIds = highlands ? this.garrison || [] : [],
      activeRifles = () =>
        alive("rifle").filter((u) => !reserveIds.includes(u.id));
    let dest = point(420, 1580),
      interact = false;
    const base = E.living(s, "base"),
      west = post("west"),
      relay = post(
        mapped
          ? "relay"
          : highlands
            ? "north"
            : this.route === "siege"
              ? "flank"
              : "relay",
      );
    const threatened = (node) =>
      !!node &&
      s.units.some(
        (u) =>
          u.team &&
          E.visible(s, 0, u) &&
          u.hp > 0 &&
          E.stats(s, u).range > 0 &&
          E.dist(u, node) < (E.balance.enabled(s) ? Math.max(480, E.stats(s, u).range + 80) : 480) &&
          E.clear(u, node),
      );
    const ore = (node) =>
      s.campaign.mines.find(
        (m) => m.id === (node.kind === "base" ? "home" : node.site),
      )?.remaining;
    // A destroyed forward node must be rebuilt before spending its price on replacements.
    reserve =
      this.stage >= 4 && !relay
        ? D.items(s).outpost.cost
        : opening === "siege" &&
            relay &&
            !relay.defense &&
            !relay.jobs.some((j) => j.action === "defense")
          ? D.items(s).defense.cost
          : 0;
    // Keep a new mine affordable if either forward economy is lost. Its first
    // worker has priority over this reserve, including workers at other nodes.
    if (highlands && this.stage >= 1 && s.campaign.tier < 3)
      reserve = Math.max(reserve, D.items(s).outpost.cost);
    // The fog-route objective requires the infiltration module. Reserve its
    // real cost before replenishing infantry, rather than spending all finite
    // income on replacements while waiting for a module we never purchase.
    if (!highlands && E.fogged(s) && this.route === "infiltration" &&
        s.campaign.tier === 3 && !s.economy.kit)
      reserve = Math.max(reserve, D.items(s).hack.cost);
    const rifleCount = alive("rifle").length + D.queued(s, "rifle").length;
    const savingForCommand =
      E.fogged(s) &&
      this.stage >= 4 &&
      s.campaign.tier === 2 &&
      E.objective(s).id === "command";
    const reserveCommand = s.campaign.id === "frontier-8" && savingForCommand;
    // Free-construction replays can lose replacements faster than one remote
    // miner funds command research. Keep the objective affordable, and let
    // that purchase consume its own reserve instead of demanding it twice.
    if (reserveCommand) reserve = Math.max(reserve, D.items(s).command.cost);
    const rifleTarget =
      mapped && this.route === "siege" && this.stage >= 4
        ? 5
        : savingForCommand
          ? highlands
            ? 6
            : 3
          : this.route === "infiltration" &&
              !alive("bastion").some((u) => u.sector === "south")
            ? 3
            : D.combat(s) && this.stage
              ? Math.min(9, D.capacity(s) - 1)
              : 6;
    if (
      E.construction.enabled(s) &&
      base &&
      !threatened(base) &&
      !alive("drone").length &&
      !D.queued(s, "drone").length
    )
      buy("drone", base.id);
    if (mapped)
      for (const u of alive().filter(
        (u) =>
          !u.team && u.construction && u.build > 0 && !u.construction.builderId,
      ))
        buy("assign-builder", u.id);
    if (!alive("barracks").length) buy("barracks");
    if (E.fogged(s) && !alive("scout").length && !D.queued(s, "scout").length)
      buy("scout");
    if (base && !threatened(base) && ore(base) && D.usedSlots(s, base) < 4)
      buy("drone");
    if (!west) buy("outpost", "west");
    if (west && !west.build) {
      if (!threatened(west) && ore(west) && D.usedSlots(s, west) < 4)
        buy("drone", west.id);
      buy("network");
    }
    for (const u of alive().filter((u) =>
      ["base", "outpost", "barracks", "foundry"].includes(u.kind),
    ))
      if (u.hp < E.C[u.kind].hp * 0.7) {
        if (E.balance.enabled(s)) {
          if (!(planned || s).units.some((w) => w.hp > 0 && w.workerTask?.kind === "repair" && w.workerTask.targetId === u.id))
            buy("repair-drone", u.id);
        } else buy("repair", u.id);
      }
    if (s.campaign.tier >= 2 || D.queued(s, "network").length) {
      if (E.construction.enabled(s) && s.campaign.tier >= 2) buy("arsenal");
      if (highlands) {
        if (base && !base.defense) buy("defense", base.id);
        if (west && !west.defense) buy("defense", west.id);
      }
      if (rifleCount < rifleTarget) buy("rifle");
      buy("weapons");
      if (base && !base.defense) buy("defense", base.id);
      if (west && !west.defense) buy("defense", west.id);
    }
    if (relay && !relay.build) {
      if (!relay.defense) buy("defense", relay.id);
      if (!threatened(relay) && ore(relay) && D.usedSlots(s, relay) < 4)
        buy("drone", relay.id);
      buy("command");
      if (this.route === "siege" && (!highlands || s.campaign.tier === 3))
        buy("foundry");
    }
    const extra = post(mapped ? "relay" : "north");
    if (extra && !extra.build) {
      if (!threatened(extra) && ore(extra) && D.usedSlots(s, extra) < 4)
        buy("drone", extra.id);
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
      dest = cache.taken ? point(420, 1580) : { x: cache.x, y: cache.y };
      interact = !cache.taken && E.dist(h, cache) < 65;
      order(1, E.balance.enabled(s) && west ? E.construction.exit(west) : point(500, 1580));
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
        opening === "siege"
          ? [point(530, 1210), point(980, 1160), point(1320, 940)]
          : [point(530, 1210), point(980, 1200), point(1110, 1450)]
      )[this.stage - 1];
      order(1, dest);
      if (
        E.dist(h, dest) < 30 &&
        alive("rifle").filter((u) => E.dist(u, dest) < 190).length >=
          Math.min(3, highlands ? activeRifles().length : alive("rifle").length)
      ) {
        this.log.push(["waypoint" + this.stage, s.t]);
        this.stage++;
      }
    } else if (this.stage === 4) {
      dest = opening === "siege" ? point(1340, 940) : point(1140, 1440);
      order(1, opening === "siege" ? point(1380, 920) : point(1190, 1440));
      buy(
        "outpost",
        mapped
          ? "relay"
          : highlands
            ? "north"
            : opening === "siege"
              ? "flank"
              : "relay",
      );
      const fort = alive("bastion").find(
        (u) => u.sector === (opening === "siege" ? "north" : "south"),
      );
      if (
        relay &&
        !relay.build &&
        (opening !== "siege" || relay.defense) &&
        fort &&
        !mapped &&
        s.campaign.weapons &&
        ((E.fogged(s) && opening === "infiltration") ||
          alive("rifle").length >= 3)
      ) {
        const way =
          opening === "siege" && highlands
            ? [
                point(1020, 940),
                point(560, 350),
                { x: 2040, y: 1400 },
                { x: 2840, y: 1420 },
                { x: 2840, y: 1000 },
              ]
            : opening === "siege"
              ? [
                  point(1020, 940),
                  point(560, 350),
                  point(1000, 300),
                  point(1310, 300),
                  point(1510, 320),
                ]
              : [point(1320, 1850), point(1160, 2360), point(1450, 2300)];
        this.fortStage ||= 0;
        dest = way[Math.min(this.fortStage, way.length - 1)];
        order(1, dest);
        if (opening === "siege" && this.fortStage === 1) {
          buy("outpost", "north");
          if (extra && !extra.build) this.fortStage++;
        } else if (E.dist(h, dest) < 40 && this.fortStage < way.length - 1)
          this.fortStage++;
      }
      if (
        relay &&
        !relay.build &&
        (mapped || !E.living(s, opening === "siege" ? "jammer" : "turret")) &&
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
          ? [point(1320, 940), point(1440, 910)]
          : [
              point(1340, 1460),
              point(1660, 1490),
              point(1830, 1490),
              point(2080, 1530),
            ];
      if (this.stage < 5 + steps.length) {
        dest = steps[this.stage - 5];
        order(1, dest);
        if (
          E.dist(h, dest) < 30 &&
          ((highlands && this.route === "infiltration") ||
            alive("rifle").filter((u) => E.dist(u, dest) < 190).length >=
              Math.min(
                3,
                highlands ? activeRifles().length : alive("rifle").length,
              ))
        ) {
          this.log.push(["waypoint" + this.stage, s.t]);
          this.stage++;
        }
      } else if (this.route === "siege") {
        if (E.living(s, "jammer")) dest = point(1440, 910);
        else if (s.phase < 3) {
          dest = highlands ? { x: s.relay.x, y: s.relay.y } : point(1320, 1390);
          order(1, point(1320, 1410));
          interact = E.dist(h, s.relay) < 75;
        } else {
          if (mapped) {
            const rampGuard = alive("turret").find(
              (u) => u.x === 2760 && u.y === 2000,
            );
            const ready = alive("artillery").length >= 2 && !rampGuard;
            dest = ready ? { x: 2760, y: 1480 } : { x: 2240, y: 1840 };
            order(1, { x: 2760, y: 1900 });
            order(2, { x: 2760, y: 1900 });
          } else {
            dest = point(1800, 1450);
            order(1, point(1840, 1440));
            order(2, point(1850, 1460));
          }
        }
      } else {
        const terminal = mapped ? E.map(s).terminals[0] : s.terminal;
        if (mapped) {
          const fighters = activeRifles(),
            node = relay || west || base,
            muster = { x: node.x - 80, y: node.y - 100 };
          if (fighters.length < 2) this.infilReady = false;
          if (
            !this.infilReady &&
            h.hp > 135 &&
            fighters.filter((u) => E.dist(u, h) < 280).length >= 4
          )
            this.infilReady = true;
          if (!this.infilReady) {
            // Rebuild the escort at defended income instead of repeatedly
            // sending the unescorted hero back into a closed breach.
            dest = muster;
            order(1, muster);
            interact = false;
          } else {
            // Holding the terminal is the infiltration role. Leaving as soon
            // as the window opens stranded the infantry under renewed shields.
            dest = { x: terminal.x, y: terminal.y };
            order(1, s.terminal.window > 0 ? { x: 3000, y: 1880 } : dest);
            interact = E.dist(h, terminal) < 75;
          }
        } else {
          dest = highlands
            ? { x: terminal.x, y: terminal.y }
            : point(2080, 1530);
          order(1, point(2000, 1430));
          interact = E.dist(h, terminal) < 75;
        }
      }
    }
    // A fog expedition must scout its third mine before the first two run dry.
    if (
      E.fogged(s) &&
      (this.route === "siege" || highlands) &&
      this.stage === 4 &&
      s.t >= 600 &&
      (!extra || extra.build)
    ) {
      dest = mapped ? { x: 2040, y: 2240 } : point(560, 350);
      order(1, dest);
      interact = false;
      buy("outpost", mapped ? "relay" : "north");
    }
    // Recover the containers encountered on the infiltration route before waiting
    // for more ore; this pays for losses without inventing resources.
    if (
      (this.route === "infiltration" || highlands) &&
      this.stage >= 1 &&
      this.stage <= 4 &&
      h.hp > 80
    ) {
      const cache = s.caches
        .filter((c) => !c.taken && E.dist(h, c) < 300)
        .sort((a, b) => E.dist(h, a) - E.dist(h, b))[0];
      if (cache) {
        dest = { x: cache.x, y: cache.y };
        interact = E.dist(h, cache) < 65;
      }
    }
    // A functioning tank can destroy the old route's last mining node. Recover
    // known salvage before reserving a node plus its first worker indefinitely.
    // Pending workers/foundations already provide recovery and must finish first.
    const recovery = planned || s;
    if (
      !highlands &&
      D.combat(s) &&
      this.stage >= 1 &&
      this.stage <= 4 &&
      budget < D.items(s).outpost.cost + D.items(s).drone.cost &&
      !D.nodes(recovery).some(
        (node) => ore(node) > 0 && D.usedSlots(recovery, node) > 0,
      ) &&
      !recovery.units.some(
        (u) => !u.team && u.hp > 0 && u.kind === "outpost" && u.build,
      ) &&
      !D.queued(recovery, "drone").length
    ) {
      const cache = s.caches
        .filter((c) => !c.taken && E.explored(s, 0, c))
        .sort((a, b) => E.dist(h, a) - E.dist(h, b))[0];
      if (cache) {
        dest = { x: cache.x, y: cache.y };
        interact = E.dist(h, cache) < 65;
      }
    }
    if (highlands && !mapped && this.stage === 0 && west && !this.rushCleared) {
      const fort = s.units.find(
        (u) => u.kind === "bastion" && u.sector === "north",
      );
      if (fort.hp <= 0 && E.visible(s, 0, fort)) this.rushCleared = true;
      else {
        const route = [
          { x: 1650, y: 1410 },
          { x: 2040, y: 1400 },
          { x: 2840, y: 1420 },
          { x: 2840, y: 1000 },
        ];
        this.rushStage ||= 0;
        dest = route[this.rushStage];
        interact = false;
        if (E.dist(h, dest) < 35 && this.rushStage < route.length - 1)
          this.rushStage++;
        order(1, point(500, 1580));
      }
    }
    // Finish an existing foundation before reserving money for another one.
    // A half-built north node can restore income while west is unaffordable.
    const unfinished = highlands
      ? alive("outpost")
          .filter((u) => !u.team && u.build > 0)
          .sort((a, b) => E.dist(a, h) - E.dist(b, h))[0]
      : null;
    if (
      highlands &&
      this.stage >= 1 &&
      s.campaign.tier < 3 &&
      (unfinished || !west)
    ) {
      const site = unfinished || D.pads(s).find((p) => p.id === "west");
      dest = { x: site.x, y: site.y - 65 };
      order(1, point(500, 1580));
      interact = false;
    }
    if (
      highlands &&
      this.stage >= 1 &&
      s.campaign.tier < 3 &&
      !unfinished &&
      budget < D.items(s).outpost.cost + D.items(s).drone.cost
    ) {
      const future = planned || s,
        income = D.nodes(future).some(
          (node) => ore(node) > 0 && D.usedSlots(future, node) > 0,
        );
      if (!income) {
        // Use only last-seen containers. If none are known, scout accessible
        // sectors rather than waiting forever at a site we cannot afford.
        const found = s.recon.memory[0]
          .filter((p) => p.type === "cache" && !p.taken)
          .sort((a, b) => E.dist(a, h) - E.dist(b, h))[0];
        const survey = [
          { x: 2040, y: 500 },
          { x: 2040, y: 2500 },
          { x: 2300, y: 3450 },
          { x: 1000, y: 3450 },
        ];
        this.surveyIndex ||= 0;
        if (!found && E.dist(h, survey[this.surveyIndex % survey.length]) < 80)
          this.surveyIndex++;
        dest = found
          ? { x: found.x, y: found.y }
          : survey[this.surveyIndex % survey.length];
        const action = E.interaction(s);
        interact =
          !!found &&
          E.dist(h, found) < 65 &&
          action?.type === "cache" &&
          action.allowed;
      }
    }
    // Respond to a visible attack on the economy instead of waiting at the objective
    // while an outranging enemy destroys every worker. The forward squad holds its orders.
    if (
      (this.stage >= 1 || highlands) &&
      base &&
      ((base.hp < E.C.base.hp * 0.82 &&
        (threatened(base) || (E.fogged(s) && base.repair > 0))) ||
        (west &&
          west.hp < E.C.outpost.hp * 0.7 &&
          (threatened(west) || (E.fogged(s) && west.repair > 0))))
    ) {
      this.defendHome = true;
      if (E.fogged(s) && s.t >= 600) this.defendUntil = s.t + 20;
    }
    if (this.defendHome && base) {
      if (
        !(E.fogged(s) && s.t < this.defendUntil) &&
        !threatened(base) &&
        !threatened(west) &&
        !(E.fogged(s) && (base.repair > 0 || west?.repair > 0))
      )
        this.defendHome = false;
      else {
        dest = point(320, 1550);
        if (this.route === "infiltration" || D.combat(s)) {
          const attacker = s.units
            .filter(
              (u) =>
                u.team &&
                E.visible(s, 0, u) &&
                u.hp > 0 &&
                E.stats(s, u).range > 0 &&
                [base, west].some(
                  (node) => node && E.dist(u, node) <
                    (E.balance.enabled(s) ? Math.max(480, E.stats(s, u).range + 80) : 480) && E.clear(u, node),
                ),
            )
            .sort(
              (a, b) =>
                E.stats(s, b).range - E.stats(s, a).range ||
                E.dist(h, a) - E.dist(h, b),
            )[0];
          if (attacker && E.dist(h, attacker) > 360) {
            const d = E.dist(h, attacker), stand = E.balance.enabled(s)
              ? Math.min(E.stats(s, h).range - 40, Math.max(330, E.stats(s, attacker).range + 40)) : 330;
            dest = {
              x: attacker.x + ((h.x - attacker.x) / d) * stand,
              y: attacker.y + ((h.y - attacker.y) / d) * stand,
            };
          }
        }
        interact = false;
      }
    }
    // Heal at a completed nearby node instead of trading the scout for a static objective.
    if (h.hp < (E.construction.enabled(s) ? 110 : mapped ? 90 : 55)) this.retreat = true;
    if (this.retreat) {
      // Free-construction extractors heal admitted occupants, not nearby units.
      // The home repair area remains available to the manually controlled scout.
      const node = E.construction.enabled(s) ? base
        : D.nodes(s).sort((a, b) => E.dist(a, h) - E.dist(b, h))[0];
      dest = { x: node.x + 30, y: node.y - 40 };
      interact = false;
      if (h.hp > 135) this.retreat = false;
    }
    const enemies = s.units
      .filter(
        (u) =>
          u.team &&
          E.visible(s, 0, u) &&
          u.hp > 0 &&
          !(u.kind === "citadel" && E.shielded(s)) &&
          !(opening === "infiltration" && u.kind === "jammer") &&
          E.dist(u, h) < (E.balance.enabled(s) ? E.stats(s, h).range - 20 : 600) &&
          E.clear(h, u),
      )
      .sort((a, b) => {
        const priority = (u) =>
          D.combat(s)
            ? E.dist(u, h) -
              ({
                bomber: 200,
                flamer: 170,
                rocket: 130,
                mortar: 100,
                tank: -90,
              }[u.kind] || 0)
            : E.dist(u, h);
        return priority(a) - priority(b);
      });
    const target = enemies[0];
    // Channeling occupies the scout's weapon. If its escort has been lost,
    // use the open breach to fire, then refresh it before the shield returns.
    if (interact && target && s.terminal.window > 4 && activeRifles().length < 2)
      interact = false;
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
      s.units
        .filter((u) => !u.team || E.visible(s, 0, u))
        .map((u) => [u.id, { x: u.x, y: u.y }]),
    );
    const key = dest.x + "," + dest.y,
      navigationKey = walkMap?.key ?? walkMap;
    if (
      key !== this.goal ||
      navigationKey !== this.navigationKey ||
      (!this.path.length && E.dist(h, dest) > 22)
    ) {
      this.goal = key;
      this.navigationKey = navigationKey;
      this.path = E.pathTo(
        E.construction.enabled(s) ? { ...h, map: walkMap } : h,
        dest,
      );
    }
    while (
      this.path.length &&
      E.dist(h, this.path[0]) < this.waypointRadius &&
      (this.path.length === 1 ||
        (highlands
          ? E.travelClear(h, this.path[1], E.C.hero.r, walkMap)
          : E.clear(h, this.path[1], E.C.hero.r)))
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
        E.visible(s, 0, u) &&
        u.hp > 0 &&
        u.wind > 0 &&
        u.target &&
        E.dist(h, u.target) < 35 &&
        E.dist(h, u) < (E.balance.enabled(s) ? Math.max(550, E.stats(s, u, h).range + 40) : 550),
    );
    if (danger && !interact) {
      const dx = h.x - danger.x,
        dy = h.y - danger.y,
        len = Math.hypot(dx, dy);
      if (E.free(h.x - (dy / len) * 35, h.y + (dx / len) * 35, 14, walkMap)) {
        x = -dy / len;
        y = dx / len;
      }
    }
    if (
      (["frontier-7", "frontier-8"].includes(s.campaign.id) || E.balance.enabled(s)) &&
      target &&
      !interact &&
      E.stats(s, target, h).range > 300 &&
      E.dist(h, target) < (E.balance.enabled(s) ? Math.min(E.stats(s, h).range - 40, E.stats(s, target, h).range + 60) : 490)
    ) {
      const d = E.dist(h, target),
        a = { x: (h.x - target.x) / d, y: (h.y - target.y) / d };
      if (
        E.travelClear(h, { x: h.x + a.x * 40, y: h.y + a.y * 40 }, 14, walkMap)
      ) {
        x = a.x;
        y = a.y;
      }
    }
    if (D.combat(s) && !interact) {
      const area = s.units
        .filter((u) => u.team && E.visible(s, 0, u) && u.hp > 0)
        .map((u) => ({ u, area: E.dangerArea(s, u) }))
        .find((v) => v.area && E.insideArea(v.area, h));
      if (area) {
        const origin = area.area.kind === "circle" ? area.area : area.u,
          d = E.dist(h, origin),
          dx = (h.x - origin.x) / Math.max(1, d),
          dy = (h.y - origin.y) / Math.max(1, d);
        const escape = [
          { x: dx, y: dy },
          { x: -dy, y: dx },
          { x: dy, y: -dx },
        ].find((v) => E.free(h.x + v.x * 35, h.y + v.y * 35, 14, walkMap));
        if (escape) {
          x = escape.x;
          y = escape.y;
        }
      }
    }
    if (D.combat(s) && !interact) {
      const incoming = s.bullets.find(
        (b) =>
          b.team &&
          E.visible(s, 0, b) &&
          b.kind !== "shell" &&
          E.dist(b, h) < 190 &&
          (h.x - b.x) * b.vx + (h.y - b.y) * b.vy > 0,
      );
      if (incoming) {
        const speed = Math.hypot(incoming.vx, incoming.vy),
          lateral = { x: -incoming.vy / speed, y: incoming.vx / speed };
        const choices = [lateral, { x: -lateral.x, y: -lateral.y }].filter(
          (v) => E.free(h.x + v.x * 45, h.y + v.y * 45, 14, walkMap),
        );
        if (choices.length) {
          const p = choices.sort(
            (a, b) => b.x * x + b.y * y - (a.x * x + a.y * y),
          )[0];
          x = p.x;
          y = p.y;
        }
      }
    }
    if (
      E.fogged(s) &&
      this.stage >= 4 &&
      !(mapped && this.route === "infiltration" && this.stage >= 9) &&
      (highlands ? activeRifles().length : alive("rifle").length) < 3
    )
      order(1, point(420, 1580));
    if (D.combat(s) && (this.stage >= 1 || highlands)) {
      const squad = E.fogged(s)
          ? alive().filter((u) => u.group === 1 && !reserveIds.includes(u.id))
          : alive("rifle"),
        targets = alive()
          .filter(
            (u) =>
              u.team &&
              E.visible(s, 0, u) &&
              E.stats(s, u).range > 300 &&
              !(u.kind === "citadel" && E.shielded(s)) &&
              ((E.balance.enabled(s) && [base, west].some((node) => node &&
                E.rangeDistance(u, node) < E.stats(s, u).range + 80)) || squad.some(
                (v) =>
                  E.dist(v, u) <
                    (E.balance.enabled(s) ? E.detectionRange(s, v) : E.fogged(s) && v.kind === "scout" ? 720 : 560) &&
                  E.clear(v, u),
              )),
          )
          .sort((a, b) => {
            const score = (u) =>
              Math.min(...squad.map((v) => E.dist(v, u))) -
              (["rocket", "mortar"].includes(u.kind) ? 150 : 0);
            return score(a) - score(b);
          });
      if (targets[0])
        order(1, { x: targets[0].x, y: targets[0].y, targetId: targets[0].id });
    }
    if (D.combat(s)) {
      const army = highlands ? activeRifles() : alive("rifle"),
        hazards = s.units
          .filter((u) => u.team && E.visible(s, 0, u) && u.hp > 0)
          .map((u) => ({ area: E.dangerArea(s, u), origin: u }))
          .filter((v) => v.area);
      for (const b of s.bullets)
        if (b.team && E.visible(s, 0, b) && b.kind === "shell" && b.radius)
          hazards.push({
            area: E.impactArea(s, { x: b.tx, y: b.ty }, b.radius),
            origin: { x: b.tx, y: b.ty },
          });
      const danger = hazards.find((v) =>
        army.some((u) => E.insideArea(v.area, u)),
      );
      if (danger && !(this.microUntil > s.t)) {
        const centre = army.reduce(
            (p, u) => ({
              x: p.x + u.x / army.length,
              y: p.y + u.y / army.length,
            }),
            { x: 0, y: 0 },
          ),
          origin = danger.area.kind === "circle" ? danger.area : danger.origin,
          angle = Math.atan2(centre.y - origin.y, centre.x - origin.x),
          radius =
            danger.area.kind === "sector" ? 255 : danger.area.radius + 100;
        const p = {
          x: origin.x + Math.cos(angle) * radius,
          y: origin.y + Math.sin(angle) * radius,
        };
        if (E.free(p.x, p.y, 20, walkMap)) {
          this.micro = p;
          this.microUntil = s.t + 1.2;
        }
      }
      if (this.microUntil > s.t) order(1, this.micro);
    }
    for (const [g, p] of Object.entries(nextOrders)) {
      if (D.combat(s) && !alive().some((u) => u.group === Number(g))) continue;
      const ids = highlands
        ? alive()
            .filter((u) => u.group === Number(g) && !reserveIds.includes(u.id))
            .map((u) => u.id)
        : undefined;
      if (ids && !ids.length) continue;
      const key =
        (ids ? ids.join("/") + ":" : "") +
        (p.targetId ? "attack:" + p.targetId : p.x + "," + p.y);
      if (this.orders[g] !== key) {
        commands.push({
          kind: "order",
          group: Number(g),
          ...(ids ? { ids } : {}),
          ...p,
        });
        this.orders[g] = key;
      }
    }
    if (highlands && reserveIds.length) {
      for (const [i, ids] of [
        [reserveIds[0]],
        [...reserveIds.slice(1)],
      ].entries()) {
        if (!ids.length) continue;
        const point = i ? E.balance.enabled(s) && west ? E.construction.exit(west) : { x: 850, y: 2450 } : { x: 450, y: 2550 },
          threat = alive()
            .filter(
              (u) =>
                u.team &&
                E.visible(s, 0, u) &&
                E.stats(s, u).range > 0 &&
                E.dist(u, point) < (E.balance.enabled(s) ? Math.max(540, E.stats(s, u).range + 80) : 540),
            )
            .sort((a, b) => E.dist(a, point) - E.dist(b, point))[0],
          key = ids.join("/") + ":" + (threat?.id || "hold");
        this.homeOrders ||= {};
        if (this.homeOrders[i] !== key) {
          commands.push({
            kind: "order",
            group: 1,
            ids,
            ...(threat
              ? { x: threat.x, y: threat.y, targetId: threat.id }
              : point),
          });
          this.homeOrders[i] = key;
        }
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
function play(
  route,
  maxFrames = 144000,
  profile = "frontier-4",
  checkpoint = null,
  resume = null,
) {
  const s = resume ? E.restore(resume.state) : E.make(profile),
    pilot = resume
      ? Object.assign(new ExpeditionPilot(route), resume.pilot)
      : new ExpeditionPilot(route),
    trace = [];
  if (!s || s.campaign.id !== profile)
    throw Error("Invalid operation checkpoint");
  for (
    let i = Math.round(s.t / E.DT);
    i < maxFrames && s.status === "playing";
    i++
  ) {
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
        : c.targetId
          ? E.attackUnits(
              s,
              c.ids ||
                s.units
                  .filter((u) => u.hp > 0 && u.group === c.group)
                  .map((u) => u.id),
              c.targetId,
            )
          : E.fogged(s)
            ? E.orderUnits(
                s,
                c.ids ||
                  s.units
                    .filter((u) => !u.team && u.hp > 0 && u.group === c.group)
                    .map((u) => u.id),
                c.x,
                c.y,
              )
            : E.order(s, c.group, c.x, c.y);
    E.step(s, d.input);
    if (i % 3600 === 0) {
      trace.push({
        t: Math.round(s.t),
        hp: Math.round(E.hero(s).hp),
        money: s.economy.alloy,
        army: D.population(s),
        stage: pilot.stage,
        kills: s.kills,
      });
      checkpoint?.(s, pilot);
    }
  }
  return { state: s, pilot, trace };
}
module.exports = { ExpeditionPilot, play, DISTRICT_POINTS };
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
