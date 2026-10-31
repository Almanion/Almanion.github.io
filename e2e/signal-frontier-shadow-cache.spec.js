"use strict";
const { test, expect } = require("@playwright/test");

test("reused vector shadows preserve ledges, overlapping faces and fractional camera scale", async ({ page }) => {
  await page.goto("/games/signal-frontier/");
  const result = await page.evaluate(() => {
    const reference = new SignalView(document.createElement("canvas"), { cacheShadows: false }),
      reused = new SignalView(document.createElement("canvas")),
      positions = [[390, 2415], [560, 2200], [1000, 2040], [2140, 500], [2400, 500], [2835, 495], [1600, 2000], [3000, 3200]],
      shape = [[-23, -15], [-19, -18], [19, -18], [23, -15], [23, 15], [19, 18], [-19, 18], [-23, 15]];
    for (const view of [reference, reused]) {
      view.mapId = "districts";
      view.canvas.width = view.canvas.height = 256;
    }
    let comparisons = 0, maxMean = 0;
    for (const [x, y] of positions) for (let i = 0; i < 16; i++) {
      const z = SignalEngine.terrain.height(x, y), angle = i * Math.PI / 8;
      for (let warm = 0; warm < 4; warm++) for (const view of [reference, reused]) {
        const c = view.c;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.fillStyle = "#fff"; c.fillRect(0, 0, 256, 256);
        c.setTransform(1.1, 0, 0, 0.803, 128 - x * 1.1, 100 - (y - z) * 0.803);
        view.shadow(c, x, y, shape, 26, angle);
      }
      const a = reference.c.getImageData(0, 0, 256, 256).data,
        b = reused.c.getImageData(0, 0, 256, 256).data;
      let sum = 0;
      for (let k = 0; k < a.length; k++) sum += Math.abs(a[k] - b[k]);
      maxMean = Math.max(maxMean, sum / a.length);
      comparisons++;
    }
    return { comparisons, maxMean, entries: reused.shadowShapes.size };
  });
  expect(result.comparisons).toBe(128);
  expect(result.maxMean).toBeLessThan(0.005);
  expect(result.entries).toBeGreaterThan(0);
  expect(result.entries).toBeLessThanOrEqual(512);
});
