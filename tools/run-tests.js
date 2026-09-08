#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function compareNames(left, right) {
    return left === right ? 0 : (left < right ? -1 : 1);
}

function listTests(root) {
    const testsRoot = path.join(root, 'tests');
    return fs.readdirSync(testsRoot, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.test.js'))
        .map(entry => path.join('tests', entry.name))
        .sort(compareNames);
}

function run(root) {
    const tests = listTests(root);
    if (!tests.length) throw new Error('No tests/*.test.js files were found.');

    let failures = 0;
    for (const test of tests) {
        process.stdout.write(`\n[test] ${test}\n`);
        const result = spawnSync(process.execPath, [test], {
            cwd: root,
            env: process.env,
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
