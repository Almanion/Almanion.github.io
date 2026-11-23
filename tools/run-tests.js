#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function compareNames(left, right) {
    return left === right ? 0 : (left < right ? -1 : 1);
}

function listTests(root, suite = 'all') {
    const testsRoot = path.join(root, 'tests');
    if (suite === 'appearance') {
        return ['signal-ci-scope', 'site-branding', 'favicon-theme', 'theme-bootstrap', 'star-waves',
            'game-integration', 'performance-budget', 'service-worker-resilience']
            .map(name => path.join('tests', name + '.test.js'));
    }
    return fs.readdirSync(testsRoot, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.test.js'))
        .filter(entry => !['content', 'reader', 'web'].includes(suite) || entry.name === 'signal-ci-scope.test.js' || !/^(?:game[.-]|orbital-|signal-)/.test(entry.name))
        .map(entry => path.join('tests', entry.name))
        .sort(compareNames);
}

function run(root, options = {}) {
    const tests = listTests(root, process.env.ALMANION_TEST_SUITE);
    if (!tests.length) throw new Error('No tests/*.test.js files were found.');

    let failures = 0;
    for (const test of tests) {
        process.stdout.write(`\n[test] ${test}\n`);
        const result = spawnSync(process.execPath, [test], {
            cwd: root,
            env: { ...process.env, ...(options.site ? { ALMANION_TEST_SITE: options.site } : {}) },
            stdio: 'inherit'
        });
        if (result.error) throw result.error;
        if (result.status !== 0) failures += 1;
    }

    if (failures) {
        throw new Error(`${failures} of ${tests.length} test files failed.`);
    }
    process.stdout.write(`\nAll ${tests.length} test files passed.\n`);
    return tests;
}

if (require.main === module) {
    try {
        run(path.resolve(__dirname, '..'));
    } catch (error) {
        console.error(error && error.stack || error);
        process.exitCode = 1;
    }
}

module.exports = { listTests, run };
