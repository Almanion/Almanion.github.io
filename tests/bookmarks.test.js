'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'bookmarks.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles', 'bookmarks.css'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'note-runtime.js'), 'utf8');

assert.match(script, /dataset\.noteBlock \|\| box\.dataset\.kcId/,
    'bookmark identity must prefer the stable constructor block id');
assert.match(script, /'__b__' \+ encodeURIComponent\(key\)/,
    'new bookmark ids must encode the stable block id');
assert.match(script, /function migrateLegacyBookmark/,
    'old positional bookmarks must be migrated');
assert.match(script, /almanion-account-ready/,
    'bookmarks loaded before Firebase must reconnect when the account becomes ready');
assert.match(script, /target\.origin !== location\.origin/,
    'bookmark navigation must stay on the same site');
assert.match(script, /RESTORE_TARGET_KEY[\s\S]*sessionStorage\.removeItem/,
    'a pending cross-page target must be cleared after restoration');
assert.match(script, /function undoLastRemoval/,
    'deleting a bookmark from the list must be reversible');
assert.match(script, /event\.key === 'Escape'/,
    'the bookmarks dialog must close from the keyboard');
assert.match(script, /event\.key !== 'ArrowUp' && event\.key !== 'ArrowDown'/,
    'manual order must also be available from the keyboard');

assert.match(css, /\.bookmarks-panel[\s\S]*width:\s*min\(36rem/,
    'desktop bookmarks must use a compact side panel');
assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.bookmarks-panel[\s\S]*border-radius:\s*20px 20px 0 0/,
    'mobile bookmarks must use a bottom sheet');
assert.match(css, /\.bookmark-btn:not\(\.bookmarked\):hover \.bookmark-icon[\s\S]*fill:\s*none !important/,
    'hover must not make an unsaved bookmark look filled');
assert.match(runtime, /ensure\('bookmarks'\)/,
    'bookmarks must load without waiting for account initialization');

['geometry-formulas.html', 'physics-exam.html'].forEach(function (page) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /styles\/bookmarks\.css\?v=20260920-1/,
        page + ' must load the redesigned bookmarks layer');
    assert.match(html, /bookmarks\.js\?v=20260920-1/,
        page + ' must load the current bookmarks runtime');
});

console.log('bookmarks: interface and lifecycle checks passed');
