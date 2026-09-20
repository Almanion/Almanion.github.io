'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('index.html');
const css = read(path.join('styles', 'home-dashboard.css'));
const client = read('home-dashboard.js');
const editor = read('home-quick-editor.js');
const shell = JSON.parse(read(path.join('performance', 'sw-shell.json'))).assets;

assert.match(page, /styles\/home-dashboard\.css\?v=20260920-3/, 'dashboard stylesheet must be versioned');
assert.match(page, /home-dashboard\.js\?v=20260920-3/, 'personal dashboard controller must be versioned');
assert.doesNotMatch(page, /<script[^>]+src="home-dashboard\.js/, 'personalization must load during idle time, not block first paint');
assert.match(page, /class="extra-section home-quick-section"[^>]*aria-labelledby="homeQuickTitle"/);
assert.match(page, /id="homeQuickTitle">Быстрый доступ</);
assert.match(page, /id="homeQuickCustomize"[^>]*hidden/, 'personalization starts hidden until authentication is known');
assert.match(page, /id="homeQuickDialog"[^>]*aria-modal="true"/);
assert.match(page, /id="homeQuickGrid"[^>]*data-count="3"/);
assert.match(page, /class="subjects-toolbar"/);
assert.match(page, /id="homeSubjectsTitle">Предметы</);
assert.ok(page.indexOf('<section class="extra-section home-quick-section"') < page.indexOf('<section class="subjects-section"'),
    'quick links must precede grade content');
assert.equal((page.match(/href="matcenter\.html"/g) || []).length, 1);
assert.equal((page.match(/href="likbez\.html"/g) || []).length, 1);
assert.equal((page.match(/href="physics-10\.html"/g) || []).length, 2,
    'physics appears once in quick access and once in the 10th-grade grid');
assert.doesNotMatch(page, />Дополнительно</, 'frequent destinations must not remain in a distant footer section');
assert.doesNotMatch(page, /Короткие курсы/, 'the Likbez card must not include a redundant subtitle');
assert.doesNotMatch(client, /Короткие курсы/, 'the dynamic Likbez card must not restore a redundant subtitle');

assert.match(css, /\.home-quick-grid[\s\S]*?grid-template-columns:\s*repeat\(3/);
assert.match(css, /\.home-quick-grid > \.home-quick-card[\s\S]*?min-height:\s*108px/);
assert.match(css, /\.grade-panel > \.subjects-grid > \.subject-card[\s\S]*?min-height:\s*188px/);
assert.match(css, /#gradePanel10 > \.class-section > \.subjects-grid[\s\S]*?repeat\(2/);
assert.match(page, /id="gradeTabArchive"[^>]*aria-controls="gradePanelArchive"/);
assert.match(page, /id="gradePanelArchive"[^>]*aria-labelledby="gradeTabArchive"/);
assert.match(css, /\.home-privileged-actions:not\(\[hidden\]\)[\s\S]*?grid-template-columns:\s*repeat\(2/,
    'mobile privileged actions must share one row');
assert.match(css, /\.home-quick-grid\[data-count="3"\] > \.home-quick-card:first-child[\s\S]*?grid-column:\s*1 \/ -1/,
    'the mobile three-card layout must use a large lead tile');
assert.match(css, /body\.home-page \.settings-button\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s,
    'the home settings control must match the account control size');
assert.match(client, /const MAX_ITEMS = 5/);
assert.match(client, /homeQuickAccessByUser/);
assert.match(client, /api\.update\(\{ \[SETTINGS_KEY\]: map \}, \{ apply: false \}\)/,
    'personal quick access must use the account-synced settings channel');
assert.match(client, /home-quick-editor\.js\?v=20260920-2/,
    'the larger editor must stay out of the initial JavaScript path');
assert.match(editor, /const MAX_ITEMS = 5/);
assert.match(editor, /dashboard\(\)[\s\S]*?api\.saveSelection\(draft\)/,
    'the lazy editor must save through the account-aware dashboard controller');
assert.ok(shell.includes('/styles/home-dashboard.css'));
assert.ok(shell.includes('/home-dashboard.js'));
assert.ok(shell.includes('/home-quick-editor.js'));

console.log('home dashboard layout: all tests passed');
