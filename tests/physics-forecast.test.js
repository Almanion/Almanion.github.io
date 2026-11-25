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
console.log('Physics market: complementary shares, collateral conservation, FIFO, partial fills, price protection, void and replay passed.');
