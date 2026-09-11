(function (root) {
    'use strict';

    const DB_NAME = 'almanion-matcenter-cache';
    const DB_VERSION = 1;
    const STORE_NAME = 'snapshots';
    const TASKS_KEY = 'tasks';
    let openPromise = null;

    function supported() {
        return !!(root && root.indexedDB);
    }

    function openDatabase() {
        if (!supported()) return Promise.resolve(null);
        if (openPromise) return openPromise;
        const attempt = new Promise(resolve => {
            let settled = false;
            const finish = value => {
                if (settled) return;
                settled = true;
                resolve(value);
            };
            let request;
            try {
                request = root.indexedDB.open(DB_NAME, DB_VERSION);
            } catch (_) {
                finish(null);
                return;
            }
            const timer = root.setTimeout(() => finish(null), 1500);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
            };
            request.onsuccess = () => {
                root.clearTimeout(timer);
                const db = request.result;
                if (settled) {
                    db.close();
                    return;
                }
                db.onversionchange = () => db.close();
                finish(db);
            };
            request.onerror = request.onblocked = () => {
                root.clearTimeout(timer);
                finish(null);
            };
        });
        openPromise = attempt;
        attempt.then(db => {
            if (!db && openPromise === attempt) openPromise = null;
        });
        return attempt;
    }

    async function read(expectedVersion) {
        const db = await openDatabase();
        if (!db) return null;
        return new Promise(resolve => {
            let request;
            try {
                request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(TASKS_KEY);
            } catch (_) {
                resolve(null);
                return;
            }
            request.onsuccess = () => {
                const value = request.result;
                resolve(value && value.version === expectedVersion && Array.isArray(value.tasks) ? value : null);
            };
            request.onerror = () => resolve(null);
        });
    }

    async function write(value) {
        if (!value || !Array.isArray(value.tasks)) return false;
        const db = await openDatabase();
        if (!db) return false;
        return new Promise(resolve => {
            let request;
            try {
                request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value, TASKS_KEY);
            } catch (_) {
                resolve(false);
                return;
            }
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
        });
    }

    async function clear() {
        const db = await openDatabase();
        if (!db) return false;
        return new Promise(resolve => {
            let request;
            try {
                request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(TASKS_KEY);
            } catch (_) {
                resolve(false);
                return;
            }
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
        });
    }

    root.MatcenterTaskCache = Object.freeze({ read, write, clear, supported });
})(typeof window !== 'undefined' ? window : globalThis);
