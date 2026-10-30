"use strict";
const { test, expect, chromium, webkit } = require("@playwright/test"),
  { E, fund, build } = require("../tests/helpers/signal-frontier-construction.cjs");
let cached;
function fixture() {
  if (!cached) {
    const s = E.make("frontier-9");
    s.units.filter((u) => u.team && u.kind !== "citadel").forEach((u) => u.hp = 0);
    s.campaign.camps.forEach((c) => c.reserve = 0); fund(s, 1000);
    Object.assign(E.hero(s), { x: 800, y: 2440, hp: 65 }); E.refreshRecon(s);
    const outpost = build(s, "outpost", s.campaign.mines.find((m) => m.id === "west"));
    const army = s.units.filter((u) => u.kind === "rifle");
    army.forEach((u, i) => Object.assign(u, { x: 680 + i * 55, y: 2340, hp: 35, path: [], target: null, order: null }));
    const far = { ...structuredClone(army[0]), id: ++s.seq, x: 1960, y: 2260 };
    s.units.push(far);
    Object.assign(E.hero(s), { x: 800, y: 2440, hp: 65 });
    for (const d of s.units.filter((u) => u.kind === "drone")) E.commandSelection(s, [d.id], d);
    E.refreshRecon(s); if (!E.restore(s)) throw Error("Invalid support fixture");
    cached = E.snapshot(s);
  }
  return structuredClone(cached);
}
async function boot(page, transform) {
  const s = E.restore(fixture()); transform?.(s); E.refreshRecon(s);
  if (!E.restore(s)) throw Error("Invalid transformed fixture");
  const b = E.living(s, "outpost"), drones = s.units.filter((u) => u.kind === "drone"),
    army = s.units.filter((u) => u.kind === "rifle");
  await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-30T12:00:01Z"));
  await page.addInitScript(({ s, groups }) => localStorage.setItem("signal-frontier-v1", JSON.stringify({ save: s,
    settings: { reduced: true, volume: 0, controlGroups: groups } })), { s, groups: { 1: army.slice(0, 3).map((u) => u.id), 2: drones.map((u) => u.id), 7: [b.id] } });
  await page.goto("/games/signal-frontier/"); await page.locator("#continue").click(); await page.clock.runFor(200);
  return { s, b, army, drones };
}
const selected = (p) => p.evaluate(() => SignalGame.selection().ids);
const snapshot = (p) => p.evaluate(() => SignalGame.snapshot());
async function screen(page, u) {
  return page.evaluate((u) => { const p = SignalGame.screen(u.x, u.y); return { x: p.x, y: p.y - 8 * SignalGame.camera().scale }; }, u);
}
async function fit(page) {
  const clipped = await page.locator("#selection-content").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [...el.querySelectorAll("button")].filter((b) => b.getClientRects().length).filter((b) => {
      const q = b.getBoundingClientRect(); return q.left < r.left - 1 || q.right > r.right + 1 || q.top < r.top - 1 || q.bottom > r.bottom + 1;
    }).map((b) => b.textContent);
  }); expect(clipped).toEqual([]);
}
for (const tactical of [false, true]) test(`double click selects same type on screen without firing (${tactical ? "pause" : "battle"})`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); const { army } = await boot(page);
  if (tactical) { await page.locator("#tactical").click(); await page.clock.runFor(250); }
  const before = await snapshot(page), p = await screen(page, army[0]);
  await page.mouse.dblclick(p.x, p.y);
  expect((await selected(page)).sort()).toEqual(army.slice(0, 3).map((u) => u.id).sort());
  expect((await snapshot(page)).shots).toBe(before.shots);
  expect(await page.evaluate(() => SignalGame.mode())).toBe(tactical ? "tactical" : "playing");
});
test("clicking ore assigns selected probes to the extractor without shooting or pausing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); const { s, b, drones } = await boot(page);
  await page.keyboard.press("2"); const before = await snapshot(page), p = await screen(page, s.campaign.mines.find((m) => m.id === "west"));
  await page.mouse.click(p.x, p.y);
  const after = await snapshot(page);
  for (const d of drones) { const u = after.units.find((u) => u.id === d.id); expect(u.mineId).toBe("west"); expect(u.node).toBe(b.id); expect(u.workerTask).toBeUndefined(); }
  expect(after.shots).toBe(before.shots); expect(await page.evaluate(() => SignalGame.mode())).toBe("playing");
});
test("double click selects all visible buildings of one type and keeps combat running", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { s } = await boot(page, (s) => {
    for (const u of s.units.filter((u) => u.kind === "drone")) E.construction.resumeWorker(s, u);
    build(s, "barracks", E.hero(s)); build(s, "barracks", E.hero(s));
  });
  const buildings = s.units.filter((u) => u.kind === "barracks"), p = await screen(page, buildings[0]);
  await page.mouse.dblclick(p.x, p.y);
  expect((await selected(page)).sort()).toEqual(buildings.map((u) => u.id).sort());
  expect(await page.evaluate(() => SignalGame.mode())).toBe("playing");
});
test("right click admits troops; the extractor roster cancels reservations individually", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); const { b, army } = await boot(page);
  await page.keyboard.press("1"); const p = await screen(page, b); await page.mouse.click(p.x, p.y, { button: "right" });
  let s = await snapshot(page); for (const u of army.slice(0, 3)) expect(s.units.find((v) => v.id === u.id).care.facility).toBe(b.id);
  await page.keyboard.press("7"); await page.locator("[data-care-view]").click();
  await expect(page.locator('[data-care="exit"]')).toHaveCount(3); await fit(page);
  await page.locator('[data-care="exit"]').first().click();
  s = await snapshot(page); expect(s.units.filter((u) => u.care).length).toBe(2);
  await page.locator('[data-care="evacuate"]').click(); expect((await snapshot(page)).units.some((u) => u.care)).toBe(false);
});
test("pause shop offers hero healing and returns to the same building", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); const { b } = await boot(page);
  await page.keyboard.press("7"); await page.locator("[data-inspect]").click();
  await page.locator('[data-section="care"]').click(); await page.locator("#develop-heal-hero").click();
  const s = await snapshot(page); expect(E.hero(s).care.facility).toBe(b.id);
  await page.locator("#develop-exit-all").click(); expect(E.hero(await snapshot(page)).care).toBeUndefined();
  expect(await page.evaluate(() => SignalGame.mode())).toBe("tactical");
});
for (const browserType of [chromium, webkit]) for (const width of [320, 390]) test(`${browserType.name()} ${width}px: touch double tap and infirmary controls fit`, async () => {
  const browser = await browserType.launch(), context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true }), page = await context.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  try {
    const { army, b, drones, s } = await boot(page); const p = await screen(page, army[1]), before = await snapshot(page);
    await page.touchscreen.tap(p.x, p.y); await page.touchscreen.tap(p.x, p.y);
    const ids = await selected(page); expect(ids.length).toBeGreaterThan(1); expect(ids).not.toContain(army[3].id);
    expect((await snapshot(page)).shots).toBe(before.shots);
    await page.locator('[data-control-group="2"]').tap();
    const ore = await screen(page, s.campaign.mines.find((m) => m.id === "west"));
    await page.touchscreen.tap(ore.x, ore.y);
    for (const d of drones) expect((await snapshot(page)).units.find((u) => u.id === d.id).mineId).toBe("west");
    await page.locator('[data-control-group="1"]').tap(); await page.locator("#order-move").tap();
    const entrance = await screen(page, b); await page.touchscreen.tap(entrance.x, entrance.y);
    expect((await snapshot(page)).units.filter((u) => u.care).length).toBe(3);
    await page.locator('[data-control-group="7"]').tap(); await page.locator("[data-care-view]").tap(); await fit(page);
    await page.locator('[data-care="admit"]').tap(); expect(E.hero(await snapshot(page)).care).toBeTruthy();
    await fit(page); await page.screenshot({ path: test.info().outputPath("infirmary.png") });
    await page.locator('[data-care="evacuate"]').tap(); expect(E.hero(await snapshot(page)).care).toBeUndefined();
    expect(errors).toEqual([]);
  } finally { await context.close(); await browser.close(); }
});
