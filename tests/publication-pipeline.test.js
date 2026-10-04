'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Publication = require('../constructor/publication');
const root = path.join(__dirname, '..');
const pipeline = fs.readFileSync(path.join(root, 'tools/ci.js'), 'utf8');
assert.ok(pipeline.indexOf('BuildSite.build({ root, output })') < pipeline.indexOf('Tests.run(root, { site: output })'), 'JSON-only publication must be rebuilt before canonical artifact checks');
assert.match(fs.readFileSync(path.join(root, 'tests/canonical-notes.test.js'), 'utf8'), /ALMANION_TEST_SITE/, 'canonical checks must verify the actual deployable artifact');
(async () => {
    const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    const expected = { id: 'test', content: 'new' };
    let deployed = { id: 'test', content: 'old' }, failure = true;
    const tracker = Publication.create({ owner: 'fixture', storage, fetch: async url => ({ ok: true, json: async () => url.startsWith('https://api.github.com/') ? { workflow_runs: [{ name: 'Deploy GitHub Pages', status: 'completed', conclusion: failure ? 'failure' : 'success', html_url: 'https://github.com/Almanion/almanion.github.io/actions/runs/123' }] } : deployed }) });
    await tracker.track('likbez', 'test', 'fixture-sha', expected);
    const record = tracker.get('likbez', 'test');
    record.acceptedAt -= 6 * 60 * 1000;
    await tracker.retry('likbez', 'test');
    assert.equal(record.stage, 'failed');
    assert.match(record.error, /сборка/);
    assert.match(record.deploymentUrl, /actions\/runs/);
    failure = false; record.deploymentCheckedAt = 0;
    await tracker.retry('likbez', 'test');
    assert.equal(record.stage, 'delayed', 'a delayed deployment cannot masquerade as an endlessly running update');
    deployed = expected;
    await tracker.retry('likbez', 'test');
    assert.equal(record.stage, 'live', 'a later successful rebuild resolves the original accepted publication');
    tracker.stop();
    // A first publication has no previous public JSON. A missing file (or an
    // unavailable site) must not prevent checking the independent GitHub run.
    for (const responseMode of [404, 503, 'network']) {
        const calls = [], stored = new Map();
        const first = { subject: 'likbez', section: 'first', path: 'content/likbez/sections/first.json', commitSha: 'new-fixture-sha', fingerprint: await Publication.fingerprint(expected), acceptedAt: Date.now() - 6 * 60 * 1000, stage: 'pending', error: '' };
        stored.set('note-publications-v1:first-owner', JSON.stringify({ 'likbez/first': first }));
        let available = false, apiAvailable = true;
        const fresh = Publication.create({ owner: 'first-owner', storage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) }, fetch: async url => {
            calls.push(url);
            if (url.startsWith('https://api.github.com/')) {
                if (!apiAvailable) throw new Error('GitHub API unavailable');
                return { ok: true, json: async () => ({ workflow_runs: [{ name: 'Deploy GitHub Pages', status: 'completed', conclusion: 'failure', html_url: 'https://github.com/Almanion/almanion.github.io/actions/runs/456' }] }) };
            }
            if (available) return { ok: true, json: async () => expected };
            if (responseMode === 'network') throw new Error('Offline');
            return { ok: false, status: responseMode };
        } });
        try {
            await fresh.retry('likbez', 'first');
            const result = fresh.get('likbez', 'first');
            assert.equal(result.stage, 'failed', 'first publication failure must be detected despite ' + responseMode);
            assert.match(result.error, /сборка/);
            assert.match(result.deploymentUrl, /runs\/456$/);
            await fresh.retry('likbez', 'first');
            assert.equal(calls.filter(url => url.startsWith('https://api.github.com/')).length, 1, 'manual retries must respect the API rate guard');
            apiAvailable = false; result.deploymentCheckedAt = 0;
            await fresh.retry('likbez', 'first');
            assert.equal(result.stage, 'failed', 'a later unavailable API must not erase a confirmed failure');
            available = true;
            await fresh.retry('likbez', 'first');
            assert.equal(result.stage, 'live', 'matching public content resolves even a failed first publication');
        } finally { fresh.stop(); }
    }
    const waiting = { subject: 'likbez', section: 'new', path: 'content/likbez/sections/new.json', commitSha: 'waiting-sha', fingerprint: await Publication.fingerprint(expected), acceptedAt: Date.now(), stage: 'pending', error: '' };
    const initialStorage = new Map([['note-publications-v1:waiting-owner', JSON.stringify({ 'likbez/new': waiting })]]);
    let apiChecks = 0;
    const initial = Publication.create({ owner: 'waiting-owner', storage: { getItem: key => initialStorage.get(key), setItem: (key, value) => initialStorage.set(key, value) }, fetch: async url => {
        if (!url.startsWith('https://api.github.com/')) return { ok: false, status: 404 };
        apiChecks++;
        return { ok: true, json: async () => ({ workflow_runs: [{ name: 'Deploy GitHub Pages', status: 'completed', conclusion: 'success' }] }) };
    } });
    try {
        await initial.retry('likbez', 'new');
        const result = initial.get('likbez', 'new');
        assert.equal(result.stage, 'pending');
        assert.equal(result.error, '', 'an expected first-publication 404 is not a network error');
        assert.equal(apiChecks, 0, 'allow time for GitHub to register the new run');
        result.acceptedAt -= 31000;
        await initial.retry('likbez', 'new');
        assert.equal(apiChecks, 1);
        assert.equal(result.stage, 'pending', 'successful Actions alone cannot prove the public section is live');
        result.acceptedAt -= 6 * 60 * 1000;
        await initial.retry('likbez', 'new');
        assert.equal(result.stage, 'delayed');
        assert.match(result.error, /ещё не появились/);
    } finally { initial.stop(); }
    console.log('publication: JSON-first pipeline, failed deployment, bounded status and recovery passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
