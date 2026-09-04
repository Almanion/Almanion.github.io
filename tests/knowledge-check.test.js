const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'knowledge-check.js'), 'utf8');
const DAY = 86400000;

function loadScheduler(initialStore = {}, pathname = '/test.html') {
    const window = {
        safeStorageGet: () => JSON.stringify(initialStore),
        safeStorageSet: () => true,
        addEventListener: () => {},
        dispatchEvent: () => {},
        KC: {}
    };
    const sandbox = {
        window,
        location: { pathname },
        document: {
            readyState: 'loading',
            addEventListener: () => {},
            querySelectorAll: () => [],
            createElement: () => ({ textContent: '', innerHTML: '' })
        },
        CustomEvent: function CustomEvent() {},
        console,
        Date,
        Math,
        JSON,
        Map,
        Set,
        Object,
        Array,
        Number,
        String
    };
    vm.runInNewContext(source, sandbox, { filename: 'knowledge-check.js' });
    return window.__kcFSRS;
}

const now = Date.UTC(2026, 8, 2, 12, 0, 0);
const scheduler = loadScheduler();

// В обычных конспектах остаются карточки определений, а «Ликбезы» дополнительно
// проверяют именно формулировки теорем, лемм, утверждений и следствий.
assert.deepEqual(
    Array.from(scheduler.studyProfile().types, type => type.kind),
    ['definition']
);
const likbezScheduler = loadScheduler({}, '/likbez.html');
assert.deepEqual(
    Array.from(likbezScheduler.studyProfile().types, type => type.kind),
    ['definition', 'theorem', 'lemma', 'statement', 'corollary']
);
assert.match(likbezScheduler.studyProfile().subtitle, /теоремы/i);

// В точке stability вероятность воспоминания должна быть целевыми 90%.
const stable = { v: 2, phase: 'review', stability: 10, difficulty: 5, last: now - 10 * DAY, due: now, reps: 8, lapses: 1, step: 8 };
assert.ok(Math.abs(scheduler.retrievability(stable, now) - 0.9) < 1e-10);

// Новые карточки получают короткие шаги только после неуверенного ответа.
assert.equal(Math.round(scheduler.project(null, 1, now).intervalDays * 1440), 1);
assert.equal(Math.round(scheduler.project(null, 2, now).intervalDays * 1440), 8);
assert.equal(scheduler.project(null, 3, now).intervalDays, 1);
assert.equal(scheduler.project(null, 4, now).intervalDays, 4);

// Миграция старого формата сохраняет срок и историю.
const legacy = { step: 9, due: now + 3 * DAY, last: now, reps: 12, lapses: 2, learning: false };
const migrated = scheduler.normalizeState(legacy);
assert.equal(migrated.due, legacy.due);
assert.equal(migrated.reps, legacy.reps);
assert.equal(migrated.lapses, legacy.lapses);
assert.equal(migrated.phase, 'review');
assert.ok(migrated.stability >= 3);

// Для одного состояния интервалы упорядочены, забывание переводит в переучивание.
const hard = scheduler.project(stable, 2, now);
const good = scheduler.project(stable, 3, now);
const easy = scheduler.project(stable, 4, now);
const again = scheduler.project(stable, 1, now);
assert.ok(hard.intervalDays < good.intervalDays);
assert.ok(good.intervalDays < easy.intervalDays);
assert.equal(again.phase, 'relearning');
assert.equal(Math.round(again.intervalDays * 1440), 2);
assert.ok(again.stability < stable.stability);
assert.equal(scheduler.project(again, 3, now + 3 * 60000).phase, 'review');

// Без долга алгоритм рекомендует не больше восьми новых карточек.
const freshCards = Array.from({ length: 20 }, (_, i) => ({ id: 'new-' + i, topicId: 't' + (i % 3) }));
const freshPlan = scheduler.buildRecommendation(freshCards, now);
assert.equal(freshPlan.queue.length, 8);
assert.equal(freshPlan.newCount, 8);

// Большой долг ограничивается короткой сессией; новые слова не добавляются.
const backlogStore = {};
const backlogCards = Array.from({ length: 40 }, (_, i) => {
    const id = 'due-' + i;
    backlogStore[id] = { v: 2, step: 8, phase: 'review', stability: 3, difficulty: 5, last: now - 8 * DAY, due: now - DAY, reps: 5, lapses: 1 };
    return { id, topicId: 't' + (i % 4) };
});
const backlogScheduler = loadScheduler(backlogStore);
const backlogPlan = backlogScheduler.buildRecommendation(backlogCards.concat(freshCards), now);
assert.equal(backlogPlan.queue.length, 30);
assert.equal(backlogPlan.reviewCount, 30);
assert.equal(backlogPlan.newCount, 0);
assert.equal(backlogPlan.deferred, 10);

console.log('knowledge-check scheduler: all tests passed');
