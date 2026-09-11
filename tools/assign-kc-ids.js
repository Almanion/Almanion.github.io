#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGET_CLASSES = [
    'definition-box', 'formula-box', 'derivation-box', 'remark-box',
    'theorem-box', 'lemma-box', 'statement-box', 'corollary-box',
    'properties-box', 'proof-box', 'experiment-box', 'example-box'
];
const DEFAULT_FILES = [
    'physics.html', 'chemistry.html', 'math.html', 'geometry.html', 'likbez.html',
    'physics-10.html', 'chemistry-10.html', 'literature-10.html', 'english.html'
];

function hash(value) {
    let result = 2166136261;
    String(value || '').split('').forEach(function (character) {
        result ^= character.charCodeAt(0);
        result = Math.imul(result, 16777619);
    });
    return (result >>> 0).toString(36);
}

function attr(tag, name) {
    const match = tag.match(new RegExp('\\s' + name + '\\s*=\\s*(["\\\'])([\\s\\S]*?)\\1', 'i'));
    return match ? match[2] : '';
}

function blockKind(tag) {
    const classes = attr(tag, 'class').split(/\s+/);
    const className = TARGET_CLASSES.find(function (candidate) { return classes.includes(candidate); });
    return className ? className.replace(/-box$/, '') : '';
}

function assign(source) {
    const existing = new Set();
    source.replace(/\s(?:data-kc-id|data-note-block)\s*=\s*(["'])(.*?)\1/gi, function (_, quote, id) {
        existing.add(id);
        return _;
    });

    let articleId = '';
    let articleDepth = 0;
    const counters = new Map();
    let changed = 0;

    const output = source.replace(/<\/?[a-z][^>]*>/gi, function (tag) {
        const closing = /^<\//.test(tag);
        const nameMatch = tag.match(/^<\/?\s*([a-z0-9-]+)/i);
        const tagName = nameMatch ? nameMatch[1].toLowerCase() : '';

        if (closing) {
            if (tagName === 'article' && articleDepth > 0) {
                articleDepth--;
                if (articleDepth === 0) articleId = '';
            }
            return tag;
        }

        if (tagName === 'article') {
            articleDepth++;
            if (articleDepth === 1) articleId = attr(tag, 'id') || 'topic';
        }

        const kind = articleId ? blockKind(tag) : '';
        if (!kind || /\s(?:data-kc-id|data-note-block)\s*=/i.test(tag)) return tag;

        const counterKey = articleId + ':' + kind;
        const ordinal = (counters.get(counterKey) || 0) + 1;
        counters.set(counterKey, ordinal);
        let id = 'legacy-' + hash(articleId) + '-' + kind + '-' + ordinal;
        let collision = 2;
        while (existing.has(id)) id = 'legacy-' + hash(articleId) + '-' + kind + '-' + ordinal + '-' + collision++;
        existing.add(id);
        changed++;
        return tag.replace(/\s*(\/?)>$/, ' data-kc-id="' + id + '"$1>');
    });

    return { output: output, changed: changed };
}

const check = process.argv.includes('--check');
const requested = process.argv.slice(2).filter(function (arg) { return arg !== '--check'; });
const files = requested.length ? requested : DEFAULT_FILES;
let missing = 0;

files.forEach(function (relative) {
    const filename = path.resolve(ROOT, relative);
    if (!fs.existsSync(filename)) return;
    const source = fs.readFileSync(filename, 'utf8');
    const result = assign(source);
    if (!result.changed) return;
    missing += result.changed;
    if (!check) fs.writeFileSync(filename, result.output, 'utf8');
    console.log((check ? 'missing' : 'assigned') + ': ' + relative + ' (' + result.changed + ')');
});

if (check && missing) {
    console.error('Knowledge-check blocks without stable IDs: ' + missing);
    process.exitCode = 1;
}
