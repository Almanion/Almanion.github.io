'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');

const OWNER = '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';
const AUTHOR = 'note-review-author';
const OTHER_EDITOR = 'different-note-review-author';
const TITLE = 'Свойства света';
const serverTime = () => ({ '.sv': 'timestamp' });

function review(id, authorUid = AUTHOR) {
    const target = { authorUid, subject: 'physics-10', sectionId: 'light' };
    return {
        ['noteReviewInbox/' + id]: {
            ...target, authorEmail: authorUid + '@example.test', title: TITLE, revision: 2,
            submittedAt: serverTime(), status: 'pending'
        },
        ['noteReviewVersions/' + id]: { ...target, baseHash: 'none', bundle: '[{"path":"content/physics-10/sections/light.json"}]' }
    };
}

function decision(uid, status, extra = {}) {
    return { status, decisionBy: uid, decidedAt: serverTime(), note: '', commit: '', ...extra };
}

(async function () {
    const environment = await initializeTestEnvironment({
        projectId: 'almanion-rules-test',
        database: { rules: fs.readFileSync(path.join(__dirname, '..', 'firebase', 'database.rules.json'), 'utf8') }
    });
    try {
        function as(uid, provider = 'password') {
            return environment.authenticatedContext(uid, {
                email: uid + '@example.test', firebase: { sign_in_provider: provider }
            }).database();
        }
        const owner = as(OWNER);
        const author = as(AUTHOR);
        const other = as(OTHER_EDITOR);
        const viewer = as('note-review-reader');
        const anonymous = as('note-review-guest', 'anonymous');
        for (const uid of [AUTHOR, OTHER_EDITOR]) {
            await assertSucceeds(owner.ref('adminRoles/' + uid).set({
                email: uid + '@example.test', siteAdmin: false, matcenterAdmin: false, contentEditor: true,
                dutyEditor: false, tourEditor: false, englishAccess: false, updatedAt: serverTime(), updatedBy: OWNER
            }));
        }

        const id = author.ref('noteReviewInbox').push().key;
        const inbox = 'noteReviewInbox/' + id;
        const version = 'noteReviewVersions/' + id;
        const input = review(id);
        await assertFails(author.ref(inbox).set(input[inbox]));
        await assertFails(author.ref(version).set(input[version]));
        await assertFails(viewer.ref().update(review(id, 'note-review-reader')));
        await assertFails(other.ref().update(input));
        await assertFails(author.ref().update({ ...input, [version]: { ...input[version], sectionId: 'sound' } }));
        await assertFails(author.ref().update({ ...input, [inbox]: { ...input[inbox], authorEmail: 'forged@example.test' } }));
        await assertSucceeds(author.ref().update(input));

        const ownerPending = owner.ref('noteReviewInbox').orderByChild('status').equalTo('pending');
        const authorHistory = author.ref('noteReviewInbox').orderByChild('authorUid').equalTo(AUTHOR);
        assert.equal((await assertSucceeds(ownerPending.once('value'))).child(id).child('title').val(), TITLE);
        assert.equal((await assertSucceeds(authorHistory.once('value'))).child(id).child('status').val(), 'pending');
        await assertFails(author.ref('noteReviewInbox').once('value'));
        await assertFails(other.ref('noteReviewInbox').orderByChild('authorUid').equalTo(AUTHOR).once('value'));
        await assertFails(viewer.ref(inbox).once('value'));
        await assertFails(anonymous.ref(inbox).once('value'));
        await assertFails(other.ref(version).once('value'));
        assert.equal((await assertSucceeds(owner.ref(version).once('value'))).child('bundle').val(), input[version].bundle);
        await assertSucceeds(author.ref(version).once('value'));
        await assertFails(author.ref(version + '/bundle').set('[]'));
        await assertFails(owner.ref(version).remove());
        await assertFails(author.ref(inbox).remove());

        await assertFails(owner.ref(inbox).update(decision(OWNER, 'published', { commit: 'a'.repeat(40) })));
        await assertFails(author.ref(inbox).update({ status: 'publishing', claimAt: serverTime() }));
        await assertFails(author.ref(inbox).update(decision(AUTHOR, 'returned')));
        await assertFails(owner.ref(inbox).update({ status: 'publishing', claimAt: 1 }));
        await assertSucceeds(owner.ref(inbox).update({ status: 'publishing', claimAt: serverTime() }));
        await assertFails(author.ref(inbox).update(decision(AUTHOR, 'withdrawn')));
        await assertSucceeds(owner.ref(inbox).update({ status: 'pending', claimAt: null }));
        await assertSucceeds(owner.ref(inbox).update({ status: 'publishing', claimAt: serverTime() }));
        const published = decision(OWNER, 'published', { commit: 'a'.repeat(40) });
        await assertFails(owner.ref(inbox).update({ ...published, title: 'Другая версия' }));
        await assertFails(owner.ref(inbox).update({ ...published, claimAt: null }));
        await assertFails(owner.ref(inbox).update({ ...published, commit: 'invalid' }));
        await assertSucceeds(owner.ref(inbox).update(published));
        assert.equal((await assertSucceeds(author.ref(inbox).once('value'))).child('commit').val(), published.commit);
        await assertFails(owner.ref(inbox).update({ status: 'pending' }));

        const returned = owner.ref('noteReviewInbox').push().key;
        await assertSucceeds(author.ref().update(review(returned)));
        await assertSucceeds(owner.ref('noteReviewInbox/' + returned).update(decision(OWNER, 'returned', { note: 'Поправь формулу.' })));
        assert.equal((await assertSucceeds(authorHistory.once('value'))).child(returned).child('note').val(), 'Поправь формулу.');
        const withdrawn = owner.ref('noteReviewInbox').push().key;
        await assertSucceeds(author.ref().update(review(withdrawn)));
        await assertFails(other.ref('noteReviewInbox/' + withdrawn).update(decision(OTHER_EDITOR, 'withdrawn')));
        await assertSucceeds(author.ref('noteReviewInbox/' + withdrawn).update(decision(AUTHOR, 'withdrawn')));
        await assertFails(owner.ref('noteReviewInbox/' + withdrawn).update({ status: 'publishing', claimAt: serverTime() }));
        assert.equal((await assertSucceeds(ownerPending.once('value'))).exists(), false);

        await assertSucceeds(owner.ref('adminRoles/' + AUTHOR + '/contentEditor').set(false));
        await assertSucceeds(authorHistory.once('value'));
        await assertFails(author.ref().update(review(author.ref('noteReviewInbox').push().key)));
    } finally {
        await environment.cleanup();
    }
    console.log('Note review rules passed immutable submissions, visibility, and owner-only decisions.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
