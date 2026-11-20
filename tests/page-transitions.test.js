'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'page-transitions.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles/page-transitions.css'), 'utf8');
const location = new URL('https://example.test/notes/index.html');
const listeners = new Map();
const hints = [];
const timers = new Map();
const dataset = {};
let nextTimer = 0;
let level = 'max';
const motion = { matches: false };
const navigator = { onLine: true, connection: { effectiveType: '4g' } };
const listen = (name, callback) => listeners.set(name, callback);
vm.runInNewContext(source, {
    URL, location, navigator, localStorage: { getItem: () => JSON.stringify({ animationLevel: level }) },
    window: { matchMedia: () => motion, addEventListener: listen },
    document: {
        documentElement: { dataset }, addEventListener: listen, createElement: () => ({}),
        head: { appendChild: hint => hints.push(hint.href) }
    },
    setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: id => timers.delete(id)
});
const flush = () => { for (const fn of timers.values()) fn(); timers.clear(); };
function hover(href, options = {}) {
    const link = {
        href: new URL(href, location).href, target: options.target || '',
        hasAttribute: name => name === 'download' && !!options.download, matches: () => true,
        contains: node => node === link
    };
    const type = options.type || 'pointerover';
    listeners.get(type)({ type, target: { closest: () => link }, pointerType: options.pointerType || 'mouse' });
}

assert.equal(listeners.has('click'), false, 'navigation, history and modified clicks belong to the browser');
assert.equal(hints.length, 0, 'opening a page must not download other documents');
hover('math.html');
listeners.get('pointerout')({ relatedTarget: null });
flush();
for (const url of ['#section', 'admin.html', 'english.html', 'matcenter.html', 'math.html?key=abc',
    'https://elsewhere.test/notes/math.html', '../notes-copy/math.html', 'other/math.html']) {
    hover(url); flush();
}
for (const options of [{ target: '_blank' }, { download: true }, { pointerType: 'touch' }]) {
    hover('physics.html', options); flush();
}
for (const state of [{ effectiveType: 'slow-2g' }, { saveData: true }]) {
    navigator.connection = state; hover('physics.html'); flush();
}
navigator.connection = {};
assert.deepEqual(hints, []);
hover('math.html#one'); flush();
hover('math.html#two'); flush();
hover('physics.html', { type: 'focusin' }); flush();
hover('chemistry.html'); flush();
assert.deepEqual(hints, ['https://example.test/notes/math.html', 'https://example.test/notes/physics.html']);
let skipped = 0;
const event = { viewTransition: { skipTransition() { skipped++; } } };
listeners.get('pageswap')(event);
level = 'medium'; listeners.get('almanion-settings-applied')();
assert.equal(dataset.pageMotion, 'medium');
level = 'off'; listeners.get('pagereveal')(event);
assert.equal(dataset.pageMotion, 'off');
level = 'max'; motion.matches = true; listeners.get('pageswap')(event);
assert.equal(skipped, 2);

assert.match(css, /prefers-reduced-motion: no-preference/);
assert.match(css, /types: site-page/);
for (const page of ['index', 'physics-10', 'english', 'matcenter', 'duty-10-1', 'tour-10-1',
    'admin', 'constructor', 'contests', 'homework', 'planner', 'sport']) {
    const html = fs.readFileSync(path.join(root, page + '.html'), 'utf8');
    assert.match(html, /<script defer src="page-transitions\.js/, page);
    assert.match(html, /styles\/page-transitions\.css/, page);
}
if (process.env.ALMANION_TEST_SITE) {
    const site = process.env.ALMANION_TEST_SITE;
    const read = page => fs.readFileSync(path.join(site, page + '.html'), 'utf8');
    const home = read('index');
    const physics = read('physics-10');
    for (const html of [home, physics, read('admin')]) {
        const optIn = html.indexOf('<style data-page-transitions>');
        assert.ok(optIn > 0 && optIn < html.indexOf('src="theme-bootstrap.js'), 'the snapshot opt-in must arrive with the page');
    }
    const shared = home.match(/href="(\/styles\/releases\/style-new\.[a-f\d]{16}\.css)"/)[1];
    assert.ok(physics.includes('href="' + shared + '"'));
    assert.ok(physics.includes('src="vendor/katex/katex.min.js"'));
    assert.ok(!physics.includes('cdn.jsdelivr.net/npm/katex'));
}
console.log('native navigation, motion preferences and deliberate public-page warmup passed');
