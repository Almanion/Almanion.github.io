'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('index.html');
const css = read(path.join('styles', 'home-dashboard.css'));
const shell = JSON.parse(read(path.join('performance', 'sw-shell.json'))).assets;

assert.match(page, /styles\/home-dashboard\.css\?v=20260912-1/, 'dashboard stylesheet must be versioned');
assert.match(page, /class="extra-section home-quick-section"[^>]*aria-labelledby="homeQuickTitle"/);
assert.match(page, /id="homeQuickTitle">Быстрый доступ</);
assert.match(page, /class="subjects-toolbar"/);
assert.match(page, /id="homeSubjectsTitle">Предметы</);
assert.ok(page.indexOf('<section class="extra-section home-quick-section"') < page.indexOf('<section class="subjects-section"'),
    'quick links must precede grade content');
assert.equal((page.match(/href="matcenter\.html"/g) || []).length, 1);
assert.equal((page.match(/href="likbez\.html"/g) || []).length, 1);
assert.equal((page.match(/id="homeEnglishCard"/g) || []).length, 1);
assert.doesNotMatch(page, />Дополнительно</, 'frequent destinations must not remain in a distant footer section');

assert.match(css, /\.home-quick-section\s*\{[\s\S]*?grid-template-columns:/);
assert.match(css, /\.home-quick-grid\.english-card-hidden\s*\{[\s\S]*?repeat\(2/);
assert.match(css, /#gradePanel10:not\(\[hidden\]\)\s*\{[\s\S]*?display:\s*grid/);
assert.match(css, /@media \(max-width: 768px\)/);
assert.match(css, /\.home-quick-card[\s\S]*?min-height:\s*88px/);
assert.ok(shell.includes('/styles/home-dashboard.css'));

console.log('home dashboard layout: all tests passed');
