'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const classes = new Set(['experimental', 'exp-prism']);
const linkAttributes = { href: 'favicons/favicon-ph.svg?v=old' };
const listeners = new Map();
let mutationCallback = null;

const link = {
    dataset: {},
    getAttribute: name => linkAttributes[name] || null,
    setAttribute: (name, value) => { linkAttributes[name] = value; }
};

const context = {
    document: {
        readyState: 'complete',
        body: { classList: { contains: name => classes.has(name) } },
        documentElement: { dataset: {} },
        querySelector: selector => selector.includes('link') ? link : null
    },
    localStorage: { getItem: () => null },
    MutationObserver: class {
        constructor(callback) { mutationCallback = callback; }
        observe() {}
    }
};
context.window = {
    addEventListener: (name, callback) => listeners.set(name, callback)
};

vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'favicon-theme.js'), 'utf8'),
    context,
    { filename: 'favicon-theme.js' }
);

assert.strictEqual(link.dataset.appliedFaviconTheme, 'light');
assert.strictEqual(linkAttributes.href, 'favicons/favicon-ph.svg?v=20260905-2');

classes.add('exp-dark');
mutationCallback();
assert.strictEqual(link.dataset.appliedFaviconTheme, 'dark');
assert.strictEqual(linkAttributes.href, 'favicons/favicon-ph-dark.svg?v=20260905-2');

classes.delete('experimental');
classes.delete('exp-dark');
classes.add('midnight-theme');
mutationCallback();
assert.strictEqual(link.dataset.appliedFaviconTheme, 'dark');

classes.delete('midnight-theme');
mutationCallback();
assert.strictEqual(link.dataset.appliedFaviconTheme, 'light');
assert.strictEqual(linkAttributes.href, 'favicons/favicon-ph.svg?v=20260905-2');

assert.ok(listeners.has('storage'));
assert.ok(listeners.has('pageshow'));
console.log('adaptive favicon theme: all tests passed');
