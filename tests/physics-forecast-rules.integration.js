'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const M = require('../physics-forecast-core');

(async function () {
    const env = await initializeTestEnvironment({ projectId:'almanion-rules-test', database:{ rules:fs.readFileSync('firebase/database.rules.json','utf8') } });
    try {
        const db = (uid, provider = 'password') => env.authenticatedContext(uid, { firebase:{ sign_in_provider:provider } }).database();
        const owner = db(M.OWNER), a = db('a'), b = db('b', 'google.com');
        const siteAdmin = db('site-admin'), player = db('new-player');
        const guests = [env.unauthenticatedContext().database(), db('guest', 'anonymous')];
        const day = M.dayKey(Date.now()), endAt = M.endOfDay(day);
        await env.withSecurityRulesDisabled(async context => {
            await context.database().ref('physicsForecast').remove();
            await context.database().ref('adminRoles').update({
                a:null, b:{forecastAccess:false}, 'site-admin':{siteAdmin:true, forecastAccess:true}
            });
        });
        let idCounter = 0;
        function patch(actor, n, kind, overrides = {}) {
            const id = String(++idCounter).padStart(20,'0');
            const e = { actor, n, day, kind, at:{'.sv':'timestamp'}, ...overrides };
            const updates = {head:{n,id}, ['lastBy/' + actor]:id, ['events/' + id]:e};
            if (kind === 'order') Object.assign(e,{ action:'buy',side:'yes',mode:'market',qty:3,limit:51,totalLimit:153,expires:Date.now()+30000 },overrides);
            else if (kind !== 'cancel') {
                updates['rounds/' + e.day] = {last:id,phase:kind,endAt};
                if (kind === 'open') e.endAt=endAt;
            }
            return updates;
        }
        const at = source => source.ref('physicsForecast');
        for (const db of guests) await assertFails(at(db).once('value'));
        await assertFails(at(a).update(patch('a',1,'open')));
        await assertFails(at(siteAdmin).update(patch('site-admin',1,'open')));
        await assertSucceeds(at(owner).update(patch(M.OWNER,1,'open')));
        for (const db of [a, b, siteAdmin]) await assertSucceeds(at(db).child('events').orderByChild('n').once('value'));
        for (const db of guests) await assertFails(at(db).update(patch('guest',2,'order')));
        await assertFails(at(a).child('wallet/a').set(1000000));
        await assertFails(at(a).update(patch('b',2,'order')));
        await assertFails(at(a).update(patch('a',2,'order',{qty:-1})));
        await assertFails(at(a).update(patch('a',2,'order',{expires:Date.now()-1000})));
        await assertFails(at(a).update(patch('a',2,'order',{totalLimit:0})));
        const missing = patch('a',2,'order');
        delete missing.head; await assertFails(at(a).update(missing));
        const spoof = patch('a',2,'order'); spoof.wallet = {a:99999}; await assertFails(at(a).update(spoof));
        const x = patch('a',2,'order'), y = patch('b',2,'order');
        const concurrent = await Promise.allSettled([at(a).update(x),at(b).update(y)]);
        assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
        const loser = concurrent[0].status === 'rejected' ? 'a' : 'b';
        await assertSucceeds(at(loser === 'a'?a:b).update(patch(loser,3,'order')));
        await assertFails(at(a).child('events/' + x.head.id + '/limit').set(1));
        const order = patch('new-player',4,'order',{mode:'limit',limit:25});
        delete order['events/' + order.head.id].totalLimit;
        await assertSucceeds(at(player).update(order));
        await new Promise(resolve => setTimeout(resolve, 550)); // The ledger limits each player to two writes per second.
        const cancel = {target:order.head.id, expires:Date.now()+30000};
        await assertFails(at(a).update(patch('a',5,'cancel',cancel)));
        await assertSucceeds(at(player).update(patch('new-player',5,'cancel',cancel)));
        await assertFails(at(a).update(patch('a',6,'lock')));
        await assertFails(at(siteAdmin).update(patch('site-admin',6,'void')));
        await assertFails(at(owner).update(patch(M.OWNER,6,'yes')));
        await assertSucceeds(at(owner).update(patch(M.OWNER,6,'lock')));
        await assertFails(at(owner).update(patch(M.OWNER,7,'order')));
        for (const kind of ['yes','no','void']) await assertFails(at(siteAdmin).update(patch('site-admin',7,kind)));
        await assertSucceeds(at(owner).update(patch(M.OWNER,7,'yes')));
        await assertFails(at(owner).update(patch(M.OWNER,8,'void')));
        await assertFails(at(owner).child('events').remove());
        function newMarket(actor, n, question, criteria) {
            const next = patch(actor, n, 'open'), id = next.head.id;
            next.head.v = 2;
            const event = next['events/' + id];
            event.day = id;
            if (question !== undefined) event.question = question;
            if (criteria !== undefined) event.criteria = criteria;
            next['rounds/' + id] = next['rounds/' + day];
            delete next['rounds/' + day];
            return next;
        }
        const question = 'Выиграет ли класс матч?';
        for (const title of [undefined, '', '  ', 'тема\nвторая', 'а'.repeat(M.QUESTION_LIMIT + 1)]) {
            await assertFails(at(owner).update(newMarket(M.OWNER, 8, title))).catch(error => {
                throw new Error('Invalid event question accepted: ' + JSON.stringify(title), { cause: error });
            });
        }
        await assertFails(at(owner).update(newMarket(M.OWNER, 8, question, 'а'.repeat(M.CRITERIA_LIMIT + 1))));
        await assertFails(at(siteAdmin).update(newMarket('site-admin', 8, question)));
        const first = newMarket(M.OWNER, 8, question, 'Победа в основное время.');
        await assertSucceeds(at(owner).update(first));
        const second = newMarket(M.OWNER, 9, 'Пройдёт ли open tournament?', 'По расписанию на сайте турнира.');
        await assertSucceeds(at(owner).update(second));
        await assertFails(at(owner).child('events/' + first.head.id + '/question').set('Другой вопрос?'));
        const deal = patch('a', 10, 'order', { day: first.head.id });
        await assertFails(at(a).update(deal)); // Outdated writers cannot ignore the other markets' balances.
        deal.head.v = 2;
        await assertSucceeds(at(a).update(deal));
        const other = patch('b', 11, 'order', { day: second.head.id, question: 'Дописать?' });
        other.head.v = 2;
        await assertFails(at(b).update(other));
        for (const [n, kind] of [[11, 'lock'], [12, 'yes']]) {
            const action = patch(M.OWNER, n, kind, { day: first.head.id });
            action.head.v = 2;
            await assertFails(at(siteAdmin).update(action));
            await assertSucceeds(at(owner).update(action));
        }
        assert.equal((await at(b).child('rounds/' + second.head.id + '/phase').once('value')).val(), 'open');
        console.log('Forecast rules: registered trading, owner-only custom events, isolated same-day markets and settlement passed.');
    } finally { await env.cleanup(); }
})().catch(e => { console.error(e); process.exitCode=1; });
