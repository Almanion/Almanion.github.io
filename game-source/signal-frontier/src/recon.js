/* Knowledge is separate from the authoritative world. No canvas or audio state is saved. */
(function (root) {
  "use strict";
  const CELL = 40,
    POSTS = Object.freeze([
      Object.freeze({ id: "north", x: 1050, y: 300 }),
      Object.freeze({ id: "crossing", x: 900, y: 1210 }),
      Object.freeze({ id: "south", x: 1160, y: 1920 }),
    ]);
  const enabled = (s) => ["frontier-6", "frontier-7"].includes(s?.campaign?.id);
  function create(E) {
    const caches = new WeakMap();
    const size = (s) => {
      const w = E.map(s);
      return {
        cols: w.W / CELL,
        rows: w.H / CELL,
        count: (w.W * w.H) / (CELL * CELL),
      };
    };
    const encode = (bits) => {
      let code = "";
      for (let i = 0; i < bits.length; i += 4)
        code += (
          bits[i] |
          (bits[i + 1] << 1) |
          (bits[i + 2] << 2) |
          (bits[i + 3] << 3)
        ).toString(16);
      return code;
    };
    const decode = (code) => {
      const bits = new Uint8Array(code.length * 4);
      for (let i = 0; i < code.length; i++) {
        const n = parseInt(code[i], 16);
        for (let k = 0; k < 4; k++) bits[i * 4 + k] = (n >> k) & 1;
      }
      return bits;
    };
    const VISION = Object.freeze({
      hero: 600,
      scout: 720,
      rifle: 440,
      artillery: 480,
      drone: 180,
      base: 380,
      outpost: 380,
      barracks: 280,
      foundry: 280,
    });
    function radius(u) {
      return u.build > 0 ? 120 : u.team ? 610 : VISION[u.kind] || 0;
    }
    function posts(s) {
      return (E.map(s).posts || POSTS).map((p) => {
        const owners = [0, 1].map((team) =>
          s.units.some(
            (u) =>
              u.team === team &&
              u.hp > 0 &&
              [
                "hero",
                "rifle",
                "scout",
                "artillery",
                "runner",
                "sentinel",
                "warden",
                "rocket",
                "flamer",
                "bomber",
                "tank",
                "mortar",
              ].includes(u.kind) &&
              E.dist(u, p) <= 72 &&
              E.clear(u, { ...p, map: E.map(s).id }),
          ),
        );
        return {
          ...p,
          side: owners[0] ? (owners[1] ? 2 : 0) : owners[1] ? 1 : -1,
          owners,
        };
      });
    }
    function observers(s, team) {
      const units = s.units
        .filter((u) => u.team === team && u.hp > 0 && radius(u) > 0)
        .map((u) => ({
          id: u.id,
          x: u.x,
          y: u.y,
          radius: radius(u),
          map: E.map(s).id,
        }));
      for (const p of posts(s))
        if (p.owners[team])
          units.push({
            id: "post-" + p.id,
            x: p.x,
            y: p.y,
            radius: 780,
            map: E.map(s).id,
          });
      return units;
    }
    const signature = (list) =>
      list.map((u) => u.id + ":" + u.radius).join(",");
    function cache(s) {
      let c = caches.get(s);
      if (!c) {
        c = {
          visible: [null, null],
          explored: [null, null],
          codes: {},
          paths: new Map(),
        };
        caches.set(s, c);
      }
      for (const key of ["visible", "explored"])
        for (let t = 0; t < 2; t++)
          if (c.codes[key + t] !== s.recon[key][t]) {
            c.codes[key + t] = s.recon[key][t];
            c[key][t] = decode(s.recon[key][t]);
          }
      return c;
    }
    function index(s, p) {
      const { cols, rows } = size(s),
        x = Math.floor(p.x / CELL),
        y = Math.floor(p.y / CELL);
      return x >= 0 && y >= 0 && x < cols && y < rows ? y * cols + x : -1;
    }
    function sees(list, p) {
      return list.some(
        (u) => Math.hypot(u.x - p.x, u.y - p.y) <= u.radius && E.clear(u, p),
      );
    }
    function visible(s, team, p) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
      if (!enabled(s)) return true;
      if (s.fog) {
        const k = index(s, p);
        return k >= 0 && !!s.fog.visible[k] && sees(s.fog.observers, p);
      }
      const k = index(s, p);
      return (
        k >= 0 &&
        !!cache(s).visible[team][k] &&
        (s.units.some(
          (u) =>
            u.team === team &&
            u.hp > 0 &&
            E.dist(u, p) <= radius(u) &&
            E.clear(u, p),
        ) ||
          posts(s).some(
            (u) =>
              u.owners[team] &&
              E.dist(u, p) <= 780 &&
              E.clear({ ...u, map: E.map(s).id }, p),
          ))
      );
    }
    function explored(s, team, p) {
      if (!p) return false;
      if (!enabled(s)) return true;
      const k = index(s, p);
      return k >= 0 && !!(s.fog ? s.fog.explored : cache(s).explored[team])[k];
    }
    const teamKey = (u) => u.id + ":" + u.radius;
    function raster(s, list) {
      const { cols, rows, count } = size(s),
        mask = new Uint8Array(count);
      for (const u of list) {
        const key = teamKey(u),
          stored = cache(s).paths.get(key);
        if (
          stored &&
          stored.x === u.x &&
          stored.y === u.y &&
          stored.radius === u.radius
        ) {
          for (let i = 0; i < stored.runs.length; i += 2)
            mask.fill(1, stored.runs[i], stored.runs[i + 1]);
          continue;
        }
        const runs = [];
        const polygon = E.visionArea(s, u, u.radius).points;
        const first = Math.max(0, Math.floor((u.y - u.radius) / CELL)),
          last = Math.min(rows - 1, Math.floor((u.y + u.radius) / CELL));
        for (let y = first; y <= last; y++) {
          const yy = y * CELL + CELL / 2,
            edges = [];
          for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const a = polygon[i],
              b = polygon[j];
            if (a.y > yy !== b.y > yy)
              edges.push(a.x + ((yy - a.y) * (b.x - a.x)) / (b.y - a.y));
          }
          edges.sort((a, b) => a - b);
          for (let i = 0; i + 1 < edges.length; i += 2) {
            const left = Math.max(0, Math.ceil((edges[i] - CELL / 2) / CELL)),
              right = Math.min(
                cols - 1,
                Math.floor((edges[i + 1] - CELL / 2) / CELL),
              );
            if (right >= left) runs.push(y * cols + left, y * cols + right + 1);
          }
        }
        const k = index(s, u);
        if (k >= 0) runs.push(k, k + 1);
        cache(s).paths.set(key, {
          x: u.x,
          y: u.y,
          radius: u.radius,
          runs,
        });
        for (let i = 0; i < runs.length; i += 2)
          mask.fill(1, runs[i], runs[i + 1]);
      }
      return mask;
    }
    function records(s) {
      const units = s.units
        .filter((u) => E.C[u.kind].speed === 0)
        .map((u) => ({
          key: "u:" + u.id,
          type: "unit",
          id: u.id,
          kind: u.kind,
          team: u.team,
          x: u.x,
          y: u.y,
          hp: u.hp,
          angle: u.angle,
          build: u.build || 0,
          defense: !!u.defense,
          sector: u.sector || null,
          shielded: u.kind === "citadel" && E.shielded(s),
        }));
      return [
        ...units,
        ...s.campaign.mines.map((m) => ({
          key: "mine:" + m.id,
          type: "mine",
          ...m,
        })),
        ...s.caches.map((p) => ({ key: "cache:" + p.id, type: "cache", ...p })),
        ...E.pads(s).map((p) => ({
          key: "pad:" + p.id,
          type: "pad",
          id: p.id,
          x: p.x,
          y: p.y,
        })),
        ...posts(s).map((p) => ({
          key: "post:" + p.id,
          type: "post",
          id: p.id,
          x: p.x,
          y: p.y,
          side: p.side,
        })),
        {
          key: "relay",
          type: "relay",
          ...s.relay,
          progress: s.relay.online
            ? 1
            : s.phase === 2
              ? s.relay.stability
              : s.relay.charge,
        },
        { key: "terminal", type: "terminal", ...s.terminal },
      ];
    }
    function init(s) {
      if (!enabled(s)) return;
      const blank = "0".repeat(size(s).count / 4);
      s.recon = {
        version: 1,
        cell: CELL,
        explored: [blank, blank],
        visible: [blank, blank],
        sources: ["", ""],
        memory: [[], []],
      };
      update(s, true);
    }
    function update(s, force = false) {
      if (!enabled(s)) return;
      const active = new Set(
        [0, 1].flatMap((t) => observers(s, t)).map(teamKey),
      );
      for (const key of cache(s).paths.keys())
        if (!active.has(key)) cache(s).paths.delete(key);
      const current = records(s),
        frame = Math.round(s.t / E.DT);
      for (let team = 0; team < 2; team++) {
        const list = observers(s, team),
          key = signature(list);
        if (force || frame % 3 === 0 || s.recon.sources[team] !== key) {
          const mask = raster(s, list),
            known = cache(s).explored[team];
          let changed = false;
          for (let i = 0; i < mask.length; i++)
            if (mask[i] && !known[i]) {
              known[i] = 1;
              changed = true;
            }
          s.recon.visible[team] = encode(mask);
          s.recon.sources[team] = key;
          if (changed) s.recon.explored[team] = encode(known);
        }
        const mask = cache(s).visible[team],
          known = new Map(s.recon.memory[team].map((p) => [p.key, p])),
          present = new Set(current.map((p) => p.key));
        const can = (p) => mask[index(s, p)] && sees(list, p);
        for (const [key, p] of known)
          if (can(p) && !present.has(key)) known.delete(key);
        for (const p of current)
          if (can(p) || (p.type === "unit" && p.team === team))
            known.set(p.key, { ...p, seenAt: s.t });
        s.recon.memory[team] = [...known.values()];
      }
    }
    function events(s, team = 0, list = s.events) {
      if (!enabled(s)) return list;
      const global = new Set([
        "order",
        "upgrade",
        "post-ready",
        "build",
        "collect",
        "salvage",
        "reload",
        "end",
        "online",
        "objective",
        "breach",
      ]);
      return list.flatMap((e) =>
        visible(s, team, { x: e.x, y: e.y, map: E.map(s).id })
          ? [e]
          : global.has(e.type) && e.team !== 1
            ? [{ ...e, radio: true }]
            : [],
      );
    }
    function remembered(p, s) {
      return {
        ...p,
        map: E.map(s).id,
        group: 0,
        flash: 0,
        hit: 0,
        wind: 0,
        cool: 0,
        think: 0,
        repair: 0,
        target: null,
        order: null,
        path: [],
        jobs: [],
      };
    }
    function observe(s, team = 0) {
      if (!enabled(s)) return s;
      const mem = s.recon.memory[team],
        c = cache(s),
        list = observers(s, team),
        can = (p) => !!p && c.visible[team][index(s, p)] && sees(list, p),
        get = (type) => mem.filter((p) => p.type === type),
        neutral = (live) => (can(live) ? live : { unknown: true });
      const fog = {
        team,
        cell: CELL,
        ...size(s),
        visible: c.visible[team],
        explored: c.explored[team],
        visibleCode: s.recon.visible[team],
        exploredCode: s.recon.explored[team],
        observers: list,
      };
      const memory = {
        ...s,
        recon: undefined,
        units: get("unit").map((p) => remembered(p, s)),
        bullets: [],
        events: [],
        caches: get("cache"),
        watch: get("post"),
        relay: get("relay")[0] || neutral({}),
        terminal: get("terminal")[0] || neutral({}),
        campaign: { ...s.campaign, mines: get("mine"), camps: [], intel: [] },
        fog: { ...fog },
      };
      fog.memory = memory;
      const task = E.objective(s),
        target = task.target,
        rememberedTarget =
          target &&
          mem.find((p) =>
            p.type === "unit"
              ? p.id === target.id
              : p.x === target.x && p.y === target.y,
          );
      const observationTask = {
        ...task,
        target:
          target && can(target)
            ? { x: target.x, y: target.y }
            : rememberedTarget
              ? { x: rememberedTarget.x, y: rememberedTarget.y }
              : null,
      };
      return {
        ...s,
        observationTask,
        recon: undefined,
        units: s.units
          .filter(
            (u) =>
              (u.team === team && (u.hp > 0 || u.kind === "hero")) || can(u),
          )
          .map((u) =>
            u.kind === "citadel" ? { ...u, shielded: E.shielded(s) } : u,
          ),
        bullets: s.bullets.filter(can),
        events: events(s, team),
        caches: s.caches.filter(can),
        watch: posts(s)
          .filter(can)
          .map(({ owners, ...p }) => p),
        relay: neutral(s.relay),
        terminal: neutral(s.terminal),
        campaign: {
          ...s.campaign,
          mines: s.campaign.mines.filter(can),
          camps: s.campaign.camps.filter((p) => {
            const u = s.units.find((u) => u.id === p.source);
            return u && can(u);
          }),
          intel: [],
        },
        fog,
      };
    }
    function validate(s) {
      if (!enabled(s)) return s.recon === undefined;
      const f = s.recon,
        { count } = size(s),
        length = count / 4,
        num = (v, a, b) => Number.isFinite(v) && v >= a && v <= b,
        point = (p) => num(p?.x, 0, E.map(s).W) && num(p?.y, 0, E.map(s).H);
      if (
        !f ||
        f.version !== 1 ||
        f.cell !== CELL ||
        !Array.isArray(f.memory) ||
        f.memory.length !== 2
      )
        return false;
      for (const key of ["visible", "explored", "sources"])
        if (!Array.isArray(f[key]) || f[key].length !== 2) return false;
      const templates = new Map(
        records(s)
          .filter((p) => p.type !== "unit")
          .map((p) => [p.key, p]),
      );
      for (let t = 0; t < 2; t++) {
        if (
          ![f.visible[t], f.explored[t]].every(
            (code) =>
              typeof code === "string" &&
              code.length === length &&
              /^[0-9a-f]+$/.test(code),
          ) ||
          f.sources[t] !== signature(observers(s, t)) ||
          !Array.isArray(f.memory[t]) ||
          f.memory[t].length > 128
        )
          return false;
        const v = decode(f.visible[t]),
          known = decode(f.explored[t]),
          keys = new Set();
        if (v.some((x, i) => x && !known[i])) return false;
        for (const p of f.memory[t]) {
          if (
            !point(p) ||
            typeof p.key !== "string" ||
            keys.has(p.key) ||
            !num(p.seenAt, 0, s.t) ||
            !known[index(s, p)]
          )
            return false;
          keys.add(p.key);
          if (p.type === "unit") {
            const def = E.C[p.kind];
            if (
              !def ||
              def.speed !== 0 ||
              !Number.isInteger(p.id) ||
              p.id < 1 ||
              p.id > s.seq ||
              p.key !== "u:" + p.id ||
              ![0, 1].includes(p.team) ||
              !num(p.hp, 0, def.hp) ||
              !num(p.angle, -100, 100) ||
              !num(p.build, 0, 60) ||
              typeof p.defense !== "boolean" ||
              typeof p.shielded !== "boolean" ||
              ![null, "north", "south"].includes(p.sector)
            )
              return false;
          } else {
            const template = templates.get(p.key);
            if (
              !template ||
              p.type !== template.type ||
              p.x !== template.x ||
              p.y !== template.y ||
              p.id !== template.id
            )
              return false;
            if (
              p.type === "mine" &&
              (!Number.isInteger(p.remaining) ||
                !num(p.remaining, 0, template.stock) ||
                p.stock !== template.stock)
            )
              return false;
            if (
              p.type === "cache" &&
              (typeof p.taken !== "boolean" || !num(p.charge, 0, 1))
            )
              return false;
            if (p.type === "post" && ![-1, 0, 1, 2].includes(p.side))
              return false;
            if (
              p.type === "relay" &&
              (!num(p.charge, 0, 1) ||
                !num(p.progress, 0, 1) ||
                typeof p.online !== "boolean" ||
                !num(p.stability, 0, 1) ||
                !num(p.started, 0, s.t))
            )
              return false;
            if (
              p.type === "terminal" &&
              (!num(p.charge, 0, 1) ||
                !num(p.window, 0, 7) ||
                typeof p.alarm !== "boolean" ||
                typeof p.channeling !== "boolean")
            )
              return false;
          }
        }
      }
      return true;
    }
    return {
      enabled,
      init,
      update,
      visible,
      explored,
      events,
      observe,
      validate,
      posts,
      radius,
    };
  }
  const api = { create, CELL, POSTS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SignalRecon = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
