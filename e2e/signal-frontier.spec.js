"use strict";
const { selectGroup } = require("./helpers/signal-frontier-selection.cjs");
const { test, expect, chromium, webkit } = require("@playwright/test");
const E = require("../game-source/signal-frontier/src/engine");
const { PNG } = require("pngjs");
const route = "/games/signal-frontier/";
async function start(page) {
  await page.goto(route);
  await page.locator("#start").click();
  await expect(page.locator("#command-dock")).toBeVisible();
  await selectGroup(page, 1);
}
async function fixture(page, state, once = false) {
  await page.addInitScript(
    ({ state, once }) => {
      if (once && sessionStorage.getItem("signal-fixture")) return;
      localStorage.setItem(
        "signal-frontier-v1",
        JSON.stringify({ save: state, settings: { volume: 0, reduced: true } }),
      );
      if (once) sessionStorage.setItem("signal-fixture", "1");
    },
    { state, once },
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
  await page.locator("#map-overview").click();
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => SignalGame.snapshot());
  const p = await page.evaluate(() => SignalGame.screen(500, 650));
  await page.mouse.click(p.x, p.y, {button:"right"});
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
  const s = E.make("classic");
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
  await expect(page.locator("#artillery-status")).toHaveText("Готова к заказу");
  const p = await page.evaluate(() => SignalGame.screen(1250, 485));
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await expect(page.locator("#result-content")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator("#result-title")).toHaveText("Цитадель подавлена");
  await page.locator("#retry").click();
  await expect(page.locator("#command-dock")).toBeVisible();
  expect(await page.evaluate(() => SignalGame.snapshot().phase)).toBe(0);
  await page.locator("#menu-button").click();
  await page.locator("#to-home").click();
  await expect(page.locator("#home")).toBeVisible();
  await page.locator("#continue").click();
  await page.locator("#menu-button").click();
  await page.locator("#restart").click();
  expect(await page.evaluate(() => SignalGame.snapshot().t)).toBe(0);
});
test("result label is painted before hover while fire opens the dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const s = E.make("classic");
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  E.hero(s).x = 1010;
  E.hero(s).y = 485;
  E.living(s, "citadel").hp = 1;
  E.purchase(s, "hack");
  s.terminal.window = 7;
  s.terminal.alarm = true;
  await fixture(page, s);
  await page.waitForTimeout(300);
  const p = await page.evaluate(() => SignalGame.screen(1250, 485));
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await expect(page.locator("#result-content")).toBeVisible();
  await page.mouse.up();
  // Check actual text paint, not only the DOM: native button paint could cover the label until hover.
  const frame = PNG.sync.read(await page.locator("#retry").screenshot());
  let ink = 0;
  for (let y = 12; y < frame.height - 12; y++)
    for (let x = 14; x < frame.width - 14; x++) {
      const i = (y * frame.width + x) * 4;
      if (
        frame.data[i] < 90 &&
        frame.data[i + 1] < 110 &&
        frame.data[i + 2] < 110
      )
        ink++;
    }
  expect(ink).toBeGreaterThan(100);
  await page.locator("#retry").click();
  await expect(page.locator("#command-dock")).toBeVisible();
});

test("defeat is shown after a real enemy hit, and restart resets inputs", async ({
  page,
}) => {
  const s = E.make("classic"),
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
        await fixture(page, E.make("frontier-7"));
        await page.locator("#tactical").tap();
        const pausedAt = await page.evaluate(() => SignalGame.snapshot().t);
        await page.locator("#map-overview").tap();
        const readTargets = () =>
          page.evaluate(() => {
            const state = SignalGame.snapshot();
            return [
              ...SignalEngine.pads(state),
              ...state.caches,
              state.terminal,
              state.relay,
            ].map((target) => {
              const p = SignalGame.screen(target.x, target.y);
              return {
                id: target.id || String(target.x),
                x: p.x,
                y: p.y,
                hit: document.elementFromPoint(p.x, p.y)?.id,
              };
            });
          });
        let previous = null;
        await expect
          .poll(
            async () => {
              const points = await readTargets();
              const visible = points.every(
                (p) =>
                  p.x > 0 &&
                  p.x < size[0] &&
                  p.y > 0 &&
                  p.y < size[1] &&
                  p.hit === "field",
              );
              const settled =
                previous &&
                points.every(
                  (p, i) =>
                    Math.hypot(p.x - previous[i].x, p.y - previous[i].y) < 0.5,
                );
              previous = points;
              return Boolean(visible && settled);
            },
            { intervals: [100, 200] },
          )
          .toBe(true);
        const mapTargets = await readTargets();
        for (const p of mapTargets) {
          expect(p.x, p.id).toBeGreaterThan(0);
          expect(p.y, p.id).toBeGreaterThan(0);
          expect(p.x, p.id).toBeLessThan(size[0]);
          expect(p.y, p.id).toBeLessThan(size[1]);
          expect(p.hit, p.id).toBe("field");
        }
        await page.screenshot({
          path: `test-results/signal-map-${browserType.name()}-${size.join("x")}.png`,
        });
        await page.locator("#dock-shop").tap();
        await expect(page.locator("#develop-foundry")).toBeDisabled();
        await page.locator("#develop-barracks").tap();
        await expect(page.locator("#field-alloy")).toHaveText("60");
        await page.locator("#develop-tab-research").tap();
        await expect(page.locator("#develop-hack")).toBeDisabled();
        await page.locator("#develop-tab-economy").tap();
        await expect(page.locator("#develop-outpost-flank")).toHaveCount(0);
        await page.locator("#develop-outpost-west").scrollIntoViewIfNeeded();
        await expect(page.locator("#develop-outpost-west")).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
        ).toBe(0);
        expect(await page.evaluate(() => SignalGame.snapshot().t)).toBe(pausedAt);
        await page.screenshot({
          path: `test-results/signal-supply-${browserType.name()}-${size.join("x")}.png`,
        });
        await page.locator("#dock-selection").tap();
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
          move.x + move.width / 2,
          move.y + move.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(
          move.x + move.width * 0.8,
          move.y + move.height / 2,
        );
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
        await page.mouse.move(aim.x + aim.width / 2, aim.y + aim.height / 2);
        await page.mouse.down();
        await page.mouse.move(aim.x + aim.width * 0.8, aim.y + aim.height / 2);
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
        { id: 1, x: m.x + m.width / 2, y: m.y + m.height / 2 },
        { id: 2, x: a.x + a.width / 2, y: a.y + a.height / 2 },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
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

const { Pilot } = require("../tests/helpers/signal-pilot.cjs");
for (const routeName of ["siege", "infiltration"])
  test(
    "full " +
      routeName +
      " operation through controls, construction and supply",
    async ({ page }) => {
      test.setTimeout(240000);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.clock.install();
      await fixture(page, E.make("classic"));
      await page.keyboard.press("Tab");
      // Runner latency must not move the scout while the next command is being prepared.
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
      await page.clock.runFor(700);
      await page.keyboard.press("Tab");
      const pilot = new Pilot(routeName, 22);
      let pressed = new Set(),
        firing = false,
        final;
      let previous = "";
      async function release() {
        for (const key of pressed) await page.keyboard.up(key);
        pressed.clear();
        if (firing) await page.mouse.up();
        firing = false;
      }
      async function issue(commands) {
        await release();
        if ((await page.evaluate(() => SignalGame.mode())) !== "tactical")
          await page.keyboard.press("Tab");
        await page.clock.runFor(600);
        for (const command of commands) {
          if (command.kind === "order") {
            await selectGroup(page, command.group);
            const p = await page.evaluate(
              ([x, y]) => SignalGame.screen(x, y),
              [command.x, command.y],
            );
            await page.mouse.click(p.x, p.y, {button:"right"});
          } else {
            await page.locator("#dock-shop").click();
            await page
              .locator(
                command.action === "outpost"
                  ? "#site-" + command.site
                  : "#buy-" + command.action,
              )
              .click();
            await page.locator("#supply-back").click();
          }
        }
        await page.keyboard.press("Tab");
      }
      for (let i = 0; i < 1500; i++) {
        const s = await page.evaluate(() => SignalGame.snapshot());
        final = s;
        if (s.status !== "playing") break;
        const d = pilot.decide(s);
        if (d.commands.length) {
          await issue(d.commands);
          continue;
        }
        const marker = E.objective(s).id;
        if (marker !== previous) {
          console.log(routeName, marker, Math.round(s.t), s.economy.alloy);
          previous = marker;
        }
        const wanted = new Set();
        if (d.input.x > 0.01) wanted.add("KeyD");
        if (d.input.x < -0.01) wanted.add("KeyA");
        if (d.input.y > 0.01) wanted.add("KeyS");
        if (d.input.y < -0.01) wanted.add("KeyW");
        if (d.input.interact) wanted.add("KeyE");
        for (const key of pressed)
          if (!wanted.has(key)) await page.keyboard.up(key);
        for (const key of wanted)
          if (!pressed.has(key)) await page.keyboard.down(key);
        pressed = wanted;
        let visible = false;
        if (d.input.aim) {
          const p = await page.evaluate(
            (p) => SignalGame.screen(p.x, p.y),
            d.input.aim,
          );
          visible = p.x > 20 && p.x < 1420 && p.y > 100 && p.y < 740;
          if (visible) await page.mouse.move(p.x, p.y);
        }
        if (visible && !firing) {
          await page.mouse.down();
          firing = true;
        } else if (!visible && firing) {
          await page.mouse.up();
          firing = false;
        }
        if (d.input.dash && s.dash === 0) await page.keyboard.press("Shift");
        await page.clock.fastForward(100);
      }
      await release();
      expect(
        final.status,
        JSON.stringify({
          phase: final.phase,
          hp: E.hero(final).hp,
          t: final.t,
          pos: [E.hero(final).x, E.hero(final).y],
          goal: pilot.goal,
        }),
      ).toBe("won");
      expect(final.approach).toBe(routeName);
      expect(final.economy.spent).toBe(routeName === "siege" ? 140 : 110);
      expect(final.relay.online).toBe(routeName === "siege");
      await expect(page.locator("#result-content")).toBeVisible();
      await page.screenshot({
        path: "test-results/signal2-" + routeName + "-complete.png",
      });
    },
  );

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

test("supply: double-tap, refund, paused construction and reload preserve the real balance", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-25T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-25T12:00:01Z"));
  const s = E.make("classic");
  const h = E.hero(s);
  h.x = 350;
  h.y = 650;
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  await fixture(page, s, true);
  await page.keyboard.press("Tab");
  await page.locator("#dock-shop").click();
  await expect(page.locator("#site-west")).toBeEnabled();
  await page.locator("#site-west").dblclick({ delay: 30 });
  await expect(page.locator("#supply-alloy")).toHaveText("70");
  let snap = await page.evaluate(() => SignalGame.snapshot());
  expect(
    snap.units.filter((u) => u.kind === "outpost" && u.hp > 0),
  ).toHaveLength(1);
  const before = snap.t;
  await page.clock.runFor(800);
  expect(await page.evaluate(() => SignalGame.snapshot().t)).toBe(before);
  expect(
    await page.evaluate(
      () => SignalGame.snapshot().units.find((u) => u.kind === "outpost").build,
    ),
  ).toBe(6);
  await page.locator("#site-west").dblclick({ delay: 30 });
  await expect(page.locator("#supply-alloy")).toHaveText("95");
  expect(
    await page.evaluate(() => SignalGame.snapshot().economy.recovered),
  ).toBe(25);
  await page.clock.runFor(800);
  await page.locator("#site-west").click();
  await expect(page.locator("#supply-alloy")).toHaveText("45");
  await expect(page.locator("#buy-hack")).toBeDisabled();
  await page.locator("#supply-back").click();
  await page.keyboard.press("Tab");
  await page.clock.runFor(2200);
  await page.keyboard.press("Tab");
  snap = await page.evaluate(() => SignalGame.snapshot());
  const post = snap.units.find((u) => u.kind === "outpost" && u.hp > 0);
  expect(post.build).toBeGreaterThan(3);
  expect(post.build).toBeLessThan(4.5);
  await page.reload();
  await page.locator("#continue").click();
  await page.keyboard.press("Tab");
  const restored = await page.evaluate(() => SignalGame.snapshot());
  expect(restored.economy).toEqual(snap.economy);
  expect(restored.units.find((u) => u.id === post.id).build).toBeCloseTo(
    post.build,
    0,
  );
  await page.keyboard.press("Tab");
  await page.clock.runFor(5000);
  await page.keyboard.press("Tab");
  await page.locator("#dock-shop").click();
  await expect(page.locator("#site-west-status")).toContainText("Работает");
  await expect(page.locator("#supply-alloy")).toHaveText("45");
  expect(
    await page.evaluate(
      () =>
        SignalGame.snapshot().units.find(
          (u) => u.kind === "outpost" && u.hp > 0,
        ).build,
    ),
  ).toBe(0);
});

test("version one save migrates in the browser without replacing the operation", async ({
  page,
}) => {
  const legacy = require("../tests/fixtures/signal-frontier-v1.json");
  await page.clock.install({ time: new Date("2026-10-25T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-25T12:00:01Z"));
  await fixture(page, legacy);
  await page.keyboard.press("Tab");
  const restored = await page.evaluate(() => SignalGame.snapshot());
  expect(restored.version).toBe(2);
  expect(restored.t - legacy.t).toBeLessThan(0.2);
  expect(restored.economy).toEqual({
    alloy: 120,
    spent: 0,
    recovered: 0,
    kit: false,
    legacySupport: true,
  });
  expect(restored.units.map((u) => [u.id, u.kind, u.hp, u.x, u.y])).toEqual(
    legacy.units.map((u) => [u.id, u.kind, u.hp, u.x, u.y]),
  );
  expect(restored.ammo).toBe(legacy.ammo);
  expect(restored.phase).toBe(legacy.phase);
  await page.locator("#dock-shop").click();
  await expect(page.locator("#supply-alloy")).toHaveText("120");
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("signal-frontier-v1")).save,
  );
  expect(saved.version).toBe(2);
  expect(saved.economy.legacySupport).toBe(true);
});
