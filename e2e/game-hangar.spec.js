'use strict';
const {test,expect}=require('@playwright/test');
const profile=require('../game-source/orbital-courier/docs/completed-v8-profile.json');
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{
    await page.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
});
for(const [width,height]of [[320,568],[390,844],[844,390],[1366,768]]){
    test(`hangar and circular hero at ${width}x${height}`,async({page},testInfo)=>{
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.setViewportSize({width,height});
        await page.goto('/games/orbital-courier/');
        await expect(page.locator('#heroCanvas')).toBeVisible();
        const transform=await page.locator('#heroCanvas').evaluate(c=>{const m=c.getContext('2d').getTransform();return {x:m.a,y:m.d};});
        expect(transform.x).toBeCloseTo(transform.y,6);
        await page.screenshot({path:testInfo.outputPath('home.png'),fullPage:true});
        await page.evaluate(()=>Orbital.App.go('hangar',true));
        await expect(page.locator('.module-card')).toHaveCount(4);
        await expect(page.locator('#hangarShip')).toBeVisible();
        expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
        await page.locator('.upgrade-plan summary').first().click();
        await expect(page.locator('.price-table').first()).toBeVisible();
        await page.locator('#shopModeSelect').selectOption('pro');
        await expect(page.locator('[data-module=scanner] .module-effect')).toContainText('0.9');
        await expect(page.locator('[data-module=scanner] .module-spec strong').first()).toContainText('0.9');
        await page.screenshot({path:testInfo.outputPath('hangar.png'),fullPage:true});
        expect(errors).toEqual([]);
    });
}
test('shop quotes, changed quote confirmation, purchase and refund',async({page})=>{
    await page.goto('/games/orbital-courier/');
    await page.evaluate(p=>{Orbital.App.profile=Orbital.Progress.sanitize(p);Orbital.App.go('hangar',true);},profile);
    const before=await page.evaluate(()=>({credits:Orbital.App.profile.credits,data:Orbital.App.profile.data}));
    await page.locator('[data-action=upgrade][data-key=engine]').click();
    await page.locator('#modal .modal-close').click();
    expect(await page.evaluate(()=>Orbital.App.profile.credits)).toBe(before.credits);
    await page.locator('[data-action=upgrade][data-key=engine]').click();
    // A concurrent profile update changes the assembly factor before confirmation.
    await page.evaluate(()=>{Orbital.Progress.buy(Orbital.App.profile,'scanner');});
    const afterOther=await page.evaluate(()=>Orbital.App.profile.credits);
    await page.locator('[data-action=confirm-upgrade]').click();
    expect(await page.evaluate(()=>Orbital.App.profile.upgrades.engine)).toBe(0);
    expect(await page.evaluate(()=>Orbital.App.profile.credits)).toBe(afterOther);
    const quote=await page.evaluate(()=>Orbital.Progress.quote(Orbital.App.profile,'engine'));
    await page.locator('[data-action=confirm-upgrade]').click();
    expect(await page.evaluate(()=>Orbital.App.profile.credits)).toBe(afterOther-quote.cost);
    await page.locator('[data-action=respec-info]').click();await page.locator('[data-action=respec-confirm]').click();
    expect(await page.evaluate(()=>Orbital.App.profile.credits)).toBe(before.credits);
    expect(await page.evaluate(()=>Orbital.App.profile.data)).toBe(before.data);
});
test('cloud restores a second device, rejects divergent copies and isolates account changes',async({browser})=>{
    let record=null;
    async function device(uid,seed){
        const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
        await page.exposeFunction('cloudRead',async()=>record);
        await page.exposeFunction('cloudWrite',async(revision,save)=>{
            if((record?.revision||0)!==revision)return {committed:false,record};
            record={version:1,revision:revision+1,save,updatedAt:Date.now()};return {committed:true,record};
        });
        await page.addInitScript(({uid,seed})=>{
            if(seed&&!localStorage.getItem('orbital-courier-save-v8'))localStorage.setItem('orbital-courier-save-v8',JSON.stringify(seed));
            window.AlmanionOrbitalAccount={connect:async callback=>{
                const transport={read:()=>window.cloudRead(),write:(_uid,revision,save,valid)=>valid()?window.cloudWrite(revision,save):Promise.resolve({committed:false,record:null})};
                window.testAccount=next=>callback(next?{uid:next,email:'pilot@example.test'}:null,transport);
                window.testAccount(uid);return ()=>{};
            }};
        },{uid,seed});
        await page.goto('http://127.0.0.1:4173/games/orbital-courier/');
        await page.locator('[data-action=cloud]').click();await page.locator('[data-action=cloud-connect]').click();
        await expect.poll(()=>page.evaluate(()=>Orbital.Cloud.sync?.status)).toBe('synced');
        await page.locator('#modal .modal-close').click();return {context,page};
    }
    const a=await device('pilot',profile),b=await device('pilot');
    try{
        expect(await b.page.evaluate(()=>Orbital.App.profile.credits)).toBe(profile.credits);
        await a.page.evaluate(()=>{Orbital.Progress.buy(Orbital.App.profile,'engine');Orbital.App.save();});
        await expect.poll(()=>a.page.evaluate(()=>Orbital.Cloud.sync.base===Orbital.CloudCore.encode(Orbital.App.profile))).toBeTruthy();
        await b.page.evaluate(()=>Orbital.Cloud.sync.sync());
        expect(await b.page.evaluate(()=>Orbital.App.profile.upgrades.engine)).toBe(1);
        await b.page.reload();await expect.poll(()=>b.page.evaluate(()=>Orbital.Cloud.sync?.status)).toBe('synced');
        expect(await b.page.evaluate(()=>Orbital.App.profile.upgrades.engine)).toBe(1);
        await a.page.evaluate(()=>{Orbital.Progress.buy(Orbital.App.profile,'scanner');});
        await b.page.evaluate(()=>{Orbital.Progress.buy(Orbital.App.profile,'docking');Orbital.App.save();});
        await expect.poll(()=>b.page.evaluate(()=>Orbital.Cloud.sync.base===Orbital.CloudCore.encode(Orbital.App.profile))).toBeTruthy();
        await a.page.evaluate(()=>Orbital.Cloud.sync.sync());expect(await a.page.evaluate(()=>Orbital.Cloud.sync.status)).toBe('conflict');
        await a.page.locator('[data-action=cloud]').click();await expect(a.page.locator('.cloud-copy')).toHaveCount(2);
        await a.page.locator('[data-action=cloud-remote]').click();await expect.poll(()=>a.page.evaluate(()=>Orbital.Cloud.sync.status)).toBe('synced');
        expect(await a.page.evaluate(()=>Orbital.App.profile.upgrades.docking)).toBe(1);
        expect(await a.page.evaluate(()=>!!localStorage.getItem('orbital-cloud-backups'))).toBeTruthy();
        await a.page.locator('[data-action=cloud-backup]').click();
        const downloaded=a.page.waitForEvent('download');
        await a.page.locator('[data-action=cloud-backup-copy][data-copy=local]').first().click();
        const stream=await (await downloaded).createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);
        const backup=JSON.parse(Buffer.concat(chunks).toString());expect(backup.game).toBe('orbital-courier');expect(backup.version).toBe(8);
        await a.page.evaluate(()=>window.testAccount('another'));
        await expect.poll(()=>a.page.evaluate(()=>Orbital.Cloud.sync.status)).toBe('account-change');
    }finally{await a.context.close();await b.context.close();}
});
