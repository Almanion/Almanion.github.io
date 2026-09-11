'use strict';

const assert = require('node:assert/strict');
const verifier = require('../tools/verify-production.js');

const normalized = verifier.normalizeBaseUrl('https://almanion.github.io/project');
assert.equal(normalized.href, 'https://almanion.github.io/project/');

const cacheBusted = verifier.withCacheBuster(new URL('physics.html', normalized), 3);
assert.equal(cacheBusted.origin, 'https://almanion.github.io');
assert.equal(cacheBusted.pathname, '/project/physics.html');
assert.match(cacheBusted.searchParams.get('_verify'), /-3$/);

const args = verifier.parseArgs([
    '--url', 'https://almanion.github.io/',
    '--revision', 'abc123',
    '--attempts', '2',
    '--delay-ms', '0'
]);
assert.equal(args.revision, 'abc123');
assert.equal(args.attempts, 2);
assert.ok(args.paths.includes('/note-runtime.js'));
assert.ok(args.paths.includes('/safe-html.js'));

assert.throws(function () { verifier.normalizeBaseUrl('file:///tmp/site'); }, /HTTP or HTTPS/);
assert.throws(function () { verifier.parseArgs(['--url', 'https://example.test']); }, /revision/);

console.log('production deployment verifier: all tests passed');
