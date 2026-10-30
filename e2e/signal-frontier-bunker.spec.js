"use strict";
const { test, expect, chromium, webkit } = require("@playwright/test"),
  { E, field, enter } = require("../tests/helpers/signal-frontier-bunker.cjs");
async function boot(page, count = 0, builders = false) {
  const s = field(), b = E.living(s, "bunker"), army = s.units.filter((u) => u.kind === "rifle");
  if (builders) for (const d of s.units.filter((u) => u.kind === "drone")) E.construction.resumeWorker(s, d);
  const members = [...army, E.hero(s)];
  for (const u of members.slice(0, count)) enter(s, u);
  E.refreshRecon(s); expect(E.restore(s)).not.toBeNull();
  await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-30T12:00:01Z"));
  await page.addInitScript(({ s, groups }) => localStorage.setItem("signal-frontier-v1", JSON.stringify({
    save: s, settings: { volume: 0, reduced: true, controlGroups: groups },
  })), { s, groups: { 1: army.map((u) => u.id), 7: [b.id] } });
  await page.goto("/games/signal-frontier/"); await page.locator("#continue").click(); await page.clock.runFor(200);
  return { s, b, army };
}
const snapshot = (p) => p.evaluate(() => SignalGame.snapshot());
async function fit(page, selector) {
  expect(await page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [...el.querySelectorAll("button")].filter((b) => b.getClientRects().length && !b.closest("[hidden]")).filter((b) => {
      const q = b.getBoundingClientRect(); return q.left < r.left - 1 || q.right > r.right + 1 || q.top < r.top - 1 || q.bottom > r.bottom + 1;
    }).map((b) => { const q = b.getBoundingClientRect(); return { text: b.textContent, bounds: [q.left, q.top, q.right, q.bottom], panel: [r.left, r.top, r.right, r.bottom] }; });
  })).toEqual([]);
}
test("bunker is in the build menu, has its own SVG and supports four placement directions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await boot(page, 0, true);
  await page.locator("#tactical").click(); await page.locator("#develop-tab-build").click();
  const tile = page.locator('[data-construct="bunker"]');
  await expect(tile).toContainText("Бункер"); await expect(tile).toContainText("+25%");
  expect(await tile.locator("svg path").count()).toBeGreaterThan(0); await tile.click();
  for (let turn = 0; turn < 4; turn++) {
    await page.keyboard.press("KeyR"); await page.clock.runFor(100);
    await expect(page.locator("#placement-panel")).toBeVisible();
  }
  expect(await page.evaluate(() => SignalGame.mode())).toBe("tactical");
});
test("right click admits a group without pausing; bunker roster releases individuals and all", async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 900 }); const { b, army } = await boot(page);
  await page.keyboard.press("1");
  const p = await page.evaluate((b) => SignalGame.screen(b.x, b.y), b);
  await page.mouse.click(p.x, p.y - 8, { button: "right" });
  let s = await snapshot(page); expect(s.units.filter((u) => u.care?.garrison)).toHaveLength(3);
  expect(await page.evaluate(() => SignalGame.mode())).toBe("playing");
  await page.clock.runFor(4800); s = await snapshot(page);
  for (const u of army) expect(s.units.find((v) => v.id === u.id).care.inside).toBe(true);
  await page.keyboard.press("7"); await expect(page.locator('[data-care="exit"]')).toHaveCount(3);
  await page.locator('[data-care="exit"]').nth(1).click();
  expect((await snapshot(page)).units.filter((u) => u.care?.garrison)).toHaveLength(2);
  await page.locator('[data-care="evacuate"]').click();
  expect((await snapshot(page)).units.some((u) => u.care?.garrison)).toBe(false);
});
for (const type of [chromium, webkit]) for (const [width, height] of [[1440, 900], [390, 844], [320, 568], [844, 390]])
  test(`${type.name()} four garrison slots and pause controls fit ${width}x${height}`, async ({}, info) => {
    const browser = await type.launch(), mobile = width < 760 || height < 500,
      page = await browser.newPage({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile,
        baseURL: info.project.use.baseURL }), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      const { b } = await boot(page, 4);
      await page.locator('[data-control-group="7"]').click();
      await expect(page.locator('[data-care="exit"]')).toHaveCount(4);
      await expect(page.locator("#selection-content")).toContainText("Гарнизон 4/4");
      await fit(page, "#selection-content");
      await page.screenshot({ path: info.outputPath("garrison.png") });
      await page.locator("#tactical").click(); await page.clock.runFor(200);
      // Selected buildings are already the context of the pause shop.
      if (!await page.locator('[data-section="care"]').count()) {
        const p = await page.evaluate((b) => SignalGame.screen(b.x, b.y), b);
        await page.mouse.click(p.x, p.y - 8); await page.clock.runFor(150);
      }
      await page.locator('[data-section="care"]').click();
      await expect(page.locator("#develop-exit-all")).toBeVisible();
      await expect(page.locator('#development-panel [data-care="exit"]')).toHaveCount(4);
      await page.screenshot({ path: info.outputPath("garrison-pause.png") });
      await fit(page, "#development-panel");
      await page.locator("#develop-exit-all").click();
      expect((await snapshot(page)).units.some((u) => u.care)).toBe(false);
      expect(errors).toEqual([]);
    } finally { await browser.close(); }
  });
test("all occupancy and construction models render distinctly without changing simulation", async ({ page }, info) => {
  await page.setViewportSize({ width: 1600, height: 1000 }); const { s, b } = await boot(page, 4);
  const hashes = await page.evaluate(({ s, b }) => {
    const canvas = document.createElement("canvas"); canvas.id = "bunker-atlas";
    canvas.width = 1600; canvas.height = 900; canvas.style.cssText = "position:fixed;inset:0;z-index:99999;background:#152b29";
    document.body.append(canvas); const c = canvas.getContext("2d"), before = JSON.stringify(s), hashes = [];
    const cells = [0, 1, 2, 3, 4].map((count) => ({ count, progress: 1, label: "Гарнизон " + count + " / 4" }))
      .concat([.08, .3, .6, .88].map((progress) => ({ count: 0, progress, label: "Строительство " + Math.round(progress * 100) + "%" })),
        [{ count: 4, progress: 1, label: "Огонь гарнизона", fire: true }, { count: 0, progress: 1, label: "Открытые ворота", door: 1 }, { count: 0, progress: 1, label: "Разрушен", dead: true }]);
    for (let index = 0; index < cells.length; index++) {
      const cell = cells[index], x = index % 4 * 400, y = Math.floor(index / 4) * 300,
        copy = structuredClone(s), u = copy.units.find((u) => u.id === b.id);
      let kept = 0;
      copy.units = copy.units.filter((v) => !v.care?.garrison || ++kept <= cell.count);
      for (const v of copy.units.filter((v) => v.care?.garrison)) {
        v.angle = (v.care.slot - 1) * .75; v.flash = cell.fire ? .07 : 0;
      }
      u.build = (1 - cell.progress) * 36; if (cell.dead) u.hp = 0;
      c.fillStyle = "#1b3430"; c.fillRect(x + 4, y + 4, 392, 292);
      c.fillStyle = "#d4e7d9"; c.font = "18px Segoe UI"; c.textAlign = "center"; c.fillText(cell.label, x + 200, y + 34);
      c.save(); c.translate(x + 200, y + 190); c.scale(2, 1.3);
      SignalView.artwork.draw(c, u, copy, { reduced: false }, { phase: 0, move: 0, angle: 0 },
        SignalView.prototype.muzzle, { w: 120, h: 120, a: 0, progress: cell.progress }, cell.door || 0);
      c.restore();
      const bytes = c.getImageData(x + 30, y + 50, 340, 240).data;
      let hash = 2166136261; for (const v of bytes) hash = Math.imul(hash ^ v, 16777619);
      hashes.push(hash >>> 0);
    }
    if (JSON.stringify(s) !== before) throw Error("Artwork mutated simulation");
    return hashes;
  }, { s, b });
  expect(new Set(hashes).size).toBe(hashes.length);
  await page.locator("#bunker-atlas").screenshot({ path: info.outputPath("bunker-states.png") });
});
