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
        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
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
            tasks: objectMap(raw.tasks),
            goals: objectMap(raw.goals),
            series: objectMap(raw.series),
            inbox: objectMap(raw.inbox),
            sport: {
                workouts: objectMap(raw.sport && raw.sport.workouts),
                measurements: objectMap(raw.sport && raw.sport.measurements),
                program: objectMap(raw.sport && raw.sport.program),
                settings: Object.assign({}, defaults.sport.settings, raw.sport && raw.sport.settings || {})
            }
        };
    }

    function occursOn(item, targetDate) {
        if (!item || !item.date || targetDate < item.date) return false;
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
        this.state = readLocal(user.uid);
        this.pending = readPending(user.uid);
        this.ref = database.ref('plannerUsers/' + user.uid);
        this.connected = true;
        return new Promise(function (resolve, reject) {
            let settled = false;
            let seeding = false;
            function finish() {
                if (settled) return;
                settled = true;
                resolve(self);
            }
            self.remoteHandler = function (snapshot) {
                const remote = snapshot.val();
                if (remote) {
                    self.state = normalizeData(remote);
                    Object.keys(self.pending).forEach(function (path) { applyPath(self.state, path, self.pending[path]); });
                    writeLocal(self.state, user.uid);
                    self.ready = true;
                    self.emit({ source: 'remote', ready: true });
                    self.flush();
                    finish();
                    return;
                }
                if (seeding) return;
                seeding = true;
                self.state = normalizeData(self.state);
                self.state.meta.updatedAt = Date.now();
                const activePending = clone(self.pending);
                const seedState = clone(self.state);
                self.ref.set(seedState).then(function () {
                    Object.keys(activePending).forEach(function (path) {
                        if (JSON.stringify(self.pending[path]) === JSON.stringify(activePending[path])) delete self.pending[path];
                    });
                    writePending(self.pending, user.uid);
                    self.ready = true;
                    self.emit({ source: 'seed', ready: true });
                    finish();
                    if (Object.keys(self.pending).length) self.flush();
                }).catch(function (error) {
                    seeding = false;
                    self.emit({ source: 'error', error: error, ready: false });
                    if (!settled) {
                        settled = true;
                        reject(error);
                    }
                });
            };
            self.ref.on('value', self.remoteHandler, function (error) {
                self.emit({ source: 'error', error: error, ready: false });
                if (!settled) {
                    settled = true;
                    reject(error);
                }
            });
        });
    };

    Store.prototype.disconnect = function () {
        if (this.ref && this.remoteHandler) {
            try { this.ref.off('value', this.remoteHandler); } catch (_) {}
        }
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
        this.state.meta.updatedAt = Date.now();
        const uid = this.user && this.user.uid;
        this.pending[path] = value == null ? null : clone(value);
        writePending(this.pending, uid);
        writeLocal(this.state, uid);
        this.emit({ source: 'local', path: path });
        return this.flush();
    };

    Store.prototype.setPath = function (path, value) {
        applyPath(this.state, path, value == null ? null : clone(value));
        return this.commit(path, value);
    };

    Store.prototype.flush = function () {
        if (!this.ref || !Object.keys(this.pending).length) return Promise.resolve(false);
        if (this.flushPromise) return this.flushPromise;
        const self = this;
        let succeeded = false;
        const active = clone(this.pending);
        const updates = clone(active);
        updates['meta/updatedAt'] = root.firebase && root.firebase.database
            ? root.firebase.database.ServerValue.TIMESTAMP
            : Date.now();
        this.flushPromise = this.ref.update(updates).then(function () {
            succeeded = true;
            Object.keys(active).forEach(function (path) {
                if (JSON.stringify(self.pending[path]) === JSON.stringify(active[path])) delete self.pending[path];
            });
            writePending(self.pending, self.user && self.user.uid);
            return true;
        }).catch(function (error) {
            self.emit({ source: 'error', error: error, ready: self.ready });
            return false;
        }).finally(function () {
            self.flushPromise = null;
            if (succeeded && self.ref && Object.keys(self.pending).length) Promise.resolve().then(function () { self.flush(); });
        });
        return this.flushPromise;
    };

    Store.prototype.upsert = function (collection, item) {
        if (!item || !item.id) return Promise.reject(new Error('missing-id'));
        const value = Object.assign({}, item, { updatedAt: Date.now() });
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
        this.state = normalizeData(value);
        this.state.meta.updatedAt = Date.now();
        const uid = this.user && this.user.uid;
        Object.keys(this.state).forEach(function (key) {
            this.pending[key] = clone(this.state[key]);
        }, this);
        writePending(this.pending, uid);
        writeLocal(this.state, uid);
        this.emit({ source: 'import' });
        return this.flush();
    };

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
