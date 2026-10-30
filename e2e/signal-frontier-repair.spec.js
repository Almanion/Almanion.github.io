"use strict";
const { test, expect, chromium, webkit } = require("@playwright/test"),
  { E, fund, findSite, frames } = require("../tests/helpers/signal-frontier-construction.cjs");
function fixture(construction = false) {
  const s = E.make("frontier-9");
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((c) => c.reserve = 0);
  fund(s, 1400);
  if (construction) {
    const p = findSite(s, "barracks");
    const result = E.purchase(s, "barracks", p);
    if (!result.allowed) throw Error(result.reason);
    frames(s, 900);
    const site = s.units.find((u) => u.id === result.buildingId);
    if (!site.build) throw Error("Expected a construction in progress");
  }
  const b = E.living(s, "base"); b.hp = 360;
  E.refreshRecon(s);
  if (!E.restore(s)) throw Error("Invalid repair fixture");
  return s;
}
async function boot(page, s, reduced = false) {
  await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-30T12:00:01Z"));
  await page.addInitScript(({ s, reduced }) => {
    if (sessionStorage.getItem("repair-fixture")) return;
    sessionStorage.setItem("repair-fixture", "1");
    localStorage.setItem("signal-frontier-v1", JSON.stringify({ save: s, settings: { reduced, volume: 0 } }));
  }, { s, reduced });
  await page.goto("/games/signal-frontier/");
  await expect(page.locator(".edition")).toContainText("0.20.0");
  await page.locator("#continue").click();
  await page.locator("#tactical").click();
  await page.clock.runFor(250);
}
async function unitPoint(page, id) {
  return page.evaluate((id) => {
    const u = SignalGame.snapshot().units.find((u) => u.id === id), p = SignalGame.screen(u.x, u.y);
    return { x: p.x, y: p.y - 8 * SignalGame.camera().scale };
  }, id);
}

for (const type of [chromium, webkit])
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568], [844, 390]])
    test(`${type.name()} repair controls, save and mobile service panel ${width}x${height}`, async ({}, info) => {
      test.setTimeout(90000);
      const browser = await type.launch(), touch = width < 900,
        context = await browser.newContext({ viewport: { width, height }, hasTouch: touch,
          isMobile: touch, deviceScaleFactor: touch ? 2 : 1 }), page = await context.newPage(), errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      try {
        const s = fixture(), base = E.living(s, "base");
        await boot(page, s);
        await page.locator("#dock-shop").click();
        await page.locator("#develop-tab-economy").click();
        await page.locator(`[data-select="${base.id}"]`).click();
        await page.locator('[data-section="service"]').click();
        await expect(page.locator("#develop-repair-drone")).toBeEnabled();
        await expect(page.locator("#develop-repair-drone")).toContainText("1 сплава за 8");
        await page.screenshot({ path: info.outputPath("repair-menu.png") });
        await page.locator("#develop-repair-drone").click();
        const ordered = await page.evaluate(() => SignalGame.snapshot()),
          worker = ordered.units.find((u) => u.workerTask?.kind === "repair");
        expect(worker.workerTask.targetId).toBe(base.id);
        expect(ordered.economy).toEqual(s.economy);
        expect(ordered.units.find((u) => u.id === base.id).hp).toBe(base.hp);
        expect(E.restore(ordered)).not.toBeNull();
        const layout = await page.locator("#command-dock").evaluate((d) => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          bottom: d.getBoundingClientRect().bottom,
          scroll: document.getElementById("development-panel").scrollHeight - document.getElementById("development-panel").clientHeight,
        }));
        expect(layout.overflow).toBe(false);
        expect(layout.bottom).toBeLessThanOrEqual(height + 1);
        expect(layout.scroll).toBeLessThanOrEqual(2);
        await page.reload();
        await page.locator("#continue").click();
        await page.locator("#tactical").click();
        await page.clock.runFor(200);
        expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(ordered);
        await page.locator("#tactical").click();
        await page.clock.runFor(2500);
        const playing = await page.evaluate(() => SignalGame.snapshot());
        expect(playing.units.find((u) => u.id === base.id).hp).toBeGreaterThan(base.hp);
        expect(playing.economy.spent).toBeGreaterThan(ordered.economy.spent);
        expect(errors).toEqual([]);
      } finally { await browser.close(); }
    });

test("selected probe repairs with right click during battle and returns to mining from the contextual button", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const s = fixture(), d = s.units.find((u) => u.kind === "drone"), b = E.living(s, "base");
  await boot(page, s);
  const p = await unitPoint(page, d.id);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#selection-count")).toContainText("Зонд");
  await page.keyboard.press("Control+3");
  await page.locator("#tactical").click();
  await page.clock.runFor(150);
  const q = await unitPoint(page, b.id);
  await page.mouse.click(q.x, q.y, { button: "right" });
  await page.clock.runFor(100);
  expect(await page.evaluate(() => SignalGame.mode())).toBe("playing");
  let state = await page.evaluate(() => SignalGame.snapshot());
  expect(state.units.find((u) => u.id === d.id).workerTask?.targetId).toBe(b.id);
  await page.locator("#tactical").click();
  await page.keyboard.press("3");
  await expect(page.locator("#order-cancel")).toHaveText("К добыче");
  await page.locator("#order-cancel").click();
  state = await page.evaluate(() => SignalGame.snapshot());
  expect(state.units.find((u) => u.id === d.id).workerTask).toBeUndefined();
  expect(E.restore(state)).not.toBeNull();
});

test("touch probe selection and contextual repair need no mouse or keyboard", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }),
    page = await context.newPage(), s = fixture(), d = s.units.find((u) => u.kind === "drone"), b = E.living(s, "base");
  try {
    await boot(page, s);
    const p = await unitPoint(page, d.id);
    await page.touchscreen.tap(p.x, p.y);
    await expect(page.locator("#order-move")).toHaveText("Приказ");
    await page.locator("#order-move").tap();
    const q = await unitPoint(page, b.id);
    await page.touchscreen.tap(q.x, q.y);
    const state = await page.evaluate(() => SignalGame.snapshot());
    expect(state.units.find((u) => u.id === d.id).workerTask?.targetId).toBe(b.id);
    expect(state.t).toBe(s.t);
    expect(E.restore(state)).not.toBeNull();
  } finally { await context.close(); }
});

test("construction and welding animate deterministically, respect reduced motion, and never mutate an operation", async ({ page }, info) => {
  const s = fixture(true), site = s.units.find((u) => u.construction),
    builder = s.units.find((u) => u.id === site.construction.builderId),
    repairer = s.units.find((u) => u.kind === "drone" && !u.buildingId), b = E.living(s, "base");
  Object.assign(builder, site.construction.work); builder.path = [];
  E.construction.repair(s, b.id, [repairer.id]);
  Object.assign(repairer, repairer.workerTask.point); repairer.path = [];
  E.refreshRecon(s);
  await page.goto("/games/signal-frontier/");
  const result = await page.evaluate((s) => {
    const view = new SignalView(document.createElement("canvas")), canvas = document.createElement("canvas");
    canvas.width = 1100; canvas.height = 700;
    const c = canvas.getContext("2d", { willReadFrequently: true }),
      base = s.units.find((u) => u.kind === "base"), site = s.units.find((u) => u.construction),
      workers = s.units.filter((u) => u.kind === "drone"), center = { x: (base.x + site.x) / 2, y: (base.y + site.y) / 2 };
    view.mapId = "classic";
    const hash = () => {
      const data = c.getImageData(0, 0, canvas.width, canvas.height).data;
      let h = 2166136261;
      for (const v of data) h = Math.imul(h ^ v, 16777619);
      return h >>> 0;
    };
    const draw = (time, reduced) => {
      s.t = time;
      const before = JSON.stringify(s);
      c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = "#10262b"; c.fillRect(0, 0, canvas.width, canvas.height);
      c.translate(550, 390); c.scale(1.8, 1.8 * 0.73); c.translate(-center.x, -center.y);
      view.serviceActivity(s);
      for (const u of [base, site, ...workers].sort((a, b) => a.y - b.y))
        view.unitModel(c, u, s, { mode: "tactical", reduced }, { phase: 0, move: 0, angle: u.angle });
      if (JSON.stringify(s) !== before) throw Error("Renderer changed the operation");
      return hash();
    };
    const a = draw(s.t, false), frozen = draw(s.t, false), moving = draw(s.t + 0.35, false),
      reduced = draw(s.t, true), still = draw(s.t + 0.35, true);
    return { a, frozen, moving, reduced, still, image: canvas.toDataURL() };
  }, E.snapshot(s));
  expect(result.frozen).toBe(result.a);
  expect(result.moving).not.toBe(result.a);
  expect(result.still).toBe(result.reduced);
  await info.attach("workshop-models", { body: Buffer.from(result.image.split(",")[1], "base64"), contentType: "image/png" });
});

test("active construction and repair stop painting in tactical pause and resume with game time", async ({ page }) => {
  test.setTimeout(90000);
  const s = fixture(true), base = E.living(s, "base"),
    repairer = s.units.find((u) => u.kind === "drone" && !u.buildingId);
  E.construction.repair(s, base.id, [repairer.id]);
  Object.assign(repairer, repairer.workerTask.point); repairer.path = [];
  E.refreshRecon(s);
  await page.addInitScript(() => {
    window.repairFrames = 0;
    Object.defineProperty(window, "SignalView", { configurable: true, set(View) {
      const render = View.prototype.render;
      View.prototype.render = function (...args) { repairFrames++; return render.apply(this, args); };
      Object.defineProperty(window, "SignalView", { value: View, writable: true });
    } });
  });
  await boot(page, s);
  await page.clock.runFor(3500);
  const before = await page.evaluate(() => ({ frames: repairFrames, state: SignalGame.snapshot(),
    image: document.getElementById("field").toDataURL() }));
  for (let i = 0; i < 8; i++) {
    await page.mouse.move(600 + i * 10, 300 + i * 3);
    await page.clock.runFor(150);
  }
  expect(await page.evaluate(() => repairFrames)).toBe(before.frames);
  expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(before.state);
  expect(await page.locator("#field").evaluate((c) => c.toDataURL())).toBe(before.image);
  await page.locator("#tactical").click();
  await page.clock.runFor(500);
  const running = await page.evaluate(() => SignalGame.snapshot());
  expect(running.t).toBeGreaterThan(before.state.t);
  expect(running.units.find((u) => u.id === base.id).hp).toBeGreaterThan(base.hp);
});
