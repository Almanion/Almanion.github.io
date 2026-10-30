"use strict";
const { test, expect } = require("@playwright/test");

async function settle(page) {
  await page.clock.runFor(100);
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => SignalGame.cameraSettled())) return;
    await page.clock.runFor(100);
  }
  expect(await page.evaluate(() => SignalGame.cameraSettled())).toBe(true);
}
async function start(page) {
  if (test.info().project.name === "webkit")
    await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: new Date("2026-10-29T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-29T12:00:01Z"));
  await page.goto("/games/signal-frontier/");
  await expect(page.locator(".edition")).toContainText("0.20.0");
  await page.locator("#start").click();
  await page.locator("#select-army").click();
  await settle(page);
}
async function atUnit(page, id) {
  const p = await page.evaluate((id) => {
    const u = SignalGame.snapshot().units.find((u) => u.id === id),
      p = SignalGame.screen(u.x, u.y);
    return { x: p.x, y: p.y - 8 * SignalGame.camera().scale };
  }, id);
  expect(
    await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.id, p),
  ).toBe("field");
  return p;
}
async function commandUnit(page, id) {
  const p = await atUnit(page, id);
  await page.mouse.click(p.x, p.y, { button: "right" });
}
function escorts(s) {
  return s.units.filter(
    (u) => u.team === 0 && u.hp > 0 && [1, 2].includes(u.group),
  );
}

test("right-click on the scout hero assigns follow in pause and persists through reload", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  const initial = await page.evaluate(() => SignalGame.snapshot()),
    hero = initial.units.find((u) => u.kind === "hero");
  await commandUnit(page, hero.id);
  const ordered = await page.evaluate(() => SignalGame.snapshot());
  expect(escorts(ordered).every((u) => u.order?.followId === hero.id)).toBe(
    true,
  );
  expect(ordered.t).toBe(0);
  expect(ordered.economy).toEqual(initial.economy);
  await expect(page.locator("#tactical-hint")).toContainText(
    "Следуют за разведчиком",
  );
  await page.reload();
  await page.locator("#continue").click();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(ordered);
  await page.locator("#select-army").click();
  await settle(page);
  await expect(page.locator("#tactical-hint")).toContainText(
    "Следуют за разведчиком",
  );
  expect(errors).toEqual([]);
});

test("right-click on a selected soldier makes it the leader; ground replaces follow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  const initial = await page.evaluate(() => SignalGame.snapshot()),
    members = escorts(initial),
    leader = members[0];
  await commandUnit(page, leader.id);
  let state = await page.evaluate(() => SignalGame.snapshot());
  expect(state.units.find((u) => u.id === leader.id)).toEqual(leader);
  expect(
    escorts(state)
      .filter((u) => u.id !== leader.id)
      .every((u) => u.order?.followId === leader.id),
  ).toBe(true);
  await expect(page.locator("#tactical-hint")).toContainText(
    "Следуют за бойцом",
  );
  const point = await page.evaluate(() => SignalGame.screen(860, 2420));
  await page.mouse.click(point.x, point.y, { button: "right" });
  state = await page.evaluate(() => SignalGame.snapshot());
  expect(
    escorts(state).every((u) => u.order && u.order.followId === undefined),
  ).toBe(true);
  expect(state.t).toBe(0);
});

test("a short right-click follows during battle and right-drag still selects without changing orders", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  await page.keyboard.press("Tab");
  await settle(page);
  const initial = await page.evaluate(() => SignalGame.snapshot()),
    hero = initial.units.find((u) => u.kind === "hero");
  await commandUnit(page, hero.id);
  const ordered = await page.evaluate(() => SignalGame.snapshot());
  expect(escorts(ordered).every((u) => u.order?.followId === hero.id)).toBe(
    true,
  );
  expect(ordered.ammo).toBe(initial.ammo);
  const box = await page.evaluate(() => {
    const p = SignalGame.snapshot()
      .units.filter((u) => u.group === 1 && u.hp > 0)
      .map((u) => SignalGame.screen(u.x, u.y));
    return {
      left: Math.min(...p.map((p) => p.x)) - 24,
      top: Math.min(...p.map((p) => p.y)) - 30,
      right: Math.max(...p.map((p) => p.x)) + 24,
      bottom: Math.max(...p.map((p) => p.y)) + 24,
    };
  });
  await page.mouse.move(box.left, box.top);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(box.right, box.bottom, { steps: 6 });
  await page.mouse.up({ button: "right" });
  expect((await page.evaluate(() => SignalGame.selection())).custom).toBe(true);
  expect(
    escorts(await page.evaluate(() => SignalGame.snapshot())).map(
      (u) => u.order,
    ),
  ).toEqual(escorts(ordered).map((u) => u.order));
  await page.keyboard.down("KeyD");
  await page.clock.runFor(600);
  await page.keyboard.up("KeyD");
  const moved = await page.evaluate(() => SignalGame.snapshot());
  expect(moved.units.find((u) => u.kind === "hero").x).toBeGreaterThan(
    hero.x + 40,
  );
  expect(
    escorts(moved).some((u) => {
      const old = ordered.units.find((v) => v.id === u.id);
      return Math.hypot(u.x - old.x, u.y - old.y) > 5;
    }),
  ).toBe(true);
});

test("phone command mode follows a friendly hero by tapping without starting combat", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  try {
    await start(page);
    await page.locator("#order-move").tap();
    await settle(page);
    const state = await page.evaluate(() => SignalGame.snapshot()),
      hero = state.units.find((u) => u.kind === "hero"),
      p = await atUnit(page, hero.id);
    await page.touchscreen.tap(p.x, p.y);
    const ordered = await page.evaluate(() => SignalGame.snapshot());
    expect(escorts(ordered).every((u) => u.order?.followId === hero.id)).toBe(
      true,
    );
    expect(ordered.t).toBe(0);
    expect(ordered.ammo).toBe(state.ammo);
    await expect(page.locator("#tactical-hint")).toContainText(
      "Следуют за разведчиком",
    );
    expect((await page.evaluate(() => SignalGame.selection())).command).toBe(
      false,
    );
  } finally {
    await context.close();
  }
});
