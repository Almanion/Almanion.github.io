'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const scripts = [], links = [], counts = new Map();
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'note-runtime.js'), 'utf8');
const location = { href: 'https://example.test/physics.html' };
let failAppOnce = true;
let holdApp = false;
let pendingApp = null;
const timers = new Map();
let nextTimer = 0;
const context = { URL, Map, Promise, location, console: { warn() {} },
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }
};
context.window = context;
context.document = {
    readyState: 'loading', scripts, addEventListener() {}, getElementById() { return null; },
    querySelectorAll: () => links,
    createElement(tag) {
        const listeners = {};
        return {
            dataset: {}, tag,
            addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
            removeEventListener(type, callback) { listeners[type] = (listeners[type] || []).filter(value => value !== callback); },
            dispatch(type) { for (const callback of [...listeners[type] || []]) callback(); },
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
                if (node.tag === 'script') assert.equal(node.async, true, 'independent resources must not enter a shared ordered script queue');
                if (file.includes('firebase-app-compat') && holdApp) { pendingApp = node; return; }
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
    // New page, indefinitely pending SDK. Local scripts must still complete,
    // and timeout/retry must keep only one request for an SDK that may arrive late.
    scripts.length = 0; links.length = 0; counts.clear();
    delete context.firebase; delete context.firebaseConfig;
    holdApp = true;
    vm.runInNewContext(source, context);
    const account = context.AlmanionNoteRuntime.ensure('account');
    const timedOut = assert.rejects(account, /время загрузки firebaseApp/);
    await Promise.resolve();
    await Promise.all([
        context.AlmanionNoteRuntime.ensure('bookmarks'),
        context.AlmanionNoteRuntime.ensure('print'),
        context.AlmanionNoteRuntime.ensure('offline')
    ]);
    assert.ok(pendingApp, 'the local tools were tested while the app SDK request was pending');
    for (const callback of [...timers.values()]) callback();
    await timedOut;
    const retry = context.AlmanionNoteRuntime.ensure('account');
    await Promise.resolve();
    context.firebase = {};
    pendingApp.dispatch('load');
    await retry;
    assert.equal(counts.get('https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js'), 1, 'timeout retries must reuse a still pending SDK to avoid double execution');
    assert.equal(counts.get('account.js'), 1, 'account must initialize after its late SDK arrives');
    assert.equal(timers.size, 0, 'settled resource listeners must release their timeouts');
    console.log('note runtime: failed SDK retry, ordering, stalled CDN isolation, timeout and late recovery passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
