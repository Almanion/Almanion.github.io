"use strict";

// Replays select through the public roster. The old fixed infantry/artillery
// buttons were replaced by user-assigned control groups and the army panel.
async function selectGroup(page, group) {
  await page.locator("#dock-selection").click();
  await page.locator("#select-army").click();
  const extra = await page.evaluate((group) => {
    const units = new Map(SignalGame.snapshot().units.map((u) => [u.id, u]));
    return SignalGame.selection().ids.filter((id) => units.get(id)?.group !== group);
  }, group);
  for (const id of extra)
    await page.locator(`[data-member="${id}"]`).click({ modifiers: ["Shift"] });
}

module.exports = { selectGroup };
