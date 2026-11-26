'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const Review = require('../constructor/review.js');

test('a review preserves the submitted revision and retries publication after an uncertain response', async () => {
    const records = new Map();
    const id = '-P7reviewSnapshot000';
    const inboxKey = 'noteReviewInbox/' + id;
    const configs = { ownerUid: 'owner', publisherEndpoint: 'https://publisher.example.test/exec' };
    const base = { schemaVersion: 1, subject: 'physics', id: 'warmth', revision: 3, title: 'Тепло' };
    const author = { uid: 'editor', email: 'editor@example.test' };
    const owner = { uid: 'owner', getIdToken: async () => 'test-token' };
    const commit = 'a'.repeat(40);
    let published = base, checkSupported = false, responses = 0;
    const requests = [];
    function ref(path = '') {
        return {
            child(key) { return ref(path + '/' + key); },
            push() { return { key: id }; },
            async update(update) {
                for (const [key, value] of Object.entries(update)) records.set(key, structuredClone(value));
            },
            async once() { return { val: () => structuredClone(records.get(path)) }; },
            async transaction(mutate) {
                const next = mutate(structuredClone(records.get(path)));
                if (next === undefined) return { committed: false };
                records.set(path, next);
                return { committed: true, snapshot: { val: () => next } };
            }
        };
    }
    globalThis.location = { href: 'https://almanion.example.test/admin.html' };
    globalThis.fetch = async (url, options) => {
        if (String(url).includes('capabilities')) return Response.json({ noteReviewBaseCheck: checkSupported });
        if (options.method !== 'POST') return Response.json(published);
        const command = JSON.parse(options.body);
        requests.push(command);
        responses++;
        if (responses === 1) {
            published = JSON.parse(command.files[0].content);
            throw new TypeError('simulated network error after commit');
        }
        return Response.json({ success: true, commitSha: commit });
    };
    const database = { ref };
    const outgoing = Review.create({ database, user: author, config: configs });
    const incoming = Review.create({ database, user: owner, config: configs });
    const baseHash = createHash('sha256').update(JSON.stringify(base)).digest('hex');
    assert.equal(await Review.hashSection(base), baseHash);
    const section = { ...base, revision: 4, title: 'Тепловые явления' };
    const files = [
        { path: 'content/physics/sections/warmth.json', encoding: 'utf-8', content: JSON.stringify(section) },
        { path: 'content/physics/manifest.json', encoding: 'utf-8', content: '{"subject":"physics","sections":[]}' },
        { path: 'images/notes/physics/diagram.png', encoding: 'base64', content: 'aW1hZ2U=' }
    ];
    await assert.rejects(outgoing.submit({ section, baseHash, files: [
        ...files, { path: 'images/notes/physics/outside.html', encoding: 'base64', content: 'aW1hZ2U=' }
    ] }), /Недопустимый файл/);
    assert.equal(await outgoing.submit({ section, files, baseHash }), id);
    files[0].content = '{}';
    section.title = 'Изменения после отправки';
    const submitted = await incoming.getVersion(id);
    assert.equal(submitted.section.title, 'Тепловые явления');

    await assert.rejects(incoming.publish(id, submitted), { code: 'publisher-unavailable' });
    assert.equal(records.get(inboxKey).status, 'pending');
    checkSupported = true;
    published = { ...base, title: 'Другой вариант' };
    await assert.rejects(incoming.publish(id, submitted), { code: 'stale-base' });
    assert.equal(records.get(inboxKey).status, 'pending');
    published = base;
    await assert.rejects(incoming.publish(id, submitted), /network error/);
    assert.equal(records.get(inboxKey).status, 'publishing');
    await assert.rejects(outgoing.decide(id, { status: 'withdrawn' }), /Статус версии изменился/);
    assert.deepEqual(await incoming.publish(id, submitted), { commit });
    assert.equal(records.get(inboxKey).status, 'published');
    assert.deepEqual(requests[0], requests[1]);
    assert.equal(requests[0].reviewId, id);
    assert.equal(requests[0].expectedBaseHash, baseHash);
    assert.deepEqual(await incoming.publish(id, submitted), { commit });
    assert.equal(requests.length, 2);
});
