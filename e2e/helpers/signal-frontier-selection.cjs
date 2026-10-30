"use strict";

// Replays select through the public roster. The old fixed infantry/artillery
// buttons were replaced by user-assigned control groups and the army panel.
async function selectGroup(page, group) {
  await page.locator("#dock-selection").click();
  await selectArmy(page);
  const extra = await page.evaluate((group) => {
    const units = new Map(SignalGame.snapshot().units.map((u) => [u.id, u]));
    return SignalGame.selection().ids.filter((id) => units.get(id)?.group !== group);
  }, group);
  for (const id of extra)
    await page.locator(`[data-member="${id}"]`).click({ modifiers: ["Shift"] });
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
      const hit = document.elementFromPoint(p.x, p.y);
      if (p.x > 24 && p.x < innerWidth - 24 && p.y > 100 && p.y < bottom - 20 && hit?.id === "field") return { ...p, ready: true };
      const candidates = [];
      for (let y = 120; y < bottom - 24; y += 40)
        for (let x = 40; x < innerWidth - 24; x += 40)
          if (document.elementFromPoint(x, y)?.id === "field") candidates.push({ x, y });
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
  }
  throw Error("Could not reveal placement through camera controls");
}

async function inspectPoint(page, world) {
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

module.exports = { selectGroup, selectArmy, deckCard, revealPoint, inspectPoint };
