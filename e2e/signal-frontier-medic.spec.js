"use strict";
const { test, expect, webkit } = require("@playwright/test"),
  { E, barracksField, graduate } = require("../tests/helpers/signal-frontier-medic.cjs"),
  { deckCard } = require("./helpers/signal-frontier-selection.cjs");
test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader"] } });
for (const [w, h, renderer, touch] of [
  [1440, 900, "babylon", false], [390, 844, "babylon", true],
  [844, 390, "babylon", true], [320, 568, "canvas", true],
]) test(`field medic in combat and production ${w}×${h} ${renderer}`, async ({ browser }, info) => {
  test.setTimeout(90000);
  const safari = renderer === "canvas" ? await webkit.launch() : null,
    context = await (safari || browser).newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch }),
    page = await context.newPage(), errors = [], s = barracksField(), medic = graduate(s),
    hero = E.hero(s), barracks = E.living(s, "barracks");
  Object.assign(medic, { x: hero.x + 65, y: hero.y, cool: 0 });
  expect(E.followUnits(s, [medic.id], hero.id)).toBe(true);
  hero.hp = 50; E.refreshRecon(s);
  expect(E.restore(s)).toBeTruthy();
  const press = (locator) => touch ? locator.tap() : locator.click(),
    group = (key) => touch ? page.locator('[data-control-group="' + key + '"]').tap() : page.keyboard.press(String(key)),
    snapshot = () => page.evaluate(() => SignalGame.snapshot());
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
    await page.clock.pauseAt(new Date("2030-01-01T00:00:01Z"));
    await page.addInitScript(({ save, groups }) => {
      if (sessionStorage.getItem("medic-seeded")) return;
      localStorage.setItem("signal-frontier-v1", JSON.stringify({ save, settings: { volume: 0, reduced: false, controlGroups: groups } }));
      sessionStorage.setItem("medic-seeded", "1");
    }, { save: s, groups: { 1: [medic.id], 2: [barracks.id] } });
    await page.goto("/games/signal-frontier/?renderer=" + renderer);
    await press(page.locator("#continue")); await page.clock.runFor(90);
    await page.waitForFunction((r) => SignalGame.renderer().active === r, renderer);
    await group(1);
    await expect(page.locator(".roster-detail-head strong")).toHaveText("Медик");
    await expect(page.locator(".roster-stats")).toContainText("Лечение");
    expect(E.hero(await snapshot()).hp).toBe(50 + E.support.fieldCare.amount);
    await page.screenshot({ path: info.outputPath("medic-field.png") });
    await group(2);
    const card = page.locator('[data-train="medic"]:visible');
    await expect(card).toHaveAccessibleName(/Медик.*65 сплава.*24 с.*Лечит/);
    const pos = await card.boundingBox();
    expect(pos.width).toBeGreaterThanOrEqual(44); expect(pos.height).toBeGreaterThanOrEqual(44);
    expect(pos.x + pos.width).toBeLessThanOrEqual(w); expect(pos.y + pos.height).toBeLessThanOrEqual(h);
    await press(card); await press(card);
    expect(await card.boundingBox()).toEqual(pos);
    const queued = (await snapshot()).units.find((u) => u.id === barracks.id).jobs;
    expect(queued.map((j) => j.action)).toEqual(["medic", "medic"]);
    await page.screenshot({ path: info.outputPath("medic-barracks.png") });
    await press(page.locator("#tactical"));
    const before = await snapshot(); await page.clock.runFor(800);
    expect(await snapshot()).toEqual(before);
    await press(page.locator("#dock-shop"));
    await press(page.locator("#develop-tab-production"));
    await press(page.locator('[data-production-group="barracks"]'));
    await press(await deckCard(page, "develop-medic"));
    const after = await snapshot();
    expect(after.t).toBe(before.t);
    expect(after.economy.alloy).toBe(before.economy.alloy - E.development.items(s).medic.cost);
    expect(after.units.find((u) => u.id === barracks.id).jobs).toHaveLength(3);
    await page.reload(); await press(page.locator("#continue"));
    expect((await snapshot()).units.find((u) => u.id === barracks.id).jobs.map((j) => j.action)).toEqual(["medic", "medic", "medic"]);
    expect(errors).toEqual([]);
  } finally { await context.close(); if (safari) await safari.close(); }
});
