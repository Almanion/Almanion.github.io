"use strict";
const { test, expect, chromium, webkit } = require("@playwright/test"),
  {
    E,
    fund,
    findSite,
  } = require("../tests/helpers/signal-frontier-construction.cjs");

function fixture() {
  const s = E.make("frontier-9"),
    mine = s.campaign.mines.find((m) => m.id === "west");
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((c) => (c.reserve = 0));
  fund(s, 1000);
  s.campaign.tier = 2;
  Object.assign(E.hero(s), { x: mine.x, y: mine.y });
  E.refreshRecon(s);
  if (!E.restore(s)) throw Error("Invalid industry fixture");
  return s;
}
async function boot(page, s) {
  await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-30T12:00:01Z"));
  await page.addInitScript((s) => {
    if (sessionStorage.getItem("industry-fixture")) return;
    sessionStorage.setItem("industry-fixture", "1");
    localStorage.setItem(
      "signal-frontier-v1",
      JSON.stringify({ save: s, settings: { reduced: true, volume: 0 } }),
    );
  }, s);
  await page.goto("/games/signal-frontier/");
  await page.locator("#continue").click();
  await page.keyboard.press("Tab");
  await page.clock.runFor(150);
}
async function focusMini(page, p, touch) {
  const q = await page.evaluate((p) => {
    const g = SignalGame.diagnostics().minimap.geometry,
      r = document.getElementById("minimap-canvas").getBoundingClientRect();
    return { x: r.x + g.x + p.x * g.scale, y: r.y + g.y + p.y * g.scale };
  }, p);
  if (touch) await page.touchscreen.tap(q.x, q.y);
  else await page.mouse.click(q.x, q.y);
  await page.clock.runFor(80);
}
async function pointAt(page, p, touch) {
  await focusMini(page, p, touch);
  const q = await page.evaluate((p) => SignalGame.screen(p.x, p.y), p);
  if (touch) await page.touchscreen.tap(q.x, q.y);
  else await page.mouse.move(q.x, q.y);
  await page.clock.runFor(80);
}
async function rotate(page, touch) {
  if (touch) await page.locator("#placement-rotate").tap();
  else await page.keyboard.press("KeyR");
  await page.clock.runFor(40);
}

for (const type of [chromium, webkit])
  for (const [width, height, turn] of [
    [1440, 900, 0],
    [390, 844, 1],
    [320, 568, 2],
    [844, 390, 3],
  ])
    test(`${type.name()} generic extractor, 4x4 placement and full rotation ${width}x${height}`, async ({}, info) => {
      test.setTimeout(90000);
      const browser = await type.launch(),
        touch = width < 900,
        context = await browser.newContext({
          viewport: { width, height },
          hasTouch: touch,
          isMobile: touch,
          deviceScaleFactor: touch ? 2 : 1,
        }),
        page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      try {
        const s = fixture();
        await boot(page, s);
        await page.locator("#dock-shop").click();
        await page.locator("#develop-tab-build").click();
        if (!(await page.locator("#develop-foundry").count()))
          await page.locator('[data-deck-page="1"]').click();
        await page.locator("#develop-foundry").click();
        const place = findSite(s, "foundry", E.hero(s));
        expect(place).toBeTruthy();
        await pointAt(page, place, touch);
        const before = await page.evaluate(() => SignalGame.snapshot());
        for (let i = 0; i < 4; i++) await rotate(page, touch);
        await page.locator("#field").evaluate((c) => {
          window.industryPixels = c
            .getContext("2d")
            .getImageData(0, 0, c.width, c.height).data;
        });
        const directions = [];
        for (let i = 0; i < 4; i++) {
          await rotate(page, touch);
          directions.push(
            await page.locator("#placement-rotate").getAttribute("aria-label"),
          );
        }
        expect(new Set(directions).size).toBe(4);
        const difference = await page.locator("#field").evaluate((c) => {
          const next = c
            .getContext("2d")
            .getImageData(0, 0, c.width, c.height).data;
          let sum = 0,
            large = 0;
          for (let i = 0; i < next.length; i++) {
            const d = Math.abs(next[i] - industryPixels[i]);
            sum += d;
            if (d > 8) large++;
          }
          delete window.industryPixels;
          return { mean: sum / next.length, large: large / next.length };
        });
        // Readback backends may vary a few antialiased edge pixels; a displaced
        // footprint changes a large region and exceeds both fidelity limits.
        expect(difference.mean).toBeLessThan(0.04);
        expect(difference.large).toBeLessThan(0.0005);
        expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(
          before,
        );
        await page.locator("#placement-cancel").click();
        await page.locator("#dock-shop").click();
        await page.locator("#develop-tab-economy").click();
        await expect(page.locator('[data-construct="outpost"]')).toHaveCount(1);
        await expect(page.locator("#develop-outpost")).toContainText(
          "Экстрактор",
        );
        await expect(page.locator("#develop-outpost")).toContainText("4×4");
        await expect(page.locator("[data-mine],[data-near]")).toHaveCount(0);
        await page.locator("#develop-outpost").click();
        for (let i = 0; i < turn; i++) await rotate(page, touch);
        const mine = s.campaign.mines.find((m) => m.id === "west"),
          position = findSite(s, "outpost", mine, turn);
        expect(position).toBeTruthy();
        await pointAt(page, position, touch);
        await expect(page.locator("#placement-title")).toHaveText("Экстрактор");
        await expect(page.locator("#placement-cost")).toContainText("4×4");
        await expect(page.locator("#placement-confirm")).toBeEnabled();
        await expect(page.locator("#placement-status")).toContainText(
          "путь дронов к источнику",
        );
        await page.screenshot({
          path: info.outputPath("extractor-preview.png"),
        });
        await page.locator("#placement-confirm").click();
        const built = await page.evaluate(() => SignalGame.snapshot()),
          u = built.units.find((v) => v.kind === "outpost");
        expect(u.construction.turn).toBe(turn);
        expect(u.construction.footprint).toBe(4);
        expect(u.site).toBe("west");
        expect([E.construction.rect(u).w, E.construction.rect(u).h]).toEqual([
          160, 160,
        ]);
        expect(built.economy.alloy).toBe(s.economy.alloy - 160);
        expect(built.t).toBe(s.t);
        expect(E.restore(built)).not.toBeNull();
        await page.reload();
        await page.locator("#continue").click();
        await page.keyboard.press("Tab");
        await page.clock.runFor(100);
        expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(built);
        await page.screenshot({ path: info.outputPath("extractor-built.png") });
        expect(errors).toEqual([]);
      } finally {
        await browser.close();
      }
    });

test("gray fog rounds coarse circle steps while preserving holes and reuses the same contour on the mini-map", async ({
  page,
}) => {
  await page.goto("/games/signal-frontier/");
  const result = await page.evaluate(() => {
    const v = new SignalView(document.createElement("canvas")),
      cx = 1100,
      cy = 1300,
      r = 600,
      fog = {
        cell: 40,
        cols: 56,
        rows: 64,
        explored: new Uint8Array(56 * 64),
        exploredCode: "round-circle",
        observers: [],
      },
      c = document.createElement("canvas").getContext("2d");
    v.mapId = "expedition";
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 56; x++)
        if (Math.hypot(x * 40 + 20 - cx, y * 40 + 20 - cy) <= r)
          fog.explored[y * 56 + x] = 1;
    const shape = v.fogPath(fog, "explored");
    let plateau = 0,
      max = 0,
      last = null;
    for (let x = cx + 150; x <= cx + 510; x++) {
      let lo = cy,
        hi = cy + 700;
      for (let j = 0; j < 14; j++) {
        const mid = (lo + hi) / 2;
        if (c.isPointInPath(shape, x, mid)) lo = mid;
        else hi = mid;
      }
      const yy = Math.floor(lo);
      plateau = yy === last ? plateau + 1 : 1;
      max = Math.max(max, plateau);
      last = yy;
    }
    const s = SignalEngine.make("frontier-9"),
      state = JSON.stringify(s),
      scene = SignalEngine.observe(s),
      view = new SignalView(document.createElement("canvas")),
      miniCanvas = document.createElement("canvas");
    miniCanvas.style.width = "110px";
    miniCanvas.style.height = "117px";
    document.body.append(miniCanvas);
    view.render(
      scene,
      { mode: "tactical", reduced: true, selectionIds: [] },
      1,
    );
    const mini = new SignalMiniMap.MiniMap(miniCanvas);
    mini.draw(scene, { selectionIds: [], active: false }, view, 1000);
    const point = SignalMiniMap.project(mini.g, { x: 3400, y: 3640 }),
      pixel = [
        ...mini.background
          .getContext("2d")
          .getImageData(
            Math.floor(point.x * mini.dpr),
            Math.floor(point.y * mini.dpr),
            1,
            1,
          ).data,
      ];
    return {
      maxPlateau: max,
      cached: shape === v.fogPath(fog, "explored"),
      shared: mini.regions.explored.code === view.fogPaths.explored.code,
      pixel,
      pure: state === JSON.stringify(s),
    };
  });
  expect(result.maxPlateau).toBeLessThan(20);
  expect(result.cached).toBe(true);
  expect(result.shared).toBe(true);
  expect(result.pixel).toEqual([5, 12, 16, 255]);
  expect(result.pure).toBe(true);
});

test("fog terrain caches follow map changes without carrying cliff geometry across operations", async ({
  page,
}) => {
  await page.goto("/games/signal-frontier/");
  const result = await page.evaluate(() => {
    const c = document.createElement("canvas").getContext("2d"),
      view = new SignalView(document.createElement("canvas"));
    let differences = 0;
    for (const profile of ["frontier-8", "frontier-9", "frontier-8"]) {
      const E = SignalEngine,
        s = E.make(profile),
        h = E.hero(s);
      Object.assign(h, { x: 1880, y: 1640 });
      E.refreshRecon(s);
      const fog = E.observe(s).fog,
        ref = new SignalView(document.createElement("canvas"));
      view.mapId = ref.mapId = E.map(s).id;
      for (const kind of ["visible", "explored"]) {
        const a = view.fogPath(fog, kind),
          b = ref.fogPath(fog, kind);
        for (let y = 1200; y < 2200; y += 17)
          for (let x = 1400; x < 2400; x += 19)
            if (c.isPointInPath(a, x, y) !== c.isPointInPath(b, x, y))
              differences++;
      }
    }
    return differences;
  });
  expect(result).toBe(0);
});
