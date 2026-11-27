'use strict';

const { test, expect } = require('@playwright/test');

const textures = ['solid', 'glow', 'grid', 'diagonal', 'dust', 'plasma', 'ripples', 'scan', 'stardust'];
const mark = (texture, photo = '') => '<span class="profile-mark" data-profile-color="iris" data-profile-background="' +
    texture + '">А' + photo + '</span>';
const columns = textures.map(texture => mark(texture)).join('');
const choices = textures.map(texture => '<label><input type="radio" name="texture"' +
    (texture === 'ripples' ? ' checked' : '') + '><span class="profile-choice-face">' + mark(texture) + '</span></label>').join('');
const fixture = `<!doctype html><html lang="ru" data-page-motion="max"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/styles/site/00-components.css">
<link rel="stylesheet" href="/styles/profile-motion.css">
<style>:root{--bg-secondary:#1c1f2b;--text-primary:#f2f0fa}:root,.profile-mark{font-family:system-ui}
#accountBtn{display:flex;flex-wrap:wrap;gap:4px;width:auto;height:auto} .profile-mark{width:32px;height:32px}
#profilePreviewAvatar .profile-mark{width:56px;height:56px}</style>
<div id="accountBtn">${columns}${mark('plasma', '<img class="profile-photo" alt="" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=">')}</div>
<div id="profilePreviewAvatar">${mark('ripples')}</div>
<div id="profilePalette" class="profile-backgrounds">${choices}</div></html>`;

test.use({ serviceWorkers: 'block' });

test('avatar textures render at 32 px and only animate visible generated marks in full motion', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.route('**/__profile-textures-fixture.html', route => route.fulfill({
        contentType: 'text/html', body: fixture
    }));
    await page.goto('/__profile-textures-fixture.html');

    const textureState = selector => page.locator(selector).evaluateAll(marks => marks.map(mark => {
        const pattern = getComputedStyle(mark, '::before');
        return {
            pattern: pattern.backgroundImage,
            animation: pattern.animationName,
            width: Math.round(mark.getBoundingClientRect().width),
            height: Math.round(mark.getBoundingClientRect().height)
        };
    }));
    const controls = '#accountBtn .profile-mark';
    const active = await textureState(controls);
    expect(active.every(({ width, height }) => width === 32 && height === 32)).toBe(true);
    expect(active[0]).toMatchObject({ pattern: expect.stringContaining('linear-gradient('), animation: 'none' });
    const animated = active.slice(1, -1);
    expect(animated.every(({ pattern, animation }) => pattern !== 'none' && animation !== 'none')).toBe(true);
    expect(new Set(animated.map(({ animation }) => animation)).size).toBe(animated.length);
    expect(active.at(-1).animation).toBe('none');
    expect((await textureState('#profilePalette .profile-mark')).every(({ animation }) => animation === 'none')).toBe(true);

    for (const selector of [controls + '[data-profile-background="ripples"]', '#profilePreviewAvatar .profile-mark']) {
        // Resolve the same CSS lengths used by the gradient dot inside the actual avatar box.
        const orbitPoint = () => page.locator(selector).evaluate(mark => {
            const style = getComputedStyle(mark, '::before');
            const probe = document.createElement('span');
            probe.style.position = 'absolute';
            probe.style.left = style.getPropertyValue('--orbit-dot-x');
            probe.style.top = style.getPropertyValue('--orbit-dot-y');
            mark.append(probe);
            const bounds = mark.getBoundingClientRect();
            const dot = probe.getBoundingClientRect();
            probe.remove();
            const x = (dot.x - bounds.x) / bounds.width;
            const y = (dot.y - bounds.y) / bounds.height;
            return { x, y, radius: Math.hypot(x - .33, y - .64) };
        });
        const first = await orbitPoint();
        expect(first.radius).toBeCloseTo(.29, 2);
        await expect.poll(async () => {
            const next = await orbitPoint();
            expect(next.radius).toBeCloseTo(.29, 2);
            return Math.hypot(next.x - first.x, next.y - first.y);
        }).toBeGreaterThan(.03);
    }

    await page.evaluate(() => { document.documentElement.dataset.pageMotion = 'off'; });
    expect((await textureState(controls)).every(({ animation }) => animation === 'none')).toBe(true);
    await page.evaluate(() => { document.documentElement.dataset.pageMotion = 'max'; });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect((await textureState(controls)).every(({ animation }) => animation === 'none')).toBe(true);
});
