'use strict';
const { test, expect } = require('@playwright/test');
const M = require('../physics-forecast-core');
test.use({ serviceWorkers: 'block' });

async function mockClass(page, who = 'classmate', firstVisit = false) {
    await page.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ contentType:'application/javascript', body:'' }));
    await page.route('**/account.js*', route => route.fulfill({ contentType:'application/javascript', body:'' }));
    await page.addInitScript(fixture, { who, owner: M.OWNER, firstVisit });
}
function fixture({ who, owner, firstVisit }) {
    if (!firstVisit) localStorage.setItem('almanion:forecast:guide-seen:v1', '1');
    const clock = Date.now(), d = new Date(clock + 10800000).toISOString().slice(0,10);
    const id = '00000000000000000000';
    const saved = sessionStorage.getItem('forecast-test-data');
    const data = { '.info': { connected:true, serverTimeOffset:0 }, physicsForecast: saved ? JSON.parse(saved) : {
        events:{[id]:{day:d,n:1,at:clock-160000,actor:owner,kind:'open',endAt:Date.parse(d+'T00:00:00+03:00')+86400000}},head:{id,n:1}} };
    const listeners = new Map(), sessions = new Set();
    function value(path) { return path.split('/').filter(Boolean).reduce((obj,k)=>obj?.[k],data) ?? null; }
    function snap(path) { const val = structuredClone(value(path)); return { val:()=>val, exists:()=>val!==null,
        forEach:cb=>Object.entries(val || {}).sort((a,b)=>a[1].n-b[1].n).forEach(([key,v])=>cb({key,val:()=>v})) }; }
    function emit(path) { listeners.get(path)?.forEach(cb => cb(snap(path))); }
    let serial = data.physicsForecast.head?.n || 1;
    function ref(path='') { return {
        child:key=>ref([path,key].filter(Boolean).join('/')), orderByChild:()=>ref(path), get:async()=>snap(path), once:async()=>snap(path),
        push:()=>({key:String(serial++).padStart(20,'0')}), on:(_type,cb)=>{
            if (!listeners.has(path)) listeners.set(path,new Set());
            listeners.get(path).add(cb); queueMicrotask(()=>{ if(listeners.get(path)?.has(cb)) cb(snap(path)); });
        }, off:(_type,cb)=>listeners.get(path)?.delete(cb), update:async patches=>{
            for(const [key,original] of Object.entries(patches)) {
                const val=JSON.parse(JSON.stringify(original,(_key,x)=>x?.['.sv']==='timestamp'?Date.now():x));
                const keys=(path+'/'+key).split('/').filter(Boolean), last=keys.pop();
                const parent=keys.reduce((o,k)=>o[k]||(o[k]={}),data);parent[last]=val;
            }
            sessionStorage.setItem('forecast-test-data', JSON.stringify(data.physicsForecast)); emit('physicsForecast/events');
        } }; }
    const database = () => ({ref});
    database.ServerValue = {TIMESTAMP:{'.sv':'timestamp'}};
    const auth = {
        currentUser: who === 'guest' ? null : { uid:who === 'owner' ? owner : who, email:who+'@example.test', isAnonymous:who === 'anonymous' },
        onAuthStateChanged(cb) { sessions.add(cb); queueMicrotask(()=>cb(auth.currentUser)); },
        async signOut() { window.changeForecastAccount(null); }
    };
    window.firebase = { initializeApp(){}, database, auth:()=>auth };
    window.changeForecastAccount = user => { auth.currentUser = user; sessions.forEach(cb=>cb(user)); };
    window.setForecastConnection = connected => { data['.info'].connected = connected; emit('.info/connected'); };
    window.AlmanionAccount = { database:database(), auth, openLogin:()=>{document.body.dataset.loginOpened='true';} };
}

async function expectSpotlight(page, targetId) {
    await expect.poll(() => page.evaluate(id => {
        const ring = document.querySelector('.forecast-tour-focus').getBoundingClientRect();
        const card = document.querySelector('.forecast-tour-card').getBoundingClientRect();
        const target = document.getElementById(id).getBoundingClientRect();
        const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
            * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        return ring.width > 30 && ring.height > 15 && overlap(ring, target) > ring.width * ring.height * .65
            && overlap(card, ring) < 1 && card.bottom <= innerHeight + 1 && ring.top >= 0;
    }, targetId)).toBe(true);
}

test('first visit explains the market and guides the phone through real controls without trading', async ({ page, context }) => {
    await page.setViewportSize({width:320,height:640});
    await mockClass(page, 'classmate', true); await page.goto('/physics-forecast.html');
    const rules = page.getByRole('dialog', {name:'Как устроен рынок'});
    await expect(rules).toBeVisible(); await expect(rules).toContainText('5 долей «Да» по 0,40');
    await expect(rules.locator('.forecast-guide-example dd')).toHaveText(['2 очка','5 очков','+3 очка']);
    await page.getByRole('button', {name:'Начать обзор'}).click();
    await expect(page.locator('#backMarketTour')).toBeDisabled();
    await expectSpotlight(page, 'eventPicker');
    await page.locator('#nextMarketTour').click(); await expectSpotlight(page, 'probChart');
    await page.locator('#backMarketTour').click(); await expectSpotlight(page, 'eventPicker');
    await page.locator('#nextMarketTour').click(); await page.locator('#nextMarketTour').click();
    await expectSpotlight(page, 'ticketChoices');
    await page.setViewportSize({width:568,height:320}); await expectSpotlight(page, 'ticketChoices');
    await page.locator('#nextMarketTour').click(); await expectSpotlight(page, 'portfolio');
    await expect(page.locator('#tourProgress')).toHaveText('Шаг 4 из 4');
    await page.getByRole('button', {name:'Готово',exact:true}).click();
    await expect(page.locator('#marketTour')).toBeHidden();
    await expect(page.locator('[data-market-guide=start]')).toBeFocused();
    await expect(page.locator('#walletCash')).toHaveText('100 оч.'); await expect(page.locator('#walletYes')).toHaveText('0');
    await page.reload(); await expect(page.locator('#gameSurface')).toBeVisible(); await expect(rules).toBeHidden();
    const nextTab = await context.newPage();
    await mockClass(nextTab, 'classmate', true); await nextTab.goto('/physics-forecast.html');
    await expect(nextTab.locator('#gameSurface')).toBeVisible(); await expect(nextTab.locator('#marketGuide')).toBeHidden();
});

test('rules remain available to guests and the tour can be replayed, skipped and dismissed by keyboard', async ({ page }) => {
    await mockClass(page, 'guest', true); await page.goto('/physics-forecast.html');
    await expect(page.locator('#guideAvailability')).toHaveText('Обзор доступен после входа.');
    await expect(page.locator('#startMarketTour')).toBeHidden(); await page.keyboard.press('Escape');
    await expect(page.locator('#gateAction')).toBeVisible();
    await page.evaluate(() => window.changeForecastAccount({uid:'classmate',isAnonymous:false}));
    const trigger=page.locator('[data-market-guide=start]');
    await trigger.click(); await page.locator('#startMarketTour').click(); await page.locator('#skipMarketTour').click();
    await expect(trigger).toBeFocused(); await trigger.click(); await page.locator('#startMarketTour').click();
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    await trigger.click(); await page.locator('#startMarketTour').click();
    await page.evaluate(() => window.changeForecastAccount(null));
    await expect(page.locator('#marketTour')).toBeHidden(); await expect(page.locator('#gameSurface')).toBeHidden();
});

test('empty offers explain which side is missing and a guide can be opened from a draft without losing it', async ({page}) => {
    await page.setViewportSize({width:360,height:740}); await mockClass(page); await page.goto('/physics-forecast.html');
    await page.locator('#buyUnit').selectOption('shares'); await page.locator('#quantity').fill('3'); await page.locator('#placeOrder').click();
    await expect(page.locator('#walletYes')).toHaveText('3');
    await page.evaluate(async () => {
        const root = window.AlmanionAccount.database.ref('physicsForecast');
        for (const [side, qty] of [['yes',82],['no',85]]) {
            const n=(await root.child('head').get()).val().n+1, id=root.child('events').push().key, at=Date.now();
            await root.update({head:{id,n},['events/'+id]:{kind:'order', actor:'peer-'+side,
                day:window.PhysicsForecast.dayKey(at), n, at, side, qty, action:'buy', mode:'market', limit:99}});
        }
    });
    await expect(page.locator('#yesAsk')).toHaveText('Нет продавцов');
    await expect(page.locator('#quotePreview')).toHaveText('Сейчас никто не продаёт доли «Да».');
    await expect(page.locator('#bookAsks')).toContainText('Пока нет продавцов');
    await page.locator('#explainDepth').click(); await expect(page.locator('#guideOrders summary')).toBeFocused();
    await page.locator('#startMarketTour').click(); await page.locator('#nextMarketTour').click(); await page.locator('#skipMarketTour').click();
    await expect(page.locator('#explainDepth')).toBeFocused(); await expect(page.locator('#quantity')).toHaveValue('3');
    await page.locator('label:has([value=sell])').click();
    await expect(page.locator('#yesAsk')).toHaveText('Нет покупателей');
    await expect(page.locator('#bookBids')).toContainText('Пока нет покупателей');
    await expect(page.locator('#quotePreview')).toHaveText('Сейчас никто не покупает доли «Да».');
    await page.locator('#useLimit').click(); await page.locator('#limitPrice').fill('0,70'); await page.locator('#placeOrder').click();
    await expect(page.locator('#myOrders')).toContainText('3 доли по 0,7 оч.'); await page.locator('#myOrders button').click();
    await expect(page.locator('#walletYes')).toHaveText('3'); await expect(page.locator('#myOrders button')).toHaveCount(0);
});

test('the walkthrough reflects a settled event and offers only the rules before the first event', async ({page}) => {
    await mockClass(page); await page.goto('/physics-forecast.html');
    await expect(page.locator('#roundBody')).toBeVisible();
    await page.evaluate(async () => {
        const root=window.AlmanionAccount.database.ref('physicsForecast'), at=Date.now(), day=window.PhysicsForecast.dayKey(at);
        for (const [i,kind] of ['lock','yes'].entries()) {
            const id=root.child('events').push().key, n=i+2;
            await root.update({head:{id,n},['events/'+id]:{kind,n,at,day,actor:window.PhysicsForecast.OWNER}});
        }
    });
    await expect(page.locator('#roundState')).toHaveText('Итог «Да»'); await expect(page.locator('#orderMode')).toBeHidden();
    await page.locator('[data-market-guide=start]').click(); await page.locator('#startMarketTour').click();
    await page.locator('#nextMarketTour').click(); await page.locator('#nextMarketTour').click();
    await expect(page.locator('#tourText')).toContainText('Итог — «Да»');
    await page.evaluate(() => window.AlmanionAccount.database.ref('physicsForecast').update({events:{},head:null}));
    await expect(page.locator('#marketTour')).toBeHidden(); await expect(page.locator('#emptyRound')).toBeVisible();
    await page.locator('[data-market-guide=start]').click(); await expect(page.locator('#startMarketTour')).toBeHidden();
    await expect(page.locator('#guideAvailability')).toHaveText('Обзор появится с первым событием.');
});

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
        await expect(page.locator('#forecastAdminLink')).toBeHidden();
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
    await expect(page.locator('#forecastAdminLink')).toBeHidden();
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
        await page.locator('#orderMode label:has([value=limit])').click();await page.locator('#limitPrice').fill('0,70');await page.locator('#quantity').fill('4');
        await page.locator('#placeOrder').click();await expect(page.locator('#myOrders')).toContainText('4 доли по 0,7 оч.');
        await page.locator('#myOrders button').click();await expect(page.locator('#myOrders')).toContainText('нет заявок в ожидании сделки');
        await page.locator('[data-range=hour]').click(); await expect(page.locator('[data-range=hour]')).toHaveAttribute('aria-pressed','true');
        await page.locator('#chartCursor').focus();await page.keyboard.press('Home');
        await expect(page.locator('#historyScope')).toHaveCount(0);await expect(page.locator('#tradeHistory .forecast-row')).toHaveCount(2);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await expect(page.locator('#forecastAdminLink')).toBeHidden();
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
    await page.locator('#orderMode label:has([value=limit])').click();
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
    await page.locator('#orderMode label:has([value=limit])').click();
    await page.locator('#limitPrice').fill('0.75');
    await page.locator('#quantity').fill('3');
    await page.locator('#placeOrder').click();
    await expect(page.locator('#heldNo')).toHaveText('В продаже 3 из 9');
    await page.getByRole('button', {name:'Продать доли «Нет»',exact:true}).click();
    await expect(page.locator('#ticketTitle')).toBeFocused();
    await expect(page.locator('#orderMode [value=market]')).toBeChecked();
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
    await expect(page.locator('#quotePreview')).toHaveText('Сейчас можно купить 85 долей «Да».');
    await page.locator('#useCapacity').click();
    await expect(page.locator('#quantity')).toHaveValue('85');
    await page.locator('#quantity').fill('100');
    await page.locator('#useLimit').click();
    await expect(page.locator('#limitPrice')).toBeFocused();
    await expect(page.locator('#quantity')).toHaveValue('100');
    await expect(page.locator('#placeOrder')).toBeEnabled();
    await expect(page.locator('#walletYes')).toHaveText('0');
});

test('owner enters the dashboard at the current event, closes it, settles and returns to the market', async ({page}) => {
    await mockClass(page,'owner'); await page.goto('/physics-forecast.html');
    await expect(page.locator('#ownerTools, #chartVolume, #historyScope')).toHaveCount(0);
    await page.locator('#forecastAdminLink').click();
    await expect(page).toHaveURL(/admin\.html\?event=.+#forecasts$/);
    await expect(page.locator('#tab-forecasts')).toHaveAttribute('aria-selected','true');
    await expect(page.locator('#manageTitle')).toHaveText(M.physics.question);
    await expect(page.locator('[data-command=yes]')).toBeHidden();
    await page.locator('[data-command=lock]').click(); await page.locator('#confirmBack').click();
    await expect(page.locator('#forecastOpen')).toHaveText('1');
    await page.locator('[data-command=lock]').click(); await page.locator('#confirmGo').click();
    await expect(page.locator('#forecastPending')).toHaveText('1');
    await page.locator('[data-command=yes]').click(); await page.locator('#confirmGo').click();
    await expect(page.locator('#manageStatus')).toContainText('Итог «Да»');
    await page.locator('#forecastMarketLink').click();
    await expect(page.locator('#roundState')).toHaveText('Итог «Да»');
    await expect(page.locator('#placeOrder')).toBeDisabled();
    await page.evaluate(() => window.changeForecastAccount({uid:'classmate',isAnonymous:false}));
    await expect(page.locator('#forecastAdminLink')).toBeHidden();
});

test('owner manages multiple events, sees reconciled statistics and preserves event selection across pages on mobile', async ({page}) => {
    await page.setViewportSize({width:320,height:780});
    await mockClass(page,'owner'); await page.goto('/admin.html#forecasts');
    const picker=page.locator('#forecastPicker'), title=page.locator('#manageTitle');
    await expect(title).toHaveText(M.physics.question);
    const legacy=await picker.inputValue(), match='Выиграет ли сборная 10-1 товарищеский матч у сборной 10-2 в пятницу после занятий?', club='Состоится ли математический кружок?';
    const create=page.getByRole('button',{name:'Открыть прогноз',exact:true});
    await page.locator('#showCreate').click();
    await page.locator('#eventTemplate').selectOption({label:'Школьный матч'});
    await page.locator('#eventQuestion').fill(match);
    await page.locator('#newCriteria').fill('Победа по итоговому счёту.');
    await create.click(); await expect(title).toHaveText(match);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    const first=await picker.inputValue();
    expect(first).not.toBe(legacy);
    await page.locator('#forecastMarketLink').click();
    await expect(page.locator('#lessonQuestion')).toHaveText(match);
    await expect(page.locator('#eventCriteria')).toHaveText('Победа по итоговому счёту.');
    await page.locator('#budget').fill('7,85'); await page.locator('#placeOrder').click();
    await expect(page.locator('#walletYes')).toHaveText('15');
    await page.locator('#forecastAdminLink').click(); await expect(picker).toHaveValue(first);
    await expect(page.locator('#forecastTraders')).toHaveText('1');
    await expect(page.locator('#forecastTape li')).toHaveCount(2);
    await expect(page.locator('#forecastFills')).toHaveText('2');
    await expect(page.locator('#chartVolume')).toHaveText('15');
    await expect(page.locator('#chartLow')).toHaveText('50%'); await expect(page.locator('#chartHigh')).toHaveText('52%');
    await page.locator('[data-chart-side=no]').click();
    await expect(page.locator('#chartLow')).toHaveText('48%'); await expect(page.locator('#chartHigh')).toHaveText('50%');
    await page.locator('#showCreate').click(); await page.locator('#eventQuestion').fill(club); await create.click();
    await expect(title).toHaveText(club); const second=await picker.inputValue();
    await expect(page.locator('#chartVolume')).toHaveText('0');
    await page.locator('#showCreate').click(); await page.locator('#eventQuestion').fill(club); await create.click();
    await expect(page.locator('#adminFeedback')).toContainText('уже есть'); await expect(picker.locator('option')).toHaveCount(3);
    await picker.selectOption(first); await page.locator('[data-command=lock]').click();
    await expect(page.locator('#confirmText')).toContainText(match);
    await picker.selectOption(second); await expect(page.locator('#confirmAction')).toBeHidden();
    await page.locator('#repeatEvent').click(); await expect(page.locator('#eventQuestion')).toHaveValue(club);
    await expect(page.locator('[data-offset="1"]')).toHaveAttribute('aria-pressed','true'); await create.click();
    await expect(picker.locator('option')).toHaveCount(4);
    await picker.selectOption(first); await page.locator('[data-command=lock]').click(); await page.locator('#confirmGo').click();
    await picker.selectOption(second); await page.locator('#nextPending').click(); await expect(picker).toHaveValue(first);
    await page.locator('[data-command=yes]').click(); await page.locator('#confirmGo').click();
    await picker.selectOption(second); await page.locator('#forecastMarketLink').click();
    await expect(page.locator('#roundState')).toHaveText('Торги открыты');
    await expect(page.locator('#walletCash')).toHaveText('107,15 оч.');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('#forecastAdminLink').click(); await expect(picker).toHaveValue(second);
    await page.evaluate(()=>window.changeForecastAccount(null));
    await expect(page.locator('#tab-forecasts')).toBeHidden(); await expect(page.locator('#forecastTape')).toBeEmpty();
    await expect(picker.locator('option')).toHaveCount(0);
});

test('offline management disables confirmation and a cancelled forecast refunds the participant', async ({page}) => {
    await mockClass(page, 'owner');
    await page.goto('/physics-forecast.html');
    await page.locator('#budget').fill('0,51'); await page.locator('#placeOrder').click();
    await expect(page.locator('#walletCash')).toHaveText('99,49 оч.');
    await page.locator('#forecastAdminLink').click();
    await page.locator('[data-command=void]').click();
    const confirm = page.locator('#confirmGo');
    await page.evaluate(() => window.setForecastConnection(false));
    await expect(confirm).toBeDisabled();
    await expect(page.locator('#forecastLoadStatus')).toContainText('Нет связи');
    await page.evaluate(() => window.setForecastConnection(true));
    await expect(confirm).toBeEnabled(); await confirm.click();
    await expect(page.locator('#manageStatus')).toContainText('Прогноз отменён');
    await expect(page.locator('[data-command=void]')).toBeHidden();
    await page.locator('#forecastMarketLink').click();
    await expect(page.locator('#placeOrder')).toBeDisabled();
    await expect(page.locator('#walletCash')).toHaveText('100 оч.');
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
    await expect(page.locator('#tradeHistory .forecast-row')).toHaveCount(0);
    await expect(page.locator('#chartDelta, #chartVolume, #forecastAdminLink:not([hidden])')).toHaveCount(0);
    await expect(readout).toHaveText(pinned);
    await expect(page.locator('#chartTip b')).toHaveText('Да · 50%');
    await page.locator('[data-chart-side=no]').click();
    await expect(page.locator('#probability')).toHaveText('48%');
    await expect(page.locator('#chartTip b')).toHaveText('Нет · 50%');
    await expect(page.locator('[name=side][value=yes]')).toBeChecked();
    await expect(page.locator('#chartPriceTag')).toHaveText('48%');
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
    await page.locator('[data-range=all]').click();
    await expect(page.locator('#chartState')).toHaveText('Сейчас');
    await expect(chart).toHaveAttribute('data-live','true');
});

test('the expanded chart keeps its outcome, restores focus and closes on logout', async ({ page }) => {
    await mockClass(page);
    await page.goto('/physics-forecast.html');
    const expand = page.locator('#chartExpand'), dialog = page.locator('#chartDialog');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('[data-chart-side=no]').click();
    expect(await page.locator('#chartSeries').evaluate(series => series.getAnimations().some(anim => anim.playState === 'running'))).toBe(false);
    await expand.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('#chartDialogQuestion')).toHaveText(await page.locator('#lessonQuestion').innerText());
    await expect(dialog.locator('[data-chart-side=no]')).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.locator('#chartPriceTag')).toHaveText('50%');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(expand).toBeFocused();
    await expect(page.locator('#roundBody #marketChart')).toHaveCount(1);
    await expand.click();
    await page.evaluate(() => window.changeForecastAccount(null));
    await expect(dialog).toBeHidden();
    await expect(page.locator('#eventPicker')).toBeHidden();
    await expect(page.locator('#roundState')).toBeHidden();
    await expect(page.locator('#gateAction')).toBeVisible();
});

test.describe('touch chart', () => {
    test.use({ hasTouch:true, viewport:{width:360,height:740} });
    test('steps through price changes, filters actual volume and keeps the inspected time on rotation', async ({ page }) => {
        await page.clock.install({ time: new Date('2026-11-26T12:00:00Z') });
        await mockClass(page, 'owner');
        await page.goto('/admin.html#forecasts');
        const previous = page.locator('#chartPrev'), next = page.locator('#chartNext');
        const tip = page.locator('#chartTip'), dialog = page.locator('#chartDialog');
        await expect(page.locator('#probability')).toHaveText('50%');
        await expect(previous).toBeHidden();
        await page.clock.fastForward(20 * 60000);
        await page.evaluate(async () => {
            const root = window.AlmanionAccount.database.ref('physicsForecast'), now = Date.now();
            const trades = [['yes', 12, 19 * 60000], ['no', 18, 60000], ['no', 20, 20000]];
            for (const [i, [side, qty, age]] of trades.entries()) {
                const id = root.child('events').push().key, n = i + 2;
                const order = { kind: 'order', day: window.PhysicsForecast.dayKey(now), n, at: now - age,
                    actor: side + '-player', side, action: 'buy', mode: 'market', qty, limit: 99 };
                await root.update({ head: { id, n }, ['events/' + id]: order });
            }
        });
        await expect(page.locator('#chartVolume')).toHaveText('50');
        await page.getByRole('button', { name: '15 минут' }).tap();
        await expect(page.locator('#chartVolume')).toHaveText('38');
        await previous.tap();
        const lastChange = await page.locator('#chartCursor').getAttribute('aria-valuetext');
        await expect(page.locator('#chartActiveVolume')).not.toHaveAttribute('d', '');
        await previous.tap();
        await expect(page.locator('#chartCursor')).not.toHaveAttribute('aria-valuetext', lastChange);
        await next.tap();
        await expect(page.locator('#chartCursor')).toHaveAttribute('aria-valuetext', lastChange);

        await page.locator('#chartExpand').tap();
        await page.setViewportSize({ width: 568, height: 320 });
        // WebKit rounds the SVG intersection to physical pixels after a rotation.
        await expect.poll(() => dialog.evaluate(box => ['#probChart', '#chartExpand'].every(selector => {
            const rect = box.querySelector(selector).getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0
                && rect.bottom <= innerHeight + 1 && rect.right <= innerWidth + 1;
        }))).toBe(true);
        await expect(page.locator('#chartCursor')).toHaveAttribute('aria-valuetext', lastChange);
        await expect.poll(() => page.evaluate(() => {
            const box = document.getElementById('chartDialog');
            return box.scrollHeight - box.clientHeight;
        })).toBeLessThanOrEqual(1);
        const plotBox = await dialog.locator('#probChart').boundingBox(), tipBox = await tip.boundingBox();
        expect(tipBox.y + tipBox.height).toBeLessThanOrEqual(plotBox.y + 1);
        await next.tap();
        await expect(tip).toBeHidden();
        await expect(page.locator('#chartState')).toHaveText('Сейчас');
        await expect(next).toBeDisabled();
    });

    test('opens from the mobile shortcuts and allows inspecting a point and returning to now', async ({ page }) => {
        await mockClass(page);
        await page.goto('/physics-forecast.html');
        await expect(page.locator('#probChart')).toBeInViewport();
        await page.locator('#chartExpand').tap();
        await expect(page.locator('#chartDialog #probChart')).toBeInViewport();
        await page.locator('#chartExpand').tap();
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
