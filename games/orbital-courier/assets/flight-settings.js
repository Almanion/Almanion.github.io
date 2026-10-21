/* Flight preferences describe the actual prepared contract. No new physics. */
(function(root){
 'use strict';const O=root.Orbital,A=O.App,G=O.Progress,P=O.Physics,$=id=>document.getElementById(id);
 const proMark='<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m10 2 7 8-7 8-7-8Z"/><path d="m6 10 4-5 4 5-4 5Z"/></svg>';
 function modes(compact=false){
  const raw=O.LEVELS[A.screen==='play'?A.currentId:A.profile.lastLevel]||O.LEVELS[O.Campaign.order[0]],st=G.stats(A.profile),locked=A.screen==='play'&&!!A.state;
  const current=P.prepareLevel(raw,A.profile.difficulty),forecast=Math.max(raw.placement?.preview||0,st.preview*(A.profile.difficulty==='pro'?0.6:1));
  return `<div class="mode-comparison ${compact?'compact':''}" role="group" aria-label="Сложность рейса">${['normal','pro'].map(mode=>{const l=P.prepareLevel(raw,mode),pro=mode==='pro',selected=A.profile.difficulty===mode;return `<button class="mode-option ${pro?'pro-option':''}" data-action="ui:set-mode" data-mode="${mode}" aria-pressed="${selected}" ${locked?'disabled':''}><span class="mode-option-title">${pro?proMark:''}<strong>${pro?'ПРО':'Обычный'}</strong><small>${selected?'Выбран':'Выбрать'}</small></span><span class="mode-payout">×${pro?'1,7':'1'} <small>к награде за результат</small></span><span class="mode-facts"><span>Стыковка <b>${P.captureRadius(l,st).toFixed(1)} ед.</b></span><span>Груз <b>${l.rules.minCargo?l.rules.minCargo+' из '+l.cargo.length:'Без минимума'}</b></span><span>Прогноз <b>${Math.max(raw.placement?.preview||0,st.preview*(pro?0.6:1)).toFixed(1)} с</b></span></span></button>`;}).join('')}</div><p class="mode-explanation">${locked?'Режим зафиксирован до следующего запуска.':compact?'Стыковка: '+P.captureRadius(current,st).toFixed(1)+' ед. · груз: '+(current.rules.minCargo||0)+'/'+current.cargo.length+' · прогноз: '+forecast.toFixed(1)+' с.':(raw.placement?'В лабораторных контрактах прогноз 12 с доступен в обоих режимах. ':'В ПРО строже условия приёма и короче прогноз сканера. ')+'Выплата зависит от качества рейса; повтор приносит только улучшение рекорда.'}</p>`;
 }
 function content(toggle){return `<header class="preference-heading"><h3>Твой режим полёта</h3><p>Выбери условия перед запуском.</p></header>${modes(true)}<div class="preference-label">СКОРОСТЬ ПОКАЗА</div><div class="playback-choices" role="group" aria-label="Скорость показа полёта">${G.PLAYBACK_RATES.map(rate=>`<button data-action="flight:rate" data-rate="${rate}" aria-pressed="${A.timeScale===rate}">×${String(rate).replace('.',',')}</button>`).join('')}</div><p class="preference-note">Ускоряет показ полёта и сохраняется между запусками. Точность расчёта и награды не меняются.</p><div class="preference-group flight-precision">${toggle('fineAim','Точное прицеливание','Шаг 0,1° и 1 единица скорости. Плавнее при наведении пальцем.')}</div>`;}
 function select(mode){
  if(!['normal','pro'].includes(mode)||mode===A.profile.difficulty)return;
  if(A.screen==='play'&&A.state)return;
  const settings=$('modal').open&&$('modal').classList.contains('preferences-modal'),details=$('modal').open&&!settings;
  A.profile.difficulty=mode;A.save();if(A.screen==='play')A.loadLevel(A.currentId);else A.updateProfileUI();
  if(settings){O.V8.settings('flight');document.querySelector('#settingsPanel [data-mode="'+mode+'"]')?.focus();}else if(details)openModes();
  sync();
 }
 function openModes(){A.openModal('Обычный или ПРО',modes()+'<div class="modal-actions"><button class="button primary" data-action="close">К полёту</button></div>','УСЛОВИЯ РЕЙСА');$('modal').classList.add('mode-modal');}
 function sync(){
  const pro=A.profile.difficulty==='pro',locked=A.screen==='play'&&!!A.state;document.body.dataset.difficulty=pro?'pro':'normal';
  for(const b of document.querySelectorAll('[data-action="ui:set-mode"]')){const selected=b.dataset.mode===A.profile.difficulty;b.setAttribute('aria-pressed',String(selected));b.disabled=locked;const s=b.querySelector('.mode-option-title small');if(s)s.textContent=selected?'Выбран':'Выбрать';}
  for(const b of document.querySelectorAll('[data-action="flight:rate"]'))b.setAttribute('aria-pressed',String(+b.dataset.rate===A.timeScale));
  const preview=$('soundPreview');if(preview)preview.disabled=!A.profile.settings.sound;
 }
 Object.assign(A.actions,{'ui:set-mode':b=>select(b.dataset.mode),'ui:mode-details':openModes,'ui:flight-settings':()=>O.V8.settings('flight'),'flight:rate':b=>A.setPlaybackSpeed(+b.dataset.rate),'flight:sound-preview':()=>{if(A.profile.settings.sound)A.sound.unlock().then(()=>A.sound.play('cargo'));}});
 document.addEventListener('change',e=>{if(e.target.dataset.setting==='sound')sync();});
 O.FlightSettings={content,modes,select,sync};sync();
})(window);
