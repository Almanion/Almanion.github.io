'use strict';
const {test,expect} = require('@playwright/test');
test.use({serviceWorkers:'block',isMobile:true,hasTouch:true,viewport:{width:216,height:216}});

async function fixture(page, count=3) {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    const groups = [Array.from({length:count},(_,i) => 'a'+i),['table'],['b0','b1']];
    await page.route('**/watch/catalogue.json',route => route.fulfill({json:{schemaVersion:1,subjects:[{id:'physics-10',title:'Физика',page:'physics-10.html',path:'data/meta.json',grades:[10]}]}}));
    await page.route('**/watch/data/meta.json',route => route.fulfill({json:{schemaVersion:1,id:'physics-10',title:'Физика',page:'physics-10.html',topics:groups.map((ids,i) => ({id:['one','middle','two'][i],title:['Первый','Середина','Последний'][i],count:ids.length,ids,parts:[{path:'data/'+i+'.json',count:ids.length}]}))}}));
    for (const [i,ids] of groups.entries()) await page.route('**/watch/data/'+i+'.json',route => route.fulfill({json:{schemaVersion:1,blocks:ids.map(id => ({id,type:'definition',html:id==='table' ? '<table><tr>'+Array.from({length:20},(_,j)=>'<td>123456789-'+j+'</td>').join('')+'</tr></table>' : '<p><strong>Термин '+id+'</strong> — длинный текст определения для обычной вертикальной прокрутки на часах.</p>'}))}}));
}

async function touch(page,from,to) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from[0],y:from[1],id:0}]});
    for (let i=1;i<=4;i++) {
        await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from[0]+(to[0]-from[0])*i/4,y:from[1]+(to[1]-from[1])*i/4,id:0}]});
        await page.waitForTimeout(20);
    }
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await session.detach();
}
async function showText(page) {
    await page.locator('.watch-card').first().evaluate(node => window.scrollTo(0,scrollY+node.getBoundingClientRect().top-40));
    await page.waitForTimeout(100);
}

test('continuous section feed loads every block once and remembers the scrolled block',async ({page}) => {
    await fixture(page,25);
    await page.goto('/watch/#read/physics-10/one/0');
    await expect(page.locator('.watch-block')).toHaveCount(8);
    for (const count of [16,24,25]) {
        await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
        await expect(page.locator('.watch-block')).toHaveCount(count);
    }
    expect(await page.locator('.watch-block').evaluateAll(nodes=>nodes.map(node=>node.dataset.blockId))).toEqual(Array.from({length:25},(_,i)=>'a'+i));
    await page.locator('.watch-block[data-block-id="a17"]').evaluate(node=>window.scrollTo(0,scrollY+node.getBoundingClientRect().top));
    await expect.poll(()=>page.evaluate(()=>window.AlmanionWatch?.getState().reading?.index)).toBe(17);
    await page.reload();
    await expect.poll(()=>page.evaluate(()=>window.AlmanionWatch?.getState().reading?.index)).toBe(17);
    await expect(page.locator('.watch-block[data-block-id="a17"]')).toBeInViewport();
});

test('horizontal touch switches sections, not blocks; vertical touch scrolls the feed',async ({page}) => {
    await fixture(page);
    await page.goto('/watch/#read/physics-10/one/0');
    await expect(page.locator('.watch-block')).toHaveCount(3);
    await showText(page);
    await touch(page,[165,90],[45,92]);
    await expect(page).toHaveURL(/\/middle\/0$/);
    await page.locator('.watch-block-heading').evaluate(node=>window.scrollTo(0,scrollY+node.getBoundingClientRect().top-40));
    // Begin in the heading, not the horizontally scrollable table.
    await touch(page,[45,60],[165,62]);
    await expect(page).toHaveURL(/\/one\/0$/);
    await showText(page);
    const before = await page.evaluate(()=>scrollY);
    await touch(page,[100,165],[102,45]);
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(before+20);
    await expect(page).toHaveURL(/\/one\/\d+$/);
});

test('favorites remain a vertical feed and gestures skip sections with no saved blocks',async ({page}) => {
    await fixture(page);
    await page.goto('/watch/#read/physics-10/one/0');
    for (const id of ['a0','a2']) await page.locator('[data-block-id="'+id+'"]').getByRole('button',{name:'Добавить в избранное',exact:true}).tap();
    await page.goto('/watch/#read/physics-10/two/0');
    await page.locator('[data-block-id="b0"]').getByRole('button',{name:'Добавить в избранное',exact:true}).tap();
    await page.goto('/watch/#read/physics-10/one/0');
    await page.getByRole('button',{name:'Избранные',exact:true}).tap();
    await expect(page.locator('.watch-block')).toHaveCount(2);
    expect(await page.locator('.watch-block').evaluateAll(nodes=>nodes.map(node=>node.dataset.blockId))).toEqual(['a0','a2']);
    await showText(page);
    await touch(page,[165,90],[45,92]);
    await expect(page).toHaveURL(/\/two\/0$/);
    await expect(page.locator('.watch-block')).toHaveCount(1);
    await showText(page);
    await touch(page,[45,90],[165,92]);
    await expect(page).toHaveURL(/\/one\/0$/);
    await expect(page.locator('.watch-block')).toHaveCount(2);
});

test('selection, pinch and table pan do not change the section',async ({page}) => {
    await fixture(page);
    await page.goto('/watch/#read/physics-10/one/0');
    await showText(page);
    await page.locator('.watch-card strong').first().evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});
    await touch(page,[165,90],[45,92]);
    await expect(page).toHaveURL(/\/one\/\d+$/);
    await page.evaluate(()=>getSelection().removeAllRanges());
    const session=await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:80,y:90,id:0},{x:130,y:90,id:1}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:55,y:90,id:0},{x:155,y:90,id:1}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await session.detach();
    await expect(page).toHaveURL(/\/one\/\d+$/);
    await page.goto('/watch/#read/physics-10/middle/0');
    await page.locator('.watch-scroll').evaluate(node=>window.scrollTo(0,scrollY+node.getBoundingClientRect().top-70));
    await touch(page,[165,90],[45,92]);
    await expect(page).toHaveURL(/\/middle\/0$/);
    await expect.poll(()=>page.locator('.watch-scroll').evaluate(node=>node.scrollLeft)).toBeGreaterThan(20);
});

test('failed later batch retains the feed, does not retry forever and can recover',async ({page}) => {
    await fixture(page,16);
    let requests=0,fail=true;
    await page.route('**/watch/data/meta.json',route=>route.fulfill({json:{schemaVersion:1,id:'physics-10',title:'Физика',page:'physics-10.html',topics:[{id:'one',title:'Первый',count:16,ids:Array.from({length:16},(_,i)=>'a'+i),parts:[{path:'data/0.json',count:8},{path:'data/later.json',count:8}]}]}}));
    await page.route('**/watch/data/later.json',route=>{requests++;return fail?route.abort():route.fulfill({json:{schemaVersion:1,blocks:Array.from({length:8},(_,i)=>({id:'a'+(i+8),type:'text',html:'Следующий блок '+(i+8)}))}});});
    await page.goto('/watch/#read/physics-10/one/0');
    await expect(page.locator('.watch-block')).toHaveCount(8);
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    await expect(page.getByRole('button',{name:'Повторить',exact:true})).toBeVisible();
    await page.waitForTimeout(350);
    expect(requests).toBe(1);
    await expect(page.locator('.watch-block')).toHaveCount(8);
    fail=false;
    await page.getByRole('button',{name:'Повторить',exact:true}).tap();
    await expect(page.locator('.watch-block')).toHaveCount(16);
});
