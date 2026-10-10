'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const source = read('note-filter.js');
const css = read('styles/note-filter.css');
assert.match(source, /document.createElement\('details'\)/, 'keep native keyboard and expanded-state semantics');
assert.match(source, /input.type = 'checkbox'/, 'multiple block types must remain independently selectable');
assert.match(source, /role="group" aria-label=/);
assert.match(source, /event.key !== 'Escape'/);
assert.match(source, /summary.focus\(\{ preventScroll: true \}\)/);
assert.match(source, /popover.style.maxHeight/);
assert.match(source, /dockRect.top : innerHeight/);
assert.match(css, /\.note-filter-popover\s*\{[^}]*position:\s*absolute/s, 'opening the picker must not shift the note');
assert.match(css, /\.note-filter-options\s*\{[^}]*overflow-y:\s*auto/s);
assert.match(css, /\.note-filter-actions\s*\{[^}]*flex-shrink:\s*0/s, 'footer actions must remain outside the scroll area');
assert.match(css, /input:focus-visible/);
assert.doesNotMatch(css, /:has\(\.note-filter\[open\]\)/, 'opening must not resize the reading bar');
for (const file of ['note-runtime.js', 'print-export.js']) {
    assert.ok(read(file).includes('note-filter.js?v=20261010-1'));
    assert.ok(read(file).includes('styles/note-filter.css?v=20261010-1'));
}
console.log('block picker interface: all tests passed');
