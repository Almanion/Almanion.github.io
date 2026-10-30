"use strict";
const { test, expect, chromium, webkit } = require("@playwright/test"),
  E = require("../game-source/signal-frontier/src/engine"),
  path = require("node:path");
const route = "/games/signal-frontier/";
function fixture(kind = "flamer") {
  const s = E.make("frontier-5"),
    u = s.units.find((u) => u.kind === kind),
    h = E.hero(s);
  for (const v of s.units)
    if (v !== u && v !== h && !["base", "citadel"].includes(v.kind)) {
      v.hp = 0;
      v.jobs = [];
    }
  s.campaign.camps.forEach((c) => (c.reserve = 0));
  Object.assign(u, {
    x: 900,
    y: 1850,
    cool: 0,
    wind: kind === "flamer" ? 0.6 : 0.8,
    path: [],
    target: { x: 1040, y: 1850, id: h.id },
  });
  Object.assign(h, { x: 1040, y: 1850 });
  Object.assign(u.ai, {
    home: { x: u.x, y: u.y },
    seen: { x: h.x, y: h.y, id: h.id },
    seenAt: 0,
  });
  Object.assign(u.combat, {
    mode: "aim",
    time: u.wind,
    total: u.wind,
    angle: 0,
    burst: 0,
    gap: 0,
  });
  expect(E.restore(s)).not.toBeNull();
  return s;
}
async function boot(page, s) {
  await page.clock.install();
  await page.addInitScript((s) => {
    if (sessionStorage.getItem("signal-attack-fixture")) return;
    sessionStorage.setItem("signal-attack-fixture", "1");
    localStorage.setItem(
      "signal-frontier-v1",
      JSON.stringify({ save: s, settings: { reduced: true, volume: 0 } }),
    );
  }, s);
  await page.goto(route);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.locator("#continue").click();
}
for (const type of [chromium, webkit])
  for (const [width, height] of [
    [320, 568],
    [844, 390],
    [1440, 900],
  ])
    test(
      type.name() +
        " new danger areas: pause, save and visible controls " +
        width,
      async () => {
        test.setTimeout(60000);
        const browser = await type.launch(),
          context = await browser.newContext({
            viewport: { width, height },
            isMobile: width < 900,
            hasTouch: width < 900,
          });
        const page = await context.newPage(),
          errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        try {
          const s = fixture();
          await boot(page, s);
          await page.clock.runFor(100);
          await page.locator("#tactical").click();
          await page.clock.runFor(500);
          const before = await page.evaluate(() => SignalGame.snapshot()),
            u = before.units.find((u) => u.kind === "flamer");
          expect(u.wind).toBeGreaterThan(0);
          expect(u.wind).toBeLessThan(0.6);
          const polygon = E.dangerArea(before, u);
          expect(polygon.kind).toBe("sector");
          const projection = await page.evaluate(
            (p) => SignalGame.screen(p.x, p.y),
            polygon.points[12],
          );
          expect(projection.x).toBeGreaterThan(0);
          expect(projection.x).toBeLessThan(width);
          expect(projection.y).toBeGreaterThan(0);
          expect(projection.y).toBeLessThan(height);
          await page.clock.runFor(2000);
          expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(
            before,
          );
          const screenshot = path.join(
            process.env.SIGNAL_QA_SHOTS || "test-results",
            "attacks-" + type.name() + "-" + width + ".png",
          );
          await page.screenshot({ path: screenshot });
          await page.locator("#menu-button").click();
          await page.reload();
          await page.locator("#continue").click();
          const loaded = await page.evaluate(() => SignalGame.snapshot());
          expect(loaded.units.find((v) => v.id === u.id).combat).toEqual(
            u.combat,
          );
          expect(E.restore(loaded)).not.toBeNull();
          await page.clock.runFor(1000);
          expect(
            (await page.evaluate(() => SignalGame.snapshot())).units.find(
              (v) => v.id === u.id,
            ).combat.mode,
          ).toBe("fire");
          expect(errors).toEqual([]);
        } finally {
          await context.close();
          await browser.close();
        }
      },
    );
for (const width of [320, 390])
  test(
    "trusted touch escapes the flame sector " + width,
    async ({ page, context }) => {
      test.setTimeout(60000);
      await page.setViewportSize({ width, height: 844 });
      await context.addInitScript(() => {});
      // Use a real mobile context and Chromium touch events, through the normal joystick handlers.
      const browser = await chromium.launch(),
        mobile = await browser.newContext({
          viewport: { width, height: 844 },
          isMobile: true,
          hasTouch: true,
        }),
        p = await mobile.newPage();
      try {
        await boot(p, fixture());
        const rect = await p.locator("#move-stick").boundingBox(),
          x = rect.x + rect.width / 2,
          y = 220,
          cdp = await mobile.newCDPSession(p);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y, id: 1 }],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: y + 48, id: 1 }],
        });
        await p.clock.runFor(1000);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        const s = await p.evaluate(() => SignalGame.snapshot()),
          h = E.hero(s);
        expect(h.y).toBeGreaterThan(1930);
        expect(h.hp).toBe(150);
        expect(s.units.find((u) => u.kind === "flamer").combat.mode).toBe(
          "fire",
        );
      } finally {
        await mobile.close();
        await browser.close();
      }
    },
  );
test("all enemy silhouettes and new projectiles render without modifying combat state", async ({
  page,
}) => {
  await page.goto(route);
  const result = await page.evaluate(() => {
    const E = SignalEngine,
      s = E.make("frontier-5"),
      v = new SignalView(document.createElement("canvas"));
    v.canvas.width = 1200;
    v.canvas.height = 600;
    const ui = { mode: "tactical", reduced: true, touch: false, group: 1 },
      before = JSON.stringify(s);
    for (const [i, kind] of [
      "rocket",
      "flamer",
      "bomber",
      "tank",
      "mortar",
    ].entries()) {
      const u = {
        ...s.units.find((u) => u.kind === kind),
        x: 120 + i * 220,
        y: 330,
        wind: 0.4,
        target: { x: 100 + i * 220, y: 420 },
        flash: 0.06,
      };
      u.combat = {
        ...u.combat,
        mode: "aim",
        time: 0.4,
        total: 0.8,
        angle: -0.4,
      };
      v.unit(v.c, u, s, ui);
    }
    const unchanged = before === JSON.stringify(s);
    return { unchanged, image: v.canvas.toDataURL() };
  });
  expect(result.unchanged).toBe(true);
  if (process.env.SIGNAL_QA_SHOTS)
    require("node:fs").writeFileSync(
      path.join(process.env.SIGNAL_QA_SHOTS, "enemy-models.png"),
      Buffer.from(result.image.split(",")[1], "base64"),
    );
});

test("a live missile renders, pauses and restores exactly at a 10 Hz render rate", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.requestAnimationFrame = (callback) =>
      setTimeout(() => callback(performance.now()), 100);
  });
  await boot(page, fixture("rocket"));
  await page.clock.runFor(1000);
  let s = await page.evaluate(() => SignalGame.snapshot());
  expect(s.bullets.some((b) => b.kind === "missile")).toBe(true);
  await page.locator("#tactical").click();
  s = await page.evaluate(() => SignalGame.snapshot());
  await page.clock.runFor(2000);
  expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(s);
  if (process.env.SIGNAL_QA_SHOTS)
    await page.screenshot({
      path: path.join(process.env.SIGNAL_QA_SHOTS, "missile-10hz.png"),
    });
  await page.locator("#menu-button").click();
  await page.reload();
  await page.locator("#continue").click();
  expect((await page.evaluate(() => SignalGame.snapshot())).bullets).toEqual(
    s.bullets,
  );
  await page.clock.runFor(1000);
  expect(
    (await page.evaluate(() => SignalGame.snapshot())).units.find(
      (u) => u.kind === "hero",
    ).hp,
  ).toBeLessThan(150);
});
