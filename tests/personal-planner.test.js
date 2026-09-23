'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const core = require('../personal-planner-core.js');
const plannerPage = read('planner.html');
const sportPage = read('sport.html');
const planner = read('planner.js');
const sport = read('sport.js');
const account = read('account.js');
const rules = JSON.parse(read(path.join('firebase', 'database.rules.json'))).rules;
const publicFiles = JSON.parse(read(path.join('tools', 'site-files.json'))).rootFiles;

assert.equal(core.isOwner({ uid: core.OWNER_UID, email: 'changed@example.test' }), true,
    'owner access must use the immutable Firebase uid');
assert.equal(core.isOwner({ uid: 'forged', email: core.OWNER_EMAIL }), false,
    'knowing the owner email must not grant access');

const recurring = {
    id: 'circle', title: 'Кружок', date: '2026-09-01',
    recurrence: { frequency: 'weekly', interval: 1, days: [3, 6] }
};
assert.equal(core.occursOn(recurring, '2026-09-23'), true, 'Wednesday occurrence must be generated');
assert.equal(core.occursOn(recurring, '2026-09-26'), true, 'Saturday occurrence must be generated');
assert.equal(core.occursOn(recurring, '2026-09-24'), false, 'unselected weekday must stay empty');

const ics = core.createIcs({ events: {
    lesson: {
        id: 'lesson', title: 'Занятие', date: '2026-09-24', startTime: '18:00', endTime: '19:00',
        recurrence: { frequency: 'none', interval: 1 }, reminderMinutes: [60]
    }
} }, '2026-09-24', '2026-09-24');
assert.match(ics, /X-WR-TIMEZONE:Europe\/Moscow/);
assert.match(ics, /DTSTART;TZID=Europe\/Moscow:20260924T180000/);
assert.match(ics, /BEGIN:VALARM[\s\S]*TRIGGER:-PT60M/);

[plannerPage, sportPage].forEach(page => {
    assert.match(page, /id="personalGate"/);
    assert.match(page, /personal-planner-core\.js/);
    assert.doesNotMatch(page, /dmb23930@gmail\.com/, 'the owner address must not be printed in private page markup');
});
assert.match(plannerPage, /data-view="today"/);
assert.match(plannerPage, /data-view="week"/);
assert.match(plannerPage, /data-view="month"/);
assert.match(plannerPage, /data-view="goals"/);
assert.match(planner, /Импорт из ChatGPT/);
assert.match(planner, /Telegram для Almanion/);
assert.match(planner, /Crimson/);

assert.match(sport, /Подтягивания/);
assert.match(sport, /Наклон с гантелями \/ RDL/);
assert.match(sport, /5:\s*\{ mode: 'Разгрузка'/);
assert.match(sport, /data-export-sport/);

assert.match(account, /kind === 'planner'/);
assert.match(account, /renderHomeAccessLinks\(slot, true, true, true\)/,
    'planner entry point must only be included in the owner branch');

assert.match(rules.plannerUsers.$uid['.read'], /auth\.uid === \$uid/);
assert.match(rules.plannerUsers.$uid['.read'], new RegExp(core.OWNER_UID));
assert.doesNotMatch(rules.plannerUsers.$uid['.read'], /auth\.token\.email/);
assert.equal(rules.plannerUsers.$uid.$other['.validate'], false);

['planner.html', 'planner.js', 'sport.html', 'sport.js', 'personal-planner-core.js'].forEach(file => {
    assert.ok(publicFiles.includes(file), file + ' must be included in the production build');
});

console.log('personal planner and sport: all tests passed');
