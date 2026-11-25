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
                updates['rounds/' + day] = {last:id,phase:kind,endAt};
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
        console.log('Physics market rules: registered trading, guest restrictions, owner-only lesson management and settlement passed.');
    } finally { await env.cleanup(); }
})().catch(e => { console.error(e); process.exitCode=1; });
