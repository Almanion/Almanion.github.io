"use strict";
const { test, expect, chromium, webkit } = require("@playwright/test"),
  { E, fund, build } = require("../tests/helpers/signal-frontier-construction.cjs");
let cached;
function fixture() {
  if (!cached) {
    const s = E.make("frontier-9");
    s.units.filter((u) => u.team && u.kind !== "citadel").forEach((u) => u.hp = 0);
    s.campaign.camps.forEach((c) => c.reserve = 0); fund(s, 1500);
    build(s, "logistics"); build(s, "barracks"); E.refreshRecon(s);
    expect(E.restore(s)).not.toBeNull(); cached = E.snapshot(s);
  }
  return structuredClone(cached);
}
async function boot(page) {
  const s = fixture(), node = E.living(s, "logistics"), barracks = E.living(s, "barracks"), base = E.living(s, "base");
  await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-30T12:00:01Z"));
  await page.addInitScript(({ s, node, barracks, base }) => localStorage.setItem("signal-frontier-v1", JSON.stringify({ save: s,
    settings: { volume: 0, reduced: true, controlGroups: { 5: [base.id], 6: [node.id], 7: [barracks.id] } } })), { s, node, barracks, base });
  await page.goto("/games/signal-frontier/"); await page.locator("#continue").click(); await page.clock.runFor(200);
  return { node, barracks };
}

for (const browserType of [chromium, webkit]) for (const [width, height] of [[1440,900],[800,600],[390,844],[320,568],[844,390]])
  test(`${browserType.name()} supply counters and construction card fit ${width}x${height}`, async ({}, info) => {
    const browser = await browserType.launch(), mobile = width < 760 || height < 500,
      page = await browser.newPage({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile, baseURL: info.project.use.baseURL }), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await boot(page);
      await expect(page.locator("#field-capacity")).toHaveText("3 / 36");
      await expect(page.locator("#field-workers")).toHaveText("2 / 20");
      await page.keyboard.press("7");
      if (mobile && width < 760) await page.locator("#dock-production").click();
      await page.locator('[data-train="rifle"]').click();
      await expect(page.locator("#army-reserved")).toHaveText("+1 в очереди");
      const overflow = await page.locator(".field-economy").evaluate((el) => {
        const rects = [el, ...el.querySelectorAll("strong, em")].filter((n) => n.getClientRects().length).map((n) => n.getBoundingClientRect());
        return rects.some((r) => r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight);
      });
      expect(overflow).toBe(false);
      await page.keyboard.press("6"); await page.locator("#dock-selection").click();
      await expect(page.locator(".roster-section-heading")).toContainText("Снабжение");
      await expect(page.locator(".roster-task")).toContainText("+12 снабжения армии");
      await page.locator("#tactical").click();
      if (await page.locator("[data-deck-back]").count()) await page.locator("[data-deck-back]").click();
      await page.locator("#develop-tab-build").click();
      const node = page.locator("#develop-logistics");
      if (!(await node.isVisible())) await page.locator('[data-deck-page="1"]').click();
      await expect(node).toBeVisible(); await expect(node).toContainText("90");
      await expect(node.locator("svg")).toBeVisible();
      const r = await node.boundingBox(); expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: info.outputPath("supply-menu.png") });
      expect(errors).toEqual([]);
    } finally { await browser.close(); }
  });

test("supply model shows four orientations, construction stages, damage and a wreck", async ({ page }, info) => {
  await page.goto("/games/signal-frontier/");
  const result = await page.evaluate(() => {
    const E = SignalEngine, s = E.make("frontier-9"), view = new SignalView(document.createElement("canvas")),
      sheet = document.createElement("canvas"); sheet.width = 1000; sheet.height = 700;
    document.body.replaceChildren(sheet); sheet.style.cssText = "position:absolute;inset:0;width:1000px;height:700px;background:#15272b";
    const c = sheet.getContext("2d", { willReadFrequently: true }), hashes = [];
    view.mapId = "classic";
    const states = [{ build: 23, hp: 90 }, { build: 12, hp: 180 }, { build: 0, hp: 360 }, { build: 0, hp: 90 }, { build: 0, hp: 0 }];
    for (let turn = 0; turn < 4; turn++) for (let i = 0; i < states.length; i++) {
      const u = { id: 1000 + turn * 5 + i, team: 0, kind: "logistics", x: 0, y: 0, angle: turn * Math.PI / 2, path: [], jobs: [], flash: 0, hit: 0,
        construction: { turn, paid: 90, builderId: 34, cancelled: false }, ...states[i] };
      c.save(); c.translate(100 + i * 200, 135 + turn * 170); c.scale(1.3, 1.3 * .73);
      view.unitModel(c, u, s, { mode: "playing", reduced: false }, { phase: .4, move: 0, angle: u.angle, direction: turn * 2 }); c.restore();
      const pixels = c.getImageData(i * 200, turn * 170, 200, 170).data;
      let hash = 2166136261, count = 0;
      for (let j = 0; j < pixels.length; j++) hash = Math.imul(hash ^ pixels[j], 16777619);
      for (let j = 3; j < pixels.length; j += 4) if (pixels[j]) count++;
      hashes.push([hash >>> 0, count]);
    }
    return hashes;
  });
  expect(result.every(([, count]) => count > 200)).toBe(true);
  expect(new Set(result.map(([hash]) => hash)).size).toBeGreaterThanOrEqual(16);
  await page.screenshot({ path: info.outputPath("supply-models.png") });
});
