// ============================================
// ALMANION DATA SYNC
// Единый offline-first слой пользовательских данных.
// ============================================

(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AlmanionDataSync = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    const SCHEMA_VERSION = 1;
    const QUEUE_KEY = 'almanion_data_sync_queue_v1';
    const QUEUE_ITEM_PREFIX = 'almanion_data_sync_pending_v1:';
    const REGISTRY_KEY = 'almanion_data_sync_registry_v1';
    const DEVICE_KEY = 'almanion_sync_device_v1';
    const BACKUP_FORMAT = 'almanion-user-data';

    const memoryStorage = new Map();
    const fallbackStorage = {
        getItem(key) { return memoryStorage.has(key) ? memoryStorage.get(key) : null; },
        setItem(key, value) { memoryStorage.set(key, String(value)); },
        removeItem(key) { memoryStorage.delete(key); },
        key(index) { return Array.from(memoryStorage.keys())[index] || null; },
        get length() { return memoryStorage.size; }
    };

    function defaultStorage() {
        try {
            if (root.localStorage) {
                const probe = '__almanion_sync_probe__';
                root.localStorage.setItem(probe, '1');
                root.localStorage.removeItem(probe);
                return root.localStorage;
            }
        } catch (_) {}
        return fallbackStorage;
    }

    function readItem(storage, key) {
        try {
            const value = storage.getItem(key);
            return value == null ? fallbackStorage.getItem(key) : value;
        } catch (_) { return fallbackStorage.getItem(key); }
    }

    function writeItem(storage, key, value) {
        try { storage.setItem(key, value); return true; }
        catch (_) { fallbackStorage.setItem(key, value); return false; }
    }

    function parseJson(raw, fallback) {
        if (!raw) return fallback;
        try { return JSON.parse(raw); } catch (_) { return fallback; }
    }

    function clone(value) {
        if (value == null) return value;
        return JSON.parse(JSON.stringify(value));
    }

    function objectValue(value) {
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }

    function safeSegment(value) {
        return String(value == null ? '' : value).replace(/[.#$/\[\]|]/g, '_');
    }

    function randomId() {
        if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
        return 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
    }

    function getDeviceId(storage) {
        storage = storage || defaultStorage();
        let id = '';
        id = readItem(storage, DEVICE_KEY) || '';
        if (!id) {
            id = randomId();
            writeItem(storage, DEVICE_KEY, id);
        }
        return id;
    }

    function metadata(record) {
        const value = objectValue(record);
        const sync = objectValue(value.__sync);
        return {
            schema: Number(sync.schema) || SCHEMA_VERSION,
            revision: Number(sync.revision) || 0,
            updatedAt: Number(sync.updatedAt || value.updatedAt || value.timestamp || value.last) || 0,
            deviceId: String(sync.deviceId || ''),
            deleted: sync.deleted === true || value.deleted === true,
            pending: sync.pending === true || value._pending === true
        };
    }

    function compareRecords(left, right) {
        if (left == null && right == null) return 0;
        if (left == null) return -1;
        if (right == null) return 1;
        const a = metadata(left);
        const b = metadata(right);
        if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? 1 : -1;
        if (a.revision !== b.revision) return a.revision > b.revision ? 1 : -1;
        if (a.deviceId !== b.deviceId) return a.deviceId > b.deviceId ? 1 : -1;
        // При полном совпадении метаданных результат всё равно должен быть
        // детерминированным на всех устройствах.
        const aj = JSON.stringify(left);
        const bj = JSON.stringify(right);
        return aj === bj ? 0 : (aj > bj ? 1 : -1);
    }

    function normalizeRecord(value, defaults) {
        defaults = defaults || {};
        const record = Object.assign({}, objectValue(value));
        const previous = metadata(record);
        delete record._pending;
        const updatedAt = Number(defaults.updatedAt) || previous.updatedAt || 0;
        const revision = Number(defaults.revision) || previous.revision || 0;
        const deleted = defaults.deleted === true || (defaults.deleted !== false && previous.deleted);
        record.__sync = {
            schema: SCHEMA_VERSION,
            revision,
            updatedAt,
            deviceId: String(defaults.deviceId || previous.deviceId || ''),
            deleted,
            pending: defaults.pending === true || (defaults.pending !== false && previous.pending)
        };
        if (deleted) record.deleted = true;
        else if (record.deleted === true) record.deleted = false;
        if (!Number(record.updatedAt) && updatedAt) record.updatedAt = updatedAt;
        return record;
    }

    function remoteRecord(value) {
        const record = normalizeRecord(value);
        record.__sync.pending = false;
        delete record._pending;
        return record;
    }

    function mergeRecordMaps(localValue, remoteValue, options) {
        options = options || {};
        const local = objectValue(localValue);
        const remote = objectValue(remoteValue);
        const merged = {};
        const keys = new Set(Object.keys(local).concat(Object.keys(remote)));
        keys.forEach(function (key) {
            const left = local[key];
            const right = remote[key];
            if (left == null) merged[key] = normalizeRecord(right, { pending: metadata(right).pending });
            else if (right == null) {
                // Отсутствие записи в snapshot не является удалением. Удаления
                // передаются только tombstone-записью.
                merged[key] = normalizeRecord(left, {
                    pending: options.markLocalOnlyPending === true || metadata(left).pending
                });
            } else {
                const useLocal = compareRecords(left, right) >= 0;
                const winner = useLocal ? left : right;
                merged[key] = normalizeRecord(winner, {
                    pending: useLocal
                        ? (options.markLocalOnlyPending === true || metadata(left).pending)
                        : metadata(right).pending
                });
            }
        });
        return merged;
    }

    function envelope(namespace, owner, records, revision, deviceId) {
        return {
            schema: SCHEMA_VERSION,
            namespace: String(namespace || ''),
            owner: String(owner || 'guest'),
            revision: Number(revision) || 0,
            updatedAt: Date.now(),
            deviceId: String(deviceId || ''),
            records: objectValue(records)
        };
    }

    function normalizeEnvelope(value, namespace, owner, deviceId) {
        const parsed = objectValue(value);
        if (parsed.schema && parsed.records && typeof parsed.records === 'object') {
            const normalized = envelope(
                parsed.namespace || namespace,
                parsed.owner || owner,
                parsed.records,
                parsed.revision,
                parsed.deviceId || deviceId
            );
            normalized.updatedAt = Number(parsed.updatedAt) || 0;
            return normalized;
        }
        // Обратная совместимость: прежние localStorage-ключи содержали карту
        // записей напрямую, без оболочки.
        return envelope(namespace, owner, parsed, 0, deviceId);
    }

    function queueId(namespace, owner, id) {
        return [safeSegment(namespace), safeSegment(owner), safeSegment(id)].join('|');
    }

    function queueStorageKey(namespace, owner, id) {
        return QUEUE_ITEM_PREFIX + queueId(namespace, owner, id);
    }

    function storageKeys(storage) {
        const keys = [];
        try {
            if (typeof storage.length === 'number' && typeof storage.key === 'function') {
                for (let i = 0; i < storage.length; i += 1) {
                    const key = storage.key(i);
                    if (key != null) keys.push(String(key));
                }
                return keys;
            }
            // Test/fallback stores expose their backing Map but not the Web Storage API.
            if (storage.values && typeof storage.values.keys === 'function') {
                return Array.from(storage.values.keys()).map(String);
            }
        } catch (_) {}
        return keys;
    }

    function readQueue(storage) {
        const queue = {};
        // Migrate the aggregate v1 queue. New entries live in independent keys so
        // two tabs editing different records can no longer overwrite each other.
        const legacy = objectValue(parseJson(readItem(storage, QUEUE_KEY), {}));
        Object.keys(legacy).forEach(function (key) {
            const item = legacy[key];
            if (!item || item.id == null) return;
            const storageKey = queueStorageKey(item.namespace, item.owner, item.id);
            const existing = parseJson(readItem(storage, storageKey), null);
            if (!existing || compareRecords(item.record, existing.record) > 0) {
                writeItem(storage, storageKey, JSON.stringify(item));
            }
        });
        if (Object.keys(legacy).length) {
            try { storage.removeItem(QUEUE_KEY); } catch (_) { fallbackStorage.removeItem(QUEUE_KEY); }
        }
        storageKeys(storage).forEach(function (key) {
            if (key.indexOf(QUEUE_ITEM_PREFIX) !== 0) return;
            const item = parseJson(readItem(storage, key), null);
            if (!item || item.id == null) return;
            queue[queueId(item.namespace, item.owner, item.id)] = item;
        });
        return queue;
    }

    function writeQueue(storage, queue) {
        Object.keys(objectValue(queue)).forEach(function (key) {
            const item = queue[key];
            if (!item || item.id == null) return;
            const storageKey = queueStorageKey(item.namespace, item.owner, item.id);
            writeItem(storage, storageKey, JSON.stringify(item));
        });
        // Never remove an unlisted per-record key here: another tab may have
        // created it after this caller read its queue snapshot.
        try { storage.removeItem(QUEUE_KEY); } catch (_) { fallbackStorage.removeItem(QUEUE_KEY); }
    }

    function writeQueueItem(storage, item) {
        writeItem(storage, queueStorageKey(item.namespace, item.owner, item.id), JSON.stringify(item));
    }

    function removeQueueItem(storage, namespace, owner, id) {
        const key = queueStorageKey(namespace, owner, id);
        try { storage.removeItem(key); } catch (_) { fallbackStorage.removeItem(key); }
    }

    function registerStorageKey(storage, key) {
        const registry = objectValue(parseJson(readItem(storage, REGISTRY_KEY), {}));
        if (registry[key]) return;
        registry[key] = true;
        writeItem(storage, REGISTRY_KEY, JSON.stringify(registry));
    }

    class Collection {
        constructor(options) {
            options = options || {};
            if (!options.namespace) throw new Error('AlmanionDataSync: namespace is required');
            this.namespace = String(options.namespace);
            this.owner = String(options.owner || 'guest');
            this.storage = options.storage || defaultStorage();
            this.storageKey = String(options.storageKey || ('almanion_sync_' + safeSegment(this.namespace) + '_' + safeSegment(this.owner)));
            this.deviceId = String(options.deviceId || getDeviceId(this.storage));
            this.now = typeof options.now === 'function' ? options.now : Date.now;
            this.onChange = typeof options.onChange === 'function' ? options.onChange : function () {};
            this.decodeRemote = typeof options.decodeRemote === 'function' ? options.decodeRemote : function (value) { return value; };
            this.encodeRemote = typeof options.encodeRemote === 'function' ? options.encodeRemote : remoteRecord;
            this.mergeRecord = typeof options.mergeRecord === 'function' ? options.mergeRecord : null;
            this.ref = null;
            this.remoteHandler = null;
            this.remoteErrorHandler = null;
            this.flushPromise = null;
            this.destroyed = false;
            this.remoteObserved = false;
            const raw = parseJson(readItem(this.storage, this.storageKey), {});
            this.state = normalizeEnvelope(raw, this.namespace, this.owner, this.deviceId);
            this.state.records = mergeRecordMaps({}, this.state.records);
            this.state.revision = Math.max(
                Number(this.state.revision) || 0,
                ...Object.values(this.state.records).map(function (entry) { return metadata(entry).revision; })
            );
            this.restorePendingQueue();
            registerStorageKey(this.storage, this.storageKey);
            this.persist(false);
        }

        restorePendingQueue() {
            const queue = readQueue(this.storage);
            Object.values(queue).forEach((item) => {
                if (!item || item.namespace !== this.namespace || item.owner !== this.owner) return;
                const queued = normalizeRecord(item.record, { pending: true });
                const current = this.state.records[item.id];
                if (current && compareRecords(current, queued) > 0) {
                    if (!metadata(current).pending) removeQueueItem(this.storage, this.namespace, this.owner, item.id);
                    return;
                }
                this.state.records[item.id] = queued;
                this.state.revision = Math.max(this.state.revision, metadata(queued).revision);
            });
        }

        refreshFromStorage() {
            const persisted = normalizeEnvelope(
                parseJson(readItem(this.storage, this.storageKey), {}),
                this.namespace,
                this.owner,
                this.deviceId
            );
            this.state.records = mergeRecordMaps(this.state.records, persisted.records);
            this.state.revision = Math.max(Number(this.state.revision) || 0, Number(persisted.revision) || 0);
            this.restorePendingQueue();
        }

        snapshot(options) {
            options = options || {};
            const records = {};
            Object.keys(this.state.records).forEach((id) => {
                const record = this.state.records[id];
                if (!options.includeDeleted && metadata(record).deleted) return;
                records[id] = clone(record);
            });
            return records;
        }

        get(id, options) {
            const value = this.state.records[id];
            if (!value) return null;
            if (!(options && options.includeDeleted) && metadata(value).deleted) return null;
            return clone(value);
        }

        nextRevision() {
            this.state.revision = Math.max(0, Number(this.state.revision) || 0) + 1;
            return this.state.revision;
        }

        set(id, value, options) {
            options = options || {};
            this.refreshFromStorage();
            const at = Number(options.updatedAt) || Number(this.now()) || Date.now();
            const record = normalizeRecord(value, {
                revision: this.nextRevision(),
                updatedAt: at,
                deviceId: this.deviceId,
                deleted: options.deleted === true,
                pending: options.pending !== false
            });
            this.state.records[id] = record;
            if (options.pending !== false) this.enqueue(id, record);
            this.persist(true, { type: options.deleted ? 'delete' : 'set', id: String(id) });
            if (this.ref && options.flush !== false) this.flush();
            return clone(record);
        }

        remove(id, value, options) {
            return this.set(id, Object.assign({}, objectValue(value), { deleted: true }), Object.assign({}, options, { deleted: true }));
        }

        merge(records, options) {
            options = options || {};
            this.refreshFromStorage();
            const before = JSON.stringify(this.state.records);
            if (this.mergeRecord) {
                const local = objectValue(this.state.records);
                const remote = objectValue(records);
                const combined = {};
                new Set(Object.keys(local).concat(Object.keys(remote))).forEach((id) => {
                    if (local[id] != null && remote[id] != null) {
                        combined[id] = normalizeRecord(this.mergeRecord(clone(local[id]), clone(remote[id]), id));
                    } else if (local[id] != null) {
                        combined[id] = normalizeRecord(local[id], {
                            pending: options.markLocalOnlyPending === true || metadata(local[id]).pending
                        });
                    } else {
                        combined[id] = normalizeRecord(remote[id], { pending: metadata(remote[id]).pending });
                    }
                });
                this.state.records = combined;
            } else {
                this.state.records = mergeRecordMaps(this.state.records, records, {
                    markLocalOnlyPending: options.markLocalOnlyPending === true
                });
            }
            Object.values(this.state.records).forEach((entry) => {
                this.state.revision = Math.max(this.state.revision, metadata(entry).revision);
            });
            this.reconcileQueue();
            if (before !== JSON.stringify(this.state.records)) this.persist(true, { type: 'merge' });
            else if (options.notifyUnchanged === true) this.onChange(this.snapshot(), { type: 'merge' });
            return this.snapshot({ includeDeleted: true });
        }

        reconcileQueue() {
            const queue = readQueue(this.storage);
            let changed = false;
            Object.keys(queue).forEach((key) => {
                const item = queue[key];
                if (!item || item.namespace !== this.namespace || item.owner !== this.owner) return;
                const current = this.state.records[item.id];
                if (!current || !metadata(current).pending) {
                    delete queue[key];
                    removeQueueItem(this.storage, this.namespace, this.owner, item.id);
                    changed = true;
                    return;
                }
                if (Number(item.revision) !== metadata(current).revision
                    || JSON.stringify(item.record) !== JSON.stringify(current)) {
                    queue[key] = {
                        namespace: this.namespace,
                        owner: this.owner,
                        id: String(item.id),
                        revision: metadata(current).revision,
                        record: clone(current)
                    };
                    changed = true;
                }
            });
            Object.keys(this.state.records).forEach((id) => {
                const record = this.state.records[id];
                if (!metadata(record).pending) return;
                const key = queueId(this.namespace, this.owner, id);
                if (queue[key]) return;
                queue[key] = {
                    namespace: this.namespace,
                    owner: this.owner,
                    id: String(id),
                    revision: metadata(record).revision,
                    record: clone(record)
                };
                changed = true;
            });
            if (changed) writeQueue(this.storage, queue);
        }

        enqueue(id, record) {
            writeQueueItem(this.storage, {
                namespace: this.namespace,
                owner: this.owner,
                id: String(id),
                revision: metadata(record).revision,
                record: clone(record)
            });
        }

        pending() {
            const queue = readQueue(this.storage);
            return Object.values(queue).filter((item) => item && item.namespace === this.namespace && item.owner === this.owner);
        }

        acknowledge(items) {
            this.refreshFromStorage();
            const queue = readQueue(this.storage);
            let changed = false;
            (items || []).forEach((item) => {
                const key = queueId(this.namespace, this.owner, item.id);
                const queued = queue[key];
                if (!queued || Number(queued.revision) !== Number(item.revision)) return;
                delete queue[key];
                removeQueueItem(this.storage, this.namespace, this.owner, item.id);
                const current = this.state.records[item.id];
                if (current && metadata(current).revision === Number(item.revision)) {
                    current.__sync.pending = false;
                }
                changed = true;
            });
            if (changed) {
                writeQueue(this.storage, queue);
                this.persist(true, { type: 'ack' });
            }
        }

        persist(notify, detail) {
            const persisted = normalizeEnvelope(
                parseJson(readItem(this.storage, this.storageKey), {}),
                this.namespace,
                this.owner,
                this.deviceId
            );
            this.state.records = mergeRecordMaps(this.state.records, persisted.records);
            this.state.revision = Math.max(Number(this.state.revision) || 0, Number(persisted.revision) || 0);
            this.state.schema = SCHEMA_VERSION;
            this.state.namespace = this.namespace;
            this.state.owner = this.owner;
            this.state.deviceId = this.deviceId;
            this.state.updatedAt = Number(this.now()) || Date.now();
            writeItem(this.storage, this.storageKey, JSON.stringify(this.state));
            if (notify) this.onChange(this.snapshot(), detail || { type: 'change' });
        }

        async connect(ref) {
            this.disconnect();
            this.ref = ref || null;
            if (!this.ref) return this.snapshot();
            try {
                const snap = await this.ref.once('value');
                if (this.ref !== ref || this.destroyed) return this.snapshot();
                this.remoteObserved = true;
                // Даже пустой snapshot только объединяется с локальными данными.
                this.merge(this.decodeRemote((snap && snap.val && snap.val()) || {}), {
                    markLocalOnlyPending: true,
                    notifyUnchanged: true
                });
                await this.flush();
            } catch (error) {
                this.onChange(this.snapshot(), { type: 'error', error });
            }
            if (this.ref !== ref || this.destroyed) return this.snapshot();
            this.remoteHandler = (snap) => {
                this.remoteObserved = true;
                this.merge(this.decodeRemote((snap && snap.val && snap.val()) || {}), { notifyUnchanged: true });
                this.flush();
            };
            this.remoteErrorHandler = (error) => {
                this.onChange(this.snapshot(), { type: 'error', error });
            };
            try { this.ref.on('value', this.remoteHandler, this.remoteErrorHandler); } catch (_) {}
            return this.snapshot();
        }

        async flush() {
            if (!this.ref) return false;
            if (this.flushPromise) return this.flushPromise;
            const items = this.pending();
            if (!items.length) return true;
            const activeRef = this.ref;
            let succeeded = false;
            this.flushPromise = Promise.resolve()
                .then(async () => {
                    for (const item of items) {
                        const child = activeRef.child && activeRef.child(item.id);
                        if (!child || typeof child.transaction !== 'function') {
                            const fallback = {};
                            fallback[item.id] = this.encodeRemote(item.record, item.id);
                            await activeRef.update(fallback);
                            continue;
                        }
                        const result = await child.transaction((currentRaw) => {
                            let current = null;
                            try {
                                const decoded = objectValue(this.decodeRemote({ [item.id]: currentRaw }));
                                current = decoded[item.id] == null ? null : decoded[item.id];
                            } catch (_) {}
                            let winner = item.record;
                            if (current != null) {
                                if (this.mergeRecord) {
                                    winner = normalizeRecord(this.mergeRecord(clone(item.record), clone(current), item.id));
                                } else if (compareRecords(current, item.record) > 0) {
                                    winner = current;
                                }
                            }
                            return this.encodeRemote(winner, item.id);
                        }, undefined, false);
                        const snapshot = result && result.snapshot;
                        if (snapshot && typeof snapshot.val === 'function') {
                            try {
                                this.merge(this.decodeRemote({ [item.id]: snapshot.val() }));
                            } catch (_) {}
                        }
                    }
                })
                .then(() => {
                    succeeded = true;
                    // If the collection was reconnected while this write was in
                    // flight, keep the queue so the new destination also receives it.
                    if (this.ref === activeRef) this.acknowledge(items);
                    return true;
                })
                .catch((error) => {
                    this.onChange(this.snapshot(), { type: 'error', error });
                    return false;
                })
                .finally(() => {
                    this.flushPromise = null;
                    // Изменение могло попасть в очередь, пока предыдущая пачка
                    // была в сети. Не ждём нового события online.
                    if (succeeded && this.ref && this.pending().length) Promise.resolve().then(() => this.flush());
                });
            return this.flushPromise;
        }

        disconnect() {
            if (this.ref && this.remoteHandler) {
                try { this.ref.off('value', this.remoteHandler); } catch (_) {}
            }
            this.ref = null;
            this.remoteHandler = null;
            this.remoteErrorHandler = null;
        }

        destroy() {
            this.destroyed = true;
            this.disconnect();
        }
    }

    function migrateGuest(options) {
        options = options || {};
        const storage = options.storage || defaultStorage();
        const guest = new Collection(Object.assign({}, options, {
            storage,
            owner: options.guestOwner || 'guest',
            storageKey: options.guestStorageKey
        }));
        const account = new Collection(Object.assign({}, options, {
            storage,
            owner: options.owner,
            storageKey: options.accountStorageKey
        }));
        account.merge(guest.snapshot({ includeDeleted: true }));
        // После смены владельца серверной копии ещё нет: очередь должна
        // содержать весь объединённый набор, включая tombstone-записи.
        Object.keys(account.state.records).forEach(function (id) {
            account.state.records[id].__sync.pending = true;
            account.enqueue(id, account.state.records[id]);
        });
        account.persist(true, { type: 'migration', from: guest.owner });
        return account;
    }

    function exportData(options) {
        options = options || {};
        const storage = options.storage || defaultStorage();
        const registry = objectValue(parseJson(readItem(storage, REGISTRY_KEY), {}));
        const collections = {};
        Object.keys(registry).sort().forEach(function (key) {
            const value = parseJson(readItem(storage, key), null);
            if (value) collections[key] = value;
        });
        return {
            format: BACKUP_FORMAT,
            version: SCHEMA_VERSION,
            exportedAt: Date.now(),
            collections
        };
    }

    function importData(backup, options) {
        options = options || {};
        const storage = options.storage || defaultStorage();
        if (!backup || backup.format !== BACKUP_FORMAT || !backup.collections) {
            throw new Error('AlmanionDataSync: unsupported backup');
        }
        const changed = [];
        const queue = readQueue(storage);
        Object.keys(backup.collections).forEach(function (key) {
            const incoming = normalizeEnvelope(backup.collections[key]);
            const current = normalizeEnvelope(parseJson(readItem(storage, key), {}), incoming.namespace, incoming.owner, getDeviceId(storage));
            current.records = mergeRecordMaps(current.records, incoming.records);
            current.revision = Math.max(Number(current.revision) || 0, Number(incoming.revision) || 0);
            current.updatedAt = Date.now();
            Object.keys(current.records).forEach(function (id) {
                current.records[id].__sync.pending = true;
                queue[queueId(current.namespace, current.owner, id)] = {
                    namespace: current.namespace,
                    owner: current.owner,
                    id: String(id),
                    revision: metadata(current.records[id]).revision,
                    record: clone(current.records[id])
                };
            });
            writeItem(storage, key, JSON.stringify(current));
            registerStorageKey(storage, key);
            changed.push(key);
        });
        writeQueue(storage, queue);
        return changed;
    }

    function retryAll() {
        if (root && typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') {
            root.dispatchEvent(new root.CustomEvent('almanion-sync-retry'));
        }
    }

    if (root && typeof root.addEventListener === 'function') {
        root.addEventListener('online', retryAll);
    }

    return {
        version: SCHEMA_VERSION,
        Collection,
        createCollection: function (options) { return new Collection(options); },
        migrateGuest,
        mergeRecords: mergeRecordMaps,
        compareRecords,
        metadata,
        normalizeRecord,
        remoteRecord,
        exportData,
        importData,
        retryAll,
        constants: { QUEUE_KEY, REGISTRY_KEY, DEVICE_KEY, BACKUP_FORMAT }
    };
});
