"use strict";
const { deckCard, revealPoint } = require("./helpers/signal-frontier-selection.cjs");
const { test, expect } = require("@playwright/test");
const {
  E,
  field,
  fund,
  findSite,
  build,
} = require("../tests/helpers/signal-frontier-construction.cjs");
const path = require("node:path");
async function boot(page, s) {
  await page.clock.install({ time: new Date("2026-10-29T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-29T12:00:01Z"));
  await page.addInitScript((s) => {
    if (sessionStorage.getItem("construction-fixture")) return;
    sessionStorage.setItem("construction-fixture", "1");
    localStorage.setItem(
      "signal-frontier-v1",
      JSON.stringify({ save: s, settings: { reduced: true, volume: 0 } }),
    );
  }, s);
  await page.goto("/games/signal-frontier/");
  await page.locator("#continue").click();
  await page.keyboard.press("Tab");
  await page.clock.runFor(100);
}
for (const [width, height, touch] of [
  [1440, 900, false],
  [390, 844, true],
  [320, 568, true],
  [844, 390, true],
])
  test(`construction placement, explicit confirmation and cancellation ${width}x${height}`, async ({
    browser,
  }, info) => {
    test.setTimeout(90000);
    const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: touch,
        isMobile: touch,
        deviceScaleFactor: touch ? 2 : 1,
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      const s = field();
      fund(s, 500);
      const p = findSite(s, "barracks");
      await boot(page, s);
      await page.locator("#dock-shop").click();
      await page.locator("#develop-tab-build").click();
      await expect(page.locator("#develop-barracks")).toBeEnabled();
      await page.locator("#develop-barracks").click();
      await page.clock.runFor(300);
      await expect(page.locator("#placement-panel")).toBeVisible();
      expect(
        (await page.evaluate(() => SignalGame.snapshot())).economy.spent,
      ).toBe(0);
      const position = await revealPoint(page, p);
      if (touch) await page.touchscreen.tap(position.x, position.y);
      else await page.mouse.move(position.x, position.y);
      await page.clock.runFor(80);
      await expect(page.locator("#placement-confirm")).toBeEnabled();
      await page.screenshot({ path: info.outputPath("placement.png") });
      const bounds = await page.locator("#placement-panel").boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
      if (touch) {
        const cdp = await context.newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ id: 1, x: position.x, y: position.y }],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ id: 1, x: width / 2, y: bounds.y + 20 }],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        expect(
          (await page.evaluate(() => SignalGame.snapshot())).economy.spent,
        ).toBe(0);
        await page.touchscreen.tap(position.x, position.y);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [
            { id: 1, x: position.x, y: position.y },
            { id: 2, x: position.x + 35, y: position.y + 30 },
          ],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            { id: 1, x: position.x - 10, y: position.y },
            { id: 2, x: position.x + 45, y: position.y + 30 },
          ],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchCancel",
          touchPoints: [],
        });
        expect(
          (await page.evaluate(() => SignalGame.snapshot())).economy.spent,
        ).toBe(0);
        await page.locator("#placement-confirm").tap();
      } else {
        await page.keyboard.press("KeyR");
        await page.keyboard.press("KeyR");
        await page.mouse.click(position.x, position.y);
      }
      await page.clock.runFor(100);
      await expect(page.locator("#placement-panel")).toBeHidden();
      let current = await page.evaluate(() => SignalGame.snapshot());
      expect(current.economy.spent).toBe(120);
      expect(current.units.filter((u) => u.construction)).toHaveLength(1);
      expect(E.restore(current)).not.toBeNull();
      const u = current.units.find((u) => u.construction);
      await page.reload();
      await page.locator("#continue").click();
      await page.keyboard.press("Tab");
      await page.clock.runFor(100);
      current = await page.evaluate(() => SignalGame.snapshot());
      expect(current.units.find((v) => v.id === u.id).construction).toEqual(
        u.construction,
      );
      await page.locator("#dock-shop").click();
      await page.locator("#develop-tab-build").click();
      await page.locator("#develop-outpost").click();
      await page.clock.runFor(80);
      await page.locator("#placement-cancel").click();
      expect(
        (await page.evaluate(() => SignalGame.snapshot())).economy.spent,
      ).toBe(120);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
test("built, rotated and unfinished models are stable in pause and their grid is placement-only", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const s = field();
  fund(s, 1700);
  s.campaign.tier = 2;
  build(s, "barracks");
  build(s, "foundry", E.hero(s), 1);
  build(s, "arsenal");
  const p = findSite(s, "barracks");
  expect(p).not.toBeNull();
  expect(E.purchase(s, "barracks", p).allowed).toBe(true);
  E.refreshRecon(s);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await boot(page, s);
  const result = await page.evaluate(() => {
    const E = SignalEngine,
      s = SignalGame.snapshot(),
      v = new SignalView(document.createElement("canvas")),
      ui = { mode: "tactical", reduced: true, selectionIds: [] };
    v.tactical = { overview: false, x: 450, y: 2450, zoom: 0.8 };
    v.render(E.observe(s), ui, 1);
    // A repeated pose is admitted to the full-resolution cache on its second pass.
    v.render(E.observe(s), ui, 1);
    const a = v.canvas.toDataURL();
    v.render(E.observe(s), ui, 1);
    const stable = a === v.canvas.toDataURL();
    ui.placement = {
      result: E.construction.check(s, "barracks", { x: 660, y: 2180 }),
    };
    v.render(E.observe(s), ui, 1);
    const grid = a !== v.canvas.toDataURL();
    delete ui.placement;
    v.render(E.observe(s), ui, 1);
    return { stable, grid, removed: a === v.canvas.toDataURL() };
  });
  expect(result).toEqual({ stable: true, grid: true, removed: true });
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath("buildings.png") });
});
test("group order chooses one producer, stays in place and survives a reload", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const s = field();
  fund(s, 1400);
  const a = build(s, "barracks"),
    b = build(s, "barracks");
  await boot(page, s);
  await page.locator("#dock-shop").click();
  await page.locator("#develop-tab-production").click();
  await page.locator('[data-production-group="barracks"]').click();
  const button = page.locator("#develop-rifle"),
    before = await button.boundingBox();
  await expect(button).toHaveAttribute("data-producer", String(a.id));
  await button.click();
  await page.clock.runFor(500);
  await expect(button).toHaveAttribute("data-producer", String(b.id));
  const after = await button.boundingBox();
  expect(after.y).toBe(before.y);
  expect(after.x).toBe(before.x);
  await button.click();
  await page.clock.runFor(100);
  const current = await page.evaluate(() => SignalGame.snapshot());
  expect(current.units.find((u) => u.id === a.id).jobs).toHaveLength(1);
  expect(current.units.find((u) => u.id === b.id).jobs).toHaveLength(1);
  expect(E.restore(current)).not.toBeNull();
  await page.screenshot({ path: info.outputPath("production.png") });
});

test("current shop exposes roles, placement cost, locked technology and exact drone refunds at narrow width", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.clock.install();
  await page.goto("/games/signal-frontier/");
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.locator("#start").click();
  await expect(page.locator("body")).toHaveAttribute("data-mode", "tactical");
  await page.locator("#dock-shop").click();
  await page.locator("#develop-tab-build").click();
  const barracks = page.locator("#develop-barracks");
  const foundry = page.locator("#develop-foundry");
  const arsenal = page.locator("#develop-arsenal");
  await expect(barracks).toContainText("120");
  await expect(barracks).toContainText("сплав");
  await expect(barracks).toContainText("30 с");
  await deckCard(page, "develop-foundry");
  await expect(foundry).toContainText("180");
  await expect(foundry).toContainText("45 с");
  await expect(foundry).toContainText("Исследуйте сеть управления");
  await expect(foundry).toBeDisabled();
  await deckCard(page, "develop-arsenal");
  await expect(arsenal).toContainText("180");
  await expect(arsenal).toContainText("45 с");
    await expect(page.locator("#develop-arsenal")).toBeDisabled();
  await page.locator("#dock-shop").click();
  await page.locator("#develop-tab-build").click();
  await barracks.click();
  await expect(page.locator("#placement-panel")).toBeVisible();
  expect((await page.evaluate(() => SignalGame.snapshot())).economy.spent).toBe(
    0,
  );
  const site = findSite(
    await page.evaluate(() => SignalGame.snapshot()),
    "barracks",
  );
  expect(site).not.toBeNull();
  const p = await revealPoint(page, site);
  await page.mouse.move(p.x, p.y);
  await page.clock.runFor(80);
  await expect(page.locator("#placement-confirm")).toBeEnabled();
  await page.locator("#placement-confirm").click();
  await expect(page.locator("#placement-panel")).toBeHidden();
  expect((await page.evaluate(() => SignalGame.snapshot())).economy.spent).toBe(
    120,
  );
  await page.locator("#dock-shop").click();
  await page.locator("#develop-tab-economy").click();
  await page
    .locator("[data-select]")
    .filter({ hasText: "Посадочный узел" })
    .click();
  const base = await page.evaluate(
    () => SignalEngine.living(SignalGame.snapshot(), "base").id,
  );
  const drone = page.locator("#develop-drone-" + base);
  await drone.dblclick();
  await page.clock.runFor(100);
  await expect(drone).toBeDisabled();
  await expect(drone).toContainText("Не хватает 40 сплава");
  await expect(page.locator(".free-queue")).toContainText("18 с");
  const queued = await page.evaluate(() => SignalGame.snapshot());
  expect(queued.economy.spent).toBe(170);
  expect(queued.units.find((u) => u.id === base).jobs).toHaveLength(1);
  await page.locator(".job-select").click();
  await expect(page.locator("#field-alloy")).toHaveText("47");
  await expect(drone).toContainText("Не хватает 3 сплава");
  expect(
    E.restore(await page.evaluate(() => SignalGame.snapshot())),
  ).not.toBeNull();
  expect(
    await page
      .locator("#dialog")
      .evaluate((e) => e.scrollWidth - e.clientWidth),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("shop-current-profile.png") });
});

test("selected production services repair a building and protect the base through real controls", async ({
  page,
}, info) => {
  const s = field();
  fund(s, 700);
  s.campaign.tier = 2;
  const barracks = build(s, "barracks");
  barracks.hp -= 50;
  E.refreshRecon(s);
  await boot(page, s);
  await page.locator("#dock-shop").click();
  await page.locator("#develop-tab-production").click();
  await page.locator('[data-production-group="barracks"]').click();
  await page.locator('[data-select="' + barracks.id + '"]').click();
  await page.locator('[data-section="service"]').click();
  const beforeRepair = await page.evaluate(() => SignalGame.snapshot());
  const repair = page.locator("#develop-repair-drone");
  await expect(repair).toBeEnabled();
  await repair.click();
  const repairing = await page.evaluate(() => SignalGame.snapshot());
  expect(repairing.economy.spent).toBe(beforeRepair.economy.spent);
  expect(
    repairing.units
      .some((u) => u.kind === "drone" && u.workerTask?.targetId === barracks.id),
  ).toBe(true);
  expect(E.restore(repairing)).not.toBeNull();
  await page.locator("[data-deck-back]").click();
  await page.locator("#develop-tab-economy").click();
  const base = E.living(repairing, "base");
  await page.locator('[data-select="' + base.id + '"]').click();
  const beforeDefense = await page.evaluate(() => SignalGame.snapshot());
  await page.locator('[data-section="tech"]').click();
  await deckCard(page, "develop-defense-" + base.id);
  await expect(page.locator("#develop-defense-" + base.id)).toBeEnabled();
  await page.locator("#develop-defense-" + base.id).click();
  const protectedBase = await page.evaluate(() => SignalGame.snapshot());
  expect(protectedBase.economy.spent - beforeDefense.economy.spent).toBe(120);
  expect(
    protectedBase.units
      .find((u) => u.id === base.id)
      .jobs.some((j) => j.action === "defense"),
  ).toBe(true);
  expect(E.restore(protectedBase)).not.toBeNull();
  await page.screenshot({ path: info.outputPath("selected-services.png") });
});

test("placement keeps the overview button in sync with the focused camera", async ({
  page,
}, info) => {
  const s = E.make("frontier-8");
  await boot(page, s);
  const overview = page.locator("#map-overview");
  await overview.click();
  await expect(overview).toHaveAttribute("aria-pressed", "true");
  expect((await page.evaluate(() => SignalGame.camera())).overview).toBe(true);
  await page.locator("#dock-shop").click();
  await page.locator("#develop-tab-build").click();
  await page.locator("#develop-barracks").click();
  await expect(page.locator("#placement-panel")).toBeVisible();
  expect((await page.evaluate(() => SignalGame.camera())).overview).toBe(false);
  await expect(overview).toHaveAttribute("aria-pressed", "false");
  await overview.click();
  await page.clock.runFor(100);
  await expect(overview).toHaveAttribute("aria-pressed", "true");
  expect((await page.evaluate(() => SignalGame.camera())).overview).toBe(true);
  const site = findSite(
    await page.evaluate(() => SignalGame.snapshot()),
    "barracks",
  );
  expect(site).not.toBeNull();
  const point = await page.evaluate((p) => SignalGame.screen(p.x, p.y), site);
  const canvas = await page.locator("#field").boundingBox();
  expect(point.x).toBeGreaterThan(canvas.x);
  expect(point.x).toBeLessThan(canvas.x + canvas.width);
  expect(point.y).toBeGreaterThan(canvas.y);
  expect(point.y).toBeLessThan(canvas.y + canvas.height);
  await page.mouse.move(point.x, point.y);
  await page.clock.runFor(100);
  await expect(page.locator("#placement-confirm")).toBeEnabled();
  expect((await page.evaluate(() => SignalGame.snapshot())).economy.spent).toBe(
    0,
  );
  await page.screenshot({ path: info.outputPath("overview-placement.png") });
  await page.locator("#placement-cancel").click();
  await expect(page.locator("#placement-panel")).toBeHidden();
  expect((await page.evaluate(() => SignalGame.snapshot())).economy.spent).toBe(
    0,
  );
});

test("webkit touch placement cancels without payment and confirms one construction", async ({}, info) => {
  const browser = await require("playwright").webkit.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await boot(page, E.make("frontier-8"));
    const before = await page.evaluate(() => SignalGame.snapshot());
    const site = findSite(before, "barracks");
    expect(site).not.toBeNull();
    for (const confirm of [false, true]) {
      await page.locator("#dock-shop").tap();
      await page.locator("#develop-tab-build").tap();
      await page.locator("#develop-barracks").tap();
      await page.clock.runFor(100);
      const point = await page.evaluate(
        (p) => SignalGame.screen(p.x, p.y),
        site,
      );
      await page.touchscreen.tap(point.x, point.y);
      await page.clock.runFor(100);
      await expect(page.locator("#placement-confirm")).toBeEnabled();
      expect(
        (await page.evaluate(() => SignalGame.snapshot())).economy.spent,
      ).toBe(0);
      await page
        .locator(confirm ? "#placement-confirm" : "#placement-cancel")
        .tap();
      await page.clock.runFor(100);
      await expect(page.locator("#placement-panel")).toBeHidden();
      const after = await page.evaluate(() => SignalGame.snapshot());
      expect(after.economy.spent).toBe(confirm ? 120 : 0);
      expect(after.units.filter((u) => u.construction)).toHaveLength(
        confirm ? 1 : 0,
      );
      expect(E.restore(after)).not.toBeNull();
      if (!confirm) expect(after).toEqual(before);
    }
    expect(errors).toEqual([]);
    await page.screenshot({
      path: info.outputPath("webkit-touch-construction.png"),
    });
  } finally {
    await context.close();
    await browser.close();
  }
});

test("an exhausted home still offers a paid builder and preserves its queue after reload", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const s = field();
  fund(s, 1440);
  for (const u of s.units) if (u.kind === "drone") u.hp = 0;
  E.refreshRecon(s);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await boot(page, s);
  const base = E.living(s, "base");
  const before = await page.evaluate(() => SignalGame.snapshot());
  await page.locator("#dock-shop").click();
  await page.locator("#develop-tab-economy").click();
  await page.locator('[data-select="' + base.id + '"]').click();
  const button = page.locator("#develop-drone-" + base.id);
  await expect(button).toBeEnabled();
  await expect(button).toContainText("50");
  await expect(button).toContainText("18 с");
  await button.click();
  await page.reload();
  await page.locator("#continue").click();
  const queued = await page.evaluate(() => SignalGame.snapshot());
  expect(queued.economy.spent - before.economy.spent).toBe(50);
  expect(queued.economy.alloy).toBe(before.economy.alloy - 50);
  expect(queued.units.find((u) => u.id === base.id).jobs).toHaveLength(1);
  expect(E.restore(queued)).not.toBeNull();
  if ((await page.evaluate(() => SignalGame.mode())) !== "playing")
    await page.keyboard.press("Tab");
  await page.clock.runFor(19000);
  const trained = await page.evaluate(() => SignalGame.snapshot());
  expect(
    trained.units.filter((u) => u.kind === "drone" && u.hp > 0),
  ).toHaveLength(1);
  expect(trained.units.find((u) => u.id === base.id).jobs).toHaveLength(0);
  expect(trained.economy.alloy).toBe(before.economy.alloy - 50);
  expect(trained.campaign.deposited).toBe(before.campaign.deposited);
  expect(trained.campaign.mines.find((m) => m.id === "home").remaining).toBe(0);
  expect(E.restore(trained)).not.toBeNull();
  expect(errors).toEqual([]);
  await page.keyboard.press("Tab");
  await expect(page.locator("body")).toHaveAttribute("data-mode", "tactical");
  await page.locator("#dock-shop").click();
  await page.locator("#develop-tab-economy").click();
  await page.screenshot({
    path: info.outputPath("exhausted-home-builder.png"),
  });
});
