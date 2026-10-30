"use strict";
const { test, expect, chromium, webkit } = require("@playwright/test"),
  E = require("../game-source/signal-frontier/src/engine");

async function boot(page) {
  const s = E.make("frontier-9"), h = E.hero(s);
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((c) => c.reserve = 0);
  Object.assign(h, { x: 800, y: 2440, hp: 75 }); s.ammo = 6;
  E.refreshRecon(s); expect(E.restore(s)).not.toBeNull();
  const group = s.units.filter((u) => u.kind === "rifle").map((u) => u.id);
  await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-30T12:00:01Z"));
  await page.addInitScript(({ s, group }) => localStorage.setItem("signal-frontier-v1", JSON.stringify({
    save: s, settings: { reduced: true, volume: 0, controlGroups: { 1: group } },
  })), { s, group });
  await page.goto("/games/signal-frontier/"); await page.locator("#continue").click();
  await page.clock.runFor(200);
}

async function inspect(page, point) {
  const p = await page.evaluate((p) => {
    const g = SignalGame.diagnostics().minimap.geometry,
      r = document.getElementById("minimap-canvas").getBoundingClientRect();
    return { x: r.x + g.x + p.x * g.scale, y: r.y + g.y + p.y * g.scale };
  }, point);
  await page.mouse.click(p.x, p.y); await page.clock.runFor(250);
  const projected = await page.evaluate((p) => SignalGame.screen(p.x, p.y), point),
    top = await page.locator(".topbar").boundingBox(),
    bottom = await page.locator("#control-groups").boundingBox();
  expect(projected.y).toBeGreaterThan(top.y + top.height);
  expect(projected.y).toBeLessThan(bottom.y - 12);
  expect(projected.x).toBeGreaterThan(14);
  expect(projected.x).toBeLessThan(page.viewportSize().width - 14);
}

for (const type of [chromium, webkit]) for (const [width, height] of [[1440, 900], [800, 600], [390, 844], [320, 568], [844, 390]])
  test(`${type.name()} compact meters and reachable map edges at ${width}x${height}`, async ({}, info) => {
    const browser = await type.launch(), mobile = width < 760 || height < 500,
      context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile,
        baseURL: test.info().project.use.baseURL }), page = await context.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await boot(page);
      const dock = await page.locator("#command-dock").boundingBox(),
        vitals = await page.locator("#combat-vitals").boundingBox(),
        health = await page.locator("#health-meter").boundingBox(),
        ammo = await page.locator("#ammo-meter").boundingBox(),
        groups = await page.locator("#control-groups").boundingBox();
      expect(dock.height).toBeLessThanOrEqual(width < 760 ? 216 : height < 500 ? 164 : width <= 1000 ? 216 : 184);
      expect(Math.abs(health.width - ammo.width)).toBeLessThan(1);
      expect(Math.abs(vitals.width - dock.width)).toBeLessThan(3);
      expect(vitals.y + vitals.height).toBeLessThanOrEqual(dock.y);
      expect(groups.y + groups.height).toBeLessThanOrEqual(vitals.y);
      await expect(page.locator("#combat-vitals")).toHaveText("");
      await expect(page.locator("#health-meter")).toHaveAttribute("aria-valuenow", "75");
      expect(await page.locator("#health-fill").evaluate((e) => e.style.transform)).toBe("scaleX(0.5)");
      await expect(page.locator("#ammo-meter")).toHaveAttribute("aria-valuenow", "6");
      expect(await page.locator("#ammo-fill").evaluate((e) => e.style.transform)).toBe("scaleX(0.5)");
      const resource = await page.locator(".resource-crystal").boundingBox();
      expect(resource.width).toBeLessThanOrEqual(25);
      await page.screenshot({ path: info.outputPath("hud-battle.png") });
      if (mobile) await page.locator("#reload").tap(); else await page.locator("#reload").click();
      await page.clock.runFor(350);
      await expect(page.locator("#ammo-meter")).toHaveAttribute("aria-valuetext", /перезарядка/);
      await page.clock.runFor(1500);
      await expect(page.locator("#ammo-meter")).toHaveAttribute("aria-valuenow", "12");
      await page.locator("#minimap-key").click();
      await page.locator("#minimap-key-close").click();
      const world = E.map(E.make("frontier-9"));
      for (const p of [{ x: 20, y: 20 }, { x: world.W - 20, y: world.H - 20 }]) await inspect(page, p);
      await page.screenshot({ path: info.outputPath("hud-edge.png") });
      await page.locator("#tactical").click(); await page.clock.runFor(200);
      await expect(page.locator("#combat-vitals")).toBeHidden();
      for (const p of [{ x: world.W - 20, y: 20 }, { x: 20, y: world.H - 20 }]) await inspect(page, p);
      await page.locator("#tactical").click(); await page.clock.runFor(200);
      await expect(page.locator("#combat-vitals")).toBeVisible();
      expect(errors).toEqual([]);
    } finally { await browser.close(); }
  });

test("tactical panning can cross the map boundary without losing the map or causing simulation changes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await boot(page);
  await page.locator("#tactical").click(); await page.clock.runFor(200);
  const s = await page.evaluate(() => SignalGame.snapshot()), world = E.map(s);
  await inspect(page, { x: world.W / 2, y: world.H - 20 });
  await page.mouse.move(720, 400); await page.mouse.down({ button: "middle" });
  await page.mouse.move(720, 150, { steps: 6 }); await page.mouse.up({ button: "middle" });
  await page.clock.runFor(300);
  const camera = await page.evaluate(() => SignalGame.camera());
  expect(camera.y).toBeGreaterThan(world.H);
  expect(camera.y).toBeLessThanOrEqual(world.H + 320);
  expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(s);
});
