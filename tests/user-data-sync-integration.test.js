'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const accountPages = [
    'index.html', 'physics.html', 'math.html', 'geometry.html', 'chemistry.html',
    'likbez.html', 'english.html', 'physics-exam.html', 'geometry-formulas.html',
    'matcenter.html', 'duty-10-1.html', 'physics-10.html',
    'chemistry-10.html', 'literature-10.html'
];

accountPages.forEach((file) => {
    const html = read(file);
    const noteProgressive = html.includes('note-runtime.js?v=20260911-1');
    const matcenterProgressive = html.includes('matcenter/runtime.js?v=20260911-2');
    const progressive = noteProgressive || matcenterProgressive;
    const syncAt = html.indexOf('data-sync.js?v=20260908-1');
    const kcStorageAt = html.indexOf('kc-storage.js?v=20260911-1');
    const accountAt = html.indexOf('account.js?v=20260908-1');
    assert.ok(syncAt >= 0 || progressive, `${file} must load the data sync runtime directly or progressively`);
    assert.ok(kcStorageAt >= 0, `${file} must load account-scoped knowledge storage`);
    if (!progressive) {
        assert.ok(kcStorageAt > syncAt, `${file} must load account-scoped knowledge storage after the sync runtime`);
        assert.ok(accountAt > syncAt, `${file} must load data sync before the account module`);
        assert.ok(accountAt > kcStorageAt, `${file} must load account-scoped knowledge storage before the account module`);
    }
    const bookmarksAt = html.indexOf('bookmarks.js?v=20260907-3');
    if (bookmarksAt >= 0) assert.ok(bookmarksAt > syncAt, `${file} must load data sync before bookmarks`);
    assert.ok(/settings\.js\?v=20260908-1/.test(html) || progressive,
        `${file} must load sync-aware settings directly or progressively`);
});

const runtime = read('note-runtime.js');
assert.match(runtime, /dataSync:\s*'data-sync\.js\?v=20260908-1'/);
assert.match(runtime, /account:\s*'account\.js\?v=20260911-1'/);
assert.match(runtime, /bookmarks:\s*'bookmarks\.js\?v=20260911-1'/);
const matcenterRuntime = read(path.join('matcenter', 'runtime.js'));
assert.match(matcenterRuntime, /settings:\s*'settings\.js\?v=20260911-1'/);
assert.match(matcenterRuntime, /analytics:\s*'firebase-analytics\.js\?v=20260911-1'/);
assert.match(matcenterRuntime, /hints:\s*'matcenter\/70-hints\.js\?v=20260911-2'/);

const account = read('account.js');
assert.match(account, /namespace: 'knowledgeCheck'/);
assert.match(account, /window\.AlmanionKCStorage/);
assert.match(account, /kcStorage\.setScope\(u \? u\.uid : 'guest'\)/,
    'every authentication change must switch to a physically isolated progress namespace');
const kcStorage = read('kc-storage.js');
assert.match(kcStorage, /almanion_kc_scope_v1:/);
assert.match(kcStorage, /sessionStorage/);
assert.match(kcStorage, /almanion-kc-scope-changing/);
assert.match(kcStorage, /almanion-kc-scope-changed/);
assert.doesNotMatch(account, /store\[key\] && \(store\[key\]\.last \|\| store\[key\]\.due\)/,
    'a future review deadline must not be treated as a newer edit');
assert.match(account, /namespace: 'settings'/);
assert.match(account, /db\.ref\('userSettings\/' \+ uid\)/);
assert.match(account, /settingsStore\.remoteObserved/, 'a failed first read must not seed defaults over cloud settings');
assert.match(account, /visualDefaultsVersion/, 'the forced visual migration must be versioned per account');
assert.match(account, /mergeRecord: mergeSettingsRecord/,
    'the one-time visual migration must reconcile inside the cloud transaction');
assert.doesNotMatch(account, /const localAt = Number\(sGet\('almanion_site_settings_updated_at'\)\)/,
    'a fresh browser timestamp must never win before the first cloud merge');
assert.match(account, /decodeRemote:/, 'knowledge progress must read the legacy JSON-string Firebase format');
assert.match(account, /encodeRemote:/, 'knowledge progress must keep writing the compatible Firebase format');
assert.match(account, /exportData:/);
assert.match(account, /importData:/);
assert.match(account, /almanion-sync-retry/);

const bookmarks = read('bookmarks.js');
assert.match(bookmarks, /namespace: 'bookmarks'/);
assert.match(bookmarks, /api\.migrateGuest\(options\)/, 'guest bookmarks must migrate into the account');
assert.match(bookmarks, /bookmarkStore\.remove\(/, 'bookmark removal must create a tombstone');

const matcenter = read(path.join('matcenter', '40-personal-progress.js'));
assert.match(matcenter, /namespace: 'matcenterSolved'/);
assert.match(matcenter, /personalSolvedStore\.remove\(/, 'removing a solved mark must create a tombstone');
assert.match(matcenter, /parsed\.schema && parsed\.records/, 'the new cache must coexist with the legacy cache reader');
assert.match(matcenter, /safeSet\(cacheKey, JSON\.stringify\(legacyCache\.entries\)\)/,
    'the wrapped Matcenter v1 cache must be unwrapped before the shared collection opens it');

const settings = read('settings.js');
assert.match(settings, /almanion-settings-changed/);
assert.match(settings, /applySyncedSettings/);
assert.match(settings, /VISUAL_DEFAULTS_VERSION = 1/);
assert.match(settings, /migrateVisualDefaults/);
const rules = JSON.parse(read(path.join('firebase', 'database.rules.json')));
assert.ok(rules.rules.userSettings.$uid['.read'].includes('auth.uid === $uid'));
assert.ok(rules.rules.userSettings.$uid['.write'].includes('auth.uid === $uid'));

console.log('user data sync integration: all tests passed');
