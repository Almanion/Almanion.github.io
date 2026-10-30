"use strict";
const { test, expect } = require("@playwright/test");

test("idle tactical pause stops painting, and camera input wakes it without advancing combat", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.clock.install({ time: new Date("2026-10-29T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-29T12:00:01Z"));
  await page.addInitScript(() => {
    window.paintedFrames = 0;
    Object.defineProperty(window, "SignalView", {
      configurable: true,
      set(View) {
        const render = View.prototype.render;
        View.prototype.render = function (...args) {
          window.paintedFrames++;
          return render.apply(this, args);
        };
        Object.defineProperty(window, "SignalView", {
          value: View,
          writable: true,
        });
      },
    });
  });
  await page.goto("/games/signal-frontier/");
  await page.locator("#start").click();
  await page.clock.runFor(200);
  await expect(page.locator("body")).toHaveAttribute("data-mode", "tactical");
  await page.mouse.move(600, 350);
  await page.clock.runFor(4000);
  const before = await page.evaluate(() => ({
    frames: paintedFrames,
    state: SignalGame.snapshot(),
    image: document.querySelector("#field").toDataURL(),
  }));
  // Hovering across an unchanged map must not wake the full scene either.
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(470 + i * 12, 300 + (i % 3) * 15);
    await page.clock.runFor(160);
  }
  expect(await page.evaluate(() => paintedFrames)).toBe(before.frames);
  expect(
    await page.evaluate(() => document.querySelector("#field").toDataURL()),
  ).toBe(before.image);
  await page.keyboard.down("KeyD");
  await page.clock.runFor(400);
  await page.keyboard.up("KeyD");
  expect(await page.evaluate(() => paintedFrames)).toBeGreaterThan(
    before.frames,
  );
  expect(
    await page.evaluate(() => document.querySelector("#field").toDataURL()),
  ).not.toBe(before.image);
  expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(
    before.state,
  );
  await page.clock.runFor(4000);
  const settled = await page.evaluate(() => paintedFrames);
  await page.clock.runFor(2000);
  expect(await page.evaluate(() => paintedFrames)).toBe(settled);
  await page.keyboard.press("Tab");
  await page.clock.runFor(500);
  expect(await page.evaluate(() => SignalGame.snapshot().t)).toBeGreaterThan(
    before.state.t,
  );
});

for (const [width, height, dpr] of [
  [1440, 900, 1],
  [390, 844, 2],
])
  test(`camera reuses full-resolution fog memory and invalidates changed knowledge ${width}`, async ({
    browser,
  }, info) => {
    test.setTimeout(90000);
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: dpr,
    });
    try {
      await page.goto("/games/signal-frontier/");
      const results = await page.evaluate(() => {
        const out = [];
        for (const [profile, explored] of [
          ["frontier-8", false],
          ["frontier-9", false],
          ["frontier-9", true],
        ]) {
          const E = SignalEngine,
            s = E.make(profile),
            h = E.hero(s),
            a = new SignalView(document.createElement("canvas")),
            b = new SignalView(document.createElement("canvas")),
            ui = {
              mode: "tactical",
              reduced: true,
              touch: true,
              selectionIds: [],
            };
          if (explored) {
            for (const [x, y] of [
              [520, 880],
              [1000, 1120],
              [1880, 1640],
              [2800, 1600],
              [2800, 2400],
              [2160, 3320],
            ]) {
              Object.assign(h, { x, y });
              E.refreshRecon(s);
            }
            Object.assign(h, { x: 400, y: 2400 });
            E.refreshRecon(s);
          }
          b.memoryPadding = 0;
          let paints = 0;
          const paint = a.paintMemory;
          a.paintMemory = function (...args) {
            paints++;
            return paint.apply(this, args);
          };
          const comparisons = [];
          let refinement;
          for (let i = 0; i < 7; i++) {
            if (i === 5) {
              Object.assign(h, { x: 1100, y: 2450 });
              E.living(s, "base").hp -= 10;
              E.refreshRecon(s);
            }
            if (i === 6) a.reset(s);
            const focus = explored ? { x: 1100, y: 1100 } : h,
              x = focus.x + [0, 2, 20, 1000, 0, 5, 5][i],
              y = focus.y - E.elevation(focus.x, focus.y, E.map(s)) + i * 0.37;
            a.tactical = b.tactical = {
              overview: false,
              x,
              y,
              zoom: i === 4 ? 1.1 : 0.9,
            };
            const scene = E.observe(s),
              before = JSON.stringify(s),
              count = paints;
            a.render(scene, ui, 1);
            b.render(scene, ui, 1);
            const aa = a.c.getImageData(
                0,
                0,
                a.canvas.width,
                a.canvas.height,
              ).data,
              bb = b.c.getImageData(0, 0, b.canvas.width, b.canvas.height).data;
            let sum = 0,
              large = 0;
            for (let j = 0; j < aa.length; j++) {
              const d = Math.abs(aa[j] - bb[j]);
              sum += d;
              if (d > 8) large++;
            }
            comparisons.push({
              i,
              mean: sum / aa.length,
              large: large / aa.length,
              rebuilt: paints - count,
              pure: before === JSON.stringify(s),
            });
            if (i === 2) {
              const count = paints;
              a.render(scene, ui, 1);
              const refined = a.c.getImageData(
                0,
                0,
                a.canvas.width,
                a.canvas.height,
              ).data;
              let sum = 0;
              for (let j = 0; j < refined.length; j++)
                sum += Math.abs(refined[j] - bb[j]);
              refinement = {
                mean: sum / refined.length,
                rebuilt: paints - count,
                pending: a.memoryNeedsRefine,
              };
              if (explored)
                window.memoryProof = {
                  cached: a.canvas.toDataURL(),
                  reference: b.canvas.toDataURL(),
                };
            }
          }
          out.push({
            profile,
            explored,
            refinement,
            comparisons,
            size: [a.canvas.width, a.canvas.height],
          });
        }
        return out;
      });
      await info.attach("memory-comparison", {
        body: JSON.stringify(results, null, 2),
        contentType: "application/json",
      });
      const proof = await page.evaluate(() => window.memoryProof);
      for (const name of ["cached", "reference"])
        await info.attach("fog-memory-" + name, {
          body: Buffer.from(proof[name].split(",")[1], "base64"),
          contentType: "image/png",
        });
      for (const r of results) {
        expect(r.refinement.mean).toBeLessThan(0.001);
        expect(r.refinement.rebuilt).toBe(1);
        expect(r.refinement.pending).toBe(false);
        expect(r.size).toEqual([width * dpr, height * dpr]);
        for (const c of r.comparisons) {
          expect(c.pure).toBe(true);
          expect(c.mean).toBeLessThan(0.35);
          expect(c.large).toBeLessThan(0.01);
          expect(c.rebuilt).toBe(c.i === 1 || c.i === 2 ? 0 : 1);
        }
      }
    } finally {
      await page.close();
    }
  });

test("unit reuse preserves changing poses, weapons, damage and camera pixel scale", async ({
  page,
}) => {
  await page.goto("/games/signal-frontier/");
  const results = await page.evaluate(() => {
    const E = SignalEngine,
      s = E.make(),
      h = E.hero(s),
      a = new SignalView(document.createElement("canvas")),
      b = new SignalView(document.createElement("canvas")),
      ui = { mode: "tactical", reduced: true, touch: true, selectionIds: [] };
    b.unitSprite = function (c, u, s, ui, pose) {
      this.unitModel(c, u, s, ui, pose);
    };
    const comparisons = [];
    for (let frame = 0; frame < 6; frame++) {
      h.angle = frame * 0.7;
      h.hp = 150 - frame * 7;
      h.flash = frame % 2 ? 0.09 : 0;
      ui.reduced = frame < 3;
      ui.aim = { x: h.x + 100, y: h.y + frame * 50 };
      a.tactical = b.tactical = {
        overview: false,
        x: h.x,
        y: h.y,
        zoom: 0.7 + frame * 0.13,
      };
      const state = JSON.stringify(s);
      a.render(s, ui, 1);
      b.render(s, ui, 1);
      const x = a.c.getImageData(0, 0, a.canvas.width, a.canvas.height).data,
        y = b.c.getImageData(0, 0, b.canvas.width, b.canvas.height).data;
      let sum = 0,
        large = 0;
      for (let i = 0; i < x.length; i++) {
        const d = Math.abs(x[i] - y[i]);
        sum += d;
        if (d > 8) large++;
      }
      comparisons.push({
        mean: sum / x.length,
        large: large / x.length,
        pure: JSON.stringify(s) === state,
      });
    }
    return comparisons;
  });
  for (const result of results) {
    expect(result.pure).toBe(true);
    expect(result.mean).toBeLessThan(0.04);
    expect(result.large).toBeLessThan(0.0005);
  }
});

test("reused model geometry matches direct vectors for every model, direction and action", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.goto("/games/signal-frontier/");
  const result = await page.evaluate(() => {
    const E = SignalEngine,
      s = E.make("frontier-8"),
      toolkit = SignalView.artwork.toolkit,
      art = { ...toolkit, MAT: { graphite: toolkit.materials.dark } },
      a = SignalUnitModels.create(E, art),
      b = SignalUnitModels.create(E, art, { geometryCache: false }),
      canvases = [
        document.createElement("canvas"),
        document.createElement("canvas"),
      ];
    for (const c of canvases) c.width = c.height = 256;
    const errors = [];
    let comparisons = 0,
      maxMean = 0;
    for (const kind of SignalUnitModels.types)
      for (let direction = 0; direction < 8; direction++)
        for (const mode of ["idle", "move", "aim", "damage", "wreck"]) {
          const angle = (direction * Math.PI) / 4,
            u = {
              id: 1001,
              kind,
              team: [
                "hero",
                "rifle",
                "scout",
                "drone",
                "artillery",
                "base",
                "outpost",
                "foundry",
                "arsenal",
                "barracks",
              ].includes(kind)
                ? 0
                : 1,
              x: 0,
              y: 0,
              angle,
              hp:
                mode === "wreck"
                  ? 0
                  : E.C[kind].hp * (mode === "damage" ? 0.4 : 1),
              wind: mode === "aim" ? 0.35 : 0,
              cool: 0,
              hit: 0,
              flash: 0,
              jobs: [],
              path: [],
              build: 0,
              combat: {
                mode: mode === "aim" ? "aim" : "idle",
                time: 0.35,
                total: 0.8,
                angle,
              },
              target: { x: 200, y: 100 },
            },
            pose = {
              phase: 1.7,
              move: mode === "move" ? 1 : 0,
              angle,
              direction: angle,
              cycle: 32,
              left: 15,
              right: 18,
            },
            ui = { mode: "playing", reduced: false };
          for (let warm = 0; warm < 3; warm++)
            for (let k = 0; k < 2; k++) {
              const c = canvases[k].getContext("2d", {
                willReadFrequently: true,
              });
              c.setTransform(1, 0, 0, 1, 0, 0);
              c.clearRect(0, 0, 256, 256);
              c.translate(128.31, 180.17);
              c.scale(1.17, 0.73 * 1.17);
              [a, b][k].draw(c, u, s, ui, pose, () => {});
            }
          const aa = canvases[0]
              .getContext("2d")
              .getImageData(0, 0, 256, 256).data,
            bb = canvases[1].getContext("2d").getImageData(0, 0, 256, 256).data;
          let sum = 0;
          for (let i = 0; i < aa.length; i++) sum += Math.abs(aa[i] - bb[i]);
          const mean = sum / aa.length;
          maxMean = Math.max(maxMean, mean);
          if (mean > 0.001) errors.push({ kind, direction, mode, mean });
          comparisons++;
        }
    return { comparisons, maxMean, errors, cache: a.geometryStats() };
  });
  await info.attach("geometry-comparison", {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
  expect(result.errors).toEqual([]);
  expect(result.comparisons).toBe(880);
  expect(result.cache.hits).toBeGreaterThan(1000);
  expect(result.cache.entries).toBeLessThanOrEqual(512);
});
