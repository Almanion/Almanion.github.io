/* The second resource belongs to new deployments. Old operations keep their ledger. */
(function (root) {
  "use strict";
  const enabled = (s) => s?.campaign?.resources === 2;
  const craters = Object.freeze([
    { id: "M01", x: 1080, y: 2480, stock: 600 },
    { id: "M02", x: 1880, y: 1360, stock: 800 },
    { id: "M03", x: 1320, y: 3480, stock: 800 },
    { id: "M04", x: 2920, y: 720, stock: 600 },
  ].map((p) => Object.freeze({ ...p, resource: "matter" })));
  const prices = Object.freeze({ command: 80, weapons: 30, armor: 30, hack: 60, artillery: 40 });
  const configs = new WeakMap();
  function rules(base) {
    if (!configs.has(base)) configs.set(base, Object.freeze({
      ...base,
      version: base.version === 12 ? 14 : 13,
      ledgerLimit: 1000000000,
      mines: Object.freeze([...base.mines, ...craters]),
      items: Object.freeze({
        ...Object.fromEntries(Object.entries(base.items).map(([key, value]) =>
          [key, Object.freeze({ ...value, matter: prices[key] || 0 })])),
        condenser: Object.freeze({ cost: 180, matter: 0, time: 40, pop: 0, label: "Конденсатор" }),
        medic: Object.freeze({ ...base.items.rifle, matter: 0, label: "Медик" }),
      }),
    }));
    return configs.get(base);
  }
  function initialize(s, addWorker) {
    s.campaign.resources = 2;
    s.campaign.matter = { spent: 0, recovered: 0, deposited: 0, lostCargo: 0 };
    s.campaign.mines.push(...craters.map((p) => ({ ...p, remaining: p.stock })));
    s.economy.matter = 0;
    s.version = s.campaign.id === "frontier-10" ? 14 : 13;
    for (const u of s.units) if (u.kind === "drone") u.cargoType = "alloy";
    const base = s.units.find((u) => u.kind === "base");
    for (let i = 0; i < 2; i++) addWorker(s, base);
    return s;
  }
  const refundRate = (s, job) => enabled(s) && job.remaining === job.duration ? 1 : .75;
  const refund = (s, job) => ({
    alloy: Math.floor(job.cost * refundRate(s, job)),
    matter: Math.floor((job.matter || 0) * refundRate(s, job)),
  });
  const buildRefund = (s, u, item, maxHp) => Math.floor(u.construction.paid *
    (enabled(s) && u.build === item.time && u.hp >= maxHp * .25 ? 1 : .75));
  const price = (item) => item.cost + " сплава" + (item.matter ? " · " + item.matter + " материи" : "");
  const workerType = Object.freeze({ kind: "drone" });
  function knownThreats(s, E) {
    const result = [];
    for (const u of s.units) if (u.team && u.hp > 0) {
      const stats = E.stats(s, u, workerType);
      if (stats.damage > 0 && E.visible(s, 0, u)) result.push({ u, range: Math.max(170, stats.range + 80) });
    }
    return result;
  }
  function threat(s, worker, E, candidates = knownThreats(s, E)) {
    let nearest = null, distance = Infinity;
    for (const { u, range } of candidates) {
      const d = E.dist(u, worker);
      if (d < distance && E.rangeDistance(u, worker) < range && E.fireClear(u, worker)) { nearest = u; distance = d; }
    }
    return nearest;
  }
  function shelter(s, worker, node, enemy, E) {
    const nearby = node.construction ? [node] : s.units.filter((u) => !u.team && u.hp > 0 && u.construction && E.dist(worker, u) < 380),
      covers = nearby.length ? nearby : [node], gap = E.C.drone.r + 14, slot = .25 + (worker.id % 3) * .25;
    let best = null, distance = Infinity;
    for (const cover of covers) {
      const b = E.construction.rect(cover), dx = cover.x - enemy.x, dy = cover.y - enemy.y;
      let x, y;
      if (b) {
        x = Math.abs(dx) > Math.abs(dy) ? dx >= 0 ? b.x + b.w + gap : b.x - gap : b.x + b.w * slot;
        y = Math.abs(dx) > Math.abs(dy) ? b.y + b.h * slot : dy >= 0 ? b.y + b.h + gap : b.y - gap;
      } else {
        const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4, r = E.C[cover.kind].r + gap;
        x = cover.x + Math.cos(a) * r; y = cover.y + Math.sin(a) * r;
      }
      const d = Math.hypot(worker.x - x, worker.y - y);
      if (d < distance && E.free(x, y, E.C.drone.r, E.navigation(s))) { best = { x, y, node: node.id }; distance = d; }
    }
    const old = worker.miningShelter;
    return best && old?.x === best.x && old?.y === best.y && old?.node === best.node ? old : best;
  }
  function staffOffer(s, E, id, D = E.development) {
    const node = s.units.find((u) => u.id === Number(id) && u.kind === "condenser" && u.hp > 0 && !u.build),
      mine = node && s.campaign.mines.find((p) => p.id === node.site),
      fail = (reason) => ({ allowed: false, cost: 0, reason });
    if (!enabled(s) || s.status !== "playing" || !node) return fail("post");
    if (!mine.remaining) return fail("empty-resource");
    const assigned = D.mineWorkers(s, mine),
      workers = s.units.filter((u) => u.kind === "drone" && u.hp > 0 && !u.buildingId && !u.workerTask && !u.eastRepair &&
        !s.campaign.mines.some((p) => p.resource === "matter" && p.id === (u.mineId || D.mineFor(s, s.units.find((n) => n.id === u.node))?.id)))
        .sort((a, b) => E.dist(a, node) - E.dist(b, node) || a.id - b.id).slice(0, 2 - assigned.length);
    return assigned.length >= 2 ? fail("staff-full") : workers.length
      ? { allowed: true, cost: 0, workers: workers.map((u) => u.id), mineId: mine.id }
      : fail("builder");
  }
  function validate(s, E) {
    if (!enabled(s)) return s.campaign.resources === undefined && s.campaign.matter === undefined &&
      s.economy.matter === undefined && !s.units.some((u) => u.kind === "condenser" || u.cargoType !== undefined || u.miningShelter !== undefined);
    const c = s.campaign, m = c.matter, limit = 1000000000;
    if (!["frontier-9", "frontier-10"].includes(c.id) || c.logistics !== 1 || !m ||
        ![s.economy.matter, ...["spent", "recovered", "deposited", "lostCargo"].map((k) => m[k])]
          .every((n) => Number.isSafeInteger(n) && n >= 0 && n <= limit) || m.recovered > m.spent) return false;
    for (const u of s.units) if (u.miningShelter !== undefined) {
      const p = u.miningShelter;
      if (u.kind !== "drone" || !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
          p.x < 0 || p.y < 0 || p.x > E.map(s).W || p.y > E.map(s).H ||
          !Number.isInteger(p.node) || !s.units.some((n) => n.id === p.node && ["base", "outpost", "condenser"].includes(n.kind))) return false;
    }
    const cargo = s.units.filter((u) => u.kind === "drone" && u.cargoType === "matter").reduce((n, u) => n + u.cargo, 0),
      extracted = c.mines.filter((p) => p.resource === "matter").reduce((n, p) => n + p.stock - p.remaining, 0);
    return extracted === m.deposited + m.lostCargo + cargo &&
      s.economy.matter === m.deposited + m.recovered - m.spent;
  }
  const api = { enabled, craters, prices, rules, initialize, refund, refundRate, buildRefund, price, knownThreats, threat, shelter, staffOffer, validate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SignalMatter = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
