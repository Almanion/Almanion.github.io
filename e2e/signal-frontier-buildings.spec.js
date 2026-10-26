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
  await page.locator("#supply-open").click();
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
          await expect(page.locator(".job-detail")).toContainText("Возврат 48");
          await page.getByRole("button", { name: /Отменить: Боец/ }).click();
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
          const geometry = await page.locator("#dialog").evaluate((el) => {
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
          const queueBox = await page
            .locator(".production-queue")
            .boundingBox();
          const bodyBox = await page
            .locator("#development-panel")
            .boundingBox();
          expect(queueBox.y + queueBox.height).toBeLessThanOrEqual(
            bodyBox.y + bodyBox.height + 1,
          );
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
          await page.locator("#development-back").click();
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
  await boot(page, E.make());
  await page.locator("#supply-open").click();
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
  test(
    "touch compact queue and isolated scrolling " + width,
    async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: width === 320 ? 568 : 844 },
        hasTouch: true,
        isMobile: true,
      });
      const page = await context.newPage();
      try {
        const s = fixture(),
          b = E.living(s, "barracks");
        E.purchase(s, "rifle");
        E.purchase(s, "weapons");
        await boot(page, s);
        await page.locator("#supply-open").tap();
        await page.getByRole("button", { name: "Показать: Казармы" }).tap();
        await expect(page.locator("#dialog")).not.toBeVisible();
        await page.clock.runFor(400);
        await page.clock.resume(); // Native scroll gestures use the real clock; the game remains paused.
        const p = await page.evaluate((b) => SignalGame.screen(b.x, b.y), b);
        expect(
          await page.evaluate(
            (p) => document.elementFromPoint(p.x, p.y - 8)?.id,
            p,
          ),
        ).toBe("field");
        await page.touchscreen.tap(p.x, p.y - 8);
        await expect(page.locator("#development-size")).toHaveAttribute(
          "aria-expanded",
          "false",
        );
        await expect(page.locator("#develop-rifle")).toBeVisible();
        const queue = await page.locator(".production-queue").boundingBox(),
          panel = await page.locator("#development-panel").boundingBox();
        expect(queue.y).toBeGreaterThanOrEqual(panel.y);
        expect(queue.y + queue.height).toBeLessThanOrEqual(
          panel.y + panel.height,
        );
        const compact = await page.locator("#dialog").boundingBox();
        await page.screenshot({
          path: `test-results/building-compact-${width}.png`,
        });
        await page.locator("#development-size").tap();
        expect(
          (await page.locator("#dialog").boundingBox()).height,
        ).toBeGreaterThan(compact.height);
        await page.locator("[data-all-buildings]").tap();
        await page.locator("#develop-tab-economy").tap();
        const r = await page.locator("#development-panel").boundingBox();
        const beforeScroll = await page.evaluate(() => SignalGame.snapshot());
        const camera = await page.evaluate(() => SignalGame.camera());
        const cdp = await context.newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ id: 1, x: r.x + 80, y: r.y + r.height - 20 }],
        });
        for (let i = 1; i <= 8; i++) {
          await new Promise((resolve) => setTimeout(resolve, 40));
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [
              { id: 1, x: r.x + 80, y: r.y + r.height - 20 - i * 15 },
            ],
          });
        }
        // Hold still before release so this is a scroll, not a high-velocity fling.
        await new Promise((resolve) => setTimeout(resolve, 200));
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await expect
          .poll(() =>
            page.locator("#development-panel").evaluate((el) => el.scrollTop),
          )
          .toBeGreaterThan(0);
        expect(await page.evaluate(() => SignalGame.camera())).toEqual(camera);
        expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(
          beforeScroll,
        );
        await page.locator("#develop-tab-production").tap();
        await page.locator(`[data-select="${b.id}"]`).tap();
        await page.locator("#development-size").tap();
        await expect(page.locator("#development-size")).toHaveAttribute(
          "aria-expanded",
          "false",
        );
        await page.locator("#close-dialog").tap();
        expect(await page.evaluate(() => SignalGame.mode())).toBe("tactical");
      } finally {
        await context.close();
      }
    },
  );
test("building pauses combat, keyboard navigation is safe, only resume advances production", async ({
  page,
}) => {
  const s = fixture(),
    b = E.living(s, "barracks");
  await boot(page, s);
  await page.locator("#tactical").click();
  const p = await page.evaluate((b) => SignalGame.screen(b.x, b.y), b);
  await page.mouse.click(p.x, p.y - 8);
  expect(await page.evaluate(() => SignalGame.mode())).toBe("tactical");
  await page.locator("#develop-rifle").click();
  await page.locator("#develop-rifle").focus();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => SignalGame.mode())).toBe("tactical");
  expect(
    await page
      .locator("#develop-rifle")
      .evaluate((el) => document.activeElement === el),
  ).toBe(false);
  await page.keyboard.press("Escape");
  await page.clock.runFor(2000);
  expect((await page.evaluate(() => SignalGame.snapshot())).t).toBe(s.t);
  await page.locator("#tactical").click();
  await page.clock.runFor(1000);
  expect(
    E.living(await page.evaluate(() => SignalGame.snapshot()), "barracks")
      .jobs[0].remaining,
  ).toBeLessThan(24);
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
    dialog.dataset.panel = "development";
    dialog.classList.add("dock");
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
        await page.locator("#supply-open").click();
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
