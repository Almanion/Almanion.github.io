"use strict";
const { selectGroup } = require("./helpers/signal-frontier-selection.cjs");
const { test, expect, chromium, webkit } = require("@playwright/test"),
  E = require("../game-source/signal-frontier/src/engine"),
  path = require("node:path");
const route = "/games/signal-frontier/";
function shop() {
  const s = E.make("frontier-6");
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((c) => (c.reserve = 0));
  E.refreshRecon(s);
  let n = 1000;
  for (const m of s.campaign.mines) {
    const a = Math.min(n, m.remaining);
    m.remaining -= a;
    s.campaign.deposited += a;
    s.economy.alloy += a;
    n -= a;
  }
  expect(E.purchase(s, "barracks").allowed).toBe(true);
  for (let i = 0; i < 1810; i++) E.step(s);
  expect(E.restore(s)).not.toBeNull();
  return s;
}
async function boot(page, s) {
  await page.clock.install();
  await page.addInitScript((s) => {
    if (sessionStorage.getItem("recon-fixture")) return;
    sessionStorage.setItem("recon-fixture", "1");
    localStorage.setItem(
      "signal-frontier-v1",
      JSON.stringify({ save: s, settings: { reduced: true, volume: 0 } }),
    );
  }, s);
  await page.goto(route);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.locator("#continue").click();
  await page.keyboard.press("Tab");
  await page.clock.runFor(100);
}
for (const type of [chromium, webkit]) {
  test(
    type.name() +
      " fog pixels: black unknown, static gray memory, rescout, zoom and read-only rendering",
    async () => {
      const browser = await type.launch({
          args: type === chromium ? ["--disable-gpu"] : [],
        }),
        context = await browser.newContext({
          viewport: { width: 1000, height: 760 },
        }),
        page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      try {
        await page.goto("http://127.0.0.1:4173" + route);
        const result = await page.evaluate(() => {
          // Pixel comparisons must not trigger a mid-test GPU-to-CPU canvas switch.
          const canvas = document.createElement("canvas");
          canvas.getContext("2d", { alpha: false, willReadFrequently: true });
          const E = SignalEngine,
            s = E.make("frontier-6"),
            v = new SignalView(canvas),
            b = E.living(s, "bastion"),
            ui = { mode: "tactical", reduced: true, touch: true, group: 1 };
          v.memoryCanvas.getContext("2d", { willReadFrequently: true });
          const visit = (p) => {
              Object.assign(E.hero(s), p);
              E.refreshRecon(s);
            },
            home = () => visit({ x: 180, y: 1610 });
          visit({ x: 1740, y: 330 });
          home();
          v.tactical = { overview: false, x: 1810, y: 400, zoom: 1 };
          v.render(s, ui, 1);
          const before = v.canvas.toDataURL(),
            point = v.screen(1810, 330),
            sample = v.c.getImageData(
              Math.round(point.x) - 30,
              Math.round(point.y) - 50,
              60,
              65,
            ).data;
          let gray = true,
            maxChroma = 0,
            nonblack = 0;
          for (let i = 0; i < sample.length; i += 4) {
            gray &&=
              sample[i] === sample[i + 1] && sample[i + 1] === sample[i + 2];
            maxChroma = Math.max(
              maxChroma,
              Math.max(sample[i], sample[i + 1], sample[i + 2]) -
                Math.min(sample[i], sample[i + 1], sample[i + 2]),
            );
            if (sample[i] > 8) nonblack++;
          }
          b.hp = 0;
          s.t = 100;
          E.refreshRecon(s);
          const state = JSON.stringify(s);
          v.render(s, ui, 1);
          const hiddenStable = before === v.canvas.toDataURL(),
            pure = state === JSON.stringify(s);
          visit({ x: 1740, y: 330 });
          home();
          v.render(s, ui, 1);
          const rescanned = before !== v.canvas.toDataURL();
          const black = [];
          for (const zoom of [0.7, 1.3]) {
            v.tactical = { overview: false, x: 2000, y: 2300, zoom };
            v.render(s, ui, 1);
            const p = v.screen(2050, 2310),
              data = v.c.getImageData(
                Math.round(p.x),
                Math.round(p.y),
                8,
                8,
              ).data;
            black.push(
              [...data].every((n, i) => (i % 4 === 3 ? n === 255 : n === 0)),
            );
          }
          s.phase = 2;
          s.relay.charge = 1;
          s.relay.stability = 0.4;
          visit({ x: 1320, y: 1420 });
          home();
          v.tactical = { overview: false, x: 1320, y: 1370, zoom: 1 };
          v.render(s, ui, 1);
          const relayImage = v.canvas.toDataURL();
          s.phase = 3;
          s.relay.online = true;
          s.relay.stability = 1;
          E.refreshRecon(s);
          v.render(s, ui, 1);
          const relayStable = relayImage === v.canvas.toDataURL();
          const paused = JSON.stringify(s);
          v.tactical = { overview: true, x: 1100, y: 1280, zoom: 0.4 };
          v.render(s, ui, 1);
          for (let i = 0; i < 20 && (!v.cameraSettled || v.memoryNeedsRefine); i++) v.render(s, ui, 1);
          const map = v.canvas.toDataURL();
          for (let i = 0; i < 5; i++) v.render(s, ui, 1);
          return {
            gray,
            maxChroma,
            nonblack,
            hiddenStable,
            relayStable,
            rescanned,
            pure,
            black,
            pausedStill: map === v.canvas.toDataURL(),
            unchanged: paused === JSON.stringify(s),
          };
        });
        expect(result).toMatchObject({
          gray: true,
          hiddenStable: true,
          relayStable: true,
          rescanned: true,
          pure: true,
          black: [true, true],
          pausedStill: true,
          unchanged: true,
        });
        expect(result.nonblack).toBeGreaterThan(50);
        expect(errors).toEqual([]);
      } finally {
        await context.close();
        await browser.close();
      }
    },
  );
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [1440, 900],
  ])
    test(
      type.name() + " recon production and save " + width + "x" + height,
      async () => {
        test.setTimeout(60000);
        const browser = await type.launch(),
          context = await browser.newContext({
            viewport: { width, height },
            hasTouch: width < 900,
            isMobile: width < 900,
          }),
          page = await context.newPage(),
          errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        try {
          const s = shop();
          await boot(page, s);
          await page.locator("#dock-shop").click();
          await page.locator("#develop-tab-production").click();
          const b = E.living(s, "barracks");
          await page.locator(`[data-select="${b.id}"]`).click();
          const button = page.locator("#develop-scout");
          await expect(button).toBeVisible();
          const before = await button.boundingBox();
          await button.click();
          await button.click();
          const after = await button.boundingBox();
          expect(after.x).toBeCloseTo(before.x, 1);
          expect(after.y).toBeCloseTo(before.y, 1);
          let state = await page.evaluate(() => SignalGame.snapshot());
          expect(E.living(state, "barracks").jobs.map((j) => j.action)).toEqual(
            ["scout", "scout"],
          );
          expect(state.economy.alloy).toBe(s.economy.alloy - 100);
          expect(state.t).toBe(s.t);
          const rect = await page.locator(".building-queue").boundingBox();
          expect(rect.y).toBeGreaterThanOrEqual(after.y + after.height - 1);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          if (process.env.SIGNAL_QA_SHOTS)
            await page.screenshot({
              path: path.join(
                process.env.SIGNAL_QA_SHOTS,
                type.name() + "-recon-shop-" + width + ".png",
              ),
            });
          await page.locator(".job-select").first().click();
          state = await page.evaluate(() => SignalGame.snapshot());
          expect(E.living(state, "barracks").jobs).toHaveLength(1);
          expect(state.economy.alloy).toBe(s.economy.alloy - 63);
          await page.locator("#dock-selection").click();
          await page.locator("#menu-button").click();
          const saved = await page.evaluate(() => SignalGame.snapshot());
          await page.reload();
          await page.locator("#continue").click();
          expect(
            (await page.evaluate(() => SignalGame.snapshot())).recon,
          ).toEqual(saved.recon);
          expect(errors).toEqual([]);
        } finally {
          await context.close();
          await browser.close();
        }
      },
    );
}
test("perception closes hidden spatial sound and never schedules unseen attacks", async ({
  page,
}) => {
  await page.goto(route);
  const report = await page.evaluate(() => {
    const E = SignalEngine,
      s = E.make("frontier-6"),
      h = E.hero(s),
      u = E.living(s, "sentinel");
    Object.assign(h, { x: 900, y: 1850 });
    Object.assign(u, { x: 1200, y: 1850 });
    E.refreshRecon(s);
    const context = new OfflineAudioContext(2, 22050, 22050),
      audio = new SignalAudio({ context, volume: () => 100 });
    audio.setup();
    audio.update(E.observe(s), "playing", 100);
    audio.play({ type: "shot", kind: "sentinel", team: 1, x: u.x, y: u.y });
    const before = audio.voices.size;
    h.hp = 0;
    E.refreshRecon(s);
    audio.update(E.observe(s), "playing", 100);
    const after = audio.voices.size;
    s.events = [{ type: "shot", kind: "sentinel", team: 1, x: u.x, y: u.y }];
    const events = E.knownEvents(s);
    return { before, after, hiddenEvents: events.length };
  });
  expect(report.before).toBeGreaterThan(0);
  expect(report.after).toBe(0);
  expect(report.hiddenEvents).toBe(0);
});
test("hidden enemy orders use a ground point, and pause/reload retains exploration", async ({
  page,
}) => {
  const s = E.make("frontier-6");
  await page.setViewportSize({ width: 1440, height: 900 });
  await boot(page, s);
  await page.locator("#map-overview").click();
  await page.clock.runFor(400);
  await selectGroup(page, 1);
  const target = E.living(s, "bastion"),
    p = await page.evaluate((p) => SignalGame.screen(p.x, p.y), target);
  await page.mouse.click(p.x, p.y, { button: "right" });
  const state = await page.evaluate(() => SignalGame.snapshot());
  expect(
    state.units.filter((u) => u.group === 1).every((u) => u.target === null),
  ).toBe(true);
  expect(state.units.some((u) => u.group === 1 && u.path.length)).toBe(true);
  expect(
    (await page.evaluate(() => SignalGame.observation())).units.some(
      (u) => u.id === target.id,
    ),
  ).toBe(false);
  expect(state.t).toBe(0);
  expect(state.recon).toEqual(s.recon);
  if (process.env.SIGNAL_QA_SHOTS)
    await page.screenshot({
      path: path.join(process.env.SIGNAL_QA_SHOTS, "fog-overview.png"),
    });
});

test("fatal hit outside other allies sight opens defeat and allows a fresh operation", async ({
  page,
}) => {
  const s = E.make("frontier-6"),
    h = E.hero(s),
    r = E.living(s, "rocket");
  Object.assign(h, { x: 900, y: 1850, hp: 1 });
  Object.assign(r, {
    x: 800,
    y: 1850,
    path: [],
    cool: 5,
    wind: 0,
    target: null,
  });
  r.ai.home = { x: r.x, y: r.y };
  s.bullets.push({
    kind: "missile",
    x: 892,
    y: 1850,
    map: "expedition",
    vx: 260,
    vy: 0,
    life: 2.65,
    age: 0.35,
    team: 1,
    owner: r.id,
    damage: 32,
    tx: h.x,
    ty: h.y,
    lockId: h.id,
    guided: false,
  });
  E.refreshRecon(s);
  expect(E.restore(s)).not.toBeNull();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await boot(page, s);
  await page.locator("#tactical").click();
  await page.clock.runFor(500);
  await expect(page.locator("#result-title")).toHaveText("Операция потеряна");
  const observed = await page.evaluate(() => SignalGame.observation());
  expect(observed.units.some((u) => u.kind === "hero" && u.hp === 0)).toBe(
    true,
  );
  await page.locator("#retry").click();
  expect((await page.evaluate(() => SignalGame.snapshot())).campaign.id).toBe(
    "frontier-9",
  );
  expect(errors).toEqual([]);
});
