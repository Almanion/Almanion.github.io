"use strict";
const { test, expect } = require("@playwright/test"),
  {
    E,
    findSite,
  } = require("../tests/helpers/signal-frontier-construction.cjs");
for (const [width, height, touch, engine] of [
  [1440, 900, false],
  [390, 844, true],
  [320, 568, true],
  [844, 390, true],
  [390, 844, true, "webkit"],
])
  test(
    "new district map, paid construction and reload " +
      width +
      "x" +
      height +
      (engine ? " " + engine : ""),
    async ({ browser }, info) => {
      test.setTimeout(90000);
      const extraBrowser = engine
        ? await require("@playwright/test")[engine].launch()
        : null;
      const context = await (extraBrowser || browser).newContext({
          viewport: { width, height },
          hasTouch: touch,
          isMobile: touch,
          deviceScaleFactor: touch ? 2 : 1,
        }),
        page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      try {
        await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
        await page.clock.pauseAt(new Date("2030-01-01T00:00:30Z"));
        await page.goto("/games/signal-frontier/");
        await expect(page.locator(".edition")).toContainText("0.20.0");
        await page.locator("#start").click();
        const initial = await page.evaluate(() => SignalGame.snapshot());
        expect(initial.campaign.id).toBe("frontier-9");
        expect(initial.version).toBe(11);
        expect(initial.economy.alloy).toBe(180);
        await page.clock.runFor(100);
        await page.screenshot({ path: info.outputPath("district-home.png") });
        const site = findSite(E.restore(initial), "barracks");
        expect(site).not.toBeNull();
        await page.locator("#supply-open").click();
        await page.locator("#develop-tab-build").click();
        await page.locator("#develop-barracks").click();
        await page.clock.runFor(100);
        expect(
          (await page.evaluate(() => SignalGame.snapshot())).economy.spent,
        ).toBe(0);
        const at = await page.evaluate(
          (p) => SignalGame.screen(p.x, p.y),
          site,
        );
        if (touch) await page.touchscreen.tap(at.x, at.y);
        else await page.mouse.move(at.x, at.y);
        await page.clock.runFor(100);
        await expect(page.locator("#placement-confirm")).toBeEnabled();
        await page.screenshot({
          path: info.outputPath("district-placement.png"),
        });
        if (touch) await page.locator("#placement-confirm").tap();
        else await page.mouse.click(at.x, at.y);
        await page.clock.runFor(100);
        const current = await page.evaluate(() => SignalGame.snapshot());
        expect(current.economy.spent).toBe(120);
        expect(current.economy.alloy).toBe(60);
        const building = current.units.find((u) => u.construction);
        expect(building).toBeTruthy();
        expect(E.restore(current)).not.toBeNull();
        await page.reload();
        await page.locator("#continue").click();
        await page.keyboard.press("Tab");
        await page.clock.runFor(100);
        const loaded = await page.evaluate(() => SignalGame.snapshot());
        expect(loaded.campaign.id).toBe("frontier-9");
        expect(
          loaded.units.find((u) => u.id === building.id).construction,
        ).toEqual(building.construction);
        expect(E.restore(loaded)).not.toBeNull();
        expect(errors).toEqual([]);
      } finally {
        await context.close();
        if (extraBrowser) await extraBrowser.close();
      }
    },
  );
test("district map has a complete diagnostic overview and ordinary play keeps the remote bases hidden", async ({
  page,
}, info) => {
  await page.goto("/games/signal-frontier/");
  await page.locator("#start").click();
  const data = await page.evaluate(() => {
    const E = SignalEngine,
      s = SignalGame.snapshot(),
      v = E.observe(s);
    return {
      map: E.map(s).id,
      districts: E.map(s).regions.length,
      knownEnemy: v.units.filter((u) => u.team).length,
      totalEnemy: s.units.filter((u) => u.team).length,
      terminals: v.terminals.length,
    };
  });
  expect(data.map).toBe("districts");
  expect(data.districts).toBe(13);
  expect(data.knownEnemy).toBeLessThan(data.totalEnemy);
  expect(data.terminals).toBe(0);
  const uri = await page.evaluate(() => {
    const E = SignalEngine,
      s = E.make("frontier-9"),
      o = E.observe(s),
      n = o.fog.cols * o.fog.rows,
      all = new Uint8Array(n).fill(1),
      code = "f".repeat(n / 4);
    Object.assign(o, {
      units: s.units,
      caches: s.caches,
      terminals: E.terminalSites(s),
      terminal: s.terminal,
      campaign: s.campaign,
    });
    o.fog = {
      ...o.fog,
      visible: all,
      explored: all,
      visibleCode: code,
      exploredCode: code,
    };
    const canvas = document.createElement("canvas"),
      v = new SignalView(canvas);
    v.resize();
    v.tactical.overview = true;
    v.render(
      o,
      { mode: "tactical", reduced: true, group: 1, selectionIds: [] },
      0,
    );
    return canvas.toDataURL();
  });
  require("node:fs").writeFileSync(
    info.outputPath("diagnostic-map-overview.png"),
    Buffer.from(uri.split(",")[1], "base64"),
  );
});

for (const engine of ["chromium", "webkit"])
  test(
    "active terminal rendering and remembered open state " + engine,
    async ({}, info) => {
      const browser = await require("@playwright/test")[engine].launch();
      try {
        const page = await browser.newPage({
          viewport: { width: 1440, height: 900 },
        });
        await page.goto("/games/signal-frontier/");
        const result = await page.evaluate(() => {
          const E = SignalEngine,
            s = E.make("frontier-9"),
            h = E.hero(s),
            canvas = document.createElement("canvas"),
            v = new SignalView(canvas);
          v.resize();
          v.tactical.overview = true;
          Object.assign(h, { x: 2800, y: 2400 });
          Object.assign(s.terminal, {
            x: 2800,
            y: 2400,
            window: 15,
            charge: 1,
            channeling: true,
          });
          E.refreshRecon(s);
          const before = JSON.stringify(s);
          v.render(
            E.observe(s),
            { mode: "tactical", reduced: false, selectionIds: [] },
            0.016,
          );
          const activePure = before === JSON.stringify(s),
            seen = E.observe(s).terminals.some(
              (p) => p.x === 2800 && p.y === 2400,
            );
          Object.assign(h, { x: 400, y: 2400 });
          E.refreshRecon(s);
          const remembered = E.observe(s),
            saved = JSON.stringify(s);
          v.render(
            remembered,
            { mode: "tactical", reduced: true, selectionIds: [] },
            0,
          );
          return {
            activePure,
            memoryPure: saved === JSON.stringify(s),
            seen,
            remembered: remembered.fog.memory.terminals.some(
              (p) => p.x === 2800 && p.y === 2400,
            ),
            uri: canvas.toDataURL(),
          };
        });
        expect(result.activePure).toBe(true);
        expect(result.memoryPure).toBe(true);
        expect(result.seen).toBe(true);
        expect(result.remembered).toBe(true);
        require("node:fs").writeFileSync(
          info.outputPath("remembered-terminal.png"),
          Buffer.from(result.uri.split(",")[1], "base64"),
        );
      } finally {
        await browser.close();
      }
    },
  );
