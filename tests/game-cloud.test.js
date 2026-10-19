'use strict';
const assert=require('node:assert/strict');
const {CloudSync,encode}=require('../game-source/orbital-courier/src/cloud-core');
const tick=()=>new Promise(r=>setImmediate(r));
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
function server(){
    const records=new Map();let writes=0;
    return {records,get writes(){return writes;},
        read:async uid=>records.get(uid)||null,
        write:async(uid,revision,save,valid)=>{
            const old=records.get(uid);
            if(!valid()||(old?.revision||0)!==revision)return {committed:false,record:old||null};
            const record={version:1,revision:revision+1,save,updatedAt:Date.now()};
            records.set(uid,record);writes++;return {committed:true,record};
        }};
}
function client(transport){
    const storage=memory();let p={credits:25,xp:0},fresh=true,canApply=true;
    const sync=new CloudSync({storage,transport,getSave:()=>encode(p),isFresh:()=>fresh,canApply:()=>canApply,
        applySave:s=>{p=JSON.parse(s);fresh=false;},validateSave:s=>{const v=JSON.parse(s);if(!Number.isFinite(v.credits))throw Error('bad profile');}});
    return {sync,storage,get p(){return p;},change(v){p=v;fresh=false;},block(v){canApply=!v;}};
}
(async()=>{
    const transport=server(),a=client(transport),b=client(transport);
    await a.sync.setUser('pilot');assert.equal(a.sync.status,'synced');assert.equal(transport.writes,1);
    a.change({credits:125,xp:100});await a.sync.sync();
    await b.sync.setUser('pilot');assert.deepEqual(b.p,a.p);assert.equal(transport.writes,2,'fresh device downloads instead of overwriting');
    const writes=transport.writes;await b.sync.sync();assert.equal(transport.writes,writes,'unchanged saves do not write');
    a.change({credits:25,xp:120,receipts:[{credits:100}]});b.change({credits:160,xp:140});
    await a.sync.sync();await b.sync.sync();assert.equal(b.sync.status,'conflict');assert.equal(transport.writes,writes+1);
    await b.sync.resolve('cloud');assert.deepEqual(b.p,a.p);assert.ok(b.storage.getItem('orbital-cloud-backups'));
    a.change({credits:15,xp:160});await a.sync.sync();b.block(true);await b.sync.sync();assert.equal(b.sync.status,'waiting');assert.equal(b.p.credits,25);
    b.block(false);await b.sync.sync();assert.equal(b.p.credits,15);
    await b.sync.setUser('different');assert.equal(b.sync.status,'account-change');assert.equal(transport.records.has('different'),false);
    await b.sync.resolve('local');assert.equal(JSON.parse(transport.records.get('different').save).credits,15);
    await b.sync.setUser(null);b.change({credits:800,xp:900});await b.sync.sync();assert.equal(JSON.parse(transport.records.get('different').save).credits,15,'signed out cannot write');
    const c=client(transport);c.change({credits:88,xp:20});await c.sync.setUser('pilot');assert.equal(c.sync.status,'conflict','existing guest save needs choice');
    // A server write between comparison and confirmation must refresh the choice.
    a.change({credits:42,xp:170});await a.sync.sync();await c.sync.resolve('local');assert.equal(c.sync.status,'conflict');assert.equal(JSON.parse(transport.records.get('pilot').save).credits,42);
    await c.sync.resolve('local');assert.equal(JSON.parse(transport.records.get('pilot').save).credits,88);
    // A write racing the transaction is rejected without losing the local purchase.
    a.change({credits:3,xp:171});await a.sync.sync();assert.equal(a.sync.status,'conflict');assert.equal(a.p.credits,3);
    const broken=client({read:async()=>{throw Error('permission_denied');}});await broken.sync.setUser('pilot');assert.equal(broken.sync.status,'error');assert.equal(broken.p.credits,25);await broken.sync.sync();assert.equal(broken.sync.status,'error');
    const corrupt=client({read:async()=>({version:1,revision:3,save:'{broken'})});await corrupt.sync.setUser('pilot');assert.equal(corrupt.sync.status,'error');assert.equal(corrupt.p.credits,25);
    // Changing account while a read is in flight must ignore the stale response.
    let release;const delayed=client({read:()=>new Promise(r=>release=r)});const old=delayed.sync.setUser('old');await tick();await delayed.sync.setUser(null);
    release({version:1,revision:1,save:encode({credits:999,xp:1})});await old;assert.equal(delayed.p.credits,25);assert.equal(delayed.sync.status,'signed-out');
    // Changes while uploading remain pending and are uploaded after the acknowledgement.
    const slow=server(),baseWrite=slow.write;let releaseWrite;
    slow.write=async(...args)=>{await new Promise(r=>releaseWrite=r);return baseWrite(...args);};
    const d=client(slow),started=d.sync.setUser('pilot');await tick();d.change({credits:77,xp:7});slow.write=baseWrite;releaseWrite();await started;await tick();await tick();assert.equal(JSON.parse(slow.records.get('pilot').save).credits,77);
    // Selecting a contract on two devices is not a competing economic result.
    const preferences=server(),e=client(preferences),f=client(preferences);
    const sameSave=(a,b)=>{a=JSON.parse(a);b=JSON.parse(b);delete a.lastLevel;delete b.lastLevel;return encode(a)===encode(b);};
    e.sync.o.sameSave=f.sync.o.sameSave=sameSave;
    await e.sync.setUser('pilot');await f.sync.setUser('pilot');const preferenceWrites=preferences.writes;
    e.change({...e.p,lastLevel:4});f.change({...f.p,lastLevel:8});await e.sync.sync();await f.sync.sync();
    assert.equal(preferences.writes,preferenceWrites);assert.equal(f.sync.status,'synced');assert.equal(f.p.lastLevel,8);
    e.change({...e.p,credits:90,xp:10});await e.sync.sync();await f.sync.sync();
    assert.equal(f.sync.status,'synced');assert.equal(f.p.credits,90);
    // Metadata after an acknowledgement can fail; the following read safely recovers.
    const quota=client(server()),setItem=quota.storage.setItem;let failMeta=true;
    quota.storage.setItem=(key,value)=>{if(failMeta&&key.startsWith('orbital-cloud-meta:'))throw Error('quota');setItem(key,value);};
    await quota.sync.setUser('pilot');assert.equal(quota.sync.status,'error');failMeta=false;await quota.sync.sync(true);assert.equal(quota.sync.status,'synced');
    console.log('orbital cloud: account isolation, conflicts, atomic writes, backups, offline errors and in-flight races passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
