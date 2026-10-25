/* A shared projection keeps terrain, aim, orders and touch input in the same space. */
(function (root) {
  "use strict";
  const E = root.SignalEngine,
    Y = 0.73,
    TAU = Math.PI * 2;
  function poly(c, p, fill, stroke) {
    c.beginPath();
    p.forEach((v, i) => (i ? c.lineTo(v[0], v[1]) : c.moveTo(v[0], v[1])));
    c.closePath();
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.stroke();
    }
  }
  function line(c, p, color, width = 1) {
    c.beginPath();
    p.forEach((v, i) => (i ? c.lineTo(v[0], v[1]) : c.moveTo(v[0], v[1])));
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  }
  function ellipse(c, x, y, rx, ry, fill, stroke) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, TAU);
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.stroke();
    }
  }
  function ring(c, x, y, r, color, width = 1) {
    c.lineWidth = width;
    ellipse(c, x, y, r, r, null, color);
  }
  function box(c, x, y, w, h, z, top, side = "#263538") {
    poly(
      c,
      [
        [x, y + h],
        [x + w, y + h],
        [x + w, y + h - z],
        [x, y + h - z],
      ],
      side,
    );
    poly(
      c,
      [
        [x + w, y],
        [x + w, y + h],
        [x + w, y + h - z],
        [x + w, y - z],
      ],
      "#1d2c2e",
    );
    poly(
      c,
      [
        [x, y - z],
        [x + w, y - z],
        [x + w, y + h - z],
        [x, y + h - z],
      ],
      top,
      "#899a8c25",
    );
  }
  function terrain() {
    const a = document.createElement("canvas");
    a.width = E.W;
    a.height = E.H;
    const c = a.getContext("2d");
    let seed = 71;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const g = c.createLinearGradient(0, 0, 1440, 1000);
    g.addColorStop(0, "#263737");
    g.addColorStop(0.5, "#34433f");
    g.addColorStop(1, "#27393a");
    poly(
      c,
      [
        [30, 100],
        [240, 30],
        [1260, 30],
        [1410, 140],
        [1410, 850],
        [1240, 970],
        [120, 970],
        [30, 870],
      ],
      g,
      "#8b9b8026",
    );
    for (let y = 60; y < 980; y += 80)
      for (let x = 40; x < 1420; x += 100) {
        c.fillStyle = `rgba(150,161,137,${rnd() * 0.025})`;
        c.fillRect(x + 1, y + 1, 98, 78);
        c.strokeStyle = "#0d1b1e30";
        c.lineWidth = 0.7;
        c.strokeRect(x, y, 100, 80);
        if (rnd() > 0.78) {
          line(
            c,
            [
              [x + 15, y + 65],
              [x + 32, y + 65],
              [x + 32, y + 57],
            ],
            "#acb5a01c",
          );
        }
      }
    // Pale service lanes and cable trenches make the three objectives spatially legible.
    line(
      c,
      [
        [135, 820],
        [265, 820],
        [265, 650],
        [520, 650],
        [520, 180],
        [1015, 180],
      ],
      "#172b2b",
      20,
    );
    line(
      c,
      [
        [135, 820],
        [265, 820],
        [265, 650],
        [520, 650],
        [520, 180],
        [1015, 180],
      ],
      "#70897d26",
      2,
    );
    line(
      c,
      [
        [520, 650],
        [790, 650],
        [790, 490],
        [1250, 490],
      ],
      "#192d2c",
      18,
    );
    line(
      c,
      [
        [520, 650],
        [790, 650],
        [790, 490],
        [1250, 490],
      ],
      "#84988428",
      2,
    );
    for (let i = 0; i < 1500; i++) {
      let x = rnd() * 1400 + 20,
        y = rnd() * 940 + 30;
      c.fillStyle = rnd() > 0.5 ? "#d5cfab0b" : "#101f2219";
      c.fillRect(x, y, 1 + rnd() * 3, 1 + rnd() * 3);
    }
    for (let i = 0; i < 100; i++) {
      const x = rnd() * 1360 + 40,
        y = rnd() * 900 + 50;
      if (!E.free(x, y, 45)) continue;
      const r = 1 + rnd() * 5;
      poly(
        c,
        [
          [x - r, y],
          [x, y - r],
          [x + r, y - 1],
          [x + r * 0.5, y + r],
        ],
        "#5d6c601f",
        "#a6ae8b12",
      );
    }
    for (const [x, y, w, h] of [
      [80, 730, 180, 180],
      [730, 385, 240, 210],
      [1155, 360, 190, 230],
      [935, 135, 160, 160],
    ]) {
      c.strokeStyle = "#c3c5a82b";
      c.lineWidth = 2;
      c.strokeRect(x, y, w, h);
      for (let j = 0; j < 4; j++) {
        c.fillStyle = "#b8ba985c";
        c.fillRect(x + j * (w / 4) + 4, y + h - 7, 13, 2);
      }
      line(
        c,
        [
          [x + 12, y + 28],
          [x + 12, y + 12],
          [x + 28, y + 12],
        ],
        "#d4d6b768",
        3,
      );
    }
    // Broken perimeter beams sit outside the navigable deck.
    for (let x = 80; x < 1300; x += 160) {
      box(c, x, 32, 110, 12, 8, "#5f7065", "#273b36");
      box(c, x, 950, 90, 13, 10, "#4a5d54", "#1b302e");
    }
    return a;
  }
  class View {
    constructor(canvas) {
      this.canvas = canvas;
      this.c = canvas.getContext("2d", { alpha: false });
      this.ground = terrain();
      this.fx = [];
      this.camera = { x: 720, y: 500, scale: 1 };
      this.time = 0;
      this.width = 1;
      this.height = 1;
      this.shake = 0;
      this.resize();
    }
    resize() {
      this.width = innerWidth;
      this.height = innerHeight;
      this.dpr = Math.min(devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
    }
    world(x, y) {
      const a = this.camera;
      return {
        x: (x - this.width / 2) / a.scale + a.x,
        y: (y - this.height * 0.49) / (a.scale * Y) + a.y,
      };
    }
    screen(x, y) {
      const a = this.camera;
      return {
        x: (x - a.x) * a.scale + this.width / 2,
        y: (y - a.y) * a.scale * Y + this.height * 0.49,
      };
    }
    add(events, reduced) {
      for (const e of events) {
        if (
          [
            "shot",
            "mortar",
            "hit",
            "spark",
            "destroy",
            "blast",
            "dash",
            "online",
            "order",
            "shield",
          ].includes(e.type)
        ) {
          this.fx.push({
            ...e,
            life: 0,
            max:
              e.type === "destroy"
                ? 1
                : e.type === "online"
                  ? 1.8
                  : e.type === "order"
                    ? 1.2
                    : e.type === "dash"
                      ? 0.3
                      : 0.35,
          });
          if (!reduced && (e.type === "blast" || e.type === "destroy"))
            this.shake = Math.min(4, this.shake + 2);
        }
      }
      this.fx = this.fx.slice(-120);
    }
    render(s, ui, dt) {
      this.time += dt;
      const c = this.c,
        w = this.width,
        h = this.height,
        hero = E.hero(s),
        mobile = w < 700,
        overview = ui.mode === "tactical",
        menu = ui.mode === "menu";
      let scale = overview
        ? Math.min((w - 30) / E.W, (h - (mobile ? 255 : 230)) / (E.H * Y))
        : menu
          ? Math.max(w / 1800, h / 1000)
          : Math.min(1.32, Math.max(0.95, h / 660));
      scale = Math.max(0.22, scale);
      let tx = overview ? 720 : menu ? 770 : hero.x,
        ty = overview ? 470 : menu ? 480 : hero.y;
      if (!overview && !menu) {
        const ax = ui.aim ? E.clamp(ui.aim.x - hero.x, -240, 240) : 0,
          ay = ui.aim ? E.clamp(ui.aim.y - hero.y, -180, 180) : 0;
        tx += ax * 0.22;
        ty += ay * 0.18;
        const half = w / (2 * scale),
          halfY = (h - 70) / (2 * scale * Y);
        tx = half > E.W / 2 ? 720 : E.clamp(tx, half - 55, E.W - half + 55);
        ty = halfY > E.H / 2 ? 500 : E.clamp(ty, halfY - 65, E.H - halfY + 65);
      }
      const blend = ui.reduced ? 1 : 1 - Math.exp(-dt * 8);
      this.camera.x += (tx - this.camera.x) * blend;
      this.camera.y += (ty - this.camera.y) * blend;
      this.camera.scale += (scale - this.camera.scale) * blend;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.fillStyle = "#0b171d";
      c.fillRect(0, 0, w, h);
      const glow = c.createRadialGradient(
        w * 0.73,
        h * 0.36,
        20,
        w * 0.6,
        h * 0.5,
        w * 0.8,
      );
      glow.addColorStop(0, "#26403c");
      glow.addColorStop(1, "#0b151d");
      c.fillStyle = glow;
      c.fillRect(0, 0, w, h);
      // Distant concentric fragments of the orbital structure.
      c.save();
      c.translate(w * 0.73, h * 0.1);
      c.rotate(-0.26);
      c.scale(1, 0.27);
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.arc(0, 0, w * (0.36 + i * 0.11), 0, TAU);
        c.strokeStyle = i % 2 ? "#8caa8c08" : "#829a8620";
        c.lineWidth = i % 2 ? 12 : 1;
        c.stroke();
      }
      c.restore();
      for (let i = 0; i < 70; i++) {
        const x = (i * 719.27) % w,
          y = (i * 311.37) % h;
        c.fillStyle = `rgba(188,208,192,${0.08 + (i % 5) * 0.025})`;
        c.fillRect(x, y, i % 7 === 0 ? 2 : 1, 1);
      }
      const cam = this.camera;
      c.save();
      c.translate(w / 2, h * 0.49);
      if (this.shake && !ui.reduced)
        c.translate(
          Math.sin(this.time * 87) * this.shake,
          Math.cos(this.time * 71) * this.shake,
        );
      this.shake = Math.max(0, this.shake - dt * 15);
      c.scale(cam.scale, cam.scale * Y);
      c.translate(-cam.x, -cam.y);
      c.save();
      c.translate(8, 30);
      c.globalAlpha = 0.45;
      c.drawImage(this.ground, 0, 0);
      c.restore();
      c.drawImage(this.ground, 0, 0);
      if (s.relay.online) {
        c.save();
        c.setLineDash([12, 8]);
        c.lineDashOffset = ui.reduced ? 0 : -this.time * 15;
        line(
          c,
          [
            [135, 820],
            [265, 820],
            [265, 650],
            [790, 650],
            [790, 490],
            [850, 490],
          ],
          "#9edcc655",
          2,
        );
        c.restore();
        ring(c, 850, 490, 140, "#9edcc615", 1);
      }
      this.relay(c, s, ui);
      if (overview) {
        for (const u of s.units.filter(
          (u) => u.team === 0 && u.group === ui.group && u.hp > 0,
        )) {
          ring(c, u.x, u.y, E.C[u.kind].r + 10, "#c8edda", 2);
          if (u.path.length) {
            c.save();
            c.setLineDash([5, 7]);
            line(
              c,
              [[u.x, u.y], ...u.path.map((p) => [p.x, p.y])],
              "#b6e6d17a",
              2,
            );
            c.restore();
            const p = u.path[u.path.length - 1];
            ring(c, p.x, p.y, 12, "#c8edda", 2);
          }
        }
      }
      for (const u of s.units) {
        if (u.hp > 0 && u.wind > 0 && u.target && u.kind !== "runner") {
          c.save();
          c.globalAlpha = 0.25 + (0.65 - u.wind) * 0.7;
          line(
            c,
            [
              [u.x, u.y],
              [u.target.x, u.target.y],
            ],
            "#f4ae89",
            1.4,
          );
          ring(c, u.target.x, u.target.y, 13, "#f4ae89", 1);
          c.restore();
        }
      }
      const objects = [
        ...E.walls.map((b) => ({ ...b, wall: true, sort: b.y + b.h })),
        ...s.units.map((u) => ({ ...u, sort: u.y })),
      ].sort((a, b) => a.sort - b.sort);
      for (const o of objects)
        if (o.wall) this.wall(c, o);
        else this.unit(c, o, s, ui);
      for (const b of s.bullets) {
        if (b.kind === "shell") {
          const total =
              Math.hypot(
                b.tx - (b.x - b.vx * b.age),
                b.ty - (b.y - b.vy * b.age),
              ) / 360,
            arc =
              Math.sin(Math.min(1, b.age / Math.max(0.1, total)) * Math.PI) *
              55;
          ellipse(c, b.x, b.y, 6, 4, "#0005");
          ellipse(c, b.x, b.y - arc, 4, 4, "#e1f4c9");
          ring(c, b.tx, b.ty, 30, "#c5dbab50");
        } else {
          const len = b.team ? 11 : 18,
            color = b.team ? "#ffb491" : "#cef6e3";
          line(
            c,
            [
              [b.x - (b.vx / 800) * len, b.y - (b.vy / 800) * len],
              [b.x, b.y],
            ],
            color,
            b.team ? 3 : 2,
          );
        }
      }
      for (const f of this.fx) {
        f.life += dt;
        const t = f.life / f.max;
        if (t > 1) continue;
        c.save();
        c.globalAlpha = (1 - t) * 0.9;
        const color = f.team ? "#eea381" : "#ade6ce";
        if (f.type === "destroy" || f.type === "blast") {
          ring(
            c,
            f.x,
            f.y,
            8 + t * (f.type === "blast" ? 75 : 48),
            "#e6cda2",
            2,
          );
          for (let i = 0; i < 9; i++) {
            const a = i * 2.4;
            line(
              c,
              [
                [f.x + Math.cos(a) * t * 18, f.y + Math.sin(a) * t * 18],
                [f.x + Math.cos(a) * t * 68, f.y + Math.sin(a) * t * 68],
              ],
              i % 2 ? "#a3b0a0" : "#e8b88e",
              2,
            );
          }
        } else if (f.type === "online") {
          ring(c, f.x, f.y, 30 + t * 160, "#a9e1ce", 2);
        } else if (f.type === "order") {
          ring(c, f.x, f.y, 15 + t * 30, "#d1eee0", 2);
          line(
            c,
            [
              [f.x - 8, f.y],
              [f.x + 8, f.y],
            ],
            "#d1eee0",
          );
        } else if (f.type === "dash") {
          ellipse(c, f.x, f.y, 17, 13, "#abdfcc66");
        } else if (f.type === "shield") {
          ring(c, f.x, f.y, 66, "#d1a181", 2);
        } else if (f.type === "hit" || f.type === "spark") {
          for (let i = 0; i < 4; i++) {
            const a = i * 1.7;
            line(
              c,
              [
                [f.x, f.y - 8],
                [f.x + Math.cos(a) * t * 20, f.y - 8 + Math.sin(a) * t * 20],
              ],
              color,
              1.5,
            );
          }
        }
        c.restore();
      }
      this.fx = this.fx.filter((f) => f.life < f.max);
      const objective =
        s.phase === 0
          ? E.living(s, "jammer")
          : s.phase <= 2
            ? s.relay
            : E.living(s, "citadel");
      if (objective && s.status === "playing") {
        const radius = s.phase <= 2 ? 50 : E.C[objective.kind].r + 18;
        const pulse = ui.reduced ? 0 : Math.sin(this.time * 2) * 3;
        ring(c, objective.x, objective.y, radius + pulse, "#d5dab078", 1.4);
        const yy = objective.y - radius - 25;
        poly(
          c,
          [
            [objective.x, yy + 9],
            [objective.x - 5, yy],
            [objective.x + 5, yy],
          ],
          "#e2dfb1",
        );
      }
      c.restore();
      if (!menu && s.status === "playing" && objective) {
        const p = this.screen(objective.x, objective.y),
          pad = mobile ? 35 : 55;
        if (p.x < pad || p.x > w - pad || p.y < 105 || p.y > h - 140) {
          const ox = E.clamp(p.x, pad, w - pad),
            oy = E.clamp(p.y, 110, h - 155),
            a = Math.atan2(p.y - oy, p.x - ox);
          c.save();
          c.translate(ox, oy);
          c.rotate(a);
          poly(
            c,
            [
              [9, 0],
              [-4, -5],
              [-4, 5],
            ],
            "#d5dab0",
          );
          c.restore();
        }
      }
      if (overview) {
        for (const [x, y, label] of [
          [1015, 215, "ГЛУШИТЕЛЬ"],
          [850, 490, "УЗЕЛ СВЯЗИ"],
          [1250, 485, "ЦИТАДЕЛЬ"],
          [135, 820, "ПОСАДОЧНЫЙ МОДУЛЬ"],
        ]) {
          const p = this.screen(x, y);
          c.font = "9px Segoe UI, sans-serif";
          c.textAlign = "center";
          c.fillStyle = "#bacac0";
          const half = c.measureText(label).width / 2;
          c.fillText(
            label,
            E.clamp(p.x, half + 8, w - half - 8),
            p.y - 38 * cam.scale - 12,
          );
        }
      }
      if (!menu && !overview && ui.aim && !ui.touch) {
        const p = this.screen(ui.aim.x, ui.aim.y);
        c.strokeStyle = "#d0e4d1aa";
        c.lineWidth = 1;
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ])
          line(
            c,
            [
              [p.x + dx * 7, p.y + dy * 7],
              [p.x + dx * 12, p.y + dy * 12],
            ],
            "#d0e4d1aa",
          );
      }
    }
    wall(c, b) {
      c.save();
      ellipse(
        c,
        b.x + b.w * 0.55,
        b.y + b.h * 0.65,
        b.w * 0.7,
        b.h * 0.62,
        "#07161655",
      );
      box(c, b.x, b.y, b.w, b.h, 38, "#56645b", "#273834");
      box(c, b.x + 9, b.y + 9, b.w - 18, b.h - 18, 48, "#677365", "#435247");
      for (let i = 0; i < Math.floor(b.h / 55); i++) {
        line(
          c,
          [
            [b.x + 9, b.y + i * 55 - 29],
            [b.x + b.w - 9, b.y + i * 55 - 29],
          ],
          "#263b344f",
          2,
        );
        c.fillStyle = "#c1c2a754";
        c.fillRect(b.x + b.w - 13, b.y + i * 55 - 22, 2, 12);
      }
      poly(
        c,
        [
          [b.x + 10, b.y - 39],
          [b.x + 30, b.y - 39],
          [b.x + 10, b.y - 19],
        ],
        "#91977d",
      );
      c.restore();
    }
    relay(c, s, ui) {
      const { x, y, online, charge } = s.relay;
      ellipse(c, x, y, 47, 35, "#071b1d66");
      ring(c, x, y, 43, online ? "#a3d9c955" : "#869a8a33", 2);
      for (let i = 0; i < 3; i++) {
        const a = (i * TAU) / 3;
        box(
          c,
          x + Math.cos(a) * 26 - 8,
          y + Math.sin(a) * 26 - 8,
          16,
          16,
          12,
          "#6b8174",
          "#2a4540",
        );
      }
      box(c, x - 13, y - 12, 26, 24, 30, "#8b9c87", "#455f55");
      ellipse(c, x, y - 28, 7, 5, online ? "#b6f0d7" : "#d7b78d");
      if (charge) {
        c.beginPath();
        c.arc(
          x,
          y,
          51,
          -Math.PI / 2,
          -Math.PI / 2 + (s.phase === 2 ? s.relay.stability : charge) * TAU,
        );
        c.strokeStyle = "#b6f0d7";
        c.lineWidth = 3;
        c.stroke();
      }
    }
    unit(c, u, s, ui) {
      const def = E.C[u.kind],
        r = def.r,
        dead = u.hp <= 0;
      c.save();
      c.translate(u.x, u.y);
      ellipse(c, 6, 9, r * 1.18, r * 0.8, dead ? "#08181966" : "#06161688");
      if (dead) {
        c.rotate(u.angle);
        poly(
          c,
          [
            [-r, 4],
            [-r * 0.5, -r * 0.6],
            [r * 0.8, -r * 0.3],
            [r, r * 0.4],
            [0, r * 0.7],
          ],
          "#263434",
          "#526252",
        );
        line(
          c,
          [
            [-r * 0.7, 2],
            [r * 0.5, 0],
          ],
          "#121f21",
          3,
        );
        c.restore();
        return;
      }
      if (u.kind === "base") {
        box(c, -43, -30, 86, 60, 16, "#586d65", "#293f3c");
        box(c, -28, -25, 56, 50, 29, "#a0ae9d", "#596c60");
        poly(
          c,
          [
            [-22, -53],
            [16, -53],
            [28, -28],
            [18, -4],
            [-22, -4],
            [-32, -28],
          ],
          "#bbc4ae",
          "#3f5b52",
        );
        line(
          c,
          [
            [-13, -49],
            [-13, -8],
          ],
          "#6b8072",
          2,
        );
        box(c, 30, -12, 20, 24, 18, "#758c7e");
        line(
          c,
          [
            [-35, -24],
            [-35, -55],
            [-28, -61],
          ],
          "#a4c4b2",
          2,
        );
        ellipse(c, -28, -61, 2, 2, "#bff2db");
        line(
          c,
          [
            [-12, -28],
            [12, -28],
          ],
          "#b3e7ce",
          4,
        );
      } else if (u.kind === "citadel") {
        const shield = !s.relay.online;
        if (shield) ring(c, 0, 0, 65, "#bd927854", 2);
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2 + Math.PI / 4;
          box(
            c,
            Math.cos(a) * 39 - 10,
            Math.sin(a) * 39 - 10,
            20,
            20,
            22,
            "#5c635a",
            "#273b35",
          );
        }
        poly(
          c,
          [
            [-38, -16],
            [0, -38],
            [38, -16],
            [38, 15],
            [0, 38],
            [-38, 15],
          ],
          "#34463e",
          "#7d8870",
        );
        poly(
          c,
          [
            [-34, -16],
            [0, -36],
            [34, -16],
            [34, -48],
            [0, -70],
            [-34, -48],
          ],
          "#60705c",
          "#91a087",
        );
        poly(
          c,
          [
            [0, -70],
            [34, -48],
            [0, -27],
            [-34, -48],
          ],
          "#9ea48a",
        );
        poly(
          c,
          [
            [0, -27],
            [34, -48],
            [34, -16],
            [0, 8],
          ],
          "#4c6050",
        );
        poly(
          c,
          [
            [0, -27],
            [-34, -48],
            [-34, -16],
            [0, 8],
          ],
          "#75826a",
        );
        line(
          c,
          [
            [0, -20],
            [0, 2],
          ],
          "#edac87",
          4,
        );
        for (let i = 0; i < 3; i++)
          line(
            c,
            [
              [-26, -27 + i * 6],
              [-11, -19 + i * 6],
            ],
            "#1e3831",
            2,
          );
        c.save();
        c.translate(0, -49);
        c.rotate(u.angle);
        box(c, 0, -5, 45, 10, 0, "#c4c2a0", "#526759");
        c.fillStyle = "#bd7459";
        c.fillRect(40, -4, 5, 8);
        c.restore();
        if (shield) {
          c.globalAlpha = 0.2;
          ellipse(c, 0, -27, 66, 75, null, "#e9b091");
          c.globalAlpha = 1;
        }
      } else if (u.kind === "jammer") {
        for (let i = 0; i < 3; i++) {
          const a = (i * TAU) / 3;
          box(
            c,
            Math.cos(a) * 23 - 10,
            Math.sin(a) * 23 - 10,
            20,
            20,
            15,
            "#718174",
            "#334c43",
          );
        }
        box(c, -15, -15, 30, 30, 24, "#8e9d87", "#4c6255");
        line(
          c,
          [
            [0, -20],
            [0, -68],
          ],
          "#bdc5a9",
          5,
        );
        poly(
          c,
          [
            [-27, -63],
            [0, -80],
            [27, -63],
            [0, -46],
          ],
          "#627b68",
          "#c2c6a0",
        );
        poly(
          c,
          [
            [-18, -62],
            [0, -74],
            [18, -62],
            [0, -52],
          ],
          "#263d34",
          "#bc9272",
        );
        ellipse(c, 0, -62, 5, 5, "#edaa85");
        if (!ui.reduced)
          ring(c, 0, -62, 14 + Math.sin(this.time * 3) * 4, "#dd9b7744");
      } else if (u.kind === "turret") {
        box(c, -25, -21, 50, 42, 10, "#687966", "#293f35");
        c.translate(0, -14);
        c.rotate(u.angle);
        poly(
          c,
          [
            [-18, -17],
            [13, -17],
            [22, 0],
            [13, 17],
            [-18, 17],
          ],
          "#9eaa8d",
          "#2e4b3d",
        );
        c.fillStyle = "#263c35";
        c.fillRect(2, -9, 32, 6);
        c.fillRect(2, 3, 32, 6);
        c.fillStyle = "#e3a37f";
        c.fillRect(-8, -6, 9, 12);
      } else {
        const ally = u.team === 0,
          primary =
            u.kind === "hero" ? "#d0d8c7" : ally ? "#8fa99e" : "#a19f83",
          secondary = ally ? "#43655b" : "#52634e",
          accent = ally ? "#b3f0d5" : "#f0aa82";
        c.translate(0, -8);
        c.rotate(u.angle);
        if (u.kind === "artillery") {
          poly(
            c,
            [
              [-24, -20],
              [13, -20],
              [27, -12],
              [27, 12],
              [13, 20],
              [-24, 20],
            ],
            "#334d44",
            "#94b4a1",
          );
          for (const y of [-19, 10]) {
            c.fillStyle = "#789585";
            c.fillRect(-24, y, 44, 9);
            for (let i = 0; i < 5; i++) {
              line(
                c,
                [
                  [-20 + i * 8, y],
                  [-20 + i * 8, y + 9],
                ],
                "#1f3a31",
                2,
              );
            }
          }
          poly(
            c,
            [
              [-15, -11],
              [12, -11],
              [19, 0],
              [12, 11],
              [-15, 11],
            ],
            "#afbeaa",
            "#496952",
          );
          c.fillStyle = "#2f4a3c";
          c.fillRect(4, -4, 36, 8);
          c.fillStyle = "#bddebd";
          c.fillRect(33, -4, 7, 8);
          c.fillStyle = "#b0e8cd";
          c.fillRect(-13, -4, 7, 8);
        } else if (u.kind === "runner") {
          for (const y of [-1, 1]) {
            line(
              c,
              [
                [-9, y * 4],
                [-17, y * 14],
                [-6, y * 20],
              ],
              "#68795e",
              4,
            );
            line(
              c,
              [
                [5, y * 4],
                [15, y * 15],
                [25, y * 9],
              ],
              "#a2a37d",
              3,
            );
          }
          poly(
            c,
            [
              [-14, 0],
              [-2, -10],
              [15, 0],
              [-2, 10],
            ],
            "#b6ae85",
            "#45614c",
          );
          line(
            c,
            [
              [1, -3],
              [8, 0],
              [1, 3],
            ],
            accent,
            2,
          );
        } else {
          const gait =
            u.path.length || u.kind === "hero"
              ? Math.sin(this.time * 11) * 2
              : 0;
          for (const sign of [-1, 1]) {
            c.fillStyle = secondary;
            c.fillRect(-11 + sign * gait, sign * 8 - 4, 15, 8);
            c.fillStyle = primary;
            c.fillRect(-9 + sign * gait, sign * 9 - 3, 7, 6);
          }
          poly(
            c,
            [
              [-11, -8],
              [3, -12],
              [12, -6],
              [12, 6],
              [3, 12],
              [-11, 8],
            ],
            primary,
            "#263e37",
          );
          poly(
            c,
            [
              [-8, -6],
              [3, -7],
              [7, 0],
              [3, 7],
              [-8, 6],
            ],
            secondary,
          );
          poly(
            c,
            [
              [0, -5],
              [10, -3],
              [12, 0],
              [10, 3],
              [0, 5],
            ],
            primary,
          );
          line(
            c,
            [
              [7, -3],
              [10, 0],
              [7, 3],
            ],
            accent,
            2,
          );
          c.fillStyle = "#253e38";
          c.fillRect(4, 6, 21, 4);
          c.fillStyle = primary;
          c.fillRect(10, 5, 12, 2);
          if (u.kind === "hero") {
            poly(
              c,
              [
                [-12, -7],
                [-24, -12],
                [-23, 7],
                [-12, 8],
              ],
              "#66877b",
              "#a6beaa",
            );
            c.fillStyle = accent;
            c.fillRect(-10, -6, 2, 12);
          }
        }
        if (u.flash > 0 && !ui.reduced) {
          poly(
            c,
            [
              [r + 8, -4],
              [r + 20, 0],
              [r + 8, 4],
            ],
            accent,
          );
        }
        if (u.hit > 0 && !ui.reduced) {
          c.globalAlpha = 0.25;
          c.fillStyle = "#e9e8ce";
          c.fillRect(-r, -r, r * 2, r * 2);
        }
      }
      c.restore();
      if (u.hp < def.hp || ui.mode === "tactical") {
        /* Draw in world space with a fixed-height plate. */ c.save();
        c.translate(u.x, u.y + r + 11);
        c.fillStyle = "#102523";
        c.fillRect(-r, 0, r * 2, 3);
        c.fillStyle = u.team ? "#d39a7d" : "#a2d9c3";
        c.fillRect(-r, 0, (r * 2 * u.hp) / def.hp, 3);
        c.restore();
      }
    }
  }
  root.SignalView = View;
})(window);
