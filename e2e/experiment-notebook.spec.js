'use strict';
const {test,expect} = require('@playwright/test');
const Renderer = require('../constructor/renderer');
const installAccount = require('./helpers/constructor-account');
const block = {
    id:'notebook-test',type:'experiment',title:'Опыт',content:'Оригинал: наблюдаем движение частицы.',
    notebook:'Опыт: наблюдаем движение.\n\nСледовательно, \\[v=\\frac{s}{t}\\].',
    children:[{id:'nested',type:'remark',content:'Исходное пояснение',children:[{id:'drawing',type:'image',src:'images/notes/physics-10/intermolecular-interaction.svg',alt:'Исходный рисунок',caption:'Схема опыта'}]}]
};
const html = Renderer.renderBlock(block,0);
async function network(page) {
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1') return route.continue();
        const katex = url.pathname.match(/\/katex@[^/]+\/dist\/(.+)/);
        if (katex) return route.fulfill({response:await page.request.get('/vendor/katex/'+katex[1])});
        return route.abort();
    });
}
async function reference(page,root) {
    await root.evaluate(node=>{window.originalExperiment=node.innerHTML;window.originalFigure=node.querySelector('figure');window.originalImage=node.querySelector('img');});
}
async function figureUnchanged(page,root) {
    expect(await root.evaluate(node=>node.querySelector('figure')===window.originalFigure && node.querySelector('img')===window.originalImage)).toBe(true);
    await expect(root.locator('img')).toHaveCount(1);
    await expect(root.getByText('Схема опыта',{exact:true})).toBeVisible();
}
test.describe('ordinary notes',()=>{
    test.use({serviceWorkers:'block'});
    test('triple click toggles text and math, keeps nested drawings and controls; double click selects normally',async ({page})=>{
        await network(page);
        await page.goto('/physics-10.html#opytnye-obosnovaniya-mkt');
        await expect.poll(()=>page.evaluate(()=>!!window.AlmanionExperiments)).toBe(true);
        await page.evaluate(html=>{const article=document.querySelector('.topic:has(.experiment-box)');article.replaceChildren();article.innerHTML=html;article.hidden=false;article.style.display='block';},html);
        const root = page.locator('[data-note-block="notebook-test"]');
        await root.evaluate(node=>{const button=document.createElement('button');button.className='copy-block-btn';button.textContent='Copy';node.append(button);});
        await reference(page,root);
        const original = root.locator(':scope > strong');
        await original.dblclick();
        await expect(root.locator('.experiment-notebook')).toHaveCount(0);
        expect(await page.evaluate(()=>getSelection().toString())).not.toBe('');
        await page.waitForTimeout(500);
        await original.click({clickCount:3,delay:70});
        await expect(root).toHaveAttribute('data-experiment-mode','notebook');
        await expect(root.locator('.experiment-notebook .katex-display')).toHaveCount(1);
        await expect(root).not.toContainText('Оригинал:');
        await figureUnchanged(page,root);
        await expect(root.locator('.copy-block-btn')).toBeVisible();
        await root.locator('.copy-block-btn').click({clickCount:3});
        await expect(root).toHaveAttribute('data-experiment-mode','notebook');
        await root.locator('img').click({clickCount:3});
        await expect(root).toHaveAttribute('data-experiment-mode','notebook');
        await page.keyboard.press('Escape');
        await expect(page.locator('#lightboxOverlay')).not.toHaveClass(/open/);
        await root.locator('.experiment-notebook p').first().click({clickCount:3,delay:70});
        await expect(root).not.toHaveAttribute('data-experiment-mode');
        await expect(root).toContainText('Оригинал:');
        await figureUnchanged(page,root);
        expect(await root.evaluate(node=>{
            const copy=node.cloneNode(true), original=document.createElement('div');original.innerHTML=window.originalExperiment;
            for(const parent of [copy,original]) parent.querySelectorAll('button').forEach(button=>button.remove());
            return copy.innerHTML===original.innerHTML;
        })).toBe(true);
        await page.screenshot({path:'playwright-report/experiment-desktop.png',fullPage:false});
    });
    test('missing variants are inert; variant HTML is text, and editing restores the original',async ({page})=>{
        await network(page); await page.goto('/physics-10.html#opytnye-obosnovaniya-mkt');
        await expect.poll(()=>page.evaluate(()=>!!window.AlmanionExperiments)).toBe(true);
        await page.evaluate(html=>{const article=document.querySelector('.topic:has(.experiment-box)');article.innerHTML=html;article.hidden=false;article.style.display='block';},html);
        const root=page.locator('[data-note-block="notebook-test"]');
        await root.evaluate(node=>{node.removeAttribute('data-experiment-notebook');window.before=node.innerHTML;});
        await root.locator('strong').first().click({clickCount:3});
        expect(await root.evaluate(node=>node.innerHTML===window.before)).toBe(true);
        await root.evaluate(node=>{node.dataset.experimentNotebook='<img src=x onerror="window.bad=true"><script>window.bad=true</script>'; window.AlmanionExperiments.toggle(node);});
        await expect(root.locator('.experiment-notebook img,.experiment-notebook script')).toHaveCount(0);
        expect(await page.evaluate(()=>window.bad)).toBeUndefined();
        await root.evaluate(node=>{const button=document.createElement('button');button.className='note-inline-edit-button';button.textContent='Редактировать';node.closest('.topic').prepend(button);});
        await page.getByRole('button',{name:'Редактировать',exact:true}).click();
        await expect(root).toContainText('Оригинал:');
        await expect(root.locator('.experiment-notebook')).toHaveCount(0);
    });
});
test('constructor saves and restores the separate notebook field without altering the source',async ({page})=>{
    await network(page);
    await page.route('**/account.js?*',route=>route.fulfill({contentType:'text/javascript',body:`(${installAccount.toString()})();`}));
    await page.route('**/content/chemistry-10/manifest.json?*',route=>route.fulfill({json:{schemaVersion:1,subject:'chemistry-10',title:'Chemistry',sections:[]}}));
    await page.goto('/constructor.html?subject=chemistry-10&testRole=editor');
    await expect(page.locator('#builderShell')).toBeVisible();
    await page.locator('#newSectionButton').click();
    await page.locator('#newSectionTitle').fill('Test notebook experiment');
    await page.locator('#sectionDialogForm button[type="submit"]').click();
    await page.locator('#openBlockPickerButton').click();
    await page.locator('[data-create-block="experiment"]').click();
    const card=page.locator('.builder-block').filter({has:page.locator('[data-block-field="notebook"]')});
    await card.locator('[data-block-field="content"]').fill(block.content);
    await card.locator('[data-block-field="notebook"]').fill(block.notebook);
    await expect(page.locator('#saveStateText')).toHaveText('Все изменения сохранены');
    await page.reload();
    await expect(page.locator('[data-block-field="notebook"]')).toHaveValue(block.notebook);
    await expect(page.locator('.builder-block').filter({has:page.locator('[data-block-field="notebook"]')}).locator('[data-block-field="content"]')).toHaveValue(block.content);
});
test.describe('phone touch',()=>{
    test.use({serviceWorkers:'block',isMobile:true,hasTouch:true,viewport:{width:390,height:844}});
    test('three taps work on the regular mobile note without losing drawings',async ({page})=>{
        await network(page); await page.goto('/physics-10.html#opytnye-obosnovaniya-mkt');
        await expect.poll(()=>page.evaluate(()=>!!window.AlmanionExperiments)).toBe(true);
        await page.evaluate(html=>{const article=document.querySelector('.topic:has(.experiment-box)');article.innerHTML=html;article.hidden=false;article.style.display='block';},html);
        const root=page.locator('[data-note-block="notebook-test"]'); await reference(page,root);
        const target=root.locator(':scope > strong');
        await target.scrollIntoViewIfNeeded();
        for(let i=0;i<3;i++) await target.tap();
        await expect(root).toHaveAttribute('data-experiment-mode','notebook');
        await figureUnchanged(page,root);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({path:'playwright-report/experiment-phone.png',fullPage:false});
    });
});
test.describe('watch touch',()=>{
    test.use({serviceWorkers:'block',isMobile:true,hasTouch:true,viewport:{width:216,height:216}});
    async function setup(page) {
        await network(page);
        await page.route('**/watch/catalogue.json',route=>route.fulfill({json:{schemaVersion:1,subjects:[{id:'physics-10',title:'Физика',page:'physics-10.html',path:'data/test.json',grades:[10]}]}}));
        await page.route('**/watch/data/test.json',route=>route.fulfill({json:{schemaVersion:1,id:'physics-10',title:'Физика',page:'physics-10.html',topics:[{id:'test',title:'Опыт',count:1,ids:[block.id],parts:[{path:'data/blocks.json',count:1}]}]}}));
        await page.route('**/watch/data/blocks.json',route=>route.fulfill({json:{schemaVersion:1,blocks:[{id:block.id,type:'experiment',html}]}}));
        await page.goto('/watch/#read/physics-10/test/0');
        await expect(page.locator('[data-experiment]')).toBeVisible();
        return page.locator('[data-experiment]');
    }
    async function triple(page,target) {
        await target.evaluate(node=>window.scrollTo(0,scrollY+node.getBoundingClientRect().top-70));
        for (let i=0;i<3;i++) await target.tap();
    }
    test('three real taps switch both ways, formulas render and original drawing zoom still works',async ({page})=>{
        const root=await setup(page); await reference(page,root);
        await triple(page,root.locator(':scope > strong'));
        await expect(root).toHaveAttribute('data-experiment-mode','notebook');
        await expect(root.locator('.experiment-notebook .katex-display')).toHaveCount(1);
        await figureUnchanged(page,root);
        await root.getByRole('button',{name:'Увеличить рисунок',exact:true}).tap();
        await expect(page).toHaveURL(/#media\//);
        await expect(page.locator('.watch-media img')).toBeVisible();
        await page.getByRole('button',{name:'Назад',exact:true}).tap();
        await expect(page).toHaveURL(/#read\//);
        const next=page.locator('[data-experiment]');
        await expect(next).toHaveAttribute('data-experiment-mode','notebook');
        await triple(page,next.locator('.experiment-notebook p').first());
        await expect(next).not.toHaveAttribute('data-experiment-mode');
        await expect(next).toContainText('Оригинал:');
        await expect(next.locator('img')).toHaveCount(1);
        await expect(next.getByRole('button',{name:'Увеличить рисунок',exact:true})).toHaveCount(1);
        await page.screenshot({path:'playwright-report/experiment-watch.png',fullPage:true});
    });
    test('vertical drag and a cancelled pointer cannot become a triple tap',async ({page})=>{
        const root=await setup(page);
        await root.locator('strong').first().evaluate(node=>window.scrollTo(0,scrollY+node.getBoundingClientRect().top-70));
        await root.locator('strong').first().tap();
        await root.locator('strong').first().tap();
        await page.evaluate(()=>document.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1})));
        await root.locator('strong').first().tap();
        await expect(root.locator('.experiment-notebook')).toHaveCount(0);
        const session=await page.context().newCDPSession(page);
        await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:80,y:110,id:1}]});
        await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:82,y:45,id:1}]});
        await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await session.detach();
        await expect(root.locator('.experiment-notebook')).toHaveCount(0);
    });
});
