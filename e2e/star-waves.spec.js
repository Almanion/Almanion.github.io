'use strict';
const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(() => {
        let seed = 239;
        Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    });
});

async function home(page) {
    await page.goto('/');
    await page.waitForFunction(() => window.AlmanionHomeStars && window.AlmanionSettings?.ready);
    await page.evaluate(() => AlmanionSettings.update({ animationLevel: 'max', expTheme: 'dark' }));
    await page.waitForTimeout(1000);
}

test('a click travels over existing edges, fades fully and can be disabled independently', async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await home(page);
    await page.mouse.click(8, 120);
    await page.waitForFunction(() => AlmanionHomeStars.getState().waveEdges > 3);
    expect(await page.evaluate(() => AlmanionHomeStars.getState().waveReach)).toBeGreaterThan(100);
    await page.waitForTimeout(220);
    await page.screenshot({ path: info.outputPath('wave-dark.png') });
    await page.mouse.move(1430, 895);
    await page.waitForFunction(() => AlmanionHomeStars.getState().waves === 0);
    expect(await page.evaluate(() => AlmanionHomeStars.getState().waveEdges)).toBe(0);
    await page.evaluate(() => AlmanionHomeStars.setWavesEnabled(false));
    await page.mouse.click(8, 120);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => AlmanionHomeStars.getState().waves)).toBe(0);
    await page.waitForFunction(() => AlmanionHomeStars.getState().edges > 0);
    await page.evaluate(() => { AlmanionHomeStars.setWavesEnabled(true); AlmanionSettings.update({ expTheme: 'light' }); });
    await page.waitForTimeout(700);
    await page.mouse.click(8, 120);
    await page.waitForFunction(() => AlmanionHomeStars.getState().waveEdges > 0);
    await page.screenshot({ path: info.outputPath('wave-light.png') });
    await page.evaluate(() => AlmanionSettings.update({ animationLevel: 'off' }));
    await page.mouse.click(8, 120);
    expect(await page.evaluate(() => AlmanionHomeStars.getState().waves)).toBe(0);
    await page.evaluate(() => AlmanionSettings.update({ animationLevel: 'max' }));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.mouse.click(8, 120);
    expect(await page.evaluate(() => AlmanionHomeStars.getState().waves)).toBe(0);
});

test('navigation, secondary clicks, dragging and open dialogs do not trigger a wave', async ({ page }) => {
    await home(page);
    await page.locator('#gradeTab9').click();
    await expect(page.locator('#gradePanel9')).toBeVisible();
    expect(await page.evaluate(() => AlmanionHomeStars.getState().waves)).toBe(0);
    await page.mouse.click(8, 120, { button: 'right' });
    await page.mouse.move(8, 120);
    await page.mouse.down();
    await page.mouse.move(8, 170);
    await page.mouse.up();
    expect(await page.evaluate(() => AlmanionHomeStars.getState().waves)).toBe(0);
    await page.locator('#settingsButton').click();
    await page.mouse.click(8, 120);
    expect(await page.evaluate(() => AlmanionHomeStars.getState().waves)).toBe(0);
});

test.describe('touch waves', () => {
    test.use({ isMobile: true, hasTouch: true });
    test('a tap launches a wave but a touch scroll cancels it', async ({ page }, info) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await home(page);
        await page.touchscreen.tap(4, 150);
        await page.waitForFunction(() => AlmanionHomeStars.getState().waveEdges > 0);
        await page.waitForTimeout(180);
        await page.screenshot({ path: info.outputPath('wave-phone.png') });
        await page.waitForFunction(() => AlmanionHomeStars.getState().waves === 0);
        await page.evaluate(() => {
            const target = document.body;
            const send = (type, x, y) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y }));
            send('pointerdown', 4, 150); send('pointermove', 4, 100); send('pointerup', 4, 100);
        });
        expect(await page.evaluate(() => AlmanionHomeStars.getState().waves)).toBe(0);
        await page.locator('#gradeTab9').tap();
        await expect(page.locator('#gradePanel9')).toBeVisible();
        await page.evaluate(() => scrollTo({ top: 250, behavior: 'instant' }));
        expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
    });
});
