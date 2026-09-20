'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const settings = read('settings.js');
const layout = read(path.join('styles', 'site', '20-layout-content.css'));
const settingsCss = read(path.join('styles', 'site', '40-extras-settings.css'));

assert.match(settings, /noteScale:\s*1/);
assert.match(settings, /applyNoteScale\(siteSettings\.noteScale\)/);
assert.match(settings, /classList\.toggle\('no-hover', !enabled && isNoteReadingPage\(\)\)/,
    'cursor response must only affect note reading pages');
assert.match(settings, /id="noteScaleInput" type="number" min="75" max="125" step="1"/);
assert.match(settings, /id="noteScaleRange" type="range" min="75" max="125" step="1"/);
assert.match(settings, /data-note-scale-action="reset"/);
assert.ok(settings.indexOf('settings-scale-section') < settings.indexOf('<!-- Новый и старый интерфейс -->'),
    'note scale must be the first settings section');

assert.doesNotMatch(settingsCss, /body\.no-hover\s+\*\s*:hover/,
    'cursor response must not reset every hovered element');
assert.match(settingsCss, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
    'animation choices must stay aligned in three stable columns');
assert.match(settingsCss, /\.settings-modal \.animation-level-option \.level-copy/);
assert.match(settingsCss, /\.settings-modal :is\(\.settings-section-icon, \.level-icon-svg/,
    'settings SVGs must have explicit bounded sizing');
assert.match(layout, /body\[data-note-subject\] \.main-content > \.content-section[\s\S]*\.exp-reader-toolbar[\s\S]*\.exp-reader-footer[\s\S]*zoom:\s*var\(--note-scale, 1\)/,
    'reader content, progress navigation and next/previous controls must scale together');
assert.match(settingsCss, /\.settings-modal \.settings-scale-section/);
assert.match(settingsCss, /\.settings-modal \.note-scale-slider/);
assert.match(layout, /\.sidebar-expand-btn\s*\{[\s\S]*width:\s*34px;[\s\S]*height:\s*34px;/);
assert.match(layout, /\.nav-link:hover/,
    'sidebar feedback must remain available when note hover effects are disabled');
assert.match(layout, /\.remark-box::before\s*\{[\s\S]*content:\s*['"]Замечание['"][\s\S]*color:\s*#ca8a04/);

const svgProblems = [];
function inspectInlineSvg(directory) {
    fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
        if (['.git', '_site', 'artifacts', 'node_modules', 'tests'].includes(entry.name)) return;
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) return inspectInlineSvg(file);
        if (!/\.(?:html|js)$/.test(entry.name)) return;
        const source = fs.readFileSync(file, 'utf8');
        for (const match of source.matchAll(/<svg\b[^>]*>/gi)) {
            const tag = match[0];
            const hiddenSprite = /width\s*=\s*["']0["']/.test(tag)
                && /height\s*=\s*["']0["']/.test(tag);
            if (!/viewBox\s*=/.test(tag) && !hiddenSprite) {
                svgProblems.push(path.relative(root, file) + ': ' + tag.slice(0, 100));
            }
        }
    });
}
inspectInlineSvg(root);
assert.deepEqual(svgProblems, [], 'every visible inline SVG needs a viewBox for reliable scaling');

console.log('settings, cursor response and SVG sizing: all tests passed');
