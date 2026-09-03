'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(require.resolve('../apps-script.gs'), 'utf8');
const context = { console };
vm.createContext(context);
vm.runInContext(source, context);

assert.strictEqual(context.isAllowedNotePath('content/physics/manifest.json', 'physics', 'waves'), true);
assert.strictEqual(context.isAllowedNotePath('content/physics/sections/waves.json', 'physics', 'waves'), true);
assert.strictEqual(context.isAllowedNotePath('images/notes/physics/123-waves.webp', 'physics', 'waves'), true);
assert.strictEqual(context.isAllowedNotePath('content/physics/sections/other.json', 'physics', 'waves'), false);
assert.strictEqual(context.isAllowedNotePath('../firebase-config.js', 'physics', 'waves'), false);
assert.strictEqual(context.isAllowedNotePath('images/notes/math/secret.png', 'physics', 'waves'), false);

console.log('apps script note publisher paths: all tests passed');
