const assert = require('assert');
const path = require('path');
const { check } = require('../performance/check-budgets');

const result = check(path.join(__dirname, '..'));
assert.deepStrictEqual(result.errors, [], result.errors.join('\n'));
assert.ok(result.precacheEntries > 0, 'the service-worker shell must be measurable');
assert.ok(result.searchSourceBytes > 0, 'the current search baseline must be measurable');

const worker = require('fs').readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const shell = require('../performance/sw-shell.json').assets;
assert.match(worker, /NETWORK_TIMEOUT_MS = 5000/, 'network-first requests need a finite timeout');
assert.match(worker, /RUNTIME_MAX_ENTRIES = 80/, 'the runtime cache needs a hard size cap');
assert.match(worker, /RUNTIME_MAX_AGE_MS = 14 \* 24 \* 60 \* 60 \* 1000/, 'runtime entries need an age cap');
assert.match(worker, /fetchWithTimeout\(request, NETWORK_TIMEOUT_MS\)/);
assert.match(worker, /remaining\.slice\(0, overflow\)/, 'old runtime entries must be evicted');
assert.match(worker, /importScripts\('\/sw-manifest\.js'\)/, 'the worker must use the generated manifest');
assert.equal(new Set(shell).size, shell.length, 'the generated shell must not contain duplicate URLs');
assert.ok(shell.includes('/offline.html'), 'the offline fallback belongs in the install shell');

console.log('performance budgets: all tests passed');
