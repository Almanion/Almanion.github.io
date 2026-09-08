'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'print-export.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles', 'print.css'), 'utf8');
const legacy = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const pages = [
    'chemistry-10.html', 'chemistry.html', 'english.html', 'geometry-formulas.html',
    'geometry.html', 'likbez.html', 'literature-10.html', 'math.html',
    'physics-10.html', 'physics-exam.html', 'physics.html'
];

assert.doesNotMatch(legacy, /function exportToPDF\s*\(/, 'legacy print mutation must be removed');
assert.match(source, /document\.querySelectorAll\('\.main-content details:not\(\[open\]\)'\)/);
assert.match(source, /waitForPrintableAssets/);
assert.match(source, /collectCatalogue/);
assert.match(source, /data-print-group-toggle/);
assert.match(source, /data-print-item/);
assert.match(source, /data-print-preset="current"/);
assert.match(source, /printExportDownload/);
assert.match(source, /print-export-menu-slot/);
assert.match(source, /window\.addEventListener\('beforeprint'/);
assert.match(source, /window\.addEventListener\('afterprint'/);
assert.match(source, /window\.print\(\)/);
assert.match(css, /@page\s*\{[\s\S]*size:\s*A4 portrait/);
assert.match(css, /counter\(page\)[\s\S]*counter\(pages\)/);
assert.match(css, /\.main-content > \.content-section \+ \.content-section\s*\{\s*break-before:\s*page/);
assert.match(css, /\.content-section\[data-print-first-section\]/);
assert.match(css, /\[data-print-excluded\]\s*\{\s*display:\s*none\s*!important/);
assert.match(css, /\.topic\[data-print-excluded\][\s\S]*display:\s*none\s*!important/);
assert.match(css, /\.print-splittable[\s\S]*break-inside:\s*auto/);
assert.match(css, /body\.experimental\.exp-reader-active \.content-section/);
assert.match(css, /\.derivation-content,[\s\S]*\.proof-content,[\s\S]*\.english-translation-content/);

pages.forEach(function (file) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /styles\/print\.css\?v=20260908-2/, file + ' must load print CSS');
    assert.match(html, /print-export\.js\?v=20260908-2/, file + ' must load print controller');
});

console.log('print-ready PDF export: all tests passed');
