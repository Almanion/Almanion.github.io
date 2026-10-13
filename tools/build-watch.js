'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const Search = require('../performance/build-search-index');
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr', 'area', 'embed', 'col']);
const TYPES = ['definition', 'theorem', 'lemma', 'statement', 'formula', 'corollary', 'properties', 'proof', 'derivation', 'experiment', 'remark', 'example', 'exercise', 'reminder', 'system'];
const SEMANTIC = new Set(['p', 'ul', 'ol', 'table', 'figure', 'svg', 'pre', 'blockquote', 'details']);
const hash = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
const attr = (text, name) => Search.decodeEntities((text.match(new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i')) || []).slice(1).find(Boolean) || '');
function tree(html) {
    const root = { tag: '', children: [], start: 0, inner: 0, end: html.length, classes: new Set() }, stack = [root];
    const tags = /<!--[\s\S]*?-->|<\/?[a-zA-Z][\w:-]*(?:\s+(?:"[^"]*"|'[^']*'|[^'"<>])*?)?\s*\/?>/g;
    let match;
    while ((match = tags.exec(html))) {
        const raw = match[0]; if (raw.startsWith('<!--')) continue;
        const tag = raw.match(/^<\/?([\w:-]+)/)[1].toLowerCase();
        if (raw.startsWith('</')) {
            const index = stack.findLastIndex(node => node.tag === tag);
            if (index > 0) while (stack.length > index) { const node = stack.pop(); node.close = match.index; node.end = tags.lastIndex; }
            continue;
        }
        const parent = stack[stack.length - 1];
        const node = { tag, parent, children: [], start: match.index, inner: tags.lastIndex, end: tags.lastIndex,
            id: attr(raw, 'id'), blockId: attr(raw, 'data-note-block'), classes: new Set(attr(raw, 'class').split(/\s+/)) };
        parent.children.push(node);
        if (tag === 'script' || tag === 'style') {
            const closing = new RegExp('</' + tag + '\\s*>', 'ig'); closing.lastIndex = tags.lastIndex;
            const end = closing.exec(html); node.end = end ? closing.lastIndex : html.length; tags.lastIndex = node.end;
        } else if (!VOID.has(tag) && !raw.endsWith('/>')) stack.push(node);
    }
    while (stack.length > 1) { const node = stack.pop(); node.close = html.length; node.end = html.length; }
    return root;
}
function all(node, predicate) {
    return node.children.flatMap(child => [...(predicate(child) ? [child] : []), ...all(child, predicate)]);
}
function readable(html) {
    return Search.decodeEntities(html.replace(/<!--[\s\S]*?-->|<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function kind(node) { return TYPES.find(type => node.classes.has(type + '-box')) || (node.classes.has('accent-word-card') ? 'stress' : 'text'); }
function extract(html, page) {
    const root = tree(html), main = all(root, node => node.tag === 'main' || node.classes.has('main-content'))[0];
    if (!main) return [];
    let topics = all(main, node => node.classes.has('topic') && node.id);
    if (!topics.length) topics = all(main, node => node.classes.has('content-section') && node.id);
    return topics.map(topic => {
        const heading = all(topic, node => node.classes.has('topic-title') || /^h[1-3]$/.test(node.tag))[0];
        let parent = topic.parent;
        while (parent && !parent.classes.has('content-section')) parent = parent.parent;
        const group = parent?.children.find(node => node.classes.has('part-title') || /^h[12]$/.test(node.tag));
        const blocks = [], used = new Map();
        function add(fragment, node) {
            fragment = fragment.trim();
            if (!readable(fragment) && !/<(?:img|svg)\b/.test(fragment)) return;
            const base = node?.blockId || node?.id || 'block-' + hash(fragment);
            const occurrence = used.get(base) || 0; used.set(base, occurrence + 1);
            blocks.push({ id: base + (occurrence ? '-' + occurrence : ''), type: node ? kind(node) : 'text', html: fragment });
        }
        function visit(container) {
            let cursor = container.inner;
            for (const node of container.children) {
                add(html.slice(cursor, node.start)); cursor = node.end;
                if (node === heading || node.classes.has('topic-title') || node.classes.has('part-title') || ['script', 'style', 'button', 'noscript', 'template', 'form', 'input', 'label', 'textarea', 'select'].includes(node.tag)) continue;
                if (kind(node) !== 'text' || SEMANTIC.has(node.tag) || VOID.has(node.tag)) add(html.slice(node.start, node.end), node);
                else if (node.children.length) visit(node);
                else add(html.slice(node.start, node.end), node);
            }
            add(html.slice(cursor, container.close || container.end));
        }
        visit(topic);
        return { id: topic.id, title: heading ? readable(html.slice(heading.inner, heading.close)) : topic.id,
            group: group ? readable(html.slice(group.inner, group.close)) : '', blocks };
    }).filter(topic => topic.blocks.length);
}
function build({ root, site }) {
    const directory = path.join(site, 'watch', 'data'); fs.mkdirSync(directory, { recursive: true });
    const figures = path.join(site, 'watch', 'figures'); fs.mkdirSync(figures, { recursive: true });
    function preserveGraphics(block) {
        const graphicNodes = all(tree(block.html), node => node.tag === 'svg').filter(node => {
            let parent = node.parent; while (parent) { if (parent.tag === 'svg') return false; parent = parent.parent; } return true;
        }).sort((a,b) => b.start - a.start);
        for (const node of graphicNodes) {
            let source = block.html.slice(node.start, node.end);
            if (!/\bxmlns\s*=/.test(source.match(/^<svg\b[^>]*>/)[0])) source = source.replace(/^<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
            if (/xlink:/.test(source) && !/xmlns:xlink=/.test(source)) source = source.replace(/^<svg\b/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
            const file = hash(source) + '.svg';
            fs.writeFileSync(path.join(figures, file), source + '\n');
            block.html = block.html.slice(0, node.start) + '<img src="watch/figures/' + file + '" alt="Схема" loading="lazy">' + block.html.slice(node.end);
        }
    }
    const publicPages = Search.publicPages(root), subjects = [];
    for (const page of publicPages) {
        if (!/^[a-z0-9-]+\.html$/.test(page.path)) throw new Error('Unsafe watch source: ' + page.path);
        const topics = extract(fs.readFileSync(path.join(site, page.path), 'utf8'), page);
        if (!topics.length) continue;
        const id = page.path.replace('.html', ''), summary = [];
        if (id === 'russian-ege') {
            const blocks = topics.flatMap(topic => topic.blocks).filter(block => block.type === 'stress').sort((a,b) => Number(a.id.replace('stress-','')) - Number(b.id.replace('stress-','')));
            topics.unshift({ id:'stress-all', title:'Все', group:'Ударения', blocks });
        }
        for (const topic of topics) topic.blocks.forEach(preserveGraphics);
        for (const topic of topics) {
            const parts = []; let chunk = [];
            function flush() {
                if (!chunk.length) return;
                const content = JSON.stringify({ schemaVersion: 1, blocks: chunk });
                const file = hash(content) + '.json'; fs.writeFileSync(path.join(directory, file), content + '\n');
                parts.push({ path: 'data/' + file, count: chunk.length }); chunk = [];
            }
            for (const block of topic.blocks) {
                if (chunk.length && Buffer.byteLength(JSON.stringify(chunk.concat(block))) > 85000) flush();
                chunk.push(block);
            }
            flush();
            const terms = topic.blocks.flatMap((block, index) => {
                const strong = block.html.match(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/i);
                const term = strong ? readable(strong[1]) : '';
                return term && term.length <= 120 ? [{ term, index }] : [];
            });
            summary.push({ id: topic.id, title: topic.title, group: topic.group, count: topic.blocks.length, parts, terms });
        }
        const content = JSON.stringify({ schemaVersion: 1, id, page: page.path, title: page.label, topics: summary });
        const file = id + '-' + hash(content) + '.json'; fs.writeFileSync(path.join(directory, file), content + '\n');
        subjects.push({ id, title: page.label, page: page.path, path: 'data/' + file, topics: topics.length,
            grades: id === 'russian-ege' ? [10, 11] : /-10$/.test(id) ? [10] : id === 'physics-exam' ? [11] : [9],
            extra: ['likbez', 'geometry-formulas'].includes(id) });
    }
    const context = {};
    vm.runInNewContext(fs.readFileSync(path.join(root, 'duty.js'), 'utf8'), context, { timeout:1000 });
    const duty = { schemaVersion:1, entries:context.AlmanionDuty.normalizeSchedule(context.AlmanionDuty.DEFAULT_SCHEDULE).entries.map(entry => ({ start:entry.start, end:entry.end, people:entry.people, segments:entry.segments })) };
    const dutyContent = JSON.stringify(duty), dutyFile = 'duty-' + hash(dutyContent) + '.json';
    fs.writeFileSync(path.join(directory, dutyFile), dutyContent + '\n');
    const database = fs.readFileSync(path.join(root, 'firebase-config.js'), 'utf8').match(/databaseURL:\s*["']([^"']+)["']/)[1];
    const catalogue = JSON.stringify({ schemaVersion: 1, subjects, duty:{ path:'data/' + dutyFile, endpoint:new URL('classDuty/grade10_1/entries.json', database).href } });
    fs.writeFileSync(path.join(site, 'watch', 'catalogue.json'), catalogue + '\n');
    const worker = path.join(site, 'watch', 'sw.js');
    const version = hash(catalogue + ['index.html', 'watch.js', 'watch.css'].map(file => fs.readFileSync(path.join(site, 'watch', file), 'utf8')).join(''));
    const shell = path.join(site, 'watch', 'index.html');
    fs.writeFileSync(shell, fs.readFileSync(shell, 'utf8').replace(/(watch\.(?:js|css)\?v=)[^"']+/g, '$1' + version));
    fs.writeFileSync(worker, fs.readFileSync(worker, 'utf8').replace('__WATCH_VERSION__', version).replace(/(watch\.(?:js|css)\?v=)[^"']+/g, '$1' + version));
    return { subjects: subjects.length, topics: subjects.reduce((sum, subject) => sum + subject.topics, 0) };
}
module.exports = { build, extract, tree };
