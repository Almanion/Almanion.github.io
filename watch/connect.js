(function () {
    'use strict';
    const theme=window.AlmanionThemeBootstrap?.settings;
    if(theme?.experimental!==false){document.body.classList.add('experimental',theme?.expMode==='graphite' ? 'exp-graphite' : 'exp-prism');document.body.classList.toggle('exp-dark',!!theme?.expDark);}
    const account=window.AlmanionAccount,api=window.AlmanionWatchSync;
    const status=document.getElementById('phoneStatus'),input=document.getElementById('watchCode'),approve=document.getElementById('approveWatch'),list=document.getElementById('watchDeviceList'),accountButton=document.getElementById('phoneAccount');
    let user,request,code='',query,handler,generation=0;
    function text(value) { status.textContent=value; }
    function current() { return account?.auth.currentUser; }
    function signedIn() { const value=current();return value && !value.isAnonymous; }
    async function write(path,method,value,uid) {
        const controller=new AbortController();let timer;
        try {
            return await Promise.race([(async()=>{
                const identity=current();if(!identity || identity.isAnonymous || identity.uid!==uid) throw new Error('Account changed');
                const token=await identity.getIdToken();if(current()?.uid!==uid) throw new Error('Account changed');
                const url=new URL(path+'.json',firebaseConfig.databaseURL);
                // Root PATCH is one atomic approval; never queue an offline grant.
                url.searchParams.set('auth',token);
                const response=await fetch(url.href,{method,headers:{'Content-Type':'application/json'},body:value===undefined ? undefined : JSON.stringify(value),signal:controller.signal,cache:'no-store',referrerPolicy:'no-referrer'});
                if(!response.ok) throw new Error('Not confirmed');
            })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Network timeout'));},10000);})]);
        }finally{clearTimeout(timer);}
    }
    function detach() { if(query && handler) query.off('value',handler);query=null;handler=null; }
    function node(tag,value) { const element=document.createElement(tag);if(value!==undefined) element.textContent=value;return element; }
    accountButton.addEventListener('click',()=>{if(signedIn()) account.openAccount();else account?.openLogin();});
    async function check() {
        const token=++generation;request=null;approve.hidden=true;
        code=api.normalizeCode(input.value);
        if(!signedIn()){text('Войди в аккаунт, чтобы подтвердить подключение.');account?.openLogin();return;}
        if(!api.validCode(code)){text('Введи все 16 символов кода с часов.');return;}
        text('Проверяем код…');
        let timer;
        try {
            const [snapshot,offset]=await Promise.race([Promise.all([account.database.ref('watchPairRequests/'+code).once('value'),account.database.ref('.info/serverTimeOffset').once('value')]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Check timeout')),10000);})]);
            if(token!==generation) return;
            const value=snapshot.val();
            if(!value || value.consumedAt || value.createdAt+api.TTL <= Date.now()+(Number(offset.val()) || 0)){text('Код истёк или уже использован. Создай новый на часах.');return;}
            request=value;document.getElementById('watchName').value=value.name || 'Часы';approve.hidden=false;
            text('Подтверди подключение к '+(user.email || user.displayName || 'твоему аккаунту')+'.');
        }catch(_){if(token===generation) text('Код истёк, использован или недоступен. Проверь код и подключение к сети.');}
        finally{clearTimeout(timer);}
    }
    document.getElementById('watchCodeForm').addEventListener('submit',event=>{event.preventDefault();check();});
    input.addEventListener('input',()=>{generation++;request=null;approve.hidden=true;});
    approve.addEventListener('submit',async event=>{
        event.preventDefault();if(!request || !signedIn()) return;
        const token=generation,uid=current().uid,value=request,key=code,button=document.getElementById('approveWatchButton');button.disabled=true;
        try {
            const updates={};
            updates['watchDevices/'+value.deviceUid]={ownerUid:uid,requestId:key,createdAt:api.stamp(),name:document.getElementById('watchName').value.trim().slice(0,60) || 'Часы'};
            updates['watchPairRequests/'+key+'/consumedAt']=api.stamp();
            await write('','PATCH',updates,uid);
            if(token===generation && current()?.uid===uid){request=null;approve.hidden=true;input.value='';history.replaceState(null,'',location.pathname);text('Часы подключены. Избранное обновится автоматически.');}
        }catch(_){if(token===generation) text('Не удалось подключить. Возможно, код истёк или часы уже подключены. Создай новый код.');}
        finally{button.disabled=false;}
    });
    function attach(value) {
        generation++;detach();user=value && !value.isAnonymous ? value : null;request=null;approve.hidden=true;list.replaceChildren();
        accountButton.textContent=user ? 'Аккаунт' : 'Войти';
        if(!user){list.append(node('p','Нет подключённых часов'));text('Войди в аккаунт, чтобы подключить часы.');return;}
        const uid=user.uid;query=account.database.ref('watchDevices').orderByChild('ownerUid').equalTo(uid);
        handler=snapshot=>{
            if(current()?.uid!==uid) return;list.replaceChildren();
            const devices=snapshot.val() || {};
            if(!Object.keys(devices).length) list.append(node('p','Нет подключённых часов'));
            for(const [id,device] of Object.entries(devices)) {
                const row=node('div');row.className='watch-device';const title=node('div');title.append(node('strong',device.name || 'Часы'));
                title.append(node('p','Подключены '+new Intl.DateTimeFormat('ru',{day:'numeric',month:'short'}).format(new Date(device.createdAt))));
                const remove=node('button','Отключить');remove.type='button';remove.setAttribute('aria-label','Отключить '+(device.name || 'часы'));
                remove.addEventListener('click',async()=>{if(current()?.uid!==uid) return;remove.disabled=true;try{await write('watchDevices/'+id,'DELETE',undefined,uid);if(current()?.uid===uid) text('Часы отключены. Доступ к синхронизации закрыт.');}catch(_){text('Не удалось отключить. Проверь сеть и повтори.');remove.disabled=false;}});
                row.append(title,remove);list.append(row);
            }
        };
        query.on('value',handler,()=>{if(current()?.uid===uid){list.replaceChildren(node('p','Не удалось загрузить устройства'));text('Проверь подключение и правила Firebase.');}});
        if(input.value) check();else text('Открой «Телефон» на часах и отсканируй QR-код или введи код здесь.');
    }
    try{input.value=api.normalizeCode(decodeURIComponent(location.hash.slice(1)));}catch(_){}
    if(account) account.auth.onAuthStateChanged(attach);else text('Вход не загрузился. Обнови страницу.');
    window.addEventListener('pagehide',detach);
    window.addEventListener('pageshow',event=>{if(event.persisted && account) attach(current());});
})();
