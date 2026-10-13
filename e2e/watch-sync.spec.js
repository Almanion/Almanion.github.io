'use strict';
const {test,expect}=require('@playwright/test');
const {PNG}=require('pngjs');
const jsQR=require('jsqr');
test.use({serviceWorkers:'block',hasTouch:true,isMobile:true});

const phoneStub=`
const testUser={uid:'phone-user',email:'phone@example.test',isAnonymous:false,getIdToken:async()=> 'phone-token'};
let counter=0;
async function bridge(method,path,value,query){const response=await fetch('/__watch-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,path,value,query})});const data=await response.json();return {val:()=>data};}
function testRef(path='',query){const timers=new Map();return {once:()=>bridge('GET',path,null,query),update:value=>bridge('PATCH',path,value),remove:()=>bridge('DELETE',path),orderByChild:field=>testRef(path,{field}),equalTo:value=>testRef(path,{...query,value}),on:(event,cb)=>{const poll=()=>bridge('GET',path,null,query).then(cb);poll();timers.set(cb,setInterval(poll,200));},off:(event,cb)=>{clearInterval(timers.get(cb));timers.delete(cb);}};}
window.AlmanionAccount={auth:{currentUser:testUser,onAuthStateChanged:cb=>cb(testUser)},database:{ref:path=>testRef(path)},openAccount:()=>{},openLogin:()=>{counter++;}};
`;

test('scannable watch QR, phone approval, two-way favorites, offline queue and phone revocation',async ({page,browser},info)=>{
    const server={};let version=0,watchOffline=false;
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'etag','Access-Control-Allow-Headers':'*'};
    function get(path,query){
        if(path==='.info/serverTimeOffset') return 0;
        if(server[path]!==undefined) return server[path];
        const values=Object.fromEntries(Object.entries(server).filter(([key])=>key.startsWith(path+'/')).map(([key,value])=>[key.slice(path.length+1),value]));
        if(query) return Object.fromEntries(Object.entries(values).filter(([,value])=>value[query.field]===query.value));
        return Object.keys(values).length ? values : null;
    }
    function update(path,value){
        if(value===null){delete server[path];return null;}
        if(value && typeof value==='object') for(const key of Object.keys(value)) if(value[key]?.['.sv']==='timestamp') value[key]=Date.now();
        server[path]=value;version++;return value;
    }
    async function route(request){
        const url=new URL(request.request().url()),method=request.request().method();
        const fulfill=value=>request.fulfill({json:value,headers:{...headers,etag:String(version)}});
        if(url.hostname==='www.gstatic.com') return request.fulfill({body:'',contentType:'application/javascript'});
        if(url.pathname.endsWith('/account.js')) return request.fulfill({body:phoneStub,contentType:'application/javascript'});
        if(url.pathname==='/__watch-test'){
            const body=request.request().postDataJSON();
            if(body.method==='GET') return fulfill(get(body.path,body.query));
            if(body.method==='DELETE') return fulfill(update(body.path,null));
            for(const [path,value] of Object.entries(body.value)) {
                const full=body.path ? body.path+'/'+path : path;
                if(full.endsWith('/consumedAt')) {const parent=full.slice(0,-11);server[parent].consumedAt=Date.now();}else update(full,value);
            }
            return fulfill(null);
        }
        if(url.hostname==='identitytoolkit.googleapis.com') return fulfill({localId:'watch-user',idToken:'watch-token',refreshToken:'watch-refresh',expiresIn:3600});
        if(url.hostname==='securetoken.googleapis.com') return fulfill({user_id:'watch-user',id_token:'watch-token',refresh_token:'watch-refresh',expires_in:3600});
        if(url.hostname.includes('firebasedatabase.app')){
            if(watchOffline && request.request().frame().page()===page) return request.abort();
            if(method==='OPTIONS') return request.fulfill({status:204,headers});
            const path=decodeURIComponent(url.pathname.slice(1).replace(/\.json$/,''));
            if(method==='PATCH' && path===''){
                for(const [key,value] of Object.entries(request.request().postDataJSON())){
                    if(key.endsWith('/consumedAt')) server[key.slice(0,-11)].consumedAt=Date.now();else update(key,value);
                }
                return fulfill(null);
            }
            if(method==='GET') return fulfill(get(path));
            if(method==='DELETE') return fulfill(update(path,null));
            if(method==='PUT') return fulfill(update(path,request.request().postDataJSON()));
        }
        return url.hostname==='127.0.0.1' ? request.continue() : request.abort();
    }
    await page.context().route('**/*',route);
    await page.setViewportSize({width:216,height:216});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const topic='temperatura-i-uravnenie-sostoyaniya',key='physics-10__b__thermostat-definition';
    server['bookmarks/phone-user/'+key]={blockKey:'thermostat-definition',title:'Термостат',type:'definition',updatedAt:Date.now(),timestamp:1};
    await page.goto('/watch/#pair');
    await page.getByRole('button',{name:'Подключить телефон',exact:true}).tap();
    await expect(page.locator('.watch-pair-qr svg')).toBeVisible();
    await expect.poll(()=>page.locator('.watch-pair-qr').evaluate(node=>{const r=node.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight;})).toBe(true);
    const image=PNG.sync.read(await page.locator('.watch-pair-qr').screenshot());
    const qr=jsQR(new Uint8ClampedArray(image.data),image.width,image.height);
    expect(qr).not.toBeNull();
    const destination=new URL(qr.data);expect(destination.pathname).toBe('/watch/connect.html');expect(destination.hash.length).toBe(17);
    expect(destination.href).not.toContain('watch-token');
    await page.screenshot({path:info.outputPath('watch-qr-216.png'),fullPage:true});
    const phoneContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),phone=await phoneContext.newPage();
    try {
        await phoneContext.route('**/*',route);
        await phone.goto(destination.href);
        await expect(phone.getByRole('button',{name:'Подключить к моему аккаунту',exact:true})).toBeVisible();
        await phone.locator('#watchName').fill('Samsung Watch 7');
        await phone.screenshot({path:info.outputPath('phone-approve.png'),fullPage:true});
        await phone.getByRole('button',{name:'Подключить к моему аккаунту',exact:true}).click();
        await expect(phone.locator('#phoneStatus')).toContainText('Часы подключены');
        await expect(page.locator('#watchSyncStatus')).toContainText('синхронизировано');
        await page.goto('/watch/#read/physics-10/'+topic+'/0');
        await expect(page.locator('[data-block-id="thermostat-definition"] button.watch-favorite')).toHaveAttribute('aria-pressed','true');
        await page.locator('[data-block-id="thermostat-definition"] button.watch-favorite').tap();
        await expect.poll(()=>server['bookmarks/phone-user/'+key]?.deleted).toBe(true);
        // Phone adds another block; a watch refresh receives it without re-pairing.
        server['bookmarks/phone-user/physics-10__b__thermos-remark']={blockKey:'thermos-remark',title:'Термос',updatedAt:Date.now()+500,type:'remark'};
        await page.goto('/watch/#pair');await page.getByRole('button',{name:'Синхронизировать',exact:true}).tap();
        await page.goto('/watch/#read/physics-10/'+topic+'/0');
        await expect(page.locator('[data-block-id="thermos-remark"] button.watch-favorite')).toHaveAttribute('aria-pressed','true');
        watchOffline=true;await page.context().setOffline(true);
        await page.locator('[data-block-id="thermostat-experiment"] button.watch-favorite').tap();
        await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('almanion_data_sync_pending_v1:bookmarks|watch:')) .length)).toBeGreaterThan(0);
        expect(server['bookmarks/phone-user/physics-10__b__thermostat-experiment']).toBeUndefined();
        watchOffline=false;await page.context().setOffline(false);
        await page.goto('/watch/#pair');await page.getByRole('button',{name:'Синхронизировать',exact:true}).tap();
        await expect.poll(()=>server['bookmarks/phone-user/physics-10__b__thermostat-experiment']?.blockKey).toBe('thermostat-experiment');
        await phone.getByRole('button',{name:'Отключить Samsung Watch 7',exact:true}).click();
        await expect(phone.locator('#phoneStatus')).toContainText('Доступ к синхронизации закрыт');
        await page.getByRole('button',{name:'Синхронизировать',exact:true}).tap();
        await expect(page.getByRole('button',{name:'Подключить телефон',exact:true})).toBeVisible();
        await expect(page.locator('#watchSyncStatus')).toContainText('отключил');
        expect(errors).toEqual([]);
        expect(await phone.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThan(2);
    }finally{await phoneContext.close();}
});

test('phone device page remains usable at 320px in light and dark themes',async ({page},info)=>{
    await page.route('**/*',route=>{
        const u=new URL(route.request().url());
        if(u.hostname==='www.gstatic.com') return route.fulfill({body:''});
        if(u.pathname.endsWith('/account.js')) return route.fulfill({body:phoneStub,contentType:'application/javascript'});
        if(u.pathname==='/__watch-test') return route.fulfill({json:null});
        return u.hostname==='127.0.0.1' ? route.continue():route.abort();
    });
    await page.setViewportSize({width:320,height:640});await page.goto('/watch/connect.html');
    await expect(page.locator('h1')).toHaveText('Подключённые часы');
    await page.locator('#watchCode').fill('123');await page.getByRole('button',{name:'Проверить',exact:true}).tap();
    await expect(page.locator('#phoneStatus')).toContainText('16 символов');
    for(const theme of ['prism-light','prism-dark']){
        await page.locator('html').evaluate((node,theme)=>node.dataset.exp=theme,theme);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThan(2);
        await page.screenshot({path:info.outputPath('phone-'+theme+'.png'),fullPage:true});
    }
});
