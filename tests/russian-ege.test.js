'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SearchIndex = require('../performance/build-search-index.js');

const root = path.join(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'content', 'russian-ege', 'sections', 'udareniya.json'), 'utf8'));
const page = fs.readFileSync(path.join(root, 'russian-ege.html'), 'utf8');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const searchPages = JSON.parse(fs.readFileSync(path.join(root, 'performance', 'search-pages.json'), 'utf8'));
const searchClient = fs.readFileSync(path.join(root, 'search.js'), 'utf8');
const localSearch = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

const cards = Array.from(source.contentHtml.matchAll(/<div class="accent-word-card" id="([^"]+)"[^>]*><strong class="accent-word">([^<]+)<\/strong><\/div>/g));
assert.equal(cards.length, 255, 'all 255 photographed word forms must be present');
assert.equal(new Set(cards.map(match => match[1])).size, cards.length, 'stress card ids must be unique');
assert.equal(new Set(cards.map(match => match[2].toLocaleLowerCase('ru-RU'))).size, cards.length, 'word forms must not be duplicated');
cards.forEach(([, id, word], index) => {
    assert.equal(id, `stress-${String(index + 1).padStart(3, '0')}`);
    assert.match(word, /[АЕЁИОУЫЭЮЯ]/u, `${word} must visibly mark its stressed vowel`);
});
assert.ok(cards.some(match => match[2] === 'агЕнт'));
assert.ok(cards.some(match => match[2] === 'экспЕрт'));

assert.equal((page.match(/class="accent-word-card"/g) || []).length, 255, 'published page must be generated from the canonical list');
assert.match(page, /data-note-subject="russian-ege"/);
assert.equal((home.match(/href="russian-ege\.html" class="subject-card"/g) || []).length, 2,
    'Russian EGE must be visible in both grade 10 and grade 11 panels');
assert.match(home, /id="academic-russian"/);

assert.ok(searchPages.some(item => item.path === 'russian-ege.html'), 'site search must index the new subject');
assert.match(searchClient, /\.accent-word-card\[id\]/);
assert.match(localSearch, /accent-word-card/);
const entries = SearchIndex.parseEntries(page, { path: 'russian-ege.html', label: 'Русский язык ЕГЭ' });
assert.ok(entries.some(entry => entry.id === 'stress-001' && entry.title === 'агЕнт'));
assert.ok(entries.some(entry => entry.id === 'stress-255' && entry.title === 'экспЕрт'));
assert.equal(entries.length, 255, 'search index must contain individual words without duplicate alphabet ranges');
assert.ok(!entries.some(entry => entry.id === 'stress-a-v'), 'alphabet range must not duplicate its word results');
assert.match(searchClient, /item\.entry\.normalizedTitle/, 'similar word forms must remain separate search results');

console.log('Russian EGE stress list and search: all assertions passed');
