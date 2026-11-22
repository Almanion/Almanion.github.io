"use strict";
const { test, expect, webkit } = require("@playwright/test");
const { E, barracksField, graduate } = require("../tests/helpers/signal-frontier-medic.cjs");
const { deckCard } = require("./helpers/signal-frontier-selection.cjs");
test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader"] } });

for (const [w,h,renderer] of [[1440,900,"babylon"],[390,844,"babylon"],[844,390,"babylon"],[320,568,"canvas"]]) {
  test(`grenadier mark, saved shot and barracks orders at ${w}×${h} in ${renderer}`, async ({ browser }, info) => {
    test.setTimeout(90000);
    const touch = w < 1000, other = renderer === "canvas" ? await webkit.launch() : null,
      context = await (other || browser).newContext({ viewport: { width: w, height: h }, isMobile: touch,
        hasTouch: touch, reducedMotion: "reduce" });
    try {
      const s = barracksField(), u = graduate(s,"grenadier"), v = E.living(s,"sentinel"), b = E.living(s,"barracks");
      Object.assign(E.hero(s), { x: 715, y: 2185 });
      Object.assign(u, { x: 640, y: 2200, cool: 0, path: [], order: null, think: 0 });
      Object.assign(v, { x: 775, y: 2200, cool: 4, path: [] });
      v.ai.home = { x: v.x, y: v.y }; E.refreshRecon(s); E.step(s);
      expect(u.grenadeAim).toBeTruthy(); expect(E.restore(s)).toBeTruthy();
      const page = await context.newPage(), errors = [];
      page.on("pageerror", e => errors.push(e.message));
      await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
      await page.clock.pauseAt(new Date("2030-01-01T00:00:01Z"));
      await page.addInitScript(({ save, groups }) => {
        if (sessionStorage.getItem("grenadier-seeded")) return;
        localStorage.setItem("signal-frontier-v1", JSON.stringify({ save, settings: { volume: 0, controlGroups: groups } }));
        sessionStorage.setItem("grenadier-seeded", "1");
      }, { save:s, groups:{1:[u.id],2:[b.id]} });
      const press = el => touch ? el.tap() : el.click(),
        group = n => touch ? page.locator('[data-control-group="'+n+'"]').tap() : page.keyboard.press(String(n)),
        state = () => page.evaluate(() => SignalGame.snapshot());
      await page.goto("/games/signal-frontier/?renderer=" + renderer);
      await press(page.locator("#continue")); await page.clock.runFor(80);
      await page.waitForFunction(r => SignalGame.renderer().active === r, renderer);
      await group(1);
      await expect(page.locator(".roster-detail-head strong")).toHaveText("Гранатомётчик");
      await expect(page.locator(".roster-task")).toHaveText("Целится");
      await expect(page.locator(".roster-stats")).toContainText("Радиус2 кл.");
      await expect(page.locator(".role-note")).toBeInViewport();
      const visibleMark = () => page.evaluate(id => {
        const snapshot = SignalGame.snapshot(), u = snapshot.units.find(v => v.id === id),
          round = snapshot.bullets.find(b => b.kind === "grenade");
        const mark = u.grenadeAim || (round && {x:round.tx,y:round.ty});
        if (!mark) return false;
        const p = SignalGame.screen(mark.x,mark.y), field = document.querySelector("#field"), box = field.getBoundingClientRect(),
          x = Math.round((p.x-box.left)*field.width/box.width), y = Math.round((p.y-box.top)*field.height/box.height),
          r = Math.ceil(21*field.width/box.width);
        if (x-r<0 || y-r<0 || x+r>=field.width || y+r>=field.height) return false;
        const pixels = field.getContext("2d").getImageData(x-r,y-r,2*r+1,2*r+1).data;
        let hits=0;
        for(let i=0;i<pixels.length;i+=4)
          if(Math.abs(pixels[i]-212)<6 && Math.abs(pixels[i+1]-232)<6 &&
            Math.abs(pixels[i+2]-211)<6 && pixels[i+3]>155) hits++;
        return hits>=3;
      }, u.id);
      expect(await visibleMark()).toBe(true);
      await page.screenshot({ path: info.outputPath("grenadier-field.png") });
      await press(page.locator("#tactical"));
      const aim = (await state()).units.find(v=>v.id===u.id).grenadeAim;
      await page.clock.runFor(650);
      expect((await state()).units.find(v=>v.id===u.id).grenadeAim).toEqual(aim);
      await press(page.locator("#tactical"));
      await page.clock.runFor(Math.ceil(aim.remaining*1000)+80);
      let snapshot = await state(); const shot=snapshot.bullets.find(b=>b.kind==="grenade");
      expect(shot).toBeTruthy(); expect([shot.tx,shot.ty]).toEqual([aim.x,aim.y]);
      expect(await visibleMark()).toBe(true);
      await press(page.locator("#tactical"));
      await press(page.locator("#dock-shop")); await press(page.locator("#develop-tab-production"));
      await press(page.locator('[data-production-group="barracks"]')); await press(await deckCard(page,"develop-grenadier"));
      await page.reload(); await press(page.locator("#continue")); await page.clock.runFor(34); await group(2);
      const card = page.locator('[data-train="grenadier"]:visible');
      await expect(card).toHaveAccessibleName(/Гранатомётчик.*65 сплава.*24 с.*Огонь по площади/);
      const bounds = await card.boundingBox(); expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(await card.locator("strong").evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
      const overflowing = await card.evaluate(el => {
        const box = el.getBoundingClientRect();
        return [...el.querySelectorAll("strong,.production-cost,.production-lock")].filter(node => {
          if (!node.getClientRects().length) return false;
          const r = node.getBoundingClientRect();
          return r.bottom > box.bottom || r.right > box.right+1 || node.scrollHeight > node.clientHeight+1;
        }).map(node=>node.textContent);
      });
      expect(overflowing).toEqual([]);
      await press(card); await press(card); expect(await card.boundingBox()).toEqual(bounds);
      snapshot = await state();
      expect(snapshot.units.find(v=>v.id===b.id).jobs.map(j=>j.action)).toEqual(["grenadier","grenadier","grenadier"]);
      expect(snapshot.bullets.some(b=>b.kind==="grenade")).toBe(true);
      await expect(page.locator(".production-heading:visible")).toContainText("Очередь заполнена");
      await page.screenshot({ path: info.outputPath("grenadier-barracks.png") });
      expect(errors).toEqual([]);
    } finally { await context.close(); if (other) await other.close(); }
  });
}
