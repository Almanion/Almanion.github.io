'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const runtime = fs.readFileSync(path.join(root, 'note-runtime.js'), 'utf8');
const pages = ['physics.html', 'chemistry.html', 'math.html', 'geometry.html', 'likbez.html', 'physics-10.html', 'chemistry-10.html', 'literature-10.html', 'russian-ege.html'];

pages.forEach(function (page) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /styles\/site\/reader\.css\?v=20260920-3/, page + ' must use the reader-first stylesheet');
    assert.match(html, /note-runtime\.js\?v=[^"']+/, page + ' must use the progressive runtime');
    assert.doesNotMatch(html, /gstatic\.com\/firebasejs/, page + ' must not block first paint on Firebase');
    assert.ok(html.indexOf('kc-storage.js') < html.indexOf('note-runtime.js'), page + ' must prepare scoped storage first');
});

assert.match(runtime, /requestIdleCallback/);
assert.match(runtime, /loadStyle\('featureStyles'\)/);
assert.match(runtime, /Promise\.allSettled/);
assert.match(runtime, /onIntent\('#searchInput/);
assert.match(runtime, /firebaseApp:[\s\S]*firebaseDatabase:[\s\S]*firebaseAuth:/);

const readerCss = fs.readFileSync(path.join(root, 'styles', 'site', 'reader.css'), 'utf8');
const componentsCss = fs.readFileSync(path.join(root, 'styles', 'site', '00-components.css'), 'utf8');
assert.match(readerCss, /00-components\.css\?v=20260920-2/, 'reader CSS must cache-bust shared controls');
assert.match(componentsCss, /\.knowledge-check-btn \.btn-icon\s*\{[\s\S]*?width:\s*1rem;[\s\S]*?height:\s*1rem;/, 'sidebar action icons must keep their compact size');
assert.match(componentsCss, /\.auth-overlay\.hidden\s*\{\s*display:\s*none\s*!important;/, 'closed dialogs must be hidden from the first paint');
const featuresCss = fs.readFileSync(path.join(root, 'styles', 'site', 'features.css'), 'utf8');
assert.match(runtime, /featureStyles:\s*'styles\/site\/features\.css\?v=20260920-3'/, 'feature layer must be cache-busted');
assert.match(runtime, /bookmarksStyles:\s*'styles\/bookmarks\.css\?v=20260920-1'/, 'bookmarks must have a cache-busted deferred style layer');
assert.match(runtime, /bookmarks:\s*loadBookmarks/, 'bookmarks must be independently available when account services are offline');
assert.match(runtime, /knowledge:\s*function \(\) \{ return loadStyle\('featureStyles'\)\.then\(function \(\) \{ return loadScript\('knowledge'\); \}\); \}/, 'knowledge check must wait for its modal foundation');
assert.match(featuresCss, /\.auth-overlay\.hidden\s*\{\s*display:\s*none\s*!important;/, 'closed deferred dialogs must stay outside note-page layout');
assert.match(featuresCss, /\.auth-overlay\s*\{[\s\S]*?position:\s*fixed;/, 'deferred dialogs must open as overlays');

console.log('progressive note-page runtime: all tests passed');
