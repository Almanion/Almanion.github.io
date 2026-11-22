"use strict";
const { test, expect, webkit } = require("@playwright/test");
const { E, barracksField, graduate, frames } = require("../tests/helpers/signal-frontier-medic.cjs");
const { deckCard } = require("./helpers/signal-frontier-selection.cjs");
test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader"] } });

for (const [w, h, renderer] of [[1440, 900, "babylon"], [390, 844, "babylon"], [844, 390, "babylon"], [320, 568, "canvas"]]) {
  test(`shield infantry orders, readable training cards and paused save at ${w}×${h} in ${renderer}`, async ({ browser }, info) => {
    test.setTimeout(90000);
    const touch = w !== 1440, other = renderer === "canvas" ? await webkit.launch() : null,
      context = await (other || browser).newContext({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch });
    try {
      const page = await context.newPage(), errors = [], s = barracksField(), shield = graduate(s, "shield"),
        foe = E.living(s, "sentinel"), origin = E.hero(s), b = E.living(s, "barracks");
      Object.assign(origin, { x: 470, y: 2200, angle: 0 });
      Object.assign(shield, { x: 570, y: 2200, path: [], order: null, cool: 3 });
      Object.assign(foe, { x: 820, y: 2200, path: [], cool: 4 });
      foe.ai.home = { x: foe.x, y: foe.y };
      E.refreshRecon(s); frames(s, 45); E.refreshRecon(s);
      expect(shield.guard.lift).toBe(1); expect(E.restore(s)).toBeTruthy();
      page.on("pageerror", e => errors.push(e.message));
      await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
      await page.clock.pauseAt(new Date("2030-01-01T00:00:01Z"));
      await page.addInitScript(({ save, groups }) => {
        if (sessionStorage.getItem("shield-seeded")) return;
        localStorage.setItem("signal-frontier-v1", JSON.stringify({ save, settings: { volume: 0, controlGroups: groups } }));
        sessionStorage.setItem("shield-seeded", "1");
      }, { save: s, groups: { 1: [shield.id], 2: [b.id] } });
      const press = el => touch ? el.tap() : el.click(),
        group = n => touch ? page.locator('[data-control-group="' + n + '"]').tap() : page.keyboard.press(String(n));
      await page.goto("/games/signal-frontier/?renderer=" + renderer);
      await press(page.locator("#continue")); await page.clock.runFor(80);
      await page.waitForFunction(r => SignalGame.renderer().active === r, renderer);
      await group(1); await expect(page.locator(".roster-detail-head strong")).toHaveText("Щитоносец");
      expect(await page.locator(".roster-detail-head strong").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await expect(page.locator(".roster-task")).toHaveText("Держит щит");
      await expect(page.locator(".roster-stats")).toContainText("120°");
      await expect(page.locator(".role-note")).toBeInViewport();
      await page.clock.runFor(60);
      const sectorVisible = await page.evaluate(id => {
        const u = SignalGame.snapshot().units.find(unit => unit.id === id), radius = SignalEngine.C.shield.r + 13;
        const p = SignalGame.screen(u.x + radius * Math.cos(u.guard.angle), u.y + radius * Math.sin(u.guard.angle));
        const field = document.querySelector("#field"), box = field.getBoundingClientRect();
        const x = Math.round((p.x - box.left) * field.width / box.width), y = Math.round((p.y - box.top) * field.height / box.height);
        const rgba = field.getContext("2d").getImageData(x - 4, y - 4, 9, 9).data;
        for (let i = 0; i < rgba.length; i += 4) {
          if (Math.abs(rgba[i] - 185) < 5 && Math.abs(rgba[i + 1] - 237) < 5 &&
              Math.abs(rgba[i + 2] - 210) < 5 && rgba[i + 3] > 150) return true;
        }
        return false;
      }, shield.id);
      expect(sectorVisible).toBe(true);
      await page.screenshot({ path: info.outputPath("shield-field.png") });
      await group(2);
      const cards = page.locator("[data-train]:visible"), shieldCard = page.locator('[data-train="shield"]:visible');
      await expect(cards).toHaveCount(5);
      await expect(shieldCard).toHaveAccessibleName(/Щитоносец.*65 сплава.*24 с.*Защита спереди/);
      const bounds = () => cards.evaluateAll(nodes => nodes.map(el => {
        const b = el.getBoundingClientRect(), name = el.querySelector("strong");
        return { x: b.x, y: b.y, w: b.width, h: b.height, textFits: name.scrollWidth <= name.clientWidth + 1 };
      }));
      const before = await bounds();
      for (const box of before) {
        expect(box.w).toBeGreaterThanOrEqual(44); expect(box.h).toBeGreaterThanOrEqual(44);
        expect(box.x + box.w).toBeLessThanOrEqual(w); expect(box.y + box.h).toBeLessThanOrEqual(h);
        expect(box.textFits).toBe(true);
      }
      await press(shieldCard); await press(shieldCard);
      expect(await bounds()).toEqual(before);
      await page.screenshot({ path: info.outputPath("shield-barracks.png") });
      await press(page.locator("#tactical"));
      const paused = await page.evaluate(() => SignalGame.snapshot());
      await press(page.locator("#dock-shop")); await press(page.locator("#develop-tab-production"));
      await press(page.locator('[data-production-group="barracks"]')); await press(await deckCard(page, "develop-shield"));
      await page.clock.runFor(1000);
      const stored = await page.evaluate(() => SignalGame.snapshot());
      expect(stored.t).toBe(paused.t);
      expect(stored.units.find(u => u.id === shield.id).guard).toEqual(paused.units.find(u => u.id === shield.id).guard);
      await page.reload(); await press(page.locator("#continue"));
      expect(await page.evaluate(id => SignalGame.snapshot().units.find(u => u.id === id).jobs.map(j => j.action), b.id))
        .toEqual(["shield", "shield", "shield"]);
      expect(errors).toEqual([]);
    } finally { await context.close(); if (other) await other.close(); }
  });
}
