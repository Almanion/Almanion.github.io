'use strict';

const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

async function fixture(page, viewport) {
    await page.setViewportSize(viewport);
    await page.route('**/__home-art-aspect.html', route => route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><meta charset="utf-8">
            <style>body{margin:0}canvas{display:block;width:100vw;height:100vh;touch-action:none}</style>
            <canvas></canvas><script src="/home-art-canvas.js"></script>
            <script>window.art = AlmanionHomeArtCanvas.create(document.querySelector('canvas'), { editable: true });</script>
            </html>`
    }));
    await page.goto('/__home-art-aspect.html');
    await page.waitForFunction(() => Boolean(window.art));
}

async function inkBounds(page) {
    return page.locator('canvas').evaluate(canvas => {
        const { width, height } = canvas;
        const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
        let left = width, top = height, right = -1, bottom = -1;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (pixels[4 * (width * y + x) + 3] < 128) continue;
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
            }
        }
        return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 };
    });
}

test('a desktop drawing keeps square geometry and is centered in a phone frame', async ({ page }) => {
    await fixture(page, { width: 640, height: 360 });
    expect(await page.evaluate(() => window.art.getAspect())).toBe(null);
    await page.mouse.move(260, 120);
    await page.mouse.down();
    for (const [x, y] of [[380, 120], [380, 240], [260, 240], [260, 120]]) await page.mouse.move(x, y);
    await page.mouse.up();
    const original = await page.evaluate(() => ({ aspect: window.art.getAspect(), drawing: window.art.getStrokes() }));
    expect(original.aspect).toBe(16 / 9);
    expect(original.drawing).toHaveLength(1);
    await page.setViewportSize({ width: 320, height: 620 });
    await expect.poll(async () => {
        const { width } = await inkBounds(page);
        return width >= 60 && width < 66;
    }).toBe(true);
    const ink = await inkBounds(page);
    expect(ink.width).toBeGreaterThanOrEqual(60);
    expect(Math.abs(ink.width - ink.height)).toBeLessThanOrEqual(1);
    expect(Math.abs((ink.left + ink.right + 1) / 2 - 160)).toBeLessThanOrEqual(1);
    expect(Math.abs((ink.top + ink.bottom + 1) / 2 - 310)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => ({ aspect: window.art.getAspect(), drawing: window.art.getStrokes() }))).toEqual(original);
});

test('letterbox rejects new strokes and clips a drag at the frame boundary', async ({ page }) => {
    await fixture(page, { width: 320, height: 620 });
    await page.evaluate(() => {
        window.art.setAspect(16 / 9);
        window.art.setBrush({ size: 24 });
    });
    await page.mouse.click(160, 100);
    expect(await page.evaluate(() => window.art.getStrokes())).toHaveLength(0);

    await page.mouse.move(160, 310);
    await page.mouse.down();
    await page.mouse.move(160, 100, { steps: 6 });
    await page.mouse.up();
    const points = await page.evaluate(() => window.art.getStrokes()[0].points);
    expect(points.slice(0, 2)).toEqual([5000, 5000]);
    expect(points.slice(-2)).toEqual([5000, 0]);
    await expect.poll(async () => (await inkBounds(page)).top).toBe(220);
    await page.evaluate(() => window.art.undo());
    expect(await page.evaluate(() => window.art.getStrokes())).toHaveLength(0);
    await page.evaluate(() => window.art.redo());
    expect(await page.evaluate(() => window.art.getStrokes()[0].points)).toEqual(points);
});
