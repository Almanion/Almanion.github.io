'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Index = require('../performance/build-definition-index');
const Client = require('../selection-definitions');
const Search = require('../performance/build-search-index');
const root = path.join(__dirname, '..');
const fixture = `<main><section id="section"><div class="topic" id="topic"><div class="definition-box"><strong>Молекула</strong> — частица.<div class="formula-box">\\(m\\)</div><button>Copy</button></div><div class="definition-box"><p><b>Атом:</b> частица</p></div><div class="definition-box"><strong>Определение</strong> Не термин</div></div></section></main>`;
const entries = Index.parseDefinitions(fixture, { path: 'physics.html', label: 'Физика' });
assert.equal(entries.length, 2);
assert.equal(entries[0].term, 'Молекула');
assert.equal(entries[0].id, 'topic');
assert.ok(entries[0].html.includes('formula-box'));
assert.ok(!entries[0].html.includes('button'));
assert.equal(entries[1].term, 'Атом');
assert.equal(Index.parseDefinitions('<script><div id="bad" class="definition-box"><strong>Private</strong>hidden</div></script>', { path: 'physics.html' }).length, 0, 'script templates are not public note content');
assert.equal(Client.normalize(' Ёмкость\u0301,  '), 'емкость');
assert.equal(Client.find(entries, 'молекула')[0], entries[0]);
assert.equal(Client.find(entries, 'молекулы')[0], entries[0], 'common case endings should not hide a known term');
assert.equal(Client.find([{ term: 'Массив' }], 'масса').length, 0, 'word roots must not be arbitrary prefixes');
assert.equal(Client.find(entries, 'Не термин').length, 0, 'look up terms, not incidental words inside a definition');
assert.equal(Client.find(entries, 'м').length, 0, 'short arbitrary substrings must not match');
assert.equal(Client.find([{ term: 'Атомная единица массы' }], 'массы').length, 1);
const related = [
    { term: 'Эффективный диаметр молекулы' }, { term: 'Молекула' },
    { term: 'Импульс силы' }, { term: 'Сила' },
    { term: 'Сила Архимеда' }, { term: 'Механическое движение' }
];
assert.deepEqual(Client.find(related, 'молекулы').map(entry => entry.term), ['Молекула'], 'a complete inflected term takes priority over a word inside another term');
for (const query of ['силы', 'силе', 'силу', 'силой', 'силами']) {
    assert.deepEqual(Client.find(related, query).map(entry => entry.term), ['Сила'], 'short Russian terms must support case endings: ' + query);
}
assert.deepEqual(Client.find(related, 'сила Архимеда').map(entry => entry.term), ['Сила Архимеда'], 'exact compound terms remain authoritative');
assert.deepEqual(Client.find(related, 'силы Архимеда').map(entry => entry.term), ['Сила Архимеда']);
assert.deepEqual(Client.find(related, 'механического движения').map(entry => entry.term), ['Механическое движение']);
assert.equal(Client.find([{ term: 'Море' }], 'мор').length, 0, 'short arbitrary roots must not turn into unrelated terms');
assert.notEqual(Client.normalize('край'), Client.normalize('краи'), 'the letter й is not a stress mark');
assert.equal(Client.find([{ term: 'Honor' }], 'honors').length, 0, 'Russian case rules must not alter English words');
assert.ok(!Search.publicPages(root).some(page => /english|planner|sport|tour|duty/.test(page.path)), 'private sources are never added to the public term index');
const runtime = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
assert.match(runtime, /selectionchange/);
assert.match(runtime, /resource\('script', 'safe-html\.js/, 'snippets must use the existing sanitizer');
assert.doesNotMatch(fs.readFileSync(path.join(root, 'script.js'), 'utf8'), /__copyLongPressInit/, 'touch selection must not be commandeered for block copying');
console.log('definitions: canonical snippets, exact lookup, public-only sources and native selection passed');
