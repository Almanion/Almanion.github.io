'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sanitizer = read('safe-html.js');
const exam = read('physics-exam.html');
const appsScript = read('apps-script.gs');
const admin = read('admin-app.js');
const rules = JSON.parse(read(path.join('firebase', 'database.rules.json'))).rules;
const matcenter = ['00-core.js', '20-auth.js', '30-data.js', '50-render.js', '70-hints.js']
    .map(file => read(path.join('matcenter', file))).join('\n');

assert.match(sanitizer, /DROP_CONTENT_TAGS[\s\S]*'SCRIPT'[\s\S]*'IFRAME'[\s\S]*'FORM'/);
assert.match(sanitizer, /lower\.startsWith\('on'\)[\s\S]*lower === 'style'/);
assert.match(sanitizer, /isSafeUrl/);
assert.doesNotMatch(sanitizer, /innerHTML\s*=\s*html\s*;/,
    'raw caller input must never be assigned without the sanitizer');

assert.ok(exam.indexOf('safe-html.js') < exam.indexOf('AlmanionSafeHtml.setHTML'),
    'the sanitizer must load before ticket rendering starts');
assert.doesNotMatch(exam, /innerHTML\s*=\s*block\.html/);
assert.match(exam, /AlmanionSafeHtml\.sanitize\(block && block\.html\)/);
assert.match(exam, /AlmanionSafeHtml\.setHTML\(beditorPreview, wrapped\)/,
    'the block editor preview must use the same sanitizer as published content');
assert.doesNotMatch(exam, /publishedAt[\s\S]{0,180}\bemail\s*:/,
    'public ticket payloads must not publish account email addresses');

assert.match(appsScript, /const AUTH_VERSION = 3/);
assert.match(appsScript, /legacyAuth:\s*false/);
assert.doesNotMatch(matcenter, /[?&]password=/i,
    'the Matcenter password must never be placed in a request URL');
assert.doesNotMatch(matcenter, /localStorage[^\n]*(?:password|MATCENTER_USER_PASSWORD)/i,
    'the Matcenter access password must not be persisted');

const ruleSource = read(path.join('firebase', 'database.rules.json'));
const ruleFragment = read(path.join('constructor', 'firebase-database-rules.fragment.json'));
const storageRules = read(path.join('firebase', 'storage.rules'));
assert.doesNotMatch(ruleSource, /auth\.token\.email\s*===\s*['"]dmb23930@gmail\.com/,
    'privileged access must use the immutable owner UID');
assert.doesNotMatch(ruleFragment, /auth\.token\.email\s*===\s*['"]dmb23930@gmail\.com/,
    'documented constructor rules must use the same immutable owner UID');
assert.doesNotMatch(storageRules, /request\.auth\.token\.email\s*==\s*['"]dmb23930@gmail\.com/,
    'Storage ownership must use the immutable owner UID');
assert.match(storageRules, /request\.auth\.uid\s*==\s*['"]2M2ZdLQcJAhluPjUVFNJ6MyQrdH2/);
assert.match(admin, /SITE_OWNER_UID/);
assert.doesNotMatch(admin, /normalizedEmail\s*===\s*SITE_OWNER_EMAIL/);
assert.doesNotMatch(exam, /currentUser\.email\s*===\s*ADMIN_EMAIL/);
assert.equal(rules.publicTickets.$uid.$other['.validate'], false);
assert.match(rules.publicTickets.$uid.tickets.$ticket.$block.html['.validate'], /length <=/);

console.log('security-sensitive content and owner authorization: all tests passed');
