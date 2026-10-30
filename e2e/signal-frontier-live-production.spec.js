"use strict";
const { test, expect, chromium, webkit } = require("@playwright/test"),
  { E, fund, build } = require("../tests/helpers/signal-frontier-construction.cjs");
let cached;
function fixture() {
  if (!cached) {
    const s = E.make("frontier-9");
    s.units.filter((u) => u.team && u.kind !== "citadel").forEach((u) => u.hp = 0);
    s.campaign.camps.forEach((c) => c.reserve = 0);
    fund(s, 2400); s.campaign.tier = 3; s.phase = 3; s.relay.online = true; s.relay.charge = 1;
    Object.assign(E.hero(s), { x: 1000, y: 2450 }); E.refreshRecon(s);
    build(s, "barracks", E.hero(s)); build(s, "barracks", E.hero(s)); build(s, "foundry", E.hero(s));
    build(s, "outpost", s.campaign.mines.find((m) => m.id === "west"));
    // Keep worker slots available and resource income stationary for exact transaction assertions.
    for (const u of s.units.filter((u) => u.kind === "drone")) { s.campaign.lostCargo += u.cargo || 0; u.cargo = 0; u.hp = 0; }
    E.step(s);
    if (!E.restore(s)) throw Error("Invalid live production fixture");
    cached = E.snapshot(s);
  }
  return structuredClone(cached);
}
async function boot(page, mutate) {
  const s = fixture(); if (mutate) mutate(s);
  const base = E.living(s, "base"), outpost = E.living(s, "outpost"), barracks = s.units.filter((u) => u.kind === "barracks"), foundry = E.living(s, "foundry"),
    army = s.units.filter((u) => u.group === 1 && u.hp > 0).map((u) => u.id);
  expect(E.restore(s)).not.toBeNull();
  await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-30T12:00:01Z"));
  await page.addInitScript(({ s, groups }) => localStorage.setItem("signal-frontier-v1", JSON.stringify({ save: s,
    settings: { volume: 0, reduced: true, controlGroups: groups } })),
    { s, groups: { 0: [outpost.id, ...army, ...barracks.map((u) => u.id)], 1: army, 4: [outpost.id], 5: [base.id], 6: [foundry.id], 7: [barracks[0].id], 8: barracks.map((u) => u.id), 9: [base.id, ...army, ...barracks.map((u) => u.id)] } });
  await page.goto("/games/signal-frontier/"); await page.locator("#continue").click(); await page.clock.runFor(200);
  return { s, base, outpost, barracks, foundry, army };
}
const snapshot = (page) => page.evaluate(() => SignalGame.snapshot()),
  train = (page, kind) => page.locator(`[data-train="${kind}"]`);
async function contentFits(page) {
  await expect(page.locator("#selection-content")).toBeVisible();
  expect(await page.locator("#selection-content").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [...el.querySelectorAll("button")].filter((b) => b.getClientRects().length).flatMap((b) => {
      const q = b.getBoundingClientRect(), clipped = q.x < r.x - 1 || q.right > r.right + 1 || q.y < r.y - 1 || q.bottom > r.bottom + 1,
        covered = !b.contains(document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2));
      return clipped || covered ? [{ label: b.textContent, clipped, covered, button: q.toJSON(), panel: r.toJSON() }] : [];
    });
  })).toEqual([]);
}
async function fits(page) {
  const result = await page.locator("#command-dock").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { outside: r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight,
      clipped: [...el.querySelectorAll("button")].filter((b) => b.getClientRects().length && !b.closest("[hidden], .control-groups, .actions"))
        .filter((b) => { const q = b.getBoundingClientRect(); return q.left < r.left - 1 || q.right > r.right + 1 || q.top < r.top - 1 || q.bottom > r.bottom + 1; })
        .map((b) => b.textContent),
      size: [...el.querySelectorAll("[data-train]")].filter((b) => b.getClientRects().length).map((b) => { const q = b.getBoundingClientRect(); return [q.width, q.height]; }) };
  });
  expect(result.outside).toBe(false); expect(result.clipped).toEqual([]);
  for (const [w, h] of result.size) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }
  expect(await page.locator("[data-train]").evaluateAll((buttons) => buttons.filter((b) => b.getClientRects().length).flatMap((b) => {
    const r = b.getBoundingClientRect(), blocked = !b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    return [...b.querySelectorAll("strong, .production-cost, .production-lock")].filter((t) => {
      const q = t.getBoundingClientRect(); return q.left < r.left || q.right > r.right || q.top < r.top || q.bottom > r.bottom;
    }).map((t) => t.textContent).concat(blocked ? ["Covered button"] : []);
  }))).toEqual([]);
}
test("live orders charge exact prices, preserve selection, advance and cancel without pausing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); const { barracks } = await boot(page);
  await page.keyboard.press("7"); const initial = await snapshot(page), items = E.development.items(initial);
  await expect(train(page, "rifle")).toContainText(String(items.rifle.cost));
  await train(page, "rifle").click(); await train(page, "scout").click();
  let s = await snapshot(page), u = s.units.find((u) => u.id === barracks[0].id);
  expect(u.jobs.map((j) => j.action)).toEqual(["rifle", "scout"]);
  expect(s.economy.alloy).toBe(initial.economy.alloy - items.rifle.cost - items.scout.cost);
  expect(await page.evaluate(() => SignalGame.selection().ids)).toEqual([u.id]);
  expect(await page.evaluate(() => SignalGame.mode())).toBe("playing");
  await expect(page.locator(".production-feedback")).toContainText("Дозорный · в очереди");
  await train(page, "rifle").focus(); await page.clock.runFor(600); await expect(train(page, "rifle")).toBeFocused();
  s = await snapshot(page); expect(s.units.find((v) => v.id === u.id).jobs[0].remaining).toBeLessThan(u.jobs[0].remaining);
  const alloy = s.economy.alloy; await page.locator("[data-cancel-job]").first().click();
  s = await snapshot(page); expect(s.economy.alloy).toBe(alloy + Math.floor(items.rifle.cost * .75));
  expect(s.units.find((v) => v.id === u.id).jobs.map((j) => j.action)).toEqual(["scout"]);
  await page.locator("#tactical").click(); await expect(page.locator("#combat-production")).toBeHidden();
  await page.locator("#tactical").click(); await expect(train(page, "rifle")).toBeVisible();
});
test("full queue is explained and cancellation immediately reopens its slot", async ({ page }) => {
  await boot(page); await page.keyboard.press("7");
  for (let i = 0; i < 3; i++) await train(page, "rifle").click();
  // Supply and queue can both be exhausted: the UI follows the engine's authoritative reason.
  await expect(train(page, "rifle")).toHaveAttribute("aria-disabled", "true");
  await expect(train(page, "rifle")).toContainText("Очередь заполнена");
  const s = await snapshot(page), b = E.living(s, "barracks");
  expect(b.jobs).toHaveLength(3);
  await page.locator("[data-cancel-job]").last().click();
  await expect(train(page, "rifle")).toHaveAttribute("aria-disabled", "false");
  await train(page, "scout").click(); expect(E.living(await snapshot(page), "barracks").jobs.at(-1).action).toBe("scout");
});
test("poor economy and technology requirements show specific reasons and never hide prices", async ({ page }) => {
  await boot(page, (s) => { s.economy.spent += s.economy.alloy; s.economy.alloy = 0; s.phase = 1; s.relay.online = false; s.relay.charge = 0; });
  await page.keyboard.press("7");
  await expect(train(page, "rifle")).toHaveAttribute("aria-disabled", "true");
  await expect(train(page, "rifle")).toContainText("Не хватает сплава");
  await expect(train(page, "rifle")).toContainText("65");
  await page.keyboard.press("6"); await expect(train(page, "artillery")).toContainText("Запустите узел связи");
  await expect(train(page, "artillery")).toContainText("300");
});
test("refunds unlock unaffordable orders and keyboard activation does not fire the hero", async ({ page }) => {
  const { barracks } = await boot(page, (s) => {
    const b = E.living(s, "barracks");
    E.purchase(s, "rifle", b.id); E.purchase(s, "rifle", b.id);
    s.economy.spent += s.economy.alloy; s.economy.alloy = 0;
  });
  await page.keyboard.press("7"); await expect(train(page, "rifle")).toContainText("Не хватает сплава");
  await page.locator("[data-cancel-job]").first().click();
  await expect(train(page, "rifle")).toHaveAttribute("aria-disabled", "true");
  await page.locator("[data-cancel-job]").first().click();
  await expect(train(page, "rifle")).toHaveAttribute("aria-disabled", "false");
  const before = await snapshot(page); await train(page, "rifle").focus(); await page.keyboard.press("Enter");
  const after = await snapshot(page);
  expect(after.shots).toBe(before.shots); expect(after.economy.alloy).toBe(before.economy.alloy - 65);
  expect(after.units.find((u) => u.id === barracks[0].id).jobs).toHaveLength(1);
  expect(E.restore(after)).not.toBeNull(); expect(await page.evaluate(() => SignalGame.mode())).toBe("playing");
});
test("a completed live order spawns its unit and clears the visible queue", async ({ page }) => {
  await boot(page, (s) => { const b = E.living(s, "barracks"); E.purchase(s, "rifle", b.id); b.jobs[0].remaining = .6; });
  await page.keyboard.press("7"); const before = await snapshot(page);
  await expect(page.locator("[data-cancel-job]")).toHaveCount(1);
  await page.clock.runFor(700);
  await expect(page.locator("[data-cancel-job]")).toHaveCount(0);
  const after = await snapshot(page);
  expect(after.units.filter((u) => u.kind === "rifle")).toHaveLength(before.units.filter((u) => u.kind === "rifle").length + 1);
  expect(E.restore(after)).not.toBeNull(); expect(await page.evaluate(() => SignalGame.mode())).toBe("playing");
});
test("each producer trains its own unit and mixed-group cycling targets exactly the displayed building", async ({ page }) => {
  const { base, outpost, barracks, foundry } = await boot(page);
  await page.keyboard.press("5"); await train(page, "drone").click();
  expect((await snapshot(page)).units.find((u) => u.id === base.id).jobs[0].action).toBe("drone");
  await page.keyboard.press("4"); await train(page, "drone").click();
  expect((await snapshot(page)).units.find((u) => u.id === outpost.id).jobs[0].action).toBe("drone");
  await page.keyboard.press("6"); await train(page, "artillery").click();
  expect((await snapshot(page)).units.find((u) => u.id === foundry.id).jobs[0].action).toBe("artillery");
  await page.locator("[data-cancel-job]").first().click();
  await page.keyboard.press("8"); await page.locator('[data-production-page="1"]').click();
  await train(page, "scout").click();
  const s = await snapshot(page);
  expect(s.units.find((u) => u.id === barracks[0].id).jobs).toHaveLength(0);
  expect(s.units.find((u) => u.id === barracks[1].id).jobs[0].action).toBe("scout");
  expect(await page.evaluate(() => SignalGame.selection().ids)).toEqual(barracks.map((u) => u.id));
  await page.keyboard.press("1"); await expect(page.locator("#combat-production")).toBeHidden();
  await page.keyboard.press("9"); await expect(train(page, "drone")).toBeVisible();
  await page.locator('[data-production-page="1"]').click(); await expect(train(page, "rifle")).toBeVisible();
});

test("idle console explains the hero and shop opens a paused menu without losing the army", async ({ page }) => {
  await boot(page);
  await expect(page.locator(".roster-detail-head strong")).toHaveText("Разведчик");
  await expect(page.locator(".roster-task")).toHaveText("Личное управление");
  await expect(page.locator("#order-move")).toBeHidden();
  await page.locator("#select-army").click();
  const ids = await page.evaluate(() => SignalGame.selection().ids), before = await snapshot(page);
  expect(ids.length).toBeGreaterThan(1);
  await page.locator("#dock-shop").click();
  expect(await page.evaluate(() => SignalGame.mode())).toBe("tactical");
  await expect(page.locator("#develop-tab-build")).toBeVisible();
  await expect(page.locator(".dock-orders")).toBeHidden();
  await page.clock.runFor(1200); expect(await snapshot(page)).toEqual(before);
  await page.locator("#dock-selection").click(); await contentFits(page);
  expect(await page.evaluate(() => SignalGame.selection().ids)).toEqual(ids);
});

for (const type of [chromium, webkit]) {
  test(`${type.name()} phone production tab keeps its queue, cancellation and selection across refreshes`, async ({}, info) => {
    const browser = await type.launch(), page = await browser.newPage({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true, baseURL: info.project.use.baseURL });
    try {
      const { barracks } = await boot(page); await page.locator('[data-control-group="7"]').tap();
      await expect(page.locator("#dock-production")).toHaveAttribute("aria-pressed", "true");
      await train(page, "rifle").tap(); await train(page, "scout").tap();
      const s = await snapshot(page);
      await expect(page.locator("[data-production-cancel]")).toHaveCount(2);
      await page.locator("[data-production-cancel]").first().tap();
      expect((await snapshot(page)).economy.alloy).toBe(s.economy.alloy + Math.floor(65 * .75));
      expect((await snapshot(page)).units.find((u) => u.id === barracks[0].id).jobs.map((j) => j.action)).toEqual(["scout"]);
      await page.locator("#dock-selection").tap(); await contentFits(page);
      await page.clock.runFor(900);
      await expect(page.locator("#dock-selection")).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("#combat-production")).toBeHidden();
      await page.locator("#dock-production").tap(); await fits(page);
      await expect(page.locator("[data-production-cancel]")).toHaveCount(1);
      expect(await page.evaluate(() => SignalGame.selection().ids)).toEqual([barracks[0].id]);
      expect(await page.evaluate(() => SignalGame.mode())).toBe("playing");
      await page.setViewportSize({ width: 844, height: 390 }); await page.clock.runFor(250);
      await expect(page.locator("#dock-production")).toBeHidden(); await contentFits(page); await fits(page);
    } finally { await browser.close(); }
  });
  for (const [width, height] of [[1440, 900], [320, 568], [844, 390]])
    test(`${type.name()} mixed selection switches between members, building queue and care at ${width}x${height}`, async ({}, info) => {
      const browser = await type.launch(), page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 760 || height < 500, isMobile: width < 760 || height < 500, baseURL: info.project.use.baseURL });
      try {
        await boot(page); await page.locator('[data-control-group="0"]').click();
        const ids = await page.evaluate(() => SignalGame.selection().ids);
        if (await page.locator("#dock-production").isVisible()) await page.locator("#dock-selection").click();
        await contentFits(page);
        await page.locator('[data-roster-view="building"]').click(); await contentFits(page);
        while (!await page.locator('[data-care-view]').count()) await page.locator('[data-producer-page="1"]').click();
        await page.locator('[data-care-view]').click(); await contentFits(page);
        await page.screenshot({ path: info.outputPath("mixed-care.png") });
        await page.clock.runFor(250); await contentFits(page);
        await page.locator('[data-roster-view="members"]').click(); await contentFits(page);
        expect(await page.evaluate(() => SignalGame.selection().ids)).toEqual(ids);
      } finally { await browser.close(); }
    });
}
for (const type of [chromium, webkit]) for (const [width, height] of [[1440, 900], [800, 600], [390, 844], [320, 568], [844, 390]])
  test(`${type.name()} live production and queue fit ${width}x${height}`, async ({}, info) => {
    const browser = await type.launch(), mobile = width < 760 || height < 500,
      page = await browser.newPage({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile, baseURL: info.project.use.baseURL }), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await boot(page); await page.locator('[data-control-group="7"]').click();
      if (mobile) await train(page, "rifle").tap(); else await train(page, "rifle").click();
      await page.screenshot({ path: info.outputPath("production.png") }); await fits(page);
      expect(await page.evaluate(() => SignalGame.mode())).toBe("playing");
      await page.locator('[data-control-group="9"]').click();
      await page.locator('[data-production-page="1"]').click(); await fits(page);
      await page.screenshot({ path: info.outputPath("mixed.png") });
      await page.locator('[data-control-group="6"]').click(); await fits(page);
      await page.locator('[data-control-group="5"]').click(); await fits(page);
      await page.locator('[data-control-group="4"]').click(); await fits(page);
      await page.screenshot({ path: info.outputPath("extractor.png") });
      if (await page.locator("#dock-production").isVisible()) await page.locator("#dock-selection").click();
      await page.locator('[data-care-view]').click(); await fits(page);
      await page.locator('[data-control-group="7"]').click();
      await train(page, "rifle").click(); await train(page, "rifle").click();
      await expect(train(page, "rifle")).toContainText("Очередь заполнена"); await fits(page);
      await page.screenshot({ path: info.outputPath("full.png") });
      expect(errors).toEqual([]);
    } finally { await browser.close(); }
  });
