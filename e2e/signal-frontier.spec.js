"use strict";
const { test, expect, chromium, webkit } = require("@playwright/test");
const E = require("../game-source/signal-frontier/src/engine");
const route = "/games/signal-frontier/";
async function start(page) {
  await page.goto(route);
  await page.locator("#start").click();
  await expect(page.locator("#tactical-panel")).toBeVisible();
}
async function fixture(page, state) {
  await page.addInitScript(
    ({ state }) =>
      localStorage.setItem(
        "signal-frontier-v1",
        JSON.stringify({ save: state, settings: { volume: 0, reduced: true } }),
      ),
    { state },
  );
  await page.goto(route);
  await page.locator("#continue").click();
}

test("desktop: tactical orders, movement, pause, resume and isolated save", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() =>
    localStorage.setItem("orbital-courier-save-v8", "untouched"),
  );
  await start(page);
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => SignalGame.snapshot());
  const p = await page.evaluate(() => SignalGame.screen(500, 650));
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(150);
  let s = await page.evaluate(() => SignalGame.snapshot());
  expect(s.t).toBe(0);
  expect(s.units.find((u) => u.group === 1).path.length).toBeGreaterThan(0);
  await page.keyboard.press("Tab");
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(300);
  await page.keyboard.up("KeyD");
  s = await page.evaluate(() => SignalGame.snapshot());
  expect(s.units[0].x).toBeGreaterThan(before.units[0].x + 20);
  await page.keyboard.press("Escape");
  const paused = await page.evaluate(() => SignalGame.snapshot().t);
  await page.waitForTimeout(160);
  expect(await page.evaluate(() => SignalGame.snapshot().t)).toBe(paused);
  await page.locator("#resume").click();
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => SignalGame.snapshot().t)).toBeGreaterThan(
    paused,
  );
  await page.locator("#menu-button").click();
  const snapshot = await page.evaluate(() => SignalGame.snapshot());
  await page.reload();
  await page.locator("#continue").click();
  const restored = await page.evaluate(() => SignalGame.snapshot());
  expect(restored.t).toBeGreaterThanOrEqual(snapshot.t);
  expect(restored.t - snapshot.t).toBeLessThan(0.5);
  expect(
    await page.evaluate(() => localStorage.getItem("orbital-courier-save-v8")),
  ).toBe("untouched");
  expect(errors).toEqual([]);
});
test("victory, defeat, restart and menu have working exits", async ({
  page,
}) => {
  const s = E.make();
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.phase = 3;
  s.relay.online = true;
  s.relay.charge = 1;
  s.relay.stability = 1;
  const h = E.hero(s);
  h.x = 1010;
  h.y = 485;
  const citadel = E.living(s, "citadel");
  citadel.hp = 1;
  await fixture(page, s);
  await page.waitForTimeout(600);
  const p = await page.evaluate(() => SignalGame.screen(1250, 485));
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await expect(page.locator("#result-content")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator("#result-title")).toHaveText("Узел удержан");
  await page.locator("#retry").click();
  await expect(page.locator("#tactical-panel")).toBeVisible();
  expect(await page.evaluate(() => SignalGame.snapshot().phase)).toBe(0);
  await page.locator("#menu-button").click();
  await page.locator("#to-home").click();
  await expect(page.locator("#home")).toBeVisible();
  await page.locator("#continue").click();
  await page.locator("#menu-button").click();
  await page.locator("#restart").click();
  expect(await page.evaluate(() => SignalGame.snapshot().t)).toBe(0);
});
test("defeat is shown after a real enemy hit, and restart resets inputs", async ({
  page,
}) => {
  const s = E.make(),
    h = E.hero(s);
  h.hp = 1;
  s.bullets.push({
    x: h.x + 25,
    y: h.y,
    vx: -390,
    vy: 0,
    life: 1,
    team: 1,
    owner: 9,
    damage: 10,
    kind: "bolt",
    tx: h.x,
    ty: h.y,
    age: 0,
  });
  await fixture(page, s);
  await expect(page.locator("#result-title")).toHaveText("Операция потеряна");
  await page.locator("#retry").click();
  expect(await page.evaluate(() => SignalGame.snapshot().units[0].hp)).toBe(
    150,
  );
  await page.locator("#tactical").click();
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => SignalGame.snapshot().shots)).toBe(0);
});
test("corrupt save and unavailable storage do not block the game", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("signal-frontier-v1", "{broken");
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "signal-frontier-v1")
        throw new DOMException("Full", "QuotaExceededError");
      return set.call(this, key, value);
    };
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  await page.locator("#tactical").click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => SignalGame.snapshot().t)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
for (const browserType of [chromium, webkit])
  for (const size of [
    [390, 844],
    [844, 390],
    [320, 568],
  ])
    test(`${browserType.name()} mobile layout ${size.join("x")}: pointer controls, release and rotation`, async () => {
      const browser = await browserType.launch();
      const context = await browser.newContext({
        viewport: { width: size[0], height: size[1] },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      try {
        await page.goto("http://127.0.0.1:4173" + route);
        await page.locator("#start").tap();
        await page.locator("#tactical").tap();
        await page.waitForTimeout(300);
        const geometry = await page.evaluate(() => {
          const ids = [
            "move-stick",
            "aim-stick",
            "dash",
            "reload",
            "tactical",
            "menu-button",
          ];
          return ids.map((id) => {
            const r = document.getElementById(id).getBoundingClientRect();
            return {
              id,
              x: r.x,
              y: r.y,
              w: r.width,
              h: r.height,
              hit: document
                .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
                ?.closest("button,.stick")?.id,
            };
          });
        });
        for (const r of geometry) {
          expect(r.w).toBeGreaterThanOrEqual(44);
          expect(r.h).toBeGreaterThanOrEqual(44);
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w).toBeLessThanOrEqual(size[0] + 1);
          expect(r.y + r.h).toBeLessThanOrEqual(size[1] + 1);
          expect(r.hit).toBe(r.id);
        }
        // Use an actual captured browser pointer; multi-touch is checked separately through Chromium's input protocol.
        const x0 = await page.evaluate(() => SignalGame.snapshot().units[0].x);
        const move = await page.locator("#move-stick").boundingBox();
        await page.mouse.move(
          move.x + move.width * 0.8,
          move.y + move.height / 2,
        );
        await page.mouse.down();
        await page.waitForTimeout(300);
        const x1 = await page.evaluate(() => SignalGame.snapshot().units[0].x);
        expect(x1).toBeGreaterThan(x0 + 20);
        await page.mouse.up();
        const stopped = await page.evaluate(
          () => SignalGame.snapshot().units[0].x,
        );
        await page.waitForTimeout(180);
        expect(
          await page.evaluate(() => SignalGame.snapshot().units[0].x),
        ).toBeCloseTo(stopped, 1);
        const aim = await page.locator("#aim-stick").boundingBox();
        await page.mouse.move(aim.x + aim.width * 0.8, aim.y + aim.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(500);
        expect(
          await page.evaluate(() => SignalGame.snapshot().shots),
        ).toBeGreaterThan(0);
        await page.mouse.up();
        await page.locator("#tactical").tap();
        const paused = await page.evaluate(() => SignalGame.snapshot().t);
        await page.waitForTimeout(100);
        expect(await page.evaluate(() => SignalGame.snapshot().t)).toBe(paused);
        await page.setViewportSize({ width: size[1], height: size[0] });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
        ).toBe(0);
        await page.screenshot({
          path: `test-results/signal-${browserType.name()}-${size.join("x")}.png`,
        });
        expect(errors).toEqual([]);
      } finally {
        await context.close();
        await browser.close();
      }
    });

test("two real emulated touch pointers move and fire together; cancellation releases both", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await page.goto("http://127.0.0.1:4173" + route);
    await page.locator("#start").tap();
    await page.locator("#tactical").tap();
    const session = await context.newCDPSession(page);
    const m = await page.locator("#move-stick").boundingBox(),
      a = await page.locator("#aim-stick").boundingBox();
    const x = await page.evaluate(() => SignalGame.snapshot().units[0].x);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { id: 1, x: m.x + m.width * 0.8, y: m.y + m.height / 2 },
        { id: 2, x: a.x + a.width * 0.8, y: a.y + a.height / 2 },
      ],
    });
    await page.waitForTimeout(650);
    let s = await page.evaluate(() => SignalGame.snapshot());
    expect(s.units[0].x).toBeGreaterThan(x + 40);
    expect(s.shots).toBeGreaterThan(0);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    const stopped = await page.evaluate(() => SignalGame.snapshot());
    await page.waitForTimeout(180);
    s = await page.evaluate(() => SignalGame.snapshot());
    expect(s.units[0].x).toBeCloseTo(stopped.units[0].x, 1);
    expect(s.shots).toBe(stopped.shots);
  } finally {
    await context.close();
  }
});

test("full operation through keyboard, aiming and tactical orders", async ({
  page,
}) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install();
  await start(page);
  await page.clock.runFor(800);
  async function order(group, x, y) {
    const mode = await page.evaluate(() => SignalGame.mode());
    if (mode !== "tactical") await page.keyboard.press("Tab");
    await page.clock.runFor(700);
    await page.locator(group === 1 ? "#group-one" : "#group-two").click();
    const p = await page.evaluate(([x, y]) => SignalGame.screen(x, y), [x, y]);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.press("Tab");
    await page.clock.runFor(700);
  }
  await order(1, 500, 650);
  let goal = -1,
    routePoints = [],
    pressed = new Set(),
    firing = false,
    final;
  const visited = new Set();
  for (let i = 0; i < 1200; i++) {
    const s = await page.evaluate(() => SignalGame.snapshot());
    final = s;
    if (s.status !== "playing") break;
    visited.add(s.phase);
    const h = E.hero(s),
      dest =
        s.phase === 0
          ? { x: 950, y: 210 }
          : s.phase <= 2
            ? { x: 830, y: 480 }
            : { x: 1010, y: 490 };
    if (goal !== s.phase) {
      goal = s.phase;
      routePoints = E.pathTo(h, dest);
      for (const key of pressed) await page.keyboard.up(key);
      pressed.clear();
      await page.mouse.up();
      firing = false;
      if (s.phase === 2) await order(1, 850, 600);
      if (s.phase === 3) {
        const alive = s.units.some((u) => u.group === 1 && u.hp > 0);
        if (alive) await order(1, 1080, 485);
        await order(2, 1040, 540);
      }
      console.log("Operation phase", s.phase, "time", Math.round(s.t));
    }
    while (routePoints.length && E.dist(h, routePoints[0]) < 22)
      routePoints.shift();
    const p = routePoints[0];
    const wanted = new Set();
    if (p) {
      if (p.x - h.x > 8) wanted.add("KeyD");
      if (p.x - h.x < -8) wanted.add("KeyA");
      if (p.y - h.y > 8) wanted.add("KeyS");
      if (p.y - h.y < -8) wanted.add("KeyW");
    }
    if (s.phase === 1 && E.dist(h, s.relay) < 75) wanted.add("KeyE");
    for (const key of pressed)
      if (!wanted.has(key)) await page.keyboard.up(key);
    for (const key of wanted)
      if (!pressed.has(key)) await page.keyboard.down(key);
    pressed = wanted;
    const target = s.units
      .filter(
        (u) =>
          u.team &&
          u.hp > 0 &&
          !(u.kind === "citadel" && !s.relay.online) &&
          E.dist(u, h) < 590 &&
          E.clear(u, h),
      )
      .sort((a, b) => E.dist(a, h) - E.dist(b, h))[0];
    let visible = false;
    if (target) {
      const point = await page.evaluate(
        (p) => SignalGame.screen(p.x, p.y),
        target,
      );
      visible =
        point.x > 20 && point.x < 1420 && point.y > 100 && point.y < 740;
      if (visible) await page.mouse.move(point.x, point.y);
    }
    if (visible && !firing) {
      await page.mouse.down();
      firing = true;
    } else if (!visible && firing) {
      await page.mouse.up();
      firing = false;
    }
    if (s.dash === 0 && s.bullets.some((b) => b.team && E.dist(b, h) < 100))
      await page.keyboard.press("Shift");
    await page.clock.fastForward(100);
  }
  await page.mouse.up();
  for (const key of pressed) await page.keyboard.up(key);
  expect(final.status).toBe("won");
  expect([...visited]).toEqual([0, 1, 2, 3]);
  expect(final.wave).toBe(2);
  await expect(page.locator("#result-content")).toBeVisible();
  await page.screenshot({ path: "test-results/signal-complete-operation.png" });
});

test("audio resumes after rapid pause transitions and volume is remembered", async ({
  page,
}) => {
  await start(page);
  await page.locator("#tactical").click();
  await expect
    .poll(() => page.evaluate(() => SignalGame.audioState()))
    .toBe("running");
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Escape");
    await page.locator("#resume").click();
  }
  await expect
    .poll(() => page.evaluate(() => SignalGame.audioState()))
    .toBe("running");
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => SignalGame.audioState()))
    .toBe("suspended");
  await page.locator('#pause-content [data-open="settings"]').click();
  await page.locator("#volume").focus();
  await page.keyboard.press("Home");
  await page.locator("#motion").check();
  await page.reload();
  await page.locator('#home [data-open="settings"]').click();
  await expect(page.locator("#volume")).toHaveValue("0");
  await expect(page.locator("#motion")).toBeChecked();
});
