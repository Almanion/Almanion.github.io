"use strict";
const { test, expect } = require("@playwright/test");

test("changing models avoid disposable images and stable poses reuse a bounded cache", async ({
  page,
}) => {
  await page.goto("/games/signal-frontier/");
  const result = await page.evaluate(() => {
    const E = SignalEngine,
      s = E.make("frontier-9"),
      v = new SignalView(document.createElement("canvas")),
      u = { ...s.units.find((u) => u.kind === "rifle"), x: 120, y: 120 },
      ui = { mode: "playing", reduced: false };
    const c = v.c,
      pose = {
        phase: 0,
        move: 1,
        settle: 0,
        angle: 0,
        direction: 0,
        cycle: 42,
      };
    v.mapId = "districts";
    for (let i = 0; i < 10; i++) {
      pose.phase = i * 0.1;
      v.unitSprite(c, u, s, ui, pose);
    }
    const changing = v.unitSprites.get(u.id).canvas === null;
    v.unitSprite(c, u, s, ui, pose);
    const first = v.unitSprites.get(u.id).canvas;
    v.unitSprite(c, u, s, ui, pose);
    const reused = first !== null && v.unitSprites.get(u.id).canvas === first;
    for (let frame = 0; frame < 3; frame++)
      for (let i = 0; i < 180; i++)
        v.unitSprite(c, { ...u, id: 1000 + i }, s, ui, pose);
    const stable = [...v.unitSprites.values()].filter((entry) => entry.canvas).length;
    return {
      changing,
      reused,
      entries: v.unitSprites.size,
      pixels: v.spritePixels,
      stable,
    };
  });
  expect(result.changing).toBe(true);
  expect(result.reused).toBe(true);
  expect(result.entries).toBeLessThanOrEqual(1024);
  expect(result.stable).toBeGreaterThan(128);
  expect(result.pixels).toBeLessThanOrEqual(8 * 1024 * 1024);
});

test("mouse aims without moving the camera; walking still moves it", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-29T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-29T12:00:01Z"));
  await page.goto("/games/signal-frontier/");
  await page.locator("#start").click();
  await page.keyboard.press("Tab");
  await page.clock.runFor(4000);
  const before = await page.evaluate(() => ({
    camera: SignalGame.camera(),
    hero: SignalGame.snapshot().units.find((u) => u.kind === "hero"),
  }));
  const angles = [];
  for (const [x, y] of [
    [430, 300],
    [800, 600],
    [700, 280],
    [450, 500],
  ]) {
    await page.mouse.move(x, y, { steps: 12 });
    await page.clock.runFor(180);
    expect(await page.evaluate(() => SignalGame.camera())).toEqual(
      before.camera,
    );
    angles.push(
      await page.evaluate(
        () => SignalGame.snapshot().units.find((u) => u.kind === "hero").angle,
      ),
    );
  }
  expect(new Set(angles).size).toBeGreaterThan(2);
  await page.keyboard.down("KeyD");
  // Walk beyond the left map boundary's camera clamp before checking follow.
  await page.clock.runFor(2400);
  await page.keyboard.up("KeyD");
  const moved = await page.evaluate(() => ({
    camera: SignalGame.camera(),
    hero: SignalGame.snapshot().units.find((u) => u.kind === "hero"),
  }));
  expect(moved.hero.x).toBeGreaterThan(before.hero.x + 10);
  expect(moved.camera.x).not.toBe(before.camera.x);
});

for (const [width, height, dpr] of [
  [1440, 900, 1],
  [390, 844, 2],
])
  test(`direct ground retains fog, cliffs, models and shadows ${width}`, async ({
    browser,
  }, info) => {
    test.setTimeout(180000);
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: dpr,
    });
    try {
      await page.goto("/games/signal-frontier/");
      const results = await page.evaluate(() => {
        const rows = [];
        for (const profile of ["frontier-6", "frontier-8", "frontier-9"]) {
          const E = SignalEngine,
            s = E.make(profile),
            hero = E.hero(s);
          const views = [false, true].map((compositeGround) => {
            const canvas = document.createElement("canvas");
            canvas.getContext("2d", { alpha: false, willReadFrequently: true });
            return new SignalView(canvas, {
              compositeGround,
              cacheFloor: !compositeGround,
            });
          });
          const points =
            profile === "frontier-6"
              ? [
                  [400, 1650],
                  [900, 1200],
                ]
              : [
                  [1000, 1120],
                  [1880, 1640],
                ];
          for (const [x, y] of points) {
            Object.assign(hero, { x, y });
            E.refreshRecon(s);
            for (const zoom of [0.3, 0.9, 1.3]) {
              const scene = E.observe(s),
                before = JSON.stringify(s);
              for (const v of views) {
                v.tactical = { overview: false, x, y, zoom };
                v.render(
                  scene,
                  {
                    mode: "tactical",
                    reduced: true,
                    touch: true,
                    selectionIds: [hero.id],
                  },
                  1,
                );
                // Exercise both admission and reuse of the exact terrain projection.
                v.render(
                  scene,
                  {
                    mode: "tactical",
                    reduced: true,
                    touch: true,
                    selectionIds: [hero.id],
                  },
                  1,
                );
                v.render(
                  scene,
                  {
                    mode: "tactical",
                    reduced: true,
                    touch: true,
                    selectionIds: [hero.id],
                  },
                  1,
                );
              }
              const [a, b] = views.map(
                (v) =>
                  v.c.getImageData(0, 0, v.canvas.width, v.canvas.height).data,
              );
              let sum = 0,
                large = 0;
              for (let i = 0; i < a.length; i++) {
                const d = Math.abs(a[i] - b[i]);
                sum += d;
                if (d > 8) large++;
              }
              rows.push({
                profile,
                x,
                y,
                zoom,
                mean: sum / a.length,
                large: large / a.length,
                pure: before === JSON.stringify(s),
                direct: views[0].groundCanvas === null,
                floorPixels: views[0].floorPixels,
                floorEntries: views[0].floorImages.size,
              });
            }
          }
        }
        return rows;
      });
      await info.attach("ground-reference", {
        body: JSON.stringify(results, null, 2),
        contentType: "application/json",
      });
      for (const r of results) {
        expect(r.pure).toBe(true);
        expect(r.direct).toBe(true);
        expect(r.floorPixels).toBeLessThanOrEqual(4 * 1024 * 1024);
        expect(r.floorEntries).toBeLessThanOrEqual(3);
        // Only antialiasing of the clipped boundary changes with compositing order.
        expect(r.mean).toBeLessThan(0.12);
        expect(r.large).toBeLessThan(0.002);
      }
    } finally {
      await page.close();
    }
  });
