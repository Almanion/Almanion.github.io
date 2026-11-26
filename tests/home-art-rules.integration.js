'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');

const OWNER = '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';
const EDITOR = 'art-editor';
const OTHER = 'art-other-editor';
const viewerId = 'art-viewer';
const serverTime = () => ({ '.sv': 'timestamp' });
const email = uid => uid + '@example.test';
const drawing = JSON.stringify([{ color: '#aabbff', size: 5, erase: false, points: [0.3, 0.6, 0.5, 0.1] }]);
const projectRoot = path.join(__dirname, '..');
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(projectRoot, 'home-art-store.js'), 'utf8'), { window });
const createStore = window.AlmanionHomeArtStore.create;

function input(authorUid, extra = {}) {
    return {
        authorUid, authorEmail: email(authorUid), baseRevision: 'none', drawing,
        submittedAt: serverTime(), status: 'pending', ...extra
    };
}

function decision(decisionBy, status, note = '') {
    return { status, decisionBy, note, decidedAt: serverTime() };
}

function role(uid, extra = {}) {
    return {
        email: email(uid), siteAdmin: false, matcenterAdmin: false, contentEditor: false,
        dutyEditor: false, tourEditor: false, englishAccess: false, updatedAt: serverTime(), updatedBy: OWNER,
        ...extra
    };
}

(async function () {
    const environment = await initializeTestEnvironment({
        projectId: 'almanion-rules-test',
        database: { rules: fs.readFileSync(path.join(projectRoot, 'firebase', 'database.rules.json'), 'utf8') }
    });
    try {
        function as(uid, provider = 'password') {
            return environment.authenticatedContext(uid, {
                email: email(uid), firebase: { sign_in_provider: provider }
            }).database();
        }

        const owner = as(OWNER);
        const editor = as(EDITOR);
        const other = as(OTHER);
        const viewer = as(viewerId);
        const guest = environment.unauthenticatedContext().database();
        const anonymous = as('art-anon', 'anonymous');
        const ownerStore = createStore(owner, { uid: OWNER, email: email(OWNER) });
        const editorStore = createStore(editor, { uid: EDITOR, email: email(EDITOR) });
        const publicStore = createStore(guest);
        for (const uid of [EDITOR, OTHER]) {
            await assertSucceeds(owner.ref('adminRoles/' + uid).set(role(uid, { contentEditor: true })));
        }
        await assertSucceeds(owner.ref('adminRoles/' + viewerId).set(role(viewerId, { siteAdmin: true })));
        assert.equal(await assertSucceeds(publicStore.readPublished()), null);
        await assertFails(guest.ref('homeArt').once('value'));

        const draft = editor.ref('homeArt/submissions').push();
        const draftPath = 'homeArt/submissions/' + draft.key;
        await assertFails(editor.ref('homeArt/submissions/invalid-id').set(input(EDITOR)));
        await assertFails(draft.set(input(EDITOR, { authorEmail: email(OTHER) })));
        await assertFails(draft.set(input(EDITOR, { drawing: 'a'.repeat(120001) })));
        await assertFails(draft.set(input(EDITOR, { hiddenField: true })));
        await assertFails(other.ref(draftPath).set(input(EDITOR)));
        await assertFails(anonymous.ref(draftPath).set(input('art-anon')));
        await assertFails(viewer.ref(draftPath).set(input(viewerId)));

        const id = await assertSucceeds(editorStore.submit({ drawing, baseRevision: 'none' }));
        const entryPath = 'homeArt/submissions/' + id;
        const entry = { id, ...(await owner.ref(entryPath).once('value')).val() };
        const staleId = await assertSucceeds(editorStore.submit({ drawing: '[]', baseRevision: 'none' }));
        const stalePath = 'homeArt/submissions/' + staleId;
        await assertSucceeds(editor.ref(entryPath).once('value'));
        await assertFails(editor.ref('homeArt/submissions').once('value'));
        await assertFails(guest.ref(entryPath).once('value'));
        await assertFails(anonymous.ref(entryPath).once('value'));
        await assertFails(other.ref(entryPath).once('value'));
        await assertFails(other.ref('homeArt/submissions').orderByChild('authorUid').equalTo(EDITOR).once('value'));
        await assertFails(viewer.ref(entryPath).once('value'));

        await assertFails(editor.ref(entryPath).update({ drawing: '[]' }));
        await assertFails(editorStore.returnForRevision(entry, 'Нужна доработка.'));
        await assertFails(editorStore.approve(entry));
        await assertFails(editor.ref(entryPath).remove());
        await assertFails(owner.ref(entryPath).update(decision(OWNER, 'published')));
        await assertFails(owner.ref('homeArt/published').set({ revision: id, drawing, publishedAt: serverTime() }));
        await assertFails(ownerStore.approve({ ...entry, drawing: '[]' }));

        await assertSucceeds(ownerStore.approve(entry));
        await assertSucceeds(ownerStore.approve(entry));
        const approved = await assertSucceeds(publicStore.readPublished());
        assert.equal(approved.revision, id);
        assert.equal(approved.drawing, drawing);
        assert.deepEqual(Object.keys(approved).sort(), ['drawing', 'publishedAt', 'revision']);
        assert.equal((await editor.ref(entryPath).once('value')).child('status').val(), 'published');
        await assertFails(owner.ref('homeArt/published').remove());

        const stale = { id: staleId, ...(await owner.ref(stalePath).once('value')).val() };
        await assert.rejects(ownerStore.approve(stale), { code: 'stale-background' });
        await assertFails(owner.ref().update({
            [stalePath + '/status']: 'published', [stalePath + '/decisionBy']: OWNER,
            [stalePath + '/decidedAt']: serverTime(), [stalePath + '/note']: '',
            'homeArt/published': { revision: staleId, drawing: '[]', publishedAt: serverTime() }
        }));
        await assertSucceeds(ownerStore.returnForRevision(stale, 'Фон уже изменился.'));
        assert.equal((await editor.ref(stalePath).once('value')).child('note').val(), 'Фон уже изменился.');

        const withdrawnId = await assertSucceeds(editorStore.submit({ drawing, baseRevision: id }));
        await assertFails(other.ref('homeArt/submissions/' + withdrawnId).update(decision(OTHER, 'withdrawn')));
        await assertSucceeds(editorStore.withdraw({ id: withdrawnId }));
        assert.equal((await owner.ref('homeArt/submissions/' + withdrawnId).once('value')).child('status').val(), 'withdrawn');

        const clearId = await assertSucceeds(ownerStore.submit({ drawing: '[]', baseRevision: id }));
        await assertSucceeds(ownerStore.approve({ id: clearId, drawing: '[]', baseRevision: id }));
        assert.equal((await publicStore.readPublished()).drawing, '[]');
        assert.equal((await owner.ref('homeArt/submissions').orderByChild('status').equalTo('pending').once('value')).exists(), false);
        assert.equal((await editor.ref('homeArt/submissions').orderByChild('authorUid').equalTo(EDITOR).once('value')).numChildren(), 3);

        await assertSucceeds(owner.ref('adminRoles/' + EDITOR + '/contentEditor').set(false));
        await assertFails(editorStore.submit({ drawing, baseRevision: clearId }));
    } finally {
        await environment.cleanup();
    }
    console.log('Home art rules passed author privacy, immutable submissions, and atomic owner approval.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
