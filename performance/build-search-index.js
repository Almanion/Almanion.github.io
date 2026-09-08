#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const IGNORED_ELEMENTS = new Set(['script', 'style', 'button', 'noscript', 'template']);
const IGNORED_CLASSES = new Set(['bookmark-btn', 'copy-block-btn', 'formula-copy-btn', 'toggle-derivation', 'toggle-proof', 'katex-html', 'MathJax_Preview']);

function decodeEntities(value) {
    const named = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
    return String(value || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
        if (entity[0] === '#') {
            const hex = entity[1].toLowerCase() === 'x';
            const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : match;
        }
        return Object.prototype.hasOwnProperty.call(named, entity.toLowerCase()) ? named[entity.toLowerCase()] : match;
    });
}

function attribute(source, name) {
    const expression = new RegExp("(?:^|\\s)" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", 'i');
    const match = source.match(expression);
    return match ? decodeEntities(match[1] || match[2] || match[3] || '') : '';
}

function cleanText(value) {
    return decodeEntities(value)
        .replace(/\\(?:begin|end)\{[^}]+\}/g, ' ')
        .replace(/\\(?:left|right|displaystyle|textstyle|limits)\b/g, '')
        .replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, '$1')
        .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2')
        .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
        .replace(/\\[a-zA-Z]+\*?/g, ' ')
        .replace(/[{}$]/g, '')
        .replace(/\s*[_^]\s*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseStartTag(token) {
    const match = token.match(/^<\s*([a-zA-Z][\w:-]*)([\s\S]*?)\/?\s*>$/);
    if (!match) return null;
    const name = match[1].toLowerCase();
    const attributes = match[2] || '';
    return {
        name,
        id: attribute(attributes, 'id'),
        classes: new Set(attribute(attributes, 'class').split(/\s+/).filter(Boolean)),
        void: VOID_ELEMENTS.has(name) || /\/\s*>$/.test(token)
    };
}

function isIgnored(frame) {
    return frame.ignored || Array.from(frame.classes).some(className => IGNORED_CLASSES.has(className));
}

function parseEntries(html, page) {
    const entries = [];
    const stack = [];
    const activeEntries = [];
    const tokens = String(html || '').match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[^>]+>|[^<]+/g) || [];

    function finishFrame(frame) {
        (frame.headingEntries || []).forEach(entry => {
            if (!entry.title) entry.title = cleanText(entry.heading.join(' '));
            entry.heading = [];
        });
        if (frame.entry) {
            const index = activeEntries.lastIndexOf(frame.entry);
            if (index >= 0) activeEntries.splice(index, 1);
            const text = cleanText(frame.entry.text.join(' '));
            if (frame.entry.id && text) {
                entries.push({
                    page: page.path,
                    subject: page.label,
                    id: frame.entry.id,
                    title: frame.entry.title || `Раздел ${entries.length + 1}`,
                    text
                });
            }
        }
    }

    tokens.forEach(token => {
        if (!token || token.startsWith('<!--') || /^<!/i.test(token)) return;
        if (token.startsWith('</')) {
            const closing = (token.match(/^<\/\s*([\w:-]+)/) || [])[1];
            if (!closing) return;
            while (stack.length) {
                const frame = stack.pop();
                finishFrame(frame);
                if (frame.name === closing.toLowerCase()) break;
            }
            return;
        }
        if (token.startsWith('<')) {
            const tag = parseStartTag(token);
            if (!tag) return;
            const parentIgnored = stack.length ? stack[stack.length - 1].ignored : false;
            const frame = {
                name: tag.name,
                classes: tag.classes,
                ignored: parentIgnored || IGNORED_ELEMENTS.has(tag.name),
                entry: null,
                headingEntries: []
            };
            frame.ignored = isIgnored(frame);

            if (!frame.ignored && tag.id && (tag.classes.has('topic') || tag.classes.has('content-section'))) {
                frame.entry = { id: tag.id, title: '', text: [], heading: [] };
                activeEntries.push(frame.entry);
            }
            const heading = !frame.ignored && (/^h[1-3]$/.test(tag.name)
                || tag.classes.has('topic-title') || tag.classes.has('part-title'));
            if (heading) {
                frame.headingEntries = activeEntries.filter(entry => !entry.title);
                frame.headingEntries.forEach(entry => { entry.heading = []; });
            }

            if (tag.name === 'br') {
                activeEntries.forEach(entry => entry.text.push(' '));
                frame.headingEntries.forEach(entry => entry.heading.push(' '));
            }
            if (tag.void) finishFrame(frame);
            else stack.push(frame);
            return;
        }

        if (!stack.length || stack[stack.length - 1].ignored) return;
        const text = decodeEntities(token);
        activeEntries.forEach(entry => entry.text.push(text));
        stack.forEach(frame => frame.headingEntries.forEach(entry => entry.heading.push(text)));
    });
    while (stack.length) finishFrame(stack.pop());
    return entries;
}

function build(options) {
    const root = path.resolve(options.root);
    const site = path.resolve(options.site || root);
    const output = path.resolve(options.output || path.join(site, 'search-index.json'));
    const pages = JSON.parse(fs.readFileSync(path.join(root, 'performance', 'search-pages.json'), 'utf8'));
    const entries = pages.flatMap(page => {
        const file = path.join(site, page.path);
        if (!fs.existsSync(file)) throw new Error('Search source is missing: ' + page.path);
        return parseEntries(fs.readFileSync(file, 'utf8'), page);
    });
    const digest = crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 16);
    const document = { schemaVersion: 1, version: digest, entries };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(document), 'utf8');
    return { output, entries: entries.length, bytes: fs.statSync(output).size, version: digest };
}

function parseArgs(argv) {
    const options = { root: path.resolve(__dirname, '..'), site: null, output: null };
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === '--root') options.root = path.resolve(argv[++index]);
        else if (value === '--site') options.site = path.resolve(argv[++index]);
        else if (value === '--output') options.output = path.resolve(argv[++index]);
        else throw new Error('Unknown or incomplete argument: ' + value);
    }
    if (!options.site) options.site = options.root;
    return options;
}

if (require.main === module) {
    try {
        const result = build(parseArgs(process.argv.slice(2)));
        console.log('Search index: ' + result.entries + ' sections, ' + result.bytes + ' bytes, ' + result.version);
    } catch (error) {
        console.error(error && error.stack || error);
        process.exitCode = 1;
    }
}

module.exports = { build, parseEntries, cleanText, decodeEntities };
