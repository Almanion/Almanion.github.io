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
    assert.match(page, /id="dutyCalendarMerges"/);
    assert.match(page, /id="dutyCalendarAddMergeButton"/);
    assert.doesNotMatch(page, /id="dutyAddWeekButton"/, 'the generated annual schedule must not expose a dead add-week action');
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
    assert.match(client, /byId\('dutyCalendarAddMergeButton'\)/);
    assert.match(client, /event\.key\s*!==\s*'Tab'/, 'the modal editor must trap keyboard focus');
    assert.match(
        client,
        /entry\.segments\s*=\s*isIsoDate\(entry\.start\)[\s\S]*?\?\s*\[\{\s*start:\s*entry\.start,\s*end:\s*entry\.end\s*\}\][\s\S]*?:\s*\[\]/,
        'an invalid direct date edit must clear stale segments so validation cannot silently publish the old range'
    );

    const pageIds = new Set(Array.from(page.matchAll(/\bid="([^"]+)"/g), match => match[1]));
    const requiredIds = new Set(Array.from(client.matchAll(/byId\('([^']+)'\)/g), match => match[1]));
    assert.deepEqual(
        Array.from(requiredIds).filter(id => !pageIds.has(id)),
        [],
        'every direct duty.js DOM dependency must exist in the page'
    );

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
    const generatedEntries = Duty.generateDutyEntries(Duty.DEFAULT_DUTY_CONFIG);
    assert.equal(generatedEntries.length, 35, 'the complete school year must contain 35 duty turns');
    assert.equal(
        JSON.stringify(generatedEntries),
        JSON.stringify(Duty.generateDutyEntries(Duty.DEFAULT_DUTY_CONFIG)),
        'generation must be deterministic'
    );
    assert.deepEqual(
        Array.from(Duty.normalizeDutyConfig(Duty.DEFAULT_DUTY_CONFIG).cycle, group => group.id),
        Array.from({ length: 14 }, (_, index) => `group-${String(index + 1).padStart(2, '0')}`),
        'all 14 groups must remain in their declared order'
    );
    assert.deepEqual(
        Array.from(Duty.normalizeDutyConfig(Duty.DEFAULT_DUTY_CONFIG).cycle[13].people),
        ['Гоша Шкурихин', 'Вова Дубейко', 'Саша Свердлов'],
        'the final cycle turn is the three-person team'
    );
    generatedEntries.forEach((entry, index) => {
        assert.equal(
            entry.groupId,
            `group-${String((index % 14) + 1).padStart(2, '0')}`,
            `duty turn ${index + 1} must advance the cycle exactly once`
        );
        if (index > 0) {
            assert.notEqual(entry.groupId, generatedEntries[index - 1].groupId, 'adjacent turns must not repeat a group');
        }
    });
    const generatedGroupIds = new Set(Array.from(generatedEntries, entry => entry.groupId));
    assert.equal(generatedGroupIds.size, 14, 'no group may disappear because of a holiday or vacation');

    const generatedById = new Map(Array.from(generatedEntries, entry => [entry.id, entry]));
    assert.deepEqual(
        Array.from(generatedById.get('week-2026-09-02').people),
        ['Нонна Близнец', 'Маша Кессель']
    );
    assert.deepEqual(
        Array.from(generatedById.get('week-2026-09-07').people),
        ['Полина Лубневская', 'Марина Устинова'],
        '7 September is the required second cycle turn'
    );
    assert.equal(generatedById.get('week-2026-09-14').end, '2026-09-17', 'the tourist rally removes 18–19 September');

    const autumnTurn = generatedById.get('week-2026-10-26');
    assert.ok(autumnTurn, 'the joined autumn turn is missing');
    assert.equal(autumnTurn.end, '2026-11-07');
    assert.deepEqual(
        Array.from(autumnTurn.segments, segment => `${segment.start}/${segment.end}`),
        ['2026-10-26/2026-10-27', '2026-11-05/2026-11-07']
    );
    assert.equal(Duty.formatEntryRange(autumnTurn), '26–27 октября и 5–7 ноября');
    assert.deepEqual(Array.from(Duty.entryMonthKeys(autumnTurn)), ['2026-10', '2026-11']);
    assert.equal(autumnTurn.groupId, 'group-09', 'the short autumn fragments must use the naturally distant ninth team');
    const autumnTeamTurns = generatedEntries.filter(entry => entry.groupId === autumnTurn.groupId);
    assert.deepEqual(
        Array.from(autumnTeamTurns, entry => entry.start),
        ['2026-10-26', '2027-02-24'],
        'the autumn team must not be scheduled again near either short fragment'
    );
    const dayDistance = (first, second) => (
        Date.parse(`${second}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)
    ) / 86400000;
    const recurrenceDistances = [];
    for (let groupNumber = 1; groupNumber <= 14; groupNumber += 1) {
        const groupId = `group-${String(groupNumber).padStart(2, '0')}`;
        const starts = generatedEntries.filter(entry => entry.groupId === groupId).map(entry => entry.start);
        for (let index = 1; index < starts.length; index += 1) {
            recurrenceDistances.push(dayDistance(starts[index - 1], starts[index]));
        }
    }
    assert.equal(
        dayDistance(autumnTeamTurns[0].start, autumnTeamTurns[1].start),
        Math.max(...recurrenceDistances),
        'the team spanning the autumn break must receive the longest recurrence gap in the cycle'
    );
    assert.equal(generatedById.get('week-2026-11-09').groupId, 'group-10');

    assert.equal(generatedById.has('week-2026-12-28'), false, 'winter vacation must not consume a cycle turn');
    assert.equal(generatedById.has('week-2027-01-04'), false, 'winter vacation must not consume a second cycle turn');
    assert.equal(generatedById.get('week-2027-01-11').groupId, 'group-03');
    assert.equal(generatedById.has('week-2027-03-22'), false, 'spring vacation must not consume a cycle turn');
    assert.equal(generatedById.get('week-2027-03-29').groupId, 'group-13');

    assert.equal(generatedById.get('week-2027-02-24').end, '2027-02-27', '22–23 February must be excluded');
    assert.equal(generatedById.get('week-2027-03-09').end, '2027-03-13', '8 March must be excluded');
    assert.equal(generatedById.get('week-2027-04-26').end, '2027-04-30', '1 May must be excluded');
    assert.equal(generatedById.get('week-2027-05-11').end, '2027-05-15', '10 May must be excluded');
    assert.equal(generatedEntries.at(-1).start, '2027-05-24');
    assert.equal(generatedEntries.at(-1).end, '2027-05-25');
    assert.equal(generatedEntries.at(-1).groupId, 'group-07', '24–25 May is a separate next turn');

    const forbiddenDays = new Set([
        '2026-09-18', '2026-09-19', '2027-02-22', '2027-02-23',
        '2027-03-08', '2027-05-01', '2027-05-10'
    ]);
    const vacations = [
        ['2026-10-28', '2026-11-04'],
        ['2026-12-28', '2027-01-10'],
        ['2027-03-22', '2027-03-28']
    ];
    generatedEntries.forEach(entry => {
        entry.segments.forEach(segment => {
            for (let date = segment.start; date <= segment.end; date = Duty.addDays(date, 1)) {
                assert.equal(forbiddenDays.has(date), false, `${date} must not be generated as a duty day`);
                vacations.forEach(([start, end]) => {
                    assert.equal(start <= date && date <= end, false, `${date} lies inside a vacation`);
                });
            }
        });
    });

    const autumnPause = Duty.scheduleState(generatedEntries, '2026-10-30');
    assert.equal(autumnPause.current, null, 'a gap between segments is not an active duty date');
    assert.equal(autumnPause.next.id, 'week-2026-10-26');
    assert.equal(autumnPause.focusSegment.start, '2026-11-05');

    const serializedConfig = Duty.configToFirebase(Duty.DEFAULT_DUTY_CONFIG);
    assert.equal(serializedConfig.cycle['group-02'].people['person-0'], 'Полина Лубневская');
    assert.deepEqual(
        Array.from(Duty.generateDutyEntries(serializedConfig), entry => entry.id),
        Array.from(generatedEntries, entry => entry.id),
        'the Firebase config representation must generate the same year'
    );
    const preservedLocks = Duty.deriveDutyOverrides(Duty.DEFAULT_DUTY_CONFIG, generatedEntries);
    assert.deepEqual(Object.keys(preservedLocks), [], 'the default order must not need redundant pinned overrides');
    const changedEntries = generatedEntries.map(entry => ({
        ...entry,
        people: Array.from(entry.people),
        segments: Array.from(entry.segments, segment => ({ ...segment }))
    }));
    changedEntries[2].start = '2026-09-15';
    changedEntries[2].segments = [{ start: '2026-09-15', end: '2026-09-17' }];
    const dateOverride = Duty.deriveDutyOverrides(Duty.DEFAULT_DUTY_CONFIG, changedEntries)['week-2026-09-14'];
    assert.equal(dateOverride.start, '2026-09-15');
    assert.equal(dateOverride.end, '2026-09-17');
    assert.equal(Object.hasOwn(dateOverride, 'segments'), false, 'a single segment must serialize as start/end');

    const twoGroupConfig = JSON.parse(JSON.stringify(serializedConfig));
    Object.keys(twoGroupConfig.cycle).slice(2).forEach(id => { delete twoGroupConfig.cycle[id]; });
    twoGroupConfig.overrides = {};
    const normalizedTwoGroupConfig = Duty.normalizeDutyConfig(twoGroupConfig);
    assert.equal(normalizedTwoGroupConfig.cycle.length, 2, 'the editor model must support a dynamic cycle');
    assert.deepEqual(
        Array.from(Duty.generateDutyEntries(normalizedTwoGroupConfig).slice(0, 4), entry => entry.groupId),
        ['group-01', 'group-02', 'group-01', 'group-02']
    );

    const deletedGroupConfig = JSON.parse(JSON.stringify(serializedConfig));
    deletedGroupConfig.overrides = { 'week-2026-09-02': { groupId: 'group-01' } };
    delete deletedGroupConfig.cycle['group-01'];
    const normalizedAfterDelete = Duty.normalizeDutyConfig(deletedGroupConfig);
    assert.equal(normalizedAfterDelete.cycle.length, 13);
    assert.equal(normalizedAfterDelete.overrides['week-2026-09-02'], undefined, 'deleted group references must be removed');
    const serializedAfterDelete = Duty.configToFirebase(normalizedAfterDelete);
    assert.equal(JSON.stringify(serializedAfterDelete).includes('group-01'), false);
    assert.equal(Duty.generateDutyEntries(serializedAfterDelete)[0].groupId, 'group-02');

    const reorderedConfig = JSON.parse(JSON.stringify(serializedConfig));
    reorderedConfig.cycle['group-01'].order = 2;
    reorderedConfig.cycle['group-02'].order = 1;
    assert.deepEqual(
        Array.from(Duty.generateDutyEntries(reorderedConfig).slice(0, 3), entry => entry.groupId),
        ['group-02', 'group-01', 'group-03'],
        'reordering must keep stable IDs and change only the cycle order'
    );

    const manualConfig = JSON.parse(JSON.stringify(serializedConfig));
    manualConfig.overrides = { 'week-2026-09-07': { groupId: 'group-03' } };
    const manuallyGenerated = Duty.generateDutyEntries(manualConfig);
    assert.equal(manuallyGenerated[1].groupId, 'group-03');
    assert.equal(
        Duty.deriveDutyOverrides(manualConfig, manuallyGenerated)['week-2026-09-07'].groupId,
        'group-03',
        'an intentional manual group override must survive editor synchronization'
    );

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
    assert.equal(nextWeek.start, '2027-05-31');
    assert.equal(nextWeek.end, '2027-06-05');

    assert.equal(Duty.validateEntries([]).valid, false);
    assert.equal(Duty.validateEntries([{
        start: '2026-09-07', end: '2026-09-12', people: ['   '], note: ''
    }]).valid, false, 'a week without a named duty person must be rejected');
    assert.equal(Duty.validateEntries([{
        start: '2026-09-07', end: '2026-09-12', people: ['А'], note: '',
        segments: [
            { start: '2026-09-07', end: '2026-09-07' },
            { start: '2026-09-09', end: '2026-09-09' },
            { start: '2026-09-11', end: '2026-09-11' },
            { start: '2026-09-12', end: '2026-09-12' }
        ]
    }]).valid, false, 'the client must reject segment counts unsupported by Firebase rules');
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

    const serializedAutumn = Duty.entriesToFirebase([autumnTurn])['week-2026-10-26'];
    assert.equal(serializedAutumn.groupId, 'group-09');
    assert.deepEqual(Object.keys(serializedAutumn.segments), ['segment-0', 'segment-1']);
    assert.equal(serializedAutumn.segments['segment-1'].start, '2026-11-05');

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
