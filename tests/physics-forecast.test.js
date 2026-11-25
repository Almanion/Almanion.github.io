'use strict';
const assert = require('node:assert/strict');
const M = require('../physics-forecast-core');
const day = '2026-11-26', later = '2026-11-27';
function fixture() {
    const state = M.create(), log = [];
    let at = M.endOfDay(day) - 2 * M.DAY + 500;
    function add(command, actor = M.OWNER, key = day) {
        const event = { ...command, actor, day: key, n: state.n + 1, at: ++at };
        const id = 'r' + event.n;
        log.push([id, event]);
        return { ...M.apply(state, event, id), id };
    }
    function order(actor, side, action, qty, limit, mode = 'limit', more = {}) {
        return add({ kind: 'order', side, action, qty, limit, mode, ...more }, actor);
    }
    add({ kind: 'open', endAt: M.endOfDay(day) });
    return { state, log, add, order, m: state.markets.get(day), time(value) { at = value; } };
}
{
    const state = M.create(), entries = [];
    const at = M.endOfDay(day) - M.DAY + 100;
    const match = '00000000000000000001', club = '00000000000000000002';
    function append(id, key, kind, fields = {}, actor = M.OWNER) {
        const event = { n: state.n + 1, at: at + state.n, day: key, actor, kind, ...fields };
        entries.push([id, event]);
        return M.apply(state, event, id);
    }
    const expiry = { endAt: M.endOfDay(day) };
    assert.deepEqual(append('legacy', day, 'open', expiry), {});
    assert.equal(state.markets.get(day).question, M.physics.question);
    assert.deepEqual(append(match, match, 'open', { ...expiry, question: 'Выиграет ли 10-1?', criteria: 'По итоговому счёту.' }), {});
    assert.deepEqual(append(club, club, 'open', { ...expiry, question: 'Состоится ли кружок?' }), {});
    const a = state.markets.get(match), b = state.markets.get(club);
    assert.deepEqual([a.date, b.date, a.criteria, b.criteria], [day, day, 'По итоговому счёту.', '']);
    assert.equal(append('bad', 'other', 'open', { ...expiry, question: 'Подмена?' }).error, 'invalid');
    for (const question of ['', '   ', '  вопрос', 'а'.repeat(M.QUESTION_LIMIT + 1)]) {
        const id = '00000000000000000009';
        assert.equal(append(id, id, 'open', { ...expiry, question }).error, 'invalid');
    }
    const buy = { side: 'yes', action: 'buy', mode: 'market', qty: 15, limit: 55, totalLimit: 785 };
    assert.equal(append('trade', match, 'order', buy, 'player').cash, 785);
    assert.deepEqual([M.midpoint(a), M.midpoint(b), M.position(b, 'player').yes, b.trades.length], [52, 50, 0, 0]);
    assert.equal(M.available(state, 'player', club, at), M.INITIAL - 785);
    assert.deepEqual(append('end', match, 'lock'), {});
    assert.deepEqual(append('win', match, 'yes'), {});
    assert.deepEqual(append('cancel-club', club, 'void'), {});
    assert.equal(M.available(state, 'player', day, at), M.INITIAL - 785 + 1500);
    assert.equal(M.standings(state)[0].score, 10715);
    const replay = M.create();
    for (const [id, event] of entries) M.apply(replay, event, id);
    assert.deepEqual(replay, state);
}
{
    const f = fixture(), { state, m } = f;
    assert.equal(M.dayKey(M.endOfDay(day) - 1), day);
    assert.equal(M.dayKey(M.endOfDay(day)), later);
    assert.ok(Number.isNaN(M.endOfDay('2026-02-30')));
    assert.equal(M.midpoint(m), 50);
    assert.equal(f.order('a','yes','sell',1,1).error, 'shares');
    const buy = f.order('a','yes','buy',15,55,'market');
    assert.deepEqual([buy.cash,buy.filled], [10 * 51 + 5 * 55, 15]);
    assert.equal(M.available(state,'a',day), 10000 - 785);
    assert.equal(M.position(m,'a').yes,15);
    assert.equal(M.midpoint(m),52);
    const n = m.trades.length;
    assert.equal(f.order('a','yes','buy',100,99,'market').error,'depth');
    assert.equal(f.order('a','yes','buy',2,55,'market',{totalLimit:109}).error,'requote');
    assert.equal(m.trades.length,n);
    const resting = f.order('a','yes','sell',4,54);
    assert.equal(resting.left,4);
    assert.equal(f.order('a','yes','sell',12,54).error,'shares');
    assert.equal(f.order('a','yes','buy',1,54,'market').error,'own');
    assert.equal(f.order('b','yes','buy',2,54,'market').cash,108);
    assert.equal(M.position(m,'a').yes,13);
    assert.equal(M.held(m,'a').yes,2);
    assert.equal(f.add({ kind:'cancel', target:resting.id },'b').error,'missing');
    assert.ok(!f.add({ kind:'cancel', target:resting.id },'a').error);
    assert.equal(M.held(m,'a').yes,0);
    assert.ok(f.add({kind:'yes'}).error);
    f.add({kind:'lock'}); assert.equal(f.order('a','yes','buy',1,99).error,'closed');
    assert.ok(f.add({kind:'yes'}).error); // A tomorrow market cannot resolve today.
    f.time(M.endOfDay(day)-M.DAY);
    assert.ok(!f.add({kind:'yes'}).error);
    assert.equal(M.available(state,'a',day), 10000 -785 +108 +1300);
    assert.ok(f.add({kind:'no'}).error);
    const replay = M.create();
    for (const [id,e] of f.log) M.apply(replay,e,id);
    assert.deepEqual(replay,state);
}
{
    const f = fixture();
    const a = f.order('a','yes','buy',4,50), b = f.order('b','yes','buy',4,50);
    assert.equal(M.available(f.state,'a',day),9800);
    f.order('c','no','buy',6,50,'market');
    assert.equal(M.position(f.m,'a').yes,4);
    assert.equal(M.position(f.m,'b').yes,2);
    assert.ok(!f.m.orders.some(o => o.id === a.id));
    assert.equal(f.m.orders.find(o => o.id === b.id).qty,2);
    f.order('c','no','sell',3,47); // Normalised YES bid; another owner's sell can merge the complete set.
    f.order('a','yes','sell',3,46,'market');
    const positions = [...f.m.positions.values()];
    assert.equal(positions.reduce((sum,p) => sum + p.yes - p.no,0),0);
    assert.equal(positions.reduce((sum,p) => sum + p.cash + 100*p.yes,0),0);
    f.add({kind:'void'});
    for (const uid of ['a','b','c']) assert.equal(M.available(f.state,uid,day),10000);
}
{
    const f = fixture();
    const r = f.order('a','yes','buy',100,49);
    assert.equal(r.left,100);
    assert.equal(f.order('a','no','buy',100,49).left,100);
    assert.equal(f.order('a','yes','buy',10,49).error,'cash');
    assert.equal(M.available(f.state,'a',day,M.endOfDay(day)),10000);
    f.add({kind:'open', endAt:M.endOfDay(later)},M.OWNER,later);
    assert.equal(M.available(f.state,'a',later),200);
}
{
    const f = fixture();
    f.order('a','yes','buy',5,51,'market');
    assert.equal(f.order('b','yes','buy',30,55,'market').filled,30);
    assert.equal(f.order('b','yes','buy',5,60).left,5);
    assert.equal(f.order('a','yes','sell',5,60,'market').cash,300);
    assert.equal(M.available(f.state,'a',day),10045);
    assert.equal(M.available(f.state,'a',later),10000);
    f.add({kind:'void'});
    assert.equal(M.available(f.state,'a',day),10000);
    const replay = M.create();
    for (const [id,e] of f.log) M.apply(replay,e,id);
    assert.deepEqual(replay,f.state);
}
{
    const f = fixture(), at = M.endOfDay(day) - M.DAY;
    const buy = { day, actor: 'a', side: 'yes', action: 'buy', mode: 'market', limit: 99 };
    const max = (order, budget) => M.maxOrderSize(f.state, order, at, budget);
    assert.equal(max(buy, 50), 0);
    assert.equal(max(buy, 51), 1);
    assert.equal(max(buy, 784), 14);
    assert.equal(max(buy, 785), 15);
    assert.equal(max(buy), 85); // Only 85 shares for sale across all three levels.
    const limitBuy = { ...buy, mode: 'limit', limit: 53 };
    assert.equal(max(limitBuy, 615), 11);
    assert.equal(max(limitBuy, 616), 11); // A disappearing discount cannot make the order exceed its budget.
    assert.equal(max(limitBuy, 636), 12); // Up to 636, currently 510 to pay and 106 reserved.
    assert.equal(max(limitBuy), 100);
    f.order('a', 'yes', 'buy', 15, 99, 'market');
    const sell = { ...buy, action: 'sell', limit: 1 };
    assert.equal(max(sell), 15);
    f.order('a', 'yes', 'sell', 4, 54);
    assert.equal(max(buy), 0); // Own order is now first in the matching lane.
    assert.equal(max(sell), 11);
    f.add({ kind: 'lock' });
    assert.equal(max(sell), 0);
}
{
    const f = fixture();
    let seed = 47543;
    const random = n => { seed = (Math.imul(1664525,seed) + 1013904223) >>> 0; return (seed >>> 8) % n; };
    for (let i=0; i<900; i++) {
        const actor = 'p' + random(10);
        f.order(actor,random(2)?'yes':'no',random(2)?'buy':'sell',1+random(20),1+random(99));
        const all = [...f.m.positions.values()];
        assert.equal(all.reduce((sum,p)=>sum+p.yes-p.no,0),0);
        assert.equal(all.reduce((sum,p)=>sum+p.cash+100*p.yes,0),0);
        assert.ok(all.every(p=>p.yes>=0 && p.no>=0));
        assert.ok(M.available(f.state,actor,day)>=0);
        for (const side of ['yes','no']) assert.ok(M.held(f.m,actor)[side]<=M.position(f.m,actor)[side]);
    }
    assert.ok(f.m.trades.length>100);
}
{
    const eventEnd = M.endOfDay(day), start = M.deadline(day, '08:00'), cutoff = M.deadline(day, '09:00');
    assert.equal(M.deadline(day, '00:00'), eventEnd - M.DAY);
    assert.equal(M.deadline(day, ''), eventEnd);
    assert.ok(Number.isNaN(M.deadline(day, '24:01')));
    for (const answers of [null, {}, { yes: 'Один' }, { yes: 'А', no: 'а' }, { yes: 'А', no: 'Б', fourth: 'Г' },
        { yes: 'А', no: ' ', third: 'В' }, { yes: 'А', no: 'Б', extra: 'В' }]) assert.equal(M.validAnswers(answers), false);

    for (const count of [2, 3, 4]) {
        const sides = M.SIDE_IDS.slice(0, count);
        const answers = Object.fromEntries(sides.map((id, i) => [id, ['Север', 'Юг', 'Восток', 'Запад'][i]]));
        for (const winner of [...sides, 'void']) {
            const key = '00000000000000000123', state = M.create(), log = [];
            let at = start;
            function add(kind, fields = {}, actor = M.OWNER) {
                const n = state.n + 1, id = n === 1 ? key : 'entry-' + n;
                const e = { kind, actor, at, day: key, n, ...fields };
                log.push([id, e]); return M.apply(state, e, id);
            }
            function order(side, actor, action, qty, limit, mode = 'market') {
                return add('order', { side, action, qty, limit, mode }, actor);
            }
            assert.deepEqual(add('open', { question: 'Кто победит?', eventEnd, endAt: cutoff, answers }), {});
            const m = state.markets.get(key);
            assert.equal(m.date, day);
            for (const side of sides) assert.ok(Math.abs(m.series[side][0].p - 100 / count) < 1e-10);
            const last = sides.at(-1), ask = M.quotePrice(M.ranked(m, 'ask', last)[0], last);
            assert.equal(order(last, 'reader', 'buy', 4, 99).cash, 4 * ask);
            assert.equal(order(last, 'reader', 'sell', 5, 1).error, 'shares');
            // Resting sale inside the spread. Other outcomes in a three-/four-way book cannot fill it.
            const middle = ask - 1;
            assert.equal(order(last, 'reader', 'sell', 2, middle, 'limit').left, 2);
            if (count > 2) {
                assert.equal(order(sides[0], 'peer', 'buy', 2, middle, 'limit').left, 2);
                assert.equal(M.held(m, 'reader', at)[last], 2);
            }
            assert.equal(order(last, 'peer', 'buy', 2, middle).cash, middle * 2);
            assert.equal(M.position(m, 'reader')[last], 2);
            const probSum = sides.reduce((v, side) => v + m.series[side].at(-1).p, 0);
            assert.ok(Math.abs(probSum - 100) < 1e-10);
            for (const side of sides) {
                const total = [...m.positions.values()].reduce((sum, p) => sum + p.cash + 100 * p[side], 0);
                assert.equal(total, 0, 'Collateral must cover exactly one winner');
            }
            const live = M.standings(state, 'live');
            assert.deepEqual(M.standings(state).map(r => [r.uid, r.rank, r.score]), [['peer', 1, 10000], ['reader', 1, 10000]]);
            const weight = count === 2 ? middle : 100 * middle / (middle + (count - 1) * 100 / count);
            assert.equal(live.find(r => r.uid === 'reader').score, Math.round(10000 - 4 * ask + 2 * middle + 2 * weight));
            assert.equal(order(last, 'reader', 'buy', 8, 1, 'limit').left, 8);
            assert.deepEqual(M.standings(state, 'live'), live);
            assert.equal(M.held(m, 'reader', at).cash, 8);
            assert.equal(add('deadline', { endAt: start }).error, 'invalid');
            assert.equal(add('deadline', { endAt: cutoff + 1 }).error, 'invalid');
            assert.equal(add('deadline', { endAt: cutoff + 60000 }, 'peer').error, 'invalid');
            assert.deepEqual(add('deadline', { endAt: cutoff + 60000 }), {});
            at = cutoff;
            assert.equal(M.status(m, at), 'open');
            at += 60000;
            assert.equal(M.status(m, at - 1), 'open');
            assert.equal(M.status(m, at), 'lock');
            assert.equal(order(last, 'reader', 'buy', 1, 99).error, 'closed');
            assert.equal(M.held(m, 'reader', at).cash, 0);
            assert.equal(add('deadline', { endAt: eventEnd }).error, 'invalid');
            if (count < 4) assert.equal(add(M.SIDE_IDS[count]).error, 'invalid');
            assert.deepEqual(add(winner), {});
            const profit = winner === 'void' ? 0 : -4 * ask + 2 * middle + (last === winner ? 200 : 0);
            assert.equal(M.available(state, 'reader', key, at), M.INITIAL + profit);
            assert.equal(M.standings(state).find(r => r.uid === 'reader').score, M.INITIAL + profit);
            assert.deepEqual(M.standings(state), M.standings(state, 'live'));
            assert.equal(add('void').error, 'invalid');
            const replay = M.create();
            for (const [id, e] of log) M.apply(replay, e, id);
            assert.deepEqual(replay, state);
        }
    }
}
{
    const f = fixture();
    assert.equal(f.order('waiting', 'yes', 'buy', 2, 1).left, 2);
    assert.deepEqual(M.standings(f.state), []);
    f.order('z', 'yes', 'buy', 1, 99, 'market');
    f.order('a', 'yes', 'buy', 1, 99, 'market');
    f.order('b', 'no', 'buy', 1, 99, 'market');
    f.time(M.endOfDay(day) - M.DAY + 1000);
    f.add({ kind: 'lock' }); f.add({ kind: 'yes' });
    assert.deepEqual(M.standings(f.state).map(r => [r.uid, r.rank]), [['a',1], ['z',1], ['b',3]]);
    f.add({ kind: 'open', endAt: M.endOfDay(later) }, M.OWNER, later);
    f.add({ kind: 'order', action: 'buy', side: 'yes', qty: 1, limit: 99, mode: 'market' }, 'z', later);
    f.add({ kind: 'void' }, M.OWNER, later);
    assert.deepEqual(M.standings(f.state).map(r => r.score), [10049,10049,9949]);
}
console.log('Forecast market passed matching, payouts, standings, deadlines and replay.');
