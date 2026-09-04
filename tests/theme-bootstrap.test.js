'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'theme-bootstrap.js'), 'utf8');
const storage = new Map([
    ['siteSettings', JSON.stringify({
        experimental: false,
        expMode: 'graphite',
        expDark: false,
        animationLevel: 'off',
        hoverEffects: false
    })]
]);

function createContext(systemDark) {
    const media = { matches: systemDark, listener: null };
    media.addEventListener = (name, callback) => {
        if (name === 'change') media.listener = callback;
    };
    const bodyClasses = new Set();
    const root = {
        dataset: {},
        style: {},
        hasAttribute: name => name === 'data-palette'
    };
    const context = {
        document: {
            documentElement: root,
            body: { classList: { toggle: (name, enabled) => enabled ? bodyClasses.add(name) : bodyClasses.delete(name) } }
        },
        localStorage: {
            getItem: key => storage.has(key) ? storage.get(key) : null,
            setItem: (key, value) => storage.set(key, value)
        },
        CustomEvent: class {
            constructor(type, options) { this.type = type; this.detail = options && options.detail; }
        }
    };
    context.window = {
        matchMedia: () => media,
        dispatchEvent: () => {}
    };
    return { context, media, bodyClasses, root };
}

const first = createContext(true);
vm.runInNewContext(source, first.context, { filename: 'theme-bootstrap.js' });

let settings = JSON.parse(storage.get('siteSettings'));
assert.strictEqual(settings.experimental, true);
assert.strictEqual(settings.expMode, 'prism');
assert.strictEqual(settings.expTheme, 'system');
assert.strictEqual(settings.expDark, true);
assert.strictEqual(settings.animationLevel, 'max');
assert.strictEqual(settings.hoverEffects, true);
assert.strictEqual(storage.get('almanion:visual-defaults:2026-09-05-v1'), '1');
assert.strictEqual(storage.get('newYearMode'), 'false');
assert.strictEqual(first.root.dataset.exp, 'prism-dark');

settings.experimental = false;
settings.expMode = 'graphite';
settings.expTheme = 'light';
settings.expDark = false;
settings.animationLevel = 'off';
settings.hoverEffects = false;
storage.set('siteSettings', JSON.stringify(settings));

const second = createContext(true);
vm.runInNewContext(source, second.context, { filename: 'theme-bootstrap.js' });
settings = JSON.parse(storage.get('siteSettings'));
assert.strictEqual(settings.experimental, false, 'the migration must not overwrite later choices');
assert.strictEqual(settings.expMode, 'graphite');
assert.strictEqual(settings.expTheme, 'light');
assert.strictEqual(settings.animationLevel, 'off');
assert.strictEqual(settings.hoverEffects, false);

settings.experimental = true;
settings.expTheme = 'system';
storage.set('siteSettings', JSON.stringify(settings));
second.media.listener({ matches: false });
settings = JSON.parse(storage.get('siteSettings'));
assert.strictEqual(settings.expDark, false, 'system mode must follow device color scheme changes');
assert.strictEqual(second.root.dataset.exp, 'graphite-light');

console.log('theme bootstrap and one-time migration: all tests passed');
