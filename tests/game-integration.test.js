'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const gamePath = path.join(root, 'games', 'orbital-courier', 'index.html');
const licensePath = path.join(root, 'games', 'orbital-courier', 'LICENSE.txt');
const game = fs.readFileSync(gamePath);

assert.match(home, /href="games\/orbital-courier\/"[^>]*class="home-editor-link home-game-link"/,
    'the home page must expose the game button');
assert.strictEqual(game.toString('utf8'), require('../tools/build-game.js').bundle(),
    'the published standalone game must match its canonical sources exactly');
assert.match(game.toString('utf8'), /ORBITAL COURIER \/ 10\.0/);
assert.match(game.toString('utf8'), /SAVE_KEY='orbital-courier-save-v8'/,
    'upgrading the game must retain the existing save storage key');
assert.doesNotMatch(game.toString('utf8'), /<script[^>]+src=["']https?:/i);
const builder = require('../tools/build-site.js');
const config = builder.readConfig();
assert.equal(builder.isPublishable('game-source/orbital-courier/index.html', config), false,
    'source packages and historical development documents must not become public site pages');
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
