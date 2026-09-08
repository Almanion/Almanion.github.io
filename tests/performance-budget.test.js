const assert = require('assert');
const path = require('path');
const { check } = require('../performance/check-budgets');

const result = check(path.join(__dirname, '..'));
assert.deepStrictEqual(result.errors, [], result.errors.join('\n'));
assert.ok(result.precacheEntries > 0, 'the service-worker shell must be measurable');
assert.ok(result.searchSourceBytes > 0, 'the current search baseline must be measurable');

const worker = require('fs').readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
assert.match(worker, /NETWORK_TIMEOUT_MS = 5000/, 'network-first requests need a finite timeout');
assert.match(worker, /RUNTIME_MAX_ENTRIES = 120/, 'the runtime cache needs a hard size cap');
assert.match(worker, /fetchWithTimeout\(request, NETWORK_TIMEOUT_MS\)/);
assert.match(worker, /keys\.slice\(0, overflow\)/, 'old runtime entries must be evicted');
assert.match(worker, /'\/search-index\.json'/, 'the generated search index should work offline');

console.log('performance budgets: all tests passed');
