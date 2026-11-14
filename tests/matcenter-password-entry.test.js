'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('matcenter/00-core.js', 'utf8');
const helper = source.slice(source.indexOf('async function authorizeMatcenterAccount('), source.indexOf('async function initializeMatcenterAccess('));

async function scenario({registered = false, deny = false, unavailable = false} = {}) {
    let user = registered ? {uid:'registered'} : null;
    let anonymousCalls = 0;
    const requests = [];
    const auth = {async signInAnonymously() {
        anonymousCalls++;
        if (unavailable) throw new Error('Network unavailable');
        user = {uid:'guest',isAnonymous:true};
    }};
    const ctx = {
        getMatcenterFirebaseAuth: () => auth,
        waitForMatcenterUser: async () => user,
        getMatcenterIdToken: async force => {assert.equal(force,true); assert.ok(user); return user.uid+'-token';},
        TASKS_ENDPOINTS: ['main','summer','main'],
        postMatcenterJson: async (endpoint,payload) => {
            requests.push({endpoint,...payload});
            return deny && endpoint==='summer' ? {success:false,error:'Неверный пароль'} : {success:true,allowed:true,isAdmin:false};
        }
    };
    vm.createContext(ctx); vm.runInContext(helper,ctx);
    if (deny || unavailable) await assert.rejects(ctx.authorizeMatcenterAccount('test-password'), error => deny ? error.code==='AUTH' : /Network/.test(error.message));
    else assert.equal((await ctx.authorizeMatcenterAccount('test-password')).isAdmin,false);
    assert.equal(anonymousCalls,registered ? 0 : 1);
    if (unavailable) assert.equal(requests.length,0);
    else {
        assert.equal(requests.length,2);
        assert.deepEqual(requests.map(r=>r.endpoint),['main','summer']);
        assert.ok(requests.every(r=>r.password==='test-password' && r.action==='authorizeAccount' && r.idToken===(registered?'registered':'guest')+'-token'));
    }
}
(async()=>{
    await scenario(); await scenario({registered:true});
    await scenario({deny:true}); await scenario({unavailable:true});
    console.log('Password entry: guest creation, account preservation, server rejection and network failure passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
