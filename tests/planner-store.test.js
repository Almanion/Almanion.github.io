'use strict';

const assert = require('node:assert/strict');
const core = require('../personal-planner-core.js');
const uid = core.OWNER_UID;
const local = new Map();
global.localStorage = { getItem: key => local.get(key) || null, setItem: (key, value) => local.set(key, value) };
const copy = core.clone;
const tick = () => new Promise(resolve => setImmediate(resolve));
const pendingKey = 'almanion:personal-planner:pending:v1:' + uid;
const cacheKey = 'almanion:personal-planner:v1:' + uid;
const event = (id, title = 'Заметка') => ({ id, title, category: 'personal', date: '2026-09-25', recurrence: { frequency: 'none', interval: 1 }, notes: '' });

function assign(target, path, value) {
    const parts = path.split('/');
    const key = parts.pop();
    const parent = parts.reduce((current, part) => current[part] || (current[part] = {}), target);
    if (value === null) delete parent[key]; else parent[key] = copy(value);
}

// Match the SDK's synchronous local events and asynchronous rollback/acknowledgement.
function fakeDatabase(initial = core.defaultData()) {
    let data = copy(initial), listener, connection;
    const db = { calls: [], failure: null, pause: null, seeds: 0 };
    const emit = () => { if (listener) listener({ val: () => copy(data) }); };
    const ref = {
        on: (_, callback) => { listener = callback; emit(); },
        off: () => { listener = null; },
        set: value => { db.seeds++; data = copy(value); emit(); return Promise.resolve(); },
        update: updates => {
            if (db.calls.length >= 20) throw new Error('write storm');
            db.calls.push(copy(updates));
            const before = copy(data);
            for (const [path, value] of Object.entries(updates)) assign(data, path, value);
            emit();
            return Promise.resolve(db.pause && db.pause()).then(() => {
                if (db.failure) { data = before; emit(); throw db.failure; }
            });
        }
    };
    db.ref = path => path === '.info/connected' ? {
        on: (_, callback) => { connection = callback; callback({ val: () => true }); }, off: () => { connection = null; }
    } : ref;
    db.connectivity = value => connection && connection({ val: () => value });
    db.remote = value => { data = copy(value); emit(); };
    db.data = () => copy(data);
    return db;
}

async function setup(db = fakeDatabase()) {
    local.clear();
    const store = new core.Store();
    await store.connect({ uid }, db);
    return { store, db };
}

(async function () {
    {
        const { store, db } = await setup();
        assert.equal(await store.upsert('events', event('note')), true);
        assert.equal(db.calls.length, 1, 'optimistic value must not recursively flush');
        assert.deepEqual(store.pending, {});
        assert.equal(db.data().events.note.title, 'Заметка');
        store.disconnect();
    }
    {
        const { store, db } = await setup();
        db.failure = Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' });
        let errors = 0;
        store.subscribe((_, detail) => { if (detail.source === 'error') errors++; });
        assert.equal(await store.upsert('events', event('note')), false);
        await tick();
        db.remote(db.data());
        await store.upsert('events', event('note', 'Исправлено'));
        assert.equal(db.calls.length, 1, 'rejected writes must stay paused, including on rollback');
        assert.equal(errors, 1, 'no endless offline/error messages');
        assert.equal(JSON.parse(local.get(pendingKey))['events/note'].title, 'Исправлено');
        db.failure = null;
        assert.equal(await store.retry(), true);
        assert.equal(db.calls.length, 2);
        assert.equal(db.data().events.note.title, 'Исправлено');
        store.disconnect();
    }
    {
        const { store, db } = await setup();
        let release;
        db.pause = () => new Promise(resolve => { release = resolve; });
        const first = store.upsert('events', event('note', 'Первое'));
        await tick();
        const second = store.upsert('events', event('note', 'Второе'));
        db.pause = null;
        release();
        assert.equal(await first, true);
        assert.equal(await second, true);
        assert.equal(db.calls.length, 2);
        assert.equal(db.data().events.note.title, 'Второе', 'late acknowledgement must not discard a newer edit');
        store.disconnect();
    }
    {
        const { store, db } = await setup();
        db.connectivity(false);
        assert.equal(await store.upsert('events', event('offline')), false);
        assert.equal(db.calls.length, 0);
        assert.ok(JSON.parse(local.get(pendingKey))['events/offline']);
        db.connectivity(true);
        await store.flush();
        assert.ok(db.data().events.offline);
        store.disconnect();
    }
    {
        const { store, db } = await setup();
        let release;
        db.pause = () => new Promise(resolve => { release = resolve; });
        const oldSave = store.upsert('events', event('old'));
        await tick();
        store.disconnect();
        const newDb = fakeDatabase();
        await store.connect({ uid }, newDb);
        await store.flush();
        newDb.failure = new Error('permission-denied');
        await store.upsert('events', event('new'));
        release();
        assert.equal(await oldSave, false);
        assert.ok(store.pending['events/new'], 'old session acknowledgement cannot clear new pending writes');
        assert.ok(store.lastError);
        store.disconnect();
    }
    {
        local.clear();
        const invalidSeries = { ...event('series-legacy'), total: 12, solved: null, written: null, updatedAt: 1 };
        const invalidGoal = { ...event('goal-legacy'), target: 10, current: null, updatedAt: 1 };
        local.set(pendingKey, JSON.stringify({ 'series/series-legacy': invalidSeries, 'goals/goal-legacy': invalidGoal }));
        const store = new core.Store(), db = fakeDatabase();
        await store.connect({ uid }, db);
        await store.flush();
        assert.equal(db.data().series['series-legacy'].solved, 0, 'repair already queued invalid records');
        assert.equal(db.data().goals['goal-legacy'].current, 0);
        assert.deepEqual(store.pending, {});
        store.disconnect();
    }
    {
        const { store, db } = await setup();
        db.connectivity(false);
        await store.upsert('events', event('old'));
        await store.importState(core.defaultData());
        await store.upsert('events', event('new'));
        db.connectivity(true);
        await store.flush();
        const keys = Object.keys(db.calls[0]);
        assert.equal(keys.some(key => keys.some(other => key.startsWith(other + '/'))), false, 'restore + edits must never produce overlapping paths');
        assert.ok(db.data().events.new);
        assert.equal(db.data().events.old, undefined);
        store.disconnect();
    }
    {
        const { store, db } = await setup(fakeDatabase(null));
        assert.equal(db.seeds, 1, 'optimistic seed events must not restart seeding');
        assert.equal(store.ready, true);
        store.disconnect();
    }
    {
        const { store, db } = await setup();
        db.connectivity(false);
        const saved = global.localStorage.setItem;
        global.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
        await store.upsert('events', event('quota'));
        assert.equal(store.localPersisted, false, 'do not claim a local copy when storage fails');
        assert.ok(store.state.events.quota, 'keep an in-memory exportable copy');
        global.localStorage.setItem = saved;
        await store.retry();
        assert.equal(store.localPersisted, true);
        assert.ok(JSON.parse(local.get(cacheKey)).events.quota);
        store.disconnect();
    }
    assert.equal(Number.isNaN(core.parseDate('2026-02-31').getTime()), true);
    {
        local.clear();
        const cached = core.defaultData();
        cached.events.cached = event('cached');
        local.set(cacheKey, JSON.stringify(cached));
        const store = new core.Store();
        const database = { ref: path => path === '.info/connected' ? { on: (_, cb) => cb({ val: () => false }), off() {} } : { on() {}, off() {} } };
        await store.connect({ uid }, database);
        assert.equal(store.ready, true, 'cached plan can open while cloud is unavailable');
        assert.equal(store.state.events.cached.title, 'Заметка');
        store.disconnect();
    }
    assert.deepEqual(core.expandItems({}, 'bad', 'also-bad'), []);
    const repeat = { ...event('repeat'), recurrence: { frequency: 'weekly', days: [5], interval: 2, until: '2026-10-09' } };
    assert.equal(core.occursOn(repeat, '2026-10-02'), false);
    assert.equal(core.occursOn(repeat, '2026-10-09'), true);
    assert.equal(core.occursOn(repeat, '2026-10-23'), false);
    console.log('planner store: reentrancy, rejection, offline recovery, migration, concurrency, restore and storage tests passed');
}()).catch(error => { console.error(error); process.exitCode = 1; });
