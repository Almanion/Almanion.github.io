/* v9 presentation + input. No orbital equations, prices, rewards or save migrations.
   One pointer controller, one numeric parser and one native dialog per sheet. */
(function (root) {
  'use strict';
  const O = root.Orbital, A = O.App, P = O.Physics, G = O.Progress;
  const $ = id => document.getElementById(id);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const canvas = $('gameCanvas'), drawer = $('flightDrawer'), modal = $('modal');
  const coarse = () => matchMedia('(pointer:coarse)').matches;
  const narrow = () => !matchMedia('(min-width:520px) and (max-height:480px) and (orientation:landscape)').matches && matchMedia('(max-width:699px), (max-width:999px) and (orientation:portrait)').matches;
  const mobileLayout = matchMedia('(max-width:699px), (max-width:999px) and (orientation:portrait), (max-width:999px) and (max-height:480px)');
  const mobile = () => mobileLayout.matches;
  const aiming = () => A.screen === 'play' && !A.state && !A.transitioning;
  const flying = () => A.screen === 'play' && A.state?.status === 'flying';
  const controlsBlocked = () => modal.open || drawer.open || A.transitioning;
  const editing = () => ['angleInput', 'speedInput'].includes(document.activeElement?.id);
  let mapMode = 'aim', lastMode = '', pending = false, inputMessageTimer;
  let lastHeight = innerHeight, lastWidth = innerWidth, sheetState = null, modalFocus = null, lastInput = null;
  let lastLevel = null, hintTimer, lastFlightKey = '', initializedLive = false, touchHintSeen = false;
  const screenMode = () => !A.state ? 'aiming' : A.state.status === 'flying' ? 'running' : 'review';

  // Keep one time control and its forecast when the pilot changes orientation.
  const timing=$('launchTiming');
  const timingAnchor=()=>$(mobile()?'flightStatus':'launchButton');
  let timingFocus=null;
  timing.addEventListener('focusout',event=>{
    // The old sidebar can become invisible before the media-query callback.
    if(!event.relatedTarget&&!timing.hidden&&timing.parentNode!==timingAnchor().parentNode)timingFocus=event.target;
  });
  function placeLaunchTiming(){
    const anchor=timingAnchor();
    if(timing.nextElementSibling===anchor)return;
    const active=document.activeElement;
    const focus=timing.contains(active)?active:active===document.body?timingFocus:null;
    anchor.before(timing);
    timingFocus=null;
    if(focus&&!timing.hidden){
      const target=focus.offsetWidth&&!focus.disabled?focus:$('launchDelayRange');
      target.focus({preventScroll:true});
    }
  }
  mobileLayout.addEventListener('change',placeLaunchTiming);
  placeLaunchTiming();

  function setText(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
  }
  function layout() {
    pending = false;
    const vv = root.visualViewport;
    const height = vv && vv.scale <= 1.02 ? vv.height : innerHeight;
    document.documentElement.style.setProperty('--vv-height', Math.floor(height) + 'px');
    document.documentElement.style.setProperty('--vv-top', (vv?.offsetTop || 0) + 'px');
    if (Math.abs(innerWidth - lastWidth) > 80) lastHeight = innerHeight;
    lastWidth = innerWidth; lastHeight = Math.max(lastHeight, innerHeight);
    const keyboard = coarse() && editing() && height < lastHeight - 120;
    document.body.classList.toggle('keyboard-editing', keyboard);
    if (A.screen !== 'play') return;
    $('cockpit').style.setProperty('--map-turn', O.FlightView.portrait() ? '-90deg' : '0deg');
    placeTimeline();
    const main = document.querySelector('main');
    // CSS owns main height; a software keyboard may shorten the visual viewport.
    main.style.height = '';
    const box = $('mapViewport'), stage = box.querySelector('.stage');
    stage.style.width = Math.max(1, box.clientWidth - 2) + 'px';
    stage.style.height = Math.max(1, box.clientHeight - 2) + 'px';
    clampCamera();
  }
  function schedule() {
    if (!pending) { pending = true; requestAnimationFrame(layout); }
  }
  new ResizeObserver(schedule).observe($('mapViewport'));
  let portraitProjection=O.FlightView.portrait();
  root.addEventListener('resize',()=>{const next=O.FlightView.portrait();if(next!==portraitProjection){clearPointers();portraitProjection=next;}schedule();});
  root.visualViewport?.addEventListener('resize', schedule);
  root.visualViewport?.addEventListener('scroll', schedule);

  function onPage(page) {
    closeSheet(false); stopHold(); clearPointers();
    document.body.classList.remove('keyboard-editing');
    if (page !== 'play') { document.body.removeAttribute('data-flight'); lastMode = ''; }
    for (const b of $$('.topbar nav [data-page],.mobile-nav [data-page]')) {
      const selected = b.dataset.page === page || page === 'play' && b.dataset.page === 'campaign';
      if (selected) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    schedule();
  }
  function onLevel() {
    closeSheet(false); clearPointers(); stopHold(); lastMode = ''; initializedLive = false;
    portraitProjection=O.FlightView.portrait();
    delete document.body.dataset.resultView;
    $('resultScreen').hidden = true;
    $('resultAnalysisBar').hidden = true;
    $('reviewEvent').hidden = true;
    $('reviewPin').hidden = true;
    placeTimeline();
    A.goalHighlight = null;
    selectCockpitTab('course');
    $('aimFeedback').hidden = true;
    $('flightReview').hidden = true;
    lastFlightKey = '';
    if (lastLevel !== A.currentId) mapMode = 'aim';
    lastLevel = A.currentId;
    sync(); schedule();
    if(A.level().launchTiming){
      clearTimeout(hintTimer);$('mapGestureHint').hidden=true;
    }else if(coarse()&&mapMode==='aim'&&!touchHintSeen){
      touchHintSeen = true;
      setText($('mapGestureHint'),'Касание — курс и скорость. Два пальца — обзор.');
      $('mapGestureHint').hidden=false;clearTimeout(hintTimer);hintTimer=setTimeout(()=>$('mapGestureHint').hidden=true,6000);
    }
  }
  function onResult() {
    closeSheet(false); clearPointers(); sync(); schedule();
    $('flightReview').setAttribute('tabindex', '-1');
    // No focus jump: player may still be interacting with zoom or a button.
  }
  function initLive() {
    $('liveFlightPanel').innerHTML = `<div class="flight-live-state" id="liveState"></div>
      <div class="flight-fact"><small>Относительно станции</small><strong id="liveVelocity">—</strong><span id="liveDock"></span></div>
      <div class="flight-metrics"><div><span>Груз</span><b id="liveCargo">—</b></div>
      <div id="liveOrbitRow"><span>Облёты</span><b id="liveOrbits">—</b></div>
      <div id="livePortalRow"><span>Порталы</span><b id="livePortals">—</b></div>
      <div id="liveDropRow"><span>Адреса</span><b id="liveDrops">—</b></div></div>
      <p id="liveWarning" class="live-warning"></p>`;
    initializedLive = true;
  }
  function sync() {
    if (A.screen !== 'play') return;
    placeTimeline();
    const mode = screenMode(), s = A.displayState(), l = A.displayLevel();
    if (mode !== lastMode) {
      document.body.dataset.flight = mode; lastMode = mode;
      if (mode !== 'aiming') clearPointers();
      schedule();
    }
    $('modeChip').title=A.state?'Режим зафиксирован до следующего запуска':'ПРО: награда ×1,7 и более строгие условия приёма';
    $('saveBadge').hidden=A.storageOK;
    O.FlightSettings?.sync();
    setText($('flightSector'), 'Контракт ' + O.Campaign.number(A.currentId));
    setText($('navModeLabel'), mode === 'aiming' ? 'Начальный импульс' : mode === 'review' ? 'Полёт завершён' : A.paused ? 'Полёт на паузе' : 'Капсула в полёте');
    $('cockpit').style.setProperty('--map-turn', O.FlightView.portrait() ? '-90deg' : '0deg');
    setText($('fineAimButton'), A.profile.settings.fineAim ? '✓ Точно' : 'Точно');
    setText($('fineAimHelp'), A.profile.settings.fineAim ? 'Прицел в 5 раз плавнее' : 'Включить плавный прицел');
    setText($('memoryCurrent'), `Сейчас: ${A.angle.toFixed(1)}° / ${A.speed} ед./с`);
    for(const b of $$('[data-action="fine-aim"]')){
      b.setAttribute('aria-pressed',String(!!A.profile.settings.fineAim));b.disabled=mode!=='aiming';
    }
    if($('mobileFine'))setText($('mobileFine'),A.profile.settings.fineAim?'✓ Точно':'Точно');
    const text = !A.state ? 'Старт' : flying() ? (A.paused ? 'Продолжить' : 'Пауза') : 'Повторить';
    const delayed=mode==='aiming'&&l.launchDelay>0;
    setText($('launchButton'), delayed?'Старт +'+$('launchDelayValue').textContent:text);
    setText($('mobileLaunch'), narrow() && editing() ? 'Готово ✓' : text);
    setText($('stagePill'), (A.profile.difficulty==='pro'?'ПРО · ':'')+(A.assisted ? 'ТРЕНИРОВКА · БЕЗ НАГРАД' : !A.state ? 'ГОТОВНОСТЬ' : flying() ? A.paused ? 'ПАУЗА' : 'ПОЛЁТ' : 'ЗАПИСЬ РЕЙСА'));
    $('stagePill').hidden = !A.assisted && (mode === 'aiming' || flying() && !A.paused);
    $('liveFlightPanel').hidden = mode === 'aiming';
    if (mode !== 'aiming' && s) {
      const guide=A.flightGuide(s);
      if (!initializedLive) initLive();
      setText($('liveState'), mode === 'review' ? 'Запись' : A.paused ? 'Пауза' : 'Полёт');
      setText($('liveVelocity'), P.dockVelocity(s, A.level()).speed.toFixed(0) + ' ед./с');
      setText($('liveDock'), l.rules?.maxDockSpeed ? `При стыковке — до ${l.rules.maxDockSpeed} ед./с` : 'Радиус стыковки: ' + P.captureRadius(A.level(), A.stats()).toFixed(1));
      setText($('liveCargo'), guide.carried + ' / ' + guide.plan.cargo.length);
      setText($('liveOrbits'), guide.count.flyby + ' / ' + guide.plan.flybys.length);
      setText($('livePortals'), guide.count.portal + ' / ' + guide.plan.portals.length);
      $('liveOrbitRow').hidden = !l.flybys?.length;
      $('livePortalRow').hidden = !l.portalOrder?.length;
      $('liveDropRow').hidden = !l.stops?.length;
      setText($('liveDrops'), guide.count.stop + ' / ' + guide.plan.stops.length);
      const lost = s.cargoBodies?.filter(c => c.phase === 'lost').length || 0;
      setText($('liveWarning'), lost ? `Потеряно контейнеров: ${lost}` : '');
    }
    const effectiveMode = mode === 'aiming' ? mapMode : 'pan';
    document.body.dataset.mapMode = effectiveMode;
    $('mapAim').disabled = mode !== 'aiming';
    $('mapAim').setAttribute('aria-pressed', String(effectiveMode === 'aim'));
    $('mapPan').setAttribute('aria-pressed', String(effectiveMode === 'pan'));
    $('mapPlanets').hidden=!l.placement;
    $('mapPlanets').disabled=mode!=='aiming';
    $('mapPlanets').setAttribute('aria-pressed',String(effectiveMode==='planets'));
    O.PlanetWorkshop?.sync();
    setText($('mapFit'), A.camera.zoom <= 1.01 ? 'Вся карта' : Math.round(A.camera.zoom * 100) + '%');
    // Selected game status, not high-frequency counters, is announced to assistive tech.
    const flightKey = mode + ':' + (A.state?.reason || '') + ':' + A.paused;
    if (lastFlightKey !== flightKey) { lastFlightKey = flightKey; $('stagePill').setAttribute('aria-live', 'polite'); }
    for(const id of ['angleRange','speedRange']) { const e=$(id); e.style.setProperty('--range-fill', ((+e.value-+e.min)/(+e.max-+e.min)*100)+'%'); }
    const delivered = mode === 'review' && A.state?.status === 'won' && !!A.lastResult && !A.lastResult.training;
    const nextReady = delivered && O.Campaign.adjacent(A.currentId,1)>=0;
    $('mobileNext').hidden = !delivered;
    $('mobileNext').disabled = A.transitioning;
    setText($('mobileNext'), nextReady ? 'Дальше ↗' : 'Маршруты ↗');
    $('mobileLaunch').classList.toggle('primary', !delivered);
    $('mobileDock').classList.toggle('delivered', delivered);
    const limit = mode === 'aiming' && l.rules?.maxLaunchSpeed;
    const overLimit = !!limit && A.speed > limit;
    const limitText = !limit ? '' : overLimit ? `Скорость выше лимита ${limit} ед./с` : `Лимит старта по контракту — ${limit} ед./с`;
    $('launchLimit').hidden = !limit;
    $('launchLimit').classList.toggle('over-limit', overLimit);
    $('launchLimit').querySelector('button').hidden = !overLimit;
    setText($('launchLimitText'), limitText);
    $('mobileReadout').classList.toggle('over-limit', overLimit);
    setText($('mobileReadoutLabel'), overLimit ? `Выше лимита ${limit} ед./с` : mode === 'aiming' ? 'Курс' : mode === 'running' ? (A.paused ? 'Пауза' : 'Полёт') : A.lastResult?.training ? 'Тренировка' : delivered ? 'Доставлено' : 'Разбор');
    setText($('mobileReadoutValue'), mode === 'aiming' ? `${A.angle.toFixed(1)}°  /  ${A.speed} ед./с` : mode === 'running' ? `${s.t.toFixed(1)} с  ·  груз ${O.Routes.collected(A.level(),s)} / ${O.Routes.cargoIds(A.level(),s).length}` : `${A.state.t.toFixed(2)} с  ·  ${A.lastResult?.training ? 'можно повторить' : delivered ? '+' + A.lastResult.totalCredits + ' ◈' : 'найти причину'}`);
    $('mobileReadout').setAttribute('aria-label', overLimit ? `Старт ${A.speed} ед./с, по контракту до ${limit}. Открыть точный пульт` : mode === 'review' ? 'Открыть разбор и перемотку рейса' : 'Открыть точный пульт');
    setText($('mobileSpeed'), '×' + A.timeScale);
    const nextDesktop = $('nextLevelButton');
    if (nextDesktop) {
      nextDesktop.hidden = !nextReady;
      nextDesktop.disabled = A.transitioning;
      $('launchSecondary')?.classList.toggle('with-next', nextReady);
    }
    $('mobileLaunch').disabled = A.transitioning;
    $('launchButton').disabled = A.transitioning;
    if(!A.state&&P.layoutProblem(A.level(),A.level().layout))$('mobileLaunch').disabled=$('launchButton').disabled=true;
  }

  function selectCockpitTab(tab) {
    commitFocused(); stopHold();
    for (const name of ['course','memory']) {
      const selected = name === tab, button = $(name + 'Tab');
      button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
      $(name + 'Pane').hidden = !selected;
    }
  }
  document.querySelector('.cockpit-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const tab = event.key === 'Home' ? 'course' : event.key === 'End' ? 'memory' : event.target.id === 'courseTab' ? 'memory' : 'course';
    selectCockpitTab(tab); $(tab + 'Tab').focus();
  });
  // Sheets MOVE existing nodes; there are no duplicate control IDs or mirror forms.
  function placeTimeline(){
    const timeline=$('reviewTimeline');if(!timeline)return;
    const target=$('reviewTimelineHome');
    if(target&&timeline.parentNode!==target)target.append(timeline);
  }
  function openSheet(kind, opener) {
    if (A.transitioning) return;
    closeSheet(false); A.closeModal(); commitFocused(); clearPointers(); stopHold();
    const nodes = kind === 'route' ? [document.querySelector('.plan-body'),document.querySelector('.medal-deck')] : kind === 'review' ? [$('flightReview'),document.querySelector('.medal-deck')] : [$('cockpit')];
    const entries=nodes.map(node=>{const marker=document.createComment('sheet return point');node.before(marker);return {node,marker};});
    sheetState = {kind, entries, opener:opener || document.activeElement, paused:A.paused, state:A.state};
    if (flying()) A.paused = true;
    setText($('drawerTitle'), kind === 'route' ? 'Маршрут и медали' : kind === 'review' ? 'Разбор рейса' : A.state ? 'Пульт полёта' : 'Точный пульт');
    $('drawerContent').replaceChildren();
    if (kind === 'memory') selectCockpitTab('course');
    $('drawerContent').append(...nodes);
    drawer.showModal(); drawer.scrollTop = 0;
    document.body.classList.add('sheet-open'); sync();
  }
  function closeSheet(restoreFocus = true) {
    if (!sheetState) { if (drawer.open) drawer.close(); return; }
    commitFocused();stopHold();
    const x = sheetState; sheetState = null;
    for(const {marker,node} of x.entries)marker.replaceWith(node);
    if (drawer.open) drawer.close();
    if (A.state === x.state) A.paused = x.paused;
    A.accumulator = 0;
    document.body.classList.remove('sheet-open');
    if (restoreFocus && x.opener?.isConnected && x.opener.getClientRects().length) x.opener.focus({preventScroll:true});
    sync(); schedule();
  }
  drawer.addEventListener('cancel', event => { event.preventDefault(); closeSheet(); });
  // Keep keyboard navigation inside the current overlay, including the last Tab.
  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const dialog = drawer.open ? drawer : modal.open ? modal : null;
    if (!dialog) return;
    const items = [...dialog.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex]')]
      .filter(e => !e.disabled && e.tabIndex >= 0 && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
    if (!items.length) { event.preventDefault(); dialog.focus(); return; }
    const first = items[0], last = items[items.length - 1], active = document.activeElement;
    if (!dialog.contains(active) || (event.shiftKey ? active === first : active === last)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus({preventScroll:false});
    }
  }, true);

  drawer.addEventListener('click', event => {
    if (event.target !== drawer) return;
    const r = drawer.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeSheet();
  });
  function beforeModal() {
    if (!modal.open) modalFocus = document.activeElement;
    closeSheet(false); clearPointers(); stopHold();
  }
  function afterModal() {
    // Keep short titles near top; CSS gives the modal its own keyboard-safe scroller.
    const first = modal.querySelector('.modal-close');
    if (first) first.focus({preventScroll:true});
    for(const e of modal.querySelectorAll('input[type=checkbox]'))e.setAttribute('role','switch');
    schedule();
  }
  function modalClosed() {
    const focus = modalFocus; modalFocus = null;
    if (focus?.isConnected && focus.getClientRects().length && focus !== document.body) focus.focus({preventScroll:true});
    schedule();
  }
  function menu() {
    const prev = G.unlocked(A.profile, O.Campaign.adjacent(A.currentId,-1));
    const next = G.unlocked(A.profile, O.Campaign.adjacent(A.currentId,1));
    A.openModal(A.level().name, `<div class="ui-menu">
      <button data-action="ui:memory"><span class="menu-symbol">◎</span>Точный пульт</button>
      <button data-action="ui:route"><span class="menu-symbol">⌁</span>План маршрута</button>
      <button data-action="ui:map-menu"><span class="menu-symbol">✥</span>Настройки карты</button>
      <button data-action="medal-help"><span class="menu-symbol">✧</span>Условия медалей</button>
      <button data-action="hint"><span class="menu-symbol">?</span>Подсказка</button>
      <button data-action="previous-level" ${prev ? '' : 'disabled'}><span>‹</span>Предыдущий</button>
      <button data-action="following-level" ${next ? '' : 'disabled'}>Следующий<span>›</span></button>
      <button data-action="nav" data-page="hangar"><span class="menu-symbol">⚙</span>Ангар</button>
      <button data-action="settings"><span class="menu-symbol">☷</span>Настройки</button>
      <button data-action="ui:mode"><span class="menu-symbol">◉</span>${A.profile.difficulty === 'pro' ? 'Выключить PRO' : 'Включить PRO'}</button>
      <button data-action="ui:shortcuts"><span class="menu-symbol">⌨</span>Управление</button>
      <button data-action="nav" data-page="campaign" class="wide">← Все контракты</button>
    </div><div class="modal-actions"><button class="button primary" data-action="close">К полёту</button></div>`, `КОНТРАКТ ${O.Campaign.number(A.currentId)} / ${O.Campaign.order.length}`);
  }
  function toggleDifficulty() {
    if (A.state) { A.toast('Режим можно переключать только до запуска.', true); return; }
    A.profile.difficulty = A.profile.difficulty === 'pro' ? 'normal' : 'pro';
    A.save();
    A.loadLevel(A.currentId);
    A.closeModal();
    A.toast(A.profile.difficulty === 'pro' ? 'Режим PRO включён.' : 'Обычный режим включён.');
  }
  function mapMenu() {
    A.openModal('Карта', `<div class="map-settings">
      <button data-action="ui:map-aim-close" ${aiming()?'':'disabled'}>↗ Режим «Курс»</button><button data-action="ui:map-pan-close">✥ Режим «Обзор»</button>
      <button data-action="ui:field" aria-pressed="${A.profile.settings.grid}">${A.profile.settings.grid ? '✓' : '○'} Поле тяготения</button>
      <button data-action="ui:ship">Показать капсулу</button>
      <div class="map-nudges" role="group" aria-label="Сдвинуть обзор без перетаскивания"><button data-action="ui:pan-left" aria-label="Обзор левее">←</button><button data-action="ui:pan-up" aria-label="Обзор выше">↑</button><button data-action="ui:pan-down" aria-label="Обзор ниже">↓</button><button data-action="ui:pan-right" aria-label="Обзор правее">→</button></div>
      <button data-action="ui:zoom-reset-close">Вся карта · сброс масштаба</button>
      <button data-action="ui:fullscreen">Полный экран</button></div>
      <p>Курс — меняет угол и скорость. Обзор — двигает карту, не затрагивая запуск. Масштаб: два пальца, колесо или кнопки + / −.</p>
      <div class="modal-actions"><button class="button primary" data-action="close">Готово</button></div>`);
  }
  function shortcuts() {
    A.openModal('Управление', `<table class="shortcut-table"><tbody>
      <tr><td>Пробел</td><td>Запуск / пауза</td></tr><tr><td>← → / ↑ ↓</td><td>Угол / скорость</td></tr>
      <tr><td>Shift + стрелки</td><td>0,1° / 1 ед.</td></tr><tr><td>R / К</td><td>Повтор без подтверждения</td></tr>
      <tr><td>G / П</td><td>Поле тяготения</td></tr><tr><td>Alt + мышь</td><td>Обзор без изменения курса</td></tr><tr><td>Esc</td><td>Закрыть панель / пауза</td></tr>
      </tbody></table><div class="info-box">На карте выбери <b>«Курс»</b> или <b>«Обзор»</b>. Для масштаба — два пальца. Кнопки + / − у чисел можно удерживать. Угол принимает точку или запятую. Нажми «Готово» на клавиатуре, затем запускай.</div>
      <div class="modal-actions"><button class="button primary" data-action="close">Понятно</button></div>`);
  }
  async function fullscreen() {
    try {
      A.closeModal();
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else throw new Error('unsupported');
      schedule();
    } catch (_) { A.toast('Полный экран недоступен в этом браузере. Игра работает в обычном окне.'); }
  }
  function requestRetry() {
    if (A.screen !== 'play' || A.transitioning) return;
    retryNow();
  }
  function retryNow() {
    const camera = {...A.camera}; A.closeModal(); closeSheet(false); A.retry();
    A.camera = camera; clampCamera(); sync();
  }
  function useLaunchLimit() {
    const limit = A.level().rules?.maxLaunchSpeed, state = A.state;
    if (!limit || A.transitioning || (state && state.reason !== 'fuel')) return;
    const angle = state?.launchAngle ?? A.angle;
    if (state) retryNow();
    if (!aiming()) return;
    A.setAim(angle, Math.floor(limit));
    const focus = mobile() && !drawer.open ? $('mobileReadout') : $('speedRange');
    focus.focus({preventScroll:true});
  }

  // Numeric input commits once, tolerates comma and restores invalid intermediate text.
  function numberValue(raw) {
    const value = String(raw).trim().replace('−', '-').replace(',', '.');
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null;
    const n = Number(value); return Number.isFinite(n) ? n : null;
  }
  function feedback(message) {
    clearTimeout(inputMessageTimer);
    setText($('aimFeedback'), message); $('aimFeedback').hidden = !message;
    if (message) inputMessageTimer = setTimeout(() => { $('aimFeedback').hidden = true; }, 3800);
  }
  function commitInput(input) {
    if (!input || !aiming()) return true;
    const n = numberValue(input.value);
    if (n === null) {
      input.setAttribute('aria-invalid', 'true');
      feedback('Введи число. Последнее значение сохранено.');
      input.value = input.id === 'angleInput' ? A.angle.toFixed(1) : A.speed;
      return false;
    }
    input.removeAttribute('aria-invalid');
    const angle = input.id === 'angleInput';
    const clamped = P.clamp(n, angle ? -180 : 60, angle ? 180 : A.stats().maxSpeed);
    A.setAim(angle ? clamped : A.angle, angle ? A.speed : clamped);
    if (clamped !== n) feedback(angle ? 'Угол: от −180° до 180°.' : `Скорость: от 60 до ${A.stats().maxSpeed}.`);
    return true;
  }
  function commitFocused() {
    if (!editing()) return true;
    const e = document.activeElement;
    const valid = commitInput(e); e.blur();
    return valid;
  }
  for (const id of ['angleInput', 'speedInput']) {
    const input = $(id);
    input.addEventListener('focus', () => { lastInput = input; sync(); schedule(); });
    input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); feedback(''); });
    input.addEventListener('change', () => commitInput(input));
    input.addEventListener('blur', () => { commitInput(input); document.body.classList.remove('keyboard-editing'); sync(); schedule(); });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); commitInput(input); input.blur(); }
      if (event.key === 'Escape') { event.preventDefault(); input.value = id === 'angleInput' ? A.angle.toFixed(1) : A.speed; input.blur(); event.stopPropagation(); }
    });
  }
  for (const id of ['angleRange', 'speedRange']) $(id).addEventListener('input', event => {
    if (!aiming() || modal.open || (drawer.open&&sheetState?.kind!=='memory')) return;
    const n = Number(event.target.value);
    A.setAim(id === 'angleRange' ? n : A.angle, id === 'speedRange' ? n : A.speed);
  });

  let held = null, holdDelay = 0, holdRepeat = 0;
  const suppressClick = new WeakMap();
  function stopHold() { clearTimeout(holdDelay); clearInterval(holdRepeat); held = null; }
  function nudge(button) {
    if (!aiming() || modal.open || (drawer.open&&sheetState?.kind!=='memory')) return;
    A.actions[button.dataset.action]?.(button);
  }
  document.addEventListener('pointerdown', event => {
    const b = event.target.closest('.number-wrap button');
    if (!b || b.disabled || event.button !== 0 || !aiming() || modal.open || (drawer.open&&sheetState?.kind!=='memory')) return;
    commitFocused(); stopHold(); held = {button:b, id:event.pointerId};
    suppressClick.set(b, performance.now() + 1800); nudge(b);
    try { b.setPointerCapture(event.pointerId); } catch (_) {}
    holdDelay = setTimeout(() => {
      holdRepeat = setInterval(() => {
        if (!held || !aiming() || modal.open || (drawer.open&&sheetState?.kind!=='memory')) return stopHold();
        suppressClick.set(b, performance.now() + 1800); nudge(b);
      }, 85);
    }, 360);
  });
  document.addEventListener('pointermove', event => {
    if (!held || held.id !== event.pointerId) return;
    const r = held.button.getBoundingClientRect();
    if (event.clientX < r.left - 12 || event.clientX > r.right + 12 || event.clientY < r.top - 12 || event.clientY > r.bottom + 12) stopHold();
  });
  document.addEventListener('pointerup', stopHold);
  document.addEventListener('pointercancel', stopHold);
  document.addEventListener('click', event => {
    const b = event.target.closest('.number-wrap button');
    if (b && event.detail > 0 && (suppressClick.get(b) || 0) >= performance.now()) {
      suppressClick.delete(b); event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);

  // Unified gesture state: once a pinch starts, remaining fingers cannot become aim.
  const pointers = new Map(); let gesture = null;
  function metrics() {
    return O.FlightView.metrics(canvas.getBoundingClientRect());
  }
  function worldPoint(x, y) {
    return O.FlightView.toWorld(x,y,A.camera,metrics());
  }
  function worldToScreen(x,y){return O.FlightView.toScreen(x,y,A.camera,metrics());}
  function placeReviewPin(m=metrics()){
    const pin=$('reviewPin'),event=O.Review.active?.data.event;
    if(!event||document.body.dataset.resultView!=='analysis'){pin.hidden=true;return;}
    const {r}=m,point=O.FlightView.toScreen(event.x,event.y,A.camera,m);
    const x=point.x-r.left,y=point.y-r.top;
    pin.hidden=x<=0||y<=0||x>=r.width||y>=r.height;
    if(!pin.hidden){pin.style.left=x+'px';pin.style.top=y+'px';}
  }
  function focusReviewBounds(left,top,right,bottom){
    A.camera={zoom:Math.min(2.35,1200/(right-left+100),700/(bottom-top+100)),
      cx:(left+right)/2,cy:(top+bottom)/2};
    // The result summary hides the map. Size the newly visible stage before
    // clamping the camera against its viewport, especially in portrait.
    layout();
    sync();
  }
  function focusReviewEvent(event){
    const target=event.target||{x:event.x,y:event.y,r:0};
    focusReviewBounds(Math.min(event.x,target.x-target.r),Math.min(event.y,target.y-target.r),
      Math.max(event.x,target.x+target.r),Math.max(event.y,target.y+target.r));
  }
  function locateGoal(){
    const guide=A.flightGuide(),points=guide.targets.map(item=>item.point);
    if(!points.length)return;
    A.goalHighlight={goal:guide.next,until:performance.now()+1300};
    const m=metrics(),{r}=m;
    const outside=points.some(point=>{
      const {x,y}=O.FlightView.toScreen(point.x,point.y,A.camera,m);
      const margin=Math.min(48,point.r*m.fit*A.camera.zoom+16);
      return x<r.left+margin||x>r.right-margin||y<r.top+margin||y>r.bottom-margin;
    });
    if(!outside)return;
    focusReviewBounds(Math.min(...points.map(p=>p.x-p.r)),Math.min(...points.map(p=>p.y-p.r)),
      Math.max(...points.map(p=>p.x+p.r)),Math.max(...points.map(p=>p.y+p.r)));
  }
  function fitReviewTracks(current,previous){
    const points=current.concat(previous);
    if(!points.length){resetCamera();return;}
    let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
    for(const point of points){
      left=Math.min(left,point.x);top=Math.min(top,point.y);
      right=Math.max(right,point.x);bottom=Math.max(bottom,point.y);
    }
    focusReviewBounds(left,top,right,bottom);
  }
  function clampCamera() {
    const c = A.camera, m=metrics(), {r,fit,rotated}=m;
    c.zoom = P.clamp(c.zoom, 1, 4);
    const hw = Math.min(600, (rotated?r.height:r.width) / (2 * fit * c.zoom));
    const hh = Math.min(350, (rotated?r.width:r.height) / (2 * fit * c.zoom));
    const edge = Math.max(28, 64 / c.zoom);
    c.cx = P.clamp(c.cx, hw - edge, 1200 - hw + edge);
    c.cy = P.clamp(c.cy, hh - edge, 700 - hh + edge);
    placeReviewPin(m);
  }
  function zoom(factor, x, y) {
    const {r} = metrics(); x ??= r.left + r.width / 2; y ??= r.top + r.height / 2;
    const before = worldPoint(x,y); A.camera.zoom = P.clamp(A.camera.zoom * factor,1,4);
    const after = worldPoint(x,y); A.camera.cx += before.x - after.x; A.camera.cy += before.y - after.y;
    clampCamera(); sync();
  }
  function resetCamera() { A.camera = {zoom:1,cx:600,cy:350}; placeReviewPin(); sync(); }
  function panBy(dx,dy){const {r}=metrics(),x=r.left+r.width/2,y=r.top+r.height/2,a=worldPoint(x,y),b=worldPoint(x+dx*r.width*.22,y+dy*r.height*.22);A.camera.cx+=b.x-a.x;A.camera.cy+=b.y-a.y;clampCamera();sync();}
  function clearPointers() {
    for (const id of pointers.keys()) { try { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); } catch (_) {} }
    pointers.clear(); gesture = null; A.aimPointer = null; A.mapGesture = false; document.body.classList.remove('map-dragging');
  }
  function pointAim(x,y,touch=false) {
    const point=worldPoint(x,y),start=A.level().start,dx=point.x-start.x,dy=point.y-start.y;
    const distance=Math.hypot(dx,dy),{fit}=metrics(),pixels=distance*fit*A.camera.zoom;
    if(touch?pixels<12:distance<=15)return;
    // Screen-space reach stays comfortable on small phones and at any zoom.
    const speed=touch?60+P.clamp((pixels-12)/108,0,1)*(A.stats().maxSpeed-60):distance;
    A.setAim(P.deg(Math.atan2(-dy,dx)),speed);
    if(touch){A.aimPointer=point;$('mapGestureHint').hidden=true;}
  }
  function touchAim(x,y,g){
    if(!g.fine){pointAim(x,y,true);return;}
    const start=A.level().start,angle=-P.rad(g.angle)-(metrics().rotated?Math.PI/2:0);
    const reach=12+(g.speed-60)/Math.max(1,A.stats().maxSpeed-60)*108;
    let dx=Math.cos(angle)*reach+(x-g.x)*.2,dy=Math.sin(angle)*reach+(y-g.y)*.2;
    const length=Math.hypot(dx,dy);if(length<.01)return;
    if(length<12.01){dx*=12.01/length;dy*=12.01/length;}
    const screen=worldToScreen(start.x,start.y);pointAim(screen.x+dx,screen.y+dy,true);
  }
  function midpoint() {
    const [a,b] = [...pointers.values()];
    return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.hypot(a.x-b.x,a.y-b.y)};
  }
  canvas.addEventListener('pointerdown', event => {
    if (A.screen !== 'play' || controlsBlocked() || ![0,1].includes(event.button)) return;
    if (event.pointerType !== 'touch' && pointers.size) return;
    commitFocused(); canvas.focus({preventScroll:true});
    const p = {x:event.clientX,y:event.clientY,type:event.pointerType}; pointers.set(event.pointerId,p);
    try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
    if (pointers.size === 1) {
      const pan = !aiming() || mapMode === 'pan' || event.altKey || event.button === 1;
      const planet=!pan&&mapMode==='planets'?O.PlanetWorkshop?.pick(worldPoint(p.x,p.y)):null;
      gesture = {kind:pan ? 'pan' : mapMode==='planets'?(planet===null?'locked':'planet'):'aim',planet,layout:A.level().layout?structuredClone(A.level().layout):null,x:p.x,y:p.y,cam:{...A.camera},angle:A.angle,speed:A.speed,type:event.pointerType,moved:false,fine:!!A.profile.settings.fineAim};
      document.body.classList.toggle('map-dragging',pan);
      if(gesture.kind==='aim'){
        if(event.pointerType==='touch'){if(!gesture.fine)pointAim(p.x,p.y,true);}
        else pointAim(p.x,p.y);
      }
    } else if (pointers.size === 2) {
      const m = midpoint();
      if (gesture?.kind === 'aim' && aiming()) A.setAim(gesture.angle,gesture.speed);
      if(gesture?.kind==='planet')A.setLayout(gesture.layout);
      A.aimPointer=null;
      gesture = {kind:'pinch',mid:m,cam:{...A.camera},anchor:worldPoint(m.x,m.y)};
      A.mapGesture = true;
    }
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId) || !gesture || controlsBlocked()) return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,type:event.pointerType});
    const g=gesture,{fit}=metrics();
    if (g.kind==='pinch' && pointers.size===2) {
      const m=midpoint(); A.camera.zoom=P.clamp(g.cam.zoom*m.d/Math.max(g.mid.d,1),1,4);
      const after=worldPoint(m.x,m.y); A.camera.cx+=g.anchor.x-after.x; A.camera.cy+=g.anchor.y-after.y; clampCamera(); sync();
    } else if (g.kind==='pan') {
      const m=metrics(),before=O.FlightView.toWorld(g.x,g.y,g.cam,m),after=O.FlightView.toWorld(event.clientX,event.clientY,g.cam,m);
      A.camera.cx=g.cam.cx+before.x-after.x;
      A.camera.cy=g.cam.cy+before.y-after.y;
      clampCamera();sync();
    } else if(g.kind==='planet'&&aiming()){
      const q=worldPoint(event.clientX,event.clientY),before=O.FlightView.toWorld(g.x,g.y,g.cam,metrics()),origin=g.layout.find(p=>p.planet===g.planet);
      O.PlanetWorkshop.move(g.planet,origin.x+q.x-before.x,origin.y+q.y-before.y,false);
    } else if (g.kind==='aim' && aiming()) {
      const dx=event.clientX-g.x,dy=event.clientY-g.y;
      if (!g.moved && Math.hypot(dx,dy)<5) return; g.moved=true;
      if (g.type==='touch') {
        touchAim(event.clientX,event.clientY,g);
      } else {
        pointAim(event.clientX,event.clientY);
      }
    }
    event.preventDefault();
  });
  function releasePointer(event) {
    if (!pointers.has(event.pointerId)) return;
    if(event.type==='pointerup'&&gesture?.kind==='aim'&&aiming()&&!controlsBlocked()){
      if(gesture.type==='touch')touchAim(event.clientX,event.clientY,gesture);
      else pointAim(event.clientX,event.clientY);
    }
    if(event.type==='pointerup'&&gesture?.kind==='planet'&&aiming())A.setLayout(A.level().layout);
    pointers.delete(event.pointerId);
    try { if(canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); } catch(_){}
    if (!pointers.size) clearPointers();
    else if(gesture?.kind==='pinch') gesture={kind:'locked'};
  }
  canvas.addEventListener('pointerup',releasePointer);
  canvas.addEventListener('pointercancel',()=>{if(gesture?.kind==='aim'&&aiming())A.setAim(gesture.angle,gesture.speed);if(gesture?.kind==='planet'&&aiming())A.setLayout(gesture.layout);clearPointers();});
  canvas.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId))releasePointer(e);});
  canvas.addEventListener('wheel',event=>{
    if (controlsBlocked() || event.ctrlKey) return; // preserve browser accessibility zoom
    event.preventDefault();zoom(event.deltaY<0?1.12:1/1.12,event.clientX,event.clientY);
  },{passive:false});
  canvas.addEventListener('contextmenu',event=>event.preventDefault());

  function switchMap(mode) {
    if (!aiming() && mode==='aim') return;
    if(mode==='planets'&&(!aiming()||!A.level().placement))return;
    clearPointers(); mapMode=mode;sync();
    clearTimeout(hintTimer);
    const message=mode==='planets'?'Перетаскивай планеты внутри отмеченных зон. Прогноз сразу покажет новую трассу.':mode==='pan'?'Обзор не меняет курс. Масштаб — + / − или два пальца.':'Укажи направление от курьера. Дальше палец — сильнее запуск. Два пальца — обзор. Для полёта нажми «Запуск».';
    setText($('mapGestureHint'),message);$('mapGestureHint').hidden=false;
    hintTimer=setTimeout(()=>$('mapGestureHint').hidden=true,3400);
  }
  const custom={
    'ui:cockpit-tab':b=>selectCockpitTab(b.dataset.tab),
    'ui:menu':menu,'ui:mode':toggleDifficulty,'ui:save-settings':()=>O.V8.settings('save'),'ui:route':b=>openSheet('route',b),'ui:locate-goal':locateGoal,
    'ui:memory':b=>openSheet('memory',b),'ui:readout':b=>openSheet(screenMode()==='review'?'review':'memory',b),'ui:close-sheet':()=>closeSheet(),
    'ui:map-mode':b=>switchMap(b.dataset.mode),'ui:map-aim-close':()=>{A.closeModal();switchMap('aim');},'ui:map-pan-close':()=>{A.closeModal();switchMap('pan');},
    'ui:zoom-in':()=>zoom(1.25),'ui:zoom-out':()=>zoom(.8),
    'ui:pan-left':()=>panBy(-1,0),'ui:pan-right':()=>panBy(1,0),'ui:pan-up':()=>panBy(0,-1),'ui:pan-down':()=>panBy(0,1),
    'ui:zoom-reset':resetCamera,'ui:zoom-reset-close':()=>{resetCamera();A.closeModal();},
    'ui:map-menu':mapMenu,'ui:shortcuts':shortcuts,'ui:fullscreen':fullscreen,
    'ui:field':()=>{A.actions['toggle-grid']();mapMenu();},
    'ui:ship':()=>{const s=A.displayState()||A.level().start;A.camera={zoom:2.2,cx:s.x,cy:s.y};clampCamera();A.closeModal();sync();},
    'ui:retry-confirm':retryNow,'ui:limit-speed':useLaunchLimit
  };
  Object.assign(A.actions,custom);
  A.actions.help=()=>A.openModal('Один запуск. Точный маршрут.', '<p>Выбери угол и скорость, затем нажми <b>«Старт»</b>. Дальше капсулу ведёт притяжение планет.</p><div class="info-box"><b>Нажми название цели</b>, чтобы показать её на карте. В <b>«Плане»</b> видны этапы рейса, условия стыковки и медали. На телефоне числа курса внизу открывают точный пульт.</div><p><b>Курс / Обзор</b> переключают действие на карте. Масштаб меняется кнопками, колесом или двумя пальцами. Угол принимает точку и запятую. Кнопки + / − можно удерживать.</p><p>Запиши удачные параметры в <b>A/B</b>. После рейса можно перемотать запись и сравнить с предыдущей попыткой. Повтор бесплатный.</p><div class="modal-actions"><button class="button quiet" data-action="ui:shortcuts">Клавиши и жесты</button><button class="button primary" data-action="close">Понятно</button></div>');
  A.actions.retry=requestRetry;
  const originalLaunch=A.actions.launch;
  let keyboardCommitUntil = 0;
  // Touch focus moves before click. Remember that the press began in an editor.
  document.addEventListener('pointerdown', event => {
    if (event.target.closest('#mobileLaunch') && narrow() && editing()) keyboardCommitUntil = performance.now() + 1500;
  }, true);
  document.addEventListener('pointercancel', () => { keyboardCommitUntil = 0; });
  A.actions.launch=()=>{
    if (narrow() && (editing() || keyboardCommitUntil > performance.now())) { keyboardCommitUntil = 0; commitFocused(); return; }
    keyboardCommitUntil = 0;
    if (!commitFocused()) return;
    if(mobile()&&flying()){A.paused=!A.paused;A.accumulator=0;clearPointers();sync();return;}
    closeSheet(false);clearPointers();stopHold(); originalLaunch();sync();
  };
  // Compatibility commands retain the same camera controller.
  // Legacy v8 zoom events remain handled only by ui-v8; v9 buttons use ui: names.
  // Existing delegated handler from ui-v8 also knows v8 actions: do not reassign them there.
  document.addEventListener('click', event=>{
    const b=event.target.closest('[data-action]');if(!b)return;
    if(['store-course','recall-course'].includes(b.dataset.action)){const act=b.dataset.action,slot=b.dataset.slot;requestAnimationFrame(()=>{const replacement=document.querySelector(`[data-action="${act}"][data-slot="${slot}"]`);if(replacement&&!replacement.disabled)replacement.focus({preventScroll:true});});}
  });
  document.addEventListener('keydown',event=>{
    if(controlsBlocked()||A.screen!=='play'||event.defaultPrevented)return;
    if(event.target.matches('input,textarea,select,[contenteditable=true]'))return;
    const k=event.key.toLowerCase();
    if(event.target.closest('#launchTiming')&&k.startsWith('arrow'))return;
    if(event.target.closest('button,summary') && (k===' '||k==='enter'))return;
    if(document.body.dataset.resultView==='summary'&&[' ','arrowleft','arrowright','arrowup','arrowdown'].includes(k))return;
    if(![' ','r','к','g','п','escape','arrowleft','arrowright','arrowup','arrowdown'].includes(k))return;
    event.preventDefault();
    if(event.repeat&&[' ','r','к','escape'].includes(k))return;
    if(k===' ')return A.actions.launch();
    if(k==='r'||k==='к')return requestRetry();
    if(k==='g'||k==='п')return A.actions['toggle-grid']();
    if(k==='escape')return A.actions.pause();
    if(!aiming())return;
    if(mapMode==='planets'&&k.startsWith('arrow')){O.PlanetWorkshop.nudge(k,event.shiftKey?10:2);return;}
    const fine=event.shiftKey||A.profile.settings.fineAim,da=fine?.1:.5,ds=fine?1:2;
    if(k==='arrowleft')A.setAim(A.angle-da,A.speed);if(k==='arrowright')A.setAim(A.angle+da,A.speed);
    if(k==='arrowup')A.setAim(A.angle,A.speed+ds);if(k==='arrowdown')A.setAim(A.angle,A.speed-ds);
  });
  root.addEventListener('blur',()=>{stopHold();clearPointers();if(flying()&&!modal.open&&!drawer.open)A.actions.pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopHold();clearPointers();}});
  const oldSettings=O.V8.settings;
  O.V8.settings=function(tab){oldSettings(tab);};
  O.UI9={layout,sync,onPage,onLevel,onResult,beforeModal,afterModal,modalClosed,openSheet,closeSheet,
    numberValue,commitInput,zoom,resetCamera,focusReviewEvent,fitReviewTracks,clampCamera,clearPointers,switchMap,worldToScreen,worldPoint};
  $('flightDrawer').addEventListener('close',()=>{if(!drawer.open&&sheetState)closeSheet();});
  schedule();sync();
})(typeof globalThis!=='undefined'?globalThis:window);
