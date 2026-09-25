'use strict';
const assert=require('node:assert/strict');
const root='../game-source/orbital-courier/src/';
for(const f of ['economy','routes','achievements','physics','levels','cosmetics','medals','progression'])require(root+f+'.js');
const {Progress:G,Economy:E}=globalThis.Orbital;
const p=G.fresh();assert.equal(G.quote(p,'engine').cost,125);assert.equal(G.buy(p,'engine').ok,false);
const rich=G.sanitize(require('../game-source/orbital-courier/docs/completed-v8-profile.json'));
for(const key of Object.keys(G.UPGRADE_DEFS)){
    const profile=structuredClone(rich),before=profile.credits,dataBefore=profile.data;
    let paid=0,spentData=0;
    while(profile.upgrades[key]<5){
        const q=G.quote(profile,key);assert.equal(q.canBuy,true);
        assert.equal(q.cost%5,0);assert.equal(q.required,E.TIER_UNLOCKS[q.lv]);assert.equal(q.dataCost,E.DATA_COSTS[q.lv]);
        const result=G.buy(profile,key);assert.equal(result.cost,q.cost);paid+=q.cost;spentData+=q.dataCost;
    }
    assert.equal(profile.credits,before-paid);assert.equal(profile.data,dataBefore-spentData);
    assert.equal(G.buy(profile,key).ok,false);const refund=G.respec(profile);
    assert.equal(refund.credits,paid);assert.equal(refund.data,spentData);assert.equal(profile.credits,before);assert.equal(profile.data,dataBefore);
    assert.equal(G.respec(profile).credits,0,'a second refund never pays twice');
}
for(const key of Object.keys(E.BASE_COST))for(let tier=1;tier<=5;tier++){
    assert.ok(E.price(key,tier,10,0)>=E.price(key,tier,0,0));
    assert.equal(E.price(key,tier,0,40),E.price(key,tier,0,400),'research discount is capped');
}
console.log('orbital prices: quotes, eligibility, purchases, maximum tiers and exact refunds passed');
