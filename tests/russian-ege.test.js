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
const knowledgeCheck = fs.readFileSync(path.join(root, 'knowledge-check.js'), 'utf8');
const russianRuntime = fs.readFileSync(path.join(root, 'russian-ege.js'), 'utf8');

const cards = Array.from(source.contentHtml.matchAll(/<div class="accent-word-card" id="([^"]+)"[^>]*><strong class="accent-word">([^<]+)<\/strong><\/div>/g));
assert.equal(cards.length, 255, 'all 255 photographed word forms must be present');
assert.equal(new Set(cards.map(match => match[1])).size, cards.length, 'stress card ids must be unique');
assert.equal(new Set(cards.map(match => match[2].toLocaleLowerCase('ru-RU'))).size, cards.length, 'word forms must not be duplicated');
cards.forEach(([, id, word]) => {
    assert.match(id, /^stress-\d{3}$/);
    assert.match(word, /[АЕЁИОУЫЭЮЯ]/u, `${word} must visibly mark its stressed vowel`);
});
assert.deepEqual(
    cards.map(match => match[1]).sort(),
    Array.from({ length: 255 }, (_, index) => `stress-${String(index + 1).padStart(3, '0')}`).sort(),
    'stable stress card ids must survive regrouping'
);
assert.ok(cards.some(match => match[2] === 'агЕнт'));
assert.ok(cards.some(match => match[2] === 'экспЕрт'));
[
    'stress-nouns',
    'stress-adjectives',
    'stress-verbs',
    'stress-participles',
    'stress-gerunds',
    'stress-adverbs'
].forEach(id => assert.match(source.contentHtml, new RegExp(`id="${id}"`), `${id} subsection must exist`));
assert.match(source.navHtml, /href="#stress-all"[^>]*>Все</);
assert.match(source.navHtml, /Существительные/);
assert.match(source.navHtml, /Деепричастия/);
assert.match(source.navHtml, /Наречия/);

assert.equal((page.match(/class="accent-word-card"/g) || []).length, 255, 'published page must be generated from the canonical list');
assert.match(page, /russian-ege\.js\?v=/, 'the All subsection must be assembled from canonical stress cards at runtime');
assert.match(page, /data-note-subject="russian-ege"/);
assert.equal((home.match(/href="russian-ege\.html" class="subject-card"/g) || []).length, 2,
    'Russian EGE must be visible in both grade 10 and grade 11 panels');
assert.match(home, /id="academic-russian"/);
assert.doesNotMatch(home, /m11\.2 8\.75 1\.85-1\.15/, 'the Russian subject icon must not contain a stress mark');

assert.ok(searchPages.some(item => item.path === 'russian-ege.html'), 'site search must index the new subject');
assert.match(searchClient, /\.accent-word-card\[id\]/);
assert.match(localSearch, /accent-word-card/);
assert.match(localSearch, /hasAttribute\('data-stress-clone'\)/,
    'local search must not show the same stress word twice through the All subsection');
const entries = SearchIndex.parseEntries(page, { path: 'russian-ege.html', label: 'Русский язык ЕГЭ' });
assert.ok(entries.some(entry => entry.id === 'stress-001' && entry.title === 'агЕнт'));
assert.ok(entries.some(entry => entry.id === 'stress-255' && entry.title === 'экспЕрт'));
assert.equal(entries.length, 255, 'search index must contain individual words without duplicate alphabet ranges');
assert.ok(!entries.some(entry => entry.id === 'stress-nouns'), 'part-of-speech group must not duplicate its word results');
assert.match(searchClient, /item\.entry\.normalizedTitle/, 'similar word forms must remain separate search results');
assert.match(knowledgeCheck, /selector:\s*'\.accent-word-card',\s*kind:\s*'stress'/,
    'stress words must be available as a dedicated knowledge-check card type');
assert.match(knowledgeCheck, /box\.dataset\.searchWord[\s\S]*toLocaleLowerCase\('ru-RU'\)/,
    'the question side must use the lowercase word form');
assert.match(knowledgeCheck, /kc-stress-word[\s\S]*stressedWord/,
    'the revealed side must use the source form with its stressed capital');
assert.doesNotMatch(knowledgeCheck, /Ударная буква выделена прописной/);
assert.doesNotMatch(knowledgeCheck, /<kbd class="kc-kbd">/, 'grading buttons must not show numeric key badges');
assert.match(russianRuntime, /id = 'stress-all'/, 'the All stress subsection must be created');
assert.match(russianRuntime, /dataset\.kcIgnore = 'true'/,
    'the derived All subsection must not duplicate cards in knowledge-check scheduling');
assert.match(russianRuntime, /querySelectorAll\('\.russian-stress-topic:not\(#stress-all\) \.accent-word-card\[id\]'\)/,
    'All must reuse the canonical 255 cards rather than duplicate their data');
assert.match(russianRuntime, /numericStressId\(left\) - numericStressId\(right\)/,
    'All must preserve the original photographed word order');

console.log('Russian EGE stress list and search: all assertions passed');
