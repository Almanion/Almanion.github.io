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
  const aiming = () => A.screen === 'play' && !A.state && !A.transitioning;
  const flying = () => A.screen === 'play' && A.state?.status === 'flying';
  const controlsBlocked = () => modal.open || drawer.open || A.transitioning;
  const editing = () => ['angleInput', 'speedInput'].includes(document.activeElement?.id);
  let mapMode = coarse() ? 'pan' : 'aim', lastMode = '', pending = false, inputMessageTimer;
  let lastHeight = innerHeight, lastWidth = innerWidth, sheetState = null, modalFocus = null, lastInput = null;
  let lastLevel = null, hintTimer, lastFlightKey = '', initializedLive = false;
  const screenMode = () => !A.state ? 'aiming' : A.state.status === 'flying' ? 'running' : 'review';

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
  root.addEventListener('resize', schedule);
  root.visualViewport?.addEventListener('resize', schedule);
  root.visualViewport?.addEventListener('scroll', schedule);

  function onPage(page) {
    closeSheet(false); stopHold(); clearPointers();
    document.body.classList.remove('keyboard-editing');
    if (page !== 'play') { document.body.removeAttribute('data-flight'); lastMode = ''; }
    for (const b of $$('.topbar nav button,.mobile-nav button')) {
      const selected = b.dataset.page === page || page === 'play' && b.dataset.page === 'campaign';
      if (selected) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    schedule();
  }
  function onLevel() {
    closeSheet(false); clearPointers(); stopHold(); lastMode = ''; initializedLive = false;
    $('flightPlan').open = false;
    $('navMore').open = false;
    $('aimFeedback').hidden = true;
    $('flightReview').hidden = true;
    lastFlightKey = '';
    if (lastLevel !== A.currentId) mapMode = coarse() ? 'pan' : 'aim';
    lastLevel = A.currentId;
    sync(); schedule();
  }
  function onResult() {
    closeSheet(false); clearPointers(); sync(); schedule();
    $('flightReview').setAttribute('tabindex', '-1');
    // No focus jump: player may still be interacting with zoom or a button.
  }
  function initLive() {
    $('liveFlightPanel').innerHTML = `<div class="flight-live-state" id="liveState"></div>
      <div class="flight-fact"><small>СКОРОСТЬ ОТНОСИТЕЛЬНО СТАНЦИИ</small><strong id="liveVelocity">—</strong><span id="liveDock"></span></div>
      <div class="flight-progress-line"><span>Контейнеры на борту</span><b id="liveCargo">—</b></div>
      <div class="flight-progress-line"><span>Облёты</span><b id="liveOrbits">—</b></div>
      <div class="flight-progress-line"><span>Переходы</span><b id="livePortals">—</b></div>
      <div class="flight-progress-line" id="liveDropRow"><span>Адреса</span><b id="liveDrops">—</b></div>
      <p id="liveWarning" class="live-warning"></p>`;
    initializedLive = true;
  }
  function sync() {
    if (A.screen !== 'play') return;
    const mode = screenMode(), s = A.displayState(), l = A.displayLevel();
    if (mode !== lastMode) {
      document.body.dataset.flight = mode; lastMode = mode;
      if (mode !== 'aiming') clearPointers();
      schedule();
    }
    setText($('modeChip'), A.profile.difficulty === 'pro' ? 'PRO ×1,7' : 'Обычный');
    $('modeChip').title = A.state ? 'Режим меняется до запуска' : (A.profile.difficulty === 'pro' ? 'Нажми, чтобы включить обычный режим' : 'Нажми, чтобы включить PRO');
    $('saveBadge').hidden=A.storageOK;
    $('modeChip').classList.toggle('pro', A.profile.difficulty === 'pro');
    setText($('navModeLabel'), mode === 'aiming' ? 'Начальный импульс' : mode === 'review' ? 'Полёт завершён' : A.paused ? 'Полёт на паузе' : 'Капсула в полёте');
    setText($('fineAimButton'), A.profile.settings.fineAim ? '✓ Точно' : 'Точно');
    const text = !A.state ? 'Запуск ↗' : flying() ? (A.paused ? 'Продолжить' : 'Пауза') : 'Ещё раз ↺';
    setText($('launchButton'), text);
    setText($('mobileLaunch'), narrow() && editing() ? 'Готово ✓' : text);
    setText($('stagePill'), A.assisted ? 'ТРЕНИРОВКА · БЕЗ НАГРАД' : !A.state ? 'ГОТОВНОСТЬ' : flying() ? A.paused ? 'ПАУЗА' : 'ПОЛЁТ' : 'ЗАПИСЬ РЕЙСА');
    $('liveFlightPanel').hidden = mode === 'aiming';
    if (mode !== 'aiming' && s) {
      if (!initializedLive) initLive();
      setText($('liveState'), mode === 'review' ? 'ЗАПИСЬ ВЫПОЛНЕННОГО РЕЙСА' : A.paused ? 'ВРЕМЯ ОСТАНОВЛЕНО' : 'ОДИН ИМПУЛЬС · КУРС НЕ МЕНЯЕТСЯ');
      setText($('liveVelocity'), P.dockVelocity(s, A.level()).speed.toFixed(0) + ' ед./с');
      setText($('liveDock'), 'Допуск станции: ' + P.captureRadius(A.level(), A.stats()).toFixed(1));
      setText($('liveCargo'), O.Routes.collected(A.level(), s) + ' / ' + O.Routes.cargoIds(A.level(), s).length);
      setText($('liveOrbits'), (s.flybyIndex || 0) + ' / ' + (l.flybys?.length || 0));
      setText($('livePortals'), (s.portalIndex || 0) + ' / ' + (l.portalOrder?.length || 0));
      $('liveDropRow').hidden = !l.stops?.length;
      setText($('liveDrops'), (s.dropIndex || 0) + ' / ' + (l.stops?.length || 0));
      const lost = s.cargoBodies?.filter(c => c.phase === 'lost').length || 0;
      setText($('liveWarning'), lost ? `Потеряно контейнеров: ${lost}` : '');
    }
    const effectiveMode = mode === 'aiming' ? mapMode : 'pan';
    document.body.dataset.mapMode = effectiveMode;
    $('mapAim').disabled = mode !== 'aiming';
    $('mapAim').setAttribute('aria-pressed', String(effectiveMode === 'aim'));
    $('mapPan').setAttribute('aria-pressed', String(effectiveMode === 'pan'));
    setText($('mapFit'), A.camera.zoom <= 1.01 ? 'Вся карта' : Math.round(A.camera.zoom * 100) + '%');
    // Selected game status, not high-frequency counters, is announced to assistive tech.
    const flightKey = mode + ':' + (A.state?.reason || '') + ':' + A.paused;
    if (lastFlightKey !== flightKey) { lastFlightKey = flightKey; $('stagePill').setAttribute('aria-live', 'polite'); }
    for(const id of ['angleRange','speedRange']) { const e=$(id); e.style.setProperty('--range-fill', ((+e.value-+e.min)/(+e.max-+e.min)*100)+'%'); }
    const nextReady = mode === 'review' && s?.status === 'won' && !A.lastResult?.training && A.currentId < O.LEVELS.length - 1;
    const nextDesktop = $('nextLevelButton');
    if (nextDesktop) {
      nextDesktop.hidden = !nextReady;
      nextDesktop.disabled = A.transitioning;
      $('launchSecondary')?.classList.toggle('with-next', nextReady);
    }
    $('mobileLaunch').disabled = A.transitioning;
    $('launchButton').disabled = A.transitioning;
  }

  // Sheets MOVE existing nodes; there are no duplicate control IDs or mirror forms.
  function openSheet(kind, opener) {
    if (A.transitioning) return;
    closeSheet(false); A.closeModal(); commitFocused(); clearPointers(); stopHold();
    const node = kind === 'route' ? document.querySelector('.plan-body') : document.querySelector('.nav-advanced');
    const marker = document.createComment('sheet return point');
    node.before(marker);
    sheetState = {kind, node, marker, opener:opener || document.activeElement, paused:A.paused, state:A.state};
    if (flying()) A.paused = true;
    setText($('drawerTitle'), kind === 'route' ? 'План маршрута' : 'Курсы и оснащение');
    $('drawerContent').replaceChildren();
    if (kind !== 'route') {
      const shortcuts = document.createElement('div'); shortcuts.className = 'sheet-quick';
      shortcuts.innerHTML = `<button class="button quiet" data-action="fine-aim" id="sheetFine" ${A.state ? 'disabled' : ''} aria-pressed="${!!A.profile.settings.fineAim}">${A.profile.settings.fineAim ? '✓' : '◎'} Точная настройка</button><button class="button quiet" data-action="hint">Подсказка</button>`;
      $('drawerContent').append(shortcuts);
    }
    $('drawerContent').append(node);
    drawer.showModal(); drawer.scrollTop = 0;
    document.body.classList.add('sheet-open'); sync();
  }
  function closeSheet(restoreFocus = true) {
    if (!sheetState) { if (drawer.open) drawer.close(); return; }
    const x = sheetState; sheetState = null;
    x.marker.replaceWith(x.node);
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
  $('flightPlan').querySelector('summary').addEventListener('click', event => {
    event.preventDefault(); openSheet('route', event.currentTarget);
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
    const prev = A.currentId > 0 && G.unlocked(A.profile, A.currentId - 1);
    const next = A.currentId < O.LEVELS.length - 1 && G.unlocked(A.profile, A.currentId + 1);
    A.openModal(A.level().name, `<div class="ui-menu">
      <button data-action="ui:route"><span class="menu-symbol">⌁</span>План маршрута</button>
      <button data-action="medal-help"><span class="menu-symbol">✧</span>Условия медалей</button>
      <button data-action="contract-info"><span class="menu-symbol">▤</span>Задание</button>
      <button data-action="hint"><span class="menu-symbol">?</span>Подсказка</button>
      <button data-action="previous-level" ${prev ? '' : 'disabled'}><span>‹</span>Предыдущий</button>
      <button data-action="following-level" ${next ? '' : 'disabled'}>Следующий<span>›</span></button>
      <button data-action="nav" data-page="hangar"><span class="menu-symbol">⚙</span>Ангар</button>
      <button data-action="settings"><span class="menu-symbol">☷</span>Настройки</button>
      <button data-action="ui:mode"><span class="menu-symbol">◉</span>${A.profile.difficulty === 'pro' ? 'Выключить PRO' : 'Включить PRO'}</button>
      <button data-action="ui:shortcuts"><span class="menu-symbol">⌨</span>Управление</button>
      <button data-action="nav" data-page="campaign" class="wide">← Все контракты</button>
    </div><div class="modal-actions"><button class="button primary" data-action="close">К полёту</button></div>`, `КОНТРАКТ ${A.currentId + 1} / 80`);
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
      <button data-action="ui:zoom-reset-close">Вся карта · сброс масштаба</button>
      <button data-action="ui:fullscreen">Полный экран</button></div>
      <p>Курс — меняет угол и скорость. Обзор — двигает карту, не затрагивая запуск. Масштаб: два пальца, колесо или кнопки + / −.</p>
      <div class="modal-actions"><button class="button primary" data-action="close">Готово</button></div>`);
  }
  function shortcuts() {
    A.openModal('Управление', `<table class="shortcut-table"><tbody>
      <tr><td>Пробел</td><td>Запуск / пауза</td></tr><tr><td>← → / ↑ ↓</td><td>Угол / скорость</td></tr>
      <tr><td>Shift + стрелки</td><td>0,1° / 1 ед.</td></tr><tr><td>R / К</td><td>Повтор с подтверждением во время полёта</td></tr>
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
    if (!aiming() || controlsBlocked()) return;
    const n = Number(event.target.value);
    A.setAim(id === 'angleRange' ? n : A.angle, id === 'speedRange' ? n : A.speed);
  });

  let held = null, holdDelay = 0, holdRepeat = 0;
  const suppressClick = new WeakMap();
  function stopHold() { clearTimeout(holdDelay); clearInterval(holdRepeat); held = null; }
  function nudge(button) {
    if (!aiming() || controlsBlocked()) return;
    A.actions[button.dataset.action]?.(button);
  }
  document.addEventListener('pointerdown', event => {
    const b = event.target.closest('.number-wrap button');
    if (!b || b.disabled || event.button !== 0 || !aiming() || controlsBlocked()) return;
    commitFocused(); stopHold(); held = {button:b, id:event.pointerId};
    suppressClick.set(b, performance.now() + 1800); nudge(b);
    try { b.setPointerCapture(event.pointerId); } catch (_) {}
    holdDelay = setTimeout(() => {
      holdRepeat = setInterval(() => {
        if (!held || !aiming() || controlsBlocked()) return stopHold();
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
    const r = canvas.getBoundingClientRect(), fit = Math.min(r.width / 1200, r.height / 700);
    return {r, fit:Math.max(.001, fit)};
  }
  function worldPoint(x, y) {
    const {r,fit} = metrics();
    return {x:A.camera.cx + (x - r.left - r.width / 2) / fit / A.camera.zoom,
      y:A.camera.cy + (y - r.top - r.height / 2) / fit / A.camera.zoom};
  }
  function clampCamera() {
    const c = A.camera, {r,fit} = metrics();
    c.zoom = P.clamp(c.zoom, 1, 4);
    const hw = Math.min(600, r.width / (2 * fit * c.zoom));
    const hh = Math.min(350, r.height / (2 * fit * c.zoom));
    const edge = Math.max(28, 64 / c.zoom);
    c.cx = P.clamp(c.cx, hw - edge, 1200 - hw + edge);
    c.cy = P.clamp(c.cy, hh - edge, 700 - hh + edge);
  }
  function zoom(factor, x, y) {
    const {r} = metrics(); x ??= r.left + r.width / 2; y ??= r.top + r.height / 2;
    const before = worldPoint(x,y); A.camera.zoom = P.clamp(A.camera.zoom * factor,1,4);
    const after = worldPoint(x,y); A.camera.cx += before.x - after.x; A.camera.cy += before.y - after.y;
    clampCamera(); sync();
  }
  function resetCamera() { A.camera = {zoom:1,cx:600,cy:350}; sync(); }
  function clearPointers() {
    for (const id of pointers.keys()) { try { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); } catch (_) {} }
    pointers.clear(); gesture = null; A.mapGesture = false; document.body.classList.remove('map-dragging');
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
      gesture = {kind:pan ? 'pan' : 'aim',x:p.x,y:p.y,cam:{...A.camera},angle:A.angle,speed:A.speed,type:event.pointerType,moved:false};
      document.body.classList.toggle('map-dragging',pan);
    } else if (pointers.size === 2) {
      const m = midpoint();
      if (gesture?.kind === 'aim' && aiming()) A.setAim(gesture.angle,gesture.speed);
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
      A.camera.cx=g.cam.cx-(event.clientX-g.x)/fit/A.camera.zoom;
      A.camera.cy=g.cam.cy-(event.clientY-g.y)/fit/A.camera.zoom;
      clampCamera();sync();
    } else if (g.kind==='aim' && aiming()) {
      const dx=event.clientX-g.x,dy=event.clientY-g.y;
      if (!g.moved && Math.hypot(dx,dy)<5) return; g.moved=true;
      if (g.type==='touch') {
        A.setAim(g.angle+dx*(A.profile.settings.fineAim?.12:.6),g.speed-dy*(A.profile.settings.fineAim?.25:1));
      } else {
        const p=worldPoint(event.clientX,event.clientY),start=A.level().start,wx=p.x-start.x,wy=p.y-start.y;
        if (Math.hypot(wx,wy)>15) A.setAim(P.deg(Math.atan2(-wy,wx)),Math.hypot(wx,wy));
      }
    }
    event.preventDefault();
  });
  function releasePointer(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    try { if(canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); } catch(_){}
    if (!pointers.size) clearPointers();
    else if(gesture?.kind==='pinch') gesture={kind:'locked'};
  }
  canvas.addEventListener('pointerup',releasePointer);
  canvas.addEventListener('pointercancel',()=>clearPointers());
  canvas.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId))releasePointer(e);});
  canvas.addEventListener('wheel',event=>{
    if (controlsBlocked() || event.ctrlKey) return; // preserve browser accessibility zoom
    event.preventDefault();zoom(event.deltaY<0?1.12:1/1.12,event.clientX,event.clientY);
  },{passive:false});
  canvas.addEventListener('contextmenu',event=>event.preventDefault());

  function switchMap(mode) {
    if (!aiming() && mode==='aim') return;
    clearPointers(); mapMode=mode;sync();
    clearTimeout(hintTimer);
    const message=mode==='pan'?'Обзор не меняет курс. Масштаб — + / − или два пальца.':coarse()?'Проведи по карте: ↔ угол, ↕ скорость. Отпускание не запускает.':'Потяни в сторону полёта. Дальше от капсулы — сильнее импульс.';
    setText($('mapGestureHint'),message);$('mapGestureHint').hidden=false;
    hintTimer=setTimeout(()=>$('mapGestureHint').hidden=true,3400);
  }
  const custom={
    'ui:menu':menu,'ui:mode':toggleDifficulty,'ui:save-settings':()=>O.V8.settings('save'),'ui:route':b=>openSheet('route',b),
    'ui:memory':b=>openSheet('memory',b),'ui:close-sheet':()=>closeSheet(),
    'ui:map-mode':b=>switchMap(b.dataset.mode),'ui:map-aim-close':()=>{A.closeModal();switchMap('aim');},'ui:map-pan-close':()=>{A.closeModal();switchMap('pan');},
    'ui:zoom-in':()=>zoom(1.25),'ui:zoom-out':()=>zoom(.8),
    'ui:zoom-reset':resetCamera,'ui:zoom-reset-close':()=>{resetCamera();A.closeModal();},
    'ui:map-menu':mapMenu,'ui:shortcuts':shortcuts,'ui:fullscreen':fullscreen,
    'ui:field':()=>{A.actions['toggle-grid']();mapMenu();},
    'ui:ship':()=>{const s=A.displayState()||A.level().start;A.camera={zoom:2.2,cx:s.x,cy:s.y};clampCamera();A.closeModal();sync();},
    'ui:retry-confirm':retryNow
  };
  Object.assign(A.actions,custom);
  A.actions.help=()=>A.openModal('Один запуск. Точный маршрут.', '<p>Выбери угол и скорость, затем нажми <b>«Запуск»</b>. Дальше капсулу ведёт притяжение планет.</p><div class="info-box"><b>Три цели над картой</b> — условия медалей. Нажми на них, чтобы прочитать подробности. Строка <b>«Дальше»</b> открывает план облётов, порталов и доставок.</div><p><b>Курс / Обзор</b> переключают действие на карте. Масштаб — кнопками, колесом или двумя пальцами. Угол принимает точку и запятую; кнопки + / − можно удерживать.</p><p>Запиши удачные параметры в <b>A/B</b>. После рейса можно перемотать запись и сравнить с предыдущей попыткой. Повтор бесплатный.</p><div class="modal-actions"><button class="button quiet" data-action="ui:shortcuts">Клавиши и жесты</button><button class="button primary" data-action="close">Понятно</button></div>');
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
    closeSheet(false);clearPointers();stopHold(); originalLaunch();sync();
  };
  // Compatibility commands retain the same camera controller.
  // Legacy v8 zoom events remain handled only by ui-v8; v9 buttons use ui: names.
  // Existing delegated handler from ui-v8 also knows v8 actions: do not reassign them there.
  document.addEventListener('click', event=>{
    const b=event.target.closest('[data-action]');if(!b)return;
    if(['store-course','recall-course'].includes(b.dataset.action)){const act=b.dataset.action,slot=b.dataset.slot;requestAnimationFrame(()=>{const replacement=document.querySelector(`[data-action="${act}"][data-slot="${slot}"]`);if(replacement&&!replacement.disabled)replacement.focus({preventScroll:true});});}
    if(b.dataset.action==='fine-aim' && drawer.open) {
      requestAnimationFrame(()=>{if($('sheetFine')){setText($('sheetFine'),(A.profile.settings.fineAim?'✓ ':'◎ ')+'Точная настройка');$('sheetFine').setAttribute('aria-pressed',String(!!A.profile.settings.fineAim));}});
    }
  });
  document.addEventListener('keydown',event=>{
    if(controlsBlocked()||A.screen!=='play'||event.defaultPrevented)return;
    if(event.target.matches('input,textarea,select,[contenteditable=true]'))return;
    const k=event.key.toLowerCase();
    if(event.target.closest('button,summary') && (k===' '||k==='enter'))return;
    if(![' ','r','к','g','п','escape','arrowleft','arrowright','arrowup','arrowdown'].includes(k))return;
    event.preventDefault();
    if(event.repeat&&[' ','r','к','escape'].includes(k))return;
    if(k===' ')return A.actions.launch();
    if(k==='r'||k==='к')return requestRetry();
    if(k==='g'||k==='п')return A.actions['toggle-grid']();
    if(k==='escape')return A.actions.pause();
    if(!aiming())return;
    const fine=event.shiftKey||A.profile.settings.fineAim,da=fine?.1:.5,ds=fine?1:2;
    if(k==='arrowleft')A.setAim(A.angle-da,A.speed);if(k==='arrowright')A.setAim(A.angle+da,A.speed);
    if(k==='arrowup')A.setAim(A.angle,A.speed+ds);if(k==='arrowdown')A.setAim(A.angle,A.speed-ds);
  });
  root.addEventListener('blur',()=>{stopHold();clearPointers();if(flying()&&!modal.open&&!drawer.open)A.actions.pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopHold();clearPointers();}});
  const oldSettings=O.V8.settings;
  O.V8.settings=function(tab){oldSettings(tab);};
  O.UI9={layout,sync,onPage,onLevel,onResult,beforeModal,afterModal,modalClosed,openSheet,closeSheet,
    numberValue,commitInput,zoom,resetCamera,clampCamera,clearPointers,switchMap};
  // Native button names follow function; details remain available without redundant labels.
  document.querySelector('.hero-meta').lastElementChild.textContent='Офлайн';
  $('flightDrawer').addEventListener('close',()=>{if(!drawer.open&&sheetState)closeSheet();});
  schedule();sync();
})(typeof globalThis!=='undefined'?globalThis:window);
