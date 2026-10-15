'use strict';
const {test,expect}=require('@playwright/test');
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{
    await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
});
async function open(page){
    await page.goto('/chemistry-10.html');
    // Use the existing public launcher even when the sidebar is collapsed.
    await page.locator('#knowledgeCheckBtn').evaluate(e=>e.click());
    await expect(page.locator('#kcSelectOverlay')).toBeVisible();
}
async function rows(page){return page.evaluate(()=>window.__kcFSRS.extractCards([...document.querySelectorAll('article.topic')].map(t=>t.id),['table']));}
async function dark(page){
    if(!await page.evaluate(()=>typeof applyExperimental==='function'))await page.addScriptTag({url:'/settings.js'});
    await page.evaluate(()=>{Object.assign(siteSettings,{experimental:true,expMode:'prism',expDark:true,expTheme:'dark'});applyExperimental();});
    await expect(page.locator('body')).toHaveClass(/exp-dark/);
}
test('table rows use the name column, preserve diagrams and remain stable after rendering, reorder and answer edits',async({page})=>{
    await open(page);
    const before=await rows(page);
    expect(before).toHaveLength(35);
    expect(new Set(before.map(c=>c.id)).size).toBe(35);
    const acid=before.find(c=>c.term==='Карбоновые кислоты');
    expect(acid.termHTML).toBe('Карбоновые кислоты');
    expect(acid.backHTML).toContain('Структура');
    expect(acid.backHTML).toContain('-овая кислота');
    expect(acid.backHTML).toContain('<dd>—</dd>');
    expect(before.filter(c=>c.sourceId.includes('hybridization-table')).every(c=>c.backHTML.includes('<svg'))).toBe(true);
    await page.addScriptTag({path:require.resolve('katex/dist/katex.min.js')});
    await page.addScriptTag({path:require.resolve('katex/dist/contrib/auto-render.min.js')});
    await page.evaluate(()=>{
        renderMathInElement(document.querySelector('main'),{delimiters:[{left:'\\(',right:'\\)',display:false},{left:'\\[',right:'\\]',display:true}]});
        KC.reload('kc_fsrs_'+location.pathname,{});
    });
    const rendered=await rows(page);
    expect(rendered.map(c=>[c.id,c.contentHash])).toEqual(before.map(c=>[c.id,c.contentHash]));
    await page.evaluate(()=>{
        const body=document.querySelector('#alkane-series tbody');body.append(body.firstElementChild);
        document.querySelector('#alkyl-groups tbody tr td:nth-child(2)').textContent='Изменённый ответ';
        KC.reload('kc_fsrs_'+location.pathname,{});
    });
    const after=await rows(page);
    expect(after.map(c=>c.id).sort()).toEqual(before.map(c=>c.id).sort());
    expect(after.filter(c=>c.contentHash!==before.find(b=>b.id===c.id).contentHash)).toHaveLength(1);
});
for(const width of [1366,390,320])test('separate table section and readable answer at '+width,async({page})=>{
    await page.setViewportSize({width,height:844});await open(page);
    await page.addScriptTag({path:require.resolve('katex/dist/katex.min.js')});
    await page.addScriptTag({path:require.resolve('katex/dist/contrib/auto-render.min.js')});
    await page.addStyleTag({path:require.resolve('katex/dist/katex.min.css')});
    await expect(page.locator('#kcTypeList [data-kind="table"]')).toHaveCount(0);
    await page.locator('[data-section="tables"]').click();
    await expect(page.locator('#kcTableIntro')).toBeVisible();
    await expect(page.locator('#kcTypeList')).toBeHidden();
    await expect(page.locator('#kcDeckList .kc-deck')).toHaveCount(5);
    await expect(page.locator('#kcStartCount')).toHaveText('35');
    await page.locator('#kcSelectAll').click();
    await expect(page.locator('#kcStart')).toBeDisabled();
    await page.locator('.kc-deck[data-topic="funktsionalnye-gruppy-i-klassy"]').click();
    await expect(page.locator('#kcStartCount')).toHaveText('8');
    await page.locator('[data-section="blocks"]').click();
    await expect(page.locator('#kcTypeList')).toBeVisible();
    await page.locator('[data-section="tables"]').click();
    await expect(page.locator('#kcStartCount')).toHaveText('8');
    await page.locator('#kcStart').click();
    await expect(page.locator('.kc-kind-label')).toHaveText('Строка таблицы');
    await expect(page.locator('#kcBack')).toBeHidden();
    await expect(page.locator('#kcGrades')).toBeHidden();
    await page.locator('#kcFront').click();
    await expect(page.locator('#kcBack')).toBeVisible();
    await expect(page.locator('.kc-table-field')).toHaveCount(4);
    await expect(page.locator('#kcBack .katex')).toHaveCount(1);
    await expect(page.locator('#kcGoToSource')).toHaveText('К строке в конспекте');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    expect(await page.locator('#kcReviewModal').evaluate(e=>e.scrollWidth-e.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({path:'playwright-report/table-row-'+width+'.png'});
});
test('row progress survives reload; paused table session resumes and links back to its row',async({page})=>{
    await open(page);await page.locator('[data-section="tables"]').click();await page.locator('#kcStart').click();
    await page.locator('#kcFront').click();await page.locator('.kc-grade[data-g="4"]').click();
    const progress=await page.evaluate(()=>JSON.parse(AlmanionKCStorage.get('kc_fsrs_'+location.pathname)));
    expect(Object.keys(progress).filter(k=>k.includes(':table:'))).toHaveLength(1);
    await page.locator('#kcPauseBtn').click();await page.reload();
    await page.locator('#knowledgeCheckBtn').evaluate(e=>e.click());
    await expect(page.locator('[data-section="tables"]')).toHaveAttribute('aria-pressed','true');
    await page.locator('#kcResumeSession').click();
    await expect(page.locator('#kcProgressCopy')).toHaveText('Закреплено 1 из 35');
    const term=await page.locator('.kc-flashcard-term').textContent();
    await page.locator('#kcGoToSource').click();
    await expect(page.locator('#kcReviewOverlay')).toBeHidden();
    expect(await page.locator('article.topic:visible tr[data-kc-row-source]').allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining(term)]));
});
test('merged, ignored, and layout tables are not presented as incomplete questions',async({page})=>{
    await open(page);
    const count=await page.evaluate(()=>{
        const t=document.querySelector('article.topic');
        t.insertAdjacentHTML('beforeend','<table><tr><td>Layout</td><td>Text</td></tr></table><table><thead><tr><th>Name</th><th>Answer</th></tr></thead><tbody><tr><td rowspan="2">A</td><td>1</td></tr><tr><td>2</td></tr></tbody></table><table data-kc-ignore="true"><thead><tr><th>Name</th><th>Answer</th></tr></thead><tbody><tr><td>B</td><td>3</td></tr></tbody></table>');
        KC.reload('kc_fsrs_'+location.pathname,{});
        return __kcFSRS.extractCards([t.id],['table']).length;
    });expect(count).toBe(0);
});
test('table session can be undone and completed in dark mode',async({page})=>{
    await open(page);await dark(page);await page.locator('[data-section="tables"]').click();
    await page.locator('#kcSelectAll').click();
    await page.locator('.kc-deck[data-topic="valentnost-i-stepen-okisleniya"]').click();
    await expect(page.locator('#kcStartCount')).toHaveText('2');
    await page.screenshot({path:'playwright-report/table-selection-dark.png'});
    await page.locator('#kcStart').click();
    await page.locator('#kcFront').click();await page.locator('.kc-grade[data-g="4"]').click();
    await page.locator('#kcUndoBtn').click();
    await expect(page.locator('#kcProgressCopy')).toHaveText('Закреплено 0 из 2');
    for(let i=0;i<2;i++){
        await page.locator('#kcFront').click();await page.locator('.kc-grade[data-g="4"]').click();
    }
    await expect(page.locator('.kc-final-title')).toHaveText('Сессия завершена');
    await expect(page.locator('.kc-fstat-lbl').first()).toHaveText('строки');
    await page.locator('#kcDone').click();
    await expect(page.locator('#kcReviewOverlay')).toBeHidden();
});
test('orbital diagrams in a table answer follow the dark theme',async({page})=>{
    await open(page);await dark(page);await page.locator('[data-section="tables"]').click();
    await page.locator('#kcSelectAll').click();
    await page.locator('.kc-deck[data-topic="tipy-gibridizatsii"]').click();
    await page.locator('#kcStart').click();await page.locator('#kcFront').click();
    await expect(page.locator('#kcBack svg')).toHaveCount(2);
    const colors=await page.locator('#kcBack svg').first().evaluate(svg=>({paper:getComputedStyle(svg.querySelector('rect')).fill,ink:getComputedStyle(svg.querySelector('text')).fill}));
    expect(colors.paper).not.toBe('rgb(255, 255, 255)');expect(colors.ink).not.toBe(colors.paper);
    await page.locator('#kcBack svg').first().scrollIntoViewIfNeeded();
    await page.screenshot({path:'playwright-report/table-diagrams-dark.png'});
});
