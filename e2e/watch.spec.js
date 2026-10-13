'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
test.use({ serviceWorkers:'block', isMobile:true, hasTouch:true });
test.beforeEach(async ({ page }) => { await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()); });
for (const width of [204,216,240,280]) test(`round-screen reading and text zoom fit at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height:width });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const scripts = []; page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
    await page.goto('/watch/');
    await expect(page.locator('#watchMain')).toContainText('Физика');
    await page.waitForTimeout(100);
    await page.screenshot({ path:info.outputPath('watch-home.png'), fullPage:true });
    await page.evaluate(() => { const mask = document.createElement('div'); mask.id = 'round-preview'; mask.style.cssText = 'position:fixed;inset:0;border-radius:50%;box-shadow:0 0 0 100vmax #161616;pointer-events:none;z-index:99;border:1px solid #444'; document.body.append(mask); });
    await page.screenshot({ path:info.outputPath('watch-round-home.png') });
    await page.locator('#round-preview').evaluate(el => el.remove());
    await page.getByRole('link', { name:'Физика', exact:true }).tap();
    await page.locator('.watch-search').fill('термостат');
    await expect(page.locator('#watchMain')).toContainText('Термостат');
    await page.locator('#watchMain a').first().tap();
    await expect(page.locator('.watch-card')).toContainText(/термостат/i);
    for (const button of await page.locator('.watch-controls button').all()) {
        const bounds = await button.boundingBox(); expect(bounds.width).toBeGreaterThanOrEqual(48); expect(bounds.height).toBeGreaterThanOrEqual(48);
    }
    await page.locator('#watchTools').tap();
    for (let i=0;i<8;i++) await page.getByRole('button', { name:'Увеличить текст', exact:true }).tap();
    expect(await page.evaluate(() => AlmanionWatch.getState().scale)).toBe(1.8);
    await page.getByRole('link', { name:'Читать', exact:true }).tap();
    await expect(page.locator('.watch-card')).toContainText(/термостат/i);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThan(2);
    await page.locator('#watchNext').tap();
    await expect(page.locator('.watch-card')).toContainText('Термос');
    await page.screenshot({ path:info.outputPath('watch-read-180.png'), fullPage:true });
    await page.reload();
    await expect(page.locator('.watch-card')).toContainText('Термос');
    expect(await page.evaluate(() => AlmanionWatch.getState().scale)).toBe(1.8);
    expect(scripts.some(url => /firebase|home-stars|settings\.js|knowledge-check/.test(url))).toBe(false);
    expect(errors).toEqual([]);
});
test('formula rendering and image magnification preserve native scrolling', async ({ page }, info) => {
    await page.setViewportSize({ width:216, height:216 });
    await page.goto('/watch/#read/physics-10/temperatura-i-uravnenie-sostoyaniya/2');
    await expect(page.locator('.watch-card')).toContainText(/термостат/i);
    await expect(page.locator('.watch-card img')).toHaveCount(1);
    await expect(page.locator('.watch-card .katex')).not.toHaveCount(0);
    await page.getByRole('button', { name:'Увеличить рисунок', exact:true }).tap();
    await expect(page.locator('.watch-media img')).toBeVisible();
    await expect.poll(() => page.locator('.watch-media img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
    await page.getByRole('button', { name:'Увеличить рисунок или формулу' }).tap();
    expect(await page.locator('.watch-media').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    await page.locator('.watch-media').evaluate(el => el.scrollLeft = 35);
    expect(await page.locator('.watch-media').evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    await page.screenshot({ path:info.outputPath('watch-image.png'), fullPage:true });
    await page.getByRole('link', { name:'Вернуться', exact:true }).tap();
    await expect(page.locator('.watch-card')).toContainText(/термостат/i);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThan(2);
});
test('class navigation, stress words, themes and failed fetch recovery', async ({ page }) => {
    await page.setViewportSize({ width:204, height:204 });
    await page.goto('/watch/');
    await page.getByRole('button', { name:'10 класс', exact:true }).tap();
    await page.getByRole('button', { name:'11 класс', exact:true }).tap();
    await page.getByRole('link', { name:'Русский язык ЕГЭ', exact:true }).tap();
    await page.locator('.watch-search').fill('агент');
    await page.locator('#watchMain a').first().tap();
    await expect(page.locator('.watch-card')).toContainText('агЕнт');
    await page.locator('#watchTools').tap();
    await page.getByRole('button', { name:'Светлая', exact:true }).tap();
    await expect(page.locator('html')).toHaveAttribute('data-theme','light');
    await page.getByRole('link', { name:'Главная', exact:true }).tap();
    await expect(page.getByRole('link', { name:/Продолжить/ })).toBeVisible();
    await page.route('**/watch/data/*', route => route.abort());
    await page.goto('/watch/#topics/geometry');
    await expect(page.locator('#watchMain')).toContainText('Повторить');
    await page.unroute('**/watch/data/*');
    await page.getByRole('button', { name:'Повторить', exact:true }).tap();
    await expect(page.locator('.watch-search')).toBeVisible();
});
test('canonical reading position survives an inserted block and another reload', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('almanion-watch-v1',JSON.stringify({ scale:1, grade:10, theme:'dark', last:{ id:'physics-10', topic:'fixture', index:1, block:'target', title:'Раздел' } })));
    await page.route('**/watch/catalogue.json', route => route.fulfill({ json:{ schemaVersion:1, subjects:[{ id:'physics-10',title:'Физика',path:'data/meta.json',grades:[10] }] } }));
    await page.route('**/watch/data/meta.json', route => route.fulfill({ json:{ schemaVersion:1,id:'physics-10',page:'physics-10.html',title:'Физика',topics:[{ id:'fixture',title:'Раздел',count:3,parts:[{path:'data/blocks.json',count:3}] }] } }));
    await page.route('**/watch/data/blocks.json', route => route.fulfill({ json:{ schemaVersion:1,blocks:[{id:'new',type:'text',html:'Новый блок'},{id:'old',type:'text',html:'Старый блок'},{id:'target',type:'definition',html:'<div class="definition-box"><strong>Нужный термин</strong> — ответ.<script>window.injected=true</script><img src="bad" onerror="window.injected=true"></div>'}] } }));
    await page.goto('/watch/#read/physics-10/fixture/1');
    await expect(page.locator('.watch-card')).toContainText('Нужный термин');
    await expect(page).toHaveURL(/fixture\/2$/);
    expect(await page.evaluate(() => window.injected)).toBeUndefined();
    await page.reload();
    await expect(page.locator('.watch-card')).toContainText('Нужный термин');
});
test('watch duty uses the public live schedule and does not need an account', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-13T10:00:00+03:00'));
    await page.route('https://**/classDuty/grade10_1/entries.json', route => route.fulfill({ json:{one:{start:'2026-10-12',end:'2026-10-17',people:['Первый дежурный','Второй дежурный']},two:{start:'2026-10-19',end:'2026-10-24',people:['Следующая команда']}} }));
    await page.goto('/watch/#duty');
    await expect(page.locator('#watchMain')).toContainText('Первый дежурный');
    await page.getByRole('button',{name:'Следующее дежурство'}).tap();
    await expect(page.locator('#watchMain')).toContainText('Следующая команда');
});
test('inline source diagrams remain decodable images with their SVG styles and markers', async ({ page }) => {
    await page.goto('/watch/');
    const files = fs.readdirSync(path.join(process.env.ALMANION_TEST_SITE || path.join(__dirname,'../_site'),'watch/figures'));
    const results = await page.evaluate(files => Promise.all(files.map(file => new Promise(resolve => {
        const image = new Image(); image.onload = () => resolve({file,ok:image.naturalWidth > 0}); image.onerror = () => resolve({file,ok:false}); image.src = 'figures/' + file;
    }))),files);
    expect(results.filter(image => !image.ok)).toEqual([]);
});

test('installed watch shell, visited text, formulas and images work after going offline', async ({ browser }) => {
    const context = await browser.newContext({ viewport:{width:216,height:216}, isMobile:true,hasTouch:true,serviceWorkers:'allow' });
    const page = await context.newPage();
    try {
        await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
        await page.goto(test.info().project.use.baseURL + '/watch/');
        await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
        await page.goto(test.info().project.use.baseURL + '/watch/#read/physics-10/temperatura-i-uravnenie-sostoyaniya/2');
        await expect(page.locator('.watch-card .katex')).not.toHaveCount(0);
        await page.getByRole('button',{name:'Увеличить рисунок',exact:true}).tap();
        await expect.poll(() => page.locator('.watch-media img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
        await page.getByRole('link',{name:'Вернуться',exact:true}).tap();
        await page.evaluate(() => document.fonts.ready);
        await context.setOffline(true);
        await page.reload();
        await expect(page.locator('.watch-card')).toContainText(/термостат/i);
        await expect(page.locator('.watch-card .katex')).not.toHaveCount(0);
        await page.getByRole('button',{name:'Увеличить рисунок',exact:true}).tap();
        await expect.poll(() => page.locator('.watch-media img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
        await page.getByRole('link',{name:'Вернуться',exact:true}).tap();
        await page.getByRole('button',{name:'Добавить в избранное',exact:true}).tap();
        await page.locator('#watchTools').tap();
        await page.getByRole('button',{name:'Избранные',exact:true}).tap();
        await page.getByRole('link',{name:'Читать',exact:true}).tap();
        await expect(page.locator('.watch-counter')).toHaveText('1 / 1');
        await page.reload();
        await expect(page.getByRole('button',{name:'Убрать из избранного',exact:true})).toHaveAttribute('aria-pressed','true');
        await expect(page.locator('.watch-counter')).toHaveText('1 / 1');
    } finally { await context.close(); }
});

async function favoritesFixture(page) {
    await page.route('**/watch/catalogue.json',route => route.fulfill({json:{schemaVersion:1,subjects:[{id:'physics-10',title:'Физика',page:'physics-10.html',path:'data/meta.json',grades:[10]}]}}));
    await page.route('**/watch/data/meta.json',route => route.fulfill({json:{schemaVersion:1,id:'physics-10',title:'Физика',page:'physics-10.html',topics:[
        {id:'one',title:'Первый раздел',count:3,ids:['a','b','c'],parts:[{path:'data/one.json',count:3}]},
        {id:'two',title:'Второй раздел',count:2,ids:['d','e'],parts:[{path:'data/two.json',count:2}]}
    ]}}));
    await page.route('**/watch/data/one.json',route => route.fulfill({json:{schemaVersion:1,blocks:['a','b','c'].map(id => ({id,type:'definition',html:'<div class="definition-box"><strong>Термин ' + id + '</strong> — текст.</div>'}))}}));
    await page.route('**/watch/data/two.json',route => route.fulfill({json:{schemaVersion:1,blocks:['d','e'].map(id => ({id,type:'formula',html:'Формула ' + id}))}}));
}

test('watch favorites filter skips unsaved blocks and sections, persists and recovers after deleting the last favorite',async ({page},info) => {
    await page.setViewportSize({width:204,height:204});
    await favoritesFixture(page);
    await page.goto('/watch/#read/physics-10/one/0');
    await page.getByRole('button',{name:'Добавить в избранное',exact:true}).tap();
    await expect(page.getByRole('button',{name:'Убрать из избранного',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.locator('#watchNext').tap();
    await expect(page.locator('.watch-card')).toContainText('Термин b');
    await page.goto('/watch/#read/physics-10/two/1');
    await page.getByRole('button',{name:'Добавить в избранное',exact:true}).tap();
    const savedLink = await page.evaluate(() => JSON.parse(localStorage.getItem('almanion_bookmarks_guest')).records['physics-10__b__e']);
    expect(savedLink.page).toBe('/watch/');
    await page.goto(savedLink.page + '#' + savedLink.topicId);
    await expect(page.locator('.watch-card')).toContainText('Формула e');
    await page.locator('#watchTools').tap();
    await page.getByRole('button',{name:'Избранные',exact:true}).tap();
    await page.getByRole('link',{name:'Читать',exact:true}).tap();
    await expect(page.locator('.watch-counter')).toHaveText('2 / 2');
    await expect(page.locator('#watchNext')).toBeDisabled();
    await page.locator('#watchPrev').tap();
    await expect(page.locator('.watch-card')).toContainText('Термин a');
    await expect(page.locator('.watch-counter')).toHaveText('1 / 2');
    await expect(page.locator('#watchPrev')).toBeDisabled();
    await page.screenshot({path:info.outputPath('watch-favorites-204.png'),fullPage:true});
    expect(await page.evaluate(() => document.documentElement.scrollWidth-innerWidth)).toBeLessThan(2);
    await page.reload();
    await expect(page.locator('.watch-counter')).toHaveText('1 / 2');
    await page.getByRole('button',{name:'Убрать из избранного',exact:true}).tap();
    await expect(page.locator('.watch-card')).toContainText('Формула e');
    await expect(page.locator('.watch-counter')).toHaveText('1 / 1');
    await page.getByRole('button',{name:'Убрать из избранного',exact:true}).tap();
    await expect(page.locator('#watchMain')).toContainText('Избранных блоков пока нет');
    await expect(page.locator('.watch-controls')).toBeHidden();
    await page.getByRole('button',{name:'Показывать все',exact:true}).tap();
    await expect(page.locator('.watch-card')).toContainText('Формула e');
    const records = await page.evaluate(() => JSON.parse(localStorage.getItem('almanion_bookmarks_guest')).records);
    expect(records['physics-10__b__a'].deleted).toBe(true);
    expect(records['physics-10__b__e'].deleted).toBe(true);
});

test('watch shares guest bookmarks but does not expose account, deleted or note-only records',async ({page}) => {
    await favoritesFixture(page);
    await page.addInitScript(() => {
        localStorage.setItem('almanion_bookmarks_guest',JSON.stringify({schema:1,namespace:'bookmarks',owner:'guest',records:{
            'physics-10__b__b':{blockKey:'b',page:'/physics-10.html',topicId:'one',noteText:'Личная заметка',updatedAt:1},
            'physics-10__b__a':{deleted:true,updatedAt:1},
            'physics-10__b__c':{noteOnly:true,updatedAt:1}
        }}));
        localStorage.setItem('almanion_bookmarks_uid_other',JSON.stringify({'physics-10__b__e':{page:'/physics-10.html',updatedAt:1}}));
    });
    await page.goto('/watch/#favorites');
    await expect(page.getByRole('link',{name:'Физика 1',exact:true})).toBeVisible();
    await page.getByRole('link',{name:'Физика 1',exact:true}).tap();
    await expect(page.getByRole('button',{name:'Избранные',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(page.getByRole('link',{name:'Второй раздел',exact:true})).toHaveCount(0);
    await page.getByRole('link',{name:'Первый раздел',exact:true}).tap();
    await expect(page.locator('.watch-card')).toContainText('Термин b');
    await expect(page.locator('.watch-counter')).toHaveText('1 / 1');
    await page.getByRole('button',{name:'Убрать из избранного',exact:true}).tap();
    const record = await page.evaluate(() => JSON.parse(localStorage.getItem('almanion_bookmarks_guest')).records['physics-10__b__b']);
    expect(record.noteText).toBe('Личная заметка'); expect(record.noteOnly).toBe(true);
    await page.getByRole('button',{name:'Показывать все',exact:true}).tap();
    await expect(page.locator('.watch-card')).toContainText('Термин b');
    await page.locator('#watchTools').tap();
    await page.getByRole('link',{name:'Разделы',exact:true}).tap();
    await expect(page.getByRole('link',{name:'Второй раздел',exact:true})).toBeVisible();
});
