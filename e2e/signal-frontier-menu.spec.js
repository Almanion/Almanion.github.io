"use strict";
const { test, expect } = require("@playwright/test");
const { barracksField } = require("../tests/helpers/signal-frontier-medic.cjs");

const route = "/games/signal-frontier/";
const mode = (page) => page.evaluate(() => SignalGame.mode());
test.use({ reducedMotion: "reduce", launchOptions: { args: ["--enable-unsafe-swiftshader"] } });

for (const [width, height] of [[1440, 900], [320, 568], [568, 320]]) {
  test(`start screen shows both operations and a saved operation at ${width}×${height}`, async ({ browser }) => {
    const touch = width < 800;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      const activate = (selector) => page.locator(selector)[touch ? "tap" : "click"]();
      const home = page.locator("#home"), art = home.locator("picture img");
      const layout = () => home.evaluate((root) => ({
        overflow: [root.scrollWidth - root.clientWidth, root.scrollHeight - root.clientHeight],
        allReachable: [...root.querySelectorAll("button:not([hidden]), a")].every((control) => {
          const { x, y, width, height } = control.getBoundingClientRect();
          return height >= 44 && x >= 0 && x + width <= innerWidth && y >= 0 && y + height <= innerHeight &&
            control.contains(document.elementFromPoint(x + width / 2, y + height / 2));
        }),
      }));
      await page.goto(route + "?mission=east");
      await expect(home.getByRole("heading", { level: 1 })).toHaveText("Предел сигнала");
      await expect(page.locator(".mission-list button:visible").first()).toHaveId("start-east");
      const asset = width < height && touch ? "orbit-compact.webp" : "orbit.webp";
      await expect.poll(() => art.evaluate((image, path) => image.complete && image.naturalWidth > 0 &&
        image.currentSrc.endsWith("/" + path), asset)).toBe(true);
      await expect(page.locator("#continue")).toBeHidden();
      await expect.poll(layout).toEqual({ overflow: [0, 0], allReachable: true });

      await activate("#start-east");
      await expect(home).toBeHidden();
      expect(await mode(page)).toBe("tactical");
      await activate("#menu-button");
      await activate("#to-home");
      await expect(home).toBeVisible();
      await expect(page.locator("#continue-detail")).toContainText("Доставка архива");
      await expect(page.locator("#new-game")).toBeVisible();
      await expect.poll(layout).toEqual({ overflow: [0, 0], allReachable: true });

      await activate("#continue");
      await expect(home).toBeHidden();
      expect(await mode(page)).toBe("playing");
      expect(await page.evaluate(() => SignalGame.snapshot().campaign.id)).toBe("frontier-10");
    } finally { await context.close(); }
  });
}

test("start screen honors both motion preferences", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(route);
  const scene = page.locator(".home-scene");
  const animations = () => scene.evaluate((el) =>
    el.getAnimations({ subtree: true }).map((animation) => animation.animationName).sort());
  const ambient = ["orbit-drift", "orbit-flight", "orbit-flight", "orbit-light", "orbit-light", "orbit-light"];
  await expect.poll(animations).toEqual(ambient);
  await page.locator('#home [data-open="settings"]').click();
  await page.locator("#motion").check();
  await expect.poll(animations).toEqual([]);
  await page.locator("#motion").uncheck();
  await expect.poll(animations).toEqual(ambient);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(animations).toEqual([]);
});

test.describe("touch start screen", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "no-preference" });

  test("lights and ships animate over a steady background", async ({ page }) => {
    await page.goto(route);
    await expect(page.locator(".home-scene")).toHaveCSS("animation-name", "none");
    await expect(page.locator(".home-flight--shuttle")).toHaveCSS("animation-name", "orbit-flight");
    await expect(page.locator(".station-light--relay")).toHaveCSS("animation-name", "orbit-light");
    await page.locator('#home [data-open="settings"]').tap();
    await expect(page.locator("#settings-content")).toBeVisible();
  });
});

test("starting an operation waits for the console stylesheet and can retry", async ({ page }) => {
  let stopFirstRequest;
  const held = new Promise((resolve) => { stopFirstRequest = resolve; });
  let requests = 0;
  await page.route("**/console.css*", async (route) => {
    if (++requests === 1) {
      await held;
      await route.abort();
    } else await route.continue();
  });
  await page.goto(route);
  await expect(page.locator("#signal-console-style")).toHaveCount(0);
  const start = page.locator("#start"), status = page.locator("#operation-loading");
  try {
    await start.click();
    await expect(status).toContainText("Готовим командную панель");
    expect(await mode(page)).toBe("menu");
  } finally {
    stopFirstRequest();
  }
  await expect(status).toContainText("Повтори запуск");
  await expect(page.locator("#hud")).toBeHidden();
  await start.click();
  await expect(page.locator("#develop-barracks")).toBeVisible();
  expect(await mode(page)).toBe("tactical");
  expect(requests).toBe(2);
});

test("system tabs stay in place, restore focus and return to the same tactical panel", async ({ page }) => {
  await page.goto(route);
  const opener = page.locator('#home [data-open="settings"]');
  await opener.click();
  const settings = page.locator("#menu-tab-settings"), help = page.locator("#menu-tab-help");
  const position = await settings.boundingBox();
  await expect(page.locator("#menu-tab-pause")).toBeHidden();
  await page.keyboard.press("ArrowRight");
  await expect(help).toBeFocused();
  await expect(page.locator("#help-content")).toBeVisible();
  await page.locator("#help-content").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  expect(await settings.boundingBox()).toEqual(position);
  await page.keyboard.press("End");
  await expect(page.locator("#account-content")).toBeVisible();
  await page.keyboard.press("Home");
  await expect(settings).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await page.locator("#start-east").click();
  await page.locator("#dock-selection").click();
  await page.locator("#menu-button").click();
  await expect(page.locator("#pause-mission")).toContainText("Доставка архива");
  await settings.click();
  await page.locator("#settings-back").click();
  expect(await mode(page)).toBe("tactical");
  await expect(page.locator("#dock-selection")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#menu-button")).toBeFocused();
  await page.locator("#menu-button").click();
  await page.locator("#restart").click();
  expect(await page.evaluate(() => SignalGame.snapshot().campaign.id)).toBe("frontier-10");
});

for (const touch of [false, true]) {
  test("direct recruitment keeps the button, queue and catalogue position on " + (touch ? "touch" : "keyboard"), async ({ browser }) => {
    const context = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      hasTouch: touch, isMobile: touch, reducedMotion: "reduce" });
    try {
      const page = await context.newPage(), save = barracksField();
      await page.addInitScript((save) => localStorage.setItem("signal-frontier-v1", JSON.stringify({ save, settings: { volume: 0, reduced: true } })), save);
      await page.goto(route);
      await expect(page.locator("#continue-detail")).toContainText("Пепельный узел");
      await page.locator("#continue").click();
      await expect(page.locator("#hud")).toBeVisible();
      if (touch) {
        await page.locator("#dock-shop").tap();
        await page.locator("#develop-tab-production").tap();
      } else {
        await page.keyboard.press("KeyB");
        await expect(page.locator("#develop-tab-build")).toBeFocused();
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowDown");
        await expect(page.locator("#develop-rifle")).toBeFocused();
      }
      const rifle = page.locator("#develop-rifle"), queue = page.locator(".free-queue");
      await expect(page.locator(".deck-producer")).toContainText("Казармы");
      const before = await rifle.boundingBox(), original = await rifle.elementHandle();
      for (let i = 0; i < 2; i++) {
        if (touch) await rifle.tap(); else await page.keyboard.press("Enter");
        expect(await rifle.boundingBox()).toEqual(before);
        expect(await rifle.evaluate((current, first) => current === first, original)).toBe(true);
        await expect(queue.locator("[data-job]")).toHaveCount(i + 1);
      }
      const queueBox = await queue.boundingBox();
      expect(queueBox.y).toBeGreaterThanOrEqual(before.y + before.height);
      expect(await mode(page)).toBe("tactical");
      if (touch) {
        const list = page.locator(".shop-scroll"), box = await list.boundingBox();
        const finger = await context.newCDPSession(page), x = box.x + box.width / 2;
        const swipe = (type, y) => finger.send("Input.dispatchTouchEvent", { type, touchPoints: y === undefined ? [] : [{ id: 1, x, y }] });
        const last = page.locator("#develop-grenadier");
        for (let n = 0; n < 6; n++) {
          const rect = await last.boundingBox();
          if (rect.y + rect.height <= box.y + box.height + 1) break;
          await swipe("touchStart", box.y + box.height - 4);
          for (let i = 1; i <= 6; i++) await swipe("touchMove", box.y + box.height - 4 - (box.height - 8) * i / 6);
          await swipe("touchEnd");
        }
        await expect.poll(() => list.evaluate((el) => Math.round(el.scrollTop))).toBeGreaterThan(0);
        await expect(last).toBeInViewport({ ratio: 0.9 });
        await page.locator("#develop-tab-research").tap();
        await page.locator("#develop-tab-production").tap();
        expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
        expect(await queue.boundingBox()).toEqual(queueBox);
      } else {
        await page.keyboard.press("KeyB");
        await page.keyboard.press("End");
        await expect(page.locator("#develop-tab-research")).toBeFocused();
        await page.keyboard.press("Home");
        await page.keyboard.press("Tab");
        await expect(page.locator("#develop-barracks")).toBeFocused();
        expect(await mode(page)).toBe("tactical");
      }
    } finally { await context.close(); }
  });
}


for (const [width, height, touch] of [[1440, 900, false], [668, 893, true], [390, 844, true]]) {
  test(`named shop cards and field selection share the dock at ${width}×${height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch, reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const activate = (control) => touch ? control.tap() : control.click();
      await page.goto(route);
      await activate(page.locator("#start"));
      const shop = page.locator("#development-content"), field = page.locator("#selection-content");
      const inspector = page.locator("#shop-inspector");
      await expect(shop.locator(".shop-offer strong")).toHaveText([
        "Казармы", "Экстрактор", "Конденсатор", "Узел снабжения", "Бункер", "Тяжёлый цех", "Арсенал",
      ]);
      await expect(field.locator(".roster-identity")).toContainText("Разведчик");
      const fieldBox = await field.boundingBox(), shopBox = await shop.boundingBox();
      expect(fieldBox.x + fieldBox.width).toBeLessThanOrEqual(shopBox.x + 1);
      expect(shopBox.x + shopBox.width).toBeGreaterThan(width * 0.93);
      expect(fieldBox.y).toBeLessThan(shopBox.y + shopBox.height - 44);

      const soldier = await page.evaluate(() => {
        const s = SignalGame.snapshot(), scale = SignalGame.camera().scale;
        return s.units.filter((u) => !u.team && u.kind === "rifle").map((u) => {
          const p = SignalGame.screen(u.x, u.y);
          return { id: u.id, x: p.x, y: p.y - 8 * scale };
        }).find((p) => document.elementFromPoint(p.x, p.y)?.id === "field");
      });
      expect(soldier).toBeTruthy();
      if (touch) await page.touchscreen.tap(soldier.x, soldier.y);
      else await page.mouse.click(soldier.x, soldier.y);
      await expect(field.locator(".roster-identity")).toContainText("Боец");
      await expect(shop).toBeVisible();
      await expect(page.locator("#order-move")).toBeVisible();
      const state = () => page.evaluate(() => [SignalGame.snapshot(), SignalGame.selection().ids]);
      const before = await state();
      expect(before[1]).toEqual([soldier.id]);
      if (touch) {
        const move = page.locator("#order-move");
        await move.tap();
        await expect(move).toHaveAttribute("aria-pressed", "true");
        await page.locator("#order-cancel").tap();
        await expect(move).toHaveAttribute("aria-pressed", "false");
        expect(await state()).toEqual(before);
      }

      const foundry = shop.locator("#develop-foundry"), info = shop.getByRole("button", { name: "Характеристики: Тяжёлый цех", exact: true });
      await expect(foundry).toBeDisabled();
      if (touch) {
        const tap = await info.boundingBox();
        expect(tap.width).toBeGreaterThanOrEqual(44);
        expect(tap.height).toBeGreaterThanOrEqual(44);
        await info.tap();
      } else {
        await info.focus();
        await page.keyboard.press("Enter");
      }
      await expect(inspector.getByRole("heading")).toHaveText("Тяжёлый цех");
      await expect(inspector).toContainText("Исследуйте сеть управления");
      await expect(inspector).toContainText("180 сплава");
      await expect(info).toHaveAttribute("aria-pressed", "true");
      const infoBox = await inspector.boundingBox();
      expect(infoBox.x).toBe(fieldBox.x);
      expect(infoBox.width).toBe(fieldBox.width);
      expect(await state()).toEqual(before);
      if (touch) await activate(inspector.getByRole("button", { name: "К выделению", exact: false }));
      else {
        await expect(inspector).toBeFocused();
        await page.keyboard.press("Escape");
      }
      await expect(field.locator(".roster-identity")).toContainText("Боец");
      if (!touch) await expect(info).toBeFocused();

      const barracksInfo = shop.getByRole("button", { name: "Характеристики: Казармы", exact: true });
      await activate(barracksInfo);
      await expect(inspector).toContainText("3 × 3");
      await expect(inspector).toContainText("120 сплава");
      expect(await state()).toEqual(before);
      await activate(shop.locator("#develop-barracks"));
      await expect(page.locator("#placement-panel")).toBeVisible();
      expect((await state())[0].economy).toEqual(before[0].economy);
      await activate(page.locator("#placement-cancel"));
      await expect(shop).toBeVisible();
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}

test("switching graphics from paused orders keeps the eastern operation and returns to settings", async ({ page }) => {
  await page.goto(route + "?mission=east&renderer=canvas");
  await expect(page.locator(".mission-list button:visible").first()).toHaveId("start-east");
  await page.locator("#start-east").click();
  await page.locator("#hud").waitFor({ state: "visible" });
  const snapshot = await page.evaluate(() => SignalGame.snapshot());
  await page.locator("#menu-button").click();
  await page.locator("#menu-tab-settings").click();
  await page.locator('a[data-renderer="babylon"]').click();
  await expect(page.locator("#settings-content")).toBeVisible();
  await expect(page.locator('a[data-renderer="babylon"]')).toHaveAttribute("aria-current", "page");
  expect(new URL(page.url()).searchParams.get("mission")).toBe("east");
  await page.locator("#settings-back").click();
  expect(await mode(page)).toBe("tactical");
  expect(await page.evaluate(() => SignalGame.snapshot())).toEqual(snapshot);
});
