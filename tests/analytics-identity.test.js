'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const analytics = fs.readFileSync(path.join(root, 'firebase-analytics.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const adminApp = fs.readFileSync(path.join(root, 'admin-app.js'), 'utf8');

assert.match(analytics, /firebase\.initializeApp\(firebaseConfig, 'almanion-telemetry'\)/,
    'anonymous telemetry must not replace the primary site account');
assert.match(analytics, /auth\.signInAnonymously\(\)/,
    'signed-out visitors need a rule-verifiable anonymous UID');
assert.match(analytics, /if \(account && !account\.isAnonymous\)[\s\S]*primaryApp\.database\(\)/,
    'signed-in visitors must be counted by their stable account UID');
assert.match(analytics, /pollResponses\/[\s\S]*Object\.assign\(identityMeta\(\)/,
    'poll responses must carry the authenticated analytics identity');
assert.match(analytics, /largest-contentful-paint/);
assert.match(analytics, /layout-shift/);
assert.match(analytics, /interactionId/);
assert.match(analytics, /webVitals\//,
    'privacy-safe performance aggregates must be collected');
assert.doesNotMatch(analytics, /const visitorId = getVisitorId\(\)/,
    'the active identity must no longer be a random localStorage identifier');
assert.match(admin, /Зарегистрированные аккаунты/);
assert.match(adminApp, /db\.ref\('accountDirectory'\)\.on\('value'/);
assert.match(adminApp, /Object\.entries\(data\)\.filter/,
    'registered accounts must be counted by stable UID records rather than deduplicated emails');
assert.doesNotMatch(adminApp, /accountEmails/,
    'registered-account analytics must not substitute email addresses for UID identity');
assert.match(admin, /Аккаунты сегодня/);
assert.match(admin, /Анонимные профили сегодня/);
assert.match(admin, /а не гарантированно отдельный человек/);
assert.match(adminApp, /это не число уникальных людей/);

console.log('authenticated analytics identity: all tests passed');
