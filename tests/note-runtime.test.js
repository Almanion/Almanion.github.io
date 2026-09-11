'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const runtime = fs.readFileSync(path.join(root, 'note-runtime.js'), 'utf8');
const pages = ['physics.html', 'chemistry.html', 'math.html', 'geometry.html', 'likbez.html', 'physics-10.html', 'chemistry-10.html', 'literature-10.html'];

pages.forEach(function (page) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /styles\/site\/reader\.css\?v=20260911-2/, page + ' must use the reader-first stylesheet');
    assert.match(html, /note-runtime\.js\?v=20260911-1/, page + ' must use the progressive runtime');
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
assert.match(readerCss, /00-components\.css\?v=20260911-3/, 'reader CSS must cache-bust shared controls');
assert.match(componentsCss, /\.knowledge-check-btn \.btn-icon\s*\{[\s\S]*?width:\s*1rem;[\s\S]*?height:\s*1rem;/, 'sidebar action icons must keep their compact size');

console.log('progressive note-page runtime: all tests passed');
