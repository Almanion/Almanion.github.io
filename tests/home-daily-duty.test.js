'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const DailyDuty = require('../home-daily-duty.js');
const BuildSite = require('../tools/build-site.js');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const canonical = read('duty-10-1.html').match(/<section\b[^>]*\bid="dutyExtraSchedule"[\s\S]*?<\/section>/);
assert.ok(canonical, 'the original dated duty section must exist');
const days = [...canonical[0].matchAll(/<article\b[^>]*\bdata-duty-date="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)]
    .map(([, date, content]) => ({
        date,
        people: [...content.matchAll(/<li>([^<]+)<\/li>/g)].map(([, person]) => person.trim())
    }));
assert.deepEqual(days.map(day => day.date), [
    '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-23', '2026-10-24'
]);
assert.ok(days.every(day => day.people.length >= 4), 'all five assigned teams must be present');
const before = JSON.stringify(days);

assert.equal(DailyDuty.schoolDate(new Date('2026-10-18T20:59:59Z')), '2026-10-18');
assert.equal(DailyDuty.schoolDate(new Date('2026-10-18T21:00:00Z')), '2026-10-19',
    'the school day changes at Moscow midnight regardless of the device timezone');
assert.equal(DailyDuty.schoolDate(new Date('2026-10-24T21:00:00Z')), '2026-10-25');
assert.deepEqual(DailyDuty.stateForDays(days, '2026-10-18'), {
    kind: 'upcoming', date: days[0].date, people: days[0].people
});
for (const day of days) {
    assert.deepEqual(DailyDuty.stateForDays(days, day.date), { kind: 'today', ...day },
        `the assignment for ${day.date} must retain every supplied name`);
}
assert.deepEqual(DailyDuty.stateForDays(days, '2026-10-22'), {
    kind: 'none', date: '2026-10-22', people: []
}, 'Thursday must not borrow Friday or the main weekly team');
for (const date of ['2026-10-25', '2026-11-02', '2027-10-19']) {
    assert.equal(DailyDuty.stateForDays(days, date), null,
        `the one-week assignment must expire instead of recurring on ${date}`);
}
assert.equal(JSON.stringify(days), before, 'reading the daily state must not modify the source schedule');

assert.equal(BuildSite.isPublishable('home-daily-duty.js', BuildSite.readConfig()), false,
    'the source renderer is inlined by the build instead of published as another asset');
assert.equal(JSON.parse(read('performance/sw-shell.json')).assets.includes('/home-daily-duty.js'), false,
    'the inlined renderer must not increase the homepage service-worker request count');
const home = read('index.html');
const script = home.match(/<script\b[^>]*\bdata-home-daily-duty(?:="[^"]*")?[^>]*>[\s\S]*?<\/script>/);
assert.ok(script, 'the homepage must provide the build placeholder for the daily renderer');
assert.doesNotMatch(script[0], /\b(?:async|defer)\b/,
    'the renderer must run before a stalled external script can delay DOMContentLoaded');
assert.ok(home.indexOf('id="homeDailyDuty"') < script.index);
assert.ok(home.indexOf('id="homeExtraDutyDays"') < script.index);
const firebasePosition = home.indexOf('src="https://www.gstatic.com/firebasejs/');
assert.ok(firebasePosition > script.index, 'public daily duty must render before external Firebase scripts');

if (process.env.ALMANION_TEST_SITE) {
    const site = path.resolve(process.env.ALMANION_TEST_SITE);
    const builtHome = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
    const template = builtHome.match(/<template\b[^>]*\bid="homeExtraDutyDays"[^>]*>([\s\S]*?)<\/template>/);
    assert.ok(template, 'the built homepage must contain its offline daily schedule');
    assert.equal(template[1].trim().replace(/\r\n/g, '\n'), canonical[0].trim().replace(/\r\n/g, '\n'),
        'the build must copy the canonical schedule instead of maintaining a second list of names');
    const inline = builtHome.match(/<script\b[^>]*\bdata-home-daily-duty(?:="[^"]*")?[^>]*>([\s\S]*?)<\/script>/);
    assert.ok(inline, 'the built homepage must contain the inline daily renderer');
    assert.equal(inline[1].trim().replace(/\r\n/g, '\n'), read('home-daily-duty.js').trim().replace(/\r\n/g, '\n'),
        'the cached homepage must contain the source renderer without a second network request');
    assert.equal(fs.existsSync(path.join(site, 'home-daily-duty.js')), false);
}

console.log('home daily duty: all tests passed');
