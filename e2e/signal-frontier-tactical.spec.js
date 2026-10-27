"use strict";
const { test, expect, chromium, webkit } = require("@playwright/test");
const E = require("../game-source/signal-frontier/src/engine");
function scenario() {
  const s = E.make("frontier-6"),
    h = E.hero(s);
  Object.assign(h, { x: 400, y: 1600 });
  const troops = s.units.filter((u) => u.group === 1);
  troops.forEach((u, i) =>
    Object.assign(u, { x: 340 + i * 75, y: 1490 + i * 30 }),
  );
  return s;
}
async function boot(page, s = scenario(), reduced = true) {
  E.refreshRecon(s);
  expect(E.restore(s)).not.toBeNull();
  await page.clock.install();
  await page.addInitScript(
    ({ s, reduced }) =>
      localStorage.setItem(
        "signal-frontier-v1",
        JSON.stringify({ save: s, settings: { volume: 0, reduced } }),
      ),
    { s, reduced },
  );
  await page.goto("/games/signal-frontier/");
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.locator("#continue").click();
  await page.keyboard.press("Tab");
  await page.clock.runFor(100);
}
async function position(page, id) {
  return page.evaluate((id) => {
    const u = SignalGame.snapshot().units.find((u) => u.id === id);
    const p = SignalGame.screen(u.x, u.y);
    return { ...p, y: p.y - 8 * SignalGame.camera().scale };
  }, id);
}
async function frame(page, ids) {
  const points = await Promise.all(ids.map((id) => position(page, id)));
  const a = {
    x: Math.min(...points.map((p) => p.x)) - 22,
    y: Math.min(...points.map((p) => p.y)) - 25,
  };
  const b = {
    x: Math.max(...points.map((p) => p.x)) + 22,
    y: Math.max(...points.map((p) => p.y)) + 20,
  };
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  return { a, b };
}
const orders = (page) =>
  page.evaluate(() =>
    SignalGame.snapshot().units.map((u) => ({
      id: u.id,
      order: u.order,
      target: u.target,
      rally: u.rally,
    })),
  );
test("pause: left selects and Shift toggles; right orders only the selection and leaves rallies unchanged", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const s = scenario(),
    ids = s.units.filter((u) => u.group === 1).map((u) => u.id);
  await boot(page, s);
  const before = await orders(page),
    frozen = await page.evaluate(() => SignalGame.snapshot());
  await frame(page, ids.slice(0, 2));
  const camera = await page.evaluate(() => SignalGame.camera());
  await page.keyboard.down("KeyD");
  await page.clock.runFor(200);
  await page.keyboard.up("KeyD");
  expect(await page.evaluate(() => SignalGame.camera())).toEqual(camera);
  await expect(page.locator("#selection-box")).toBeVisible();
  await page.mouse.up();
  expect((await page.evaluate(() => SignalGame.selection())).ids).toEqual(
    ids.slice(0, 2),
  );
  expect(await orders(page)).toEqual(before);
  const third = await position(page, ids[2]);
  await page.keyboard.down("Shift");
  await page.mouse.click(third.x, third.y);
  await page.keyboard.up("Shift");
  expect((await page.evaluate(() => SignalGame.selection())).ids).toEqual(ids);
  const first = await position(page, ids[0]);
  await page.keyboard.down("Shift");
  await page.mouse.click(first.x, first.y);
  await page.keyboard.up("Shift");
  expect((await page.evaluate(() => SignalGame.selection())).ids).toEqual(
    ids.slice(1),
  );
  const target = await page.evaluate(() => SignalGame.screen(650, 1600));
  await page.mouse.click(target.x, target.y, { button: "right" });
  const after = await page.evaluate(() => SignalGame.snapshot());
  expect(after.units.find((u) => u.id === ids[0]).order).toEqual(
    frozen.units.find((u) => u.id === ids[0]).order,
  );
  expect(
    after.units.filter((u) => u.group === 1 && u.order).map((u) => u.id),
  ).toEqual(ids.slice(1));
  expect(after.economy).toEqual(frozen.economy);
  expect(after.t).toBe(frozen.t);
  expect(E.restore(after)).not.toBeNull();
  await page.screenshot({ path: "test-results/signal-tactical-desktop.png" });
});
test("pause: empty selection, Escape, right dragging, zoom and a release over UI never send orders", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await boot(page);
  const ids = (await page.evaluate(() => SignalGame.selection())).ids,
    before = await orders(page);
  await frame(page, [ids[0]]);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect((await page.evaluate(() => SignalGame.selection())).ids).toEqual(ids);
  await frame(page, [ids[1]]);
  await page.mouse.wheel(0, -200);
  await page.mouse.up();
  expect(await orders(page)).toEqual(before);
  await page.mouse.move(850, 400);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(950, 450);
  await page.mouse.up({ button: "right" });
  expect(await orders(page)).toEqual(before);
  const at = await position(page, ids[0]);
  await page.mouse.click(at.x, at.y);
  await page.locator("#order-move").click();
  await page.mouse.move(800, 400);
  await page.mouse.down();
  const ui = await page.locator("#order-cancel").boundingBox();
  await page.mouse.move(ui.x + ui.width / 2, ui.y + ui.height / 2);
  await page.mouse.up();
  expect(await orders(page)).toEqual(before);
  await page.keyboard.press("Escape");
  expect((await page.evaluate(() => SignalGame.selection())).command).toBe(
    false,
  );
  expect((await page.evaluate(() => SignalGame.selection())).ids).toEqual([
    ids[0],
  ]);
  await page.keyboard.press("Escape");
  expect((await page.evaluate(() => SignalGame.selection())).ids).toEqual([]);
  await page.mouse.click(850, 400, { button: "right" });
  expect(await orders(page)).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(page.locator("#dialog")).toBeVisible();
});
for (const browserType of [chromium, webkit])
  for (const size of [
    [320, 568],
    [390, 844],
    [844, 390],
  ])
    test(
      browserType.name() +
        " pause touch: explicit move, cancel and reachable controls at " +
        size.join("x"),
      async () => {
        test.setTimeout(60000);
        const browser = await browserType.launch(),
          context = await browser.newContext({
            viewport: { width: size[0], height: size[1] },
            hasTouch: true,
            isMobile: true,
          });
        const page = await context.newPage(),
          errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        try {
          const state = scenario(),
            visible = state.units.find((u) => u.kind === "sentinel");
          Object.assign(visible, { x: 650, y: 1700 });
          visible.ai.home = { x: visible.x, y: visible.y };
          await boot(page, state);
          expect(E.visible(state, 0, visible)).toBe(true);
          await page.locator("#map-overview").tap();
          await page.clock.runFor(100);
          const before = await orders(page),
            ids = (await page.evaluate(() => SignalGame.selection())).ids;
          // A group shortcut remains usable even when individual figures are tiny in overview.
          await page.locator("#group-one").tap();
          await page.locator("#order-move").tap();
          await expect(page.locator("#order-move")).toHaveAttribute(
            "aria-pressed",
            "true",
          );
          await page.locator("#order-cancel").tap();
          expect(await orders(page)).toEqual(before);
          await page.locator("#order-move").tap();
          const target = await page.evaluate(() =>
            SignalGame.screen(650, 1000),
          );
          await page.touchscreen.tap(target.x, target.y);
          const after = await page.evaluate(() => SignalGame.snapshot());
          expect(
            after.units.filter((u) => ids.includes(u.id)).every((u) => u.order),
          ).toBe(true);
          expect(
            after.units
              .filter((u) => ids.includes(u.id))
              .every((u) => u.target === null),
          ).toBe(true);
          expect(after.t).toBe(0);
          await expect(page.locator("#order-move")).toHaveAttribute(
            "aria-pressed",
            "false",
          );
          const enemyId = after.units.find(
            (u) => u.kind === "sentinel" && u.hp > 0,
          ).id;
          const enemyPoint = await position(page, enemyId);
          await page.locator("#order-move").tap();
          await page.touchscreen.tap(enemyPoint.x, enemyPoint.y);
          expect(
            await page.evaluate(
              (ids) =>
                SignalGame.snapshot()
                  .units.filter((u) => ids.includes(u.id))
                  .map((u) => u.target?.id),
              ids,
            ),
          ).toEqual(ids.map(() => enemyId));
          const hidden = after.units.find(
            (u) => u.team && u.hp > 0 && !E.visible(after, 0, u),
          );
          expect(hidden).toBeTruthy();
          await page.locator("#order-move").tap();
          const hiddenPoint = await position(page, hidden.id);
          await page.touchscreen.tap(hiddenPoint.x, hiddenPoint.y);
          const blind = await page.evaluate(() => SignalGame.snapshot());
          expect(
            blind.units
              .filter((u) => ids.includes(u.id))
              .every((u) => u.target === null && u.order),
          ).toBe(true);
          for (const id of [
            "order-move",
            "order-cancel",
            "group-one",
            "tactical",
          ]) {
            const g = await page.locator("#" + id).evaluate((e) => {
              const r = e.getBoundingClientRect();
              return {
                w: r.width,
                h: r.height,
                x: r.x,
                y: r.y,
                right: r.right,
                bottom: r.bottom,
                hit: document
                  .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
                  ?.closest("button")?.id,
              };
            });
            expect(g.w).toBeGreaterThanOrEqual(44);
            expect(g.h).toBeGreaterThanOrEqual(44);
            expect(g.x).toBeGreaterThanOrEqual(0);
            expect(g.y).toBeGreaterThanOrEqual(0);
            expect(g.right).toBeLessThanOrEqual(size[0]);
            expect(g.bottom).toBeLessThanOrEqual(size[1]);
            expect(g.hit).toBe(id);
          }
          await page.screenshot({
            path:
              "test-results/signal-tactical-" +
              browserType.name() +
              "-" +
              size.join("x") +
              ".png",
          });
          const overview = await page.evaluate(() => {
            const map = SignalEngine.map(SignalGame.snapshot());
            return {
              a: SignalGame.screen(0, 0),
              b: SignalGame.screen(map.W, map.H),
              panel: document
                .getElementById("tactical-panel")
                .getBoundingClientRect()
                .toJSON(),
              tools: document
                .getElementById("map-tools")
                .getBoundingClientRect()
                .toJSON(),
            };
          });
          expect(overview.a.y).toBeGreaterThanOrEqual(overview.tools.bottom);
          if (size[0] > size[1])
            expect(overview.b.x).toBeLessThan(overview.panel.left);
          else expect(overview.b.y).toBeLessThan(overview.panel.top);
          expect(errors).toEqual([]);
        } finally {
          await context.close();
          await browser.close();
        }
      },
    );
test("real touch: selection converts to a two-finger pan without a selection or order on release", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await boot(page);
    const session = await context.newCDPSession(page);
    const before = await orders(page),
      selection = await page.evaluate(() => SignalGame.selection().ids);
    const camera = await page.evaluate(() => SignalGame.camera());
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, x: 100, y: 300 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, x: 160, y: 340 }],
    });
    await expect(page.locator("#selection-box")).toBeVisible();
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { id: 1, x: 160, y: 340 },
        { id: 2, x: 250, y: 380 },
      ],
    });
    await expect(page.locator("#selection-box")).toBeHidden();
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { id: 1, x: 130, y: 310 },
        { id: 2, x: 220, y: 350 },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [{ id: 1, x: 130, y: 310 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.clock.runFor(120);
    expect((await page.evaluate(() => SignalGame.camera())).x).toBeGreaterThan(
      camera.x,
    );
    expect(await orders(page)).toEqual(before);
    expect(await page.evaluate(() => SignalGame.selection().ids)).toEqual(
      selection,
    );
    await page.locator("#order-move").tap();
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 3, x: 170, y: 300 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    expect(await orders(page)).toEqual(before);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.clock.runFor(50);
    expect((await page.evaluate(() => SignalGame.selection())).command).toBe(
      false,
    );
  } finally {
    await context.close();
  }
});

test("pause: right-click an enemy focuses selected troops and movement replaces that target", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const s = scenario(),
    foe = s.units.find((u) => u.kind === "sentinel"),
    troops = s.units.filter((u) => u.group === 1);
  Object.assign(foe, { x: 580, y: 1460 });
  await boot(page, s);
  const first = await position(page, troops[0].id);
  await page.mouse.click(first.x, first.y);
  const enemy = await position(page, foe.id);
  await page.mouse.click(enemy.x, enemy.y, { button: "right" });
  let after = await page.evaluate(() => SignalGame.snapshot());
  expect(after.units.find((u) => u.id === troops[0].id).target.id).toBe(foe.id);
  expect(after.units.find((u) => u.id === troops[1].id).target).toBeNull();
  const destination = await page.evaluate(() => SignalGame.screen(600, 1600));
  await page.mouse.click(destination.x, destination.y, { button: "right" });
  after = await page.evaluate(() => SignalGame.snapshot());
  expect(after.units.find((u) => u.id === troops[0].id).target).toBeNull();
  expect(after.t).toBe(s.t);
});

test("pause: a selected barracks receives its own rally; subsequent army orders leave it intact", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const s = scenario();
  expect(E.purchase(s, "barracks").allowed).toBe(true);
  for (let i = 0; i < 1820; i++) E.step(s);
  const b = E.living(s, "barracks");
  expect(b).toBeTruthy();
  await boot(page, s);
  const before = await orders(page),
    at = await position(page, b.id);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator("#dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  expect((await page.evaluate(() => SignalGame.selection())).building).toBe(
    b.id,
  );
  await expect(page.locator("#order-move")).toHaveText("Сбор");
  const point = await page.evaluate(() => SignalGame.screen(600, 1600));
  await page.mouse.click(point.x, point.y, { button: "right" });
  const rally = await page.evaluate(
    (id) => SignalGame.snapshot().units.find((u) => u.id === id).rally,
    b.id,
  );
  expect(Math.abs(rally.x - 600)).toBeLessThan(2);
  const after = await orders(page);
  expect(after.filter((u) => u.id !== b.id)).toEqual(
    before.filter((u) => u.id !== b.id),
  );
  await page.locator("#group-one").click();
  const move = await page.evaluate(() => SignalGame.screen(600, 1480));
  await page.mouse.click(move.x, move.y, { button: "right" });
  expect(
    await page.evaluate(
      (id) => SignalGame.snapshot().units.find((u) => u.id === id).rally,
      b.id,
    ),
  ).toEqual(rally);
});

test("touch: one tap selects one unit and one-finger frame selects a subset without moving them", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    const s = scenario(),
      ids = s.units.filter((u) => u.group === 1).map((u) => u.id);
    await boot(page, s);
    const before = await orders(page),
      at = await position(page, ids[0]);
    await page.touchscreen.tap(at.x, at.y);
    expect(await page.evaluate(() => SignalGame.selection().ids)).toEqual([
      ids[0],
    ]);
    const session = await context.newCDPSession(page),
      pts = await Promise.all(ids.slice(0, 2).map((id) => position(page, id)));
    const a = {
        x: Math.min(...pts.map((p) => p.x)) - 22,
        y: Math.min(...pts.map((p) => p.y)) - 25,
      },
      b = {
        x: Math.max(...pts.map((p) => p.x)) + 22,
        y: Math.max(...pts.map((p) => p.y)) + 20,
      };
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, ...a }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, ...b }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    expect(await page.evaluate(() => SignalGame.selection().ids)).toEqual(
      ids.slice(0, 2),
    );
    expect(await orders(page)).toEqual(before);
  } finally {
    await context.close();
  }
});

test("pause: smooth camera motion stops for the whole selection gesture", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const s = scenario(),
    ids = s.units.filter((u) => u.group === 1).map((u) => u.id);
  await boot(page, s, false);
  await page.clock.runFor(800);
  await page.keyboard.down("KeyD");
  await page.clock.runFor(200);
  await page.keyboard.up("KeyD");
  await frame(page, ids.slice(0, 2));
  const camera = await page.evaluate(() => SignalGame.camera());
  await page.clock.runFor(300);
  expect(await page.evaluate(() => SignalGame.camera())).toEqual(camera);
  await page.mouse.up();
  expect(await page.evaluate(() => SignalGame.selection().ids)).toEqual(
    ids.slice(0, 2),
  );
});
