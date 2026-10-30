"use strict";
const { test, expect, chromium, webkit } = require("@playwright/test"),
  { E, fund, build } = require("../tests/helpers/signal-frontier-construction.cjs"),
  { scene, frames } = require("../tests/helpers/signal-frontier-balance.cjs");
let cached;
function fixture() {
  if (!cached) {
    const s = E.make("frontier-9");
    for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
    s.campaign.camps.forEach((c) => c.reserve = 0);
    fund(s, 1500);
    Object.assign(E.hero(s), { x: 1000, y: 2450 });
    E.refreshRecon(s);
    build(s, "barracks", E.hero(s));
    if (!E.restore(s)) throw Error("Invalid control group fixture");
    cached = E.snapshot(s);
  }
  return structuredClone(cached);
}
async function boot(page, state = fixture(), groups = {}) {
  await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-30T12:00:01Z"));
  await page.addInitScript(({ state, groups }) => {
    if (sessionStorage.getItem("groups-fixture")) return;
    sessionStorage.setItem("groups-fixture", "1");
    localStorage.setItem("signal-frontier-v1", JSON.stringify({ save: state,
      settings: { reduced: true, volume: 0, controlGroups: groups } }));
  }, { state, groups });
  await page.goto("/games/signal-frontier/");
  await page.locator("#continue").click();
  await page.locator("#tactical").click();
  await page.clock.runFor(250);
}
const selection = (page) => page.evaluate(() => SignalGame.selection());
async function point(page, unit) {
  return page.evaluate((u) => {
    const p = SignalGame.screen(u.x, u.y);
    return { x: p.x, y: p.y - 8 * SignalGame.camera().scale };
  }, unit);
}
async function choose(page, unit, add = false) {
  const p = await point(page, unit);
  if (add) await page.keyboard.down("Shift");
  await page.mouse.click(p.x, p.y);
  if (add) await page.keyboard.up("Shift");
}
const tab = (page, n) => page.locator(`[data-control-group="${n}"]`);

test("all ten physical number keys assign and recall groups during battle without pausing or moving the camera", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await boot(page);
  await page.locator("#select-army").click();
  const ids = (await selection(page)).ids;
  expect(ids).toHaveLength(3);
  for (const n of [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]) {
    await page.keyboard.press("Control+Digit" + n);
    await expect(tab(page, n)).toBeVisible();
    await expect(tab(page, n).locator("small")).toHaveText("3");
  }
  expect(await page.locator("#control-groups button").evaluateAll((bs) => bs.map((b) => b.dataset.controlGroup)))
    .toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]);
  await page.keyboard.press("Escape");
  expect((await selection(page)).ids).toEqual([]);
  await page.locator("#tactical").click();
  await page.clock.runFor(250);
  const before = await page.evaluate(() => ({ s: SignalGame.snapshot(), c: SignalGame.camera() }));
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]) {
    await page.keyboard.press("Digit" + n);
    expect((await selection(page)).ids).toEqual(ids);
    await expect(tab(page, n)).toHaveAttribute("aria-pressed", "true");
  }
  expect(await page.evaluate(() => SignalGame.mode())).toBe("playing");
  expect(await page.evaluate(() => SignalGame.camera())).toEqual(before.c);
  expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(before.s);
  await page.clock.runFor(250);
  expect((await page.evaluate(() => SignalGame.snapshot())).t).toBeGreaterThan(before.s.t);
});

test("a building can be assigned from its production panel, combined with troops and followed as a mixed group", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const s = fixture(), base = E.living(s, "base"), barracks = E.living(s, "barracks"), hero = E.hero(s);
  await boot(page, s);
  await page.locator("#select-army").click();
  const rifles = (await selection(page)).ids;
  await page.keyboard.press("Control+7");
  await choose(page, base);
  await expect(page.locator("#development-content")).toBeVisible();
  await page.keyboard.press("Control+0");
  expect((await selection(page)).groups[0]).toEqual([base.id]);
  await page.keyboard.press("Digit0");
  await expect(page.locator("#dialog")).not.toBeVisible();
  await choose(page, barracks, true);
  await page.keyboard.press("Control+2");
  expect((await selection(page)).groups[2]).toEqual([base.id, barracks.id]);
  await page.keyboard.press("Shift+7");
  expect((await selection(page)).ids).toEqual([base.id, barracks.id, ...rifles].sort((a, b) => a - b));
  await page.keyboard.press("Control+Shift+0");
  await page.keyboard.press("Control+Shift+0");
  const mixed = (await selection(page)).ids;
  expect((await selection(page)).groups[0]).toEqual(mixed);
  await expect(tab(page, 0).locator("small")).toHaveText("5");
  await page.keyboard.press("2");
  expect((await selection(page)).ids).toEqual([base.id, barracks.id]);
  await expect(tab(page, 2)).toHaveAttribute("aria-pressed", "true");
  await expect(tab(page, 0)).toHaveAttribute("aria-pressed", "false");
  await tab(page, 0).click();
  const leader = await point(page, hero);
  await page.mouse.click(leader.x, leader.y, { button: "right" });
  const after = await page.evaluate(() => SignalGame.snapshot());
  for (const id of mixed) {
    const u = after.units.find((u) => u.id === id);
    expect((E.C[u.kind].speed ? u.order : u.rally)?.followId).toBe(hero.id);
  }
  expect(E.restore(after)).not.toBeNull();
  await page.reload();
  await page.locator("#continue").click();
  await page.keyboard.press("0");
  expect((await selection(page)).ids).toEqual(mixed);
  await expect(tab(page, 0)).toBeVisible();
  await page.reload();
  await page.locator("#continue").click();
  await page.keyboard.press("0");
  expect((await selection(page)).ids).toEqual(mixed);
  expect((await selection(page)).groups[2]).toEqual([base.id, barracks.id]);
});

test("assignments validate members, deduplicate ids, replace and clear slots, and reset in a new operation", async ({ page }) => {
  const s = fixture(), rifles = s.units.filter((u) => u.kind === "rifle" && !u.team && u.hp > 0),
    enemy = s.units.find((u) => u.team && u.hp > 0), dead = s.units.find((u) => u.hp <= 0);
  await boot(page, s, { 0: [rifles[0].id, rifles[0].id, -1, 0, 1.5, enemy.id, dead.id, 999999],
    3: [enemy.id], 7: [rifles[1].id], 10: [rifles[0].id] });
  await expect(tab(page, 0).locator("small")).toHaveText("1");
  await expect(tab(page, 3)).toHaveCount(0);
  await expect(tab(page, 10)).toHaveCount(0);
  await page.keyboard.press("0");
  expect((await selection(page)).ids).toEqual([rifles[0].id]);
  await page.keyboard.press("Control+7");
  expect((await selection(page)).groups[7]).toEqual([rifles[0].id]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+0");
  await expect(tab(page, 0)).toHaveCount(0);
  await page.keyboard.press("Control+Shift+7");
  expect((await selection(page)).groups[7]).toEqual([rifles[0].id]);
  await page.locator("#menu-button").click();
  await page.locator("#restart").click();
  expect((await selection(page)).groups).toEqual({});
  await expect(page.locator("#control-groups")).not.toBeVisible();
});

test("live casualties update counts and remove an empty group, without adding replacement troops", async ({ page }) => {
  const { s, target } = scene("sentinel", 400), base = E.living(s, "base");
  target.hp = 1;
  const probe = E.restore(E.snapshot(s));
  frames(probe, 360);
  expect(probe.units.find((u) => u.id === target.id).hp).toBeLessThanOrEqual(0);
  await boot(page, s, { 3: [target.id, base.id], 4: [target.id] });
  await expect(tab(page, 3).locator("small")).toHaveText("2");
  await page.locator("#tactical").click();
  await tab(page, 3).focus();
  await page.clock.runFor(6000);
  await expect(tab(page, 3).locator("small")).toHaveText("1");
  await expect(tab(page, 3)).toBeFocused();
  await expect(tab(page, 4)).toHaveCount(0);
  await page.keyboard.press("3");
  expect((await selection(page)).ids).toEqual([base.id]);
});

test("numpad and Meta shortcuts work while text entry, modifiers, menus and placement remain isolated", async ({ page }) => {
  await boot(page);
  await page.locator("#select-army").click();
  await page.keyboard.press("Meta+Digit0");
  const initial = await selection(page);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Numpad0");
  expect((await selection(page)).ids).toEqual(initial.ids);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Alt+0");
  expect((await selection(page)).ids).toEqual([]);
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.id = "qa-entry"; input.style.position = "fixed"; input.style.zIndex = "100";
    document.body.append(input); input.focus();
  });
  await page.keyboard.press("0");
  await page.keyboard.press("Control+7");
  expect((await selection(page)).ids).toEqual([]);
  expect((await selection(page)).groups).toEqual(initial.groups);
  await page.evaluate(() => document.getElementById("qa-entry").remove());
  await page.locator("#menu-button").click();
  await page.keyboard.press("0");
  expect((await selection(page)).ids).toEqual([]);
  await page.locator("#resume").click();
  await page.locator("#dock-shop").click();
  await page.locator("#develop-tab-build").click();
  await page.locator("#develop-barracks").click();
  await page.keyboard.press("0");
  await page.keyboard.press("Control+0");
  await expect(page.locator("#placement-panel")).toBeVisible();
  expect((await selection(page)).ids).toEqual([]);
  await page.keyboard.press("Escape");
});

test("loading another operation cannot reassign a group to unrelated objects with the same ids", async ({ page }) => {
  await boot(page);
  await page.locator("#select-army").click();
  await page.keyboard.press("Control+0");
  expect((await selection(page)).groups[0]).toHaveLength(3);
  const other = await page.context().newPage(), replacement = E.snapshot(E.make("frontier-8"));
  try {
    await other.goto("/games/signal-frontier/");
    await other.evaluate((save) => localStorage.setItem("signal-frontier-v1", JSON.stringify({ save,
      settings: { volume: 0, reduced: true } })), replacement);
    await page.bringToFront();
    await expect(page.locator("#storage-content")).toBeVisible();
    await page.locator("#storage-load").click();
    expect((await selection(page)).groups).toEqual({});
    expect((await page.evaluate(() => SignalGame.snapshot())).campaign.id).toBe("frontier-8");
    await expect(page.locator("#control-groups")).not.toBeVisible();
  } finally { await other.close(); }
});

test("ten groups fit a narrow desktop window without covering the minimap", async ({ page }, info) => {
  await page.setViewportSize({ width: 800, height: 600 });
  const s = fixture(), ids = s.units.filter((u) => u.kind === "rifle" && u.hp > 0).map((u) => u.id),
    groups = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => [n, ids]));
  await boot(page, s, groups);
  await tab(page, 0).click();
  const bounds = await page.evaluate(() => {
    const r = document.querySelector('[data-control-group="0"]').getBoundingClientRect(),
      nav = document.getElementById("control-groups").getBoundingClientRect(),
      map = document.getElementById("minimap-panel").getBoundingClientRect(),
      panel = document.getElementById("command-dock").getBoundingClientRect();
    return { left: r.left, right: r.right, navLeft: nav.left, navRight: nav.right, mapRight: map.right,
      panelLeft: panel.left, panelRight: panel.right, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(bounds.navLeft);
  expect(bounds.right).toBeLessThanOrEqual(bounds.navRight + 1);
  expect(bounds.left).toBeGreaterThan(bounds.mapRight);
  expect(bounds.panelLeft).toBeGreaterThan(bounds.mapRight);
  expect(bounds.panelRight).toBeLessThanOrEqual(800);
  expect(bounds.overflow).toBe(false);
  expect((await selection(page)).ids).toEqual(ids);
  await page.screenshot({ path: info.outputPath("narrow-desktop-groups.png") });
});

test("assigned groups leave an idle tactical map asleep and selection wakes it without advancing combat", async ({ page }) => {
  await page.addInitScript(() => {
    window.groupFrames = 0;
    Object.defineProperty(window, "SignalView", { configurable: true, set(View) {
      const render = View.prototype.render;
      View.prototype.render = function (...args) { window.groupFrames++; return render.apply(this, args); };
      Object.defineProperty(window, "SignalView", { value: View, writable: true });
    } });
  });
  const s = fixture(), rifle = s.units.find((u) => u.kind === "rifle");
  await boot(page, s, { 0: [rifle.id] });
  await page.mouse.move(500, 300);
  await page.clock.runFor(4000);
  const before = await page.evaluate(() => ({ frames: groupFrames, state: SignalGame.snapshot() }));
  await page.clock.runFor(3000);
  expect(await page.evaluate(() => groupFrames)).toBe(before.frames);
  await page.keyboard.press("0");
  await page.clock.runFor(250);
  expect((await selection(page)).ids).toEqual([rifle.id]);
  expect(await page.evaluate(() => groupFrames)).toBeGreaterThan(before.frames);
  expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(before.state);
  await page.clock.runFor(4000);
  const settled = await page.evaluate(() => groupFrames);
  await page.clock.runFor(3000);
  expect(await page.evaluate(() => groupFrames)).toBe(settled);
});

for (const type of [chromium, webkit])
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568], [844, 390]])
    test(`${type.name()} ten tabs stay usable beside the minimap and combat controls ${width}x${height}`, async ({}, info) => {
      test.setTimeout(90000);
      const browser = await type.launch(), context = await browser.newContext({ viewport: { width, height },
        hasTouch: width < 900, isMobile: width < 900, deviceScaleFactor: width < 900 ? 2 : 1 }),
        page = await context.newPage(), s = fixture(), ids = s.units.filter((u) => u.kind === "rifle" && u.hp > 0).map((u) => u.id),
        groups = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n, i) => [n, ids.slice(0, i % 3 + 1)])), errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      try {
        await boot(page, s, groups);
        await expect(page.locator("#control-groups button")).toHaveCount(10);
        for (const mode of ["tactical", "playing"]) {
          if (mode === "playing") await page.locator("#tactical").click();
          await page.clock.runFor(200);
          if (width < 900) await tab(page, 0).tap();
          else await tab(page, 0).click();
          expect((await selection(page)).ids).toEqual(groups[0]);
          await expect(tab(page, 0)).toHaveAttribute("aria-pressed", "true");
          await expect(tab(page, 0).locator("kbd")).toBeVisible();
          const layout = await page.evaluate(() => {
            const nav = document.getElementById("control-groups"), r = nav.getBoundingClientRect(),
              active = nav.querySelector('[data-control-group="0"]'), a = active.getBoundingClientRect(),
              overlaps = (b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            return { overflow: document.documentElement.scrollWidth > innerWidth, nav: { left: r.left, right: r.right, bottom: r.bottom },
              active: { left: a.left, right: a.right, height: a.height }, blocked: ["minimap-panel", "reload", "dash", "command-dock"]
                .filter((id) => { const el = document.getElementById(id); return el.getClientRects().length && overlaps(el.getBoundingClientRect()); }) };
          });
          expect(layout.overflow).toBe(false);
          expect(layout.nav.left).toBeGreaterThanOrEqual(0);
          expect(layout.nav.right).toBeLessThanOrEqual(width);
          expect(layout.nav.bottom).toBeLessThanOrEqual(height);
          expect(layout.active.left).toBeGreaterThanOrEqual(layout.nav.left - 1);
          expect(layout.active.right).toBeLessThanOrEqual(layout.nav.right + 1);
          expect(layout.active.height).toBeGreaterThanOrEqual(44);
          expect(layout.blocked).toEqual([]);
          await page.screenshot({ path: info.outputPath(mode + "-groups.png") });
        }
        expect(errors).toEqual([]);
      } finally { await browser.close(); }
    });
