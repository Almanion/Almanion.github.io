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

const logo = 'images/almanion-wordmark.svg';
const { buildFavicons } = require('../tools/build-favicons');
for (const [name, expected] of Object.entries(buildFavicons())) {
    assert.equal(read('favicons/' + name).replace(/\r\n/g, '\n'), expected, name + ': regenerate from the current artwork');
}
const pages = JSON.parse(read('content/subjects.json')).map(subject => subject.page);
for (const file of [
    ...pages, 'index.html', 'geometry-formulas.html', 'physics-exam.html', 'english.html', 'matcenter.html',
    'admin.html', 'constructor.html', 'contests.html', 'duty-10-1.html', 'tour-10-1.html', 'homework.html',
    'planner.html', 'sport.html', 'games/index.html', 'watch/index.html', 'watch/connect.html', 'offline.html'
]) {
    const relative = path.posix.relative(path.posix.dirname(file), logo);
    const images = read(file).match(/<img\b[^>]+>/g) || [];
    assert.equal(images.filter(tag => tag.includes('src="' + relative + '?v=20261123-soft-book"') && tag.includes('alt="Almanion"')).length, 1, file);
}
const catalog = read('games/index.html');
assert.match(catalog, /signal-frontier\/\?renderer=canvas/);
assert.match(catalog, /signal-frontier\/\?renderer=babylon/);
console.log('PASS Almanion name and mark on public pages; both Signal Frontier editions are linked');
