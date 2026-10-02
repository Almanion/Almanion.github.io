'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const scripts = [], links = [], counts = new Map();
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'note-runtime.js'), 'utf8');
const location = { href: 'https://example.test/physics.html' };
let failAppOnce = true;
const context = { URL, Map, Promise, location, console: { warn() {} } };
context.window = context;
context.document = {
    readyState: 'loading', scripts, addEventListener() {},
    querySelectorAll: () => links,
    createElement(tag) {
        const listeners = {};
        return {
            dataset: {}, tag,
            addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
            dispatch(type) { for (const callback of listeners[type] || []) callback(); },
            remove() {
                const list = tag === 'script' ? scripts : links;
                const index = list.indexOf(this); if (index >= 0) list.splice(index, 1);
            }
        };
    },
    head: {
        appendChild(node) {
            (node.tag === 'script' ? scripts : links).push(node);
            queueMicrotask(() => {
                const file = String(node.src || node.href).split('?')[0];
                counts.set(file, (counts.get(file) || 0) + 1);
                if (file.includes('firebase-app-compat') && failAppOnce) {
                    failAppOnce = false; node.dispatch('error'); return;
                }
                if (file.includes('firebase-app-compat')) context.firebase = {};
                if (file.includes('firebase-database-compat') || file.includes('firebase-auth-compat')) assert.ok(context.firebase, 'SDK components must follow app initialization');
                if (file === 'firebase-config.js') context.firebaseConfig = {};
                if (file === 'account.js') assert.ok(context.firebaseConfig, 'account must follow config initialization');
                node.dispatch('load');
            });
        }
    }
};
vm.runInNewContext(source, context);

(async () => {
    await assert.rejects(context.AlmanionNoteRuntime.ensure('account'), /firebaseApp/);
    assert.equal(scripts.filter(node => node.src.includes('firebase-app-compat')).length, 0, 'failed script tags must be removed before retry');
    await Promise.all([context.AlmanionNoteRuntime.ensure('account'), context.AlmanionNoteRuntime.ensure('account')]);
    assert.equal(counts.get('https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js'), 2, 'retry must refetch the failed app SDK exactly once');
    assert.equal(counts.get('account.js'), 1, 'concurrent retries must not execute account scripts twice');
    assert.ok(context.firebaseConfig);
    console.log('note runtime: failed SDK retry, dependency ordering and concurrent loading passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
