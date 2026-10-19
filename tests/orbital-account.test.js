'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../orbital-account.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
    const records=new Map(),listeners=new Set(),timers=new Map(),calls=[];let timerId=0,online=true,read,transaction,coldCache=false;
    const snapshot=value=>({val:()=>value});
    const auth={currentUser:{uid:'pilot',isAnonymous:false},useDeviceLanguage(){},async setPersistence(mode){calls.push(['persistence',mode]);},
        onAuthStateChanged(callback){callback(auth.currentUser);return ()=>{};},
        async signInWithEmailAndPassword(...args){calls.push(['login',...args]);},async createUserWithEmailAndPassword(...args){calls.push(['register',...args]);},
        async sendPasswordResetEmail(email){calls.push(['reset',email]);},async signInWithPopup(provider){calls.push(['google',provider]);},async signOut(){calls.push(['signout']);}};
    const info={on(event,callback){listeners.add(callback);callback(snapshot(online));},off(event,callback){listeners.delete(callback);}};
    const db={ref(path){if(path==='.info/connected')return info;return {
        once:()=>read?read():Promise.resolve(snapshot(records.get(path)||null)),
        transaction:update=>transaction?transaction(update):Promise.resolve().then(()=>{
            const old=records.get(path)||null,initial=update(coldCache?null:old);
            const value=coldCache&&old&&initial!==undefined?update(old):initial;if(value)records.set(path,value);
            return {committed:!!value,snapshot:snapshot(records.get(path)||null)};
        })};}};
    const firebase={apps:[{}],auth:()=>auth,database:()=>db};
    firebase.auth.Auth={Persistence:{LOCAL:'LOCAL',SESSION:'SESSION',NONE:'NONE'}};
    firebase.auth.GoogleAuthProvider=class{setCustomParameters(value){this.parameters=value;}};
    firebase.database.ServerValue={TIMESTAMP:{'.sv':'timestamp'}};
    const context={firebase,firebaseConfig:{},setTimeout(callback,ms){timers.set(++timerId,{callback,ms});return timerId;},clearTimeout(id){timers.delete(id);},Promise,Error};
    context.window=context;vm.runInNewContext(source,context);
    return {adapter:context.AlmanionOrbitalAccount,records,auth,calls,timers,listeners,
        online(value){online=value;for(const cb of [...listeners])cb(snapshot(value));},
        stallRead(){read=()=>new Promise(()=>{});},stallWrite(){transaction=update=>{this.lastUpdate=update;return new Promise(()=>{});};},
        cold(){coldCache=true;},
        expire(ms){for(const [id,timer]of [...timers])if(timer.ms<=ms){timers.delete(id);timer.callback();}}};
}
(async()=>{
    const h=harness();let transport;
    const stop=await h.adapter.connect((user,next)=>{assert.equal(user.uid,'pilot');transport=next;});
    assert.deepEqual(h.calls[0],['persistence','LOCAL']);assert.equal(await transport.read('pilot'),null);
    let result=await transport.write('pilot',0,'first',()=>true);assert.equal(result.committed,true);assert.equal(result.record.revision,1);
    result=await transport.write('pilot',0,'stale',()=>true);assert.equal(result.committed,false);assert.equal(result.record.save,'first');
    result=await transport.write('pilot',1,'invalidated',()=>false);assert.equal(result.committed,false);
    h.auth.currentUser={uid:'other',isAnonymous:false};
    await assert.rejects(transport.read('pilot'),/Войди/);result=await transport.write('pilot',1,'wrong account',()=>true);assert.equal(result.committed,false);
    h.auth.currentUser={uid:'pilot',isAnonymous:true};await assert.rejects(transport.read('pilot'),/Войди/);
    h.auth.currentUser={uid:'pilot',isAnonymous:false};h.online(false);
    await assert.rejects(transport.write('pilot',1,'offline',()=>true),/Нет соединения/);
    const offline=assert.rejects(transport.read('pilot'),/Нет соединения/);h.expire(8000);await offline;assert.equal(h.listeners.size,1,'offline waiter must be removed');
    h.online(true);h.stallRead();const stalledRead=assert.rejects(transport.read('pilot'),/Облако не ответило/);await tick();h.expire(12000);await stalledRead;
    h.stallWrite();const stalledWrite=assert.rejects(transport.write('pilot',1,'late',()=>true),/Не получено подтверждение/);h.expire(12000);await stalledWrite;
    assert.equal(h.lastUpdate({revision:1}),undefined,'a timed-out Firebase transaction must abort on a later retry');
    await h.adapter.signIn('pilot@example.test','synthetic password');await h.adapter.register('new@example.test','synthetic password');
    await h.adapter.signInGoogle();await h.adapter.signOut();
    assert.ok(h.calls.some(call=>call[0]==='google'&&call[1].parameters.prompt==='select_account'));
    h.auth.sendPasswordResetEmail=async()=>{throw {code:'auth/user-not-found'};};await h.adapter.resetPassword('unknown@example.test');
    h.auth.sendPasswordResetEmail=async()=>{throw {code:'auth/network-request-failed'};};await assert.rejects(h.adapter.resetPassword('pilot@example.test'));
    stop();assert.equal(h.listeners.size,0);assert.equal(h.timers.size,0);
    const fallback=harness();fallback.auth.setPersistence=async mode=>{fallback.calls.push(['persistence',mode]);if(mode==='LOCAL')throw Error('blocked');};
    await fallback.adapter.connect(()=>{});assert.equal(fallback.adapter.persistence,'session');
    assert.deepEqual(fallback.calls,[['persistence','LOCAL'],['persistence','SESSION']]);
    const cold=harness();let coldTransport;await cold.adapter.connect((user,next)=>{coldTransport=next;});
    await coldTransport.write('pilot',0,'initial',()=>true);cold.cold();
    const repeated=await coldTransport.write('pilot',1,'completed contract',()=>true);
    assert.equal(repeated.committed,true,'an uncached Firebase transaction must reach the server instead of falsely conflicting');
    assert.equal(repeated.record.revision,2);assert.equal(repeated.record.save,'completed contract');
    const stale=await coldTransport.write('pilot',1,'stale device',()=>true);
    assert.equal(stale.committed,false,'a cold cache must not bypass the actual server revision');assert.equal(stale.record.save,'completed contract');
    console.log('orbital account: auth persistence, sign-in methods, CAS writes, account isolation, offline/stalled requests and timeout cancellation passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
