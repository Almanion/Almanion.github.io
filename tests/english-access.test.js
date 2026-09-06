'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const rules = JSON.parse(read(path.join('firebase', 'database.rules.json'))).rules;
const page = read('english.html');
const client = read('english.js');
const home = read('index.html');
const account = read('account.js');
const admin = read('admin.html');
const dashboard = read('admin-dashboard.js');
const css = read(path.join('styles', 'english.css'));

assert.ok(rules.englishVocabulary, 'protected vocabulary rules are missing');
assert.match(rules.englishVocabulary['.read'], /auth != null/);
assert.match(rules.englishVocabulary['.read'], /englishAccess/);
assert.match(rules.englishVocabulary['.read'], /dmb23930@gmail\.com/);
assert.match(rules.englishVocabulary['.read'], /2M2ZdLQcJAhluPjUVFNJ6MyQrdH2/);
assert.match(rules.englishVocabulary['.write'], /dmb23930@gmail\.com/);
assert.doesNotMatch(rules.englishVocabulary['.write'], /siteAdmin|contentEditor|matcenterAdmin/);
assert.ok(rules.adminRoles.$uid.englishAccess, 'role schema is missing englishAccess');

assert.match(home, /id="homeEnglishCard"[^>]*hidden/);
assert.match(home, /href="english\.html"/);
assert.match(account, /function hasEnglishAccess/);
assert.match(account, /adminRoles\/.*englishAccess/);
assert.match(admin, /id="englishAccessRole"/);
assert.match(admin, /id="registeredAccountsList"/);
assert.match(dashboard, /englishAccess:\s*englishAccess/);
assert.match(dashboard, /db\.ref\('accountDirectory'\)\.once\('value'\)/);

assert.match(page, /class="english-page english-locked"/);
assert.match(page, /data-range-start="1" data-range-end="27"/);
assert.match(page, /data-range-start="108" data-range-end="135"/);
assert.match(client, /englishVocabulary\/v1/);
assert.match(client, /EXPECTED_WORDS = 135/);
assert.match(client, /getIdToken\(true\)/);
assert.match(client, /const rawItems = source/);
assert.match(client, /const items = rawItems\.filter/);
assert.doesNotMatch(client, /const valid = items\.filter/, 'validation must use the normalized, sorted collection');
assert.match(client, /document\.createTextNode/);
assert.doesNotMatch(page, /Illusory|Impeding|Pretentiousness/, 'private vocabulary leaked into public HTML');
assert.doesNotMatch(client, /based on illusion|obstructing or slowing/, 'private vocabulary leaked into public JavaScript');

assert.match(css, /content:\s*"Definition"/);
assert.match(client, /summary\.textContent = 'Translate'/);
assert.match(client, /translation\.append\(summary, translatedLine\)/);

const normalizeSource = client.match(/function normalizeItems\(value\) \{[\s\S]*?\n    \}(?=\n\n    function makeWordBlock)/);
assert.ok(normalizeSource, 'normalizeItems could not be extracted for ordering test');
const shuffledItems = {};
for (let number = 135; number >= 1; number--) {
    shuffledItems[String(number).padStart(3, '0')] = {
        number,
        term: `Term ${number}`,
        definition: `Definition ${number}`,
        translationTerm: `Термин ${number}`,
        translation: `Определение ${number}`
    };
}
const sandbox = { input: { items: shuffledItems }, result: null };
vm.runInNewContext(`const EXPECTED_WORDS = 135; ${normalizeSource[0]}; result = normalizeItems(input);`, sandbox);
assert.strictEqual(sandbox.result.length, 135);
assert.strictEqual(sandbox.result[0].number, 1, 'vocabulary must not depend on Firebase key order');
assert.strictEqual(sandbox.result[134].number, 135, 'vocabulary must be sorted through the final item');

console.log('private English section: all tests passed');
