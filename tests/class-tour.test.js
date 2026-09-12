'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

async function run() {
    const source = read('tour-10-1.js');
    const page = read('tour-10-1.html');
    const home = read('index.html');
    const css = read(path.join('styles', 'tour-10-1.css'));
    const account = read('account.js');
    const admin = read('admin.html');
    const dashboard = read('admin-dashboard.js');
    const rules = JSON.parse(read(path.join('firebase', 'database.rules.json'))).rules;
    const sandbox = { console, crypto: crypto.webcrypto, TextEncoder };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'tour-10-1.js' });
    const Tour = sandbox.AlmanionClassTour;

    assert.ok(Tour, 'pure class-tour helpers must be exported');
    assert.equal(Tour.TOUR_PATH, 'classTour/grade10_1/autumn2026');
    assert.equal(Tour.ROSTER_PATH, 'classRosters/grade10_1');
    assert.equal(Tour.DUTY_PATH, 'classDuty/grade10_1');

    const initial = Tour.normalizeTour(Tour.DEFAULT_TOUR);
    assert.ok(initial, 'initial tour data must be valid');
    assert.equal(initial.info.startDate, '2026-09-17');
    assert.equal(initial.info.endDate, '2026-09-19');
    assert.match(initial.info.location, /Озеро Уловное/);
    assert.match(initial.info.route, /Колосково/);
    assert.equal(initial.activities.length, 10);

    const activity = Object.fromEntries(initial.activities.map(item => [item.title, item]));
    assert.equal(activity['Ориентирование'].participants.length, 4);
    assert.equal(activity['Полоса препятствий'].participants.length, 7);
    assert.equal(activity['Техника водного туризма'].participants.length, 5);
    assert.equal(activity['Тир'].participants.length, 2);
    assert.equal(activity['САП-спринт'].participants.length, 3);
    assert.deepEqual(
        Array.from(activity['Ориентирование'].participants).map(id => initial.people[id]),
        ['Дима Петров', 'Катя Айзикович', 'Ваня Коршиков', 'Дима Белоцерковцев']
    );

    assert.equal(JSON.stringify(Tour.tourState(initial.info, new Date(2026, 8, 12))), JSON.stringify({ key: 'upcoming', label: 'До слёта 5 дней' }));
    assert.equal(JSON.stringify(Tour.tourState(initial.info, new Date(2026, 8, 14))), JSON.stringify({ key: 'upcoming', label: 'До слёта 3 дня' }));
    assert.equal(JSON.stringify(Tour.tourState(initial.info, new Date(2026, 8, 18))), JSON.stringify({ key: 'active', label: 'Слёт идёт' }));
    assert.equal(JSON.stringify(Tour.tourState(initial.info, new Date(2026, 8, 20))), JSON.stringify({ key: 'past', label: 'Слёт завершён' }));
    const train = initial.schedule.find(item => item.id === 'train-koloscovo');
    assert.equal(JSON.stringify(Tour.scheduleItemState(train, new Date(2026, 8, 17, 14, 30))), JSON.stringify({ key: 'active', label: 'Сейчас' }));
    assert.equal(JSON.stringify(Tour.scheduleItemState(train, new Date(2026, 8, 17, 16, 0))), JSON.stringify({ key: 'past', label: 'Прошло' }));

    const roster = Object.fromEntries(Object.entries(initial.people).map(([id, displayName], index) => [id, { displayName, order: index + 1, active: true }]));
    const serialized = Tour.tourToFirebase(initial, roster);
    assert.equal(Array.isArray(serialized.activities), false, 'Firebase collections must use keyed objects');
    assert.equal(serialized.activities.orienteering.participants.p_f84bdd78429392089fd3bac0, true);
    assert.equal(serialized.people.p_f84bdd78429392089fd3bac0, 'Дима Петров');
    assert.equal(serialized.tents, undefined, 'an empty optional tents collection must be omitted');
    assert.ok(Tour.normalizeTour(serialized), 'Firebase representation must round-trip');
    assert.equal(await Tour.personId('Дима Петров'), 'p_f84bdd78429392089fd3bac0');

    const invalidEndOnly = JSON.parse(JSON.stringify(initial));
    invalidEndOnly.schedule[0].endTime = '15:00';
    assert.equal(Tour.validateTour(invalidEndOnly).valid, false, 'end time without a start must be rejected');
    const overCapacity = JSON.parse(JSON.stringify(initial));
    overCapacity.tents = [{ id: 'tent-1', title: 'Палатка 1', capacity: 1, note: '', order: 1, participants: Object.keys(initial.people).slice(0, 2) }];
    assert.equal(Tour.validateTour(overCapacity).valid, false, 'tent capacity must be enforced');
    const duplicateTentMember = JSON.parse(JSON.stringify(initial));
    duplicateTentMember.tents = [
        { id: 'tent-1', title: 'Палатка 1', capacity: 4, note: '', order: 1, participants: [Object.keys(initial.people)[0]] },
        { id: 'tent-2', title: 'Палатка 2', capacity: 4, note: '', order: 2, participants: [Object.keys(initial.people)[0]] }
    ];
    assert.equal(Tour.validateTour(duplicateTentMember).valid, false, 'one person must not occupy two tents');

    assert.match(page, /id="tourEditorOverlay" hidden aria-hidden="true"/);
    assert.match(page, /id="tourPickerOverlay" hidden aria-hidden="true"/);
    assert.match(page, /id="tourTitle"/);
    assert.match(page, /data-open-editor="schedule" hidden/);
    assert.match(page, /styles\/tour-10-1\.css\?v=/);
    assert.match(page, /tour-10-1\.js\?v=/);
    assert.doesNotMatch(page, /Нонна Близнец|Маша Кессель/, 'the public HTML must not expose a full class roster');
    assert.doesNotMatch(source, /Маша Кессель/, 'unassigned roster members must not be embedded in the public tour source');
    assert.doesNotMatch(source, /\.innerHTML\s*=/, 'Firebase-backed tour data must never be rendered through innerHTML');
    assert.match(source, /database\.ref\(TOUR_PATH\)\.transaction/);
    assert.match(source, /DRAFT_PREFIX/);
    assert.match(source, /item\.startTime \+ '–' \+ item\.endTime/);
    assert.match(source, /revealLastEditorRow/);

    const ids = Array.from(source.matchAll(/byId\('([^']+)'\)/g), match => match[1]);
    ids.forEach(id => assert.match(page, new RegExp(`id=["']${id}["']`), `missing tour page dependency #${id}`));
    assert.match(css, /\.tour-editor-content\s*\{[^}]*overflow-y:\s*auto/s);
    assert.match(css, /@media \(max-width: 640px\)/);
    assert.match(css, /height:\s*100dvh/);
    assert.match(css, /grid-template-areas:[\s\S]*?"footer"/);
    assert.match(css, /\.tour-page \.sr-only/);

    assert.match(home, /<h2 class="section-title">Класс 10‑1<\/h2>/);
    assert.match(home, /href="tour-10-1\.html"/);
    assert.equal((home.match(/id="homeDutyCard"/g) || []).length, 1, 'duty card must exist exactly once');
    assert.match(account, /hasTourEditorAccess:\s*hasTourEditorAccess/);
    assert.match(admin, /id="tourEditorRole"/);
    assert.match(dashboard, /roleBadge\('Турслёт'\)/);

    assert.ok(rules.classRosters && rules.classRosters.grade10_1);
    assert.match(rules.classRosters.grade10_1['.read'], /tourEditor/);
    assert.doesNotMatch(rules.classRosters.grade10_1['.write'], /tourEditor/, 'only the owner may replace the private roster');
    assert.ok(rules.classTour && rules.classTour.grade10_1.autumn2026);
    assert.equal(rules.classTour.grade10_1.autumn2026['.read'], true);
    assert.match(rules.classTour.grade10_1.autumn2026['.write'], /tourEditor/);
    assert.equal(rules.classTour.grade10_1.autumn2026.$other['.validate'], false);

    console.log('class tour page, editor and access: all tests passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
