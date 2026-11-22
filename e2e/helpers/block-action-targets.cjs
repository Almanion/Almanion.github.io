const { expect } = require('@playwright/test');

async function expectBlockActionTouchTargets(buttons) {
    await buttons.first().evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    const targets = await buttons.evaluateAll(nodes => nodes.map(el => {
        const rect = el.getBoundingClientRect();
        const scale = rect.width / parseFloat(getComputedStyle(el).width);
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        // Probe one CSS pixel inside each corner of the 44px touch target.
        const cornersHit = [-21, 21].every(dx => [-21, 21].every(dy =>
            el.contains(document.elementFromPoint(x + dx * scale, y + dy * scale))
        ));
        return { left: x - 22 * scale, right: x + 22 * scale, cornersHit };
    }));
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) expect(target.cornersHit).toBe(true);
    targets.sort((a, b) => a.left - b.left);
    for (let i = 1; i < targets.length; i++) {
        expect(targets[i].left).toBeGreaterThanOrEqual(targets[i - 1].right - 1);
    }
}

module.exports = { expectBlockActionTouchTargets };
