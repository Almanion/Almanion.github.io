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
    window.setForecastConnection = connected => {
        data['.info'].connected = connected;
        listeners.get('.info/connected')?.(snap('.info/connected'));
    };
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
        await page.locator('#budget').fill('0,51');
        await expect(page.locator('#placeOrder')).toHaveText('Купить 1 долю «Да»');
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
        await page.locator('#buyUnit').selectOption('shares');
        await page.locator('#quantity').fill('15'); await expect(page.locator('#quotePreview')).toContainText('7,85');
        await page.locator('#placeOrder').click();
        await expect(page.locator('#walletYes')).toHaveText('15');
        await expect(page.locator('#walletCash')).toHaveText('92,15 оч.');
        await expect(page.locator('#tradeHistory .forecast-row')).toHaveCount(2);
        await expect(page.locator('#probability')).toHaveText('52%');
        await page.locator('label:has(input[name=action][value=sell])').click();
        await page.locator('#orderMode').selectOption('limit');await page.locator('#limitPrice').fill('0,70');await page.locator('#quantity').fill('4');
        await page.locator('#placeOrder').click();await expect(page.locator('#myOrders')).toContainText('4 дол.');
        await page.locator('#myOrders button').click();await expect(page.locator('#myOrders')).toContainText('Активных заявок нет.');
        await page.locator('[data-range=hour]').click(); await expect(page.locator('[data-range=hour]')).toHaveAttribute('aria-pressed','true');
        await page.locator('#chartCursor').focus();await page.keyboard.press('Home');
        await page.locator('#historyScope').selectOption('all');await expect(page.locator('#tradeHistory .forecast-row')).toHaveCount(2);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await expect(page.locator('#ownerTools')).toBeHidden();
    });
}

test('point budget buys whole shares at actual prices and a limit order separates fills from reserved points', async ({ page }) => {
    await mockClass(page);
    await page.goto('/physics-forecast.html');
    const budget = page.getByLabel('Сумма покупки'), submit = page.locator('#placeOrder');
    await expect(submit).toHaveText('Купить 9 долей «Да»');
    await expect(page.locator('#quotePreview')).toContainText('4,59 оч.');
    await budget.fill('0,50');
    await expect(submit).toBeDisabled();
    await expect(page.locator('#quotePreview')).toContainText('0,51');
    await budget.fill('7.84');
    await expect(submit).toHaveText('Купить 14 долей «Да»');
    await budget.fill('7,85');
    await expect(submit).toHaveText('Купить 15 долей «Да»');
    await page.getByRole('button', {name:'1 оч.',exact:true}).click();
    await expect(submit).toHaveText('Купить 1 долю «Да»');
    await page.locator('#orderMode').selectOption('limit');
    await page.locator('#limitPrice').fill('1.00');
    await expect(submit).toBeDisabled();
    await page.locator('#limitPrice').fill('0,53');
    await budget.fill('6,16');
    await expect(submit).toContainText('11 долей');
    await budget.fill('6,36');
    await expect(page.locator('#quotePreview')).toContainText('5,1 оч.');
    await expect(page.locator('#quotePreview')).toContainText('1,06 оч.');
    await expect(page.locator('#quotePreview')).toContainText('6,36 оч.');
    await submit.click();
    await expect(page.locator('#walletYes')).toHaveText('10');
    await expect(page.locator('#walletHeld')).toHaveText('1,06 оч.');
    await expect(page.locator('#feedback')).toContainText('В открытой заявке 2 доли');
    await page.locator('#myOrders button').click();
    await expect(page.locator('#walletHeld')).toHaveText('0 оч.');
    await expect(page.locator('#walletCash')).toHaveText('94,9 оч.');
});

test('selling the selected holding respects reservations, supports half or all and never trades until confirmed', async ({ page }) => {
    await page.setViewportSize({width:320,height:740}); await mockClass(page);
    await page.goto('/physics-forecast.html');
    await page.locator('label:has(input[value=no])').click();
    await page.locator('#placeOrder').click();
    await expect(page.locator('#walletNo')).toHaveText('9');
    await page.locator('label:has(input[value=yes])').click();
    await page.locator('label:has(input[value=sell])').click();
    await expect(page.locator('input[value=no]')).toBeChecked();
    await page.locator('#orderMode').selectOption('limit');
    await page.locator('#limitPrice').fill('0.75');
    await page.locator('#quantity').fill('3');
    await page.locator('#placeOrder').click();
    await expect(page.locator('#heldNo')).toHaveText('В продаже 3 из 9');
    await page.getByRole('button', {name:'Продать доли «Нет»',exact:true}).click();
    await expect(page.locator('#ticketTitle')).toBeFocused();
    await expect(page.locator('#orderMode')).toHaveValue('market');
    await expect(page.locator('#quantity')).toHaveValue('6');
    await expect(page.locator('#walletNo')).toHaveText('9');
    await page.getByRole('button',{name:'50% · 3 доли',exact:true}).click();
    await expect(page.locator('#quotePreview')).toContainText('1,47 оч.');
    await page.getByRole('button',{name:'Все · 6 долей',exact:true}).click();
    await page.locator('#placeOrder').click();
    await expect(page.locator('#walletNo')).toHaveText('3');
    await expect(page.locator('#feedback')).toContainText('Продажа · 6 долей «Нет» за 2,94 оч.');
    await expect(page.locator('#showOrders')).toBeVisible();
    await page.locator('#showOrders').click(); await page.locator('#myOrders button').click();
    await expect(page.locator('#heldNo')).toBeHidden();
    await expect(page.getByRole('button', {name:'Продать доли «Нет»',exact:true})).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('insufficient depth offers an executable quantity or a resting order and an empty position leads back to buying', async ({ page }) => {
    await mockClass(page); await page.goto('/physics-forecast.html');
    await page.locator('label:has(input[value=sell])').click();
    await page.locator('#buyInstead').click();
    await page.locator('#buyUnit').selectOption('shares');
    await page.locator('#quantity').fill('100');
    await expect(page.locator('#placeOrder')).toBeDisabled();
    await page.locator('#useCapacity').click();
    await expect(page.locator('#quantity')).toHaveValue('85');
    await page.locator('#quantity').fill('100');
    await page.locator('#useLimit').click();
    await expect(page.locator('#limitPrice')).toBeFocused();
    await expect(page.locator('#quantity')).toHaveValue('100');
    await expect(page.locator('#placeOrder')).toBeEnabled();
    await expect(page.locator('#walletYes')).toHaveText('0');
});

test('only the owner manages a legacy physics forecast and declares the result',async({page})=>{
    await mockClass(page,'owner'); await page.goto('/physics-forecast.html');
    await page.locator('#ownerTools summary').click(); await expect(page.locator('[data-command=yes]')).toBeHidden();
    await page.locator('[data-command=lock]').click(); await page.locator('#confirmGo').click();
    await expect(page.locator('#roundState')).toHaveText('Торги закрыты');
    await page.locator('[data-command=yes]').click(); await page.locator('#confirmGo').click();
    await expect(page.locator('#roundState')).toHaveText('Итог «Да»');
    await expect(page.locator('#placeOrder')).toBeDisabled();
    await page.evaluate(() => window.changeForecastAccount({ uid:'another-player', isAnonymous:false }));
    await expect(page.locator('#gameSurface')).toBeVisible();
    await expect(page.locator('#roundState')).toHaveText('Итог «Да»');
    await expect(page.locator('#ownerTools')).toBeHidden();
});

test('create custom and template events on one date, trade independently and repeat an event on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 780 });
    await mockClass(page, 'owner');
    await page.goto('/physics-forecast.html');
    const picker = page.getByRole('combobox', { name: 'Выбрать событие' });
    const title = page.locator('#lessonQuestion'), criteria = page.locator('#eventCriteria');
    await expect(title).toHaveText(M.physics.question);
    await expect(criteria).toHaveText(M.physics.criteria);
    const legacy = await picker.inputValue();
    await page.locator('#ownerTools summary').click();
    await page.locator('#showCreate').click();
    await page.locator('#eventTemplate').selectOption({ label: 'Школьный матч' });
    const match = 'Выиграет ли 10-1 у 10-2 в пятницу?';
    await page.locator('#eventQuestion').fill(match);
    await page.locator('#newCriteria').fill('Победа по итоговому счёту.');
    await page.getByRole('button', { name: 'Открыть прогноз' }).click();
    await expect(title).toHaveText(match);
    await expect(criteria).toHaveText('Победа по итоговому счёту.');
    await expect(page.locator('#manageTitle')).toHaveText(match);
    const first = await picker.inputValue();
    expect(first).not.toBe(legacy);
    await page.locator('#budget').fill('7,85');
    await page.locator('#placeOrder').click();
    await expect(page.locator('#probability')).toHaveText('52%');
    await page.locator('#showCreate').click();
    const club = 'Состоится ли математический кружок?';
    await page.locator('#eventQuestion').fill(club);
    await page.getByRole('button', { name: 'Открыть прогноз' }).click();
    await expect(title).toHaveText(club);
    await expect(criteria).toBeHidden();
    await expect(page.locator('#walletYes')).toHaveText('0');
    await expect(page.locator('#walletCash')).toHaveText('92,15 оч.');
    await expect(page.locator('#probability')).toHaveText('50%');
    await expect(page.locator('#probChart')).toHaveAttribute('aria-label', /математический кружок/);
    const second = await picker.inputValue();
    expect(new URL(page.url()).searchParams.get('event')).toBe(second);
    await page.locator('#showCreate').click();
    await page.locator('#eventQuestion').fill(club);
    await page.getByRole('button', { name: 'Открыть прогноз' }).click();
    await expect(page.locator('#adminFeedback')).toContainText('уже есть');
    await expect(picker.locator('option')).toHaveCount(3);
    await picker.selectOption(first);
    await expect(page.locator('#walletYes')).toHaveText('15');
    await expect(page.locator('#probability')).toHaveText('52%');
    await page.locator('[data-command="lock"]').click();
    await expect(page.locator('#confirmText')).toContainText(match);
    await picker.selectOption(second);
    await expect(page.locator('#confirmAction')).toBeHidden();
    await page.locator('#repeatEvent').click();
    await expect(page.locator('#eventQuestion')).toHaveValue(club);
    await expect(page.locator('[data-offset="1"]')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Открыть прогноз' }).click();
    await expect(picker.locator('option')).toHaveCount(4);
    await picker.selectOption(first);
    await page.locator('[data-command="lock"]').click();
    await page.locator('#confirmGo').click();
    await picker.selectOption(second);
    await page.locator('#nextPending').click();
    await expect(picker).toHaveValue(first);
    await page.locator('[data-command="yes"]').click();
    await page.locator('#confirmGo').click();
    await expect(page.locator('#roundState')).toHaveText('Итог «Да»');
    await picker.selectOption(second);
    await expect(page.locator('#roundState')).toHaveText('Торги открыты');
    await expect(page.locator('#walletCash')).toHaveText('107,15 оч.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.changeForecastAccount(null));
    await expect(title).toHaveText('Прогнозы класса');
    await expect(page.locator('#ownerTools')).toBeHidden();
    await expect(picker.locator('option')).toHaveCount(0);
});

test('a peer trade moves the live chart while a historical reading stays pinned; reconnect resumes the live clock', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-26T11:00:00Z') });
    await mockClass(page); await page.goto('/physics-forecast.html');
    const readout = page.locator('#chartReadout'), chart = page.locator('#probChart');
    await chart.scrollIntoViewIfNeeded();
    await expect(chart).toHaveAttribute('data-live','true');
    await expect(page.locator('#chartScale span').first()).toHaveText('60%');
    const initialTime = await readout.innerText();
    await page.clock.runFor(2100);
    await expect(readout).not.toHaveText(initialTime);
    await page.locator('#chartCursor').focus(); await page.keyboard.press('Home');
    const pinned = await readout.innerText();
    await page.evaluate(async () => {
        const root = window.AlmanionAccount.database.ref('physicsForecast');
        const id = root.child('events').push().key, at = Date.now(), day = window.PhysicsForecast.dayKey(at);
        await root.update({ head:{id,n:2}, ['events/'+id]:{kind:'order', actor:'second-player', day, n:2, at,
            side:'yes', action:'buy', mode:'market', qty:15, limit:55, totalLimit:785} });
    });
    await expect(page.locator('#probability')).toHaveText('52%');
    await expect(page.locator('#chartDelta')).toHaveText('+2 п. п.');
    await expect(readout).toHaveText(pinned);
    await expect(page.locator('#chartTip b')).toHaveText('50%');
    await page.locator('#chartReturn').click();
    await expect(page.locator('#chartTip')).toBeHidden();
    await expect(page.locator('#chartState')).toHaveText('Сейчас');
    await page.evaluate(() => window.setForecastConnection(false));
    await expect(chart).toHaveAttribute('data-live','false');
    const offlineTime = await readout.innerText();
    await page.clock.runFor(3000); await expect(readout).toHaveText(offlineTime);
    await page.evaluate(() => window.setForecastConnection(true));
    await expect(readout).not.toHaveText(offlineTime);
    await expect(chart).toHaveAttribute('data-live','true');
    await page.locator('[data-range=hour]').click();
    await page.locator('#chartCursor').focus(); await page.keyboard.press('Home');
    const oldHour = await readout.innerText();
    await page.clock.fastForward(65 * 60000);
    await expect(readout).toHaveText(oldHour);
    await page.keyboard.press('End');
    await expect(page.locator('#chartState')).toHaveText('Сейчас');
    await expect(chart).toHaveAttribute('data-live','true');
});

test.describe('touch chart', () => {
    test.use({ hasTouch:true, viewport:{width:360,height:740} });
    test('opens from the mobile shortcuts and allows inspecting a point and returning to now', async ({ page }) => {
        await mockClass(page);
        await page.goto('/physics-forecast.html');
        await page.getByRole('link',{name:'График',exact:true}).tap();
        const plot = page.locator('#probChart');
        await plot.tap({position:{x:24,y:35}});
        await expect(page.locator('#chartTip')).toBeVisible();
        await expect(page.locator('#chartState')).toHaveText('История');
        await page.locator('#chartReturn').tap();
        await expect(page.locator('#chartState')).toHaveText('Сейчас');
        await page.getByRole('link',{name:'Сделка',exact:true}).tap();
        await expect(page.locator('#budget')).toBeInViewport();
    });
});
