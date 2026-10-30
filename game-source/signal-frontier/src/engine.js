/* Simulation is independent of rendering, audio and frame rate. Coordinates are world pixels. */
(function (root) {
  "use strict";
  const Terrain =
    typeof module !== "undefined" && module.exports
      ? require("./terrain.js")
      : root.SignalTerrain;
  const W = 1440,
    H = 1000,
    DT = 1 / 60;
  const walls = [
    { x: 600, y: 320, w: 115, h: 265 },
    { x: 645, y: 770, w: 120, h: 230 },
    { x: 330, y: 250, w: 180, h: 110 },
    { x: 1110, y: 660, w: 130, h: 100 },
    { x: 1100, y: 100, w: 90, h: 125 },
  ];
  const C = {
    hero: { hp: 150, r: 14, speed: 205, range: 620, damage: 24, rate: 0.16 },
    rifle: { hp: 115, r: 12, speed: 125, range: 300, damage: 13, rate: 0.44 },
    artillery: { hp: 220, r: 20, speed: 78, range: 540, damage: 98, rate: 2.6 },
    sentinel: { hp: 90, r: 13, speed: 82, range: 310, damage: 10, rate: 1.35 },
    runner: { hp: 55, r: 11, speed: 145, range: 48, damage: 13, rate: 0.85 },
    warden: { hp: 180, r: 16, speed: 92, range: 365, damage: 17, rate: 1.55 },
    scout: { hp: 70, r: 10, speed: 180, range: 0, damage: 0, rate: 0 },
    rocket: { hp: 105, r: 14, speed: 76, range: 430, damage: 32, rate: 3.6 },
    flamer: { hp: 175, r: 16, speed: 90, range: 178, damage: 30, rate: 3.2 },
    bomber: { hp: 65, r: 12, speed: 154, range: 56, damage: 74, rate: 1 },
    tank: { hp: 420, r: 24, speed: 58, range: 440, damage: 42, rate: 3.6 },
    mortar: { hp: 250, r: 22, speed: 48, range: 610, damage: 54, rate: 6.4 },
    bastion: { hp: 1400, r: 44, speed: 0, range: 470, damage: 28, rate: 1.8 },
    turret: { hp: 200, r: 25, speed: 0, range: 400, damage: 19, rate: 2.1 },
    jammer: { hp: 340, r: 32, speed: 0, range: 0, damage: 0, rate: 0 },
    citadel: { hp: 900, r: 48, speed: 0, range: 520, damage: 21, rate: 2.5 },
    outpost: { hp: 280, r: 27, speed: 0, range: 0, damage: 0, rate: 0 },
    base: { hp: 700, r: 42, speed: 0, range: 0, damage: 0, rate: 0 },
    drone: { hp: 45, r: 8, speed: 85, range: 0, damage: 0, rate: 0 },
    barracks: { hp: 420, r: 30, speed: 0, range: 0, damage: 0, rate: 0 },
    foundry: { hp: 500, r: 34, speed: 0, range: 0, damage: 0, rate: 0 },
    arsenal: { hp: 440, r: 30, speed: 0, range: 0, damage: 0, rate: 0 },
  };
  // World units: one construction cell is 40. Older operations retain C above.
  const ENGAGEMENT = Object.freeze(Object.fromEntries([
    ["hero", 680, 780], ["rifle", 440, 640], ["artillery", 800, 720],
    ["sentinel", 420, 720], ["runner", 56, 700], ["warden", 500, 780],
    ["rocket", 620, 820], ["flamer", 240, 720], ["bomber", 64, 740],
    ["tank", 640, 840], ["mortar", 840, 940],
    ["scout", 0, 980], ["drone", 0, 240],
    ["base", 0, 800], ["outpost", 0, 840], ["barracks", 0, 360],
    ["foundry", 0, 400], ["arsenal", 0, 400], ["jammer", 0, 720],
    ["turret", 540, 800], ["bastion", 620, 940], ["citadel", 840, 980],
  ].map(([kind, range, sight]) => [kind, Object.freeze({ range, sight })])));
  const balanceEligible = (s) => s?.campaign?.id === "frontier-9",
    balanced = (s) => balanceEligible(s) && s.campaign.balance === 1,
    rangedStats = Object.freeze(Object.fromEntries(Object.entries(ENGAGEMENT)
      .map(([kind, values]) => [kind, Object.freeze({ ...C[kind], range: values.range })]))),
    legacySight = Object.freeze({ hero: 600, scout: 720, rifle: 440, artillery: 480,
      drone: 180, base: 380, outpost: 380, barracks: 280, foundry: 280, arsenal: 280 });
  function sightRange(s, u) {
    return u.care?.inside ? 0 : u.build > 0 ? 120 : balanced(s) ? ENGAGEMENT[u.kind]?.sight || 0 :
      u.team ? 610 : legacySight[u.kind] || 0;
  }
  function detectionRange(s, u) {
    return balanced(s) ? Math.max(stats(s, u).range, sightRange(s, u)) : u.team ? 610 : 620;
  }
  const siegeStats = Object.freeze(Object.fromEntries(["bastion", "citadel"].map((kind) =>
    [kind, Object.freeze({ ...C[kind], range: kind === "citadel" ? 840 : 860,
      damage: 54, rate: 6.4, siege: true })])));
  const MOUNTS = Object.freeze({
    hero: 19.5,
    citadel: 64,
    turret: 24,
    artillery: 23,
    bastion: 44,
    tank: 27,
    mortar: 39,
    rocket: 24,
    base: 51,
    outpost: 46,
  });
  const COSTS = Object.freeze({
    outpost: 50,
    artillery: 90,
    hack: 60,
    rifle: 20,
    salvage: 25,
  });
  const PADS = Object.freeze(
    [
      { id: "west", x: 450, y: 690 },
      { id: "relay", x: 790, y: 570 },
      { id: "flank", x: 1170, y: 300 },
    ].map(Object.freeze),
  );
  const CACHES = Object.freeze(
    [
      { id: "west", x: 430, y: 520 },
      { id: "north", x: 780, y: 160 },
      { id: "south", x: 1010, y: 850 },
    ].map(Object.freeze),
  );
  const classicMap = { id: "classic", W, H, walls };
  const frontierMap = {
    id: "frontier",
    W: 1920,
    H: 1280,
    walls: [
      ...walls,
      { x: 1480, y: 520, w: 120, h: 280 },
      { x: 1640, y: 160, w: 130, h: 140 },
      { x: 840, y: 1080, w: 320, h: 100 },
      { x: 1460, y: 1020, w: 180, h: 100 },
    ],
  };
  const expeditionMap = {
    id: "expedition",
    W: 2240,
    H: 2560,
    walls: [
      ...frontierMap.walls.map((w) => ({ ...w, y: w.y + 560 })),
      { x: 720, y: 150, w: 120, h: 300 },
      { x: 1180, y: 400, w: 260, h: 100 },
      { x: 1540, y: 80, w: 120, h: 180 },
      { x: 1820, y: 560, w: 260, h: 100 },
      { x: 900, y: 1990, w: 120, h: 300 },
      { x: 1220, y: 2110, w: 220, h: 100 },
      { x: 1900, y: 2030, w: 120, h: 230 },
      { x: 1530, y: 2410, w: 350, h: 80 },
    ],
  };
  const highlandsMap = Terrain.build(expeditionMap.walls);
  const Districts =
    typeof module !== "undefined" && module.exports
      ? require("./districts.js")
      : root.SignalDistricts;
  const districtMap = Districts.build(highlandsMap);
  const mapFor = (s) =>
    s?.navigation
      ? s
      : s === "districts" ||
          s?.id === "districts" ||
          s?.map === "districts" ||
          s?.campaign?.id === "frontier-9"
        ? districtMap
        : s === "highlands" ||
            s?.id === "highlands" ||
            s?.map === "highlands" ||
            ["frontier-7", "frontier-8"].includes(s?.campaign?.id)
          ? highlandsMap
          : s === "expedition" ||
              s?.id === "expedition" ||
              s?.map === "expedition" ||
              ["frontier-3", "frontier-4", "frontier-5", "frontier-6"].includes(
                s?.campaign?.id,
              )
            ? expeditionMap
            : s === "frontier" ||
                s?.id === "frontier" ||
                s?.campaign ||
                s?.map === "frontier"
              ? frontierMap
              : classicMap;
  let campaign, recon, construction, support;
  const owners = new WeakMap();
  function navigation(value) {
    if (value?.navigation) return value;
    if (value?.map?.navigation) return value.map;
    const state = value?.campaign ? value : owners.get(value);
    return construction?.enabled(state)
      ? construction.world(state)
      : mapFor(value);
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function targetEdge(from, target) {
    if (!target.construction) return target;
    const b = construction.rect(target);
    return {
      x: clamp(from.x, b.x, b.x + b.w),
      y: clamp(from.y, b.y, b.y + b.h),
    };
  }
  const rangeDistance = (from, target) => dist(from, targetEdge(from, target));
  function free(x, y, r = 14, map = "classic") {
    const world = map?.campaign ? navigation(map) : mapFor(map);
    return (
      x >= r + 24 &&
      x <= world.W - r - 24 &&
      y >= r + 24 &&
      y <= world.H - r - 24 &&
      (!["highlands", "districts"].includes(world.id) ||
        Terrain.free(x, y, r)) &&
      !world.walls.some(
        (b) =>
          x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h,
      )
    );
  }
  function segmentRect(ax, ay, bx, by, b, pad = 0) {
    let lo = 0,
      hi = 1;
    const dx = bx - ax,
      dy = by - ay;
    for (const [p, q] of [
      [-dx, ax - b.x + pad],
      [dx, b.x + b.w + pad - ax],
      [-dy, ay - b.y + pad],
      [dy, b.y + b.h + pad - ay],
    ]) {
      if (Math.abs(p) < 1e-9) {
        if (q < 0) return null;
      } else {
        const t = q / p;
        if (p < 0) lo = Math.max(lo, t);
        else hi = Math.min(hi, t);
        if (lo > hi) return null;
      }
    }
    return lo;
  }
  function wallClear(a, b, r = 0) {
    return !mapFor(a.map || b.map).walls.some(
      (w) => segmentRect(a.x, a.y, b.x, b.y, w, r) !== null,
    );
  }
  const sightCache = new Map();
  function clear(a, b, r = 0) {
    const world = mapFor(a.map || b.map);
    if (!["highlands", "districts"].includes(world.id))
      return wallClear(a, b, r);
    // Terrain and neutral cover are immutable. Repeated perception/targeting
    // queries may reuse an exact directed ray; moving endpoints get a new key.
    const key = [world.id, a.x, a.y, b.x, b.y, r].join(":"),
      known = sightCache.get(key);
    if (known !== undefined) return known;
    const eye = Terrain.height(a.x, a.y) + 24,
      result =
        Terrain.sight(a, b) &&
        !world.walls.some(
          (w) =>
            segmentRect(a.x, a.y, b.x, b.y, w, r) !== null &&
            Terrain.height(w.x + w.w / 2, w.y + w.h / 2) + 54 >= eye,
        );
    if (sightCache.size >= 8192)
      sightCache.delete(sightCache.keys().next().value);
    sightCache.set(key, result);
    return result;
  }
  const elevation = (x, y, map) =>
    ["highlands", "districts"].includes(mapFor(map).id)
      ? Terrain.height(x, y)
      : 0;
  const projectileHeight = (b, age = b.age) =>
    b.z0 === undefined
      ? null
      : b.z0 +
        (b.z1 - b.z0) * Math.min(1, age / b.duration) +
        (b.kind === "shell"
          ? Math.sin(Math.PI * Math.min(1, age / b.duration)) * 110
          : 0);
  function segmentCircle(a, b, u, r) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      fx = a.x - u.x,
      fy = a.y - u.y,
      A = dx * dx + dy * dy;
    if (A < 1e-9) return dist(a, u) <= r ? 0 : null;
    const B = 2 * (fx * dx + fy * dy),
      D = B * B - 4 * A * (fx * fx + fy * fy - r * r);
    if (D < 0) return null;
    const t = (-B - Math.sqrt(D)) / (2 * A);
    return t >= 0 && t <= 1 ? t : dist(a, u) <= r ? 0 : null;
  }
  function rand(s) {
    s.seed = (1664525 * s.seed + 1013904223) >>> 0;
    return s.seed / 4294967296;
  }
  function emit(s, type, x, y, extra = {}) {
    s.events.push({ type, x, y, ...extra });
    if (s.events.length > 64) s.events.shift();
  }
  function unit(s, kind, team, x, y, group = 0) {
    const def = C[kind];
    const u = {
      id: ++s.seq,
      kind,
      team,
      x,
      y,
      hp: def.hp,
      angle: team ? Math.PI : 0,
      cool: 0.25 + rand(s) * 0.8,
      wind: 0,
      hit: 0,
      repair: 0,
      flash: 0,
      group,
      path: [],
      order: null,
      target: null,
      think: 0,
    };
    if (s.campaign) u.map = mapFor(s).id;
    owners.set(u, s);
    s.units.push(u);
    return u;
  }
  function makeClassic() {
    const s = {
      version: 2,
      t: 0,
      seed: 81731,
      seq: 0,
      status: "playing",
      phase: 0,
      units: [],
      bullets: [],
      events: [],
      kills: 0,
      shots: 0,
      damageTaken: 0,
      relay: {
        x: 850,
        y: 490,
        charge: 0,
        online: false,
        stability: 0,
        started: 0,
      },
      dash: 0,
      dashT: 0,
      dashX: 1,
      dashY: 0,
      ammo: 12,
      reload: 0,
      checkpoint: 0,
      wave: 0,
      heroId: 0,
    };
    const h = unit(s, "hero", 0, 180, 750);
    s.heroId = h.id;
    h.cool = 0;
    unit(s, "base", 0, 135, 820);
    unit(s, "rifle", 0, 320, 695, 1);
    unit(s, "rifle", 0, 370, 735, 1);
    unit(s, "rifle", 0, 335, 780, 1);
    unit(s, "jammer", 1, 1015, 215);
    unit(s, "citadel", 1, 1250, 485);
    unit(s, "turret", 1, 870, 700);
    for (const [kind, x, y] of [
      ["sentinel", 505, 540],
      ["runner", 480, 630],
      ["sentinel", 740, 210],
      ["runner", 830, 270],
      ["sentinel", 950, 315],
      ["sentinel", 1040, 510],
      ["runner", 1150, 575],
    ])
      unit(s, kind, 1, x, y);
    strategyDefaults(s, false);
    unit(s, "sentinel", 1, 1250, 260);
    unit(s, "runner", 1, 1320, 120);
    return s;
  }
  function make(mode = "frontier") {
    return mode === "classic"
      ? makeClassic()
      : campaign.make(
          [
            "frontier-1",
            "frontier-2",
            "frontier-3",
            "frontier-4",
            "frontier-5",
            "frontier-6",
            "frontier-7",
            "frontier-8",
            "frontier-9",
          ].includes(mode)
            ? mode
            : "frontier-8",
        );
  }
  function terminalSites(s) {
    return (mapFor(s).terminals || [s.terminal]).map((p) =>
      p.x === s.terminal.x && p.y === s.terminal.y
        ? { ...s.terminal }
        : { ...s.terminal, ...p, charge: 0, window: 0, channeling: false },
    );
  }
  const hero = (s) => s.units.find((u) => u.id === s.heroId);
  const living = (s, kind) => s.units.find((u) => u.kind === kind && u.hp > 0);
  function strategyDefaults(s, legacy) {
    s.economy = {
      alloy: 120,
      spent: 0,
      recovered: 0,
      kit: false,
      legacySupport: legacy && s.phase < 3,
    };
    s.caches = CACHES.map((c) => ({ ...c, taken: false, charge: 0 }));
    s.terminal = {
      x: 1280,
      y: 200,
      charge: 0,
      window: 0,
      alarm: false,
      channeling: false,
    };
    s.approach = "siege";
    if (legacy) for (const u of s.units) u.repair = 0;
  }
  const shielded = (s) => !s.relay.online && s.terminal.window <= 0;
  const postAt = (s, id) =>
    s.units.find((u) => u.kind === "outpost" && u.site === id && u.hp > 0);
  const readyPosts = (s) =>
    s.units.filter((u) => u.kind === "outpost" && u.hp > 0 && u.build === 0);
  function spawnPoint(s, anchor, kind) {
    if (anchor.construction) {
      const origin = construction.exit(anchor, C[kind].r),
        world = navigation(s);
      for (const ahead of [0, 35, 70])
        for (const side of [0, -35, 35]) {
          const p = construction.advance(anchor, origin, ahead, side);
          if (
            travelClear(origin, p, C[kind].r, world) &&
            !s.units.some(
              (u) => u.hp > 0 && !u.care?.inside && dist(u, p) < C[u.kind].r + C[kind].r + 4,
            )
          )
            return p;
        }
      return null;
    }
    const offsets = [
      [55, 35],
      [-55, 35],
      [55, -35],
      [-55, -35],
      [0, 70],
      [70, 0],
      [0, -70],
      [-70, 0],
    ];
    if (campaign.combat(s)) {
      const separation = C[anchor.kind].r + C[kind].r + 6;
      for (const offset of offsets) {
        const scale = Math.max(1, separation / Math.hypot(...offset));
        offset[0] *= scale;
        offset[1] *= scale;
      }
      for (let i = 0; i < 16; i++)
        offsets.push([
          Math.cos((i * Math.PI) / 8) * (separation + 48),
          Math.sin((i * Math.PI) / 8) * (separation + 48),
        ]);
    }
    for (const [dx, dy] of offsets) {
      const p = { x: anchor.x + dx, y: anchor.y + dy };
      if (
        // Legacy seeds choose offsets before the highlands coordinate transform.
        free(
          p.x,
          p.y,
          C[kind].r,
          construction.enabled(s) ? navigation(s) : anchor.map,
        ) &&
        !s.units.some(
          (u) => u.hp > 0 && dist(u, p) < C[kind].r + C[u.kind].r + 3,
        )
      )
        return p;
    }
    return null;
  }
  function supplyStatus(s, action, site) {
    if (s.campaign) return campaign.offer(s, action, site);
    const cost = COSTS[action];
    const fail = (reason) => ({ allowed: false, reason, cost: cost ?? 0 });
    if (s.status !== "playing") return fail("ended");
    if (!["outpost", "artillery", "hack", "rifle", "salvage"].includes(action))
      return fail("unknown");
    if (
      s.units.length >= 80 &&
      ["outpost", "artillery", "rifle"].includes(action)
    )
      return fail("limit");
    let anchor, spawn;
    if (action === "outpost") {
      anchor = PADS.find((p) => p.id === site);
      if (!anchor) return fail("site");
      if (postAt(s, site)) return fail("occupied");
      if (s.units.filter((u) => u.kind === "outpost" && u.hp > 0).length >= 2)
        return fail("post-limit");
      if (dist(hero(s), anchor) > 210) return fail("distance");
      if (
        s.units.some((u) => u.team === 1 && u.hp > 0 && dist(u, anchor) < 110)
      )
        return fail("hostiles");
    }
    if (action === "salvage") {
      const post = postAt(s, site);
      return post
        ? { allowed: true, reason: null, cost: -COSTS.salvage, unitId: post.id }
        : fail("site");
    }
    if (action === "hack" && s.economy.kit) return fail("installed");
    if (action === "artillery") {
      if (living(s, "artillery")) return fail("artillery-limit");
      if (!s.relay.online) return fail("relay");
      anchor = readyPosts(s).sort(
        (a, b) => dist(a, s.relay) - dist(b, s.relay),
      )[0];
      if (!anchor) return fail("post");
    }
    if (action === "rifle") {
      if (s.units.filter((u) => u.kind === "rifle" && u.hp > 0).length >= 3)
        return fail("squad-full");
      anchor =
        readyPosts(s).sort((a, b) => dist(a, hero(s)) - dist(b, hero(s)))[0] ||
        living(s, "base");
    }
    if (["artillery", "rifle"].includes(action)) {
      spawn = spawnPoint(s, anchor, action);
      if (!spawn) return fail("blocked");
    }
    if (s.economy.alloy < cost) return fail("funds");
    return { allowed: true, reason: null, cost, anchor, spawn };
  }
  function purchase(s, action, site) {
    if (s.campaign) {
      const result = campaign.purchase(s, action, site);
      if (result.allowed && fogged(s)) recon.update(s, true);
      return result;
    }
    const offer = supplyStatus(s, action, site);
    if (!offer.allowed) return offer;
    const eco = s.economy;
    if (action === "salvage") {
      const u = s.units.find((u) => u.id === offer.unitId);
      u.hp = 0;
      u.salvaged = true;
      eco.alloy += COSTS.salvage;
      eco.recovered += COSTS.salvage;
      emit(s, "salvage", u.x, u.y);
    } else {
      eco.alloy -= offer.cost;
      eco.spent += offer.cost;
      if (action === "outpost") {
        const u = unit(s, "outpost", 0, offer.anchor.x, offer.anchor.y);
        u.site = site;
        u.build = 6;
        u.salvaged = false;
        emit(s, "build", u.x, u.y);
      } else if (action === "hack") {
        eco.kit = true;
        s.approach = "infiltration";
        emit(s, "upgrade", hero(s).x, hero(s).y);
      } else {
        const u = unit(
          s,
          action,
          0,
          offer.spawn.x,
          offer.spawn.y,
          action === "rifle" ? 1 : 2,
        );
        emit(s, "reinforce", u.x, u.y);
      }
    }
    return { allowed: true, reason: null, cost: offer.cost };
  }
  function interaction(s) {
    if (s.campaign) return campaign.interaction(s);
    const h = hero(s);
    if (!h || h.hp <= 0) return null;
    const options = [];
    for (const cache of s.caches)
      if (!cache.taken && dist(h, cache) < 65)
        options.push({
          type: "cache",
          target: cache,
          allowed: true,
          progress: cache.charge,
        });
    if (s.phase === 1 && dist(h, s.relay) < 75)
      options.push({
        type: "relay",
        target: s.relay,
        allowed: true,
        progress: s.relay.charge,
      });
    if (dist(h, s.terminal) < 75)
      options.push({
        type: "terminal",
        target: s.terminal,
        allowed: s.economy.kit,
        progress: s.terminal.charge,
      });
    return (
      options.sort((a, b) => dist(h, a.target) - dist(h, b.target))[0] || null
    );
  }
  function objective(s) {
    if (s.campaign) return campaign.objective(s);
    if (!shielded(s))
      return { id: "citadel", target: living(s, "citadel"), radius: 66 };
    if (s.approach === "infiltration" && s.economy.kit)
      return { id: "terminal", target: s.terminal, radius: 38 };
    if (s.phase === 2) return { id: "defend", target: s.relay, radius: 50 };
    if (s.phase === 1) return { id: "relay", target: s.relay, radius: 50 };
    return { id: "jammer", target: living(s, "jammer"), radius: 50 };
  }
  function strategyStep(s, input, dt) {
    if (s.campaign) return campaign.strategy(s, input, dt);
    const h = hero(s),
      act = interaction(s),
      held = input.interact && s.dashT === 0 && act?.allowed;
    s.terminal.channeling = !!(held && act.type === "terminal");
    s.terminal.window = Math.max(0, s.terminal.window - dt);
    for (const cache of s.caches) {
      if (cache.taken) continue;
      if (held && act.type === "cache" && act.target === cache) {
        cache.charge = Math.min(1, cache.charge + dt / 1.2);
        if (cache.charge === 1) {
          cache.taken = true;
          s.economy.alloy += 40;
          emit(s, "collect", cache.x, cache.y, { amount: 40 });
        }
      } else cache.charge = Math.max(0, cache.charge - dt * 0.6);
    }
    if (s.terminal.channeling) {
      s.approach = "infiltration";
      s.terminal.charge = Math.min(1, s.terminal.charge + dt / 2.2);
      if (s.terminal.charge === 1) {
        s.terminal.window = 7;
        if (!s.terminal.alarm) {
          s.terminal.alarm = true;
          for (const [kind, x, y] of [
            ["runner", 1370, 350],
            ["runner", 1360, 100],
            ["sentinel", 1370, 310],
            ["sentinel", 1200, 80],
          ]) {
            const u = unit(s, kind, 1, x, y);
            u.path = pathTo(u, s.terminal, C[kind].r);
          }
          emit(s, "breach", s.terminal.x, s.terminal.y);
        }
      }
    } else s.terminal.charge = Math.max(0, s.terminal.charge - dt * 0.45);
    for (const post of s.units.filter(
      (u) => u.kind === "outpost" && u.hp > 0,
    )) {
      if (post.build > 0) {
        if (h.hp > 0 && dist(h, post) <= 210) {
          post.build = Math.max(0, post.build - dt);
          if (post.build === 0) emit(s, "post-ready", post.x, post.y);
        }
        continue;
      }
      for (const u of s.units)
        if (
          u.team === 0 &&
          u.hp > 0 &&
          u.kind !== "outpost" &&
          u.kind !== "base" &&
          u.repair === 0 &&
          dist(u, post) < 145 &&
          clear(u, post)
        )
          u.hp = Math.min(C[u.kind].hp, u.hp + dt * 7);
    }
  }
  // Expanded-wall visibility keeps smoothing safe for each unit's footprint.
  function travelClear(a, b, r, map) {
    return (
      free(a.x, a.y, r, map) &&
      free(b.x, b.y, r, map) &&
      wallClear({ ...a, map }, b, Math.max(0, r - 1e-7)) &&
      (!["highlands", "districts"].includes(mapFor(map).id) ||
        Terrain.travel(a, b, r))
    );
  }
  function smoothRoute(from, route, r, map) {
    if (!route.length) return route;
    const points = [{ x: from.x, y: from.y }];
    for (let i = 0; i < route.length; ) {
      let next = i;
      for (let j = route.length - 1; j > i; j--) {
        if (travelClear(points.at(-1), route[j], r, map)) {
          next = j;
          break;
        }
      }
      points.push(route[next]);
      i = next + 1;
    }
    const result = [];
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1],
        b = points[i],
        c = points[i + 1];
      const incoming = dist(a, b),
        outgoing = dist(b, c);
      let curve = null;
      for (
        let bend = Math.min(42, incoming * 0.32, outgoing * 0.32);
        bend >= 2;
        bend /= 2
      ) {
        const entry = {
          x: b.x + ((a.x - b.x) * bend) / incoming,
          y: b.y + ((a.y - b.y) * bend) / incoming,
        };
        const exit = {
          x: b.x + ((c.x - b.x) * bend) / outgoing,
          y: b.y + ((c.y - b.y) * bend) / outgoing,
        };
        const sample = [entry];
        for (let n = 1; n <= 8; n++) {
          const t = n / 8,
            v = 1 - t;
          sample.push({
            x: v * v * entry.x + 2 * v * t * b.x + t * t * exit.x,
            y: v * v * entry.y + 2 * v * t * b.y + t * t * exit.y,
          });
        }
        if (
          sample.every((p, n) =>
            travelClear(n ? sample[n - 1] : result.at(-1) || from, p, r, map),
          )
        ) {
          curve = sample;
          break;
        }
      }
      result.push(...(curve || [b]));
    }
    result.push(points.at(-1));
    return result;
  }
  function pathTo(from, to, r = 14) {
    const world = navigation(
        from.map || owners.has(from) ? from : { ...from, map: to.map },
      ),
      cell = 40,
      cols = world.W / cell,
      rows = world.H / cell,
      start = Math.floor(from.y / cell) * cols + Math.floor(from.x / cell),
      end =
        Math.floor(clamp(to.y, 25, world.H - 25) / cell) * cols +
        Math.floor(clamp(to.x, 25, world.W - 25) / cell);
    if (travelClear(from, to, r, world)) return [{ x: to.x, y: to.y }];
    const grid = attackGrid(world, r);
    const exits = new Set();
    if (free(to.x, to.y, r, world)) {
      const ex = Math.floor(to.x / cell),
        ey = Math.floor(to.y / cell);
      for (let y = Math.max(0, ey - 2); y <= Math.min(rows - 1, ey + 2); y++)
        for (
          let x = Math.max(0, ex - 2);
          x <= Math.min(cols - 1, ex + 2);
          x++
        ) {
          const p = grid.point(y * cols + x);
          if (p && travelClear(p, to, r, world)) exits.add(y * cols + x);
        }
    }
    let reached = false;
    const queue = [start],
      prev = new Int32Array(cols * rows).fill(-2);
    prev[start] = -1;
    // A valid world position may lie in a cell whose centre is inside cover.
    // Connect it to nearby visible centres rather than trapping it in that cell.
    const sx = Math.floor(from.x / cell),
      sy = Math.floor(from.y / cell);
    for (let y = Math.max(0, sy - 2); y <= Math.min(rows - 1, sy + 2); y++)
      for (let x = Math.max(0, sx - 2); x <= Math.min(cols - 1, sx + 2); x++) {
        const k = y * cols + x;
        if (
          k !== start &&
          grid.point(k) &&
          travelClear(from, grid.point(k), r, world)
        ) {
          prev[k] = start;
          queue.push(k);
        }
      }
    let best = start,
      bestD = Infinity;
    for (let i = 0; i < queue.length; i++) {
      const n = queue[i],
        x = n % cols,
        y = Math.floor(n / cols),
        d = Math.hypot(x - (end % cols), y - Math.floor(end / cols));
      if (d < bestD) {
        best = n;
        bestD = d;
      }
      if (n !== start && exits.has(n)) {
        best = n;
        reached = true;
        break;
      }
      for (let direction = 0; direction < 4; direction++) {
        const [dx, dy] = GRID_STEPS[direction];
        const xx = x + dx,
          yy = y + dy,
          k = yy * cols + xx;
        if (
          xx < 0 ||
          xx >= cols ||
          yy < 0 ||
          yy >= rows ||
          prev[k] !== -2 ||
          !grid.point(k) ||
          ((n === start || ["highlands", "districts"].includes(world.id)) &&
            !(n === start
              ? travelClear(from, grid.point(k), r, world)
              : grid.link(n, direction, k)))
        )
          continue;
        prev[k] = n;
        queue.push(k);
      }
    }
    const route = [];
    for (let n = best; n !== start && n >= 0; n = prev[n])
      route.push({
        x: (n % cols) * cell + 20,
        y: Math.floor(n / cols) * cell + 20,
      });
    route.reverse();
    if (reached) route.push({ x: to.x, y: to.y });
    return smoothRoute(from, route, r, world);
  }
  // A bolt collides with two pixels of cover padding. Use the same corridor
  // for AI aiming; visibility alone may see a point while a bolt clips a corner.
  function fireClear(from, target) {
    if (
      ["highlands", "districts"].includes(mapFor(from.map || target.map).id)
    ) {
      const arc =
          ["artillery", "mortar", "citadel"].includes(from.kind) ||
          (from.kind === "bastion" && target.kind === "artillery")
            ? 110
            : 0,
        za = Terrain.height(from.x, from.y) + (MOUNTS[from.kind] || 16),
        zb = Terrain.height(target.x, target.y) + 10;
      if (!Terrain.ray(from, target, za, zb, arc)) return false;
      return !mapFor(from.map || target.map).walls.some((w) => {
        const t = segmentRect(from.x, from.y, target.x, target.y, w, 2);
        return (
          t !== null &&
          za + (zb - za) * t + Math.sin(t * Math.PI) * arc <
            Terrain.height(w.x + w.w / 2, w.y + w.h / 2) + 54
        );
      });
    }
    return clear(
      from,
      target,
      ["artillery", "runner", "flamer", "bomber", "mortar"].includes(from.kind)
        ? 0
        : 2,
    );
  }
  const attackGrids = new WeakMap();
  const GRID_STEPS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  function attackGrid(map, radius) {
    let cache = attackGrids.get(map);
    if (!cache) attackGrids.set(map, (cache = new Map()));
    if (cache.has(radius)) return cache.get(radius);
    const cols = map.W / 40,
      rows = map.H / 40,
      points = new Array(cols * rows),
      tested = new Uint8Array(points.length),
      passable = new Uint8Array(points.length),
      connections = new Array(points.length);
    // A cold route used to build every cell and every edge on the entire map.
    // Share exact geometry checks lazily, independently for each footprint and
    // immutable navigation-world revision (including player construction).
    const point = (k) => {
      if (points[k] === undefined) {
        const p = {
          x: (k % cols) * 40 + 20,
          y: Math.floor(k / cols) * 40 + 20,
        };
        points[k] = free(p.x, p.y, radius + 3, map) ? p : null;
      }
      return points[k];
    };
    const link = (k, direction, n) => {
      const bit = 1 << direction;
      if (!(tested[k] & bit)) {
        tested[k] |= bit;
        if (
          point(k) &&
          point(n) &&
          travelClear(points[k], points[n], radius, map)
        )
          passable[k] |= bit;
      }
      return !!(passable[k] & bit);
    };
    const edges = (k) => {
      if (connections[k]) return connections[k];
      const list = [];
      connections[k] = list;
      if (!point(k)) return list;
      const x = k % cols,
        y = Math.floor(k / cols);
      for (let direction = 0; direction < GRID_STEPS.length; direction++) {
        const [dx, dy] = GRID_STEPS[direction];
        const xx = x + dx,
          yy = y + dy,
          n = yy * cols + xx;
        if (
          xx >= 0 &&
          xx < cols &&
          yy >= 0 &&
          yy < rows &&
          link(k, direction, n)
        )
          list.push([n, Math.hypot(dx, dy) * 40]);
      }
      return list;
    };
    const grid = { cols, rows, points, point, link, edges };
    cache.set(radius, grid);
    if (cache.size > 16) cache.delete(cache.keys().next().value);
    return grid;
  }
  function firingPath(from, target) {
    const world = navigation(from),
      state = owners.get(from) || world.state,
      def = state ? stats(state, from, target) : C[from.kind],
      range = from.kind === "scout" ? balanced(state) ? sightRange(state, from) * 0.9 : 650 : def.range * 0.9,
      minimum = from.kind === "mortar" ? 240 : 0;
    const goal = (p) =>
      dist(p, target) >= minimum &&
      rangeDistance(p, target) <= range &&
      fireClear({ ...p, map: world.id, kind: from.kind }, target);
    if (goal(from)) return [];
    const edge = targetEdge(from, target),
      d = dist(from, edge),
      direct = {
        x: edge.x + ((from.x - edge.x) * range) / Math.max(1, d),
        y: edge.y + ((from.y - edge.y) * range) / Math.max(1, d),
      };
    if (goal(direct) && travelClear(from, direct, def.r, world))
      return [direct];
    const { cols, rows, points, point, edges } = attackGrid(world, def.r);
    const costs = new Float64Array(points.length).fill(Infinity),
      prev = new Int32Array(points.length).fill(-2),
      heap = [];
    const push = (k, cost) => {
      const item = {
        k,
        cost,
        score: cost + Math.max(0, rangeDistance(points[k], target) - range),
      };
      let n = heap.length;
      heap.push(item);
      while (n > 0) {
        const p = (n - 1) >> 1;
        if (heap[p].score <= item.score) break;
        heap[n] = heap[p];
        n = p;
      }
      heap[n] = item;
    };
    const pop = () => {
      const first = heap[0],
        last = heap.pop();
      if (heap.length) {
        let n = 0;
        while (n * 2 + 1 < heap.length) {
          let c = n * 2 + 1;
          if (c + 1 < heap.length && heap[c + 1].score < heap[c].score) c++;
          if (last.score <= heap[c].score) break;
          heap[n] = heap[c];
          n = c;
        }
        heap[n] = last;
      }
      return first;
    };
    const sx = Math.floor(from.x / 40),
      sy = Math.floor(from.y / 40);
    for (let y = Math.max(0, sy - 2); y <= Math.min(rows - 1, sy + 2); y++)
      for (let x = Math.max(0, sx - 2); x <= Math.min(cols - 1, sx + 2); x++) {
        const k = y * cols + x;
        if (point(k) && travelClear(from, points[k], def.r, world)) {
          costs[k] = dist(from, points[k]);
          prev[k] = -1;
          push(k, costs[k]);
        }
      }
    while (heap.length) {
      const { k, cost } = pop();
      if (cost > costs[k] + 1e-7) continue;
      if (goal(points[k])) {
        const route = [];
        for (let n = k; n >= 0; n = prev[n]) route.push({ ...points[n] });
        return smoothRoute(from, route.reverse(), def.r, world);
      }
      for (const [n, step] of edges(k))
        if (cost + step < costs[n] - 1e-7) {
          costs[n] = cost + step;
          prev[n] = k;
          push(n, costs[n]);
        }
    }
    return [];
  }
  function order(s, group, x, y) {
    if (
      s.status !== "playing" ||
      ![1, 2].includes(group) ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    )
      return false;
    const world = mapFor(s);
    const members = s.units.filter(
      (u) => u.team === 0 && u.group === group && u.hp > 0,
    );
    members.forEach((u, i) => {
      const target = {
        x: clamp(x + (i % 2) * 30 - 15, 30, world.W - 30),
        y: clamp(y + Math.floor(i / 2) * 30 - 15, 30, world.H - 30),
      };
      u.target = null;
      u.order = target;
      u.path = pathTo(u, target, C[u.kind].r);
    });
    const producers = s.campaign
      ? s.units.filter(
          (u) => u.hp > 0 && u.kind === (group === 1 ? "barracks" : "foundry"),
        )
      : [];
    for (const u of producers)
      u.rally = {
        x: clamp(x, 30, world.W - 30),
        y: clamp(y, 30, world.H - 30),
      };
    emit(s, "order", x, y);
    return members.length > 0 || producers.length > 0;
  }
  function orderUnits(s, ids, x, y) {
    if (
      s.status !== "playing" ||
      !Array.isArray(ids) ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    )
      return false;
    const selected = new Set(ids);
    const members = s.units.filter(
      (u) =>
        selected.has(u.id) && !u.team && u.hp > 0 && [1, 2].includes(u.group),
    );
    if (!members.length) return false;
    const world = mapFor(s),
      width = Math.ceil(Math.sqrt(members.length)),
      spacing = Math.max(36, ...members.map((u) => C[u.kind].r * 2 + 8));
    const slots = members.map((u, i) => ({
      x:
        x +
        ((i % width) -
          (Math.min(width, members.length - Math.floor(i / width) * width) -
            1) /
            2) *
          spacing,
      y:
        y +
        (Math.floor(i / width) - (Math.ceil(members.length / width) - 1) / 2) *
          spacing,
    }));
    const waiting = [...members],
      plans = [], departures = [];
    for (const slot of slots) {
      waiting.sort((a, b) => dist(a, slot) - dist(b, slot) || a.id - b.id);
      const u = waiting.shift(),
        margin = C[u.kind].r + 25;
      const target = {
        x: clamp(slot.x, margin, world.W - margin),
        y: clamp(slot.y, margin, world.H - margin),
      };
      const origin = support.departure(s, u, departures);
      if (!origin) return false;
      departures.push({ ...origin, r: C[u.kind].r });
      const path = pathTo(u.care?.inside ? { ...u, ...origin, map: navigation(s) } : u,
        target, C[u.kind].r);
      if (!path.length && dist(u, target) > 2) return false;
      plans.push({
        u,
        path, origin,
        target: path.length ? { ...path[path.length - 1] } : { x: u.x, y: u.y },
      });
    }
    // Plan every path before changing any order.
    for (const { u, path, target, origin } of plans) {
      support.leave(s, u, origin);
      u.target = null;
      u.order = target;
      u.path = path;
    }
    // A temporary selection never changes a production building's rally point.
    emit(s, "order", x, y);
    return true;
  }
  function attackUnits(s, ids, targetId) {
    const target = s.units.find((u) => u.id === targetId && u.team && u.hp > 0);
    if (
      !target ||
      !visible(s, 0, target) ||
      !orderUnits(s, ids, target.x, target.y)
    )
      return false;
    const chosen = new Set(ids);
    for (const u of s.units)
      if (chosen.has(u.id) && !u.team && u.hp > 0 && [1, 2].includes(u.group)) {
        u.target = { x: target.x, y: target.y, id: target.id };
        u.think = 0;
      }
    const event = s.events.at(-1);
    if (event?.type === "order") event.intent = "attack";
    return true;
  }
  const canLead = (u) =>
    u &&
    u.team === 0 &&
    C[u.kind]?.speed > 0 &&
    (u.kind === "hero" || [1, 2].includes(u.group));
  function validFollowOrders(s) {
    const units = new Map(s.units.map((u) => [u.id, u]));
    for (const u of s.units) {
      if (u.rally?.followId !== undefined) {
        const leader = units.get(u.rally.followId);
        if (
          !commandableBuilding(u) ||
          !canLead(leader) ||
          !Number.isInteger(u.rally.followId)
        )
          return false;
      }
      const order = u.order;
      if (order?.followId === undefined) continue;
      const leader = units.get(order.followId);
      if (
        !canLead(u) ||
        u.kind === "hero" ||
        !canLead(leader) ||
        !Number.isInteger(order.followId) ||
        leader === u ||
        ![order.followX, order.followY].every(
          (v) => Number.isFinite(v) && Math.abs(v) <= 512,
        )
      )
        return false;
      const seen = new Set([u.id]);
      let current = leader;
      while (current) {
        if (seen.has(current.id)) return false;
        seen.add(current.id);
        current = units.get(current.order?.followId);
      }
    }
    return true;
  }
  function followPoint(s, u, leader, order) {
    const world = navigation(s),
      margin = C[u.kind].r + 25;
    // Rotate an obstructed slot onto the same reachable surface, rather than
    // stacking escorts on the leader or sending them over a cliff edge.
    for (const angle of [
      0,
      Math.PI / 4,
      -Math.PI / 4,
      Math.PI / 2,
      -Math.PI / 2,
      (3 * Math.PI) / 4,
      (-3 * Math.PI) / 4,
      Math.PI,
    ]) {
      const co = Math.cos(angle),
        si = Math.sin(angle),
        point = {
          x: clamp(
            leader.x + order.followX * co - order.followY * si,
            margin,
            world.W - margin,
          ),
          y: clamp(
            leader.y + order.followX * si + order.followY * co,
            margin,
            world.H - margin,
          ),
        };
      if (
        dist(point, leader) >= C[u.kind].r + C[leader.kind].r + 10 &&
        free(point.x, point.y, C[u.kind].r, world) &&
        travelClear(leader, point, C[u.kind].r, world)
      )
        return point;
    }
    // A heavy escort cannot occupy an infantry-only bridge. Wait safely and
    // retry at decision cadence until its leader returns to reachable ground.
    return { x: u.x, y: u.y };
  }
  function updateFollow(s, u, dt, units) {
    const order = u.order,
      leader = units.get(order.followId);
    u.target = null;
    if (!canLead(leader) || leader.hp <= 0 || leader.care?.inside) {
      u.order = null;
      u.path = [];
      return;
    }
    u.think = Math.max(0, u.think - dt);
    const ideal = { x: leader.x + order.followX, y: leader.y + order.followY },
      distance = dist(u, ideal),
      world = navigation(s),
      radius = C[u.kind].r;
    if (
      u.path.length <= 1 &&
      distance > 1e-5 &&
      distance < 180 &&
      travelClear(leader, ideal, radius, world) &&
      travelClear(u, ideal, radius, world)
    ) {
      // Track a nearby moving slot continuously with an exact clear segment.
      // This avoids both stop/start motion and a full path search every frame.
      const point = u.path[0] || (u.path[0] = {});
      point.x = order.x = ideal.x;
      point.y = order.y = ideal.y;
      u.think = 0.4 + (u.id % 5) * 0.03;
      return;
    }
    // Failed or obstructed routes are retried at a bounded decision cadence.
    if (u.think > 0) return;
    u.think = 0.4 + (u.id % 5) * 0.03;
    const point = followPoint(s, u, leader, order);
    if (dist(u, point) <= 12 && travelClear(u, point, radius, world)) {
      u.path = [];
      order.x = u.x;
      order.y = u.y;
      return;
    }
    if (
      u.path.length &&
      dist(order, point) < 28 &&
      travelClear(u, u.path[0], radius, world)
    )
      return;
    u.path = pathTo(u, point, radius);
    const end = u.path.at(-1) || u;
    order.x = end.x;
    order.y = end.y;
  }
  function followUnits(s, ids, leaderId, notify = true) {
    if (s.status !== "playing" || !Array.isArray(ids)) return false;
    const units = new Map(s.units.map((u) => [u.id, u])),
      leader = units.get(leaderId),
      selected = new Set(ids);
    if (!canLead(leader) || leader.hp <= 0 || leader.care?.inside) return false;
    const members = s.units.filter(
      (u) =>
        selected.has(u.id) &&
        canLead(u) &&
        u.kind !== "hero" &&
        u !== leader &&
        u.hp > 0,
    );
    if (!members.length) return false;
    // Clicking a selected group member makes it the new leader. An external
    // leader may already follow someone else, but the resulting chain must not cycle.
    if (!selected.has(leader.id)) {
      const seen = new Set(members.map((u) => u.id));
      let current = leader;
      while (current) {
        if (seen.has(current.id)) return false;
        seen.add(current.id);
        current = units.get(current.order?.followId);
      }
    }
    const spacing = Math.max(40, ...members.map((u) => C[u.kind].r * 2 + 12)),
      width = Math.ceil(Math.sqrt(members.length)),
      centre = members.reduce(
        (p, u) => ({
          x: p.x + u.x / members.length,
          y: p.y + u.y / members.length,
        }),
        { x: 0, y: 0 },
      ),
      angle = Math.atan2(leader.y - centre.y, leader.x - centre.x),
      co = Math.cos(angle),
      si = Math.sin(angle),
      gap =
        C[leader.kind].r + Math.max(...members.map((u) => C[u.kind].r)) + 30;
    const plans = members.map((u, i) => {
      const side =
          ((i % width) -
            (Math.min(width, members.length - Math.floor(i / width) * width) -
              1) /
              2) *
          spacing,
        back = gap + Math.floor(i / width) * spacing,
        scale = Math.min(1, 480 / Math.hypot(side, back));
      return {
        u,
        order: {
          x: u.x,
          y: u.y,
          followId: leader.id,
          followX: (-co * back - si * side) * scale,
          followY: (-si * back + co * side) * scale,
        },
      };
    });
    if (selected.has(leader.id) && leader.order?.followId !== undefined) {
      leader.order = null;
      leader.target = null;
      leader.path = [];
    }
    const departures = [];
    for (const plan of plans) {
      plan.origin = support.departure(s, plan.u, departures);
      if (!plan.origin) return false;
      departures.push({ ...plan.origin, r: C[plan.u.kind].r });
    }
    for (const { u, order, origin } of plans) {
      support.leave(s, u, origin);
      u.order = order;
      u.think = 0;
      updateFollow(s, u, 0, units);
    }
    if (notify) emit(s, "order", leader.x, leader.y, { intent: "follow" });
    return true;
  }
  const commandableBuilding = (u) =>
    u &&
    u.team === 0 &&
    ["base", "outpost", "barracks", "foundry", "arsenal"].includes(u.kind);
  function commandSelection(s, ids, point, targetId = null) {
    if (
      s.status !== "playing" ||
      !Array.isArray(ids) ||
      !Number.isFinite(point?.x) ||
      !Number.isFinite(point?.y)
    )
      return false;
    const chosen = new Set(ids),
      members = s.units.filter(
        (u) => chosen.has(u.id) && u.hp > 0 && u.team === 0,
      ),
      mobile = members.filter((u) => [1, 2].includes(u.group)),
      buildings = members.filter(commandableBuilding),
      workers = members.filter((u) => u.kind === "drone"),
      target =
        targetId === null
          ? null
          : s.units.find((u) => u.id === targetId && u.hp > 0);
    if (
      (!mobile.length && !buildings.length && !workers.length) ||
      (targetId !== null && !target) ||
      (target?.team && !visible(s, 0, target))
    )
      return false;
    if (support.enabled(s) && support.facility(target) && mobile.length) {
      const result = support.admit(s, mobile.map((u) => u.id), target.id);
      const repair = workers.length && construction.workerOrder(s, workers.map((u) => u.id), point, targetId, true);
      if (result.allowed) for (const u of buildings) u.rally = { ...construction.exit(target) };
      return result.allowed || !!repair?.allowed;
    }
    const workerOffer = workers.length
      ? construction.workerOrder(s, workers.map((u) => u.id), point, targetId, false)
      : null;
    if (!mobile.length && !buildings.length)
      return workerOffer?.allowed
        ? construction.applyWorkerOrder(s, workerOffer).allowed
        : false;
    const tracking = target && canLead(target),
      attack = !!target?.team;
    if (target)
      point = target.construction
        ? construction.exit(target)
        : { x: target.x, y: target.y };
    const world = mapFor(s);
    if (point.x < 0 || point.y < 0 || point.x > world.W || point.y > world.H)
      return false;
    if (
      buildings.length &&
      !tracking &&
      !mobile.length &&
      !free(point.x, point.y, 12, navigation(s))
    )
      return false;
    const followers = tracking ? mobile.filter((u) => u !== target) : mobile;
    if (
      followers.length &&
      !(tracking
        ? followUnits(
            s,
            mobile.map((u) => u.id),
            target.id,
          )
        : attack
          ? attackUnits(
              s,
              mobile.map((u) => u.id),
              target.id,
            )
          : orderUnits(
              s,
              mobile.map((u) => u.id),
              point.x,
              point.y,
            ))
    )
      return false;
    if (!followers.length && !buildings.length) return false;
    for (const u of buildings)
      u.rally = {
        x: point.x,
        y: point.y,
        ...(tracking ? { followId: target.id } : {}),
      };
    if (!followers.length)
      emit(s, "order", point.x, point.y, {
        intent: attack ? "attack" : tracking ? "follow" : "move",
      });
    if (workerOffer?.allowed) construction.applyWorkerOrder(s, workerOffer, false);
    return true;
  }
  function setRally(s, id, x, y) {
    const u = s.units.find(
      (u) => u.id === id && !u.team && u.hp > 0 && commandableBuilding(u),
    );
    if (
      s.status !== "playing" ||
      !u ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !free(x, y, 20, navigation(s))
    )
      return false;
    u.rally = { x, y };
    emit(s, "order", x, y);
    return true;
  }
  function move(u, dx, dy) {
    if (u.care?.inside) return;
    const r = C[u.kind].r,
      map = navigation(u),
      steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8));
    for (let i = 0; i < steps; i++) {
      if (travelClear(u, { x: u.x + dx / steps, y: u.y }, r, map))
        u.x += dx / steps;
      if (travelClear(u, { x: u.x, y: u.y + dy / steps }, r, map))
        u.y += dy / steps;
    }
  }
  function follow(u, dt) {
    let distance = C[u.kind].speed * dt;
    // Consume the exact travel budget, including small arc segments: no corner
    // skipping, overshoot or frame-rate-dependent speed near the destination.
    while (u.path.length && distance > 1e-8) {
      const p = u.path[0],
        d = dist(u, p);
      if (d < 1e-7) {
        u.path.shift();
        continue;
      }
      const step = Math.min(distance, d),
        a = Math.atan2(p.y - u.y, p.x - u.x);
      move(u, Math.cos(a) * step, Math.sin(a) * step);
      u.angle = a;
      distance -= step;
      if (dist(u, p) < 1e-6) u.path.shift();
      else break;
    }
  }
  function stats(s, u, target = null) {
    if (
      campaign.combat(s) &&
      (u.kind === "citadel" ||
        (u.kind === "bastion" &&
          (target || s.units.find((v) => v.id === u.target?.id))?.kind ===
            "artillery"))
    )
      return balanced(s) ? siegeStats[u.kind] : { ...C[u.kind], range: 610, damage: 54, rate: 6.4, siege: true };
    return s.version >= 4 && u.defense && ["base", "outpost"].includes(u.kind)
      ? { ...C[u.kind], range: balanced(s) ? u.kind === "outpost" ? 520 : 480 : 340, damage: 20, rate: 0.9 }
      : balanced(s) ? rangedStats[u.kind] : C[u.kind];
  }
  function aimAngle(u, target) {
    const d = dist(u, target);
    return (
      Math.atan2(target.y - u.y, target.x - u.x) -
      (u.kind === "hero" && d > 1e-6 ? Math.asin(Math.min(5, d * 0.25) / d) : 0)
    );
  }
  function shoot(s, u, target) {
    if (u.care?.inside || target.care?.inside) return;
    const def = stats(s, u),
      a = aimAngle(u, target);
    u.angle = a;
    u.cool = def.rate;
    u.flash = 0.1;
    const siege =
      campaign.combat(s) &&
      (["mortar", "citadel"].includes(u.kind) ||
        (u.kind === "bastion" && def.siege));
    emit(
      s,
      u.kind === "artillery" || siege
        ? "mortar"
        : u.kind === "rocket"
          ? "rocket"
          : "shot",
      u.x,
      u.y,
      {
        team: u.team,
        kind: u.kind,
      },
    );
    if (u.kind === "runner") {
      hurt(s, target, def.damage * (s.campaign ? 1.2 : 1), u);
      return;
    }
    // A melee attacker can stand inside a node's footprint; the muzzle must not skip it.
    const r =
        s.version >= 4 && u.defense
          ? Math.min(def.r + 9, dist(u, target) / 2)
          : u.kind === "hero"
            ? Math.min(31, dist(u, target) / 2)
            : def.r + 9,
      speed =
        u.kind === "rocket"
          ? 260
          : u.kind === "artillery" || siege
            ? 360
            : u.team && campaign.combat(s)
              ? 520
              : u.team
                ? 390
                : 800;
    s.bullets.push({
      ...(s.campaign ? { map: mapFor(s).id } : {}),
      x:
        u.x +
        Math.cos(a) * r -
        Math.sin(a) *
          (u.kind === "hero" ? Math.min(5, dist(u, target) * 0.25) : 0),
      y:
        u.y +
        Math.sin(a) * r +
        Math.cos(a) *
          (u.kind === "hero" ? Math.min(5, dist(u, target) * 0.25) : 0),
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life:
        u.kind === "rocket"
          ? 3
          : siege
            ? dist(u, target) / speed
            : def.range / speed,
      team: u.team,
      owner: u.id,
      damage:
        def.damage *
        (s.campaign
          ? u.team
            ? campaign.combat(s)
              ? ["sentinel", "warden"].includes(u.kind)
                ? 0.65
                : 1
              : 1.2
            : s.campaign.weapons
              ? 1.2
              : 1
          : 1),
      kind:
        u.kind === "rocket"
          ? "missile"
          : u.kind === "artillery" || siege
            ? "shell"
            : "bolt",
      ...(u.kind === "rocket"
        ? { lockId: target.id, guided: true }
        : siege
          ? { radius: 78 }
          : {}),
      tx: target.x,
      ty: target.y,
      age: 0,
      ...(["highlands", "districts"].includes(mapFor(s).id)
        ? {
            z0: Terrain.height(u.x, u.y) + (MOUNTS[u.kind] || 16),
            z1: Number.isFinite(target.z)
              ? target.z
              : (Terrain.level(target.x, target.y) < 0
                  ? Terrain.height(u.x, u.y)
                  : Terrain.height(target.x, target.y)) +
                (u.kind === "hero" ? MOUNTS.hero : 10),
            duration: Math.max(0.01, Math.max(0, dist(u, target) - r) / speed),
          }
        : {}),
    });
  }
  function hurt(s, u, damage, attacker) {
    if (u.hp <= 0 || u.care?.inside) return;
    if (u.kind === "citadel" && shielded(s)) {
      emit(s, "shield", u.x, u.y);
      return;
    }
    if (u.kind === "citadel" && attacker.kind !== "shell")
      damage *= s.terminal.window > 0 ? 0.65 : s.campaign ? 0.03 : 0.28;
    if (campaign.combat(s) && u.kind === "tank" && attacker.kind !== "shell") {
      const sourceAngle = Number.isFinite(attacker.vx)
        ? Math.atan2(-attacker.vy, -attacker.vx)
        : Math.atan2(attacker.y - u.y, attacker.x - u.x);
      if (Math.cos(sourceAngle - u.combat.angle) > Math.cos(Math.PI * 0.36))
        damage *= 0.38;
    }
    if (s.campaign && u.team && attacker.kind !== "shell") {
      if (u.kind === "sentinel") damage *= 0.65;
      if (u.kind === "warden") damage *= 0.7;
      if (u.kind === "bastion") damage *= 0.6;
      if (["turret", "jammer"].includes(u.kind)) damage *= 0.8;
    }
    if (
      s.campaign?.armor &&
      !u.team &&
      ["hero", "rifle", "artillery"].includes(u.kind)
    )
      damage *= 0.85;
    if (s.version >= 4 && u.defense) damage *= 0.35;
    u.hp -= damage;
    u.hit = 0.14;
    u.repair = 3;
    if (u.kind === "hero") {
      s.damageTaken += damage;
      emit(s, "hurt", u.x, u.y);
    } else emit(s, "hit", u.x, u.y, { team: u.team });
    if (u.hp <= 0) {
      u.hp = 0;
      if (s.campaign) campaign.onDeath(s, u);
      support.onDeath(s, u);
      s.kills += u.team === 1 ? 1 : 0;
      emit(s, "destroy", u.x, u.y, { kind: u.kind, team: u.team });
    }
  }
  function blast(s, b) {
    const radius = b.radius || 70,
      area = b.radius ? impactArea(s, b, radius) : null;
    emit(s, "blast", b.x, b.y, { radius });
    for (const u of s.units)
      if (
        u.hp > 0 &&
        u.team !== b.team &&
        (area ? insideArea(area, u) : rangeDistance(b, u) < radius) &&
        clear(b, u)
      )
        hurt(
          s,
          u,
          b.damage * (1 - rangeDistance(b, u) / (b.radius ? radius * 2 : 100)),
          b,
        );
  }
  function turnAngle(current, target, limit) {
    const delta = Math.atan2(
      Math.sin(target - current),
      Math.cos(target - current),
    );
    const angle = current + clamp(delta, -limit, limit);
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  }
  function areaArc(
    s,
    origin,
    radius,
    start,
    end,
    steps,
    walls = [
      ...mapFor(s).walls,
      ...(["highlands", "districts"].includes(mapFor(s).id)
        ? Terrain.visionWalls(Terrain.height(origin.x, origin.y) + 6)
        : []),
    ],
  ) {
    const angles = [],
      centre = (start + end) / 2;
    for (let i = 0; i <= steps; i++)
      angles.push(start + ((end - start) * i) / steps);
    // Rays on both sides of a cover corner preserve its sharp shadow boundary.
    for (const w of walls)
      for (const x of [w.x, w.x + w.w])
        for (const y of [w.y, w.y + w.h]) {
          if (dist(origin, { x, y }) > radius) continue;
          const raw = Math.atan2(y - origin.y, x - origin.x),
            a =
              centre +
              Math.atan2(Math.sin(raw - centre), Math.cos(raw - centre));
          for (const offset of [-1e-6, 0, 1e-6])
            if (a + offset > start && a + offset < end) angles.push(a + offset);
        }
    return angles
      .sort((a, b) => a - b)
      .map((a) => {
        const end = {
          x: origin.x + Math.cos(a) * radius,
          y: origin.y + Math.sin(a) * radius,
        };
        let t = 1;
        for (const wall of walls) {
          const hit = segmentRect(origin.x, origin.y, end.x, end.y, wall);
          if (hit !== null) t = Math.min(t, hit);
        }
        return {
          x: origin.x + (end.x - origin.x) * t,
          y: origin.y + (end.y - origin.y) * t,
        };
      });
  }
  function visionArea(s, point, radius) {
    const walls = [
      ...mapFor(s).walls.filter(
        (w) =>
          !["highlands", "districts"].includes(mapFor(s).id) ||
          Terrain.height(w.x + w.w / 2, w.y + w.h / 2) + 54 >=
            Terrain.height(point.x, point.y) + 24,
      ),
      ...(["highlands", "districts"].includes(mapFor(s).id)
        ? Terrain.visionWalls(Terrain.height(point.x, point.y) + 24)
        : []),
    ].filter(
      (w) =>
        Math.hypot(
          point.x - clamp(point.x, w.x, w.x + w.w),
          point.y - clamp(point.y, w.y, w.y + w.h),
        ) <= radius,
    );
    return { points: areaArc(s, point, radius, 0, Math.PI * 2, 64, walls) };
  }
  const impactAreas = new Map();
  function impactArea(s, point, radius) {
    const key = `${mapFor(s).id}:${point.x}:${point.y}:${radius}`;
    if (impactAreas.has(key)) return impactAreas.get(key);
    const points = areaArc(s, point, radius, 0, Math.PI * 2, 64);
    const area = Object.freeze({
      kind: "circle",
      x: point.x,
      y: point.y,
      radius,
      points: Object.freeze(points.map(Object.freeze)),
    });
    if (impactAreas.size >= 128)
      impactAreas.delete(impactAreas.keys().next().value);
    impactAreas.set(key, area);
    return area;
  }
  // The renderer and damage use the same cover-clipped ground polygon.
  function dangerArea(s, u) {
    if (!u.combat || u.hp <= 0 || u.combat.mode === "idle") return null;
    if (u.kind === "flamer") {
      const half = (Math.PI * 65) / 360,
        points = [
          { x: u.x, y: u.y },
          ...areaArc(
            s,
            u,
            stats(s, u).range,
            u.combat.angle - half,
            u.combat.angle + half,
            24,
          ),
        ];
      return { kind: "sector", points, active: u.combat.mode === "fire" };
    }
    if (u.kind === "bomber") return impactArea(s, u, 92);
    if (
      (["mortar", "citadel"].includes(u.kind) ||
        (u.kind === "bastion" && stats(s, u).siege)) &&
      u.target
    )
      return impactArea(s, u.target, 78);
    return null;
  }
  function insideArea(area, p) {
    if (p.construction) {
      const b = construction.rect(p);
      if (!area.points) return rangeDistance(area, p) < area.radius;
      if (
        [
          [b.x, b.y],
          [b.x + b.w, b.y],
          [b.x + b.w, b.y + b.h],
          [b.x, b.y + b.h],
        ].some(([x, y]) => insideArea(area, { x, y }))
      )
        return true;
      return area.points.some((a, i) => {
        const z = area.points[(i + 1) % area.points.length];
        return segmentRect(a.x, a.y, z.x, z.y, b) !== null;
      });
    }
    if (area.kind === "circle" && !area.points)
      return dist(area, p) < area.radius;
    let inside = false;
    const points = area.points;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i],
        b = points[j];
      if (
        a.y > p.y !== b.y > p.y &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
      )
        inside = !inside;
    }
    return inside;
  }
  function step(s, input = {}, dt = DT) {
    if (s.status !== "playing") return s;
    if (dt !== DT) throw Error("Simulation requires the fixed step");
    s.events = [];
    s.t += dt;
    support.tick(s, input, dt);
    const h = hero(s);
    if (h.care) input = {};
    const channel =
      input.interact && interaction(s)?.type === "terminal" && s.economy.kit;
    s.dash = Math.max(0, s.dash - dt);
    s.dashT = Math.max(0, s.dashT - dt);
    s.reload = Math.max(0, s.reload - dt);
    if (s.reload === 0 && s.ammo === 0) s.ammo = 12;
    const mx = clamp(input.x || 0, -1, 1),
      my = clamp(input.y || 0, -1, 1),
      len = Math.hypot(mx, my);
    if (
      input.aim &&
      Number.isFinite(input.aim.x) &&
      Number.isFinite(input.aim.y)
    )
      h.angle = aimAngle(h, input.aim);
    if (input.dash && s.dash === 0) {
      const a = len ? Math.atan2(my, mx) : h.angle;
      s.dashX = Math.cos(a);
      s.dashY = Math.sin(a);
      s.dash = 3.2;
      s.dashT = 0.2;
      emit(s, "dash", h.x, h.y, { angle: a });
    }
    if (s.dashT > 0) move(h, s.dashX * 610 * dt, s.dashY * 610 * dt);
    else if (len)
      move(
        h,
        (mx / Math.max(1, len)) * C.hero.speed * dt,
        (my / Math.max(1, len)) * C.hero.speed * dt,
      );
    if (input.reload && s.ammo < 12 && s.reload === 0) {
      s.ammo = 0;
      s.reload = 1.1;
      emit(s, "reload", h.x, h.y);
    }
    const combatTeams = campaign.combat(s) ? [[], []] : null;
    let followLeaders;
    if (combatTeams)
      for (const u of s.units) if (u.hp > 0 && !u.care?.inside) combatTeams[u.team].push(u);
    for (const u of s.units) {
      if (u.hp <= 0) continue;
      if (u.rally?.followId !== undefined) {
        const leader = (followLeaders ||= new Map(
          s.units.map((v) => [v.id, v]),
        )).get(u.rally.followId);
        if (leader?.hp > 0 && canLead(leader) && !leader.care?.inside)
          Object.assign(u.rally, { x: leader.x, y: leader.y });
        else delete u.rally.followId;
      }
      u.cool = Math.max(0, u.cool - dt);
      u.hit = Math.max(0, u.hit - dt);
      u.repair = Math.max(0, u.repair - dt);
      u.flash = Math.max(0, u.flash - dt);
      if (u.care) continue;
      if (u.kind === "hero") {
        if (
          input.fire &&
          !channel &&
          u.cool === 0 &&
          s.reload === 0 &&
          s.ammo > 0
        ) {
          shoot(
            s,
            u,
            input.aim && dist(u, input.aim) > 1
              ? input.aim
              : {
                  x: u.x + Math.cos(u.angle) * 600,
                  y: u.y + Math.sin(u.angle) * 600,
                },
          );
          s.ammo--;
          s.shots++;
          if (s.ammo === 0) s.reload = 1.1;
        }
        continue;
      }
      if (u.kind === "citadel" && s.terminal.window > 0) {
        u.wind = 0;
        if (u.combat)
          Object.assign(u.combat, {
            mode: "idle",
            time: 0,
            total: 0,
            burst: 0,
            gap: 0,
          });
        continue;
      }
      if (u.kind === "scout") {
        if (u.order?.followId !== undefined)
          updateFollow(
            s,
            u,
            dt,
            (followLeaders ||= new Map(s.units.map((v) => [v.id, v]))),
          );
        else if (u.target) {
          const target = s.units.find((v) => v.id === u.target.id),
            seen = target && visible(s, 0, target);
          if (seen && target.hp > 0)
            Object.assign(u.target, { x: target.x, y: target.y });
          if ((seen && target.hp <= 0) || (!seen && visible(s, 0, u.target))) {
            u.target = null;
            u.path = [];
          } else if ((u.think -= dt) <= 0) {
            u.path = firingPath(u, u.target);
            u.think = 0.5;
          }
        }
        follow(u, dt);
        continue;
      }
      const def = stats(s, u);
      if (!def.range || u.build) continue;
      const opponents = (
        combatTeams ? combatTeams[1 - u.team] : s.units
      ).filter(
        (v) =>
          v.team !== u.team &&
          !v.care?.inside && v.hp > 0 &&
          !(v.kind === "citadel" && shielded(s)),
      );
      // Campaign enemies choose targets in their own AI. The generic scan
      // below is used only by allies and legacy enemies.
      if (u.team !== 0 && s.campaign) {
        campaign.enemy(s, u, dt, opponents);
        continue;
      }
      let target = opponents
        .filter(
          (v) => rangeDistance(u, v) < def.range && clear(u, v) && visible(s, u.team, v, u),
        )
        .sort((a, b) => {
          const score = (v) => {
            let value = dist(u, v);
            if (!campaign.combat(s) || u.team) return value;
            if (u.kind === "artillery")
              value -= ["tank", "mortar", "bastion"].includes(v.kind) ? 150 : 0;
            else {
              if (v.kind === "bomber" && dist(u, v) < 180) value -= 340;
              if (v.kind === "flamer" && dist(u, v) < 230) value -= 180;
              if (["rocket", "mortar"].includes(v.kind)) value -= 75;
              if (
                v.kind === "tank" &&
                Math.cos(Math.atan2(u.y - v.y, u.x - v.x) - v.combat.angle) >
                  0.42
              )
                value += 120;
            }
            return value;
          };
          return score(a) - score(b);
        })[0];
      if (u.team === 0) {
        const escorting = u.order?.followId !== undefined;
        if (escorting)
          updateFollow(
            s,
            u,
            dt,
            (followLeaders ||= new Map(s.units.map((v) => [v.id, v]))),
          );
        if (
          !escorting &&
          !u.target &&
          target &&
          def.speed &&
          !u.path.length &&
          !fireClear(u, target)
        )
          u.target = { x: target.x, y: target.y, id: target.id };
        if (u.target && [1, 2].includes(u.group)) {
          const preferred = opponents.find((v) => v.id === u.target.id);
          u.think = Math.max(0, u.think - dt);
          const visible =
            preferred &&
            (balanced(s) || (rangeDistance(u, preferred) < 620 && clear(u, preferred))) &&
            recon.visible(s, 0, preferred, u);
          if (visible) {
            u.target.x = preferred.x;
            u.target.y = preferred.y;
          }
          if (!preferred && (!fogged(s) || recon.visible(s, 0, u.target)))
            u.target = null;
          else if (
            visible &&
            rangeDistance(u, preferred) < def.range * 0.92 &&
            fireClear(u, preferred)
          )
            u.path = [];
          else if (
            !visible &&
            rangeDistance(u, u.target) < detectionRange(s, u) &&
            clear(u, u.target) &&
            (!fogged(s) || recon.visible(s, 0, u.target))
          ) {
            u.target = null;
            u.path = [];
          } else if (u.think === 0) {
            u.path = firingPath(u, u.target);
            u.think = 0.5;
          }
          if (
            visible &&
            rangeDistance(u, preferred) < def.range &&
            fireClear(u, preferred)
          )
            target = preferred;
        }
        if (u.path.length) follow(u, dt);
        // Movement can change both the angle and the cover corridor this frame.
        if (
          target &&
          rangeDistance(u, target) < def.range &&
          fireClear(u, target) &&
          visible(s, 0, target) &&
          u.cool === 0
        )
          shoot(s, u, target);
      } else {
        u.think -= dt;
        if (!target && C[u.kind].speed && u.think <= 0) {
          u.think = 1.5;
          const prey = opponents
            .filter((v) => v.kind !== "base" || dist(u, v) < 400)
            .sort((a, b) => dist(u, a) - dist(u, b))[0];
          if (prey && dist(u, prey) < 450) u.path = firingPath(u, prey);
        }
        if (target && fireClear(u, target)) {
          u.path = [];
          u.angle = Math.atan2(target.y - u.y, target.x - u.x);
          if (u.cool === 0) {
            if (u.wind === 0) {
              u.wind = u.kind === "runner" ? 0.22 : 0.65;
              u.target = { x: target.x, y: target.y, id: target.id };
            }
            u.wind -= dt;
            if (u.wind <= 0) {
              const aim =
                u.kind === "runner"
                  ? s.units.find((v) => v.id === u.target.id)
                  : u.target;
              if (
                aim &&
                aim.hp !== 0 &&
                fireClear(u, aim) &&
                (u.kind !== "runner" || dist(u, aim) < 70)
              )
                shoot(s, u, aim);
              else u.cool = 0.5;
              u.wind = 0;
            }
          }
        } else {
          u.wind = 0;
          follow(u, dt);
        }
      }
    }
    for (const b of s.bullets) {
      b.age += dt;
      b.life -= dt;
      if (b.kind === "missile" && b.guided) {
        const target = s.units.find(
          (u) => u.id === b.lockId && u.hp > 0 && u.team !== b.team,
        );
        if (
          !target ||
          dist(b, target) > (balanced(s) ? ENGAGEMENT.rocket.sight : 650) ||
          !clear(b, target, 2) ||
          !visible(s, b.team, target)
        )
          b.guided = false;
        else {
          const angle = turnAngle(
            Math.atan2(b.vy, b.vx),
            Math.atan2(target.y - b.y, target.x - b.x),
            (Math.PI / 3) * dt,
          );
          b.vx = Math.cos(angle) * 260;
          b.vy = Math.sin(angle) * 260;
        }
      }
      const next = { x: b.x + b.vx * dt, y: b.y + b.vy * dt };
      if (
        b.z0 !== undefined &&
        !Terrain.ray(
          b,
          next,
          projectileHeight(b, b.age - dt),
          projectileHeight(b),
          0,
        )
      ) {
        emit(s, "spark", b.x, b.y);
        b.life = -1;
        continue;
      }
      if (b.kind === "shell") {
        if (dist(next, { x: b.tx, y: b.ty }) < 16 || b.life <= 0) {
          b.x = b.tx;
          b.y = b.ty;
          blast(s, b);
          b.life = -1;
        } else {
          b.x = next.x;
          b.y = next.y;
        }
        continue;
      }
      let hit = null,
        first = 1;
      for (const wall of mapFor(s).walls) {
        const t = segmentRect(b.x, b.y, next.x, next.y, wall, 2);
        if (
          t !== null &&
          t <= first &&
          (b.z0 === undefined ||
            projectileHeight(b) <
              Terrain.height(wall.x + wall.w / 2, wall.y + wall.h / 2) + 54)
        ) {
          first = t;
          hit = "wall";
        }
      }
      for (const u of s.units) {
        if (u.hp <= 0 || u.care?.inside || u.team === b.team) continue;
        if (u.kind === "hero" && s.dashT > 0) continue;
        const t = u.construction
          ? segmentRect(b.x, b.y, next.x, next.y, construction.rect(u), 2)
          : segmentCircle(b, next, u, C[u.kind].r + 2);
        if (
          t !== null &&
          t < first &&
          (b.z0 === undefined ||
            Math.abs(projectileHeight(b) - Terrain.height(u.x, u.y) - 18) < 28)
        ) {
          first = t;
          hit = u;
        }
      }
      b.x += (next.x - b.x) * first;
      b.y += (next.y - b.y) * first;
      if (hit) {
        if (hit !== "wall") hurt(s, hit, b.damage, b);
        else emit(s, "spark", b.x, b.y);
        b.life = -1;
      }
    }
    s.bullets = s.bullets.filter((b) => b.life > 0).slice(-160);
    strategyStep(s, input, dt);
    if (s.campaign) campaign.operation(s, input, dt);
    else {
      if (!living(s, "jammer") && s.phase === 0) {
        s.phase = 1;
        s.checkpoint = 1;
        emit(s, "objective", s.relay.x, s.relay.y);
      }
      if (
        h.hp > 0 &&
        s.phase === 1 &&
        dist(h, s.relay) < 75 &&
        input.interact
      ) {
        s.approach = "siege";
        s.relay.charge = Math.min(1, s.relay.charge + dt / 2.8);
        if (s.relay.charge === 1) {
          s.phase = 2;
          s.checkpoint = 2;
          s.relay.started = s.t;
          h.hp = Math.min(C.hero.hp, h.hp + 55);
          emit(s, "online", s.relay.x, s.relay.y);
        }
      } else if (s.phase === 1)
        s.relay.charge = Math.max(0, s.relay.charge - dt * 0.2);
      // Repair is a positional benefit; combat and damage remain meaningful away from the network.
      if (
        h.hp > 0 &&
        s.relay.online &&
        dist(h, s.relay) < 140 &&
        !s.units.some((u) => u.team === 1 && u.hp > 0 && dist(h, u) < 300)
      )
        h.hp = Math.min(C.hero.hp, h.hp + dt * 5);
      if (s.phase === 2) {
        const contested = s.units.some(
          (u) => u.team === 1 && u.hp > 0 && dist(u, s.relay) < 160,
        );
        s.relay.stability = clamp(
          s.relay.stability + (contested ? -dt * 0.05 : dt / 22),
          0,
          1,
        );
        if (s.wave < 2 && s.t - s.relay.started > 1 + s.wave * 10) {
          s.wave++;
          for (const [kind, x, y] of [
            ["runner", 1030, 840],
            ["runner", 1070, 880],
            ["sentinel", 1020, 910],
          ]) {
            const u = unit(s, kind, 1, x, y);
            u.path = pathTo(u, s.relay, C[kind].r);
          }
          emit(s, "reinforce", 1030, 840);
        }
        if (s.relay.stability === 1) {
          s.phase = 3;
          s.relay.online = true;
          if (s.economy.legacySupport) {
            unit(s, "artillery", 0, 780, 530, 2);
            s.economy.legacySupport = false;
          }
          emit(s, "online", s.relay.x, s.relay.y);
        }
      }
    }
    if (h.hp <= 0 || !living(s, "base")) {
      s.status = "lost";
      emit(s, "end", h.x, h.y);
    } else if (!living(s, "citadel")) {
      s.status = "won";
      s.approach = s.terminal.window > 0 ? "infiltration" : "siege";
      const endPoint = s.units.find((u) => u.kind === "citadel");
      emit(s, "end", endPoint.x, endPoint.y);
    }
    if (fogged(s)) recon.update(s);
    return s;
  }
  function snapshot(s) {
    const out = JSON.parse(JSON.stringify(s));
    out.events = [];
    return out;
  }
  function restore(value) {
    if (value?.fog !== undefined) return null;
    if ([3, 4, 5, 6, 7, 8, 9, 10, 11].includes(value?.version)) {
      const state = campaign.restore(value);
      if (
        !state ||
        !validFollowOrders(state) ||
        !recon.validate(state) ||
        !construction.validate(state) ||
        !support.validate(state)
      )
        return null;
      for (const u of state.units) owners.set(u, state);
      // Validate old knowledge with its original radii before a one-time upgrade.
      // Current saves remain exact round trips; no position, health or economy changes.
      if (balanceEligible(state) && state.campaign.balance === undefined) {
        state.campaign.balance = 1;
        recon.update(state, true);
      }
      return state;
    }
    try {
      const s = JSON.parse(JSON.stringify(value));
      if (
        !s ||
        s.recon !== undefined ||
        ![1, 2].includes(s.version) ||
        !["playing", "won", "lost"].includes(s.status) ||
        !Number.isFinite(s.t) ||
        s.t < 0 ||
        s.t > 86400 ||
        !Number.isInteger(s.seq) ||
        s.seq < 1 ||
        s.seq > 10000 ||
        !Number.isInteger(s.seed) ||
        !Array.isArray(s.units) ||
        s.units.length > 80 ||
        !Array.isArray(s.bullets) ||
        s.bullets.length > 160 ||
        ![0, 1, 2, 3].includes(s.phase)
      )
        return null;
      const point = (p) =>
        p &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        Math.abs(p.x) < 100000 &&
        Math.abs(p.y) < 100000;
      const ids = new Set();
      if (
        ["hero", "base", "jammer", "citadel", "turret"].some(
          (k) => s.units.filter((u) => u.kind === k).length !== 1,
        )
      )
        return null;
      for (const u of s.units) {
        if (
          !Object.hasOwn(C, u.kind) ||
          [
            "scout",
            "warden",
            "bastion",
            "rocket",
            "flamer",
            "bomber",
            "tank",
            "mortar",
          ].includes(u.kind) ||
          u.combat !== undefined ||
          ![0, 1].includes(u.team) ||
          !Number.isInteger(u.id) ||
          ids.has(u.id) ||
          !Number.isFinite(u.x) ||
          !Number.isFinite(u.y) ||
          !Number.isFinite(u.hp) ||
          u.x < 0 ||
          u.x > W ||
          u.y < 0 ||
          u.y > H ||
          u.hp < 0 ||
          u.hp > C[u.kind].hp ||
          !["angle", "cool", "wind", "hit", "flash", "think"].every((k) =>
            Number.isFinite(u[k]),
          ) ||
          !Array.isArray(u.path) ||
          u.path.length > 1000 ||
          u.path.some((p) => !point(p)) ||
          ![0, 1, 2].includes(u.group) ||
          (u.order !== null && !point(u.order)) ||
          (u.target !== null &&
            (!point(u.target) || !Number.isInteger(u.target.id))) ||
          u.id < 1 ||
          u.id > s.seq ||
          u.team !==
            (["hero", "rifle", "artillery", "base", "outpost"].includes(u.kind)
              ? 0
              : 1) ||
          u.cool < 0 ||
          u.cool > 5 ||
          u.wind < 0 ||
          u.wind > 1
        )
          return null;
        ids.add(u.id);
      }
      if (
        s.units.filter(
          (u) => u.kind === "hero" && u.id === s.heroId && u.team === 0,
        ).length !== 1 ||
        s.units.filter((u) => u.kind === "base" && u.team === 0).length !== 1 ||
        s.units.filter((u) => u.kind === "citadel" && u.team === 1).length !== 1
      )
        return null;
      if (
        !s.relay ||
        s.relay.x !== 850 ||
        s.relay.y !== 490 ||
        !Number.isFinite(s.relay.charge) ||
        s.relay.charge < 0 ||
        s.relay.charge > 1 ||
        typeof s.relay.online !== "boolean" ||
        s.relay.online !== (s.phase === 3)
      )
        return null;
      if (
        !Number.isFinite(s.relay.stability) ||
        s.relay.stability < 0 ||
        s.relay.stability > 1 ||
        !Number.isFinite(s.relay.started) ||
        s.relay.started < 0 ||
        s.relay.started > s.t
      )
        return null;
      if (
        ![
          "dash",
          "dashT",
          "dashX",
          "dashY",
          "ammo",
          "reload",
          "wave",
          "kills",
          "shots",
          "damageTaken",
        ].every((k) => Number.isFinite(s[k])) ||
        s.dash < 0 ||
        s.dash > 3.2 ||
        s.dashT < 0 ||
        s.dashT > 0.2 ||
        s.ammo < 0 ||
        s.ammo > 12 ||
        s.reload < 0 ||
        s.reload > 1.1 ||
        ![0, 1, 2].includes(s.wave) ||
        !Number.isInteger(s.ammo) ||
        s.dashX < -1 ||
        s.dashX > 1 ||
        s.dashY < -1 ||
        s.dashY > 1
      )
        return null;
      if (
        s.bullets.some(
          (b) =>
            ["z0", "z1", "duration"].some((k) => b[k] !== undefined) ||
            !["x", "y", "vx", "vy", "life", "damage", "age", "tx", "ty"].every(
              (k) => Number.isFinite(b[k]),
            ) ||
            !["shell", "bolt"].includes(b.kind) ||
            ![0, 1].includes(b.team),
        )
      )
        return null;
      if (
        (s.status === "playing" &&
          (hero(s).hp <= 0 || !living(s, "base") || !living(s, "citadel"))) ||
        (s.status === "won" && living(s, "citadel"))
      )
        return null;
      if (s.version === 1) {
        strategyDefaults(s, true);
        s.version = 2;
      }
      const eco = s.economy,
        terminal = s.terminal;
      if (
        s.units.some(
          (u) => !Number.isFinite(u.repair) || u.repair < 0 || u.repair > 3,
        )
      )
        return null;
      if (
        !eco ||
        !["alloy", "spent", "recovered"].every(
          (k) => Number.isInteger(eco[k]) && eco[k] >= 0 && eco[k] <= 2000,
        ) ||
        typeof eco.kit !== "boolean" ||
        typeof eco.legacySupport !== "boolean"
      )
        return null;
      if (
        !["siege", "infiltration"].includes(s.approach) ||
        !Array.isArray(s.caches) ||
        s.caches.length !== CACHES.length
      )
        return null;
      for (let i = 0; i < CACHES.length; i++) {
        const c = s.caches[i],
          d = CACHES[i];
        if (
          !c ||
          c.id !== d.id ||
          c.x !== d.x ||
          c.y !== d.y ||
          typeof c.taken !== "boolean" ||
          !Number.isFinite(c.charge) ||
          c.charge < 0 ||
          c.charge > 1 ||
          (c.taken && c.charge !== 1)
        )
          return null;
      }
      if (
        eco.alloy !==
        120 +
          s.caches.filter((c) => c.taken).length * 40 +
          eco.recovered -
          eco.spent
      )
        return null;
      if (
        !terminal ||
        terminal.x !== 1280 ||
        terminal.y !== 200 ||
        !Number.isFinite(terminal.charge) ||
        terminal.charge < 0 ||
        terminal.charge > 1 ||
        !Number.isFinite(terminal.window) ||
        terminal.window < 0 ||
        terminal.window > 7 ||
        typeof terminal.alarm !== "boolean" ||
        typeof terminal.channeling !== "boolean" ||
        (terminal.window > 0 && !eco.kit)
      )
        return null;
      const sites = new Set();
      let reclaimed = 0;
      for (const u of s.units.filter((u) => u.kind === "outpost")) {
        const pad = PADS.find((p) => p.id === u.site);
        if (
          !pad ||
          u.x !== pad.x ||
          u.y !== pad.y ||
          !Number.isFinite(u.build) ||
          u.build < 0 ||
          u.build > 6 ||
          typeof u.salvaged !== "boolean" ||
          (u.salvaged && u.hp !== 0)
        )
          return null;
        if (u.salvaged) reclaimed += COSTS.salvage;
        if (u.hp > 0) {
          if (sites.has(u.site)) return null;
          sites.add(u.site);
        }
      }
      if (
        sites.size > 2 ||
        eco.recovered !== reclaimed ||
        s.units.filter((u) => u.kind === "artillery" && u.hp > 0).length > 1 ||
        s.units.filter((u) => u.kind === "rifle" && u.hp > 0).length > 3
      )
        return null;
      s.events = [];
      if (!validFollowOrders(s) || !support.validate(s)) return null;
      return s;
    } catch (_) {
      return null;
    }
  }
  const fogged = (s) => recon.enabled(s);
  const visible = (s, team, p, witness) => recon.visible(s, team, p, witness);
  const explored = (s, team, p) => recon.explored(s, team, p);
  const API = {
    terminalSites,
    navigation,
    terrain: Terrain,
    elevation,
    projectileHeight,
    aimAngle,
    travelClear,
    fogged,
    visible,
    explored,
    observe: (s, team = 0) => recon.observe(s, team),
    knownEvents: (s, list = s.events) => recon.events(s, 0, list),
    refreshRecon: (s) => recon.update(s, true),
    W,
    H,
    DT,
    C,
    MOUNTS,
    walls,
    PADS,
    CACHES,
    COSTS,
    shielded,
    purchase,
    supplyStatus,
    interaction,
    objective,
    make,
    step,
    hero,
    living,
    order,
    orderUnits,
    attackUnits,
    followUnits,
    commandSelection,
    setRally,
    pathTo,
    firingPath,
    fireClear,
    stats,
    sightRange,
    detectionRange,
    balance: Object.freeze({ version: 1, eligible: balanceEligible, enabled: balanced, units: ENGAGEMENT }),
    turnAngle,
    dangerArea,
    impactArea,
    visionArea,
    insideArea,
    free,
    clear,
    dist,
    rangeDistance,
    clamp,
    snapshot,
    restore,
  };
  const Recon =
    typeof module !== "undefined" && module.exports
      ? require("./recon.js")
      : root.SignalRecon;
  recon = Recon.create({
    ...API,
    map: mapFor,
    pads: (s) => (s.campaign ? campaign.pads(s) : PADS),
  });
  const Campaign =
    typeof module !== "undefined" && module.exports
      ? require("./campaign.js")
      : root.SignalCampaign;
  const Construction =
    typeof module !== "undefined" && module.exports
      ? require("./construction.js")
      : root.SignalConstruction;
  construction = Construction.create({
    ...API,
    map: mapFor,
    unit,
    emit,
    follow,
    get development() {
      return campaign;
    },
  });
  API.construction = construction;
  campaign = Campaign.create({
    ...API,
    makeClassic,
    initializeRecon: (s) => recon.init(s),
    map: mapFor,
    unit,
    move,
    follow,
    shoot,
    hurt,
    blast,
    emit,
    spawnPoint,
  });
  const Support = typeof module !== "undefined" && module.exports ? require("./support.js") : root.SignalSupport;
  support = Support.create({ ...API, map: mapFor, follow, emit, get development() { return campaign; } });
  API.support = support;
  API.map = mapFor;
  API.pads = (s) =>
    (s.campaign ? campaign.pads(s) : PADS).filter(
      (p) => !fogged(s) || explored(s, 0, p),
    );
  API.development = campaign;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SignalEngine = API;
})(typeof globalThis !== "undefined" ? globalThis : window);
