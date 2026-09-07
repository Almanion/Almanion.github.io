'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'home-motion.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles', 'home-motion.css'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

assert.match(page, /styles\/home-motion\.css\?v=20260907-1/, 'home motion stylesheet must be versioned');
assert.match(page, /home-motion\.js\?v=20260907-1/, 'home motion client must be versioned');
assert.doesNotMatch(page, /card\.style\.animationDelay/, 'cards must not inherit a global inline stagger');

['9', '10', '11'].forEach(grade => {
    assert.match(page, new RegExp(`id="gradeTab${grade}"[^>]*aria-controls="gradePanel${grade}"`));
    assert.match(page, new RegExp(`id="gradePanel${grade}"[^>]*role="tabpanel"[^>]*aria-labelledby="gradeTab${grade}"`));
});

assert.match(client, /selectGrade\(panelFor\(savedGrade\) \? savedGrade : '10'/, '10th grade remains the default');
assert.match(client, /prefers-reduced-motion: reduce/, 'JavaScript motion must respect reduced motion');
assert.match(client, /animationLevel === 'off'/, 'JavaScript motion must respect disabled site animations');
assert.match(client, /getBoundingClientRect\(\)\.top/, 'the extra section must use a FLIP-style position measurement');
assert.match(client, /ArrowLeft/);
assert.match(client, /ArrowRight/);
assert.match(client, /event\.key === 'Home'/);
assert.match(client, /event\.key === 'End'/);
assert.doesNotMatch(client, /finishPanelAnimation/, 'grade animation cleanup must not use stale independent timers');
assert.match(client, /grade === currentGrade\) return/, 'selecting the active grade must not restart its animation');
assert.match(client, /home-tabs-ready/, 'the grade indicator must not animate from the markup default on initial restore');
assert.match(client, /requestAnimationFrame\(function \(\) \{\s*window\.requestAnimationFrame\(function \(\)/,
    'the restored grade must be painted before indicator transitions are enabled');
assert.match(client, /finishInitialEntrance/, 'card stagger must be limited to the initial page entrance');

assert.match(styles, /body\.home-page \.subjects-grid > \.subject-card/);
assert.match(styles, /var\(--home-card-order\) \* 38ms/, 'visible card stagger must be short and local');
assert.match(styles, /home-motion-initial \.grade-panel:not\(\[hidden\]\)/, 'card stagger must only run during initial entrance');
assert.match(styles, /grade-tabs:not\(\.home-tabs-ready\)::before[\s\S]*transition: none/);
assert.match(styles, /body\.animations-off\.home-page[\s\S]*animation: none !important/);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(styles, /transition:\s*all\b/, 'home motion must animate explicit compositor-friendly properties');

assert.match(worker, /home-access-52/);
assert.match(worker, /'\/styles\/home-motion\.css\?v=20260907-1'/);
assert.match(worker, /'\/home-motion\.js\?v=20260907-1'/);

console.log('home page motion: all tests passed');
