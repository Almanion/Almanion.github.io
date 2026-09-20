'use strict';

const assert = require('node:assert/strict');
const dashboard = require('../home-dashboard.js');

const allIds = dashboard.catalog.map(item => item.id);
const publicIds = dashboard.catalog.filter(item => !item.requiresEnglish).map(item => item.id);

assert.equal(dashboard.maxItems, 5);
assert.deepEqual(
    dashboard.normalizeSelection(['physics-10', 'physics-10', 'matcenter', 'likbez', 'tour-10-1'], allIds),
    ['physics-10', 'matcenter', 'likbez', 'tour-10-1'],
    'selection must be unique and capped at five items'
);
assert.deepEqual(
    dashboard.normalizeSelection(['english', 'matcenter'], publicIds),
    ['matcenter'],
    'an inaccessible private destination must never be rendered'
);

const settings = {
    homeQuickAccessByUser: {
        userA: ['tour-10-1', 'chemistry-10'],
        userB: ['english', 'likbez']
    }
};
assert.deepEqual(
    dashboard.selectionFromSettings(settings, 'userA', false),
    ['tour-10-1', 'chemistry-10'],
    'each account must keep its own ordered selection'
);
assert.deepEqual(
    dashboard.selectionFromSettings(settings, 'userB', false),
    ['likbez'],
    'revoked private access must remove only the inaccessible item'
);
assert.deepEqual(
    dashboard.selectionFromSettings(settings, 'unknownUser', false),
    ['physics-10', 'matcenter', 'likbez'],
    'a new account must receive a useful public default'
);
assert.deepEqual(
    dashboard.selectionFromSettings({}, 'englishUser', true),
    ['english', 'matcenter', 'likbez'],
    'English is a default shortcut only after permission is confirmed'
);

console.log('home quick access: all tests passed');
