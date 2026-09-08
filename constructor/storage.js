(function () {
    'use strict';

    const DB_NAME = 'almanion-note-constructor';
    const DB_VERSION = 3;
    const STORE = 'drafts';
    const ASSET_STORE = 'assets';
    const REVISION_STORE = 'revisions';
    const FALLBACK_PREFIX = 'note-constructor-draft:';
    let dbPromise = null;

    function key(uid, subject, id) {
        return [String(uid || ''), String(subject || ''), String(id || '')].join(':');
    }

    function openDatabase() {
        if (dbPromise) return dbPromise;
        if (!window.indexedDB) return Promise.reject(new Error('IndexedDB недоступна'));
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
                if (!db.objectStoreNames.contains(ASSET_STORE)) db.createObjectStore(ASSET_STORE, { keyPath: 'key' });
                if (!db.objectStoreNames.contains(REVISION_STORE)) db.createObjectStore(REVISION_STORE, { keyPath: 'key' });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Не удалось открыть IndexedDB'));
        });
        return dbPromise;
    }

    async function withStore(mode, callback, storeName) {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName || STORE, mode);
            const store = transaction.objectStore(storeName || STORE);
            let result;
            try { result = callback(store); } catch (error) { reject(error); return; }
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = () => reject(transaction.error || new Error('Ошибка IndexedDB'));
        });
    }

    function fallbackReadAll() {
        const result = [];
        try {
            for (let i = 0; i < localStorage.length; i += 1) {
                const storageKey = localStorage.key(i);
                if (!storageKey || !storageKey.startsWith(FALLBACK_PREFIX)) continue;
                const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
                if (value) result.push(value);
            }
        } catch (_) {}
        return result;
    }

    async function putDraft(uid, section) {
        const entry = {
            key: key(uid, section.subject, section.id),
            uid: String(uid),
            subject: section.subject,
            id: section.id,
            updatedAt: Number(section.updatedAt) || Date.now(),
            section: JSON.parse(JSON.stringify(section))
        };
        // Синхронная страховочная копия создаётся до первой асинхронной
        // операции. Даже закрытие вкладки сразу после ввода не теряет текст.
        let fallbackSaved = false;
        let indexedSaved = false;
        const failures = [];
        try {
            localStorage.setItem(FALLBACK_PREFIX + entry.key, JSON.stringify(entry));
            fallbackSaved = true;
        } catch (error) {
            failures.push(error);
        }
        try {
            await withStore('readwrite', store => store.put(entry));
            indexedSaved = true;
        } catch (error) {
            failures.push(error);
        }
        if (!fallbackSaved && !indexedSaved) {
            const error = new Error('Не удалось сохранить черновик на устройстве');
            error.failures = failures;
            throw error;
        }
        return entry;
    }

    async function listDrafts(uid, subject) {
        try {
            const db = await openDatabase();
            const entries = await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, 'readonly');
                const request = tx.objectStore(STORE).getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
            const merged = new Map();
            entries.concat(fallbackReadAll()).forEach(entry => {
                if (entry.uid !== String(uid) || entry.subject !== subject) return;
                const previous = merged.get(entry.key);
                if (!previous || Number(entry.updatedAt) >= Number(previous.updatedAt)) merged.set(entry.key, entry);
            });
            return Array.from(merged.values());
        } catch (_) {
            return fallbackReadAll().filter(entry => entry.uid === String(uid) && entry.subject === subject);
        }
    }

    async function removeDraft(uid, subject, id) {
        const draftKey = key(uid, subject, id);
        try { await withStore('readwrite', store => store.delete(draftKey)); } catch (_) {}
        try { localStorage.removeItem(FALLBACK_PREFIX + draftKey); } catch (_) {}
    }

    async function putAsset(uid, subject, sectionId, blockId, asset) {
        const entry = {
            key: key(uid, subject, sectionId) + ':' + String(blockId),
            uid: String(uid),
            subject: String(subject),
            sectionId: String(sectionId),
            blockId: String(blockId),
            path: String(asset.path || ''),
            mimeType: String(asset.mimeType || 'application/octet-stream'),
            dataUrl: String(asset.dataUrl || ''),
            cloudPath: String(asset.cloudPath || ''),
            downloadUrl: String(asset.downloadUrl || ''),
            cloudState: String(asset.cloudState || ''),
            updatedAt: Date.now()
        };
        try {
            await withStore('readwrite', store => store.put(entry), ASSET_STORE);
        } catch (cause) {
            const error = new Error('Не удалось сохранить изображение на устройстве');
            error.cause = cause;
            throw error;
        }
        return entry;
    }

    async function listAssets(uid, subject, sectionId) {
        const db = await openDatabase();
        const entries = await new Promise((resolve, reject) => {
            const tx = db.transaction(ASSET_STORE, 'readonly');
            const request = tx.objectStore(ASSET_STORE).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
        return entries.filter(entry => entry.uid === String(uid) && entry.subject === String(subject) && entry.sectionId === String(sectionId));
    }

    async function removeAsset(uid, subject, sectionId, blockId) {
        await withStore('readwrite', store => store.delete(key(uid, subject, sectionId) + ':' + String(blockId)), ASSET_STORE);
    }

    async function removeSectionAssets(uid, subject, sectionId) {
        const db = await openDatabase();
        await new Promise((resolve, reject) => {
            const transaction = db.transaction(ASSET_STORE, 'readwrite');
            const store = transaction.objectStore(ASSET_STORE);
            const request = store.getAll();
            request.onsuccess = () => {
                (request.result || []).forEach(entry => {
                    if (entry.uid === String(uid) && entry.subject === String(subject) && entry.sectionId === String(sectionId)) {
                        store.delete(entry.key);
                    }
                });
            };
            request.onerror = () => reject(request.error || new Error('Не удалось прочитать изображения раздела'));
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error('Не удалось удалить изображения раздела'));
        });
    }

    async function putRevision(uid, subject, sectionId, revision) {
        const entry = Object.assign({}, JSON.parse(JSON.stringify(revision || {})), {
            key: key(uid, subject, sectionId) + ':' + String(revision && revision.id || Date.now()),
            uid: String(uid),
            subject: String(subject),
            sectionId: String(sectionId)
        });
        await withStore('readwrite', store => store.put(entry), REVISION_STORE);
        const entries = await listRevisions(uid, subject, sectionId);
        if (entries.length > 50) {
            const remove = entries.slice(50);
            await withStore('readwrite', store => remove.forEach(item => store.delete(item.key)), REVISION_STORE);
        }
        return entry;
    }

    async function listRevisions(uid, subject, sectionId) {
        const db = await openDatabase();
        const entries = await new Promise((resolve, reject) => {
            const tx = db.transaction(REVISION_STORE, 'readonly');
            const request = tx.objectStore(REVISION_STORE).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
        return entries
            .filter(entry => entry.uid === String(uid) && entry.subject === String(subject) && entry.sectionId === String(sectionId))
            .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    }

    async function removeSectionRevisions(uid, subject, sectionId) {
        const entries = await listRevisions(uid, subject, sectionId).catch(() => []);
        if (!entries.length) return;
        await withStore('readwrite', store => entries.forEach(item => store.delete(item.key)), REVISION_STORE);
    }

    window.NoteStorage = {
        putDraft,
        listDrafts,
        removeDraft,
        putAsset,
        listAssets,
        removeAsset,
        removeSectionAssets,
        putRevision,
        listRevisions,
        removeSectionRevisions
    };
})();
