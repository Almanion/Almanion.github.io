'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Build = require('../tools/build-site');

const root = process.env.ALMANION_TEST_SITE || path.resolve('.');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const config = Build.readConfig();
const files = process.env.ALMANION_TEST_SITE ? Build.walkFiles(root) : Build.trackedFiles(root).filter(file => Build.isPublishable(file, config));
for (const file of files) {
    if (/\.(html|js|json|css|svg|xml|txt|webmanifest)$/i.test(file)) {
        assert.doesNotMatch(read(file), /альманион/iu, file + ': use the Almanion spelling');
    }
}

// Inline copies paint before scripts run and also work when opening the HTML from disk.
const mark = read('favicons/app-icon.svg').match(/<path\b[^>]*\sd="([^"]+)"/)[1];
const pages = JSON.parse(read('content/subjects.json')).map(subject => subject.page);
for (const file of [
    ...pages, 'index.html', 'geometry-formulas.html', 'physics-exam.html', 'english.html', 'matcenter.html',
    'admin.html', 'constructor.html', 'contests.html', 'duty-10-1.html', 'tour-10-1.html', 'homework.html',
    'planner.html', 'sport.html', 'games/index.html', 'watch/index.html', 'watch/connect.html', 'offline.html',
    'favicons/favicon.svg', 'favicons/favicon-dark.svg'
]) {
    assert.ok(read(file).includes('d="' + mark + '"'), file + ': use the Almanion app mark');
}
const catalog = read('games/index.html');
assert.match(catalog, /signal-frontier\/\?renderer=canvas/);
assert.match(catalog, /signal-frontier\/\?renderer=babylon/);
console.log('PASS Almanion name and mark on public pages; both Signal Frontier editions are linked');
