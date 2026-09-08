'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'home-motion.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles', 'home-motion.css'), 'utf8');
const shell = JSON.parse(fs.readFileSync(path.join(root, 'performance', 'sw-shell.json'), 'utf8')).assets;

assert.match(page, /styles\/home-motion\.css\?v=20260907-2/, 'home motion stylesheet must be versioned');
assert.match(page, /home-motion\.js\?v=20260907-2/, 'home motion client must be versioned');
assert.doesNotMatch(page, /card\.style\.animationDelay/, 'cards must not inherit a global inline stagger');

['9', '10', '11'].forEach(grade => {
    assert.match(page, new RegExp(`id="gradeTab${grade}"[^>]*aria-controls="gradePanel${grade}"`));
    assert.match(page, new RegExp(`id="gradePanel${grade}"[^>]*role="tabpanel"[^>]*aria-labelledby="gradeTab${grade}"`));
});

assert.match(client, /selectGrade\(panelFor\(savedGrade\) \? savedGrade : '10'/, '10th grade remains the default');
assert.match(client, /prefers-reduced-motion: reduce/, 'JavaScript motion must respect reduced motion');
assert.match(client, /animationLevel === 'off'/, 'JavaScript motion must respect disabled site animations');
assert.match(client, /getBoundingClientRect\(\)/, 'the extra section must use a FLIP-style position measurement');
assert.match(client, /rect\.top > window\.innerHeight \+ margin/, 'off-screen downstream content must skip FLIP work');
assert.match(client, /nextRect\.top > window\.innerHeight \+ margin/, 'FLIP must also skip off-screen destinations');
assert.match(client, /Math\.abs\(delta\) > maxGlide/, 'large downstream jumps must not be animated');
assert.match(client, /layoutFrame = window\.requestAnimationFrame\(flushGradeVisuals\)/,
    'rapid class changes must coalesce visual layout work into one frame');
assert.match(client, /--home-grade-shift/, 'panel motion must preserve navigation direction without transient classes');
assert.match(client, /ArrowLeft/);
assert.match(client, /ArrowRight/);
assert.match(client, /event\.key === 'Home'/);
assert.match(client, /event\.key === 'End'/);
assert.doesNotMatch(client, /finishPanelAnimation/, 'grade animation cleanup must not use stale independent timers');
assert.doesNotMatch(client, /home-grade-enter-(?:next|prev)/, 'grade panels must not accumulate transition classes');
assert.match(client, /grade === currentGrade\) return/, 'selecting the active grade must not restart its animation');
assert.match(client, /home-tabs-ready/, 'the grade indicator must not animate from the markup default on initial restore');
assert.match(client, /requestAnimationFrame\(function \(\) \{\s*window\.requestAnimationFrame\(function \(\)/,
    'the restored grade must be painted before indicator transitions are enabled');
assert.match(client, /finishInitialEntrance/, 'card stagger must be limited to the initial page entrance');

assert.match(styles, /body\.home-page \.subjects-grid > \.subject-card/);
assert.match(styles, /var\(--home-card-order\) \* 38ms/, 'visible card stagger must be short and local');
assert.match(styles, /home-motion-initial \.grade-panel:not\(\[hidden\]\)/, 'card stagger must only run during initial entrance');
assert.match(styles, /grade-tabs:not\(\.home-tabs-ready\)::before[\s\S]*transition: none/);
assert.match(styles, /opacity: 0\.58; transform: translate3d\(var\(--home-grade-shift, 0px\)/,
    'class switch must start with a soft directional crossfade');
assert.match(styles, /animations-medium\.home-page \.grade-panel:not\(\[hidden\]\)[\s\S]*animation-duration: 160ms/,
    'medium motion must be shorter than the full transition');
assert.match(styles, /animations-medium\.home-page \.grade-tabs::before[\s\S]*transition-duration: 180ms, 160ms, 160ms/,
    'the grade indicator must also be shorter in medium motion');
assert.match(page, /\.subject-card::before\s*\{[\s\S]*?background: var\(--subject-color\);[\s\S]*?color: var\(--subject-color\);/,
    'the subject stripe must keep its subject color while fading out');
assert.doesNotMatch(page, /subject-card:hover::before\s*\{\s*color:/,
    'the subject stripe color must not switch on mouse leave');
assert.match(styles, /body\.animations-off\.home-page[\s\S]*animation: none !important/);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(styles, /transition:\s*all\b/, 'home motion must animate explicit compositor-friendly properties');

assert.ok(shell.includes('/styles/home-motion.css'));
assert.ok(shell.includes('/home-motion.js'));

console.log('home page motion: all tests passed');
