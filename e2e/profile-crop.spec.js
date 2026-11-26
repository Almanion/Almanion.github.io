'use strict';

const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

const pageMarkup = `<!doctype html><html lang="ru"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="/styles/site/00-components.css"><link rel="stylesheet" href="/styles/profile.css">
<link rel="stylesheet" href="/styles/profile-crop.css">
<style>:root{--bg-primary:#14151e;--bg-secondary:#1c1f2b;--text-primary:#f2f0fa;
--text-secondary:#b7b4cc;--accent-color:#8778ee;--border-color:#37384a;--error-color:#ff7a85}</style>
<button id="choose" type="button">Обновить фото</button>
<script src="/profile-image.js"></script><script src="/profile-crop.js"></script></html>`;

async function openCrop(page, kind, { invalid = false } = {}) {
    await page.route('**/__profile-crop-fixture.html', route => route.fulfill({ contentType: 'text/html', body: pageMarkup }));
    await page.goto('/__profile-crop-fixture.html');
    await page.evaluate(async ({ invalid, kind }) => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');
        for (const [index, color] of ['#d92020', '#24c245', '#2853da'].entries()) {
            ctx.fillStyle = color;
            ctx.fillRect(index * 200, 0, 200, 300);
        }
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const file = invalid ? new File(['not a photo'], 'wrong.png', { type: 'image/png' })
            : new File([blob], 'three-stripes.png', { type: 'image/png' });
        const trigger = document.getElementById('choose');
        trigger.focus();
        window.cropResult = AlmanionProfileCrop.open({ file, kind, trigger });
    }, { kind, invalid });
    const dialog = page.getByRole('dialog', { name: /Кадрирование/ });
    await expect(dialog).toBeVisible();
    if (!invalid) await expect(dialog.getByRole('button', { name: 'Применить' })).toBeEnabled();
    return dialog;
}

async function stageColor(page, x, y = .5) {
    return page.locator('[data-crop-image]').evaluate((canvas, { x, y }) => {
        const data = canvas.getContext('2d').getImageData(Math.round(x * (canvas.width - 1)), Math.round(y * (canvas.height - 1)), 1, 1).data;
        const [r, g, b] = data;
        return { color: r > g && r > b ? 'red' : g > r && g > b ? 'green' : 'blue', alpha: data[3] };
    }, { x, y });
}

async function encodedResult(page) {
    return page.evaluate(async () => {
        const raw = await window.cropResult;
        const image = new Image();
        image.src = 'data:image/jpeg;base64,' + raw;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const rows = [.15, .5, .85].map(x => {
            const [r, g, b] = ctx.getImageData(Math.round(x * (canvas.width - 1)), Math.floor(canvas.height / 2), 1, 1).data;
            return r > g && r > b ? 'red' : g > r && g > b ? 'green' : 'blue';
        });
        return { raw: /^[A-Za-z0-9+/]+=*$/.test(raw), ratio: canvas.width / canvas.height, rows };
    });
}

test('rounded square avatar crop fits a small phone and exports the dragged frame', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const dialog = await openCrop(page, 'avatar');
    const stage = dialog.getByRole('group', { name: 'Кадр фото' });
    const confirm = dialog.getByRole('button', { name: 'Применить' });
    await expect(confirm).toBeInViewport({ ratio: 1 });
    const cancel = await dialog.getByRole('button', { name: 'Отмена' }).boundingBox();
    const apply = await confirm.boundingBox();
    expect(Math.abs(cancel.y - apply.y)).toBeLessThan(2);
    await expect(stage.locator('[data-crop-mask]')).toHaveCSS('border-radius', '25%');
    await expect(dialog.locator('[data-crop-preview] .profile-crop-mask')).toHaveCSS('border-radius', '25%');
    await expect.poll(() => stageColor(page, .15)).toEqual({ color: 'red', alpha: 255 });

    await stage.focus();
    await page.keyboard.press('+');
    await expect(dialog.getByRole('slider', { name: 'Масштаб' })).toHaveAttribute('aria-valuetext', '120%');
    const box = await stage.boundingBox();
    await page.mouse.move(box.x + box.width * .78, box.y + box.height * .5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .13, box.y + box.height * .5, { steps: 4 });
    await page.mouse.up();
    await expect.poll(() => stageColor(page, .85)).toEqual({ color: 'blue', alpha: 255 });

    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Обновить фото' })).toBeFocused();
    expect(await encodedResult(page)).toEqual({ raw: true, ratio: 1, rows: ['green', 'blue', 'blue'] });
});

test('cover remains 3:1, rotates and resets without changing the source', async ({ page }) => {
    await page.setViewportSize({ width: 1030, height: 740 });
    const dialog = await openCrop(page, 'cover');
    const stage = dialog.getByRole('group', { name: 'Кадр фото' });
    const box = await stage.boundingBox();
    expect(Math.abs(box.width / box.height - 3)).toBeLessThan(.01);
    await expect.poll(() => stageColor(page, .15)).toEqual({ color: 'red', alpha: 255 });
    const rotate = dialog.getByRole('button', { name: 'Повернуть на 90°' });
    await rotate.click();
    await expect.poll(() => stageColor(page, .15)).toEqual({ color: 'green', alpha: 255 });
    await dialog.getByRole('button', { name: 'Сбросить кадрирование' }).click();
    await expect.poll(() => stageColor(page, .15)).toEqual({ color: 'red', alpha: 255 });
    await rotate.click();
    await dialog.getByRole('button', { name: 'Применить' }).click();
    expect(await encodedResult(page)).toEqual({ raw: true, ratio: 3, rows: ['green', 'green', 'green'] });
});

test('broken image reports an error and cancellation restores focus', async ({ page }) => {
    const dialog = await openCrop(page, 'avatar', { invalid: true });
    await expect(dialog.getByRole('alert')).toContainText('JPEG, PNG');
    await expect(dialog.getByRole('button', { name: 'Применить' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Обновить фото' })).toBeFocused();
    expect(await page.evaluate(() => window.cropResult)).toBeNull();
});

test.describe('touch crop', () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 780 } });

    test('pinch anchors its midpoint instead of recentering the image', async ({ page, context, browserName }) => {
        test.skip(browserName !== 'chromium', 'Chromium exposes simultaneous touch points via CDP');
        const dialog = await openCrop(page, 'avatar');
        await expect(dialog.getByText('Разведите пальцы, чтобы приблизить.')).toBeVisible();
        const stage = dialog.getByRole('group', { name: 'Кадр фото' });
        const box = await stage.boundingBox();
        const point = (fraction, id) => ({ x: Math.round(box.x + box.width * fraction), y: Math.round(box.y + box.height * .48), id });
        await expect.poll(() => stageColor(page, .17)).toEqual({ color: 'green', alpha: 255 });
        await expect.poll(() => stageColor(page, .10)).toEqual({ color: 'red', alpha: 255 });
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(.06, 0), point(.29, 1)] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(0, 0), point(.35, 1)] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
        await expect.poll(async () => Number.parseInt(await dialog.getByRole('slider').getAttribute('aria-valuetext'), 10)).toBeGreaterThan(140);
        await expect.poll(() => stageColor(page, .10)).toEqual({ color: 'red', alpha: 255 });
        await dialog.getByRole('button', { name: 'Отмена' }).tap();
        expect(await page.evaluate(() => window.cropResult)).toBeNull();
    });
});
