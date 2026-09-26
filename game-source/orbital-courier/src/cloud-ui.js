/* Account saves are optional; the portable game never needs a network. */
(function(root){
  'use strict';const O=root.Orbital,A=O.App,G=O.Progress,C=O.CloudCore;
  const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const supported=/^https?:$/.test(location.protocol)&&location.pathname.startsWith('/games/orbital-courier/');
  let sync=null,user=null,unsubscribe=null,timer=null,connecting=false,loadPromise=null,dialog=false,connectionId=0;
  const labels={off:'На устройстве','signed-out':'Войти в аккаунт',connecting:'Подключение…',syncing:'Сохранение…',synced:'В облаке',pending:'Ожидает отправки',waiting:'Копия из облака',conflict:'Выбрать прогресс','account-change':'Другой аккаунт',error:'Сохранено здесь'};
  function storage(){try{return root.localStorage;}catch{return null;}}
  function enabled(){try{return storage()?.getItem('orbital-cloud-enabled')==='1';}catch{return false;}}
  function validSave(text){
    const p=JSON.parse(text);
    if(p.game!=='orbital-courier'||p.version!==8)throw Error('Неподдерживаемая версия облачного прогресса.');
    if(!Number.isFinite(p.credits)||!Number.isFinite(p.xp)||!p.records||!p.upgrades)throw Error('Облачная копия повреждена.');
    return G.sanitize(p);
  }
  function make(transport){return new C.CloudSync({storage:storage(),transport,
    getSave:()=>C.encode(A.profile),validateSave:validSave,
    isFresh:()=>G.completed(A.profile)===0&&Object.keys(A.profile.records).length===0&&A.profile.credits===25&&A.profile.xp===0&&A.profile.data===0&&G.installed(A.profile)===0&&Object.keys(A.profile.courses).length===0,
    canApply:()=>!A.state&&!A.transitioning&&!$('flightDrawer').open&&(!$('modal').open||!!$('cloudPanel')),
    applySave:text=>{
      const profile=validSave(text);
      if(!G.write(storage(),profile))throw Error('Не удалось сохранить копию на устройстве.');
      const reopen=$('modal').open&&!!$('cloudPanel');
      A.profile=profile;A.state=null;A.aims={};A.ghosts={};O.Review.clearView();A.go('home',true);A.updateProfileUI();
      if(reopen)open();
    },changed:()=>{update();if(dialog&&$('modal').open&&$('cloudPanel'))render();}
  });}
  function update(){
    const status=sync?.status||'off';
    for(const button of document.querySelectorAll('[data-action="cloud"]')){
      button.textContent=labels[status]||'На устройстве';button.dataset.status=status;
    }
  }
  async function connect(){
    if(connecting||unsubscribe)return;connecting=true;const id=++connectionId;
    try{
      if(!supported)throw Error('Облачный прогресс доступен в игре на сайте Almanion.');
      if(!A.storageOK||!storage())throw Error('Разреши сохранение данных в браузере.');
      storage().setItem('orbital-cloud-enabled','1');
      if(!root.AlmanionOrbitalAccount){
        if(!loadPromise)loadPromise=new Promise((resolve,reject)=>{
          const s=document.createElement('script');s.src='/orbital-account.js?v=20260925-1';s.onload=resolve;
          s.onerror=()=>{s.remove();loadPromise=null;reject(Error('Нет связи с Almanion. Игра продолжает сохраняться здесь.'));};document.head.appendChild(s);
        });
        await loadPromise;
      }
      if(id!==connectionId)return;
      const stop=await root.AlmanionOrbitalAccount.connect((next,transport)=>{
        if(id!==connectionId)return;
        user=next;if(!sync)sync=make(transport);sync.setUser(next?.uid||null);
      });
      if(id!==connectionId)stop();else unsubscribe=stop;
    }catch(e){if(id===connectionId){A.toast(e.message,true);if(sync){sync.error=e;sync.notify('error');}}}
    finally{if(id===connectionId){connecting=false;update();if(dialog&&$('cloudPanel'))render();}}
  }
  function summary(text,title){
    if(!text)return `<div class="cloud-copy"><h3>${title}</h3><p>Копии пока нет</p></div>`;
    try{const p=validSave(text);return `<div class="cloud-copy"><h3>${title}</h3><strong>${G.completed(p)} / 80 контрактов</strong><p>${p.credits.toLocaleString('ru-RU')} ◈ · ${p.data} ⬡ · ${p.xp.toLocaleString('ru-RU')} XP</p><small>${G.installed(p)} ступеней оборудования</small></div>`;}catch{return `<p>${title}: копия не читается</p>`;}
  }
  function render(){
    const status=sync?.status||'off',compare=['conflict','account-change','waiting'].includes(status);
    const messages={off:'Прогресс сохраняется в этом браузере. Подключи аккаунт Almanion, чтобы продолжать на другом устройстве.',
      'signed-out':'Войди в свой аккаунт на главной странице Almanion и вернись сюда. Оба устройства должны использовать один аккаунт.',
      connecting:'Проверяем аккаунт.',syncing:'Проверяем и сохраняем копию.',synced:'Прогресс этого аккаунта сохранён. На другом устройстве войди в тот же аккаунт и подключи облако.',
      pending:'Локальная копия обновлена. Отправим её при восстановлении связи.',waiting:'В облаке есть другая копия. Вернись к подготовке через «Ещё раз», чтобы загрузить её.',
      conflict:'На устройстве и в аккаунте разные версии. Выбери одну целиком: деньги и покупки не складываются. Перед заменой обе копии сохранятся в резерве.',
      'account-change':'Аккаунт изменился. Прогресс этого браузера не будет отправлен в другой аккаунт без твоего выбора.',
      error:'Облачное сохранение недоступно. Локальный прогресс сохранён. Проверь соединение и доступ к базе, затем повтори.'};
    const busy=sync?.busy||connecting,canApply=!A.state&&!A.transitioning;
    $('cloudPanel').innerHTML=`<p class="cloud-status" role="status">${esc(user?.email||user?.displayName||'Аккаунт Almanion')} · ${labels[status]}</p><p>${messages[status]}</p>
      ${compare?`<div class="cloud-copies">${summary(C.encode(A.profile),'На устройстве')}${summary(sync.remote?.save,'В аккаунте')}</div><div class="settings-grid"><button class="button primary" data-action="cloud-local" ${busy||!canApply?'disabled':''}>Использовать местную</button><button class="button quiet" data-action="cloud-remote" ${busy||!canApply||!sync.remote?'disabled':''}>Загрузить из аккаунта</button></div>${!canApply?'<p>Сначала заверши рейс и нажми «Ещё раз». Копия не заменяется во время полёта или его разбора.</p>':''}`:''}
      <div class="settings-grid">${!unsubscribe?`<button class="button primary" data-action="cloud-connect" ${connecting||!supported?'disabled':''}>Подключить аккаунт</button>`:''}${!user&&supported?'<a class="button quiet" href="/" target="_blank" rel="noopener">Войти на сайте ↗</a>':''}${user&&!compare?`<button class="button quiet" data-action="cloud-retry" ${busy?'disabled':''}>Проверить сейчас</button>`:''}<button class="button quiet" data-action="export">Экспорт прогресса</button><button class="button quiet" data-action="cloud-backup">Резервные копии ↓</button></div>
      ${enabled()?'<button class="text-button" data-action="cloud-disconnect">Отключить облако на этом устройстве</button>':''}${!supported?'<p>Переносимый файл работает офлайн. Для аккаунта открой игру на almanion.github.io.</p>':''}`;
  }
  function open(){dialog=true;A.openModal('Прогресс и аккаунт','<div id="cloudPanel"></div><div class="modal-actions"><button class="button primary" data-action="close">Готово</button></div>');render();}
  function schedule(){clearTimeout(timer);if(sync?.uid)timer=setTimeout(()=>sync.sync(),1000);}
  Object.assign(A.actions,{
    cloud:open,'cloud-connect':connect,'cloud-retry':()=>sync?.sync(true),
    'cloud-local':()=>sync?.resolve('local'),'cloud-remote':()=>sync?.resolve('cloud'),
    'cloud-disconnect':()=>{connectionId++;connecting=false;unsubscribe?.();unsubscribe=null;sync?.setUser(null);sync=null;user=null;storage()?.removeItem('orbital-cloud-enabled');update();render();},
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
  root.addEventListener('orbital-save',schedule);
  root.addEventListener('online',()=>sync?.sync(true));root.addEventListener('focus',()=>sync?.sync());
  // While open on two devices, check for new revisions without writing unchanged saves.
  setInterval(()=>{if(!document.hidden)sync?.sync();},30000);
  O.Cloud={open,connect,get sync(){return sync;}};
  update();if(enabled()&&supported)connect();
})(window);
