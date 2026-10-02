const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
test.use({ serviceWorkers: 'block' });

test('downloaded PDF frames cover all block types, nesting and continued pages without losing lists', async ({ page }, testInfo) => {
    test.setTimeout(90000);
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto('/physics-10.html');
    await page.addScriptTag({ url: '/pdf-download.js' });
    const result = await page.evaluate(async () => {
        const fixture = document.createElement('article');
        const types = ['definition', 'formula', 'remark', 'reminder', 'experiment', 'derivation', 'theorem', 'lemma', 'example', 'statement', 'corollary', 'proof', 'exercise', 'properties', 'system'];
        fixture.innerHTML = '<h3>Оформление блоков</h3>' + types.map(type => `<div class="${type}-box"><p><strong>Термин</strong> — проверка блока ${type}.</p></div>`).join('') + '<div class="proof-box"><p>Начало длинного доказательства.</p><div class="formula-box">\\[pV=nRT\\]</div><div class="derivation-box">' + Array.from({ length: 45 }, (_, i) => `<p>Шаг ${i + 1}. Проверка читаемости и переноса длинного блока на следующую страницу. Текст и формулы должны оставаться в пределах полей.</p>`).join('') + '</div><p>Конец длинного доказательства.</p></div><div class="definition-box"><ul><li>Маркированный пункт.</li><li>Второй пункт.</li></ul><ol start="3"><li>Нумерованный пункт.</li><li value="7">Пункт семь.</li></ol></div>';
        const blob = await AlmanionPdfDownload.generate([{ element: fixture }], 'Проверка PDF');
        const draw = AlmanionPdfBlockFrames.draw;
        const collect = AlmanionPdfBlockFrames.collect;
        let frames;
        let contents;
        const create = pdfMake.createPdf;
        let vectors = [];
        pdfMake.createPdf = definition => {
            const visit = node => {
                if (node.svg) vectors.push(node.svg);
                for (const child of node.stack || []) visit(child);
                for (const row of node.table?.body || []) for (const cell of row) visit(cell);
                for (const child of node.columns || []) visit(child);
            };
            definition.content.forEach(visit);
            return create(definition);
        };
        window.AlmanionPdfBlockFrames = { ...AlmanionPdfBlockFrames,
            collect(pages, margins) {
                contents = pages.flatMap((page, index) => page.items.filter(entry => entry.type === 'svg' && entry.item.pdfFrameOwners?.length).map(({ item }) => ({ page: index, y: item.y, bottom: item.y + item._height, owners: item.pdfFrameOwners })));
                return collect(pages, margins);
            },
            draw(document, layout) { frames = layout; draw(document, layout); }
        };
        const verified = await AlmanionPdfDownload.generate([{ element: fixture }], 'Проверка PDF');
        const bytes = new Uint8Array(await verified.arrayBuffer());
        const text = new DOMParser().parseFromString(vectors.find(svg => svg.includes('—\u00a0проверка')), 'image/svg+xml').querySelectorAll('text');
        const inlineGap = Number(text[1].getAttribute('x')) - Number(text[0].getAttribute('x')) - Number(text[0].getAttribute('textLength'));
        return { bytes: Array.from(bytes), frames, contents, inlineGap, firstSize: blob.size };
    });
    fs.writeFileSync(testInfo.outputPath('all-blocks.pdf'), Buffer.from(result.bytes));
    expect(result.firstSize).toBeGreaterThan(10000);
    expect(result.inlineGap).toBeGreaterThan(2);
    expect(result.frames.some(frame => frame.depth === 1)).toBe(true);
    const continued = result.frames.filter(frame => frame.id === 'block-16');
    expect(continued.length).toBeGreaterThanOrEqual(2);
    expect(result.frames.filter(frame => frame.id === 'block-18').length).toBeGreaterThanOrEqual(2);
    expect(result.frames.filter(frame => frame.depth === 0)).toHaveLength(17 + continued.length - 1);
    for (const frame of result.frames) {
        expect(frame.x).toBeGreaterThanOrEqual(39);
        expect(frame.x + frame.width).toBeLessThanOrEqual(556);
        expect(frame.y).toBeGreaterThanOrEqual(42);
        expect(frame.y + frame.height).toBeLessThanOrEqual(792);
    }
    expect(result.contents.length).toBeGreaterThan(50);
    for (const content of result.contents) for (const owner of content.owners) {
        const frame = result.frames.find(frame => frame.id === owner && frame.page === content.page);
        expect(frame, 'content must have a containing frame').toBeTruthy();
        expect(content.y).toBeGreaterThanOrEqual(frame.y);
        expect(content.bottom).toBeLessThanOrEqual(frame.y + frame.height + .1);
    }
});
