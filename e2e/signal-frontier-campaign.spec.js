"use strict";
const { test, expect } = require("@playwright/test");
// Every scenario owns its browser context; long operations can use separate CI workers.
test.describe.configure({ mode: "parallel" });
const E = require("../game-source/signal-frontier/src/engine");
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
  test.setTimeout(60000); // This scenario renders over 22 seconds of virtual time.
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install();
  await start(page);
  await page.locator("#supply-open").click();
  await page.locator("#develop-tab-economy").click();
  const base = await page.evaluate(
    () => SignalEngine.living(SignalGame.snapshot(), "base").id,
  );
  await page.locator("#develop-drone-" + base).click();
  await expect(page.locator("#field-alloy")).toHaveText("130");
  await page.clock.runFor(3000);
  let s = await page.evaluate(() => SignalGame.snapshot());
  expect(s.t).toBe(0);
  expect(E.living(s, "base").jobs[0].remaining).toBe(18);
  await page.locator(".job-select").first().click();
  await page.getByRole("button", { name: /Отменить: Дрон/ }).click();
  await expect(page.locator("#field-alloy")).toHaveText("167");
  await page.clock.runFor(500);
  await page.locator("#develop-drone-" + base).click();
  await expect(page.locator("#field-alloy")).toHaveText("117");
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
  expect(errors).toEqual([]);
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
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(550, 400, { steps: 8 });
  await page.mouse.up({ button: "middle" });
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
  await page.locator("#group-one").click();
  await page.mouse.click(target.x, target.y, { button: "right" });
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

// Full snapshot traces grow to gigabytes. Preserve the actual failed state
// and screenshot instead; inputs and every simulation step remain unchanged.
test.use({ trace: "off" });
test.afterEach(async ({ page }, info) => {
  const deferred = await page
    .evaluate(() => window.__signalQaPaint === false)
    .catch(() => false);
  if (deferred) {
    await page.evaluate(() => {
      window.__signalQaPaint = true;
    });
    await page.clock.runFor(200).catch(() => {});
  }
  if (info.status === info.expectedStatus) return;
  const state = await page
    .evaluate(() =>
      window.SignalGame
        ? {
            state: SignalGame.snapshot(),
            selection: SignalGame.selection(),
            camera: SignalGame.camera(),
            mode: SignalGame.mode(),
          }
        : null,
    )
    .catch(() => null);
  await info.attach("operation-state.json", {
    body: JSON.stringify(state),
    contentType: "application/json",
  });
});
for (const [name, profile] of [
  "frontier-3",
  "frontier-4",
  "frontier-5",
  "frontier-6",
  "frontier-7",
].flatMap((p) => ["siege", "infiltration"].map((n) => [n, p])))
  test(
    "long " + name + ": full operation " + profile + " through real controls",
    async ({ page }) => {
      test.setTimeout(profile === "frontier-7" ? 2400000 : 1500000);
      await page.setViewportSize({ width: 1600, height: 1000 });
      if (profile === "frontier-7") {
        const epoch = new Date("2026-01-01T00:00:00Z");
        await page.clock.install({ time: epoch });
        await page.clock.pauseAt(epoch);
      } else await page.clock.install();
      if (profile === "frontier-7")
        await page.addInitScript(() => {
          // Run every view/camera update and every fixed combat step. Rasterizing the
          // huge battlefield is covered by the real-render UI suite, not every idle
          // frame of this control replay. Offscreen terrain textures remain real.
          window.__signalQaPaint = false;
          window.__signalQaSkippedPaint = 0;
          window.__signalQaRealPaint = 0;
          const proto = CanvasRenderingContext2D.prototype;
          for (const name of [
            "clearRect",
            "drawImage",
            "fill",
            "stroke",
            "fillRect",
            "strokeRect",
            "fillText",
            "strokeText",
            "clip",
          ]) {
            const original = proto[name];
            proto[name] = function (...args) {
              if (this.canvas.id === "field") {
                if (!window.__signalQaPaint) {
                  window.__signalQaSkippedPaint++;
                  return;
                }
                window.__signalQaRealPaint++;
              }
              return original.apply(this, args);
            };
          }
        });
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
      if (profile !== "frontier-7")
        expect(
          await page.evaluate(() => {
            const origin = SignalGame.screen(0, 0),
              unit = SignalGame.screen(1, 1),
              exact = SignalGame.screen(1377, 921);
            return Math.hypot(
              exact.x - origin.x - 1377 * (unit.x - origin.x),
              exact.y - origin.y - 921 * (unit.y - origin.y),
            );
          }),
        ).toBeLessThan(1e-6);
      const pilot = new ExpeditionPilot(name, 22);
      let pressed = new Set(),
        firing = false,
        aimPoint = null,
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
        aimPoint = null;
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
            const current = await page.evaluate(
              () => SignalGame.selection().ids,
            );
            if (
              c.ids &&
              JSON.stringify([...current].sort((a, b) => a - b)) !==
                JSON.stringify([...c.ids].sort((a, b) => a - b))
            ) {
              // Group selection includes co-located troops. Remove the smaller
              // rear guard instead of trying to click each overlapping front unit.
              const extra = current.filter((id) => !c.ids.includes(id)),
                subtract =
                  c.ids.every((id) => current.includes(id)) &&
                  extra.length < c.ids.length;
              if (!subtract) await page.locator("#order-cancel").click();
              const points = await page.evaluate(
                (ids) => {
                  const s = SignalGame.snapshot();
                  return ids
                    .map((id) => s.units.find((u) => u.id === id))
                    .filter(Boolean)
                    .map((u) => {
                      const p = SignalGame.screen(u.x, u.y);
                      p.y -= 8 * SignalGame.camera().scale;
                      return p;
                    });
                },
                subtract ? extra : c.ids,
              );
              for (let i = 0; i < points.length; i++) {
                if (subtract || i) await page.keyboard.down("Shift");
                await page.mouse.click(points[i].x, points[i].y);
                if (subtract || i) await page.keyboard.up("Shift");
              }
            }
            if (c.ids)
              expect(
                (await page.evaluate(() => SignalGame.selection().ids)).sort(
                  (a, b) => a - b,
                ),
              ).toEqual([...c.ids].sort((a, b) => a - b));
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
        previousTime = -1,
        progressKey = "",
        lastProgress = 0;
      for (let i = 0; i < 24000; i++) {
        // Read the snapshot and its affine screen projection in one round trip.
        // Inputs still go through trusted browser mouse and keyboard controls.
        const frame = await page.evaluate(() => ({
          state: SignalGame.snapshot(),
          origin: SignalGame.screen(0, 0),
          unit: SignalGame.screen(1, 1),
        }));
        const s = frame.state;
        final = s;
        idleCommands = s.t === previousTime ? idleCommands + 1 : 0;
        previousTime = s.t;
        expect(
          idleCommands,
          "Pilot must advance the simulation between decisions",
        ).toBeLessThan(120);
        if (
          s.status !== "playing" ||
          (profile === "frontier-4" && s.t > 1500) ||
          (profile === "frontier-7" && s.t > 3000)
        )
          break;
        if (profile === "frontier-7") {
          const h = E.hero(s),
            key = JSON.stringify([
              s.economy,
              s.campaign.tier,
              s.phase,
              s.relay,
              s.terminal,
              s.caches,
              Math.round(h.x / 50),
              Math.round(h.y / 50),
              s.units.map((u) => [u.id, u.hp, u.build, u.jobs]),
            ]);
          if (key !== progressKey) {
            progressKey = key;
            lastProgress = s.t;
          }
          expect(
            s.t - lastProgress,
            "Controller stopped making progress; preserve the state instead of waiting for a wall-clock timeout",
          ).toBeLessThan(120);
        }
        if (Math.floor(s.t / 60) !== lastLog) {
          lastLog = Math.floor(s.t / 60);
          console.log(
            name,
            Math.round(s.t),
            Math.round(E.hero(s).hp),
            s.economy.alloy,
            pilot.stage,
            ...(profile === "frontier-7"
              ? [
                  {
                    x: Math.round(E.hero(s).x),
                    y: Math.round(E.hero(s).y),
                    rush: pilot.rushStage,
                    cleared: pilot.rushCleared,
                    fort: s.units.find(
                      (u) => u.kind === "bastion" && u.sector === "north",
                    ).hp,
                  },
                ]
              : []),
          );
        }
        if (E.development.expedition(s) && !reloaded && s.t >= 800) {
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
        const wanted = new Set(),
          steering = pilot.keyboard(d.input);
        if (steering.x > 0) wanted.add("KeyD");
        if (steering.x < 0) wanted.add("KeyA");
        if (steering.y > 0) wanted.add("KeyS");
        if (steering.y < 0) wanted.add("KeyW");
        if (d.input.interact) wanted.add("KeyE");
        const keys = [];
        for (const k of pressed)
          if (!wanted.has(k)) keys.push(page.keyboard.up(k));
        for (const k of wanted)
          if (!pressed.has(k)) keys.push(page.keyboard.down(k));
        await Promise.all(keys);
        pressed = wanted;
        let visible = false;
        if (d.input.aim) {
          const p =
            profile === "frontier-7"
              ? await page.evaluate(
                  (p) => SignalGame.screen(p.x, p.y),
                  d.input.aim,
                )
              : {
                  x:
                    frame.origin.x +
                    d.input.aim.x * (frame.unit.x - frame.origin.x),
                  y:
                    frame.origin.y +
                    d.input.aim.y * (frame.unit.y - frame.origin.y),
                };
          visible = p.x > 20 && p.x < 1580 && p.y > 100 && p.y < 840;
          if (profile === "frontier-7" && !visible) {
            const edge = {
              x: Math.max(25, Math.min(1575, p.x)),
              y: Math.max(110, Math.min(830, p.y)),
            };
            await page.mouse.move(edge.x, edge.y);
            aimPoint = edge;
          }
          if (
            visible &&
            (!aimPoint ||
              Math.abs(p.x - aimPoint.x) > 1e-6 ||
              Math.abs(p.y - aimPoint.y) > 1e-6)
          ) {
            await page.mouse.move(p.x, p.y);
            aimPoint = p;
          }
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
        else if (profile === "frontier-7") await page.clock.runFor(200);
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
      if (final.status !== "won")
        await test.info().attach("unfinished-operation", {
          body: JSON.stringify({
            state: final,
            stage: pilot.stage,
            goal: pilot.goal,
            pilot,
          }),
          contentType: "application/json",
        });
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
      expect(reloaded).toBe(true);
      if (profile === "frontier-4") expect(final.t).toBeLessThanOrEqual(1500);
      const diagnostics = await page.evaluate(() => SignalGame.diagnostics());
      expect(diagnostics.units).toBeLessThanOrEqual(
        E.development.rules(final).unitLimit,
      );
      expect(diagnostics.effects).toBeLessThanOrEqual(96);
      expect(diagnostics.scars).toBeLessThanOrEqual(40);
      expect(JSON.stringify(final).length).toBeLessThan(2000000);
      if (profile === "frontier-7") {
        await page.evaluate(() => {
          window.__signalQaPaint = true;
        });
        await page.clock.runFor(200);
        const painting = await page.evaluate(() => ({
          skipped: window.__signalQaSkippedPaint,
          real: window.__signalQaRealPaint,
        }));
        expect(painting.skipped).toBeGreaterThan(0);
        expect(painting.real).toBeGreaterThan(0);
      }
      await expect(page.locator("#result-content")).toBeVisible();
      await page.screenshot({
        path: "test-results/signal6-" + profile + "-" + name + "-complete.png",
      });
    },
  );
