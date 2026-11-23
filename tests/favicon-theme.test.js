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
    localStorage: { getItem: () => storedSettings },
    MutationObserver: class {
        constructor(callback) { mutationCallback = callback; }
        observe() {}
    }
};
context.window = {
    addEventListener: (name, callback) => listeners.set(name, callback)
};
let storedSettings = null;

vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'favicon-theme.js'), 'utf8'),
    context,
    { filename: 'favicon-theme.js' }
);

assert.strictEqual(link.dataset.appliedFaviconTheme, 'light');
assert.strictEqual(linkAttributes.href, 'favicons/favicon-ph.svg?v=20261123-soft-book');

classes.add('exp-dark');
mutationCallback();
assert.strictEqual(link.dataset.appliedFaviconTheme, 'dark');
assert.strictEqual(linkAttributes.href, 'favicons/favicon-ph-dark.svg?v=20261123-soft-book');

function expectIcon(suffix) {
    assert.equal(linkAttributes.href, 'favicons/favicon-ph' + suffix + '.svg?v=20261123-soft-book');
}
const root = context.document.documentElement.dataset;
root.exp = 'graphite-dark';
mutationCallback();
expectIcon('-graphite-dark');
root.exp = 'graphite-light';
mutationCallback();
expectIcon('-graphite');
root.exp = 'sepia-light';
mutationCallback();
expectIcon('');
delete root.exp;

classes.delete('experimental');
classes.delete('exp-dark');
classes.add('midnight-theme');
mutationCallback();
assert.strictEqual(link.dataset.appliedFaviconTheme, 'dark');

classes.delete('midnight-theme');
mutationCallback();
assert.strictEqual(link.dataset.appliedFaviconTheme, 'light');
assert.strictEqual(linkAttributes.href, 'favicons/favicon-ph.svg?v=20261123-soft-book');

// An open subject tab receives a palette change made on the homepage.
root.exp = 'prism-light';
storedSettings = JSON.stringify({ expMode: 'graphite', expTheme: 'light' });
listeners.get('storage')({ key: 'siteSettings' });
expectIcon('-graphite');
delete root.exp;
// Standalone pages share the palette but can have their own tone.
link.dataset.faviconTone = 'dark';
listeners.get('pageshow')();
expectIcon('-graphite-dark');
storedSettings = JSON.stringify({ expMode: 'prism', expTheme: 'light' });
listeners.get('storage')({ key: 'siteSettings' });
expectIcon('-dark');

assert.ok(listeners.has('storage'));
assert.ok(listeners.has('pageshow'));
console.log('adaptive favicon theme: all tests passed');
