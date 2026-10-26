'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const gamePath = path.join(root, 'games', 'orbital-courier', 'index.html');
const licensePath = path.join(root, 'games', 'orbital-courier', 'LICENSE.txt');
const game = fs.readFileSync(gamePath);
const GameBuild = require('../tools/build-game.js');
const portable = fs.readFileSync(path.join(root, 'games', 'orbital-courier', 'offline.html'), 'utf8');

assert.match(home, /href="games\/"[^>]*class="home-editor-link home-game-link"/,
    'the home page must expose the game button');
assert.strictEqual(portable, GameBuild.bundle(),
    'the downloadable standalone game must match its canonical sources exactly');
const releaseVersion = require('../game-source/orbital-courier/package.json').version.split('.').slice(0, 2).join('.');
assert.ok(portable.includes('ORBITAL COURIER / ' + releaseVersion));
assert.match(portable, /SAVE_KEY='orbital-courier-save-v8'/,
    'upgrading the game must retain the existing save storage key');
assert.doesNotMatch(portable, /<script[^>]+src=/i,
    'the portable HTML must retain every runtime dependency inline');
assert.doesNotMatch(portable, /data-game-navigation="pages"/,
    'opening the portable document must keep its local screens');
const outputs = GameBuild.onlineFiles();
assert.equal(Object.keys(GameBuild.pages).length, 5);
const titles = new Set();
for (const [file, expected] of Object.entries(outputs)) {
    assert.equal(fs.readFileSync(path.join(root, 'games', 'orbital-courier', file), 'utf8'), expected,
        'online page/shared asset must be generated from canonical sources: ' + file);
}
for (const [page, definition] of Object.entries(GameBuild.pages)) {
    const html = outputs[definition.directory + 'index.html'];
    assert.match(html, new RegExp('data-game-entry="' + page + '"'));
    assert.match(html, new RegExp('<section class="screen active"[^>]*id="' + page + '"'));
    assert.match(html, /<a[^>]*data-action="nav"[^>]*href=/,
        'online navigation must expose native links before JavaScript runs');
    assert.doesNotMatch(html, /(?:href|src)="src\//);
    assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i);
    for (const match of html.matchAll(/(?:href|src)="[^\"]*assets\/([^?\"]+)\?v=([a-f0-9]+)"/g)) {
        const digest = require('node:crypto').createHash('sha256').update(outputs['assets/' + match[1]]).digest('hex').slice(0, 16);
        assert.equal(match[2], digest, 'shared assets must bypass stale worker caches when their content changes');
    }
    titles.add(html.match(/<title>(.*?)<\/title>/)[1]);
}
assert.equal(titles.size, 5, 'each real page has its own document title');
assert.match(game.toString('utf8'), /href="\.\/offline\.html" download=/,
    'the game home exposes its standalone download');
const builder = require('../tools/build-site.js');
const config = builder.readConfig();
assert.equal(builder.isPublishable('game-source/orbital-courier/index.html', config), false,
    'source packages and historical development documents must not become public site pages');
for (const file of Object.keys(outputs)) {
    assert.equal(builder.isPublishable('games/orbital-courier/' + file, config), true,
        'the site build must include every page and shared runtime asset: ' + file);
}
const budgets = require('../performance/budgets.json');
for (const directory of budgets.excludedSourceDirectories || []) {
    assert.ok(config.deniedPaths.includes(directory),
        'performance exclusions must remain explicitly denied by the public site builder');
}
for (const file of ['Инструкция.html', 'Экономика.html']) {
    assert.ok(fs.existsSync(path.join(root, 'games', 'orbital-courier', file)));
}
assert.ok(fs.existsSync(licensePath), 'the bundled MIT license must be published with the game');

console.log('orbital courier integration: all tests passed');
