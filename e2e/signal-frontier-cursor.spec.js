"use strict";
const { test, expect } = require("@playwright/test");

for (const [name, width, height, touch, dpr] of [
  ["desktop", 1440, 900, false, 1],
  ["narrow HiDPI", 600, 800, false, 2],
  ["mouse on touch device", 800, 1024, true, 2],
]) {
  test(`native aim stays available between game frames: ${name}`, async ({ browser }) => {
    const page = await browser.newPage({
      viewport: { width, height }, hasTouch: touch, deviceScaleFactor: dpr,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
      await page.clock.pauseAt(new Date("2026-10-30T12:00:01Z"));
      await page.addInitScript(() => {
        window.cursorProbe = { frames: 0, aims: 0, latest: null };
        Object.defineProperty(window, "SignalView", {
          configurable: true,
          set(View) {
            const render = View.prototype.render, aim = View.prototype.aim;
            View.prototype.render = function (...args) {
              cursorProbe.frames++;
              return render.apply(this, args);
            };
            View.prototype.aim = function (x, y, hero) {
              cursorProbe.aims++;
              cursorProbe.latest = { x, y };
              return aim.call(this, x, y, hero);
            };
            Object.defineProperty(window, "SignalView", { value: View, writable: true });
          },
        });
      });
      await page.goto("/games/signal-frontier/");
      await page.locator("#start").click();
      await page.clock.runFor(200);
      await page.keyboard.press("Tab");
      await page.clock.runFor(120);
      await expect(page.locator("body")).toHaveAttribute("data-mode", "playing");
      const before = await page.evaluate(() => ({
        probe: { ...cursorProbe }, state: SignalGame.snapshot(),
        image: document.querySelector("#field").toDataURL(),
      }));
      // Hold game time and rendering still while real pointer events arrive.
      // Input must keep its native cursor without doing terrain/render work.
      for (let i = 0; i < 18; i++)
        await page.mouse.move(width * 0.55 + i * 3, 270 + (i % 4) * 7);
      const last = { x: Math.round(width * 0.7), y: 320 };
      await page.mouse.move(last.x, last.y);
      const held = await page.evaluate(async (last) => {
        const field = document.querySelector("#field"),
          cursor = getComputedStyle(document.elementFromPoint(last.x, last.y)).cursor,
          url = cursor.match(/url\("(data:image\/svg\+xml,[^"]+)"\)/)?.[1];
        let size = null;
        if (url) {
          const icon = new Image(); icon.src = url; await icon.decode();
          size = [icon.naturalWidth, icon.naturalHeight];
        }
        return { cursor, size, probe: { ...cursorProbe }, state: SignalGame.snapshot(), image: field.toDataURL() };
      }, last);
      expect(held.cursor).toContain("data:image/svg+xml");
      expect(held.cursor).toMatch(/16 16,\s*crosshair$/);
      expect(held.size).toEqual([32, 32]);
      expect(held.probe).toEqual(before.probe);
      expect(held.state).toEqual(before.state);
      expect(held.image).toBe(before.image);
      // Resume: the scout consumes the newest point, not a backlog of turns.
      await page.clock.runFor(40);
      const resumed = await page.evaluate(() => ({ ...cursorProbe }));
      expect(resumed.latest).toEqual(last);
      expect(resumed.aims - before.probe.aims).toBeGreaterThan(0);
      expect(resumed.aims - before.probe.aims).toBeLessThanOrEqual(3);
      const firedAt = await page.evaluate(() => SignalGame.snapshot().ammo);
      await page.mouse.down();
      await page.clock.runFor(40);
      await page.mouse.up();
      expect(await page.evaluate(() => SignalGame.snapshot().ammo)).toBeLessThan(firedAt);
      await expect(page.locator(".stick.engaged")).toHaveCount(0);
      if (name === "desktop") {
        const rifle = await page.evaluate(() => {
          const u = SignalGame.snapshot().units.find((u) => !u.team && u.kind === "rifle");
          return SignalGame.screen(u.x, u.y);
        });
        await page.mouse.click(rifle.x, rifle.y);
        await page.locator("#order-move").click();
        await expect(page.locator("#field")).toHaveCSS("cursor", "crosshair");
        await page.locator("#order-cancel").click();
        await expect(page.locator("#field")).toHaveCSS("cursor", /data:image\/svg\+xml/);
      }
      await page.keyboard.press("Tab");
      await expect(page.locator("body")).toHaveAttribute("data-mode", "tactical");
      expect(await page.locator("#field").evaluate((el) => getComputedStyle(el).cursor)).not.toContain("data:image/svg+xml");
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  });
}

for (const width of [320, 390])
  test(`real fingers still move and aim independently at ${width}`, async ({ browser, browserName }) => {
    test.skip(browserName !== "chromium", "Trusted multitouch injection requires Chromium CDP");
    const context = await browser.newContext({
      viewport: { width, height: 844 }, hasTouch: true, isMobile: true,
    }), page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
      await page.clock.pauseAt(new Date("2026-10-30T12:00:01Z"));
      await page.goto("/games/signal-frontier/");
      await page.locator("#start").tap();
      await page.clock.runFor(150);
      await page.keyboard.press("Tab");
      await page.clock.runFor(100);
      const left = { id: 1, x: 65, y: 220 },
        right = { id: 2, x: width - 65, y: 220 },
        session = await context.newCDPSession(page),
        touch = (type, touchPoints) => session.send("Input.dispatchTouchEvent", { type, touchPoints }),
        read = () => page.evaluate(() => {
          const s = SignalGame.snapshot();
          return { x: SignalEngine.hero(s).x, y: SignalEngine.hero(s).y, ammo: s.ammo };
        });
      // Verify the gesture starts on the field, outside the minimap/menu.
      expect(await page.evaluate((p) => document.elementFromPoint(p.x, p.y).closest(".stick")?.id, left)).toBe("move-stick");
      expect(await page.evaluate((p) => document.elementFromPoint(p.x, p.y).closest(".stick")?.id, right)).toBe("aim-stick");
      const before = await read();
      await touch("touchStart", [left]);
      left.x += 40;
      await touch("touchMove", [left]);
      await touch("touchStart", [left, right]);
      right.x += 35;
      await touch("touchMove", [left, right]);
      await page.clock.runFor(200);
      const active = await read();
      expect(active.x).toBeGreaterThan(before.x + 5);
      expect(active.ammo).toBeLessThan(before.ammo);
      await expect(page.locator(".stick.engaged")).toHaveCount(2);
      await touch("touchEnd", []);
      const stopped = await read();
      await page.clock.runFor(100);
      const after = await read();
      expect(after.x).toBeCloseTo(stopped.x, 6);
      expect(after.y).toBeCloseTo(stopped.y, 6);
      expect(after.ammo).toBe(stopped.ammo);
      await expect(page.locator(".stick.engaged")).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
