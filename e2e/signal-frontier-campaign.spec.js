"use strict";
const { test, expect } = require("@playwright/test");
// Every scenario owns its browser context; long operations can use separate CI workers.
test.describe.configure({ mode: "parallel" });
const E = require("../game-source/signal-frontier/src/engine");
const {
  LongOperationPilot,
} = require("../tests/helpers/signal-frontier-long-pilot.cjs");
const {
  ExpeditionPilot,
} = require("../tests/helpers/signal-frontier-expedition-pilot.cjs");
const route = "/games/signal-frontier/";
async function start(page) {
  await page.goto(route);
  await page.locator("#start").click();
}

test("development: real queued cost, cancellation, pause and reload", async ({
  page,
}) => {
  await page.clock.install();
  await start(page);
  await page.locator("#supply-open").click();
  await page.locator("#develop-tab-economy").click();
  const base = await page.evaluate(
    () => SignalEngine.living(SignalGame.snapshot(), "base").id,
  );
  await page.locator("#develop-drone-" + base).click();
  await expect(page.locator("#development-alloy")).toHaveText("130");
  await page.clock.runFor(3000);
  let s = await page.evaluate(() => SignalGame.snapshot());
  expect(s.t).toBe(0);
  expect(E.living(s, "base").jobs[0].remaining).toBe(18);
  await page.getByRole("button", { name: /Отменить: Дрон/ }).click();
  await expect(page.locator("#development-alloy")).toHaveText("167");
  await page.clock.runFor(500);
  await page.locator("#develop-drone-" + base).click();
  await expect(page.locator("#development-alloy")).toHaveText("117");
  await page.locator("#development-back").click();
  await page.locator("#tactical").click();
  await page.clock.runFor(5000);
  await page.locator("#menu-button").click();
  s = await page.evaluate(() => SignalGame.snapshot());
  const remaining = E.living(s, "base").jobs[0].remaining;
  expect(remaining).toBeGreaterThan(12);
  expect(remaining).toBeLessThan(14);
  await page.reload();
  await page.locator("#continue").click();
  await page.keyboard.press("Tab");
  let restored = await page.evaluate(() => SignalGame.snapshot());
  expect(E.living(restored, "base").jobs[0].remaining).toBeCloseTo(
    remaining,
    0,
  );
  expect(E.restore(restored)).not.toBeNull();
  await page.keyboard.press("Tab");
  await page.clock.runFor(14000);
  restored = await page.evaluate(() => SignalGame.snapshot());
  expect(restored.units.filter((u) => u.kind === "drone")).toHaveLength(3);
  expect(restored.economy.spent).toBe(100);
  expect(restored.economy.recovered).toBe(37);
});

test("tactical camera: hover edges, drag, zoom, limits and no accidental orders", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  await page.waitForTimeout(400);
  const orders = await page.evaluate(() =>
    SignalGame.snapshot().units.map((u) => u.order),
  );
  const before = await page.evaluate(() => SignalGame.camera());
  await page.mouse.move(1436, 400);
  await page.waitForTimeout(350);
  const after = await page.evaluate(() => SignalGame.camera());
  expect(after.x).toBeGreaterThan(before.x + 80);
  await page.mouse.move(800, 400);
  await page.mouse.down();
  await page.mouse.move(550, 400, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  expect((await page.evaluate(() => SignalGame.camera())).x).toBeGreaterThan(
    after.x + 100,
  );
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(250);
  expect(
    (await page.evaluate(() => SignalGame.camera())).scale,
  ).toBeGreaterThan(before.scale);
  await page.mouse.move(1437, 450);
  await page.waitForTimeout(1000);
  const edge = await page.evaluate(() => SignalGame.camera());
  expect(edge.x).toBeLessThan(2240);
  await page.mouse.move(800, 400);
  expect(
    await page.evaluate(() => SignalGame.snapshot().units.map((u) => u.order)),
  ).toEqual(orders);
  expect(await page.evaluate(() => SignalGame.snapshot().t)).toBe(0);
  await page.locator("#map-overview").click();
  await page.waitForTimeout(350);
  expect((await page.evaluate(() => SignalGame.camera())).overview).toBe(true);
  const target = await page.evaluate(() => SignalGame.screen(1760, 840));
  await page.mouse.click(target.x, target.y);
  expect(
    await page.evaluate(
      () => SignalGame.snapshot().units.find((u) => u.group === 1).order.x,
    ),
  ).toBeGreaterThan(1700);
  await page.locator("#map-center").click();
  await page.waitForTimeout(400);
  expect((await page.evaluate(() => SignalGame.camera())).overview).toBe(false);
});

test("touch camera: corner hold, pinch, cancellation and rotation preserve orders", async ({
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
    await page.waitForTimeout(250);
    const session = await context.newCDPSession(page),
      orders = await page.evaluate(() =>
        SignalGame.snapshot().units.map((u) => u.order),
      ),
      before = await page.evaluate(() => SignalGame.camera());
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, x: 386, y: 400 }],
    });
    await page.waitForTimeout(400);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    expect((await page.evaluate(() => SignalGame.camera())).x).toBeGreaterThan(
      before.x + 100,
    );
    const scale = (await page.evaluate(() => SignalGame.camera())).scale;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { id: 2, x: 140, y: 360 },
        { id: 3, x: 240, y: 420 },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { id: 2, x: 90, y: 320 },
        { id: 3, x: 290, y: 460 },
      ],
    });
    await page.waitForTimeout(180);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    expect(
      (await page.evaluate(() => SignalGame.camera())).scale,
    ).toBeGreaterThan(scale + 0.2);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(200);
    const stopped = await page.evaluate(() => SignalGame.camera());
    await page.waitForTimeout(250);
    expect((await page.evaluate(() => SignalGame.camera())).x).toBeCloseTo(
      stopped.x,
      0,
    );
    expect(
      await page.evaluate(() =>
        SignalGame.snapshot().units.map((u) => u.order),
      ),
    ).toEqual(orders);
    expect(await page.evaluate(() => SignalGame.snapshot().t)).toBe(0);
  } finally {
    await context.close();
  }
});

for (const [name, profile] of ["frontier-2", "frontier-3"].flatMap((p) =>
  ["siege", "infiltration"].map((n) => [n, p]),
))
  test(
    "long " + name + ": full operation " + profile + " through real controls",
    async ({ page }) => {
      test.setTimeout(1500000);
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.clock.install();
      await page.addInitScript((save) => {
        if (sessionStorage.getItem("signal-long-started")) return;
        sessionStorage.setItem("signal-long-started", "1");
        localStorage.setItem(
          "signal-frontier-v1",
          JSON.stringify({ settings: { volume: 0, reduced: true }, save }),
        );
      }, E.make(profile));
      // Exercise the same fixed-step operation under a constrained 10 Hz renderer.
      // Fewer idle renders keep the full campaign affordable in CI; no game state is patched.
      await page.addInitScript(() => {
        window.requestAnimationFrame = (callback) =>
          setTimeout(() => callback(performance.now()), 100);
        window.cancelAnimationFrame = clearTimeout;
      });
      await page.goto(route);
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
      await page.locator("#continue").click();
      await page.keyboard.press("Tab");
      // Only explicit clock steps advance combat; runner latency must not drive the pilot.
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
      await page.locator("#tactical").click();
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(await page.evaluate(() => SignalGame.snapshot().t)).toBe(0);
      const pilot = new (
        profile === "frontier-3" ? ExpeditionPilot : LongOperationPilot
      )(name, 22);
      let pressed = new Set(),
        firing = false,
        final,
        lastLog = -1,
        reloaded = false;
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      async function release() {
        for (const k of pressed) await page.keyboard.up(k);
        pressed.clear();
        if (firing) await page.mouse.up();
        firing = false;
      }
      async function issue(commands) {
        await release();
        if ((await page.evaluate(() => SignalGame.mode())) !== "tactical")
          await page.keyboard.press("Tab");
        if (
          (await page.locator("#map-overview").getAttribute("aria-pressed")) ===
          "false"
        )
          await page.locator("#map-overview").click();
        await page.clock.runFor(600);
        for (const c of commands) {
          if (c.kind === "order") {
            await page
              .locator(c.group === 1 ? "#group-one" : "#group-two")
              .click();
            const p = await page.evaluate(
              (p) => SignalGame.screen(p.x, p.y),
              c,
            );
            await page.mouse.click(p.x, p.y, { button: "right" });
          } else {
            await page.locator("#supply-open").click();
            const producer = c.site
              ? (await page.evaluate(() => SignalGame.snapshot())).units.find(
                  (u) => String(u.id) === String(c.site),
                )
              : null;
            const tab =
              ["drone", "outpost", "defense"].includes(c.action) ||
              (c.action === "repair" &&
                ["base", "outpost"].includes(producer?.kind))
                ? "economy"
                : ["network", "command", "hack", "weapons", "armor"].includes(
                      c.action,
                    )
                  ? "research"
                  : "production";
            await page.locator("#develop-tab-" + tab).click();
            const site =
              c.action === "drone"
                ? c.site ||
                  (await page.evaluate(
                    () => SignalEngine.living(SignalGame.snapshot(), "base").id,
                  ))
                : c.site;
            const button = page.locator(
              "#develop-" + c.action + (site ? "-" + site : ""),
            );
            await expect(button).toBeEnabled();
            await button.click();
            await page.locator("#development-back").click();
          }
        }
        await page.keyboard.press("Tab");
      }
      let idleCommands = 0,
        previousTime = -1;
      for (let i = 0; i < 24000; i++) {
        const s = await page.evaluate(() => SignalGame.snapshot());
        final = s;
        idleCommands = s.t === previousTime ? idleCommands + 1 : 0;
        previousTime = s.t;
        expect(
          idleCommands,
          "Pilot must advance the simulation between decisions",
        ).toBeLessThan(120);
        if (s.status !== "playing") break;
        if (Math.floor(s.t / 60) !== lastLog) {
          lastLog = Math.floor(s.t / 60);
          console.log(
            name,
            Math.round(s.t),
            Math.round(E.hero(s).hp),
            s.economy.alloy,
            pilot.stage,
          );
        }
        if (profile === "frontier-3" && !reloaded && s.t >= 800) {
          await release();
          await page.locator("#menu-button").click();
          const saved = await page.evaluate(() => SignalGame.snapshot());
          await page.reload();
          await page.locator("#continue").click();
          const restored = await page.evaluate(() => SignalGame.snapshot());
          expect(restored.t).toBe(saved.t);
          expect(restored.economy).toEqual(saved.economy);
          expect(restored.units).toEqual(saved.units);
          reloaded = true;
          pilot.path = [];
          continue;
        }
        const d = pilot.decide(s);
        if (d.commands.length) {
          await issue(d.commands);
          continue;
        }
        const wanted = new Set();
        if (d.input.x > 0.2) wanted.add("KeyD");
        if (d.input.x < -0.2) wanted.add("KeyA");
        if (d.input.y > 0.2) wanted.add("KeyS");
        if (d.input.y < -0.2) wanted.add("KeyW");
        if (d.input.interact) wanted.add("KeyE");
        for (const k of pressed) if (!wanted.has(k)) await page.keyboard.up(k);
        for (const k of wanted)
          if (!pressed.has(k)) await page.keyboard.down(k);
        pressed = wanted;
        let visible = false;
        if (d.input.aim) {
          const p = await page.evaluate(
            (p) => SignalGame.screen(p.x, p.y),
            d.input.aim,
          );
          visible = p.x > 20 && p.x < 1580 && p.y > 100 && p.y < 840;
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
        if (!wanted.size && !d.input.aim) await page.clock.runFor(600);
        else await page.clock.fastForward(100);
      }
      await release();
      console.log(
        name,
        "finished",
        JSON.stringify({
          status: final.status,
          time: final.t,
          stage: pilot.stage,
          hero: E.hero(final),
          phase: final.phase,
        }),
      );
      expect(
        final.status,
        JSON.stringify({
          t: final.t,
          h: E.hero(final),
          stage: pilot.stage,
          goal: pilot.goal,
        }),
      ).toBe("won");
      expect(final.approach).toBe(name);
      expect(E.restore(final)).not.toBeNull();
      expect(errors).toEqual([]);
      if (profile === "frontier-3") expect(reloaded).toBe(true);
      const diagnostics = await page.evaluate(() => SignalGame.diagnostics());
      expect(diagnostics.units).toBeLessThanOrEqual(
        E.development.rules(final).unitLimit,
      );
      expect(diagnostics.effects).toBeLessThanOrEqual(96);
      expect(diagnostics.scars).toBeLessThanOrEqual(40);
      expect(JSON.stringify(final).length).toBeLessThan(2000000);
      await expect(page.locator("#result-content")).toBeVisible();
      await page.screenshot({
        path: "test-results/signal6-" + profile + "-" + name + "-complete.png",
      });
    },
  );
