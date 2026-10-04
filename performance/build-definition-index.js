'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Search = require('./build-search-index');
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr', 'area', 'embed']);
const GENERIC = /^(?:определени[ея]|definition|основные определения|термин|теорема|лемма|свойства|следствие|формула|формулировка)$/i;
const attr = (tag, name) => Search.decodeEntities((tag.match(new RegExp('(?:^|\\s)' + name + '\\s*=\\s*["\']([^"\']*)["\']', 'i')) || [])[1] || '');

function parseDefinitions(html, page) {
    const entries = [], stack = [];
    function finish(frame, end) {
        if (!frame.definition || !frame.id) return;
        const inner = html.slice(frame.start, end);
        const strong = inner.match(/^\s*(?:<p\b[^>]*>\s*)?<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/i);
        const term = Search.decodeEntities((strong?.[1] || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').replace(/\s*(?:--|—|:)\s*$/, '').trim();
        if (!term || term.length > 160 || GENERIC.test(term)) return;
        // Keep source notation and nested formulas; rendering still goes through
        // the shared allow-list sanitizer, never raw innerHTML from this index.
        entries.push({ term, html: inner.replace(/<(script|style|button)\b[^>]*>[\s\S]*?<\/\1>/gi, ''), page: page.path, subject: page.label, id: frame.id });
    }
    for (const match of html.matchAll(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>/g)) {
        const token = match[0];
        if (token.startsWith('<!--')) continue;
        const name = token.match(/^<\/?([\w:-]+)/)?.[1]?.toLowerCase();
        if (token.startsWith('</')) {
            while (stack.length) {
                const frame = stack.pop();
                finish(frame, match.index);
                if (frame.name === name) break;
            }
        } else {
            const classes = attr(token, 'class').split(/\s+/);
            const parent = stack[stack.length - 1];
            const id = attr(token, 'id') || parent?.id || '';
            const ignored = parent?.ignored || ['script', 'style', 'template', 'noscript'].includes(name);
            const frame = { name, id, ignored, start: match.index + token.length, definition: !ignored && classes.includes('definition-box') };
            if (!VOID.has(name) && !token.endsWith('/>')) stack.push(frame);
        }
    }
    return entries;
}

function build({ root, site }) {
    const entries = Search.publicPages(root).flatMap(page => parseDefinitions(fs.readFileSync(path.join(site, page.path), 'utf8'), page));
    const seen = new Set();
    const unique = entries.filter(entry => {
        const key = entry.term + '\0' + entry.html;
        if (seen.has(key)) return false;
        seen.add(key); return true;
    });
    const version = crypto.createHash('sha256').update(JSON.stringify(unique)).digest('hex').slice(0, 16);
    fs.writeFileSync(path.join(site, 'definition-index.json'), JSON.stringify({ schemaVersion: 1, version, entries: unique }));
    return { version, entries: unique.length };
}
module.exports = { build, parseDefinitions };
