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
                : { success: true, tasks: data.action === 'campTasks' ? (options.campTasks || camp)
                    : data.action === 'academicYearTasks' ? (options.yearTasks || []) : tasks, isAdmin: false } });
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
        const auth = { currentUser: user, async signOut() { auth.currentUser = null; }, onAuthStateChanged(callback) { setTimeout(() => callback(user), 0); return () => {}; } };
        let data = JSON.parse(localStorage.getItem('mc-test-remote') || '{"grade-9__12":{"solved":true,"updatedAt":1}}');
        const callbacks = new Set();
        const snapshot = () => ({ val: () => data });
        const ref = { once: async () => snapshot(), on(_event, callback) { callbacks.add(callback); setTimeout(() => callback(snapshot()), 0); },
            off() { callbacks.clear(); }, async update(patch) { if(window.__mcFailWrites) throw new Error('Test offline'); Object.assign(data, patch); localStorage.setItem('mc-test-remote', JSON.stringify(data)); callbacks.forEach(c => c(snapshot())); },
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

test('published HTML must not reuse the old cached Matcenter runtime for printing',async({page})=>{
    const errors=await setup(page);
    await page.route('**/matcenter/runtime.js?v=20261014-print2',route=>route.fulfill({contentType:'application/javascript',
        body:'window.MatcenterRuntime={ensure:()=>Promise.reject(new Error("Stale cached runtime"))};'}));
    await page.goto('/matcenter.html?grade=grade-10'); await ready(page);
    await expect(page.locator('script[src^="matcenter/runtime.js"]')).toHaveAttribute('src','matcenter/runtime.js?v=20261015-sum-limits');
    await page.locator('#mcPrintButton').click();
    await expect(page.locator('#mcPrintDialog')).toBeVisible();
    expect(errors).toEqual([]);
});

test('series printing keeps every original condition and number, ignores filters and does not alter marks', async ({page}) => {
    const yearTasks = [25,16,19].map(number => ({number,numberText:String(number),grade:'grade-10',academicYear:'2026/2027',
        taskId:`print-${number}`,seriesId:'print-series',seriesTitle:'Серия 2',description:`Условие ${number}: $x^2=4$.`,hint:'СЕКРЕТНАЯ ПОДСКАЗКА',status:number===19?'Н':'Р'}));
    const errors = await setup(page,{tasks:[],yearTasks});
    await page.goto('/matcenter.html?grade=grade-10'); await ready(page);
    expect(await page.evaluate(() => !!window.MatcenterSeriesPrint)).toBe(false);
    await page.locator('#mcSeriesSelect').selectOption({label:'Серия 2'});
    await page.locator('#searchInput').fill('16');
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(1);
    const marks = await page.evaluate(() => localStorage.getItem('mc-test-remote'));
    await page.locator('#mcPrintButton').click();
    await expect(page.locator('#mcPrintDialog')).toBeVisible();
    await expect(page.locator('#mcPrintCount')).toContainText('3 задачи');
    await page.evaluate(() => { window.AlmanionPdfDownload = {generateHandouts:async(handouts,title,options)=>{
        window.__printSnapshot={handouts,title,options}; return new Blob(['%PDF-fixture'],{type:'application/pdf'});
    }}; });
    await page.locator('[data-mc-print-action="preview"]').click();
    await expect(page.locator('#mcPrintPreview')).toBeVisible();
    const snapshot = await page.evaluate(() => window.__printSnapshot);
    expect(snapshot.handouts).toEqual([{heading:'',tasks:yearTasks.slice().sort((a,b)=>a.number-b.number).map(({number,numberText,description})=>({number,numberText,description}))}]);
    expect(snapshot.options).toEqual({autoPrint:false});
    expect(JSON.stringify(snapshot)).not.toContain('СЕКРЕТНАЯ');
    await page.keyboard.press('Escape');
    await expect(page.locator('#mcPrintDialog')).toBeHidden();
    await expect(page.locator('#mcPrintFrame')).toHaveAttribute('src','about:blank');
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(1);
    expect(await page.evaluate(() => localStorage.getItem('mc-test-remote'))).toBe(marks);
    await expect(page.locator('#mcPrintButton')).toBeFocused();
    expect(errors).toEqual([]);
});

test('multiple series print in list order; unreviewed compilation uses shared status, not personal marks or search',async({page})=>{
    const yearTasks = [
        {number:16,seriesId:'s2',seriesTitle:'Серия 2',status:'Н'},
        {number:17,seriesId:'s2',seriesTitle:'Серия 2',status:'Р'},
        {number:110,seriesId:'s12',seriesTitle:'Серия 12',status:'От'},
        {number:111,seriesId:'s12',seriesTitle:'Серия 12',status:'П'},
        {number:112,seriesId:'s12',seriesTitle:'Серия 12',status:'Р'}
    ].map(t=>({...t,numberText:String(t.number),taskId:'print-'+t.number,grade:'grade-10',academicYear:'2026/2027',description:'Условие '+t.number+'.',hint:'НЕ ПЕЧАТАТЬ'}));
    const errors=await setup(page,{tasks:[],yearTasks});
    await page.goto('/matcenter.html?grade=grade-10');await ready(page);
    await page.locator('.task-card').filter({has:page.getByText('Задача 16',{exact:true})}).locator('.task-solved-check').click();
    const marks=await page.evaluate(()=>localStorage.getItem('mc-test-remote'));
    await page.locator('#mcSeriesSelect').selectOption({label:'Серия 2'});
    await page.locator('#searchInput').fill('16');
    await page.locator('#mcPrintButton').click();
    await expect(page.getByRole('checkbox',{name:'Серия 2',exact:true})).toBeChecked();
    await page.locator('#mcPrintClear').click();
    await expect(page.locator('[data-mc-print-action="preview"]')).toBeDisabled();
    await page.locator('#mcPrintSelectAll').click();
    await expect(page.locator('#mcPrintSeries input:checked')).toHaveCount(2);
    await page.getByRole('checkbox',{name:'Серия 12',exact:true}).check();
    await page.evaluate(()=>{window.AlmanionPdfDownload={generateHandouts:async(handouts,title,options)=>{
        window.__printSnapshot={handouts,title,options};return new Blob(['test'],{type:'application/pdf'});
    }}});
    await page.locator('[data-mc-print-action="preview"]').click();
    await expect(page.locator('#mcPrintPreview')).toBeVisible();
    expect(await page.evaluate(()=>window.__printSnapshot.handouts.map(h=>h.tasks.map(t=>t.number)))).toEqual([[110,111,112],[16,17]]);
    await page.getByRole('button',{name:'Назад',exact:true}).click();
    await page.getByRole('radio',{name:'Неразобранные',exact:true}).check();
    await expect(page.locator('#mcPrintSeriesSelection')).toBeHidden();
    await expect(page.locator('#mcPrintCount')).toContainText('3 задачи');
    await page.locator('[data-mc-print-action="preview"]').click();
    await expect(page.locator('#mcPrintPreview')).toBeVisible();
    const snapshot=await page.evaluate(()=>window.__printSnapshot);
    expect(snapshot.handouts[0].tasks.map(t=>t.number)).toEqual([16,110,111]);
    expect(snapshot.handouts[0].tasks.every(t=>Object.keys(t).sort().join(',')==='description,number,numberText')).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain('НЕ ПЕЧАТАТЬ');
    expect(await page.evaluate(()=>localStorage.getItem('mc-test-remote'))).toBe(marks);
    await page.keyboard.press('Escape');expect(errors).toEqual([]);
});

test('legacy archives can print unreviewed tasks without invented series',async({page})=>{
    const errors=await setup(page);
    await page.goto('/matcenter.html?grade=grade-9');await ready(page);
    await page.locator('#mcPrintButton').click();
    await expect(page.getByRole('radio',{name:'Целые серии',exact:true})).toBeDisabled();
    await expect(page.getByRole('radio',{name:'Неразобранные',exact:true})).toBeChecked();
    await expect(page.locator('#mcPrintCount')).toContainText('130 задач');
    await expect(page.locator('[data-mc-print-action="print"]')).toBeEnabled();
    await page.keyboard.press('Escape');expect(errors).toEqual([]);
});

test('vector handouts share exact text/math baselines and pack two halves per A4 without clipping',async({page},info)=>{
    test.setTimeout(90000);
    const errors=await setup(page);
    await page.goto('/matcenter.html?grade=grade-10');await ready(page);
    await page.addScriptTag({url:'/pdf-download.js'});
    const result=await page.evaluate(async()=>{
        const handout={tasks:[{number:116,description:'Пересекаются в точках $A$ и $E$. Прямая $AB$ проходит через точку $M$.'}]};
        await AlmanionPdfDownload.generateHandout(handout.tasks,'Загрузка шрифтов');
        let definition; const create=pdfMake.createPdf.bind(pdfMake);
        pdfMake.createPdf=d=>{definition=d;return create(d)};
        const pair=await AlmanionPdfDownload.generateHandouts([handout,{tasks:[{number:99,description:'Неизменённое условие.'}]}],'Две серии');
        const pairDefinition=definition;
        const svg=new DOMParser().parseFromString(pairDefinition.content[0].stack[0].svg,'image/svg+xml').documentElement;
        const baseline=Number(svg.querySelector('text').getAttribute('y'));
        const math=[...svg.children].filter(node=>node.tagName==='g').map(node=>{
            const inner=node.querySelector('svg'),y=Number(node.getAttribute('transform').match(/translate\([^,]+,([\d.]+)\)/)[1]);
            const [,top,,height]=inner.getAttribute('viewBox').split(' ').map(Number);
            return y-top/height*Number(inner.getAttribute('height'));
        });
        const three=await AlmanionPdfDownload.generateHandouts([handout,handout,handout],'Три серии');
        const threeDefinition=definition;
        const long=await AlmanionPdfDownload.generateHandout([{number:88,description:'Неизменённая длинная задача. '.repeat(350)}],'Продолжение');
        const longDefinition=definition;
        let headingCenters=[];
        pdfMake.createPdf=d=>{
            const doc=create(d), getStream=doc.getStream.bind(doc);
            doc.getStream=options=>{
                const stream=getStream(options);
                headingCenters=stream._pdfMakePages.flatMap(p=>p.items.filter(i=>i.type==='line').map(i=>i.item.x+i.item.getWidth()/2));
                return stream;
            };
            return doc;
        };
        await AlmanionPdfDownload.generateHandouts([1,2].map(n=>({...handout,heading:'Добавка №'+n+'. 8 августа 2026 года.'})),'Лагерь');
        return {baselineError:Math.max(...math.map(y=>Math.abs(y-baseline))),
            headingCenters,
            pair:[...new Uint8Array(await pair.arrayBuffer())],three:[...new Uint8Array(await three.arrayBuffer())],long:[...new Uint8Array(await long.arrayBuffer())],
            pairPositions:pairDefinition.content[0].stack.map(node=>node.absolutePosition.y),
            thirdPositions:threeDefinition.content[1].stack.map(node=>node.absolutePosition.y),
            longBounds:longDefinition.content.flatMap(page=>page.stack.map(node=>({y:node.absolutePosition.y,h:Number(node.svg.match(/height="([\d.]+)"/)[1])*.75})))};
    });
    expect(result.baselineError).toBeLessThan(.15);
    expect(result.headingCenters).toHaveLength(2);
    result.headingCenters.forEach(center=>expect(center).toBeCloseTo(297.64));
    const pages=bytes=>(Buffer.from(bytes).toString('latin1').match(/\/Type\s+\/Page\s/g)||[]).length;
    expect(pages(result.pair)).toBe(1);expect(pages(result.three)).toBe(2);expect(pages(result.long)).toBeGreaterThan(1);
    expect(result.pairPositions[0]).toBeCloseTo(22.68);expect(result.pairPositions[1]).toBeCloseTo(443.625);
    expect(result.thirdPositions.every(y=>y<420.945)).toBe(true);
    result.longBounds.forEach(({y,h})=>{const slot=y>=420.945?420.945:0;expect(y).toBeGreaterThanOrEqual(slot+22.68-.01);expect(y+h).toBeLessThanOrEqual(slot+420.945-22.68+.01);});
    require('node:fs').writeFileSync(info.outputPath('two-up.pdf'),Buffer.from(result.pair));
    expect(errors).toEqual([]);
});

test('handout sums put limits above and below without changing source text or note exports',async({page},info)=>{
    test.setTimeout(90000);
    const errors=await setup(page);
    await page.goto('/matcenter.html?grade=grade-10');await ready(page);
    await page.addScriptTag({url:'/pdf-download.js'});
    const result=await page.evaluate(async()=>{
        const warmup=document.createElement('article');warmup.textContent='Загрузка шрифтов.';
        await AlmanionPdfDownload.generate([{element:warmup}],'Загрузка');
        const tasks=[
            {number:1,description:'Сумма в строке: $\\sum_{i=1}^{n} \\frac{a_i}{2-a_i}$. Индексы над и под знаком.'},
            {number:2,description:'Только нижний индекс: $\\sum_i a_i$.'},
            {number:3,description:'Явное расположение: $\\sum\\limits_{k=0}^{m} k^2$.'},
            {number:4,description:'Явное исключение в исходном TeX: $\\sum\\nolimits_{k=0}^{m} k^2$.'},
            {number:5,description:'Имя команды не обрезается: $\\newcommand{\\summary}{q}\\summary + \\sum_j a_j$.'}
        ];
        const original=JSON.stringify(tasks),texCalls=[];
        const render=MathJax.tex2svgPromise.bind(MathJax);
        MathJax.tex2svgPromise=(tex,options)=>{texCalls.push(tex);return render(tex,options)};
        let definition;const create=pdfMake.createPdf.bind(pdfMake);
        pdfMake.createPdf=d=>{definition=d;return create(d)};
        const noteSource='\\sum_{i=1}^{n} a_i';
        const note=document.createElement('article');note.textContent='Формула в конспекте: $'+noteSource+'$.';
        await AlmanionPdfDownload.generate([{element:note}],'Конспект');
        const noteTex=texCalls.pop();
        const blob=await AlmanionPdfDownload.generateHandout(tasks,'Расположение индексов суммы');
        const vectors=definition.content.flatMap(p=>p.stack.map(node=>node.svg));
        const docs=vectors.map(svg=>new DOMParser().parseFromString(svg,'image/svg+xml'));
        const limits=docs.flatMap(doc=>[...doc.querySelectorAll('path[data-c="2211"]')].map(path=>
            path.closest('[data-mml-node="munderover"],[data-mml-node="munder"],[data-mml-node="msubsup"],[data-mml-node="msub"]').getAttribute('data-mml-node')));
        const fontSizes=docs.flatMap(doc=>[...doc.querySelectorAll('text[font-size]')].map(node=>Number(node.getAttribute('font-size'))*.75));
        return {bytes:[...new Uint8Array(await blob.arrayBuffer())],limits,fontSizes,
            unchanged:JSON.stringify(tasks)===original,texCalls,noteSource,noteTex};
    });
    expect(result.unchanged).toBe(true);
    expect(result.limits).toEqual(['munderover','munder','munderover','msubsup','munder']);
    expect(result.fontSizes.length).toBeGreaterThan(10);
    result.fontSizes.forEach(size=>expect(size).toBeCloseTo(10,4));
    expect(result.texCalls[0]).toContain('\\sum\\limits_{i=1}');
    expect(result.texCalls[2]).not.toContain('\\limits\\limits');
    expect(result.texCalls[3]).toContain('\\sum\\nolimits');
    expect(result.texCalls[4]).toContain('\\summary + \\sum\\limits_j');
    expect(result.noteTex).toBe(result.noteSource);
    require('node:fs').writeFileSync(info.outputPath('sum-limits.pdf'),Buffer.from(result.bytes));
    expect(errors).toEqual([]);
});

for (const old of [false,true]) test(`series print dialog is usable at 320px, old=${old}`,async({page},info)=>{
    const errors=await setup(page,{old,dark:true});
    await page.setViewportSize({width:320,height:760});
    await page.goto('/matcenter.html?grade=grade-10'); await ready(page);
    const button=await page.locator('#mcPrintButton').boundingBox();
    expect(button.x).toBeGreaterThanOrEqual(0); expect(button.x+button.width).toBeLessThanOrEqual(320);
    await page.keyboard.press('Control+p');
    await expect(page.getByRole('radio',{name:'Целые серии',exact:true})).toBeFocused();
    await expect(page.locator('[data-mc-print-action="print"]')).toBeDisabled();
    await page.getByRole('checkbox',{name:'Серия 1. Геометрия',exact:true}).check();
    await expect(page.locator('[data-mc-print-action="print"]')).toBeEnabled();
    const bounds=await page.locator('#mcPrintDialog .print-export-dialog').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x+bounds.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.screenshot({path:info.outputPath(`print-dialog-320-${old}.png`)});
    await page.keyboard.press('Escape'); expect(errors).toEqual([]);
});

test('real series PDF keeps serif Cyrillic and math, no invented heading/footer; print uses PDF action',async({page},info)=>{
    test.setTimeout(90000);
    const yearTasks=[16,25].map(number=>({number,grade:'grade-10',taskId:`pdf-${number}`,seriesId:'pdf-series',seriesTitle:'Серия 2',academicYear:'2026/2027',
        description:number===16?'Даны числа $a,b>0$. Докажите, что $\\frac{a^2+b^2}{2} \\geq ab$.':'Найдите $x \\in \\mathbb{R}$.\n$$\\left[\\begin{aligned}x^2&=4\\\\y&=1.\\end{aligned}\\right.$$\nСохраните условие.'}));
    const errors=await setup(page,{tasks:[],yearTasks});
    await page.goto('/matcenter.html?grade=grade-10'); await ready(page);
    await page.locator('#mcPrintButton').click();
    await page.getByRole('checkbox',{name:'Серия 2',exact:true}).check();
    await page.evaluate(()=>{window.print=()=>{throw Error('Do not print cards')};});
    await page.locator('[data-mc-print-action="print"]').click();
    await expect(page.locator('#mcPrintPreview')).toBeVisible({timeout:80000});
    const result=await page.evaluate(async()=>({bytes:Array.from(new Uint8Array(await(await fetch(document.getElementById('mcPrintFrame').src)).arrayBuffer()))}));
    const bytes=require('node:buffer').Buffer.from(result.bytes), source=bytes.toString('latin1');
    require('node:fs').writeFileSync(info.outputPath('series-print.pdf'),bytes);
    expect(source).toMatch(/^%PDF-/); expect(source).toMatch(/CMUSerif/);
    expect(source).toMatch(/\/S\s+\/Named\s+\/N\s+\/Print/);
    expect(bytes.length).toBeGreaterThan(10000);
    await page.evaluate(()=>logout());
    await expect(page.locator('#mcPrintDialog')).toBeHidden();
    await expect(page.locator('#mcPrintFrame')).toHaveAttribute('src','about:blank');
    await expect(page.locator('#mcPrintButton')).toBeDisabled();
    expect(errors).toEqual([]);
});

test('exiting during PDF preparation cancels delivery',async({page})=>{
    const errors=await setup(page);
    await page.goto('/matcenter.html?grade=grade-10'); await ready(page);
    await page.locator('#mcPrintButton').click();
    await page.getByRole('checkbox',{name:'Серия 1. Геометрия',exact:true}).check();
    await page.evaluate(()=>{window.AlmanionPdfDownload={generateHandouts:()=>new Promise(resolve=>{window.__finishPrint=resolve;})};});
    await page.locator('[data-mc-print-action="preview"]').click();
    await expect.poll(()=>page.evaluate(()=>typeof window.__finishPrint)).toBe('function');
    await page.evaluate(()=>{logout();window.__finishPrint(new Blob(['late'],{type:'application/pdf'}));});
    await expect(page.locator('#mcPrintDialog')).toBeHidden();
    await expect(page.locator('#mcPrintFrame')).toHaveAttribute('src','about:blank');
    expect(errors).toEqual([]);
});

test('handout export handles multiple pages, preserves camp heading and rejects malformed math',async({page},info)=>{
    test.setTimeout(90000);
    const errors=await setup(page);
    await page.goto('/matcenter.html?grade=grade-camp-2026'); await ready(page);
    await page.locator('#mcSeriesSelect').selectOption({label:'Добавка №1. 8 августа 2026 года. · 08.08.2026'});
    await page.locator('#mcPrintButton').click();
    await page.evaluate(()=>{window.AlmanionPdfDownload={generateHandouts:async(handouts)=>{
        window.__campHeading=handouts[0].heading; return new Blob(['test'],{type:'application/pdf'});
    }};});
    await page.locator('[data-mc-print-action="preview"]').click();
    await expect(page.locator('#mcPrintPreview')).toBeVisible();
    expect(await page.evaluate(()=>window.__campHeading)).toBe('Добавка №1. 8 августа 2026 года.');
    await page.keyboard.press('Escape');
    await page.addScriptTag({url:'/pdf-download.js'});
    const result=await page.evaluate(async()=>{
        let error='';
        try{await AlmanionPdfDownload.generateHandout([{number:1,description:'$\\frac{1}$'}],'Опечатка');}catch(e){error=e.message;}
        const tasks=Array.from({length:80},(_,i)=>({number:16+i,description:'Проверка длинной серии. Исходные номера не меняются. $x^2=4$.'}));
        const blob=await AlmanionPdfDownload.generateHandout(tasks,'Длинная серия');
        return {error,bytes:Array.from(new Uint8Array(await blob.arrayBuffer())),leftover:document.querySelectorAll('body > div[style*="-10000px"]').length};
    });
    const bytes=Buffer.from(result.bytes),source=bytes.toString('latin1');
    require('node:fs').writeFileSync(info.outputPath('long-series.pdf'),bytes);
    expect((source.match(/\/Type\s+\/Page\s/g)||[]).length).toBeGreaterThan(1);
    expect(result.error).toContain('Не удалось оформить одну из формул');
    expect(result.leftover).toBe(0); expect(errors).toEqual([]);
});

for (const dark of [false,true]) test(`new-year series and independent part progress persist, dark=${dark}`, async ({page},info) => {
    const yearTasks = [
        {number:50,taskId:'g10-2026-t050',seriesId:'g10-2026-s05',seriesTitle:'Серия 5',parts:['a','b','c'],status:'Р'},
        {number:53,taskId:'g10-2026-t053',seriesId:'g10-2026-s05',seriesTitle:'Серия 5',parts:'["a","b"]',status:'От'},
        {number:110,taskId:'g10-2026-t110',seriesId:'g10-2026-s12',seriesTitle:'Серия 12',parts:['a','b'],status:'Н'}
    ].map(task=>({...task,grade:'grade-10',academicYear:'2026/2027',description:'Сохранённый текст: a) $x^2$; b) $y^2$; c) $z^2$.'}));
    const errors = await setup(page,{dark,realMath:true,tasks:[],yearTasks});
    await page.setViewportSize({width:1440,height:1000});
    await page.goto('/matcenter.html?grade=grade-10&view=reading');
    await ready(page);
    await expect(page.locator('.mc-series-divider')).toHaveText(['Серия 12','Серия 5']);
    expect(await page.locator('#mcSeriesSelect option').allTextContents()).toEqual(['Все задачи','Серия 12','Серия 5']);
    await expect(page.locator('.mc-task-context, .mc-task-parts-label, .mc-task-parts-count, #personalSolvedPartsCount')).toHaveCount(0);
    await expect(page.locator('#shareSolvedTasksBtn svg circle')).toHaveCount(3);
    const card = page.locator('.task-card').filter({has:page.getByText('Задача 50',{exact:true})});
    const a = card.locator('[data-part="a"]'), b = card.locator('[data-part="b"]'), c = card.locator('[data-part="c"]');
    await a.click();
    await expect(a).toHaveAttribute('aria-pressed','true');
    await expect(b).toHaveAttribute('aria-pressed','false');
    await expect(card.locator('.task-number-wrap .mc-task-parts')).toBeVisible();
    await expect(card.locator('.mc-task-part')).toHaveText(['a','b','c']);
    await expect(page.locator('#solvedCount')).toHaveText('0,33');
    await expect(page.locator('#solvedProgressPercent')).toHaveText('11,11%');
    await expect(page.locator('#solvedProgressPercent')).toBeVisible();
    await page.reload();
    await expect(a).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('#solvedCount')).toHaveText('0,33');
    await b.click(); await c.click();
    await expect(card.locator('.task-solved-check')).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('#solvedCount')).toHaveText('1');
    await expect(page.locator('#solvedProgressPercent')).toHaveText('33,33%');
    await b.click();
    await expect(card.locator('.task-solved-check')).toHaveAttribute('aria-pressed','false');
    await expect(a).toHaveAttribute('aria-pressed','true');
    await expect(c).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('#solvedCount')).toHaveText('0,67');
    await card.locator('.task-solved-check').click();
    await expect(card.locator('.mc-task-part[aria-pressed="true"]')).toHaveCount(3);
    await card.locator('.task-solved-check').click();
    await expect(card.locator('.mc-task-part[aria-pressed="false"]')).toHaveCount(3);
    await page.evaluate(()=>window.__mcFailWrites=true);
    await a.click();
    await expect(a).toHaveAttribute('aria-pressed','true');
    await page.reload();
    await expect(a).toHaveAttribute('aria-pressed','true');
    await expect.poll(()=>page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('mc-test-remote'))).some(e=>e.partId==='a'&&e.solved))).toBe(true);
    await expect(page.locator('#personalSolvedPartsCount')).toHaveCount(0);
    await expect(page.locator('#solvedCount')).toHaveText('0,33');
    // Selecting a series changes the denominator, not the stored point marks.
    await page.locator('#mcSeriesSelect').selectOption(model.seriesKey({...yearTasks[0],_endpointIdx:3}));
    await expect(page.locator('#solvedProgressPercent')).toHaveText('16,67%');
    await page.locator('#mcSeriesSelect').selectOption('');
    expect(await page.evaluate(()=>allTasks.find(t=>t.number===50).description)).toBe(yearTasks[0].description);
    for (const width of [1440,320]) {
        await page.setViewportSize({width,height:1000});
        expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
        const letters = await a.boundingBox(), number = await card.locator('.task-number-label').boundingBox();
        expect(letters.height).toBeLessThanOrEqual(30);
        expect(Math.abs(letters.y-number.y)).toBeLessThan(12);
        expect(letters.x-(number.x+number.width)).toBeLessThan(20);
        expect(await a.evaluate(el=>getComputedStyle(el).borderRadius)).toBe('50%');
        expect((await page.locator('#shareSolvedTasksBtn').boundingBox()).width).toBeLessThanOrEqual(32);
        for (const view of ['compact','reading']) {
            await page.evaluate(view=>setMatcenterReadingMode(view),view);
            for (const [status,color] of [['solved',dark?'rgb(74, 222, 128)':'rgb(20, 117, 56)'],['postponed','rgb(239, 68, 68)'],['current-series',dark?'rgb(251, 146, 60)':'rgb(180, 64, 8)']]) {
                const sample = page.locator('.task-card.'+status);
                await expect.poll(()=>sample.evaluate(el=>getComputedStyle(el).borderLeftColor)).toBe(color);
                expect(await sample.evaluate(el=>getComputedStyle(el).backgroundImage)).not.toBe('none');
            }
        }
        await page.screenshot({path:info.outputPath(`year-series-parts-${width}.png`)});
    }
    await page.goto('/matcenter.html?grade=grade-camp-2026');
    await ready(page);
    await expect(page.locator('.mc-task-parts')).toHaveCount(0);
    expect(errors).toEqual([]);
});

for (const dark of [false,true]) test(`all four status accents survive compact and open reading cards, dark=${dark}`, async ({page}) => {
    const tasks = ['Р','Н','П','От'].map((status,index)=>({number:index+1,grade:'grade-10',description:'Неизменённое условие.',status}));
    const errors=await setup(page,{dark,tasks});
    await page.goto('/matcenter.html?grade=grade-10');
    await ready(page);
    const colors=[dark?'rgb(74, 222, 128)':'rgb(20, 117, 56)',dark?'rgb(251, 146, 60)':'rgb(180, 64, 8)',dark?'rgb(167, 139, 250)':'rgb(124, 58, 237)','rgb(239, 68, 68)'];
    for (const width of [1440,320]) {
        await page.setViewportSize({width,height:1000});
        for (const view of ['compact','reading']) {
            await page.evaluate(view=>setMatcenterReadingMode(view),view);
            for (const [index,status] of ['solved','current-series','with-hint','postponed'].entries()) {
                const card=page.locator('.task-card.'+status);
                await expect.poll(()=>card.evaluate(el=>getComputedStyle(el).borderLeftColor)).toBe(colors[index]);
                expect(await card.evaluate(el=>getComputedStyle(el).borderLeftWidth)).toBe('3px');
                expect(await card.evaluate(el=>getComputedStyle(el).backgroundImage)).not.toBe('none');
            }
        }
    }
    expect(errors).toEqual([]);
});

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

for (const old of [false, true]) test(`series pickers are compact, newest first and keyboard usable, old=${old}`, async ({ page }, info) => {
    const yearTasks = [2, 12, 10].map(series => ({ number: series * 10, grade: 'grade-10',
        taskId: 'picker-' + series, seriesId: 'picker-' + series, seriesTitle: 'Серия ' + series,
        academicYear: '2026/2027', description: 'Исходное условие.' }));
    const errors = await setup(page, { tasks: [], yearTasks, old, dark: old });
    for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 850 });
        await page.goto('/matcenter.html?grade=grade-10'); await ready(page);
        const select = page.locator('#mcSeriesSelect');
        expect(await select.locator('option').allTextContents()).toEqual(['Все задачи', 'Серия 12', 'Серия 10', 'Серия 2']);
        await expect(select.locator('option').nth(1)).toHaveAttribute('data-detail', '№ 120');
        await select.click();
        const bounds = await select.evaluate(el => ({
            options: [...el.options].map(option => { const rect = option.getBoundingClientRect(); return { left: rect.left, right: rect.right }; }),
            radius: getComputedStyle(el, '::picker(select)').borderRadius,
            range: getComputedStyle(el.options[1], '::after').content,
            background: getComputedStyle(el, '::picker(select)').backgroundColor,
            color: getComputedStyle(el.options[1]).color
        }));
        expect(bounds.radius).toBe('14px'); expect(bounds.range).toBe('"№ 120"');
        const luminance = rgb => {
            const channels = rgb.match(/\d+/g).slice(0, 3).map(n => Number(n) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
            return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        };
        const values = [luminance(bounds.background), luminance(bounds.color)].sort((a, b) => a - b);
        expect((values[1] + .05) / (values[0] + .05)).toBeGreaterThanOrEqual(4.5);
        bounds.options.forEach(rect => { expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width); });
        await page.screenshot({ path: info.outputPath(`series-picker-${width}-${old}.png`) });
        await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
        await expect(select).toHaveValue(model.seriesKey({ ...yearTasks[1], _endpointIdx: 3 }));
        await expect(page.locator('#tasksContainer .task-number-label')).toHaveText('Задача 120');
        await page.locator('#mcPrintButton').click();
        const printSelect = page.locator('#mcPrintSeries');
        await expect(printSelect).toBeVisible();
        expect(await printSelect.locator('input').evaluateAll(inputs=>inputs.map(input=>input.getAttribute('aria-label')))).toEqual(['Серия 12', 'Серия 10', 'Серия 2']);
        await expect(page.getByRole('checkbox',{name:'Серия 12',exact:true})).toBeChecked();
        await expect(page.locator('#mcPrintDescription')).toContainText('сверху и снизу');
        await page.getByRole('checkbox',{name:'Серия 10',exact:true}).check();
        await page.screenshot({ path: info.outputPath(`series-print-picker-${width}-${old}.png`) });
        await page.keyboard.press('Escape');
        await expect(page.locator('#mcPrintDialog')).toBeHidden();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
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
    await expect(page.locator('#tasksContainer .mc-task-context')).toHaveCount(0);
    expect(await page.locator('#tasksContainer .task-number-label').allTextContents()).toEqual(['Задача 12', 'Задача 12', 'Задача 12']);
    expect(await page.locator('#tasksContainer [id]').evaluateAll(nodes => new Set(nodes.map(n => n.id)).size === nodes.length)).toBe(true);
    await page.locator('#searchInput').fill('неттакогословавзадачах');
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(0);
    await expect(page.locator('.no-results-message')).toBeVisible();
    await page.locator('.no-results-clear').click();
    await expect(page.locator('#tasksContainer .task-card')).toHaveCount(3);
    await page.locator('#gradeSwitcher [data-grade="grade-9"]').click();
    await expect(page.locator('#mcSeriesSelect')).toBeHidden();
    await expect(page.locator('#mcPrintButton')).toBeEnabled();
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
        // Explicit series add one compact heading while the first card stays above the fold.
        expect(cards[0].y).toBeLessThan(570);
        expect(await page.locator('.mc-series-divider').first().evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(40);
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
    await expect(page.locator('#mcSeriesSelect')).toBeHidden();
    await expect(page.locator('#mcPrintButton')).toBeEnabled();
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
        await expect(page.locator('link[href*="styles/matcenter-refresh.css"]')).toHaveAttribute('href', 'styles/matcenter-refresh.css?v=20261013-print2');
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
