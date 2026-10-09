'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin-app.js'), 'utf8');
const pure = admin.slice(admin.indexOf('function getActiveOnlineUsers('), admin.indexOf('function refreshOnlineUsers('));
const active = vm.runInNewContext(pure + '; getActiveOnlineUsers;');
const now = 200000;
const data = {
    one: { visitorId: 'one', timestamp: now - 2000 },
    same: { visitorId: 'one', timestamp: now - 1000, page: '/new' },
    two: { visitorId: 'two', timestamp: now - 90000 },
    old: { visitorId: 'old', timestamp: now - 90001 },
    future: { visitorId: 'future', timestamp: now + 60000 },
    malformed: { visitorId: 'bad', timestamp: 'not a time' },
    empty: { timestamp: now },
    null: null
};
assert.deepEqual(Array.from(active(data, now), user => user.visitorId), ['one', 'two']);
assert.equal(active(data, now)[0].page, '/new');
assert.equal(active(data, now + 160000).length, 0, 'records expire without any database mutation');

const source = fs.readFileSync(path.join(root, 'firebase-analytics.js'), 'utf8');
const presence = source.slice(source.indexOf('    let presenceIntervalId'), source.indexOf('    // РЕГИСТРАЦИЯ УНИКАЛЬНОГО'));
let connection;
const writes = [];
const listeners = new Map();
const timers = new Map();
let timerId = 0;
const presenceRef = { set: value => { writes.push(value); return Promise.resolve(); } };
const connectedRef = { on: (_, callback) => { connection = callback; callback({ val: () => true }); }, off: () => {} };
const document = {
    title: 'Тест', visibilityState: 'visible',
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: type => listeners.delete(type)
};
const windowEvents = new Map();
const context = {
    db: { ref: value => value === '.info/connected' ? connectedRef : presenceRef },
    visitorId: 'one', identityCleanup: [],
    identityMeta: () => ({ visitorId: 'one', authProvider: 'password', browserContext: 'web' }),
    firebase: { database: { ServerValue: { TIMESTAMP: { '.sv': 'timestamp' } } } },
    document, location: { pathname: '/physics.html' }, navigator: { userAgent: 'Test' }, console,
    setInterval: fn => { timers.set(++timerId, fn); return timerId; },
    clearInterval: id => timers.delete(id),
    window: { addEventListener: (type, fn) => windowEvents.set(type, fn) }
};
vm.createContext(context);
vm.runInContext(presence + '; trackPresence();', context);
assert.equal(writes.length, 1);
const heartbeat = [...timers.values()][0];
heartbeat();
assert.equal(writes.length, 2);
assert.ok(writes.every(value => value.visitorId && value.authProvider && value.userAgent && value.timestamp), 'every heartbeat can restore a complete rule-valid record');
connection({ val: () => false }); heartbeat();
assert.equal(writes.length, 2, 'do not enqueue heartbeat writes while disconnected');
connection({ val: () => true });
assert.equal(writes.length, 3, 'reconnect immediately restores presence');
document.visibilityState = 'hidden'; heartbeat();
assert.equal(writes.length, 3);
document.visibilityState = 'visible'; listeners.get('visibilitychange')();
assert.equal(writes.length, 4);
windowEvents.get('pagehide')();
assert.equal(timers.size, 0);
heartbeat(); assert.equal(writes.length, 4, 'stopped callbacks cannot write or remove another tab\'s record');
windowEvents.get('pageshow')({ persisted: true });
assert.equal(writes.length, 5, 'back-forward cache restores the heartbeat');
assert.equal(timers.size, 1);
assert.doesNotMatch(presence, /onDisconnect\(\)\.remove|presenceRef\.remove|presenceRef\.update/);
console.log('online freshness, deduplication and heartbeat lifecycle: all tests passed');
