'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'page-transitions.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles', 'page-transitions.css'), 'utf8');
const pageListeners = new Map();
const rootClasses = new Set();
let assignedUrl = '';
let prevented = false;

const context = {
    URL,
    Set,
    localStorage: { getItem: () => JSON.stringify({ animationLevel: 'max' }) },
    sessionStorage: {
        values: new Map(),
        getItem(key) { return this.values.get(key) || null; },
        setItem(key, value) { this.values.set(key, value); },
        removeItem(key) { this.values.delete(key); }
    },
    document: {
        readyState: 'complete',
        documentElement: {
            classList: {
                add: name => rootClasses.add(name),
                remove: name => rootClasses.delete(name),
                toggle: (name, enabled) => enabled ? rootClasses.add(name) : rootClasses.delete(name)
            },
            setAttribute() {},
            removeAttribute() {}
        },
        addEventListener: (name, callback) => pageListeners.set(name, callback)
    }
};
context.window = {
    location: {
        href: 'https://almanion.github.io/index.html',
        origin: 'https://almanion.github.io',
        pathname: '/index.html',
        search: '',
        assign: url => { assignedUrl = url; }
    },
    matchMedia: () => ({ matches: false }),
    setTimeout: callback => { callback(); return 1; },
    addEventListener: (name, callback) => pageListeners.set('window:' + name, callback)
};

vm.runInNewContext(source, context, { filename: 'page-transitions.js' });

const link = {
    href: 'https://almanion.github.io/physics.html',
    target: '',
    hasAttribute: () => false
};
pageListeners.get('click')({
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: { closest: () => link },
    preventDefault: () => { prevented = true; }
});

assert.strictEqual(prevented, true);
assert.strictEqual(assignedUrl, link.href);
assert.ok(rootClasses.has('site-page-leaving'));
assert.ok(css.includes('@view-transition'));
assert.ok(css.includes('prefers-reduced-motion: reduce'));

const transitionPages = [
    'index.html', 'physics.html', 'physics-10.html', 'physics-exam.html',
    'chemistry.html', 'chemistry-10.html', 'math.html', 'geometry.html',
    'geometry-formulas.html', 'likbez.html', 'literature-10.html', 'matcenter.html'
];
transitionPages.forEach(file => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(html.includes('styles/page-transitions.css'), file + ': transition stylesheet is missing');
    assert.ok(html.includes('page-transitions.js'), file + ': transition script is missing');
});

console.log('cross-page transitions: all tests passed');
