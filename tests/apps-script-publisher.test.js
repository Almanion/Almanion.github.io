'use strict';

const assert = require('assert');
const crypto = require('node:crypto');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(require.resolve('../apps-script.gs'), 'utf8');
const context = { console };
vm.createContext(context);
vm.runInContext(source, context);

assert.strictEqual(context.isAllowedNotePath('content/physics/manifest.json', 'physics', 'waves'), true);
assert.strictEqual(context.isAllowedNotePath('content/physics/sections/waves.json', 'physics', 'waves'), true);
assert.strictEqual(context.isAllowedNotePath('images/notes/physics/123-waves.webp', 'physics', 'waves'), true);
assert.strictEqual(context.isAllowedNotePath('content/physics/sections/other.json', 'physics', 'waves'), false);
assert.strictEqual(context.isAllowedNotePath('../firebase-config.js', 'physics', 'waves'), false);
assert.strictEqual(context.isAllowedNotePath('images/notes/math/secret.png', 'physics', 'waves'), false);
assert.strictEqual(context.isAllowedNotePath('content/literature-10/manifest.json', 'literature-10', 'tolstoy'), true);
assert.strictEqual(context.isAllowedNotePath('content/literature-10/sections/tolstoy.json', 'literature-10', 'tolstoy'), true);
assert.strictEqual(context.isAllowedNoteDeletePath('content/physics/sections/waves.json', 'physics', 'waves'), true);
assert.strictEqual(context.isAllowedNoteDeletePath('images/notes/physics/123-waves.webp', 'physics', 'waves'), true);
assert.strictEqual(context.isAllowedNoteDeletePath('content/physics/manifest.json', 'physics', 'waves'), false);
assert.strictEqual(context.isAllowedNoteDeletePath('content/physics/sections/other.json', 'physics', 'waves'), false);
assert.strictEqual(context.isAllowedNoteDeletePath('images/notes/math/secret.png', 'physics', 'waves'), false);

const subject = 'physics-10';
const sectionId = 'light';
const sectionPath = 'content/' + subject + '/sections/' + sectionId + '.json';
const manifestPath = 'content/' + subject + '/manifest.json';
const reviewId = '-Q23456789abcdefghij';
const committed = 'a'.repeat(40);
const base = { subject, id: sectionId, title: 'Свет', updatedAt: 3 };
const next = { ...base, title: 'Волны света', updatedAt: 4 };
const baseHash = crypto.createHash('sha256').update(JSON.stringify(base), 'utf8').digest('hex');
const identity = { uid: '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2', email: 'owner@example.test' };
const request = {
    action: 'publishNotes', idToken: 'owner-test-token', subject, sectionId,
    expectedBaseHash: baseHash, reviewId,
    files: [
        { path: sectionPath, content: JSON.stringify(next) },
        { path: manifestPath, content: JSON.stringify({ subject, sections: [sectionId] }) }
    ]
};

context.json = value => JSON.parse(JSON.stringify(value));
context.verifyFirebaseToken = value => value === request.idToken ? identity : { uid: 'delegated-editor', email: 'editor@example.test' };
context.PropertiesService = { getScriptProperties: () => ({ getProperty: key => key === 'GITHUB_TOKEN' ? 'mock-github-token' : '' }) };
context.Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256', SHA_1: 'sha1' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (algorithm, content, encoding) => Array.from(crypto.createHash(algorithm)
        .update(typeof content === 'string' ? content : Buffer.from(content), encoding).digest()),
    base64Decode: text => Array.from(Buffer.from(text, 'base64')),
    newBlob: content => ({ getDataAsString: () => Buffer.from(content).toString('utf8'), getBytes: () => Array.from(Buffer.from(content)) })
};
const post = payload => context.doPost({ postData: { contents: JSON.stringify(payload) } });

function mockGithub(options = {}) {
    let locked = false;
    let nextBlob = 0;
    const writes = [];
    const reads = [];
    context.LockService = { getScriptLock: () => ({
        waitLock: () => { assert.strictEqual(locked, false); locked = true; },
        releaseLock: () => { assert.strictEqual(locked, true); locked = false; }
    }) };
    const jsonFile = contents => ({ content: Buffer.from(JSON.stringify(contents), 'utf8').toString('base64'), encoding: 'base64' });
    function response(status, payload) {
        return { getResponseCode: () => status, getContentText: () => JSON.stringify(payload) };
    }
    context.UrlFetchApp = { fetch(raw, input) {
        assert.strictEqual(locked, true, 'read the base and write the publication under the same lock');
        const url = new URL(raw);
        const endpoint = url.pathname.replace('/repos/Almanion/Almanion.github.io', '');
        if (input.method === 'get') {
            reads.push([endpoint, Object.fromEntries(url.searchParams)]);
            if (endpoint === '/git/ref/heads/main') return response(200, { object: { sha: 'parent' } });
            if (endpoint === '/git/commits/parent') return response(200, { tree: { sha: 'base-tree' } });
            if (endpoint === '/contents/' + manifestPath) {
                return response(200, jsonFile({ subject, sections: options.current === null ? ['other'] : [sectionId, 'other'] }));
            }
            if (endpoint === '/contents/' + sectionPath) {
                const current = options.current === undefined ? base : options.current;
                if (options.error) return response(options.error, { message: 'read failed' });
                return current === null ? response(404, { message: 'Not Found' }) : response(200, jsonFile(current));
            }
            if (endpoint === '/commits') return response(200, options.priorCommits || []);
            if (endpoint.startsWith('/contents/images/notes/')) {
                const sha = options.assetHashes?.[endpoint.substring('/contents/'.length)];
                return sha ? response(200, { sha }) : response(404, { message: 'Not Found' });
            }
        } else {
            const body = JSON.parse(input.payload);
            writes.push([endpoint, body]);
            if (endpoint === '/git/blobs') return response(201, { sha: 'blob-' + ++nextBlob });
            if (endpoint === '/git/trees') return response(201, { sha: 'next-tree' });
            if (endpoint === '/git/commits') return response(201, { sha: committed });
            if (endpoint === '/git/refs/heads/main') return options.updateError
                ? response(options.updateError, { message: 'unknown update result' })
                : response(200, { object: { sha: committed } });
        }
        throw new Error('Unexpected fake GitHub request ' + input.method + ' ' + endpoint);
    } };
    return { writes, reads };
}

{
    const backend = mockGithub();
    assert.strictEqual(post({ ...request, idToken: 'editor-test-token' }).success, false);
    assert.deepStrictEqual(backend.reads, []);
    assert.deepStrictEqual(backend.writes, []);
    assert.strictEqual(post({ ...request, expectedBaseHash: 'invalid' }).success, false);
    assert.strictEqual(post({ ...request, reviewId: 'invalid' }).success, false);
    assert.deepStrictEqual(backend.writes, []);
    const result = post(request);
    assert.strictEqual(result.commitSha, committed);
    assert.deepStrictEqual(backend.reads.find(([path]) => path === '/contents/' + sectionPath)?.[1], { ref: 'parent' });
    assert.strictEqual(backend.writes.find(([path]) => path === '/git/commits')[1].message.endsWith('Note-Review: ' + reviewId), true);
    assert.deepStrictEqual(backend.writes.at(-1), ['/git/refs/heads/main', { sha: committed, force: false }]);
}

{
    const stale = mockGithub({ current: { ...base, title: 'Изменённый раздел' } });
    assert.strictEqual(post(request).code, 'stale-base');
    assert.deepStrictEqual(stale.writes, []);
    const retry = mockGithub({ current: next, priorCommits: [
        { sha: 'b'.repeat(40), commit: { message: 'Additional edit' } },
        { sha: committed, commit: { message: 'Publish notes\n\nNote-Review: ' + reviewId } }
    ] });
    assert.deepStrictEqual(post(request), { success: true, commitSha: committed, alreadyPublished: true });
    assert.deepStrictEqual(retry.writes, []);
    const collision = mockGithub({ current: base });
    assert.strictEqual(post({ ...request, expectedBaseHash: 'none' }).code, 'stale-base');
    assert.deepStrictEqual(collision.writes, []);
}

{
    const missing = mockGithub({ current: null });
    assert.strictEqual(post({ ...request, expectedBaseHash: 'none' }).commitSha, committed);
    assert.ok(missing.reads.some(([path]) => path === '/contents/' + sectionPath));
    const offline = mockGithub({ error: 503 });
    const result = post({ ...request, expectedBaseHash: 'none' });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.code, 'review-rejected');
    assert.deepStrictEqual(offline.writes, []);
    const legacy = mockGithub();
    const { reviewId: omittedReview, expectedBaseHash: omittedBase, ...legacyRequest } = request;
    assert.strictEqual(post(legacyRequest).commitSha, committed);
    assert.ok(!legacy.reads.some(([path]) => path === '/contents/' + sectionPath));
}

{
    const path = 'images/notes/physics-10/light.png';
    const data = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVioAAAAASUVORK5CYII=', 'base64');
    const png = { path, encoding: 'base64', content: data.toString('base64') };
    const withImage = { ...next, blocks: [{ type: 'image', src: path }] };
    const sectionFile = section => ({ path: sectionPath, content: JSON.stringify(section) });
    const bundle = { ...request, files: [sectionFile(withImage), request.files[1], png] };
    const files = mockGithub({ assetHashes: { [path]: 'different' } });
    const denied = post(bundle);
    assert.strictEqual(denied.code, 'review-rejected');
    assert.match(denied.error, /Имя изображения уже занято/);
    assert.deepStrictEqual(files.writes, []);
    const unchanged = crypto.createHash('sha1').update('blob ' + data.length + '\0').update(data).digest('hex');
    mockGithub({ assetHashes: { [path]: unchanged } });
    assert.strictEqual(post(bundle).commitSha, committed);
    const fresh = mockGithub();
    assert.strictEqual(post(bundle).commitSha, committed);
    assert.ok(fresh.reads.some(([endpoint]) => endpoint.endsWith(path)));
    const malformed = mockGithub();
    assert.strictEqual(post({ ...request, files: [...request.files, png] }).code, 'review-rejected');
    assert.strictEqual(post({ ...bundle, files: [...bundle.files, png] }).code, 'review-rejected');
    assert.strictEqual(post({ ...bundle, files: [
        sectionFile({ ...withImage, sourceFormat: 'html-fragment-v1' }), request.files[1], png
    ] }).code, 'review-rejected');
    assert.strictEqual(post({ ...bundle, files: [sectionFile(withImage), request.files[1], {
        ...png, content: Buffer.from('wrong format').toString('base64')
    }] }).code, 'review-rejected');
    assert.deepStrictEqual(malformed.writes, []);
}

{
    const updateTimeout = mockGithub({ updateError: 503 });
    const result = post(request);
    assert.strictEqual(result.success, false);
    assert.notStrictEqual(result.code, 'review-rejected');
    assert.deepStrictEqual(updateTimeout.writes.at(-1), ['/git/refs/heads/main', { sha: committed, force: false }]);
}

console.log('Apps Script publisher passed owner permission, stale-base guard, idempotent retry, frozen assets and legacy publication.');
