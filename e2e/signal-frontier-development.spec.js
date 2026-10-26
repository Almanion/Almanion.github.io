"use strict";
const { test, expect } = require("@playwright/test"),
  E = require("../game-source/signal-frontier/src/engine"),
  D = E.development;
test.describe.configure({ mode: "parallel" });
const route = "/games/signal-frontier/";
async function resume(page, state) {
  expect(E.restore(state)).not.toBeNull();
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem("signal-fixture")) {
      localStorage.setItem(
        "signal-frontier-v1",
        JSON.stringify({ settings: { volume: 0, reduced: true }, save: s }),
      );
      sessionStorage.setItem("signal-fixture", "1");
    }
  }, state);
  await page.goto(route);
  await page.locator("#continue").click();
  await page.keyboard.press("Tab");
}
function prepared() {
  const s = E.make("frontier-2");
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((c) => (c.reserve = 0));
  let left = 3000;
  for (const m of [...s.campaign.mines].reverse()) {
    const n = Math.min(left, m.remaining);
    m.remaining -= n;
    left -= n;
  }
  s.campaign.deposited += 3000;
  s.economy.alloy += 3000;
  function advance(seconds) {
    for (let i = 0; i < Math.ceil(seconds * 60); i++) E.step(s);
  }
  function buy(action, site) {
    expect(E.purchase(s, action, site).allowed).toBe(true);
    advance(D.items(s)[action].time + 0.1);
  }
  buy("barracks");
  Object.assign(E.hero(s), { x: 370, y: 1030 });
  buy("outpost", "west");
  buy("network");
  Object.assign(E.hero(s), { x: 1260, y: 360 });
  buy("outpost", "flank");
  const b = E.living(s, "base");
  buy("defense", b.id);
  b.hp = 300;
  Object.assign(E.hero(s), { x: 180, y: 1050 });
  return s;
}

test("two rapid drone orders are accepted and reserve both worker slots", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto(route);
  await page.locator("#start").click();
  await page.locator("#supply-open").click();
  await page.locator("#develop-tab-economy").click();
  const b = await page.evaluate(
      () => SignalEngine.living(SignalGame.snapshot(), "base").id,
    ),
    button = page.locator("#develop-drone-" + b);
  await button.click();
  await button.click();
  await expect(button).toBeDisabled();
  await expect(page.locator("#development-alloy")).toHaveText("80");
  const s = await page.evaluate(() => SignalGame.snapshot());
  expect(E.living(s, "base").jobs.map((j) => j.action)).toEqual([
    "drone",
    "drone",
  ]);
  expect(E.restore(s)).not.toBeNull();
});
for (const width of [320, 390, 1440])
  test(
    "development at " +
      width +
      "px: third tier, paid repair, pause and saved queues",
    async ({ page }) => {
      await page.setViewportSize({
        width,
        height: width === 320 ? 568 : width === 390 ? 844 : 900,
      });
      await page.clock.install();
      const fixture = prepared(),
        b = E.living(fixture, "base");
      await resume(page, fixture);
      await page.locator("#supply-open").click();
      await page.locator("#develop-tab-research").click();
      await expect(page.locator("#develop-command")).toBeEnabled();
      await expect(page.locator("#develop-hack")).toBeDisabled();
      await page.locator("#develop-command").click();
      await expect(page.locator("#development-alloy")).toHaveText(
        String(fixture.economy.alloy - 520),
      );
      await page.locator("#develop-tab-economy").click();
      await page.locator("#develop-repair-" + b.id).click();
      await expect(page.locator("#development-alloy")).toHaveText(
        String(fixture.economy.alloy - 570),
      );
      await page.clock.runFor(2000);
      let s = await page.evaluate(() => SignalGame.snapshot());
      expect(
        E.living(s, "base").jobs.map((j) => [j.action, j.remaining]),
      ).toEqual([
        ["command", 120],
        ["repair", 20],
      ]);
      expect(E.living(s, "base").defense).toBe(true);
      expect(E.living(s, "base").hp).toBe(300);
      expect(E.restore(s)).not.toBeNull();
      expect(
        await page
          .locator("#dialog")
          .evaluate((e) => e.scrollWidth - e.clientWidth),
      ).toBeLessThanOrEqual(1);
      expect(
        await page
          .locator("#development-panel")
          .evaluate((e) => e.scrollWidth - e.clientWidth),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: "test-results/signal5-development-" + width + ".png",
      });
      // Keep the saved UI transaction; the initial fixture must not overwrite it on reload.
      await page.reload();
      await page.locator("#continue").click();
      await page.keyboard.press("Tab");
      s = await page.evaluate(() => SignalGame.snapshot());
      expect(s.version).toBe(4);
      expect(E.living(s, "base").jobs.map((j) => j.action)).toEqual([
        "command",
        "repair",
      ]);
      expect(s.economy.spent).toBe(fixture.economy.spent + 570);
    },
  );
test("0.4 save retains old prices and two technology tiers in the new interface", async ({
  page,
}) => {
  await page.clock.install();
  const old = E.make("frontier-1");
  await resume(page, old);
  await page.locator("#supply-open").click();
  await page.locator("#develop-tab-economy").click();
  await page.locator("#develop-drone-" + E.living(old, "base").id).click();
  await expect(page.locator("#development-alloy")).toHaveText("145");
  await expect(page.locator('[data-action="defense"]')).toHaveCount(0);
  await page.locator("#develop-tab-research").click();
  await expect(page.locator("#develop-command")).toHaveCount(0);
  const s = await page.evaluate(() => SignalGame.snapshot());
  expect(s.version).toBe(3);
  expect(s.campaign.id).toBe("frontier-1");
  expect(E.living(s, "base").jobs[0].duration).toBe(12);
  expect(E.restore(s)).not.toBeNull();
});
test("new cache amount agrees in action, notification, wallet and save", async ({
  page,
}) => {
  await page.clock.install();
  const s = E.make("frontier-2");
  Object.assign(E.hero(s), { x: 400, y: 850 });
  await resume(page, s);
  await expect(page.locator("#interact-label")).toHaveText(
    "Забрать сплав · +100",
  );
  await page.keyboard.press("Tab");
  await page.keyboard.down("KeyE");
  await page.clock.runFor(1400);
  await page.keyboard.up("KeyE");
  await expect(page.locator("#notice")).toHaveText("Сплав +100");
  const result = await page.evaluate(() => SignalGame.snapshot());
  expect(result.economy.alloy).toBe(280);
  expect(result.caches[0].taken).toBe(true);
  expect(E.restore(result)).not.toBeNull();
});

test("tactical WASD pans the map without advancing the operation or issuing orders", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install();
  const s = E.make("frontier-2");
  Object.assign(E.hero(s), { x: 960, y: 640 });
  await resume(page, s);
  await page.mouse.move(720, 450);
  await page.clock.runFor(500);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  const initial = await page.evaluate(() => SignalGame.snapshot());
  async function hold(keys, ms = 220) {
    for (const k of keys) await page.keyboard.down(k);
    await page.clock.runFor(ms);
    for (const k of keys) await page.keyboard.up(k);
    await page.clock.runFor(400);
    return page.evaluate(() => SignalGame.camera());
  }
  let before = await page.evaluate(() => SignalGame.camera());
  for (const [key, axis, direction] of [
    ["KeyD", "x", 1],
    ["KeyA", "x", -1],
    ["KeyW", "y", -1],
    ["KeyS", "y", 1],
  ]) {
    const after = await hold([key]);
    expect((after[axis] - before[axis]) * direction).toBeGreaterThan(45);
    expect(
      Math.abs(
        after[axis === "x" ? "y" : "x"] - before[axis === "x" ? "y" : "x"],
      ),
    ).toBeLessThan(2);
    before = after;
  }
  const diagonal = await hold(["KeyD", "KeyW"]);
  expect(diagonal.x).toBeGreaterThan(before.x + 35);
  expect(diagonal.y).toBeLessThan(before.y - 35);
  // Key release must stop motion; opening the shop must also clear held movement.
  await page.clock.runFor(500);
  expect((await page.evaluate(() => SignalGame.camera())).x).toBeCloseTo(
    diagonal.x,
    0,
  );
  await page.keyboard.down("KeyD");
  await page.locator("#supply-open").click();
  const paused = await page.evaluate(() => SignalGame.camera());
  await page.keyboard.press("KeyW");
  await page.clock.runFor(500);
  expect((await page.evaluate(() => SignalGame.camera())).x).toBeCloseTo(
    paused.x,
    0,
  );
  await page.keyboard.up("KeyD");
  await page.locator("#development-back").click();
  await page.clock.runFor(500);
  expect((await page.evaluate(() => SignalGame.camera())).x).toBeCloseTo(
    paused.x,
    0,
  );
  expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(initial);
  // The same key resumes its original movement role outside tactical pause.
  await page.keyboard.press("Tab");
  await hold(["KeyD"], 300);
  expect(
    E.hero(await page.evaluate(() => SignalGame.snapshot())).x,
  ).toBeGreaterThan(E.hero(initial).x + 20);
});

test("shop keeps purpose, exact cost, duration and prerequisites visible at narrow width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.clock.install();
  await page.goto(route);
  await page.locator("#start").click();
  await page.locator("#supply-open").click();
  const barracks = page.locator("#develop-barracks"),
    foundry = page.locator("#develop-foundry").locator("..");
  await expect(barracks).toContainText("120");
  await expect(barracks).toContainText("сплав");
  await expect(barracks).toContainText("30 с");
  await expect(foundry).toContainText("Артиллерия и защита армии");
  await expect(foundry).toContainText("Исследуйте сеть управления");
  await barracks.click();
  await page.locator("#develop-tab-economy").click();
  const base = await page.evaluate(
    () => SignalEngine.living(SignalGame.snapshot(), "base").id,
  );
  await page.locator("#develop-drone-" + base).click();
  const drone = page.locator("#develop-drone-" + base);
  await expect(drone).toBeDisabled();
  await expect(
    page.locator("#" + (await drone.getAttribute("aria-describedby"))),
  ).toHaveText("Не хватает 40 сплава");
  await expect(page.locator(".production-queue")).toContainText("18 с");
  await page.getByRole("button", { name: /Отменить: Дрон/ }).click();
  await expect(page.locator("#development-alloy")).toHaveText("47");
  await expect(
    page.locator("#" + (await drone.getAttribute("aria-describedby"))),
  ).toHaveText("Не хватает 3 сплава");
  expect(
    await page
      .locator("#dialog")
      .evaluate((e) => e.scrollWidth - e.clientWidth),
  ).toBeLessThanOrEqual(1);
});
