"use strict";
const { test, expect, chromium, webkit } = require("@playwright/test"),
  { E, fund, build } = require("../tests/helpers/signal-frontier-construction.cjs");
let cached;
function fixture() {
  if (!cached) {
    const s = E.make("frontier-9");
    s.units.filter((u) => u.team && u.kind !== "citadel").forEach((u) => u.hp = 0);
    s.campaign.camps.forEach((c) => c.reserve = 0);
    fund(s, 2000);
    Object.assign(E.hero(s), { x: 1000, y: 2450 }); E.refreshRecon(s);
    build(s, "barracks", E.hero(s));
    if (!E.restore(s)) throw Error("Invalid dock fixture");
    cached = E.snapshot(s);
  }
  return structuredClone(cached);
}
async function boot(page) {
  const s = fixture(), base = E.living(s, "base"), barracks = E.living(s, "barracks"),
    army = s.units.filter((u) => u.group === 1 && u.hp > 0).map((u) => u.id);
  await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-30T12:00:01Z"));
  await page.addInitScript(({ s, groups }) => localStorage.setItem("signal-frontier-v1", JSON.stringify({ save: s,
    settings: { reduced: true, volume: 0, controlGroups: groups } })), { s, groups: { 1: army, 7: [barracks.id], 8: [base.id, barracks.id] } });
  await page.goto("/games/signal-frontier/"); await page.locator("#continue").click();
  await page.clock.runFor(200);
  return { s, base, barracks, army };
}
const snapshot = (p) => p.evaluate(() => SignalGame.snapshot());
const selected = (p) => p.evaluate(() => SignalGame.selection().ids);
for (const mobile of [false, true]) test(`dock orders target the battlefield without pausing or firing (${mobile ? "touch" : "mouse"})`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    hasTouch: mobile, isMobile: mobile }), page = await context.newPage();
  try {
    const { army, barracks } = await boot(page);
    await page.keyboard.press("1");
    const before = await snapshot(page);
    await page.locator("#order-move").click();
    const point = await page.evaluate(() => {
      const h = SignalEngine.hero(SignalGame.snapshot()), p = SignalGame.screen(h.x, h.y);
      return { x: p.x, y: p.y - 8 * SignalGame.camera().scale };
    });
    if (mobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
    expect(await page.evaluate(() => SignalGame.mode())).toBe("playing");
    const after = await snapshot(page);
    expect(after.shots).toBe(before.shots);
    for (const id of army) expect(after.units.find((u) => u.id === id).order.followId).toBe(after.heroId);
    await expect(page.locator("body")).not.toHaveClass(/issuing-order/);
    if (!mobile) {
      const p = await page.evaluate((u) => SignalGame.screen(u.x, u.y), barracks);
      await page.mouse.click(p.x, p.y - 8);
      expect(await selected(page)).toEqual([barracks.id]);
      expect(await page.evaluate(() => SignalGame.mode())).toBe("playing");
    }
  } finally { await context.close(); }
});
async function fits(page, selector) {
  const result = await page.locator(selector).evaluate((el) => {
    const r = (el.querySelector("#development-panel") || el).getBoundingClientRect();
    const clipped = [...el.querySelectorAll("button")].filter((b) => b.getClientRects().length).filter((b) => {
      const x = b.getBoundingClientRect();
      return x.top < r.top - 1 || x.bottom > r.bottom + 1 || x.left < r.left - 1 || x.right > r.right + 1;
    }).map((b) => b.textContent.trim());
    return { clipped, x: r.x, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight };
  });
  expect(result.clipped).toEqual([]); expect(result.x).toBeGreaterThanOrEqual(0);
  expect(result.right).toBeLessThanOrEqual(result.width); expect(result.top).toBeGreaterThanOrEqual(0);
  expect(result.bottom).toBeLessThanOrEqual(result.height);
}
test("pause opens the shop directly, combat shares its position and groups preserve selection", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { army } = await boot(page);
  await expect(page.locator("#selection-content")).toBeVisible();
  await page.keyboard.press("1"); expect(await selected(page)).toEqual(army);
  const before = await page.locator("#command-dock").boundingBox(), s = await snapshot(page);
  await page.locator("#tactical").click();
  await expect(page.locator("#develop-tab-build")).toBeVisible();
  await expect(page.locator("#dialog")).not.toBeVisible();
  await expect(page.locator("#group-one, #group-two, #tactical-panel")).toHaveCount(0);
  expect(await page.locator("#command-dock").boundingBox()).toEqual(before);
  await page.clock.runFor(3000); expect(await snapshot(page)).toEqual(s);
  await page.locator("#dock-selection").click();
  await expect(page.locator(".roster-unit")).toHaveCount(3);
  await page.locator("#dock-shop").click();
  await page.locator("#develop-tab-build").click();
  await expect(page.locator("#develop-barracks")).toBeVisible();
  await expect(page.locator("#develop-tab-build")).toHaveCount(0);
  await page.locator("[data-deck-back]").click();
  await expect(page.locator("#develop-tab-build")).toBeVisible();
  await page.locator("#tactical").click();
  expect(await selected(page)).toEqual(army);
  await page.clock.runFor(500); expect((await snapshot(page)).t).toBeGreaterThan(s.t);
});
test("building selection leaves combat running; queue progresses, retains focus and cancels immediately", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { barracks } = await boot(page);
  await page.keyboard.press("7");
  expect(await page.evaluate(() => SignalGame.mode())).toBe("playing");
  await expect(page.locator(".roster-detail-head strong")).toHaveText("Казармы");
  await page.locator("[data-inspect]").click();
  await page.locator('#development-panel [data-action="rifle"]').click({ clickCount: 2 });
  const queued = (await snapshot(page)).units.find((u) => u.id === barracks.id).jobs;
  expect(queued).toHaveLength(2);
  await page.locator("#tactical").click();
  const job = page.locator("[data-cancel-job]").first();
  await job.focus(); await page.clock.runFor(1000); await expect(job).toBeFocused();
  const running = await snapshot(page), jobs = running.units.find((u) => u.id === barracks.id).jobs;
  expect(jobs[0].remaining).toBeLessThan(queued[0].remaining);
  await job.click();
  const after = await snapshot(page);
  expect(after.units.find((u) => u.id === barracks.id).jobs).toHaveLength(1);
  expect(after.economy.alloy - running.economy.alloy).toBe(Math.floor(jobs[0].cost * .75));
  expect(await page.evaluate(() => SignalGame.mode())).toBe("playing");
  await page.keyboard.press("8");
  await expect(page.locator(".producer-pager small")).toHaveText("1/2");
  await page.locator('[data-producer-page="1"]').click();
  await expect(page.locator(".roster-detail-head strong")).toHaveText("Казармы");
});
test("portraits isolate, remove with Shift and filter the selected type with Ctrl", async ({ page }) => {
  const { army } = await boot(page); await page.keyboard.press("1");
  await page.locator(".roster-unit").first().click({ modifiers: ["Shift"] });
  expect(await selected(page)).toEqual(army.slice(1));
  await page.locator(".roster-unit").first().click({ modifiers: ["Control"] });
  expect(await selected(page)).toHaveLength(2);
  await page.locator(".roster-unit").last().click();
  expect(await selected(page)).toEqual(army.slice(-1));
  await expect(page.locator(".roster-detail-head strong")).toHaveText("Боец");
});
test("portrait renderer pages 100 members without losing any or rebuilding focused controls", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const s = SignalGame.snapshot(), original = s.units.find((u) => u.kind === "rifle");
    window.rosterFixture = Array.from({ length: 100 }, (_, i) => ({ ...original, id: 1000 + i, hp: i % 3 ? 115 : 29 }));
    const old = document.getElementById("selection-content"), el = old.cloneNode(false); old.replaceWith(el);
    window.rosterTest = new SignalSelectionPanel(el, { state: () => s, members: () => rosterFixture,
      select: (ids) => { window.rosterFixture = rosterFixture.filter((u) => ids.includes(u.id)); }, buy() {}, inspect() {} });
    rosterTest.render();
  });
  const visited = new Set();
  for (let n = 0; n < 100; n++) {
    await fits(page, "#selection-content");
    for (const id of await page.locator(".roster-unit").evaluateAll((els) => els.map((e) => +e.dataset.member))) visited.add(id);
    const next = page.locator('[data-roster-page="1"]');
    if (await next.isDisabled()) break;
    await next.click();
  }
  expect(visited.size).toBe(100);
  await page.locator(".roster-unit").first().focus();
  await page.evaluate(() => { rosterFixture.forEach((u) => u.hp--); rosterTest.render(); });
  await expect(page.locator(".roster-unit").first()).toBeFocused();
  await page.locator(".roster-unit").last().click();
  await expect(page.locator(".roster-detail-head strong")).toHaveText("Боец");
  expect(await page.evaluate(() => rosterFixture.length)).toBe(1);
});
for (const type of [chromium, webkit]) for (const [width, height] of [[1440, 900], [800, 600], [390, 844], [320, 568], [844, 390]])
  test(`${type.name()} shop, building queue and roster fit ${width}x${height}`, async ({}, info) => {
    const browser = await type.launch(), mobile = width < 760 || height < 500,
      context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile, baseURL: test.info().project.use.baseURL }),
      page = await context.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await boot(page);
      await page.locator("#tactical").click();
      await fits(page, "#development-content");
      await page.screenshot({ path: info.outputPath("shop.png") });
      for (const section of ["build", "research", "production", "economy"]) {
        await page.locator("#dock-shop").click();
        await page.locator("#develop-tab-" + section).click();
        await fits(page, "#development-content");
      }
      await page.keyboard.press("7");
      await page.locator("#dock-selection").click();
      await page.locator("[data-inspect]").click();
      await page.locator('#development-panel [data-action="rifle"]').click();
      await fits(page, "#development-content");
      await page.screenshot({ path: info.outputPath("production.png") });
      await page.locator("#tactical").click();
      await fits(page, "#selection-content");
      await page.screenshot({ path: info.outputPath("building-combat.png") });
      await page.keyboard.press("1");
      await fits(page, "#selection-content");
      await page.screenshot({ path: info.outputPath("roster.png") });
      expect(errors).toEqual([]);
    } finally { await browser.close(); }
  });
