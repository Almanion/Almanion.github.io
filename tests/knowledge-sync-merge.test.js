'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'account.js'), 'utf8');

function extractFunction(name) {
    const marker = 'function ' + name + '(';
    const start = source.indexOf(marker);
    assert.ok(start >= 0, `${name} must exist in account.js`);
    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    let quote = '';
    let lineComment = false;
    let blockComment = false;
    let escaped = false;
    for (let index = bodyStart; index < source.length; index += 1) {
        const current = source[index];
        const next = source[index + 1];
        if (lineComment) {
            if (current === '\n') lineComment = false;
            continue;
        }
        if (blockComment) {
            if (current === '*' && next === '/') { blockComment = false; index += 1; }
            continue;
        }
        if (quote) {
            if (escaped) { escaped = false; continue; }
            if (current === '\\') { escaped = true; continue; }
            if (current === quote) quote = '';
            continue;
        }
        if (current === '/' && next === '/') { lineComment = true; index += 1; continue; }
        if (current === '/' && next === '*') { blockComment = true; index += 1; continue; }
        if (current === '"' || current === "'" || current === '`') { quote = current; continue; }
        if (current === '{') depth += 1;
        if (current === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, index + 1);
        }
    }
    throw new Error(`Could not extract ${name}`);
}

const names = [
    'kcObject', 'cloneKcValue', 'stableKcValue', 'stableKcJson',
    'reviewEventId', 'reviewEventAt', 'reviewEventList', 'compareReviewEvents',
    'mergeReviewEvents', 'explicitReviewEventIds', 'isStrictSuperset',
    'cardRevision', 'compareCardStates', 'mergeCardStates', 'storeUpdatedAt',
    'mergeStores', 'mergeMeta'
];
const sandbox = { module: { exports: {} } };
vm.runInNewContext(
    names.map(extractFunction).join('\n\n')
        + '\nmodule.exports = { mergeStores, mergeReviewEvents, storeUpdatedAt };',
    sandbox,
    { filename: 'account-kc-sync-functions.js' }
);
const { mergeStores, mergeReviewEvents, storeUpdatedAt } = sandbox.module.exports;

const equalTimeLeft = {
    __meta: { schema: 2, updatedAt: 100 },
    'card-a': { last: 100, reps: 1, due: 999999 }
};
const equalTimeRight = {
    __meta: { schema: 2, updatedAt: 100 },
    'card-b': { last: 100, reps: 1, due: 888888 }
};
const equalTimeMerged = mergeStores(equalTimeLeft, equalTimeRight);
assert.equal(equalTimeMerged['card-a'].reps, 1, 'an equal-timestamp merge must retain a local-only card');
assert.equal(equalTimeMerged['card-b'].reps, 1, 'an equal-timestamp merge must retain a remote-only card');

const legacyMerged = mergeStores(
    { card: { last: 200, reps: 2, phase: 'review' } },
    { card: { last: 100, reps: 9, phase: 'learning' } }
);
assert.equal(legacyMerged.card.phase, 'review', 'v2 cards must keep the later reviewed state');
assert.equal(legacyMerged.card.reps, 2, 'a stale v2 counter must not override the later state');

const causalNewer = {
    last: 300,
    reps: 2,
    phase: 'review',
    reviewEvents: [
        { id: 'event-1', at: 100, grade: 3 },
        { id: 'event-2', at: 200, grade: 3 }
    ]
};
const clockSkewedOlder = {
    last: 999999,
    reps: 1,
    phase: 'learning',
    reviewEvents: [{ id: 'event-1', at: 100, grade: 3 }]
};
const causalMerged = mergeStores({ card: causalNewer }, { card: clockSkewedOlder });
assert.equal(causalMerged.card.phase, 'review', 'a strict event-history superset must beat a skewed client clock');
assert.deepEqual(Array.from(causalMerged.card.reviewEvents, event => event.id), ['event-1', 'event-2']);

const firstGrade = {
    v: 3,
    fresh: false,
    revision: 1,
    updatedAt: 100,
    last: 100,
    reps: 1,
    stability: 1,
    due: 1000,
    reviewEvents: [{ id: 'first-grade', at: 100, grade: 3, mode: 'schedule' }]
};
const cancelledFirstGrade = {
    v: 3,
    fresh: true,
    revision: 2,
    updatedAt: 200,
    reviewEvents: [
        { id: 'first-grade', at: 100, grade: 3, mode: 'schedule' },
        { id: 'undo-first-grade', at: 200, grade: 0, mode: 'undo', undoes: ['first-grade'] }
    ]
};
const cancelledMerged = mergeStores({ card: firstGrade }, { card: cancelledFirstGrade });
assert.equal(cancelledMerged.card.fresh, true,
    'a compensating undo tombstone must beat the already-synced first grade');
assert.deepEqual(
    Array.from(cancelledMerged.card.reviewEvents, event => event.id),
    ['first-grade', 'undo-first-grade']
);
assert.deepEqual(
    mergeStores({ card: firstGrade }, { card: cancelledFirstGrade }),
    mergeStores({ card: cancelledFirstGrade }, { card: firstGrade }),
    'the cancelled grade must converge independently of merge direction'
);

const gradeAfterUndo = {
    v: 3,
    fresh: false,
    revision: 3,
    updatedAt: 300,
    last: 300,
    reps: 1,
    stability: 4,
    due: 4000,
    lastGrade: 4,
    reviewEvents: [
        { id: 'first-grade', at: 100, grade: 3, mode: 'schedule' },
        { id: 'undo-first-grade', at: 200, grade: 0, mode: 'undo', undoes: ['first-grade'] },
        { id: 'replacement-grade', at: 300, grade: 4, mode: 'schedule' }
    ]
};
const regradedMerged = mergeStores({ card: cancelledFirstGrade }, { card: gradeAfterUndo });
assert.equal(regradedMerged.card.fresh, false, 'a later real answer must supersede the undo tombstone');
assert.equal(regradedMerged.card.lastGrade, 4);
assert.deepEqual(
    Array.from(regradedMerged.card.reviewEvents, event => event.id),
    ['first-grade', 'undo-first-grade', 'replacement-grade']
);

const divergentLeft = {
    card: {
        last: 500,
        reps: 3,
        due: 600,
        reviewEvents: [{ id: 'tab-a-event', at: 500, grade: 2 }]
    }
};
const divergentRight = {
    card: {
        last: 500,
        reps: 3,
        due: 700,
        reviewEvents: [{ id: 'tab-b-event', at: 500, grade: 4 }]
    }
};
const divergentAB = mergeStores(divergentLeft, divergentRight);
const divergentBA = mergeStores(divergentRight, divergentLeft);
assert.deepEqual(
    Array.from(divergentAB.card.reviewEvents, event => event.id),
    ['tab-a-event', 'tab-b-event'],
    'concurrent review events from two tabs must both survive'
);
assert.deepEqual(divergentAB, divergentBA, 'conflicting histories must converge independently of merge direction');

const partialDuplicate = mergeReviewEvents(
    [{ id: 'same-event', at: 1000, grade: 3 }],
    [{ id: 'same-event', at: 1000, deviceId: 'phone' }]
);
assert.equal(partialDuplicate.length, 1, 'the same immutable event id must not be duplicated');
assert.equal(partialDuplicate[0].grade, 3, 'a partial duplicate must retain fields from the first copy');
assert.equal(partialDuplicate[0].deviceId, 'phone', 'a partial duplicate must retain fields from the second copy');

const metaEvents = mergeStores(
    { __meta: { schema: 3, updatedAt: 100, reviewEvents: [{ id: 'meta-a', at: 100 }] } },
    { __meta: { schema: 3, updatedAt: 100, reviewEvents: [{ id: 'meta-b', at: 101 }] } }
);
assert.deepEqual(
    Array.from(metaEvents.__meta.reviewEvents, event => event.id),
    ['meta-a', 'meta-b'],
    'legacy store-level review journals must also merge safely'
);

assert.equal(storeUpdatedAt({
    __meta: { updatedAt: 20 },
    card: {
        last: 30,
        due: 9999999999999,
        reviewEvents: [{ id: 'latest', at: 40, grade: 3 }]
    }
}), 40, 'sync freshness must include review events but must never use future due dates');

assert.match(source, /detail\.store/, 'the account bridge must accept the store carried by kc-store-changed');
assert.match(source, /detail\.persisted === false/, 'failed knowledge-check writes must remain syncable in memory');
assert.match(source, /pushPage\(k, payload, detail\.updatedAt\)/,
    'the exact event payload must be queued instead of rereading stale localStorage');
assert.match(source, /kc-store-sync-status/, 'storage failures must be observable by the knowledge-check UI');

console.log('knowledge-check cloud merge: all tests passed');
