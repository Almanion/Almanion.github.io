"use strict";
const { test, expect, chromium, webkit } = require("@playwright/test"),
  { E, fund, findSite } = require("../tests/helpers/signal-frontier-construction.cjs");
function fixture(type = "cache") {
  const s = E.make("frontier-9");
  for (const u of s.units) if ((u.team && u.kind !== "citadel") || u.kind === "drone") u.hp = 0;
  s.campaign.camps.forEach((c) => c.reserve = 0);
  const p = type === "cache" ? s.caches[0] : type === "relay" ? s.relay : E.terminalSites(s)[0];
  Object.assign(E.hero(s), { x: p.x, y: p.y + 40 }); E.refreshRecon(s);
  expect(E.restore(s)).not.toBeNull(); return s;
}
async function boot(page, s) {
  await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-30T12:00:01Z"));
  await page.addInitScript((s) => localStorage.setItem("signal-frontier-v1", JSON.stringify({ save: s, settings: { volume: 0, reduced: true } })), s);
  await page.goto("/games/signal-frontier/"); await page.locator("#continue").click(); await page.clock.runFor(200);
}
const snapshot = (p) => p.evaluate(() => SignalGame.snapshot());
async function hitTarget(page) {
  const b = page.locator("#interact"), r = await b.boundingBox();
  expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.x + r.width).toBeLessThanOrEqual(page.viewportSize().width);
  expect(r.y + r.height).toBeLessThanOrEqual(page.viewportSize().height);
  expect(await b.evaluate((el) => { const q = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2)); })).toBe(true);
  return r;
}
for (const browserType of [chromium, webkit]) for (const [width, height] of [[1440,900],[800,600],[390,844],[320,568],[844,390]])
  test(`${browserType.name()} contextual E has a clear icon, reachable target and working hold at ${width}x${height}`, async ({}, info) => {
    const browser = await browserType.launch(), touch = width < 760 || height < 500,
      page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch, baseURL: info.project.use.baseURL }), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      const initial = fixture(); await boot(page, initial);
      const button = page.locator("#interact");
      await expect(button).toHaveAttribute("data-type", "cache");
      await expect(button.locator("kbd")).toBeVisible(); await expect(button).toHaveAccessibleName(/Забрать сплав/);
      expect((await page.locator("#interact-icon").getAttribute("d")).length).toBeGreaterThan(30);
      const r = await hitTarget(page);
      if (touch) { expect(r.width).toBeGreaterThanOrEqual(44); expect(r.height).toBeGreaterThanOrEqual(44); }
      else { const dash = await page.locator("#dash").boundingBox(); expect(r.x).toBeGreaterThanOrEqual(dash.x + dash.width); }
      await page.screenshot({ path: info.outputPath("interaction.png") });
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down(); await page.clock.runFor(450); await page.mouse.up();
      const partial = (await snapshot(page)).caches[0].charge; expect(partial).toBeGreaterThan(.2); expect(partial).toBeLessThan(1);
      await page.clock.runFor(180); expect((await snapshot(page)).caches[0].charge).toBeLessThan(partial);
      await page.keyboard.down("KeyE"); await page.clock.runFor(1300); await page.keyboard.up("KeyE");
      const after = await snapshot(page); expect(after.caches[0].taken).toBe(true);
      expect(after.economy.alloy - initial.economy.alloy).toBe(E.development.rules(after).cache);
      await expect(button).toBeHidden(); expect(after.shots).toBe(initial.shots); expect(errors).toEqual([]);
    } finally { await browser.close(); }
  });
test("relay uses the same contextual slot; pause freezes interaction and keyboard button activation does not shoot", async ({ page }) => {
  const initial = fixture("relay"); initial.relay.charge = .75;
  await boot(page, initial); await expect(page.locator("#interact")).toHaveAttribute("data-type", "relay");
  const charge = (await snapshot(page)).relay.charge;
  await page.locator("#tactical").click(); await expect(page.locator("#interact")).toBeHidden();
  await page.keyboard.down("KeyE"); await page.clock.runFor(500); await page.keyboard.up("KeyE");
  expect((await snapshot(page)).relay.charge).toBe(charge);
  await page.locator("#tactical").click(); await page.locator("#interact").focus();
  await page.keyboard.down("Space"); await page.clock.runFor(1100); await page.keyboard.up("Space");
  const s = await snapshot(page); expect(s.relay.charge).toBe(1); expect(s.phase).toBe(2); expect(s.shots).toBe(0);
  await expect(page.locator("#interact")).toBeHidden();
});
test("locked terminal explains its requirement and cannot channel", async ({ page }) => {
  await boot(page, fixture("terminal")); await expect(page.locator("#interact")).toHaveAttribute("data-type", "terminal");
  await expect(page.locator("#interact")).toBeDisabled(); await expect(page.locator("#interact")).toHaveAccessibleName(/модуль взлома/);
  await page.keyboard.down("KeyE"); await page.clock.runFor(500); await page.keyboard.up("KeyE");
  expect((await snapshot(page)).terminal.charge).toBe(0);
});
test("real touch holds interaction while another finger owns the movement stick", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }), page = await context.newPage();
  try {
    await boot(page, fixture()); const cdp = await context.newCDPSession(page), r = await hitTarget(page),
      move = { id: 1, x: 130, y: 350 }, action = { id: 2, x: r.x + r.width / 2, y: r.y + r.height / 2 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [move] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...move, x: move.x + 6 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...move, x: move.x + 6 }, action] });
    await page.clock.runFor(450); expect((await snapshot(page)).caches[0].charge).toBeGreaterThan(.2);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const charge = (await snapshot(page)).caches[0].charge; await page.clock.runFor(200);
    expect((await snapshot(page)).caches[0].charge).toBeLessThan(charge);
  } finally { await context.close(); }
});
test("placement explains the ore setback, keeps a valid route and larger ore renders without changing simulation", async ({ page }, info) => {
  const s = E.make("frontier-9"), mine = s.campaign.mines.find((m) => m.id === "west");
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((c) => c.reserve = 0); fund(s, 1000);
  Object.assign(E.hero(s), { x: mine.x, y: mine.y }); E.refreshRecon(s);
  const valid = findSite(s, "outpost", mine); expect(valid).toBeTruthy(); await boot(page, s);
  await page.locator("#dock-shop").click(); await page.locator("#develop-tab-build").click();
  const tile = page.locator('[data-construct="outpost"]'); await tile.click();
  const point = await page.evaluate((p) => SignalGame.screen(p.x, p.y), { x: mine.x + 160, y: mine.y - 40 });
  await page.mouse.move(point.x, point.y); await page.clock.runFor(150);
  await expect(page.locator("#placement-confirm")).toBeDisabled();
  await expect(page.locator("#placement-status")).toContainText(/проход|занята/);
  const p = await page.evaluate((p) => SignalGame.screen(p.x, p.y), valid);
  await page.mouse.move(p.x, p.y); await page.clock.runFor(150);
  await expect(page.locator("#placement-confirm")).toBeEnabled();
  await page.screenshot({ path: info.outputPath("resource-setback.png") });
  await page.locator("#placement-confirm").click();
  const after = await snapshot(page), b = after.units.find((u) => u.kind === "outpost");
  expect(b.construction.resourceSpacing).toBe(1); expect(b.hp).toBe(130);
  expect(E.construction.oreDistance(E.construction.rect(b), mine)).toBeGreaterThanOrEqual(128);
  expect(E.restore(after)).not.toBeNull();
});
