"use strict";
const { test, expect, webkit } = require("@playwright/test");
const { E, foundryField, train, place } = require("../tests/helpers/signal-frontier-armored.cjs");
const { build } = require("../tests/helpers/signal-frontier-construction.cjs");
const { deckCard } = require("./helpers/signal-frontier-selection.cjs");
test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader"] } });

for (const [width, height, renderer] of [[1440,900,"babylon"],[390,844,"babylon"],[844,390,"babylon"],[320,568,"canvas"]]) {
  test(`armored reserve, foundry queue and reload at ${width}×${height} in ${renderer}`, async ({ browser }, info) => {
    test.setTimeout(90000);
    const touch = width < 1000, alternate = renderer === "canvas" ? await webkit.launch({ args: [] }) : null,
      context = await (alternate || browser).newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch });
    try {
      const s = foundryField(), [car] = train(s, "armored"), factory = E.living(s, "foundry");
      place(car, 610, 2190); place(E.hero(s), 630, 2190);
      E.refreshRecon(s); expect(E.orderUnits(s, [car.id], 890, 2190)).toBe(true);
      E.step(s); expect(E.restore(s)).toBeTruthy();
      const page = await context.newPage(), errors = [];
      page.on("pageerror", e => errors.push(e.message));
      await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
      await page.clock.pauseAt(new Date("2030-01-01T00:00:01Z"));
      await page.addInitScript(({ save, groups }) => {
        if (sessionStorage.getItem("vehicle-seeded")) return;
        localStorage.setItem("signal-frontier-v1", JSON.stringify({ save, settings: { volume: 0, controlGroups: groups } }));
        sessionStorage.setItem("vehicle-seeded", "1");
      }, { save: s, groups: {1:[car.id], 2:[factory.id]} });
      const press = element => touch ? element.tap() : element.click(),
        group = n => touch ? page.locator('[data-control-group="'+n+'"]').tap() : page.keyboard.press(String(n)),
        snapshot = () => page.evaluate(() => SignalGame.snapshot());
      await page.goto("/games/signal-frontier/?renderer=" + renderer);
      await press(page.locator("#continue")); await page.clock.runFor(160);
      await page.waitForFunction(r => SignalGame.renderer().active === r, renderer);
      await group(1);
      await expect(page.locator(".roster-detail-head strong")).toHaveText("Бронемашина");
      await expect(page.locator(".role-note")).toBeInViewport();
      await expect(page.locator(".roster-stats")).toContainText("Огонь9 кл.");
      await press(page.locator("#tactical"));
      const frozen = (await snapshot()).units.find(u => u.id === car.id);
      expect(frozen.x).toBeGreaterThan(car.x);
      await page.clock.runFor(400);
      expect((await snapshot()).units.find(u => u.id === car.id)).toEqual(frozen);
      await page.screenshot({path: info.outputPath("armored-field.png")});

      await press(page.locator("#dock-shop")); await press(page.locator("#develop-tab-production"));
      await press(page.locator('[data-production-group="foundry"]')); await press(await deckCard(page, "develop-armored"));
      await page.reload(); await press(page.locator("#continue")); await page.clock.runFor(50); await group(2);
      const card = page.locator('[data-train="armored"]:visible'), siege = page.locator('[data-train="artillery"]:visible');
      await expect(card).toHaveAccessibleName(/Бронемашина.*130 сплава.*38 с.*2 снабжения/);
      await expect(siege).toHaveAttribute("aria-disabled","true");
      const bounds = await card.boundingBox();
      expect(bounds.width).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeGreaterThanOrEqual(44);
      const clips = () => card.evaluate(el => [...el.querySelectorAll("strong,.production-cost,.production-lock")]
        .filter(n => n.getClientRects().length && (n.scrollWidth > n.clientWidth+1 || n.scrollHeight > n.clientHeight+1))
        .map(n=>n.textContent));
      expect(await clips()).toEqual([]);
      await press(card); await press(card);
      expect(await card.boundingBox()).toEqual(bounds);
      const orders = (await snapshot()).units.find(u => u.id === factory.id).jobs;
      expect(orders.map(j => j.action)).toEqual(["armored","armored","armored"]);
      await expect(page.locator(".production-heading:visible")).toContainText("Очередь заполнена");
      await page.screenshot({path: info.outputPath("armored-foundry.png")});
      expect(errors).toEqual([]);
    } finally { await context.close(); if (alternate) await alternate.close(); }
  });
}

for (const touch of [false,true]) test(`issue a mine guard order with ${touch?"touch":"right click"} and resume it`, async ({browser})=>{
  const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1440,height:900},hasTouch:touch,isMobile:touch});
  try {
    const page=await context.newPage(),s=foundryField(),[car]=train(s,"armored"),
      mine=s.campaign.mines.find(m=>m.id==="west"), hero=E.hero(s);
    place(hero,mine.x,mine.y-90); E.refreshRecon(s); const post=build(s,"outpost",mine);
    place(hero,post.x,post.y+105); place(car,post.x+108,post.y+95); E.refreshRecon(s);
    expect(E.restore(s)).toBeTruthy();
    await page.clock.install({time:new Date("2030-01-01T00:00:00Z")});
    await page.clock.pauseAt(new Date("2030-01-01T00:00:01Z"));
    await page.addInitScript(({s,id})=>{
      if(sessionStorage.getItem("guard-seed"))return;
      localStorage.setItem("signal-frontier-v1",JSON.stringify({save:s,settings:{volume:0,controlGroups:{1:[id]}}}));
      sessionStorage.setItem("guard-seed","1");
    },{s,id:car.id});
    const select=()=>touch?page.locator('[data-control-group="1"]').tap():page.keyboard.press("1");
    await page.goto("/games/signal-frontier/?renderer=babylon"); await page.locator("#continue").click();
    await page.clock.runFor(130); await select();
    if(touch)await page.locator("#order-move").tap();
    const p=await page.evaluate(p=>SignalGame.screen(p.x,p.y),{x:post.x,y:post.y});
    if(touch)await page.touchscreen.tap(p.x,p.y-8); else await page.mouse.click(p.x,p.y-8,{button:"right"});
    const order=()=>page.evaluate(id=>SignalGame.snapshot().units.find(v=>v.id===id).order,car.id);
    expect((await order())?.post).toBe(post.id);
    await expect(page.locator(".roster-task")).toHaveText("Охраняет экстрактор");
    await page.reload(); await page.locator("#continue").click(); await page.clock.runFor(80); await select();
    expect((await order())?.post).toBe(post.id);
    await expect(page.locator(".roster-task")).toHaveText("Охраняет экстрактор");
  } finally { await context.close(); }
});
