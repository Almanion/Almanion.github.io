'use strict';
const { test, expect } = require('@playwright/test');
const M = require('../physics-forecast-core');
test.use({ serviceWorkers: 'block' });

async function mockClass(page, who = 'classmate') {
    await page.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ contentType:'application/javascript', body:'' }));
    await page.route('**/account.js*', route => route.fulfill({ contentType:'application/javascript',
        body:'(' + fixture.toString() + ')(' + JSON.stringify(who) + ',' + JSON.stringify(M.OWNER) + ');' }));
}
function fixture(who, owner) {
    const actor = who === 'owner' ? owner : who;
    const clock = Date.now(), d = new Date(clock + 10800000).toISOString().slice(0,10);
    const id = '00000000000000000000';
    const data = {'.info':{connected:true,serverTimeOffset:0},physicsForecast:{
        events:{[id]:{day:d,n:1,at:clock-160000,actor:owner,kind:'open',endAt:Date.parse(d+'T00:00:00+03:00')+86400000}},head:{id,n:1}}};
    const listeners = new Map();
    function value(path) { return path.split('/').filter(Boolean).reduce((obj,k)=>obj?.[k],data) ?? null; }
    function snap(path) { const val = structuredClone(value(path)); return { val:()=>val, exists:()=>val!==null,
        forEach:cb=>Object.entries(val || {}).sort((a,b)=>a[1].n-b[1].n).forEach(([key,v])=>cb({key,val:()=>v})) }; }
    let serial=1;
    function ref(path='') { return { child:key=>ref(path+'/'+key), orderByChild:()=>ref(path), get:async()=>snap(path),
        push:()=>({key:String(serial++).padStart(20,'0')}), on:(type,cb)=>{listeners.set(path,cb);queueMicrotask(()=>cb(snap(path)));},
        off:()=>listeners.delete(path), update:async patches=>{
            for(const [key,original] of Object.entries(patches)) {
                const val=JSON.parse(JSON.stringify(original,(_key,x)=>x?.['.sv']==='timestamp'?Date.now():x));
                const keys=(path+'/'+key).split('/').filter(Boolean), last=keys.pop();
                const parent=keys.reduce((o,k)=>o[k]||(o[k]={}),data);parent[last]=val;
            }
            listeners.get('physicsForecast/events')?.(snap('physicsForecast/events'));
        } }; }
    window.firebase = {database:{ServerValue:{TIMESTAMP:{'.sv':'timestamp'}}}};
    window.AlmanionAccount = { database:{ref}, auth:{onAuthStateChanged(cb) {
        window.changeForecastAccount = cb;
        cb(who === 'guest' ? null : { uid:actor, isAnonymous:who === 'anonymous' });
    }},
        openLogin:()=>{document.body.dataset.loginOpened='true';} };
}

test('only a triple activation of the homepage wordmark opens the market',async({page})=>{
    await mockClass(page,'guest');
    await page.goto('/'); const wordmark=page.locator('#homeWordmark');
    await wordmark.click(); await wordmark.click(); await expect(page).not.toHaveURL(/physics-forecast/);
    await page.waitForTimeout(720); await wordmark.focus(); await page.keyboard.press('Enter');
    await expect(page).not.toHaveURL(/physics-forecast/);
    await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await expect(page).toHaveURL(/physics-forecast\.html/);
    await expect(page.getByRole('heading',{name:'Войди, чтобы открыть рынок'})).toBeVisible();
    await page.locator('#gateAction').click(); await expect(page.locator('body')).toHaveAttribute('data-login-opened','true');
});

test.describe('registered player on a phone', () => {
    test.use({ hasTouch:true, viewport:{ width:390, height:844 } });
    test('enters by tapping the logo three times and can trade immediately', async ({ page }) => {
        await mockClass(page);
        await page.goto('/');
        const logo = page.locator('#homeWordmark');
        await logo.tap(); await logo.tap(); await logo.tap();
        await expect(page).toHaveURL(/physics-forecast\.html/);
        await expect(page.locator('#walletCash')).toHaveText('100 оч.');
        await page.locator('#quantity').fill('1');
        await page.locator('#placeOrder').tap();
        await expect(page.locator('#walletYes')).toHaveText('1');
        await expect(page.locator('#ownerTools')).toBeHidden();
    });
});

test('an anonymous session can sign in on the market page and signing out hides the market', async ({ page }) => {
    await mockClass(page, 'anonymous');
    await page.goto('/physics-forecast.html');
    await expect(page.locator('#gateAction')).toBeVisible();
    await expect(page.locator('#gateAction')).toHaveText('Войти');
    await expect(page.locator('#gameSurface')).toBeHidden();
    await page.evaluate(() => window.changeForecastAccount({ uid:'new-player', isAnonymous:false }));
    await expect(page.locator('#gameSurface')).toBeVisible();
    await expect(page.locator('#ownerTools')).toBeHidden();
    await page.evaluate(() => window.changeForecastAccount(null));
    await expect(page.locator('#gateAction')).toBeVisible();
    await expect(page.locator('#gameSurface')).toBeHidden();
});

for (const width of [360,1280]) {
    test('trade, reserve, cancel and show fills at '+width+'px',async({page})=>{
        await page.setViewportSize({width,height:820}); await mockClass(page);
        await page.goto('/physics-forecast.html'); await expect(page.locator('#gameSurface')).toBeVisible();
        await expect(page.locator('#probability')).toHaveText('50%');
        await expect(page.locator('#walletCash')).toHaveText('100 оч.');
        await page.locator('#quantity').fill('15'); await expect(page.locator('#quotePreview')).toContainText('7,85');
        await page.locator('#placeOrder').click();
        await expect(page.locator('#walletYes')).toHaveText('15');
        await expect(page.locator('#walletCash')).toHaveText('92,15 оч.');
        await expect(page.locator('#tradeHistory .forecast-row')).toHaveCount(2);
        await expect(page.locator('#probability')).toHaveText('52%');
        await page.locator('label:has(input[name=action][value=sell])').click();
        await page.locator('#orderMode').selectOption('limit');await page.locator('#limitPrice').fill('70');await page.locator('#quantity').fill('4');
        await page.locator('#placeOrder').click();await expect(page.locator('#myOrders')).toContainText('4 дол.');
        await page.locator('#myOrders button').click();await expect(page.locator('#myOrders')).toContainText('Активных заявок нет.');
        await page.locator('[data-range=hour]').click(); await expect(page.locator('[data-range=hour]')).toHaveAttribute('aria-pressed','true');
        await page.locator('#chartCursor').focus();await page.keyboard.press('Home');
        await page.locator('#historyScope').selectOption('all');await expect(page.locator('#tradeHistory .forecast-row')).toHaveCount(2);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await expect(page.locator('#ownerTools')).toBeHidden();
    });
}

test('only the owner manages lessons and declares the result',async({page})=>{
    await mockClass(page,'owner'); await page.goto('/physics-forecast.html');
    await page.locator('#ownerTools summary').click(); await expect(page.locator('[data-command=yes]')).toBeHidden();
    await page.locator('[data-command=lock]').click(); await page.locator('#confirmGo').click();
    await expect(page.locator('#roundState')).toHaveText('Торги закрыты');
    await page.locator('[data-command=yes]').click(); await page.locator('#confirmGo').click();
    await expect(page.locator('#roundState')).toHaveText('Работа была');
    await expect(page.locator('#placeOrder')).toBeDisabled();
    await page.evaluate(() => window.changeForecastAccount({ uid:'another-player', isAnonymous:false }));
    await expect(page.locator('#gameSurface')).toBeVisible();
    await expect(page.locator('#roundState')).toHaveText('Работа была');
    await expect(page.locator('#ownerTools')).toBeHidden();
});
