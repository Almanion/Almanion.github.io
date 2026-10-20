'use strict';
const {test,expect}=require('@playwright/test');
const base='/games/orbital-courier/';
test.use({serviceWorkers:'block'});
function cloud(){
    const records=new Map(),writes=[],authCalls=[];let online=true;
    return {records,writes,authCalls,setOnline:value=>{online=value;},
        async device(browser,{uid=null,width=1366,height=768}={}){
            const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'}),page=await context.newPage();
            await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
            await page.exposeFunction('qaCloudRead',async uid=>{if(!online)throw Error('Synthetic connection loss');return records.get(uid)||null;});
            await page.exposeFunction('qaCloudWrite',async(uid,revision,save)=>{
                if(!online)throw Error('Synthetic connection loss');const current=records.get(uid)||null;
                if((current?.revision||0)!==revision)return {committed:false,record:current};
                const record={version:1,revision:revision+1,save,updatedAt:Date.now()};records.set(uid,record);writes.push({uid,record});return {committed:true,record};
            });
            await page.exposeFunction('qaAuth',async(method,email)=>{authCalls.push({method,email});});
            await page.addInitScript(uid=>{
                if(uid&&!sessionStorage.getItem('qa-cloud-uid'))sessionStorage.setItem('qa-cloud-uid',uid);
                let callback,transport;
                const notify=uid=>callback(uid?{uid,email:'pilot@example.test'}:null,transport);
                window.AlmanionOrbitalAccount={persistence:'local',
                    async connect(next){callback=next;transport={read:uid=>window.qaCloudRead(uid),write:(uid,revision,save,valid)=>valid()?window.qaCloudWrite(uid,revision,save):Promise.resolve({committed:false,record:null})};notify(sessionStorage.getItem('qa-cloud-uid'));return ()=>{callback=()=>{};};},
                    async signIn(email,password){await window.qaAuth('login',email);if(password==='bad-password')throw {code:'auth/invalid-credential'};sessionStorage.setItem('qa-cloud-uid','pilot');notify('pilot');},
                    async register(email){await window.qaAuth('register',email);sessionStorage.setItem('qa-cloud-uid','pilot');notify('pilot');},
                    async resetPassword(email){await window.qaAuth('reset',email);},
                    signInGoogle(){return Promise.reject({code:'auth/popup-blocked'});},
                    async signOut(){sessionStorage.removeItem('qa-cloud-uid');notify(null);}};
                window.qaAccount=uid=>{if(uid)sessionStorage.setItem('qa-cloud-uid',uid);else sessionStorage.removeItem('qa-cloud-uid');notify(uid);};
            },uid);
            await page.goto(base);return {context,page};
        }};
}
async function connect(page){
    await page.locator('[data-action=cloud-header]').click();await page.locator('[data-action=cloud-connect]').click();
}
async function ready(page){await expect.poll(()=>page.evaluate(()=>Orbital.Cloud.sync?.status)).toBe('synced');}
async function deliver(page){
    return page.evaluate(()=>{
        const O=Orbital,A=O.App,P=O.Physics,l=A.level();A.profile.settings.sound=false;A.profile.settings.reducedMotion=true;A.setAim(l.solution.angle,l.solution.speed);A.launch();let ticks=0;
        while(A.state.status==='flying'){const previous=A.state;A.state=P.step(previous,l);O.Review.observe(previous,A.state,l);if(++ticks%3===0||A.state.status!=='flying')A.trail.push({x:A.state.x,y:A.state.y,t:A.state.t});}
        if(A.state.status!=='won')throw Error('Authored route must deliver');A.finish();
        const saved=JSON.parse(localStorage.getItem(O.Progress.SAVE_KEY));if(!O.Campaign.current(saved,l.id))throw Error('Result must be persisted before showing Next');
        return {credits:A.profile.credits,data:A.profile.data,xp:A.profile.xp,records:A.profile.records,upgrades:A.profile.upgrades};
    });
}
test('older cloud saves gain the default hull without conflict and new hulls reach another device',async({browser})=>{
 const remote=cloud(),old=structuredClone(require('../game-source/orbital-courier/docs/completed-v8-profile.json'));
 delete old.model;remote.records.set('pilot',{version:1,revision:1,save:JSON.stringify(old),updatedAt:1});
 const a=await remote.device(browser,{uid:'pilot'});let b;
 try{
  const funds=await a.page.evaluate(raw=>{const A=Orbital.App;A.profile=Orbital.Progress.sanitize(raw);A.save();return[A.profile.credits,A.profile.data,A.profile.xp];},old);
  await connect(a.page);await ready(a.page);expect(remote.writes).toHaveLength(0);
  expect(await a.page.evaluate(()=>Orbital.App.profile.model)).toBe('courier');
  await a.page.evaluate(()=>{const A=Orbital.App,q=Orbital.LEVELS[80].solution;A.profile.model='swift';A.profile.finish='metal';A.profile.livery='stripe';A.profile.layouts={'80:normal':q.layout};A.profile.courses['80:normal']=[q,null];A.save();});
  await expect.poll(()=>JSON.parse(remote.records.get('pilot').save).model).toBe('swift');
  b=await remote.device(browser,{uid:'pilot'});await connect(b.page);await ready(b.page);
  expect(await b.page.evaluate(()=>{const p=Orbital.App.profile;return[p.model,p.finish,p.livery,p.credits,p.data,p.xp];})).toEqual(['swift','metal','stripe',...funds]);
  expect(await b.page.evaluate(()=>Orbital.App.profile.layouts['80:normal'])).toEqual(await a.page.evaluate(()=>Orbital.App.profile.layouts['80:normal']));
  expect(await b.page.evaluate(()=>Orbital.App.profile.courses['80:normal'][0].layout)).toEqual(await a.page.evaluate(()=>Orbital.App.profile.layouts['80:normal']));
 }finally{await a.context.close();await b?.context.close();}
});
for(const width of [390,1366])test('each completed contract survives immediate Next, reload and a second device '+width,async({browser},testInfo)=>{
    const remote=cloud(),a=await remote.device(browser,{uid:'pilot',width,height:844});
    let b;
    try{
        await connect(a.page);await ready(a.page);await a.page.locator('#modal .modal-close').click();
        await a.page.goto(base+'flight/?contract=4');await ready(a.page);
        const first=await deliver(a.page);await a.page.locator('#resultNext').click();await expect(a.page).toHaveURL(/contract=5$/);await ready(a.page);
        expect(JSON.parse(remote.records.get('pilot').save).credits).toBe(first.credits);
        const second=await deliver(a.page);await a.page.locator('#resultNext').click();await expect(a.page).toHaveURL(/contract=6$/);await ready(a.page);
        const persisted=JSON.parse(remote.records.get('pilot').save);expect(persisted.records['4'].medals&1).toBe(1);expect(persisted.records['5'].medals&1).toBe(1);expect(persisted.credits).toBe(second.credits);
        await a.page.reload();await ready(a.page);
        expect(await a.page.evaluate(()=>Orbital.Campaign.current(Orbital.App.profile,5))).toBeTruthy();
        b=await remote.device(browser,{uid:'pilot',width,height:844});await connect(b.page);await ready(b.page);
        expect(await b.page.evaluate(()=>({credits:Orbital.App.profile.credits,data:Orbital.App.profile.data,xp:Orbital.App.profile.xp,records:Orbital.App.profile.records,upgrades:Orbital.App.profile.upgrades}))).toEqual(second);
        expect(await b.page.evaluate(()=>Orbital.Campaign.count(Orbital.App.profile))).toBe(2);
        await expect(b.page.locator('#cloudPanel')).toContainText('Следующий результат отправится автоматически');
        await b.page.screenshot({path:testInfo.outputPath('cloud-saved.png'),fullPage:true});
    }finally{await a.context.close();await b?.context.close();}
});
test('a connection error retries automatically and uploads a completed contract without an online event',async({browser})=>{
    const remote=cloud(),a=await remote.device(browser,{uid:'pilot'});
    try{
        await connect(a.page);await ready(a.page);await a.page.goto(base+'flight/?contract=4');await ready(a.page);
        remote.setOnline(false);const expected=await deliver(a.page);
        await expect.poll(()=>a.page.evaluate(()=>Orbital.Cloud.sync.status)).toBe('error');
        expect((JSON.parse(remote.records.get('pilot').save).records['4']?.medals||0)&1).toBe(0);
        expect(await a.page.evaluate(()=>Orbital.Campaign.current(JSON.parse(localStorage.getItem(Orbital.Progress.SAVE_KEY)),4))).toBeTruthy();
        remote.setOnline(true);await expect.poll(()=>a.page.evaluate(()=>Orbital.Cloud.sync.status),{timeout:9000}).toBe('synced');
        expect(JSON.parse(remote.records.get('pilot').save).credits).toBe(expected.credits);
        expect(JSON.parse(remote.records.get('pilot').save).records['4'].medals&1).toBe(1);
    }finally{await a.context.close();}
});
for(const [width,height]of [[320,568],[568,320],[1366,768]])test('account sign-in stays in the game and handles recovery, validation and Google errors '+width,async({browser},testInfo)=>{
    const remote=cloud(),a=await remote.device(browser,{width,height});
    try{
        await connect(a.page);await expect(a.page.locator('#cloudAuthForm')).toBeVisible();await expect(a.page).toHaveURL(new RegExp(base+'$'));
        expect(await a.page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
        await a.page.getByLabel('Почта',{exact:true}).fill('pilot@example.test');
        await a.page.locator('[data-action=cloud-google]').click();await expect(a.page.locator('#cloudAuthError')).toContainText('заблокировал окно');
        await a.page.locator('[data-mode=reset]').click();expect(await a.page.getByLabel('Почта',{exact:true}).inputValue()).toBe('pilot@example.test');
        await a.page.locator('#cloudAuthForm button[type=submit]').click();await expect(a.page.locator('#cloudAuthNotice')).toContainText('письмо со ссылкой отправлено');
        await a.page.locator('[data-mode=login]').click();await a.page.locator('[data-mode=register]').click();
        await a.page.getByLabel('Пароль',{exact:true}).fill('synthetic-password');await a.page.getByLabel('Повтори пароль',{exact:true}).fill('other-password');
        await a.page.locator('#cloudAuthForm button[type=submit]').click();await expect(a.page.locator('#cloudAuthError')).toHaveText('Пароли не совпадают.');
        expect(remote.authCalls.filter(call=>call.method==='register')).toHaveLength(0);
        await a.page.screenshot({path:testInfo.outputPath('game-account-form.png'),fullPage:true});
        await a.page.locator('[data-mode=login]').click();await a.page.getByLabel('Пароль',{exact:true}).fill('bad-password');
        await a.page.locator('#cloudAuthForm button[type=submit]').click();await expect(a.page.locator('#cloudAuthError')).toHaveText('Неверная почта или пароль.');
        await a.page.getByLabel('Пароль',{exact:true}).fill('synthetic-password');await a.page.locator('#cloudAuthForm button[type=submit]').click();await ready(a.page);
        expect(remote.records.has('pilot')).toBeTruthy();expect(a.context.pages()).toHaveLength(1);
        expect(await a.page.evaluate(()=>Object.keys(localStorage).filter(key=>/password/i.test(key)))).toEqual([]);
        await a.page.locator('[data-action=cloud-signout]').click();await expect.poll(()=>a.page.evaluate(()=>Orbital.Cloud.sync.status)).toBe('signed-out');
        expect(await a.page.evaluate(()=>Orbital.App.profile.credits)).toBe(25);
    }finally{await a.context.close();}
});
test('a changed account cannot receive a guest or another account save without a whole-copy choice',async({browser})=>{
    const remote=cloud(),a=await remote.device(browser,{uid:'pilot'});
    try{
        await connect(a.page);await ready(a.page);await a.page.goto(base+'flight/?contract=4');await ready(a.page);await deliver(a.page);await ready(a.page);
        const original=remote.records.get('pilot').save;
        await a.page.evaluate(()=>window.qaAccount('different'));await expect.poll(()=>a.page.evaluate(()=>Orbital.Cloud.sync.status)).toBe('account-change');
        expect(remote.records.has('different')).toBeFalsy();expect(remote.records.get('pilot').save).toBe(original);
        await a.page.locator('[data-action=cloud-header]').click();await expect(a.page.locator('.cloud-copy')).toHaveCount(2);
        await expect(a.page.locator('[data-action=cloud-local]')).toBeDisabled();
        await a.page.locator('#modal .modal-close').click();await a.page.evaluate(()=>Orbital.App.retry());
        await a.page.locator('[data-action=cloud-header]').click();await a.page.locator('[data-action=cloud-local]').click();await ready(a.page);
        expect(JSON.parse(remote.records.get('different').save).records['4'].medals&1).toBe(1);expect(remote.records.get('pilot').save).toBe(original);
        expect(await a.page.evaluate(()=>JSON.parse(localStorage.getItem('orbital-cloud-backups')).length)).toBeGreaterThan(0);
    }finally{await a.context.close();}
});
test('an account loader failure stays visible and can be retried in place',async({page})=>{
    await page.route('**/*',route=>{
        const url=new URL(route.request().url());
        return url.pathname==='/orbital-account.js'||!['127.0.0.1','localhost'].includes(url.hostname)?route.abort():route.continue();
    });
    await page.goto(base);await connect(page);
    await expect(page.locator('#cloudPanel')).toContainText('Нет связи с Almanion');
    await expect(page.locator('[data-action=cloud-header]')).toHaveAttribute('data-status','error');
    await expect(page.locator('[data-action=cloud-reconnect]')).toBeEnabled();
    await page.evaluate(()=>{window.AlmanionOrbitalAccount={connect:async callback=>{callback(null,{read:async()=>null});return ()=>{};}};});
    await page.locator('[data-action=cloud-reconnect]').click();
    await expect.poll(()=>page.evaluate(()=>Orbital.Cloud.sync?.status)).toBe('signed-out');
    await expect(page.locator('#cloudPanel')).not.toContainText('Нет связи с Almanion');
});
for(const width of [320,1366])test('a storage failure after delivery keeps the result available for export and blocks losing it on Next '+width,async({page},testInfo)=>{
    await page.setViewportSize({width,height:width===320?568:768});
    await page.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
    await page.goto(base+'flight/?contract=4');
    const credits=await page.evaluate(()=>{
        const O=Orbital,A=O.App,P=O.Physics,l=A.level();A.profile.settings.sound=false;A.setAim(l.solution.angle,l.solution.speed);A.launch();
        while(A.state.status==='flying'){const previous=A.state;A.state=P.step(previous,l);O.Review.observe(previous,A.state,l);}
        window.qaStorageWrite=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===O.Progress.SAVE_KEY)throw new DOMException('Synthetic quota','QuotaExceededError');return window.qaStorageWrite.call(this,key,value);};
        A.finish();return A.profile.credits;
    });
    await expect(page.locator('#saveWarning')).toBeVisible();await expect(page.locator('[data-action=cloud-header]')).toHaveAttribute('data-status','local-error');await expect(page.locator('.completion-copy')).toContainText('Запись не удалась');
    await page.screenshot({path:testInfo.outputPath('save-error.png')});
    if(width===320){await expect(page.locator('[data-action=cloud-result]')).toBeInViewport();await page.locator('[data-action=cloud-result]').click();await expect(page.locator('#cloudPanel')).toContainText('Не удалось сохранить на устройстве');await page.locator('#modal .modal-close').click();}
    await page.locator('#resultNext').click();
    await expect(page).toHaveURL(/contract=4$/);await expect(page.locator('#modal')).toContainText('Не удалось сохранить прогресс');
    expect(await page.evaluate(()=>Orbital.Campaign.current(Orbital.App.profile,4))).toBeTruthy();
    const downloaded=page.waitForEvent('download');await page.locator('[data-action="pages:export"]').click();
    const fs=require('node:fs'),exported=JSON.parse(fs.readFileSync(await(await downloaded).path(),'utf8'));
    expect(exported.records['4'].medals&1).toBe(1);expect(exported.credits).toBe(credits);
    await page.evaluate(()=>{Storage.prototype.setItem=window.qaStorageWrite;});await page.locator('[data-action="pages:retry-save"]').click();
    expect(await page.evaluate(()=>Orbital.Campaign.current(JSON.parse(localStorage.getItem(Orbital.Progress.SAVE_KEY)),4))).toBeTruthy();
    await page.evaluate(()=>Orbital.App.retry());await deliver(page);await expect(page.locator('#saveWarning')).toHaveCount(1);await expect(page.locator('#saveWarning')).toBeHidden();
});
