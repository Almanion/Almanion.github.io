'use strict';
const assert = require('node:assert/strict');
const M = require('../physics-forecast-core');
const day = '2026-11-26', later = '2026-11-27';
function fixture() {
    const state = M.create(), log = [];
    let at = M.endOfDay(day) - 2 * M.DAY + 500;
    function add(command, actor = M.OWNER, key = day) {
        const event = { ...command, actor, ...(command.kind === 'balance' ? {} : { day: key }), n: state.n + 1, at: ++at };
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
    const f = fixture(), { state, m } = f;
    const reserve = f.order('reader', 'yes', 'buy', 10, 25);
    assert.equal(reserve.left, 10);
    const adjustment = { kind: 'balance', uid: 'reader', amount: 0, expected: M.INITIAL - 250 };
    assert.equal(f.add(adjustment, 'reader').error, 'invalid');
    assert.equal(f.add({ ...adjustment, expected: M.INITIAL }).error, 'balanceChanged');
    const { before, after } = f.add(adjustment);
    assert.deepEqual([before, after], [9750, 0]);
    assert.equal(M.available(state, 'reader', day), 0);
    assert.equal(M.available(state, 'another', day), M.INITIAL);
    assert.equal(M.held(m, 'reader').cash, 250);
    assert.equal(f.order('reader', 'yes', 'buy', 1, 51, 'market').error, 'cash');
    assert.equal(f.add({ kind: 'cancel', target: reserve.id }, 'reader').error, undefined);
    assert.equal(M.available(state, 'reader', day), 250);

    assert.equal(f.add({ ...adjustment, expected: 250, amount: 15049 }).error, undefined);
    assert.equal(f.order('reader', 'yes', 'buy', 1, 51, 'market').cash, 51);
    const row = M.standings(state, 'live').find(player => player.uid === 'reader');
    assert.equal(row.settled, 15049);
    assert.equal(row.live, 15049);
    const replayed = M.create();
    f.log.forEach(([id, entry]) => M.apply(replayed, entry, id));
    assert.deepEqual(replayed, state);
}
{
    const start = M.endOfDay(day) - M.DAY + 100;
    for (const count of [2, 3, 4]) {
        const state = M.create(), log = [];
        const key = 'abcdefghijklmnopqrst';
        function add(command, actor = M.OWNER, id = 'event-' + (state.n + 1)) {
            const event = { ...command, day: key, actor, n: state.n + 1, at: start + state.n };
            log.push([id, event]);
            return M.apply(state, event, id);
        }
        const sides = M.SIDE_IDS.slice(0, count);
        const answers = Object.fromEntries(sides.map((side, i) => [side, 'Исход ' + (i + 1)]));
        assert.deepEqual(add({ kind:'open', question:'Какой исход?', answers, endAt:M.endOfDay(day), liquidity:1 }, M.OWNER, key), {});
        const market = state.markets.get(key), side = sides[0];
        const depth = () => M.ranked(market, 'ask', side).reduce((sum, order) => sum + order.qty, 0);
        const buy = qty => ({ kind:'order', action:'buy', side, mode:'market', qty, limit:99 });
        function verifyCollateral() {
            for (const [uid, pos] of market.positions) {
                const reserved = M.held(market, uid, start);
                if (uid === M.MAKER) assert(M.INITIAL + pos.cash - reserved.cash >= 0);
                for (const outcome of sides) assert(pos[outcome] >= reserved[outcome]);
            }
            for (const outcome of sides) {
                const aggregate = [...market.positions.values()].reduce((sum, pos) => sum + pos.cash + 100 * pos[outcome], 0);
                assert.equal(aggregate, 0);
                const bid = M.ranked(market, 'bid', outcome)[0], ask = M.ranked(market, 'ask', outcome)[0];
                if (bid && ask) assert(M.quotePrice(bid, outcome) < M.quotePrice(ask, outcome));
            }
        }
        const initial = count === 2 ? 85 : 50;
        assert.equal(depth(), initial);
        assert.equal(add(buy(initial + 1), 'reader').error, 'depth');
        assert.equal(depth(), initial, 'A rejected order does not refresh quotes');
        const first = add(buy(initial), 'reader');
        assert.equal(first.filled, initial);
        assert.equal(first.cash, { 2:5135, 3:2090, 4:1690 }[count]);
        assert.equal(depth(), 20);
        assert.equal(market.liquidity.extraSets, 20);
        assert.equal(market.trades.reduce((sum, trade) => sum + trade.qty, 0), initial);
        verifyCollateral();

        assert.equal(add(buy(20), 'reader').filled, 20);
        assert.equal(add(buy(1), 'reader').error, 'depth');
        assert.equal(add({ ...buy(20), action:'sell', limit:1 }, 'reader').filled, 20);
        assert.equal(depth(), 20, 'Returned stock can be quoted after the minting cap');
        assert.equal(market.liquidity.extraSets, 20);
        assert.equal(add(buy(1), 'reader').filled, 1);
        verifyCollateral();

        add({ kind:'lock' });
        assert.equal(depth(), 0);
        assert.deepEqual(add({ kind:side }), {});
        assert.equal(M.available(state, 'reader', key, start), M.INITIAL + M.position(market, 'reader').cash + 100 * M.position(market, 'reader')[side]);
        const replay = M.create();
        log.forEach(([id, record]) => M.apply(replay, record, id));
        assert.deepEqual(replay, state);
    }
}
{
    const old = fixture(), { state, m } = old;
    assert.equal(old.order('reader', 'yes', 'buy', 85, 65, 'market').filled, 85);
    assert.equal(old.order('reader', 'yes', 'buy', 1, 99, 'market').error, 'depth');
    assert.equal(old.add({ kind:'liquidity' }, 'reader').error, 'invalid');
    const oldFills = structuredClone(m.trades), before = { date:m.date, endAt:m.endAt, phase:m.phase };
    assert.deepEqual(old.add({ kind:'liquidity' }).error, undefined);
    assert.deepEqual(m.trades, oldFills);
    assert.deepEqual({ date:m.date, endAt:m.endAt, phase:m.phase }, before);
    assert.equal(old.order('reader', 'yes', 'buy', 1, 99, 'market').filled, 1);
    assert.equal(old.add({ kind:'liquidity' }).error, 'invalid');

    const blocked = fixture();
    blocked.order('reader', 'yes', 'buy', 85, 65, 'market');
    blocked.order('peer', 'yes', 'buy', 5, 99);
    blocked.add({ kind:'liquidity' });
    assert.equal(M.ranked(blocked.m, 'ask', 'yes').length, 0, 'A refill cannot cross a resting order');
    assert.equal(blocked.m.liquidity.extraSets, 0);
}
{
    const state = M.create();
    const key = 'abcdefghijklmnopqrst', start = M.endOfDay(day) - M.DAY + 1;
    function add(command, actor = M.OWNER, id = 'event-' + (state.n + 1)) {
        return M.apply(state, { ...command, day:key, actor, n:state.n + 1, at:start + state.n }, id);
    }
    const answers = { yes:'Первый', no:'Второй', third:'Третий' };
    add({ kind:'open', question:'Какой исход?', answers, endAt:M.endOfDay(day) }, M.OWNER, key);
    for (const side of ['no', 'third']) {
        const order = { kind:'order', side, mode:'market' };
        assert.equal(add({ ...order, action:'buy', qty:50, limit:99 }, side).filled, 50);
        assert.equal(add({ ...order, action:'sell', qty:49, limit:1 }, side).filled, 49);
        assert.equal(add({ ...order, action:'sell', mode:'limit', qty:1, limit:22 }, side).left, 1);
    }
    assert.equal(add({ kind:'order', side:'yes', mode:'market', action:'buy', qty:50, limit:99 }, 'reader').filled, 50);
    assert.deepEqual(add({ kind:'liquidity' }), {});
    const market = state.markets.get(key);
    const cheapest = market.sides.map(side => M.quotePrice(M.ranked(market, 'ask', side)[0], side));
    assert.deepEqual(cheapest, [56, 22, 22], 'A refill cannot discount a complete set below its guaranteed payout');
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
    const entry = m.orderHistory.get(resting.id);
    assert.deepEqual([entry.qty, entry.filled, entry.cash, entry.cancelledAt],
        [4, 2, 108, f.log.at(-1)[1].at]);
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
    assert.equal(f.m.orderHistory.get(a.id).filled, 4);
    assert.equal(f.m.orderHistory.get(b.id).filled, 2);
    assert.equal(f.m.orderHistory.get(b.id).cash, 100);
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
{
    const f = fixture(), { state, m } = f;
    const at = m.openedAt + 5000;
    f.order('seller', 'yes', 'buy', 9, 99, 'market');
    f.order('seller', 'yes', 'sell', 2, 99);
    f.order('peer', 'no', 'buy', 85, 99, 'market');
    const bid = f.order('peer', 'yes', 'buy', 3, 40);
    assert.deepEqual(M.instantSale(state, m, 'seller', 'yes', at), { free:7, qty:3, cash:120 });
    const own = f.order('seller', 'yes', 'buy', 1, 45);
    assert.deepEqual(M.instantSale(state, m, 'seller', 'yes', at), { free:7, qty:0, cash:0, error:'own' });
    f.add({ kind:'cancel', target:own.id }, 'seller');
    assert.equal(f.order('seller', 'yes', 'sell', 3, 1, 'market').cash, 120);
    assert.equal(m.orderHistory.get(bid.id).filled, 3);
    assert.equal(m.orderHistory.get(bid.id).lastFill.n, state.n);
    assert.deepEqual(M.participantTrades(m, 'seller').map(({ qty, price, action }) => [qty, price, action]),
        [[9, 51, 'buy'], [3, 40, 'sell']]);
    f.time(M.endOfDay(day) - M.DAY + 1000);
    f.add({ kind:'lock' });
    assert.equal(M.instantSale(state, m, 'seller', 'yes', m.closedAt).qty, 0);
    f.add({ kind:'yes', resultNote:'Подтверждено протоколом.', resultUrl:'https://example.test/protocol#match' });
    assert.equal(m.resolution.url, 'https://example.test/protocol#match');
    assert.deepEqual(M.settlement(m, 'seller'), { qty:6, payout:600, net:261, refund:0, reversed:0 });
    const replay = M.create();
    for (const [id, event] of f.log) M.apply(replay, event, id);
    assert.deepEqual(replay, state);
}
{
    const f = fixture();
    f.order('player', 'yes', 'buy', 5, 99, 'market');
    f.order('player', 'yes', 'sell', 2, 1, 'market');
    f.add({ kind:'void', resultNote:'Матч отменён.', resultUrl:'javascript:alert(1)' });
    assert.equal(f.m.resolution.note, 'Матч отменён.');
    assert.equal(f.m.resolution.url, '');
    assert.deepEqual(M.settlement(f.m, 'player'), { qty:0, payout:0, net:0, refund:157, reversed:0 });
    for (const url of ['https:///test', 'https://user@host.test/', '\\https://bad.test/', 'http://host.test/a b'])
        assert.equal(M.resultSource(url), '');
}
console.log('Forecast market passed matching, executable sale quotes, settlement detail, standings, deadlines and replay.');
