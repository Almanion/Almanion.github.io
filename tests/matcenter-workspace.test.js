'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('../matcenter/35-workspace-model.js');
const root = path.join(__dirname, '..', 'matcenter');
const legacy = { number: 12, numberText: '12', grade: 'grade-9', sourceSheet: '2025-2026',
    description: 'Найдите радиусы окружностей. Даны две окружности.', hint: 'Есть ещё 112 вариантов.', status: 'Н' };
assert.equal(model.series(legacy), null);
assert.deepEqual(model.seriesList([legacy], 'grade-9'), []);
assert.equal(model.initialGrade(null, null), 'grade-10');
assert.equal(model.initialGrade(null, '9'), 'grade-9');
assert.equal(model.initialGrade('grade-summer-9-10', '10'), 'grade-summer-9-10');
assert.equal(model.date('31.02.2026'), '');
assert.equal(model.date('26.09.2026'), '2026-09-26');
const future = { ...legacy, grade: 'grade-10', seriesId: '2026-01', seriesTitle: 'Геометрия', seriesDate: '26.09.2026', academicYear: '2026/2027' };
assert.deepEqual(model.series(future), { id: '2026-01', title: 'Геометрия', date: '2026-09-26', year: '2026/2027' });
const next = { ...future, seriesId: '2026-02', seriesDate: '30.09.2026' };
assert.notEqual(model.identity(future), model.identity(next));
assert.notEqual(model.identity(future), model.identity({ ...future, _endpointIdx: 1 }));
assert.equal(model.seriesList([legacy, future, next], 'grade-10')[0].id, '2026-02');
assert.equal(model.series({ ...future, seriesId: '../bad' }), null);
for (const q of ['12', '№ 12', '#12', 'задача 12', 'окружность', 'РАДИУС', '"две окружности"']) assert.equal(model.matches(legacy, q), true, q);
for (const q of ['112', '1', '"окружности две"', 'треугольник']) assert.equal(model.matches(legacy, q), false, q);
assert.equal(model.matches({ ...legacy, description: 'Ёлка' }, 'елка'), true);
legacy.description = 'Изменённое условие';
assert.equal(model.matches(legacy, 'окружность'), false, 'search index updates with content');

const sandbox = { MatcenterWorkspaceModel: model, window: {}, currentGrade: 'grade-10', DEFAULT_GRADE: 'grade-10',
    GRADE_SECTIONS: ['grade-9','grade-10','grade-11','grade-summer-9-10','grade-summer-10-11'].map(id => ({id})),
    console, personalSolvedMap: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, '30-data.js'), 'utf8'), sandbox);
assert.equal(sandbox.normalizeMatcenterGrade('', 0), 'grade-9', 'UI default must not reclassify legacy data');
vm.runInContext(fs.readFileSync(path.join(root, '40-personal-progress.js'), 'utf8'), sandbox);
assert.equal(sandbox.getSolvedTaskKey(legacy), 'grade-9__12');
const keys = [sandbox.getSolvedTaskKey(future), sandbox.getSolvedTaskKey(next)];
assert.notEqual(keys[0], keys[1]);
keys.forEach(key => assert.doesNotMatch(key, /[.#$\[\]/]/));
sandbox.getTasksForCurrentGrade = () => [future, next];
sandbox.getSelectedMatcenterSeries = () => ({ tasks: [future] });
sandbox.personalSolvedMap[keys[0]] = { solved: true };
assert.equal(sandbox.buildSolvedTasksSharePayload().total, 1, 'share respects selected series');
assert.equal(sandbox.buildSolvedTasksSharePayload().count, 1);
console.log('matcenter workspace: all tests passed');
