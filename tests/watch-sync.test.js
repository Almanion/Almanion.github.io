'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto').webcrypto;
const Sync=require('../watch/sync');
const Data=require('../data-sync');
function memory(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i],get length(){return map.size;}};}
async function run(){
    const storage=memory(),server={},calls=[];let offline=false,now=Date.now(),etag=0,conflict=false;
    const config={apiKey:'test-key',databaseURL:'https://database.example.test/'};
    async function fetch(url,options={}){
        if(offline) throw new Error('offline');
        const u=new URL(url);calls.push({host:u.hostname,path:u.pathname,method:options.method || 'GET'});
        if(u.hostname==='identitytoolkit.googleapis.com') return Response.json({localId:'watch-user',idToken:'device-token',refreshToken:'device-refresh',expiresIn:3600});
        if(u.hostname==='securetoken.googleapis.com') return Response.json({user_id:'watch-user',id_token:'renewed-device-token',refresh_token:'device-refresh',expires_in:3600});
        const path=decodeURIComponent(u.pathname.slice(1).replace(/\.json$/,''));
        if(options.method==='DELETE'){delete server[path];return Response.json(null);}
        if(options.method==='PUT'){
            if(options.headers['If-Match']) {
                if(conflict){conflict=false;etag++;return Response.json(null,{status:412});}
                if(options.headers['If-Match']!==String(etag)) return Response.json(null,{status:412});
            }
            const value=JSON.parse(options.body);if(value.createdAt?.['.sv']) value.createdAt=now;
            server[path]=value;etag++;return Response.json(value);
        }
        const value=path==='bookmarks/account-a' ? Object.fromEntries(Object.entries(server).filter(([k])=>k.startsWith(path+'/')).map(([k,v])=>[k.slice(path.length+1),v])) : server[path] || null;
        return Response.json(value,{headers:{etag:String(etag)}});
    }
    const options={storage,fetch,sync:Data,crypto,config,now:()=>now};
    const client=new Sync.Client(options);client.store.set('physics-10__b__local',{title:'On watch',timestamp:1});
    await client.begin();clearTimeout(client.timer);
    assert.equal(client.status().linked,false);
    assert.ok(Sync.validCode(client.status().code));
    assert.equal(client.status().expiresAt,now+Sync.TTL);
    const code=client.status().code;
    assert.equal(server['watchPairRequests/'+code].deviceUid,'watch-user');
    assert.ok(!JSON.stringify(server['watchPairRequests/'+code]).includes('device-token'));
    server['watchDevices/watch-user']={ownerUid:'account-a',name:'Test watch'};
    server['bookmarks/account-a/physics-10__b__phone']={title:'On phone',updatedAt:now,timestamp:2};
    await client.tick();clearTimeout(client.timer);
    assert.equal(client.status().linked,true);
    assert.equal(client.store.snapshot()['physics-10__b__phone'].title,'On phone');
    assert.equal(server['bookmarks/account-a/physics-10__b__local'].title,'On watch');
    conflict=true;
    client.store.remove('physics-10__b__phone',client.store.snapshot()['physics-10__b__phone']);
    await client.store.flush();
    assert.equal(server['bookmarks/account-a/physics-10__b__phone'].deleted,true);
    offline=true;
    client.store.set('physics-10__b__offline',{title:'Offline favorite'});
    await client.store.flush();
    assert.ok(client.store.pending().length);
    assert.equal(client.status().state,'offline');
    client.stop();
    const resumed=new Sync.Client(options);
    assert.equal(resumed.store.snapshot()['physics-10__b__offline'].title,'Offline favorite');
    assert.equal(resumed.status().linked,true);
    offline=false;await resumed.tick();clearTimeout(resumed.timer);
    assert.equal(server['bookmarks/account-a/physics-10__b__offline'].title,'Offline favorite');
    assert.equal(resumed.store.pending().length,0);
    server['bookmarks/account-a/physics-10__b__local']={deleted:true,updatedAt:now+10000};
    await resumed.tick();clearTimeout(resumed.timer);
    assert.ok(!resumed.store.snapshot()['physics-10__b__local']);
    delete server['watchDevices/watch-user'];
    await resumed.tick();clearTimeout(resumed.timer);
    assert.equal(resumed.status().linked,false);
    assert.equal(resumed.status().state,'revoked');
    assert.ok(!resumed.store.snapshot()['physics-10__b__phone']);
    assert.ok(calls.filter(c=>c.host==='database.example.test').every(c=>/^\/(watchDevices|watchPairRequests|bookmarks)\//.test(c.path)));
    now+=3600001;await resumed.begin();clearTimeout(resumed.timer);
    assert.ok(calls.some(c=>c.host==='securetoken.googleapis.com'));
    now+=Sync.TTL+1;await resumed.checkGrant();
    assert.equal(resumed.status().state,'expired');
    assert.equal(resumed.status().code,'');resumed.stop();
    assert.equal(Sync.normalizeCode('abcd efgh-jkmn pqr0'),'ABCDEFGHJKMNPQR0');
    assert.ok(!Sync.validCode('123456'));
    assert.equal(new Set(Array.from({length:200},()=>Sync.randomCode(crypto))).size,200);
    const denied=new Sync.Client({...options,storage:{getItem:()=>null,setItem:()=>{throw new Error('blocked');}},guestStore:client.guest});
    await assert.rejects(()=>denied.begin(),error=>error.code==='storage');
    denied.stop();
    console.log('watch sync: scoped device auth, one-time codes, two-way favorites, ETag retry, durable offline changes, refresh and revocation passed');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
