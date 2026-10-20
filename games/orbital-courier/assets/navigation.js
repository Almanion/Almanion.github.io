/* Real online documents share the canonical game shell. The portable HTML keeps
   its local screens. Navigation context is per-tab UI state, never a save copy. */
(function(root){
  'use strict';
  const O=root.Orbital=root.Orbital||{},doc=root.document;
  const paths=Object.freeze({home:'',campaign:'contracts/',hangar:'hangar/',awards:'awards/',play:'flight/'});
  const online=doc.body.dataset.gameNavigation==='pages'&&/^https?:$/.test(root.location.protocol);
  const entry=Object.hasOwn(paths,doc.body.dataset.gameEntry)?doc.body.dataset.gameEntry:'home';
  const base=new URL(doc.body.dataset.gameBase||'./',root.location.href);
  const contextKey='orbital-courier-navigation-v1';
  let applying=false,observer,knownSave=null,localConflict=null,cloudPause=null;
  let localStorage=null;try{localStorage=root.localStorage;knownSave=localStorage.getItem(O.Progress.SAVE_KEY);}catch{}
  const app=()=>O.App;
  const validId=id=>Number.isInteger(id)&&id>=0&&id<O.LEVELS.length;
  const available=id=>validId(id)&&O.Progress.unlocked(app().profile,id);
  function url(page,id){
    const target=new URL(paths[page]??paths.home,base);
    if(page==='play'&&validId(id))target.searchParams.set('contract',String(id));
    return target.pathname+target.search;
  }
  function recent(){
    const A=app();return available(A.currentId)?A.currentId:available(A.profile.lastLevel)?A.profile.lastLevel:O.Progress.nextLevel(A.profile);
  }
  function readContext(){try{return JSON.parse(root.sessionStorage.getItem(contextKey)||'null')||{};}catch{return {};}}
  function remember(){
    if(!online||!app())return;
    const A=app();
    try{root.sessionStorage.setItem(contextKey,JSON.stringify({version:1,aims:A.aims,currentId:A.currentId,camera:A.camera,branch:A.branchView,timeScale:A.timeScale,campaignSector:A.campaignSector,campaignQuery:A.campaignQuery,campaignFilter:A.campaignFilter}));}catch{/* Navigation also works when temporary storage is unavailable. */}
  }
  function restoreContext(){
    const A=app(),saved=readContext();
    A.currentId=available(A.profile.lastLevel)?A.profile.lastLevel:O.Progress.nextLevel(A.profile);
    if(saved.version!==1)return saved;
    for(const [key,value]of Object.entries(saved.aims||{})){
      if(/^\d+$/.test(key)&&validId(+key)&&value&&Number.isFinite(value.angle)&&Number.isFinite(value.speed))A.aims[key]={angle:O.Physics.clamp(value.angle,-180,180),speed:Math.round(O.Physics.clamp(value.speed,60,O.Progress.stats(A.profile).maxSpeed))};
    }
    A.currentId=available(saved.currentId)?saved.currentId:available(A.profile.lastLevel)?A.profile.lastLevel:O.Progress.nextLevel(A.profile);
    if([.5,1,2,4,10,50].includes(saved.timeScale))A.timeScale=saved.timeScale;
    if(Number.isInteger(saved.campaignSector)&&saved.campaignSector>=-1&&saved.campaignSector<O.SECTORS.length)A.campaignSector=saved.campaignSector;
    if(typeof saved.campaignQuery==='string')A.campaignQuery=saved.campaignQuery.slice(0,120);
    if(['all','open','unfinished','new'].includes(saved.campaignFilter))A.campaignFilter=saved.campaignFilter;
    return saved;
  }
  function persisted(){return localStorage?.getItem(O.Progress.SAVE_KEY)??null;}
  function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value;}
  function decode(text){
    if(text===null)return O.Progress.fresh();
    const profile=JSON.parse(text);
    if(profile?.game!=='orbital-courier'||profile.version!==8||!Number.isFinite(profile.credits)||!Number.isFinite(profile.xp)||!profile.records||!profile.upgrades)throw Error('Копия другой вкладки не читается.');
    return O.Progress.sanitize(profile);
  }
  function signature(profile,ignoreLast=false){const copy={...O.Progress.sanitize(profile)};if(ignoreLast)delete copy.lastLevel;return JSON.stringify(canonical(copy));}
  function same(profile,text,ignoreLast=false){try{return signature(profile,ignoreLast)===signature(decode(text),ignoreLast);}catch{return false;}}
  function pauseCloud(){
    const sync=O.Cloud?.sync;if(!sync||cloudPause)return;
    cloudPause={sync,uid:sync.uid,setUser:sync.setUser,syncMethod:sync.sync,resolve:sync.resolve};
    sync.setUser(null); // Invalidate pending transport writes through the existing epoch check.
    sync.setUser=uid=>{cloudPause.uid=uid;return cloudPause.setUser.call(sync,null);};
    sync.sync=sync.resolve=async()=>{};
  }
  function resumeCloud(){
    if(!cloudPause)return;const saved=cloudPause;cloudPause=null;
    Object.assign(saved.sync,{setUser:saved.setUser,sync:saved.syncMethod,resolve:saved.resolve});
    saved.sync.setUser(saved.uid);
  }
  function backupConflict(){
    if(!localConflict)return false;
    try{
      const key='orbital-courier-tab-backups',old=JSON.parse(localStorage.getItem(key)||'[]');
      old.push({at:Date.now(),local:localConflict.local,other:localConflict.incoming});
      localStorage.setItem(key,JSON.stringify(old.slice(-3)));return true;
    }catch{return false;}
  }
  function describeCopy(text){try{const p=decode(text);return `${O.Campaign.count(p)} контрактов · ${p.credits} ◈ · ${p.xp} XP`;}catch{return 'Повреждённая копия — сохрани её отдельно для восстановления.';}}
  function showConflict(){
    if(!localConflict||!app()?.openModal)return;
    app().openModal('Прогресс изменился в другой вкладке',`<p>Выбери одну копию целиком. Деньги, покупки и результаты не объединяются. Обе копии сохраняются в резерве.</p><div class="info-box"><strong>Эта вкладка</strong><p>${describeCopy(localConflict.local)}</p><button class="button quiet" data-action="pages:backup-this">Скачать эту копию ↓</button></div><div class="info-box"><strong>Сохранено другой вкладкой</strong><p>${describeCopy(localConflict.incoming)}</p><button class="button quiet" data-action="pages:backup-other">Скачать другую копию ↓</button></div><p>Загрузка другой копии завершит текущую попытку. При выборе этой вкладки изменения другой копии останутся только в резерве.</p><div class="modal-actions"><button class="button quiet" data-action="pages:use-this">Оставить эту вкладку</button><button class="button primary" data-action="pages:use-other">Загрузить другую копию</button></div>`);
  }
  function conflict(incoming){
    const A=app();if(!A)return;
    if(localConflict){setIncoming(incoming);showConflict();return;}
    localConflict={local:JSON.stringify(A.profile),incoming,wasPaused:A.paused,downloaded:new Map()};
    A.paused=true;A.accumulator=0;A.sound?.silence();doc.body.dataset.localSaveConflict='true';pauseCloud();backupConflict();showConflict();
  }
  function setIncoming(incoming){
    if(localConflict.incoming!==incoming){localConflict.incoming=incoming;localConflict.downloaded.delete('other');}
  }
  function refreshPage(){
    const A=app();applying=true;
    try{
      A.updateProfileUI();
      if(A.screen==='play'){
        if(!available(A.currentId)){root.location.replace(url('campaign'));return;}
        const camera={...A.camera};A.loadLevel(A.currentId);A.camera=camera;O.UI9?.clampCamera();O.UI9?.sync();
      }else A.go(A.screen,true);
    }finally{applying=false;decorate();}
  }
  function reconcile(){
    if(!online||!app()||!localStorage)return;
    let current;try{current=persisted();}catch{return;}
    if(current===knownSave)return;
    const A=app();
    if(same(A.profile,current)){knownSave=current;return;}
    // Visiting another contract changes lastLevel alone; that preference must
    // never interrupt a flight or be mistaken for a currency/purchase conflict.
    if(same(A.profile,current,true)){A.profile.lastLevel=decode(current).lastLevel;knownSave=current;return;}
    const idle=!A.state&&!A.transitioning&&!doc.getElementById('modal')?.open&&!doc.getElementById('flightDrawer')?.open;
    if(!localConflict&&idle&&same(A.profile,knownSave)){
      try{A.profile=decode(current);knownSave=current;A.storageOK=true;refreshPage();return;}catch{}
    }
    conflict(current);
  }
  function downloadConflict(which){
    if(!localConflict)return;
    const text=which==='this'?localConflict.local:localConflict.incoming;
    const blob=URL.createObjectURL(new Blob([text??JSON.stringify(O.Progress.fresh())],{type:'application/json'})),link=doc.createElement('a');
    link.href=blob;link.download=`orbital-${which}-tab-${Date.now()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(blob),1000);localConflict.downloaded.set(which,text);
  }
  function resolveConflict(choice){
    if(!localConflict)return;
    const current=persisted();if(current!==localConflict.incoming){setIncoming(current);showConflict();return;}
    const A=app(),saved=localConflict;
    let profile;if(choice==='other'){try{profile=decode(current);}catch(error){A.toast(error.message,true);return;}}
    const exported=saved.downloaded.get('this')===saved.local&&saved.downloaded.get('other')===saved.incoming;
    if(!backupConflict()&&!exported){A.toast('Не удалось записать резерв. Скачай обе актуальные копии перед выбором.',true);return;}
    knownSave=current;localConflict=null;delete doc.body.dataset.localSaveConflict;
    if(choice==='other'){
      A.state=null;A.lastResult=null;A.paused=false;A.accumulator=0;O.Review?.clearView();A.profile=profile;A.storageOK=true;A.closeModal();refreshPage();
    }else{
      A.save();
      if(!A.storageOK){localConflict=saved;doc.body.dataset.localSaveConflict='true';showConflict();return;}
      A.closeModal();A.paused=saved.wasPaused;A.accumulator=0;O.UI9?.sync();
    }
    resumeCloud();
  }
  function canLeaveWithoutWrite(){
    const profile=app().profile;
    if(signature(profile,true)===signature(O.Progress.fresh(),true))return true;
    try{return same(profile,persisted(),true);}catch{return false;}
  }
  function showSaveFailure(){
    app().openModal('Не удалось сохранить прогресс','<p>Новые результаты и покупки пока остаются только в этой вкладке. Переход остановлен, чтобы их не потерять.</p><p>Скачай JSON-копию или повтори сохранение, когда в браузере снова будет доступно место.</p><div class="modal-actions"><button class="button quiet" data-action="pages:export">Скачать прогресс ↓</button><button class="button primary" data-action="pages:retry-save">Повторить сохранение</button><button class="button quiet" data-action="close">Остаться</button></div>');
  }
  function retrySave(){
    app().save();if(localConflict)return;
    if(app().storageOK||canLeaveWithoutWrite()){app().closeModal();app().toast('Прогресс сохранён. Можно продолжать.');}else showSaveFailure();
  }
  function saveBeforeNavigation(){
    reconcile();if(localConflict)return false;remember();app()?.save();if(localConflict)return false;
    if(app().storageOK||canLeaveWithoutWrite())return true;
    showSaveFailure();return false;
  }
  function navigate(page,id,replace=false){
    const target=url(page,id);
    if(new URL(target,root.location.href).href===root.location.href)return false;
    if(saveBeforeNavigation())root.location[replace?'replace':'assign'](target);return true;
  }
  function beforeGo(page){return online&&!applying&&page!==entry?navigate(page,page==='play'?recent():undefined):false;}
  function beforeTravel(id){return online&&!applying&&(entry!=='play'||new URL(root.location.href).searchParams.get('contract')!==String(id))?navigate('play',id):false;}
  function beforeLevel(id){return online&&!applying&&entry!=='play'?navigate('play',id):false;}
  function onLevel(id){
    if(!online||entry!=='play')return;
    const target=url('play',id);if(root.location.pathname+root.location.search!==target)root.history.replaceState(null,'',target);
    doc.title=O.LEVELS[id].name+' — Орбитальный курьер';remember();decorate();
  }
  function hrefFor(node){
    const A=app();if(!A)return null;
    const action=node.dataset.action;
    if(action==='nav'||action==='force-nav')return Object.hasOwn(paths,node.dataset.page)?url(node.dataset.page,node.dataset.page==='play'?recent():undefined):null;
    if(action==='mission'||action==='confirm-travel')return available(+node.dataset.id)?url('play',+node.dataset.id):null;
    if(action==='return-flight')return url('play',recent());
    if(action==='continue')return O.Campaign.count(A.profile)===O.Campaign.order.length?url('campaign'):url('play',O.Progress.nextLevel(A.profile));
    if(['next','previous-level','following-level'].includes(action)){
      const id=O.Campaign.adjacent(A.currentId,action==='previous-level'?-1:1);
      return available(id)?url('play',id):action==='next'?url('campaign'):null;
    }
    return null;
  }
  function decorate(){
    if(!online||!app())return;
    if(localConflict)pauseCloud();
    for(const node of doc.querySelectorAll('[data-action]')){
      if(node.disabled){if(node.tagName==='A'){node.setAttribute('aria-disabled','true');node.removeAttribute('href');node.tabIndex=-1;}continue;}
      const href=hrefFor(node);if(!href)continue;
      let link=node;
      if(node.tagName==='BUTTON'){
        link=doc.createElement('a');for(const attribute of node.attributes)if(attribute.name!=='type')link.setAttribute(attribute.name,attribute.value);
        while(node.firstChild)link.append(node.firstChild);node.replaceWith(link);
      }
      if(link.tagName==='A'){if(link.getAttribute('href')!==href)link.setAttribute('href',href);link.removeAttribute('aria-disabled');if(link.tabIndex===-1)link.removeAttribute('tabindex');}
    }
    for(const node of doc.querySelectorAll('.topbar [data-page],.mobile-nav [data-page]')){
      if(node.dataset.page===entry)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');
    }
  }
  function handleLink(event){
    if(!online)return false;
    const node=event.target.closest('a[data-action]');if(!node)return false;
    if(node.disabled||node.getAttribute('aria-disabled')==='true'){event.preventDefault();return true;}
    if(!hrefFor(node))return false;
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||node.target&&node.target!=='_self'){
      if(!saveBeforeNavigation())event.preventDefault();return true;
    }
    event.preventDefault();return false;
  }
  function boot(restored=false){
    if(!online||!app())return;
    const A=app();applying=true;
    try{
      if(restored){
        // Back/forward cache contains an old JS heap. Read current storage before
        // any pagehide/save can overwrite purchases made in another document.
        let storage=null;try{storage=root.localStorage;}catch{}
        const loaded=O.Progress.read(storage);A.profile=loaded.profile;A.storageOK=loaded.available;knownSave=persisted();localConflict=null;delete doc.body.dataset.localSaveConflict;resumeCloud();
        A.state=null;A.lastResult=null;A.paused=false;A.accumulator=0;A.aims={};A.ghosts={};O.Review?.clearView();
      }
      const saved=restoreContext();
      if(!available(A.currentId))A.currentId=available(A.profile.lastLevel)?A.profile.lastLevel:O.Progress.nextLevel(A.profile);
      if(entry==='play'){
        const requested=new URL(root.location.href).searchParams.get('contract');
        const id=requested===null?recent():/^(0|[1-9]\d*)$/.test(requested)?Number(requested):NaN;
        if(!available(id)){root.location.replace(url('campaign'));return;}
        A.loadLevel(id);
        if(saved.currentId===id&&saved.camera&&['zoom','cx','cy'].every(key=>Number.isFinite(saved.camera[key]))){A.camera={zoom:O.Physics.clamp(saved.camera.zoom,1,4),cx:saved.camera.cx,cy:saved.camera.cy};O.UI9?.clampCamera();}
        if(saved.currentId===id&&A.level().branches?.some(branch=>branch.id===saved.branch))A.branchView=saved.branch;
        O.UI9?.sync();
      }else{
        A.go(entry,true);
        const search=doc.getElementById('contractSearch');if(search)search.value=A.campaignQuery;
      }
    }finally{applying=false;decorate();}
  }
  O.Navigation={enabled:online,initialPage:online?entry:'home',url,beforeGo,beforeTravel,beforeLevel,onLevel,handleLink,decorate,onCloudReady:()=>{if(localConflict)pauseCloud();}};
  if(!online)return;
  // Every application/cloud write goes through this function, including the
  // game.js pagehide closure. Compare synchronously as storage events can lag.
  const originalWrite=O.Progress.write;
  O.Progress.write=(storage,profile)=>{
    if(storage!==localStorage)return originalWrite(storage,profile);
    if(localConflict)return false;
    let current;try{current=persisted();}catch{return originalWrite(storage,profile);}
    if(current!==knownSave&&!same(profile,current)){
      if(same(profile,current,true)){profile.lastLevel=decode(current).lastLevel;knownSave=current;}
      else{conflict(current);return false;}
    }
    const written=originalWrite(storage,profile);if(written)knownSave=persisted();return written;
  };
  doc.addEventListener('DOMContentLoaded',()=>{
    Object.assign(app().actions,{'pages:use-this':()=>resolveConflict('this'),'pages:use-other':()=>resolveConflict('other'),'pages:backup-this':()=>downloadConflict('this'),'pages:backup-other':()=>downloadConflict('other'),'pages:export':()=>app().exportSave(),'pages:retry-save':retrySave});
    boot();observer=new MutationObserver(decorate);observer.observe(doc.body,{childList:true,subtree:true});if(localConflict)showConflict();
  },{once:true});
  doc.addEventListener('click',event=>{
    reconcile();const action=event.target.closest('[data-action]')?.dataset.action;
    if(localConflict&&!['pages:use-this','pages:use-other','pages:backup-this','pages:backup-other'].includes(action)){event.preventDefault();event.stopImmediatePropagation();showConflict();}
  },true);
  doc.addEventListener('keydown',event=>{if(localConflict&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();}},true);
  root.addEventListener('storage',event=>{if(event.key===O.Progress.SAVE_KEY||event.key===null)reconcile();});
  root.addEventListener('focus',reconcile);
  doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)reconcile();});
  doc.addEventListener('auxclick',event=>{if(event.button===1&&event.target.closest('a[data-action]')&&hrefFor(event.target.closest('a[data-action]')))saveBeforeNavigation();});
  root.addEventListener('pagehide',()=>{remember();reconcile();});
  root.addEventListener('pageshow',event=>{if(event.persisted)boot(true);});
})(typeof globalThis!=='undefined'?globalThis:window);
