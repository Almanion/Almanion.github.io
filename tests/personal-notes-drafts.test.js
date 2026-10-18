'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'personal-notes.js'), 'utf8');

// Execute the production draft/save functions with storage and the existing
// bookmarks service isolated; browser tests cover the actual dialog lifecycle.
function fixture(values = new Map()) {
    const state = { uid: null, writes: [], failSave: false, failStorage: false, failRemove: false, records: new Map() };
    const controls = { textarea: { value: '' }, '.personal-note-count': {}, '[data-note-discard]': { style: {} }, '.personal-note-draft-status': {} };
    const recordKey = id => (state.uid || 'guest') + ':' + id;
    const context = {
        document: { documentElement: { lang: 'ru' }, readyState: 'loading', addEventListener() {} },
        localStorage: {
            get length() { return values.size; }, key(index) { return Array.from(values.keys())[index] ?? null; },
            getItem(key) { return values.get(key) ?? null; },
            setItem(key, value) { if (state.failStorage) throw Error('Quota exceeded'); values.set(key, value); },
            removeItem(key) { if (state.failRemove) throw Error('Storage unavailable'); values.delete(key); }
        },
        window: {
            AlmanionAccount: { getUser: () => state.uid ? { uid: state.uid } : null },
            AlmanionBookmarks: {
                record: id => state.records.get(recordKey(id)) || null,
                notes: () => [],
                noteSavedOnDevice: (id, text) => !state.failDurableSave && (state.records.get(recordKey(id))?.noteText || '') === text,
                saveNote(id, text, metadata) {
                    if (state.failSave) throw Error('Save failed');
                    state.writes.push({ uid: state.uid, id, text });
                    state.records.set(recordKey(id), { ...metadata, noteText: String(text || '').trim().slice(0, 4000) });
                    return !state.failDurableSave;
                }
            }
        }
    };
    const instrumented = source.replace('window.AlmanionPersonalNotes = { open, refresh: buttons };', `window.AlmanionPersonalNotes = { readDraft, writeDraft, removeDraft, drafts, selectNote, persistEditor, saveNote, currentOwner, noteEntries, selected: () => selected, setDialog: value => { dialog = value; } };`);
    vm.runInNewContext(instrumented, context, { filename: 'personal-notes.js' });
    const api = context.window.AlmanionPersonalNotes;
    api.setDialog({ querySelector: selector => controls[selector] });
    const edit = (id, text) => { api.selectNote(id, { title: 'Block ' + id, page: '/physics-10.html' }); controls.textarea.value = text; };
    return { state, controls, api, values, edit };
}

{
    const f = fixture();
    f.edit('block:one', 'First unfinished note'); f.api.persistEditor();
    f.edit('block:two', 'Second unfinished note'); f.api.persistEditor();
    assert.equal(f.state.writes.length, 0, 'typing must not commit notes or write to the cloud');
    assert.equal(f.api.drafts('guest').length, 2, 'blocks keep independent drafts');
    const reload = fixture(f.values);
    reload.api.selectNote('block:one', {});
    assert.equal(reload.api.selected().text, 'First unfinished note', 'a new runtime must restore the draft');
    assert.equal(reload.api.selected().restored, true);
    assert.equal(reload.api.readDraft('guest', 'block:two').text, 'Second unfinished note');
}
{
    const f = fixture();
    for (const uid of [null, 'one', 'two']) {
        f.state.uid = uid; f.edit('same-block', 'Private for ' + (uid || 'guest')); f.api.persistEditor();
    }
    assert.equal(f.api.readDraft('guest', 'same-block').text, 'Private for guest');
    assert.equal(f.api.readDraft('uid:one', 'same-block').text, 'Private for one');
    assert.equal(f.api.readDraft('uid:two', 'same-block').text, 'Private for two');
    assert.equal(f.api.removeDraft('uid:one', 'same-block'), true);
    assert.equal(f.api.readDraft('uid:one', 'same-block'), null);
    assert.equal(f.api.readDraft('uid:two', 'same-block').text, 'Private for two', 'discard must not touch another owner');
}
{
    const f = fixture();
    f.edit('one', 'Do not lose this draft'); f.api.persistEditor();
    f.state.failSave = true;
    assert.equal(f.api.saveNote(f.controls.textarea.value), false);
    assert.equal(f.api.readDraft('guest', 'one').text, 'Do not lose this draft');
    assert.match(f.controls['.personal-note-draft-status'].textContent, /Не удалось сохранить пометку/);
    assert.equal(f.controls.textarea.value, 'Do not lose this draft');
    f.state.failSave = false;
    assert.equal(f.api.saveNote(f.controls.textarea.value), true);
    assert.equal(f.api.readDraft('guest', 'one'), null);
    assert.equal(f.state.writes.length, 1);
}
{
    const f = fixture();
    f.edit('one', 'Memory is not durable'); f.api.persistEditor();
    f.state.failDurableSave = true;
    assert.equal(f.api.saveNote(f.controls.textarea.value), false);
    assert.equal(f.state.records.get('guest:one').noteText, 'Memory is not durable');
    assert.equal(f.api.readDraft('guest', 'one').text, 'Memory is not durable', 'a memory-only note must not replace the durable draft');
    f.api.selectNote('one', {}); f.controls.textarea.value = f.api.selected().text;
    f.api.persistEditor();
    assert.equal(f.api.readDraft('guest', 'one').text, 'Memory is not durable', 'reopening a failed save must not turn a memory-only value into a durable baseline');
    f.state.uid = 'other'; f.state.failDurableSave = false;
    f.state.records.set('other:one', { noteText: 'Memory is not durable' });
    f.api.persistEditor();
    assert.equal(f.api.readDraft('guest', 'one').text, 'Memory is not durable', 'account-switch persistence must never use the next owner as proof of the old owner save');
}
{
    const f = fixture();
    f.state.uid = 'one'; f.edit('one', 'Account one draft'); f.api.persistEditor();
    f.state.uid = 'two';
    assert.equal(f.api.saveNote('must not go to account two'), false);
    assert.equal(f.state.writes.length, 0);
    assert.equal(f.api.readDraft('uid:one', 'one').text, 'Account one draft');
    assert.equal(f.api.readDraft('uid:two', 'one'), null);
}
{
    const f = fixture();
    f.state.failStorage = true; f.edit('one', 'In-memory fallback');
    assert.equal(f.api.persistEditor(), false);
    assert.equal(f.api.readDraft('guest', 'one').text, 'In-memory fallback');
    assert.match(f.controls['.personal-note-draft-status'].textContent, /Не удалось сохранить черновик/);
    assert.equal(f.api.drafts('guest').length, 1);
    f.state.failStorage = false;
    assert.equal(f.api.persistEditor(), true);
    assert.equal(fixture(f.values).api.readDraft('guest', 'one').text, 'In-memory fallback');
    f.state.failRemove = true;
    assert.equal(f.api.saveNote('In-memory fallback'), false, 'failed draft cleanup must keep the editor open');
    assert.equal(f.api.readDraft('guest', 'one').text, 'In-memory fallback');
    assert.match(f.controls['.personal-note-draft-status'].textContent, /Пометка сохранена, но/);
}
{
    const f = fixture();
    f.state.records.set('guest:one', { noteText: 'Already saved' });
    f.edit('one', 'Changed'); f.api.persistEditor();
    f.controls.textarea.value = 'Already saved'; f.api.persistEditor();
    assert.equal(f.api.readDraft('guest', 'one'), null, 'returning to the saved text must clear the draft');
    f.values.set('almanion_personal_note_draft_v1:guest:bad', JSON.stringify({ version: 1, id: 'different', text: 'x' }));
    assert.equal(f.api.readDraft('guest', 'bad'), null, 'malformed storage must not attach a draft to another block');
}

// Both formats are deployed: legacy raw bookmark maps and DataSync envelopes.
const bookmarksSource = fs.readFileSync(path.join(__dirname, '..', 'bookmarks.js'), 'utf8');
const durableHelper = bookmarksSource.match(/    function noteSavedOnDevice\(id, text\) \{[\s\S]*?\n    \}/)?.[0];
assert.ok(durableHelper, 'bookmarks must expose a durable-save confirmation');
for (const envelope of [false, true]) {
    let raw;
    const sandbox = { bookmarkCacheKey: 'test', bookmarkOwnerUid: 'one', localStorage: { getItem: () => raw } };
    vm.runInNewContext(durableHelper + '\nthis.confirm = noteSavedOnDevice;', sandbox);
    const store = records => { raw = JSON.stringify(envelope ? { schema: 1, namespace: 'bookmarks', owner: 'one', records } : records); };
    store({ id: { noteText: 'Durable text' } });
    assert.equal(sandbox.confirm('id', 'Durable text'), true);
    assert.equal(sandbox.confirm('id', 'Only in memory'), false);
    assert.equal(sandbox.confirm('id', ''), false, 'a failed deletion must not remove its draft');
    store({ id: { noteText: 'Old text', deleted: true } });
    assert.equal(sandbox.confirm('id', ''), true);
    raw = '{malformed';
    assert.equal(sandbox.confirm('id', 'Unconfirmed'), false);
}

console.log('personal notes drafts: durable storage, owner isolation, explicit save and failure recovery passed');
