'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const History = require('../constructor/history.js');

const root = path.resolve(__dirname, '..');

function failingIndexedDb() {
    return {
        open() {
            const request = { error: new Error('IndexedDB unavailable') };
            Promise.resolve().then(() => {
                if (typeof request.onerror === 'function') request.onerror();
            });
            return request;
        }
    };
}

function localStorageStub(shouldFail) {
    const values = new Map();
    return {
        get length() { return values.size; },
        key(index) { return Array.from(values.keys())[index] || null; },
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) {
            if (shouldFail) throw new Error('localStorage unavailable');
            values.set(String(key), String(value));
        },
        removeItem(key) { values.delete(String(key)); }
    };
}

function loadStorage(localStorage) {
    const window = {};
    const source = fs.readFileSync(path.join(root, 'constructor', 'storage.js'), 'utf8');
    vm.runInNewContext(source, {
        window,
        indexedDB: failingIndexedDb(),
        localStorage,
        console
    }, { filename: 'constructor/storage.js' });
    return window.NoteStorage;
}

async function testStorageFailureReporting() {
    const section = { subject: 'physics', id: 'mechanics', updatedAt: 10, blocks: [] };
    const unavailable = loadStorage(localStorageStub(true));
    await assert.rejects(
        unavailable.putDraft('editor', section),
        /Не удалось сохранить черновик на устройстве/
    );
    await assert.rejects(
        unavailable.putAsset('editor', 'physics', 'mechanics', 'figure', { dataUrl: 'data:image/png;base64,AA==' }),
        /Не удалось сохранить изображение на устройстве/
    );

    const fallback = loadStorage(localStorageStub(false));
    const saved = await fallback.putDraft('editor', section);
    assert.strictEqual(saved.id, 'mechanics', 'localStorage remains a valid durable fallback when IndexedDB is unavailable');
}

function testAtomicSectionOrdering() {
    const sections = [
        { id: 'a', order: 1000 },
        { id: 'b', order: 2000 },
        { id: 'c', order: 3000 }
    ];
    const current = sections[1];
    const untouchedOrders = [sections[0].order, sections[2].order];
    const undo = new History.UndoStack(20);
    undo.record(current, 'Перемещён раздел');
    current.order = History.orderForMove(sections, 1, -1);
    sections.sort((left, right) => left.order - right.order);
    assert.deepStrictEqual(sections.map(section => section.id), ['b', 'a', 'c']);
    assert.deepStrictEqual([sections[1].order, sections[2].order], untouchedOrders, 'moving one section must not mutate its neighbours');

    const restored = undo.undo(current);
    Object.assign(current, restored.snapshot);
    sections.sort((left, right) => left.order - right.order);
    assert.deepStrictEqual(sections.map(section => section.id), ['a', 'b', 'c']);
    assert.strictEqual(new Set(sections.map(section => section.order)).size, sections.length, 'undo must preserve unique ordering values');
}

function testResponsiveAndAutosaveWiring() {
    const script = fs.readFileSync(path.join(root, 'constructor', 'index.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'constructor', 'index.css'), 'utf8');
    assert.ok(script.includes('saveTimers: new Map()'));
    assert.ok(script.includes('remoteSaveQueues: new Map()'));
    assert.ok(script.includes('flushTimers(key)'));
    assert.ok(script.includes('localSave.then(localSaved => queueRemoteSave'));
    assert.ok(!script.includes('state.localTimer'));
    assert.ok(!script.includes('state.remoteTimer'));
    assert.match(script, /sourceFormat === 'html-fragment-v1'/);
    assert.match(script, /compatibilityReadOnly/);
    assert.match(script, /stale pre-migration draft/);
    assert.match(css, /is-outline-fullscreen \.builder-sections[^}]*overflow-y:\s*auto/);
    assert.match(css, /@media \(max-width: 540px\)[\s\S]*grid-template-rows:\s*40px 38px 38px/);
}

(async function run() {
    await testStorageFailureReporting();
    testAtomicSectionOrdering();
    testResponsiveAndAutosaveWiring();
    console.log('constructor resilience tests: ok');
})().catch(error => {
    console.error(error && error.stack || error);
    process.exitCode = 1;
});
