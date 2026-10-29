"use strict";
const { test, expect } = require("@playwright/test");

test("idle tactical pause stops painting, and camera input wakes it without advancing combat", async ({
  page,
}) => {
  await page.clock.install();
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
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
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
  await page.clock.runFor(2000);
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
