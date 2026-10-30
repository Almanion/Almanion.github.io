"use strict";
const { test, expect } = require("@playwright/test");
const path = require("node:path");

for (const [width, height] of [
  [320, 568],
  [390, 844],
  [844, 390],
])
  test(`fixed touch origins and four-finger movement, fire, dash, reload ${width}x${height}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.clock.install();
      await page.goto("/games/signal-frontier/");
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
      await page.locator("#start").tap();
      await page.locator("#tactical").tap();
      await page.clock.runFor(300);
      const cdp = await context.newCDPSession(page);
      const move = { id: 1, x: width * 0.22, y: height * 0.48 },
        aim = { id: 2, x: width * 0.72, y: height * 0.48 };
      const send = (type, points) =>
        cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
      const bases = () =>
        page.evaluate(() =>
          ["move-stick", "aim-stick"].map((id) => {
            const el = document.getElementById(id);
            return [
              el.style.getPropertyValue("--base-x"),
              el.style.getPropertyValue("--base-y"),
            ];
          }),
        );
      await send("touchStart", [move, aim]);
      const initial = await bases();
      const held = [
        { ...move, x: move.x + 55 },
        { ...aim, x: aim.x + 35, y: aim.y - 18 },
      ];
      await send("touchMove", held);
      await page.clock.runFor(300);
      const beforeActions = await page.evaluate(() => SignalGame.snapshot());
      expect(beforeActions.shots).toBeGreaterThan(0);
      const buttons = [];
      for (const [index, id] of ["dash", "reload"].entries()) {
        const button = page.locator("#" + id),
          box = await button.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(48);
        expect(box.height).toBeGreaterThanOrEqual(48);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.y + box.height).toBeLessThanOrEqual(height);
        expect(
          await button.evaluate((el) => getComputedStyle(el).borderRadius),
        ).toBe("50%");
        await expect(button).toBeEnabled();
        buttons.push({
          id: index + 3,
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
        });
      }
      await send("touchStart", [...held, ...buttons]);
      await page.clock.runFor(50);
      const actions = await page.evaluate(() => SignalGame.snapshot());
      expect(actions.dash).toBeGreaterThan(3);
      expect(actions.reload).toBeGreaterThan(0.9);
      expect(actions.units[0].x).toBeGreaterThan(beforeActions.units[0].x);
      expect(await bases()).toEqual(initial);
      // CDP releases omitted points on touchMove; touchEnd ends the sequence.
      await send("touchMove", held);
      // A long drag crosses the middle; capture keeps ownership and the base.
      await send("touchMove", [
        { ...held[0], x: width * 0.82, y: height * 0.72 },
        held[1],
      ]);
      await page.clock.runFor(100);
      expect(await bases()).toEqual(initial);
      expect(
        await page
          .locator("#move-stick")
          .evaluate((el) =>
            Math.hypot(
              parseFloat(el.style.getPropertyValue("--stick-x")),
              parseFloat(el.style.getPropertyValue("--stick-y")),
            ),
          ),
      ).toBeLessThanOrEqual(42.001);
      await send("touchCancel", []);
      await page.clock.runFor(350);
      const stopped = await page.evaluate(() => SignalGame.snapshot());
      await page.clock.runFor(150);
      const after = await page.evaluate(() => SignalGame.snapshot());
      expect(after.units[0].x).toBe(stopped.units[0].x);
      expect(after.units[0].y).toBe(stopped.units[0].y);
      expect(after.shots).toBe(stopped.shots);
      await expect(
        page.locator(".stick.engaged, .action-button.pressed"),
      ).toHaveCount(0);
      // The next touch gets a new origin; rotation cancels it safely.
      await send("touchStart", [{ id: 5, x: move.x + 20, y: move.y + 35 }]);
      expect((await bases())[0]).not.toEqual(initial[0]);
      await page.setViewportSize({ width: height, height: width });
      await send("touchCancel", []);
      await page.clock.runFor(200);
      await expect(page.locator(".stick.engaged")).toHaveCount(0);
      await page.setViewportSize({ width, height });
      await page.clock.runFor(1500);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      expect(errors).toEqual([]);
      if (process.env.SIGNAL_QA_SHOTS)
        await page.screenshot({
          path: path.join(
            process.env.SIGNAL_QA_SHOTS,
            `mobile-controls-${width}.png`,
          ),
        });
    } finally {
      await context.close();
    }
  });
