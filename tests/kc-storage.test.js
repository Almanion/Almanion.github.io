'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'kc-storage.js'), 'utf8');

function makeStorage(initial) {
    const values = new Map(Object.entries(initial || {}));
    return {
        get length() { return values.size; },
        key(index) { return Array.from(values.keys())[index] || null; },
        getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
        setItem(key, value) { values.set(String(key), String(value)); },
        removeItem(key) { values.delete(String(key)); },
        dump() { return Object.fromEntries(values); }
    };
}

function boot(localInitial, sessionInitial) {
    const listeners = {};
    const localStorage = makeStorage(localInitial);
    const sessionStorage = makeStorage(sessionInitial);
    const window = {
        addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
        dispatchEvent(event) { (listeners[event.type] || []).forEach(handler => handler(event)); return true; }
    };
    class CustomEvent {
        constructor(type, options) { this.type = type; this.detail = options && options.detail; }
    }
    const context = { window, localStorage, sessionStorage, CustomEvent, console };
    vm.runInNewContext(source, context, { filename: 'kc-storage.js' });
    return { api: window.AlmanionKCStorage, window, localStorage, sessionStorage };
}

const state = boot();
assert.equal(state.api.scope(), 'guest');
state.api.set('kc_fsrs_/physics.html', 'guest-value');
state.api.setScope('account-a');
assert.equal(state.api.get('kc_fsrs_/physics.html'), null);
state.api.set('kc_fsrs_/physics.html', 'account-a-value');
state.api.setScope('account-b');
state.api.set('kc_fsrs_/physics.html', 'account-b-value');
assert.equal(state.api.get('kc_fsrs_/physics.html'), 'account-b-value');
state.api.setScope('account-a');
assert.equal(state.api.get('kc_fsrs_/physics.html'), 'account-a-value');
assert.deepEqual(Array.from(state.api.list('account-a', 'kc_fsrs_')), ['kc_fsrs_/physics.html']);
state.api.setScope('guest');
assert.equal(state.api.get('kc_fsrs_/physics.html'), 'guest-value');

const migrated = boot({
    'almanion_kc_local_owner_v1': 'legacy-user',
    'kc_fsrs_/chemistry.html': '{"legacy":true}'
});
assert.equal(migrated.api.get('kc_fsrs_/chemistry.html', 'legacy-user'), '{"legacy":true}');
assert.equal(migrated.localStorage.getItem('kc_fsrs_/chemistry.html'), null);
assert.equal(migrated.localStorage.getItem('almanion_kc_scoped_migration_v1'), '1');

console.log('knowledge-check account storage isolation: all tests passed');
