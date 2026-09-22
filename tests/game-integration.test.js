'use strict';

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const gamePath = path.join(root, 'games', 'orbital-courier', 'index.html');
const licensePath = path.join(root, 'games', 'orbital-courier', 'LICENSE.txt');
const game = fs.readFileSync(gamePath);

assert.match(home, /href="games\/orbital-courier\/"[^>]*class="home-editor-link home-game-link"/,
    'the home page must expose the game button');
assert.strictEqual(
    crypto.createHash('sha256').update(game).digest('hex'),
    '123505d97237b93039b986c3abb9864061172305ca2be5f01810935e71375f02',
    'the published game must remain byte-for-byte identical to the supplied standalone build'
);
assert.ok(fs.existsSync(licensePath), 'the bundled MIT license must be published with the game');

console.log('orbital courier integration: all tests passed');
