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

assert.deepEqual(verifier.homepageStyles('<link rel="icon" href="icon.svg"><link href="styles/a.css" rel="stylesheet">'), ['styles/a.css']);
(async () => {
    const realFetch = global.fetch;
    try {
        const seen = [];
        global.fetch = async url => {
            seen.push(url.pathname);
            const body = url.pathname.endsWith('/a.css') ? '@import url("child.css"); body { color: black; }' : '.x{color:blue}';
            return new Response(body, { headers: { 'Content-Type': 'text/css' } });
        };
        assert.equal(await verifier.verifyHomepageStyles(new URL('https://example.test/'), '<link rel="stylesheet" href="styles/a.css">', 1), 2);
        assert.deepEqual(seen, ['/styles/a.css', '/styles/child.css']);
        await assert.rejects(() => verifier.verifyHomepageStyles(new URL('https://example.test/'), '<link rel="stylesheet" href="styles/a.0000000000000000.css">', 1), /does not match/);
        global.fetch = async () => new Response('<html>404 page</html>', { headers: { 'Content-Type': 'text/html' } });
        await assert.rejects(() => verifier.verifyHomepageStyles(new URL('https://example.test/'), '<link rel="stylesheet" href="styles/a.css">', 1), /content type/);
    } finally { global.fetch = realFetch; }
    console.log('production deployment verifier, homepage CSS and imported versions: all tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
