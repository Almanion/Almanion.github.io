"use strict";
const { test, expect, chromium, webkit } = require("@playwright/test");
const path = require("node:path");
for (const browserType of [chromium, webkit])
  for (const profile of ["frontier-6", "frontier-7"])
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ])
      test(`${browserType.name()} ${profile} fog presentation ${width}x${height}`, async () => {
        test.setTimeout(60000);
        const browser = await browserType.launch({
          args: browserType === chromium ? ["--disable-gpu"] : [],
        });
        try {
          const page = await browser.newPage({ viewport: { width, height } });
          const errors = [];
          page.on("pageerror", (error) => errors.push(error.message));
          await page.goto("http://127.0.0.1:4173/games/signal-frontier/");
          const result = await page.evaluate((profile) => {
            const canvas = document.createElement("canvas");
            // Keep readback on one raster backend throughout exact image comparisons.
            canvas.getContext("2d", { alpha: false, willReadFrequently: true });
            const E = SignalEngine,
              s = E.make(profile),
              world = E.map(s),
              wall = world.walls[0],
              h = E.hero(s),
              v = new SignalView(canvas),
              ui = {
                mode: "tactical",
                reduced: true,
                selectionIds: [],
                touch: true,
              },
              home = { x: h.x, y: h.y },
              near = { x: wall.x + wall.w / 2, y: wall.y + wall.h + 90 };
            v.memoryCanvas.getContext("2d", { willReadFrequently: true });
            const render = (scene = s) => {
              v.render(scene, ui, 1);
              // Flush both offscreen layers as separate frames, rather than batching
              // several draws against a still-deferred source canvas in Chromium.
              v.memoryCanvas.getContext("2d").getImageData(0, 0, 1, 1);
              return v.canvas.toDataURL();
            };
            const visit = (p) => {
              Object.assign(h, p);
              E.refreshRecon(s);
            };
            visit(near);
            const supported =
                world.id !== "highlands" || E.terrain.free(h.x, h.y, 12),
              sameLevel =
                E.elevation(h.x, h.y, world) ===
                E.elevation(wall.x + wall.w / 2, wall.y + wall.h / 2, world);
            v.tactical = {
              overview: false,
              x: wall.x + wall.w / 2,
              y: wall.y + wall.h / 2 - E.elevation(h.x, h.y, world),
              zoom: 1,
            };
            render();
            const state = JSON.stringify(s),
              before = render();
            let stable = true;
            for (let i = 0; i < 3; i++) stable = render() === before && stable;
            const pure = state === JSON.stringify(s);
            const reference = document.createElement("canvas");
            reference.width = v.canvas.width;
            reference.height = v.canvas.height;
            const c = reference.getContext("2d"),
              cam = v.camera;
            c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
            c.translate(v.origin.x, v.origin.y);
            c.scale(cam.scale, cam.scale * 0.73);
            c.translate(-cam.x, -cam.y);
            v.wall(c, wall);
            const expected = c.getImageData(
                0,
                0,
                reference.width,
                reference.height,
              ).data,
              actual = v.c.getImageData(
                0,
                0,
                reference.width,
                reference.height,
              ).data;
            let opaque = 0,
              matches = 0;
            for (let i = 0; i < expected.length; i += 4)
              if (expected[i + 3] === 255) {
                opaque++;
                if (
                  [0, 1, 2].every(
                    (k) => Math.abs(expected[i + k] - actual[i + k]) <= 2,
                  )
                )
                  matches++;
              }
            const nearby = v.wallKnown(wall, E.observe(s).fog, "visible");
            visit(home);
            render();
            const fog = E.observe(s).fog,
              remembered = v.wallKnown(wall, fog, "explored");
            const point = v.screen(wall.x + wall.w / 2, wall.y + wall.h / 2);
            const gray = [
              ...v.c.getImageData(
                Math.round(point.x * v.dpr),
                Math.round((point.y - 25 * v.camera.scale * 0.73) * v.dpr),
                1,
                1,
              ).data,
            ];
            visit(near);
            render();
            const rescout = v.canvas.toDataURL() === before;
            const rescanned = v.c.getImageData(
              0,
              0,
              reference.width,
              reference.height,
            ).data;
            const difference = {
              count: 0,
              max: 0,
              x0: reference.width,
              y0: reference.height,
              x1: 0,
              y1: 0,
              reconStable:
                JSON.stringify(s.recon) ===
                JSON.stringify(JSON.parse(state).recon),
            };
            for (let i = 0; i < actual.length; i += 4)
              if ([0, 1, 2].some((k) => actual[i + k] !== rescanned[i + k])) {
                const x = (i / 4) % reference.width,
                  y = Math.floor(i / 4 / reference.width);
                difference.count++;
                difference.x0 = Math.min(difference.x0, x);
                difference.y0 = Math.min(difference.y0, y);
                difference.x1 = Math.max(difference.x1, x);
                difference.y1 = Math.max(difference.y1, y);
                difference.max = Math.max(
                  difference.max,
                  ...[0, 1, 2].map((k) =>
                    Math.abs(actual[i + k] - rescanned[i + k]),
                  ),
                );
              }
            // A fresh operation cannot show the distant neutral wall, including its shadow.
            const fresh = E.make(profile),
              distant = v.wallKnown(wall, E.observe(fresh).fog, "explored");
            render(fresh);
            const unknownPixel = [
              ...v.c.getImageData(
                Math.round(point.x * v.dpr),
                Math.round((point.y - 25 * v.camera.scale * 0.73) * v.dpr),
                1,
                1,
              ).data,
            ];
            render();
            document.body.append(v.canvas);
            v.canvas.id = "fog-evidence";
            v.canvas.style.cssText =
              "position:fixed;inset:0;z-index:9999;width:100%;height:100%";
            return {
              supported,
              sameLevel,
              stable,
              pure,
              opaque,
              ratio: matches / opaque,
              nearby,
              remembered,
              gray,
              rescout,
              distant,
              unknownPixel,
              difference,
            };
          }, profile);
          expect(result.supported).toBe(true);
          expect(result.sameLevel).toBe(true);
          expect(result.stable).toBe(true);
          expect(result.pure).toBe(true);
          expect(result.nearby).toBe(true);
          expect(result.opaque).toBeGreaterThan(1000);
          expect(result.ratio).toBeGreaterThan(0.98);
          expect(result.remembered).toBe(true);
          expect(result.gray[0]).toBeGreaterThan(8);
          expect(result.gray[0]).toBe(result.gray[1]);
          expect(result.gray[1]).toBe(result.gray[2]);
          // Rebuilding the same clip can round antialiased channels by one in Chromium.
          // Paused frames above must still match exactly; returning must preserve knowledge.
          expect(result.difference.reconStable).toBe(true);
          expect(result.difference.max).toBeLessThanOrEqual(1);
          expect(result.distant).toBe(false);
          expect(result.unknownPixel).toEqual([0, 0, 0, 255]);
          expect(errors).toEqual([]);
          if (process.env.SIGNAL_QA_SHOTS)
            await page.screenshot({
              path: path.join(
                process.env.SIGNAL_QA_SHOTS,
                `fog-${browserType.name()}-${profile}-${width}.png`,
              ),
            });
        } finally {
          await browser.close();
        }
      });

test("fog geometry follows subcell movement and preserves diagonal islands and holes", async ({
  page,
}) => {
  await page.goto("/games/signal-frontier/");
  const result = await page.evaluate(() => {
    const v = new SignalView(document.createElement("canvas"));
    v.mapId = "expedition";
    const fog = {
        cell: 40,
        cols: 56,
        rows: 64,
        explored: new Uint8Array(56 * 64),
        exploredCode: "islands",
        observers: [],
      },
      c = document.createElement("canvas").getContext("2d");
    for (const [x, y] of [
      [2, 2],
      [3, 3],
      [6, 2],
      [7, 2],
      [8, 2],
      [6, 3],
      [8, 3],
      [6, 4],
      [7, 4],
      [8, 4],
      [12, 2],
      [12, 3],
      [12, 4],
      [13, 4],
      [14, 4],
      [14, 5],
    ])
      fog.explored[y * 56 + x] = 1;
    const shape = v.fogPath(fog, "explored"),
      inside = (x, y) => c.isPointInPath(shape, x, y);
    const topology = [
      inside(100, 100),
      inside(140, 140),
      inside(140, 100),
      inside(100, 140),
      inside(300, 140),
      inside(260, 140),
      [
        [500, 100],
        [500, 140],
        [500, 180],
        [540, 180],
        [580, 180],
        [580, 220],
      ].every((p) => inside(...p)),
    ];
    // Unobstructed arc of the real flat map; changing x must invalidate the path even if cells do not change.
    fog.observers = [
      { id: 1, x: 300, y: 2100, radius: 180, map: "expedition" },
    ];
    const first = v.fogPath(fog, "visible"),
      a = c.isPointInPath(first, 481, 2100);
    fog.observers[0].x += 4;
    const second = v.fogPath(fog, "visible"),
      b = c.isPointInPath(second, 481, 2100);
    let maxError = 0;
    for (let angle = 0; angle <= Math.PI / 2; angle += 0.06) {
      const x = 304 + Math.cos(angle) * 176,
        y = 2100 + Math.sin(angle) * 176;
      if (!c.isPointInPath(second, x, y)) maxError++;
    }
    return { topology, a, b, invalidated: first !== second, maxError };
  });
  expect(result.topology).toEqual([
    true,
    true,
    false,
    false,
    false,
    true,
    true,
  ]);
  expect(result).toMatchObject({
    a: false,
    b: true,
    invalidated: true,
    maxError: 0,
  });
});

test("gray contours never paint unknown cells across irregular masks and keep their holes", async ({
  page,
}) => {
  await page.goto("/games/signal-frontier/");
  const result = await page.evaluate(() => {
    const v = new SignalView(document.createElement("canvas"));
    v.mapId = "expedition";
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 640;
    const c = canvas.getContext("2d", { willReadFrequently: true });
    let seed = 713,
      leaks = 0,
      missingInterior = 0;
    const random = () =>
      (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let trial = 0; trial < 48; trial++) {
      const fog = {
        cell: 40,
        cols: 16,
        rows: 16,
        explored: new Uint8Array(256),
        exploredCode: String(trial),
        observers: [],
      };
      for (let blob = 0; blob < 12; blob++) {
        const cx = random() * 16,
          cy = random() * 16,
          r = 1 + random() * 6;
        for (let y = 0; y < 16; y++)
          for (let x = 0; x < 16; x++)
            if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r)
              fog.explored[y * 16 + x] = blob % 4 ? 1 : 0;
      }
      const path = v.fogPath(fog, "explored");
      c.clearRect(0, 0, 640, 640);
      c.fill(path);
      const pixels = c.getImageData(0, 0, 640, 640).data;
      for (let y = 0; y < 640; y++)
        for (let x = 0; x < 640; x++)
          if (
            !fog.explored[Math.floor(y / 40) * 16 + Math.floor(x / 40)] &&
            pixels[(y * 640 + x) * 4 + 3] > 1
          )
            leaks++;
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++)
          if (
            x > 0 &&
            y > 0 &&
            x < 15 &&
            y < 15 &&
            fog.explored[y * 16 + x] &&
            fog.explored[y * 16 + x - 1] &&
            fog.explored[y * 16 + x + 1] &&
            fog.explored[(y - 1) * 16 + x] &&
            fog.explored[(y + 1) * 16 + x] &&
            !c.isPointInPath(path, x * 40 + 20, y * 40 + 20)
          )
            missingInterior++;
    }
    return { leaks, missingInterior };
  });
  expect(result).toEqual({ leaks: 0, missingInterior: 0 });
});
