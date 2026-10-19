/* Account saves are optional; the portable game never needs a network. */
(function(root){
  'use strict';const O=root.Orbital,A=O.App,G=O.Progress,C=O.CloudCore;
  const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const supported=/^https?:$/.test(location.protocol)&&location.pathname.startsWith('/games/orbital-courier/');
  let sync=null,user=null,unsubscribe=null,timer=null,connecting=false,loadPromise=null,dialog=false,connectionId=0;
  let retryTimer=null,retryDelay=5000,connectionError='',authMode='login',authBusy=false,authError='',authNotice='',authEpoch=0;
  const labels={off:'На устройстве','signed-out':'Войти в аккаунт',connecting:'Подключение…',syncing:'Сохранение…',synced:'В облаке',pending:'Ожидает отправки',waiting:'Копия из облака',conflict:'Выбрать прогресс','account-change':'Другой аккаунт',error:'Сохранено на устройстве','local-error':'Ошибка записи'};
  function storage(){try{return root.localStorage;}catch{return null;}}
  function enabled(){try{return storage()?.getItem('orbital-cloud-enabled')==='1';}catch{return false;}}
  function validSave(text){
    const p=JSON.parse(text);
    if(p.game!=='orbital-courier'||p.version!==8)throw Error('Неподдерживаемая версия облачного прогресса.');
    if(!Number.isFinite(p.credits)||!Number.isFinite(p.xp)||!p.records||!p.upgrades)throw Error('Облачная копия повреждена.');
    return G.sanitize(p);
  }
  function sameSave(a,b){
    // The last opened contract is a device preference, never a competing result.
    try{a=JSON.parse(a);b=JSON.parse(b);delete a.lastLevel;delete b.lastLevel;return C.encode(a)===C.encode(b);}catch{return false;}
  }
  function retryLater(){
    if(retryTimer||!sync?.uid||navigator.onLine===false)return;
    retryTimer=setTimeout(()=>{retryTimer=null;if(sync?.status==='error')sync.sync(true);},retryDelay);
    retryDelay=Math.min(retryDelay*2,60000);
  }
  function changed(){
    if(sync?.status==='error')retryLater();
    if(['synced','signed-out'].includes(sync?.status)){clearTimeout(retryTimer);retryTimer=null;retryDelay=5000;}
    update();if(dialog&&$('modal').open&&$('cloudPanel'))render();
  }
  function make(transport){return new C.CloudSync({storage:storage(),transport,
    getSave:()=>C.encode(A.profile),validateSave:validSave,sameSave,
    isFresh:()=>G.completed(A.profile)===0&&Object.keys(A.profile.records).length===0&&A.profile.credits===25&&A.profile.xp===0&&A.profile.data===0&&G.installed(A.profile)===0&&Object.keys(A.profile.courses).length===0,
    canApply:()=>!A.state&&!A.transitioning&&!$('flightDrawer').open&&(!$('modal').open||!!$('cloudPanel')),
    applySave:text=>{
      const profile=validSave(text);
      if(!G.write(storage(),profile))throw Error('Не удалось сохранить копию на устройстве.');
      const reopen=$('modal').open&&!!$('cloudPanel');
      A.profile=profile;A.state=null;A.aims={};A.ghosts={};O.Review.clearView();A.go('home',true);A.updateProfileUI();
      if(reopen)open();
    },changed
  });}
  function update(){
    const status=!A.storageOK?'local-error':connecting?'connecting':connectionError?'error':sync?.status||'off';
    for(const button of document.querySelectorAll('[data-action="cloud"],[data-action="cloud-header"],[data-action="cloud-result"]')){
      const label=labels[status]||'На устройстве',text=button.querySelector('.cloud-label');
      if(text)text.textContent=label;else button.textContent=label;
      button.dataset.status=status;button.title='Прогресс и аккаунт · '+label;button.setAttribute('aria-label','Прогресс и аккаунт: '+label);
    }
  }
  async function connect(){
    if(connecting||unsubscribe)return;connecting=true;connectionError='';const id=++connectionId;update();if($('cloudPanel'))render();
    try{
      if(!supported)throw Error('Облачный прогресс доступен в игре на сайте Almanion.');
      if(!A.storageOK||!storage())throw Error('Разреши сохранение данных в браузере.');
      storage().setItem('orbital-cloud-enabled','1');
      if(!root.AlmanionOrbitalAccount){
        if(!loadPromise)loadPromise=new Promise((resolve,reject)=>{
          const s=document.createElement('script');let timeout;
          const fail=()=>{clearTimeout(timeout);s.remove();loadPromise=null;reject(Error('Нет связи с Almanion. Прогресс остаётся на устройстве.'));};
          s.src='/orbital-account.js?v=20261019-2';s.onload=()=>{clearTimeout(timeout);resolve();};s.onerror=fail;timeout=setTimeout(fail,15000);document.head.appendChild(s);
        });
        await loadPromise;
      }
      if(id!==connectionId)return;
      const stop=await root.AlmanionOrbitalAccount.connect((next,transport,error)=>{
        if(id!==connectionId)return;
        if(error){connectionError='Не удалось восстановить вход. Повтори подключение.';update();if($('cloudPanel'))render();return;}
        user=next;if(!sync)sync=make(transport);O.Navigation?.onCloudReady();sync.setUser(next?.uid||null);
      });
      if(id!==connectionId)stop();else unsubscribe=stop;
    }catch(e){if(id===connectionId){connectionError=e.message;A.toast(e.message,true);}}
    finally{if(id===connectionId){connecting=false;update();if(dialog&&$('cloudPanel'))render();}}
  }
  function summary(text,title){
    if(!text)return `<div class="cloud-copy"><h3>${title}</h3><p>Копии пока нет</p></div>`;
    try{const p=validSave(text);return `<div class="cloud-copy"><h3>${title}</h3><strong>${O.Campaign.count(p)} / ${O.Campaign.order.length} текущих контрактов</strong><p>${p.credits.toLocaleString('ru-RU')} ◈ · ${p.data} ⬡ · ${p.xp.toLocaleString('ru-RU')} XP</p><small>${G.installed(p)} ступеней оборудования</small></div>`;}catch{return `<p>${title}: копия не читается</p>`;}
  }
  function authMessage(error){
    const messages={'auth/invalid-credential':'Неверная почта или пароль.','auth/wrong-password':'Неверная почта или пароль.','auth/user-not-found':'Неверная почта или пароль.',
      'auth/invalid-email':'Проверь адрес почты.','auth/email-already-in-use':'Эта почта уже зарегистрирована. Выбери «Войти».','auth/weak-password':'Придумай пароль не короче 6 символов.',
      'auth/network-request-failed':'Нет связи с сервером входа. Проверь интернет и повтори.','auth/too-many-requests':'Слишком много попыток. Подожди немного и повтори.',
      'auth/popup-blocked':'Браузер заблокировал окно Google. Разреши всплывающие окна или войди по почте.','auth/popup-closed-by-user':'Окно Google закрыто. Можно повторить вход или использовать почту.',
      'auth/cancelled-popup-request':'Предыдущее окно входа закрыто. Повтори вход.',
      'auth/timeout':'Вход не завершился. Проверь окно Google и повтори попытку или войди по почте.',
      'auth/unauthorized-domain':'Вход с этого адреса недоступен. Открой игру на almanion.github.io.',
      'auth/operation-not-allowed':'Этот способ входа пока недоступен. Попробуй другой.',
      'auth/user-disabled':'Вход в этот аккаунт отключён.','auth/web-storage-unsupported':'Браузер запретил сохранение входа. Разреши данные сайта и повтори.'};
    return messages[error?.code]||'Не удалось завершить вход. Повтори попытку.';
  }
  function authForm(){
    const register=authMode==='register',reset=authMode==='reset';
    return `<section class="cloud-auth"><h3>${reset?'Восстановить пароль':register?'Создать аккаунт Almanion':'Войти в Almanion'}</h3><p>Один аккаунт для игры и сайта. Прогресс останется здесь во время входа.</p>
      ${!reset?'<button type="button" class="button quiet cloud-google" data-action="cloud-google">Войти через Google ↗</button><div class="cloud-auth-divider">или по почте</div>':''}
      <form id="cloudAuthForm"><label for="cloudEmail">Почта</label><input id="cloudEmail" name="email" type="email" autocomplete="email" inputmode="email" required maxlength="254">
      ${!reset?`<label for="cloudPassword">Пароль</label><input id="cloudPassword" name="password" type="password" autocomplete="${register?'new-password':'current-password'}" required ${register?'minlength="6"':''}>`:''}
      ${register?'<label for="cloudPasswordConfirm">Повтори пароль</label><input id="cloudPasswordConfirm" name="confirm" type="password" autocomplete="new-password" required minlength="6">':''}
      <p id="cloudAuthError" role="alert" class="cloud-auth-error" hidden></p><p id="cloudAuthNotice" role="status" hidden></p>
      <button class="button primary" type="submit">${reset?'Отправить ссылку':register?'Создать аккаунт':'Войти и сохранить прогресс'}</button></form>
      <div class="cloud-auth-links">${!reset?'<button class="text-button" data-action="cloud-auth-mode" data-mode="reset">Забыли пароль?</button>':''}<button class="text-button" data-action="cloud-auth-mode" data-mode="${authMode==='login'?'register':'login'}">${authMode==='login'?'Создать аккаунт':'Уже есть аккаунт — войти'}</button></div></section>`;
  }
  function authControls(){
    const signout=$('cloudPanel')?.querySelector('[data-action="cloud-signout"]');if(signout){signout.disabled=authBusy;signout.textContent=authBusy?'Выходим…':'Выйти из аккаунта';}
    const form=$('cloudAuthForm');if(!form)return;
    form.setAttribute('aria-busy',String(authBusy));
    for(const control of $('cloudPanel').querySelectorAll('.cloud-auth button,.cloud-auth input'))control.disabled=authBusy;
    const error=$('cloudAuthError'),notice=$('cloudAuthNotice');error.textContent=authError;error.hidden=!authError;notice.textContent=authNotice;notice.hidden=!authNotice;
  }
  function authenticate(action){
    if(authBusy)return;authBusy=true;authError='';authNotice='';const id=++authEpoch,mode=authMode;authControls();
    let request,timeout;try{request=action();}catch(error){request=Promise.reject(error);}
    Promise.race([Promise.resolve(request),new Promise((_,reject)=>{timeout=setTimeout(()=>reject({code:'auth/timeout'}),45000);})]).then(()=>{
      if(id===authEpoch&&mode==='reset')authNotice='Если аккаунт с этой почтой существует, письмо со ссылкой отправлено. Проверь также папку «Спам».';
    }).catch(error=>{if(id===authEpoch){authError=authMessage(error);if(!$('cloudAuthForm'))A.toast(authError,true);}}).finally(()=>{clearTimeout(timeout);if(id===authEpoch){authBusy=false;authControls();}});
  }
  function render(){
    const status=connecting?'connecting':connectionError?'error':sync?.status||'off',compare=['conflict','account-change','waiting'].includes(status);
    const messages={off:'Прогресс сохраняется в этом браузере. Подключи аккаунт Almanion, чтобы продолжать на другом устройстве.',
      'signed-out':'Войди здесь, чтобы продолжать с того же места на другом устройстве. Каждый пройденный контракт сохраняется автоматически.',
      connecting:'Проверяем аккаунт.',syncing:'Проверяем и сохраняем копию.',synced:'Прогресс этого аккаунта сохранён. На другом устройстве войди в тот же аккаунт и подключи облако.',
      pending:'Локальная копия обновлена. Отправим её при восстановлении связи.',waiting:'В облаке есть другая копия. Вернись к подготовке через «Ещё раз», чтобы загрузить её.',
      conflict:'На устройстве и в аккаунте разные версии. Выбери одну целиком: деньги и покупки не складываются. Перед заменой обе копии сохранятся в резерве.',
      'account-change':'Аккаунт изменился. Прогресс этого браузера не будет отправлен в другой аккаунт без твоего выбора.',
      error:'Облако пока недоступно. После восстановления связи автоматически повторим отправку прогресса. До этого он остаётся в этом браузере.'};
    const busy=sync?.busy||connecting,canApply=!A.state&&!A.transitioning;
    const login=!user&&unsubscribe&&root.AlmanionOrbitalAccount?.signIn&&!connectionError;
    $('cloudPanel').innerHTML=`<div class="cloud-local-status ${A.storageOK?'':'bad'}"><strong>${A.storageOK?'Автосохранение на устройстве включено':'Не удалось сохранить на устройстве'}</strong>${!login||!A.storageOK?`<span>${A.storageOK?'Результаты, награды и покупки сохраняются сразу.':'Разреши данные сайта или скачай прогресс через экспорт.'}</span>`:''}</div>${!login?`<p class="cloud-status" role="status">${esc(user?.email||user?.displayName||'Аккаунт Almanion')} · ${labels[status]}</p><p>${connectionError?esc(connectionError):messages[status]}</p>`:''}
      ${sync?.status==='synced'&&sync.remote?.updatedAt?`<p class="cloud-last-save">Облако обновлено в ${esc(new Date(sync.remote.updatedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'}))}. Следующий результат отправится автоматически.</p>`:''}
      ${root.AlmanionOrbitalAccount?.persistence&&root.AlmanionOrbitalAccount.persistence!=='local'?'<p>Браузер ограничил хранение входа. После закрытия вкладки или браузера может понадобиться войти снова.</p>':''}
      ${login?authForm():''}
      ${compare?`<div class="cloud-copies">${summary(C.encode(A.profile),'На устройстве')}${summary(sync.remote?.save,'В аккаунте')}</div><div class="settings-grid"><button class="button primary" data-action="cloud-local" ${busy||!canApply?'disabled':''}>Использовать местную</button><button class="button quiet" data-action="cloud-remote" ${busy||!canApply||!sync.remote?'disabled':''}>Загрузить из аккаунта</button></div>${!canApply?'<p>Сначала заверши рейс и нажми «Ещё раз». Копия не заменяется во время полёта или его разбора.</p>':''}`:''}
      ${login?'<details class="cloud-tools"><summary>Сохранения и резервные копии</summary>':''}<div class="settings-grid">${!unsubscribe||connectionError?`<button class="button primary" data-action="${connectionError?'cloud-reconnect':'cloud-connect'}" ${connecting||!supported?'disabled':''}>${connectionError?'Повторить подключение':'Войти и включить облако'}</button>`:''}${user&&!compare?`<button class="button quiet" data-action="cloud-retry" ${busy?'disabled':''}>Проверить сейчас</button>`:''}<button class="button quiet" data-action="export">Экспорт прогресса</button><button class="button quiet" data-action="cloud-backup">Резервные копии ↓</button></div>
      ${user&&root.AlmanionOrbitalAccount?.signOut?'<button class="text-button" data-action="cloud-signout">Выйти из аккаунта</button>':''}${enabled()?'<button class="text-button" data-action="cloud-disconnect">Отключить облако на этом устройстве</button>':''}${login?'</details>':''}${!supported?'<p>Переносимый файл работает офлайн. Для аккаунта открой игру на almanion.github.io.</p>':''}`;
    authControls();
  }
  function open(){dialog=true;A.openModal('Прогресс и аккаунт','<div id="cloudPanel"></div><div class="modal-actions"><button class="button primary" data-action="close">Готово</button></div>');render();}
  function schedule(event){
    clearTimeout(timer);update();if(!sync?.uid)return;
    if(sync.status==='error'){retryLater();return;}
    if(['conflict','account-change','waiting'].includes(sync.status))return;
    if(sync.same(C.encode(A.profile),sync.base))return;
    if(!sync.busy)sync.notify('pending');
    if(event?.detail?.reason==='contract')sync.sync();else timer=setTimeout(()=>sync.sync(),500);
  }
  Object.assign(A.actions,{
    cloud:open,'cloud-header':open,'cloud-result':open,'cloud-connect':connect,'cloud-retry':()=>sync?.sync(true),
    'cloud-reconnect':()=>{A.actions['cloud-disconnect']();connect();},
    'cloud-auth-mode':button=>{if(authBusy)return;const email=$('cloudEmail')?.value||'';authMode=button.dataset.mode;authError='';authNotice='';render();$('cloudEmail').value=email;$('cloudEmail').focus();},
    'cloud-google':()=>authenticate(()=>root.AlmanionOrbitalAccount.signInGoogle()),
    'cloud-signout':()=>authenticate(()=>root.AlmanionOrbitalAccount.signOut()),
    'cloud-local':()=>sync?.resolve('local'),'cloud-remote':()=>sync?.resolve('cloud'),
    'cloud-disconnect':()=>{connectionId++;authEpoch++;authBusy=false;connecting=false;connectionError='';clearTimeout(timer);clearTimeout(retryTimer);retryTimer=null;retryDelay=5000;unsubscribe?.();unsubscribe=null;sync?.setUser(null);sync=null;user=null;storage()?.removeItem('orbital-cloud-enabled');update();render();},
    'cloud-backup':()=>{
      const data=storage()?.getItem('orbital-cloud-backups');if(!data)return A.toast('Резервных копий после синхронизации пока нет.');
      const copies=JSON.parse(data);
      A.openModal('Резервные копии',`<p>Скачай нужный JSON. Его можно восстановить через Настройки → Прогресс → Импорт.</p>${copies.map((copy,index)=>`<div class="cloud-copy"><h3>${esc(new Date(copy.at).toLocaleString('ru-RU'))}</h3><div class="settings-grid"><button class="button quiet" data-action="cloud-backup-copy" data-index="${index}" data-copy="local">На устройстве ↓</button>${copy.cloud?`<button class="button quiet" data-action="cloud-backup-copy" data-index="${index}" data-copy="cloud">Из аккаунта ↓</button>`:''}</div></div>`).reverse().join('')}<div class="modal-actions"><button class="button primary" data-action="cloud">Назад</button></div>`);
    },
    'cloud-backup-copy':button=>{
      const copies=JSON.parse(storage()?.getItem('orbital-cloud-backups')||'[]'),copy=copies[+button.dataset.index],data=copy?.[button.dataset.copy];
      if(!data)return A.toast('Копия недоступна.');
      const url=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`orbital-backup-${copy.at}-${button.dataset.copy}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  });
  document.addEventListener('submit',event=>{
    if(event.target.id!=='cloudAuthForm')return;event.preventDefault();if(authBusy)return;
    const email=$('cloudEmail').value.trim(),password=$('cloudPassword')?.value,account=root.AlmanionOrbitalAccount;
    if(authMode==='register'&&password!==$('cloudPasswordConfirm').value){authError='Пароли не совпадают.';authControls();$('cloudPasswordConfirm').focus();return;}
    authenticate(()=>authMode==='reset'?account.resetPassword(email):authMode==='register'?account.register(email,password):account.signIn(email,password));
  });
  root.addEventListener('orbital-save',schedule);
  root.addEventListener('orbital-save-error',update);
  root.addEventListener('online',()=>{clearTimeout(retryTimer);retryTimer=null;sync?.sync(true);});root.addEventListener('focus',()=>{if(sync?.status==='error')retryLater();else sync?.sync();});
  // While open on two devices, check for new revisions without writing unchanged saves.
  setInterval(()=>{if(!document.hidden)sync?.sync();},30000);
  O.Cloud={open,connect,refresh:update,get sync(){return sync;}};
  update();if(enabled()&&supported)connect();
})(window);
