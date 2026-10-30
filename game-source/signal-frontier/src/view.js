/* A shared projection keeps terrain, aim, orders and touch input in the same space. */
(function (root) {
  "use strict";
  const E = root.SignalEngine,
    Y = 0.73,
    TAU = Math.PI * 2;
  const MOUNTS = E.MOUNTS;
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
  const MAT = {
    ceramic: {
      top: "#c9d7ce",
      front: "#829b91",
      side: "#3e5c58",
      edge: "#e1eee4",
    },
    ally: {
      top: "#819e94",
      front: "#4a6d65",
      side: "#263f40",
      edge: "#bad0bd",
    },
    graphite: {
      top: "#263d43",
      front: "#182a32",
      side: "#101e26",
      edge: "#58716e",
    },
    enemy: {
      top: "#716c62",
      front: "#4b4540",
      side: "#282f33",
      edge: "#a69a83",
    },
    copper: {
      top: "#ac8b73",
      front: "#6e5146",
      side: "#403b36",
      edge: "#d4b49a",
    },
    dark: {
      top: "#34474b",
      front: "#203138",
      side: "#14252c",
      edge: "#657a74",
    },
    deck: {
      top: "#4b6060",
      front: "#2b4046",
      side: "#1a2d35",
      edge: "#6a807a",
    },
  };
  const rectangle = (x, y, w, h) => [
    [x - w / 2, y - h / 2],
    [x + w / 2, y - h / 2],
    [x + w / 2, y + h / 2],
    [x - w / 2, y + h / 2],
  ];
  function point(x, y, z, a = 0) {
    const co = Math.cos(a),
      si = Math.sin(a);
    return [x * co - y * si, x * si + y * co - z];
  }
  function plate(c, shape, z, depth, a, mat) {
    const base = shape.map((p) => point(p[0], p[1], z, a)),
      top = shape.map((p) => point(p[0], p[1], z + depth, a));
    const faces = base
      .map((p, i) => ({ i, y: (p[1] + base[(i + 1) % base.length][1]) / 2 }))
      .sort((a, b) => a.y - b.y);
    c.lineWidth = 0.6;
    for (const { i } of faces) {
      const j = (i + 1) % base.length;
      poly(
        c,
        [base[i], base[j], top[j], top[i]],
        base[j][0] < base[i][0] ? mat.front : mat.side,
      );
    }
    poly(c, top, mat.top, mat.edge + "80");
    line(c, [top[0], top[1]], mat.edge + "aa", 0.7);
  }
  function slab(c, x, y, w, h, z, depth, a, mat) {
    plate(c, rectangle(x, y, w, h), z, depth, a, mat);
  }
  function lamp(c, x, y, z, a, r, color) {
    const p = point(x, y, z, a);
    ellipse(c, p[0], p[1], r + 1, r * 0.65 + 1, "#09171c");
    ellipse(c, p[0], p[1], r, r * 0.65, color);
  }
  function seam(c, coords, z, a, color, width = 1) {
    line(
      c,
      coords.map((p) => point(p[0], p[1], z, a)),
      color,
      width,
    );
  }
  function arc(c, x, y, r, start, end, color, width = 1) {
    c.beginPath();
    c.arc(x, y, r, start, end);
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  }
  function sky(w, h) {
    const a = document.createElement("canvas");
    a.width = w;
    a.height = h;
    const c = a.getContext("2d");
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#07121c");
    g.addColorStop(0.55, "#16303b");
    g.addColorStop(1, "#08151f");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 170; i++) {
      const x = (i * 719.27) % w,
        y = (i * 311.37) % h;
      c.fillStyle = i % 9 === 0 ? "#c0d9ce65" : "#a0c2c52c";
      c.fillRect(x, y, i % 17 === 0 ? 2 : 1, 1);
    }
    const x = w * 0.83,
      y = h * 0.06,
      r = Math.min(w * 0.38, h * 0.48);
    const halo = c.createRadialGradient(x, y, r * 0.8, x, y, r * 1.12);
    halo.addColorStop(0, "#719cab00");
    halo.addColorStop(0.78, "#7099a61e");
    halo.addColorStop(1, "#7099a600");
    c.fillStyle = halo;
    c.fillRect(x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4);
    c.save();
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.clip();
    const planet = c.createRadialGradient(
      x - r * 0.6,
      y - r * 0.6,
      0,
      x,
      y,
      r * 1.2,
    );
    planet.addColorStop(0, "#66817e");
    planet.addColorStop(0.5, "#2c4a54");
    planet.addColorStop(0.85, "#142b38");
    planet.addColorStop(1, "#0a1825");
    c.fillStyle = planet;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    c.translate(x, y);
    c.rotate(-0.28);
    for (let i = 0; i < 65; i++) {
      const yy = -r + (i * r) / 32,
        span = Math.sqrt(Math.max(0, r * r - yy * yy));
      c.beginPath();
      c.moveTo(-span, yy);
      for (let j = 0; j <= 12; j++) {
        const xx = -span + (j * span) / 6;
        c.lineTo(xx, yy + Math.sin(j * 0.87 + i * 2.7) * r * 0.014);
      }
      c.strokeStyle = i % 3 ? "#afc1ae08" : "#0a24381a";
      c.lineWidth = 1 + (i % 5) * 0.65;
      c.stroke();
    }
    c.restore();
    arc(c, x, y, r, 0.08, Math.PI * 0.92, "#a8c8bd3a", 1.5);
    c.save();
    c.translate(w * 0.63, h * 0.12);
    c.rotate(-0.28);
    c.scale(1, 0.26);
    for (let i = 0; i < 3; i++) {
      const rr = w * (0.47 + i * 0.13);
      arc(
        c,
        0,
        0,
        rr,
        0.08,
        Math.PI * 1.72,
        i === 1 ? "#59717631" : "#82958d32",
        i === 1 ? 22 : 3,
      );
      arc(c, 0, 0, rr + 12, 0.08, Math.PI * 1.72, "#071721a0", 4);
      for (let j = 0; j < 36; j++) {
        const t = j * 0.17;
        line(
          c,
          [
            [Math.cos(t) * (rr - 9), Math.sin(t) * (rr - 9)],
            [Math.cos(t) * (rr + 9), Math.sin(t) * (rr + 9)],
          ],
          "#9bb7a82d",
          1.6,
        );
      }
    }
    c.restore();
    return a;
  }
  function highlandGround(world) {
    // Half resolution bounds the terrain texture to 13.7 MiB on phones.
    const a = document.createElement("canvas");
    a.width = world.W / 2;
    a.height = (world.H + 160) / 2;
    a.offsetY = -160;
    a.worldW = world.W;
    a.worldH = world.H + 160;
    const c = a.getContext("2d");
    c.scale(0.5, 0.5);
    c.translate(0, 160);
    const T = E.terrain;
    const faces = [];
    for (let y = 0; y < world.H; y += 40)
      for (let x = 0; x < world.W; x += 40) {
        if (T.level(x + 20, y + 20) < 0) continue;
        const z = T.height(x + 20, y + 20),
          south = T.height(x + 20, y + 40.01);
        if (z > south + 4)
          faces.push({
            x,
            y: y + 40,
            z,
            low: Math.max(-36, south),
            sort: y + 40,
          });
      }
    // Back-to-front top surfaces and south-facing escarpments share one light direction.
    for (let y = 0; y < world.H; y += 40) {
      for (let x = 0; x < world.W; x += 40) {
        const l = T.level(x + 20, y + 20);
        if (l < 0) continue;
        const z = T.height(x + 20, y + 20),
          tone = Math.floor(l),
          color =
            "rgb(" +
            [
              [41, 61, 67],
              [59, 81, 81],
              [88, 103, 99],
            ][tone]
              .map((v, i) =>
                Math.round(
                  v +
                    ([
                      [41, 61, 67],
                      [59, 81, 81],
                      [88, 103, 99],
                    ][Math.min(2, tone + 1)][i] -
                      v) *
                      (l - tone),
                ),
              )
              .join(",") +
            ")",
          p = [
            [x, y - T.height(x + 0.01, y + 0.01)],
            [x + 40, y - T.height(x + 39.99, y + 0.01)],
            [x + 40, y + 40 - T.height(x + 39.99, y + 39.99)],
            [x, y + 40 - T.height(x + 0.01, y + 39.99)],
          ];
        poly(c, p, color);
        if (
          T.level(x - 0.01, y + 20) < 0 ||
          T.height(x - 0.01, y + 20) < z - 30
        )
          line(
            c,
            [
              [x, y - z],
              [x, y + 40 - z],
            ],
            "#bac7b070",
            2,
          );
        if (
          T.level(x + 20, y - 0.01) < 0 ||
          T.height(x + 20, y - 0.01) < z - 30
        )
          line(
            c,
            [
              [x, y - z],
              [x + 40, y - z],
            ],
            "#c1c9ad85",
            2,
          );
      }
      for (const f of faces) if (f.y === y + 40) cliffFace(c, f);
    }
    for (const r of world.links) {
      const alongY = r.h > r.w,
        cx = r.x + r.w / 2,
        cy = r.y + r.h / 2;
      // Restrained metal rails distinguish bridges; ramp chevrons indicate the climb.
      if (!r.axis) {
        for (const side of [-1, 1]) {
          const p = alongY
            ? [
                [cx + side * (r.w / 2 - 7), r.y],
                [cx + side * (r.w / 2 - 7), r.y + r.h],
              ]
            : [
                [r.x, cy + side * (r.h / 2 - 7)],
                [r.x + r.w, cy + side * (r.h / 2 - 7)],
              ];
          line(
            c,
            p.map(([x, y]) => [x, y - T.height(x, y)]),
            "#91a69a",
            3,
          );
        }
      } else {
        for (let i = 1; i < 5; i++) {
          const t = i / 5,
            x = r.axis === "x" ? r.x + r.w * t : cx,
            y = r.axis === "y" ? r.y + r.h * t : cy,
            z = T.height(x, y),
            dx = r.axis === "x" ? 0 : 18,
            dy = r.axis === "x" ? 18 : 0;
          line(
            c,
            [
              [x - dx, y - dy - z],
              [x + dx, y + dy - z],
            ],
            "#c3c9ac65",
            2,
          );
        }
      }
    }
    if (world.roads) {
      c.save();
      c.lineCap = "round";
      c.lineJoin = "round";
      for (const route of world.roads) {
        line(
          c,
          route.map(([x, y]) => [x, y - T.height(x, y)]),
          "#bfd1b51c",
          44,
        );
        line(
          c,
          route.map(([x, y]) => [x, y - T.height(x, y)]),
          "#202f321f",
          4,
        );
      }
      for (const r of world.districts) {
        const x = r.x + r.w / 2,
          y = r.y + r.h / 2;
        if (T.level(x, y) < 0) continue;
        c.font = "bold 34px sans-serif";
        c.fillStyle = "#d3d8b615";
        c.textAlign = "center";
        c.fillText(r.id, x, y - T.height(x, y));
      }
      c.restore();
    }
    a.faces = faces;
    return a;
  }
  function cliffFace(c, f) {
    poly(
      c,
      [
        [f.x, f.y - f.z],
        [f.x + 40, f.y - f.z],
        [f.x + 40, f.y - f.low],
        [f.x, f.y - f.low],
      ],
      "#1c3037",
      "#0d242c70",
      0.8,
    );
    line(
      c,
      [
        [f.x + 2, f.y - f.z],
        [f.x + 38, f.y - f.z],
      ],
      "#b6c3a58c",
      2,
    );
    line(
      c,
      [
        [f.x + 8, f.y - f.z + 7],
        [f.x + 11, f.y - f.low - 5],
      ],
      "#81938128",
      2,
    );
    line(
      c,
      [
        [f.x, f.y - (f.z + f.low) / 2],
        [f.x + 40, f.y - (f.z + f.low) / 2],
      ],
      "#081e2638",
      2,
    );
  }
  function terrain(world = E.map(null)) {
    if (["highlands", "districts"].includes(world.id))
      return highlandGround(world);
    const a = document.createElement("canvas");
    a.width = world.W;
    a.height = world.H;
    const c = a.getContext("2d");
    let seed = 71;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const outline = [
      [24, 36],
      [36, 24],
      [world.W - 36, 24],
      [world.W - 24, 36],
      [world.W - 24, world.H - 36],
      [world.W - 36, world.H - 24],
      [36, world.H - 24],
      [24, world.H - 36],
    ];
    poly(
      c,
      outline.map(([x, y]) => [x + 4, y + 20]),
      "#10262e",
      "#4d737341",
    );
    const g = c.createLinearGradient(30, 30, world.W, world.H);
    g.addColorStop(0, "#354b50");
    g.addColorStop(0.5, "#3d5251");
    g.addColorStop(1, "#253d44");
    poly(c, outline, g, "#8caaa060");
    c.save();
    c.beginPath();
    outline.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p)));
    c.closePath();
    c.clip();
    // Keep the seeded decoration stream stable without a permanent floor grid.
    for (let y = 24; y < world.H - 20; y += 80)
      for (let x = 24; x < world.W - 20; x += 100) rnd();
    for (const lane of world.id === "expedition"
      ? [
          [
            [135, 1700],
            [535, 1700],
            [535, 1210],
            [1020, 1210],
            [1020, 850],
            [1470, 850],
          ],
          [
            [535, 1210],
            [535, 650],
            [1000, 650],
            [1000, 300],
            [1810, 300],
          ],
          [
            [535, 1700],
            [535, 1990],
            [1160, 1990],
            [1160, 2300],
            [1750, 2300],
          ],
          [
            [1340, 1370],
            [1770, 1370],
            [1770, 1250],
            [2020, 1250],
          ],
          [
            [2020, 1250],
            [2120, 1250],
            [2120, 1530],
          ],
        ]
      : world.id === "frontier"
        ? [
            [
              [135, 1140],
              [535, 1140],
              [535, 650],
              [1020, 650],
              [1020, 290],
              [1470, 290],
            ],
            [
              [535, 1140],
              [780, 1140],
              [780, 1010],
              [1340, 1010],
              [1340, 810],
              [1770, 810],
            ],
            [
              [1340, 810],
              [1340, 390],
              [1780, 390],
            ],
          ]
        : [
            [
              [135, 820],
              [265, 820],
              [265, 650],
              [520, 650],
              [520, 180],
              [1015, 180],
            ],
            [
              [520, 650],
              [790, 650],
              [790, 490],
              [1250, 490],
            ],
            [
              [1015, 215],
              [1015, 280],
              [1280, 280],
              [1280, 200],
            ],
          ]) {
      line(c, lane, "#142f38", 22);
      line(c, lane, "#5c77705c", 1);
      c.save();
      c.setLineDash([15, 12]);
      line(c, lane, "#c1c2a016", 3);
      c.restore();
    }
    for (let i = 0; i < 1300; i++) {
      const x = rnd() * (world.W - 50) + 25,
        y = rnd() * (world.H - 50) + 25;
      c.fillStyle = i % 3 ? "#ced6bd09" : "#051c2720";
      c.fillRect(x, y, 1 + rnd() * 3, 1 + rnd() * 2);
    }
    for (const [x, y, rx, ry] of [
      [380, 560, 62, 23],
      [940, 750, 80, 36],
      [1100, 395, 48, 23],
      [690, 210, 35, 16],
    ]) {
      ellipse(c, x, y, rx, ry, "#0d252e36");
      ellipse(c, x + 8, y - 3, rx * 0.62, ry * 0.7, "#0a202b2b");
      for (let i = 0; i < 9; i++) {
        const t = i * 2.4;
        line(
          c,
          [
            [x + Math.cos(t) * rx * 0.7, y + Math.sin(t) * ry * 0.7],
            [x + Math.cos(t) * rx * 1.3, y + Math.sin(t) * ry * 1.3],
          ],
          "#0e2c352a",
          2,
        );
      }
    }
    for (const [x, y, w, h] of [
      [80, 730, 180, 180],
      [730, 385, 240, 210],
      [1155, 360, 190, 230],
      [935, 135, 160, 160],
    ]) {
      c.strokeStyle = "#adbd9c25";
      c.lineWidth = 1;
      c.strokeRect(x, y, w, h);
      for (const [xx, yy, sx, sy] of [
        [x, y, 1, 1],
        [x + w, y, -1, 1],
        [x, y + h, 1, -1],
        [x + w, y + h, -1, -1],
      ])
        line(
          c,
          [
            [xx, yy + sy * 20],
            [xx, yy],
            [xx + sx * 20, yy],
          ],
          "#b7c2a54a",
          2,
        );
    }
    for (const [x, y] of [
      [90, 365],
      [550, 905],
      [950, 80],
      [1330, 770],
    ]) {
      c.fillStyle = "#1e353d";
      c.fillRect(x, y, 70, 28);
      for (let i = 0; i < 9; i++) {
        line(
          c,
          [
            [x + 5 + i * 7, y + 4],
            [x + 5 + i * 7, y + 24],
          ],
          "#75908a38",
          2,
        );
      }
      line(
        c,
        [
          [x, y],
          [x + 70, y],
        ],
        "#b0bfa638",
      );
    }
    c.restore();
    for (let x = 60; x < world.W - 40; x += 112) {
      slab(c, x, 14, 80, 10, 0, 7, 0, MAT.deck);
      slab(c, x, world.H - 12, 80, 10, 0, 9, 0, MAT.deck);
      lamp(c, x + 28, 14, 8, 0, 1.8, "#9dbbad");
      lamp(c, x - 28, world.H - 12, 10, 0, 1.8, "#9dbbad");
    }
    for (let y = 85; y < world.H - 50; y += 112) {
      slab(c, 14, y, 10, 70, 0, 6, 0, MAT.deck);
      slab(c, world.W - 13, y, 10, 70, 0, 6, 0, MAT.deck);
    }
    return a;
  }

  // Clip in map coordinates before projecting onto a single ground plane.
  function clipPolygon(points, rect) {
    for (const [axis, limit, sign] of [
      [0, rect.x, 1],
      [0, rect.x + rect.w, -1],
      [1, rect.y, 1],
      [1, rect.y + rect.h, -1],
    ]) {
      const output = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length],
          insideA = (a[axis] - limit) * sign >= 0,
          insideB = (b[axis] - limit) * sign >= 0;
        if (insideA) output.push(a);
        if (insideA !== insideB) {
          const t = (limit - a[axis]) / (b[axis] - a[axis]);
          output.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      points = output;
      if (!points.length) break;
    }
    return points;
  }
  function fogContours(fog) {
    const edges = new Map(),
      stride = fog.cols + 1,
      known = (x, y) =>
        x >= 0 &&
        y >= 0 &&
        x < fog.cols &&
        y < fog.rows &&
        fog.explored[y * fog.cols + x],
      add = (x, y, direction) => {
        const key = y * stride + x;
        if (!edges.has(key)) edges.set(key, []);
        edges.get(key).push(direction);
      };
    for (let y = 0; y < fog.rows; y++)
      for (let x = 0; x < fog.cols; x++)
        if (known(x, y)) {
          if (!known(x, y - 1)) add(x, y, 0);
          if (!known(x + 1, y)) add(x + 1, y, 1);
          if (!known(x, y + 1)) add(x + 1, y + 1, 2);
          if (!known(x - 1, y)) add(x, y + 1, 3);
        }
    // Preserve holes, interior knowledge and narrow passages. Boundary cells
    // of a wide region may be trimmed: keeping every stair-step centre would
    // force the display to retain the square sampling grid.
    const cutsCenter = (points) => {
      const xs = points.map((p) => p[0]),
        ys = points.map((p) => p[1]);
      for (
        let y =
          Math.floor(Math.min(...ys) / fog.cell) * fog.cell + fog.cell / 2;
        y <= Math.max(...ys);
        y += fog.cell
      )
        for (
          let x =
            Math.floor(Math.min(...xs) / fog.cell) * fog.cell + fog.cell / 2;
          x <= Math.max(...xs);
          x += fog.cell
        ) {
          const xx = Math.floor(x / fog.cell),
            yy = Math.floor(y / fog.cell),
            interior =
              known(xx - 1, yy) &&
              known(xx + 1, yy) &&
              known(xx, yy - 1) &&
              known(xx, yy + 1),
            wide = [-1, 1].some((dx) =>
              [-1, 1].some(
                (dy) =>
                  known(xx + dx, yy) &&
                  known(xx, yy + dy) &&
                  known(xx + dx, yy + dy),
              ),
            );
          if (known(xx, yy) && wide && !interior) continue;
          let inside = false;
          for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const a = points[j],
              b = points[i],
              dx = b[0] - a[0],
              dy = b[1] - a[1],
              t = E.clamp(
                ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1),
                0,
                1,
              );
            if (Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) < 0.01)
              return true;
            if (a[1] > y !== b[1] > y && x < a[0] + ((y - a[1]) * dx) / dy)
              inside = !inside;
          }
          if (inside) return true;
        }
      return false;
    };
    const loops = [],
      steps = [1, stride, -1, -stride];
    while (edges.size) {
      const start = edges.keys().next().value,
        loop = [];
      let key = start,
        direction = edges.get(start)[0];
      do {
        loop.push([
          (key % stride) * fog.cell,
          Math.floor(key / stride) * fog.cell,
        ]);
        const choices = edges.get(key);
        // Turn right at diagonal contacts, keeping islands and holes separate.
        direction = [1, 0, 3, 2]
          .map((d) => (direction + d) % 4)
          .find((d) => choices.includes(d));
        choices.splice(choices.indexOf(direction), 1);
        if (!choices.length) edges.delete(key);
        key += steps[direction];
      } while (key !== start);
      const corners = loop
          .filter((p, i) => {
            const a = loop[(i + loop.length - 1) % loop.length],
              b = loop[(i + 1) % loop.length];
            return (
              (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0])
            );
          })
          .map((p, i, list) => {
            const a = list[(i + list.length - 1) % list.length],
              b = list[(i + 1) % list.length],
              da = Math.hypot(p[0] - a[0], p[1] - a[1]),
              db = Math.hypot(b[0] - p[0], b[1] - p[1]),
              inset = fog.cell * (list.length > 6 ? 0.35 : 0.22);
            // A small inset gives diagonal chords and concave curves room inside
            // explored cells; one-cell corridors and isolated islands remain open.
            return [
              p[0] - inset * ((p[1] - a[1]) / da + (b[1] - p[1]) / db),
              p[1] + inset * ((p[0] - a[0]) / da + (b[0] - p[0]) / db),
            ];
          }),
        smooth = [];
      // Replace a run of cell steps with a conservative chord. Check every
      // crossed cell interval, not sparse samples: even a tiny unknown corner
      // must remain black. The inset also lets concave stair steps straighten.
      const chord = (start, end) => {
        if (corners.length <= 6) return false;
        const a = corners[start],
          b = corners[end % corners.length],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          length = Math.hypot(dx, dy);
        if (!length) return false;
        for (let i = start; i < end; i++) {
          const p = corners[i % corners.length],
            t = E.clamp(
              ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (length * length),
              0,
              1,
            );
          if (
            Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t) >
            fog.cell * 0.8
          )
            return false;
        }
        const cuts = [0, 1];
        for (const axis of [0, 1]) {
          const delta = b[axis] - a[axis];
          if (!delta) continue;
          for (
            let edge =
              (Math.floor(Math.min(a[axis], b[axis]) / fog.cell) + 1) *
              fog.cell;
            edge < Math.max(a[axis], b[axis]);
            edge += fog.cell
          )
            cuts.push((edge - a[axis]) / delta);
        }
        cuts.sort((a, b) => a - b);
        for (let i = 1; i < cuts.length; i++) {
          if (cuts[i] - cuts[i - 1] < 1e-8) continue;
          const t = (cuts[i] + cuts[i - 1]) / 2,
            x = a[0] + dx * t - (dy / length) * 0.001,
            y = a[1] + dy * t + (dx / length) * 0.001;
          if (!known(Math.floor(x / fog.cell), Math.floor(y / fog.cell)))
            return false;
        }
        if (
          cutsCenter(
            Array.from(
              { length: end - start + 1 },
              (_, i) => corners[(start + i) % corners.length],
            ),
          )
        )
          return false;
        return true;
      };
      for (let i = 0; i < corners.length; ) {
        smooth.push(corners[i]);
        let next = i + 1;
        for (let j = i + 2; j <= Math.min(corners.length, i + 24); j++)
          if (chord(i, j)) next = j;
        i = next;
      }
      // Join the simplified boundary with continuous tangents rather than tiny
      // corner fillets: long circular arcs must not retain horizontal cell steps.
      // Every added strip is checked against entire unknown cells, not samples.
      const crossesUnknown = (points) => {
        const xs = points.map((p) => p[0]),
          ys = points.map((p) => p[1]);
        for (
          let y = Math.floor(Math.min(...ys) / fog.cell);
          y <= Math.floor(Math.max(...ys) / fog.cell);
          y++
        )
          for (
            let x = Math.floor(Math.min(...xs) / fog.cell);
            x <= Math.floor(Math.max(...xs) / fog.cell);
            x++
          ) {
            if (known(x, y)) continue;
            const cut = clipPolygon(points, {
              x: x * fog.cell,
              y: y * fog.cell,
              w: fog.cell,
              h: fog.cell,
            });
            let area = 0;
            for (let i = 0, j = cut.length - 1; i < cut.length; j = i++)
              area += cut[j][0] * cut[i][1] - cut[i][0] * cut[j][1];
            if (Math.abs(area) > 1e-6) return true;
          }
        return false;
      };
      const rounded = [];
      for (let i = 0; i < smooth.length; i++) {
        const p = smooth[i],
          a = smooth[(i + smooth.length - 1) % smooth.length],
          b = smooth[(i + 1) % smooth.length],
          da = Math.hypot(a[0] - p[0], a[1] - p[1]),
          db = Math.hypot(b[0] - p[0], b[1] - p[1]);
        let chosen = [p];
        for (const radius of [
          Math.max(da, db) / 2,
          Math.min(da, db) / 2,
          fog.cell,
          fog.cell / 2,
          fog.cell / 4,
        ]) {
          const from = p.map(
              (n, k) => n + (a[k] - n) * Math.min(0.5, radius / da),
            ),
            to = p.map((n, k) => n + (b[k] - n) * Math.min(0.5, radius / db)),
            curve = [];
          for (let j = 0; j <= 12; j++) {
            const t = j / 12;
            curve.push(
              p.map(
                (n, k) =>
                  (1 - t) ** 2 * from[k] + 2 * (1 - t) * t * n + t * t * to[k],
              ),
            );
          }
          const strip = [from, p, to, ...curve.slice().reverse()];
          if (!crossesUnknown(strip) && !cutsCenter(strip)) {
            chosen = curve;
            break;
          }
        }
        rounded.push(...chosen);
      }
      loops.push(rounded);
    }
    return loops;
  }
  function fogIntervals(polygons, y) {
    const cuts = [];
    for (const polygon of polygons)
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[j],
          b = polygon[i];
        if (a[1] > y !== b[1] > y)
          cuts.push({
            x: a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]),
            sign: b[1] > a[1] ? 1 : -1,
          });
      }
    cuts.sort((a, b) => a.x - b.x);
    const ranges = [];
    let winding = 0,
      start = 0;
    for (let i = 0; i < cuts.length; ) {
      const x = cuts[i].x,
        before = winding;
      do {
        winding += cuts[i++].sign;
      } while (i < cuts.length && Math.abs(cuts[i].x - x) < 1e-7);
      if (!before && winding) start = x;
      else if (before && !winding && x > start) ranges.push([start, x]);
    }
    return ranges;
  }
  const unitModels = root.SignalUnitModels.create(E, {
    slab,
    plate,
    seam,
    lamp,
    point,
    ellipse,
    poly,
    line,
    arc,
    MAT,
  });
  class View {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.c = canvas.getContext("2d", { alpha: false });
      this.ground = terrain();
      this.mapId = "classic";
      this.tactical = { overview: true, x: 720, y: 500, zoom: 0.95 };
      this.fx = [];
      this.poses = new Map();
      this.modelDeaths = new Map();
      this.modelExits = new Map();
      this.modelCargo = new Map();
      this.modelDeliveries = new Map();
      this.workerActivity = new Map();
      this.buildingActivity = new Map();
      this.memoryCanvas = document.createElement("canvas");
      this.memoryNeedsRefine = false;
      // Retain the composite path as an independent visual reference for QA.
      this.groundCanvas = options.compositeGround
        ? document.createElement("canvas")
        : null;
      this.cacheFloor = options.cacheFloor !== false;
      this.floorImages = new Map();
      this.floorPixels = 0;
      this.unitSprites = new Map();
      this.spritePixels = 0;
      this.fogPaths = {};
      this.scars = [];
      this.effectSerial = 0;
      this.camera = { x: 720, y: 500, scale: 1 };
      this.time = 0;
      this.width = 1;
      this.height = 1;
      this.shake = 0;
      this.resize();
    }
    z(x, y) {
      return E.elevation(x, y, this.mapId);
    }
    p(x, y, z = 0) {
      return [x, y - this.z(x, y) - z];
    }
    floor(c) {
      const limit = 4 * 1024 * 1024,
        pixels = c.canvas.width * c.canvas.height;
      // Cache only the two presented passes (surface and offset shadow).
      // Memory painting and very large viewports use the direct path, avoiding
      // eviction/rebuild thrashing when both images cannot fit in the budget.
      if (!this.cacheFloor || c !== this.c || pixels * 2 > limit)
        return this.paintFloor(c);
      const m = c.getTransform(),
        key = [
          this.mapId,
          c.canvas.width,
          c.canvas.height,
          m.a,
          m.b,
          m.c,
          m.d,
          m.e,
          m.f,
        ].join(":");
      let entry = this.floorImages.get(key);
      const evict = () => {
        const oldest = this.floorImages.keys().next().value,
          image = this.floorImages.get(oldest);
        this.floorPixels -= image.pixels;
        if (image.canvas) image.canvas.width = image.canvas.height = 0;
        this.floorImages.delete(oldest);
      };
      if (!entry) {
        this.floorImages.set(key, { pixels: 0 });
        while (this.floorImages.size > 3) evict();
        // A moving camera uses the original texture directly. Only repeated
        // exact projections justify a viewport-sized raster image.
        return this.paintFloor(c);
      }
      this.floorImages.delete(key);
      this.floorImages.set(key, entry);
      if (!entry.canvas) {
        while (this.floorPixels + pixels > limit) evict();
        const canvas = document.createElement("canvas");
        canvas.width = c.canvas.width;
        canvas.height = c.canvas.height;
        const b = canvas.getContext("2d");
        b.setTransform(m);
        this.paintFloor(b);
        entry.canvas = canvas;
        entry.pixels = pixels;
        this.floorPixels += pixels;
      }
      // Preserve the destination clip, opacity and exact physical pixel phase.
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(entry.canvas, 0, 0);
      c.restore();
    }
    paintFloor(c) {
      const a = this.ground;
      c.drawImage(
        a,
        0,
        a.offsetY || 0,
        a.worldW || a.width,
        a.worldH || a.height,
      );
    }
    groundPoints(points) {
      if (!["highlands", "districts"].includes(this.mapId)) return points;
      const out = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[Math.max(0, i - 1)],
          b = points[i],
          n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 16));
        for (let k = i ? 1 : 0; k <= n; k++)
          out.push(
            this.p(
              a[0] + ((b[0] - a[0]) * k) / n,
              a[1] + ((b[1] - a[1]) * k) / n,
            ),
          );
      }
      return out;
    }
    groundLine(c, points, ...style) {
      line(c, this.groundPoints(points), ...style);
    }
    groundRing(c, x, y, r, color, width = 1) {
      if (!["highlands", "districts"].includes(this.mapId))
        return ring(c, x, y, r, color, width);
      const p = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i * TAU) / 48;
        p.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
      }
      this.groundLine(c, p, color, width);
    }
    shadow(c, x, y, shape, height, angle = 0) {
      if (!["highlands", "districts"].includes(this.mapId)) return;
      const T = E.terrain,
        base = T.height(x, y),
        co = Math.cos(angle),
        si = Math.sin(angle),
        footprint = shape.map(([a, b]) => [
          x + a * co - b * si,
          y + a * si + b * co,
        ]),
        bounds = footprint.reduce(
          (b, p) => [
            Math.min(b[0], p[0]),
            Math.min(b[1], p[1]),
            Math.max(b[2], p[0]),
            Math.max(b[3], p[1]),
          ],
          [x, y, x, y],
        ),
        reach = height + Math.max(0, base),
        x0 = Math.floor(bounds[0] / 40) * 40,
        y0 = Math.floor(bounds[1] / 40) * 40,
        x1 = Math.ceil((bounds[2] + reach * 0.7) / 40) * 40,
        y1 = Math.ceil((bounds[3] + reach * 0.5) / 40) * 40,
        key = [x0, y0, x1, y1].join(":"),
        cache = (this.shadowCells ||= new Map());
      let groups = cache.get(key);
      if (!groups) {
        groups = new Map();
        groups.complete = true;
        // Equal-height cells receive exactly the same silhouette. One compound
        // clip preserves the tiny cell seams without redrawing it in every cell.
        for (let yy = y0; yy < y1; yy += 40)
          for (let xx = x0; xx < x1; xx += 40) {
            if (T.level(xx + 20, yy + 20) < 0) {
              groups.complete = false;
              continue;
            }
            const z = T.height(xx + 20, yy + 20);
            if (
              [
                T.height(xx + 0.01, yy + 0.01),
                T.height(xx + 39.99, yy + 0.01),
                T.height(xx + 39.99, yy + 39.99),
                T.height(xx + 0.01, yy + 39.99),
              ].some((height) => height !== z)
            )
              groups.complete = false;
            if (!groups.has(z)) groups.set(z, new Path2D());
            const cells = groups.get(z);
            cells.moveTo(...this.p(xx + 0.01, yy + 0.01));
            cells.lineTo(...this.p(xx + 39.99, yy + 0.01));
            cells.lineTo(...this.p(xx + 39.99, yy + 39.99));
            cells.lineTo(...this.p(xx + 0.01, yy + 39.99));
            cells.closePath();
          }
        if (cache.size >= 512) cache.delete(cache.keys().next().value);
        cache.set(key, groups);
      }
      for (const [z, cells] of groups) {
        const drop = base + height - z;
        if (drop < 0) continue;
        c.save();
        // On uninterrupted flat ground the whole shadow already fits this
        // plane. Avoid a separate GPU clip for every soldier and weapon.
        if (!groups.complete || groups.size !== 1) c.clip(cells);
        const p = footprint.map(([a, b]) => [
          a + drop * 0.7,
          b + drop * 0.45 - z,
        ]);
        // The extrusion connects the silhouette to its contact footprint.
        poly(c, p, "#06141b4d");
        poly(
          c,
          footprint.map(([a, b]) => [a, b - z]),
          "#06141b28",
        );
        for (let i = 0; i < p.length; i++) {
          const j = (i + 1) % p.length;
          poly(
            c,
            [
              [footprint[i][0], footprint[i][1] - z],
              [footprint[j][0], footprint[j][1] - z],
              p[j],
              p[i],
            ],
            "#06141b24",
          );
        }
        c.restore();
      }
    }
    surface(x, y, pad = 0.3) {
      return [
        [x - pad, y - this.z(x + 0.01, y + 0.01) - pad],
        [x + 40 + pad, y - this.z(x + 39.99, y + 0.01) - pad],
        [x + 40 + pad, y + 40 - this.z(x + 39.99, y + 39.99) + pad],
        [x - pad, y + 40 - this.z(x + 0.01, y + 39.99) + pad],
      ];
    }
    occlude(c, x, y, z, r = 90) {
      if (!["highlands", "districts"].includes(this.mapId)) return;
      const T = E.terrain;
      for (let yy = Math.ceil(y / 40) * 40; yy < y + 200; yy += 40)
        for (let xx = Math.floor((x - r) / 40) * 40; xx < x + r; xx += 40) {
          if (T.height(xx + 20, yy + 20) <= z + 24) continue;
          const cut = new Path2D();
          cut.rect(-500, -500, T.map.W + 1000, T.map.H + 1000);
          const p = this.surface(xx, yy);
          cut.moveTo(...p[0]);
          for (let i = 1; i < 4; i++) cut.lineTo(...p[i]);
          cut.closePath();
          c.clip(cut, "evenodd");
        }
    }
    covered(u) {
      if (!["highlands", "districts"].includes(this.mapId)) return false;
      const p = this.screen(u.x, u.y),
        q = this.world(p.x, p.y - 30 * this.camera.scale * Y);
      return q.y > u.y + 1 && this.z(q.x, q.y) > this.z(u.x, u.y) + 30;
    }
    wreckOpacity(u, s) {
      if (u.hp > 0 || !E.C[u.kind].speed || u.kind === "hero") return 1;
      if (!this.modelDeaths.has(u.id)) this.modelDeaths.set(u.id, s.t);
      return Math.max(
        0,
        Math.min(1, (12 - (s.t - this.modelDeaths.get(u.id))) / 3),
      );
    }
    objectShadow(c, u, s) {
      const opacity = s ? this.wreckOpacity(u, s) : 1;
      if (!opacity) return;
      c.save();
      c.globalAlpha *= opacity;
      this.occlude(c, u.x, u.y, this.z(u.x, u.y), E.C[u.kind].r + 100);
      if (u.construction) {
        const b = E.construction.rect(u),
          w = b.w * 0.43,
          h = b.h * 0.4;
        this.shadow(
          c,
          u.x,
          u.y,
          [
            [-w, -h],
            [w, -h],
            [w, h],
            [-w, h],
          ],
          u.hp <= 0 ? 5 : u.build > 0 ? 18 : 34,
        );
      } else {
        const pose = s
          ? this.pose(u, s, { reduced: false })
          : this.poses.get(u.id) || { angle: u.angle || 0 };
        for (const part of unitModels.shadows(u, pose))
          this.shadow(c, u.x, u.y, part.shape, part.height, part.angle);
      }
      c.restore();
    }
    resize() {
      this.width = innerWidth;
      this.height = innerHeight;
      this.origin = { x: this.width / 2, y: this.height * 0.49 };
      this.dpr = Math.min(devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.sky = sky(this.width, this.height);
    }
    world(x, y) {
      const a = this.camera;
      const wx = (x - this.origin.x) / a.scale + a.x,
        flat = (y - this.origin.y) / (a.scale * Y) + a.y;
      if (!["highlands", "districts"].includes(this.mapId))
        return { x: wx, y: flat };
      let best = null,
        error = Infinity;
      for (let yy = flat - 48; yy <= flat + 144; yy += 2) {
        if (E.terrain.level(wx, yy) < 0) continue;
        const d = Math.abs(yy - this.z(wx, yy) - flat);
        if (d < error || (d === error && yy > best)) {
          best = yy;
          error = d;
        }
      }
      if (best !== null && error < 3) {
        for (let i = 0; i < 4; i++) best = flat + this.z(wx, best);
        return { x: wx, y: best };
      }
      return { x: wx, y: flat };
    }
    aim(x, y, hero) {
      const height = E.MOUNTS.hero,
        p = this.world(x, y + height * this.camera.scale * Y),
        z =
          E.terrain.level(p.x, p.y) < 0
            ? this.z(hero.x, hero.y)
            : this.z(p.x, p.y);
      // In a void use the hero's firing plane; do not tilt a flat shot into
      // the platform just because its cursor is outside walkable terrain.
      if (E.terrain.level(p.x, p.y) < 0)
        p.y =
          (y - this.origin.y) / (this.camera.scale * Y) +
          this.camera.y +
          z +
          height;
      return { ...p, z: z + height };
    }
    screen(x, y, height = 0) {
      const a = this.camera;
      return {
        x: (x - a.x) * a.scale + this.origin.x,
        y: (y - this.z(x, y) - height - a.y) * a.scale * Y + this.origin.y,
      };
    }
    // Include model height, shadows and weapon tips beyond the unit's ground position.
    inView(x, y, rx = 160, ry = rx) {
      // Memory is drawn into an oversized world-aligned window. Include its
      // margin too, otherwise newly exposed edges would contain missing objects.
      if (this.memoryBounds) {
        const b = this.memoryBounds,
          yy = y - this.z(x, y);
        return (
          x + rx >= b.left &&
          x - rx <= b.right &&
          yy + ry >= b.top &&
          yy - ry <= b.bottom
        );
      }
      const p = this.screen(x, y),
        a = this.camera;
      return (
        p.x + rx * a.scale >= 0 &&
        p.x - rx * a.scale <= this.width &&
        p.y + ry * a.scale * Y >= 0 &&
        p.y - ry * a.scale * Y <= this.height
      );
    }
    add(events, reduced) {
      for (const e of events) {
        if (
          e.type === "care-door" || (e.type === "reinforce" &&
          ["rifle", "scout", "artillery", "drone"].includes(e.action))
        ) {
          this.modelExits.set(e.x + ":" + e.y, this.modelClock || 0);
          if (this.modelExits.size > 128)
            this.modelExits.delete(this.modelExits.keys().next().value);
        }
        const seed = this.effectSerial++ * 1.618;
        if (["destroy", "blast"].includes(e.type))
          this.scars.push({
            x: e.x,
            y: e.y,
            r: e.type === "blast" ? 36 : (E.C[e.kind]?.r || 16) * 0.9,
            seed,
          });
        if (
          (!reduced || e.type === "order") &&
          [
            "hit",
            "spark",
            "destroy",
            "blast",
            "dash",
            "online",
            "order",
            "shield",
            "collect",
            "build",
            "post-ready",
            "repair-ready",
            "salvage",
            "breach",
          ].includes(e.type)
        ) {
          this.fx.push({
            ...e,
            seed,
            life: 0,
            max: ["destroy", "blast"].includes(e.type)
              ? 1.1
              : e.type === "order"
                ? 0.8
                : ["hit", "spark", "dash"].includes(e.type)
                  ? 0.28
                  : 0.65,
          });
          if (["blast", "destroy"].includes(e.type))
            this.shake = Math.min(2, this.shake + 0.8);
        }
      }
      this.scars = this.scars.slice(-40);
      this.fx = this.fx.slice(-96);
    }
    render(s, ui, dt) {
      if (E.fogged(s)) {
        if (ui.mode === "menu") {
          this.preview ||= E.make("frontier-5");
          s = this.preview;
        } else if (!s.fog) s = E.observe(s);
      }
      if (!s.fog) {
        this.memoryNeedsRefine = false;
        this.memoryTransform = null;
      }
      const world = E.map(s);
      this.modelClock = s.t;
      this.deliveryActivity(s);
      this.serviceActivity(s);
      if (this.mapId !== world.id) {
        this.ground = terrain(world);
        this.mapId = world.id;
        this.networkRoute = null;
      }
      this.frameDt = dt;
      if (ui.reduced) {
        this.fx = this.fx.filter((f) => f.type === "order");
        this.shake = 0;
      }
      const active = ui.mode === "playing" && s.status === "playing";
      if (!ui.reduced && (active || ui.mode === "menu")) this.time += dt;

      let c = this.c;
      const w = this.width,
        h = this.height,
        hero = E.hero(s),
        mobile = w < 700,
        overview = ui.mode === "tactical",
        menu = ui.mode === "menu";
      const landscape = overview && w > h && h <= 500;
      const inspecting = !overview && !menu && ui.combatFocus;
      const bounds = overview && ui.mapArea;
      const areaW = bounds
          ? Math.max(80, bounds.right - bounds.x)
          : landscape
            ? w - 240
            : w - 30,
        areaH = bounds
          ? Math.max(80, bounds.bottom - bounds.y)
          : h - (landscape ? 120 : mobile ? 295 : 230);
      this.fitScale = Math.max(
        0.04,
        Math.min(areaW / world.W, areaH / (world.H * Y)),
      );
      this.origin = {
        x: landscape ? (w - 230) / 2 : w / 2,
        y: landscape
          ? (h + 45) / 2
          : overview && mobile
            ? h * 0.49 - 14
            : h * 0.49,
      };
      if (
        ["highlands", "districts"].includes(world.id) &&
        !overview &&
        !menu &&
        w > h &&
        h < 500
      )
        this.origin.y = h * 0.52;
      if (bounds) {
        this.origin.x = (bounds.x + bounds.right) / 2;
        this.origin.y = (bounds.y + bounds.bottom) / 2;
      }
      let scale = overview
        ? this.tactical.overview
          ? this.fitScale
          : this.tactical.zoom
        : menu
          ? Math.max(w / (world.W * 1.25), h / world.H)
          : ["highlands", "districts"].includes(world.id)
            ? w < h
              ? Math.min(0.72, Math.max(0.52, w / 600))
              : h < 500
                ? Math.min(0.65, (h - 145) / (540 * Y))
                : Math.min(1.05, Math.max(0.86, h / 1000))
            : Math.min(1.32, Math.max(0.95, h / 660));
      scale = Math.max(
        overview && this.tactical.overview ? 0.04 : overview ? 0.1 : 0.22,
        scale,
      );
      let tx = overview
        ? this.tactical.overview
          ? world.W / 2
          : this.tactical.x
        : menu
          ? world.W * 0.54
          : inspecting
            ? inspecting.x
            : hero.x;
      let ty = overview
        ? this.tactical.overview
          ? world.H / 2
          : this.tactical.y
        : menu
          ? world.H * 0.48
          : inspecting
            ? inspecting.y - this.z(inspecting.x, inspecting.y)
            : hero.y - this.z(hero.x, hero.y);
      if (overview && !this.tactical.overview) {
        const half = areaW / (2 * scale),
          halfY = areaH / (2 * scale * Y);
        tx =
          half > world.W / 2
            ? world.W / 2
            : E.clamp(tx, half - 25, world.W - half + 25);
        ty =
          halfY > world.H / 2
            ? world.H / 2
            : E.clamp(ty, halfY - 25, world.H - halfY + 25);
        this.tactical.x = tx;
        this.tactical.y = ty;
      } else if (!overview && !menu) {
        const high = ["highlands", "districts"].includes(world.id),
          portrait = w < h,
          short = w > h && h < 500;
        // Aim changes the weapon, not the camera. Follow the hero while keeping
        // tactical pan/zoom and the safe area around mobile controls independent.
        const half = w / (2 * scale),
          halfY = (h - 70) / (2 * scale * Y);
        tx =
          half > world.W / 2
            ? world.W / 2
            : E.clamp(tx, half - 55, world.W - half + 55);
        ty =
          halfY > world.H / 2
            ? world.H / 2
            : E.clamp(ty, halfY - 65, world.H - halfY + 65);
        if (high && !inspecting) {
          // The projected scout takes priority over rectangular world bounds:
          // high ledges and edge paths must not put it behind phone controls.
          const side = short ? 154 : 24,
            top = short ? 75 : portrait ? 126 : 96,
            bottom = h - (portrait ? 220 : short ? 70 : 100),
            groundY = hero.y - this.z(hero.x, hero.y);
          tx = E.clamp(
            tx,
            hero.x - (w - side - this.origin.x) / scale,
            hero.x - (side - this.origin.x) / scale,
          );
          ty = E.clamp(
            ty,
            groundY - (bottom - this.origin.y) / (scale * Y),
            groundY - (top - this.origin.y) / (scale * Y),
          );
          const mini = ui.minimapRect,
            sx = (hero.x - tx) * scale + this.origin.x,
            sy = (groundY - ty) * scale * Y + this.origin.y;
          if (
            mini &&
            sx > mini.left - 18 &&
            sx < mini.right + 18 &&
            sy > mini.top - 18 &&
            sy < mini.bottom + 18 &&
            mini.right + 18 < w - side
          )
            tx = hero.x - (mini.right + 18 - this.origin.x) / scale;
        }
      }
      if (ui.selecting && !menu && ui.mode !== "playing") {
        tx = this.camera.x;
        ty = this.camera.y;
        scale = this.camera.scale;
      }
      // Placement coordinates must stay under the pointer while confirming a footprint.
      const blend = ui.placement ? 1 : 1 - Math.exp(-dt * 8);
      // Direct assignment avoids subpixel cancellation on the first still frame.
      this.camera.x = ui.reduced
        ? tx
        : this.camera.x + (tx - this.camera.x) * blend;
      this.camera.y = ui.reduced
        ? ty
        : this.camera.y + (ty - this.camera.y) * blend;
      this.camera.scale = ui.reduced
        ? scale
        : this.camera.scale + (scale - this.camera.scale) * blend;
      this.cameraSettled = true;
      for (const [key, target] of [
        ["x", tx],
        ["y", ty],
        ["scale", scale],
      ]) {
        // Stop easing once its remaining screen displacement is under 1/64
        // physical pixel, rather than repainting seconds of invisible motion.
        const epsilon =
          key === "scale"
            ? 1 / (64 * this.dpr * Math.max(world.W, world.H))
            : 1 / (64 * this.dpr * scale * (key === "y" ? Y : 1));
        if (Math.abs(this.camera[key] - target) < epsilon)
          this.camera[key] = target;
        else this.cameraSettled = false;
      }
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.fillStyle = "#0b171d";
      c.fillRect(0, 0, w, h);
      c.drawImage(this.sky, 0, 0);
      if (!ui.reduced) {
        for (let i = 0; i < 8; i++) {
          const x = (i * 277.1 + this.time * 2) % w,
            y = (i * 173.7 + this.time * 0.4) % h;
          c.fillStyle = "#b9d7c321";
          c.fillRect(x, y, 1.2, 1.2);
        }
      }
      const cam = this.camera;
      c.save();
      c.translate(this.origin.x, this.origin.y);
      if (this.shake && active && !ui.touch && !ui.reduced && !ui.selecting)
        c.translate(
          Math.sin(this.time * 87) * this.shake,
          Math.cos(this.time * 71) * this.shake,
        );
      this.shake = Math.max(0, this.shake - dt * 15);
      c.scale(cam.scale, cam.scale * Y);
      c.translate(-cam.x, -cam.y);
      if (s.fog) {
        // Prepare each mask once. All ground passes and cliff batches in this
        // frame share it, including the separately observed memory layer.
        this.fogPath(s.fog, "visible");
        this.fogPath(s.fog, "explored");
        this.frameFog = s.fog;
        this.frameWalls = { visible: new Map(), explored: new Map() };
        this.memory(c, s, ui);
        if (this.groundCanvas) c = this.beginLayer(this.groundCanvas, c);
        else {
          // Clip once on the destination. Copying a freshly painted full-screen
          // canvas forced a raster flush/transfer on every frame, even at rest.
          c.save();
          this.fogClip(c, s.fog, "visible");
        }
      }
      c.save();
      c.translate(8, 30);
      c.globalAlpha = 0.45;
      this.floor(c);
      c.restore();
      this.floor(c);
      this.debris(c);
      if (s.relay.online) {
        const offset = E.development.expedition(s) ? 560 : 0;
        c.save();
        c.setLineDash([12, 8]);
        c.lineDashOffset = ui.reduced ? 0 : -this.time * 15;
        line(
          c,
          ["highlands", "districts"].includes(this.mapId)
            ? (this.networkRoute ||= E.pathTo(
                s.units.find((u) => u.kind === "base"),
                { ...s.relay, map: this.mapId },
                8,
              ).map((p) => this.p(p.x, p.y)))
            : s.campaign
              ? [
                  [135, 1140 + offset],
                  [535, 1140 + offset],
                  [780, 1010 + offset],
                  [1340, 1010 + offset],
                  [s.relay.x, s.relay.y],
                ]
              : [
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
        this.groundRing(c, s.relay.x, s.relay.y, 140, "#9edcc615", 1);
      }
      this.industry(c, s, ui);
      this.strategy(c, s, ui);
      this.relay(c, s, ui);
      this.watch(c, s, ui);
      if (["highlands", "districts"].includes(this.mapId)) {
        for (const b of world.walls)
          if (
            this.inView(b.x + b.w / 2, b.y + b.h / 2, b.w + 120, b.h + 120) &&
            this.wallKnown(b, s.fog, "visible")
          )
            this.shadow(
              c,
              b.x + b.w / 2,
              b.y + b.h / 2,
              [
                [-b.w / 2, -b.h / 2],
                [b.w / 2, -b.h / 2],
                [b.w / 2, b.h / 2],
                [-b.w / 2, b.h / 2],
              ],
              54,
            );
        for (const u of s.units)
          if (!u.care?.inside && this.inView(u.x, u.y)) this.objectShadow(c, u, s);
      }
      if (overview || (ui.mode === "playing" && ui.selectionIds != null)) {
        for (const u of s.units.filter(
          (u) =>
            u.team === 0 && !u.care?.inside &&
            u.hp > 0 &&
            (ui.selectionIds != null
              ? ui.selectionIds.includes(u.id)
              : u.group === ui.group),
        )) {
          this.groundRing(c, u.x, u.y, E.C[u.kind].r + 10, "#c8edda", 2);
          if (overview && u.path.length) {
            c.save();
            c.setLineDash([5, 7]);
            this.groundLine(
              c,
              [[u.x, u.y], ...u.path.map((p) => [p.x, p.y])],
              "#b6e6d17a",
              2,
            );
            c.restore();
            const p = u.path[u.path.length - 1];
            this.groundRing(c, p.x, p.y, 12, "#c8edda", 2);
          }
        }
      }
      for (const u of s.units) {
        if (u.care?.inside) continue;
        const area = E.dangerArea(s, u);
        if (area)
          this.danger(
            c,
            area,
            u.combat.time / Math.max(0.01, u.combat.total),
            ui.reduced,
            s.t,
          );
        if (
          u.hp > 0 &&
          u.wind > 0 &&
          u.target &&
          !["runner", "flamer", "bomber", "mortar"].includes(u.kind) &&
          !(u.kind === "bastion" && area)
        ) {
          c.save();
          c.globalAlpha =
            0.3 +
            0.4 *
              (u.combat
                ? 1 - u.combat.time / u.combat.total
                : Math.max(0, 0.65 - u.wind));
          line(
            c,
            [
              this.p(u.x, u.y, MOUNTS[u.kind] || 19),
              this.p(u.target.x, u.target.y),
            ],
            "#f4ae89",
            1.4,
          );
          this.groundRing(
            c,
            u.target.x,
            u.target.y,
            u.kind === "rocket" ? 20 : 13,
            "#f4ae89",
            u.kind === "rocket" ? 2 : 1,
          );
          if (u.kind === "rocket") {
            c.setLineDash([3, 5]);
            this.groundRing(c, u.target.x, u.target.y, 27, "#f4ae89", 1);
          }
          c.restore();
        }
      }
      const objects = [];
      for (const b of world.walls)
        if (
          this.wallKnown(b, s.fog, "visible") &&
          this.inView(
            b.x + b.w / 2,
            b.y + b.h / 2,
            b.w * 0.65 + 80,
            b.h * 0.65 + 100,
          )
        )
          objects.push({ ...b, wall: true, sort: b.y + b.h });
      for (const u of s.units) {
        if (u.care?.inside) continue;
        if (this.inView(u.x, u.y))
          objects.push({
            ...u,
            sort: u.y + (u.construction ? E.construction.rect(u).h / 2 : 0),
          });
        else this.pose(u, s, ui); // Keep travel animation continuous when the camera returns.
      }
      for (const f of this.ground.faces || [])
        if (this.inView(f.x, f.y, 80, 200)) objects.push({ ...f, cliff: true });
      objects.sort((a, b) => a.sort - b.sort);
      // Knowledge selects whole models; the ground mask must not cut off roofs.
      if (s.fog) {
        c.restore();
        if (this.groundCanvas) {
          c = this.c;
          c.save();
          this.fogClip(c, s.fog, "visible");
          this.drawLayer(c, this.groundCanvas);
          c.restore();
        }
      }
      this.drawObjects(c, objects, s, ui, "visible");
      if (overview && ui.placement) this.placementOverlay(c, s, ui.placement);
      if (s.fog) {
        c.save();
        this.fogClip(c, s.fog, "visible");
      }
      // Elevated flights share their height with collision tests; legacy flights keep their visual arc.
      for (const b of s.bullets) {
        const owner = s.units.find((u) => u.id === b.owner),
          mount = MOUNTS[owner?.kind] || 16;
        const speed = Math.hypot(b.vx, b.vy),
          start = { x: b.x - b.vx * b.age, y: b.y - b.vy * b.age };
        const duration = Math.max(
            0.01,
            Math.hypot(b.tx - start.x, b.ty - start.y) / speed,
          ),
          progress = Math.min(1, b.age / duration),
          z =
            E.projectileHeight(b) ??
            (owner?.kind === "hero"
              ? MOUNTS.hero
              : mount * (1 - progress) + 10 * progress);
        if (b.kind === "missile") {
          const a = Math.atan2(b.vy, b.vx);
          c.save();
          c.translate(b.x, b.y - z);
          c.rotate(a);
          line(
            c,
            [
              [-28, 0],
              [-6, 0],
            ],
            "#efae8c35",
            5,
          );
          line(
            c,
            [
              [-17, 0],
              [-5, 0],
            ],
            "#f1d4a8b0",
            2,
          );
          poly(
            c,
            [
              [8, 0],
              [0, -3],
              [-7, -3],
              [-9, -6],
              [-8, 0],
              [-9, 6],
              [-7, 3],
              [0, 3],
            ],
            "#d4bca2",
            "#7c6658",
          );
          c.restore();
        } else if (b.kind === "shell") {
          const arcHeight =
            (b.z0 === undefined ? Math.sin(progress * Math.PI) * 55 : 0) + z;
          if (!["highlands", "districts"].includes(this.mapId))
            ellipse(c, b.x, b.y, 5, 3, "#0004");
          line(
            c,
            [
              [b.x - b.vx * 0.025, b.y - arcHeight - b.vy * 0.025],
              [b.x, b.y - arcHeight],
            ],
            "#d4e4bd9c",
            2.5,
          );
          ellipse(c, b.x, b.y - arcHeight, 3, 3, "#e5efd0");
          if (b.team && b.radius)
            this.danger(
              c,
              E.impactArea(s, { x: b.tx, y: b.ty }, b.radius),
              0,
              ui.reduced,
              s.t,
            );
          else this.groundRing(c, b.tx, b.ty, 30, "#c5dbab3a");
        } else {
          const len = b.team ? 11 : 18,
            color = b.team ? "#f1b596" : "#c7efdc";
          line(
            c,
            [
              [b.x - (b.vx / 800) * len, b.y - z - (b.vy / 800) * len],
              [b.x, b.y - z],
            ],
            color,
            b.team ? 2.2 : 1.7,
          );
        }
      }
      // A small outline keeps the scout locatable when a tall cover piece hides the body.
      if (
        !overview &&
        !menu && !hero.care?.inside &&
        (this.covered(hero) ||
          world.walls.some(
            (b) =>
              hero.x > b.x - 12 &&
              hero.x < b.x + b.w + 12 &&
              hero.y > b.y - 55 &&
              hero.y < b.y + 12,
          ))
      ) {
        c.save();
        c.translate(0, -this.z(hero.x, hero.y));
        arc(c, hero.x, hero.y, 18, 0, Math.PI * 2, "#c4e8dbad", 1.4);
        ellipse(c, hero.x, hero.y - 17, 2, 2, "#d3f1e4");
        c.restore();
      }
      this.effects(c, dt, ui, active);
      const task = s.observationTask || E.objective(s),
        objective = task.target;
      if (objective && s.status === "playing") {
        const radius = task.radius;
        const pulse = ui.reduced ? 0 : Math.sin(this.time * 2) * 3;
        this.groundRing(
          c,
          objective.x,
          objective.y,
          radius + pulse,
          "#d5dab078",
          1.4,
        );
        const yy = objective.y - this.z(objective.x, objective.y) - radius - 25;
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
      if (s.fog) {
        c.restore();
        // Acknowledgement of the player's own requested point reveals no route or terrain.
        for (const f of this.fx)
          if (f.type === "order" && f.life <= f.max) {
            c.save();
            c.globalAlpha = (1 - f.life / f.max) * 0.65;
            ring(
              c,
              f.x,
              f.y - this.z(f.x, f.y),
              14 + (f.life / f.max) * 22,
              f.intent === "attack" ? "#ff7771" : f.intent === "repair" ? "#99e6e2" : "#afe1cc",
              1.3,
            );
            c.restore();
          }
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
      if (!menu) this.productionBars(s, ui);
      if (overview) {
        c.font = "9px Segoe UI";
        c.textAlign = "center";
        c.textBaseline = "middle";
        for (const [i, pad] of (E.construction.enabled(s)
          ? []
          : E.pads(s)
        ).entries()) {
          const p = this.screen(pad.x, pad.y);
          ellipse(c, p.x, p.y + 12, 7, 7, "#112522", "#b8d4bc88");
          c.fillStyle = "#c9e0ca";
          c.fillText(String(i + 1), p.x, p.y + 12);
        }
        for (const cache of s.caches.filter((c) => !c.taken)) {
          const p = this.screen(cache.x, cache.y);
          c.fillStyle = "#dfd3a7";
          c.fillText(
            String(s.campaign ? E.development.rules(s).cache : 40),
            p.x + 13,
            p.y + 6,
          );
        }
        c.textBaseline = "alphabetic";
        const labels = [
          [s.units.find((u) => u.kind === "jammer"), "ГЛУШИТЕЛЬ"],
          [s.relay, "УЗЕЛ СВЯЗИ"],
          [s.units.find((u) => u.kind === "citadel"), "ЦИТАДЕЛЬ"],
          [s.units.find((u) => u.kind === "base"), "ПОСАДОЧНЫЙ УЗЕЛ"],
          ...(s.terminals || [s.terminal]).map((p) => [p, "ТЕРМИНАЛ"]),
          ...s.units
            .filter((u) => u.kind === "bastion")
            .map((u) => [
              u,
              (u.sector === "north" ? "БАСТИОН" : "АРСЕНАЛ") +
                (u.hp <= 0 ? " · ПОДАВЛЕН" : ""),
            ]),
        ];
        for (const [object, label] of labels) {
          if (!object || object.unknown || !E.explored(s, 0, object)) continue;
          const { x, y } = object;
          const p = this.screen(x, y);
          if (p.x < 20 || p.x > w - 20 || p.y < 85 || p.y > h - 120) continue;
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
        const p = Number.isFinite(ui.aim.z)
          ? {
              x: (ui.aim.x - this.camera.x) * this.camera.scale + this.origin.x,
              y:
                (ui.aim.y - ui.aim.z - this.camera.y) * this.camera.scale * Y +
                this.origin.y,
            }
          : this.screen(ui.aim.x, ui.aim.y, E.MOUNTS.hero);
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
    fogClip(c, fog, kind) {
      const prepared =
        this.frameFog === fog || this.frameFog?.memory?.fog === fog;
      c.clip(prepared ? this.fogPaths[kind].path : this.fogPath(fog, kind));
      for (const cut of this.fogPaths[kind].blockers || [])
        c.clip(cut, "evenodd");
    }
    beginLayer(canvas, target) {
      if (
        canvas.width !== this.canvas.width ||
        canvas.height !== this.canvas.height
      ) {
        canvas.width = this.canvas.width;
        canvas.height = this.canvas.height;
      }
      const c = canvas.getContext("2d");
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.save();
      c.setTransform(target.getTransform());
      return c;
    }
    drawLayer(c, canvas) {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(canvas, 0, 0);
      c.restore();
    }
    fogPlanes() {
      if (this.planes?.map === this.mapId) return this.planes.list;
      const world = E.map(this.mapId),
        list = [];
      if (!["highlands", "districts"].includes(this.mapId))
        list.push({ x: 0, y: 0, w: world.W, h: world.H, a: 0, b: 0, z: 0 });
      else
        for (let y = 0; y < world.H; y += 40) {
          const row = [];
          for (let x = 0; x < world.W; x += 40) {
            const link = world.links.find(
                (p) =>
                  x + 20 >= p.x &&
                  x + 20 < p.x + p.w &&
                  y + 20 >= p.y &&
                  y + 20 < p.y + p.h,
              ),
              a =
                link?.axis === "x" ? ((link.to - link.from) * 72) / link.w : 0,
              b =
                link?.axis === "y" ? ((link.to - link.from) * 72) / link.h : 0,
              z = link
                ? link.from * 72 - a * link.x - b * link.y
                : this.z(x + 20, y + 20),
              previous = row[row.length - 1];
            if (
              previous &&
              previous.a === a &&
              previous.b === b &&
              previous.z === z
            )
              previous.w += 40;
            else row.push({ x, y, w: 40, h: 40, a, b, z });
          }
          for (const p of row) {
            const previous = list.findLast(
              (q) =>
                q.y + q.h === y &&
                q.x === p.x &&
                q.w === p.w &&
                q.a === p.a &&
                q.b === p.b &&
                q.z === p.z,
            );
            if (previous) previous.h += 40;
            else list.push(p);
          }
        }
      this.planes = { map: this.mapId, list };
      return list;
    }
    projectFog(polygons) {
      const path = new Path2D();
      for (const polygon of polygons) {
        const bounds = polygon.reduce(
          (b, [x, y]) => [
            Math.min(b[0], x),
            Math.min(b[1], y),
            Math.max(b[2], x),
            Math.max(b[3], y),
          ],
          [Infinity, Infinity, -Infinity, -Infinity],
        );
        for (const plane of this.fogPlanes()) {
          if (
            plane.x > bounds[2] ||
            plane.x + plane.w < bounds[0] ||
            plane.y > bounds[3] ||
            plane.y + plane.h < bounds[1]
          )
            continue;
          const points = clipPolygon(polygon, plane);
          points.forEach(([x, y], i) => {
            const yy = y - plane.a * x - plane.b * y - plane.z;
            if (i) path.lineTo(x, yy);
            else path.moveTo(x, yy);
          });
          if (points.length) path.closePath();
        }
      }
      return path;
    }
    wallKnown(w, fog, kind) {
      if (!fog) return true;
      const cached =
        this.frameFog === fog || this.frameFog?.memory?.fog === fog
          ? this.frameWalls?.[kind]
          : null;
      if (cached?.has(w)) return cached.get(w);
      const observers =
        kind === "visible"
          ? fog.observers.filter(
              (u) =>
                Math.hypot(
                  u.x - E.clamp(u.x, w.x - 1, w.x + w.w + 1),
                  u.y - E.clamp(u.y, w.y - 1, w.y + w.h + 1),
                ) <= u.radius,
            )
          : [];
      if (kind === "visible" && !observers.length) {
        cached?.set(w, false);
        return false;
      }
      for (let side = 0; side < 4; side++) {
        const horizontal = side % 2 === 0,
          length = horizontal ? w.w : w.h,
          count = Math.ceil(length / 20);
        for (let i = 0; i <= count; i++) {
          const p = {
            map: this.mapId,
            x: horizontal
              ? w.x + (length * i) / count
              : w.x + (side === 1 ? w.w + 1 : -1),
            y: horizontal
              ? w.y + (side === 0 ? -1 : w.h + 1)
              : w.y + (length * i) / count,
          };
          if (
            kind === "visible"
              ? observers.some((u) => E.dist(u, p) <= u.radius && E.clear(u, p))
              : fog.explored[
                  Math.floor(p.y / fog.cell) * fog.cols +
                    Math.floor(p.x / fog.cell)
                ]
          ) {
            cached?.set(w, true);
            return true;
          }
        }
      }
      cached?.set(w, false);
      return false;
    }
    fogObject(c, object, s, ui, kind) {
      if (object.cliff) {
        c.save();
        if (s.fog) this.fogClip(c, s.fog, kind);
        cliffFace(c, object);
        c.restore();
      } else if (object.wall) this.wall(c, object, s.fog, kind);
      else this.unit(c, object, s, ui);
    }
    drawObjects(c, objects, s, ui, kind) {
      let cliffs = false;
      for (const object of objects) {
        if (object.cliff) {
          if (!cliffs) {
            c.save();
            if (s.fog) this.fogClip(c, s.fog, kind);
            cliffs = true;
          }
          cliffFace(c, object);
        } else {
          if (cliffs) c.restore();
          cliffs = false;
          this.fogObject(c, object, s, ui, kind);
        }
      }
      if (cliffs) c.restore();
    }
    fogPath(fog, kind) {
      const sources = fog.observers.map((u) =>
          [u.id, u.x, u.y, u.radius].join(":"),
        ),
        maskCode = this.mapId + ":" + fog[kind + "Code"],
        code = maskCode + (kind === "visible" ? ":" + sources.join(",") : ""),
        cached = this.fogPaths[kind];
      if (cached?.code === code) return cached.path;
      let path,
        polygons = [];
      if (kind === "visible") {
        const old = this.sightPaths || new Map();
        this.sightPaths = new Map();
        path = new Path2D();
        fog.observers.forEach((u, i) => {
          const key = this.mapId + ":" + sources[i],
            previous = old.get(key),
            polygon =
              previous?.polygon ||
              E.visionArea(this.mapId, u, u.radius).points.map((p) => [
                p.x,
                p.y,
              ]),
            projected = previous?.path || this.projectFog([polygon]);
          this.sightPaths.set(key, { path: projected, polygon });
          polygons.push(polygon);
          path.addPath(projected);
        });
      } else {
        polygons = fogContours(fog);
        path = this.projectFog(polygons);
      }
      const mask = fog[kind];
      if (["highlands", "districts"].includes(this.mapId)) {
        const terrain = this.fogTerrain(fog),
          faces = new Path2D(),
          rows = new Map();
        for (const edge of terrain.faces) {
          if (!mask[edge.index]) continue;
          if (!rows.has(edge.y))
            rows.set(edge.y, fogIntervals(polygons, edge.y - 0.01));
          for (const [a, b] of rows.get(edge.y)) {
            const left = Math.max(a, edge.x),
              right = Math.min(b, edge.x + fog.cell);
            if (right > left)
              faces.rect(
                left,
                edge.y - edge.z,
                right - left,
                edge.z - edge.low,
              );
          }
        }
        const blockers =
          cached?.maskCode === maskCode
            ? cached.blockers
            : terrain.blockers
                .filter(
                  (cell) =>
                    !mask[cell.index] && cell.behind.some((i) => mask[i]),
                )
                .map((cell) => {
                  if (!cell.cut) {
                    const cut = (cell.cut = new Path2D()),
                      p = this.surface(cell.x, cell.y),
                      world = E.map(this.mapId);
                    cut.rect(-500, -500, world.W + 1000, world.H + 1000);
                    cut.moveTo(...p[0]);
                    for (let i = 1; i < 4; i++) cut.lineTo(...p[i]);
                    cut.closePath();
                  }
                  return cell.cut;
                });
        path.addPath(faces);
        this.fogPaths[kind] = {
          code,
          path,
          polygons,
          blockers,
          faces,
          maskCode,
        };
        return path;
      }
      this.fogPaths[kind] = { code, path, polygons };
      return path;
    }
    fogTerrain(fog) {
      const key = [this.mapId, fog.cols, fog.rows, fog.cell].join(":");
      if (this.fogTerrainCache?.key === key) return this.fogTerrainCache;
      const heights = Float64Array.from(
          { length: fog.cols * fog.rows },
          (_, i) =>
            this.z(
              (i % fog.cols) * fog.cell + fog.cell / 2,
              Math.floor(i / fog.cols) * fog.cell + fog.cell / 2,
            ),
        ),
        faces = [],
        blockers = [];
      for (let y = 0; y < fog.rows; y++)
        for (let x = 0; x < fog.cols; x++) {
          const index = y * fog.cols + x,
            xx = x * fog.cell,
            yy = y * fog.cell,
            z = heights[index],
            low = this.z(xx + fog.cell / 2, yy + fog.cell + 0.01),
            behind = [];
          if (z > low + 4)
            faces.push({ index, x: xx, y: yy + fog.cell, z, low });
          if (z < 0) continue;
          for (let d = 1; d <= Math.min(5, y); d++)
            if (
              z >
              heights[(y - d) * fog.cols + x] +
                Math.max(1, (d - 1) * fog.cell - 8)
            )
              behind.push((y - d) * fog.cols + x);
          if (behind.length)
            blockers.push({ index, x: xx, y: yy, behind, cut: null });
        }
      return (this.fogTerrainCache = { key, faces, blockers });
    }
    memory(c, s, ui) {
      const canvas = this.memoryCanvas,
        transform = c.getTransform(),
        width = this.canvas.width,
        height = this.canvas.height,
        // Bound the extra raster area to about 25%, including narrow phones.
        // A large fixed margin made rapidly changing exploration too costly.
        padding =
          this.memoryPadding ??
          Math.min(96, Math.floor(Math.min(width, height) * 0.06));
      if (
        canvas.width !== width + padding * 2 ||
        canvas.height !== height + padding * 2
      ) {
        canvas.width = width + padding * 2;
        canvas.height = height + padding * 2;
        this.memoryKey = null;
      }
      const known = s.fog.memory,
        key = JSON.stringify(
          [
            this.mapId,
            canvas.width,
            canvas.height,
            transform.a,
            transform.b,
            transform.c,
            transform.d,
            s.fog.exploredCode,
            known.units,
            known.caches,
            known.watch,
            known.relay,
            known.terminal,
            known.terminals,
            known.campaign?.mines,
            known.campaign?.id,
            known.phase,
            E.pads(known),
          ],
          (name, value) => (name === "seenAt" ? undefined : value),
        );
      const anchor = this.memoryAnchor,
        dx = anchor ? transform.e - anchor.e : Infinity,
        dy = anchor ? transform.f - anchor.f : Infinity,
        previous = this.memoryTransform,
        stable =
          previous &&
          previous.a === transform.a &&
          previous.d === transform.d &&
          previous.e === transform.e &&
          previous.f === transform.f;
      this.memoryTransform = transform;
      if (
        this.memoryKey !== key ||
        Math.abs(dx) > padding ||
        Math.abs(dy) > padding ||
        (stable && (dx !== 0 || dy !== 0))
      ) {
        this.memoryNeedsRefine = false;
        this.memoryKey = key;
        this.memoryAnchor = { e: transform.e, f: transform.f };
        this.memoryBounds = {
          left: (-padding - transform.e) / transform.a,
          right: (width + padding - transform.e) / transform.a,
          top: (-padding - transform.f) / transform.d,
          bottom: (height + padding - transform.f) / transform.d,
        };
        try {
          this.paintMemory(canvas.getContext("2d"), s, ui, transform, padding);
        } catch (error) {
          this.memoryKey = null;
          throw error;
        } finally {
          this.memoryBounds = null;
        }
      } else this.memoryNeedsRefine = dx !== 0 || dy !== 0;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(
        canvas,
        padding - (transform.e - this.memoryAnchor.e),
        padding - (transform.f - this.memoryAnchor.f),
        width,
        height,
        0,
        0,
        width,
        height,
      );
      c.restore();
    }
    paintMemory(m, s, ui, transform, padding) {
      const canvas = m.canvas,
        known = s.fog.memory,
        world = E.map(s),
        still = {
          ...ui,
          mode: "paused",
          reduced: true,
          memory: true,
          selectedBuilding: null,
          selectionIds: [],
        };
      m.setTransform(1, 0, 0, 1, 0, 0);
      m.clearRect(0, 0, canvas.width, canvas.height);
      m.setTransform(
        transform.a,
        transform.b,
        transform.c,
        transform.d,
        transform.e + padding,
        transform.f + padding,
      );
      m.fillStyle = "#000";
      m.fillRect(-100, -140, world.W + 200, world.H + 280);
      m.save();
      this.fogClip(m, s.fog, "explored");
      this.floor(m);
      this.industry(m, known, still);
      this.strategy(m, known, still);
      this.relay(m, known, still);
      this.watch(m, known, still);
      const objects = [
        ...world.walls
          .filter(
            (w) =>
              this.wallKnown(w, s.fog, "explored") &&
              this.inView(
                w.x + w.w / 2,
                w.y + w.h / 2,
                w.w * 0.65 + 80,
                w.h * 0.65 + 100,
              ),
          )
          .map((w) => ({ ...w, wall: true, sort: w.y + w.h })),
        ...known.units
          .filter((u) => this.inView(u.x, u.y))
          .map((u) => ({
            ...u,
            sort: u.y + (u.construction ? E.construction.rect(u).h / 2 : 0),
          })),
      ].sort((a, b) => a.sort - b.sort);
      for (const o of objects)
        if (o.wall)
          this.shadow(
            m,
            o.x + o.w / 2,
            o.y + o.h / 2,
            [
              [-o.w / 2, -o.h / 2],
              [o.w / 2, -o.h / 2],
              [o.w / 2, o.h / 2],
              [-o.w / 2, o.h / 2],
            ],
            54,
          );
        else this.objectShadow(m, o);
      for (const f of this.ground.faces || [])
        if (this.inView(f.x, f.y, 80, 200)) objects.push({ ...f, cliff: true });
      objects.sort((a, b) => a.sort - b.sort);
      m.restore();
      this.drawObjects(m, objects, known, still, "explored");
      // Blend modes work on mobile WebKit too, where canvas filters may be absent.
      m.save();
      m.globalCompositeOperation = "saturation";
      m.fillStyle = "#000";
      m.fillRect(-100, -140, world.W + 200, world.H + 280);
      m.globalCompositeOperation = "source-atop";
      m.fillStyle = "rgba(0,0,0,.52)";
      m.fillRect(-100, -140, world.W + 200, world.H + 280);
      m.restore();
    }
    watch(c, s, ui) {
      for (const p of s.watch || []) {
        if (!this.inView(p.x, p.y)) continue;
        const color =
          p.side === 0
            ? "#a4edd9"
            : p.side === 1
              ? "#efae8c"
              : p.side === 2
                ? "#e0c393"
                : "#7c918b";
        c.save();
        this.shadow(
          c,
          p.x,
          p.y,
          [
            [-15, -9],
            [15, -9],
            [15, 9],
            [-15, 9],
          ],
          37,
        );
        c.translate(p.x, p.y - this.z(p.x, p.y));
        if (!["highlands", "districts"].includes(this.mapId))
          ellipse(c, 3, 6, 25, 16, "#06192280");
        for (let i = 0; i < 3; i++)
          slab(c, 12, 0, 22, 10, 0, 5, (i * TAU) / 3, MAT.graphite);
        slab(c, 0, 0, 13, 13, 5, 15, 0, MAT.dark);
        slab(c, 0, 0, 5, 5, 20, 13, 0, MAT.ally);
        plate(
          c,
          [
            [-13, -5],
            [0, -11],
            [13, -5],
            [10, 6],
            [-10, 6],
          ],
          31,
          4,
          0,
          MAT.ceramic,
        );
        for (const side of [-1, 1]) lamp(c, side * 8, 0, 37, 0, 2, color);
        seam(
          c,
          [
            [-6, 0],
            [6, 0],
          ],
          37,
          0,
          color,
          1.5,
        );
        if (p.side !== -1) ring(c, 0, 0, 28, color + "65", 1.2);
        c.restore();
      }
    }
    industry(c, s, ui) {
      if (!s.campaign) return;
      for (const m of s.campaign.mines) {
        if (!["highlands", "districts"].includes(this.mapId))
          ellipse(c, m.x, m.y + 5, 34, 21, "#071b2866");
        else
          this.shadow(
            c,
            m.x,
            m.y,
            [
              [-24, -16],
              [24, -16],
              [30, 10],
              [0, 22],
              [-24, 14],
            ],
            14,
          );
        const left = m.remaining / m.stock;
        for (let i = 0; i < 7; i++) {
          const a = i * 2.4,
            x = m.x + Math.cos(a) * 22,
            y = m.y + Math.sin(a) * 13;
          c.save();
          this.shadow(
            c,
            x,
            y,
            [
              [-8, -5],
              [1, -8],
              [9, -2],
              [6, 6],
              [-6, 7],
            ],
            3 + left * (7 + (i % 3) * 5),
            a,
          );
          c.translate(x, y - this.z(x, y));
          plate(
            c,
            [
              [-8, -5],
              [1, -8],
              [9, -2],
              [6, 6],
              [-6, 7],
            ],
            0,
            3 + left * (7 + (i % 3) * 5),
            a,
            {
              top: left ? "#b0b8a0" : "#526964",
              side: "#718b7d",
              front: "#526e67",
              edge: "#cfdbbd50",
            },
          );
          c.restore();
        }
        if (ui.mode === "tactical") {
          c.font = "10px Segoe UI";
          c.textAlign = "center";
          c.fillStyle = "#b1c8b8";
          c.fillText(String(m.remaining), m.x, m.y - this.z(m.x, m.y) + 34);
        }
      }
      for (const u of s.units) {
        if (
          u.hp <= 0 ||
          !u.rally ||
          ui.mode !== "tactical" ||
          (u.id !== ui.selectedBuilding && !ui.selectionIds?.includes(u.id))
        )
          continue;
        c.save();
        c.setLineDash([5, 8]);
        this.groundLine(
          c,
          [
            [u.x, u.y],
            [u.rally.x, u.rally.y],
          ],
          "#b2d6bf65",
          1,
        );
        c.restore();
        this.groundRing(c, u.rally.x, u.rally.y, 14, "#b2d6bf", 1.5);
      }
      const selectedBuilding = s.units.find(
        (u) => u.id === ui.selectedBuilding && u.hp > 0,
      );
      if (selectedBuilding?.construction && ui.mode === "tactical") {
        const b = E.construction.rect(selectedBuilding);
        this.groundLine(
          c,
          [
            [b.x, b.y],
            [b.x + b.w, b.y],
            [b.x + b.w, b.y + b.h],
            [b.x, b.y + b.h],
            [b.x, b.y],
          ],
          "#c8edda",
          2,
        );
      } else if (selectedBuilding && ui.mode === "tactical")
        this.groundRing(
          c,
          selectedBuilding.x,
          selectedBuilding.y,
          E.C[selectedBuilding.kind].r + 10,
          "#c8edda",
          2,
        );
      for (const camp of s.campaign.camps) {
        const source = s.units.find((u) => u.id === camp.source);
        if (!source || source.hp <= 0) continue;
        if (camp.warning > 0) {
          const pulse = ui.reduced ? 0 : Math.sin(s.t * 5) * 4;
          ring(c, source.x, source.y, 65 + pulse, "#e4a57a99", 2);
        }
        if (
          ui.mode === "tactical" &&
          this.camera.scale > 0.5 &&
          camp.reserve > 0
        ) {
          c.font = "10px Segoe UI";
          c.textAlign = "center";
          c.fillStyle = "#cca58c";
          c.fillText(
            "Резерв " + camp.reserve,
            source.x,
            source.y + E.C[source.kind].r + 33,
          );
        }
      }
    }
    strategy(c, s, ui) {
      const overview = ui.mode === "tactical",
        t = ui.reduced ? 0 : s.t;
      const posts = E.construction.enabled(s)
        ? s.units
            .filter((u) => u.kind === "outpost" && u.hp > 0)
            .map((u) => ({ x: u.x, y: u.y, id: u.site }))
        : E.pads(s);
      for (const p of posts) {
        c.save();
        c.translate(0, -this.z(p.x, p.y));
        const post = s.units.find(
          (u) => u.kind === "outpost" && u.site === p.id && u.hp > 0,
        );
        if (!post) {
          for (let i = 0; i < 4; i++)
            arc(
              c,
              p.x,
              p.y,
              32,
              (i * Math.PI) / 2 + 0.15,
              ((i + 1) * Math.PI) / 2 - 0.15,
              "#abcbb64a",
            );
          line(
            c,
            [
              [p.x - 7, p.y],
              [p.x + 7, p.y],
            ],
            "#abcbb65a",
          );
          line(
            c,
            [
              [p.x, p.y - 7],
              [p.x, p.y + 7],
            ],
            "#abcbb65a",
          );
        }
        if (post?.build === 0 && !E.support.enabled(s)) {
          if (overview) ring(c, p.x, p.y, 145, "#a9d9bb20");
          for (const u of s.units)
            if (
              u.team === 0 &&
              u.hp > 0 &&
              u.hp < E.C[u.kind].hp &&
              !["outpost", "base", "barracks", "foundry", "arsenal"].includes(
                u.kind,
              ) &&
              u.repair === 0 &&
              E.dist(u, post) < 145 &&
              E.clear(u, post)
            ) {
              const start = [post.x, post.y - 35],
                end = [u.x, u.y - 15 - this.z(u.x, u.y) + this.z(p.x, p.y)],
                middle = [
                  (start[0] + end[0]) / 2,
                  (start[1] + end[1]) / 2 - 14,
                ];
              c.beginPath();
              c.moveTo(...start);
              c.quadraticCurveTo(...middle, ...end);
              c.strokeStyle = "#9adcc650";
              c.lineWidth = 1;
              c.stroke();
              const a = ui.reduced ? 0.5 : (t * 1.1 + u.id * 0.17) % 1,
                b = 1 - a;
              ellipse(
                c,
                b * b * start[0] + 2 * b * a * middle[0] + a * a * end[0],
                b * b * start[1] + 2 * b * a * middle[1] + a * a * end[1],
                1.5,
                1.2,
                "#b1edcf",
              );
            }
        }
        c.restore();
      }
      for (const cache of s.caches) {
        c.save();
        this.shadow(
          c,
          cache.x,
          cache.y,
          [
            [-14, -10],
            [14, -10],
            [14, 10],
            [-14, 10],
          ],
          12,
        );
        c.translate(cache.x, cache.y - this.z(cache.x, cache.y));
        if (!["highlands", "districts"].includes(this.mapId))
          ellipse(c, 3, 4, 16, 11, "#0b202970");
        slab(c, 0, 0, 28, 20, 0, 3, 0, MAT.graphite);
        const gold = {
            top: "#b4ae88",
            front: "#7b8167",
            side: "#455e55",
            edge: "#d4d0a5",
          },
          open = cache.taken ? 1 : cache.charge;
        for (const side of [-1, 1]) {
          slab(
            c,
            side * (7 + open * 5),
            0,
            12,
            19,
            3 + open * 2,
            cache.taken ? 2 : 7,
            side * open * 0.15,
            gold,
          );
          seam(
            c,
            [
              [side * (7 + open * 5), -6],
              [side * (7 + open * 5), 6],
            ],
            11 + open * 2,
            0,
            "#e4d8ae",
            1.4,
          );
        }
        if (!cache.taken) {
          for (let i = 0; i < 3; i++)
            slab(c, -5 + i * 5, 0, 3, 12, 3, 3, 0, gold);
          lamp(c, 0, -1, 11, 0, 2, "#e0dcb6");
          if (cache.charge > 0)
            arc(
              c,
              0,
              0,
              22,
              -Math.PI / 2,
              -Math.PI / 2 + cache.charge * TAU,
              "#e3dcba",
              2,
            );
        }
        c.restore();
      }
      for (const terminal of s.terminals || [s.terminal])
        this.terminalPanel(c, { ...s, terminal }, ui);
    }
    terminalPanel(c, s, ui) {
      if (s.terminal.unknown) return;
      const t = s.t,
        terminal = s.terminal,
        { x, y } = terminal;
      c.save();
      this.shadow(
        c,
        x,
        y,
        [
          [-24, -18],
          [24, -18],
          [24, 18],
          [-24, 18],
        ],
        36,
      );
      c.translate(x, y - this.z(x, y));
      if (!["highlands", "districts"].includes(this.mapId))
        ellipse(c, 3, 5, 27, 18, "#071d2670");
      slab(c, 0, 0, 48, 32, 0, 5, 0, MAT.dark);
      slab(c, 0, 0, 31, 24, 5, 10, 0, MAT.enemy);
      for (const side of [-1, 1]) {
        slab(c, side * 21, 0, 7, 28, 5, 19, 0, MAT.copper);
        seam(
          c,
          [
            [side * 21, -8],
            [side * 21, 8],
          ],
          25,
          0,
          "#3e4b47",
          2,
        );
      }
      plate(
        c,
        [
          [-13, -12],
          [13, -12],
          [16, 7],
          [-16, 7],
        ],
        15,
        5,
        0,
        MAT.graphite,
      );
      const color = terminal.window > 0 ? "#b6ebd2" : "#c6ab88";
      seam(
        c,
        [
          [-10, -8],
          [10, -8],
          [12, 3],
          [-12, 3],
          [-10, -8],
        ],
        21,
        0,
        "#6f999084",
      );
      for (let i = 0; i < 3; i++)
        seam(
          c,
          [
            [-7, -5 + i * 3],
            [5 - i * 2, -5 + i * 3],
          ],
          21,
          0,
          i === 0 ? color : "#6c9587",
          1,
        );
      if (terminal.channeling) {
        const scan = -7 + ((t * 12) % 10);
        seam(
          c,
          [
            [-10, scan],
            [10, scan],
          ],
          22,
          0,
          "#bef2d4",
          1.4,
        );
      }
      lamp(c, 0, 10, 16, 0, 1.8, color);
      if (terminal.charge || terminal.window)
        arc(
          c,
          0,
          0,
          36,
          -Math.PI / 2,
          -Math.PI / 2 +
            (terminal.channeling ? terminal.charge : terminal.window / 7) * TAU,
          "#bce4bb",
          2,
        );
      c.restore();
      if (terminal.window > 0 && s.units.some((u) => u.kind === "citadel")) {
        c.save();
        c.setLineDash([5, 13]);
        c.lineDashOffset = ui.reduced ? 0 : -t * 18;
        line(
          c,
          ["highlands", "districts"].includes(this.mapId)
            ? [
                this.p(x, y),
                this.p(
                  s.units.find((u) => u.kind === "citadel").x,
                  s.units.find((u) => u.kind === "citadel").y,
                ),
              ]
            : [
                [x, y],
                s.campaign
                  ? [1820, E.development.expedition(s) ? 1080 : 520]
                  : [1320, 320],
                [
                  s.units.find((u) => u.kind === "citadel").x,
                  s.units.find((u) => u.kind === "citadel").y,
                ],
              ],
          "#a9d8c057",
          1.2,
        );
        c.restore();
      }
    }
    relay(c, s, ui) {
      if (s.relay.unknown) return;
      const { x, y, online, charge } = s.relay,
        progress =
          s.relay.progress ??
          (online ? 1 : s.phase === 2 ? s.relay.stability : charge);
      c.save();
      this.shadow(
        c,
        x,
        y,
        [
          [-24, -18],
          [24, -18],
          [24, 18],
          [-24, 18],
        ],
        36,
      );
      c.translate(x, y - this.z(x, y));
      if (!["highlands", "districts"].includes(this.mapId))
        ellipse(c, 4, 6, 43, 30, "#061d2770");
      ring(c, 0, 0, 43, online ? "#a3d9c947" : "#869a8a29");
      for (let i = 0; i < 3; i++) {
        const a = (i * TAU) / 3;
        slab(c, 24, 0, 26, 13, 0, 5, a, MAT.dark);
        slab(
          c,
          19 + progress * 5,
          0,
          15,
          11,
          5,
          11 + progress * 3,
          a,
          MAT.ally,
        );
        plate(
          c,
          [
            [11, -5],
            [29 + progress * 5, -9],
            [33 + progress * 5, 0],
            [29 + progress * 5, 9],
            [11, 5],
          ],
          18,
          4,
          a,
          MAT.ceramic,
        );
        seam(
          c,
          [
            [18, 0],
            [28 + progress * 5, 0],
          ],
          23,
          a,
          online ? "#b2edd2" : "#5b7d74",
          2,
        );
      }
      slab(c, 0, 0, 21, 21, 5, 23 + progress * 8, 0, MAT.ally);
      slab(c, 0, 0, 11, 11, 28 + progress * 8, 8, 0, MAT.graphite);
      ellipse(c, 0, -37 - progress * 8, 7, 4, "#192f36", "#a8bdb384");
      ellipse(
        c,
        0,
        -38 - progress * 8,
        3.5,
        2.5,
        online ? "#b9efda" : "#c6ad88",
      );
      if (charge)
        arc(
          c,
          0,
          0,
          51,
          -Math.PI / 2,
          -Math.PI / 2 + progress * TAU,
          "#b6f0d7",
          2,
        );
      c.restore();
    }
    effects(c, dt, ui, active) {
      for (const f of this.fx) {
        f.life += f.type === "order" ? dt : active ? dt : 0;
        const t = f.life / f.max;
        if (t > 1) continue;
        const color =
          f.intent === "attack" ? "#ff7771" : f.intent === "repair" || f.type === "repair-ready"
            ? "#99e6e2" : f.team ? "#e7aa87" : "#afe1cc";
        c.save();
        c.translate(0, -this.z(f.x, f.y));
        if (f.type === "destroy" || f.type === "blast") {
          const heavy =
              f.type === "blast" ||
              ["citadel", "base", "jammer"].includes(f.kind),
            r = heavy ? 65 : 34;
          c.globalAlpha = (1 - t) * 0.32;
          ellipse(
            c,
            f.x + 7 * t,
            f.y - 9 - 22 * t,
            r * (0.2 + t * 0.65),
            r * (0.12 + t * 0.3),
            "#182c33",
          );
          c.globalAlpha = (1 - t) ** 2 * 0.65;
          ring(c, f.x, f.y, 7 + t * r, "#c5ac87", 1.2);
          if (t < 0.17) {
            c.globalAlpha = (0.17 - t) * 3;
            ellipse(c, f.x, f.y - 8, 8 + t * 55, 5 + t * 32, "#f0d7aa");
          }
          for (let i = 0; i < 7; i++) {
            const a = i * 2.4 + f.seed,
              d = (14 + (i % 3) * 12) * t,
              xx = f.x + Math.cos(a) * d,
              yy = f.y + Math.sin(a) * d - Math.sin(t * Math.PI) * 18;
            c.globalAlpha = (1 - t) * 0.7;
            line(
              c,
              [
                [xx, yy],
                [
                  xx + Math.cos(a) * 5 * (1 - t),
                  yy + Math.sin(a) * 5 * (1 - t),
                ],
              ],
              i % 2 ? "#bac0a9" : "#e8b994",
              1.2,
            );
          }
        } else if (f.type === "hit" || f.type === "spark") {
          c.globalAlpha = (1 - t) * 0.8;
          for (let i = 0; i < 4; i++) {
            const a = i * 2.1 + f.seed;
            line(
              c,
              [
                [f.x + Math.cos(a) * t * 4, f.y - 12 + Math.sin(a) * t * 4],
                [f.x + Math.cos(a) * t * 19, f.y - 12 + Math.sin(a) * t * 19],
              ],
              color,
              i === 0 ? 1.8 : 1,
            );
          }
        } else if (f.type === "dash") {
          c.translate(f.x, f.y - 10);
          c.rotate(f.angle || 0);
          c.globalAlpha = (1 - t) * 0.22;
          poly(
            c,
            [
              [-8, -7],
              [-16 - t * 40, -3],
              [-16 - t * 40, 3],
              [-8, 7],
            ],
            "#b3e7d6",
          );
        } else if (f.type === "collect" || f.type === "salvage") {
          c.globalAlpha = (1 - t) * 0.8;
          for (let i = 0; i < 3; i++)
            poly(
              c,
              [
                [f.x - 7 + i * 7, f.y - 12 - t * 24],
                [f.x - 4 + i * 7, f.y - 15 - t * 24],
                [f.x - 1 + i * 7, f.y - 12 - t * 24],
                [f.x - 4 + i * 7, f.y - 9 - t * 24],
              ],
              "#ddd5ad",
            );
        } else if (f.type === "repair-ready") {
          c.globalAlpha = (1 - t) * 0.7;
          ring(c, f.x, f.y, 18 + t * 22, color, 1.2);
          line(c, [[f.x - 5, f.y - 3], [f.x - 1, f.y + 1], [f.x + 7, f.y - 7]], color, 2);
        } else if (f.type === "shield") {
          c.globalAlpha = (1 - t) * 0.55;
          arc(c, f.x, f.y, 65, f.seed, f.seed + Math.PI * 0.7, "#e7bc95", 2);
        } else {
          c.globalAlpha = (1 - t) * 0.65;
          const r =
            f.type === "order"
              ? 14 + t * 22
              : f.type === "breach"
                ? 24 + t * 50
                : 20 + t * 70;
          for (let i = 0; i < 3; i++)
            arc(
              c,
              f.x,
              f.y,
              r,
              (i * TAU) / 3 + 0.1,
              (i * TAU) / 3 + 1.8,
              color,
              1.4,
            );
          if (f.type === "order")
            line(
              c,
              [
                [f.x - 6, f.y],
                [f.x + 6, f.y],
              ],
              "#d1eee0",
              1.5,
            );
        }
        c.restore();
      }
      this.fx = this.fx.filter((f) => f.life < f.max);
    }
    debris(c) {
      for (const scar of this.scars) {
        c.save();
        c.translate(0, -this.z(scar.x, scar.y));
        ellipse(c, scar.x, scar.y, scar.r, scar.r * 0.5, "#071b2524");
        for (let i = 0; i < 3; i++) {
          const a = scar.seed + i * 2.4,
            r = scar.r * (0.3 + i * 0.15);
          line(
            c,
            [
              [scar.x + Math.cos(a) * r, scar.y + Math.sin(a) * r * 0.6],
              [
                scar.x + Math.cos(a) * (r + 4),
                scar.y + Math.sin(a) * (r + 4) * 0.6,
              ],
            ],
            "#71837c40",
            1.5,
          );
        }
        c.restore();
      }
    }
    reset(s) {
      this.floorImages.clear();
      this.floorPixels = 0;
      this.memoryKey = null;
      this.memoryAnchor = null;
      this.memoryTransform = null;
      this.memoryNeedsRefine = false;
      this.fx = [];
      this.poses.clear();
      this.modelDeaths.clear();
      this.modelExits.clear();
      this.modelCargo.clear();
      this.modelDeliveries.clear();
      this.modelClock = s?.t || 0;
      this.unitSprites.clear();
      this.spritePixels = 0;
      this.scars = [];
      this.effectSerial = 0;
      this.shake = 0;
      if (s) {
        const h = E.hero(s);
        this.camera.x = h.x;
        this.camera.y = h.y - E.elevation(h.x, h.y, E.map(s));
        this.tactical = {
          overview: !s.campaign,
          x: h.x,
          y: h.y - E.elevation(h.x, h.y, E.map(s)),
          zoom: 0.95,
        };
      }
    }
    focus(x, y) {
      this.tactical.overview = false;
      this.tactical.x = x;
      this.tactical.y = y - this.z(x, y);
    }
    pan(x, y) {
      if (this.tactical.overview) {
        this.tactical.overview = false;
        this.tactical.x = this.camera.x;
        this.tactical.y = this.camera.y;
      }
      this.tactical.x += x;
      this.tactical.y += y;
      this.camera.x += x;
      this.camera.y += y;
    }
    zoomAt(factor, x, y) {
      const anchor = this.world(x, y),
        next = E.clamp(this.camera.scale * factor, this.fitScale || 0.1, 1.7);
      this.tactical.overview = false;
      this.tactical.zoom = next;
      this.tactical.x = anchor.x - (x - this.origin.x) / next;
      this.tactical.y =
        anchor.y -
        this.z(anchor.x, anchor.y) -
        (y - this.origin.y) / (next * Y);
    }
    pose(u, s, ui) {
      return root.SignalUnitModels.motion(this.poses, u, s.t, ui.reduced);
    }
    wall(c, b, fog, kind) {
      c.save();
      this.occlude(
        c,
        b.x + b.w / 2,
        b.y + b.h / 2,
        this.z(b.x + b.w / 2, b.y + b.h / 2),
        b.w / 2 + 80,
      );
      if (!["highlands", "districts"].includes(this.mapId)) {
        c.save();
        if (fog) this.fogClip(c, fog, kind);
        ellipse(
          c,
          b.x + b.w / 2 + 13,
          b.y + b.h / 2 + 20,
          b.w * 0.63,
          b.h * 0.55,
          "#06192270",
        );
        c.restore();
      }
      c.translate(
        b.x + b.w / 2,
        b.y + b.h / 2 - this.z(b.x + b.w / 2, b.y + b.h / 2),
      );
      const tall = b.h > b.w;
      slab(c, 0, 0, b.w, b.h, 0, 13, 0, MAT.graphite);
      slab(c, 0, 0, b.w - 6, b.h - 6, 13, 28, 0, MAT.deck);
      slab(c, 0, 0, b.w - 20, b.h - 18, 41, 7, 0, {
        ...MAT.deck,
        top: "#627771",
      });
      if (tall) {
        for (let y = -b.h / 2 + 24; y < b.h / 2 - 14; y += 25) {
          slab(c, 0, y, b.w - 34, 11, 48, 5, 0, MAT.dark);
          seam(
            c,
            [
              [-b.w / 2 + 19, y - 4],
              [b.w / 2 - 19, y - 4],
            ],
            54,
            0,
            "#8a9c8748",
          );
        }
        for (const x of [-b.w / 2 + 7, b.w / 2 - 7])
          slab(c, x, 0, 6, b.h - 12, 20, 32, 0, MAT.ally);
      } else {
        for (const x of [-b.w * 0.26, b.w * 0.26]) {
          slab(c, x, 0, b.w * 0.34, b.h - 36, 48, 5, 0, MAT.graphite);
          for (let y = -b.h / 2 + 23; y < b.h / 2 - 20; y += 8)
            seam(
              c,
              [
                [x - b.w * 0.14, y],
                [x + b.w * 0.14, y],
              ],
              54,
              0,
              "#74877d70",
            );
        }
      }
      for (const x of [-b.w / 2 + 14, b.w / 2 - 14]) {
        slab(c, x, b.h / 2 - 3, 9, 6, 8, 19, 0, MAT.dark);
        lamp(c, x, b.h / 2 + 1, 22, 0, 1.5, "#b9b99a");
      }
      seam(
        c,
        [
          [-b.w / 2 + 10, -b.h / 2 + 8],
          [-b.w / 2 + 34, -b.h / 2 + 8],
        ],
        49,
        0,
        "#cfcca067",
        2,
      );
      c.restore();
    }
    danger(c, area, remaining, reduced, time) {
      c.save();
      const active = area.active,
        color = active ? "#f5bd85" : "#efa686";
      c.lineWidth = 1.8;
      c.strokeStyle = color;
      c.fillStyle = active ? "#efa15d38" : "#eea08216";
      if (area.kind === "sector") {
        poly(
          c,
          this.groundPoints(area.points.map((p) => [p.x, p.y])),
          c.fillStyle,
          color,
        );
        if (active) {
          c.globalAlpha = 0.4;
          for (let i = 2; i < area.points.length - 1; i += 3) {
            const o = area.points[0],
              p = area.points[i],
              phase = reduced ? 0.7 : (time * 2 + i / 24) % 1;
            line(
              c,
              [
                this.p(
                  o.x + (p.x - o.x) * phase * 0.4,
                  o.y + (p.y - o.y) * phase * 0.4,
                ),
                this.p(o.x + (p.x - o.x) * phase, o.y + (p.y - o.y) * phase),
              ],
              "#f6cf93",
              3,
            );
          }
        }
      } else {
        if (area.points)
          poly(
            c,
            this.groundPoints(area.points.map((p) => [p.x, p.y])),
            c.fillStyle,
            color,
          );
        else
          ellipse(
            c,
            area.x,
            area.y,
            area.radius,
            area.radius,
            c.fillStyle,
            color,
          );
        c.translate(0, -this.z(area.x, area.y));
        c.setLineDash([5, 6]);
        ring(
          c,
          area.x,
          area.y,
          Math.max(5, area.radius * (1 - remaining)),
          "#f4c09c",
          1,
        );
        c.setLineDash([]);
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          line(
            c,
            [
              [
                area.x + Math.cos(a) * (area.radius - 9),
                area.y + Math.sin(a) * (area.radius - 9),
              ],
              [
                area.x + Math.cos(a) * (area.radius + 4),
                area.y + Math.sin(a) * (area.radius + 4),
              ],
            ],
            color,
            2,
          );
        }
      }
      c.restore();
    }
    placementOverlay(c, s, placement) {
      const preview = placement.result?.preview;
      if (!preview) return;
      const b = E.construction.rect(preview),
        good = placement.result.allowed,
        color = good ? "#b8edce" : "#f2ac88",
        fill = good ? "#84cdb32a" : "#e38b6535";
      c.save();
      if (s.fog) this.fogClip(c, s.fog, "visible");
      const world = E.map(s),
        corners = [
          [0, 0],
          [innerWidth, 0],
          [0, innerHeight],
          [innerWidth, innerHeight],
        ].map(([x, y]) => this.world(x, y)),
        minX = Math.max(
          0,
          Math.floor(Math.min(...corners.map((p) => p.x)) / 40) * 40 - 80,
        ),
        maxX = Math.min(world.W, Math.max(...corners.map((p) => p.x)) + 80),
        minY = Math.max(
          0,
          Math.floor(Math.min(...corners.map((p) => p.y)) / 40) * 40 - 200,
        ),
        maxY = Math.min(world.H, Math.max(...corners.map((p) => p.y)) + 200);
      c.beginPath();
      for (let y = minY; y < maxY; y += 40)
        for (let x = minX; x < maxX; x += 40) {
          const z = this.z(x + 20, y + 20);
          if (
            E.terrain.level(x + 20, y + 20) < 0 ||
            [
              [1, 1],
              [39, 1],
              [39, 39],
              [1, 39],
            ].some(([dx, dy]) => this.z(x + dx, y + dy) !== z)
          )
            continue;
          c.rect(x, y - z, 40, 40);
        }
      c.strokeStyle = "#bad5c32c";
      c.lineWidth = 1 / Math.max(0.6, this.camera.scale);
      c.stroke();
      for (let y = b.y; y < b.y + b.h; y += 40)
        for (let x = b.x; x < b.x + b.w; x += 40) {
          const z = this.z(x + 20, y + 20);
          c.fillStyle = fill;
          c.fillRect(x + 1, y - z + 1, 38, 38);
        }
      this.groundLine(
        c,
        [
          [b.x, b.y],
          [b.x + b.w, b.y],
          [b.x + b.w, b.y + b.h],
          [b.x, b.y + b.h],
          [b.x, b.y],
        ],
        color,
        2.5,
      );
      const e = E.construction.exit(preview),
        dir = E.construction.direction(preview),
        tip = { x: e.x + dir.x * 25, y: e.y + dir.y * 25 };
      if (preview.kind === "outpost" && preview.site) {
        const mine =
          s.campaign.mines.find((m) => m.id === preview.site) ||
          s.fog?.memory.campaign.mines.find((m) => m.id === preview.site);
        if (mine) {
          c.setLineDash([5, 5]);
          this.groundLine(
            c,
            [
              [e.x, e.y],
              ...(placement.result.oreRoute?.length
                ? placement.result.oreRoute.map((p) => [p.x, p.y])
                : [[mine.x, mine.y]]),
            ],
            "#e6c77dbb",
            1.5,
          );
          c.setLineDash([]);
          this.groundRing(c, mine.x, mine.y, 46, "#e6c77d", 2);
        }
      }
      this.groundLine(
        c,
        [
          [e.x - dir.x * 20, e.y - dir.y * 20],
          [tip.x, tip.y],
          [tip.x - dir.x * 12 - dir.y * 9, tip.y - dir.y * 12 + dir.x * 9],
        ],
        color,
        2,
      );
      this.groundLine(
        c,
        [
          [tip.x, tip.y],
          [tip.x - dir.x * 12 + dir.y * 9, tip.y - dir.y * 12 - dir.x * 9],
        ],
        color,
        2,
      );
      if (good) {
        const worker = placement.result.builder,
          route = placement.result.route;
        c.setLineDash([5, 7]);
        this.groundLine(
          c,
          [[worker.x, worker.y], ...route.map((p) => [p.x, p.y])],
          "#b8edce90",
          1.5,
        );
      }
      c.restore();
    }
    constructionModel(c, u, s, ui) {
      const shape = E.construction.shape(u),
        frame = {
          w: shape[0] * 40,
          h: shape[1] * 40,
          // Local +Y is the service apron; a quarter turn points it east.
          a: (-u.construction.turn * Math.PI) / 2,
          progress:
            u.hp <= 0
              ? 0
              : Math.max(
                  0,
                  Math.min(
                    1,
                    1 - (u.build || 0) / E.development.items(s)[u.kind].time,
                  ),
                ),
        },
        box = E.construction.rect(u);
      c.save();
      c.translate(u.x, u.y - this.z(u.x, u.y));
      unitModels.draw(
        c,
        u,
        s,
        ui,
        { phase: 0, move: 0, angle: u.angle || 0 },
        this.muzzle,
        frame,
        this.doorOpening(u, s),
        this.deliveryOpening(u, s),
        { activity: this.workerActivity.get(u.id), crew: this.buildingActivity.get(u.id) || [] },
      );
      if (u.hit > 0 && !ui.reduced && !ui.memory && u.hp > 0)
        seam(
          c,
          [
            [-frame.w * 0.24, frame.h * 0.2],
            [frame.w * 0.24, frame.h * 0.2],
          ],
          7,
          frame.a,
          "#d5efdb90",
          1.5,
        );
      c.restore();
      if (u.hp > 0 && (u.hp < E.C[u.kind].hp || ui.mode === "tactical")) {
        const x = u.x - 27,
          y = box.y + box.h - this.z(u.x, u.y) + 9;
        c.fillStyle = "#132e32";
        c.fillRect(x, y, 54, 4);
        c.fillStyle = u.build > 0 ? "#dbb190" : "#a9d9bf";
        c.fillRect(
          x,
          y,
          54 * (u.build > 0 ? frame.progress : u.hp / E.C[u.kind].hp),
          4,
        );
      }
    }
    unit(c, u, s, ui) {
      const opacity = this.wreckOpacity(u, s);
      if (!opacity) return;
      c.save();
      c.globalAlpha *= opacity;
      try {
        this.occlude(c, u.x, u.y, this.z(u.x, u.y), E.C[u.kind].r + 70);
        const pose = ui.memory
          ? { phase: 0, move: 0, angle: u.angle }
          : this.pose(u, s, ui);
        if (
          ["highlands", "districts"].includes(this.mapId) &&
          E.C[u.kind].speed > 0 &&
          u.hp > 0 &&
          u.kind !== "drone"
        )
          this.unitSprite(c, u, s, ui, pose);
        else this.unitModel(c, u, s, ui, pose);
      } finally {
        c.restore();
      }
    }
    unitSprite(c, u, s, ui, pose) {
      const m = c.getTransform(),
        x = u.x * m.a + m.e,
        y = (u.y - this.z(u.x, u.y)) * m.d + m.f,
        left = Math.floor(x - 100 * m.a),
        top = Math.floor(y - 128 * m.d),
        width = Math.ceil(x + 100 * m.a) - left,
        height = Math.ceil(y + 64 * m.d) - top,
        key = JSON.stringify([
          u.kind,
          u.team,
          u.angle,
          [
            pose.phase,
            pose.move,
            pose.settle,
            pose.angle,
            pose.direction,
            pose.cycle,
            ["tank", "mortar"].includes(u.kind)
              ? [pose.left, pose.right]
              : null,
          ],
          u.hp,
          u.defense,
          ui.reduced ? 0 : u.flash,
          !ui.reduced && u.hit > 0,
          u.wind > 0,
          ["runner", "rocket", "flamer", "bomber"].includes(u.kind) &&
          (u.wind > 0 || u.combat?.mode === "aim")
            ? [u.combat?.time ?? u.wind, u.combat?.total]
            : null,
          u.wind > 0 && u.target
            ? Math.atan2(u.target.y - u.y, u.target.x - u.x)
            : null,
          u.combat?.angle,
          u.combat?.mode,
          ui.mode === "tactical",
          ui.reduced,
          u.kind === "hero"
            ? [
                ui.aim && Math.atan2(ui.aim.y - u.y, ui.aim.x - u.x),
                s.dashT > 0,
                s.reload,
                s.terminal?.channeling,
                s.terminals?.some((p) => p.channeling),
              ]
            : null,
          u.kind === "scout" && !ui.reduced ? s.t : null,
          u.kind === "rocket" ? u.cool > E.C.rocket.rate * 0.5 : null,
          m.a,
          m.d,
          x - left,
          y - top,
          width,
          height,
        ]);
      let sprite = this.unitSprites.get(u.id);
      if (!sprite) {
        sprite = { canvas: null, pixels: 0 };
        this.unitSprites.set(u.id, sprite);
      }
      if (sprite.key !== key && sprite.pending !== key) {
        // A walking/turning model normally changes every frame. Rasterizing it
        // into a new image only to copy it once adds work and GPU synchronisation.
        // Admit exact poses after a repeat; draw changing poses as the same vectors.
        sprite.pending = key;
        this.unitModel(c, u, s, ui, pose);
      } else {
        if (sprite.key !== key) {
          const canvas = (sprite.canvas ||= document.createElement("canvas"));
          if (canvas.width !== width || canvas.height !== height) {
            this.spritePixels -= sprite.pixels;
            canvas.width = width;
            canvas.height = height;
            sprite.pixels = width * height;
            this.spritePixels += sprite.pixels;
          }
          const b = canvas.getContext("2d");
          b.setTransform(1, 0, 0, 1, 0, 0);
          b.clearRect(0, 0, width, height);
          b.setTransform(m.a, 0, 0, m.d, m.e - left, m.f - top);
          this.unitModel(b, u, s, ui, pose);
          sprite.key = key;
        }
        // Rasterize at the current physical pixel scale and fractional position;
        // the final integer blit does not rescale or blur the original artwork.
        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.drawImage(sprite.canvas, left, top);
        c.restore();
      }
      this.unitSprites.delete(u.id);
      this.unitSprites.set(u.id, sprite);
      while (
        this.spritePixels > 8 * 1024 * 1024 ||
        this.unitSprites.size > 128
      ) {
        const id = this.unitSprites.keys().next().value;
        this.spritePixels -= this.unitSprites.get(id).pixels;
        this.unitSprites.delete(id);
      }
    }
    unitModel(c, u, s, ui, pose) {
      if (u.construction) return this.constructionModel(c, u, s, ui);
      const def = E.C[u.kind],
        r = def.r,
        rawPose =
          pose ||
          (ui.memory
            ? { phase: 0, move: 0, angle: u.angle || 0 }
            : this.pose(u, s, ui)),
        onRamp =
          ["highlands", "districts"].includes(this.mapId) &&
          def.speed &&
          !Number.isInteger(E.terrain.level(u.x, u.y)),
        p = onRamp
          ? {
              ...rawPose,
              ground: {
                x: (this.z(u.x + 8, u.y) - this.z(u.x - 8, u.y)) / 16,
                y: (this.z(u.x, u.y + 8) - this.z(u.x, u.y - 8)) / 16,
              },
            }
          : rawPose;
      c.save();
      if (!["highlands", "districts"].includes(this.mapId)) {
        c.save();
        if (s.fog) this.fogClip(c, s.fog, ui.memory ? "explored" : "visible");
        ellipse(c, u.x + 4, u.y + 7, r * 1.25, r * 0.85, "#07192270");
        ellipse(c, u.x + 1, u.y + 3, r * 0.86, r * 0.63, "#06141c70");
        c.restore();
      }
      c.translate(u.x, u.y - this.z(u.x, u.y));
      unitModels.draw(
        c,
        u,
        s,
        ui,
        p,
        this.muzzle,
        null,
        this.doorOpening(u, s),
        this.deliveryOpening(u, s),
        { activity: this.workerActivity.get(u.id), crew: this.buildingActivity.get(u.id) || [] },
      );
      if (u.hp > 0 && u.hit > 0 && !ui.reduced && !ui.memory)
        ring(c, 0, 0, r + 3, u.team ? "#f0c9a780" : "#c1f2d980", 1.5);
      c.restore();
      if (u.hp > 0 && (u.hp < def.hp || ui.mode === "tactical")) {
        c.save();
        c.translate(u.x, u.y - this.z(u.x, u.y) + r + 11);
        c.fillStyle = "#102832";
        c.fillRect(-r, 0, r * 2, 3);
        c.fillStyle = u.team ? "#d29c83" : "#9cd8c7";
        c.fillRect(-r, 0, (r * 2 * Math.max(0, u.hp)) / def.hp, 3);
        c.restore();
      }
    }
    productionBars(s, ui) {
      if (!s.campaign) return;
      const c = this.c,
        items = E.development.items(s);
      c.save();
      c.font = "10px Segoe UI, sans-serif";
      c.textAlign = "center";
      for (const u of s.units) {
        if (
          u.team ||
          u.hp <= 0 ||
          !["base", "outpost", "barracks", "foundry", "arsenal"].includes(
            u.kind,
          ) ||
          !this.inView(u.x, u.y)
        )
          continue;
        const box = u.construction && E.construction.rect(u),
          p = this.screen(u.x, u.y),
          width = Math.max(
            36,
            Math.min(156, (box?.w || E.C[u.kind].r * 3) * this.camera.scale),
          ),
          y =
            p.y + ((box?.h / 2 || E.C[u.kind].r) + 16) * this.camera.scale * Y,
          job = u.jobs?.[0];
        const crew = this.buildingActivity.get(u.id)?.filter((v) => v.kind === "repair") || [];
        let progress = 0,
          label = "Очередь пуста",
          color = "#9edcc6";
        if (u.build > 0) {
          progress = 1 - u.build / items[u.kind].time;
          label =
            (u.construction?.builderId === null
              ? "Ожидает дрона · "
              : "Стройка · ") +
            Math.floor(progress * 100) +
            "%";
          color = "#d5c491";
        } else if (crew.length) {
          progress = u.hp / E.C[u.kind].hp;
          const active = crew.filter((v) => v.active).length;
          label = active ? "Ремонт · " + Math.ceil(progress * 100) + "%" :
            crew.some((v) => v.waiting) ? "Ремонт: нет сплава" : "Зонд в пути";
          if (job) label += " · очередь " + u.jobs.length;
          color = active ? "#a7e8e0" : "#d5c491";
        } else if (job) {
          progress = 1 - job.remaining / job.duration;
          label =
            (items[job.action]?.label || job.action) +
            " · " +
            (job.remaining ? Math.ceil(job.remaining) + " с" : "Выход занят");
        } else if (["base", "outpost"].includes(u.kind)) {
          const n = s.units.filter(
            (w) =>
              w.kind === "drone" &&
              w.hp > 0 &&
              w.node === u.id &&
              !w.buildingId && !w.workerTask,
          ).length;
          label = "Добыча · " + n + " дрона";
          progress = n ? 1 : 0;
        } else if (u.kind === "arsenal") label = "Нет исследований";
        const patients = u.kind === "outpost" ? E.support.occupants(s, u.id) : [];
        if (patients.length) {
          const inside = patients.filter((v) => v.care.inside).length;
          const health = patients.reduce((sum, v) => sum + v.hp / E.C[v.kind].hp, 0) / patients.length;
          c.fillStyle = "#102a25f0";
          c.fillRect(p.x - width / 2 - 3, y - 24, width + 6, 17);
          c.fillStyle = "#72c9ab";
          c.fillRect(p.x - width / 2, y - 10, width * health, 2);
          c.fillStyle = "#c1efdd";
          c.fillText(width >= 90 ? "+ Лечение " + inside + "/" + patients.length : "+ " + inside + "/" + patients.length, p.x, y - 13);
        }
        c.fillStyle = "#07171ee8";
        c.fillRect(p.x - width / 2 - 3, y - 3, width + 6, width >= 66 ? 23 : 9);
        c.fillStyle = "#334b4b";
        c.fillRect(p.x - width / 2, y, width, 4);
        c.fillStyle = color;
        c.fillRect(
          p.x - width / 2,
          y,
          width * Math.max(0, Math.min(1, progress)),
          4,
        );
        if (width >= 66) {
          while (label.length > 2 && c.measureText(label).width > width)
            label = label.slice(0, -2) + "…";
          c.fillStyle = "#d0e2d6";
          c.fillText(label, p.x, y + 16);
        }
      }
      c.restore();
    }
    serviceActivity(s) {
      this.workerActivity.clear();
      this.buildingActivity.clear();
      if (!s.campaign) return;
      let lookup;
      for (const worker of s.units) {
        if (!worker.buildingId && worker.workerTask?.kind !== "repair") continue;
        const activity = E.construction.activity(s, worker,
          lookup ||= new Map(s.units.map((u) => [u.id, u])));
        if (!activity) continue;
        this.workerActivity.set(worker.id, activity);
        const crew = this.buildingActivity.get(activity.target.id) || [];
        crew.push(activity);
        this.buildingActivity.set(activity.target.id, crew);
      }
    }
    deliveryActivity(s) {
      const seen = new Set();
      for (const u of s.units) {
        if (u.kind !== "drone" || u.hp <= 0) continue;
        seen.add(u.id);
        const previous = this.modelCargo.get(u.id);
        if (
          previous?.cargo > 0 &&
          u.cargo === 0 &&
          previous.node === u.node &&
          s.t > previous.time &&
          s.t - previous.time < 0.5
        ) {
          const node = s.units.find(
            (n) =>
              n.id === u.node &&
              n.hp > 0 &&
              ["base", "outpost"].includes(n.kind),
          );
          if (node && E.dist(node, u) < 180)
            this.modelDeliveries.set(node.id, s.t);
        }
        this.modelCargo.set(u.id, { cargo: u.cargo, node: u.node, time: s.t });
      }
      for (const id of this.modelCargo.keys())
        if (!seen.has(id)) this.modelCargo.delete(id);
      for (const [id, at] of this.modelDeliveries)
        if (s.t < at || s.t - at > 0.8) this.modelDeliveries.delete(id);
    }
    deliveryOpening(u, s) {
      const at = this.modelDeliveries.get(u.id);
      return at === undefined
        ? 0
        : Math.sin(Math.max(0, 1 - (s.t - at) / 0.8) * Math.PI);
    }
    doorOpening(u, s) {
      const key = u.x + ":" + u.y,
        at = this.modelExits.get(key);
      if (at === undefined) return 0;
      const remaining = 1 - (s.t - at) / 0.85;
      if (remaining <= 0) {
        this.modelExits.delete(key);
        return 0;
      }
      return Math.sin((Math.min(1, remaining) * Math.PI) / 2);
    }
    muzzle(c, x, y, z, a, color, flash, size = 1) {
      const p = point(x, y, z, a);
      c.save();
      c.translate(...p);
      c.rotate(a);
      const k = (0.4 + flash * 6) * size;
      poly(
        c,
        [
          [0, -3 * k],
          [14 * k, 0],
          [0, 3 * k],
          [4 * k, 0],
        ],
        color,
      );
      line(
        c,
        [
          [0, 0],
          [19 * k, 0],
        ],
        "#eef2d9",
        1,
      );
      c.restore();
    }
  }
  View.artwork = unitModels;
  root.SignalView = View;
})(window);
