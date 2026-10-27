"use strict";
const { test, expect, chromium, webkit } = require("@playwright/test");
const E = require("../game-source/signal-frontier/src/engine"),
  path = require("node:path");
const route = "/games/signal-frontier/";
for (const type of [chromium, webkit])
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [844, 390],
  ])
    test(
      type.name() +
        " highlands controls and projection " +
        width +
        "x" +
        height,
      async () => {
        const browser = await type.launch(),
          context = await browser.newContext({
            viewport: { width, height },
            hasTouch: width < 900,
          }),
          page = await context.newPage(),
          errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        try {
          await page.clock.install();
          await page.goto(route);
          await page.clock.pauseAt(
            await page.evaluate(() => Date.now() + 1000),
          );
          await page.locator("#start").click();
          await page.clock.runFor(300);
          expect(await page.evaluate(() => SignalGame.snapshot().version)).toBe(
            9,
          );
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth - innerWidth,
            ),
          ).toBe(0);
          await page.locator("#map-overview").click();
          await page.clock.runFor(600);
          await page.locator("#group-one").click();
          const target = await page.evaluate(() =>
            SignalGame.screen(900, 2380),
          );
          if (width < 900) {
            await page.locator("#order-move").click();
            await page.touchscreen.tap(target.x, target.y);
          } else
            await page.mouse.click(target.x, target.y, { button: "right" });
          const ordered = await page.evaluate(() => SignalGame.snapshot());
          expect(ordered.t).toBe(0);
          expect(
            ordered.units
              .filter((u) => u.group === 1)
              .every((u) => u.path.length > 0),
          ).toBe(true);
          await page.locator("#menu-button").click();
          await page.reload();
          await page.locator("#continue").click();
          await page.keyboard.press("Tab");
          await page.clock.runFor(700);
          expect(
            await page.evaluate(() => SignalGame.snapshot().units),
          ).toEqual(ordered.units);
          const checked = await page.evaluate(() => {
            const E = SignalEngine,
              s = E.make(),
              v = new SignalView(document.createElement("canvas"));
            const ui = {
              mode: "tactical",
              reduced: true,
              touch: true,
              group: 1,
            };
            let error = 0;
            for (const p of [
              [390, 2415],
              [940, 3440],
              [3150, 1875],
              [2400, 1900],
              [2160, 2860],
            ]) {
              v.tactical = {
                overview: false,
                x: p[0],
                y: p[1] - E.elevation(...p, "highlands"),
                zoom: 1,
              };
              v.render(s, ui, 1);
              const q = v.world(...Object.values(v.screen(...p)));
              error = Math.max(error, Math.hypot(q.x - p[0], q.y - p[1]));
            }
            v.tactical = { overview: false, x: 3150, y: 1740, zoom: 1 };
            v.render(s, ui, 1);
            const hidden = v.canvas.toDataURL();
            const enemy = E.living(s, "citadel");
            enemy.hp = 0;
            E.refreshRecon(s);
            v.render(s, ui, 1);
            const hiddenStable = hidden === v.canvas.toDataURL();
            const before = JSON.stringify(s);
            v.render(s, ui, 1);
            return {
              error,
              hiddenStable,
              pure: before === JSON.stringify(s),
              textureBytes: v.ground.width * v.ground.height * 4,
            };
          });
          expect(checked.error).toBeLessThan(0.1);
          expect(checked.hiddenStable).toBe(true);
          expect(checked.pure).toBe(true);
          expect(checked.textureBytes).toBeLessThan(15000000);
          if (process.env.SIGNAL_QA_SHOTS)
            await page.screenshot({
              path: path.join(
                process.env.SIGNAL_QA_SHOTS,
                `highlands-${type.name()}-${width}x${height}.png`,
              ),
            });
          expect(errors).toEqual([]);
        } finally {
          await context.close();
          await browser.close();
        }
      },
    );
test("terrain gallery: connected plateaus, ramps and directional silhouettes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(route);
  const result = await page.evaluate(() => {
    const E = SignalEngine,
      s = E.make(),
      v = new SignalView(document.createElement("canvas"));
    s.id = "highlands";
    s.campaign.id = "frontier-5";
    s.caches = [];
    s.campaign.mines = [];
    s.campaign.camps = [];
    s.relay = { unknown: true };
    s.terminal = { unknown: true };
    v.canvas.id = "terrain-gallery";
    v.canvas.style.cssText =
      "position:fixed;inset:0;z-index:99999;width:100%;height:100%";
    document.body.append(v.canvas);
    const ui = { mode: "tactical", reduced: true, group: 1 };
    v.tactical = { overview: true, x: 1800, y: 1920, zoom: 0.3 };
    const before = JSON.stringify(s),
      begin = performance.now();
    v.render(s, ui, 1);
    const ms = performance.now() - begin;
    const withShadow = v.canvas.toDataURL(),
      shadow = v.shadow;
    v.shadow = () => {};
    v.render(s, ui, 1);
    const changed = withShadow !== v.canvas.toDataURL();
    v.shadow = shadow;
    v.render(s, ui, 1);
    return { pure: JSON.stringify(s) === before, changed, ms };
  });
  expect(result.pure).toBe(true);
  expect(result.changed).toBe(true);
  if (process.env.SIGNAL_QA_SHOTS)
    await page.screenshot({
      path: path.join(process.env.SIGNAL_QA_SHOTS, "highlands-map.png"),
    });
});

test("trusted phone joystick climbs a ramp continuously and stops on release", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  const s = E.make();
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((c) => (c.reserve = 0));
  Object.assign(E.hero(s), { x: 2140, y: 500 });
  E.refreshRecon(s);
  expect(E.restore(s)).not.toBeNull();
  await page.addInitScript(
    (s) =>
      localStorage.setItem(
        "signal-frontier-v1",
        JSON.stringify({ save: s, settings: { volume: 0, reduced: true } }),
      ),
    s,
  );
  await page.goto(route);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.locator("#continue").click();
  const move = await page.locator("#move-stick").boundingBox(),
    cdp = await context.newCDPSession(page),
    x = move.x + move.width / 2,
    y = move.y + move.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, x, y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ id: 1, x: x + 60, y }],
  });
  await page.clock.runFor(1600);
  const h = await page.evaluate(() => SignalEngine.hero(SignalGame.snapshot()));
  expect(h.x).toBeGreaterThan(2400);
  expect(E.terrain.level(h.x, h.y)).toBeGreaterThan(1.7);
  expect(h.y).toBeCloseTo(500, 0);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.clock.runFor(200);
  expect(
    await page.evaluate(() => SignalGame.snapshot().units[0].x),
  ).toBeCloseTo(h.x, 3);
  await page.locator("#tactical").click();
  await page.clock.runFor(300);
  const position = await page.evaluate(() => {
    const h = SignalEngine.hero(SignalGame.snapshot());
    return SignalGame.screen(h.x, h.y);
  });
  expect(position.x).toBeGreaterThan(30);
  expect(position.x).toBeLessThan(360);
  expect(position.y).toBeGreaterThan(150);
  expect(position.y).toBeLessThan(590);
  expect(
    await page.evaluate(
      () => SignalEngine.restore(SignalGame.snapshot()) !== null,
    ),
  ).toBe(true);
  if (process.env.SIGNAL_QA_SHOTS)
    await page.screenshot({
      path: path.join(process.env.SIGNAL_QA_SHOTS, "highlands-ramp-phone.png"),
    });
});

test("upper ground occludes a lower unit and its silhouette shadow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(route);
  const result = await page.evaluate(() => {
    const E = SignalEngine,
      s = E.make(),
      u = s.units.find((u) => u.kind === "rifle"),
      v = new SignalView(document.createElement("canvas"));
    s.id = "highlands";
    s.campaign.id = "frontier-5";
    Object.assign(u, { x: 2700, y: 1416 });
    v.tactical = { overview: false, x: 2700, y: 1340, zoom: 1 };
    v.camera = { x: 2700, y: 1340, scale: 1 };
    const ui = { mode: "tactical", reduced: true, selectionIds: [], group: 1 };
    const sample = () => {
      const p = v.screen(u.x, u.y);
      return v.c.getImageData(
        Math.round(p.x) - 45,
        Math.round(p.y) - 55,
        90,
        90,
      ).data;
    };
    v.render(s, ui, 1);
    const covered = v.covered(u),
      withUnit = sample();
    s.units = s.units.filter((q) => q.id !== u.id);
    v.render(s, ui, 1);
    const without = sample();
    s.units.push(u);
    v.occlude = () => {};
    v.render(s, ui, 1);
    const unmasked = sample();
    let diff = 0,
      control = 0;
    for (let i = 0; i < withUnit.length; i++)
      if (i % 4 !== 3) {
        diff = Math.max(diff, Math.abs(withUnit[i] - without[i]));
        control = Math.max(control, Math.abs(unmasked[i] - without[i]));
      }
    return { covered, diff, control };
  });
  expect(result.covered).toBe(true);
  expect(result.control).toBeGreaterThan(20);
  expect(result.diff).toBeLessThanOrEqual(5);
});

test("fog has no ramp seams and never reveals a higher unknown foreground", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(route);
  const result = await page.evaluate(() => {
    const E = SignalEngine,
      s = E.make(),
      h = E.hero(s),
      v = new SignalView(document.createElement("canvas")),
      ui = { mode: "tactical", reduced: true, selectionIds: [] };
    Object.assign(h, { x: 2468, y: 500 });
    E.refreshRecon(s);
    v.tactical = { overview: false, x: 2468, y: 366, zoom: 1 };
    v.render(s, ui, 1);
    const fog = E.observe(s).fog;
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 700;
    const c = canvas.getContext("2d");
    c.translate(-2068, -100);
    v.fogClip(c, fog, "visible");
    c.fillStyle = "#fff";
    c.fillRect(2068, 100, 800, 700);
    let minimum = 255;
    for (let y = 400; y <= 600; y += 40)
      for (let x = 2305; x < 2515; x += 2) {
        const p = v.p(x, y);
        minimum = Math.min(
          minimum,
          c.getImageData(Math.round(p[0] - 2068), Math.round(p[1] - 100), 1, 1)
            .data[3],
        );
      }
    Object.assign(h, { x: 2700, y: 1416 });
    s.recon.explored = s.recon.visible.map((code) => "0".repeat(code.length));
    s.recon.memory = [[], []];
    E.refreshRecon(s);
    v.tactical = { overview: false, x: 2700, y: 1344, zoom: 1 };
    v.render(s, ui, 1);
    const q = { x: 2720, y: 1480, map: "highlands" },
      p = v.screen(q.x, q.y),
      data = v.c.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
    return { minimum, unknown: !E.explored(s, 0, q), color: [...data] };
  });
  expect(result.minimum).toBeGreaterThan(245);
  expect(result.unknown).toBe(true);
  expect(result.color).toEqual([0, 0, 0, 255]);
});

test("dead models and building foundations preserve clipping between paused frames", async ({
  page,
}) => {
  await page.goto(route);
  const result = await page.evaluate(() => {
    const E = SignalEngine,
      s = E.make(),
      v = new SignalView(document.createElement("canvas")),
      ui = { mode: "tactical", reduced: true, selectionIds: [] };
    for (const u of s.units) if (u.team) u.hp = 0;
    Object.assign(E.hero(s), { x: 2468, y: 500 });
    E.refreshRecon(s);
    v.tactical = { overview: false, x: 2468, y: 366, zoom: 1 };
    v.render(s, ui, 1);
    const a = v.canvas.toDataURL();
    v.render(s, ui, 1);
    const dead = a === v.canvas.toDataURL();
    const fresh = E.make();
    E.purchase(fresh, "barracks");
    v.reset(fresh);
    v.render(fresh, ui, 1);
    const b = v.canvas.toDataURL();
    v.render(fresh, ui, 1);
    return { dead, foundation: b === v.canvas.toDataURL() };
  });
  expect(result).toEqual({ dead: true, foundation: true });
});
