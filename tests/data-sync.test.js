'use strict';

const assert = require('node:assert/strict');
const Sync = require('../data-sync.js');

class MemoryStorage {
    constructor(seed) { this.values = new Map(Object.entries(seed || {})); }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
}

class FakeRef {
    constructor(value, failUpdates) {
        this.value = value || {};
        this.failUpdates = !!failUpdates;
        this.handler = null;
        this.updates = [];
    }
    once() { return Promise.resolve({ val: () => this.value }); }
    on(_event, handler) { this.handler = handler; }
    off() { this.handler = null; }
    update(value) {
        this.updates.push(value);
        if (this.failUpdates) return Promise.reject(new Error('offline'));
        this.value = Object.assign({}, this.value, value);
        return Promise.resolve();
    }
    emit(value) {
        this.value = value;
        if (this.handler) this.handler({ val: () => value });
    }
}

class TransactionRef extends FakeRef {
    constructor(value) {
        super(value, false);
        this.transactions = [];
        this.beforeRetry = null;
    }
    child(id) {
        return {
            transaction: async (update) => {
                const firstAttempt = update(this.value[id] == null ? null : this.value[id]);
                if (this.beforeRetry) {
                    const hook = this.beforeRetry;
                    this.beforeRetry = null;
                    await hook(this, id, firstAttempt);
                }
                const committed = update(this.value[id] == null ? null : this.value[id]);
                this.value[id] = committed;
                this.transactions.push({ id, value: committed });
                return { committed: true, snapshot: { val: () => committed } };
            }
        };
    }
}

async function run() {
    const storage = new MemoryStorage({
        legacy_bookmarks: JSON.stringify({ old: { title: 'Legacy', updatedAt: 10 } })
    });
    const legacy = Sync.createCollection({
        namespace: 'bookmarks', owner: 'guest', storageKey: 'legacy_bookmarks',
        storage, deviceId: 'device-a', now: () => 20
    });
    assert.equal(legacy.get('old').title, 'Legacy', 'legacy maps must upgrade without data loss');
    assert.equal(JSON.parse(storage.getItem('legacy_bookmarks')).schema, 1);

    const newerLocal = Sync.normalizeRecord({ value: 'local', updatedAt: 300 }, {
        revision: 1, updatedAt: 300, deviceId: 'a', pending: true
    });
    const olderRemote = Sync.normalizeRecord({ value: 'remote', updatedAt: 200 }, {
        revision: 99, updatedAt: 200, deviceId: 'z', pending: false
    });
    assert.equal(Sync.mergeRecords({ item: newerLocal }, { item: olderRemote }).item.value, 'local',
        'a higher stale counter must never overwrite a fresher edit');

    const tieA = Sync.normalizeRecord({ value: 'a' }, { revision: 2, updatedAt: 400, deviceId: 'a' });
    const tieB = Sync.normalizeRecord({ value: 'b' }, { revision: 2, updatedAt: 400, deviceId: 'b' });
    assert.equal(Sync.compareRecords(tieA, tieB), -1);
    assert.equal(Sync.compareRecords(tieB, tieA), 1, 'tie resolution must be deterministic');

    const offline = Sync.createCollection({
        namespace: 'progress', owner: 'uid-1', storageKey: 'progress_uid-1',
        storage, deviceId: 'device-a', now: () => 500
    });
    offline.set('task-1', { solved: true });
    const failingRef = new FakeRef({}, true);
    await offline.connect(failingRef);
    assert.equal(offline.get('task-1').solved, true, 'an empty/error snapshot must preserve local data');
    assert.equal(offline.pending().length, 1, 'failed writes must remain in the persistent queue');

    offline.disconnect();
    const restored = Sync.createCollection({
        namespace: 'progress', owner: 'uid-1', storageKey: 'progress_uid-1',
        storage, deviceId: 'device-a', now: () => 600
    });
    assert.equal(restored.pending().length, 1, 'the offline queue must survive a reload');
    const workingRef = new FakeRef({});
    await restored.connect(workingRef);
    assert.equal(restored.remoteObserved, true, 'a successful empty snapshot must be distinguishable from a failed read');
    assert.equal(restored.pending().length, 0);
    assert.equal(workingRef.value['task-1'].solved, true);

    const remoteWinsStorage = new MemoryStorage();
    const remoteWins = Sync.createCollection({
        namespace: 'progress', owner: 'uid-remote', storageKey: 'progress_uid-remote',
        storage: remoteWinsStorage, deviceId: 'local-device', now: () => 650
    });
    remoteWins.set('task', { solved: false }, { updatedAt: 600, flush: false });
    const freshRemote = Sync.normalizeRecord({ solved: true }, {
        revision: 7, updatedAt: 700, deviceId: 'remote-device', pending: false
    });
    const remoteWinsRef = new FakeRef({ task: freshRemote });
    await remoteWins.connect(remoteWinsRef);
    assert.equal(remoteWins.get('task').solved, true, 'a fresh remote record must win reconciliation');
    assert.equal(remoteWins.pending().length, 0, 'the stale queued write must be discarded when remote wins');
    assert.equal(remoteWinsRef.updates.length, 0, 'a stale queued write must never be replayed over fresh remote data');

    const tombstoneWinsStorage = new MemoryStorage();
    const tombstoneWins = Sync.createCollection({
        namespace: 'progress', owner: 'uid-tombstone', storageKey: 'progress_uid-tombstone',
        storage: tombstoneWinsStorage, deviceId: 'local-device', now: () => 750
    });
    tombstoneWins.set('task', { solved: true }, { updatedAt: 710, flush: false });
    const freshTombstone = Sync.normalizeRecord({ solved: false }, {
        revision: 8, updatedAt: 800, deviceId: 'remote-device', deleted: true, pending: false
    });
    const tombstoneWinsRef = new FakeRef({ task: freshTombstone });
    await tombstoneWins.connect(tombstoneWinsRef);
    assert.equal(tombstoneWins.get('task'), null, 'a fresh remote tombstone must remain deleted');
    assert.equal(tombstoneWins.pending().length, 0, 'a stale live write must not survive a newer tombstone');
    assert.equal(tombstoneWinsRef.updates.length, 0, 'a stale live write must not resurrect remote data');

    const localWinsStorage = new MemoryStorage();
    const localRecord = Sync.normalizeRecord({ solved: true }, {
        revision: 4, updatedAt: 900, deviceId: 'local-device', pending: false
    });
    localWinsStorage.setItem('progress_uid-local', JSON.stringify({
        schema: 1,
        namespace: 'progress',
        owner: 'uid-local',
        revision: 4,
        updatedAt: 900,
        deviceId: 'local-device',
        records: { task: localRecord }
    }));
    const localWins = Sync.createCollection({
        namespace: 'progress', owner: 'uid-local', storageKey: 'progress_uid-local',
        storage: localWinsStorage, deviceId: 'local-device', now: () => 950
    });
    const staleRemote = Sync.normalizeRecord({ solved: false }, {
        revision: 9, updatedAt: 850, deviceId: 'remote-device', pending: false
    });
    const localWinsRef = new FakeRef({ task: staleRemote });
    await localWins.connect(localWinsRef);
    assert.equal(localWinsRef.updates.length, 1, 'a newer persisted local record must be queued during initial reconciliation');
    assert.equal(localWinsRef.value.task.solved, true);
    assert.equal(localWins.pending().length, 0);

    let emptyNotifications = 0;
    const emptyStore = Sync.createCollection({
        namespace: 'settings', owner: 'new-account', storageKey: 'settings_new-account',
        storage: new MemoryStorage(), deviceId: 'settings-device', now: () => 960,
        onChange(_records, detail) { if (detail && detail.type === 'merge') emptyNotifications += 1; }
    });
    await emptyStore.connect(new FakeRef({}));
    assert.equal(emptyStore.remoteObserved, true);
    assert.ok(emptyNotifications >= 1, 'an empty successful cloud read must notify account bootstrap code');

    const deleted = restored.remove('task-1', { solved: false }, { updatedAt: 700, flush: false });
    assert.equal(Sync.metadata(deleted).deleted, true);
    restored.merge({
        'task-1': Sync.normalizeRecord({ solved: true }, {
            revision: 500, updatedAt: 650, deviceId: 'remote'
        })
    });
    assert.equal(restored.get('task-1'), null, 'a newer tombstone must beat an older live record');
    assert.equal(restored.get('task-1', { includeDeleted: true }).deleted, true);

    const guestStorage = new MemoryStorage();
    const guest = Sync.createCollection({
        namespace: 'bookmarks', owner: 'guest', storageKey: 'bookmarks_guest',
        storage: guestStorage, deviceId: 'guest-device', now: () => 800
    });
    guest.set('g1', { title: 'Guest bookmark' }, { flush: false });
    const account = Sync.migrateGuest({
        namespace: 'bookmarks', owner: 'uid-2',
        guestStorageKey: 'bookmarks_guest', accountStorageKey: 'bookmarks_uid-2',
        storage: guestStorage, deviceId: 'account-device', now: () => 900
    });
    assert.equal(account.get('g1').title, 'Guest bookmark');
    assert.equal(account.pending().length, 1, 'migrated guest records must be queued for the account');

    const backup = Sync.exportData({ storage: guestStorage });
    const targetStorage = new MemoryStorage();
    const target = Sync.createCollection({
        namespace: 'bookmarks', owner: 'uid-2', storageKey: 'bookmarks_uid-2',
        storage: targetStorage, deviceId: 'target', now: () => 1000
    });
    target.set('local-only', { title: 'Keep me' }, { flush: false });
    Sync.importData(backup, { storage: targetStorage });
    const imported = Sync.createCollection({
        namespace: 'bookmarks', owner: 'uid-2', storageKey: 'bookmarks_uid-2',
        storage: targetStorage, deviceId: 'target', now: () => 1100
    });
    assert.equal(imported.get('g1').title, 'Guest bookmark');
    assert.equal(imported.get('local-only').title, 'Keep me', 'import must merge, not replace current data');
    assert.ok(imported.pending().length >= 2, 'imported and preserved records must be queued for cloud reconciliation');

    // Acknowledging an older request may not clear a newer edit made while the
    // request was in flight.
    const race = Sync.createCollection({
        namespace: 'race', owner: 'uid', storageKey: 'race_uid',
        storage: new MemoryStorage(), deviceId: 'race-device', now: (() => { let n = 1200; return () => ++n; })()
    });
    race.set('x', { value: 1 }, { flush: false });
    const sent = race.pending();
    race.set('x', { value: 2 }, { flush: false });
    race.acknowledge(sent);
    assert.equal(race.pending().length, 1);
    assert.equal(race.get('x').value, 2);

    let releaseFirst;
    const racingRef = new FakeRef({});
    racingRef.update = function (value) {
        this.updates.push(value);
        if (this.updates.length === 1) {
            return new Promise((resolve) => { releaseFirst = () => { this.value = Object.assign({}, this.value, value); resolve(); }; });
        }
        this.value = Object.assign({}, this.value, value);
        return Promise.resolve();
    };
    race.ref = racingRef;
    const firstFlush = race.flush();
    await Promise.resolve();
    race.set('x', { value: 3 });
    releaseFirst();
    await firstFlush;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(racingRef.updates.length, 2, 'an edit made during a request must flush immediately afterwards');
    assert.equal(race.pending().length, 0);

    // Two tabs share localStorage. Each mutation must merge the latest persisted
    // envelope, while per-record queue keys prevent one tab from losing the
    // other tab's pending edit.
    const sharedStorage = new MemoryStorage();
    const tabA = Sync.createCollection({
        namespace: 'tabs', owner: 'uid', storageKey: 'tabs_uid',
        storage: sharedStorage, deviceId: 'tab-a', now: () => 1400
    });
    const tabB = Sync.createCollection({
        namespace: 'tabs', owner: 'uid', storageKey: 'tabs_uid',
        storage: sharedStorage, deviceId: 'tab-b', now: () => 1401
    });
    tabA.set('a', { value: 'from A' }, { flush: false });
    tabB.set('b', { value: 'from B' }, { flush: false });
    const afterTabs = Sync.createCollection({
        namespace: 'tabs', owner: 'uid', storageKey: 'tabs_uid',
        storage: sharedStorage, deviceId: 'reload', now: () => 1402
    });
    assert.equal(afterTabs.get('a').value, 'from A');
    assert.equal(afterTabs.get('b').value, 'from B');
    assert.equal(afterTabs.pending().length, 2, 'pending edits from both tabs must survive');

    // A Firebase transaction must re-evaluate against a concurrent cloud edit.
    // The later remote record wins instead of being overwritten by the stale
    // offline candidate that initiated the transaction.
    const transactionStorage = new MemoryStorage();
    const transactional = Sync.createCollection({
        namespace: 'transaction', owner: 'uid', storageKey: 'transaction_uid',
        storage: transactionStorage, deviceId: 'local', now: () => 1500
    });
    transactional.set('card', { value: 'offline' }, { updatedAt: 1500, flush: false });
    const transactionRef = new TransactionRef({
        card: Sync.normalizeRecord({ value: 'old cloud' }, {
            revision: 1, updatedAt: 1400, deviceId: 'cloud', pending: false
        })
    });
    transactionRef.beforeRetry = async (ref) => {
        ref.value.card = Sync.normalizeRecord({ value: 'new cloud' }, {
            revision: 3, updatedAt: 1600, deviceId: 'other-device', pending: false
        });
    };
    await transactional.connect(transactionRef);
    assert.equal(transactionRef.value.card.value, 'new cloud');
    assert.equal(transactional.get('card').value, 'new cloud');
    assert.equal(transactional.pending().length, 0);
    assert.equal(transactionRef.updates.length, 0, 'transaction-capable refs must not use an unconditional update');

    const codecStorage = new MemoryStorage();
    const codecRef = new FakeRef({
        page: JSON.stringify({ key: 'kc_fsrs_/physics.html', store: { card: { last: 10 } } })
    });
    const codec = Sync.createCollection({
        namespace: 'knowledgeCheck', owner: 'uid', storageKey: 'kc_codec', storage: codecStorage,
        deviceId: 'codec-device', now: () => 1300,
        decodeRemote(remote) {
            const records = {};
            Object.keys(remote || {}).forEach((id) => { records[id] = JSON.parse(remote[id]); });
            return records;
        },
        encodeRemote(record) { return JSON.stringify(Sync.remoteRecord(record)); }
    });
    await codec.connect(codecRef);
    assert.equal(codec.get('page').store.card.last, 10, 'legacy JSON-string Firebase records must be decodable');
    codec.set('page', { key: 'kc_fsrs_/physics.html', store: { card: { last: 20 } } });
    await codec.flush();
    assert.equal(typeof codecRef.updates.at(-1).page, 'string', 'custom encoders must preserve existing Firebase paths/formats');
    assert.equal(JSON.parse(codecRef.updates.at(-1).page).store.card.last, 20);

    console.log('data sync: all tests passed');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
