'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

test.use({ serviceWorkers: 'block' });

for (const theme of [
    { name: 'prism-light', classes: 'experimental exp-prism', definition: '#1d56cf' },
    { name: 'prism-dark', classes: 'experimental exp-prism exp-dark', definition: '#60a5fa' },
    { name: 'legacy-dark', classes: 'dark-theme', definition: '#438bff' }
]) test(`print and download retain ${theme.name} block stripes on white paper`, async ({ page }, info) => {
    test.setTimeout(90000);
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(classes => {
        localStorage.setItem('almanion:visual-defaults:2026-09-05-v1', '1');
        localStorage.setItem('siteSettings', JSON.stringify({ visualDefaultsVersion: 1, experimental: classes.includes('experimental'), expMode: 'prism', expTheme: classes.includes('dark') ? 'dark' : 'light', expDark: classes.includes('dark'), theme: classes.includes('dark') ? 'dark' : 'light' }));
    }, theme.classes);
    await page.goto('/physics-10.html');
    await page.evaluate(() => AlmanionNoteRuntime.ensure('print'));
    await page.addScriptTag({ url: '/pdf-download.js' });
    const result = await page.evaluate(async classes => {
        document.body.className = classes;
        const types = ['definition', 'formula', 'remark', 'reminder', 'experiment', 'derivation', 'theorem', 'lemma', 'example', 'statement', 'corollary', 'proof', 'exercise', 'properties', 'system'];
        const main = document.querySelector('.main-content');
        main.innerHTML = '<section class="content-section"><article class="topic" id="colours"><h3 class="topic-title">Цветные полосы блоков</h3>' + types.map(type => `<div class="${type}-box"><p><strong>${type}</strong> — текст остаётся чёрным, фон белым.</p></div>`).join('') + '<div class="experiment-box"><p>Длинный опыт с вложенным выводом.</p><div class="derivation-box">' + Array.from({ length: 28 }, (_, index) => `<p>Шаг ${index + 1}. Цвет левой полосы не теряется при переносе на следующую страницу. Вложенный вывод сохраняет собственное оформление.</p>`).join('') + '</div></div><div class="english-word-card"><p><strong>Definition</strong> — English vocabulary.</p></div></article></section>';
        const article = main.querySelector('article');
        const warmup = document.createElement('article'); warmup.textContent = 'Подготовка';
        await AlmanionPdfDownload.generate([{ element: warmup }], 'Подготовка');
        const blocks = Array.from(article.querySelectorAll(types.map(type => '.' + type + '-box').concat('.english-word-card').join(',')));
        blocks.forEach(block => block.setAttribute('data-print-colour', ''));
        const accents = blocks.map(block => AlmanionPdfBlockFrames.accentFor(block, types.find(type => block.classList.contains(type + '-box')) || 'definition'));
        const draw = AlmanionPdfBlockFrames.draw;
        window.AlmanionPdfBlockFrames = { ...AlmanionPdfBlockFrames, draw(document, frames) { window.colourFrames = frames; draw(document, frames); } };
        const blob = await AlmanionPdfDownload.generate([{ element: article }], 'Цвета блоков');
        return { accents, frames: colourFrames, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
    }, theme.classes);
    expect(result.accents[0]).toBe(theme.definition);
    expect(new Set(result.accents).size).toBeGreaterThan(5);
    expect([...new Set(result.frames.map(frame => frame.id))]).toHaveLength(18);
    for (let index = 0; index < result.accents.length; index++) {
        const fragments = result.frames.filter(frame => frame.id === 'block-' + (index + 1));
        expect(fragments.length).toBeGreaterThan(0);
        expect(fragments.every(frame => frame.accent === result.accents[index])).toBe(true);
    }
    expect(result.frames.filter(frame => frame.id === 'block-17').length).toBeGreaterThan(1);
    fs.writeFileSync(info.outputPath('download.pdf'), Buffer.from(result.bytes));
    await page.evaluate(() => AlmanionPrintExport.prepare());
    await page.emulateMedia({ media: 'print' });
    const printed = await page.locator('#colours').evaluate(article => Array.from(article.querySelectorAll('[data-print-colour]')).map(block => {
        const css = getComputedStyle(block);
        return { accent: AlmanionPdfBlockFrames.colour(css.borderLeftColor), background: css.backgroundColor, ink: css.color };
    }));
    expect(printed.map(block => block.accent)).toEqual(result.accents);
    expect(printed.every(block => block.background === 'rgb(255, 255, 255)' && block.ink === 'rgb(23, 25, 29)')).toBe(true);
    // A colour stripe is a stroke, not an optional "background graphics" fill.
    await page.pdf({ path: info.outputPath('browser-print.pdf'), printBackground: false, preferCSSPageSize: true });
    fs.writeFileSync(info.outputPath('colors.json'), JSON.stringify({ theme, ...result, bytes: undefined, printed }, null, 2));
});
