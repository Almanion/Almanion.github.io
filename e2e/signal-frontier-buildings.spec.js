const { test, expect, chromium, webkit } = require("@playwright/test");
const rawStyles = require("node:fs").readFileSync(
  require("node:path").join(
    __dirname,
    "../game-source/signal-frontier/src/style.css",
  ),
  "utf8",
);
const E = require("../game-source/signal-frontier/src/engine");
function fixture(profile = "frontier-4") {
  const s = E.make(profile);
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((c) => (c.reserve = 0));
  let remaining = 3000;
  for (const m of s.campaign.mines) {
    const n = Math.min(remaining, m.remaining);
    m.remaining -= n;
    s.campaign.deposited += n;
    s.economy.alloy += n;
    remaining -= n;
  }
  const advance = (t) => {
    for (let i = 0; i < (t + 0.1) * 60; i++) E.step(s);
  };
  for (const a of ["barracks", "outpost", "network", "foundry"]) {
    if (a === "outpost") {
      const p = E.development.pads(s).find((p) => p.id === "west");
      Object.assign(E.hero(s), { x: p.x + 45, y: p.y });
    }
    expect(E.purchase(s, a, a === "outpost" ? "west" : undefined).allowed).toBe(
      true,
    );
    advance(E.development.items(s)[a].time);
  }
  E.living(s, "barracks").hp = 250;
  Object.assign(E.hero(s), { x: 400, y: 1600 });
  expect(E.restore(s)).not.toBeNull();
  return s;
}
async function boot(page, s) {
  await page.clock.install();
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem("building-fixture")) {
      localStorage.setItem(
        "signal-frontier-v1",
        JSON.stringify({ save: s, settings: { volume: 0, reduced: true } }),
      );
      sessionStorage.setItem("building-fixture", "1");
    }
  }, s);
  await page.goto("/games/signal-frontier/");
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.locator("#continue").click();
  await page.keyboard.press("Tab");
  await page.clock.runFor(100);
}
async function openBuilding(page, s) {
  await page.locator("#dock-shop").click();
  const b = E.living(s, "barracks");
  await page.locator(`[data-select="${b.id}"]`).click();
  return b;
}
for (const browserType of [chromium, webkit])
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [1440, 900],
  ])
    test(
      browserType.name() + " building drawer " + width + "x" + height,
      async () => {
        test.setTimeout(60000);
        const browser = await browserType.launch();
        const ctx = await browser.newContext({
          viewport: { width, height },
          hasTouch: width < 900,
          isMobile: width < 900,
        });
        const page = await ctx.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        try {
          const s = fixture();
          await boot(page, s);
          const b = await openBuilding(page, s);
          expect(await page.evaluate(() => SignalGame.mode())).toBe("tactical");
          await expect(page.locator("#develop-rifle")).toBeVisible();
          await expect(page.locator(".producer")).toContainText(
            "Домашняя база",
          );
          await page.locator("#develop-rifle").click();
          await page.locator("#develop-rifle").click();
          let state = await page.evaluate(() => SignalGame.snapshot());
          expect(E.living(state, "barracks").jobs.map((j) => j.action)).toEqual(
            ["rifle", "rifle"],
          );
          expect(state.economy.alloy).toBe(s.economy.alloy - 130);
          expect(state.t).toBe(s.t);
          await page.locator(".job-select").first().click();
          state = await page.evaluate(() => SignalGame.snapshot());
          expect(E.living(state, "barracks").jobs).toHaveLength(1);
          expect(state.economy.alloy).toBe(s.economy.alloy - 82);
          await page.locator("#building-tab-tech").click();
          await expect(page.locator("#develop-weapons")).toBeEnabled();
          await page.locator("#develop-weapons").click();
          state = await page.evaluate(() => SignalGame.snapshot());
          expect(E.living(state, "barracks").jobs.map((j) => j.action)).toEqual(
            ["rifle", "weapons"],
          );
          await page.locator("#develop-repair-" + b.id).click();
          state = await page.evaluate(() => SignalGame.snapshot());
          expect(E.living(state, "barracks").jobs).toHaveLength(3);
          await page.locator("#building-tab-troops").click();
          await expect(page.locator("#develop-rifle-reason")).toHaveText(
            "Очередь заполнена",
          );
          await page.clock.runFor(1000);
          expect((await page.evaluate(() => SignalGame.snapshot())).t).toBe(
            s.t,
          );
          const geometry = await page.locator("#command-dock").evaluate((el) => {
            const r = el.getBoundingClientRect();
            return {
              x: r.x,
              y: r.y,
              right: r.right,
              bottom: r.bottom,
              overflow: el.scrollWidth - el.clientWidth,
              modal: el.matches(":modal"),
            };
          });
          expect(geometry.modal).toBe(false);
          expect(geometry.y).toBeGreaterThan(height * 0.2);
          expect(geometry.x).toBeGreaterThanOrEqual(0);
          expect(geometry.right).toBeLessThanOrEqual(width);
          expect(geometry.bottom).toBeLessThanOrEqual(height);
          expect(geometry.overflow).toBeLessThanOrEqual(1);
          // Legacy saves retain a scrollable production card. Every queued
          // item must remain reachable inside the dock at each viewport size.
          for (const job of await page.locator(".job-select").all()) {
            await job.scrollIntoViewIfNeeded();
            const r = await job.boundingBox(), bounds = await page.locator("#development-panel").boundingBox();
            expect(r.y).toBeGreaterThanOrEqual(bounds.y - 1);
            expect(r.y + r.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1);
          }
          // Verify production CSS compression preserves the rendered controls.
          const differences = await page.evaluate((raw) => {
            const nodes = [...document.querySelectorAll("#hud *, #dialog *")];
            const capture = () =>
              nodes.map((el) => {
                const style = getComputedStyle(el);
                return JSON.stringify(
                  [...style]
                    .sort()
                    .map((key) => [key, style.getPropertyValue(key)]),
                );
              });
            const before = capture(),
              link = document.querySelector('link[rel="stylesheet"]');
            const style = document.createElement("style");
            style.textContent = raw;
            document.head.append(style);
            link.disabled = true;
            const after = capture();
            style.remove();
            link.disabled = false;
            return nodes.flatMap((el, i) =>
              before[i] === after[i] ? [] : [el.id || el.className],
            );
          }, rawStyles);
          expect(differences).toEqual([]);
          await page.screenshot({
            path: `test-results/building-${browserType.name()}-${width}.png`,
          });
          await page.locator("#dock-selection").click();
          expect(await page.evaluate(() => SignalGame.mode())).toBe("tactical");
          await page.reload();
          await page.locator("#continue").click();
          expect(
            E.living(
              await page.evaluate(() => SignalGame.snapshot()),
              "barracks",
            ).jobs.map((j) => j.action),
          ).toEqual(["rifle", "weapons", "repair"]);
          expect(errors).toEqual([]);
        } finally {
          await ctx.close();
          await browser.close();
        }
      },
    );
test("requirements navigate to the next step without buying anything", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, E.make("frontier-6"));
  await page.locator("#dock-shop").click();
  await page.locator("#develop-tab-production").click();
  const before = await page.evaluate(() => SignalGame.snapshot());
  await page.locator("#develop-foundry-reason").click();
  await expect(page.locator("#develop-tab-research")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.locator("#develop-network-reason").click();
  await expect(page.locator("#develop-barracks")).toBeVisible();
  expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(before);
});

for (const width of [320, 390])
  test("legacy queue stays accessible in the command dock " + width, async ({ browser }) => {
    const context = await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true});
    const page=await context.newPage();
    try {
      const s=fixture(), b=E.living(s,"barracks");
      E.purchase(s,"rifle"); E.purchase(s,"weapons");
      await boot(page,s); await openBuilding(page,s);
      await expect(page.locator(".job-select")).toHaveCount(2);
      const camera=await page.evaluate(()=>SignalGame.camera());
      await page.locator(".job-select").first().tap();
      const after=await page.evaluate(()=>SignalGame.snapshot());
      expect(E.living(after,"barracks").jobs.map(j=>j.action)).toEqual(["weapons"]);
      expect(after.t).toBe(s.t);
      await page.locator("[data-all-buildings]").tap();
      await page.locator("#develop-tab-economy").tap();
      await page.locator("#develop-tab-production").tap();
      await page.locator('[data-select="'+b.id+'"]').tap();
      await expect(page.locator(".job-select")).toHaveCount(1);
      expect(await page.evaluate(()=>SignalGame.camera())).toEqual(camera);
      expect(await page.evaluate(()=>SignalGame.snapshot())).toEqual(after);
    } finally {await context.close()}
  });

test("legacy production runs in combat and pauses only on a tactical command", async ({page})=>{
  test.setTimeout(60000);
  const s=fixture(), b=E.living(s,"barracks");
  await boot(page,s); await page.locator("#tactical").click();
  const p=await page.evaluate(b=>SignalGame.screen(b.x,b.y),b);
  await page.mouse.click(p.x,p.y-8);
  expect(await page.evaluate(()=>SignalGame.mode())).toBe("playing");
  await page.locator('#combat-production [data-train="rifle"]').click();
  await page.clock.runFor(300);
  const live=await page.evaluate(()=>SignalGame.snapshot());
  expect(live.t).toBeGreaterThan(s.t);
  expect(E.living(live,"barracks").jobs[0].remaining).toBeLessThan(24);
  await page.keyboard.press("Tab");
  const frozen=await page.evaluate(()=>SignalGame.snapshot());
  await page.clock.runFor(800);
  expect(await page.evaluate(()=>SignalGame.snapshot())).toEqual(frozen);
  await page.keyboard.press("Tab"); await page.clock.runFor(300);
  expect(E.living(await page.evaluate(()=>SignalGame.snapshot()),"barracks").jobs[0].remaining).toBeLessThan(E.living(frozen,"barracks").jobs[0].remaining);
});

test("a stale producer cannot charge or redirect a purchase to a different building", async ({
  page,
}) => {
  await page.goto("/games/signal-frontier/");
  const s = fixture();
  await page.evaluate((s) => {
    const dialog = document.createElement("dialog"),
      el = document.createElement("div");
    el.id = "building-harness";
    el.className = "command-dock";
    el.style.height = "80vh";
    el.style.overflow = "auto";
    dialog.dataset.panel = "development";
    dialog.classList.add("dock");
    dialog.style.cssText = "position:fixed;inset:5vh 5vw;margin:0;width:90vw;max-width:none;height:90vh;max-height:none;padding:0";
    el.style.cssText = "position:relative;inset:auto;width:100%;height:80vh;overflow:auto";
    dialog.append(el);
    document.body.append(dialog);
    dialog.showModal();
    const harness = (window.__buildingHarness = { state: s, purchases: 0 });
    harness.panel = new SignalDevelopmentPanel(el, {
      state: () => s,
      reason: (code) => code,
      buy: (action, site) => {
        harness.purchases++;
        SignalEngine.purchase(s, action, site);
        harness.panel.render();
      },
    });
    harness.panel.select(SignalEngine.living(s, "barracks").id);
    harness.panel.render();
  }, s);
  const panel = page.locator("#building-harness");
  await panel.locator("#develop-rifle").click();
  expect(await page.evaluate(() => __buildingHarness.purchases)).toBe(1);
  const balance = await page.evaluate(
    () => __buildingHarness.state.economy.alloy,
  );
  // The old control stays in the DOM while its producer dies and is replaced.
  await page.evaluate(() => {
    const s = __buildingHarness.state,
      b = SignalEngine.living(s, "barracks");
    b.hp = 0;
    s.units.push({ ...b, hp: 420, id: ++s.seq, jobs: [] });
  });
  await panel.locator("#develop-rifle").click();
  await expect(panel).toContainText("Здание уничтожено");
  expect(await page.evaluate(() => __buildingHarness.purchases)).toBe(1);
  expect(await page.evaluate(() => __buildingHarness.state.economy.alloy)).toBe(
    balance,
  );
});

for (const [width, height] of [
  [320, 568],
  [390, 844],
  [844, 390],
  [1440, 900],
])
  for (const selected of [false, true])
    test(`fixed purchase point accepts three orders ${width} selected=${selected}`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: width < 900,
        isMobile: width < 900,
      });
      const page = await context.newPage();
      try {
        const s = fixture();
        await boot(page, s);
        await page.locator("#dock-shop").click();
        if (selected)
          await page
            .locator(`[data-select="${E.living(s, "barracks").id}"]`)
            .click();
        const buy = page.locator("#develop-rifle");
        await buy.scrollIntoViewIfNeeded();
        const box = await buy.boundingBox();
        const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        for (let i = 0; i < 3; i++) {
          if (width < 900) await page.touchscreen.tap(point.x, point.y);
          else await page.mouse.click(point.x, point.y);
          const now = await buy.boundingBox();
          expect(Math.abs(now.x - box.x)).toBeLessThan(0.5);
          expect(Math.abs(now.y - box.y)).toBeLessThan(0.5);
          const state = await page.evaluate(() => SignalGame.snapshot());
          expect(E.living(state, "barracks").jobs.length).toBe(i + 1);
          expect(state.economy.alloy).toBe(s.economy.alloy - 65 * (i + 1));
        }
        const queue = await page.locator(".production-queue").boundingBox();
        expect(queue.y).toBeGreaterThanOrEqual(box.y + box.height);
      } finally {
        await context.close();
      }
    });
