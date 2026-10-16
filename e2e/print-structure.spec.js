const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        return url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
    });
    await page.goto('/physics.html');
    await page.addScriptTag({ url: '/pdf-download.js' });
    // Load the exporter once, then inspect both independent layout passes.
    await page.evaluate(async () => {
        const warmup = document.createElement('article');
        warmup.textContent = 'Проверка';
        await AlmanionPdfDownload.generate([{ element: warmup }], 'Проверка');
        window.pdfAudit = { leaves: [], frames: [] };
        const pagination = AlmanionPdfPagination;
        window.AlmanionPdfPagination = { ...pagination,
            contents(entries, locations, english) {
                if (locations) pdfAudit.toc = entries.map(entry => ({ ...entry, page: locations[entry.id] }));
                return pagination.contents(entries, locations, english);
            }
        };
        const create = pdfMake.createPdf;
        pdfMake.createPdf = definition => {
            pdfAudit.vectors = [];
            pdfAudit.images = [];
            pdfAudit.figures = [];
            pdfAudit.defaultFontSize = definition.defaultStyle.fontSize;
            pdfAudit.headingSizes = [];
            const visit = node => {
                if (node.svg) pdfAudit.vectors.push(node.svg);
                if (node.image) pdfAudit.images.push(node.image);
                if (node.fit) pdfAudit.figures.push({ fit: node.fit, alignment: node.alignment });
                if (node.headlineLevel) pdfAudit.headingSizes.push(node.fontSize);
                for (const child of node.stack || []) visit(child);
                for (const child of node.columns || []) visit(child);
                for (const row of node.table?.body || []) for (const cell of row) visit(cell);
            };
            definition.content.forEach(visit);
            return create(definition);
        };
        const collect = AlmanionPdfBlockFrames.collect;
        const draw = AlmanionPdfBlockFrames.draw;
        window.AlmanionPdfBlockFrames = { ...AlmanionPdfBlockFrames,
            collect(pages, margins) {
                pdfAudit.blankPages = pages.map((page, index) => ({ index, items: page.items.filter(({ item }) => item.y < 790).map(({ type, item }) => ({ type, id: item._node?.id, text: item.inlines?.map(part => part.text).join(''), contentId: item.pdfContentId })) })).filter(page => !page.items.length);
                pdfAudit.leaves = pages.flatMap((page, index) => page.items.filter(({ type }) => ['svg', 'image', 'line'].includes(type)).map(({ type, item }) => ({
                    type, page: index, x: item.x, y: item.y, width: item._width || item.getWidth?.(),
                    height: item._height || item.getHeight?.(), owners: item.pdfFrameOwners || item._node?.pdfFrameOwners || []
                })));
                return collect(pages, margins);
            },
            draw(document, frames) { pdfAudit.frames = frames; draw(document, frames); }
        };
    });
});

function savePdf(testInfo, name, result) {
    fs.writeFileSync(testInfo.outputPath(name), Buffer.from(result.bytes));
    fs.writeFileSync(testInfo.outputPath(name + '.json'), JSON.stringify(result.toc, null, 2));
    fs.writeFileSync(testInfo.outputPath(name + '.audit.json'), JSON.stringify({ blankPages: result.blankPages, frames: result.frames, leaves: result.leaves }, null, 2));
}

function assertBounds(result) {
    expect(result.blankPages).toEqual([]);
    for (const leaf of result.leaves.filter(leaf => leaf.owners.length)) {
        expect(leaf.x).toBeGreaterThanOrEqual(39);
        expect(leaf.x + leaf.width).toBeLessThanOrEqual(556);
        for (const owner of leaf.owners) {
            const frame = result.frames.find(frame => frame.id === owner && frame.page === leaf.page);
            expect(frame, `${owner} must contain ${leaf.type} on page ${leaf.page}`).toBeTruthy();
            expect(leaf.x).toBeGreaterThanOrEqual(frame.x);
            expect(leaf.x + leaf.width).toBeLessThanOrEqual(frame.x + frame.width + .1);
            expect(leaf.y).toBeGreaterThanOrEqual(frame.y);
            expect(leaf.y + leaf.height).toBeLessThanOrEqual(frame.y + frame.height + .1);
        }
    }
}

test('actual lazy-loaded physics pictures are embedded inside their nested derivations', async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const result = await page.evaluate(async () => {
        const pictures = Array.from(document.querySelectorAll('.main-content img')).slice(0, 5);
        const topics = [...new Set(pictures.map(image => image.closest('.topic')))];
        const count = topics.reduce((sum, topic) => sum + topic.querySelectorAll('img').length, 0);
        const blob = await AlmanionPdfDownload.generate(topics.map(element => ({ element })), 'Физика — рисунки');
        const centers = pdfAudit.vectors.flatMap(markup => {
            const outer = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
            const math = outer.querySelector('[data-mml-node="math"]');
            if (math?.children.length !== 4 || !math.querySelector('[data-c="1D70E"]') || !math.querySelector('[data-c="1D438"]') || !math.querySelector('[data-c="1D700"]')) return [];
            const image = math.closest('svg'), group = image.parentElement;
            const x = Number(group.getAttribute('transform').match(/translate\(([^,]+)/)[1]);
            return [{ center: x + Number(image.getAttribute('width')) / 2, expected: Number(outer.getAttribute('width')) / 2 }];
        });
        return { ...pdfAudit, centers, expectedImages: count, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
    });
    savePdf(testInfo, 'physics-pictures.pdf', result);
    expect(result.expectedImages).toBeGreaterThan(2);
    expect(result.leaves.filter(leaf => leaf.type === 'image')).toHaveLength(result.expectedImages);
    expect(result.centers).toHaveLength(1);
    for (const formula of result.centers) expect(Math.abs(formula.center - formula.expected)).toBeLessThan(2);
    assertBounds(result);
});

test('deep nesting preserves collapsed content, math, lists, figures and readable continuation frames', async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const result = await page.evaluate(async () => {
        const fixture = document.createElement('article');
        fixture.innerHTML = '<h3>Вложенная структура</h3><div class="theorem-box"><p>Формулировка теоремы.</p><div class="proof-box"><div class="proof-content" hidden><p>Скрытое на экране доказательство.</p><div class="derivation-box"><div class="derivation-content" hidden><div class="example-box"><ol start="2"><li><span class="definition-box"><strong>Вложенный термин</strong> — содержимое внутри строчной оболочки.<div class="formula-box">\\[\\overrightarrow{AB}=\\frac{1}{2}\\vec v\\]</div></span></li></ol><figure><img src="images/normal-acceleration.png" alt="Схема"><figcaption>Подпись вложенного рисунка.</figcaption></figure>' + Array.from({ length: 30 }, (_, index) => `<p>Шаг ${index + 1}. Текст, который переносится на другую страницу внутри нескольких вложенных блоков. Все рамки должны охватывать содержимое без обрезания.</p>`).join('') + '</div></div></div></div><p>Конец доказательства.</p></div></div><div class="remark-box" data-note-filter-hidden>Фильтр должен скрывать этот блок.</div>';
        const create = pdfMake.createPdf;
        pdfMake.createPdf = definition => {
            pdfAudit.markers = [...new Set(JSON.stringify(definition.content).match(/block-\d+/g))];
            return create(definition);
        };
        const blob = await AlmanionPdfDownload.generate([{ element: fixture }], 'Вложенные блоки');
        return { ...pdfAudit, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())), unchanged: fixture.querySelector('.proof-content').hidden };
    });
    savePdf(testInfo, 'deep-structure.pdf', result);
    expect(result.unchanged).toBe(true);
    expect([...new Set(result.frames.map(frame => frame.id))]).toEqual(result.markers);
    expect(result.leaves.filter(leaf => leaf.type === 'image')).toHaveLength(1);
    expect(Math.max(...result.frames.map(frame => frame.depth))).toBe(5);
    expect(result.frames.filter(frame => frame.id === 'block-2').length).toBeGreaterThan(1);
    assertBounds(result);
});

test('picture sources and figures survive export even before browser lazy loading', async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const result = await page.evaluate(async () => {
        const fixture = document.createElement('article');
        fixture.innerHTML = '<h3>Иллюстрации</h3><div class="experiment-box"><p>PNG и JPG.</p><figure><img src="images/normal-acceleration.png" loading="lazy"><figcaption>Геометрическая схема</figcaption></figure><img src="images/force-decomp-axis.jpg" loading="lazy"><picture><source srcset="images/normal-acceleration.png" type="image/png"><img src="images/missing-fallback.png" loading="lazy"></picture><img data-src="images/normal-acceleration.png" loading="lazy"><img src="images/missing-fallback.png" srcset="images/missing-fallback.png 1x, images/normal-acceleration.png 2x" loading="lazy"></div>';
        const blob = await AlmanionPdfDownload.generate([{ element: fixture }], 'Иллюстрации');
        const printable = new Image(); printable.src = pdfAudit.images[0]; await printable.decode();
        const canvas = document.createElement('canvas'); canvas.width = printable.width; canvas.height = printable.height;
        canvas.getContext('2d').drawImage(printable, 0, 0);
        const paper = Array.from(canvas.getContext('2d').getImageData(0, 0, 1, 1).data);
        return { ...pdfAudit, paper, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
    });
    savePdf(testInfo, 'picture-sources.pdf', result);
    expect(result.leaves.filter(leaf => leaf.type === 'image')).toHaveLength(5);
    expect(result.paper).toEqual([255, 255, 255, 255]);
    const firstPicture = result.leaves.findIndex(leaf => leaf.type === 'image');
    expect(result.leaves[firstPicture + 1].type).toBe('svg');
    expect(result.leaves[firstPicture + 1].page).toBe(result.leaves[firstPicture].page);
    assertBounds(result);
});

test('tables keep merged cells and nested blocks at their real column widths', async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const result = await page.evaluate(async () => {
        const fixture = document.createElement('article');
        fixture.innerHTML = '<h3>Таблица</h3><div class="properties-box"><table><thead><tr><th colspan="3">Свойства системы</th></tr></thead><tbody><tr><td rowspan="2">Общий случай</td><td><div class="definition-box">Первое определение</div></td><td>Один</td></tr><tr><td><div class="formula-box">\\[E=mc^2\\]</div></td><td>Два</td></tr><tr><td colspan="2">Сумма</td><td>Три</td></tr></tbody></table></div>';
        const blob = await AlmanionPdfDownload.generate([{ element: fixture }], 'Таблица');
        return { ...pdfAudit, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
    });
    savePdf(testInfo, 'merged-table.pdf', result);
    expect(result.frames.some(frame => frame.depth === 1)).toBe(true);
    assertBounds(result);
});

test('inline diagram styles, external SVG, rendered KaTeX arrows and raster formats are preserved', async ({ page }, testInfo) => {
    test.setTimeout(90000);
    await page.addScriptTag({ url: '/vendor/katex/katex.min.js' });
    const result = await page.evaluate(async () => {
        const fixture = document.createElement('article');
        fixture.innerHTML = '<h3>Схемы и формулы</h3><div class="experiment-box"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120"><style>.axis{stroke:#174c78;stroke-width:3;fill:none}</style><path class="axis" d="M20 10 V100 H220"/><text x="30" y="35">Схема</text></svg><figure><img src="images/notes/physics-10/boyle-mariotte-experiment.svg"><figcaption>Схема опыта Бойля — Мариотта.</figcaption></figure><div class="formula-box"></div></div>';
        katex.render('\\overrightarrow{AB}=\\frac{1}{2}\\vec{v}', fixture.querySelector('.formula-box'), { displayMode: true });
        const canvas = document.createElement('canvas');
        canvas.width = 160; canvas.height = 90;
        const context = canvas.getContext('2d');
        context.fillStyle = '#dfeefa'; context.fillRect(0, 0, 160, 90);
        context.strokeStyle = '#243851'; context.strokeRect(15, 15, 130, 60);
        for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
            const image = document.createElement('img'); image.src = canvas.toDataURL(type); fixture.querySelector('.experiment-box').append(image);
        }
        const blob = await AlmanionPdfDownload.generate([{ element: fixture }], 'Иллюстрации и формулы');
        return { ...pdfAudit, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
    });
    savePdf(testInfo, 'svg-and-formats.pdf', result);
    expect(result.leaves.filter(leaf => leaf.type === 'image')).toHaveLength(3);
    expect(result.vectors.some(svg => svg.includes('.axis{stroke:#174c78'))).toBe(true);
    expect(result.vectors.some(svg => svg.includes('Начальное состояние'))).toBe(true);
    expect(result.vectors.some(svg => svg.includes('data-mml-node="mfrac"') && svg.includes('data-mml-node="mover"'))).toBe(true);
    expect(result.vectors.filter(svg => svg.includes('data-mml-node="mfrac"'))).toHaveLength(1);
    assertBounds(result);
});

test('native print expands hidden proofs but restores the reading state afterwards', async ({ page }) => {
    const result = await page.evaluate(async () => {
        const proof = document.createElement('div'); proof.className = 'proof-content'; proof.hidden = true;
        proof.innerHTML = '<img src="images/normal-acceleration.png">';
        document.querySelector('.main-content .topic').append(proof);
        await AlmanionNoteRuntime.ensure('print');
        AlmanionPrintExport.prepare();
        const printable = !proof.hidden;
        AlmanionPrintExport.restore();
        return { printable, restored: proof.hidden };
    });
    expect(result).toEqual({ printable: true, restored: true });
});

test('a silently omitted layout fragment is rejected and a subsequent export still works', async ({ page }) => {
    const result = await page.evaluate(async () => {
        const fixture = document.createElement('article');
        fixture.innerHTML = '<h3>Сохранность материала</h3><div class="definition-box"><p>Первое предложение.</p><p>Нельзя потерять это предложение.</p></div>';
        const create = pdfMake.createPdf;
        pdfMake.createPdf = definition => {
            const visit = node => {
                if (node.svg?.includes('Нельзя')) { delete node.svg; node.text = ''; }
                for (const child of node.stack || []) visit(child);
                for (const row of node.table?.body || []) for (const cell of row) visit(cell);
            };
            definition.content.forEach(visit);
            return create(definition);
        };
        let error;
        try { await AlmanionPdfDownload.generate([{ element: fixture }], 'Проверка'); }
        catch (failure) { error = failure.message; }
        finally { pdfMake.createPdf = create; }
        const retry = await AlmanionPdfDownload.generate([{ element: fixture }], 'Проверка');
        return { error, retrySize: retry.size };
    });
    expect(result.error).toMatch(/не поместилась в PDF/);
    expect(result.retrySize).toBeGreaterThan(1000);
});

test('short display formulas stay centered with legacy indentation', async ({ page }, testInfo) => {
    const result = await page.evaluate(async () => {
        const fixture = document.createElement('article');
        fixture.innerHTML = '<h3>Формулы</h3><div class="definition-box"><p>Определение</p><div class="formula-box">\n                        <span></span>\n                    </div></div>';
        fixture.querySelector('.formula-box').textContent = '\n                        \\[\\sigma = E\\varepsilon\\]\n                    ';
        const blob = await AlmanionPdfDownload.generate([{ element: fixture }], 'Формулы');
        const markup = pdfAudit.vectors.find(svg => svg.includes('data-mml-node="math"'));
        const outer = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
        const group = outer.querySelector('g');
        const image = group.querySelector('svg');
        const x = Number(group.getAttribute('transform').match(/translate\(([^,]+)/)[1]);
        return { ...pdfAudit, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())), center: x + Number(image.getAttribute('width')) / 2, expected: Number(outer.getAttribute('width')) / 2 };
    });
    savePdf(testInfo, 'centered-math.pdf', result);
    expect(Math.abs(result.center - result.expected)).toBeLessThan(2);
});

test('compact notes use 11 pt prose, 11–12 pt headings and smaller raster/SVG figures without shrinking math', async ({ page }, testInfo) => {
    const result = await page.evaluate(async () => {
        const fixture = document.createElement('article');
        fixture.innerHTML = '<h3>Компактная печать</h3><div class="experiment-box"><p>Рисунки сохраняют пропорции, подписи и чёткость.</p><img src="images/normal-acceleration.png"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 90"><path d="M20 65H330M30 75V15" fill="none" stroke="#222"/><text x="50" y="40" font-size="16">Схема опыта</text></svg><div class="formula-box">\\[pV=nRT\\]</div></div>';
        const blob = await AlmanionPdfDownload.generate([{ element: fixture }], 'Компактная печать');
        const markup = pdfAudit.vectors.find(svg => svg.includes('Рисунки'));
        const text = new DOMParser().parseFromString(markup, 'image/svg+xml').querySelector('text');
        const fontSize = Number(text.getAttribute('font-size')) * .75;
        return { ...pdfAudit, fontSize, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
    });
    savePdf(testInfo, 'compact-notes.pdf', result);
    expect(result.defaultFontSize).toBe(11);
    expect(result.fontSize).toBeCloseTo(11, 2);
    expect(result.headingSizes).toEqual([12]);
    expect(result.figures).toHaveLength(2);
    const width = 595.28 - 2 * 39.69 - 2 * 4 * 72 / 25.4;
    for (const figure of result.figures) {
        expect(figure.fit[0]).toBeCloseTo(width * .85, 2);
        expect(figure.fit[1]).toBe(350);
        expect(figure.alignment).toBe('center');
    }
    const math = result.vectors.find(svg => svg.includes('data-mml-node="math"'));
    expect(math).toBeTruthy();
    assertBounds(result);
    await page.evaluate(async () => {
        await AlmanionNoteRuntime.ensure('print');
        AlmanionPrintExport.prepare();
    });
    await page.emulateMedia({ media: 'print' });
    const native = await page.evaluate(() => {
        const block = document.querySelector('.main-content .definition-box');
        const css = getComputedStyle(block);
        const figure = getComputedStyle(document.querySelector('.main-content img'));
        const heading = getComputedStyle(document.querySelector('.main-content .topic-title'));
        const prose = getComputedStyle(document.querySelector('.main-content p'));
        return { font: parseFloat(css.fontSize) * .75, line: parseFloat(css.lineHeight) / parseFloat(css.fontSize), prose: parseFloat(prose.fontSize) * .75, heading: parseFloat(heading.fontSize) * .75, image: figure.maxWidth, height: parseFloat(figure.maxHeight) * .75 };
    });
    expect(native.font).toBeCloseTo(11, 2);
    expect(native.prose).toBeCloseTo(11, 2);
    expect(native.line).toBeCloseTo(1.35, 2);
    expect(native.heading).toBe(12);
    expect(native.image).toBe('85%');
    expect(native.height).toBeCloseTo(350, 0);
});
