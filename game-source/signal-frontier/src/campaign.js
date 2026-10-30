/* Economy and operation rules for new deployments. The original operation remains resumable. */
(function (root) {
  "use strict";
  const T =
    typeof module !== "undefined" && module.exports
      ? require("./terrain.js")
      : root.SignalTerrain;
  const Districts =
    typeof module !== "undefined" && module.exports
      ? require("./districts.js")
      : root.SignalDistricts;
  const mapped = (s) => s?.campaign?.id === "frontier-9";
  const highlands = (s) =>
    ["frontier-7", "frontier-8", "frontier-9"].includes(s?.campaign?.id);
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
  // A saved operation owns its rules. New balancing never rewrites an older deployment.
  const EXTENDED_ITEMS = Object.freeze({
    drone: { cost: 50, time: 18, pop: 0, label: "Дрон" },
    barracks: { cost: 120, time: 30, pop: 0, label: "Казармы" },
    outpost: { cost: 160, time: 45, pop: 0, label: "Добывающий узел" },
    network: { cost: 260, time: 90, pop: 0, label: "Сеть управления" },
    command: { cost: 520, time: 120, pop: 0, label: "Оперативный контур" },
    foundry: { cost: 180, time: 45, pop: 0, label: "Тяжёлый цех" },
    rifle: { cost: 65, time: 24, pop: 1, label: "Боец" },
    artillery: { cost: 280, time: 50, pop: 3, label: "Артиллерия" },
    hack: { cost: 360, time: 120, pop: 0, label: "Модуль проникновения" },
    weapons: { cost: 160, time: 60, pop: 0, label: "Импульсные усилители" },
    armor: { cost: 160, time: 60, pop: 0, label: "Композитная броня" },
    defense: { cost: 120, time: 40, pop: 0, label: "Защитный модуль" },
    repair: { cost: 50, time: 20, pop: 0, label: "Ремонт корпуса" },
  });
  const EXTENDED_MINES = Object.freeze(
    MINES.map((m) =>
      Object.freeze({
        ...m,
        stock: m.id === "home" ? 1080 : 1800,
      }),
    ),
  );
  const EXPEDITION_PADS = Object.freeze([
    ...PADS.map((p) => ({ ...p, y: p.y + 560, oreY: p.oreY + 560 })),
    {
      id: "north",
      name: "Северная жила",
      x: 520,
      y: 350,
      oreX: 440,
      oreY: 240,
    },
    { id: "south", name: "Южная жила", x: 700, y: 2240, oreX: 590, oreY: 2360 },
  ]);
  const EXPEDITION_BUILDINGS = Object.fromEntries(
    Object.entries(BUILDINGS).map(([k, p]) => [k, { x: p.x, y: p.y + 560 }]),
  );
  const EXPEDITION_CACHES = [
    ...CACHES.map((p) => ({ ...p, y: p.y + 560 })),
    { id: "bastion", x: 1300, y: 240 },
    { id: "arsenal", x: 1520, y: 2300 },
  ];
  const FORTS = [
    { sector: "north", name: "Северный бастион", x: 1810, y: 330 },
    { sector: "south", name: "Южный арсенал", x: 1750, y: 2270 },
  ];
  const EXPEDITION_ITEMS = {
    ...EXTENDED_ITEMS,
    network: { ...EXTENDED_ITEMS.network, cost: 320, time: 100 },
    command: { ...EXTENDED_ITEMS.command, cost: 700, time: 150 },
    weapons: { ...EXTENDED_ITEMS.weapons, cost: 220, time: 75 },
    armor: { ...EXTENDED_ITEMS.armor, cost: 220, time: 75 },
    hack: { ...EXTENDED_ITEMS.hack, cost: 480, time: 150 },
    artillery: { ...EXTENDED_ITEMS.artillery, cost: 350, time: 60 },
  };
  const EXPEDITION_RULES = Object.freeze({
    version: 5,
    items: EXPEDITION_ITEMS,
    mines: [
      { id: "home", x: 200, y: 1560, stock: 1440 },
      ...EXPEDITION_PADS.map((p) => ({
        id: p.id,
        x: p.oreX,
        y: p.oreY,
        stock: 2160,
      })),
    ],
    cache: 120,
    gather: 5.6,
    reserve: 54,
    firstRaid: 210,
    stagger: 65,
    raidInterval: 140,
    waveMax: 4,
    waveStep: 300,
    hold: 100,
    unitLimit: 448,
    ledgerLimit: 60000,
  });
  const PROFILES = Object.freeze({
    "frontier-3": EXPEDITION_RULES,
    "frontier-4": Object.freeze({
      ...EXPEDITION_RULES,
      version: 6,
      items: Object.freeze({
        ...EXPEDITION_ITEMS,
        command: { ...EXPEDITION_ITEMS.command, cost: 520, time: 120 },
        hack: { ...EXPEDITION_ITEMS.hack, cost: 360, time: 90 },
        artillery: { ...EXPEDITION_ITEMS.artillery, cost: 300 },
      }),
    }),
    "frontier-5": Object.freeze({
      ...EXPEDITION_RULES,
      version: 7,
      items: Object.freeze({
        ...EXPEDITION_ITEMS,
        command: { ...EXPEDITION_ITEMS.command, cost: 520, time: 120 },
        hack: { ...EXPEDITION_ITEMS.hack, cost: 360, time: 90 },
        artillery: { ...EXPEDITION_ITEMS.artillery, cost: 300 },
      }),
      firstRaid: 75,
      stagger: 50,
      raidInterval: 165,
      scoutRest: 220,
      reserve: 36,
      waveMax: 4,
    }),
    "frontier-6": Object.freeze({
      ...EXPEDITION_RULES,
      version: 8,
      items: Object.freeze({
        ...EXPEDITION_ITEMS,
        scout: { cost: 50, time: 18, pop: 1, label: "Дозорный" },
        command: { ...EXPEDITION_ITEMS.command, cost: 520, time: 120 },
        hack: { ...EXPEDITION_ITEMS.hack, cost: 360, time: 90 },
        artillery: { ...EXPEDITION_ITEMS.artillery, cost: 300 },
      }),
      firstRaid: 75,
      stagger: 50,
      raidInterval: 165,
      scoutRest: 220,
      reserve: 36,
      waveMax: 4,
    }),
    "frontier-7": Object.freeze({
      ...EXPEDITION_RULES,
      version: 9,
      mines: EXPEDITION_RULES.mines.map(T.point),
      items: Object.freeze({
        ...EXPEDITION_ITEMS,
        scout: { cost: 50, time: 18, pop: 1, label: "Дозорный" },
        command: { ...EXPEDITION_ITEMS.command, cost: 520, time: 120 },
        hack: { ...EXPEDITION_ITEMS.hack, cost: 360, time: 90 },
        artillery: { ...EXPEDITION_ITEMS.artillery, cost: 300 },
      }),
      firstRaid: 75,
      stagger: 50,
      raidInterval: 165,
      scoutRest: 220,
      reserve: 36,
      waveMax: 4,
    }),
    "frontier-8": Object.freeze({
      ...EXPEDITION_RULES,
      version: 10,
      mines: EXPEDITION_RULES.mines.map(T.point),
      items: Object.freeze({
        ...EXPEDITION_ITEMS,
        outpost: { ...EXPEDITION_ITEMS.outpost, label: "Экстрактор" },
        arsenal: { cost: 180, time: 45, pop: 0, label: "Арсенал" },
        bunker: { cost: 180, time: 36, pop: 0, label: "Бункер" },
        scout: { cost: 50, time: 18, pop: 1, label: "Дозорный" },
        command: { ...EXPEDITION_ITEMS.command, cost: 520, time: 120 },
        hack: { ...EXPEDITION_ITEMS.hack, cost: 360, time: 90 },
        artillery: { ...EXPEDITION_ITEMS.artillery, cost: 300 },
      }),
      firstRaid: 75,
      stagger: 50,
      raidInterval: 165,
      scoutRest: 220,
      reserve: 36,
      waveMax: 4,
    }),
    "frontier-9": Object.freeze({
      ...EXPEDITION_RULES,
      version: 11,
      mines: Districts.mines,
      items: Object.freeze({
        ...EXPEDITION_ITEMS,
        outpost: { ...EXPEDITION_ITEMS.outpost, label: "Экстрактор" },
        arsenal: { cost: 180, time: 45, pop: 0, label: "Арсенал" },
        bunker: { cost: 180, time: 36, pop: 0, label: "Бункер" },
        scout: { cost: 50, time: 18, pop: 1, label: "Дозорный" },
        command: { ...EXPEDITION_ITEMS.command, cost: 520, time: 120 },
        hack: { ...EXPEDITION_ITEMS.hack, cost: 360, time: 90 },
        artillery: { ...EXPEDITION_ITEMS.artillery, cost: 300 },
      }),
      firstRaid: 210,
      stagger: 75,
      raidInterval: 210,
      scoutRest: 240,
      reserve: 72,
      waveMax: 2,
    }),
    "frontier-1": Object.freeze({
      version: 3,
      items: ITEMS,
      mines: MINES,
      cache: 40,
      gather: 3.2,
      reserve: 24,
      firstRaid: 90,
      stagger: 35,
      raidInterval: 65,
      waveMax: 2,
      waveStep: 150,
      hold: 45,
      unitLimit: 256,
      ledgerLimit: 20000,
    }),
    "frontier-2": Object.freeze({
      version: 4,
      items: EXTENDED_ITEMS,
      mines: EXTENDED_MINES,
      cache: 100,
      gather: 5.6,
      reserve: 48,
      firstRaid: 140,
      stagger: 45,
      raidInterval: 100,
      waveMax: 3,
      waveStep: 240,
      hold: 90,
      unitLimit: 384,
      ledgerLimit: 40000,
    }),
  });
  const logistics = (s) => mapped(s) && s.campaign.logistics === 1;
  const LOGISTICS_RULES = Object.freeze({ ...PROFILES["frontier-9"], unitLimit: 2048,
    items: Object.freeze({ ...PROFILES["frontier-9"].items,
      artillery: Object.freeze({ ...PROFILES["frontier-9"].items.artillery, pop: 4 }),
      logistics: Object.freeze({ cost: 90, time: 24, pop: 0, label: "Узел снабжения" }) }) });
  const rules = (s) => logistics(s) ? LOGISTICS_RULES : PROFILES[s.campaign?.id] || PROFILES["frontier-1"];
  const items = (s) => rules(s).items;
  const expedition = (s) =>
    [
      "frontier-3",
      "frontier-4",
      "frontier-5",
      "frontier-6",
      "frontier-7",
      "frontier-8",
      "frontier-9",
    ].includes(s.campaign?.id);
  const extended = (s) =>
    [
      "frontier-2",
      "frontier-3",
      "frontier-4",
      "frontier-5",
      "frontier-6",
      "frontier-7",
      "frontier-8",
      "frontier-9",
    ].includes(s.campaign?.id);
  const HIGHLAND_PADS = EXPEDITION_PADS.map((p) => ({
      ...T.point(p),
      oreX: p.oreX * 1.5 + 120,
      oreY: p.oreY * 1.5,
    })),
    HIGHLAND_BUILDINGS = Object.fromEntries(
      Object.entries(EXPEDITION_BUILDINGS).map(([k, p]) => [k, T.point(p)]),
    ),
    HIGHLAND_CACHES = EXPEDITION_CACHES.map((p) =>
      p.id === "south" ? { ...p, x: 2160, y: 2580 } : T.point(p),
    ),
    HIGHLAND_FORTS = FORTS.map(T.point);
  const pads = (s) =>
    mapped(s)
      ? Districts.mines
          .filter((m) => m.id !== "home")
          .map((m) => ({
            id: m.id,
            name:
              Districts.regions.find(
                (r) =>
                  m.x >= r.x &&
                  m.x < r.x + r.w &&
                  m.y >= r.y &&
                  m.y < r.y + r.h,
              )?.name || m.id,
            x: m.x - 80,
            y: m.y + 100,
            oreX: m.x,
            oreY: m.y,
          }))
      : highlands(s)
        ? HIGHLAND_PADS
        : expedition(s)
          ? EXPEDITION_PADS
          : PADS;
  const buildings = (s) =>
    highlands(s)
      ? HIGHLAND_BUILDINGS
      : expedition(s)
        ? EXPEDITION_BUILDINGS
        : BUILDINGS;
  const caches = (s) =>
    mapped(s)
      ? Districts.caches
      : highlands(s)
        ? HIGHLAND_CACHES
        : expedition(s)
          ? EXPEDITION_CACHES
          : CACHES;
  const combat = (s) =>
    [
      "frontier-5",
      "frontier-6",
      "frontier-7",
      "frontier-8",
      "frontier-9",
    ].includes(s.campaign?.id);
  const SPECIAL = ["rocket", "flamer", "bomber", "tank", "mortar"];
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
      alive(s).reduce((n, u) => n + (items(s)[u.kind]?.pop || 0), 0) +
      queued(s).reduce((n, j) => n + items(s)[j.action].pop, 0);
    const capacity = (s) => logistics(s) ? Math.min(120, 24 + ready(s, "logistics").length * 12) : 6 + ready(s, "outpost").length * 3;
    const workerCapacity = (s) => logistics(s) ? Math.min(48, 16 + ready(s, "logistics").length * 4) : expedition(s) ? 24 : 16;
    const miningCapacity = (s) => logistics(s) ? 6 : 4;
    const activeCount = (s) => logistics(s) ? alive(s).length + queued(s).filter((j) => ["rifle", "scout", "artillery", "drone"].includes(j.action)).length : s.units.length;
    const objectLimit = (s) => logistics(s) ? 512 : rules(s).unitLimit;
    const mineWorkers = (s, mine) => alive(s, "drone").filter((u) => !u.buildingId && !u.workerTask &&
      (u.mineId || mineFor(s, s.units.find((n) => n.id === u.node))?.id) === mine.id);
    const count = (s, kind) => alive(s, kind).length + queued(s, kind).length;
    const workers = (s, node) =>
      alive(s, "drone").filter((u) => u.node === node.id);
    const usedSlots = (s, node) =>
      logistics(s) ? workers(s, node).filter((u) => !u.buildingId && !u.workerTask).length :
      workers(s, node).length + (node.jobs || []).filter((j) => j.action === "drone").length;
    const free = (p, r = 14, map = p.map || "frontier") =>
      E.free(p.x, p.y, r, map);
    function initUnit(u) {
      u.map = u.map || "frontier";
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
    function arm(u) {
      u.combat = {
        mode: "idle",
        time: 0,
        total: 0,
        angle: u.angle,
        burst: 0,
        gap: 0,
      };
      return u;
    }
    function make(profile = "frontier-8") {
      if (profile === "frontier-9") return makeDistricts();
      const config = PROFILES[profile];
      const s = E.makeClassic();
      s.version = config.version;
      s.economy = {
        alloy: 180,
        spent: 0,
        recovered: 0,
        kit: false,
        legacySupport: false,
      };
      s.campaign = {
        id: profile,
        ...(E.balance.eligible({ campaign: { id: profile } }) ? { balance: 1 } : {}),
        tier: 1,
        weapons: false,
        armor: false,
        deposited: 0,
        lostCargo: 0,
        refunded: 0,
        jobSeq: 0,
        squadSeq: 0,
        mines: config.mines.map((m) => ({ ...m, remaining: m.stock })),
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
      if (expedition(s)) {
        for (const u of s.units) {
          u.y += 560;
          u.map = "expedition";
          if (u.ai) u.ai.home.y += 560;
        }
        s.caches = EXPEDITION_CACHES.map((c) => ({
          ...c,
          taken: false,
          charge: 0,
        }));
        s.relay.y += 560;
        s.terminal = { ...s.terminal, x: 2120, y: 1530 };
        const core = E.living(s, "citadel");
        core.x = 2020;
        core.y = 1250;
        core.ai.home = { x: core.x, y: core.y };
        for (const f of FORTS) {
          const fort = initUnit(E.unit(s, "bastion", 1, f.x, f.y));
          fort.sector = f.sector;
          fort.ai = {
            home: { x: f.x, y: f.y },
            goal: null,
            seen: null,
            seenAt: 0,
            route: 0,
            role: "line",
            raid: false,
            patrol: 0,
          };
          for (const [dx, dy, kind] of [
            [-220, -20, "warden"],
            [-230, 100, "sentinel"],
            [120, 70, "warden"],
            [-140, 110, "runner"],
          ]) {
            const role = combat(s)
              ? {
                  warden: dx < 0 ? "tank" : "rocket",
                  sentinel: "flamer",
                  runner: "bomber",
                }[kind]
              : kind;
            const u = initUnit(E.unit(s, role, 1, f.x + dx, f.y + dy));
            u.ai = {
              home: { x: u.x, y: u.y },
              goal: null,
              seen: null,
              seenAt: 0,
              route: 0,
              role: ["runner", "bomber"].includes(kind) ? "flank" : "line",
              raid: false,
              patrol: 0,
            };
          }
        }
      }
      if (combat(s)) {
        for (const [x, y] of [
          [2120, 1060],
          [2110, 1450],
        ]) {
          const u = initUnit(E.unit(s, "mortar", 1, x, y));
          u.ai = {
            home: { x: u.x, y: u.y },
            goal: null,
            seen: null,
            seenAt: 0,
            route: 0,
            role: "line",
            raid: false,
            patrol: 0,
          };
        }
        for (const u of s.units) if (u.team) arm(u);
      }
      const base = E.living(s, "base");
      worker(s, base);
      worker(s, base);
      const sources = expedition(s)
        ? [...alive(s, "bastion"), E.living(s, "citadel")]
        : ["jammer", "turret", "citadel"].map((k) => E.living(s, k));
      for (const [i, source] of sources.entries()) {
        s.campaign.camps.push({
          source: source.id,
          reserve: config.reserve,
          cooldown: config.firstRaid + i * config.stagger,
          warning: 0,
          waves: 0,
          target: null,
        });
      }
      if (highlands(s)) {
        for (const u of s.units) {
          Object.assign(u, T.point(u), { map: "highlands" });
          if (u.ai) u.ai.home = T.point(u.ai.home);
          if (u.rally) u.rally = T.point(u.rally);
          // Reroute a spawn that formerly occupied a now impassable cut in the terrain.
          if (!E.free(u.x, u.y, E.C[u.kind].r, "highlands")) {
            const p = E.spawnPoint(s, u, u.kind);
            if (p) {
              u.x = p.x;
              u.y = p.y;
              if (u.ai) u.ai.home = { ...p };
            }
          }
        }
        s.caches = HIGHLAND_CACHES.map((c) => ({
          ...c,
          taken: false,
          charge: 0,
        }));
        s.relay = T.point(s.relay);
        s.terminal = T.point(s.terminal);
      }
      s.campaign.intel = [{ id: base.id, x: base.x, y: base.y, seenAt: 0 }];
      E.initializeRecon(s);
      return s;
    }
    function makeDistricts() {
      const s = make("frontier-8"),
        c = s.campaign;
      c.id = "frontier-9";
      c.balance = 1;
      c.logistics = 1;
      c.retired = { allies: 0, enemies: 0 };
      s.version = 11;
      c.mines = Districts.mines.map((m) => ({ ...m, remaining: m.stock }));
      s.units = s.units.filter((u) => !u.team);
      const positions = {
          hero: [[400, 2400]],
          base: [[320, 2560]],
          rifle: [
            [480, 2420],
            [520, 2480],
            [460, 2540],
          ],
          drone: [
            [375, 2610],
            [265, 2610],
          ],
        },
        index = {};
      for (const u of s.units) {
        const p = positions[u.kind][index[u.kind] || 0];
        index[u.kind] = (index[u.kind] || 0) + 1;
        u.x = p[0];
        u.y = p[1];
        u.map = "districts";
        u.path = [];
        delete u.workTarget;
      }
      const spawn = (kind, x, y, sector) => {
        const u = initUnit(E.unit(s, kind, 1, x, y));
        arm(u);
        u.sector = ["north", "south"].includes(sector) ? sector : undefined;
        u.cool = (u.id % 7) * 0.08;
        u.ai = {
          home: { x, y },
          goal: null,
          seen: null,
          seenAt: 0,
          route: 0,
          role: ["runner", "bomber"].includes(kind) ? "flank" : "line",
          raid: false,
          patrol: 0,
        };
        return u;
      };
      for (const p of Districts.guards) spawn(p.kind, p.x, p.y, p.sector);
      for (const p of Districts.turrets) spawn("turret", p.x, p.y, p.id);
      const sources = Districts.bases.map((p) =>
        spawn(p.kind, p.x, p.y, p.sector),
      );
      spawn("jammer", 2320, 1280, "relay");
      s.caches = Districts.caches.map((p) => ({
        ...p,
        taken: false,
        charge: 0,
      }));
      s.relay = { ...s.relay, x: 1880, y: 1640 };
      s.terminal = { ...s.terminal, ...Districts.terminals[0] };
      c.camps = sources.map((u, i) => ({
        source: u.id,
        reserve: Districts.bases[i].reserve,
        cooldown: 210 + i * 75,
        warning: 0,
        waves: 0,
        target: null,
      }));
      const base = E.living(s, "base");
      c.intel = [{ id: base.id, x: base.x, y: base.y, seenAt: 0 }];
      E.construction.replan(s);
      E.initializeRecon(s);
      return s;
    }
    function offer(s, action, site) {
      if (action === "repair-drone") return E.construction.repairOffer(s, site);
      if (action === "stop-repair")
        return { allowed: s.status === "playing" && s.units.some((w) => w.hp > 0 &&
          w.workerTask?.kind === "repair" && w.workerTask.targetId === Number(site)), cost: 0 };
      if (E.construction.enabled(s)) {
        if (s.status !== "playing")
          return { allowed: false, reason: "ended", cost: 0 };
        if (Object.hasOwn(E.construction.shapes, action))
          return typeof site === "object" && site
            ? E.construction.check(s, action, site)
            : E.construction.availability(s, action);
        if (action === "assign-builder")
          return { ...E.construction.replacement(s, site), cost: 0 };
        if (action === "cancel-build") {
          const u = s.units.find(
            (u) =>
              u.id === Number(site) &&
              u.hp > 0 &&
              u.build > 0 &&
              u.construction,
          );
          return u
            ? {
                allowed: true,
                cost: -Math.floor(u.construction.paid * 0.75),
                producer: u,
              }
            : { allowed: false, reason: "construction", cost: 0 };
        }
      }
      const ITEMS = items(s);
      const item = Object.hasOwn(ITEMS, action) ? ITEMS[action] : null,
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
        activeCount(s) >= objectLimit(s) - 6 &&
        [
          "rifle",
          "scout",
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
        anchor = buildings(s)[action];
      } else if (action === "outpost") {
        anchor = pads(s).find((p) => p.id === site);
        if (!anchor) return fail("site");
        if (!E.explored(s, 0, anchor)) return fail("unexplored");
        if (alive(s, "outpost").some((u) => u.site === site))
          return fail("occupied");
        if (E.dist(E.hero(s), anchor) > 210) return fail("distance");
        if (
          s.units.some(
            (u) =>
              u.team &&
              u.hp > 0 &&
              E.dist(u, anchor) < 140 &&
              E.visible(s, 0, u),
          )
        )
          return fail("hostiles");
      } else {
        if (["defense", "repair"].includes(action)) {
          producer = ready(s).find(
            (u) =>
              !u.team &&
              String(u.id) === String(site) &&
              (action === "defense"
                ? ["base", "outpost"]
                : ["base", "outpost", "barracks", "foundry", "arsenal", "bunker", "logistics"]
              ).includes(u.kind),
          );
          if (!producer) return fail("post");
          if (action === "defense" && producer.defense)
            return fail("installed");
          if (action === "repair" && producer.hp >= E.C[producer.kind].hp)
            return fail("intact");
          if (producer.jobs.some((j) => j.action === action))
            return fail("researching");
        } else if (action === "drone") {
          producer =
            nodes(s).find((u) => String(u.id) === String(site)) ||
            (!site ? E.living(s, "base") : null);
          if (!producer) return fail("post");
          if (
            (!logistics(s) && usedSlots(s, producer) >= 4) ||
            count(s, "drone") >= workerCapacity(s)
          )
            return fail("worker-limit");
          // Free-construction workers must remain trainable to rebuild lost mining nodes.
          if (!E.construction.enabled(s) && !mineFor(s, producer)?.remaining)
            return fail("exhausted");
        } else if (E.construction.enabled(s)) {
          const kind = ["rifle", "scout"].includes(action)
            ? "barracks"
            : action === "artillery"
              ? "foundry"
              : ["weapons", "armor", "hack"].includes(action)
                ? "arsenal"
                : "base";
          const requested =
            site === undefined || site === null || site === ""
              ? null
              : String(site).split(",").map(Number);
          const candidates = ready(s, kind).filter(
            (u) => !u.team && (!requested || requested.includes(u.id)),
          );
          if (!candidates.length) return fail(kind === "base" ? "post" : kind);
          if (
            requested &&
            requested.some((id) => !candidates.some((u) => u.id === id))
          )
            return fail("post");
          const available = candidates
            .filter((u) => u.jobs.length < 3)
            .sort(
              (a, b) =>
                a.jobs.reduce((n, j) => n + j.remaining, 0) -
                  b.jobs.reduce((n, j) => n + j.remaining, 0) || a.id - b.id,
            );
          producer = available[0] || candidates[0];
        } else if (["rifle", "scout", "weapons"].includes(action))
          producer = ready(s, "barracks")[0];
        else if (["artillery", "armor"].includes(action))
          producer = ready(s, "foundry")[0];
        else producer = E.living(s, "base");
        if (!producer)
          return fail(
            ["rifle", "scout", "weapons"].includes(action)
              ? "barracks"
              : "foundry",
          );
        if (action === "network") {
          if (s.campaign.tier >= 2) return fail("installed");
          if (!ready(s, "barracks").length) return fail("barracks");
          if (!ready(s, "outpost").length) return fail("expansion");
        }
        if (
          ["hack", "weapons", "armor", "artillery"].includes(action) &&
          s.campaign.tier < 2
        )
          return fail("network");
        if (action === "command") {
          if (s.campaign.tier === 3) return fail("installed");
          if (s.campaign.tier < 2) return fail("network");
          if (ready(s, "outpost").length < 2) return fail("second-node");
          if (expedition(s) && !mapped(s) && alive(s, "bastion").length === 2)
            return fail("fortress");
          if (!expedition(s) && E.living(s, "jammer") && E.living(s, "turret"))
            return fail("secure");
        }
        if (
          extended(s) &&
          ["hack", "artillery"].includes(action) &&
          s.campaign.tier < 3
        )
          return fail("command");
        if (action === "artillery" && !s.relay.online) return fail("relay");
        if (
          (action === "hack" && s.economy.kit) ||
          (["weapons", "armor"].includes(action) && s.campaign[action])
        )
          return fail("installed");
        if (
          ["network", "command", "hack", "weapons", "armor"].includes(action) &&
          queued(s, action).length
        )
          return fail("researching");
        if (!logistics(s) && action === "scout" && count(s, "scout") >= 4)
          return fail("scout-limit");
        if (!logistics(s) && action === "rifle" && count(s, "rifle") >= (expedition(s) ? 12 : 9))
          return fail("squad-full");
        if (
          !logistics(s) && action === "artillery" &&
          count(s, "artillery") >= (expedition(s) ? 3 : 2)
        )
          return fail("artillery-limit");
        if (item.pop && population(s) + item.pop > capacity(s))
          return fail("capacity");
        if ((producer.jobs || []).length >= 3) return fail("queue");
      }
      if (s.economy.alloy < item.cost) return fail("funds");
      return { allowed: true, reason: null, cost: item.cost, producer, anchor };
    }
    function purchase(s, action, site) {
      if (action === "repair-drone") return E.construction.repair(s, site);
      if (action === "stop-repair") return E.construction.stopRepair(s, site);
      if (E.construction.enabled(s)) {
        if (s.status !== "playing")
          return { allowed: false, reason: "ended", cost: 0 };
        if (Object.hasOwn(E.construction.shapes, action))
          return typeof site === "object" && site
            ? E.construction.place(s, action, site)
            : {
                allowed: false,
                reason: "placement",
                cost: items(s)[action].cost,
              };
        if (action === "assign-builder") return E.construction.assign(s, site);
        if (action === "cancel-build") return E.construction.cancel(s, site);
      }
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
      const item = items(s)[action];
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
    function supplyBlocked(s, job) {
      return !!(items(s)[job.action]?.pop && population(s) > capacity(s)) ||
        (logistics(s) && job.action === "drone" && count(s, "drone") > workerCapacity(s));
    }
    function production(s, dt) {
      const ITEMS = items(s);
      for (const u of alive(s).filter((u) => !u.team && u.kind !== "drone")) {
        if (u.build > 0) {
          if (u.construction) {
            E.construction.tick(s, u, dt);
            continue;
          }
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
        if (supplyBlocked(s, job)) continue;
        if (
          !u.construction &&
          ["rifle", "scout", "artillery", "drone"].includes(job.action) &&
          !E.spawnPoint(s, u, job.action)
        )
          continue;
        job.remaining = Math.max(0, job.remaining - dt);
        if (job.remaining > 0) continue;
        if (
          u.construction &&
          ["rifle", "scout", "artillery", "drone"].includes(job.action) &&
          !E.spawnPoint(s, u, job.action)
        )
          continue;
        u.jobs.shift();
        if (job.action === "network") s.campaign.tier = 2;
        else if (job.action === "command") s.campaign.tier = 3;
        else if (job.action === "defense") u.defense = true;
        else if (job.action === "repair")
          u.hp = Math.min(E.C[u.kind].hp, u.hp + E.C[u.kind].hp * 0.55);
        else if (job.action === "hack") {
          s.economy.kit = true;
          s.approach = "infiltration";
        } else if (["armor", "weapons"].includes(job.action))
          s.campaign[job.action] = true;
        else if (job.action === "drone") worker(s, u);
        else {
          const p = E.spawnPoint(s, u, job.action);
          const recruit = initUnit(
            E.unit(
              s,
              job.action,
              0,
              p.x,
              p.y,
              ["rifle", "scout"].includes(job.action) ? 1 : 2,
            ),
          );
          if (u.rally) {
            if (
              u.rally.followId === undefined ||
              !E.followUnits(s, [recruit.id], u.rally.followId, false)
            ) {
              recruit.order = { x: u.rally.x, y: u.rally.y };
              recruit.path = E.pathTo(recruit, u.rally, E.C[recruit.kind].r);
            }
          }
        }
        E.emit(
          s,
          [
            "network",
            "command",
            "hack",
            "armor",
            "weapons",
            "defense",
            "repair",
          ].includes(job.action)
            ? "upgrade"
            : "reinforce",
          u.x,
          u.y,
          { action: job.action },
        );
      }
    }
    function miningNetwork(s, dt) {
      const depots = nodes(s), byId = new Map(depots.map((u) => [u.id, u])),
        mines = new Map(s.campaign.mines.map((m) => [m.id, m])),
        crews = new Map(s.campaign.mines.map((m) => [m.id, []])),
        probes = alive(s, "drone").filter((u) => !u.buildingId && !u.workerTask),
        assignments = new Map();
      for (const u of probes) {
        const node = byId.get(u.node), mine = mines.get(u.mineId) || mineFor(s, node);
        assignments.set(u.id, { node, mine });
        if (node && mine) crews.get(mine.id).push(u);
      }
      const pairs = depots.map((node) => ({ node, mine: mineFor(s, node) })).filter((p) => p.mine?.remaining);
      for (const u of probes) {
        let { node, mine } = assignments.get(u.id);
        const row = mine && crews.get(mine.id), slot = row?.indexOf(u) ?? -1;
        if (!node || (!u.cargo && (!mine?.remaining || slot >= 6 || slot < 0))) {
          const available = pairs.filter((p) => crews.get(p.mine.id).length < 6)
            .sort((a, b) => E.dist(u, a.mine) - E.dist(u, b.mine) || a.node.id - b.node.id);
          const next = available[0];
          if (next) {
            if (slot >= 0) row.splice(slot, 1);
            node = next.node; mine = next.mine;
            u.node = node.id; u.mineId = mine.id;
            crews.get(mine.id).push(u);
            u.path = []; delete u.workTarget;
          } else if (!node) {
            node = depots.slice().sort((a, b) => E.dist(u, a) - E.dist(u, b) || a.id - b.id)[0];
            if (!node) { u.path = []; continue; }
            u.node = node.id; delete u.mineId;
            mine = mineFor(s, node);
          }
        }
        const index = mine ? crews.get(mine.id).indexOf(u) : -1,
          standby = !mine?.remaining || index < 0 || index >= 6;
        const threat = E.nearby(s, 1, u, 170).some((v) => E.dist(v, u) < 170 && E.clear(u, v));
        u.fright = threat ? 5 : Math.max(0, u.fright - dt);
        const offset = ((index < 0 ? u.id % 6 : index) - 2.5) * 18,
          deposit = node.construction ? E.construction.exit(node, E.C.drone.r) : { x: node.x, y: node.y - 44 };
        let destination = node.construction ? E.construction.advance(node, deposit, 0, offset) : { x: deposit.x + offset, y: deposit.y };
        if (!E.free(destination.x, destination.y, E.C.drone.r, E.navigation(s))) destination = deposit;
        if (!u.fright && !u.cargo && !standby) {
          const a = Math.atan2(deposit.y - mine.y, deposit.x - mine.x) + (index - 2.5) * .3,
            p = { x: mine.x + Math.cos(a) * 70, y: mine.y + Math.sin(a) * 70 };
          destination = E.free(p.x, p.y, E.C.drone.r, E.navigation(s)) ? p : { x: mine.x + offset, y: mine.y };
        }
        const key = destination.x + "," + destination.y;
        if (u.workTarget !== key) { u.path = []; u.workTarget = key; u.miningRetry = 0; }
        if (E.dist(u, destination) > 18) {
          u.miningRetry = Math.max(0, (u.miningRetry || 0) - dt);
          if (!u.path.length && !u.miningRetry) { u.path = E.pathTo(u, destination, E.C.drone.r); u.miningRetry = .8; }
          E.follow(u, dt);
          u.work = u.fright ? "shelter" : u.cargo ? "return" : "out";
          u.workTime = 0;
        } else {
          u.path = [];
          if (u.fright) { u.work = "shelter"; u.workTime = 0; }
          else if (u.cargo) {
            s.economy.alloy += u.cargo; s.campaign.deposited += u.cargo;
            u.cargo = 0; u.work = "out"; u.workTime = 0;
          } else if (!standby) {
            u.work = "gather"; u.workTime += dt;
            if (u.workTime >= rules(s).gather) {
              u.cargo = Math.min(4, mine.remaining); mine.remaining -= u.cargo;
              u.workTime = 0; u.work = "return";
            }
          } else { u.work = "idle"; u.workTime = 0; }
        }
      }
    }
    function compact(s) {
      if (!logistics(s) || Math.round(s.t / E.DT) % 60) return;
      const owners = new Set(s.bullets.map((b) => b.owner));
      for (const u of s.units) {
        if (u.order?.followId !== undefined) owners.add(u.order.followId);
        if (u.rally?.followId !== undefined) owners.add(u.rally.followId);
      }
      s.units = s.units.filter((u) => {
        if (u.hp > 0 || !E.C[u.kind].speed || u.kind === "hero" ||
          u.deadAt === undefined || s.t - u.deadAt < 15 || owners.has(u.id)) return true;
        if (u.team) s.campaign.retired.enemies++;
        else if (u.group) s.campaign.retired.allies++;
        return false;
      });
    }
    function mining(s, dt) {
      if (logistics(s)) return miningNetwork(s, dt);
      for (const u of alive(s, "drone")) {
        if (u.buildingId || u.workerTask) continue;
        let node = nodes(s).find((n) => n.id === u.node);
        if (!node) {
          delete u.mineId;
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
        let mine = s.campaign.mines.find((m) => m.id === u.mineId) || mineFor(s, node);
        if ((!mine.remaining || workers(s, node).indexOf(u) >= 4) && !u.cargo) {
          const next = nodes(s).find(
            (n) =>
              n.id !== node.id &&
              mineFor(s, n)?.remaining &&
              usedSlots(s, n) < 4,
          );
          if (next) {
            node = next;
            delete u.mineId;
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
        const deposit = node.construction
          ? E.construction.exit(node, E.C.drone.r)
          : { x: node.x, y: node.y - 44 };
        const destination =
          u.fright || u.cargo || !mine.remaining || standby
            ? node.construction
              ? E.construction.advance(node, deposit, 0, offset)
              : { x: deposit.x + offset, y: deposit.y }
            : { x: mine.x + offset, y: mine.y };
        const goalKey = destination.x + "," + destination.y;
        if (u.workTarget !== goalKey) {
          u.path = [];
          u.workTarget = goalKey;
          u.miningRetry = 0;
        }
        if (E.dist(u, destination) > 18) {
          u.miningRetry = Math.max(0, (u.miningRetry || 0) - dt);
          if (!u.path.length && !u.miningRetry) {
            u.path = E.pathTo(u, destination, E.C.drone.r);
            u.miningRetry = .8;
          }
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
            if (u.workTime >= rules(s).gather) {
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
      if (E.hero(s).care) return null;
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
      for (const terminal of E.terminalSites(s))
        if (E.dist(h, terminal) < 75)
          options.push({
            type: "terminal",
            target: terminal,
            allowed: s.economy.kit,
            progress: s.terminal.charge,
          });
      return (
        options
          .filter((o) => E.visible(s, 0, o.target))
          .sort((a, b) => E.dist(h, a.target) - E.dist(h, b.target))[0] || null
      );
    }
    function objective(s) {
      if (extended(s) && s.campaign.tier < 3) {
        const base = E.living(s, "base");
        if (!alive(s, "barracks").length)
          return { id: "develop", target: base, radius: 60 };
        if (!alive(s, "outpost").length)
          return { id: "expand", target: pads(s)[0], radius: 45 };
        if (s.campaign.tier === 1 && !queued(s, "network").length)
          return { id: "network", target: base, radius: 60 };
        if (alive(s, "outpost").length < 2)
          return {
            id: "expand-network",
            target: pads(s)
              .filter((p) => !alive(s, "outpost").some((u) => u.site === p.id))
              .sort((a, b) => E.dist(E.hero(s), a) - E.dist(E.hero(s), b))[0],
            radius: 45,
          };
        if (expedition(s) && !mapped(s) && alive(s, "bastion").length === 2)
          return {
            id: "fortress",
            target: alive(s, "bastion").sort(
              (a, b) => E.dist(E.hero(s), a) - E.dist(E.hero(s), b),
            )[0],
            radius: 55,
          };
        if (!expedition(s) && E.living(s, "jammer") && E.living(s, "turret"))
          return {
            id: "secure",
            target: [E.living(s, "turret"), E.living(s, "jammer")].sort(
              (a, b) => E.dist(E.hero(s), a) - E.dist(E.hero(s), b),
            )[0],
            radius: 50,
          };
        if (!queued(s, "command").length)
          return { id: "command", target: base, radius: 60 };
      }
      if (!s.economy.kit && s.campaign.tier === 1) {
        if (!alive(s, "barracks").length)
          return { id: "develop", target: E.living(s, "base"), radius: 60 };
        if (!alive(s, "outpost").length)
          return { id: "expand", target: pads(s)[0], radius: 45 };
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
      E.construction.serviceTick(s, dt);
      mining(s, dt);
      const h = E.hero(s),
        act = interaction(s),
        held = input.interact && s.dashT === 0 && act?.allowed;
      if (
        held &&
        act.type === "terminal" &&
        (act.target.x !== s.terminal.x || act.target.y !== s.terminal.y)
      )
        Object.assign(s.terminal, {
          x: act.target.x,
          y: act.target.y,
          charge: 0,
          window: 0,
        });
      s.terminal.channeling = !!(held && act.type === "terminal");
      s.terminal.window = Math.max(0, s.terminal.window - dt);
      for (const cache of s.caches) {
        if (cache.taken) continue;
        if (held && act.target === cache) {
          cache.charge = Math.min(1, cache.charge + dt / 1.2);
          if (cache.charge === 1) {
            cache.taken = true;
            s.economy.alloy += rules(s).cache;
            E.emit(s, "collect", cache.x, cache.y, { amount: rules(s).cache });
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
      for (const post of E.construction.enabled(s) ? [] : ready(s, "outpost"))
        for (const u of alive(s))
          if (
            !u.team &&
            !["base", "outpost", "barracks", "foundry", "arsenal", "bunker", "logistics"].includes(
              u.kind,
            ) &&
            u.repair === 0 &&
            E.dist(u, post) < 145 &&
            E.clear(u, post)
          )
            u.hp = Math.min(E.C[u.kind].hp, u.hp + dt * 7);
      // A small home repair area allows the scout to return without making a forward node redundant.
      const base = E.living(s, "base");
      if (
        base &&
        !h.care &&
        h.repair === 0 &&
        E.dist(h, base) < 100 &&
        !s.units.some((u) => u.team && u.hp > 0 && E.dist(u, base) < 260)
      )
        h.hp = Math.min(E.C.hero.hp, h.hp + dt * 4);
    }
    function onDeath(s, u) {
      E.construction.onDeath(s, u);
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
        workerCapacity: workerCapacity(s),
        workerReserved: queued(s, "drone").length,
        armyReserved: queued(s).reduce((n, j) => n + items(s)[j.action].pop, 0),
        working: alive(s, "drone").filter(
          (u) =>
            !u.fright &&
            !u.buildingId &&
            !u.workerTask &&
            (s.campaign.mines.find((m) => m.id === u.mineId) || mineFor(
              s,
              s.units.find((n) => n.id === u.node),
            ))?.remaining,
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
      if (
        ["base", "outpost", "barracks", "foundry", "arsenal", "bunker", "logistics"].includes(
          target.kind,
        )
      ) {
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
          free(p, E.C[u.kind].r, u.map) &&
          E.clear(u, p, E.C[u.kind].r) &&
          E.fireClear({ ...p, map: u.map, kind: u.kind }, target)
        )
          return p;
      }
      return null;
    }
    function aimTime(s, u) {
      if (u.kind === "bastion" && !E.stats(s, u).siege) return 0.7;
      return (
        {
          rocket: 0.8,
          flamer: 0.6,
          bomber: 0.8,
          tank: 0.75,
          mortar: 1.4,
          bastion: 1.4,
          citadel: 1.4,
          runner: 0.24,
        }[u.kind] || 0.36
      );
    }
    function resetAttack(u, cooldown = 0) {
      Object.assign(u.combat, {
        mode: "idle",
        time: 0,
        total: 0,
        burst: 0,
        gap: 0,
      });
      u.wind = 0;
      u.cool = Math.max(u.cool, cooldown);
    }
    function battle(s, u, dt, visible) {
      const a = u.combat,
        def = E.stats(s, u),
        locked = u.target,
        prey = locked && visible.find((v) => v.id === locked.id);
      if (a.mode === "idle") return false;
      if (a.mode === "aim") {
        // Only rockets track during lock-on, and only while the same target is visible.
        if (u.kind === "rocket") {
          if (
            !prey ||
            !E.fireClear(u, prey) ||
            E.rangeDistance(u, prey) > def.range
          ) {
            resetAttack(u, 1.1);
            return true;
          }
          Object.assign(locked, { x: prey.x, y: prey.y });
          a.angle = Math.atan2(prey.y - u.y, prey.x - u.x);
        }
        a.time = Math.max(0, a.time - dt);
        u.wind = a.time;
        if (a.time > 0) return true;
        if (u.kind === "bomber") {
          E.blast(s, {
            x: u.x,
            y: u.y,
            map: u.map,
            team: u.team,
            damage: def.damage,
            radius: 92,
            kind: "shell",
          });
          E.hurt(s, u, def.hp * 10, { kind: "shell", x: u.x, y: u.y });
          resetAttack(u);
        } else if (u.kind === "flamer") {
          a.mode = "fire";
          a.time = a.total = 1.2;
          E.emit(s, "flame", u.x, u.y, { kind: u.kind });
        } else if (["sentinel", "warden"].includes(u.kind)) {
          a.mode = "fire";
          a.burst = 3;
          a.gap = 0;
        } else {
          const siege =
            ["mortar", "citadel"].includes(u.kind) ||
            (u.kind === "bastion" && def.siege);
          if (
            locked &&
            (siege || E.fireClear(u, locked)) &&
            (u.kind !== "runner" ||
              (prey &&
                E.rangeDistance(u, prey) < 65 &&
                !(prey.kind === "hero" && s.dashT > 0)))
          ) {
            E.shoot(s, u, u.kind === "runner" ? prey : locked);
            // Firing must not snap a heavy chassis or erase its slow turn.
            if (u.kind === "tank") u.angle = a.angle;
          }
          resetAttack(u, def.rate);
        }
        return true;
      }
      if (u.kind === "flamer") {
        if (prey)
          a.angle = E.turnAngle(
            a.angle,
            Math.atan2(prey.y - u.y, prey.x - u.x),
            ((Math.PI * 35) / 180) * dt,
          );
        const area = E.dangerArea(s, u);
        for (const v of s.units)
          if (
            v.hp > 0 &&
            v.team !== u.team &&
            E.insideArea(area, v) &&
            E.clear(u, v)
          )
            E.hurt(s, v, def.damage * dt, u);
        a.time = Math.max(0, a.time - dt);
        if (!a.time) resetAttack(u, def.rate);
      } else {
        a.gap = Math.max(0, a.gap - dt);
        if (!a.gap) {
          if (locked && E.fireClear(u, locked)) E.shoot(s, u, locked);
          a.burst--;
          a.gap = 0.16;
          if (!a.burst) resetAttack(u, 1.7 + (u.id % 3) * 0.17);
        }
      }
      return true;
    }
    function beginAttack(s, u, target) {
      const a = u.combat;
      if (u.kind === "mortar" && E.rangeDistance(u, target) < 240) return false;
      const facing = Math.atan2(target.y - u.y, target.x - u.x);
      if (u.kind === "tank" && Math.cos(facing - a.angle) < Math.cos(0.17))
        return false;
      const lead = ["runner", "rocket", "flamer", "bomber", "tank"].includes(
        u.kind,
      )
        ? 0
        : Math.min(0.55, E.rangeDistance(u, target) / 520);
      const lock = {
        x: E.clamp(target.x + (u.ai.vx || 0) * lead, 24, E.map(s).W - 24),
        y: E.clamp(target.y + (u.ai.vy || 0) * lead, 24, E.map(s).H - 24),
        id: target.id,
      };
      if (!E.fireClear(u, lock))
        Object.assign(lock, { x: target.x, y: target.y });
      u.target = lock;
      if (u.kind !== "tank") a.angle = Math.atan2(lock.y - u.y, lock.x - u.x);
      a.mode = "aim";
      a.time = a.total = aimTime(s, u);
      u.wind = a.time;
      u.path = [];
      return true;
    }
    // These indexes live for one fixed simulation step, never in a save. A
    // restored operation therefore makes the same decisions as a running one.
    const enemyFrames = new WeakMap();
    function enemyFrame(s) {
      let frame = enemyFrames.get(s);
      if (
        frame?.time === s.t &&
        frame.units === s.units &&
        frame.count === s.units.length
      )
        return frame;
      frame = {
        time: s.t,
        units: s.units,
        count: s.units.length,
        cells: new Map(),
        positions: new Map(),
        order: new Map(),
        squads: new Map(),
        intelShared: false,
      };
      for (let i = 0; i < s.units.length; i++) {
        const u = s.units[i];
        if (!u.team || u.hp <= 0 || !E.C[u.kind].speed) continue;
        frame.order.set(u.id, i);
        indexEnemy(frame, u);
        if (u.ai?.squad) {
          let squad = frame.squads.get(u.ai.squad);
          if (!squad)
            frame.squads.set(
              u.ai.squad,
              (squad = { members: [], speed: Infinity, leader: u }),
            );
          squad.members.push(u);
          squad.speed = Math.min(squad.speed, E.C[u.kind].speed);
          if (u.id < squad.leader.id) squad.leader = u;
        }
      }
      enemyFrames.set(s, frame);
      return frame;
    }
    function indexEnemy(frame, u) {
      const key = Math.floor(u.x / 96) + ":" + Math.floor(u.y / 96),
        previous = frame.positions.get(u.id);
      if (previous === key) return;
      if (previous !== undefined) frame.cells.get(previous).delete(u);
      if (!frame.cells.has(key)) frame.cells.set(key, new Set());
      frame.cells.get(key).add(u);
      frame.positions.set(u.id, key);
    }
    function neighbors(frame, u) {
      const found = [],
        x = Math.floor(u.x / 96),
        y = Math.floor(u.y / 96);
      for (let yy = y - 1; yy <= y + 1; yy++)
        for (let xx = x - 1; xx <= x + 1; xx++)
          for (const other of frame.cells.get(xx + ":" + yy) || [])
            if (other !== u && other.hp > 0) found.push(other);
      // Retain authoritative unit order, including when several neighbors push.
      return found.sort(
        (a, b) => frame.order.get(a.id) - frame.order.get(b.id),
      );
    }
    function marchPoint(s, u, squad) {
      const ai = u.ai;
      if (!squad || s.t < ai.assembleUntil || ai.regroupUntil > s.t)
        return null;
      const leader = squad.leader,
        route = leader.ai.waypoints;
      while (route?.length && E.dist(leader, route[0]) < 60) {
        const passed = route.shift();
        for (const member of squad.members) {
          const next = member.ai.waypoints?.[0];
          if (
            member !== leader &&
            next &&
            next.x === passed.x &&
            next.y === passed.y
          )
            member.ai.waypoints.shift();
          member.think = 0;
        }
      }
      const goal = route?.[0] || leader.ai.goal;
      if (!goal || u === leader) return goal;
      const i = squad.members.indexOf(u),
        angle = Math.atan2(goal.y - leader.y, goal.x - leader.x),
        side = (i % 2 ? 1 : -1) * 32,
        back = Math.ceil(i / 2) * 42,
        point = {
          x: goal.x - Math.cos(angle) * back - Math.sin(angle) * side,
          y: goal.y - Math.sin(angle) * back + Math.cos(angle) * side,
        };
      return free(point, E.C[u.kind].r, u.map) ? point : goal;
    }
    function setEnemyRoute(s, u, destination, firingRoute) {
      const radius = E.C[u.kind].r;
      if (!destination || E.dist(u, destination) < 2) {
        u.path = [];
        return;
      }
      if (!free(destination, radius, u.map)) return;
      // An unchanged order should keep consuming its route, not search again.
      if (
        u.path.length &&
        E.dist(u.path.at(-1), destination) < 12 &&
        E.travelClear(u, u.path[0], radius, E.navigation(u))
      )
        return;
      const route =
        firingRoute && destination === firingRoute.at(-1)
          ? firingRoute
          : E.pathTo(u, destination, radius);
      // Keep an existing safe route while a new goal has no reachable route.
      if (
        route.length ||
        !u.path.length ||
        !E.travelClear(u, u.path[0], radius, E.navigation(u))
      )
        u.path = route;
    }
    function enemy(s, u, dt, opponents) {
      const ai = u.ai;
      let def = E.stats(s, u);
      if (!ai) return;
      const modern = ["frontier-8", "frontier-9"].includes(s.campaign.id),
        frame = modern ? enemyFrame(s) : null,
        squad = frame?.squads.get(ai.squad),
        awareness = E.detectionRange(s, u),
        homeRange = mapped(s) ? 240 : 470;
      u.think -= dt;
      const visible = opponents.filter(
        (v) =>
          v.hp > 0 &&
          (E.balance.enabled(s) ? E.rangeDistance(u, v) : E.dist(u, v)) < awareness &&
          E.clear(u, v) &&
          E.visible(s, 1, v, modern ? u : undefined),
      );
      // Guards defend their sector; raiding squads can pursue across the map.
      const defend = !ai.raid && def.speed;
      const engage = defend
        ? visible.filter((v) => E.dist(v, ai.home) < homeRange ||
            (E.balance.enabled(s) && E.rangeDistance(u, v) < def.range))
        : visible;
      const score = (v) =>
        E.dist(u, v) *
          (v.kind === "artillery" ? 0.7 : v.kind === "drone" ? 0.82 : 1) +
        (v.kind === "outpost" && u.kind !== "runner" ? 45 : 0);
      let target;
      for (const candidate of engage)
        if (!target || score(candidate) < score(target)) target = candidate;
      if (modern && target) {
        const retained = engage.find((v) => v.id === ai.seen?.id);
        if (retained && score(retained) <= score(target) * 1.18)
          target = retained;
      }
      // Route transitions are movement events. They must not wait for the
      // slower tactical decision timer (which previously caused visible rests).
      if (modern && def.speed && !target && !(ai.seen && s.t - ai.seenAt < 8)) {
        const route = !ai.raid && mapped(s) ? Districts.patrol(ai.home) : null,
          angle = ((ai.patrol % 4) * Math.PI) / 2 + (u.id % 2) * 0.4,
          circle =
            !ai.raid && !mapped(s)
              ? {
                  x: ai.home.x + Math.cos(angle) * 65,
                  y: ai.home.y + Math.sin(angle) * 65,
                }
              : null,
          point =
            route?.[ai.patrol % route.length] ||
            (circle && free(circle, def.r, u.map) ? circle : null);
        if (point) {
          if (E.dist(u, point) < 22) {
            ai.patrol++;
            u.think = 0;
          }
        } else if (
          ai.raid &&
          ai.waypoints?.length &&
          E.dist(u, ai.waypoints[0]) < 60
        ) {
          ai.waypoints.shift();
          u.think = 0;
        }
      }
      const marching =
          modern &&
          ai.raid &&
          !target &&
          s.t >= ai.assembleUntil &&
          !(ai.regroupUntil > s.t) &&
          !(ai.seen && s.t - ai.seenAt < 8),
        march = marching ? marchPoint(s, u, squad) : null;
      // Retry blocked orders at the normal decision cadence, not every frame.
      // Only actual route/state transitions bypass that cadence.
      if (
        modern &&
        ai.raid &&
        ((s.t >= ai.assembleUntil && s.t - dt < ai.assembleUntil) ||
          (s.t >= ai.regroupUntil && s.t - dt < ai.regroupUntil))
      )
        u.think = 0;
      if (combat(s)) {
        def = E.stats(s, u, target);
        const a = u.combat;
        if (u.kind === "tank") {
          // A blocked shot needs a new firing lane. Facing the target while
          // waiting to face that route otherwise prevents any chassis movement.
          const heading =
            a.mode === "aim"
              ? u.target
              : u.path.length &&
                  (!target ||
                    u.cool > 0 ||
                    E.rangeDistance(u, target) >= def.range ||
                    !E.fireClear(u, target))
                ? u.path[0]
                : target;
          a.angle = E.turnAngle(
            a.angle,
            heading ? Math.atan2(heading.y - u.y, heading.x - u.x) : u.angle,
            (Math.PI / 3) * dt,
          );
        }
        if (battle(s, u, dt, visible)) return;
      }
      if (u.wind > 0) {
        u.wind = Math.max(0, u.wind - dt);
        if (u.wind === 0) {
          const locked = u.target,
            prey = locked && s.units.find((v) => v.id === locked.id);
          if (
            prey &&
            prey.hp > 0 &&
            E.fireClear(u, locked) &&
            (u.kind !== "runner" ||
              (E.rangeDistance(u, prey) < 65 &&
                E.visible(s, 1, prey) &&
                !(prey.kind === "hero" && s.dashT > 0)))
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
        for (const v of frame?.intelShared
          ? []
          : E.fogged(s)
            ? s.units.filter((v) => !v.team && v.hp > 0 && !E.C[v.kind].speed && E.visible(s, 1, v))
            : visible)
          if (
            ["base", "outpost", "barracks", "foundry", "arsenal", "bunker", "logistics"].includes(
              v.kind,
            ) &&
            !s.campaign.intel.some((k) => k.id === v.id)
          )
            s.campaign.intel.push({ id: v.id, x: v.x, y: v.y, seenAt: s.t });
        if (frame) frame.intelShared = true;
        if (def.speed) {
          let destination = null,
            firingRoute = null;
          if (target) {
            const d = E.rangeDistance(u, target),
              side = u.id % 2 ? 1 : -1;
            if (u.kind === "mortar" && d < 260)
              destination = position(u, target, 350, side);
            else if (
              u.hp < def.hp * 0.3 &&
              !["runner", "bomber", "tank"].includes(u.kind) &&
              (!E.balance.enabled(s) || d < def.range * 0.72)
            )
              // Retreat into a useful firing band, rather than repeatedly
              // crossing the sight boundary without ever shooting again.
              destination = position(u, target, E.balance.enabled(s)
                ? Math.min(def.range * 0.9, d + 85) : Math.max(290, d + 85), side);
            else if (
              combat(s) &&
              ["runner", "bomber"].includes(u.kind) &&
              d > def.range &&
              d < 240 &&
              E.fireClear(u, target)
            ) {
              destination = position(u, target, def.range * 0.85, side);
              if (!destination) {
                firingRoute = E.firingPath(u, target);
                destination = firingRoute.at(-1) || null;
              }
            } else if (!E.fireClear(u, target) || d >= def.range) {
              firingRoute = E.firingPath(u, target);
              destination = firingRoute.at(-1) || null;
            } else if (u.kind === "runner" && d > 80)
              destination = position(u, target, 55, side);
            else if (
              !["runner", "bomber", "tank"].includes(u.kind) &&
              d < def.range * 0.55
            )
              destination = position(u, target, def.range * 0.78, side);
            else if (
              !["runner", "bomber", "tank"].includes(u.kind) &&
              d < def.range &&
              u.cool > 0.3
            )
              destination = position(u, target, def.range * 0.78, side);
            else if (d >= def.range) destination = { x: target.x, y: target.y };
          } else if (
            ai.seen &&
            s.t - ai.seenAt < 8 &&
            (!defend || E.dist(ai.seen, ai.home) < (E.balance.enabled(s) ? homeRange : 470))
          ) {
            if (!E.fireClear(u, ai.seen)) {
              firingRoute = E.firingPath(u, ai.seen);
              destination = firingRoute.at(-1) || null;
            } else destination = ai.seen;
          } else if (ai.raid) {
            while (ai.waypoints?.length && E.dist(u, ai.waypoints[0]) < 60)
              ai.waypoints.shift();
            destination = ai.waypoints?.[0] || ai.goal;
          } else if (mapped(s)) {
            const route = Districts.patrol(ai.home);
            destination = route ? route[ai.patrol % route.length] : ai.home;
            if (!modern && route && E.dist(u, destination) < 22) ai.patrol++;
          } else {
            const angle = ((ai.patrol % 4) * Math.PI) / 2 + (u.id % 2) * 0.4;
            const patrol = {
              x: ai.home.x + Math.cos(angle) * 65,
              y: ai.home.y + Math.sin(angle) * 65,
            };
            destination = free(patrol, def.r, u.map) ? patrol : ai.home;
            if (
              (!modern || destination === ai.home) &&
              E.dist(u, destination) < 22
            )
              ai.patrol++;
          }
          if (expedition(s) && ai.raid && ai.squad) {
            const members =
              squad?.members ||
              alive(s).filter((v) => v.team && v.ai?.squad === ai.squad);
            const nearby = members.filter((v) => E.dist(u, v) < 300),
              threat = visible.reduce(
                (n, v) => n + (E.C[v.kind].damage ? v.hp : 0),
                0,
              ),
              strength = nearby.reduce((n, v) => n + v.hp, 0);
            if (s.t < ai.assembleUntil) destination = ai.rally;
            else if (
              target &&
              threat > strength * 2.3 &&
              ai.regroupUntil < s.t - 18
            )
              for (const member of modern ? members : [u])
                member.ai.regroupUntil = s.t + 10;
            if (ai.regroupUntil > s.t) destination = ai.rally;
            else if (modern && s.t < ai.assembleUntil) destination = ai.rally;
            else if (modern && march) destination = march;
            else if (!target && members.length > 1) {
              const leader = members.reduce((a, b) => (a.id < b.id ? a : b));
              if (leader !== u && E.dist(u, leader) > 160)
                destination = { x: leader.x, y: leader.y };
              if (
                leader === u &&
                s.t < ai.assembleUntil + 30 &&
                nearby.length < Math.ceil(members.length * 0.6)
              )
                destination = { x: u.x, y: u.y };
            }
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
          if (modern) setEnemyRoute(s, u, destination, firingRoute);
          else if (destination && free(destination, def.r, u.map))
            u.path =
              firingRoute && destination === firingRoute.at(-1)
                ? firingRoute
                : E.pathTo(u, destination, def.r);
          else u.path = [];
        }
      }
      if (
        target &&
        E.rangeDistance(u, target) < def.range &&
        E.fireClear(u, target) &&
        u.cool === 0
      ) {
        if (combat(s)) {
          if (beginAttack(s, u, target)) return;
        } else {
          const lead =
            u.kind === "runner"
              ? 0
              : Math.min(1.1, 0.5 + E.rangeDistance(u, target) / 390);
          // Position is locked before firing. Changing direction after the warning remains effective.
          const lock = {
            x: E.clamp(target.x + (ai.vx || 0) * lead, 24, E.map(s).W - 24),
            y: E.clamp(target.y + (ai.vy || 0) * lead, 24, E.map(s).H - 24),
            id: target.id,
          };
          if (!E.fireClear(u, lock)) {
            lock.x = target.x;
            lock.y = target.y;
          }
          u.target = lock;
          u.wind =
            u.kind === "runner" ? 0.24 : u.kind === "citadel" ? 0.7 : 0.5;
          u.angle = Math.atan2(lock.y - u.y, lock.x - u.x);
          return;
        }
      }
      if (def.speed) {
        const heading =
          u.path[0] && Math.atan2(u.path[0].y - u.y, u.path[0].x - u.x);
        if (
          u.kind !== "tank" ||
          heading === undefined ||
          Math.cos(heading - u.combat.angle) > Math.cos(0.24)
        ) {
          let pace = 1;
          if (marching && squad) {
            const leader = squad.leader,
              trailing = E.dist(u, leader) > 200 && u !== leader;
            pace = trailing ? 1 : Math.min(1, squad.speed / def.speed);
            if (u === leader && squad.members.some((v) => E.dist(v, u) > 300))
              pace *= 0.55;
          }
          E.follow(u, dt * pace);
        }
        // Keep a small separation so a whole squad cannot occupy one point or eat one projectile.
        if (frame) indexEnemy(frame, u);
        for (const other of frame ? neighbors(frame, u) : s.units)
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
        if (frame) indexEnemy(frame, u);
      }
    }
    function dispatch(s, camp, n, goal) {
      const source = s.units.find((u) => u.id === camp.source);
      if (!source || source.hp <= 0) return;
      if (logistics(s)) n = Math.min(n, Math.max(0, objectLimit(s) - activeCount(s)));
      if (mapped(s)) {
        const active = s.units.filter((u) => u.team && u.hp > 0 && u.ai?.raid);
        if (new Set(active.map((u) => u.ai.squad)).size >= 2) return;
        n = Math.min(n, 32 - active.length);
      }
      let spawned = 0;
      for (let i = 0; i < n && camp.reserve > 0; i++) {
        const mixed =
          s.t < 180
            ? ["runner", "sentinel"]
            : s.t < 360
              ? ["sentinel", "rocket", "runner", "flamer", "sentinel", "bomber"]
              : s.t < 660
                ? ["warden", "rocket", "flamer", "sentinel", "bomber", "tank"]
                : [
                    "tank",
                    "rocket",
                    "flamer",
                    "warden",
                    "bomber",
                    "mortar",
                    "sentinel",
                    "rocket",
                  ];
        const kind = combat(s)
            ? mixed[
                (i +
                  (i < 3
                    ? 0
                    : camp.waves + (source.sector === "south" ? 2 : 0))) %
                  mixed.length
              ]
            : expedition(s) && s.t > 360 && i % 4 === 1
              ? "warden"
              : i % 3 === 0
                ? "runner"
                : "sentinel",
          p = E.spawnPoint(s, source, kind);
        if (!p) break;
        const u = initUnit(E.unit(s, kind, 1, p.x, p.y));
        if (expedition(s)) {
          u.ai = null;
        }
        if (combat(s)) arm(u);
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
          role: ["runner", "bomber"].includes(kind) ? "flank" : "line",
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
      if (expedition(s) && spawned) {
        const members = s.units.slice(-spawned),
          rally = { x: source.x - 150, y: source.y };
        for (const u of members) {
          u.ai.squad = s.campaign.squadSeq + 1;
          u.ai.assembleUntil = s.t + 8;
          u.ai.regroupUntil = 0;
          u.ai.rally = free(rally, 20, u.map)
            ? rally
            : { x: source.x, y: source.y };
          u.ai.waypoints =
            E.dist(source, goal) > 900
              ? [
                  {
                    x: source.sector === "south" ? 1160 : 1000,
                    y: source.sector === "south" ? 2380 : 300,
                  },
                  { x: 520, y: source.sector === "south" ? 1990 : 1180 },
                ]
              : [];
        }
        if (mapped(s))
          for (const u of members)
            u.ai.waypoints =
              source.sector === "north"
                ? [
                    { x: 2040, y: 500 },
                    { x: 840, y: 1400 },
                    { x: 840, y: 2040 },
                  ]
                : source.sector === "south"
                  ? [
                      { x: 2160, y: 3320 },
                      { x: 2160, y: 2400 },
                      { x: 1440, y: 2040 },
                    ]
                  : [
                      { x: 2760, y: 1880 },
                      { x: 2200, y: 1900 },
                      { x: 1440, y: 2040 },
                    ];
        s.campaign.squadSeq++;
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
        if (
          expedition(s) &&
          alive(s).filter((u) => u.team && u.ai?.raid).length >=
            (mapped(s) ? 32 : 42)
        )
          continue;
        if (
          mapped(s) &&
          new Set(
            alive(s)
              .filter((u) => u.team && u.ai?.raid)
              .map((u) => u.ai.squad),
          ).size >= 2
        )
          continue;
        if (camp.warning > 0) {
          camp.warning = Math.max(0, camp.warning - dt);
          if (camp.warning === 0) {
            dispatch(
              s,
              camp,
              combat(s) && camp.waves === 0
                ? 2
                : 4 +
                    Math.min(
                      rules(s).waveMax,
                      Math.floor(s.t / rules(s).waveStep),
                    ),
              camp.target,
            );
            camp.cooldown =
              combat(s) && camp.waves === 1
                ? rules(s).scoutRest
                : rules(s).raidInterval;
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
            camp.target =
              candidates[
                (camp.waves + source.id) % Math.min(2, candidates.length)
              ] ||
              (highlands(s)
                ? T.point({ x: 135, y: 1700 })
                : { x: 135, y: expedition(s) ? 1700 : 1140 });
            if (expedition(s) && candidates.length) {
              // Infrastructure enters this list only after visual contact. Age increases uncertainty.
              camp.target = [...candidates].sort((a, b) => {
                const score = (p) =>
                  E.dist(source, p) +
                  Math.min(600, (s.t - p.seenAt) * 0.7) +
                  (p.id === E.living(s, "base")?.id ? 500 : 0);
                return score(a) - score(b);
              })[camp.waves % Math.min(2, candidates.length)];
            }
            camp.target = { x: camp.target.x, y: camp.target.y };
            camp.warning = 9;
            E.emit(s, "raid", source.x, source.y, {
              target: camp.target,
              sector:
                source.kind === "jammer" || source.sector === "north"
                  ? "north"
                  : source.kind === "turret" || source.sector === "south"
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
          s.relay.stability + (contested ? -dt * 0.025 : dt / rules(s).hold),
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
        const config = PROFILES[c?.id] && rules(s);
        if (!config || s.version !== config.version) return null;
        if (c.balance !== undefined && (!E.balance.eligible(s) || c.balance !== 1)) return null;
        if (c.logistics !== undefined && (!mapped(s) || c.logistics !== 1)) return null;
        if (logistics(s) && (!c.retired || ![c.retired.allies, c.retired.enemies].every((n) => Number.isSafeInteger(n) && n >= 0 && n <= s.seq))) return null;
        const ITEMS = config.items,
          MINES = config.mines,
          PADS = pads(s),
          BUILDINGS = buildings(s),
          CACHES = caches(s),
          world = E.map(s);
        const num = (v, min, max) => Number.isFinite(v) && v >= min && v <= max,
          int = (v, min, max) => Number.isInteger(v) && num(v, min, max);
        const point = (p) => p && num(p.x, 0, world.W) && num(p.y, 0, world.H);
        const ally = [
          "hero",
          "scout",
          "base",
          "outpost",
          "rifle",
          "artillery",
          "drone",
          "barracks",
          "foundry",
          "arsenal",
          "bunker",
          "logistics",
        ];
        if (
          !s ||
          !["playing", "won", "lost"].includes(s.status) ||
          !num(s.t, 0, 86400) ||
          !int(s.seq, 1, 10000) ||
          !int(s.seed, 0, 4294967295) ||
          !Array.isArray(s.units) ||
          s.units.length > config.unitLimit ||
          (logistics(s) && activeCount(s) > objectLimit(s)) ||
          !Array.isArray(s.bullets) ||
          s.bullets.length > (logistics(s) ? 4096 : 160) ||
          ![0, 1, 2, 3].includes(s.phase)
        )
          return null;
        for (const k of ["hero", "base", "jammer", "citadel", "turret"])
          if (
            s.units.filter((u) => u.kind === k).length !==
            (mapped(s) && k === "turret" ? 8 : 1)
          )
            return null;
        if (expedition(s))
          for (const f of mapped(s)
            ? Districts.bases.slice(0, 2)
            : highlands(s)
              ? HIGHLAND_FORTS
              : FORTS) {
            const forts = s.units.filter(
              (u) => u.kind === "bastion" && u.sector === f.sector,
            );
            if (forts.length !== 1 || forts[0].x !== f.x || forts[0].y !== f.y)
              return null;
          }
        if (
          s.units.filter((u) => u.kind === "bastion").length !==
          (expedition(s) ? 2 : 0)
        )
          return null;
        const ids = new Set(),
          sites = new Set(),
          jobIds = new Set(),
          research = new Set();
        let cargo = 0;
        for (const u of s.units) {
          if (
            !Object.hasOwn(E.C, u.kind) ||
            (u.kind === "scout" && !E.fogged(s)) ||
            (!combat(s) &&
              (SPECIAL.includes(u.kind) || u.combat !== undefined)) ||
            (!u.team && u.combat !== undefined) ||
            (!expedition(s) && ["bastion", "warden"].includes(u.kind)) ||
            !int(u.id, 1, s.seq) ||
            ids.has(u.id) ||
            u.map !== world.id ||
            !point(u) ||
            (u.hp > 0 && !E.free(u.x, u.y, E.C[u.kind].r, world.id)) ||
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
                        : k === "cool" && combat(s)
                          ? Math.max(5, E.stats(s, u).rate)
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
            (["rifle", "scout"].includes(u.kind) && u.group !== 1) ||
            (u.kind === "artillery" && u.group !== 2) ||
            (!["rifle", "scout", "artillery"].includes(u.kind) && u.group !== 0)
          )
            return null;
          if (
            u.defense !== undefined &&
            (!extended(s) ||
              typeof u.defense !== "boolean" ||
              !["base", "outpost"].includes(u.kind))
          )
            return null;
          if (u.rally !== undefined && !point(u.rally)) return null;
          if (u.deadAt !== undefined && (!logistics(s) || u.hp !== 0 || !num(u.deadAt, 0, s.t))) return null;
          if (u.kind === "logistics" && !logistics(s)) return null;
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
            if (
              !pad ||
              (!E.construction.enabled(s) &&
                (u.x !== pad.x || u.y !== pad.y)) ||
              u.salvaged !== false
            )
              return null;
            if (u.hp > 0) {
              if (sites.has(u.site)) return null;
              sites.add(u.site);
            }
          }
          if (
            !E.construction.enabled(s) &&
            BUILDINGS[u.kind] &&
            (u.x !== BUILDINGS[u.kind].x || u.y !== BUILDINGS[u.kind].y)
          )
            return null;
          const localJobs = new Set();
          for (const job of u.jobs) {
            if (["defense", "repair"].includes(job.action)) {
              if (
                localJobs.has(job.action) ||
                (job.action === "defense" && u.defense)
              )
                return null;
              localJobs.add(job.action);
            }
            const spec = ITEMS[job.action],
              allowed =
                {
                  base: [
                    "drone",
                    "network",
                    ...(!E.construction.enabled(s) ? ["hack"] : []),
                    ...(extended(s) ? ["command", "defense", "repair"] : []),
                  ],
                  outpost: [
                    "drone",
                    ...(extended(s) ? ["defense", "repair"] : []),
                  ],
                  barracks: [
                    "rifle",
                    "scout",
                    ...(!E.construction.enabled(s) ? ["weapons"] : []),
                    ...(extended(s) ? ["repair"] : []),
                  ],
                  bunker: ["repair"],
                  logistics: ["repair"],
                  arsenal: E.construction.enabled(s)
                    ? ["weapons", "armor", "hack", "repair"]
                    : [],
                  foundry: [
                    "artillery",
                    ...(!E.construction.enabled(s) ? ["armor"] : []),
                    ...(extended(s) ? ["repair"] : []),
                  ],
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
            if (
              ["network", "command", "hack", "weapons", "armor"].includes(
                job.action,
              )
            ) {
              if (research.has(job.action)) return null;
              research.add(job.action);
            }
          }
          if (u.kind === "drone") {
            if (
              !int(u.node, 1, s.seq) ||
              !int(u.cargo, 0, 4) ||
              ![
                "out",
                "return",
                "gather",
                "idle",
                "shelter",
                "repair",
                "move",
                ...(E.construction.enabled(s) ? ["build"] : []),
              ].includes(u.work) ||
              !num(u.workTime, 0, config.gather + 0.01) ||
              !num(u.fright, 0, 5) ||
              (u.hp === 0 && u.cargo !== 0)
            )
              return null;
            cargo += u.cargo;
          }
          if (u.team) {
            if (combat(s)) {
              const a = u.combat;
              if (
                !a ||
                !["idle", "aim", "fire"].includes(a.mode) ||
                !num(a.time, 0, 1.5) ||
                !num(a.total, 0, 1.5) ||
                a.time > a.total ||
                !num(a.angle, -100, 100) ||
                !int(a.burst, 0, 3) ||
                !num(a.gap, 0, 0.16) ||
                (a.mode === "idle" &&
                  (a.time || a.total || a.burst || a.gap || u.wind)) ||
                (a.mode !== "idle" && !u.target) ||
                (a.mode === "aim" &&
                  (a.time <= 0 ||
                    a.time !== u.wind ||
                    a.total !== aimTime(s, u))) ||
                (a.mode === "fire" &&
                  !["flamer", "sentinel", "warden"].includes(u.kind)) ||
                (a.mode === "fire" &&
                  (u.wind !== 0 ||
                    (u.kind === "flamer"
                      ? a.time <= 0 ||
                        a.total !== 1.2 ||
                        a.burst !== 0 ||
                        a.gap !== 0
                      : a.time !== 0 ||
                        a.total !== aimTime(s, u) ||
                        a.burst < 1)))
              )
                return null;
            }
            const ai = u.ai;
            if (
              ai?.squad !== undefined &&
              (!expedition(s) ||
                !int(ai.squad, 1, c.squadSeq) ||
                !num(ai.assembleUntil, 0, s.t + 8.01) ||
                !num(ai.regroupUntil, 0, s.t + 10.01) ||
                !point(ai.rally))
            )
              return null;
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
          (!E.construction.enabled(s) &&
            ["barracks", "foundry"].some((k) => alive(s, k).length > 1)) ||
          (logistics(s) ? population(s) > 120 || count(s, "drone") > 48 || alive(s, "logistics").length > 8 :
            count(s, "rifle") > (expedition(s) ? 12 : 9) || count(s, "scout") > 4 ||
            count(s, "artillery") > (expedition(s) ? 3 : 2) || count(s, "drone") > (expedition(s) ? 24 : 16))
        )
          return null;
        if (
          !(extended(s) ? [1, 2, 3] : [1, 2]).includes(c.tier) ||
          typeof c.weapons !== "boolean" ||
          typeof c.armor !== "boolean" ||
          !["deposited", "lostCargo", "refunded", "jobSeq", "squadSeq"].every(
            (k) => int(c[k], 0, config.ledgerLimit),
          )
        )
          return null;
        if (
          (research.has("network") && c.tier >= 2) ||
          (research.has("command") && c.tier !== 2) ||
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
            int(eco[k], 0, config.ledgerLimit),
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
            s.units.some((u) =>
              ["foundry", "artillery", "arsenal"].includes(u.kind),
            )) &&
          c.tier < 2
        )
          return null;
        if (
          extended(s) &&
          c.tier < 3 &&
          (eco.kit ||
            research.has("hack") ||
            s.units.some((u) => u.kind === "artillery") ||
            queued(s, "artillery").length)
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
            s.caches.filter((v) => v.taken).length * config.cache +
            c.deposited +
            eco.recovered -
            eco.spent
        )
          return null;
        const r = s.relay,
          t = s.terminal;
        if (
          !r ||
          r.x !== (mapped(s) ? 1880 : highlands(s) ? 2100 : 1320) ||
          r.y !==
            (mapped(s)
              ? 1640
              : highlands(s)
                ? 2055
                : expedition(s)
                  ? 1370
                  : 810) ||
          !num(r.charge, 0, 1) ||
          r.online !== (s.phase === 3) ||
          !num(r.stability, 0, 1) ||
          !num(r.started, 0, s.t) ||
          !t ||
          t.x !==
            (mapped(s)
              ? 2800
              : highlands(s)
                ? 3300
                : expedition(s)
                  ? 2120
                  : 1780) ||
          (mapped(s)
            ? !Districts.terminals.some((p) => p.x === t.x && p.y === t.y)
            : t.y !== (highlands(s) ? 2295 : expedition(s) ? 1530 : 390)) ||
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
              !(
                combat(s) ? ["shell", "bolt", "missile"] : ["shell", "bolt"]
              ).includes(b.kind) ||
              (b.kind === "missile" &&
                (!int(b.lockId, 1, s.seq) ||
                  typeof b.guided !== "boolean" ||
                  b.radius !== undefined ||
                  b.team !== 1 ||
                  !s.units.some(
                    (u) => u.id === b.owner && u.kind === "rocket",
                  ))) ||
              (b.radius !== undefined &&
                (!combat(s) ||
                  b.radius !== 78 ||
                  b.kind !== "shell" ||
                  b.team !== 1 ||
                  !s.units.some(
                    (u) =>
                      u.id === b.owner &&
                      ["mortar", "bastion", "citadel"].includes(u.kind),
                  ))) ||
              (!highlands(s) &&
                ["z0", "z1", "duration"].some((k) => b[k] !== undefined)) ||
              (highlands(s) &&
                (!["z0", "z1", "duration"].every((k) =>
                  Number.isFinite(b[k]),
                ) ||
                  !num(b.z0, -48, 240) ||
                  !num(b.z1, -48, 200) ||
                  !num(b.duration, 0.01, 10))) ||
              ![0, 1].includes(b.team) ||
              b.map !== world.id ||
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
              (expedition(s)
                ? s.units.find((u) =>
                    i < 2
                      ? u.kind === "bastion" && u.sector === FORTS[i].sector
                      : u.kind === "citadel",
                  )
                : s.units.find(
                    (u) => u.kind === ["jammer", "turret", "citadel"][i],
                  )
              ).id ||
            !int(
              camp.reserve,
              0,
              mapped(s) ? Districts.bases[i].reserve : config.reserve,
            ) ||
            !num(
              camp.cooldown,
              0,
              Math.max(
                200,
                config.firstRaid + 2 * config.stagger,
                config.scoutRest || 0,
              ),
            ) ||
            !num(camp.warning, 0, 9) ||
            !int(camp.waves, 0, config.reserve) ||
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
                ["base", "outpost", "barracks", "foundry", "arsenal", "bunker", "logistics"].includes(
                  u.kind,
                ),
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
      logistics, workerCapacity, miningCapacity, mineWorkers, activeCount, objectLimit, compact, supplyBlocked,
      workers,
      queued,
      nodes,
      mineFor,
      usedSlots,
      ITEMS,
      items,
      rules,
      extended,
      expedition,
      combat,
      pads,
      buildings,
      caches,
      FORTS,
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
