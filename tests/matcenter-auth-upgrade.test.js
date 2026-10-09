'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { upgradeMatcenterAuth } = require('../tools/upgrade-matcenter-auth.js');
const main = fs.readFileSync(path.join(__dirname, '..', 'apps-script.gs'), 'utf8');
const old = `const AUTH_VERSION = 2;
const SITE_OWNER_EMAIL = 'old@example.com';
const capabilities = { accountConfirmation: true, multiSheetTasks: true };
function resolveAccess(params) { return { allowed: true }; }
function getAccountRole(identity) { return identity.email === SITE_OWNER_EMAIL ? 'admin' : ''; }
function hasFirebaseMatcenterAdminRole() { return false; }
function getTasks() { return 'preserve table handling'; }
`;
const updated = upgradeMatcenterAuth(old, main);
assert.match(updated, /const AUTH_VERSION = 3;/);
assert.match(updated, /legacyAuth: false/);
assert.match(updated, /if \(!params.idToken\) return \{ allowed: false/);
assert.match(updated, /identity.uid === SITE_OWNER_UID/);
assert.doesNotMatch(updated, /SITE_OWNER_EMAIL|MATCENTER_ALLOW_LEGACY/);
assert.ok(updated.endsWith(old.slice(old.indexOf('function hasFirebaseMatcenterAdminRole'))));
assert.throws(() => upgradeMatcenterAuth(updated, main), /existing v2/);
assert.throws(() => upgradeMatcenterAuth(old, ''), /Canonical v3/);
console.log('Matcenter v2-to-v3 migration preserves table handling: all tests passed');
