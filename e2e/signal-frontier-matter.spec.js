"use strict";
const { test, expect, webkit } = require("@playwright/test"),
  { E, fund, build } = require("../tests/helpers/signal-frontier-construction.cjs"),
  { deckCard, revealPoint } = require("./helpers/signal-frontier-selection.cjs");
test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader"] } });
function fixture() {
  const s = E.make("frontier-9", { resources: 2 });
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((c) => c.reserve = 0); fund(s, 4000);
  s.campaign.tier = 3; s.phase = 3; s.relay.online = true; s.relay.stability = 1;
  const m = s.campaign.mines.find((p) => p.id === "M01");
  Object.assign(E.hero(s), { x: m.x + 200, y: m.y }); E.refreshRecon(s);
  const condenser = build(s, "condenser", m), foundry = build(s, "foundry", E.hero(s));
  m.remaining -= 80; s.campaign.matter.deposited += 80; s.economy.matter += 80;
  E.refreshRecon(s); expect(E.restore(s)).not.toBeNull();
  return { s, condenser, foundry };
}
async function boot(page, s, renderer, groups = {}) {
  await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2030-01-01T00:00:01Z"));
  await page.addInitScript(({ s, groups }) => {
    if (!sessionStorage.getItem("matter-fixture")) {
      localStorage.setItem("signal-frontier-v1", JSON.stringify({ save: s,
        settings: { volume: 0, reduced: true, controlGroups: groups } }));
      sessionStorage.setItem("matter-fixture", "1");
    }
  }, { s, groups });
  await page.goto("/games/signal-frontier/?renderer=" + renderer);
  await page.locator("#continue").click(); await page.clock.runFor(200);
  await page.waitForFunction((renderer) => SignalGame.renderer().active === renderer, renderer);
}
const snap = (page) => page.evaluate(() => SignalGame.snapshot());
async function fits(page) {
  const bad = await page.locator(".topbar, #command-dock").evaluateAll((els) => els.flatMap((el) => {
    const r = el.getBoundingClientRect();
    if (r.left < -1 || r.right > innerWidth + 1) return [el.id || el.className];
    return [...el.querySelectorAll("button, #matter-counter")].filter((b) => b.getClientRects().length && !b.closest("[hidden]"))
      .filter((b) => { const q = b.getBoundingClientRect(); return q.left < -1 || q.right > innerWidth + 1 || q.bottom > innerHeight + 1; })
      .map((b) => b.textContent);
  }));
  expect(bad).toEqual([]);
  const overlap = await page.locator(".field-economy").evaluate((el) => {
    const a = el.getBoundingClientRect(), b = document.getElementById("tactical").getBoundingClientRect();
    return Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 &&
      Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1;
  });
  expect(overlap).toBe(false);
}
for (const [width, height, mobile, renderer, engine] of [
  [1440, 900, false, "babylon"], [390, 844, true, "babylon"],
  [320, 568, true, "babylon"], [844, 390, true, "babylon"],
  [390, 844, true, "canvas", "webkit"],
]) test(`two prices, fixed purchase position and exact refunds ${width}x${height} ${engine || renderer}`, async ({ browser }, info) => {
  test.setTimeout(90000);
  const extra = engine ? await webkit.launch({ args: [] }) : null,
    context = await (extra || browser).newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile }),
    page = await context.newPage(), errors = [], { s, foundry, condenser } = fixture();
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await boot(page, s, renderer, { 6: [foundry.id], 7: [condenser.id] });
    await expect(page.locator("#matter-counter")).toBeVisible();
    await page.keyboard.press("6");
    const button = page.locator('[data-train="artillery"]:visible');
    await expect(button).toContainText("40"); const before = await snap(page), box = await button.boundingBox();
    for (let i = 0; i < 2; i++) { if (mobile) await button.tap(); else await button.click(); }
    expect(await button.boundingBox()).toEqual(box);
    const paid = await snap(page), jobs = paid.units.find((u) => u.id === foundry.id).jobs;
    expect(jobs).toHaveLength(2); expect(paid.economy.matter).toBe(before.economy.matter - 80);
    expect(paid.economy.alloy).toBe(before.economy.alloy - 600);
    await page.clock.runFor(100);
    const cancel = (id) => page.locator(`[data-cancel-job="${foundry.id}:${id}"]:visible, [data-production-cancel="${foundry.id}:${id}"]:visible`);
    await cancel(jobs[1].id).click(); await cancel(jobs[0].id).click();
    const returned = await snap(page);
    expect(returned.economy.matter).toBe(before.economy.matter - 10);
    expect(returned.economy.alloy).toBe(before.economy.alloy - 75);
    expect(E.restore(returned)).not.toBeNull(); await fits(page);
    await page.screenshot({ path: info.outputPath("matter-production.png") });
    await page.keyboard.press("7");
    await page.locator('[data-purchase="staff-condenser"]').click();
    expect(E.development.mineWorkers(await snap(page), s.campaign.mines.find((m) => m.id === "M01"))).toHaveLength(2);
    await page.reload(); await page.locator("#continue").click(); await page.clock.runFor(200);
    expect((await snap(page)).economy.matter).toBe(returned.economy.matter);
    // Stress the typography without granting resources or changing the operation.
    const beforeLayout = await snap(page);
    await page.evaluate(() => {
      for (const [id, text] of Object.entries({ "field-alloy": "7900", "field-matter": "2660",
        "field-army-used": "120", "field-army-limit": "120", "field-worker-used": "48", "field-worker-limit": "48" }))
        document.getElementById(id).textContent = text;
    });
    await fits(page); expect(await snap(page)).toEqual(beforeLayout);
    await page.screenshot({ path: info.outputPath("matter-large-counters.png") });
    expect(errors).toEqual([]);
  } finally { await context.close(); if (extra) await extra.close(); }
});

test("a real mobile placement commits a condenser only on its crater and persists the foundation", async ({ browser }) => {
  test.setTimeout(90000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }),
    page = await context.newPage();
  try {
  const { s } = fixture(), m = s.campaign.mines.find((m) => m.id === "M03");
  Object.assign(E.hero(s), { x: m.x + 200, y: m.y }); E.refreshRecon(s);
  await boot(page, s, "babylon"); await page.locator("#tactical").click();
  await page.locator("#dock-shop").click(); await page.locator("#develop-tab-economy").click();
  await (await deckCard(page, "develop-condenser")).click();
  const at = await revealPoint(page, m); await page.touchscreen.tap(at.x, at.y); await page.clock.runFor(100);
  await expect(page.locator("#placement-confirm")).toBeEnabled(); await page.locator("#placement-confirm").tap();
  const after = await snap(page), u = after.units.find((u) => u.kind === "condenser" && u.site === m.id);
  expect(u).toBeTruthy(); expect(u.build).toBe(40); expect(E.restore(after)).not.toBeNull();
  await page.reload(); await page.locator("#continue").click();
  await page.locator("#hud").waitFor({ state: "visible" });
  expect((await snap(page)).units.find((v) => v.id === u.id).construction).toEqual(u.construction);
  } finally { await context.close(); }
});
