"use strict";
const { test, expect, chromium, webkit } = require("@playwright/test"),
  { E, scene, frames } = require("../tests/helpers/signal-frontier-balance.cjs"),
  legacy = require("../tests/fixtures/signal-frontier-v17-repair.json");
async function boot(page, s) {
  await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-30T12:00:01Z"));
  await page.addInitScript((s) => {
    if (sessionStorage.getItem("balance-fixture")) return;
    sessionStorage.setItem("balance-fixture", "1");
    localStorage.setItem("signal-frontier-v1", JSON.stringify({ save: s, settings: { reduced: true, volume: 0 } }));
  }, s);
  await page.goto("/games/signal-frontier/");
  await expect(page.locator(".edition")).toContainText("0.20.0");
  await page.locator("#continue").click();
  await page.locator("#tactical").click();
  await page.clock.runFor(200);
}
for (const type of [chromium, webkit])
  for (const [width, height] of [[1440, 900], [390, 844]])
    test(`${type.name()} upgrades 0.17 repairs and construction with expanded sight ${width}`, async ({}) => {
      const browser = await type.launch(), context = await browser.newContext({ viewport: { width, height },
        hasTouch: width < 900, isMobile: width < 900 }), page = await context.newPage(), errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      try {
        await boot(page, legacy);
        const migrated = await page.evaluate(() => SignalGame.snapshot());
        expect(migrated.campaign.balance).toBe(1);
        for (const key of ["units", "economy", "t", "bullets", "seed"])
          expect(migrated[key]).toEqual(legacy[key]);
        expect(await page.evaluate(() => {
          const s = SignalGame.snapshot();
          return { valid: !!SignalEngine.restore(s), sight: SignalEngine.sightRange(s, SignalEngine.hero(s)) };
        })).toEqual({ valid: true, sight: 780 });
        await page.reload(); await page.locator("#continue").click(); await page.locator("#tactical").click();
        expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(migrated);
        await page.locator("#tactical").click(); await page.clock.runFor(500);
        const running = await page.evaluate(() => SignalGame.snapshot());
        expect(running.units.find((u) => u.kind === "base").hp).toBeGreaterThan(migrated.units.find((u) => u.kind === "base").hp);
        expect(E.restore(running)).not.toBeNull();
        expect(errors).toEqual([]);
      } finally { await browser.close(); }
    });

test("artillery receives a real long-range attack command and fires using shared scouting", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { s, u, target } = scene("artillery", 790, false, true), errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await boot(page, s);
  const point = await page.evaluate(() => {
    const g = SignalGame.diagnostics().minimap.geometry, r = document.getElementById("minimap-canvas").getBoundingClientRect();
    return { x: r.x + g.x + 795 * g.scale, y: r.y + g.y + 3600 * g.scale };
  });
  await page.mouse.click(point.x, point.y); await page.clock.runFor(150);
  const at = async (id) => page.evaluate((id) => {
    const s = SignalGame.snapshot(), u = s.units.find((u) => u.id === id), p = SignalGame.screen(u.x, u.y);
    return { x: p.x, y: p.y - 8 * SignalGame.camera().scale };
  }, id);
  let p = await at(u.id); await page.mouse.click(p.x, p.y);
  await expect(page.locator("#selection-count")).toContainText("1");
  p = await at(target.id); await page.mouse.click(p.x, p.y, { button: "right" });
  const ordered = await page.evaluate(() => SignalGame.snapshot());
  expect(ordered.units.find((v) => v.id === u.id).target.id).toBe(target.id);
  expect(ordered.t).toBe(s.t);
  await page.locator("#tactical").click(); await page.clock.runFor(1000);
  const fighting = await page.evaluate(() => SignalGame.snapshot());
  expect(fighting.bullets.some((b) => b.owner === u.id && b.kind === "shell")).toBe(true);
  expect(E.restore(fighting)).not.toBeNull();
  await page.screenshot({ path: info.outputPath("long-range-artillery.png") });
  expect(errors).toEqual([]);
});

for (const [width, height] of [[1440, 900], [390, 844], [320, 568]])
  test(`new troop ranges are readable in the compact production deck ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const ready = E.restore(legacy);
    frames(ready, 1800);
    await boot(page, ready);
    await page.locator("#supply-open").click();
    await page.locator("#develop-tab-production").click();
    await page.locator('[data-production-group="barracks"]').click();
    await expect(page.locator("#develop-rifle")).toContainText("11 клеток");
    if (!(await page.locator("#develop-scout").count()))
      await page.locator('[data-deck-page="1"]').click();
    await expect(page.locator("#develop-scout")).toContainText("24,5");
    const layout = await page.locator("#development-panel").evaluate((p) => ({
      scroll: p.scrollHeight - p.clientHeight, overflow: document.documentElement.scrollWidth - innerWidth,
    }));
    expect(layout.scroll).toBeLessThanOrEqual(2); expect(layout.overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("unit-ranges.png") });
  });
