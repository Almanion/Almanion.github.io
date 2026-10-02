/* Client-only A4 exporter. Text and math remain vectors; no screenshots,
 * printer preferences, uploads, or page-theme colours enter the PDF. */
(function () {
    'use strict';
    const WIDTH = 595.28 - 2 * 39.69; // A4, 14 mm side margins (points).
    const INK = '#17191d';
    const BLOCKS = '.definition-box,.formula-box,.remark-box,.reminder-box,.experiment-box,.derivation-box,.theorem-box,.lemma-box,.example-box,.statement-box,.corollary-box,.proof-box,.exercise-box,.properties-box,.system-box,.english-word-card';
    const LABELS = { definition: 'Определение', formula: 'Формула', remark: 'Замечание', reminder: 'Напоминание', experiment: 'Опыт', derivation: 'Вывод', theorem: 'Теорема', lemma: 'Лемма', example: 'Пример', statement: 'Утверждение', corollary: 'Следствие', proof: 'Доказательство', exercise: 'Задача', properties: 'Свойства', system: 'Система' };
    let ready;
    const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const load = src => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => { script.remove(); reject(new Error('Не удалось загрузить PDF-модуль. Проверьте соединение.')); };
        document.head.appendChild(script);
    });

    function dependencies() {
        if (!ready) ready = (async () => {
            await load('vendor/pdf/pdfmake.min.js');
            window.MathJax = { startup: { typeset: false }, svg: { fontCache: 'none' }, tex: { packages: ['base', 'ams', 'newcommand', 'noundefined', 'textmacros'] } };
            await load('vendor/pdf/tex-svg.js');
            await MathJax.startup.promise;
            const fonts = {};
            await Promise.all([
                ['NotoSans-Regular.ttf', '400', 'normal'], ['NotoSans-Bold.ttf', '700', 'normal'],
                ['NotoSans-Italic.ttf', '400', 'italic'], ['NotoSans-BoldItalic.ttf', '700', 'italic']
            ].map(async ([file, weight, style]) => {
                const response = await fetch('vendor/pdf/' + file);
                if (!response.ok) throw new Error('Не удалось загрузить печатный шрифт.');
                const buffer = await response.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                let binary = '';
                for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
                fonts[file] = btoa(binary);
                const font = new FontFace('AlmanionPDF', buffer, { weight, style });
                document.fonts.add(await font.load());
            }));
            pdfMake.addVirtualFileSystem(fonts);
            pdfMake.fonts = { NotoSans: { normal: 'NotoSans-Regular.ttf', bold: 'NotoSans-Bold.ttf', italics: 'NotoSans-Italic.ttf', bolditalics: 'NotoSans-BoldItalic.ttf' } };
        })().catch(error => { ready = null; throw error; });
        return ready;
    }

    async function replaceMath(root) {
        root.querySelectorAll('.katex').forEach(node => {
            const tex = node.querySelector('annotation[encoding="application/x-tex"]');
            if (!tex) return;
            const outer = node.closest('.katex-display') || node;
            const raw = document.createElement('span');
            raw.textContent = (outer.matches('.katex-display') ? '\\[' : '\\(') + tex.textContent + (outer.matches('.katex-display') ? '\\]' : '\\)');
            outer.replaceWith(raw);
        });
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const node of nodes) {
            if (node.parentElement.closest('svg, script, style, code, pre')) continue;
            const pattern = /\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\\\(([\s\S]*?)\\\)|\$([^$\n]+)\$/g;
            let match, cursor = 0;
            const fragment = document.createDocumentFragment();
            while ((match = pattern.exec(node.textContent))) {
                fragment.append(document.createTextNode(node.textContent.slice(cursor, match.index)));
                const display = match[1] !== undefined || match[2] !== undefined;
                const math = await MathJax.tex2svgPromise(match[1] ?? match[2] ?? match[3] ?? match[4], { display });
                if (math.querySelector('[data-mml-node="merror"]')) throw new Error('Не удалось оформить одну из формул. Экспорт остановлен, чтобы не потерять её.');
                const span = document.createElement('span');
                span.className = display ? 'pdf-math display' : 'pdf-math';
                span.append(math.querySelector('svg'));
                fragment.append(span);
                cursor = pattern.lastIndex;
            }
            if (cursor) {
                fragment.append(document.createTextNode(node.textContent.slice(cursor)));
                node.replaceWith(fragment);
            }
        }
    }

    // Lay out mixed text and inline math with the browser, then describe only
    // glyphs and SVG paths to pdfmake. This retains Cyrillic/selectable text and
    // mathematical fractions without flattening a page into a bitmap.
    async function paragraph(nodes, width, measure) {
        if (!nodes.some(node => node.textContent.trim() || node.nodeType === 1 && node.matches('svg,.katex'))) return [];
        const element = document.createElement('div');
        element.className = 'paragraph';
        element.style.width = width * 4 / 3 + 'px';
        nodes.forEach(node => element.append(node.cloneNode(true)));
        measure.append(element);
        await replaceMath(element);
        const origin = element.getBoundingClientRect();
        const parts = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.parentElement.closest('svg')) continue;
            const style = getComputedStyle(node.parentElement);
            let run = null;
            for (let offset = 0; offset < node.length;) {
                const char = String.fromCodePoint(node.textContent.codePointAt(offset));
                const range = document.createRange();
                range.setStart(node, offset); range.setEnd(node, offset + char.length);
                offset += char.length;
                const rect = range.getBoundingClientRect();
                if (!rect.width || !rect.height) continue;
                const x = rect.left - origin.left, y = rect.top - origin.top;
                if (run && Math.abs(run.y - y) < 1) { run.text += char; run.right = rect.right - origin.left; }
                else {
                    run = { x, y, right: rect.right - origin.left, height: rect.height, text: char, weight: style.fontWeight, italic: style.fontStyle, size: parseFloat(style.fontSize) };
                    parts.push(run);
                }
            }
        }
        element.querySelectorAll('.pdf-math > svg').forEach(svg => {
            const rect = svg.getBoundingClientRect();
            const copy = svg.cloneNode(true);
            copy.setAttribute('width', rect.width); copy.setAttribute('height', rect.height);
            copy.style.cssText = '';
            parts.push({ x: rect.left - origin.left, y: rect.top - origin.top, height: rect.height,
                svg: new XMLSerializer().serializeToString(copy).replace(/currentColor/g, INK) });
        });
        element.remove();
        if (!parts.length) return [];
        parts.sort((a, b) => a.y - b.y || a.x - b.x);
        const rows = [];
        parts.forEach(part => {
            let row = rows[rows.length - 1];
            if (!row || part.y >= row.bottom - 1) rows.push(row = { top: part.y, bottom: part.y + part.height, parts: [] });
            row.bottom = Math.max(row.bottom, part.y + part.height);
            row.parts.push(part);
        });
        const result = [];
        for (let i = 0; i < rows.length; i += 4) {
            const chunk = rows.slice(i, i + 4), top = chunk[0].top, height = chunk[chunk.length - 1].bottom - top + 3;
            const body = chunk.flatMap(row => row.parts).map(part => part.svg
                ? '<g transform="translate(' + part.x + ',' + (part.y - top) + ')">' + part.svg + '</g>'
                : '<text x="' + part.x + '" y="' + (part.y - top + part.size * .93) + '" textLength="' + (part.right - part.x) + '" lengthAdjust="spacingAndGlyphs" font-family="NotoSans" font-size="' + part.size + '" font-weight="' + part.weight + '" font-style="' + part.italic + '" xml:space="preserve">' + escape(part.text.replace(/ /g, '\u00a0')) + '</text>').join('');
            result.push({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width * 4 / 3 + ' ' + height + '" width="' + width * 4 / 3 + '" height="' + height + '" fill="' + INK + '">' + body + '</svg>', width, margin: [0, 0, 0, i + 4 >= rows.length ? 5 : 0] });
        }
        return result;
    }

    function svgFigure(svg, width) {
        const viewBox = svg.getAttribute('viewBox');
        if (viewBox) {
            const box = viewBox.trim().split(/[\s,]+/).map(Number);
            if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) {
                throw new Error('У одной из схем некорректные размеры. Исправьте её перед экспортом.');
            }
        }
        return { svg: new XMLSerializer().serializeToString(svg).replace(/currentColor/g, INK), fit: [width, 410], alignment: 'center', margin: [0, 6, 0, 6] };
    }

    async function illustration(image, width) {
        const url = new URL(image.src, location.href);
        const response = await fetch(url);
        if (!response.ok) throw new Error('Не удалось загрузить иллюстрацию: ' + (image.alt || url.pathname));
        const blob = await response.blob();
        if (/svg/.test(blob.type) || /\.svg(?:$|\?)/i.test(url.href)) {
            const source = await blob.text();
            const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
            if (svg.tagName !== 'svg') throw new Error('Некорректная SVG-иллюстрация');
            svg.querySelectorAll('script, foreignObject').forEach(node => node.remove());
            return svgFigure(svg, width);
        }
        const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
        if (!/image\/(png|jpeg)/.test(blob.type)) {
            const bitmap = await createImageBitmap(blob);
            const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
            canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
            return { image: canvas.toDataURL('image/png'), fit: [width, 410], margin: [0, 6, 0, 6] };
        }
        return { image: data, fit: [width, 410], margin: [0, 6, 0, 6] };
    }

    async function children(parent, width, measure, english) {
        const output = [], inline = [];
        const flush = async () => { if (inline.length) output.push(...await paragraph(inline.splice(0), width, measure)); };
        for (const node of parent.childNodes) {
            if (node.nodeType === 3 || (node.nodeType === 1 && /^(STRONG|B|EM|I|SPAN|A|SUB|SUP|BR)$/.test(node.tagName) && !node.querySelector('svg,img,table'))) { inline.push(node); continue; }
            if (node.nodeType !== 1) continue;
            await flush();
            if (node.matches('button,script,style,[hidden],.note-filter-hidden,.note-filter-empty,.inline-edit-btn,.note-edit-btn,.copy-block-btn,.bookmark-btn')) continue;
            if (node.matches('h1,h2,h3,h4,h5,h6,.part-title,.topic-title,.subsection-title')) {
                output.push({ text: node.textContent.trim(), fontSize: node.matches('h1,h2,.part-title') ? 16 : 13, bold: true, margin: [0, 4, 0, 9], headlineLevel: 1, newSection: true });
            } else if (node.matches(BLOCKS)) {
                const kind = Object.keys(LABELS).find(key => node.classList.contains(key + '-box'));
                const stack = await children(node, width - 16, measure, english);
                if (kind) stack.unshift({ text: english ? kind[0].toUpperCase() + kind.slice(1) : LABELS[kind], fontSize: 8, color: '#535963', bold: true, margin: [0, 0, 0, 6] });
                if (stack.length) output.push({ table: { widths: ['*'], headerRows: kind ? 1 : 0, keepWithHeaderRows: Math.min(2, stack.length - 1), body: stack.map(content => [{ stack: [content], fillColor: '#f8f9fa' }]) }, layout: { hLineWidth: (i, table) => i === 0 || i === table.table.body.length ? .5 : 0, vLineWidth: () => .5, hLineColor: () => '#d5d9df', vLineColor: () => '#d5d9df', paddingLeft: () => 7, paddingRight: () => 7, paddingTop: i => i === 0 ? 8 : 0, paddingBottom: (i, table) => i === table.table.body.length - 1 ? 3 : 0 }, margin: [0, 0, 0, 9] });
            } else if (node.tagName === 'IMG') output.push(await illustration(node, width));
            else if (node.localName === 'svg') output.push(svgFigure(node, width));
            else if (node.matches('ul,ol')) {
                const list = [];
                for (const li of node.children) list.push({ stack: await children(li, width - 14, measure, english) });
                if (list.length) output.push({ [node.tagName === 'UL' ? 'ul' : 'ol']: list, margin: [0, 3, 0, 6] });
            } else if (node.tagName === 'TABLE') {
                const rows = [];
                for (const row of node.rows) {
                    const cells = [];
                    for (const cell of row.cells) {
                        cells.push({ stack: await children(cell, width / row.cells.length - 12, measure, english), colSpan: cell.colSpan, rowSpan: cell.rowSpan });
                        for (let i = 1; i < cell.colSpan; i++) cells.push({});
                    }
                    rows.push(cells);
                }
                if (rows.length) output.push({ table: { headerRows: node.tHead?.rows.length || 0, widths: rows[0].map(() => '*'), body: rows }, layout: 'lightHorizontalLines', margin: [0, 4, 0, 8] });
            } else output.push(...await children(node, width, measure, english));
        }
        await flush();
        return output;
    }

    async function generate(items, title) {
        await dependencies();
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none;';
        host.inert = true;
        document.body.append(host);
        const shadow = host.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = ':host{color:#17191d} .paragraph{font:14.6667px/1.5 AlmanionPDF,Roboto,sans-serif;white-space:normal;overflow-wrap:anywhere} strong,b{font-weight:700} em,i{font-style:italic} .pdf-math{display:inline-block;vertical-align:middle;line-height:0;margin-inline:.16em}.pdf-math.display{display:block;text-align:center;margin:10px 0}.pdf-math svg{max-width:100%;height:auto}';
        shadow.append(style);
        const measure = document.createElement('div'); shadow.append(measure);
        try {
            const content = [];
            let previousGroup = null;
            for (const item of items) {
                const clone = item.element.cloneNode(true);
                clone.querySelectorAll('[hidden],[data-note-filter-hidden],.note-filter-empty,button,script,style,.inline-edit-btn,.note-edit-btn').forEach(node => node.remove());
                clone.querySelectorAll('[data-note-filter-shell]').forEach(node => node.replaceWith(...node.childNodes));
                const group = item.element.closest('.content-section');
                if (group && group !== previousGroup) {
                    const heading = group.querySelector('.part-title');
                    if (heading && item.element !== group) content.push({ text: heading.textContent.trim(), fontSize: 16, bold: true, margin: [0, 0, 0, 10], pageBreak: content.length ? 'before' : undefined });
                    previousGroup = group;
                } else if (content.length) content.push({ text: '', pageBreak: 'before' });
                const converted = await children(clone, WIDTH, measure, document.documentElement.lang === 'en');
                let hasBody = false;
                converted.forEach(node => {
                    if (node.newSection && hasBody) node.pageBreak = 'before';
                    if (!node.newSection) hasBody = true;
                    content.push(node);
                });
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            if (!content.length) throw new Error('В выбранных разделах нет материала для экспорта.');
            const definition = {
                info: { title, author: '@Almanion239', subject: 'Конспект' }, pageSize: 'A4',
                pageMargins: [39.69, 42.52, 39.69, 51.02], // 14 / 15 / 14 / 18 mm.
                defaultStyle: { font: 'NotoSans', fontSize: 11, color: INK }, content,
                footer: (page, pages) => ({ columns: [{ text: '@Almanion239' }, { text: page + ' / ' + pages, alignment: 'right' }], margin: [39.69, 16, 39.69, 0], fontSize: 9, color: '#535963' }),
                pageBreakBefore: (node, following) => node.headlineLevel === 1 && following.length === 0
            };
            return await new Promise((resolve, reject) => {
                try {
                    // Every image/font is already local or embedded. Build a
                    // stream directly so layout failures reject this promise;
                    // the callback API otherwise throws in an internal promise
                    // and can leave the export button busy indefinitely.
                    const stream = pdfMake.createPdf(definition).getStream();
                    const chunks = [];
                    stream.on('data', chunk => chunks.push(chunk));
                    stream.on('error', reject);
                    stream.on('end', () => resolve(new Blob(chunks, { type: 'application/pdf' })));
                    stream.end();
                } catch (error) { reject(error); }
            });
        } finally { host.remove(); }
    }
    window.AlmanionPdfDownload = Object.freeze({ generate });
})();
