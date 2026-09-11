#!/usr/bin/env node
'use strict';

// Одноразовая, но повторяемая миграция старых монолитных конспектов.
// Она переносит каждый верхнеуровневый .content-section вместе с относящимися
// к нему пунктами меню в отдельный JSON. После миграции HTML собирается только
// из content/<subject>/sections/*.json.

const fs = require('fs');
const path = require('path');
const { MARKERS, HTML_FRAGMENT_FORMAT } = require('./build-notes.js');

const SUBJECTS = {
    physics: [
        { id: 'main-definitions', title: 'Главные определения' },
        { id: 'mechanics', title: 'Часть I: Механика' }
    ],
    chemistry: [
        { id: 'theoretical-foundations', title: 'Часть 0: Теоретические основы' },
        { id: 'inorganic-chemistry', title: 'Часть I: Неорганическая химия' },
        { id: 'elements-and-reactions', title: 'Часть II: Элементы и качественные реакции' }
    ],
    math: [
        { id: 'functions-and-equations', title: 'Функции и уравнения' }
    ],
    geometry: [
        { id: 'vector-geometry', title: 'Часть I: Векторная геометрия' }
    ]
};

function findClosingTag(source, start, tag) {
    const token = new RegExp('<\\/?' + tag + '\\b[^>]*>', 'gi');
    token.lastIndex = start;
    let depth = 0;
    let match;
    while ((match = token.exec(source))) {
        const closing = /^<\s*\//.test(match[0]);
        if (closing) depth -= 1;
        else if (!/\/\s*>$/.test(match[0])) depth += 1;
        if (depth === 0) return token.lastIndex;
    }
    throw new Error('Не найден закрывающий </' + tag + '>');
}

function findRootElements(source, tag, start, end, openingPredicate) {
    const opening = new RegExp('<' + tag + '\\b[^>]*>', 'gi');
    opening.lastIndex = start;
    const elements = [];
    let match;
    while ((match = opening.exec(source)) && match.index < end) {
        if (openingPredicate && !openingPredicate(match[0])) continue;
        const close = findClosingTag(source, match.index, tag);
        if (close > end) throw new Error('<' + tag + '> выходит за границы области');
        elements.push({ start: match.index, end: close, html: source.slice(match.index, close) });
        opening.lastIndex = close;
    }
    return elements;
}

function dedent(value, width) {
    const lines = String(value).replace(/^\s*\n|\n\s*$/g, '').split(/\r?\n/);
    if (Number.isInteger(width) && width > 0) {
        const prefix = ' '.repeat(width);
        return lines.map(line => line.startsWith(prefix) ? line.slice(width) : line).join('\n');
    }
    const indents = lines.filter(line => line.trim()).map(line => (line.match(/^\s*/) || [''])[0].length);
    const inferredWidth = indents.length ? Math.min(...indents) : 0;
    return lines.map(line => line.slice(Math.min(inferredWidth, (line.match(/^\s*/) || [''])[0].length))).join('\n');
}

function indentationAt(source, index) {
    const lineStart = source.lastIndexOf('\n', index) + 1;
    return (source.slice(lineStart, index).match(/^\s*/) || [''])[0].length;
}

function findContainingList(source, markerIndex) {
    const starts = [];
    const tag = /<\/?ul\b[^>]*>/gi;
    let match;
    while ((match = tag.exec(source)) && match.index < markerIndex) {
        if (/^<\s*\//.test(match[0])) starts.pop();
        else starts.push({ start: match.index, openEnd: tag.lastIndex });
    }
    if (!starts.length) throw new Error('Не найден список меню перед маркером');
    return starts[starts.length - 1];
}

function linkedIds(html) {
    return Array.from(html.matchAll(/href=["']#([^"']+)["']/gi), match => match[1]);
}

function prepareLegacyHtml(html) {
    return dedent(html)
        .replace(/\s*<script>[\s\S]*?<\/script>\s*/gi, '\n')
        .replace(/\s+onclick=["']window\.chemScrollToOxideReactions\(\)["']/gi, ' data-chem-scroll-to-oxide-reactions');
}

function migrateSubject(root, subjectId, plan, write) {
    const page = subjectId + '.html';
    const pagePath = path.join(root, page);
    let source = fs.readFileSync(pagePath, 'utf8');
    const navMarker = source.indexOf(MARKERS.navStart);
    const contentMarker = source.indexOf(MARKERS.contentStart);
    if (navMarker < 0 || contentMarker < 0) throw new Error(page + ': нет маркеров конструктора');

    const mainStart = source.indexOf('<main class="main-content"');
    const headerEnd = source.indexOf('</header>', mainStart) + '</header>'.length;
    const sections = findRootElements(
        source,
        'section',
        headerEnd,
        contentMarker,
        tag => /class=["'][^"']*\bcontent-section\b/i.test(tag)
    );
    if (!sections.length) {
        console.log(subjectId + ': уже перенесён, пропуск');
        return false;
    }
    if (sections.length !== plan.length) {
        throw new Error(page + ': ожидалось разделов ' + plan.length + ', найдено ' + sections.length);
    }

    const navList = findContainingList(source, navMarker);
    const navItems = findRootElements(source, 'li', navList.openEnd, navMarker);
    const targetSets = sections.map(section => new Set(Array.from(section.html.matchAll(/\bid=["']([^"']+)["']/gi), m => m[1])));
    const navBySection = sections.map(() => []);
    navItems.forEach(item => {
        const targets = linkedIds(item.html);
        const sectionIndex = targetSets.findIndex(ids => targets.some(id => ids.has(id)));
        if (sectionIndex < 0) throw new Error(page + ': пункт меню не привязан к разделу: ' + item.html.slice(0, 100));
        navBySection[sectionIndex].push(dedent(item.html, indentationAt(source, item.start)));
    });

    const sectionsDir = path.join(root, 'content', subjectId, 'sections');
    const manifestPath = path.join(root, 'content', subjectId, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.sections = plan.map((item, index) => ({ id: item.id, order: (index + 1) * 1000 }));

    const payloads = plan.map((item, index) => ({
        schemaVersion: 1,
        sourceFormat: HTML_FRAGMENT_FORMAT,
        id: item.id,
        subject: subjectId,
        title: item.title,
        order: (index + 1) * 1000,
        navHtml: navBySection[index].join('\n'),
        contentHtml: prepareLegacyHtml(dedent(sections[index].html, indentationAt(source, sections[index].start)))
    }));

    if (!write) {
        console.log(subjectId + ': ' + payloads.length + ' разделов, ' + navItems.length + ' пунктов меню');
        return true;
    }

    fs.mkdirSync(sectionsDir, { recursive: true });
    payloads.forEach(payload => {
        fs.writeFileSync(path.join(sectionsDir, payload.id + '.json'), JSON.stringify(payload, null, 2) + '\n');
    });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

    // Удаляем прежнюю ручную разметку. Следующий build-notes восстановит её
    // между маркерами уже из канонических JSON-файлов.
    source = source.slice(0, navList.openEnd) + '\n                    ' + source.slice(navMarker);
    const shiftedContentMarker = source.indexOf(MARKERS.contentStart);
    const shiftedMainStart = source.indexOf('<main class="main-content"');
    const shiftedHeaderEnd = source.indexOf('</header>', shiftedMainStart) + '</header>'.length;
    source = source.slice(0, shiftedHeaderEnd) + '\n\n        ' + source.slice(shiftedContentMarker);
    fs.writeFileSync(pagePath, source);
    console.log(subjectId + ': перенесено ' + payloads.length + ' разделов');
    return true;
}

function main() {
    const rootArg = process.argv.indexOf('--root');
    const root = rootArg >= 0 && process.argv[rootArg + 1]
        ? path.resolve(process.argv[rootArg + 1])
        : process.cwd();
    const write = process.argv.includes('--write');
    Object.entries(SUBJECTS).forEach(([subject, plan]) => migrateSubject(root, subject, plan, write));
    if (!write) console.log('Проверка завершена. Для переноса добавьте --write.');
}

if (require.main === module) main();

module.exports = { SUBJECTS, findClosingTag, findRootElements, dedent, indentationAt, linkedIds, prepareLegacyHtml, migrateSubject };
