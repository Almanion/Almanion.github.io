(function (root, factory) {
    'use strict';
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AlmanionPlannerCore = api;
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    const OWNER_UID = '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';
    const OWNER_EMAIL = 'dmb23930@gmail.com';
    const STORAGE_KEY = 'almanion:personal-planner:v1';
    const PENDING_KEY = 'almanion:personal-planner:pending:v1';
    const SCHEMA_VERSION = 1;
    const DAY_MS = 86400000;

    function clone(value) {
        if (value == null) return value;
        return JSON.parse(JSON.stringify(value));
    }

    function pad(value) { return String(value).padStart(2, '0'); }

    function dateKey(value) {
        const date = value instanceof Date ? value : new Date(value);
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    function parseDate(value) {
        const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return new Date(NaN);
        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
        return dateKey(date) === value ? date : new Date(NaN);
    }

    function addDays(value, amount) {
        const date = value instanceof Date ? new Date(value) : parseDate(value);
        date.setDate(date.getDate() + Number(amount || 0));
        return dateKey(date);
    }

    function startOfWeek(value) {
        const date = value instanceof Date ? new Date(value) : parseDate(value);
        const offset = (date.getDay() + 6) % 7;
        date.setDate(date.getDate() - offset);
        return dateKey(date);
    }

    function daysBetween(from, to) {
        const left = parseDate(from);
        const right = parseDate(to);
        return Math.round((right.getTime() - left.getTime()) / DAY_MS);
    }

    function safeId(prefix) {
        const cryptoApi = root.crypto;
        if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return prefix + '-' + cryptoApi.randomUUID();
        return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
    }

    function objectMap(value) {
        if (!value || typeof value !== 'object') return {};
        if (Array.isArray(value)) {
            return value.reduce(function (result, item, index) {
                if (item) result[item.id || String(index)] = item;
                return result;
            }, {});
        }
        return value;
    }

    function isOwner(user) { return !!user && user.uid === OWNER_UID; }

    function defaultData(now) {
        const today = dateKey(now || new Date());
        const firstOfYear = today.slice(0, 4) + '-01-01';
        return {
            meta: {
                version: SCHEMA_VERSION,
                createdAt: Date.now(),
                updatedAt: Date.now()
            },
            settings: {
                sleepStart: '22:00',
                sleepEnd: '06:00',
                weekStartsOn: 1,
                currentProgramWeek: 1,
                telegramEnabled: false,
                calendarExportName: 'Almanion — личный план'
            },
            events: {
                'system-sleep': {
                    id: 'system-sleep',
                    title: 'Сон',
                    category: 'personal',
                    date: firstOfYear,
                    startTime: '22:00',
                    endTime: '06:00',
                    allDay: false,
                    recurrence: { frequency: 'daily', interval: 1 },
                    reminderMinutes: [],
                    notes: '',
                    system: true,
                    updatedAt: Date.now()
                },
                'system-math-circle': {
                    id: 'system-math-circle',
                    title: 'Математический кружок',
                    category: 'math',
                    date: firstOfYear,
                    startTime: '',
                    endTime: '',
                    allDay: true,
                    recurrence: { frequency: 'weekly', interval: 1, days: [3, 6] },
                    reminderMinutes: [720],
                    notes: '',
                    system: true,
                    updatedAt: Date.now()
                }
            },
            tasks: {},
            goals: {},
            series: {},
            inbox: {},
            sport: {
                workouts: {},
                measurements: {},
                program: {},
                settings: { programStartedAt: today, preferredDays: { A: 1, B: 3, C: 6, D: 2 } }
            }
        };
    }

    function normalizeData(value, now) {
        const defaults = defaultData(now);
        const raw = value && typeof value === 'object' ? value : {};
        return {
            meta: Object.assign({}, defaults.meta, raw.meta || {}),
            settings: Object.assign({}, defaults.settings, raw.settings || {}),
            events: Object.assign({}, defaults.events, objectMap(raw.events)),
            tasks: normalizeRecords('tasks', raw.tasks),
            goals: normalizeRecords('goals', raw.goals),
            series: normalizeRecords('series', raw.series),
            inbox: objectMap(raw.inbox),
            sport: {
                workouts: objectMap(raw.sport && raw.sport.workouts),
                measurements: objectMap(raw.sport && raw.sport.measurements),
                program: objectMap(raw.sport && raw.sport.program),
                settings: Object.assign({}, defaults.sport.settings, raw.sport && raw.sport.settings || {})
            }
        };
    }

    // Repair records queued by older clients: Firebase treats null as deletion.
    function normalizeRecord(collection, item) {
        if (!item || typeof item !== 'object') return item;
        const result = clone(item);
        const counters = collection === 'series' ? ['attempted', 'solved', 'independent', 'written', 'checked']
            : collection === 'goals' ? ['current'] : [];
        counters.forEach(function (key) {
            if (result[key] == null || !Number.isFinite(Number(result[key]))) result[key] = 0;
            else result[key] = Math.max(0, Number(result[key]));
        });
        if (collection === 'tasks') result.done = result.done === true;
        return result;
    }

    function normalizeRecords(collection, value) {
        const result = {};
        Object.entries(objectMap(value)).forEach(function (entry) {
            if (!['__proto__', 'constructor', 'prototype'].includes(entry[0])) result[entry[0]] = normalizeRecord(collection, entry[1]);
        });
        return result;
    }

    function occursOn(item, targetDate) {
        if (!item || !item.date || targetDate < item.date) return false;
        if (!Number.isFinite(parseDate(item.date).getTime()) || !Number.isFinite(parseDate(targetDate).getTime())) return false;
        const recurrence = item.recurrence || { frequency: 'none' };
        if (recurrence.until && targetDate > recurrence.until) return false;
        const frequency = recurrence.frequency || 'none';
        if (frequency === 'none') return item.date === targetDate;
        const delta = daysBetween(item.date, targetDate);
        const interval = Math.max(1, Number(recurrence.interval) || 1);
        if (frequency === 'daily') return delta >= 0 && delta % interval === 0;
        if (frequency === 'weekly') {
            const weekDelta = Math.floor(daysBetween(startOfWeek(item.date), startOfWeek(targetDate)) / 7);
            const days = Array.isArray(recurrence.days) && recurrence.days.length
                ? recurrence.days.map(Number)
                : [parseDate(item.date).getDay()];
            return weekDelta >= 0 && weekDelta % interval === 0 && days.includes(parseDate(targetDate).getDay());
        }
        return item.date === targetDate;
    }

    function expandItems(collection, fromDate, toDate) {
        const result = [];
        if (!Number.isFinite(parseDate(fromDate).getTime()) || !Number.isFinite(parseDate(toDate).getTime())) return result;
        let cursor = fromDate;
        while (cursor <= toDate) {
            Object.keys(objectMap(collection)).forEach(function (id) {
                const item = collection[id];
                if (!occursOn(item, cursor)) return;
                result.push(Object.assign({}, item, { occurrenceDate: cursor, occurrenceId: id + '@' + cursor }));
            });
            cursor = addDays(cursor, 1);
        }
        return result.sort(function (left, right) {
            return left.occurrenceDate.localeCompare(right.occurrenceDate)
                || String(left.startTime || '99:99').localeCompare(String(right.startTime || '99:99'))
                || String(left.title || '').localeCompare(String(right.title || ''), 'ru');
        });
    }

    function recurrenceText(item) {
        const recurrence = item && item.recurrence || {};
        if (recurrence.frequency === 'daily') return recurrence.interval > 1 ? 'Каждые ' + recurrence.interval + ' дня' : 'Каждый день';
        if (recurrence.frequency === 'weekly') {
            const names = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
            const days = (recurrence.days || []).map(function (day) { return names[Number(day)] || ''; }).filter(Boolean);
            return (recurrence.interval > 1 ? 'Каждые ' + recurrence.interval + ' недели' : 'Каждую неделю') + (days.length ? ' · ' + days.join(', ') : '');
        }
        return '';
    }

    function scopedKey(key, uid) { return key + ':' + String(uid || 'guest'); }

    function readLocal(uid) {
        try { return normalizeData(JSON.parse(root.localStorage.getItem(scopedKey(STORAGE_KEY, uid)) || 'null')); }
        catch (_) { return defaultData(); }
    }

    function writeLocal(state, uid) {
        try { root.localStorage.setItem(scopedKey(STORAGE_KEY, uid), JSON.stringify(state)); return true; }
        catch (_) { return false; }
    }

    function readPending(uid) {
        try {
            const value = JSON.parse(root.localStorage.getItem(scopedKey(PENDING_KEY, uid)) || '{}');
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        } catch (_) { return {}; }
    }

    function writePending(value, uid) {
        try { root.localStorage.setItem(scopedKey(PENDING_KEY, uid), JSON.stringify(value || {})); return true; }
        catch (_) { return false; }
    }

    function applyPath(target, path, value) {
        const parts = String(path || '').split('/').filter(Boolean);
        if (parts.some(function (part) { return ['__proto__', 'constructor', 'prototype'].includes(part); })) throw new Error('invalid-path');
        if (!parts.length) return target;
        let cursor = target;
        parts.slice(0, -1).forEach(function (part) {
            if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
            cursor = cursor[part];
        });
        if (value == null) delete cursor[parts[parts.length - 1]];
        else cursor[parts[parts.length - 1]] = clone(value);
        return target;
    }

    function Store() {
        this.state = defaultData();
        this.listeners = new Set();
        this.ref = null;
        this.user = null;
        this.connected = false;
        this.ready = false;
        this.remoteHandler = null;
        this.pending = {};
        this.flushPromise = null;
        this.generation = 0;
        this.networkConnected = null;
        this.remoteLoaded = false;
        this.connectionRef = null;
        this.connectionHandler = null;
        this.lastError = null;
        this.localPersisted = true;
        this.seeding = false;
    }

    function queueChange(pending, path, value) {
        // Firebase rejects updates containing both an ancestor and a child path.
        const ancestor = Object.keys(pending).find(function (key) { return path.startsWith(key + '/'); });
        if (ancestor) {
            if (!pending[ancestor]) pending[ancestor] = {};
            applyPath(pending[ancestor], path.slice(ancestor.length + 1), value);
        } else {
            Object.keys(pending).forEach(function (key) { if (key.startsWith(path + '/')) delete pending[key]; });
            pending[path] = value == null ? null : clone(value);
        }
    }

    Store.prototype.emit = function (detail) {
        const snapshot = clone(this.state);
        this.listeners.forEach(function (listener) {
            try { listener(snapshot, detail || {}); } catch (error) { setTimeout(function () { throw error; }, 0); }
        });
    };

    Store.prototype.subscribe = function (listener) {
        this.listeners.add(listener);
        listener(clone(this.state), { initial: true, ready: this.ready });
        return function () { this.listeners.delete(listener); }.bind(this);
    };

    Store.prototype.connect = function (user, database) {
        const self = this;
        if (!isOwner(user)) return Promise.reject(new Error('owner-only'));
        this.disconnect();
        this.user = user;
        let hasCachedData = false;
        try { hasCachedData = !!JSON.parse(root.localStorage.getItem(scopedKey(STORAGE_KEY, user.uid)) || 'null'); } catch (_) {}
        this.state = readLocal(user.uid);
        const queued = readPending(user.uid);
        Object.keys(queued).forEach(function (path) {
            const parts = path.split('/');
            let value = queued[path];
            if (['tasks', 'series', 'goals'].includes(parts[0]) && value != null) {
                value = parts.length === 1 ? normalizeRecords(parts[0], value) : normalizeRecord(parts[0], value);
            }
            applyPath(self.state, path, value);
            queueChange(self.pending, path, value);
        });
        this.persist();
        this.ref = database.ref('plannerUsers/' + user.uid);
        this.connected = true;
        const generation = this.generation;
        const ref = this.ref;
        const isActive = function () { return generation === self.generation; };
        return new Promise(function (resolve, reject) {
            let settled = false;
            let seeding = false;
            function finish() {
                if (settled) return;
                settled = true;
                resolve(self);
            }
            self.remoteHandler = function (snapshot) {
                if (!isActive() || seeding) return;
                const remote = snapshot.val();
                if (remote) {
                    const firstSnapshot = !self.remoteLoaded;
                    self.remoteLoaded = true;
                    self.state = normalizeData(remote);
                    Object.keys(self.pending).forEach(function (path) { applyPath(self.state, path, self.pending[path]); });
                    self.persist();
                    self.ready = true;
                    self.emit({ source: 'remote', ready: true });
                    if (firstSnapshot) self.flush();
                    finish();
                    return;
                }
                if (self.remoteLoaded) return;
                self.remoteLoaded = true;
                seeding = true;
                self.seeding = true;
                self.state = normalizeData(self.state);
                self.state.meta.updatedAt = Date.now();
                const activePending = clone(self.pending);
                const seedState = clone(self.state);
                Promise.resolve().then(function () { return isActive() && ref.set(seedState); }).then(function () {
                    if (!isActive()) return;
                    seeding = false;
                    self.seeding = false;
                    Object.keys(activePending).forEach(function (path) {
                        if (JSON.stringify(self.pending[path]) === JSON.stringify(activePending[path])) delete self.pending[path];
                    });
                    self.persist();
                    self.ready = true;
                    self.emit({ source: 'seed', ready: true });
                    finish();
                    if (Object.keys(self.pending).length) self.flush();
                }).catch(function (error) {
                    if (!isActive()) return;
                    seeding = false;
                    self.seeding = false;
                    self.lastError = error;
                    self.emit({ source: 'error', error: error, ready: false });
                    if (!settled) {
                        settled = true;
                        reject(error);
                    }
                });
            };
            self.ref.on('value', self.remoteHandler, function (error) {
                if (!isActive()) return;
                self.lastError = error;
                self.emit({ source: 'error', error: error, ready: false });
                if (!settled) {
                    settled = true;
                    reject(error);
                }
            });
            self.connectionRef = database.ref('.info/connected');
            self.connectionHandler = function (snapshot) {
                if (!isActive()) return;
                self.networkConnected = snapshot.val() === true;
                if (!self.networkConnected && hasCachedData && !self.ready) {
                    self.ready = true;
                    self.emit({ source: 'cache', ready: true });
                    finish();
                }
                if (self.networkConnected && self.lastError && /network|disconnect|unavailable/i.test(String(self.lastError.code || self.lastError.message))) self.lastError = null;
                self.emit({ source: 'sync' });
                if (self.networkConnected && !self.lastError) self.flush();
            };
            self.connectionRef.on('value', self.connectionHandler);
        });
    };

    Store.prototype.disconnect = function () {
        this.generation += 1;
        if (this.ref && this.remoteHandler) {
            try { this.ref.off('value', this.remoteHandler); } catch (_) {}
        }
        if (this.connectionRef && this.connectionHandler) this.connectionRef.off('value', this.connectionHandler);
        this.connectionRef = null;
        this.connectionHandler = null;
        this.networkConnected = null;
        this.remoteLoaded = false;
        this.seeding = false;
        this.lastError = null;
        this.ref = null;
        this.user = null;
        this.connected = false;
        this.ready = false;
        this.remoteHandler = null;
        this.flushPromise = null;
        this.pending = {};
        this.state = defaultData();
    };

    Store.prototype.commit = function (path, value) {
        const updates = {};
        updates[path] = value;
        return this.patch(updates);
    };

    Store.prototype.persist = function () {
        const uid = this.user && this.user.uid;
        const stateSaved = writeLocal(this.state, uid);
        const pendingSaved = writePending(this.pending, uid);
        this.localPersisted = stateSaved && pendingSaved;
    };

    Store.prototype.patch = function (updates) {
        if (!isOwner(this.user)) return Promise.reject(new Error('owner-only'));
        this.state.meta.updatedAt = Date.now();
        Object.keys(updates).forEach(function (path) {
            const value = updates[path];
            applyPath(this.state, path, value);
            queueChange(this.pending, path, value);
        }, this);
        this.persist();
        this.emit({ source: 'local' });
        return this.flush();
    };

    Store.prototype.setPath = function (path, value) {
        return this.commit(path, value);
    };

    Store.prototype.flush = function () {
        if (this.flushPromise) return this.flushPromise;
        if (!this.ref || !this.ready || !this.remoteLoaded || this.seeding || this.networkConnected === false || this.lastError) return Promise.resolve(false);
        if (!Object.keys(this.pending).length) return Promise.resolve(true);
        const self = this;
        const generation = this.generation;
        const ref = this.ref;
        // Acquire the lock BEFORE update(): Firebase emits optimistic value events synchronously.
        this.flushPromise = Promise.resolve().then(async function () {
            while (generation === self.generation && Object.keys(self.pending).length) {
                if (self.networkConnected === false) return false;
                const active = clone(self.pending);
                const updates = clone(active);
                const timestamp = root.firebase && root.firebase.database ? root.firebase.database.ServerValue.TIMESTAMP : Date.now();
                if (updates.meta) updates.meta.updatedAt = timestamp;
                else updates['meta/updatedAt'] = timestamp;
                try {
                    await ref.update(updates);
                } catch (error) {
                    if (generation === self.generation) {
                        self.lastError = error;
                        self.emit({ source: 'error', error: error, ready: self.ready });
                    }
                    return false;
                }
                if (generation !== self.generation) return false;
                Object.keys(active).forEach(function (path) {
                    if (JSON.stringify(self.pending[path]) === JSON.stringify(active[path])) delete self.pending[path];
                });
                self.persist();
            }
            return generation === self.generation;
        }).finally(function () {
            if (generation === self.generation) {
                self.flushPromise = null;
                self.emit({ source: 'sync' });
            }
        });
        this.emit({ source: 'sync' });
        return this.flushPromise;
    };

    Store.prototype.retry = function () {
        this.lastError = null;
        this.persist();
        return this.flush();
    };

    Store.prototype.upsert = function (collection, item) {
        if (!item || !item.id) return Promise.reject(new Error('missing-id'));
        const value = Object.assign({}, normalizeRecord(collection, item), { updatedAt: Date.now() });
        this.state[collection] = objectMap(this.state[collection]);
        this.state[collection][value.id] = value;
        return this.commit(collection + '/' + value.id, value);
    };

    Store.prototype.remove = function (collection, id) {
        if (this.state[collection]) delete this.state[collection][id];
        return this.commit(collection + '/' + id, null);
    };

    Store.prototype.upsertSport = function (collection, item) {
        if (!item || !item.id) return Promise.reject(new Error('missing-id'));
        const value = Object.assign({}, item, { updatedAt: Date.now() });
        this.state.sport[collection] = objectMap(this.state.sport[collection]);
        this.state.sport[collection][value.id] = value;
        return this.commit('sport/' + collection + '/' + value.id, value);
    };

    Store.prototype.removeSport = function (collection, id) {
        if (this.state.sport[collection]) delete this.state.sport[collection][id];
        return this.commit('sport/' + collection + '/' + id, null);
    };

    Store.prototype.updateSettings = function (updates) {
        this.state.settings = Object.assign({}, this.state.settings, updates || {});
        return this.commit('settings', this.state.settings);
    };

    Store.prototype.updateSportSettings = function (updates) {
        this.state.sport.settings = Object.assign({}, this.state.sport.settings, updates || {});
        return this.commit('sport/settings', this.state.sport.settings);
    };

    Store.prototype.importState = function (value) {
        const imported = normalizeData(value);
        imported.meta.updatedAt = Date.now();
        return this.patch(imported);
    };

    function mountSyncStatus(store, element) {
        if (!element) return;
        element.innerHTML = '<span role="status" aria-live="polite"></span><button type="button" data-sync-retry hidden>Повторить</button><button type="button" data-sync-backup hidden>Скачать копию</button>';
        const label = element.querySelector('span');
        const retry = element.querySelector('[data-sync-retry]');
        const backup = element.querySelector('[data-sync-backup]');
        retry.addEventListener('click', function () { store.retry(); });
        backup.addEventListener('click', function () { download('almanion-backup-' + dateKey(new Date()) + '.json', JSON.stringify(store.state, null, 2), 'application/json'); });
        return store.subscribe(function () {
            const pending = Object.keys(store.pending).length > 0;
            const code = String(store.lastError && (store.lastError.code || store.lastError.message) || '');
            let message = 'Синхронизировано';
            if (pending) {
                if (!store.localPersisted) message = 'Не удалось сохранить на устройстве. Не закрывайте страницу до синхронизации или скачайте копию.';
                else if (/permission|denied/i.test(code)) message = 'Сохранено на устройстве. Облако отклонило запись: проверьте правила доступа Firebase.';
                else if (store.lastError) message = 'Сохранено на устройстве. Не удалось синхронизировать.';
                else if (store.networkConnected === false) message = 'Сохранено на устройстве · ждём подключения';
                else message = 'Синхронизация…';
            } else if (store.networkConnected === false) message = 'Нет подключения к облаку';
            if (label.textContent !== message) label.textContent = message;
            element.dataset.state = pending ? (store.lastError || !store.localPersisted ? 'error' : 'pending') : 'synced';
            retry.hidden = !pending || !store.lastError;
            retry.disabled = !!store.flushPromise || store.networkConnected === false;
            backup.hidden = !pending || (!store.lastError && store.localPersisted);
        });
    }

    function escapeIcs(value) {
        return String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    }

    function icsDate(date, time) {
        return String(date || '').replace(/-/g, '') + (time ? 'T' + String(time).replace(':', '') + '00' : '');
    }

    function createIcs(state, fromDate, toDate) {
        const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Almanion//Personal Planner//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-TIMEZONE:Europe/Moscow'];
        expandItems(state.events, fromDate, toDate).forEach(function (item) {
            lines.push('BEGIN:VEVENT');
            lines.push('UID:' + escapeIcs(item.occurrenceId) + '@almanion.github.io');
            lines.push('DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''));
            if (item.allDay || !item.startTime) {
                lines.push('DTSTART;VALUE=DATE:' + icsDate(item.occurrenceDate));
                lines.push('DTEND;VALUE=DATE:' + icsDate(addDays(item.occurrenceDate, 1)));
            } else {
                lines.push('DTSTART;TZID=Europe/Moscow:' + icsDate(item.occurrenceDate, item.startTime));
                const endDate = item.endTime && item.endTime <= item.startTime ? addDays(item.occurrenceDate, 1) : item.occurrenceDate;
                lines.push('DTEND;TZID=Europe/Moscow:' + icsDate(endDate, item.endTime || item.startTime));
            }
            lines.push('SUMMARY:' + escapeIcs(item.title));
            if (item.notes) lines.push('DESCRIPTION:' + escapeIcs(item.notes));
            (item.reminderMinutes || []).forEach(function (minutes) {
                const amount = Math.max(0, Number(minutes) || 0);
                if (!amount) return;
                lines.push('BEGIN:VALARM', 'TRIGGER:-PT' + amount + 'M', 'ACTION:DISPLAY', 'DESCRIPTION:' + escapeIcs(item.title), 'END:VALARM');
            });
            lines.push('END:VEVENT');
        });
        lines.push('END:VCALENDAR');
        return lines.join('\r\n');
    }

    function download(name, content, type) {
        if (!root.document || !root.URL || !root.Blob) return false;
        const url = root.URL.createObjectURL(new Blob([content], { type: type || 'text/plain;charset=utf-8' }));
        const link = root.document.createElement('a');
        link.href = url;
        link.download = name;
        link.hidden = true;
        root.document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { root.URL.revokeObjectURL(url); }, 0);
        return true;
    }

    return {
        OWNER_UID: OWNER_UID,
        OWNER_EMAIL: OWNER_EMAIL,
        SCHEMA_VERSION: SCHEMA_VERSION,
        Store: Store,
        mountSyncStatus: mountSyncStatus,
        normalizeRecord: normalizeRecord,
        clone: clone,
        dateKey: dateKey,
        parseDate: parseDate,
        addDays: addDays,
        startOfWeek: startOfWeek,
        daysBetween: daysBetween,
        safeId: safeId,
        objectMap: objectMap,
        isOwner: isOwner,
        defaultData: defaultData,
        normalizeData: normalizeData,
        occursOn: occursOn,
        expandItems: expandItems,
        recurrenceText: recurrenceText,
        createIcs: createIcs,
        download: download
    };
}));
