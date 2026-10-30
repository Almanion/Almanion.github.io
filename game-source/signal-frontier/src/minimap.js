/* A north-up, read-only view of faction knowledge. Never inspect hidden actors. */
(function (root) {
  "use strict";
  const E =
    typeof module !== "undefined" && module.exports
      ? require("./engine.js")
      : root.SignalEngine;
  const SYMBOLS = Object.freeze({
    hero: { label: "Разведчик", color: "#d6fff0", path: "M0-6 5 5 0 2-5 5Z" },
    ally: {
      label: "Свои бойцы",
      color: "#91dbc0",
      path: "M3 0A3 3 0 1 1-3 0A3 3 0 1 1 3 0",
    },
    building: { label: "Свои здания", color: "#91dbc0", path: "M-4-4H4V4H-4Z" },
    enemy: {
      label: "Видимые враги",
      color: "#ff8277",
      path: "M0-4 4 0 0 4-4 0Z",
    },
    fortress: {
      label: "Укрепления врага",
      color: "#ff8277",
      path: "M-5 5V-4H-3V-1H-1V-4H1V-1H3V-4H5V5Z",
    },
    resource: {
      label: "Сплав и контейнеры",
      color: "#e6c77d",
      path: "M0-5 4-1 2 4H-2L-4-1Z",
    },
    objective: {
      label: "Известная цель",
      color: "#ffe4a1",
      path: "M-3 6V-6H4L2-3 4 0H-3",
      outline: true,
    },
    memory: {
      label: "Последнее наблюдение",
      color: "#91a09c",
      path: "M-5-4H5V4H-5Z",
      outline: true,
    },
    viewport: {
      label: "Область камеры",
      color: "#e4eee8",
      path: "M-6-4H6V4H-6Z",
      outline: true,
    },
  });
  function geometry(world, width, height, padding = 5) {
    const scale = Math.max(
      0.0001,
      Math.min(
        Math.max(1, width - padding * 2) / world.W,
        Math.max(1, height - padding * 2) / world.H,
      ),
    );
    return {
      x: (width - world.W * scale) / 2,
      y: (height - world.H * scale) / 2,
      scale,
      W: world.W,
      H: world.H,
      width,
      height,
    };
  }
  const project = (g, p) => ({
    x: g.x + p.x * g.scale,
    y: g.y + p.y * g.scale,
  });
  const unproject = (g, x, y) => ({
    x: E.clamp((x - g.x) / g.scale, 0, g.W),
    y: E.clamp((y - g.y) / g.scale, 0, g.H),
  });
  function collect(input, selection = []) {
    const s = E.fogged(input) && !input.fog ? E.observe(input) : input,
      known = s.fog?.memory,
      selected = new Set(selection),
      found = new Map(),
      world = E.map(s),
      current = new Set(s.units.map((u) => u.id));
    const add = (key, p, item) => {
      if (
        !p ||
        p.unknown ||
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.y < 0 ||
        p.x > world.W ||
        p.y > world.H
      )
        return;
      found.set(key, { key, x: p.x, y: p.y, ...item });
    };
    const unit = (u, memory) => {
      if (u.hp <= 0 || u.care?.inside || (memory && (!u.team || E.C[u.kind].speed))) return;
      const building = !E.C[u.kind].speed,
        hero = u.kind === "hero",
        worker = u.kind === "drone";
      add("unit:" + u.id, u, {
        symbol: hero
          ? "hero"
          : u.team
            ? building
              ? "fortress"
              : "enemy"
            : building
              ? "building"
              : "ally",
        unitId: memory ? null : u.id,
        kind: u.kind,
        team: u.team,
        angle: u.angle || 0,
        memory,
        selected: selected.has(u.id),
        scale: worker ? 0.55 : u.kind === "citadel" ? 1.2 : 1,
        priority: hero
          ? 10
          : selected.has(u.id)
            ? 9
            : building
              ? 5
              : worker
                ? 1
                : 6,
        label: hero
          ? "Разведчик"
          : u.team
            ? building
              ? "Укрепление врага"
              : "Враг"
            : building
              ? u.kind === "bunker" ? "Бункер" : "Своё здание"
              : worker
                ? "Дрон"
                : "Свой боец",
      });
    };
    for (const u of known?.units || []) if (!current.has(u.id)) unit(u, true);
    for (const u of s.units) unit(u, false);
    for (const [source, memory] of [
      [known, true],
      [s, false],
    ]) {
      if (!source) continue;
      for (const p of source.campaign?.mines || [])
        add("mine:" + p.id, p, {
          symbol: "resource",
          memory,
          empty: p.remaining === 0,
          priority: 2,
          label:
            p.remaining === 0
              ? "Месторождение исчерпано"
              : "Сплав: " + p.remaining,
        });
      for (const p of source.caches || []) {
        if (p.taken) {
          found.delete("cache:" + p.id);
          continue;
        }
        add("cache:" + p.id, p, {
          symbol: "resource",
          memory,
          scale: 0.75,
          priority: 2,
          label: "Контейнер со сплавом",
        });
      }
    }
    const task = s.observationTask || (!s.fog ? E.objective(s) : null);
    if (task?.target)
      add("objective", task.target, {
        symbol: "objective",
        priority: 8,
        label: "Цель операции",
      });
    return [...found.values()].sort((a, b) => a.priority - b.priority);
  }
  function legend() {
    return Object.entries(SYMBOLS)
      .map(
        ([id, item]) =>
          '<span><svg viewBox="-8 -8 16 16" aria-hidden="true" style="color:' +
          item.color +
          '">' +
          '<path d="' +
          item.path +
          '" fill="' +
          (item.outline ? "none" : "currentColor") +
          '" stroke="currentColor" stroke-width="1.2"' +
          (id === "memory" ? ' stroke-dasharray="2 2"' : "") +
          "/></svg>" +
          item.label +
          "</span>",
      )
      .join("");
  }
  class MiniMap {
    constructor(canvas) {
      this.canvas = canvas;
      this.c = canvas.getContext("2d");
      this.terrain = document.createElement("canvas");
      this.layer = document.createElement("canvas");
      this.background = document.createElement("canvas");
      this.mask = document.createElement("canvas");
      this.paths = new Map();
      this.stats = {
        paints: 0,
        terrainBuilds: 0,
        fogBuilds: 0,
        markerBuilds: 0,
      };
      this.reset();
    }
    reset() {
      this.markers = [];
      this.mapId = "";
      this.stamp = "";
      this.selection = "";
      this.fogKey = "";
      this.regions = {};
      this.cameraKey = "";
      this.lastMarkers = -Infinity;
      this.dirty = true;
    }
    invalidate() {
      this.dirty = true;
    }
    point(x, y) {
      return this.g ? unproject(this.g, x, y) : null;
    }
    screen(p) {
      return this.g ? project(this.g, p) : null;
    }
    pick(x, y, radius = 8) {
      if (!this.g) return null;
      let best = null,
        distance = radius;
      for (const item of this.markers) {
        if (!item.unitId || item.memory) continue;
        const p = project(this.g, item),
          d = Math.hypot(p.x - x, p.y - y);
        if (
          d < distance ||
          (d === distance && item.priority > best?.priority)
        ) {
          best = item;
          distance = d;
        }
      }
      return best;
    }
    paintTerrain(s) {
      const world = E.map(s),
        c = this.terrain.getContext("2d"),
        g = this.g,
        d = this.dpr;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.terrain.width, this.terrain.height);
      c.setTransform(g.scale * d, 0, 0, g.scale * d, g.x * d, g.y * d);
      c.fillStyle = "#294447";
      c.fillRect(0, 0, world.W, world.H);
      if (["highlands", "districts"].includes(world.id)) {
        for (let y = 0; y < world.H; y += 40)
          for (let x = 0; x < world.W; x += 40) {
            const level = E.terrain.level(x + 20, y + 20);
            c.fillStyle =
              level < 0
                ? "#050c10"
                : level >= 1.5
                  ? "#53665a"
                  : level >= 0.5
                    ? "#365653"
                    : "#294447";
            c.fillRect(x, y, 40, 40);
          }
      }
      c.fillStyle = "#819089";
      for (const wall of world.walls)
        c.fillRect(wall.x, wall.y, wall.w, wall.h);
      this.stats.terrainBuilds++;
    }
    paintFog(s, view) {
      const c = this.background.getContext("2d"),
        g = this.g,
        fog = s.fog;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.fillStyle = "#050c10";
      c.fillRect(0, 0, g.width, g.height);
      c.drawImage(this.terrain, 0, 0, g.width, g.height);
      if (fog && view?.fogPaths?.explored?.polygons) {
        c.fillStyle = "#050c10";
        c.fillRect(0, 0, g.width, g.height);
        for (const kind of ["explored", "visible"]) {
          const region = view.fogPaths[kind];
          let cached = this.regions[kind];
          if (cached?.code !== region.code) {
            const path = new Path2D();
            for (const polygon of region.polygons) {
              polygon.forEach(([x, y], i) =>
                i ? path.lineTo(x, y) : path.moveTo(x, y),
              );
              path.closePath();
            }
            cached = this.regions[kind] = { code: region.code, path };
          }
          c.save();
          c.translate(g.x, g.y);
          c.scale(g.scale, g.scale);
          c.clip(cached.path);
          c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
          c.drawImage(this.terrain, 0, 0, g.width, g.height);
          if (kind === "explored") {
            c.fillStyle = "#050c119b";
            c.fillRect(0, 0, g.width, g.height);
          }
          c.restore();
        }
      } else if (fog) {
        if (this.mask.width !== fog.cols || this.mask.height !== fog.rows) {
          this.mask.width = fog.cols;
          this.mask.height = fog.rows;
        }
        const m = this.mask.getContext("2d"),
          pixels = m.createImageData(fog.cols, fog.rows);
        for (let i = 0; i < fog.count; i++) {
          const k = i * 4;
          pixels.data[k] = 5;
          pixels.data[k + 1] = 12;
          pixels.data[k + 2] = 17;
          pixels.data[k + 3] = !fog.explored[i]
            ? 255
            : !fog.visible[i]
              ? 155
              : 0;
        }
        m.putImageData(pixels, 0, 0);
        c.imageSmoothingEnabled = false;
        c.drawImage(this.mask, g.x, g.y, g.W * g.scale, g.H * g.scale);
      }
      this.stats.fogBuilds++;
    }
    symbol(c, item) {
      const def = SYMBOLS[item.symbol],
        p = project(this.g, item);
      let path = this.paths.get(item.symbol);
      if (!path) {
        path = new Path2D(def.path);
        this.paths.set(item.symbol, path);
      }
      c.save();
      c.translate(p.x, p.y);
      if (item.symbol === "hero") c.rotate(item.angle + Math.PI / 2);
      const size = item.scale || 1;
      c.scale(size, size);
      c.lineJoin = "round";
      if (item.selected) {
        c.strokeStyle = "#e4fff2";
        c.lineWidth = 1.1;
        c.beginPath();
        c.arc(0, 0, 7, 0, Math.PI * 2);
        c.stroke();
      }
      c.globalAlpha = item.memory ? 0.72 : item.empty ? 0.55 : 1;
      c.strokeStyle =
        item.memory || item.empty
          ? "#a2aba0"
          : item.symbol === "hero"
            ? "#f0fff7"
            : "#061215";
      c.fillStyle = def.color;
      c.lineWidth = def.outline || item.memory || item.empty ? 1 : 1.3;
      if (item.memory) c.setLineDash([2, 2]);
      if (!def.outline && !item.memory && !item.empty) c.fill(path);
      if (def.outline) c.strokeStyle = def.color;
      c.stroke(path);
      c.restore();
    }
    draw(s, ui, view, now) {
      const width = this.canvas.clientWidth,
        height = this.canvas.clientHeight;
      if (width < 1 || height < 1) return false;
      const world = E.map(s),
        dpr = Math.min(3, Math.max(1, devicePixelRatio || 1)),
        resize =
          !this.g ||
          this.g.width !== width ||
          this.g.height !== height ||
          this.dpr !== dpr ||
          this.mapId !== world.id;
      if (resize) {
        this.g = geometry(world, width, height);
        this.dpr = dpr;
        this.mapId = world.id;
        for (const canvas of [
          this.canvas,
          this.terrain,
          this.layer,
          this.background,
        ]) {
          canvas.width = Math.round(width * dpr);
          canvas.height = Math.round(height * dpr);
        }
        this.paintTerrain(s);
        this.dirty = true;
      }
      const selection = (ui.selectionIds || []).join(","),
        stamp = [s.t, s.units.length, s.economy?.spent].join(":"),
        fogKey =
          (s.fog ? view.fogPaths?.visible?.code || s.fog.visibleCode : "") +
          "|" +
          (s.fog?.exploredCode || "");
      const refresh =
        this.dirty ||
        selection !== this.selection ||
        ((!ui.active || now - this.lastMarkers >= 100) &&
          (stamp !== this.stamp || fogKey !== this.fogKey));
      if (refresh) {
        this.markers = collect(s, ui.selectionIds);
        if (this.dirty || fogKey !== this.fogKey) this.paintFog(s, view);
        const c = this.layer.getContext("2d"),
          bins = new Set();
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.drawImage(this.background, 0, 0, width, height);
        for (const item of this.markers) {
          const p = project(this.g, item),
            key =
              Math.round(p.x / 3) +
              ":" +
              Math.round(p.y / 3) +
              ":" +
              item.symbol;
          if (item.symbol === "ally" && !item.selected && bins.has(key))
            continue;
          bins.add(key);
          this.symbol(c, item);
        }
        this.selection = selection;
        this.stamp = stamp;
        this.fogKey = fogKey;
        this.lastMarkers = now;
        this.stats.markerBuilds++;
      }
      const a = ui.area || {
          x: 0,
          y: 0,
          right: view.width,
          bottom: view.height,
        },
        key = [
          view.camera.x,
          view.camera.y,
          view.camera.scale,
          view.origin.x,
          view.origin.y,
          a.x,
          a.y,
          a.right,
          a.bottom,
        ].join(":"),
        ack = ui.ack,
        ackKey = ack
          ? [ack.x, ack.y, Math.round((ack.t || 0) * 10), ack.intent].join(":")
          : "";
      if (
        !refresh &&
        !this.dirty &&
        key === this.cameraKey &&
        ackKey === this.ackKey
      )
        return false;
      this.cameraKey = key;
      this.ackKey = ackKey;
      this.dirty = false;
      const c = this.c,
        g = this.g;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.drawImage(this.layer, 0, 0, width, height);
      const corners = [
        [a.x, a.y],
        [a.right, a.y],
        [a.right, a.bottom],
        [a.x, a.bottom],
      ].map(([x, y]) => project(g, view.world(x, y)));
      const x0 = E.clamp(
          Math.min(...corners.map((p) => p.x)),
          g.x,
          g.x + g.W * g.scale,
        ),
        x1 = E.clamp(
          Math.max(...corners.map((p) => p.x)),
          g.x,
          g.x + g.W * g.scale,
        ),
        y0 = E.clamp(
          Math.min(...corners.map((p) => p.y)),
          g.y,
          g.y + g.H * g.scale,
        ),
        y1 = E.clamp(
          Math.max(...corners.map((p) => p.y)),
          g.y,
          g.y + g.H * g.scale,
        );
      c.fillStyle = "#e4eee80b";
      c.fillRect(x0, y0, x1 - x0, y1 - y0);
      c.strokeStyle = "#e4eee8bb";
      c.lineWidth = 1;
      c.strokeRect(x0, y0, x1 - x0, y1 - y0);
      if (ack) {
        const p = project(g, ack);
        c.beginPath();
        c.arc(p.x, p.y, 6 + (ack.t || 0) * 4, 0, Math.PI * 2);
        c.strokeStyle = ack.intent === "attack" ? "#ff7771" : ack.intent === "repair" ? "#99e6e2" : "#b2edcf";
        c.lineWidth = 1.5;
        c.stroke();
      }
      c.font = "9px Segoe UI, sans-serif";
      c.textAlign = "right";
      c.fillStyle = "#b1c6bb";
      c.fillText("С ↑", width - 5, 12);
      this.stats.paints++;
      return true;
    }
    diagnostics() {
      return {
        ...this.stats,
        geometry: this.g ? { ...this.g } : null,
        markers: this.markers.map((p) => ({ ...p })),
      };
    }
  }
  const API = {
    SYMBOLS,
    geometry,
    project,
    unproject,
    collect,
    legend,
    MiniMap,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SignalMiniMap = API;
})(typeof globalThis !== "undefined" ? globalThis : window);
