"use strict";
const { selectArmy } = require("./helpers/signal-frontier-selection.cjs");
const { test, expect, chromium, webkit } = require("@playwright/test"),
  E = require("../game-source/signal-frontier/src/engine");

async function boot(page, state) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-30T12:00:01Z"));
  if (state) await page.addInitScript((save) => localStorage.setItem("signal-frontier-v1", JSON.stringify({save,settings:{volume:0,reduced:true}})), state);
  await page.goto("/games/signal-frontier/");
  await page.locator(state ? "#continue" : "#start").click();
  if (state) await page.locator("#tactical").click();
  await page.clock.runFor(1200);
}
async function miniPoint(page, point) {
  return page.evaluate((p) => {
    const r = document.getElementById("minimap-canvas").getBoundingClientRect(),
      g = SignalGame.diagnostics().minimap.geometry;
    return { x: r.x + g.x + p.x * g.scale, y: r.y + g.y + p.y * g.scale };
  }, point);
}
const escorts = (s) =>
  s.units.filter((u) => !u.team && u.hp > 0 && u.group === 1);

for (const type of [chromium, webkit])
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [320, 568],
    [844, 390],
  ])
    test(`${type.name()} mini-map at bottom left, legend and camera ${width}x${height}`, async ({}, info) => {
      const b = await type.launch(),
        touch = width < 900,
        ctx = await b.newContext({
          viewport: { width, height },
          hasTouch: touch,
          isMobile: touch,
          deviceScaleFactor: touch ? 2 : 1,
        }),
        page = await ctx.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      try {
        await boot(page);
        const initial = await page.evaluate(() => SignalGame.snapshot()),
          camera = await page.evaluate(() => SignalGame.camera()),
          panel = await page.locator("#minimap-panel").boundingBox();
        expect(panel.x).toBeLessThanOrEqual(25);
        const dock = await page.locator("#command-dock").boundingBox();
        if (panel.x + panel.width <= dock.x + 1)
          expect(panel.y + panel.height).toBeCloseTo(dock.y + dock.height, 0);
        else expect(panel.y + panel.height).toBeLessThanOrEqual(dock.y - 6);
        expect(panel.y + panel.height).toBeLessThanOrEqual(height - 8);
        await page.locator("#minimap-key").click();
        const legend = await page.locator("#minimap-legend").boundingBox();
        expect(legend.x).toBeGreaterThanOrEqual(13);
        expect(legend.y).toBeGreaterThanOrEqual(13);
        expect(legend.x + legend.width).toBeLessThanOrEqual(width - 8);
        expect(legend.y + legend.height).toBeLessThanOrEqual(height - 8);
        await expect(page.locator("#minimap-symbols > span")).toHaveCount(9);
        await page.screenshot({ path: info.outputPath("legend.png") });
        await page.locator("#minimap-key-close").click();
        if (touch) {
          for (const id of ["map-overview", "map-center", "minimap-key"]) {
            const r = await page.locator("#" + id).boundingBox();
            expect(r.width).toBeGreaterThanOrEqual(31);
            expect(r.height).toBeGreaterThanOrEqual(31);
          }
        }
        const p = await miniPoint(page, { x: 2000, y: 1500 });
        if (touch) await page.touchscreen.tap(p.x, p.y);
        else await page.mouse.click(p.x, p.y);
        await page.clock.runFor(1200);
        expect(await page.evaluate(() => SignalGame.camera())).not.toEqual(
          camera,
        );
        expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(
          initial,
        );
        await page.locator("#map-center").click();
        await page.clock.runFor(1200);
        await page.locator("#map-overview").click();
        await expect(page.locator("#minimap-panel")).toHaveAttribute(
          "data-folded",
          "true",
        );
        await page.locator("#map-center").click();
        await expect(page.locator("#minimap-canvas")).toBeVisible();
        expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(
          initial,
        );
        expect(errors).toEqual([]);
      } finally {
        await b.close();
      }
    });

test("mini-map commands use visible targets, cancel outside releases, and preserve combat", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = E.make("frontier-9"), h = E.hero(state), enemyUnit = state.units.find((u) => u.team && u.kind === "sentinel");
  Object.assign(enemyUnit, {x:h.x+200,y:h.y});
  enemyUnit.ai.home = {x:enemyUnit.x,y:enemyUnit.y}; E.refreshRecon(state);
  await boot(page, state);
  await selectArmy(page);
  const initial = await page.evaluate(() => SignalGame.snapshot()),
    target = { x: 1100, y: 2650 },
    p = await miniPoint(page, target);
  const hero = await miniPoint(page, E.hero(initial));
  await page.mouse.click(hero.x, hero.y, { button: "right" });
  expect(
    escorts(await page.evaluate(() => SignalGame.snapshot())).every(
      (u) => u.order?.followId === E.hero(initial).id,
    ),
  ).toBe(true);
  await page.mouse.click(p.x, p.y, { button: "right" });
  const moved = await page.evaluate(() => SignalGame.snapshot());
  expect(
    escorts(moved).every(
      (u) =>
        u.order &&
        u.order.followId === undefined &&
        u.order.targetId === undefined,
    ),
  ).toBe(true);
  expect(moved.t).toBe(initial.t);
  expect(moved.economy).toEqual(initial.economy);
  expect(E.restore(moved)).not.toBeNull();
  await page.mouse.move(p.x, p.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(600, 500);
  await page.mouse.up({ button: "right" });
  expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(moved);
  const enemy = (
    await page.evaluate(() => SignalGame.diagnostics().minimap.markers)
  ).find((u) => u.symbol === "enemy" && !u.memory);
  expect(enemy).toBeTruthy();
  const ep = await miniPoint(page, enemy);
  await page.evaluate(() => {
    const c = document.getElementById("minimap-canvas").getContext("2d"),
      stroke = c.stroke;
    window.miniStrokes = [];
    c.stroke = function (...args) {
      miniStrokes.push(this.strokeStyle);
      return stroke.apply(this, args);
    };
  });
  await page.mouse.click(ep.x, ep.y, { button: "right" });
  await page.clock.runFor(80);
  expect(await page.evaluate(() => miniStrokes)).toContain("#ff7771");
  const attacked = await page.evaluate(() => SignalGame.snapshot());
  expect(escorts(attacked).every((u) => u.target?.id === enemy.unitId)).toBe(
    true,
  );
  expect(attacked.t).toBe(initial.t);
  // Enter combat and inspect a remote sector while simulation continues.
  await page.locator("#tactical").click();
  const remote = await miniPoint(page, { x: 2000, y: 1500 });
  await page.mouse.click(remote.x, remote.y);
  await page.clock.runFor(400);
  await expect(page.locator("#map-center")).toHaveAttribute(
    "data-inspecting",
    "true",
  );
  expect(await page.evaluate(() => SignalGame.mode())).toBe("playing");
  const during = await page.evaluate(() => SignalGame.snapshot());
  expect(during.t).toBeGreaterThan(initial.t);
  expect(during.ammo).toBe(initial.ammo);
  await page.keyboard.down("KeyD");
  await page.clock.runFor(300);
  await page.keyboard.up("KeyD");
  await expect(page.locator("#map-center")).toHaveAttribute(
    "data-inspecting",
    "false",
  );
  expect(
    E.hero(await page.evaluate(() => SignalGame.snapshot())).x,
  ).toBeGreaterThan(E.hero(during).x);
});

test("keyboard inspection, fold preference and idle pause avoid repainting an unchanged mini-map", async ({
  page,
}) => {
  await boot(page);
  const initial = await page.evaluate(() => SignalGame.snapshot()),
    before = await page.evaluate(() => SignalGame.diagnostics().minimap);
  for (let i = 0; i < 10; i++) {
    const r = await page.locator("#minimap-canvas").boundingBox();
    await page.mouse.move(r.x + 10 + i * 4, r.y + 20);
    await page.clock.runFor(100);
  }
  await page.clock.runFor(2000);
  expect(await page.evaluate(() => SignalGame.diagnostics().minimap)).toEqual(
    before,
  );
  await page.locator("#minimap-canvas").focus();
  const camera = await page.evaluate(() => SignalGame.camera());
  await page.keyboard.press("ArrowRight");
  await page.clock.runFor(600);
  expect((await page.evaluate(() => SignalGame.camera())).x).toBeGreaterThan(
    camera.x,
  );
  expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(initial);
  await page.keyboard.press("Home");
  await page.clock.runFor(1000);
  await page.keyboard.press("KeyM");
  await expect(page.locator("#minimap-canvas")).toBeHidden();
  await page.reload();
  await page.locator("#continue").click();
  await expect(page.locator("#minimap-canvas")).toBeHidden();
  await page.keyboard.press("KeyM");
  await expect(page.locator("#minimap-canvas")).toBeVisible();
  await page.clock.runFor(500);
  const a = await page.evaluate(() => SignalGame.diagnostics().minimap);
  await page.clock.runFor(1000);
  const b = await page.evaluate(() => SignalGame.diagnostics().minimap);
  expect(b.terrainBuilds).toBe(a.terrainBuilds);
  expect(b.markerBuilds - a.markerBuilds).toBeLessThanOrEqual(11);
});

test("touch inspection and centering keep the movement finger active; touch command mode issues an order", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    }),
    page = await ctx.newPage();
  try {
    await boot(page);
    await selectArmy(page);
    await page.locator("#order-move").tap();
    const target = await miniPoint(page, { x: 1100, y: 2650 });
    const cdp = await ctx.newCDPSession(page),
      untouched = await page.evaluate(() => SignalGame.snapshot());
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 7, ...target }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(untouched);
    await page.touchscreen.tap(target.x, target.y);
    expect(
      escorts(await page.evaluate(() => SignalGame.snapshot())).every(
        (u) => u.order,
      ),
    ).toBe(true);
    await expect(page.locator("#order-move")).not.toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.locator("#tactical").tap();
    await page.clock.runFor(300);
    const initial = await page.evaluate(() => SignalGame.snapshot()),
      finger = { id: 1, x: 60, y: 180 },
      shifted = { ...finger, x: 105 },
      remote = await miniPoint(page, { x: 2000, y: 1500 });
    const touch = (type, touchPoints) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
    await touch("touchStart", [finger]);
    await touch("touchMove", [shifted]);
    await page.clock.runFor(180);
    await touch("touchStart", [shifted, { id: 2, ...remote }]);
    await touch("touchEnd", [{ id: 2, ...remote }]);
    await page.clock.runFor(180);
    await expect(page.locator("#move-stick")).toHaveClass(/active/);
    await expect(page.locator("#map-center")).toHaveAttribute(
      "data-inspecting",
      "true",
    );
    const r = await page.locator("#map-center").boundingBox();
    await touch("touchStart", [
      shifted,
      { id: 3, x: r.x + r.width / 2, y: r.y + r.height / 2 },
    ]);
    await touch("touchEnd", [
      { id: 3, x: r.x + r.width / 2, y: r.y + r.height / 2 },
    ]);
    await page.clock.runFor(200);
    await expect(page.locator("#map-center")).toHaveAttribute(
      "data-inspecting",
      "false",
    );
    await expect(page.locator("#move-stick")).toHaveClass(/active/);
    const after = await page.evaluate(() => SignalGame.snapshot());
    expect(E.hero(after).x).toBeGreaterThan(E.hero(initial).x + 20);
    expect(after.ammo).toBe(initial.ammo);
    expect(await page.evaluate(() => SignalGame.mode())).toBe("playing");
    await touch("touchEnd", []);
    await expect(page.locator("#move-stick")).not.toHaveClass(/active/);
    expect(E.restore(after)).not.toBeNull();
  } finally {
    await ctx.close();
  }
});
