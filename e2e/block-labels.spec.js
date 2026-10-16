'use strict';
const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });
for (const width of [1440, 390, 320]) test(`compact block headers preserve prose and controls at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(() => {
        localStorage.setItem('almanion:visual-defaults:2026-09-05-v1', '1');
        localStorage.setItem('siteSettings', JSON.stringify({ visualDefaultsVersion: 1, experimental: true, expMode: 'prism', expTheme: 'dark', expDark: true }));
    });
    await page.goto('/physics-10.html');
    await expect(page.locator('body')).toHaveClass(/experimental/);
    const result = await page.evaluate(mobile => {
        const types = ['definition', 'formula', 'remark', 'reminder', 'experiment', 'derivation', 'theorem', 'lemma', 'example', 'statement', 'corollary', 'proof', 'exercise', 'properties', 'system'];
        const topic = document.querySelector('.main-content .topic');
        topic.innerHTML = types.map(type => `<div class="${type}-box label-fixture"><p>Основной текст остаётся прежнего размера.</p></div>`).join('');
        const blocks = Array.from(topic.querySelectorAll('.label-fixture'));
        const measure = block => {
            const css = getComputedStyle(block), label = getComputedStyle(block, '::before');
            return { header: block.querySelector('p').getBoundingClientRect().top - block.getBoundingClientRect().top, prose: getComputedStyle(block.querySelector('p')).fontSize, left: css.paddingLeft, bottom: css.paddingBottom, top: parseFloat(css.paddingTop), label: parseFloat(label.fontSize), overflow: block.scrollWidth > block.clientWidth + 1 };
        };
        const current = blocks.map(measure);
        const baseline = document.createElement('style');
        baseline.textContent = 'body.experimental .label-fixture::before{font-size:.675rem!important;line-height:1!important;padding:.16rem .5rem!important;margin:0 0 .7rem!important}';
        document.head.append(baseline);
        blocks.forEach(block => block.style.setProperty('padding-top', mobile ? '.9rem' : '1.05rem', 'important'));
        const previous = blocks.map(measure);
        baseline.remove();
        blocks.forEach(block => block.style.removeProperty('padding-top'));
        return { current, previous, root: parseFloat(getComputedStyle(document.documentElement).fontSize) };
    }, width <= 768);
    expect(result.current).toHaveLength(15);
    for (let index = 0; index < result.current.length; index++) {
        const current = result.current[index], previous = result.previous[index];
        expect(current.prose).toBe(previous.prose);
        expect(current.left).toBe(previous.left);
        expect(current.bottom).toBe(previous.bottom);
        expect(current.label).toBeCloseTo(result.root * .6, 2);
        expect(current.header / previous.header).toBeGreaterThan(.81);
        expect(current.header / previous.header).toBeLessThan(.9);
        expect(current.overflow).toBe(false);
    }
    await page.locator('.label-fixture').first().screenshot({ path: info.outputPath('compact-label.png') });
    // Print typography and padding are deliberately independent of screen chips.
    await page.evaluate(() => AlmanionNoteRuntime.ensure('print'));
    await page.emulateMedia({ media: 'print' });
    const printed = await page.locator('.label-fixture').first().evaluate(block => ({ padding: parseFloat(getComputedStyle(block).paddingTop) * .75, label: parseFloat(getComputedStyle(block, '::before').fontSize) * .75 }));
    expect(printed.padding).toBeCloseTo(3.4 * 72 / 25.4, 2);
    expect(printed.label).toBeCloseTo(7, 4);
});
