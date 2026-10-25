/* Simulation is independent of rendering, audio and frame rate. Coordinates are world pixels. */
(function (root) {
  "use strict";
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
    turret: { hp: 200, r: 25, speed: 0, range: 400, damage: 19, rate: 2.1 },
    jammer: { hp: 340, r: 32, speed: 0, range: 0, damage: 0, rate: 0 },
    citadel: { hp: 900, r: 48, speed: 0, range: 520, damage: 21, rate: 2.5 },
    base: { hp: 700, r: 42, speed: 0, range: 0, damage: 0, rate: 0 },
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function free(x, y, r = 14) {
    return (
      x >= r + 24 &&
      x <= W - r - 24 &&
      y >= r + 24 &&
      y <= H - r - 24 &&
      !walls.some(
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
  function clear(a, b, r = 0) {
    return !walls.some((w) => segmentRect(a.x, a.y, b.x, b.y, w, r) !== null);
  }
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
      flash: 0,
      group,
      path: [],
      order: null,
      target: null,
      think: 0,
    };
    s.units.push(u);
    return u;
  }
  function make() {
    const s = {
      version: 1,
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
    return s;
  }
  const hero = (s) => s.units.find((u) => u.id === s.heroId);
  const living = (s, kind) => s.units.find((u) => u.kind === kind && u.hp > 0);
  function pathTo(from, to, r = 14) {
    const cell = 40,
      cols = W / cell,
      rows = H / cell,
      start = Math.floor(from.y / cell) * cols + Math.floor(from.x / cell),
      end =
        Math.floor(clamp(to.y, 25, H - 25) / cell) * cols +
        Math.floor(clamp(to.x, 25, W - 25) / cell);
    const queue = [start],
      prev = new Int32Array(cols * rows).fill(-2);
    prev[start] = -1;
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
      if (n === end) break;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const xx = x + dx,
          yy = y + dy,
          k = yy * cols + xx;
        if (
          xx < 0 ||
          xx >= cols ||
          yy < 0 ||
          yy >= rows ||
          prev[k] !== -2 ||
          !free(xx * cell + 20, yy * cell + 20, r)
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
    if (free(to.x, to.y, r) && best === end) route.push({ x: to.x, y: to.y });
    return route;
  }
  function order(s, group, x, y) {
    if (
      s.status !== "playing" ||
      ![1, 2].includes(group) ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    )
      return false;
    const members = s.units.filter(
      (u) => u.team === 0 && u.group === group && u.hp > 0,
    );
    members.forEach((u, i) => {
      const target = {
        x: clamp(x + (i % 2) * 30 - 15, 30, W - 30),
        y: clamp(y + Math.floor(i / 2) * 30 - 15, 30, H - 30),
      };
      u.order = target;
      u.path = pathTo(u, target, C[u.kind].r);
    });
    emit(s, "order", x, y);
    return members.length > 0;
  }
  function move(u, dx, dy) {
    const r = C[u.kind].r,
      steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8));
    for (let i = 0; i < steps; i++) {
      if (free(u.x + dx / steps, u.y, r)) u.x += dx / steps;
      if (free(u.x, u.y + dy / steps, r)) u.y += dy / steps;
    }
  }
  function follow(u, dt) {
    while (u.path.length && dist(u, u.path[0]) < 9) u.path.shift();
    if (!u.path.length) return;
    const p = u.path[0],
      a = Math.atan2(p.y - u.y, p.x - u.x),
      speed = C[u.kind].speed;
    move(u, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt);
    u.angle = a;
  }
  function shoot(s, u, target) {
    const def = C[u.kind],
      a = Math.atan2(target.y - u.y, target.x - u.x);
    u.angle = a;
    u.cool = def.rate;
    u.flash = 0.1;
    emit(s, u.kind === "artillery" ? "mortar" : "shot", u.x, u.y, {
      team: u.team,
      kind: u.kind,
    });
    if (u.kind === "runner") {
      hurt(s, target, def.damage, u);
      return;
    }
    const r = def.r + 9,
      speed = u.kind === "artillery" ? 360 : u.team ? 390 : 800;
    s.bullets.push({
      x: u.x + Math.cos(a) * r,
      y: u.y + Math.sin(a) * r,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: def.range / speed,
      team: u.team,
      owner: u.id,
      damage: def.damage,
      kind: u.kind === "artillery" ? "shell" : "bolt",
      tx: target.x,
      ty: target.y,
      age: 0,
    });
  }
  function hurt(s, u, damage, attacker) {
    if (u.hp <= 0) return;
    if (u.kind === "citadel" && !s.relay.online) {
      emit(s, "shield", u.x, u.y);
      return;
    }
    if (u.kind === "citadel" && attacker.kind !== "shell") damage *= 0.28;
    u.hp -= damage;
    u.hit = 0.14;
    if (u.kind === "hero") {
      s.damageTaken += damage;
      emit(s, "hurt", u.x, u.y);
    } else emit(s, "hit", u.x, u.y, { team: u.team });
    if (u.hp <= 0) {
      u.hp = 0;
      s.kills += u.team === 1 ? 1 : 0;
      emit(s, "destroy", u.x, u.y, { kind: u.kind, team: u.team });
    }
  }
  function blast(s, b) {
    emit(s, "blast", b.x, b.y);
    for (const u of s.units)
      if (u.hp > 0 && u.team !== b.team && dist(u, b) < 70 && clear(b, u))
        hurt(s, u, b.damage * (1 - dist(u, b) / 100), b);
  }
  function step(s, input = {}, dt = DT) {
    if (s.status !== "playing") return s;
    if (dt !== DT) throw Error("Simulation requires the fixed step");
    s.events = [];
    s.t += dt;
    const h = hero(s);
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
      h.angle = Math.atan2(input.aim.y - h.y, input.aim.x - h.x);
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
    for (const u of s.units) {
      if (u.hp <= 0) continue;
      u.cool = Math.max(0, u.cool - dt);
      u.hit = Math.max(0, u.hit - dt);
      u.flash = Math.max(0, u.flash - dt);
      if (u.kind === "hero") {
        if (input.fire && u.cool === 0 && s.reload === 0 && s.ammo > 0) {
          shoot(s, u, {
            x: u.x + Math.cos(u.angle) * 600,
            y: u.y + Math.sin(u.angle) * 600,
          });
          s.ammo--;
          s.shots++;
          if (s.ammo === 0) s.reload = 1.1;
        }
        continue;
      }
      if (!C[u.kind].range) continue;
      const opponents = s.units.filter(
        (v) =>
          v.team !== u.team &&
          v.hp > 0 &&
          !(v.kind === "citadel" && !s.relay.online),
      );
      let target = opponents
        .filter((v) => dist(u, v) < C[u.kind].range && clear(u, v))
        .sort((a, b) => dist(u, a) - dist(u, b))[0];
      if (u.team === 0) {
        if (u.path.length) follow(u, dt);
        if (target && u.cool === 0) shoot(s, u, target);
      } else {
        u.think -= dt;
        if (!target && C[u.kind].speed && u.think <= 0) {
          u.think = 1.5;
          const prey = opponents
            .filter((v) => v.kind !== "base" || dist(u, v) < 400)
            .sort((a, b) => dist(u, a) - dist(u, b))[0];
          if (prey && dist(u, prey) < 450)
            u.path = pathTo(u, prey, C[u.kind].r);
        }
        if (target) {
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
                clear(u, aim) &&
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
      const next = { x: b.x + b.vx * dt, y: b.y + b.vy * dt };
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
      for (const wall of walls) {
        const t = segmentRect(b.x, b.y, next.x, next.y, wall, 2);
        if (t !== null && t <= first) {
          first = t;
          hit = "wall";
        }
      }
      for (const u of s.units) {
        if (u.hp <= 0 || u.team === b.team) continue;
        if (u.kind === "hero" && s.dashT > 0) continue;
        const t = segmentCircle(b, next, u, C[u.kind].r + 2);
        if (t !== null && t < first) {
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
    if (!living(s, "jammer") && s.phase === 0) {
      s.phase = 1;
      s.checkpoint = 1;
      emit(s, "objective", s.relay.x, s.relay.y);
    }
    if (h.hp > 0 && s.phase === 1 && dist(h, s.relay) < 75 && input.interact) {
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
        unit(s, "artillery", 0, 780, 530, 2);
        emit(s, "online", s.relay.x, s.relay.y);
      }
    }

    if (h.hp <= 0 || !living(s, "base")) {
      s.status = "lost";
      emit(s, "end", h.x, h.y);
    } else if (!living(s, "citadel")) {
      s.status = "won";
      emit(s, "end", 1250, 485);
    }
    return s;
  }
  function snapshot(s) {
    const out = JSON.parse(JSON.stringify(s));
    out.events = [];
    return out;
  }
  function restore(value) {
    try {
      const s = JSON.parse(JSON.stringify(value));
      if (
        !s ||
        s.version !== 1 ||
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
          !C[u.kind] ||
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
            (["hero", "rifle", "artillery", "base"].includes(u.kind) ? 0 : 1) ||
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
      s.events = [];
      return s;
    } catch (_) {
      return null;
    }
  }
  const API = {
    W,
    H,
    DT,
    C,
    walls,
    make,
    step,
    hero,
    living,
    order,
    pathTo,
    free,
    clear,
    dist,
    clamp,
    snapshot,
    restore,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SignalEngine = API;
})(typeof globalThis !== "undefined" ? globalThis : window);
