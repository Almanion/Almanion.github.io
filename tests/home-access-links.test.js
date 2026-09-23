'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const account = fs.readFileSync(path.join(root, 'account.js'), 'utf8');
const components = fs.readFileSync(path.join(root, 'styles', 'site', '00-components.css'), 'utf8');
const shell = JSON.parse(fs.readFileSync(path.join(root, 'performance', 'sw-shell.json'), 'utf8')).assets;

assert.match(page, /id="homePrivilegedActions"[^>]*hidden/, 'privileged action slot must start hidden');
assert.doesNotMatch(page, /<a[^>]+id="home(?:Constructor|Admin)Link"/, 'privileged links must not exist in initial markup');
assert.match(page, /account\.js\?v=20260924-1/, 'home page must request the access-aware account script');

assert.match(account, /function clearHomeAccessLinks\(slot\)[\s\S]*slot\.replaceChildren\(\);\s*slot\.hidden = true;/,
    'all privileged actions must be removed before each access check');
assert.match(account, /rolesRef\.on\('value', handleRoles/,
    'role changes must update home actions without a page reload');
assert.match(account, /roles\.contentEditor === true, roles\.siteAdmin === true/,
    'constructor and admin access must be evaluated independently');
assert.match(account, /if \(contentEditor\) slot\.appendChild\(createHomeAccessLink\('constructor'\)\)/,
    'constructor link must only be created for a content editor');
assert.match(account, /if \(siteAdmin\) slot\.appendChild\(createHomeAccessLink\('admin'\)\)/,
    'admin link must only be created for a site administrator');
assert.match(account, /<span>Конструктор<\/span>/,
    'the compact constructor label must fit alongside the admin action on phones');
assert.match(account, /generation !== homeAccessGeneration \|\| user !== checkedUser/,
    'stale permission checks must not reveal actions after an account change');
assert.match(account, /slot\.dataset\.accessSignature === signature\) return/,
    'unchanged role snapshots must preserve focus and avoid replaying animations');
assert.match(account, /if \(event\.persisted\) updateHomeAccessLinks\(\)/,
    'BFCache restores must recheck home access');
assert.match(account, /addEventListener\('pagehide'[\s\S]*if \(!event\.persisted\) return;[\s\S]*clearHomeAccessLinks\(slot\)/,
    'privileged actions must be cleared before a page enters BFCache');

assert.match(components, /#accountOverlay\.auth-overlay\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*13000/s,
    'the shared account dialog must overlay every page instead of joining page layout');
assert.match(components, /#accountOverlay \.account-modal\s*\{[^}]*width:\s*min\(100%,\s*380px\)/s,
    'the shared account dialog must retain a bounded card on non-Matcenter pages');

assert.ok(!shell.includes('/account.js'), 'account UI must not delay installation of the minimal offline shell');

console.log('home privileged links: all tests passed');
