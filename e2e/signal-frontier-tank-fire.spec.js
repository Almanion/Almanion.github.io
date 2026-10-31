"use strict";
const { test, expect } = require("@playwright/test"),
  { E, scene } = require("../tests/helpers/signal-frontier-tank-fire.cjs");
async function boot(page, state) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-30T12:00:01Z"));
  await page.addInitScript((s) => {
    if (sessionStorage.getItem("tank-fire-fixture")) return;
    sessionStorage.setItem("tank-fire-fixture", "yes");
    localStorage.setItem(
      "signal-frontier-v1",
      JSON.stringify({
        save: s,
        settings: { reduced: true, volume: 0 },
      }),
    );
  }, state);
  await page.goto("/games/signal-frontier/");
  await expect(page.locator(".edition")).toContainText("0.31.0");
  await page.locator("#continue").click();
}
for (const [profile, tankPoint, riflePoint] of [
  ["frontier-5", { x: 510, y: 1146 }, { x: 810, y: 1146 }],
  ["frontier-9", { x: 1770, y: 359 }, { x: 1200, y: 359 }],
])
  test(
    "live tank clears a grazing firing lane and its resumed save stays valid: " +
      profile,
    async ({ page }) => {
      test.setTimeout(120000);
      const { s, tank, rifle } = scene(profile, tankPoint, riflePoint),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await boot(page, s);
      await page.clock.runFor(8000);
      const current = await page.evaluate(() => SignalGame.snapshot()),
        moved = current.units.find((u) => u.id === tank.id),
        target = current.units.find((u) => u.id === rifle.id);
      expect(Math.hypot(moved.x - tank.x, moved.y - tank.y)).toBeGreaterThan(2);
      expect(target.hp).toBeLessThan(E.C.rifle.hp);
      expect(E.restore(current)).not.toBeNull();
      await page.keyboard.press("Tab");
      const frozen = await page.evaluate(() => SignalGame.snapshot());
      await page.clock.runFor(500);
      expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(frozen);
      await page.reload();
      await page.locator("#continue").click();
      const resumed = await page.evaluate(() => SignalGame.snapshot());
      expect(resumed.units.find((u) => u.id === tank.id)).toEqual(
        frozen.units.find((u) => u.id === tank.id),
      );
      expect(E.restore(resumed)).not.toBeNull();
      expect(errors).toEqual([]);
    },
  );
test("live infantry and tank both deal damage inside an obsolete highlands obstacle", async ({
  page,
}) => {
  const { s, tank, rifle } = scene(
      "frontier-9",
      { x: 1111.5, y: 2019 },
      { x: 1271.5, y: 2019 },
    ),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await boot(page, s);
  await page.clock.runFor(2500);
  const current = await page.evaluate(() => SignalGame.snapshot());
  expect(current.units.find((u) => u.id === tank.id).hp).toBeLessThan(
    E.C.tank.hp,
  );
  expect(current.units.find((u) => u.id === rifle.id).hp).toBeLessThan(
    E.C.rifle.hp,
  );
  expect(E.restore(current)).not.toBeNull();
  expect(errors).toEqual([]);
});
