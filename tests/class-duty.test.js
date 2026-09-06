'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

async function testAccountAccessHelper(accountSource) {
    const helperSource = accountSource.match(/function hasDutyEditorAccess\(account\) \{[\s\S]*?\n    \}/);
    assert.ok(helperSource, 'duty editor access helper could not be extracted');

    const requestedPaths = [];
    const sandbox = {
        db: {
            ref(refPath) {
                requestedPaths.push(refPath);
                return {
                    once() {
                        return Promise.resolve({ val: () => true });
                    }
                };
            }
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(`${helperSource[0]}\nthis.checkDutyAccess = hasDutyEditorAccess;`, sandbox);

    assert.equal(await sandbox.checkDutyAccess(null), false, 'signed-out visitors must not receive edit access');
    assert.equal(
        await sandbox.checkDutyAccess({ uid: 'owner', email: ' DMB23930@GMAIL.COM ' }),
        true,
        'the owner email must retain edit access'
    );
    assert.deepEqual(requestedPaths, [], 'the owner bypass must not depend on a role record');

    assert.equal(
        await sandbox.checkDutyAccess({ uid: 'editor-uid', email: 'editor@example.com' }),
        true,
        'an explicitly granted dutyEditor role must allow editing'
    );
    assert.deepEqual(requestedPaths, ['adminRoles/editor-uid/dutyEditor']);

    sandbox.db = {
        ref() {
            return { once: () => Promise.resolve({ val: () => 1 }) };
        }
    };
    assert.equal(
        await sandbox.checkDutyAccess({ uid: 'ordinary-uid', email: 'ordinary@example.com' }),
        false,
        'only the boolean value true may grant the role'
    );

    sandbox.db = {
        ref() {
            return { once: () => Promise.reject(new Error('permission denied')) };
        }
    };
    assert.equal(
        await sandbox.checkDutyAccess({ uid: 'offline-uid', email: 'offline@example.com' }),
        false,
        'role lookup failures must fail closed'
    );
}

async function run() {
    const page = read('duty-10-1.html');
    const client = read('duty.js');
    const css = read(path.join('styles', 'duty.css'));
    const home = read('index.html');
    const account = read('account.js');
    const admin = read('admin.html');
    const dashboard = read('admin-dashboard.js');
    const worker = read('sw.js');
    const rules = JSON.parse(read(path.join('firebase', 'database.rules.json'))).rules;

    // Public page and asset wiring.
    assert.match(home, /href="duty-10-1\.html"/);
    assert.match(page, /styles\/duty\.css\?v=/);
    assert.match(page, /duty\.js\?v=/);
    assert.match(page, /account\.js\?v=/);
    assert.match(page, /id="dutyEditButton"[^>]*hidden/);
    assert.match(page, /id="dutyEditorOverlay"[^>]*hidden[^>]*aria-hidden="true"/);
    assert.match(page, /id="dutyEditorContent"/);
    assert.doesNotMatch(page, /Понятное расписание без таблиц/);
    assert.match(worker, /['"]\/duty-10-1\.html['"]/);
    assert.match(worker, /['"]\/duty\.js['"]/);
    assert.match(worker, /['"]\/styles\/duty\.css['"]/);
    assert.match(css, /@media \(max-width: 640px\)/);
    assert.match(css, /@media \(max-width: 380px\)/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /\.duty-editor\s*\{[\s\S]*?grid-template-areas:/);
    assert.match(css, /\.duty-editor-content\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;/);
    assert.match(css, /\.duty-topbar \.sidebar-header-buttons\s*\{[\s\S]*?border-radius:\s*999px;/);
    assert.match(client, /byId\('dutyEditorContent'\)\.scrollTop\s*=\s*0/);

    // The schedule renderer must treat names and notes as text, not markup from Firebase.
    assert.match(client, /item\.textContent\s*=\s*person/);
    assert.match(client, /note\.textContent\s*=\s*entry\.note/);
    assert.doesNotMatch(client, /\.innerHTML\s*=/, 'duty data must not be rendered through innerHTML');

    // Pure schedule helpers are exposed before the browser-only part of duty.js.
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(client, sandbox, { filename: 'duty.js' });
    const Duty = sandbox.AlmanionDuty;
    assert.ok(Duty, 'AlmanionDuty helpers are unavailable');
    assert.equal(Duty.DATA_PATH, 'classDuty/grade10_1');
    assert.equal(Duty.isIsoDate('2026-02-29'), false);
    assert.equal(Duty.isIsoDate('2028-02-29'), true);
    assert.equal(Duty.isIsoDate('2026-13-01'), false);

    const normalized = Duty.normalizeSchedule({
        revision: 7,
        entries: {
            late: { start: '2026-10-05', end: '2026-10-10', people: ['  Поздняя смена  '] },
            invalid: { start: '2026-09-31', end: '2026-10-03', people: ['Ошибка'] },
            early: { start: '2026-09-28', end: '2026-10-03', people: { first: 'Ранняя смена' } }
        }
    });
    assert.equal(normalized.revision, 7);
    assert.deepEqual(
        Array.from(normalized.entries, entry => entry.start),
        ['2026-09-28', '2026-10-05'],
        'weeks must be validated and sorted independently of Firebase key order'
    );
    assert.deepEqual(Array.from(normalized.entries[1].people), ['Поздняя смена']);

    const defaultEntries = Duty.normalizeSchedule(Duty.DEFAULT_SCHEDULE).entries;
    const beforeWeek = Duty.scheduleState(defaultEntries, '2026-09-06');
    assert.equal(beforeWeek.current, null);
    assert.equal(beforeWeek.next.start, '2026-09-07');
    assert.equal(beforeWeek.focus.start, '2026-09-07');

    const crossMonth = Duty.scheduleState(defaultEntries, '2026-09-30');
    assert.equal(crossMonth.current.start, '2026-09-28');
    assert.equal(crossMonth.current.end, '2026-10-03');
    assert.equal(crossMonth.next.start, '2026-10-05');
    assert.equal(Duty.formatRange('2026-09-28', '2026-10-03'), '28 сентября — 3 октября');

    const nextWeek = Duty.nextWeekAfter(defaultEntries);
    assert.equal(nextWeek.start, '2026-10-19');
    assert.equal(nextWeek.end, '2026-10-24');

    assert.equal(Duty.validateEntries([]).valid, false);
    assert.equal(Duty.validateEntries([{
        start: '2026-09-07', end: '2026-09-12', people: ['   '], note: ''
    }]).valid, false, 'a week without a named duty person must be rejected');
    assert.equal(Duty.validateEntries([
        { start: '2026-09-07', end: '2026-09-12', people: ['А'], note: '' },
        { start: '2026-09-12', end: '2026-09-19', people: ['Б'], note: '' }
    ]).valid, false, 'overlapping weeks must be rejected');

    const firebaseEntries = Duty.entriesToFirebase([
        { start: '2026-10-05', end: '2026-10-10', people: [' Б '], note: ' заметка ' },
        { start: '2026-09-28', end: '2026-10-03', people: ['А'], note: '' }
    ]);
    assert.deepEqual(Object.keys(firebaseEntries), ['week-2026-09-28', 'week-2026-10-05']);
    assert.equal(firebaseEntries['week-2026-10-05'].people['person-0'], 'Б');
    assert.equal(firebaseEntries['week-2026-10-05'].note, 'заметка');

    // Role helper and owner-only role manager wiring.
    await testAccountAccessHelper(account);
    assert.match(account, /hasDutyEditorAccess:\s*hasDutyEditorAccess/);
    assert.match(admin, /id="dutyEditorRole"/);
    assert.match(dashboard, /byId\('dutyEditorRole'\)\.checked\s*=\s*role\.dutyEditor\s*===\s*true/);
    assert.match(dashboard, /!role\.dutyEditor/);
    assert.match(dashboard, /if \(role\.dutyEditor\) badges\.appendChild\(roleBadge\('Дежурство'\)\)/);
    assert.match(dashboard, /const dutyEditor\s*=\s*byId\('dutyEditorRole'\)\.checked/);
    assert.match(dashboard, /!siteAdmin\s*&&\s*!matcenterAdmin\s*&&\s*!contentEditor\s*&&\s*!dutyEditor\s*&&\s*!englishAccess/);
    assert.match(dashboard, /dutyEditor:\s*dutyEditor/);
    assert.match(dashboard, /siteAdmin\s*\|\|\s*matcenterAdmin\s*\|\|\s*contentEditor\s*\|\|\s*dutyEditor\s*\|\|\s*englishAccess/);

    // Structural security contract for Realtime Database Rules.
    assert.ok(rules.classDuty && rules.classDuty.grade10_1, 'class duty rules are missing');
    const dutyRules = rules.classDuty.grade10_1;
    assert.equal(dutyRules['.read'], true, 'the published schedule must remain publicly readable');
    assert.match(dutyRules['.write'], /auth != null/);
    assert.match(dutyRules['.write'], /newData\.exists\(\)/, 'deleting the complete schedule must be denied');
    assert.match(dutyRules['.write'], /dmb23930@gmail\.com/);
    assert.match(dutyRules['.write'], /2M2ZdLQcJAhluPjUVFNJ6MyQrdH2/);
    assert.match(dutyRules['.write'], /adminRoles.*dutyEditor/);
    assert.doesNotMatch(
        dutyRules['.write'],
        /siteAdmin|matcenterAdmin|contentEditor|englishAccess/,
        'unrelated roles must not grant schedule write access'
    );
    assert.match(dutyRules['.validate'], /revision.*data\.exists\(\).*\+ 1/);
    assert.match(dutyRules.updatedBy['.validate'], /newData\.val\(\) === auth\.uid/);
    assert.equal(dutyRules.$other['.validate'], false, 'unknown schedule fields must be rejected');
    assert.equal(dutyRules.entries.$week.$other['.validate'], false, 'unknown week fields must be rejected');
    assert.match(dutyRules.entries.$week.people.$person['.validate'], /length <= 120/);

    assert.ok(rules.adminRoles.$uid.dutyEditor, 'admin role schema is missing dutyEditor');
    assert.match(rules.adminRoles.$uid['.validate'], /dutyEditor/);
    assert.match(rules.adminRoles.$uid.dutyEditor['.validate'], /newData\.isBoolean\(\)/);
    assert.match(rules.adminRoles.$uid['.write'], /dmb23930@gmail\.com/);
    assert.doesNotMatch(
        rules.adminRoles.$uid['.write'],
        /dutyEditor/,
        'a duty editor must not be able to grant or revoke roles'
    );

    console.log('class duty schedule and access: all tests passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
