'use strict';
const assert = require('node:assert/strict');
const Home = require('../home-dashboard');
const Stars = require('../home-stars');
const Definitions = require('../selection-definitions');
require('../duty');
const duty = global.AlmanionDuty;
const entries = duty.normalizeSchedule(duty.DEFAULT_SCHEDULE).entries;
assert.equal(Home.surnames(['Полина Лубневская', 'Марина Устинова']), 'Лубневская, Устинова');
assert.equal(Home.surnames(['Гоша Шкурихин', 'Вова Дубейко', 'Саша Свердлов']), 'Шкурихин, Дубейко, Свердлов');
assert.equal(Home.surnames(['Балуев Михаил Романович', 'Выровщиков Никита Юрьевич']), 'Балуев, Выровщиков');
assert.equal(Home.schoolDate(new Date('2026-10-11T22:05:00Z')), '2026-10-12', 'dates use the school timezone');
const friday = Home.weekDuty(duty, entries, '2026-10-09');
assert.equal(Home.weekDuty(duty, entries, '2026-10-11').id, friday.id, 'Sunday retains the ending week, never the following pair');
assert.equal(Home.weekDuty(duty, entries, '2026-11-01'), null, 'a holiday gap must not announce a future pair as current');
assert.equal(Home.weekDuty(duty, entries, '2027-06-01'), null, 'finished schedules must not retain the last team');
for (const [w, h] of [[320,568], [390,844], [1440,900], [4000,2200]]) {
    const stars = Stars.createStars(w, h, () => .5);
    assert.ok(stars.length >= 12 && stars.length <= 64);
    assert.ok(stars.every(star => star.u > 0 && star.u < 1 && star.v > 0 && star.v < 1));
}
assert.equal(Stars.influence(300, 300, { active: true, x: 0, y: 0 }, 150).glow, 0);
assert.ok(Stars.influence(15, 0, { active: true, x: 0, y: 0 }, 150).x > 0, 'stars gently move away from the pointer');
assert.deepEqual(Stars.influence(15, 0, { active: false }, 150), { x: 0, y: 0, glow: 0 });

(async () => {
    const data = { schemaVersion: 1, version: 'fixture', entries: [{ term: 'Эллипс', html: '<strong>Эллипс</strong> — кривая.', page: 'geometry.html', subject: 'Геометрия', id: 'ellipse' }] };
    const storage = new Map();
    const calls = [];
    const win = {
        location: { href: 'https://example.test/physics-10.html' },
        setTimeout, clearTimeout,
        // Intentionally no AbortSignal.timeout and no AbortController.
        localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
        fetch: async (url, options) => {
            calls.push({ url, options });
            return calls.length === 1 ? { ok: false } : { ok: true, json: async () => data };
        }
    };
    const loader = Definitions.createIndexLoader(win);
    const [a, b] = await Promise.all([loader.load(), loader.load()]);
    assert.deepEqual(a, data.entries); assert.deepEqual(b, data.entries);
    assert.equal(calls.length, 2, 'parallel selections share one bounded retry');
    assert.match(calls[1].url, /publication=definitions/);
    assert.equal(calls[1].options.cache, 'reload');
    assert.ok(storage.has(Definitions.INDEX_CACHE_KEY));
    const offline = Definitions.createIndexLoader({ ...win, fetch: async () => { throw new Error('Offline'); } });
    assert.deepEqual(await offline.load(), data.entries, 'a saved public dictionary remains available on another page while offline');
    assert.equal(Definitions.validateIndex({ ...data, entries: data.entries.concat({ ...data.entries[0], page: 'english.html' }) }).length, 1, 'private pages must not enter the public cache');
    const timeout = Definitions.createIndexLoader({ ...win,
        localStorage: { getItem: () => null }, fetch: () => new Promise(() => {}),
        setTimeout: (fn, ms) => setTimeout(fn, ms >= 10000 ? 5 : 0)
    });
    await assert.rejects(timeout.load(), /timed out/, 'a stalled fetch is bounded even without AbortController');
    console.log('home duty/weekends, sparse star physics and resilient definition loading passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
