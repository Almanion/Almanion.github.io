(function (root) {
  'use strict';
  const E = root.EclipseEngine, B = root.EclipseBattle, $ = id => document.getElementById(id), KEY = 'orbital-eclipse-operation-v1';
  const NAMES = { breach: 'Удар с тыла', rebound: 'Вернуть залп', escort: 'Прикрыть звено' };
  const PHASES = [
    { title: 'За тенью луны', objective: 'Пройди над луной и захвати узел. Его поле позволит атаковать крепость.', radio: 'Луна прикроет заход. Найди курс к светящемуся узлу над её краем.', intel: 'Крепость стреляет каждые 5 с. Тень луны закрывает корабль от огня; каждый залп ослабляет союзный флот.' },
    { title: 'Открыть крепость', objective: '', radio: 'Узел наш. Выбери способ атаки и настрой гравитационный якорь.', intel: '' },
    { title: 'Живым из огня', objective: 'Дойди до синего коридора слева вверху. Луна притягивает корабль, обломки движутся.', radio: 'Щит погас. «Заря» начинает атаку. Твой коридор выхода — слева вверху.', intel: 'Следы обломков показывают их движение. Прогноз учитывает момент встречи: иногда достаточно изменить скорость.' }
  ];
  const TACTIC_INFO = {
    breach: { objective: 'Обойди крепость справа. Удержись в подсвеченном секторе 0,8 с — корабль автоматически расстреляет генератор.', intel: 'Стрелять можно с тыла на расстоянии до 205 м. Якорь притягивает корабль: используй его, чтобы загнуть курс за щит.' },
    rebound: { objective: 'Ты управляешь захваченным залпом. Якорь должен развернуть снаряд и вернуть его в крепость.', intel: 'Уведи залп за пунктирную линию разворота, затем верни к реактору. Снаряд должен лететь обратно вправо. В этом режиме поле якоря мощнее.' },
    escort: { objective: 'Прикрой бомбардировщик хотя бы во время одного из двух залпов: на 4,5 и 7,5 с. Его курс отмечен золотом.', intel: 'Союзник защищён в радиусе 145 м от тебя. Он выдержит одно попадание; на 9-й секунде уничтожит генератор. Прикрыть оба залпа — лучший результат.' }
  };
  const REFERENCES = { approach: { angle: -51, speed: 85, ax: 760, ay: 410 }, breach: { angle: 10, speed: 145, ax: 805, ay: 195 }, rebound: { angle: 165, speed: 65, ax: 735, ay: 335 }, escort: { angle: 45, speed: 65, ax: 560, ay: 90 } };
  let saved; try { saved = JSON.parse(localStorage.getItem(KEY)); } catch {}
  if (!saved || ![1, 2].includes(saved.version)) saved = {};
  let operationId = E.operation(saved.operation).id;
  const operations = Object.fromEntries(E.OPERATIONS.filter(o => saved.operations?.[o.id]).map(o => [o.id, saved.operations[o.id]]));
  // Keep the current snapshot at the top level, and migrate the original single-operation save.
  operations[operationId] = { ...saved, operations: undefined };
  let campaign = {}; try { campaign = JSON.parse(localStorage.getItem('orbital-courier-save-v8'))?.settings || {}; } catch {}
  const settings = { sound: typeof saved.settings?.sound === 'boolean' ? saved.settings.sound : campaign.sound === true,
    reduced: typeof saved.settings?.reduced === 'boolean' ? saved.settings.reduced : matchMedia('(prefers-reduced-motion:reduce)').matches || campaign.reducedMotion === true, forecast: saved.settings?.forecast !== false };
  const finite = (n, fallback, lo, hi) => Number.isFinite(n) ? E.clamp(n, lo, hi) : fallback;
  const cleanCarry = v => ({ x: finite(v?.x, 960, 15, E.W - 15), y: finite(v?.y, 210, 20, E.H - 20), fleet: Math.round(finite(v?.fleet, 6, 1, 6)), jam: finite(v?.jam, 0, 0, 1) });
  let phase = [0, 1, 2].includes(saved.phase) ? saved.phase : 0, tactic = E.TACTICS.includes(saved.tactic) ? saved.tactic : 'breach';
  let carry = phase ? cleanCarry(saved.carry) : { fleet: 6 };
  const cleanCompleted = list => Array.isArray(list) ? list.slice(0, 3).filter(x => x && [0, 1, 2].includes(x.phase)).map(x => ({ phase: x.phase, time: finite(x.time, 0, 0, 24), hull: finite(x.hull, 3, 0, 3), fleet: finite(x.fleet, 6, 0, 6), ally: finite(x.ally, 2, 0, 2), signal: x.signal === true })) : [];
  let completed = cleanCompleted(saved.completed);
  let attempts = Math.round(finite(saved.attempts, 0, 0, 99999)), hints = Math.round(finite(saved.hints, 0, 0, 99999)), plans = {}, best = {};
  for (const t of E.TACTICS) {
    if (saved.best?.[t] && Number.isFinite(saved.best[t].time)) best[t] = { time: finite(saved.best[t].time, 72, 0, 72), fleet: finite(saved.best[t].fleet, 1, 1, 6) };
    for (const p of [0, 1, 2]) { const key = `${p}:${t}`; if (saved.plans?.[key]) plans[key] = E.cleanPlan(saved.plans[key], p, t); }
  }
  let plan, state, prediction, previous = null, mode = 'plan', editing = false, speed = 1, accumulator = 0, last = 0, eventIndex = 0, renderTime = 0, lastViewKey = '';
  let hintPlan = null, pendingNext = null, dirty = false, resumeMode = 'running', finished = saved.finished === true && completed.length === 3;
  let undo = [], redo = [], editStart = null, gesture = null, holdTimer = 0, heldButton = null, pointerButton = null;
  const pointers = new Set();
  const battle = new B.Timeline();
  const renderer = new root.EclipseRenderer($('battlefield')), sound = new root.Orbital.Sound(); sound.enabled = settings.sound; sound.setVolume(.35);
  const dialogs = [...document.querySelectorAll('dialog')], isDialogOpen = () => dialogs.some(d => d.open);
  let camera = 'overview';
  function snapshot(override = {}) { return { version: 2, operation: operationId, phase, tactic, carry, completed, attempts, hints, plans, best, settings, finished, final: finished ? { x: state.x, y: state.y, t: state.t } : undefined, ...override }; }
  function save(override) {
    const current = snapshot(override); operations[operationId] = current;
    try { localStorage.setItem(KEY, JSON.stringify({ ...current, operations })); $('saveStatus').textContent = 'Операция сохранена на этом устройстве'; }
    catch { $('saveStatus').textContent = 'Хранилище недоступно · попытка остаётся в этой вкладке'; }
    $('deviceSaveStatus').textContent = $('saveStatus').textContent;
  }
  function openDialog(id) { stopInput(); accumulator = 0; sound.silence(); if (!$(id).open) $(id).showModal(); }
  function closeDialog(id) { $(id).close(); last = performance.now(); accumulator = 0; }
  function setRadio(text) { if ($('radioText').textContent !== text) $('radioText').textContent = text; }
  function reference() {
    if (phase === 0) return { ...REFERENCES.approach, ...(operationId === 'rift' ? { angle: -54, speed: 77.5 } : operationId === 'pulsar' ? { angle: -50.5, speed: 90 } : {}), delay: 0 };
    return { ...REFERENCES[tactic], delay: operationId === 'pulsar' ? tactic === 'escort' ? .5 : 2 : 0 };
  }
  function setup(initial = false) {
    stopInput(); undo = []; redo = []; editStart = null;
    plan = plans[`${phase}:${tactic}`] || { ...E.defaults(phase, tactic) };
    if (!plans[`${phase}:${tactic}`] && phase < 2) plan = { ...reference(), angle: reference().angle + (phase === 0 ? -3 : tactic === 'rebound' ? 8 : 10), delay: 0 };
    plan = E.cleanPlan(plan, phase, tactic);
    state = E.create(phase, tactic, plan, carry, operationId); mode = 'plan'; accumulator = 0; eventIndex = 0; editing = false; pendingNext = null; battle.reset();
    if (!initial) previous = null;
    const meta = PHASES[phase], info = phase === 1 ? TACTIC_INFO[tactic] : meta;
    const operation = E.operation(operationId);
    document.title = operation.name + ' — боевая операция';
    $('operationName').textContent = operation.name.toUpperCase(); $('operationTag').textContent = operation.tag; $('operationDetail').textContent = operation.detail;
    $('phaseLabel').textContent = `МАНЁВР 0${phase + 1} / 03`; $('objectiveTitle').textContent = operation.titles[phase]; $('objectiveText').textContent = info.objective; $('intelText').textContent = info.intel; setRadio(meta.radio);
    $('mobileObjective').textContent = info.objective;
    $('tactics').hidden = phase !== 1; $('anchorControls').hidden = phase !== 1;
    $('hullLabel').textContent = phase === 1 && tactic === 'rebound' ? 'КОРАБЛЬ В УКРЫТИИ' : 'ТВОЙ КОРПУС';
    $('mapHint').textContent = 'Потяни по карте, чтобы задать курс';
    for (let i = 0; i < 3; i++) { $('step' + i).classList.toggle('done', i < phase); if (i === phase) $('step' + i).setAttribute('aria-current', 'step'); else $('step' + i).removeAttribute('aria-current'); }
    document.querySelectorAll('[data-tactic]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tactic === tactic)));
    writeInputs(); forecast(); sync();
  }
  function writeInputs(keepFocused = true) {
    for (const name of ['angle', 'speed']) { if (!keepFocused || document.activeElement !== $(name)) $(name).value = String(plan[name]); $(name + 'Range').value = String(plan[name]); }
    for (const [id, key] of [['anchorX', 'ax'], ['anchorY', 'ay']]) if (!keepFocused || document.activeElement !== $(id)) $(id).value = String(plan[key]);
    $('delay').value = String(plan.delay); $('delayValue').textContent = plan.delay ? plan.delay.toFixed(2).replace(/0$/, '') + ' с' : 'Сразу';
    $('delayToggle').textContent = plan.delay ? 'Старт +' + plan.delay.toFixed(2).replace(/0$/, '') + ' с' : 'Старт сразу';
  }
  function forecast() {
    prediction = E.simulate(phase, tactic, plan, carry, operationId); dirty = false;
    const good = prediction.status === 'won'; $('forecastStatus').dataset.good = String(good);
    $('forecastTitle').textContent = !settings.forecast ? 'Прогноз скрыт' : good ? 'Манёвр достижим' : 'Курс требует внимания';
    $('forecastDetail').textContent = !settings.forecast ? 'Включи прогноз, чтобы проверить курс.' : good ? `${prediction.t.toFixed(1)} с · флот ${prediction.fleet}/6${prediction.signal ? ' · ретранслятор захвачен' : ''}${phase === 1 && tactic === 'escort' ? ' · прикрыто залпов: ' + prediction.coverCount + '/2' : ''}` : prediction.reason;
    $('courseStatus').textContent = !settings.forecast ? 'Прогноз скрыт' : good ? 'Курс рассчитан · ' + prediction.t.toFixed(1) + ' с' : prediction.reason;
    $('courseStatus').dataset.good = String(good);
    $('windowForecast').textContent = $('forecastTitle').textContent + ' · ' + $('forecastDetail').textContent;
    $('windowForecast').dataset.good = String(good);
  }
  function samePlan(a, b) { return a && b && ['angle', 'speed', 'ax', 'ay', 'delay'].every(k => a[k] === b[k]); }
  function beginEdit() { if (mode === 'plan' && !editStart) editStart = { ...plan }; }
  function remember(old) { undo.push({ ...old }); if (undo.length > 40) undo.shift(); redo = []; }
  function finishEdit(cancel = false) {
    const before = editStart; editStart = null;
    if (before && !samePlan(before, plan)) {
      if (cancel) updatePlan(before, false); else { remember(before); save(); }
    }
    syncEditor();
  }
  function syncEditor() {
    const locked = mode !== 'plan';
    $('undoPlan').disabled = locked || !undo.length; $('redoPlan').disabled = locked || !redo.length;
    $('courseTool').disabled = locked; $('delayToggle').disabled = locked;
    $('courseTool').setAttribute('aria-pressed', String(!editing)); $('anchorTool').setAttribute('aria-pressed', String(editing));
    $('anchorTool').hidden = phase !== 1;
    $('mapHint').textContent = editing ? 'Перетащи якорь · стрелки перемещают его' : 'Потяни по карте · ← → курс, ↑ ↓ импульс';
    document.body.dataset.tool = editing ? 'anchor' : 'course';
  }
  function updatePlan(change, record = true) {
    if (mode !== 'plan') return; const nextPlan = E.cleanPlan({ ...plan, ...change }, phase, tactic);
    if (samePlan(plan, nextPlan)) return;
    if (record && !editStart) remember(plan);
    plan = nextPlan; plans[`${phase}:${tactic}`] = { ...plan };
    state = E.create(phase, tactic, plan, carry, operationId); writeInputs(); dirty = true;
    if (!editStart) save(); syncEditor(); renderer.needsDraw = true;
  }
  function travelHistory(forward = false) {
    if (mode !== 'plan') return; stopInput(); const source = forward ? redo : undo, destination = forward ? undo : redo;
    if (!source.length) return; destination.push({ ...plan }); updatePlan(source.pop(), false); writeInputs(false); forecast();
  }
  function setTool(anchor) {
    if (mode !== 'plan') return; stopInput(); editing = anchor && phase === 1;
    if (editing) camera = 'overview'; renderer.needsDraw = true; sync();
  }
  function stopHold() { clearTimeout(holdTimer); holdTimer = 0; heldButton = null; }
  function stopInput(cancel = false) {
    stopHold(); gesture = null; pointers.clear(); if (editStart) finishEdit(cancel);
  }
  function sync() {
    const cinematic = mode === 'cinematic' || mode === 'paused' && resumeMode === 'cinematic';
    const running = mode === 'running' || mode === 'paused' || cinematic, locked = mode !== 'plan';
    $('stateBadge').textContent = mode === 'running' ? 'МАНЁВР ВЫПОЛНЯЕТСЯ' : mode === 'paused' ? 'ТАКТИЧЕСКАЯ ПАУЗА' : cinematic ? 'ПРОРЫВ ФЛОТА' : mode === 'review' ? state.status === 'won' ? 'МАНЁВР ЗАВЕРШЁН' : 'РАЗБОР ПОЛЁТА' : 'ПЛАНИРОВАНИЕ';
    $('stateBadge').classList.toggle('live', mode === 'running'); $('timer').textContent = state.t.toFixed(2).padStart(5, '0') + ' с';
    $('fleetValue').textContent = `${state.fleet} / 6`; $('fleetMeter').style.width = state.fleet / 6 * 100 + '%'; $('hullValue').textContent = `${state.hull} / 3`; $('hullMeter').style.width = state.hull / 3 * 100 + '%';
    $('mobileVitals').textContent = `Флот ${state.fleet}/6 · Корпус ${state.hull}/3`;
    for (const id of ['angle', 'angleRange', 'speed', 'speedRange', 'anchorX', 'anchorY', 'anchorTool', 'delay']) $(id).disabled = locked;
    document.querySelectorAll('[data-adjust]').forEach(b => b.disabled = locked);
    document.querySelectorAll('[data-tactic]').forEach(b => b.disabled = locked);
    $('launch').hidden = running; $('pause').hidden = !running; $('shield').hidden = !running || cinematic || phase === 1 && tactic === 'rebound';
    $('rate').disabled = cinematic; $('battleMoment').hidden = !cinematic;
    $('launch').textContent = mode === 'review' ? state.status === 'won' ? phase === 2 ? 'Итоги операции ↗' : 'Следующий манёвр ↗' : 'Изменить курс ↗' : 'Выполнить манёвр ↗';
    $('pause').textContent = mode === 'paused' ? 'Продолжить ▶' : 'Пауза Ⅱ'; $('shield').disabled = state.shieldUsed;
    $('shield').textContent = state.shield > 0 ? 'Щит · ' + state.shield.toFixed(1) + ' с' : state.shieldUsed ? 'Щит использован' : compact.matches ? 'Щит' : 'Щит · E';
    $('shield').dataset.active = String(state.shield > 0); $('anchorTool').setAttribute('aria-pressed', String(editing));
    $('soundEnabled').checked = settings.sound; $('reducedMotion').checked = settings.reduced; $('showForecast').checked = settings.forecast;
    $('forecastToggle').setAttribute('aria-pressed', String(settings.forecast)); $('forecastToggle').lastElementChild.textContent = settings.forecast ? 'вкл.' : 'выкл.';
    $('cameraToggle').setAttribute('aria-pressed', String(camera === 'follow')); $('cameraToggle').textContent = camera === 'follow' ? 'Вся карта' : 'Крупнее ⊕';
    $('tacticalButton').textContent = phase === 1 ? NAMES[tactic] + ' · тактика' : 'Задача и курс';
    $('signalStatus').textContent = state.signal || completed.some(x => x.signal) ? state.jam ? 'Ретранслятор готов · заглушит залп' : 'Ретранслятор захвачен' : 'Бонус: захватить золотой ретранслятор';
    $('signalStatus').hidden = phase !== 0 && !state.jam;
    const storm = E.stormAt(state), charge = phase === 1 && tactic === 'breach' ? state.charge / .8 : 0;
    $('combatStatus').textContent = mode === 'running' && state.flightT === 0 ? `Старт через ${(plan.delay - state.t).toFixed(1)} с` : charge > 0 && mode === 'running' ? `Огонь по генератору · ${Math.round(charge * 100)}%` : storm ? `${storm.active ? 'Ионный фронт' : 'Безопасное окно'} · ${storm.remaining.toFixed(1)} с` : phase === 1 && tactic === 'escort' ? `Прикрыто ${state.coverCount}/2 · звено ${state.allyHull}/2` : state.jam ? 'Следующий залп будет заглушён' : 'Залп крепости · ' + (5 - state.t % 5).toFixed(1) + ' с';
    $('combatStatus').hidden = cinematic || mode === 'review' || phase === 2 && !storm;
    $('combatStatus').dataset.warning = String(!!storm?.active);
    document.body.dataset.reduced = String(settings.reduced); document.body.dataset.phase = String(phase); document.body.dataset.mode = mode; document.body.dataset.camera = camera;
    syncEditor();
  }
  function launch() {
    if (mode === 'review') { if (state.status === 'won') phase === 2 ? outcome() : next(); else retry(); return; }
    if (mode !== 'plan' || isDialogOpen()) return;
    stopInput();
    forecast(); plans[`${phase}:${tactic}`] = { ...plan }; state = E.create(phase, tactic, plan, carry, operationId); mode = 'running'; editing = false; attempts++; accumulator = 0; eventIndex = 0; battle.reset(); save();
    sound.unlock(); sound.play('launch'); setRadio(phase === 1 && tactic === 'rebound' ? 'Залп под нашим контролем. Поле должно вернуть его к реактору.' : 'Импульс дан. Наблюдаю за курсом.'); sync();
  }
  function pause() { if (!['running', 'paused', 'cinematic'].includes(mode)) return; if (mode === 'paused') mode = resumeMode; else { resumeMode = mode; mode = 'paused'; } accumulator = 0; sound.silence(); sync(); }
  function retry() {
    stopInput();
    dialogs.forEach(d => { if (d.open) d.close(); }); previous = state.t > 0 ? state : previous; completed = completed.filter(x => x.phase < phase); finished = false;
    state = E.create(phase, tactic, plan, carry, operationId); mode = 'plan'; accumulator = 0; eventIndex = 0; pendingNext = null; battle.reset(); sound.silence(); forecast(); sync(); save(); setRadio('Курс можно изменить. Предыдущая траектория осталась на карте.');
  }
  function endManeuver() {
    mode = 'review'; accumulator = 0; sound.silence();
    if (state.status === 'won') {
      completed = completed.filter(x => x.phase < phase).concat({ phase, time: state.t, hull: state.hull, fleet: state.fleet, ally: state.allyHull, signal: state.signal });
      pendingNext = { phase: Math.min(2, phase + 1), carry: { fleet: state.fleet, jam: state.jam, x: phase === 0 || tactic === 'rebound' && phase === 1 ? E.NODE.x : state.x, y: phase === 0 || tactic === 'rebound' && phase === 1 ? E.NODE.y : state.y } };
      if (phase === 2) { finished = true; const time = completed.reduce((sum, r) => sum + r.time, 0); if (!best[tactic] || time < best[tactic].time) best[tactic] = { time, fleet: state.fleet }; save({ final: { x: state.x, y: state.y, t: state.t } }); }
      else save(pendingNext);
    } else { save(); }
    if (state.status === 'won' && phase === 1) {
      // Save the checkpoint before presentation; skipping/reloading never loses a victory.
      mode = 'cinematic'; battle.beginBreak(state); setRadio('Лира: генератор поражён. Всем кораблям — приготовиться к прорыву.'); sync();
      $('battlefield').scrollIntoView({ block: 'nearest', behavior: 'instant' });
    } else { setRadio(state.reason); sync(); outcome(); sound.play(state.status === 'won' ? 'win' : 'fail'); }
  }
  function finishBattle() { if (battle.breakAge === null || mode === 'review') return; battle.time = Math.max(battle.time, battle.breakAt + B.DURATION); mode = 'review'; accumulator = 0; setRadio('«Заря»: коридор открыт. Все батареи ведут огонь. Лира, выводи корабль!'); sync(); outcome(); }
  function battleCaption() {
    const age = battle.breakAge; if (age === null) return;
    const step = age < .4 ? 0 : age < 1.35 ? 1 : 2;
    const lines = [['ГЕНЕРАТОР ПОРАЖЁН', 'Щит теряет питание'], ['КОРИДОР ОТКРЫТ', 'Защита крепости разрушена'], ['ФЛАГМАН «ЗАРЯ»', 'Всем батареям — огонь']];
    if ($('momentLabel').textContent !== lines[step][0]) { $('momentLabel').textContent = lines[step][0]; $('momentTitle').textContent = lines[step][1]; }
    if (step === 1) setRadio('Лира: щит разрушен. Коридор чист!');
    if (step === 2) setRadio('«Заря»: начинаем прорыв. Звеньям — за флагманом.');
  }
  function outcome() {
    const won = state.status === 'won', final = won && phase === 2;
    $('outcomeEyebrow').textContent = final ? 'ОПЕРАЦИЯ ЗАВЕРШЕНА / ' + NAMES[tactic].toUpperCase() : `МАНЁВР 0${phase + 1} / ${won ? 'ВЫПОЛНЕН' : 'ПОВТОР ДОСТУПЕН'}`;
    $('outcomeTitle').textContent = final ? 'Коридор открыт.' : won ? phase === 0 ? 'Узел наш.' : 'Крепость открыта.' : 'Скорректируем курс.';
    $('outcomeText').textContent = final ? `Операция «${E.operation(operationId).name}» завершена. «Заря» прошла за щит, ты вернулся из боя.${completed.some(x => x.signal) ? ' Ретранслятор перехвачен — дополнительная цель выполнена.' : ''}` : state.reason;
    const time = final ? completed.reduce((sum, r) => sum + r.time, 0) : state.t;
    const stats = final ? [['ВРЕМЯ МАНЁВРОВ', time.toFixed(1) + ' с'], ['ФЛОТ СОХРАНЁН', state.fleet + ' / 6'], ['ЗАПУСКОВ', attempts]] : [['ВРЕМЯ', time.toFixed(1) + ' с'], ['ФЛОТ', state.fleet + ' / 6'], ['КОРПУС', state.hull + ' / 3']];
    $('outcomeStats').replaceChildren(...stats.map(([name, value]) => { const div = document.createElement('div'), label = document.createElement('span'), strong = document.createElement('strong'); label.textContent = name; strong.textContent = value; div.append(label, strong); return div; }));
    $('outcomeAdvice').textContent = final ? `Пройдено способов: ${Object.keys(best).length} / 3. ${hints ? 'Использовано подсказок: ' + hints + '.' : 'Самостоятельный расчёт, без подсказок.'} Попробуй другой способ атаки: он меняет задачу второго этапа.` : won ? phase === 0 ? 'Контрольная точка сохранена. Теперь можно выбрать одну из трёх тактик и перемещать гравитационный якорь.' : 'Контрольная точка сохранена. Впереди движущиеся обломки и выход из зоны боя.' : 'Вернись к планированию: прежний маршрут останется на карте, а прогноз поможет проверить изменения. Флот и корпус восстановятся до начала этапа.';
    $('outcomePrimary').textContent = final ? 'Пройти другим способом ↗' : won ? 'Следующий манёвр ↗' : 'Изменить курс ↗'; openDialog('outcome');
  }
  function next() { if (!pendingNext) return; phase = pendingNext.phase; carry = pendingNext.carry; setup(); save(); $('battlefield').focus({ preventScroll: true }); }
  function newOperation() {
    phase = 0; carry = { fleet: 6 }; completed = []; attempts = 0; hints = 0; finished = false; plans = {}; previous = null; setup(); save(); window.scrollTo({ top: 0, behavior: settings.reduced ? 'instant' : 'smooth' });
  }
  function showOperations() {
    save(pendingNext && phase < 2 ? pendingNext : undefined);
    dialogs.forEach(d => { if (d.open) d.close(); });
    $('operationList').replaceChildren(...E.OPERATIONS.map((o, i) => {
      const button = document.createElement('button'), art = document.createElement('span'), title = document.createElement('strong'), tag = document.createElement('small'), detail = document.createElement('p'), progress = document.createElement('span');
      button.className = 'operation-card'; button.dataset.operation = o.id; button.setAttribute('aria-pressed', String(operationId === o.id));
      art.className = 'operation-art art-' + o.id; art.setAttribute('aria-hidden', 'true'); art.textContent = ['◐', '◌', 'ϟ'][i];
      tag.textContent = `0${i + 1} / ${o.tag}`; title.textContent = o.name; detail.textContent = o.description;
      const run = operations[o.id]; progress.className = 'operation-progress'; progress.textContent = run?.finished ? 'Пройдена · способов ' + Object.keys(run.best || {}).length + '/3' : run?.phase ? `Продолжить · этап ${run.phase + 1}/3` : operationId === o.id ? 'Текущая операция' : 'Начать операцию ↗';
      button.append(art, tag, title, detail, progress); button.addEventListener('click', () => selectOperation(o.id)); return button;
    }));
    openDialog('operationsDialog');
  }
  function restoreFinal(record) {
    state.status = 'won'; state.reason = 'Операция завершена'; state.x = finite(record.final?.x, E.EXIT.x, 0, E.W); state.y = finite(record.final?.y, E.EXIT.y, 0, E.H);
    state.t = completed[2]?.time || 0; state.flightT = Math.max(0, state.t - plan.delay); state.fleet = completed[2]?.fleet || 1; state.hull = completed[2]?.hull || 3; mode = 'review'; sync(); outcome();
  }
  function selectOperation(id) {
    closeDialog('operationsDialog');
    if (id === operationId) return;
    operationId = E.operation(id).id; const run = operations[operationId] || {};
    phase = [0, 1, 2].includes(run.phase) ? run.phase : 0; tactic = E.TACTICS.includes(run.tactic) ? run.tactic : 'breach';
    carry = phase ? cleanCarry(run.carry) : { fleet: 6 }; completed = cleanCompleted(run.completed);
    attempts = Math.round(finite(run.attempts, 0, 0, 99999)); hints = Math.round(finite(run.hints, 0, 0, 99999)); plans = {}; best = {};
    for (const t of E.TACTICS) {
      if (Number.isFinite(run.best?.[t]?.time)) best[t] = { time: finite(run.best[t].time, 72, 0, 72), fleet: finite(run.best[t].fleet, 1, 1, 6) };
      for (const p of [0, 1, 2]) if (run.plans?.[`${p}:${t}`]) plans[`${p}:${t}`] = E.cleanPlan(run.plans[`${p}:${t}`], p, t);
    }
    finished = run.finished === true && completed.length === 3; setup();
    if (finished) restoreFinal(run); save(); renderer.needsDraw = true;
  }
  function findHint() {
    if (phase < 2) return reference();
    // Prefer an early window. Search later windows only when the actual checkpoint needs one.
    for (const delay of [0, .5, 1, 1.5, 2, 2.5, 3, 3.5, 4]) {
      let result = null, score = Infinity;
      for (let angle = -180; angle <= -80; angle += 2) for (let speed = 65; speed <= 170; speed += 5) {
        const candidate = { ...plan, angle, speed, delay }, simulation = E.simulate(2, tactic, candidate, carry, operationId);
        if (simulation.status === 'won' && simulation.t < score) { score = simulation.t; result = candidate; }
      }
      if (result) return result;
    }
    return null;
  }
  function requestHint() {
    if (mode !== 'plan') return; hintPlan = findHint();
    $('navigatorText').textContent = !hintPlan ? 'Прогноз поможет найти окно между обломками. Сначала подними курс, затем подбери импульс.' : phase === 0 ? 'Обойди верхний край луны. Её поле загнёт траекторию к узлу; слишком сильный импульс унесёт корабль вверх.' : phase === 2 ? 'Этот курс рассчитан из твоего текущего положения с учётом движущихся обломков. Изменение скорости меняет момент встречи с ними.' : tactic === 'breach' ? 'Поставь якорь над крепостью и проведи корабль мимо её верхнего края. С тыла генератор открыт для автоматического огня.' : tactic === 'rebound' ? 'Поставь якорь слева от крепости, чуть ниже линии выстрела. Небольшой импульс позволит полю развернуть залп по петле.' : 'Иди вниз вдоль золотого курса. Нужно оказаться рядом с бомбардировщиком во время отмеченных залпов, а затем дождаться его атаки.';
    if (operationId === 'pulsar') $('navigatorText').textContent += ` Задержка старта ${hintPlan?.delay || 0} с позволяет пересечь фронт в безопасном окне.`;
    if ($('tacticalSheet').open) closeDialog('tacticalSheet');
    $('applyHint').disabled = !hintPlan; openDialog('navigator');
  }
  $('begin').addEventListener('click', () => { closeDialog('briefing'); sound.unlock(); if (finished) outcome(); });
  $('help').addEventListener('click', () => { $('begin').textContent = 'Вернуться к операции ↗'; openDialog('briefing'); });
  $('settings').addEventListener('click', () => openDialog('preferences')); $('closeSettings').addEventListener('click', () => closeDialog('preferences'));
  $('helpFromSettings').addEventListener('click', () => { closeDialog('preferences'); $('begin').textContent = 'Вернуться к операции ↗'; openDialog('briefing'); });
  $('restartFromSettings').addEventListener('click', () => { closeDialog('preferences'); openDialog('confirmRestart'); });
  $('operationsButton').addEventListener('click', showOperations); $('chooseBriefingOperation').addEventListener('click', showOperations); $('chooseNextOperation').addEventListener('click', showOperations);
  $('closeOperations').addEventListener('click', () => closeDialog('operationsDialog'));
  const command = document.querySelector('.command'), commandHome = document.createComment('Desktop tactical panel'), compact = matchMedia('(max-width: 900px), (max-height: 500px)');
  command.before(commandHome);
  function arrangePanels() {
    if (compact.matches) $('tacticalContent').append(command);
    else { if ($('tacticalSheet').open) closeDialog('tacticalSheet'); commandHome.after(command); }
    renderer.needsDraw = true;
  }
  compact.addEventListener('change', arrangePanels); arrangePanels();
  $('tacticalButton').addEventListener('click', () => openDialog('tacticalSheet')); $('closeTactics').addEventListener('click', () => closeDialog('tacticalSheet'));
  function toggleCamera() { stopInput(); camera = camera === 'overview' ? 'follow' : 'overview'; renderer.needsDraw = true; sync(); }
  $('cameraToggle').addEventListener('click', toggleCamera);
  $('courseTool').addEventListener('click', () => setTool(false)); $('undoPlan').addEventListener('click', () => travelHistory()); $('redoPlan').addEventListener('click', () => travelHistory(true));
  $('delayToggle').addEventListener('click', () => { if (mode === 'plan') openDialog('launchWindow'); }); $('closeWindow').addEventListener('click', () => closeDialog('launchWindow'));
  $('delay').addEventListener('input', e => { beginEdit(); updatePlan({ delay: e.target.valueAsNumber }); });
  for (const button of document.querySelectorAll('[data-delay]')) button.addEventListener('click', () => updatePlan({ delay: Number(button.dataset.delay) }));
  function adjust(button, multiplier = 1) { const key = button.dataset.adjust; updatePlan({ [key]: Math.round((plan[key] + Number(button.dataset.step) * multiplier) * 100) / 100 }); }
  document.querySelectorAll('[data-adjust]').forEach(button => {
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !event.isPrimary || mode !== 'plan') return;
      event.preventDefault(); button.focus({ preventScroll: true }); stopInput(); beginEdit(); heldButton = button; pointerButton = button; button.setPointerCapture(event.pointerId); adjust(button);
      let count = 0; const repeat = () => { if (heldButton !== button || mode !== 'plan' || document.hidden) return; adjust(button, count++ >= 8 ? 4 : 1); holdTimer = setTimeout(repeat, 85); };
      holdTimer = setTimeout(repeat, 360);
    });
    const release = () => { if (heldButton === button) { stopHold(); finishEdit(); } };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
    button.addEventListener('pointermove', event => { const r = button.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) release(); });
    button.addEventListener('click', event => { if (event.detail > 0 && pointerButton === button) { pointerButton = null; return; } adjust(button); });
    button.addEventListener('contextmenu', e => e.preventDefault());
  });
  $('launch').addEventListener('click', launch); $('pause').addEventListener('click', pause); $('retry').addEventListener('click', retry);
  $('skipBattle').addEventListener('click', finishBattle);
  $('shield').addEventListener('click', () => { if (['running', 'paused'].includes(mode)) { E.shield(state); sync(); } });
  $('rate').addEventListener('click', () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; $('rate').textContent = speed + '×'; $('rate').setAttribute('aria-label', 'Скорость воспроизведения: ' + speed + '×'); });
  for (const key of ['angle', 'speed']) for (const suffix of ['', 'Range']) $(key + suffix).addEventListener('input', event => { const v = event.target.valueAsNumber; if (Number.isFinite(v)) { beginEdit(); updatePlan({ [key]: v }); } });
  for (const [id, key] of [['anchorX', 'ax'], ['anchorY', 'ay']]) $(id).addEventListener('input', event => { const v = event.target.valueAsNumber; if (Number.isFinite(v)) { beginEdit(); updatePlan({ [key]: v }); } });
  for (const id of ['angle', 'speed', 'anchorX', 'anchorY']) $(id).addEventListener('change', () => writeInputs(false));
  for (const id of ['angle', 'speed', 'anchorX', 'anchorY', 'angleRange', 'speedRange', 'delay']) {
    $(id).addEventListener('focus', beginEdit); $(id).addEventListener('blur', () => { finishEdit(); writeInputs(false); });
    $(id).addEventListener('pointerdown', beginEdit); if ($(id).type === 'range') $(id).addEventListener('pointerup', () => finishEdit());
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $(id).blur(); $('battlefield').focus({ preventScroll: true }); } });
  }
  $('anchorTool').addEventListener('click', () => setTool(true));
  document.querySelectorAll('[data-tactic]').forEach(button => button.addEventListener('click', () => { if (phase !== 1 || mode !== 'plan') return; plans[`${phase}:${tactic}`] = { ...plan }; tactic = button.dataset.tactic; setup(); save(); }));
  $('outcomePrimary').addEventListener('click', () => { closeDialog('outcome'); if (state.status !== 'won') retry(); else if (phase === 2) { tactic = E.TACTICS[(E.TACTICS.indexOf(tactic) + 1) % 3]; newOperation(); } else next(); });
  $('reviewPath').addEventListener('click', () => closeDialog('outcome')); $('hintButton').addEventListener('click', requestHint); $('closeHint').addEventListener('click', () => closeDialog('navigator'));
  $('applyHint').addEventListener('click', () => { closeDialog('navigator'); if (hintPlan) { hints++; updatePlan(hintPlan); forecast(); setRadio('Опорный курс введён. Можешь использовать его или попробовать улучшить.'); } });
  $('restartOperation').addEventListener('click', () => openDialog('confirmRestart')); $('cancelNew').addEventListener('click', () => closeDialog('confirmRestart')); $('confirmNew').addEventListener('click', () => { closeDialog('confirmRestart'); newOperation(); });
  function preference(key, value) { settings[key] = value; sound.enabled = settings.sound; if (settings.sound) sound.unlock(); forecast(); sync(); save(pendingNext && phase < 2 ? pendingNext : undefined); }
  $('soundEnabled').addEventListener('change', e => preference('sound', e.target.checked)); $('reducedMotion').addEventListener('change', e => preference('reduced', e.target.checked)); $('showForecast').addEventListener('change', e => preference('forecast', e.target.checked)); $('forecastToggle').addEventListener('click', () => preference('forecast', !settings.forecast));
  $('battlefield').addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    pointers.add(event.pointerId);
    if (pointers.size !== 1) { gesture = null; finishEdit(true); return; }
    const mini = renderer.minimap, box = $('battlefield').getBoundingClientRect(), x = event.clientX - box.left, y = event.clientY - box.top;
    if (mini && x >= mini.x && x <= mini.x + mini.w && y >= mini.y && y <= mini.y + mini.h) { camera = 'overview'; renderer.needsDraw = true; sync(); return; }
    if (mode !== 'plan') return;
    event.preventDefault(); $('battlefield').focus({ preventScroll: true }); finishEdit(); beginEdit();
    const p = renderer.point(event.clientX, event.clientY), grab = phase === 1 && !editing && E.distance(p, { x: plan.ax, y: plan.ay }) < (event.pointerType === 'touch' ? 26 : 18) / renderer.scale;
    gesture = { id: event.pointerId, anchor: phase === 1 && (editing || grab), dx: grab ? plan.ax - p.x : 0, dy: grab ? plan.ay - p.y : 0 };
    if (gesture.anchor) editing = true;
    $('battlefield').setPointerCapture(event.pointerId); movePointer(event); syncEditor();
  });
  function movePointer(event) {
    if (!gesture || event.pointerId !== gesture.id || pointers.size !== 1 || mode !== 'plan') return;
    const p = renderer.point(event.clientX, event.clientY);
    if (gesture.anchor) updatePlan({ ax: Math.round(p.x + gesture.dx), ay: Math.round(p.y + gesture.dy) });
    else if (E.distance(p, state) * renderer.scale > 12) updatePlan({ angle: Math.round(Math.atan2(p.y - state.y, p.x - state.x) * 180 / Math.PI * 2) / 2 });
  }
  $('battlefield').addEventListener('pointermove', movePointer);
  $('battlefield').addEventListener('pointerup', event => {
    if (event.button !== 0) return;
    movePointer(event); pointers.delete(event.pointerId);
    if (gesture?.id === event.pointerId) { gesture = null; finishEdit(); }
  });
  for (const name of ['pointercancel', 'lostpointercapture']) $('battlefield').addEventListener(name, event => { pointers.delete(event.pointerId); if (gesture?.id === event.pointerId) { gesture = null; finishEdit(true); } });
  document.addEventListener('keydown', event => {
    if (isDialogOpen() || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable || event.altKey) return;
    if (event.ctrlKey || event.metaKey) { if (event.code === 'KeyZ' && mode === 'plan') { event.preventDefault(); travelHistory(event.shiftKey); } return; }
    if (mode === 'plan' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
      event.preventDefault(); beginEdit(); const horizontal = ['ArrowLeft', 'ArrowRight'].includes(event.code), sign = ['ArrowLeft', 'ArrowUp'].includes(event.code) ? -1 : 1, amount = event.shiftKey ? 5 : 1;
      if (editing && phase === 1) { const key = horizontal ? 'ax' : 'ay'; updatePlan({ [key]: plan[key] + sign * 5 * amount }); }
      else { const key = horizontal ? 'angle' : 'speed'; updatePlan({ [key]: plan[key] + sign * (horizontal ? .5 : -.5) * amount }); }
      return;
    }
    if (event.repeat) return;
    if (event.code === 'Escape') { event.preventDefault(); if (gesture || editStart) stopInput(true); else if (editing) setTool(false); else if (['running', 'cinematic'].includes(mode)) pause(); }
    if (event.code === 'KeyC') setTool(false);
    if (event.code === 'KeyA' && phase === 1) setTool(true);
    if (event.code === 'KeyZ') toggleCamera();
    if (event.code === 'KeyH' && mode === 'plan') requestHint();
    if (event.code === 'Space' && /^(BUTTON|A)$/.test(document.activeElement?.tagName || '')) return;
    if (event.code === 'Space') { event.preventDefault(); ['running', 'paused', 'cinematic'].includes(mode) ? pause() : launch(); }
    if (event.code === 'KeyR') { event.preventDefault(); retry(); }
    if (event.code === 'KeyE' && ['running', 'paused'].includes(mode)) { event.preventDefault(); E.shield(state); sync(); }
  });
  document.addEventListener('keyup', event => { if (event.code.startsWith('Arrow') && editStart && !gesture && !heldButton && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) finishEdit(); });
  window.addEventListener('blur', () => stopInput()); window.addEventListener('resize', () => stopInput());
  window.addEventListener('pagehide', () => stopInput());
  document.addEventListener('visibilitychange', () => { stopInput(); if (document.hidden && ['running', 'cinematic'].includes(mode)) pause(); last = performance.now(); accumulator = 0; });
  function frame(now) {
    const dt = Math.min(.1, Math.max(0, (now - (last || now)) / 1000)); last = now;
    const stopped = isDialogOpen() || document.hidden || mode === 'paused' || mode === 'review';
    if (!stopped && !settings.reduced) renderTime += dt;
    battle.advance(dt, { paused: stopped, phase, running: mode === 'running', fleet: state.fleet, flightTime: state.t, jammed: state.jam > 0 });
    if (dirty) forecast();
    if (mode === 'running' && !isDialogOpen() && !document.hidden) {
      accumulator += dt * speed;
      while (accumulator >= E.DT && mode === 'running') {
        E.step(state); accumulator -= E.DT;
        while (eventIndex < state.events.length) { const ev = state.events[eventIndex++]; battle.receive(ev, state); if (['hit', 'ally-hit', 'protect', 'blocked', 'signal', 'jammed', 'storm-hit'].includes(ev.type)) setRadio(ev.text); }
        if (state.status !== 'running') endManeuver();
      }
      sync();
    }
    if (mode === 'cinematic') { battleCaption(); if (battle.breakAge >= (settings.reduced ? 1.1 : B.DURATION)) finishBattle(); }
    for (const cue of battle.takeCues()) if (!isDialogOpen() && !document.hidden) B.playCue(sound, cue, settings.reduced);
    const viewKey = [mode, isDialogOpen(), settings.reduced, settings.forecast, phase, state.t].join(':');
    if (!stopped || renderer.needsDraw || viewKey !== lastViewKey) {
      renderer.draw({ state, prediction, phase, tactic, plan, mode, battle, reduced: settings.reduced, showForecast: settings.forecast, editing, previous, camera, aiming: !!gesture && !gesture.anchor }, renderTime); renderer.needsDraw = false; lastViewKey = viewKey;
    }
    requestAnimationFrame(frame);
  }
  setup(true);
  if (finished) restoreFinal(saved);
  else { $('begin').textContent = phase > 0 ? 'Продолжить с контрольной точки ↗' : 'Принять командование ↗'; openDialog('briefing'); }
  requestAnimationFrame(frame);
  root.EclipseApp = { get operation() { return operationId; }, get state() { return state; }, get phase() { return phase; }, get tactic() { return tactic; }, get mode() { return mode; }, get prediction() { return prediction; }, get plan() { return { ...plan }; }, get saved() { return snapshot(); }, get battle() { return { time: battle.time, breakAge: battle.breakAge, effects: battle.effects.length, waves: battle.wave }; } };
})(window);
