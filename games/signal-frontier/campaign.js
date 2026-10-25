/* Economy and operation rules for new deployments. The original operation remains resumable. */
(function (root) {
  "use strict";
  const PADS = Object.freeze(
    [
      {
        id: "west",
        name: "Западный участок",
        x: 450,
        y: 1030,
        oreX: 470,
        oreY: 1140,
      },
      {
        id: "relay",
        name: "Передовой узел",
        x: 1180,
        y: 880,
        oreX: 1270,
        oreY: 930,
      },
      {
        id: "flank",
        name: "Северный участок",
        x: 1340,
        y: 360,
        oreX: 1280,
        oreY: 460,
      },
    ].map(Object.freeze),
  );
  const MINES = Object.freeze(
    [
      { id: "home", x: 200, y: 1000, stock: 720 },
      ...PADS.map((p) => ({ id: p.id, x: p.oreX, y: p.oreY, stock: 900 })),
    ].map(Object.freeze),
  );
  const CACHES = Object.freeze(
    [
      { id: "west", x: 400, y: 850 },
      { id: "north", x: 1080, y: 400 },
      { id: "south", x: 1540, y: 1180 },
    ].map(Object.freeze),
  );
  const BUILDINGS = Object.freeze({
    barracks: { x: 280, y: 1140 },
    foundry: { x: 410, y: 1170 },
  });
  const ITEMS = Object.freeze({
    drone: { cost: 35, time: 12, pop: 0, label: "Дрон" },
    barracks: { cost: 80, time: 18, pop: 0, label: "Казармы" },
    outpost: { cost: 90, time: 24, pop: 0, label: "Добывающий узел" },
    network: { cost: 140, time: 50, pop: 0, label: "Сеть управления" },
    foundry: { cost: 80, time: 22, pop: 0, label: "Тяжёлый цех" },
    rifle: { cost: 35, time: 12, pop: 1, label: "Боец" },
    artillery: { cost: 140, time: 25, pop: 3, label: "Артиллерия" },
    hack: { cost: 100, time: 35, pop: 0, label: "Модуль проникновения" },
    weapons: { cost: 90, time: 30, pop: 0, label: "Импульсные усилители" },
    armor: { cost: 90, time: 30, pop: 0, label: "Композитная броня" },
  });
  function create(E) {
    const alive = (s, kind) =>
      s.units.filter((u) => u.hp > 0 && (!kind || u.kind === kind));
    const ready = (s, kind) => alive(s, kind).filter((u) => !u.build);
    const nodes = (s) =>
      alive(s).filter((u) => ["base", "outpost"].includes(u.kind) && !u.build);
    const mineFor = (s, u) =>
      u &&
      s.campaign.mines.find(
        (m) => m.id === (u.kind === "base" ? "home" : u.site),
      );
    const queued = (s, kind) =>
      s.units
        .flatMap((u) => u.jobs || [])
        .filter((j) => !kind || j.action === kind);
    const population = (s) =>
      alive(s).reduce((n, u) => n + (ITEMS[u.kind]?.pop || 0), 0) +
      queued(s).reduce((n, j) => n + ITEMS[j.action].pop, 0);
    const capacity = (s) => 6 + ready(s, "outpost").length * 3;
    const count = (s, kind) => alive(s, kind).length + queued(s, kind).length;
    const workers = (s, node) =>
      alive(s, "drone").filter((u) => u.node === node.id);
    const usedSlots = (s, node) =>
      workers(s, node).length +
      (node.jobs || []).filter((j) => j.action === "drone").length;
    const free = (p, r = 14) => E.free(p.x, p.y, r, "frontier");
    function initUnit(u) {
      u.map = "frontier";
      u.jobs = [];
      u.build = u.build || 0;
      return u;
    }
    function worker(s, node) {
      const p = E.spawnPoint(s, node, "drone");
      if (!p) return null;
      const u = initUnit(E.unit(s, "drone", 0, p.x, p.y));
      u.node = node.id;
      u.cargo = 0;
      u.work = "out";
      u.workTime = 0;
      u.fright = 0;
      return u;
    }
    function make() {
      const s = E.makeClassic();
      s.version = 3;
      s.economy = {
        alloy: 180,
        spent: 0,
        recovered: 0,
        kit: false,
        legacySupport: false,
      };
      s.campaign = {
        id: "frontier-1",
        tier: 1,
        weapons: false,
        armor: false,
        deposited: 0,
        lostCargo: 0,
        refunded: 0,
        jobSeq: 0,
        squadSeq: 0,
        mines: MINES.map((m) => ({ ...m, remaining: m.stock })),
        intel: [],
        camps: [],
      };
      s.caches = CACHES.map((c) => ({ ...c, taken: false, charge: 0 }));
      s.relay = {
        x: 1320,
        y: 810,
        charge: 0,
        online: false,
        stability: 0,
        started: 0,
      };
      s.terminal = {
        x: 1780,
        y: 390,
        charge: 0,
        window: 0,
        alarm: false,
        channeling: false,
      };
      const positions = {
        hero: [180, 1050],
        base: [135, 1140],
        jammer: [1470, 290],
        citadel: [1770, 780],
        turret: [1210, 1030],
      };
      let rifle = 0,
        guard = 0;
      const guards = [
        [850, 780],
        [730, 650],
        [1050, 440],
        [1160, 410],
        [1440, 460],
        [1680, 830],
        [1710, 930],
        [1760, 400],
        [1840, 260],
      ];
      for (const u of s.units) {
        initUnit(u);
        const p =
          positions[u.kind] ||
          (u.kind === "rifle"
            ? [
                [290, 1000],
                [330, 1050],
                [280, 1080],
              ][rifle++]
            : guards[guard++]);
        [u.x, u.y] = p;
        if (u.team)
          u.ai = {
            home: { x: u.x, y: u.y },
            goal: null,
            seen: null,
            seenAt: 0,
            route: 0,
            role: u.kind === "runner" ? "flank" : "line",
            raid: false,
            patrol: 0,
          };
      }
      for (const [x, y] of [
        [1340, 940],
        [1360, 690],
        [1570, 340],
        [1730, 540],
      ]) {
        const u = initUnit(E.unit(s, "sentinel", 1, x, y));
        u.ai = {
          home: { x, y },
          goal: null,
          seen: null,
          seenAt: 0,
          route: 0,
          role: "line",
          raid: false,
          patrol: 0,
        };
      }
      const base = E.living(s, "base");
      worker(s, base);
      worker(s, base);
      for (const [i, kind] of ["jammer", "turret", "citadel"].entries()) {
        const source = E.living(s, kind);
        s.campaign.camps.push({
          source: source.id,
          reserve: 24,
          cooldown: 90 + i * 35,
          warning: 0,
          waves: 0,
          target: null,
        });
      }
      s.campaign.intel = [{ id: base.id, x: base.x, y: base.y, seenAt: 0 }];
      return s;
    }
    function offer(s, action, site) {
      const item = ITEMS[action],
        fail = (reason) => ({ allowed: false, reason, cost: item?.cost || 0 });
      if (s.status !== "playing") return fail("ended");
      if (action === "cancel") {
        const [id, jobId] = String(site).split(":").map(Number),
          producer = alive(s).find((u) => u.id === id),
          job = producer?.jobs?.find((j) => j.id === jobId);
        return job
          ? { allowed: true, cost: -Math.floor(job.cost * 0.75), producer, job }
          : fail("order");
      }
      if (!item) return fail("unknown");
      if (
        s.units.length >= 250 &&
        [
          "rifle",
          "artillery",
          "drone",
          "outpost",
          "barracks",
          "foundry",
        ].includes(action)
      )
        return fail("limit");
      let producer, anchor;
      if (["barracks", "foundry"].includes(action)) {
        if (alive(s, action).length) return fail("occupied");
        if (action === "foundry" && s.campaign.tier < 2) return fail("network");
        anchor = BUILDINGS[action];
      } else if (action === "outpost") {
        anchor = PADS.find((p) => p.id === site);
        if (!anchor) return fail("site");
        if (alive(s, "outpost").some((u) => u.site === site))
          return fail("occupied");
        if (E.dist(E.hero(s), anchor) > 210) return fail("distance");
        if (s.units.some((u) => u.team && u.hp > 0 && E.dist(u, anchor) < 140))
          return fail("hostiles");
      } else {
        if (action === "drone") {
          producer =
            nodes(s).find((u) => String(u.id) === String(site)) ||
            (!site ? E.living(s, "base") : null);
          if (!producer) return fail("post");
          if (usedSlots(s, producer) >= 4 || count(s, "drone") >= 16)
            return fail("worker-limit");
          if (!mineFor(s, producer)?.remaining) return fail("exhausted");
        } else if (["rifle", "weapons"].includes(action))
          producer = ready(s, "barracks")[0];
        else if (["artillery", "armor"].includes(action))
          producer = ready(s, "foundry")[0];
        else producer = E.living(s, "base");
        if (!producer)
          return fail(
            ["rifle", "weapons"].includes(action) ? "barracks" : "foundry",
          );
        if (action === "network") {
          if (s.campaign.tier === 2) return fail("installed");
          if (!ready(s, "barracks").length) return fail("barracks");
          if (!ready(s, "outpost").length) return fail("expansion");
        }
        if (
          ["hack", "weapons", "armor", "artillery"].includes(action) &&
          s.campaign.tier < 2
        )
          return fail("network");
        if (action === "artillery" && !s.relay.online) return fail("relay");
        if (
          (action === "hack" && s.economy.kit) ||
          (["weapons", "armor"].includes(action) && s.campaign[action])
        )
          return fail("installed");
        if (
          ["network", "hack", "weapons", "armor"].includes(action) &&
          queued(s, action).length
        )
          return fail("researching");
        if (action === "rifle" && count(s, "rifle") >= 9)
          return fail("squad-full");
        if (action === "artillery" && count(s, "artillery") >= 2)
          return fail("artillery-limit");
        if (item.pop && population(s) + item.pop > capacity(s))
          return fail("capacity");
        if ((producer.jobs || []).length >= 3) return fail("queue");
      }
      if (s.economy.alloy < item.cost) return fail("funds");
      return { allowed: true, reason: null, cost: item.cost, producer, anchor };
    }
    function purchase(s, action, site) {
      const o = offer(s, action, site);
      if (!o.allowed) return o;
      if (action === "cancel") {
        const refund = -o.cost;
        o.producer.jobs = o.producer.jobs.filter((j) => j.id !== o.job.id);
        s.economy.alloy += refund;
        s.economy.recovered += refund;
        s.campaign.refunded += refund;
        E.emit(s, "salvage", o.producer.x, o.producer.y, { amount: refund });
        return { allowed: true, cost: o.cost };
      }
      const item = ITEMS[action];
      s.economy.alloy -= item.cost;
      s.economy.spent += item.cost;
      if (o.anchor) {
        const u = initUnit(E.unit(s, action, 0, o.anchor.x, o.anchor.y));
        u.build = item.time;
        if (action === "outpost") {
          u.site = site;
          u.salvaged = false;
        }
        E.emit(s, "build", u.x, u.y);
      } else {
        o.producer.jobs.push({
          id: ++s.campaign.jobSeq,
          action,
          cost: item.cost,
          duration: item.time,
          remaining: item.time,
        });
        E.emit(s, "order", o.producer.x, o.producer.y);
      }
      return { allowed: true, cost: item.cost };
    }
    function production(s, dt) {
      for (const u of alive(s).filter((u) => !u.team && u.kind !== "drone")) {
        if (u.build > 0) {
          // Outposts require a scout on site; construction at home is automated.
          if (u.kind !== "outpost" || E.dist(E.hero(s), u) <= 210) {
            u.build = Math.max(0, u.build - dt);
            if (u.build === 0) {
              E.emit(s, "post-ready", u.x, u.y);
            }
          }
          continue;
        }
        const job = u.jobs?.[0];
        if (!job) continue;
        if (ITEMS[job.action].pop && population(s) > capacity(s)) continue;
        if (
          ["rifle", "artillery", "drone"].includes(job.action) &&
          !E.spawnPoint(s, u, job.action)
        )
          continue;
        job.remaining = Math.max(0, job.remaining - dt);
        if (job.remaining > 0) continue;
        u.jobs.shift();
        if (job.action === "network") s.campaign.tier = 2;
        else if (job.action === "hack") {
          s.economy.kit = true;
          s.approach = "infiltration";
        } else if (["armor", "weapons"].includes(job.action))
          s.campaign[job.action] = true;
        else if (job.action === "drone") worker(s, u);
        else {
          const p = E.spawnPoint(s, u, job.action);
          const recruit = initUnit(
            E.unit(s, job.action, 0, p.x, p.y, job.action === "rifle" ? 1 : 2),
          );
          if (u.rally)
            recruit.path = E.pathTo(recruit, u.rally, E.C[recruit.kind].r);
        }
        E.emit(
          s,
          ["network", "hack", "armor", "weapons"].includes(job.action)
            ? "upgrade"
            : "reinforce",
          u.x,
          u.y,
          { action: job.action },
        );
      }
    }
    function mining(s, dt) {
      for (const u of alive(s, "drone")) {
        let node = nodes(s).find((n) => n.id === u.node);
        if (!node) {
          node =
            nodes(s).find(
              (n) => usedSlots(s, n) < 4 && mineFor(s, n)?.remaining,
            ) || E.living(s, "base");
          if (!node) {
            u.path = [];
            continue;
          }
          u.node = node.id;
          u.path = [];
          u.work = u.cargo ? "return" : "out";
        }
        let mine = mineFor(s, node);
        if ((!mine.remaining || workers(s, node).indexOf(u) >= 4) && !u.cargo) {
          const next = nodes(s).find(
            (n) =>
              n.id !== node.id &&
              mineFor(s, n)?.remaining &&
              usedSlots(s, n) < 4,
          );
          if (next) {
            node = next;
            u.node = node.id;
            mine = mineFor(s, node);
            u.path = [];
          }
        }
        const standby = !u.cargo && workers(s, node).indexOf(u) >= 4;
        const threat = s.units.some(
          (v) => v.team && v.hp > 0 && E.dist(v, u) < 170 && E.clear(u, v),
        );
        u.fright = threat ? 5 : Math.max(0, u.fright - dt);
        const offset = ((u.id % 4) - 1.5) * 10;
        const destination =
          u.fright || u.cargo || !mine.remaining || standby
            ? { x: node.x + offset, y: node.y - 44 }
            : { x: mine.x + offset, y: mine.y };
        const goalKey = destination.x + "," + destination.y;
        if (u.workTarget !== goalKey) {
          u.path = [];
          u.workTarget = goalKey;
        }
        if (E.dist(u, destination) > 18) {
          if (!u.path.length) u.path = E.pathTo(u, destination, E.C.drone.r);
          E.follow(u, dt);
          u.work = u.fright ? "shelter" : u.cargo ? "return" : "out";
          u.workTime = 0;
        } else {
          u.path = [];
          if (u.fright) {
            u.work = "shelter";
            u.workTime = 0;
            continue;
          }
          if (u.cargo) {
            s.economy.alloy += u.cargo;
            s.campaign.deposited += u.cargo;
            u.cargo = 0;
            u.work = "out";
            u.workTime = 0;
          } else if (mine.remaining && !standby) {
            u.work = "gather";
            u.workTime += dt;
            if (u.workTime >= 3.2) {
              u.cargo = Math.min(4, mine.remaining);
              mine.remaining -= u.cargo;
              u.workTime = 0;
              u.work = "return";
            }
          } else u.work = "idle";
        }
      }
    }
    function interaction(s) {
      const h = E.hero(s),
        options = [];
      for (const c of s.caches)
        if (!c.taken && E.dist(h, c) < 65)
          options.push({
            type: "cache",
            target: c,
            allowed: true,
            progress: c.charge,
          });
      if (s.phase === 1 && E.dist(h, s.relay) < 75)
        options.push({
          type: "relay",
          target: s.relay,
          allowed: true,
          progress: s.relay.charge,
        });
      if (E.dist(h, s.terminal) < 75)
        options.push({
          type: "terminal",
          target: s.terminal,
          allowed: s.economy.kit,
          progress: s.terminal.charge,
        });
      return (
        options.sort((a, b) => E.dist(h, a.target) - E.dist(h, b.target))[0] ||
        null
      );
    }
    function objective(s) {
      if (!s.economy.kit && s.campaign.tier === 1) {
        if (!alive(s, "barracks").length)
          return { id: "develop", target: E.living(s, "base"), radius: 60 };
        if (!alive(s, "outpost").length)
          return { id: "expand", target: PADS[0], radius: 45 };
      }
      if (!E.shielded(s))
        return { id: "citadel", target: E.living(s, "citadel"), radius: 66 };
      if (s.approach === "infiltration" && s.economy.kit)
        return { id: "terminal", target: s.terminal, radius: 38 };
      if (s.phase === 2) return { id: "defend", target: s.relay, radius: 50 };
      if (s.phase === 1) return { id: "relay", target: s.relay, radius: 50 };
      return { id: "jammer", target: E.living(s, "jammer"), radius: 50 };
    }
    function strategy(s, input, dt) {
      production(s, dt);
      mining(s, dt);
      const h = E.hero(s),
        act = interaction(s),
        held = input.interact && s.dashT === 0 && act?.allowed;
      s.terminal.channeling = !!(held && act.type === "terminal");
      s.terminal.window = Math.max(0, s.terminal.window - dt);
      for (const cache of s.caches) {
        if (cache.taken) continue;
        if (held && act.target === cache) {
          cache.charge = Math.min(1, cache.charge + dt / 1.2);
          if (cache.charge === 1) {
            cache.taken = true;
            s.economy.alloy += 40;
            E.emit(s, "collect", cache.x, cache.y, { amount: 40 });
          }
        } else cache.charge = Math.max(0, cache.charge - dt * 0.6);
      }
      if (s.terminal.channeling) {
        s.approach = "infiltration";
        s.terminal.charge = Math.min(1, s.terminal.charge + dt / 3.6);
        if (s.terminal.charge === 1) {
          s.terminal.window = 7;
          if (!s.terminal.alarm) {
            s.terminal.alarm = true;
            const camp = s.campaign.camps[2];
            dispatch(s, camp, Math.min(5, camp.reserve), s.terminal);
            E.emit(s, "breach", s.terminal.x, s.terminal.y);
          }
        }
      } else s.terminal.charge = Math.max(0, s.terminal.charge - dt * 0.45);
      for (const post of ready(s, "outpost"))
        for (const u of alive(s))
          if (
            !u.team &&
            !["base", "outpost", "barracks", "foundry"].includes(u.kind) &&
            u.repair === 0 &&
            E.dist(u, post) < 145 &&
            E.clear(u, post)
          )
            u.hp = Math.min(E.C[u.kind].hp, u.hp + dt * 7);
      // A small home repair area allows the scout to return without making a forward node redundant.
      const base = E.living(s, "base");
      if (
        base &&
        h.repair === 0 &&
        E.dist(h, base) < 100 &&
        !s.units.some((u) => u.team && u.hp > 0 && E.dist(u, base) < 260)
      )
        h.hp = Math.min(E.C.hero.hp, h.hp + dt * 4);
    }
    function onDeath(s, u) {
      if (u.kind === "drone") {
        s.campaign.lostCargo += u.cargo;
        u.cargo = 0;
      }
      if (u.jobs) u.jobs = [];
    }
    function summary(s) {
      const ms = s.campaign.mines;
      return {
        population: population(s),
        capacity: capacity(s),
        workers: alive(s, "drone").length,
        working: alive(s, "drone").filter(
          (u) =>
            !u.fright &&
            mineFor(
              s,
              s.units.find((n) => n.id === u.node),
            )?.remaining,
        ).length,
        remaining: ms.reduce((n, m) => n + m.remaining, 0),
        tier: s.campaign.tier,
      };
    }
    function record(s, u, target) {
      const ai = u.ai,
        old = ai.seen,
        age = s.t - ai.seenAt;
      ai.vx =
        old && old.id === target.id && age > 0.05
          ? E.clamp((target.x - old.x) / age, -220, 220)
          : 0;
      ai.vy =
        old && old.id === target.id && age > 0.05
          ? E.clamp((target.y - old.y) / age, -220, 220)
          : 0;
      ai.seen = { x: target.x, y: target.y, id: target.id };
      ai.seenAt = s.t;
      if (["base", "outpost", "barracks", "foundry"].includes(target.kind)) {
        let known = s.campaign.intel.find((p) => p.id === target.id);
        if (!known) {
          known = { id: target.id };
          s.campaign.intel.push(known);
        }
        Object.assign(known, { x: target.x, y: target.y, seenAt: s.t });
      }
    }
    function position(u, target, distance, side) {
      const a = Math.atan2(u.y - target.y, u.x - target.x);
      for (const turn of [side * 0.5, side * 0.9, 0, -side * 0.5]) {
        const p = {
          x: target.x + Math.cos(a + turn) * distance,
          y: target.y + Math.sin(a + turn) * distance,
        };
        if (
          free(p, E.C[u.kind].r) &&
          E.clear(u, p, E.C[u.kind].r) &&
          E.clear(p, { ...target, map: "frontier" })
        )
          return p;
      }
      return null;
    }
    function enemy(s, u, dt, opponents) {
      const ai = u.ai,
        def = E.C[u.kind];
      if (!ai) return;
      u.think -= dt;
      const visible = opponents.filter(
        (v) => E.dist(u, v) < 610 && E.clear(u, v),
      );
      // Guards defend their sector; raiding squads can pursue across the map.
      const defend = !ai.raid && def.speed;
      const engage = defend
        ? visible.filter((v) => E.dist(v, ai.home) < 470)
        : visible;
      let target = engage.sort((a, b) => {
        const score = (v) =>
          E.dist(u, v) *
            (v.kind === "artillery" ? 0.7 : v.kind === "drone" ? 0.82 : 1) +
          (v.kind === "outpost" && u.kind !== "runner" ? 45 : 0);
        return score(a) - score(b);
      })[0];
      if (u.wind > 0) {
        u.wind = Math.max(0, u.wind - dt);
        if (u.wind === 0) {
          const locked = u.target,
            prey = locked && s.units.find((v) => v.id === locked.id);
          if (
            prey &&
            prey.hp > 0 &&
            E.clear(u, locked) &&
            (u.kind !== "runner" ||
              (E.dist(u, prey) < 65 && !(prey.kind === "hero" && s.dashT > 0)))
          )
            E.shoot(s, u, u.kind === "runner" ? prey : locked);
          else u.cool = 0.35;
        }
        return;
      }
      if (u.think <= 0) {
        u.think = 0.55 + (u.id % 3) * 0.11;
        if (target) record(s, u, target);
        // Nearby visible scouts share observed stationary infrastructure, not hidden unit positions.
        for (const v of visible)
          if (
            ["base", "outpost", "barracks", "foundry"].includes(v.kind) &&
            !s.campaign.intel.some((k) => k.id === v.id)
          )
            s.campaign.intel.push({ id: v.id, x: v.x, y: v.y, seenAt: s.t });
        if (def.speed) {
          let destination = null;
          if (target) {
            const d = E.dist(u, target),
              side = u.id % 2 ? 1 : -1;
            if (u.hp < def.hp * 0.3 && u.kind !== "runner")
              destination = position(u, target, Math.max(290, d + 85), side);
            else if (u.kind === "runner" && d > 80)
              destination = position(u, target, 55, side);
            else if (u.kind !== "runner" && d < def.range * 0.55)
              destination = position(u, target, def.range * 0.78, side);
            else if (u.kind !== "runner" && d < def.range && u.cool > 0.3)
              destination = position(u, target, def.range * 0.78, side);
            else if (d >= def.range) destination = { x: target.x, y: target.y };
          } else if (
            ai.seen &&
            s.t - ai.seenAt < 8 &&
            (!defend || E.dist(ai.seen, ai.home) < 470)
          )
            destination = ai.seen;
          else if (ai.raid) {
            while (ai.waypoints?.length && E.dist(u, ai.waypoints[0]) < 60)
              ai.waypoints.shift();
            destination = ai.waypoints?.[0] || ai.goal;
          } else {
            const angle = ((ai.patrol % 4) * Math.PI) / 2 + (u.id % 2) * 0.4;
            const patrol = {
              x: ai.home.x + Math.cos(angle) * 65,
              y: ai.home.y + Math.sin(angle) * 65,
            };
            destination = free(patrol, def.r) ? patrol : ai.home;
            if (E.dist(u, destination) < 22) ai.patrol++;
          }
          if (defend && destination && E.dist(destination, ai.home) > 380) {
            const a = Math.atan2(
              destination.y - ai.home.y,
              destination.x - ai.home.x,
            );
            destination = {
              x: ai.home.x + Math.cos(a) * 330,
              y: ai.home.y + Math.sin(a) * 330,
            };
          }
          if (destination && free(destination, def.r))
            u.path = E.pathTo(u, destination, def.r);
          else u.path = [];
        }
      }
      if (target && E.dist(u, target) < def.range && u.cool === 0) {
        const lead =
          u.kind === "runner"
            ? 0
            : Math.min(1.1, 0.5 + E.dist(u, target) / 390);
        // Position is locked before firing. Changing direction after the warning remains effective.
        const lock = {
          x: E.clamp(target.x + (ai.vx || 0) * lead, 24, 1896),
          y: E.clamp(target.y + (ai.vy || 0) * lead, 24, 1256),
          id: target.id,
        };
        if (!E.clear(u, lock)) {
          lock.x = target.x;
          lock.y = target.y;
        }
        u.target = lock;
        u.wind = u.kind === "runner" ? 0.24 : u.kind === "citadel" ? 0.7 : 0.5;
        u.angle = Math.atan2(lock.y - u.y, lock.x - u.x);
        return;
      }
      if (def.speed) {
        E.follow(u, dt);
        // Keep a small separation so a whole squad cannot occupy one point or eat one projectile.
        for (const other of s.units)
          if (
            other !== u &&
            other.team &&
            other.hp > 0 &&
            E.C[other.kind].speed
          ) {
            const d = E.dist(u, other),
              gap = def.r + E.C[other.kind].r + 5;
            if (d > 0 && d < gap)
              E.move(
                u,
                ((u.x - other.x) / d) * 12 * dt,
                ((u.y - other.y) / d) * 12 * dt,
              );
          }
      }
    }
    function dispatch(s, camp, n, goal) {
      const source = s.units.find((u) => u.id === camp.source);
      if (!source || source.hp <= 0) return;
      let spawned = 0;
      for (let i = 0; i < n && camp.reserve > 0; i++) {
        const kind = i % 3 === 0 ? "runner" : "sentinel",
          p = E.spawnPoint(s, source, kind);
        if (!p) break;
        const u = initUnit(E.unit(s, kind, 1, p.x, p.y));
        camp.reserve--;
        spawned++;
        const south =
          source.kind === "turret" ||
          (source.kind === "citadel" && camp.waves % 2 === 0);
        u.ai = {
          home: { x: source.x, y: source.y },
          goal: { x: goal.x, y: goal.y },
          seen: null,
          seenAt: 0,
          vx: 0,
          vy: 0,
          route: camp.waves,
          role: kind === "runner" ? "flank" : "line",
          raid: true,
          patrol: 0,
          waypoints:
            E.dist(source, goal) > 700
              ? south
                ? [
                    { x: 1320, y: 1180 },
                    { x: 560, y: 1120 },
                  ]
                : [
                    { x: 1020, y: 500 },
                    { x: 530, y: 600 },
                  ]
              : [],
        };
      }
      if (spawned) {
        camp.waves++;
        E.emit(s, "reinforce", source.x, source.y);
      }
    }
    function director(s, dt) {
      for (const camp of s.campaign.camps) {
        const source = s.units.find((u) => u.id === camp.source);
        if (!source || source.hp <= 0 || camp.reserve <= 0) {
          camp.warning = 0;
          continue;
        }
        if (camp.warning > 0) {
          camp.warning = Math.max(0, camp.warning - dt);
          if (camp.warning === 0) {
            dispatch(
              s,
              camp,
              4 + Math.min(2, Math.floor(s.t / 150)),
              camp.target,
            );
            camp.cooldown = 65;
          }
        } else {
          camp.cooldown = Math.max(0, camp.cooldown - dt);
          if (camp.cooldown === 0) {
            const known = s.campaign.intel.filter((p) =>
              s.units.some((u) => u.id === p.id && u.hp > 0),
            );
            const candidates = known.sort(
              (a, b) => E.dist(source, a) - E.dist(source, b),
            );
            camp.target = candidates[
              (camp.waves + source.id) % Math.min(2, candidates.length)
            ] || { x: 135, y: 1140 };
            camp.target = { x: camp.target.x, y: camp.target.y };
            camp.warning = 9;
            E.emit(s, "raid", source.x, source.y, {
              target: camp.target,
              sector:
                source.kind === "jammer"
                  ? "north"
                  : source.kind === "turret"
                    ? "south"
                    : "east",
            });
          }
        }
      }
    }
    function operation(s, input, dt) {
      director(s, dt);
      const h = E.hero(s);
      if (!E.living(s, "jammer") && s.phase === 0) {
        s.phase = 1;
        s.checkpoint = 1;
        E.emit(s, "objective", s.relay.x, s.relay.y);
      }
      if (
        s.phase === 1 &&
        E.dist(h, s.relay) < 75 &&
        input.interact &&
        s.dashT === 0
      ) {
        s.approach = "siege";
        s.relay.charge = Math.min(1, s.relay.charge + dt / 2.8);
        if (s.relay.charge === 1) {
          s.phase = 2;
          s.checkpoint = 2;
          s.relay.started = s.t;
          E.emit(s, "online", s.relay.x, s.relay.y);
        }
      } else if (s.phase === 1)
        s.relay.charge = Math.max(0, s.relay.charge - dt * 0.2);
      if (s.phase === 2) {
        const contested = s.units.some(
          (u) => u.team && u.hp > 0 && E.dist(u, s.relay) < 170,
        );
        s.relay.stability = E.clamp(
          s.relay.stability + (contested ? -dt * 0.025 : dt / 45),
          0,
          1,
        );
        if (s.relay.stability === 1) {
          s.phase = 3;
          s.relay.online = true;
          E.emit(s, "online", s.relay.x, s.relay.y);
        }
      }
    }
    function restore(value) {
      try {
        const s = JSON.parse(JSON.stringify(value)),
          c = s?.campaign;
        const num = (v, min, max) => Number.isFinite(v) && v >= min && v <= max,
          int = (v, min, max) => Number.isInteger(v) && num(v, min, max);
        const point = (p) => p && num(p.x, 0, 1920) && num(p.y, 0, 1280);
        const ally = [
          "hero",
          "base",
          "outpost",
          "rifle",
          "artillery",
          "drone",
          "barracks",
          "foundry",
        ];
        if (
          !s ||
          s.version !== 3 ||
          c?.id !== "frontier-1" ||
          !["playing", "won", "lost"].includes(s.status) ||
          !num(s.t, 0, 86400) ||
          !int(s.seq, 1, 10000) ||
          !int(s.seed, 0, 4294967295) ||
          !Array.isArray(s.units) ||
          s.units.length > 256 ||
          !Array.isArray(s.bullets) ||
          s.bullets.length > 160 ||
          ![0, 1, 2, 3].includes(s.phase)
        )
          return null;
        for (const k of ["hero", "base", "jammer", "citadel", "turret"])
          if (s.units.filter((u) => u.kind === k).length !== 1) return null;
        const ids = new Set(),
          sites = new Set(),
          jobIds = new Set(),
          research = new Set();
        let cargo = 0;
        for (const u of s.units) {
          if (
            !Object.hasOwn(E.C, u.kind) ||
            !int(u.id, 1, s.seq) ||
            ids.has(u.id) ||
            u.map !== "frontier" ||
            !point(u) ||
            (u.hp > 0 && !E.free(u.x, u.y, E.C[u.kind].r, "frontier")) ||
            !num(u.hp, 0, E.C[u.kind].hp) ||
            u.team !== (ally.includes(u.kind) ? 0 : 1) ||
            !Array.isArray(u.path) ||
            u.path.length > 400 ||
            u.path.some((p) => !point(p)) ||
            !["angle", "cool", "wind", "hit", "flash", "think", "repair"].every(
              (k) =>
                num(
                  u[k],
                  k === "angle" ? -100 : k === "think" ? -2 : 0,
                  k === "angle"
                    ? 100
                    : k === "think"
                      ? 10
                      : k === "repair"
                        ? 3
                        : 5,
                ),
            ) ||
            ![0, 1, 2].includes(u.group) ||
            (u.order !== null && !point(u.order)) ||
            (u.target !== null &&
              (!point(u.target) || !int(u.target.id, 1, s.seq)))
          )
            return null;
          if (
            (u.kind === "rifle" && u.group !== 1) ||
            (u.kind === "artillery" && u.group !== 2) ||
            (!["rifle", "artillery"].includes(u.kind) && u.group !== 0)
          )
            return null;
          if (u.rally !== undefined && !point(u.rally)) return null;
          if (
            u.workTarget !== undefined &&
            (typeof u.workTarget !== "string" || u.workTarget.length > 80)
          )
            return null;
          ids.add(u.id);
          if (
            !num(u.build, 0, ITEMS[u.kind]?.time || 0) ||
            !Array.isArray(u.jobs) ||
            u.jobs.length > 3 ||
            (u.hp === 0 && u.jobs.length)
          )
            return null;
          if (u.kind === "outpost") {
            const pad = PADS.find((p) => p.id === u.site);
            if (!pad || u.x !== pad.x || u.y !== pad.y || u.salvaged !== false)
              return null;
            if (u.hp > 0) {
              if (sites.has(u.site)) return null;
              sites.add(u.site);
            }
          }
          if (
            BUILDINGS[u.kind] &&
            (u.x !== BUILDINGS[u.kind].x || u.y !== BUILDINGS[u.kind].y)
          )
            return null;
          for (const job of u.jobs) {
            const spec = ITEMS[job.action],
              allowed =
                {
                  base: ["drone", "network", "hack"],
                  outpost: ["drone"],
                  barracks: ["rifle", "weapons"],
                  foundry: ["artillery", "armor"],
                }[u.kind] || [];
            if (
              !spec ||
              !allowed.includes(job.action) ||
              !int(job.id, 1, c.jobSeq) ||
              jobIds.has(job.id) ||
              job.cost !== spec.cost ||
              job.duration !== spec.time ||
              !num(job.remaining, 0, spec.time) ||
              u.build > 0
            )
              return null;
            jobIds.add(job.id);
            if (["network", "hack", "weapons", "armor"].includes(job.action)) {
              if (research.has(job.action)) return null;
              research.add(job.action);
            }
          }
          if (u.kind === "drone") {
            if (
              !int(u.node, 1, s.seq) ||
              !int(u.cargo, 0, 4) ||
              !["out", "return", "gather", "idle", "shelter"].includes(
                u.work,
              ) ||
              !num(u.workTime, 0, 3.21) ||
              !num(u.fright, 0, 5) ||
              (u.hp === 0 && u.cargo !== 0)
            )
              return null;
            cargo += u.cargo;
          }
          if (u.team) {
            const ai = u.ai;
            if (
              !ai ||
              !point(ai.home) ||
              (ai.goal !== null && !point(ai.goal)) ||
              (ai.seen !== null &&
                (!point(ai.seen) || !int(ai.seen.id, 1, s.seq))) ||
              !num(ai.seenAt, 0, s.t) ||
              typeof ai.raid !== "boolean" ||
              !int(ai.patrol, 0, 100000) ||
              !int(ai.route, 0, 100) ||
              !["flank", "line"].includes(ai.role) ||
              (ai.vx !== undefined && !num(ai.vx, -220, 220)) ||
              (ai.vy !== undefined && !num(ai.vy, -220, 220)) ||
              (ai.waypoints &&
                (!Array.isArray(ai.waypoints) ||
                  ai.waypoints.length > 3 ||
                  ai.waypoints.some((p) => !point(p))))
            )
              return null;
          }
        }
        if (E.hero(s)?.kind !== "hero") return null;
        if (
          s.units
            .filter((u) => u.kind === "drone")
            .some(
              (u) =>
                !s.units.some(
                  (n) =>
                    n.id === u.node && ["base", "outpost"].includes(n.kind),
                ),
            )
        )
          return null;
        if (
          ["barracks", "foundry"].some((k) => alive(s, k).length > 1) ||
          count(s, "rifle") > 9 ||
          count(s, "artillery") > 2 ||
          count(s, "drone") > 16
        )
          return null;
        if (
          ![1, 2].includes(c.tier) ||
          typeof c.weapons !== "boolean" ||
          typeof c.armor !== "boolean" ||
          !["deposited", "lostCargo", "refunded", "jobSeq", "squadSeq"].every(
            (k) => int(c[k], 0, 20000),
          )
        )
          return null;
        if (
          (research.has("network") && c.tier === 2) ||
          (research.has("hack") && s.economy?.kit) ||
          (research.has("weapons") && c.weapons) ||
          (research.has("armor") && c.armor)
        )
          return null;
        if (!Array.isArray(c.mines) || c.mines.length !== MINES.length)
          return null;
        let extracted = 0;
        for (let i = 0; i < MINES.length; i++) {
          const m = c.mines[i],
            d = MINES[i];
          if (
            !m ||
            m.id !== d.id ||
            m.x !== d.x ||
            m.y !== d.y ||
            m.stock !== d.stock ||
            !int(m.remaining, 0, d.stock)
          )
            return null;
          extracted += m.stock - m.remaining;
        }
        if (extracted !== c.deposited + c.lostCargo + cargo) return null;
        const eco = s.economy;
        if (
          !eco ||
          !["alloy", "spent", "recovered"].every((k) =>
            int(eco[k], 0, 20000),
          ) ||
          typeof eco.kit !== "boolean" ||
          eco.legacySupport !== false ||
          eco.recovered !== c.refunded ||
          c.refunded > eco.spent * 0.75
        )
          return null;
        if (
          (c.weapons ||
            c.armor ||
            eco.kit ||
            ["hack", "weapons", "armor"].some((k) => research.has(k)) ||
            s.units.some((u) => ["foundry", "artillery"].includes(u.kind))) &&
          c.tier !== 2
        )
          return null;
        if (
          !["siege", "infiltration"].includes(s.approach) ||
          !Array.isArray(s.caches) ||
          s.caches.length !== CACHES.length
        )
          return null;
        for (let i = 0; i < CACHES.length; i++) {
          const v = s.caches[i],
            d = CACHES[i];
          if (
            !v ||
            v.id !== d.id ||
            v.x !== d.x ||
            v.y !== d.y ||
            typeof v.taken !== "boolean" ||
            !num(v.charge, 0, 1) ||
            (v.taken && v.charge !== 1)
          )
            return null;
        }
        if (
          eco.alloy !==
          180 +
            s.caches.filter((v) => v.taken).length * 40 +
            c.deposited +
            eco.recovered -
            eco.spent
        )
          return null;
        const r = s.relay,
          t = s.terminal;
        if (
          !r ||
          r.x !== 1320 ||
          r.y !== 810 ||
          !num(r.charge, 0, 1) ||
          r.online !== (s.phase === 3) ||
          !num(r.stability, 0, 1) ||
          !num(r.started, 0, s.t) ||
          !t ||
          t.x !== 1780 ||
          t.y !== 390 ||
          !num(t.charge, 0, 1) ||
          !num(t.window, 0, 7) ||
          typeof t.alarm !== "boolean" ||
          typeof t.channeling !== "boolean" ||
          (t.window > 0 && !eco.kit)
        )
          return null;
        const ranges = {
          dash: [0, 3.2],
          dashT: [0, 0.2],
          dashX: [-1, 1],
          dashY: [-1, 1],
          ammo: [0, 12],
          reload: [0, 1.1],
          wave: [0, 2],
          kills: [0, 10000],
          shots: [0, 100000],
          damageTaken: [0, 100000],
        };
        if (
          Object.entries(ranges).some(([k, [a, b]]) => !num(s[k], a, b)) ||
          !Number.isInteger(s.ammo)
        )
          return null;
        if (
          s.bullets.some(
            (b) =>
              ![
                "x",
                "y",
                "vx",
                "vy",
                "life",
                "damage",
                "age",
                "tx",
                "ty",
              ].every((k) => Number.isFinite(b[k])) ||
              !["shell", "bolt"].includes(b.kind) ||
              ![0, 1].includes(b.team) ||
              b.map !== "frontier" ||
              !int(b.owner, 1, s.seq) ||
              !num(b.damage, 0, 200) ||
              !num(b.age, 0, 10) ||
              !num(b.life, 0, 10),
          )
        )
          return null;
        if (
          !Array.isArray(c.camps) ||
          c.camps.length !== 3 ||
          !Array.isArray(c.intel) ||
          c.intel.length > 256
        )
          return null;
        for (const [i, camp] of c.camps.entries())
          if (
            camp.source !==
              s.units.find((u) => u.kind === ["jammer", "turret", "citadel"][i])
                .id ||
            !int(camp.reserve, 0, 24) ||
            !num(camp.cooldown, 0, 200) ||
            !num(camp.warning, 0, 9) ||
            !int(camp.waves, 0, 24) ||
            (camp.target !== null && !point(camp.target))
          )
            return null;
        for (const known of c.intel)
          if (
            !point(known) ||
            !int(known.id, 1, s.seq) ||
            !s.units.some(
              (u) =>
                u.id === known.id &&
                ["base", "outpost", "barracks", "foundry"].includes(u.kind),
            ) ||
            !num(known.seenAt, 0, s.t)
          )
            return null;
        if (
          (s.status === "playing" &&
            (!E.hero(s).hp ||
              !E.living(s, "base") ||
              !E.living(s, "citadel"))) ||
          (s.status === "won" && E.living(s, "citadel"))
        )
          return null;
        s.events = [];
        return s;
      } catch (_) {
        return null;
      }
    }

    return {
      make,
      offer,
      purchase,
      strategy,
      interaction,
      objective,
      onDeath,
      summary,
      population,
      capacity,
      workers,
      queued,
      nodes,
      mineFor,
      usedSlots,
      ITEMS,
      PADS,
      MINES,
      CACHES,
      BUILDINGS,
      enemy,
      operation,
      restore,
    };
  }
  const api = { create, PADS, MINES, CACHES, ITEMS, BUILDINGS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SignalCampaign = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
