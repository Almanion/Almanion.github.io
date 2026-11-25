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
            await context.database().ref('accountDirectory/balance-player').set({
                email:'balance-player@example.test', displayName:'Balance player', lastSeen:Date.now()
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
        const book = at(owner);
        async function acceptMarketChange(ref, change) {
            const { kind, day } = change['events/' + change.head.id];
            await assertSucceeds(ref.update(change)).catch(cause => {
                throw new Error('Expected acceptance: ' + kind + ' for ' + day + ', entry ' + change.head.n, { cause });
            });
        }
        const close = Math.ceil((Date.now() + 5000) / 60000) * 60000;
        const eventEnd = M.endOfDay(M.dayKey(close + 120000));
        const names = { yes:'Север', no:'Юг', third:'Восток', fourth:'Запад' };
        async function advanced(actor, kind, fields = {}) {
            const head = (await book.child('head').get()).val(), next = book.child('events').push().key;
            const day = fields.day || next, n = head.n + 1;
            const event = { n, at:{'.sv':'timestamp'}, day, actor, kind, ...fields };
            const changes = { head:{ id:next, n, v:3 }, ['events/'+next]:event, ['lastBy/'+actor]:next };
            if (kind === 'order') Object.assign(event, { mode:'market', side:'fourth', action:'buy', qty:1, limit:99, totalLimit:99, expires:Date.now()+30000 }, fields);
            else {
                const previous = (await book.child('rounds/'+day).get()).val();
                changes['rounds/'+day] = { phase:kind === 'deadline' ? 'open' : kind, last:next,
                    endAt:event.endAt ?? previous.endAt, eventEnd:event.eventEnd ?? previous.eventEnd ?? previous.endAt };
            }
            return changes;
        }
        const open = { question:'Какой вариант победит?', eventEnd, endAt:close+120000, answers:names };
        for (const answers of [{yes:'А'}, {yes:'a', no:'A'}, {...names, third:'Запад'}, {...names, no:'  '},
            {...names, no:'два\nслова'}, {...names, extra:'Пятый'}, {yes:'А',no:'Б',fourth:'Г'}]) {
            await assertFails(book.update(await advanced(M.OWNER, 'open', {...open, answers})));
        }
        await assertFails(book.update(await advanced(M.OWNER, 'open', {...open, endAt:close+1})));
        await assertFails(book.update(await advanced(M.OWNER, 'open', {...open, endAt:eventEnd+60000})));
        const four = await advanced(M.OWNER, 'open', open), fourId = four.head.id;
        await acceptMarketChange(book, four);
        const order4 = await advanced('b', 'order', {day:fourId});
        await assertFails(at(b).update({...order4, head:{...order4.head, v:2}}));
        await acceptMarketChange(at(b), order4);
        await assertFails(at(siteAdmin).update(await advanced('site-admin','deadline',{day:fourId,endAt:close})));
        const modify = await advanced(M.OWNER, 'deadline', {day:fourId,endAt:close});
        const altered = structuredClone(modify); altered['rounds/'+fourId].endAt += 60000;
        await assertFails(book.update(altered));
        await acceptMarketChange(book, modify);
        const three = await advanced(M.OWNER,'open',{...open, answers:{yes:'Первый',no:'Второй',third:'Третий'}});
        await acceptMarketChange(book, three);
        const voter = at(db('three-player'));
        await assertFails(voter.update(await advanced('three-player','order',{day:three.head.id,side:'fourth'})));
        await acceptMarketChange(voter, await advanced('three-player','order',{day:three.head.id,side:'third'}));
        await acceptMarketChange(book, await advanced(M.OWNER,'lock',{day:three.head.id}));
        await assertFails(book.update(await advanced(M.OWNER,'fourth',{day:three.head.id})));
        // Leave every client idle until the actual emulator clock passes the cutoff.
        await new Promise(resolve => setTimeout(resolve, Math.max(0, close + 100 - Date.now())));
        await assertFails(at(b).update(await advanced('b','order',{day:fourId})));
        await assertFails(book.update(await advanced(M.OWNER,'deadline',{day:fourId,endAt:eventEnd})));
        if (M.dayKey(Date.now()) === M.dayKey(eventEnd-1)) {
            await assertSucceeds(book.update(await advanced(M.OWNER,'fourth',{day:fourId})));
            await assertFails(book.update(await advanced(M.OWNER,'yes',{day:fourId})));
        }
        async function balanceChange(actor, fields = {}) {
            const next = book.child('events').push().key;
            const { n: previous } = (await book.child('head').get()).val();
            const n = previous + 1;
            const event = { n, at:{'.sv':'timestamp'}, actor, kind:'balance', uid:'balance-player',
                amount:0, expected:M.INITIAL, expires:Date.now()+30000, ...fields };
            return { head:{ id:next, n, v:4 }, ['events/'+next]:event, ['lastBy/'+actor]:next };
        }
        for (const [source, uid] of [[a,'a'], [siteAdmin,'site-admin'], [db(M.OWNER,'anonymous'), M.OWNER]]) {
            await assertFails(at(source).update(await balanceChange(uid)));
        }
        for (const fields of [
            { uid:'@liquidity' }, { uid:'not-registered' }, { uid:null },
            { amount:-1 }, { amount:100000001 }, { amount:2.5 }, { amount:null },
            { expected:-1 }, { expected:1.5 }, { expected:null },
            { expires:null }, { expires:Date.now()-1000 }, { expires:Date.now()+120000 }, { day:fourId }
        ]) {
            await assertFails(book.update(await balanceChange(M.OWNER, fields)));
        }
        const rounds = (await book.child('rounds').get()).val();
        const adjustment = await balanceChange(M.OWNER);
        await assertFails(book.update({ ...adjustment, head:{ ...adjustment.head, v:3 } }));
        await assertSucceeds(book.update(adjustment));
        assert.equal((await book.child('events/'+adjustment.head.id+'/amount').get()).val(), 0);
        assert.deepEqual((await book.child('rounds').get()).val(), rounds);
        await assertFails(book.child('events/'+adjustment.head.id+'/amount').set(2000));
        await assertFails(book.child('events/'+adjustment.head.id).remove());
        // Trading participants can predate the account directory.
        await assertSucceeds(book.update(await balanceChange(M.OWNER,{uid:'a', amount:100000000})));
        await assertSucceeds(book.update(await balanceChange(M.OWNER,{uid:M.OWNER, amount:50})));
        const after = await advanced(M.OWNER,'open',open);
        await assertFails(book.update(after));
        after.head.v = 4;
        await assertSucceeds(book.update(after));
        const newOrder = await advanced('balance-player','order',{day:after.head.id});
        await assertFails(at(db('balance-player')).update(newOrder));
        newOrder.head.v = 4;
        await assertSucceeds(at(db('balance-player')).update(newOrder));
        console.log('Forecast rules passed deadlines and immutable, owner-only balance adjustments.');
    } finally { await env.cleanup(); }
})().catch(e => { console.error(e); process.exitCode=1; });
