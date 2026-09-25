'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'apps-script.gs'), 'utf8');
const propertyValues = new Map([
    ['TELEGRAM_BOT_TOKEN', '123456789:abcdefghijklmnopqrstuvwxyz_ABCDEFGH'],
    ['TELEGRAM_CHAT_ID', '1234567890']
]);
const telegramRequests = [];
const triggers = [];
let telegramFailure = '';

const properties = {
    getProperty(key) { return propertyValues.has(key) ? propertyValues.get(key) : null; },
    setProperty(key, value) { propertyValues.set(key, String(value)); return this; },
    setProperties(values) { Object.entries(values).forEach(([key, value]) => propertyValues.set(key, String(value))); return this; },
    deleteProperty(key) { propertyValues.delete(key); return this; },
    getKeys() { return Array.from(propertyValues.keys()); }
};

function response(code, payload) {
    return {
        getResponseCode: () => code,
        getContentText: () => JSON.stringify(payload),
        getAllHeaders: () => ({})
    };
}

const sandbox = {
    console,
    Date,
    JSON,
    Math,
    Number,
    Object,
    Array,
    String,
    RegExp,
    Set,
    PropertiesService: { getScriptProperties: () => properties },
    LockService: {
        getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} })
    },
    ScriptApp: {
        getProjectTriggers: () => triggers.slice(),
        deleteTrigger: trigger => triggers.splice(triggers.indexOf(trigger), 1),
        newTrigger(handler) {
            const trigger = { handler, interval: 0, getHandlerFunction: () => handler };
            return {
                timeBased() { return this; },
                everyMinutes(minutes) { trigger.interval = minutes; return this; },
                create() { triggers.push(trigger); return trigger; }
            };
        }
    },
    Utilities: {
        DigestAlgorithm: { SHA_256: 'sha256' },
        Charset: { UTF_8: 'utf8' },
        computeDigest(_algorithm, value) { return Array.from(crypto.createHash('sha256').update(String(value), 'utf8').digest()); },
        newBlob(value) { return { getBytes: () => Array.from(Buffer.from(String(value), 'utf8')) }; },
        getUuid: () => crypto.randomUUID(),
        sleep: () => {},
        formatDate(date) {
            const value = new Date(date);
            return String(value.getUTCDate()).padStart(2, '0') + '.' +
                String(value.getUTCMonth() + 1).padStart(2, '0') + ' в ' +
                String(value.getUTCHours()).padStart(2, '0') + ':' + String(value.getUTCMinutes()).padStart(2, '0');
        }
    },
    UrlFetchApp: {
        fetch(url, options) {
            if (url.startsWith('https://api.telegram.org/bot')) {
                if (telegramFailure) throw new Error(telegramFailure);
                telegramRequests.push({ url, body: JSON.parse(options.payload) });
                return response(200, { ok: true, result: { message_id: telegramRequests.length } });
            }
            return response(500, {});
        }
    },
    ContentService: {
        MimeType: { JSON: 'json' },
        createTextOutput(text) {
            return { text, setMimeType() { return this; } };
        }
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    SpreadsheetApp: {},
    Logger: { log: () => {} }
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'apps-script.gs' });

const now = Date.now();
const many = Array.from({ length: 120 }, (_, index) => ({
    id: 'event-' + index + '@2026-10-01:15',
    title: 'Длинное тестовое напоминание ' + index + ' '.repeat(10),
    sendAt: now + 3600000 + index * 60000,
    eventAt: now + 4500000 + index * 60000
}));
const synced = sandbox.plannerTelegramSync(many);
assert.equal(synced.success, true);
assert.equal(synced.pendingCount, 120);
assert.ok(properties.getKeys().filter(key => key.startsWith('PLANNER_TELEGRAM_QUEUE_CHUNK_')).length > 1,
    'queue must be split below the Apps Script per-property limit');

let enabled = sandbox.plannerTelegramEnable();
assert.equal(enabled.enabled, true);
assert.equal(enabled.triggerInstalled, true);
assert.equal(triggers.length, 1);
assert.equal(triggers[0].interval, 5);
sandbox.plannerTelegramEnable();
assert.equal(triggers.length, 1, 'enabling twice must not create duplicate triggers');

const tested = sandbox.plannerTelegramTest();
assert.equal(tested.tested, true);
assert.equal(telegramRequests.length, 1);
assert.equal(telegramRequests[0].body.chat_id, '1234567890');
assert.ok(!JSON.stringify(tested).includes(propertyValues.get('TELEGRAM_BOT_TOKEN')),
    'status must not expose the Telegram token');

const due = {
    id: 'due-event@2026-09-25:15',
    title: 'Скоро занятие',
    sendAt: Date.now() - 1000,
    eventAt: Date.now() + 900000
};
assert.equal(sandbox.plannerTelegramSync([due]).acceptedCount, 1);
sandbox.runPlannerTelegramReminders();
assert.equal(telegramRequests.length, 2);
assert.match(telegramRequests[1].body.text, /Скоро занятие/);
assert.equal(sandbox.plannerTelegramStatus().pendingCount, 0);
sandbox.runPlannerTelegramReminders();
assert.equal(telegramRequests.length, 2, 'the same reminder must not be delivered twice');
assert.equal(sandbox.plannerTelegramSync([due]).acceptedCount, 0,
    'a full resync must preserve the sent-reminder guard');

telegramFailure = 'request failed: https://api.telegram.org/bot' + propertyValues.get('TELEGRAM_BOT_TOKEN') +
    '/sendMessage?chat_id=' + propertyValues.get('TELEGRAM_CHAT_ID');
assert.throws(() => sandbox.plannerTelegramTest(), error => {
    assert.doesNotMatch(error.message, new RegExp(propertyValues.get('TELEGRAM_BOT_TOKEN').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(error.message, new RegExp(propertyValues.get('TELEGRAM_CHAT_ID')));
    return true;
}, 'transport failures must not expose Telegram credentials');
telegramFailure = '';

sandbox.verifyFirebaseToken = () => ({ uid: 'forged-user', email: 'dmb23930@gmail.com' });
let result = JSON.parse(sandbox.handle({ postData: { contents: JSON.stringify({ action: 'plannerTelegramStatus', idToken: 'forged' }) } }).text);
assert.equal(result.success, false, 'the owner email alone must never authorize Telegram actions');
sandbox.verifyFirebaseToken = () => ({ uid: vm.runInContext('SITE_OWNER_UID', sandbox), email: 'changed@example.test' });
result = JSON.parse(sandbox.handle({ postData: { contents: JSON.stringify({ action: 'plannerTelegramStatus', idToken: 'owner' }) } }).text);
assert.equal(result.success, true);

const disabled = sandbox.plannerTelegramDisable();
assert.equal(disabled.enabled, false);
assert.equal(disabled.pendingCount, 0);
assert.equal(triggers.length, 0);
assert.equal(properties.getKeys().filter(key => key.startsWith('PLANNER_TELEGRAM_QUEUE_CHUNK_')).length, 0);

console.log('Apps Script Telegram reminders: all tests passed');
