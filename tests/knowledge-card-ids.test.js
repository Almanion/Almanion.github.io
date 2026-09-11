'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

const root = path.join(__dirname, '..');
const pages = [
    'physics.html', 'chemistry.html', 'math.html', 'geometry.html', 'likbez.html',
    'physics-10.html', 'chemistry-10.html', 'literature-10.html'
];

pages.forEach(function (page) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const ids = Array.from(html.matchAll(/\bdata-kc-id=["']([^"']+)["']/g), match => match[1]);
    assert.equal(new Set(ids).size, ids.length, page + ' contains duplicate knowledge-card IDs');
});

const result = childProcess.spawnSync(process.execPath, ['tools/assign-kc-ids.js', '--check'], {
    cwd: root,
    encoding: 'utf8'
});
assert.equal(result.status, 0, result.stderr || result.stdout || 'stable ID check failed');

console.log('stable knowledge-card identities: all tests passed');
