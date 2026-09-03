const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'matcenter', '30-data.js'), 'utf8');

function createContext(cachedTasks, loader) {
    const sandbox = {
        TASKS_ENDPOINTS: ['main', 'summer'],
        TASKS_CACHE_KEY: 'matcenter_tasks_cache',
        DEFAULT_GRADE: 'grade-9',
        GRADE_SECTIONS: [
            { id: 'grade-9' },
            { id: 'grade-summer-9-10' },
            { id: 'grade-10' },
            { id: 'grade-summer-10-11' },
            { id: 'grade-11' }
        ],
        safeGet: () => JSON.stringify({ version: 2, tasks: cachedTasks }),
        console: { log() {}, warn() {}, error() {} },
        Map,
        Set,
        Promise,
        JSON,
        Number,
        String,
        Object,
        Array
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'matcenter/30-data.js' });
    sandbox.endpointLoader = loader;
    vm.runInContext('loadFromOneEndpoint = endpointLoader;', sandbox);
    return sandbox;
}

async function run() {
    const cachedMain = { number: 1, numberText: '1', grade: 'grade-9', _endpointIdx: 0 };
    const cachedSummer = { number: 10, numberText: '10', grade: 'grade-summer-9-10', _endpointIdx: 1 };
    const freshSummer = { number: 11, numberText: '11', grade: 'grade-summer-9-10', _endpointIdx: 1 };

    const partialFailure = createContext([cachedMain, cachedSummer], async (_endpoint, idx) => {
        if (idx === 0) throw new Error('temporary failure');
        return { tasks: [freshSummer], isAdmin: false };
    });
    const recovered = await vm.runInContext('loadFromAppsScript()', partialFailure);
    assert.deepEqual(
        Array.from(recovered.tasks, task => `${task._endpointIdx}:${task.number}`),
        ['0:1', '1:11']
    );
    assert.equal(recovered.failures.length, 1);
    assert.equal(recovered.failures[0].endpointIdx, 0);
    assert.equal(recovered.failures[0].usedCache, true);

    const unexpectedEmpty = createContext([cachedMain, cachedSummer], async (_endpoint, idx) => ({
        tasks: idx === 0 ? [] : [freshSummer],
        isAdmin: false
    }));
    const preserved = await vm.runInContext('loadFromAppsScript()', unexpectedEmpty);
    assert.deepEqual(
        Array.from(preserved.tasks, task => `${task._endpointIdx}:${task.number}`),
        ['0:1', '1:11']
    );
    assert.equal(preserved.failures.length, 1);
    assert.equal(preserved.failures[0].usedCache, true);

    assert.equal(
        vm.runInContext("normalizeMatcenterGrade('9 класс', 0)", unexpectedEmpty),
        'grade-9'
    );
    assert.equal(
        vm.runInContext("normalizeMatcenterGrade('лето 9—10', 0)", unexpectedEmpty),
        'grade-summer-9-10'
    );
    assert.equal(
        vm.runInContext("normalizeMatcenterGrade('', 1)", unexpectedEmpty),
        'grade-summer-9-10'
    );

    console.log('matcenter data fallback: all tests passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
