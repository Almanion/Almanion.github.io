'use strict';

const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block', reducedMotion: 'no-preference' });

test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(() => {
        localStorage.setItem('almanion:visual-defaults:2026-09-05-v1', '1');
        window.entrances = [];
        document.addEventListener('animationstart', event => {
            if (event.animationName !== 'almanion-element-in') return;
            const element = event.target;
            const animation = element.getAnimations().find(item => item.animationName === event.animationName);
            const first = animation?.effect.getKeyframes()[0];
            window.entrances.push({
                classes: [...element.classList], block: element.dataset.noteBlock, direction: element.dataset.noteEntrance,
                delay: animation?.effect.getTiming().delay, opacity: Number(first?.opacity), translate: getComputedStyle(element).translate
            });
        }, true);
    });
});

test('home cards settle once, and changing class moves only the selected panel', async ({ page }) => {
    await page.goto('/');
    const cards = () => page.evaluate(() => entrances.filter(item => item.classes.includes('subject-card')));
    await expect.poll(async () => (await cards()).length).toBeGreaterThan(1);
    await page.waitForFunction(() => !document.body.classList.contains('home-motion-initial'));
    const initial = await cards();
    expect(initial.every(card => card.opacity >= 0.85 && card.delay <= 64)).toBe(true);
    await page.locator('#gradeTab10').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#gradeTab11')).toBeFocused();
    await expect(page.locator('#gradePanel11')).toBeVisible();
    await expect.poll(() => page.evaluate(() => entrances.filter(item => item.classes.includes('grade-panel')).length)).toBe(1);
    expect((await cards()).length).toBe(initial.length);
    await page.locator('.settings-button').first().click();
    await expect(page.locator('.settings-modal-content')).toBeVisible();
    await expect.poll(() => page.evaluate(() => entrances.some(item => item.classes.includes('settings-modal-content')))).toBe(true);
});

test('reading keeps the title steady, skips fast steps and lets a filter open immediately on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/physics-10.html');
    const topic = page.locator('.topic.exp-reader-current');
    const next = page.locator('.exp-reader-toolbar [data-reader-action="next"]');
    await expect(topic).toBeVisible();
    expect(await page.evaluate(() => entrances.filter(item => item.direction))).toEqual([]);
    await next.click();
    await expect.poll(() => page.evaluate(() => entrances.filter(item => item.direction === 'next').length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => entrances.filter(item => item.direction === 'next').length)).toBeLessThanOrEqual(3);
    await expect(topic).toHaveCSS('opacity', '1');
    await expect(topic.locator('.topic-title')).toHaveCSS('animation-name', 'none');
    const before = await topic.getAttribute('id');
    await next.evaluate(button => { button.click(); button.click(); });
    await expect(topic).not.toHaveAttribute('id', before);
    await expect(page.locator('[data-note-entrance]')).toHaveCount(0);
    await page.locator('.note-filter summary').click();
    await expect(page.locator('.note-filter-done')).toBeInViewport();
    await expect.poll(() => page.evaluate(() => entrances.some(item => item.classes.includes('note-filter-popover')))).toBe(true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.note-filter-popover')).toHaveCSS('animation-name', 'none');
    await page.locator('.note-filter-done').click();
    await next.click();
    await expect(page.locator('[data-note-entrance]')).toHaveCount(0);
    await expect(topic).toBeVisible();
});

test('classic reading animates a block only on its first approach from below', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('siteSettings', JSON.stringify({ experimental: false })));
    await page.goto('/physics-10.html');
    await expect(page.locator('.topic').first()).toBeVisible();
    const id = await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return [...document.querySelectorAll('.topic > [data-note-block]')].find(block => block.getBoundingClientRect().top > innerHeight + 600).dataset.noteBlock;
    });
    const approach = () => page.locator('[data-note-block="' + id + '"]').evaluate(block => {
        window.scrollTo({ top: scrollY + block.getBoundingClientRect().top - innerHeight + 55, behavior: 'instant' });
    });
    const count = () => page.evaluate(id => entrances.filter(item => item.block === id && item.direction === 'scroll').length, id);
    await approach();
    await expect.poll(count).toBe(1);
    await expect(page.locator('[data-note-entrance]')).toHaveCount(0);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect(page.locator('[data-note-block="' + id + '"]')).not.toBeInViewport();
    await approach();
    await expect(page.locator('[data-note-block="' + id + '"]')).toBeInViewport();
    expect(await count()).toBe(1);
});

for (const level of ['medium', 'off']) {
    test('reader and popover respect the ' + level + ' motion setting', async ({ page }) => {
        await page.addInitScript(level => localStorage.setItem('siteSettings', JSON.stringify({ animationLevel: level })), level);
        await page.goto('/physics-10.html#osnovnye-polozheniya-mkt');
        await expect(page.locator('.exp-reader-current')).toHaveAttribute('id', 'osnovnye-polozheniya-mkt');
        expect(await page.evaluate(() => entrances.filter(item => item.direction))).toEqual([]);
        await page.locator('.exp-reader-toolbar [data-reader-action="next"]').click();
        await page.locator('.note-filter summary').click();
        const popup = page.locator('.note-filter-popover');
        await expect(popup).toBeVisible();
        if (level === 'off') {
            await expect(popup).toHaveCSS('animation-name', 'none');
            expect(await page.evaluate(() => entrances)).toEqual([]);
        } else {
            await expect.poll(() => page.evaluate(() => entrances.some(item => item.direction))).toBe(true);
            const effects = await page.evaluate(() => entrances);
            expect(effects.every(item => item.delay === 0 && /^(none|0px( 0px)?)$/.test(item.translate))).toBe(true);
        }
    });
}
