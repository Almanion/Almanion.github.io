"use strict";

// Replays select through the public roster. The old fixed infantry/artillery
// buttons were replaced by user-assigned control groups and the army panel.
async function selectGroup(page, group) {
  await page.locator("#dock-selection").click();
  await selectArmy(page);
  const { extra, wanted } = await page.evaluate((group) => {
    const units = new Map(SignalGame.snapshot().units.map((u) => [u.id, u]));
    const current = SignalGame.selection().ids;
    return { extra: current.filter((id) => units.get(id)?.group !== group),
      wanted: current.some((id) => units.get(id)?.group === group) };
  }, group);
  if (!wanted) {
    if (extra.length) await page.locator("#order-cancel").click();
    return;
  }
  for (const id of extra)
    await (await memberCard(page, id)).click({ modifiers: ["Shift"] });
}

async function memberCard(page, id) {
  const card = page.locator(`[data-member="${id}"]`);
  for (let i = 0; i < 20; i++) {
    if (await card.count()) return card;
    const next = page.locator('[data-roster-page="1"]');
    if (await next.count() && await next.isEnabled()) await next.click();
    else {
      const previous = page.locator('[data-roster-page="-1"]');
      while (await previous.count() && await previous.isEnabled()) await previous.click();
      if (!await next.count()) break;
    }
  }
  throw Error("Member not found in selection: " + id);
}

async function selectArmy(page) {
  if (!await page.locator("#select-army").isVisible())
    await page.locator("#dock-selection").click();
  await page.locator("#select-army").click();
}

async function deckCard(page, id) {
  const card = page.locator("#" + id);
  for (let i = 0; i < 8; i++) {
    if (await card.count()) return card;
    const next = page.locator('[data-deck-page="1"]');
    if (!await next.count() || !await next.isEnabled()) break;
    await next.click();
  }
  throw Error("Card not found in shop: " + id);
}

async function revealPoint(page, world) {
  await inspectPoint(page, world);
  for (let i = 0; i < 20; i++) {
    const p = await page.evaluate((world) => {
      const p = SignalGame.screen(world.x, world.y),
        bottom = document.getElementById("placement-panel").getBoundingClientRect().top;
      // Mobile browsers may retarget a touch to a nearby button. Keep a real
      // finger-sized gap from the HUD instead of testing only the pixel centre.
      const clear = (x, y) => [-20, 0, 20].every(dx => [-20, 0, 20].every(dy => document.elementFromPoint(x + dx, y + dy)?.id === "field"));
      if (p.x > 24 && p.x < innerWidth - 24 && p.y > 100 && p.y < bottom - 20 && clear(p.x, p.y)) return { ...p, ready: true };
      const candidates = [];
      for (let y = 120; y < bottom - 24; y += 40)
        for (let x = 40; x < innerWidth - 24; x += 40)
          if (clear(x, y)) candidates.push({ x, y });
      const target = candidates.sort((a, b) => Math.hypot(a.x - innerWidth / 2, a.y - bottom / 2) - Math.hypot(b.x - innerWidth / 2, b.y - bottom / 2))[0];
      if (!target) throw Error("No reachable field area for placement");
      return { ...p, dx: p.x - target.x, dy: p.y - target.y };
    }, world);
    if (p.ready) return { x: p.x, y: p.y };
    const keys = [];
    if (Math.abs(p.dx) > 20) keys.push(p.dx > 0 ? "KeyD" : "KeyA");
    if (Math.abs(p.dy) > 20) keys.push(p.dy > 0 ? "KeyS" : "KeyW");
    for (const key of keys) await page.keyboard.down(key);
    await page.clock.runFor(80);
    for (const key of keys) await page.keyboard.up(key);
    await page.clock.runFor(180);
    for (let j = 0; j < 20 && !await page.evaluate(() => SignalGame.cameraSettled()); j++)
      await page.clock.runFor(100);
  }
  throw Error("Could not reveal placement through camera controls");
}

async function inspectPoint(page, world) {
  await page.clock.runFor(100);
  if (await page.locator("body").evaluate(el => el.classList.contains("placing"))) return;
  if (await page.locator("#minimap-panel").getAttribute("data-folded") === "true") {
    await page.locator("#map-center").click();
    await page.clock.runFor(400);
  }
  const p = await page.evaluate((world) => {
    const r = document.getElementById("minimap-canvas").getBoundingClientRect(),
      g = SignalGame.diagnostics().minimap.geometry;
    return { x: r.x + g.x + world.x * g.scale, y: r.y + g.y + world.y * g.scale };
  }, world);
  await page.mouse.click(p.x, p.y);
  await page.clock.runFor(400);
  if (await page.evaluate(() => SignalGame.mode()) === "tactical")
    for (let i = 0; i < 20 && !await page.evaluate(() => SignalGame.cameraSettled()); i++)
      await page.clock.runFor(100);
}

module.exports = { selectGroup, selectArmy, memberCard, deckCard, revealPoint, inspectPoint };
