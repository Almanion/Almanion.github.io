'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');
for (const file of ['note-runtime.js','knowledge-check.js','physics.html','constructor/index.js','note-editor.js']) {
    const source = read(file);
    assert.ok(source.includes('Учить'),file+' uses the learning name');
    assert.doesNotMatch(source,/>Проверка знаний<|['"]Проверка знаний['"]/,file+' has no old UI label');
}
assert.match(read('script.js'),/label: 'Учить', icon: ICONS\.kc/);
assert.match(read('english-ui.js'),/'Учить': 'Learn'/);
assert.equal([...read('english-ui.js').matchAll(/'Учить':/g)].length,1,'the start-button translation must not overwrite the feature name');
assert.match(read('english-ui.js'),/'Сессия обучения': 'Learning session'/);
assert.match(read('knowledge-check.js'),/aria-label="Сессия обучения"/);
assert.match(read('note-runtime.js'),/launcher\('knowledgeCheckBtn', 'knowledge', 'Учить'/);
assert.doesNotMatch(read('physics.html'),/<button[^>]+id="knowledgeCheckBtn"/,'legacy static buttons must not bypass the lazy loader');
// Only labels change: selectors and learning storage stay compatible.
assert.match(read('knowledge-check.js'),/id="kcSelectTitle"/);
assert.match(read('knowledge-check.js'),/const scopedStorage = window\.AlmanionKCStorage/);
const site = process.env.ALMANION_TEST_SITE;
if(site) for (const file of ['physics.html','physics-10.html','likbez.html','russian-ege.html','english.html']) {
    assert.match(fs.readFileSync(path.join(site,file),'utf8'),/note-runtime\.js\?v=20261016-1/);
}
console.log('Learn label: desktop, mobile, editors, English and cache versions passed');
