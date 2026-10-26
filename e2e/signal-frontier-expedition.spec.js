"use strict";
const { test, expect } = require("@playwright/test"),
  E = require("../game-source/signal-frontier/src/engine"),
  D = E.development;
const route = "/games/signal-frontier/";
function prepared() {
  const s = E.make();
  for (const u of s.units) if (u.team && u.kind !== "citadel") u.hp = 0;
  s.campaign.camps.forEach((c) => (c.reserve = 0));
  let amount = 6000;
  for (const m of s.campaign.mines) {
    const n = Math.min(amount, m.remaining);
    m.remaining -= n;
    s.campaign.deposited += n;
    s.economy.alloy += n;
    amount -= n;
  }
  const advance = (t) => {
    for (let i = 0; i < (t + 0.1) * 60; i++) E.step(s);
  };
  for (const a of ["barracks", "outpost", "network", "foundry"]) {
    if (a === "outpost") Object.assign(E.hero(s), { x: 450, y: 1590 });
    expect(E.purchase(s, a, a === "outpost" ? "west" : undefined).allowed).toBe(
      true,
    );
    advance(D.items(s)[a].time);
  }
  Object.assign(E.hero(s), { x: 320, y: 1660 });
  expect(E.restore(s)).not.toBeNull();
  return s;
}
async function fixture(page, s) {
  await page.addInitScript((save) => {
    if (!sessionStorage.getItem("signal6-fixture")) {
      localStorage.setItem(
        "signal-frontier-v1",
        JSON.stringify({ settings: { volume: 0, reduced: true }, save }),
      );
      sessionStorage.setItem("signal6-fixture", "1");
    }
  }, s);
  await page.goto(route);
  await page.locator("#continue").click();
  await page.keyboard.press("Tab");
}
for (const browserName of ["chromium", "webkit"])
  test.describe("expedition " + browserName, () => {
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [844, 390],
      [1440, 900],
    ])
      test("building queue, rally and layout " + width, async () => {
        const instance =
          await require("@playwright/test")[browserName].launch();
        const context = await instance.newContext({
          baseURL: "http://127.0.0.1:4173",
          viewport: { width, height },
          hasTouch: width < 700,
          isMobile: width < 700,
        });
        const page = await context.newPage();
        try {
          await page.setViewportSize({ width, height });
          await page.clock.install();
          await fixture(page, prepared());
          await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
          const errors = [];
          page.on("pageerror", (e) => errors.push(e.message));
          let s = await page.evaluate(() => SignalGame.snapshot());
          const b = E.living(s, "barracks");
          const p = await page.evaluate((u) => SignalGame.screen(u.x, u.y), b);
          await page.mouse.click(p.x, p.y - 8);
          await expect(page.locator("#dialog")).toHaveAttribute(
            "data-panel",
            "development",
          );
          await expect(page.locator(".producer")).toBeVisible();
          if (
            (await page
              .locator("#development-size")
              .getAttribute("aria-expanded")) == "false"
          )
            await page.locator("#development-size").click();
          await expect(page.locator("#develop-rifle")).toBeVisible();
          await expect(page.locator("#develop-artillery")).toHaveCount(0);
          const before = s.economy.alloy;
          await page.locator("#develop-rifle").click();
          await expect(page.locator("#field-alloy")).toHaveText(
            String(before - 65),
          );
          await expect(page.locator(".production-queue li")).toHaveCount(1);
          await page.clock.runFor(3000);
          expect((await page.evaluate(() => SignalGame.snapshot())).t).toBe(
            s.t,
          );
          await page.locator(".job-select").first().click();
          await page.getByRole("button", { name: /Отменить: Боец/ }).click();
          await expect(page.locator("#field-alloy")).toHaveText(
            String(before - 17),
          );
          await page.locator("[data-rally]").click();
          await page.clock.runFor(200);
          const target = await page.evaluate(() =>
            SignalGame.screen(400, 1610),
          );
          await page.mouse.click(target.x, target.y);
          s = await page.evaluate(() => SignalGame.snapshot());
          expect(Math.abs(E.living(s, "barracks").rally.x - 400)).toBeLessThan(
            2,
          );
          expect(
            s.units.filter((u) => u.group).every((u) => u.order === null),
          ).toBe(true);
          await page.locator("#supply-open").click();
          await page.locator("#develop-tab-production").click();
          await page
            .getByRole("button", { name: "Показать: Тяжёлый цех" })
            .click();
          await page.clock.runFor(700);
          const fp = await page.evaluate(() => {
            const u = SignalEngine.living(SignalGame.snapshot(), "foundry");
            return SignalGame.screen(u.x, u.y);
          });
          await page.mouse.click(fp.x, fp.y - 8);
          if (
            (await page
              .locator("#development-size")
              .getAttribute("aria-expanded")) == "false"
          )
            await page.locator("#development-size").click();
          await expect(page.locator("#develop-artillery")).toBeVisible();
          await page.locator("#building-tab-tech").click();
          await expect(page.locator("#develop-armor")).toBeVisible();
          expect(
            await page
              .locator("#dialog")
              .evaluate((e) => e.scrollWidth - e.clientWidth),
          ).toBeLessThanOrEqual(1);
          await page.screenshot({
            path: "test-results/signal6-" + browserName + "-" + width + ".png",
          });
          expect(errors).toEqual([]);
        } finally {
          await context.close();
          await instance.close();
        }
      });
  });
test("touch selects a building, while dragging and cancellation do not open it", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await fixture(page, prepared());
    const p = await page.evaluate(() => {
      const u = SignalEngine.living(SignalGame.snapshot(), "barracks");
      return SignalGame.screen(u.x, u.y);
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, x: p.x, y: p.y }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, x: p.x + 60, y: p.y }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await expect(page.locator("#dialog")).not.toBeVisible();
    await page.locator("#map-center").tap();
    await page.waitForTimeout(500);
    const q = await page.evaluate(() => {
      const u = SignalEngine.living(SignalGame.snapshot(), "barracks");
      return SignalGame.screen(u.x, u.y);
    });
    await page.touchscreen.tap(q.x, q.y - 8);
    if (
      (await page.locator("#development-size").isVisible()) &&
      (await page.locator("#development-size").getAttribute("aria-expanded")) ==
        "false"
    )
      await page.locator("#development-size").click();
    await expect(page.locator("#develop-rifle")).toBeVisible();
  } finally {
    await context.close();
  }
});
test("account connects only on request and restores a complete paused operation", async ({
  page,
}) => {
  const remote = E.make();
  E.purchase(remote, "barracks");
  await page.addInitScript((save) => {
    window.__accountWrites = [];
    const transport = {
      read: async () => ({
        version: 1,
        revision: 1,
        save: JSON.stringify(save),
      }),
      write: async (_uid, revision, save) => {
        window.__accountWrites.push(save);
        return {
          committed: true,
          record: { version: 1, revision: revision + 1, save },
        };
      },
    };
    window.AlmanionOrbitalAccount = {
      games: ["signalFrontier"],
      connect: async (cb, game) => {
        if (game !== "signalFrontier") throw Error("wrong game");
        cb({ uid: "one", email: "test@example.test" }, transport);
        return () => {};
      },
      signOut: async () => {},
    };
  }, remote);
  const external = [];
  page.on("request", (r) => {
    if (!r.url().includes("127.0.0.1")) external.push(r.url());
  });
  await page.goto(route);
  expect(await page.evaluate(() => window.__accountWrites)).toEqual([]);
  await page.locator('#home [data-open="account"]').click();
  await page.locator("#account-connect").click();
  await expect(page.locator("#account-status")).toHaveText(
    "Сохранено в аккаунте",
  );
  expect(await page.evaluate(() => SignalGame.snapshot().economy.spent)).toBe(
    120,
  );
  await expect(page.locator("#account-sync")).toBeEnabled();
  await page.locator("#account-back").click();
  await expect(page.locator("#continue")).toBeVisible();
  expect(external).toEqual([]);
});
test("a stale tab pauses and cannot replace the operation from another tab", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
  });
  try {
    const a = await context.newPage();
    await a.goto(route);
    await a.locator("#start").click();
    const b = await context.newPage();
    await b.goto(route);
    await a.locator("#supply-open").click();
    await a.locator("#develop-barracks").click();
    await expect(b.locator("#storage-content")).toBeVisible();
    const latest = await a.evaluate(
      () => JSON.parse(localStorage.getItem("signal-frontier-v1")).save,
    );
    expect(latest.economy.spent).toBe(120);
    await b.locator("#storage-load").click();
    expect((await b.evaluate(() => SignalGame.snapshot())).economy.spent).toBe(
      120,
    );
    expect(
      await b.evaluate(
        () => !!localStorage.getItem("signal-frontier-v1-backups"),
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});
test("catalogue links to both games on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/games/");
  await expect(
    page.getByRole("link", { name: /Предел сигнала/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Орбитальный курьер/ }),
  ).toHaveAttribute("href", "orbital-courier/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await page.getByRole("link", { name: /Предел сигнала/ }).click();
  await expect(page.locator("#start")).toBeVisible();
});

test("a cached Courier-only adapter cannot write a Signal operation to the wrong game", async ({
  page,
}) => {
  await page.route("**/orbital-account.js?*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: "window.AlmanionOrbitalAccount={connect(){window.wrongGameCalled=true}};",
    }),
  );
  await page.goto(route);
  await page.locator('#home [data-open="account"]').click();
  await page.locator("#account-connect").click();
  await expect(page.locator("#account-message")).toContainText(
    "Сервис входа устарел",
  );
  expect(await page.evaluate(() => window.wrongGameCalled)).toBeUndefined();
});

test("unsent progress is labelled pending and opening pause saves it immediately", async ({
  page,
}) => {
  await page.clock.install();
  await page.addInitScript((save) => {
    window.cloudRecord = {
      version: 1,
      revision: 1,
      save: JSON.stringify(save),
    };
    const transport = {
      read: async () => window.cloudRecord,
      write: async (_uid, revision, save) => {
        window.cloudRecord = { version: 1, revision: revision + 1, save };
        return { committed: true, record: window.cloudRecord };
      },
    };
    window.AlmanionOrbitalAccount = {
      games: ["signalFrontier"],
      connect: async (cb) => {
        cb({ uid: "one", email: "test@example.test" }, transport);
        return () => {};
      },
    };
  }, E.make());
  await page.goto(route);
  await page.locator('#home [data-open="account"]').click();
  await page.locator("#account-connect").click();
  await expect(page.locator("#account-status")).toHaveText(
    "Сохранено в аккаунте",
  );
  await page.locator("#account-back").click();
  await page.locator("#continue").click();
  await page.clock.runFor(4000);
  await expect(page.locator("#account-status")).toHaveText(
    "Есть новые изменения",
  );
  await page.locator("#menu-button").click();
  await expect(page.locator("#account-status")).toHaveText(
    "Сохранено в аккаунте",
  );
  expect(
    await page.evaluate(() => JSON.parse(window.cloudRecord.save).t),
  ).toBeGreaterThan(3);
  expect(await page.evaluate(() => SignalGame.mode())).toBe("paused");
});
