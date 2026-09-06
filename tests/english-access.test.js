'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

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
assert.match(rules.englishVocabulary['.write'], /dmb23930@gmail\.com/);
assert.doesNotMatch(rules.englishVocabulary['.write'], /siteAdmin|contentEditor|matcenterAdmin/);
assert.ok(rules.adminRoles.$uid.englishAccess, 'role schema is missing englishAccess');

assert.match(home, /id="homeEnglishCard"[^>]*hidden/);
assert.match(home, /href="english\.html"/);
assert.match(account, /function hasEnglishAccess/);
assert.match(account, /adminRoles\/.*englishAccess/);
assert.match(admin, /id="englishAccessRole"/);
assert.match(dashboard, /englishAccess:\s*englishAccess/);

assert.match(page, /class="english-page english-locked"/);
assert.match(page, /data-range-start="1" data-range-end="27"/);
assert.match(page, /data-range-start="108" data-range-end="135"/);
assert.match(client, /englishVocabulary\/v1/);
assert.match(client, /EXPECTED_WORDS = 135/);
assert.match(client, /document\.createTextNode/);
assert.doesNotMatch(page, /Illusory|Impeding|Pretentiousness/, 'private vocabulary leaked into public HTML');
assert.doesNotMatch(client, /based on illusion|obstructing or slowing/, 'private vocabulary leaked into public JavaScript');

assert.match(css, /content:\s*"Definition"/);
assert.match(client, /summary\.textContent = 'Translate'/);
assert.match(client, /translation\.append\(summary, translatedLine\)/);

console.log('private English section: all tests passed');
