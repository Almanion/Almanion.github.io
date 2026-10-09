'use strict';
const { test, expect } = require('@playwright/test');
const model = require('../matcenter/35-workspace-model.js');
const path = require('node:path');
const katexDist = path.dirname(require.resolve('katex'));
test.use({ serviceWorkers: 'block' });
const legacy = Array.from({ length: 130 }, (_, i) => ({ number: i + 1, grade: 'grade-9',
    description: `Условие задачи ${i + 1}: найдите радиус окружности. $x^2=4$.`, hint: 'Закрытая подсказка', status: 'Н' }));
const future = [1, 2].flatMap(s => [1, 2, 12].map(number => ({ number, grade: 'grade-10',
    description: `Будущая задача ${number}: две окружности.`, hint: 'Не открывать автоматически', status: 'Н',
    taskId: `new-${s}-${number}`, seriesId: `2026-${s}`, seriesTitle: `Серия ${s}. Геометрия`, seriesDate: `2026-09-${25 + s}` })));
const summer = [{ number: 1, description: 'Летняя задача', grade: 'grade-summer-9-10' }];
const camp = [1, 134].map(number => ({ number, description: `Лагерная задача ${number}: $x^2+1$.`, grade: 'grade-camp-2026',
    taskId: `camp-2026-t${String(number).padStart(3,'0')}`, seriesId: number === 1 ? 'camp-2026-add-01' : 'camp-2026-add-17',
    seriesTitle: number === 1 ? 'Добавка №1. 8 августа 2026 года.' : 'Добавка №17. 27 августа 2026 года.',
    seriesDate: number === 1 ? '2026-08-08' : '2026-08-27' }));

async function setup(page, options = {}) {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (options.realMath && url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/katex@')) {
            return route.fulfill({path:path.join(katexDist,url.pathname.split('/dist/')[1])});
        }
        if (url.hostname === 'script.google.com') {
            const data = JSON.parse(route.request().postData() || '{}');
            const tasks = url.pathname.includes('AKfycbw_') ? summer : (options.tasks || [...legacy, ...future]);
            return route.fulfill({ json: data.action === 'capabilities' ? { success: true, authVersion: options.authVersion || 3 }
                : data.action === 'accessStatus' ? { success: true, allowed: options.allowed !== false, isAdmin: false }
                : { success: true, tasks: data.action === 'campTasks' ? (options.campTasks || camp) : tasks, isAdmin: false } });
        }
        if (['127.0.0.1', 'localhost'].includes(url.hostname)) {
            if (/\/(account|firebase-analytics|analytics)\.js$/.test(url.pathname)) return route.fulfill({ contentType: 'application/javascript', body: '' });
            return route.continue();
        }
        return route.abort();
    });
    await page.addInitScript(({ home, dark, old, realMath }) => {
        if (!sessionStorage.getItem('mc-test-initialized')) {
            localStorage.setItem('almanion:visual-defaults:2026-09-05-v1', '1');
            localStorage.setItem('siteSettings', JSON.stringify({ experimental: !old, theme: dark ? 'dark' : 'light', expTheme: dark ? 'dark' : 'light', expMode: 'prism', expDark: !!dark, animationLevel: 'off' }));
            if (home) localStorage.setItem('homeGrade', home);
            sessionStorage.setItem('mc-test-initialized', '1');
        }
        const user = { uid: 'mc-test', email: 'test@example.com', getIdToken: async () => 'test-token' };
        const auth = { currentUser: user, onAuthStateChanged(callback) { setTimeout(() => callback(user), 0); return () => {}; } };
        let data = JSON.parse(localStorage.getItem('mc-test-remote') || '{"grade-9__12":{"solved":true,"updatedAt":1}}');
        const callbacks = new Set();
        const snapshot = () => ({ val: () => data });
        const ref = { once: async () => snapshot(), on(_event, callback) { callbacks.add(callback); setTimeout(() => callback(snapshot()), 0); },
            off() { callbacks.clear(); }, async update(patch) { Object.assign(data, patch); localStorage.setItem('mc-test-remote', JSON.stringify(data)); callbacks.forEach(c => c(snapshot())); },
            child(key) { return { once: async () => ({ val: () => data[key] }), set: async value => ref.update({ [key]: value }) }; } };
        const database = () => ({ ref: () => ref });
        database.ServerValue = { TIMESTAMP: 1 };
        const authFactory = () => auth;
        authFactory.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } };
        auth.setPersistence = async () => {};
        window.firebase = { apps: [{}], app: () => ({ options: {} }), initializeApp() {}, auth: authFactory, database };
        if (!realMath) window.renderMathInElement = el => { el.dataset.mathChecked = 'true'; };
    }, options);
    return errors;
}
async function ready(page) {
    await expect(page.locator('#authOverlay')).toBeHidden();
    await expect(page.locator('#tasksContainer .task-card').first()).toBeVisible();
}

for (const dark of [false,true]) test(`real KaTeX renders legacy indices and delimited formulas without altering source, dark=${dark}`, async ({page},info) => {
    const raw = 'Рассмотрите a_{n+1}, na_{n+1}, a_n. Обычное a1 остаётся прежним.';
    const tasks = [{number:854,grade:'grade-9',description:raw,status:'Н'},
        {number:855,grade:'grade-9',description:'Формула $\\frac{1}{2}+x^2$ и текст <img src=x onerror=alert(1)>.',status:'Н'}];
    const errors = await setup(page,{dark,realMath:true,tasks});
    for (const width of [1440,320]) {
        await page.setViewportSize({width,height:844});
        await page.goto('/matcenter.html?grade=grade-9&view=reading');
        await ready(page);
        const legacyCard = page.locator('#tasksContainer .task-card').filter({has:page.getByText('Задача 854',{exact:true})});
        const explicitCard = page.locator('#tasksContainer .task-card').filter({has:page.getByText('Задача 855',{exact:true})});
        await expect(legacyCard.locator('.katex')).toHaveCount(3);
        await expect(explicitCard.locator('.katex')).toHaveCount(1);
        await expect(page.locator('.katex-error')).toHaveCount(0);
        await expect(legacyCard.locator('.task-description-inner')).toContainText('Обычное a1 остаётся прежним.');
        await expect(explicitCard.locator('img')).toHaveCount(0);
        expect(await legacyCard.locator('annotation[encoding="application/x-tex"]').allTextContents()).toEqual(['a_{n+1}','na_{n+1}','a_n']);
        expect(await page.evaluate(()=>allTasks.find(t=>t.number===854).description)).toBe(raw);
        expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('matcenter_tasks_cache')).tasks.find(t=>t.number===854).description)).toBe(raw);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
        await page.screenshot({path:info.outputPath(`real-math-${width}.png`)});
        if (width <= 768) await page.locator('#mcFilterToggle').click();
        await page.locator('[data-mc-view="compact"]').click();
        await legacyCard.locator('.task-condition-toggle').click();
        await expect(legacyCard.locator('.katex')).toHaveCount(3);
    }
    expect(errors).toEqual([]);
});

for (const dark of [false,true]) test(`extreme archive tabs remain visible after direct links, reload and layout changes, dark=${dark}`, async ({page},info) => {
    const errors = await setup(page,{dark});
    await page.setViewportSize({width:320,height:844});
    async function visibleSelected(grade) {
        await expect(page.locator('#gradeSwitcher [data-grade="'+grade+'"]').locator('.mc-count')).not.toHaveText('—');
        await expect.poll(async()=>page.locator('#gradeSwitcher [data-grade="'+grade+'"]').evaluate(el=>{
            const card=el.getBoundingClientRect(), strip=el.parentElement.getBoundingClientRect();
            return card.left>=strip.left-1 && card.right<=strip.right+1 && card.left>=0 && card.right<=innerWidth;
        })).toBe(true);
    }
    for (const grade of ['grade-11','grade-9']) {
        await page.goto('/matcenter.html?grade='+grade);
        await expect(page.locator('#authOverlay')).toBeHidden();
        await visibleSelected(grade);
        await page.reload();
        await visibleSelected(grade);
        await page.addStyleTag({content:'#gradeSwitcher .grade-card-title{font-size:1.15rem !important}'});
        await visibleSelected(grade);
        await page.screenshot({path:info.outputPath(`edge-tab-${grade}.png`)});
    }
    expect(errors).toEqual([]);
});

test('outdated authentication is reported visibly, without falling back to password-only access', async ({page}) => {
    await setup(page,{authVersion:2});
    await page.goto('/matcenter.html?grade=grade-9');
    await ready(page);
    await expect(page.locator('#matcenterAuthVersionWarning')).toContainText('до v3');
    await expect(page.locator('#matcenterAuthVersionWarning')).toHaveAttribute('role','status');
    expect(await page.evaluate(()=>localStorage.getItem('matcenter_auth_mode'))).toBe('account');
});

test('loading is not mistaken for an empty archive or zero progress', async ({ page }) => {
    await setup(page);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let pending = 0;
    await page.route('https://script.google.com/**', async route => {
        if (route.request().postDataJSON().action) return route.fallback();
        pending++;
        await gate;
        return route.fallback();
    });
    await page.goto('/matcenter.html?grade=grade-10');
    await expect.poll(() => pending).toBeGreaterThan(0);
    await expect(page.locator('#totalTasks')).toHaveText('—');
    await expect(page.locator('#matcenterProgress')).toBeHidden();
    await expect(page.locator('.no-results-message')).toHaveCount(0);
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp.match(/font-src[^;]+/)[0]).toContain('https://fonts.gstatic.com');
    release();
    await ready(page);
    await expect(page.locator('#solvedTotal')).toHaveText('6');
});

test('transient table failures retry only failed source, preserve cache and clear warning on recovery', async ({ page }) => {
    await setup(page);
    let mainCalls = 0;
    let summerCalls = 0;
    let outage = false;
    await page.route('https://script.google.com/**', async route => {
        const data = route.request().postDataJSON();
        if (data.action) return route.fallback();
        if (route.request().url().includes('AKfycbw_')) { summerCalls++; return route.fallback(); }
        mainCalls++;
        if (outage || mainCalls === 1) return route.fulfill({ status: 503, body: 'Temporary outage' });
        return route.fallback();
    });
    await page.goto('/matcenter.html?grade=grade-10');
    await ready(page);
    expect(mainCalls).toBe(2);
    expect(summerCalls).toBe(1);
    await expect(page.locator('.matcenter-data-warning')).toHaveCount(0);
    const before = await page.locator('#tasksContainer .task-number-label').allTextContents();
    outage = true;
    await page.evaluate(() => loadTasksFromGoogleSheets(false, true));
    await expect(page.locator('.matcenter-data-warning')).toContainText('основная таблица');
    expect(await page.locator('#tasksContainer .task-number-label').allTextContents()).toEqual(before);
    expect(mainCalls).toBe(4);
    outage = false;
    await page.locator('#matcenterDataWarning').getByRole('button',{name:'Попробовать снова'}).click();
    await expect(page.locator('.matcenter-data-warning')).toHaveCount(0);
    expect(mainCalls).toBe(5);
});

test('dropdowns have themed pickers, keyboard selection and fit mobile viewport', async ({ page }, info) => {
    const errors = await setup(page, { dark: true });
    for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 850 });
        await page.goto('/matcenter.html?grade=grade-10');
        await ready(page);
        const select = page.locator('#mcSearchScope');
        if (width <= 768) await page.locator('#mcFilterToggle').click();
        await select.click();
        await expect(select).toHaveJSProperty('value', 'section');
        expect(await select.evaluate(el => el.matches(':open'))).toBe(true);
        const styles = await select.evaluate(el => {
            const picker = getComputedStyle(el, '::picker(select)');
            const option = el.options[1].getBoundingClientRect();
            return { radius: picker.borderRadius, background: picker.backgroundColor, left: option.left, right: option.right };
        });
        expect(styles.radius).toBe('12px');
        expect(styles.background).not.toBe('rgba(0, 0, 0, 0)');
        expect(styles.left).toBeGreaterThanOrEqual(0);
        expect(styles.right).toBeLessThanOrEqual(width);
        await page.screenshot({ path: info.outputPath(`dropdown-${width}.png`) });
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await expect(select).toHaveValue('archive');
        await select.click();
        await page.keyboard.press('Escape');
        expect(await select.evaluate(el => el.matches(':open'))).toBe(false);
        await select.selectOption('section');
    }
    expect(errors).toEqual([]);
});

test('compact layout, opt-in series, legacy progress, reading and exact archive search', async ({ page }, info) => {
    const errors = await setup(page);
    await page.setViewportSize({ width: 1440, height: 950 });
    await page.goto('/matcenter.html');
    await ready(page);
    await expect(page.locator('h1')).toHaveText('Матцентр');
    await expect(page.locator('#gradeSwitcher [data-grade="grade-10"]')).toHaveClass(/active/);
    await expect(page.locator('#mcSeriesRow')).toBeVisible();
    await expect(page.locator('#mcSeriesSelect option')).toHaveCount(3);
    await page.locator('#mcSeriesSelect').selectOption(JSON.stringify(['grade-10', 0, '2026-1']));
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(3);
    await expect(page.locator('#solvedTotal')).toHaveText('3');
    await page.locator('[data-mc-view="reading"]').click();
    await expect(page.locator('#tasksContainer .task-card.open')).toHaveCount(3);
    await expect(page.locator('#tasksContainer .task-description').first()).toHaveAttribute('data-math-checked', 'true');
    await expect(page.locator('#tasksContainer .hint-toggle').first()).toHaveAttribute('aria-expanded', 'false');
    await page.locator('[data-mc-view="compact"]').click();
    await expect(page.locator('#tasksContainer .task-card.open')).toHaveCount(0);
    await page.locator('#searchInput').fill('№12');
    await page.locator('#mcSearchScope').selectOption('archive');
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(3);
    await expect(page.locator('#tasksContainer .mc-task-context').first()).toBeVisible();
    expect(await page.locator('#tasksContainer .task-number-label').allTextContents()).toEqual(['Задача 12', 'Задача 12', 'Задача 12']);
    expect(await page.locator('#tasksContainer [id]').evaluateAll(nodes => new Set(nodes.map(n => n.id)).size === nodes.length)).toBe(true);
    await page.locator('#searchInput').fill('неттакогословавзадачах');
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(0);
    await expect(page.locator('.no-results-message')).toBeVisible();
    await page.locator('.no-results-clear').click();
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(3);
    await page.locator('#gradeSwitcher [data-grade="grade-9"]').click();
    await expect(page.locator('#mcSeriesRow')).toBeHidden();
    await page.locator('#searchInput').fill('12');
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(3); // archive scope persists
    await page.locator('#mcSearchScope').selectOption('section');
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(1);
    await expect(page.locator('#tasksContainer .task-solved-check')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#tasksContainer .task-solved-check').click();
    await expect(page.locator('#tasksContainer .task-solved-check')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#searchInput').fill('окружность');
    await expect(page.locator('#mcResultSummary')).toContainText('130');
    await page.locator('#gradeSwitcher [data-grade="grade-10"]').click();
    await page.screenshot({ path: info.outputPath('desktop.png') });
    expect(errors).toEqual([]);
});

test('deep link loads paginated task and restores position after reload', async ({ page }) => {
    const errors = await setup(page);
    const target = model.identity({ ...legacy[0], numberText: '1' });
    await page.goto('/matcenter.html?' + new URLSearchParams({ grade: 'grade-9', task: target, view: 'reading' }));
    const card = page.locator('.task-card').filter({ has: page.locator('.task-number-label', { hasText: /^Задача 1$/ }) });
    await expect(card).toBeFocused();
    await expect(card).toBeInViewport();
    await page.evaluate(() => { rememberMatcenterRoute(false); saveMatcenterReadingPlace(); });
    const offset = (await card.boundingBox()).y;
    await page.reload();
    await expect(card).toBeInViewport();
    await expect.poll(async () => Math.abs((await card.boundingBox()).y - offset)).toBeLessThan(40);
    expect(errors).toEqual([]);
});

test('mobile compact controls fit and keep one task column in both themes', async ({ page }, info) => {
    const errors = await setup(page, { dark: true });
    for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/matcenter.html?grade=grade-10');
        await ready(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        const cards = await page.locator('#tasksContainer .task-card').evaluateAll(nodes => nodes.slice(0, 2).map(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width }; }));
        expect(cards[0].x).toBe(cards[1].x);
        expect(cards[1].y).toBeGreaterThan(cards[0].y);
        expect(cards[0].y).toBeLessThan(530);
        await expect(page.locator('#mcSearchScope')).toBeHidden();
        await page.locator('#mcFilterToggle').click();
        for (const button of ['#mcSearchScope', '#statusFilter', '.mc-view-switch']) {
            const r = await page.locator(button).boundingBox();
            expect(r.x).toBeGreaterThanOrEqual(0);
            expect(r.x + r.width).toBeLessThanOrEqual(width + 1);
        }
        const shareBounds = await page.locator('.matcenter-share-solved-btn').boundingBox();
        expect(shareBounds.height).toBeLessThanOrEqual(44);
        expect(shareBounds.x + shareBounds.width).toBeLessThanOrEqual(width);
        await page.screenshot({ path: info.outputPath(`mobile-${width}.png`) });
    }
    expect(errors).toEqual([]);
});

test('home grade default, previous section, browser back and unchanged summer topics', async ({ page }) => {
    const errors = await setup(page, { home: '9' });
    await page.goto('/matcenter.html');
    await ready(page);
    await expect(page.locator('#gradeSwitcher [data-grade="grade-9"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#gradeSwitcher [data-grade="grade-10"]').click();
    await page.locator('#gradeSwitcher [data-grade="grade-summer-9-10"]').click();
    await expect(page.locator('#statsContainer')).toBeHidden();
    await expect(page.locator('#mcSeriesRow')).toBeHidden();
    await page.locator('#statusFilter').selectOption('topic-mayskie');
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(1);
    await expect(page.locator('#allTasksTitle')).toContainText('Майские сборы');
    await page.goBack();
    await expect(page.locator('#statusFilter')).toHaveValue('');
    await page.goBack();
    await expect(page.locator('#gradeSwitcher [data-grade="grade-10"]')).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/matcenter.html');
    await ready(page);
    await expect(page.locator('#gradeSwitcher [data-grade="grade-10"]')).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
});

test('legacy visual theme supports the toolbar and reading mode', async ({ page }, info) => {
    const errors = await setup(page, { old: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/matcenter.html');
    await ready(page);
    await expect(page.locator('body')).not.toHaveClass(/experimental/);
    await page.locator('#mcFilterToggle').click();
    await page.locator('[data-mc-view="reading"]').click();
    await expect(page.locator('#tasksContainer .task-card.open')).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath('legacy-mobile.png') });
    expect(errors).toEqual([]);
});

test('direct task links do not bypass access checks', async ({ page }) => {
    await setup(page, { allowed: false });
    await page.goto('/matcenter.html?grade=grade-9&task=1&view=reading');
    await expect(page.locator('#authOverlay')).toBeVisible();
    await expect(page.locator('.task-card')).toHaveCount(0);
});

for (const dark of [false, true]) test(`camp menu order and proportional three-digit counter, dark=${dark}`, async ({page}, info) => {
    const fullCamp = Array.from({length:134}, (_, i) => ({...camp[0], number:i+1,
        taskId:`camp-2026-t${String(i+1).padStart(3,'0')}`, status:i+1 === 120 ? '' : 'Р'}));
    const errors = await setup(page, {dark, campTasks:fullCamp});
    const order = ['grade-9','grade-summer-9-10','grade-camp-2026','grade-10','grade-summer-10-11','grade-11'];
    for (const width of [1440, 320]) {
        await page.setViewportSize({width,height:844});
        await page.goto('/matcenter.html?grade=grade-camp-2026');
        await ready(page);
        await expect(page.locator('link[href*="styles/matcenter-refresh.css"]')).toHaveAttribute('href', 'styles/matcenter-refresh.css?v=20261009-repairs1');
        expect(await page.locator('#gradeSwitcher [data-grade]').evaluateAll(els=>els.map(el=>el.dataset.grade))).toEqual(order);
        expect(await page.locator('#mcSidebarGrade option').evaluateAll(els=>els.map(el=>el.value))).toEqual(order);
        const active = page.locator('#gradeSwitcher [data-grade="grade-camp-2026"]');
        await expect(active.locator('.grade-card-title')).toHaveText('Лагерь 9');
        const counter = active.locator('.mc-count');
        await expect(counter).toHaveText('134');
        const typography = await counter.evaluate(el=>({numeric:getComputedStyle(el).fontVariantNumeric,
            spacing:getComputedStyle(el).letterSpacing, whitespace:getComputedStyle(el).whiteSpace}));
        expect(typography.numeric).toContain('proportional-nums');
        expect(typography.numeric).not.toContain('tabular-nums');
        expect(typography.spacing).toBe('normal');
        expect(typography.whitespace).toBe('nowrap');
        const box = await active.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x+box.width).toBeLessThanOrEqual(width);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
        expect(await page.evaluate(()=>allTasks.filter(t=>t.grade==='grade-camp-2026'&&t.status==='Р').length)).toBe(133);
        await page.screenshot({path:info.outputPath(`camp-menu-${width}.png`)});
        await page.locator('#searchInput').fill('120');
        await expect(page.locator('#tasksContainer .task-card')).toHaveCount(1);
        await expect(page.locator('#tasksContainer .task-number-label')).toHaveText('Задача 120');
        await expect(page.locator('#tasksContainer .task-status-badge')).toHaveCount(0);
        await page.locator('#searchInput').fill('121');
        await expect(page.locator('#tasksContainer .task-number-label')).toHaveText('Задача 121');
        await expect(page.locator('#tasksContainer .task-status-badge')).toHaveText('Разобрано');
        await page.locator('#searchInput').fill('');
    }
    expect(errors).toEqual([]);
});

test('camp is a separate archive with original ascending numbers, additions and independent progress', async ({page}) => {
    const errors = await setup(page);
    await page.setViewportSize({width:320,height:844});
    await page.goto('/matcenter.html?grade=grade-camp-2026');
    await ready(page);
    await expect(page.locator('#mcSidebarGrade')).toHaveValue('grade-camp-2026');
    await expect(page.locator('#allTasksTitle')).toHaveText('Лагерь 9 — все задачи');
    expect(await page.locator('#tasksContainer .task-number-label').allTextContents()).toEqual(['Задача 1','Задача 134']);
    const active = await page.locator('#gradeSwitcher [data-grade="grade-camp-2026"]').boundingBox();
    expect(active.x).toBeGreaterThanOrEqual(0);
    expect(active.x+active.width).toBeLessThanOrEqual(320);
    await expect(page.locator('#mcSeriesSelect option')).toHaveCount(3);
    await page.locator('#mcSeriesSelect').selectOption(JSON.stringify(['grade-camp-2026',2,'camp-2026-add-01']));
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(1);
    await page.locator('#tasksContainer .task-solved-check').click();
    await expect(page.locator('#solvedCount')).toHaveText('1');
    const key = await page.locator('#tasksContainer .task-card').getAttribute('data-solved-key');
    expect(key).toMatch(/^series__/);
    await page.locator('#mcSeriesSelect').selectOption('');
    await page.locator('#searchInput').fill('134');
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(1);
    await expect(page.locator('#tasksContainer .task-number-label')).toHaveText('Задача 134');
    await page.reload();
    await ready(page);
    await expect(page.locator('#gradeSwitcher [data-grade="grade-camp-2026"]')).toHaveAttribute('aria-pressed','true');
    expect(errors).toEqual([]);
});

for (const old of [false, true]) test(`mobile section header sticks without an obsolete search offset, legacy=${old}`, async ({ page }, info) => {
    const errors = await setup(page, { dark: true, old });
    for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/matcenter.html?grade=grade-9&view=reading');
        await ready(page);
        const header = page.locator('#all-tasks .part-title-row');
        for (const top of [1000, 1600, 1100]) {
            await page.evaluate(y => window.scrollTo(0, y), top);
            await expect.poll(async () => Math.abs((await header.boundingBox()).y)).toBeLessThanOrEqual(1);
            const box = await header.boundingBox();
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
            expect(box.height).toBeLessThan(100);
        }
        await page.screenshot({ path: info.outputPath(`sticky-${width}.png`) });
        await page.evaluate(() => openMobileMenu());
        await expect(page.locator('#mcSidebarGrade')).toBeVisible();
        await page.evaluate(() => closeMobileMenu());
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect.poll(async () => (await header.boundingBox()).y).toBeGreaterThan(100);
    }
    expect(errors).toEqual([]);
});

test('sidebar exposes categories, compact grade selection and search on desktop and phone', async ({ page }, info) => {
    const errors = await setup(page, { dark: true });
    for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/matcenter.html?grade=grade-10');
        await ready(page);
        if (width < 769) await page.evaluate(() => openMobileMenu());
        await expect(page.locator('#mcSidebarGrade')).toHaveValue('grade-10');
        await expect(page.locator('#sidebar .nav-link')).toHaveCount(4);
        await page.locator('#sidebar a[href="#current-series"]').click();
        await expect(page.locator('#current-series')).toBeVisible();
        await expect(page.locator('#sidebar a[href="#current-series"]')).toHaveAttribute('aria-current', 'page');
        if (width < 769) await page.evaluate(() => openMobileMenu());
        await page.locator('#mcSidebarGrade').selectOption('grade-summer-9-10');
        await expect(page.locator('#sidebar .nav-link')).toHaveCount(9);
        await expect(page.locator('#mcSidebarGrade')).toBeFocused();
        await page.screenshot({ path: info.outputPath(`sidebar-${width}.png`) });
        const bounds = await page.locator('#mcSidebarGrade').boundingBox();
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        await page.locator('#sidebar a[href="#topic-mayskie"]').click();
        await expect(page.locator('#allTasksTitle')).toContainText('Майские сборы');
        if (width < 769) await page.evaluate(() => openMobileMenu());
        await page.locator('#mcSidebarSearch').click();
        await expect(page.locator('#searchInput')).toBeFocused();
        if (width < 769) await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
    }
    expect(errors).toEqual([]);
});
