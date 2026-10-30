"use strict";
const { selectGroup } = require("./helpers/signal-frontier-selection.cjs");
const { test, expect, chromium, webkit } = require("@playwright/test");
const E = require("../game-source/signal-frontier/src/engine");
const route = "/games/signal-frontier/";
function scenario() {
  const s = E.make("frontier-6"),
    h = E.hero(s),
    troops = s.units.filter((u) => u.group === 1);
  Object.assign(h, { x: 240, y: 1600 });
  for (const [i, u] of troops.entries())
    Object.assign(
      u,
      [
        { x: 320, y: 1500 },
        { x: 400, y: 1520 },
        { x: 550, y: 1730 },
      ][i],
    );
  return s;
}
async function boot(page, state = scenario()) {
  E.refreshRecon(state);
  expect(E.restore(state)).not.toBeNull();
  await page.clock.install();
  await page.addInitScript(
    (s) =>
      localStorage.setItem(
        "signal-frontier-v1",
        JSON.stringify({ settings: { volume: 0, reduced: true }, save: s }),
      ),
    state,
  );
  await page.goto(route);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.locator("#continue").click();
  await page.clock.runFor(100);
  expect(await page.evaluate(() => SignalGame.mode())).toBe("playing");
}
async function box(page, ids, down = true, button = "right") {
  const points = await page.evaluate((ids) => {
    const s = SignalGame.snapshot();
    return ids.map((id) => {
      const u = s.units.find((u) => u.id === id);
      return SignalGame.screen(u.x, u.y);
    });
  }, ids);
  const rect = {
    x: Math.min(...points.map((p) => p.x)) - 20,
    y: Math.min(...points.map((p) => p.y)) - 24,
    right: Math.max(...points.map((p) => p.x)) + 20,
    bottom: Math.max(...points.map((p) => p.y)) + 24,
  };
  await page.mouse.move(rect.x, rect.y);
  if (down) await page.mouse.down({ button });
  await page.mouse.move(rect.right, rect.bottom, { steps: 8 });
  return rect;
}
test("right drag selects only part of the army during live combat, then orders only that part", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = scenario(),
    ids = state.units.filter((u) => u.group === 1).map((u) => u.id);
  await boot(page, state);
  const before = await page.evaluate(() => SignalGame.snapshot());
  await box(page, ids.slice(0, 2));
  await expect(page.locator("#selection-box")).toBeVisible();
  const camera = await page.evaluate(() => SignalGame.camera());
  await page.clock.runFor(200);
  expect((await page.evaluate(() => SignalGame.snapshot())).t).toBeGreaterThan(
    before.t,
  );
  expect(await page.evaluate(() => SignalGame.camera())).toEqual(camera);
  await page.screenshot({
    path: "test-results/signal-controls-selection-drag.png",
  });
  await page.mouse.up({ button: "right" });
  expect((await page.evaluate(() => SignalGame.selection())).ids).toEqual(
    ids.slice(0, 2),
  );
  await expect(page.locator("#selection-box")).toBeHidden();
  const point = await page.evaluate(() => SignalGame.screen(650, 1500));
  await page.mouse.click(point.x, point.y, { button: "right" });
  const after = await page.evaluate(() => SignalGame.snapshot());
  expect(
    after.units.filter((u) => u.team === 0 && u.order).map((u) => u.id),
  ).toEqual(ids.slice(0, 2));
  expect(after.economy).toEqual(before.economy);
  await page.keyboard.down("Control");
  await box(page, [ids[2]]);
  await page.mouse.up({ button: "right" });
  await page.keyboard.up("Control");
  expect((await page.evaluate(() => SignalGame.selection())).ids).toEqual(ids);
  await page.locator("#select-army").click();
  expect((await page.evaluate(() => SignalGame.selection())).ids).toEqual(ids);
  await page.screenshot({ path: "test-results/signal-controls-selection.png" });
});
test("whole group selection includes overlapping troops", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = scenario(),
    troops = state.units.filter((u) => u.group === 1),
    ids = troops.map((u) => u.id);
  for (const u of troops) Object.assign(u, { x: 400, y: 1500 });
  await boot(page, state);
  await page.locator("#tactical").click();
  await selectGroup(page, 1);
  expect((await page.evaluate(() => SignalGame.selection())).ids).toEqual(ids);
  const p = await page.evaluate(() => SignalGame.screen(620, 1500));
  await page.mouse.click(p.x, p.y, { button: "right" });
  const after = await page.evaluate(() => SignalGame.snapshot());
  expect(
    after.units.filter((u) => u.group === 1 && u.order).map((u) => u.id),
  ).toEqual(ids);
});

test("selection cancellation, empty frames and tactical dragging never issue an accidental order", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await boot(page);
  const ids = await page.evaluate(() => SignalGame.snapshot().units.filter((u) => u.group === 1).map((u) => u.id)),
    before = await page.evaluate(() => SignalGame.snapshot());
  await box(page, [ids[0]]);
  await page.keyboard.press("Escape");
  await page.mouse.up({ button: "right" });
  expect(
    (await page.evaluate(() => SignalGame.snapshot())).units.map(
      (u) => u.order,
    ),
  ).toEqual(before.units.map((u) => u.order));
  expect(await page.evaluate(() => SignalGame.mode())).toBe("playing");
  await page.mouse.move(750, 160);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(820, 220);
  await page.mouse.up({ button: "right" });
  expect((await page.evaluate(() => SignalGame.selection())).ids).toEqual([]);
  await page.mouse.click(800, 240, { button: "right" });
  expect(
    (await page.evaluate(() => SignalGame.snapshot())).units.map(
      (u) => u.order,
    ),
  ).toEqual(before.units.map((u) => u.order));
  await page.keyboard.press("Tab");
  await page.clock.runFor(100);
  const paused = await page.evaluate(() => SignalGame.snapshot().t);
  await box(page, [ids[0]], true, "left");
  await page.mouse.up({ button: "left" });
  await page.clock.runFor(300);
  expect((await page.evaluate(() => SignalGame.selection())).ids).toEqual([
    ids[0],
  ]);
  expect(await page.evaluate(() => SignalGame.snapshot().t)).toBe(paused);
  const orders = await page.evaluate(() =>
    SignalGame.snapshot().units.map((u) => u.order),
  );
  await box(page, [ids[1]], true, "left");
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.clock.runFor(100);
  await page.mouse.up({ button: "left" });
  await expect(page.locator("#selection-box")).toBeHidden();
  expect(
    await page.evaluate(() => SignalGame.snapshot().units.map((u) => u.order)),
  ).toEqual(orders);
});
for (const type of [chromium, webkit])
  test(
    type.name() +
      " floating sticks: neutral contact, analogue movement, tap fire, cancellation and rotation",
    async () => {
      test.setTimeout(90000);
      const browser = await type.launch(),
        context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
        });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      try {
        // Portable touch drag with a real active pointer; mouse behaviour has
        // separate coverage in signal-frontier-cursor.spec.js.
        await page.addInitScript(() => {
          for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"])
            addEventListener(type, (e) => {
              if (e.pointerType === "mouse") Object.defineProperty(e, "pointerType", { value: "touch" });
            }, true);
        });
        const state = scenario(),
          h = E.hero(state),
          enemy = state.units.find((u) => u.kind === "sentinel");
        Object.assign(enemy, { x: h.x + 220, y: h.y });
        for (const u of state.units) if (u.group) u.hp = 0;
        await boot(page, state);
        const m = await page.locator("#move-stick").boundingBox();
        const start = { x: m.x + m.width / 2 - 20, y: 220 };
        const read = () =>
          page.evaluate(() => {
            const s = SignalGame.snapshot();
            return { h: SignalEngine.hero(s), shots: s.shots };
          });
        const idle = await read();
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.clock.runFor(200);
        expect((await read()).h.x).toBe(idle.h.x);
        await page.mouse.move(start.x + 4, start.y);
        await page.clock.runFor(100);
        expect((await read()).h.x).toBe(idle.h.x);
        await page.mouse.move(start.x + 14, start.y);
        await page.clock.runFor(100);
        const slow = (await read()).h.x - idle.h.x;
        expect(slow).toBeGreaterThan(1);
        expect(slow).toBeLessThan(10);
        const at = (await read()).h.x;
        await page.mouse.move(start.x + 42, start.y);
        await page.clock.runFor(100);
        expect((await read()).h.x - at).toBeGreaterThan(slow * 2);
        await page.mouse.up();
        const stopped = await read();
        await page.clock.runFor(200);
        expect((await read()).h.x).toBeCloseTo(stopped.h.x, 6);

        const edge = { x: m.x + 25, y: 180 },
          edgeBefore = await read();
        await page.mouse.move(edge.x, edge.y);
        await page.mouse.down();
        await page.mouse.move(edge.x + 46, edge.y);
        await page.clock.runFor(100);
        expect((await read()).h.x).toBeGreaterThan(edgeBefore.h.x + 15);
        expect((await read()).h.y).toBeCloseTo(edgeBefore.h.y, 6);
        await page.mouse.up();
        const a = await page.locator("#aim-stick").boundingBox(),
          center = { x: a.x + a.width / 2, y: 220 };
        const shots = (await read()).shots;
        await page.mouse.click(center.x, center.y);
        await page.clock.runFor(100);
        expect((await read()).shots).toBe(shots + 1);
        expect(Math.abs((await read()).h.angle)).toBeLessThan(0.1);
        await page.clock.runFor(350);
        expect((await read()).shots).toBe(shots + 1);
        await page.mouse.move(center.x, center.y);
        await page.mouse.down();
        await page.mouse.move(center.x + 30, center.y - 15);
        await page.clock.runFor(200);
        const firing = (await read()).shots;
        expect(firing).toBeGreaterThan(shots + 1);
        await page.mouse.move(center.x, center.y);
        await page.clock.runFor(200);
        await page.mouse.up();
        await page.clock.runFor(200);
        expect((await read()).shots).toBe(firing);
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x + 45, start.y);
        await page.setViewportSize({ width: 844, height: 390 });
        await page.clock.runFor(100);
        const rotated = await read();
        await page.clock.runFor(200);
        expect((await read()).h.x).toBeCloseTo(rotated.h.x, 6);
        await page.mouse.up();
        expect(await page.locator(".stick.active").count()).toBe(0);
        await page.screenshot({
          path: "test-results/signal-controls-" + type.name() + ".png",
        });
        expect(errors).toEqual([]);
      } finally {
        await context.close();
        await browser.close();
      }
    },
  );
