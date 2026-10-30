"use strict";
const { selectArmy } = require("./helpers/signal-frontier-selection.cjs");
const { test, expect } = require("@playwright/test"),
  {
    E,
    fund,
    build,
    findSite,
  } = require("../tests/helpers/signal-frontier-construction.cjs");
let cached;
function fixture() {
  if (!cached) {
    const s = E.make("frontier-9");
    for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
    s.campaign.camps.forEach((c) => (c.reserve = 0));
    fund(s, 3000);
    Object.assign(E.hero(s), { x: 1000, y: 2450 });
    E.refreshRecon(s);
    build(s, "barracks", E.hero(s));
    E.purchase(s, "drone", String(E.living(s, "base").id));
    assertSave(s);
    cached = E.snapshot(s);
  }
  return structuredClone(cached);
}
function assertSave(s) {
  if (!E.restore(s)) throw Error("Invalid UI fixture");
}
async function boot(page, state) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: new Date("2026-10-29T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-29T12:00:01Z"));
  if (state)
    await page.addInitScript((s) => {
      if (sessionStorage.getItem("seed-command")) return;
      sessionStorage.setItem("seed-command", "yes");
      localStorage.setItem(
        "signal-frontier-v1",
        JSON.stringify({ save: s, settings: { reduced: true, volume: 0 } }),
      );
    }, state);
  await page.goto("/games/signal-frontier/");
  await page.locator(state ? "#continue" : "#start").click();
  if (state) await page.keyboard.press("Tab");
  await page.clock.runFor(150);
}
async function point(page, u) {
  return page.evaluate((u) => {
    const p = SignalGame.screen(u.x, u.y);
    return { x: p.x, y: p.y - 10 * SignalGame.camera().scale };
  }, u);
}
async function fits(page) {
  const layout = await page.evaluate(() => {
    const panel = document.getElementById("development-panel"),
      r = panel.getBoundingClientRect();
    return {
      height: panel.clientHeight,
      scroll: panel.scrollHeight,
      width: panel.clientWidth,
      scrollWidth: panel.scrollWidth,
      outside: [...panel.querySelectorAll("button:not([disabled])")]
        .filter((e) => {
          const b = e.getBoundingClientRect();
          return (
            b.bottom > r.bottom + 2 ||
            b.right > r.right + 2 ||
            b.left < r.left - 2
          );
        })
        .map((e) => e.textContent),
      blocks: [...panel.querySelector(".deck-content").children].map((e) => {
        const b = e.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
      }),
    };
  });
  expect(layout.scroll).toBeLessThanOrEqual(layout.height + 2);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 2);
  expect(layout.outside).toEqual([]);
  for (let i = 0; i < layout.blocks.length; i++) for (let j = i + 1; j < layout.blocks.length; j++) {
    const a = layout.blocks[i], b = layout.blocks[j];
    expect(a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1).toBe(false);
  }
}

for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [320, 568],
  [844, 390],
])
  test(`command deck fits sections and selected production without scrolling ${width}x${height}`, async ({
    browser,
  }, info) => {
    test.setTimeout(120000);
    const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: width < 900,
        isMobile: width < 900,
        deviceScaleFactor: width < 700 ? 2 : 1,
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await boot(page, fixture());
      await page.locator("#dock-shop").click();
      await fits(page);
      for (const section of ["build", "economy", "production", "research"]) {
        await page.locator("#develop-tab-" + section).click();
        await page.clock.runFor(50);
        await fits(page);
        if (section === "research") {
          await page.locator('[data-deck-page="1"]').click();
          await fits(page);
        }
        await page.locator("[data-deck-back]").click();
      }
      await page.locator("#develop-tab-economy").click();
      await page
        .locator("[data-select]")
        .filter({ hasText: "Посадочный узел" })
        .click();
      await fits(page);
      for (const section of ["tech", "service", "troops"]) {
        await page.locator(`[data-section="${section}"]`).click();
        await fits(page);
      }
      const before = await page.evaluate(() => SignalGame.snapshot()),
        base = before.units.find((u) => u.kind === "base"),
        job = base.jobs[0];
      expect(job).toBeTruthy();
      await page.locator(".job-select").first().click();
      const after = await page.evaluate(() => SignalGame.snapshot());
      expect(after.units.find((u) => u.id === base.id).jobs).toHaveLength(
        base.jobs.length - 1,
      );
      expect(after.economy.alloy).toBe(
        before.economy.alloy + Math.floor(job.cost * 0.75),
      );
      await fits(page);
      const economy = await page.locator(".field-economy").boundingBox();
      expect(economy.x + economy.width).toBeGreaterThan(width * 0.7);
      if (width === 390) {
        await page.setViewportSize({ width: 844, height: 390 });
        await page.clock.runFor(200);
        await fits(page);
        await page.setViewportSize({ width, height });
        await page.clock.runFor(200);
        await fits(page);
      }
      await page.screenshot({ path: info.outputPath("production.png") });
      await page.locator("#dock-selection").click();
      await expect(page.locator("#dialog")).not.toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

test("cursor aim and actual projectile agree at flat surfaces, ramps and voids", async ({
  page,
}) => {
  await page.goto("/games/signal-frontier/");
  const results = await page.evaluate(() => {
    const rows = [];
    for (const profile of ["classic", "frontier-7", "frontier-9"]) {
      const E = SignalEngine,
        s = E.make(profile),
        h = E.hero(s),
        v = new SignalView(document.createElement("canvas"));
      for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
      const link = E.map(s).links?.find(
          (p) => p.axis === "x" && p.from !== p.to,
        ),
        positions = [
          { x: h.x, y: h.y },
          ...(link
            ? [{ x: link.x + link.w * 0.35, y: link.y + link.h * 0.5 }]
            : []),
        ];
      for (const position of positions) {
        Object.assign(h, position);
        E.refreshRecon(s);
        v.render(s, { mode: "playing", reduced: true }, 1);
        const centre = v.screen(h.x, h.y);
        for (const [dx, dy] of [
          [180, 0],
          [-140, 60],
          [60, -100],
          [0, 140],
        ]) {
          const x = centre.x + dx,
            y = centre.y + dy,
            aim = v.aim(x, y, h),
            state = E.restore(E.snapshot(s));
          state.ammo = 12;
          state.reload = 0;
          E.hero(state).cool = 0;
          E.step(state, { aim, fire: true });
          const b = state.bullets.find((b) => b.owner === h.id);
          if (!b) throw Error("Missing shot");
          const t =
              ((aim.x - b.x) * b.vx + (aim.y - b.y) * b.vy) /
              (b.vx * b.vx + b.vy * b.vy),
            z = E.projectileHeight(b, b.age + t) ?? E.MOUNTS.hero,
            px = (b.x + b.vx * t - v.camera.x) * v.camera.scale + v.origin.x,
            py =
              (b.y + b.vy * t - z - v.camera.y) * v.camera.scale * 0.73 +
              v.origin.y;
          rows.push({
            profile,
            ramp: position !== positions[0],
            error: Math.hypot(px - x, py - y),
          });
        }
      }
    }
    return rows;
  });
  for (const r of results) expect(r.error, r.profile).toBeLessThan(0.75);
});

test("enemy shot warning ends at the centre of its target ring on elevated ground", async ({
  page,
}) => {
  await page.goto("/games/signal-frontier/");
  const rows = await page.evaluate(() => {
    const E = SignalEngine,
      rows = [];
    for (const [x, y] of [
      [1000, 2450],
      [2940, 1880],
    ]) {
      const s = E.make("frontier-9"),
        h = E.hero(s),
        enemy = s.units.find((u) => u.kind === "sentinel"),
        v = new SignalView(document.createElement("canvas"));
      for (const u of s.units) if (u.team && u !== enemy) u.hp = 0;
      Object.assign(h, { x, y });
      Object.assign(enemy, {
        x: x - 200,
        y,
        wind: 0.5,
        target: { x, y, id: h.id },
      });
      E.refreshRecon(s);
      v.tactical = { overview: false, x, y, zoom: 0.8 };
      let points = [];
      const strokes = [],
        c = v.c,
        begin = c.beginPath.bind(c),
        move = c.moveTo.bind(c),
        line = c.lineTo.bind(c),
        stroke = c.stroke.bind(c);
      c.beginPath = function () {
        points = [];
        return begin();
      };
      c.moveTo = function (a, b) {
        points.push([a, b]);
        return move(a, b);
      };
      c.lineTo = function (a, b) {
        points.push([a, b]);
        return line(a, b);
      };
      c.stroke = function () {
        if (this.strokeStyle === "#f4ae89") strokes.push(points.slice());
        return stroke();
      };
      v.render(s, { mode: "tactical", reduced: true, selectionIds: [] }, 0);
      const attack = strokes.find((p) => p.length === 2),
        ring = strokes.find((p) => p.length > 8);
      if (!attack || !ring) throw Error("Missing attack warning");
      const centre = [0, 1].map(
        (i) =>
          (Math.min(...ring.map((p) => p[i])) +
            Math.max(...ring.map((p) => p[i]))) /
          2,
      );
      rows.push({
        height: E.terrain.height(x, y),
        error: Math.hypot(attack[1][0] - centre[0], attack[1][1] - centre[1]),
      });
    }
    return rows;
  });
  for (const row of rows) {
    expect(row.height).toBeGreaterThan(0);
    expect(row.error).toBeLessThan(0.01);
  }
});

test("right-drag during combat keeps time and camera following the moving hero", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await boot(page, fixture());
  await page.keyboard.press("Tab");
  await page.clock.runFor(100);
  const before = await page.evaluate(() => ({
    camera: SignalGame.camera(),
    state: SignalGame.snapshot(),
  }));
  await page.mouse.move(100, 300);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(300, 400);
  await page.keyboard.down("KeyD");
  await page.clock.runFor(400);
  await page.keyboard.up("KeyD");
  const after = await page.evaluate(() => ({
    camera: SignalGame.camera(),
    state: SignalGame.snapshot(),
  }));
  await page.mouse.up({ button: "right" });
  expect(after.state.t).toBeGreaterThan(before.state.t);
  expect(after.camera.x).toBeGreaterThan(before.camera.x + 10);
});

test("Shift repeats buildings and a saved mixed group gives a shared follow order", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await boot(page, fixture());
  await page.locator("#dock-shop").click();
  await page.locator("#develop-tab-build").click();
  await page.locator("#develop-barracks").click();
  await page.clock.runFor(100);
  const initial = await page.evaluate(() => SignalGame.snapshot()),
    oldCount = initial.units.filter((u) => u.kind === "barracks").length;
  await page.keyboard.down("Shift");
  for (let i = 0; i < 2; i++) {
    const s = E.restore(await page.evaluate(() => SignalGame.snapshot())),
      site = findSite(s, "barracks");
    expect(site).toBeTruthy();
    const p = await page.evaluate((p) => SignalGame.screen(p.x, p.y), site);
    await page.mouse.move(p.x, p.y);
    await page.mouse.click(p.x, p.y);
    await page.clock.runFor(100);
    await expect(page.locator("#placement-panel")).toBeVisible();
  }
  await page.keyboard.up("Shift");
  await page.keyboard.press("Escape");
  let state = await page.evaluate(() => SignalGame.snapshot());
  expect(state.units.filter((u) => u.kind === "barracks")).toHaveLength(
    oldCount + 2,
  );
  expect(state.economy.alloy).toBe(initial.economy.alloy - 240);
  await page.clock.runFor(100);
  await selectArmy(page);
  const b = state.units.find((u) => u.kind === "barracks" && !u.build),
    p = await point(page, b);
  await page.keyboard.down("Shift");
  await page.mouse.click(p.x, p.y);
  await page.keyboard.up("Shift");
  let selected = await page.evaluate(() => SignalGame.selection());
  expect(selected.ids).toContain(b.id);
  expect(selected.ids).toHaveLength(4);
  await page.keyboard.press("Control+4");
  await expect(page.locator('[data-control-group="4"]')).toBeVisible();
  const hero = state.units.find((u) => u.kind === "hero"),
    leader = await point(page, hero);
  await page.mouse.click(leader.x, leader.y, { button: "right" });
  state = await page.evaluate(() => SignalGame.snapshot());
  expect(state.units.find((u) => u.id === b.id).rally.followId).toBe(hero.id);
  expect(
    state.units
      .filter((u) => u.group === 1)
      .every((u) => u.order.followId === hero.id),
  ).toBe(true);
  await page.reload();
  await page.locator("#continue").click();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Digit4");
  expect((await page.evaluate(() => SignalGame.selection())).ids).toEqual(
    selected.ids,
  );
});

test("visible attack clicks show red feedback and production status is drawn for healthy unselected buildings", async ({
  page,
}) => {
  const state = fixture(),
    enemy = { ...structuredClone(E.make("frontier-9").units.find((u) => u.kind === "sentinel")), id: ++state.seq };
  state.units.push(enemy);
  Object.assign(enemy, { x: 1250, y: 2450, hp: E.C.sentinel.hp });
  E.refreshRecon(state);
  assertSave(state);
  await page.setViewportSize({ width: 1440, height: 900 });
  await boot(page, state);
  await selectArmy(page);
  const p = await point(page, enemy);
  await page.mouse.click(p.x, p.y, { button: "right" });
  const result = await page.evaluate(() => {
    const E = SignalEngine,
      s = E.restore(SignalGame.snapshot()),
      v = new SignalView(document.createElement("canvas"));
    let red = 0,
      bars = 0;
    const stroke = v.c.stroke.bind(v.c),
      rect = v.c.fillRect.bind(v.c);
    v.c.stroke = function (...a) {
      if (this.strokeStyle === "#ff7771") red++;
      return stroke(...a);
    };
    v.c.fillRect = function (x, y, w, h) {
      if (h === 4) bars++;
      return rect(x, y, w, h);
    };
    v.add([{ type: "order", x: 1250, y: 2450, intent: "attack" }], true);
    v.render(
      s,
      { mode: "playing", reduced: true, group: 0, selectionIds: [] },
      1 / 60,
    );
    return {
      red,
      bars,
      focused: s.units
        .filter((u) => u.group === 1)
        .every(
          (u) =>
            u.target?.id === s.units.find((u) => u.team && u.x === 1250)?.id,
        ),
    };
  });
  expect(result.focused).toBe(true);
  expect(result.red).toBeGreaterThan(0);
  expect(result.bars).toBeGreaterThanOrEqual(2);
});
