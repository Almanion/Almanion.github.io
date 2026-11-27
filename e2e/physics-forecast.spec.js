'use strict';
const { test, expect } = require('@playwright/test');
const M = require('../physics-forecast-core');
test.use({ serviceWorkers: 'block' });

async function placeOrder(page) {
    await page.locator('#placeOrder').click();
    await page.locator('#reviewConfirm').click();
    await expect(page.locator('#reviewTitle')).toHaveText(/Сделка принята|Заявка выставлена/);
    await page.locator('#reviewBack').click();
    await expect(page.locator('#tradeSheet')).toBeHidden();
}

async function chooseOutcome(page, side = 'yes') {
    await page.locator('#outcomeList button[data-outcome="' + side + '"]').click();
}

async function mockClass(page, who = 'classmate', firstVisit = false, accounts = {}) {
    await page.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ contentType:'application/javascript', body:'' }));
    await page.route('**/account.js*', route => route.fulfill({ contentType:'application/javascript', body:'' }));
    await page.addInitScript(fixture, { who, owner: M.OWNER, firstVisit, accounts });
}
function fixture({ who, owner, firstVisit, accounts }) {
    if (!firstVisit) localStorage.setItem('almanion:forecast:guide-seen:v1', '1');
    const clock = Date.now(), d = new Date(clock + 10800000).toISOString().slice(0,10);
    const id = '00000000000000000000';
    const saved = sessionStorage.getItem('forecast-test-data');
    const data = { accountDirectory: accounts, '.info': { connected:true, serverTimeOffset:0 }, physicsForecast: saved ? JSON.parse(saved) : {
        events:{[id]:{day:d,n:1,at:clock-160000,actor:owner,kind:'open',endAt:Date.parse(d+'T00:00:00+03:00')+86400000}},
        rounds:{[d]:{last:id,phase:'open',endAt:Date.parse(d+'T00:00:00+03:00')+86400000}},head:{id,n:1}} };
    const listeners = new Map(), sessions = new Set();
    function value(path) {
        if (path.startsWith('accountDirectory') && auth.currentUser?.uid !== owner) return null;
        return path.split('/').filter(Boolean).reduce((obj,k)=>obj?.[k],data) ?? null;
    }
    function snap(path) { const val = structuredClone(value(path)); return { val:()=>val, exists:()=>val!==null,
        numChildren:()=>val && typeof val === 'object' ? Object.keys(val).length : 0,
        forEach:cb=>Object.entries(val || {}).sort((a,b)=>a[1].n-b[1].n).forEach(([key,v])=>cb({key,val:()=>v})) }; }
    function emit(path) { listeners.get(path)?.forEach(cb => cb(snap(path))); }
    let serial = data.physicsForecast.head?.n || 1;
    function ref(path='') { return {
        child:key=>ref([path,key].filter(Boolean).join('/')), orderByChild:()=>ref(path), get:async()=>{
            const result = snap(path);
            if (path === 'physicsForecast/events' && window.beforeReturningForecastEvents) {
                const update = window.beforeReturningForecastEvents;
                delete window.beforeReturningForecastEvents;
                await update();
            }
            return result;
        }, once:async()=>snap(path),
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
    window.setRankProfile = (uid, identity, visible) => {
        data.accountProfiles ||= {};
        data.accountProfiles[uid] = { identity, rankVisible: visible };
        emit('accountProfiles/' + uid + '/rankVisible');
        emit('accountProfiles/' + uid + '/identity');
    };
    window.AlmanionAccount = { database:database(), auth, profile: { avatarMarkup: () => '' }, openLogin:()=>{document.body.dataset.loginOpened='true';} };
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

for (const [count, width] of [[2, 320], [3, 390], [4, 1280]]) {
    test('named answers, order book, deadline and winner with ' + count + ' choices', async ({ page }) => {
        await page.setViewportSize({ width, height: 820 });
        await page.clock.install({ time: new Date('2026-11-26T06:00:01Z') });
        await mockClass(page, 'owner'); await page.goto('/admin.html#forecasts');
        await expect(page.getByRole('tab', { name: 'Прогнозы', exact: true })).toBeVisible();
        await page.locator('#showCreate').click();
        await page.locator('#eventQuestion').fill('Какая команда победит?');
        await page.locator('#newTime').fill('10:15');
        const labels = ['Северная команда учебного корпуса', 'Юг', 'Восток', 'Запад'].slice(0, count);
        const sides = M.SIDE_IDS.slice(0, count), selected = sides.at(-1), winning = labels.at(-1);
        const inputs = page.locator('#answerEditor input');
        for (let i = 2; i < count; i++) await page.locator('#addAnswer').click();
        if (count === 4) {
            await expect(page.locator('#addAnswer')).toBeHidden();
            await page.getByRole('button', { name: 'Удалить вариант 3' }).click();
            await expect(inputs).toHaveCount(3); await page.locator('#addAnswer').click();
        }
        for (const [i, label] of labels.entries()) await inputs.nth(i).fill(label);
        await inputs.nth(1).fill(labels[0].toLowerCase());
        const open = page.getByRole('button', { name: 'Открыть прогноз', exact: true });
        await open.click(); await expect(page.locator('#createRound')).toBeVisible();
        expect(await inputs.nth(1).evaluate(input => input.validity.customError)).toBe(true);
        await inputs.nth(1).fill(labels[1]); await open.click();
        await expect(page.locator('#manageStatus')).toContainText('10:15 мск');
        const created = await page.evaluate(() => {
            const { head, events } = JSON.parse(sessionStorage.getItem('forecast-test-data'));
            return { version:head.v, liquidity:events[head.id].liquidity };
        });
        expect(created).toEqual({ version:5, liquidity:1 });
        await page.locator('#editDeadline summary').click();
        await page.locator('#manageDeadline').fill('2026-11-26T09:02');
        await page.getByRole('button', { name:'Сохранить время' }).click();
        await expect(page.locator('#manageStatus')).toContainText('09:02 мск');
        await page.locator('#forecastMarketLink').click();
        await expect(page.locator('#marketDeadline')).toContainText('09:02 мск');
        await expect(page.locator('#outcomeList button')).toHaveCount(count);
        await page.locator('#chartSideSelect').selectOption(selected);
        await expect(page.locator('#probChart')).toHaveAttribute('aria-label', new RegExp(winning));
        await expect(page.locator('#probability')).toHaveText(count === 3 ? '33,3%' : count === 4 ? '25%' : '50%');
        await chooseOutcome(page, selected);
        await expect(page.locator('#bookSide')).toHaveValue(selected);
        await expect(page.locator('#tradeForm [name=side]')).toHaveValue(selected);
        await expect(page.locator('#bookAsks tr')).toHaveCount(3);
        const fits = () => page.evaluate(() => {
            const cells = [...document.querySelectorAll('#publicOrders tr')].filter(row => row.cells.length === 2);
            return document.documentElement.scrollWidth <= innerWidth + 1 && cells.every(row =>
                row.cells[0].getBoundingClientRect().right <= row.cells[1].getBoundingClientRect().left + 1);
        });
        expect(await fits()).toBe(true);
        await page.locator('#buyUnit').selectOption('shares'); await page.locator('#quantity').fill('6');
        await placeOrder(page);
        await page.locator('#bookSide').selectOption('yes');
        await expect(page.locator('#tradeForm [name=side]')).toHaveValue(selected);
        await expect(page.locator('#tradeHistory')).toContainText(winning);
        const holding = page.locator('[data-holding="' + selected + '"]');
        await expect(holding.locator('dd span')).toHaveText('6');
        await page.locator('#walletToggle').click();
        await holding.getByRole('button').click(); await page.locator('#quantity').fill('1'); await placeOrder(page);
        await expect(holding.locator('dd span')).toHaveText('5');
        await page.locator('#walletToggle').click();
        await holding.getByRole('button').click();
        await page.locator('label:has([value=limit])').click(); await page.locator('#limitPrice').fill('0,98');
        await placeOrder(page); await expect(page.locator('#myOrders')).toContainText(winning);
        await page.clock.fastForward(122000);
        await expect(page.locator('#roundState')).toHaveText('Торги закрыты');
        await expect(page.locator('#publicOrders')).toBeHidden();
        await expect(page.locator('.forecast-orders button[data-order-id]:visible')).toHaveCount(0);
        await expect(page.locator('#orderHistory')).toContainText('Торги закрыты');
        await expect(page.locator('#orderHistory')).toContainText('Резерв снят · 1 доля');
        await page.locator('#forecastAdminLink').click();
        await expect(page.locator('#editDeadline')).toBeHidden();
        await expect(page.locator('[data-winner]:visible')).toHaveCount(count);
        await page.locator('[data-command="' + selected + '"]').click();
        await expect(page.locator('#confirmText')).toContainText(winning); await page.locator('#confirmGo').click();
        await expect(page.locator('#manageStatus')).toContainText('Итог «' + winning + '»');
        await page.locator('#forecastMarketLink').click();
        await expect(page.locator('#walletOutcome')).toContainText('Выплата 5 оч.');
        await expect(page.locator('#roundState')).toHaveText('Итог «' + winning + '»');
    });
}

test('expiry in another event releases the shared balance while the selected market stays open', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-26T06:00:02Z') });
    await mockClass(page); await page.goto('/forecast.html');
    await expect(page.locator('#walletCash')).toHaveText('100 оч.');
    await page.evaluate(async () => {
        const core = window.PhysicsForecast, at = Date.now(), day = core.dayKey(at);
        const root = window.AlmanionAccount.database.ref('physicsForecast'), key = '00000000000000000902';
        const open = { n:2, at, day:key, kind:'open', actor:core.OWNER, question:'Другой прогноз?',
            endAt:core.deadline(day,'09:01'), eventEnd:core.endOfDay(day) };
        const buy = { n:3, at:at+1, day:key, actor:'classmate', kind:'order', mode:'market', action:'buy', side:'yes', qty:2, limit:51 };
        const order = { ...buy, n:4, at:at+2, mode:'limit', qty:50, limit:10 };
        await root.update({ ['events/'+key]:open, 'events/00000000000000000903':buy, 'events/00000000000000000904':order,
            head:{ n:4, id:'00000000000000000904', v:3 } });
    });
    await expect(page.locator('#lessonQuestion')).toHaveText(M.physics.question);
    await expect(page.locator('#walletCash')).toHaveText('93,98 оч.');
    await expect(page.locator('#walletHeld')).toHaveText('5 оч.');
    await page.locator('#walletToggle').click();
    const other = page.locator('#walletOtherList');
    await expect(other).toContainText('Другой прогноз');
    await expect(other.locator('[data-holding="yes"]')).toContainText('2 доли');
    await other.locator('[data-wallet-order]').click();
    await expect(page.locator('#lessonQuestion')).toHaveText('Другой прогноз?');
    await expect(page.locator('#myOrders [data-order="00000000000000000904"]')).toBeFocused();
    await page.locator('#eventPicker').click();
    const events = page.getByRole('dialog', { name:'События' });
    await expect(events.getByRole('button', { name:/Другой прогноз\?/ })).toContainText('У тебя 2 доли · Заявки · 1');
    await events.getByRole('button', { name:/Будет ли работа по физике/ }).click();
    await page.clock.fastForward(61000);
    await expect(page.locator('#walletCash')).toHaveText('98,98 оч.');
    await expect(page.locator('#roundState')).toHaveText('Торги открыты');
    await page.locator('#eventPicker').click();
    await expect(events.getByRole('heading', { name:'Ждут итога' })).toBeVisible();
    await expect(events.getByRole('button', { name:/Другой прогноз\?/ })).toBeVisible();
});

test('event picker wraps long questions on mobile and restores keyboard focus', async ({ page }) => {
    await page.setViewportSize({ width:320, height:640 });
    await page.clock.install({ time:new Date('2026-11-26T06:00:02Z') });
    await mockClass(page);
    await page.goto('/forecast.html');
    const trigger = page.getByRole('button', { name:'События', exact:true });
    await expect(trigger).toBeVisible();
    const key = '00000000000000000902';
    const question = 'Выиграет ли сборная 10-1 товарищеский матч у сборной 10-2 после занятий в следующую пятницу?';
    await page.evaluate(async ({ key, question }) => {
        const core = window.PhysicsForecast, at = Date.now(), day = core.dayKey(at);
        const root = window.AlmanionAccount.database.ref('physicsForecast');
        const another = '00000000000000000903', result = '00000000000000000904';
        const open = { at, kind:'open', actor:core.OWNER, endAt:core.endOfDay(day), eventEnd:core.endOfDay(day) };
        await root.update({
            ['events/' + key]:{ ...open, n:2, day:key, question },
            ['events/' + another]:{ ...open, n:3, day:another, question:'Состоится ли экскурсия?' },
            ['events/' + result]:{ n:4, at, day:another, actor:core.OWNER, kind:'void' },
            head:{ n:4, id:result, v:3 }
        });
    }, { key, question });

    const events = page.getByRole('dialog', { name:'События' });
    await trigger.press('Enter');
    await expect(events).toBeVisible();
    await expect(events.getByRole('heading', { name:'Открытые' })).toBeVisible();
    await expect(events.getByRole('heading', { name:'Завершённые' })).toBeVisible();
    await expect(events.locator('[aria-current="true"]')).toContainText(M.physics.question);
    const next = events.locator('[data-event-id="' + key + '"]');
    await expect(next).toContainText(question);
    const title = next.getByText(question, { exact:true });
    await expect.poll(() => title.evaluate(element => {
        const bounds = element.closest('button').getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        const lines = [...range.getClientRects()];
        return lines.length > 1 && lines.every(line => line.left >= bounds.left && line.right <= bounds.right + 1);
    })).toBe(true);

    await page.keyboard.press('Escape');
    await expect(events).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.press('Enter');
    await next.press('Enter');
    await expect(events).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.locator('#lessonQuestion')).toHaveText(question);
    await expect(page).toHaveURL(new RegExp('\\?event=' + key + '$'));

    await trigger.click();
    await expect(next).toHaveAttribute('aria-current', 'true');
    await page.locator('#closeForecastEvents').click();
    await expect(events).toBeHidden();
    await trigger.click();
    await expect(events).toBeVisible();
    await page.evaluate(() => window.changeForecastAccount(null));
    await expect(events).toBeHidden();
    await expect(trigger).toBeHidden();
    await expect(page.locator('#forecastEvents [data-event-id]')).toHaveCount(0);
});

test('first visit explains the market and guides the phone through real controls without trading', async ({ page, context }) => {
    await page.setViewportSize({width:320,height:640});
    await mockClass(page, 'classmate', true); await page.goto('/forecast.html');
    const rules = page.getByRole('dialog', {name:'Как устроен рынок'});
    await expect(rules).toBeVisible(); await expect(rules).toContainText('5 долей «Да» по 0,40');
    await expect(rules.locator('.forecast-guide-example dd')).toHaveText(['2 очка','5 очков','+3 очка']);
    await page.getByRole('button', {name:'Начать обзор'}).click();
    await expect(page.locator('#backMarketTour')).toBeDisabled();
    await expectSpotlight(page, 'eventPicker');
    await page.locator('#nextMarketTour').click(); await expectSpotlight(page, 'probChart');
    await page.locator('#backMarketTour').click(); await expectSpotlight(page, 'eventPicker');
    await page.locator('#nextMarketTour').click(); await page.locator('#nextMarketTour').click();
    await expectSpotlight(page, 'marketOutcomes');
    await page.setViewportSize({width:568,height:320}); await expectSpotlight(page, 'marketOutcomes');
    await page.locator('#nextMarketTour').click(); await expectSpotlight(page, 'portfolio');
    await expect(page.locator('#tourProgress')).toHaveText('Шаг 4 из 4');
    await page.getByRole('button', {name:'Готово',exact:true}).click();
    await expect(page.locator('#marketTour')).toBeHidden();
    await expect(page.locator('[data-market-guide=start]')).toBeFocused();
    await expect(page.locator('#walletCash')).toHaveText('100 оч.'); await expect(page.locator('#walletYes')).toHaveCount(0);
    await page.reload(); await expect(page.locator('#gameSurface')).toBeVisible(); await expect(rules).toBeHidden();
    const nextTab = await context.newPage();
    await mockClass(nextTab, 'classmate', true); await nextTab.goto('/forecast.html');
    await expect(nextTab.locator('#gameSurface')).toBeVisible(); await expect(nextTab.locator('#marketGuide')).toBeHidden();
});

test('rules remain available to guests and the tour can be replayed, skipped and dismissed by keyboard', async ({ page }) => {
    await mockClass(page, 'guest', true); await page.goto('/forecast.html');
    await expect(page.locator('#marketGuide')).toBeHidden();
    await page.locator('[data-market-guide=start]').click();
    await expect(page.locator('#guideAvailability')).toHaveText('Обзор доступен после входа.');
    await expect(page.locator('#startMarketTour')).toBeHidden(); await page.keyboard.press('Escape');
    await expect(page.locator('#gateAction')).toBeVisible();
    await page.evaluate(() => window.changeForecastAccount({uid:'classmate',isAnonymous:false}));
    const trigger=page.locator('[data-market-guide=start]');
    await expect(page.locator('#marketGuide')).toBeVisible();
    await page.locator('#startMarketTour').click(); await page.locator('#skipMarketTour').click();
    await expect(trigger).toBeFocused(); await trigger.click(); await page.locator('#startMarketTour').click();
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    await trigger.click(); await page.locator('#startMarketTour').click();
    await page.evaluate(() => window.changeForecastAccount(null));
    await expect(page.locator('#marketTour')).toBeHidden(); await expect(page.locator('#gameSurface')).toBeHidden();
});

test('empty offers explain which side is missing and a guide can be opened from a draft without losing it', async ({page}) => {
    await page.setViewportSize({width:360,height:740}); await mockClass(page); await page.goto('/forecast.html');
    await chooseOutcome(page);
    await page.locator('#buyUnit').selectOption('shares'); await page.locator('#quantity').fill('3'); await placeOrder(page);
    await expect(page.locator('#walletYes')).toHaveText('3');
    await page.evaluate(async () => {
        const root = window.AlmanionAccount.database.ref('physicsForecast');
        for (const [side, qty] of [['yes',82],['no',85]]) {
            const n=(await root.child('head').get()).val().n+1, id=root.child('events').push().key, at=Date.now();
            await root.update({head:{id,n},['events/'+id]:{kind:'order', actor:'peer-'+side,
                day:window.PhysicsForecast.dayKey(at), n, at, side, qty, action:'buy', mode:'market', limit:99}});
        }
    });
    await chooseOutcome(page);
    await expect(page.locator('#ticketBuyPrice')).toHaveText('Нет продавцов');
    await expect(page.locator('#quotePreview')).toHaveText('Сейчас никто не продаёт доли «Да».');
    await expect(page.locator('#bookAsks')).toContainText('Пока нет продавцов');
    await page.locator('#explainDepth').click(); await expect(page.locator('#guideOrders summary')).toBeFocused();
    await page.locator('#startMarketTour').click(); await page.locator('#nextMarketTour').click(); await page.locator('#skipMarketTour').click();
    await expect(page.locator('#explainDepth')).toBeFocused(); await expect(page.locator('#quantity')).toHaveValue('3');
    await page.locator('label:has([value=sell])').click();
    await expect(page.locator('#ticketSellPrice')).toHaveText('Нет покупателей');
    await expect(page.locator('#bookBids')).toContainText('Пока нет покупателей');
    await expect(page.locator('#quotePreview')).toHaveText('Сейчас никто не покупает доли «Да».');
    await page.locator('#useLimit').click(); await page.locator('#limitPrice').fill('0,70'); await page.locator('#quantity').fill('3'); await placeOrder(page);
    await expect(page.locator('#myOrders')).toContainText('3 доли по 0,7 оч.'); await page.locator('#myOrders button').click();
    await expect(page.locator('#walletYes')).toHaveText('3'); await expect(page.locator('#myOrders button')).toHaveCount(0);
});

test('the walkthrough reflects a settled event and offers only the rules before the first event', async ({page}) => {
    await mockClass(page); await page.goto('/forecast.html');
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

test('an old market bookmark keeps the event and open portfolio at the new address', async ({ page }) => {
    await mockClass(page);
    await page.goto('/');
    const eventId = M.dayKey(Date.now());
    const suffix = '?event=' + eventId + '&from=bookmark#portfolio';
    await page.goto('/physics-forecast.html' + suffix, { waitUntil: 'commit' });
    await expect(page).toHaveURL(new URL('/forecast.html' + suffix, page.url()).href);
    await expect(page.locator('#portfolio')).toBeVisible();
    await expect(page.locator('#portfolio')).toHaveJSProperty('open', true);
    await page.goBack();
    await expect(page).toHaveURL('/');
});

test('only a triple activation of the homepage wordmark opens the market',async({page})=>{
    await mockClass(page,'guest');
    await page.goto('/'); const wordmark=page.locator('#homeWordmark');
    await wordmark.click(); await wordmark.click(); await expect(page).toHaveURL('/');
    await page.waitForTimeout(720); await wordmark.focus(); await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/');
    await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await expect(page).toHaveURL(/\/forecast\.html/);
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
        await expect(page).toHaveURL(/\/forecast\.html/);
        await expect(page.locator('#walletCash')).toHaveText('100 оч.');
        await chooseOutcome(page);
        await page.locator('#budget').fill('0,51');
        await expect(page.locator('#quotePreview')).toContainText('К оплате сейчас · 1 доля');
        await placeOrder(page);
        await expect(page.locator('#walletYes')).toHaveText('1');
        await expect(page.locator('#forecastAdminLink')).toBeHidden();
    });
});

test('the compact portfolio stays at the top on desktop and phone', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-26T06:00:00Z') });
    await mockClass(page);
    await page.goto('/forecast.html#portfolio');
    const portfolio = page.locator('#portfolio');
    const controls = page.locator('#walletToggle');
    const history = page.locator('#historyTitle');
    await expect(portfolio).toHaveJSProperty('open', true);
    await expect(page.locator('.forecast-context')).toHaveText('Прогнозы');
    await expect(page.locator('#lessonDate')).not.toContainText('10-1');

    for (const viewport of [{ width: 1280, height: 720 }, { width: 320, height: 568 }]) {
        await page.setViewportSize(viewport);
        await controls.focus();
        await page.keyboard.press('Escape');
        await expect(portfolio).toHaveJSProperty('open', false);
        await expect(controls).toBeFocused();
        await page.evaluate(() => window.scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'instant' }));
        await expect.poll(() => portfolio.evaluate(element => {
            const { top, bottom } = element.getBoundingClientRect();
            return Math.abs(top) <= 1 && bottom < 80 && document.documentElement.scrollWidth <= innerWidth;
        })).toBe(true);
        await expect(page.locator('#walletCash')).toHaveText('100 оч.');
        await controls.click();
        await expect(page.locator('#walletEmpty')).toBeVisible();
        await page.getByRole('link', { name: /^История сделок/ }).click();
        await expect(portfolio).toHaveJSProperty('open', false);
        await expect(history).toBeInViewport();
        await expect.poll(() => history.evaluate(element =>
            element.getBoundingClientRect().top >= document.getElementById('portfolio').getBoundingClientRect().bottom - 1
        )).toBe(true);
        await controls.click();
    }
});

test.describe('market navigation on a narrow phone', () => {
    test.use({ hasTouch:true, isMobile:true, viewport:{ width:320, height:568 } });

    test('the dock stays reachable through buying, selling, cancelling and browsing offers', async ({ page }) => {
        await page.clock.install({ time:new Date('2026-11-26T06:00:00Z') });
        await mockClass(page);
        await page.goto('/forecast.html');

        const dock = page.getByRole('navigation', { name:'Разделы прогноза' });
        const chart = dock.getByRole('link', { name:'График', exact:true });
        const trade = dock.getByRole('link', { name:'Рынок', exact:true });
        const offers = dock.getByRole('link', { name:'Цены', exact:true });
        const portfolio = dock.getByRole('link', { name:'Портфель', exact:true });
        const portfolioLinks = page.getByRole('navigation', { name:'Разделы портфеля' });
        const dockIsReachable = async () => {
            await expect(dock).toBeInViewport({ ratio:.95 });
            await expect.poll(() => dock.evaluate(element => {
                const { top, bottom } = element.getBoundingClientRect();
                const controls = [...element.querySelectorAll('a')].filter(link => link.getClientRects().length);
                return top >= innerHeight - 110 && bottom <= innerHeight + 1 &&
                    controls.every(link => link.getBoundingClientRect().height >= 44);
            })).toBe(true);
        };

        await expect(dock.getByRole('link')).toHaveCount(4);
        await dockIsReachable();
        await trade.tap();
        await expect(page.locator('#outcomesTitle')).toBeInViewport();
        await expect(trade).toHaveAttribute('aria-current', 'location');
        await chooseOutcome(page);
        await expect(dock).toBeHidden();
        const submitFitsSheet = () => page.locator('#placeOrder').evaluate(button => {
            const rect = button.getBoundingClientRect();
            return rect.top >= 0 && rect.bottom <= innerHeight;
        });
        await expect.poll(submitFitsSheet).toBe(true);
        await page.setViewportSize({ width:844, height:390 });
        await expect.poll(submitFitsSheet).toBe(true);
        await page.setViewportSize({ width:320, height:568 });
        await page.locator('#budget').fill('0,51');
        expect(await page.locator('#budget').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
        await placeOrder(page);
        await expect(page.locator('#walletYes')).toHaveText('1');
        await dockIsReachable();

        await portfolio.tap();
        await expect(page.locator('#walletTitle')).toBeInViewport();
        await page.locator('[data-sell="yes"]').tap();
        await expect(page.locator('#ticketTitle')).toBeInViewport();
        await expect(page.locator('#tradeForm [name="action"]:checked')).toHaveValue('sell');
        await page.locator('#orderMode label:has([value=limit])').tap();
        await page.locator('#limitPrice').fill('0,95');
        await page.locator('#quantity').fill('1');
        await placeOrder(page);
        await expect(page.locator('#myOrders')).toContainText('1 доля по 0,95 оч.');
        await dockIsReachable();

        await portfolio.tap();
        await expect(page.locator('#walletTitle')).toBeInViewport();
        await expect(page.locator('#walletOrderCount')).toHaveText('1');
        await portfolioLinks.getByRole('link', { name:/^Мои заявки/ }).tap();
        await expect(page.locator('#orderListTitle')).toBeInViewport();
        await page.locator('#myOrders').getByRole('button', { name:'Снять заявку' }).tap();
        await expect(page.locator('#orderFeedback')).toHaveText('Заявка снята.');
        await portfolio.tap();
        await expect(page.locator('#walletOrderCount')).toHaveText('0');
        await portfolioLinks.getByRole('link', { name:/^История сделок/ }).tap();
        await expect(page.locator('#historyTitle')).toBeInViewport();
        await expect(page.locator('#tradeHistory')).toContainText('Покупка · Да');
        await offers.tap();
        await expect(page.locator('#bookTitle')).toBeInViewport();
        await expect(offers).toHaveAttribute('aria-current', 'location');
        await expect(page.locator('#bookAsks tr')).toHaveCount(3);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
        await dockIsReachable();

        // The last two sections can share a screen and the same maximum scroll offset.
        await page.setViewportSize({ width:412, height:843 });
        await portfolio.tap();
        await expect(portfolio).toHaveAttribute('aria-current', 'location');
        await offers.tap();
        await expect(page.locator('#bookTitle')).toBeInViewport();
        await expect(offers).toHaveAttribute('aria-current', 'location');

        await chart.tap();
        await expect(page.locator('#chartTitle')).toBeInViewport();
        await page.clock.fastForward(M.DAY);
        await expect(page.locator('#roundState')).toHaveText('Торги закрыты');
        await expect(offers).toBeHidden();
        await expect(page.locator('#publicOrders')).toBeHidden();
        await dockIsReachable();
    });

    test('offers show the best levels first and let the reader expand the remaining prices', async ({ page }) => {
        await mockClass(page);
        await page.goto('/forecast.html');
        await expect(page.locator('#bookBids tr')).toHaveCount(3);

        await page.evaluate(async () => {
            const at = Date.now(), day = PhysicsForecast.dayKey(at);
            const db = window.AlmanionAccount.database.ref('physicsForecast');
            const patches = {};
            let id;
            for (let n = 2; n <= 6; n++) {
                id = String(n).padStart(20, '0');
                patches['events/' + id] = { n, at, day, actor:'another-player', kind:'order', mode:'limit',
                    action:'buy', side:'yes', qty:1, limit:10 + n };
            }
            patches.head = { id, n:6 };
            await db.update(patches);
        });

        await page.locator('#forecastJumps').getByRole('link', { name:'Цены', exact:true }).tap();
        const disclosure = page.locator('#moreBookLevels');
        const prices = page.locator('#bookBids tr:visible td:first-child');
        await expect(prices).toHaveText(['0,49', '0,45', '0,35', '0,16', '0,15', '0,14']);
        await disclosure.tap();
        await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
        await expect(prices).toHaveText(['0,49', '0,45', '0,35', '0,16', '0,15', '0,14', '0,13', '0,12']);
        await disclosure.tap();
        await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
        await expect(prices).toHaveCount(6);
    });

    for (const count of [2, 4]) test('a long question and ' + count + ' named outcomes are readable without side scrolling', async ({ page }) => {
        await mockClass(page);
        const event = '00000000000000000002';
        await page.goto('/forecast.html?event=' + event);
        await expect(page.locator('#walletCash')).toHaveText('100 оч.');

        const question = 'Какая сборная получит первое место в товарищеском матче учебного корпуса в конце следующей недели?';
        const criteria = 'Считаются результаты основного времени и дополнительных раундов. ' +
            'Официальный результат объявят после проверки протокола организаторами. ' +
            'Если встречу перенесут на другую дату, этот прогноз будет отменён.';
        const names = ['Сборная северного учебного корпуса', 'Сборная южного учебного корпуса',
            'Объединённая команда выпускников', 'Гости из соседнего учебного корпуса'];
        const sides = M.SIDE_IDS.slice(0, count);
        const answers = Object.fromEntries(sides.map((id, index) => [id, names[index]]));
        await page.evaluate(async ({ event, question, criteria, answers }) => {
            const at = Date.now(), end = PhysicsForecast.endOfDay(PhysicsForecast.dayKey(at));
            const db = window.AlmanionAccount.database.ref('physicsForecast');
            await db.update({ ['events/' + event]:{ n:2, at, day:event, endAt:end, eventEnd:end,
                actor:PhysicsForecast.OWNER, kind:'open', question, criteria, answers }, head:{ id:event, n:2 } });
        }, { event, question, criteria, answers });

        await page.locator('#eventPicker').tap();
        await page.locator('#forecastEvents').getByRole('button', { name:new RegExp(question.replace('?', '\\?')) }).tap();
        await expect(page.locator('#lessonQuestion')).toHaveText(question);
        const terms = page.locator('#eventCriteria'), toggle = page.locator('#criteriaToggle');
        await expect(terms).toBeHidden();
        await toggle.tap();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await expect(terms).toHaveText(criteria);
        await toggle.tap();
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');

        await page.locator('#forecastJumps').getByRole('link', { name:'Рынок' }).tap();
        const choices = page.locator('#outcomeList button');
        await expect(choices).toHaveCount(count);
        await choices.last().tap();
        await expect(page.locator('#tradeForm [name=side]')).toHaveValue(sides.at(-1));
        await expect(page.locator('#ticketOutcome')).toHaveText(names[count - 1]);
        await page.locator('#changeOutcome').click();
        const outcomeRowsFit = await choices.evaluateAll(labels => labels.every(label => {
            const card = label.getBoundingClientRect();
            const name = label.querySelector('.forecast-outcome-name').getBoundingClientRect();
            const value = label.querySelector('.forecast-outcome-value').getBoundingClientRect();
            return name.width > card.width * .8 && name.bottom <= value.top &&
                card.left >= 0 && card.right <= innerWidth + 1;
        }));
        expect(outcomeRowsFit).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    });

    test('the ranked nickname, score and close button fit after a trade', async ({ page }) => {
        await mockClass(page);
        await page.goto('/forecast.html');
        await chooseOutcome(page);
        await page.locator('#budget').fill('7,85');
        await placeOrder(page);
        await expect(page.locator('#walletYes')).toHaveText('15');

        const nickname = 'ЧествующийДлинныйПсевдоним';
        await page.evaluate(name => setRankProfile('classmate', { nickname:name }, true), nickname);
        const open = page.locator('#rankOpen');
        await open.tap();
        const rating = page.getByRole('dialog', { name:'Рейтинг прогнозов' });
        const row = rating.locator('.rank-row.is-mine');
        const close = rating.getByRole('button', { name:'Закрыть рейтинг' });
        await expect(row.getByText(nickname, { exact:true })).toBeVisible();
        await expect(row.locator('.rank-score')).toHaveText('100');
        await rating.getByRole('button', { name:'С открытыми долями', exact:true }).tap();
        await expect(row.locator('.rank-score')).toHaveText('100,4');
        expect(await row.evaluate(element => {
            const name = element.querySelector('.rank-person');
            const score = element.querySelector('.rank-score');
            return name.getBoundingClientRect().right <= score.getBoundingClientRect().left &&
                element.scrollWidth <= element.clientWidth + 1;
        })).toBe(true);

        await page.setViewportSize({ width:568, height:320 });
        await expect(close).toBeInViewport({ ratio:1 });
        await close.tap();
        await expect(rating).toBeHidden();
        await expect(open).toBeFocused();
    });
});

test('an anonymous session can sign in on the market page and signing out hides the market', async ({ page }) => {
    await mockClass(page, 'anonymous');
    await page.goto('/forecast.html');
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
        await page.goto('/forecast.html'); await expect(page.locator('#gameSurface')).toBeVisible();
        await page.locator('#rankOpen').click();
        await expect(page.locator('#rankMine')).toContainText('Сделок пока нет');
        await page.locator('#rankClose').click();
        await expect(page.locator('#probability')).toHaveText('50%');
        await expect(page.locator('#walletCash')).toHaveText('100 оч.');
        await chooseOutcome(page);
        await page.locator('#buyUnit').selectOption('shares');
        await page.locator('#quantity').fill('15'); await expect(page.locator('#quotePreview')).toContainText('7,85');
        await placeOrder(page);
        await expect(page.locator('#walletYes')).toHaveText('15');
        await expect(page.locator('#walletCash')).toHaveText('92,15 оч.');
        await expect(page.locator('#tradeHistory .forecast-row')).toHaveCount(2);
        await page.locator('#rankOpen').click();
        await expect(page.locator('#rankRows .rank-row')).toHaveCount(1);
        await expect(page.locator('#rankMine')).toHaveText('Ваше место — 1 · 100 оч.');
        await page.getByRole('button', { name: 'С открытыми долями' }).click();
        await expect(page.locator('#rankMine')).toHaveText('Ваше место — 1 · 100,4 оч.');
        await page.evaluate(() => setRankProfile('classmate', { nickname: 'Лис' }, true));
        await expect(page.locator('#rankRows')).toContainText('Лис');
        await page.evaluate(() => setRankProfile('classmate', { nickname: 'Лис' }, false));
        await expect(page.locator('#rankRows')).not.toContainText('Лис');
        await expect(page.locator('#rankRows')).toContainText('Игрок');
        await page.keyboard.press('Escape');
        await expect(page.locator('#rankOpen')).toBeFocused();
        await expect(page.locator('#probability')).toHaveText('52%');
        await chooseOutcome(page);
        await page.locator('label:has(input[name=action][value=sell])').click();
        await page.locator('#orderMode label:has([value=limit])').click();await page.locator('#limitPrice').fill('0,70');await page.locator('#quantity').fill('4');
        await placeOrder(page);await expect(page.locator('#myOrders')).toContainText('4 доли по 0,7 оч.');
        await page.locator('#myOrders button').click();await expect(page.locator('#myOrders')).toContainText('нет заявок в ожидании сделки');
        await page.locator('[data-range=hour]').click(); await expect(page.locator('[data-range=hour]')).toHaveAttribute('aria-pressed','true');
        await page.locator('#chartCursor').focus();await page.keyboard.press('Home');
        await expect(page.locator('#historyScope')).toHaveCount(0);await expect(page.locator('#tradeHistory .forecast-row')).toHaveCount(2);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await expect(page.locator('#forecastAdminLink')).toBeHidden();
    });
}

test('desktop orders stay just below the ticket even when the market chart is taller', async ({ page }) => {
    await mockClass(page);
    await page.goto('/forecast.html');
    await expect(page.locator('#orderListTitle')).toBeVisible();
    for (const width of [768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await expect.poll(() => page.evaluate(() => {
            const ticket = document.getElementById('tradeTicket').getBoundingClientRect();
            const orders = document.querySelector('.forecast-orders').getBoundingClientRect();
            const graph = document.getElementById('marketChart').getBoundingClientRect();
            return Math.abs(ticket.left - orders.left) <= 1 && orders.top >= ticket.bottom
                && orders.top - ticket.bottom < 24 && graph.bottom > orders.top;
        })).toBe(true);
    }
});

test('point budget buys whole shares at actual prices and a limit order separates fills from reserved points', async ({ page }) => {
    await mockClass(page);
    await page.goto('/forecast.html');
    const budget = page.getByLabel('Лимит покупки'), submit = page.locator('#placeOrder');
    const quote = page.locator('#quotePreview');
    await expect(submit).toHaveText('Проверить покупку');
    await expect(quote).toContainText('К оплате сейчас · 9 долей');
    await expect(quote).toContainText('4,59 оч.');
    await budget.fill('0,50');
    await expect(submit).toBeDisabled();
    await expect(page.locator('#quotePreview')).toContainText('0,51');
    await budget.fill('7.84');
    await expect(quote).toContainText('К оплате сейчас · 14 долей');
    await budget.fill('7,85');
    await expect(quote).toContainText('К оплате сейчас · 15 долей');
    await page.getByRole('button', {name:'1 оч.',exact:true}).click();
    await expect(quote).toContainText('К оплате сейчас · 1 доля');
    await page.locator('#orderMode label:has([value=limit])').click();
    await page.locator('#limitPrice').fill('1.00');
    await expect(submit).toBeDisabled();
    await page.locator('#limitPrice').fill('0,53');
    await budget.fill('6,16');
    await expect(submit).toHaveText('Проверить заявку');
    await expect(quote).toContainText('К оплате сейчас · 10 долей');
    await expect(quote).toContainText('В резерв на 1 долю');
    await budget.fill('6,36');
    await expect(page.locator('#quotePreview')).toContainText('5,1 оч.');
    await expect(page.locator('#quotePreview')).toContainText('1,06 оч.');
    await expect(page.locator('#quotePreview')).toContainText('6,36 оч.');
    await placeOrder(page);
    await expect(page.locator('#walletYes')).toHaveText('10');
    await expect(page.locator('#walletHeld')).toHaveText('1,06 оч.');
    await expect(page.locator('#feedback')).toContainText('В открытой заявке 2 доли');
    await page.locator('#myOrders button').click();
    await expect(page.locator('#walletHeld')).toHaveText('0 оч.');
    await expect(page.locator('#walletCash')).toHaveText('94,9 оч.');
});

test('a 67-point buying limit shows the actual cost and empty offers after the available shares are bought and sold', async ({ page }) => {
    await mockClass(page);
    await page.goto('/forecast.html');
    await chooseOutcome(page, 'no');
    const budget = page.getByLabel('Лимит покупки'), submit = page.locator('#placeOrder');
    const quote = page.locator('#quotePreview');
    await budget.fill('67');
    await expect(quote).toContainText('К оплате сейчас · 85 долей');
    await expect(quote).toContainText('51,35 оч.');
    await expect(quote).toContainText('15,65 оч.');
    await placeOrder(page);
    await expect(page.locator('#walletNo')).toHaveText('85');
    await expect(page.locator('#walletCash')).toHaveText('48,65 оч.');
    await expect(budget).toHaveValue('67');
    await expect(quote).toContainText('Сейчас никто не продаёт доли «Нет».');

    await page.locator('#walletToggle').click();
    await page.locator('[data-sell="no"]').click();
    await page.locator('#sizePresets button').last().click();
    await expect(submit).toHaveText('Проверить продажу');
    await expect(quote).toContainText('К получению сейчас · 85 долей');
    await placeOrder(page);
    await expect(page.locator('#walletNo')).toHaveCount(0);
    await expect(page.locator('#walletCash')).toHaveText('82,3 оч.');
    await page.locator('label:has(input[value=buy])').click();
    await budget.fill('99');
    await expect(quote).toContainText('Сейчас никто не продаёт доли «Нет».');
    await expect(submit).toBeDisabled();
    await expect(page.locator('#useLimit')).toBeVisible();
});

test('owner can replenish an exhausted legacy market and its existing round and trades stay intact', async ({ page }) => {
    await page.clock.install({ time:new Date('2026-11-26T06:00:02Z') });
    await mockClass(page, 'owner');
    const switchToParticipant = () => page.evaluate(() => window.changeForecastAccount({ uid:'classmate', isAnonymous:false }));
    const savedLedger = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('forecast-test-data')));
    const quote = page.locator('#quotePreview');

    await page.goto('/forecast.html');
    await switchToParticipant();
    await chooseOutcome(page, 'no');
    await page.getByLabel('Лимит покупки').fill('67');
    await expect(quote).toContainText('К оплате сейчас · 85 долей');
    await placeOrder(page);
    await expect(page.locator('#walletNo')).toHaveText('85');
    await expect(page.locator('#quotePreview')).toHaveText('Сейчас никто не продаёт доли «Нет».');
    const before = await savedLedger();
    const day = M.dayKey(Date.parse('2026-11-26T06:00:02Z'));

    await page.goto('/admin.html#forecasts');
    const enable = page.locator('[data-command="liquidity"]');
    await expect(enable).toBeVisible();
    await enable.click();
    await expect(page.locator('#confirmText')).toContainText('пополнение');
    expect((await savedLedger()).head).toEqual(before.head);
    await page.locator('#confirmGo').click();
    await expect(page.locator('#adminFeedback')).toHaveText('Пополнение долей включено.');
    await expect(enable).toBeHidden();
    const enabled = await savedLedger();
    expect(enabled.head.v).toBe(5);
    expect(enabled.events[enabled.head.id]).toMatchObject({ kind:'liquidity', day, actor:M.OWNER });
    expect(enabled.rounds).toEqual(before.rounds);
    expect(enabled.events).toMatchObject(before.events);

    await page.locator('#forecastMarketLink').click();
    await switchToParticipant();
    await expect(page.locator('#walletNo')).toHaveText('85');
    await chooseOutcome(page, 'no');
    await page.locator('#buyUnit').selectOption('shares');
    await page.locator('#quantity').fill('1');
    await expect(quote).toContainText('К оплате сейчас · 1 доля');
    await placeOrder(page);
    await expect(page.locator('#walletNo')).toHaveText('86');
    expect((await savedLedger()).head.v).toBe(5);
});

test('selling the selected holding respects reservations, supports half or all and never trades until confirmed', async ({ page }) => {
    await page.setViewportSize({width:320,height:740}); await mockClass(page);
    await page.goto('/forecast.html');
    await chooseOutcome(page, 'no');
    await placeOrder(page);
    await expect(page.locator('#walletNo')).toHaveText('9');
    await chooseOutcome(page);
    await page.locator('label:has(input[value=sell])').click();
    await expect(page.locator('#tradeForm [name=side]')).toHaveValue('yes');
    await page.locator('#changeOutcome').click();
    await chooseOutcome(page, 'no');
    await page.locator('label:has(input[value=sell])').click();
    await page.locator('#orderMode label:has([value=limit])').click();
    await page.locator('#limitPrice').fill('0.75');
    await page.locator('#quantity').fill('3');
    await placeOrder(page);
    await expect(page.locator('#walletBalances .forecast-reserve')).toHaveText('В продаже 3 доли');
    await page.locator('#walletToggle').click();
    await page.getByRole('button', {name:'Продать доли «Нет»',exact:true}).click();
    await expect(page.locator('#ticketTitle')).toBeFocused();
    await expect(page.locator('#orderMode [value=market]')).toBeChecked();
    await expect(page.locator('#quantity')).toHaveValue('1');
    await expect(page.locator('#walletNo')).toHaveText('9');
    await page.getByRole('button',{name:'50% · 3 доли',exact:true}).click();
    await expect(page.locator('#quotePreview')).toContainText('1,47 оч.');
    await page.getByRole('button',{name:'Все · 6 долей',exact:true}).click();
    await placeOrder(page);
    await expect(page.locator('#walletNo')).toHaveText('3');
    await expect(page.locator('#feedback')).toContainText('Продажа · 6 долей «Нет» за 2,94 оч.');
    await chooseOutcome(page, 'no');
    await expect(page.locator('#showOrders')).toBeVisible();
    await page.locator('#showOrders').click(); await page.locator('#myOrders button').click();
    await expect(page.locator('#walletBalances .forecast-reserve')).toHaveCount(0);
    await page.locator('#walletToggle').click();
    await expect(page.getByRole('button', {name:'Продать доли «Нет»',exact:true})).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('insufficient depth offers an executable quantity or a resting order and an empty position leads back to buying', async ({ page }) => {
    await mockClass(page); await page.goto('/forecast.html');
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
    await expect(page.locator('#walletYes')).toHaveCount(0);
});

test('owner enters the dashboard at the current event, closes it, settles and returns to the market', async ({page}) => {
    await mockClass(page,'owner'); await page.goto('/forecast.html');
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

test('every forecast template fills a valid question, resolution rule and two to four answers', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 780 });
    await mockClass(page, 'owner');
    await page.goto('/admin.html#forecasts');
    await page.locator('#showCreate').click();

    const picker = page.locator('#eventTemplate');
    const presets = await picker.locator('optgroup option').evaluateAll(options => options.map(option => option.value));
    const counts = new Set(), questions = new Set();
    expect(await picker.locator('optgroup').count()).toBeGreaterThan(1);
    for (const preset of presets) {
        await picker.selectOption(preset);
        const question = await page.locator('#eventQuestion').inputValue();
        const criteria = await page.locator('#newCriteria').inputValue();
        const answers = await page.locator('#answerEditor input').evaluateAll(inputs => inputs.map(input => input.value));
        expect(question.trim(), preset).toBeTruthy();
        expect(question.length, preset).toBeLessThanOrEqual(M.QUESTION_LIMIT);
        expect(criteria.trim(), preset).toBeTruthy();
        expect(criteria.length, preset).toBeLessThanOrEqual(M.CRITERIA_LIMIT);
        expect(M.validAnswers(Object.fromEntries(answers.map((label, index) => [M.SIDE_IDS[index], label]))), preset).toBe(true);
        questions.add(question);
        counts.add(answers.length);
    }
    expect([...counts].sort()).toEqual([2, 3, 4]);
    expect(questions.size).toBe(presets.length);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('an owner can restore a manual draft and publish an edited forecast template on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.install({ time: new Date('2026-11-26T07:00:00Z') });
    await mockClass(page, 'owner');
    await page.goto('/admin.html#forecasts');
    await page.locator('#showCreate').click();

    const picker = page.locator('#eventTemplate'), question = page.locator('#eventQuestion');
    const criteria = page.locator('#newCriteria'), answers = page.locator('#answerEditor input');
    const answerValues = () => answers.evaluateAll(inputs => inputs.map(input => input.value));

    await page.locator('[data-offset="1"]').click();
    await page.locator('#newTime').fill('14:10');
    await question.fill('Сколько раундов пройдёт команда?');
    await criteria.fill('Считаем по протоколу турнира.');
    await page.locator('#addAnswer').click();
    const manualAnswers = ['Один', 'Два', 'Три и больше'];
    for (const [index, label] of manualAnswers.entries()) await answers.nth(index).fill(label);
    await picker.selectOption({ label: 'Работа по физике' });
    await picker.selectOption('');
    await expect(question).toHaveValue('Сколько раундов пройдёт команда?');
    await expect(criteria).toHaveValue('Считаем по протоколу турнира.');
    expect(await answerValues()).toEqual(manualAnswers);

    await picker.selectOption({ label: 'Итог матча' });
    await expect(answers).toHaveCount(3);
    const match = 'Чем закончится товарищеский матч класса?';
    const rule = 'Берём счёт в протоколе после основного времени.';
    await answers.nth(2).fill('Победа гостей');
    await expect(picker).toHaveValue('');
    await question.fill(match);
    await criteria.fill(rule);
    const matchAnswers = await answerValues();
    await picker.selectOption({ label: 'Домашнее задание' });
    await picker.selectOption('');
    expect(await answerValues()).toEqual(matchAnswers);
    await expect(question).toHaveValue(match);
    await expect(criteria).toHaveValue(rule);
    await expect(page.locator('#newDay')).toHaveValue('2026-11-27');
    await expect(page.locator('#newTime')).toHaveValue('14:10');

    await page.getByRole('button', { name: 'Открыть прогноз', exact: true }).click();
    await expect(page.locator('#manageTitle')).toHaveText(match);
    const command = await page.evaluate(() => {
        const { head, events } = JSON.parse(sessionStorage.getItem('forecast-test-data'));
        return events[head.id];
    });
    expect(command).toMatchObject({
        kind: 'open', question: match, criteria: rule, endAt: M.deadline('2026-11-27', '14:10')
    });
    expect(command.answers).toEqual(Object.fromEntries(matchAnswers.map((label, index) => [M.SIDE_IDS[index], label])));
    await page.locator('#forecastMarketLink').click();
    await page.reload();
    await expect(page.locator('#lessonQuestion')).toHaveText(match);
    await expect(page.locator('#eventCriteria')).toHaveText(rule);
    await expect(page.locator('#bookSide option')).toHaveText(matchAnswers);
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
    await chooseOutcome(page);
    await page.locator('#budget').fill('7,85'); await placeOrder(page);
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
    await page.goto('/forecast.html');
    await page.locator('#budget').fill('0,51'); await placeOrder(page);
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

test('owner sets available points on mobile while an existing order remains funded', async ({ page }) => {
    await page.setViewportSize({ width:390, height:844 });
    await mockClass(page, 'owner', false, {
        classmate: { displayName:'Саша', email:'classmate@example.test' },
        newcomer: { displayName:'Аня', email:'newcomer@example.test' }
    });
    await page.goto('/forecast.html');
    await page.evaluate(() => window.changeForecastAccount({ uid:'classmate', isAnonymous:false }));
    await expect(page.locator('#walletCash')).toHaveText('100 оч.');
    await chooseOutcome(page);
    await page.locator('#buyUnit').selectOption('shares');
    await page.locator('#orderMode label:has([value=limit])').click();
    await page.locator('#limitPrice').fill('0,25');
    await page.locator('#quantity').fill('10');
    await placeOrder(page);
    await expect(page.locator('#walletCash')).toHaveText('97,5 оч.');

    await page.goto('/admin.html#forecasts');
    await page.locator('#forecastBalances summary').click();
    const search = page.locator('#forecastBalanceSearch');
    const list = page.locator('#forecastBalanceList');
    await search.fill('newcomer@example.test');
    await expect(list.locator('li')).toHaveCount(1);
    await expect(list).toContainText('Аня');
    await expect(list).toContainText('100');
    await search.fill('classmate@example.test');
    await expect(list.locator('li')).toHaveCount(1);
    await expect(list).toContainText('Саша');
    await expect(list).toContainText('97,5');
    await expect(list).toContainText('2,5');
    await list.getByRole('button', { name:'Изменить баланс Саша' }).click();
    await page.locator('#forecastBalanceAmount').fill('0');
    await page.locator('#forecastBalanceSave').click();
    const dialog = page.getByRole('dialog', { name:'Изменить баланс?' });
    await expect(dialog).toContainText('Саша');
    await dialog.getByRole('button', { name:'Подтвердить', exact:true }).click();
    await expect(page.locator('#forecastBalanceFeedback')).toContainText('Доступно 0 оч.');
    const command = await page.evaluate(() => {
        const { head, events } = JSON.parse(sessionStorage.getItem('forecast-test-data'));
        return { version:head.v, command:events[head.id] };
    });
    expect(command.version).toBe(4);
    expect(command.command).toMatchObject({ actor:M.OWNER, kind:'balance', uid:'classmate', amount:0, expected:9750 });
    expect(command.command).not.toHaveProperty('day');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

    await page.locator('#forecastMarketLink').click();
    await page.evaluate(() => window.changeForecastAccount({ uid:'classmate', isAnonymous:false }));
    await expect(page.locator('#walletCash')).toHaveText('0 оч.');
    await expect(page.locator('#forecastAdminLink')).toBeHidden();
    await expect(page.locator('#forecastBalances')).toHaveCount(0);
    await expect(page.getByText('Балансы участников', { exact:true })).toHaveCount(0);
    await expect(page.locator('#myOrders')).toContainText('10 долей');
    await page.locator('#myOrders').getByRole('button', { name:'Снять заявку' }).click();
    await expect(page.locator('#walletCash')).toHaveText('2,5 оч.');
});

test('a peer trade moves the live chart while a historical reading stays pinned; reconnect resumes the live clock', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-26T11:00:00Z') });
    await mockClass(page); await page.goto('/forecast.html');
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
    await expect(page.locator('#tradeForm [name=side]')).toHaveValue('yes');
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
    await page.goto('/forecast.html');
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

    test('phone chart keeps the selected probability and time window stable during a peer trade', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 568 });
        await page.clock.install({ time: new Date('2026-11-26T11:00:00Z') });
        await mockClass(page);
        await page.goto('/forecast.html');
        const plot = page.locator('#probChart'), probability = page.locator('#probability');
        await expect(probability).toHaveText('50%');
        await plot.tap({ position: { x: 40, y: 70 } });
        const tip = page.locator('#chartTip'), hair = page.locator('#chartHair'), line = page.locator('#chartLine');
        await expect(tip).toBeVisible();
        const at = await tip.locator('span').innerText(), path = await line.getAttribute('d'), cursor = await hair.getAttribute('d');
        await page.clock.runFor(5000);
        await page.evaluate(async () => {
            const root = window.AlmanionAccount.database.ref('physicsForecast');
            const id = root.child('events').push().key, at = Date.now(), day = window.PhysicsForecast.dayKey(at);
            await root.update({ head: { id, n: 2 }, ['events/' + id]: { kind: 'order', actor: 'second-player',
                day, n: 2, at, side: 'yes', action: 'buy', mode: 'market', qty: 15, limit: 55, totalLimit: 785 } });
        });
        await expect(probability).toHaveText('50%');
        await expect(tip.locator('span')).toHaveText(at);
        await expect(line).toHaveAttribute('d', path);
        await expect(hair).toHaveAttribute('d', cursor);
        await page.locator('#chartReturn').tap();
        await expect(tip).toBeHidden();
        await expect(probability).toHaveText('52%');
    });

    test('opens from the mobile shortcuts and allows inspecting a point and returning to now', async ({ page }) => {
        await mockClass(page);
        await page.goto('/forecast.html');
        await page.locator('#forecastJumps a[href="#marketChart"]').tap();
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
        await expect(page.locator('#chartState')).toHaveText('До первой сделки');
        await page.getByRole('link',{name:'Рынок',exact:true}).tap();
        await chooseOutcome(page);
        await expect(page.locator('#budget')).toBeInViewport();
    });
});


for (const width of [320, 390]) test('reviews long-outcome purchases and sales at ' + width + 'px', {
    tag: '@mobile-market'
}, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await mockClass(page);
    const event = '00000000000000000902';
    const question = 'Какая команда выиграет финал школьного турнира после всех дополнительных раундов?';
    const labels = ['Сборная северного учебного корпуса', 'Сборная южного учебного корпуса',
        'Объединённая команда выпускников', 'Гости из соседнего учебного корпуса'];
    await page.goto('/forecast.html?event=' + event);
    await expect(page.locator('#roundBody')).toBeVisible();
    await page.evaluate(async ({ event, question, labels }) => {
        const m = window.PhysicsForecast, at = Date.now(), end = m.endOfDay(m.dayKey(at));
        const answers = Object.fromEntries(m.SIDE_IDS.map((side, i) => [side, labels[i]]));
        await window.AlmanionAccount.database.ref('physicsForecast').update({
            ['events/' + event]: { n: 2, at, day: event, endAt: end, eventEnd: end, actor: m.OWNER,
                kind: 'open', question, answers, liquidity: 1 }, head: { id: event, n: 2, v: 5 }
        });
    }, { event, question, labels });
    await page.reload();
    await expect(page.locator('#lessonQuestion')).toHaveText(question);
    await expect(page.locator('#outcomeList button')).toHaveCount(4);
    await expect(page.locator('#chartLegend strong')).toHaveText(['25%', '25%', '25%', '25%']);
    await chooseOutcome(page, 'fourth');
    await expect(page.locator('#ticketOutcome')).toHaveText(labels[3]);
    await expect(page.locator('#changeOutcome')).toBeVisible();
    await page.locator('#budget').fill('1,04');
    const confirm = page.locator('#reviewConfirm'), dialog = page.locator('#tradeReview');
    const reviewFits = async () => {
        await expect(dialog).toBeVisible();
        await expect(page.locator('#reviewOrder')).toContainText(labels[3]);
        await expect(confirm).toBeInViewport({ ratio: 1 });
        expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth &&
            el.querySelector('.forecast-review-body').scrollWidth <= el.clientWidth &&
            document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    };
    await page.locator('#budget').press('Enter');
    await reviewFits();
    await expect(page.locator('#walletFourth')).toHaveCount(0);
    await page.evaluate(() => window.setForecastConnection(false));
    await expect(confirm).toBeHidden();
    await page.locator('#reviewBack').click();
    await expect(page.locator('#ticketConnection')).toBeVisible();
    await page.evaluate(() => window.setForecastConnection(true));
    await page.locator('#placeOrder').click();
    await reviewFits();
    await expect(page.locator('#reviewQuote')).toContainText('1,04 оч.');
    await expect(page.locator('#reviewQuote')).toContainText('Средняя цена за долю');
    await expect(page.locator('#reviewQuote')).toContainText('+2,96 оч.');
    await confirm.click();
    await expect(page.locator('#reviewStatus')).toContainText('Покупка · 4 доли');
    await expect(confirm).toBeHidden();
    await page.locator('#reviewBack').click();
    await page.reload();
    await expect(page.locator('#walletFourth')).toHaveText('4');
    await page.locator('#walletToggle').click();
    await page.locator('[data-sell="fourth"]').click();
    await page.locator('#quantity').fill('2');
    await page.locator('#placeOrder').click();
    await reviewFits();
    await expect(page.locator('#reviewOrder')).toContainText('Продажа · 2 доли');
    await expect(page.locator('#reviewQuote')).toContainText('0,48 оч.');
    await expect(page.locator('#walletFourth')).toHaveText('4');
    await confirm.click();
    await expect(page.locator('#reviewStatus')).toContainText('Продажа · 2 доли');
    await page.locator('#reviewBack').click();
    await page.reload();
    await expect(page.locator('#walletFourth')).toHaveText('2');
    await expect(page.locator('#walletCash')).toHaveText('99,44 оч.');
    await expect(page.locator('#tradeHistory .forecast-row')).toHaveCount(2);

    await page.locator('#bookSide').selectOption('fourth');
    await page.locator('#bookAsks button[data-book-price="26"]').click();
    await expect(page.locator('#ticketOutcome')).toHaveText(labels[3]);
    await expect(page.locator('#limitPrice')).toHaveValue('0,26');
    await expect(page.locator('#quantity')).toHaveValue('');
    await page.locator('#quantity').fill('4');
    await page.locator('#placeOrder').click();
    await reviewFits();
    await expect(page.locator('#reviewQuote')).toContainText('К оплате сейчас · 1 доля');
    await expect(page.locator('#reviewQuote')).toContainText('В резерв на 3 доли');
    await expect(page.locator('#reviewQuote')).toContainText('0,78 оч.');
    await confirm.click();
    await expect(page.locator('#reviewTitle')).toHaveText('Заявка выставлена');
    await page.locator('#reviewOrders').click();
    const openOrder = page.locator('#myOrders [data-order]');
    await expect(openOrder).toBeFocused();
    await expect(openOrder).toContainText('Исполнено · 1 доля за 0,26 оч.');
    await expect(page.locator('#walletHeld')).toHaveText('0,78 оч.');
    await page.reload();
    await expect(page.locator('#walletFourth')).toHaveText('3');
    await expect(page.locator('#walletCash')).toHaveText('98,4 оч.');
    await page.locator('#walletToggle').click();
    await page.locator('#walletEventOrders button').click();
    await expect(openOrder).toBeFocused();
    await openOrder.getByRole('button', { name:'Снять заявку' }).click();
    await expect(page.locator('#walletHeld')).toHaveText('0 оч.');
    await expect(page.locator('#walletCash')).toHaveText('99,18 оч.');
    await page.locator('#allOrders').click();
    await expect(page.locator('#orderHistory [data-order]').first()).toContainText('Резерв снят · 0,78 оч.');
    await expect(page.locator('#orderHistory [data-order]').first()).toContainText('Снята');
});

test('an updated order book invalidates an open confirmation before the player can buy', async ({ page }) => {
    await page.setViewportSize({ width:390, height:844 });
    await mockClass(page);
    await page.goto('/forecast.html');
    await chooseOutcome(page);
    await page.locator('#buyUnit').selectOption('shares');
    await page.locator('#quantity').fill('1');
    await page.locator('#placeOrder').click();
    await expect(page.locator('#reviewQuote')).toContainText('0,51 оч.');
    await page.evaluate(async () => {
        const at = Date.now(), day = PhysicsForecast.dayKey(at), id = '00000000000000000902';
        const root = window.AlmanionAccount.database.ref('physicsForecast');
        await root.update({ head:{ id, n:2 }, ['events/' + id]: { kind:'order', day, n:2, at,
            actor:'peer', action:'buy', side:'yes', mode:'market', limit:51, qty:10 } });
    });
    await expect(page.locator('#reviewConfirm')).toBeHidden();
    await expect(page.locator('#reviewStatus')).toContainText('Условия изменились');
    await expect(page.locator('#walletCash')).toHaveText('100 оч.');
    await page.locator('#reviewBack').click();
    await page.locator('#placeOrder').click();
    await expect(page.locator('#reviewQuote')).toContainText('0,55 оч.');
    await page.locator('#reviewConfirm').click();
    await expect(page.locator('#reviewStatus')).toContainText('за 0,55 оч.');
    await expect(page.locator('#walletCash')).toHaveText('99,45 оч.');
});

test('the receipt follows a resting order filled while its submission is being confirmed', { tag:'@mobile-market' }, async ({ page }) => {
    await page.setViewportSize({ width:390, height:844 });
    await mockClass(page);
    await page.goto('/forecast.html');
    await chooseOutcome(page);
    await page.locator('#buyUnit').selectOption('shares');
    await page.locator('#orderMode label:has([value=limit])').click();
    await page.locator('#limitPrice').fill('0,50');
    await page.locator('#quantity').fill('3');
    await page.locator('#placeOrder').click();
    await expect(page.locator('#reviewQuote')).toContainText('В резерв на 3 доли');
    await page.evaluate(() => {
        window.beforeReturningForecastEvents = async () => {
            const at = Date.now(), day = PhysicsForecast.dayKey(at), id = '00000000000000000903';
            const root = window.AlmanionAccount.database.ref('physicsForecast');
            await root.update({ head:{ id, n:3 }, ['events/' + id]: { kind:'order', day, n:3, at,
                actor:'peer', action:'buy', side:'no', mode:'market', limit:50, qty:2 } });
        };
    });
    await page.locator('#reviewConfirm').click();
    await expect(page.locator('#reviewStatus')).toContainText('Покупка · 2 доли «Да» за 1 оч.');
    await expect(page.locator('#reviewStatus')).toContainText('В открытой заявке 1 доля');
    await expect(page.locator('#walletYes')).toHaveText('2');
    await expect(page.locator('#walletHeld')).toHaveText('0,5 оч.');
    await page.evaluate(async () => {
        const at = Date.now(), day = PhysicsForecast.dayKey(at), id = '00000000000000000904';
        await window.AlmanionAccount.database.ref('physicsForecast').update({
            head:{ id, n:4 }, ['events/' + id]:{ kind:'order', day, n:4, at,
                actor:'peer', action:'buy', side:'no', mode:'market', limit:50, qty:1 }
        });
    });
    await expect(page.locator('#reviewTitle')).toHaveText('Сделка принята');
    await expect(page.locator('#reviewStatus')).toHaveText('Покупка · 3 доли «Да» за 1,5 оч.');
    await page.locator('#reviewOrders').click();
    await expect(page.locator('#orderHistory [data-order]')).toBeFocused();
    await expect(page.locator('#orderHistory')).toContainText('Исполнено · 3 доли за 1,5 оч.');
    await expect(page.locator('#walletHeld')).toHaveText('0 оч.');
});

test('the phone keeps the amount visible with a reduced visual viewport and returns to the same price', {
    tag:'@mobile-market'
}, async ({ page }) => {
    await page.setViewportSize({ width:320, height:568 });
    await mockClass(page);
    await page.goto('/forecast.html');
    const level = page.locator('#bookAsks [data-book-price="51"]'), sheet = page.locator('#tradeSheet');
    await level.evaluate(button => button.scrollIntoView({ block:'center', behavior:'instant' }));
    const scroll = await page.evaluate(() => window.scrollY);
    await level.click();
    await expect(page.locator('#limitPrice')).toHaveValue('0,51');
    const quantity = page.locator('#quantity');
    await quantity.fill('7');
    await page.evaluate(() => {
        Object.defineProperty(visualViewport, 'height', { configurable:true, value:300 });
        visualViewport.dispatchEvent(new Event('resize'));
    });
    await expect(sheet).toHaveAttribute('data-keyboard', '');
    await expect.poll(() => quantity.evaluate(input => {
        const rect = input.getBoundingClientRect(), bar = document.querySelector('#tradeSheet .forecast-section-head');
        return rect.top >= bar.getBoundingClientRect().bottom && rect.bottom <= window.visualViewport.height;
    })).toBe(true);
    await page.evaluate(async () => {
        delete visualViewport.height;
        visualViewport.dispatchEvent(new Event('resize'));
        const at = Date.now(), day = PhysicsForecast.dayKey(at), id = '00000000000000000902';
        await window.AlmanionAccount.database.ref('physicsForecast').update({
            head:{ id, n:2 }, ['events/' + id]:{ kind:'order', day, n:2, at,
                actor:'peer', action:'buy', side:'yes', mode:'market', limit:51, qty:1 }
        });
    });
    await expect(sheet).not.toHaveAttribute('data-keyboard', '');
    await expect(quantity).toHaveValue('7');
    await page.locator('#closeTradeSheet').click();
    await expect(level).toBeFocused();
    await expect.poll(() => page.evaluate(top => Math.abs(window.scrollY - top), scroll)).toBeLessThanOrEqual(1);
    await expect(page.locator('#walletCash')).toHaveText('100 оч.');
});
