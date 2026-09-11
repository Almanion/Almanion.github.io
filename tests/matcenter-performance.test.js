'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

async function run() {
    const cacheSource = read('matcenter/25-cache.js');
    const sandbox = { setTimeout, clearTimeout, Promise, Object, Array };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(cacheSource, sandbox, { filename: 'matcenter/25-cache.js' });
    assert.equal(sandbox.MatcenterTaskCache.supported(), false);
    assert.equal(await sandbox.MatcenterTaskCache.read(3), null);
    assert.equal(await sandbox.MatcenterTaskCache.write({ version: 3, tasks: [] }), false);

    const html = read('matcenter.html');
    const coreAt = html.indexOf('matcenter/00-core.js?v=20260911-2');
    const cacheAt = html.indexOf('matcenter/25-cache.js?v=20260911-1');
    const dataAt = html.indexOf('matcenter/30-data.js?v=20260911-1');
    const renderAt = html.indexOf('matcenter/50-render.js?v=20260911-2');
    assert.ok(coreAt >= 0 && coreAt < renderAt, 'core LaTeX renderer must load before task cards');
    assert.ok(cacheAt >= 0 && cacheAt < dataAt, 'persistent cache must load before the data module');
    assert.match(html, /<script defer src="matcenter\/runtime\.js\?v=20260911-2"><\/script>/);
    assert.doesNotMatch(html, /<script[^>]+src="matcenter\/70-hints\.js/);
    assert.doesNotMatch(html, /<script[^>]+src="firebase-analytics\.js/);
    assert.doesNotMatch(html, /<script[^>]+src="newyear\.js/);
    assert.doesNotMatch(html, /<script[^>]+src="settings\.js/);

    const runtime = read('matcenter/runtime.js');
    for (const feature of ['hints', 'settings', 'analytics', 'newyear']) {
        assert.match(runtime, new RegExp(`${feature}:`), `${feature} must remain available on demand`);
    }
    assert.match(runtime, /requestIdleCallback/);

    const core = read('matcenter/00-core.js');
    const hints = read('matcenter/70-hints.js');
    assert.match(core, /function renderLatexInElement\(/, 'LaTeX rendering must be part of the critical Matcenter runtime');
    assert.match(core, /latexPending/);
    assert.match(core, /latexRendered/);
    assert.doesNotMatch(hints, /function renderLatexInElement\(/, 'the lazy hint editor must reuse the core renderer');

    const data = read('matcenter/30-data.js');
    assert.match(data, /matcenterTasksLoadController\.abort\(\)/);
    assert.match(data, /loadSequence !== matcenterTasksLoadSequence/);
    assert.match(data, /hydrateTasksCacheFromIndexedDb/);
    assert.match(data, /MatcenterTaskCache/);

    console.log('matcenter performance: all assertions passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
