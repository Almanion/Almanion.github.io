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
const { create: createStore, photoUrl, readAspect } = window.AlmanionHomeArtStore;
const photo = '/9j/2Q==';
const altPhoto = '/9j/AA==';
const cappedPhoto = '/9j/' + 'A'.repeat(191996);
const oversizedPhoto = '/9j/' + 'A'.repeat(192000);

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
        assert.equal(photoUrl(photo), 'data:image/jpeg;base64,' + photo);
        assert.ok(photoUrl(cappedPhoto));
        for (const invalid of ['/9j/AAa=', '/9j/AB==', '/9j/AAA\n', 'data:image/jpeg;base64,' + photo, oversizedPhoto]) {
            assert.equal(photoUrl(invalid), '');
        }
        for (const aspect of [.1, 16 / 9, 10]) assert.equal(readAspect(aspect), aspect);
        for (const invalid of [null, undefined, NaN, Infinity, .09, 10.01, '1.6', false]) {
            assert.equal(readAspect(invalid), null);
        }

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
        await assertFails(ownerStore.approve({ ...entry, photo }));
        await assertFails(ownerStore.approve({ ...entry, aspect: 1 }));

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

        for (const invalid of ['/9j/AB==', '/9j/AAA\n', 'data:image/jpeg;base64,' + photo, oversizedPhoto]) {
            await assertFails(draft.set(input(EDITOR, { baseRevision: clearId, photo: invalid })));
        }
        for (const invalid of [.09, 10.01, '1.6', false]) {
            await assertFails(draft.set(input(EDITOR, { baseRevision: clearId, aspect: invalid })));
        }
        await assert.rejects(editorStore.submit({ drawing: '[]', baseRevision: clearId, photo: oversizedPhoto }), /Не удалось сохранить фото/);
        await assert.rejects(editorStore.submit({ drawing: '[]', baseRevision: clearId, aspect: '1.6' }), /Не удалось сохранить пропорции/);
        await assertFails(viewer.ref(draftPath).set(input(viewerId, { baseRevision: clearId, photo })));
        const photoId = await assertSucceeds(editorStore.submit({ drawing: '[]', baseRevision: clearId, photo: cappedPhoto, aspect: .1 }));
        const photoPath = 'homeArt/submissions/' + photoId;
        const photoEntry = { id: photoId, ...(await owner.ref(photoPath).once('value')).val() };
        assert.ok(photoEntry.photo === cappedPhoto);
        assert.equal(photoEntry.aspect, .1);
        await assertFails(guest.ref(photoPath + '/photo').once('value'));
        await assertFails(other.ref(photoPath + '/photo').once('value'));
        await assertFails(editor.ref(photoPath).update({ ...decision(EDITOR, 'withdrawn'), photo: null }));
        await assertFails(owner.ref(photoPath).update({ ...decision(OWNER, 'returned', 'Выберите другой фон.'), photo: altPhoto }));
        await assertFails(editor.ref(photoPath).update({ ...decision(EDITOR, 'withdrawn'), aspect: null }));
        await assertFails(owner.ref(photoPath).update({ ...decision(OWNER, 'returned', 'Проверьте формат.'), aspect: 10 }));
        await assertFails(editorStore.approve(photoEntry));
        await assertFails(ownerStore.approve({ ...photoEntry, photo: altPhoto }));
        await assertFails(ownerStore.approve({ ...photoEntry, photo: undefined }));
        await assertFails(ownerStore.approve({ ...photoEntry, aspect: 1 }));
        await assertFails(ownerStore.approve({ ...photoEntry, aspect: undefined }));
        assert.equal((await publicStore.readPublished()).revision, clearId);
        assert.equal((await owner.ref(photoPath + '/status').once('value')).val(), 'pending');

        await assertSucceeds(ownerStore.approve(photoEntry));
        const photoPublished = await publicStore.readPublished();
        assert.ok(photoPublished.photo === cappedPhoto);
        assert.equal(photoPublished.aspect, .1);
        assert.equal((await owner.ref(photoPath + '/status').once('value')).val(), 'published');
        const removePhotoId = await assertSucceeds(ownerStore.submit({ drawing, baseRevision: photoId, photo: null, aspect: 10 }));
        const removePhoto = { id: removePhotoId, ...(await owner.ref('homeArt/submissions/' + removePhotoId).once('value')).val() };
        await assertSucceeds(ownerStore.approve(removePhoto));
        const latest = await publicStore.readPublished();
        assert.equal(latest.revision, removePhotoId);
        assert.equal(latest.drawing, drawing);
        assert.equal(latest.aspect, 10);
        assert.equal(Object.hasOwn(latest, 'photo'), false);
        const legacyId = await assertSucceeds(ownerStore.submit({ drawing, baseRevision: removePhotoId, aspect: null }));
        await assertSucceeds(ownerStore.approve({ id: legacyId, drawing, baseRevision: removePhotoId }));
        assert.equal(Object.hasOwn(await publicStore.readPublished(), 'aspect'), false);

        await assertSucceeds(owner.ref('adminRoles/' + EDITOR + '/contentEditor').set(false));
        await assertFails(editorStore.submit({ drawing, baseRevision: legacyId, photo }));
    } finally {
        await environment.cleanup();
    }
    console.log('Home art rules passed author privacy, immutable submissions, photo and aspect validation, and atomic owner approval.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
