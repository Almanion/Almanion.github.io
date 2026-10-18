'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'home-motion.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles', 'home-motion.css'), 'utf8');
const dashboardStyles = fs.readFileSync(path.join(root, 'styles', 'home-dashboard.css'), 'utf8');
const mobileStyles = fs.readFileSync(path.join(root, 'styles', 'mobile-overrides.css'), 'utf8');
const shell = JSON.parse(fs.readFileSync(path.join(root, 'performance', 'sw-shell.json'), 'utf8')).assets;

assert.match(page, /styles\/home-motion\.css\?v=20260920-2/, 'home motion stylesheet must be versioned');
assert.match(page, /home-motion\.js\?v=20261018-1/, 'homepage order changes must invalidate the previous controller');
assert.doesNotMatch(page, /card\.style\.animationDelay/, 'cards must not inherit a global inline stagger');

['9', '10', '11', 'Archive'].forEach(grade => {
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
assert.match(dashboardStyles, /\.subject-card::before\s*\{[\s\S]*?background: var\(--subject-color\);[\s\S]*?color: var\(--subject-color\);/,
    'the subject stripe must keep its subject color while fading out');
assert.doesNotMatch(dashboardStyles, /subject-card:hover::before\s*\{\s*color:/,
    'the subject stripe color must not switch on mouse leave');
assert.match(styles, /body\.animations-off\.home-page[\s\S]*animation: none !important/);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(styles, /transition:\s*all\b/, 'home motion must animate explicit compositor-friendly properties');
assert.match(dashboardStyles, /@media \(max-width: 768px\)[\s\S]*\.grade-tabs\s*\{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/,
    'mobile grade tabs must stay in one four-column row');
assert.match(dashboardStyles, /\.grade-tabs::before\s*\{\s*display: none;/,
    'mobile grade tabs must not depend on a stale desktop moving indicator');
assert.match(dashboardStyles, /body\.experimental\.home-page \.grade-tab\.active[\s\S]*background: var\(--exp-accent\)/,
    'the active mobile grade must retain a visible theme-aware background');
assert.match(mobileStyles, /@media \(max-width: 480px\)[\s\S]*\.main-content > \.content-section\s*\{\s*--m-pad: 0\.76rem;/,
    'note text side spacing must be 20% smaller on standard phones');

assert.ok(shell.includes('/styles/home-motion.css'));
assert.ok(shell.includes('/home-motion.js'));

// Exercise the real client against a small DOM with native move/focus behavior.
// CSS order alone cannot keep keyboard and screen-reader traversal aligned.
function verifySectionOrder(initialMobile) {
    let document;
    class Element {
        constructor(name) { this.name = name; this.children = []; this.parentElement = null; this.dataset = {}; this.style = { setProperty() {} }; this.classList = { add() {}, remove() {}, contains() { return false; } }; }
        get firstElementChild() { return this.children[0] || null; }
        get nextElementSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] || null; }
        get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
        contains(node) { return this === node || this.children.some(child => child.contains(node)); }
        insertBefore(node, anchor) {
            if (node === anchor) return;
            if (node.contains(document.activeElement)) document.activeElement = document.body;
            if (node.parentElement) node.parentElement.children.splice(node.parentElement.children.indexOf(node), 1);
            const index = anchor ? this.children.indexOf(anchor) : this.children.length;
            assert.ok(index >= 0, 'an insertion anchor must belong to the target container');
            this.children.splice(index, 0, node); node.parentElement = this;
        }
        appendChild(node) { this.insertBefore(node, null); return node; }
        append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
        prepend(node) { this.insertBefore(node, this.firstElementChild); }
        before(node) { this.parentElement.insertBefore(node, this); }
        after(node) { this.parentElement.insertBefore(node, this.nextElementSibling); }
        focus(options) { document.activeElement = this; this.lastFocusOptions = options; }
        addEventListener() {}
    }
    const body = new Element('body'), main = new Element('main'), quick = new Element('quick'), daily = new Element('daily'), grid = new Element('grid'), subjects = new Element('subjects'), secondary = new Element('secondary');
    const quickLink = new Element('quick-link'), dailyLink = new Element('daily-link'), subjectLink = new Element('subject-link'), secondaryLink = new Element('secondary-link');
    const selectors = { '.home-container': main, '#homeMain': main, '.home-content-grid': grid, '.subjects-section': subjects, '.home-secondary': secondary, '.home-quick-section': quick, '.extra-section': quick, '#homeDailyDuty': daily, '.home-daily-duty': daily };
    document = { body, activeElement: body, querySelector: selector => selectors[selector] || null, querySelectorAll: () => [], getElementById: id => selectors['#' + id] || null };
    body.append(main); main.append(quick, daily, new Element('template'), new Element('inline-script'), new Element('quick-dialog'), grid);
    grid.append(secondary, subjects); quick.append(quickLink); daily.append(dailyLink); subjects.append(subjectLink); secondary.append(secondaryLink);
    subjectLink.focus();
    let breakpointChange;
    const media = { matches: initialMobile, addEventListener(type, callback) { if (type === 'change') breakpointChange = callback; } };
    const storage = { getItem: () => null };
    vm.runInNewContext(client, { document, localStorage: storage, window: { matchMedia: () => media, localStorage: storage, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {} } }, { filename: 'home-motion.js' });
    const links = node => [quickLink, dailyLink, subjectLink, secondaryLink].includes(node) ? [node.name] : node.children.flatMap(links);
    const verify = () => {
        assert.deepStrictEqual(links(main), ['quick-link', 'daily-link', 'subject-link', 'secondary-link'], 'DOM traversal must remain Quick Access → daily duty → subjects → supporting pages at either breakpoint');
        assert.strictEqual(grid.firstElementChild, subjects, 'the directory must keep subjects before supporting pages');
        assert.strictEqual(quick.parentElement, main, 'Quick Access must remain above the directory');
        assert.strictEqual(daily.parentElement, main, 'daily duty must remain between Quick Access and the directory');
    };
    verify();
    assert.strictEqual(document.activeElement, subjectLink, 'normalizing the initial directory must preserve focus');
    if (subjectLink.lastFocusOptions) assert.strictEqual(subjectLink.lastFocusOptions.preventScroll, true);
    for (const mobile of [!initialMobile, initialMobile, !initialMobile]) {
        quickLink.focus(); media.matches = mobile; breakpointChange?.({ matches: mobile }); verify();
        assert.strictEqual(document.activeElement, quickLink, 'resizing must not lose focus in Quick Access');
    }
}
verifySectionOrder(false);
verifySectionOrder(true);

console.log('home page motion: all tests passed');
