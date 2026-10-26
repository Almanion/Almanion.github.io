"use strict";
const { test, expect } = require("@playwright/test"),
  E = require("../game-source/signal-frontier/src/engine");
function scene(enemy = false, grazing = false) {
  const s = E.make(enemy ? "frontier-2" : "classic");
  const u = s.units.find((v) =>
      enemy ? v.kind === "sentinel" : v.group === 1,
    ),
    target = enemy ? E.hero(s) : E.living(s, "jammer");
  for (const v of s.units)
    if (
      v !== u &&
      v !== target &&
      !["hero", "base", "citadel"].includes(v.kind)
    )
      v.hp = 0;
  if (s.campaign) s.campaign.camps.forEach((c) => (c.reserve = 0));
  Object.assign(u, {
    x: 550,
    y: grazing ? 319 : 450,
    path: [],
    cool: 0,
    think: 0,
    target: null,
  });
  Object.assign(target, { x: 800, y: grazing ? 319 : 450 });
  if (enemy)
    Object.assign(u.ai, {
      home: { x: u.x, y: u.y },
      seen: { x: target.x, y: target.y, id: target.id },
      seenAt: 0,
    });
  expect(E.restore(s)).not.toBeNull();
  return { s, u, target };
}
async function boot(page, s) {
  await page.clock.install();
  await page.addInitScript(
    (s) =>
      localStorage.setItem(
        "signal-frontier-v1",
        JSON.stringify({ save: s, settings: { reduced: true, volume: 0 } }),
      ),
    s,
  );
  await page.goto("/games/signal-frontier/");
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.locator("#continue").click();
}
for (const grazing of [false, true])
  test(
    "real attack order goes around cover before firing " + grazing,
    async ({ page }) => {
      test.setTimeout(60000);
      const { s, u, target } = scene(false, grazing);
      await page.setViewportSize({ width: 1440, height: 900 });
      await boot(page, s);
      await page.locator("#tactical").click();
      await page.locator("#map-overview").click();
      await page.clock.runFor(500);
      const [a, b] = await page.evaluate(
        ([a, b]) => [SignalGame.screen(a.x, a.y), SignalGame.screen(b.x, b.y)],
        [u, target],
      );
      await page.mouse.click(a.x, a.y);
      await page.mouse.click(b.x, b.y, { button: "right" });
      expect(
        (await page.evaluate(() => SignalGame.snapshot())).units.find(
          (v) => v.id === u.id,
        ).target.id,
      ).toBe(target.id);
      await page.locator("#tactical").click();
      await page.clock.runFor(8000);
      const after = await page.evaluate(() => SignalGame.snapshot()),
        troop = after.units.find((v) => v.id === u.id),
        foe = after.units.find((v) => v.id === target.id);
      expect(E.dist(u, troop)).toBeGreaterThan(1);
      expect(foe.hp).toBeLessThan(target.hp);
      expect(E.fireClear(troop, foe)).toBe(true);
    },
  );
test("enemy seen before a wall break follows a firing route and damages the hero", async ({
  page,
}) => {
  test.setTimeout(60000);
  const { s, u, target } = scene(true);
  await boot(page, s);
  await page.clock.runFor(9000);
  const after = await page.evaluate(() => SignalGame.snapshot()),
    enemy = after.units.find((v) => v.id === u.id),
    hero = after.units.find((v) => v.id === target.id);
  expect(E.dist(u, enemy)).toBeGreaterThan(50);
  expect(hero.hp).toBeLessThan(target.hp);
  expect(E.fireClear(enemy, hero)).toBe(true);
});
