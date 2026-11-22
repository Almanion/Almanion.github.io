/* Responsive presentation, briefing and history. No equations of motion here. */
(function(root){'use strict';const O=root.Orbital,A=O.App,G=O.Progress,P=O.Physics,R=O.Routes,E=O.Economy,L=O.LEVELS,$=id=>document.getElementById(id),$$=q=>[...document.querySelectorAll(q)],money=n=>Math.round(n).toLocaleString('ru-RU'),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let category='all',filter='all',query='',tab='flight',cache='',pending=false;
function layout(){pending=false;O.UI9?.layout();}
function schedule(){if(!pending){pending=true;requestAnimationFrame(layout);}}new ResizeObserver(schedule).observe($('mapViewport'));root.addEventListener('resize',schedule);root.visualViewport?.addEventListener('resize',schedule);
function restoreSaveWarning(){const warning=$('saveWarning');if(warning?.closest('#resultScreen'))document.querySelector('main').before(warning);}
function collapse(){document.querySelector('.flight-panel').classList.remove('nav-expanded');}
function onPage(page){if(page!=='play'){restoreSaveWarning();document.querySelector('main').style.height='';document.body.removeAttribute('data-flight');collapse();}else schedule();}
function onLevel(){
  restoreSaveWarning();O.Review.clearView();$('flightReview').hidden=true;
  cache=null;collapse();sync();updateRoute();schedule();
}
function sync(){O.UI9?.sync();}
const T=O.FlightObjectives;
const factSymbols={
  branch:'<path d="M5 16V4m0 9c6 0 9-2 9-7m-3 1 3-3 3 3"/>',
  placement:'<circle cx="10" cy="10" r="4"/><path d="M2 10h2m12 0h2M10 2v2m0 12v2"/>',
  gate:'<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="2"/>',
  flyby:'<circle cx="10" cy="10" r="3"/><path d="M16.5 8a7 7 0 1 0 0 5m-3-5h3.5V4.5"/>',
  portal:'<ellipse cx="8" cy="10" rx="4" ry="7"/><path d="M8 10h9m-3-3 3 3-3 3"/>',
  stop:'<path d="M4 17V3m0 1h11l-2.5 3L15 10H4"/>',
  cargo:'<path d="m3 6 7-4 7 4v8l-7 4-7-4Zm0 0 7 4 7-4m-7 4v8"/>',
  launch:'<path d="m4 15 3-6 9-5-5 9-7 2Zm3-6 4 4M3 17l3-1"/>',
  approach:'<path d="M2 10h10m-4-4 4 4-4 4m7-10h2v12h-2"/>',
  window:'<path d="M3 4v12m14-12v12M3 10h14m-11-3-3 3 3 3m8-6 3 3-3 3"/>',
  radius:'<circle cx="10" cy="10" r="7"/><path d="m10 10 5-5m-3 0h3v3"/>',
  time:'<circle cx="10" cy="11" r="6.5"/><path d="M8 2h4m-2 0v2m0 3v4l2 1"/>'
};
function renderConditions(plan){
  const facts=T.conditions(plan,A.displayState()?.stats||A.stats());
  $('strictRules').innerHTML=facts.map(({kind,label,detail})=>
    `<li data-rule="${kind}" title="${esc(detail)}"><svg aria-hidden="true" viewBox="0 0 20 20">${factSymbols[kind]}</svg><span>${esc(label)}</span></li>`
  ).join('');
}
function goalBadge(goal){
  return `<span class="goal-badge" aria-hidden="true" data-kind="${goal.kind}" data-mark="${esc(goal.mark)}"></span>`;
}
function setGoalBadge(node,goal){
  node.hidden=!goal;
  if(!goal)return;
  if(node.dataset.kind!==goal.kind)node.dataset.kind=goal.kind;
  if(node.dataset.mark!==goal.mark)node.dataset.mark=goal.mark;
}
function goalLabel(guide){
  if(!guide.next)return 'Маршрут завершён';
  return guide.next.kind==='freight'?'Груз · '+T.freightLabel(guide):guide.next.label;
}
function setText(node,value){if(node.textContent!==value)node.textContent=value;}
function updateRoute(force=false,guide=A.flightGuide()){
  const {plan,next}=guide,active=plan.route.activeBranch;
  if(force||cache!==plan){
    cache=plan;
    renderConditions(plan);
    $('routeBrief').textContent=plan.route.brief;
    $('routeSteps').innerHTML=plan.steps.map(goal=>`<li data-goal="${goal.key}">
      ${goalBadge(goal)}<span class="route-step-label">${esc(goal.label)}</span><small class="route-value"></small></li>`).join('');
    const proof=G.record(A.profile,plan.route.id).routes||[];
    const branches=plan.route.branches||[];
    $('branchPicker').innerHTML=branches.map(branch=>`<button type="button" class="branch-card${branch.id===active?' active':''}"
      data-action="v8:branch" data-branch="${branch.id}" aria-pressed="${branch.id===active}">
      <strong>${branch.id} · ${esc(branch.name)}${proof.includes(branch.id)?' ✓':''}</strong></button>`).join('')+
      (branches.length?'<p class="branch-guide">Выбери ветвь для просмотра. Во время рейса ветвь фиксируется при первом переходе.</p>':'');
    $('routeHelp').hidden=!plan.flybys.length;
    $('portalHelp').hidden=!plan.portals.length;
  }
  for(const b of $('branchPicker').querySelectorAll('button'))b.disabled=!!A.state;
  const label=goalLabel(guide),button=$('flightGoal');
  setGoalBadge($('activeStepMark'),next);
  setText($('activeStep'),label);
  const name=guide.targets.length?'Показать на карте · '+label:label;
  if(button.getAttribute('aria-label')!==name)button.setAttribute('aria-label',name);
  button.disabled=!guide.targets.length;
  for(const [i,el] of [...$('routeSteps').children].entries()){
    const goal=plan.steps[i],done=T.completed(goal,guide),current=goal===next;
    el.classList.toggle('done',done);
    el.classList.toggle('active',current);
    if(current)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');
    const detail=done?'✓ Выполнено':goal.kind==='freight'?T.freightLabel(guide):
      goal.kind==='flyby'?(current?Math.min(guide.degrees,goal.degrees)+'° / ':'')+goal.degrees+'°':'';
    setText(el.querySelector('.route-value'),detail);
  }
}
function selectBranch(button){
  if(A.state)return;
  A.branchView=button.dataset.branch;
  A.updateObjectives();
  updateRoute(true);
  $('branchPicker').querySelector('[aria-pressed=true]')?.focus({preventScroll:true});
}
function medalHelp(){let l=A.level();A.openModal('Три цели контракта',O.Medals.describe(l,A.state,A.speed,G.viewRecord(A.profile,l.id),A.assisted,A.stats()).map(d=>`<div class="info-box"><strong>${d.title}</strong><p>${d.condition}</p><small>${d.detail}. ${d.archive?'Архивная медаль сохранена, новое условие ещё не подтверждено.':d.earned?'Актуальная медаль получена.':'Новая цель.'}</small></div>`).join('')+'<p>Медаль исследователя накапливает прохождения обеих ветвей. Остальные цели проверяются в одном успешном рейсе. Тренировки не дают наград.</p><div class="modal-actions"><button class="button primary" data-action="close">Понятно</button></div>');}
function resultView(view){
  if(!A.state||A.state.status==='flying')return;
  const wasAnalysis=document.body.dataset.resultView==='analysis';
  document.body.dataset.resultView=view;
  $('reviewEvent').hidden=view!=='analysis'||!O.Review.active?.data.event;
  if(view!=='analysis')$('reviewPin').hidden=true;
  if(view==='analysis')restoreSaveWarning();else $('resultScreen').querySelector('.completion-scroll')?.prepend($('saveWarning'));
  $('resultAnalysisBar').hidden=view!=='analysis';
  sync();schedule();
  (view==='analysis'?$('resultBack'):wasAnalysis?$('resultReview'):$('resultTitle')).focus({preventScroll:true});
}
function failureDetails(report){
  const facts = report.facts.map(([label,value,unit]) =>
    `<div><dt>${esc(label)}</dt><dd>${esc(value)}${unit ? ' <small>'+esc(unit)+'</small>' : ''}</dd></div>`).join('');
  const advice = esc(report.advice).replace(/(\d+(?:,\d+)? ед\.\/с)/g,'<span class="flight-quantity">$1</span>');
  return `<p class="failure-event">${esc(report.event)}</p>${facts ? '<dl class="failure-facts">'+facts+'</dl>' : ''}<p class="failure-advice">${advice}</p>`;
}
function retryButton(state,level,{summary=false,training=false}={}) {
  const limited=state.reason==='fuel', won=state.status==='won' && !training;
  const changeTime=level.launchTiming&&(state.reason==='window'||
    !level.flybys?.length&&!P.receptionWindows(level).length&&(state.reason==='boundary'||state.reason==='timeout'));
  const approach=level.launchTiming&&state.reason==='overspeed';
  const label=limited ? `Снизить до ${Math.floor(level.rules.maxLaunchSpeed)} ед./с` :
    training ? 'Без подсказки ↗' : won ? 'Ещё раз ↺' : approach ? 'Уточнить стыковку' :
      changeTime ? 'Изменить время старта' : 'Изменить курс';
  return `<button class="button ${won?'quiet':'primary'}" ${summary?'id="resultRetry"':''} data-action="${limited?'ui:limit-speed':'retry'}">${label}</button>`;
}
function failedSummary(level,state,report,medalList,cargo){
  const mode = state.assisted ? ' · Тренировка' : state.mode === 'pro' ? ' · ПРО' : '';
  return `<div class="failure-layout"><section class="failure-copy">
    <div class="failure-contract">Контракт ${O.Campaign.number(level.id)} · ${esc(level.name)}${mode}</div>
    <h2 id="resultTitle" tabindex="-1">${esc(report.title)}</h2>${failureDetails(report)}</section>
    ${O.DockingPreview.markup()}</div>
    <details class="completion-breakdown failure-breakdown"><summary>Параметры рейса и медали<span aria-hidden="true">＋</span></summary><div class="completion-detail-body">
    <div class="completion-detail-facts"><span>Угол запуска <b>${esc(state.launchAngle.toLocaleString('ru-RU'))}°</b></span><span>Скорость запуска <b>${state.launchSpeed} ед./с</b></span><span>Груз на борту <b>${cargo}</b></span></div>
    ${medalList}<button class="text-button" data-action="hint">Подсказка по маршруту</button></div></details>`;
}
const timeStamp=t=>t.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' с';
function seekRecording(t){
  O.Review.selectTime(t);
  const state=O.Review.currentFrame(),event=O.Review.active.data.event;
  const stamp=timeStamp(state.t);
  $('reviewStamp').textContent = stamp;
  $('reviewRange').setAttribute('aria-valuetext',stamp);
  const atEvent=state.t===event?.t;
  $('reviewPin').classList.toggle('at-event',atEvent);
  const guide=A.flightGuide(state),note=$('reviewEventNote');
  const showEvent=event&&(atEvent||state.status!=='flying');
  note.hidden=!showEvent&&state.status!=='flying';
  note.classList.toggle('at-event',!!showEvent);
  setGoalBadge($('reviewStepMark'),showEvent?event.goal:guide.next);
  setText($('reviewStepLabel'),showEvent?event.caption+(event.target?' · '+timeStamp(event.t):''):goalLabel(guide));
  updateRoute(false,guide);
}
function jumpToEvent(focusRange=false){
  const event=O.Review.active?.data.event;
  if(!event)return;
  $('reviewRange').value=event.t;
  seekRecording(event.t);
  O.UI9?.focusReviewEvent(event);
  if(focusRange)$('reviewRange').focus({preventScroll:true});
}
function openReview(){
  resultView('analysis');
  jumpToEvent();
}
function compareAttempts(button){
  if(!O.Review.prior())return;
  O.Review.setCompare();
  const enabled=O.Review.active.compare;
  button.setAttribute('aria-pressed',String(enabled));
  $('reviewComparison').hidden=!enabled;
  if(enabled){
    const {trail,ghost}=O.Review.renderModel();
    O.UI9?.fitReviewTracks(trail,ghost);
  }
}
function reviewComparison(current,previous){
  if(!previous)return '';
  const delta=new Intl.NumberFormat('ru-RU',{signDisplay:'exceptZero',maximumFractionDigits:1});
  const course=flight=>`${flight.angle.toLocaleString('ru-RU')}° · ${flight.speed} ед./с${flight.level.launchTiming?' · старт +'+launchTime(flight.level.launchDelay):''}`;
  const attempt=(label,flight)=>{
    const {windows,index}=P.receptionAt(flight.level,flight.final.t);
    return windows.length>1&&flight.final.status==='won'?label+' · '+T.receptionLabel(index):label;
  };
  const angle=((current.angle-previous.angle+540)%360)-180;
  const differentLayout=JSON.stringify(current.level.layout)!==JSON.stringify(previous.level.layout);
  return `<div id="reviewComparison" class="review-comparison" hidden aria-label="Параметры попыток">
    <div class="review-attempt current"><span>${attempt('Текущая',current)}</span><b>${course(current)}</b></div>
    <div class="review-attempt previous"><span>${attempt('Предыдущая',previous)}</span><b>${course(previous)}</b></div>
    <div class="review-change"><span>Изменение</span><b>${delta.format(angle)}° · ${delta.format(current.speed-previous.speed)} ед./с${current.level.launchTiming?' · старт '+delta.format(current.level.launchDelay-previous.level.launchDelay)+' с':''}</b></div>
    ${differentLayout?'<p class="review-layout-note">Расстановка планет в этих попытках различается.</p>':''}
  </div>`;
}
const launchTime=t=>t.toFixed(1).replace('.',',')+' с';
function renderReview(s){
  const {data}=O.Review.active,previous=O.Review.prior();
  setGoalBadge($('reviewPin').firstElementChild,data.event?.goal||{kind:'error',mark:'!'});
  $('reviewPin').setAttribute('aria-label',data.event?.goal?'Метка ошибки · '+data.event.goal.label:'Метка ошибки на карте');
  $('flightReview').innerHTML=`<div class="review-controls">
    <div id="reviewTimelineHome"><div class="review-timeline" id="reviewTimeline"><span class="review-stamp" id="reviewStamp"></span>
      <input id="reviewRange" type="range" min="0" max="${s.t}" step="any" value="${s.t}" aria-label="Время уже выполненного рейса">
    </div></div>
    <button data-action="v8:compare" aria-pressed="false" ${previous?'aria-controls="reviewComparison"':'disabled title="Появится после второго рейса"'}>Сравнить</button>
    <button data-action="v8:report">${s.status==='won'?'Награды':'Причина'}</button>
  </div>
  <p class="review-event-note" id="reviewEventNote" hidden><span class="goal-badge" id="reviewStepMark" aria-hidden="true"></span><span id="reviewStepLabel"></span></p>
  ${reviewComparison(data,previous)}`;
  seekRecording(s.t);
  $('reviewRange').addEventListener('input',e=>seekRecording(+e.target.value));
}
function showReport(){
  if(A.lastResult)return A.showWin(A.lastResult);
  const flight=O.Review.active?.data;if(!flight)return;
  const report=O.Review.failureReport(flight.level,flight.final,flight.resets);
  const goal=flight.event?.goal;
  const sign=goal?`<p class="review-event-note at-event">${goalBadge(goal)}<span>${esc(goal.label)}</span></p>`:'';
  A.openModal(esc(report.title), `<div class="failure-report">${sign}${failureDetails(report)}</div>
    <div class="modal-actions failure-actions"><button class="button quiet" data-action="v8:review-event">Показать на записи</button>${retryButton(flight.final,flight.level)}</div>`, 'РАЗБОР РЕЙСА');
}
function showResult(result){
  const s=A.state,l=A.level(),won=s.status==='won',training=!!result?.training,delivered=won&&!training;
  const reception=P.receptionAt(l,s.t);
  const slot=won&&reception.windows.length>1?`${T.receptionLabel(reception.index)} · ${timeStamp(reception.time)}`:'';
  const approach=won&&l.launchTiming&&l.rules.maxDockSpeed?`Сближение ${s.dockSpeed.toLocaleString('ru-RU',{maximumFractionDigits:1})} ед./с`:'';
  const q=result?.quality,rank=G.rank(A.profile),next=O.Campaign.adjacent(A.currentId,1);
  const medals=O.Medals.describe(l,s,s.launchSpeed,G.viewRecord(A.profile,l.id),training,A.stats());
  const failure=won?null:O.Review.failureReport(l,s,O.Review.active.data.resets);
  const cargo=`${R.collected(l,s)} / ${R.cargoIds(l,s).length}`;
  const title=training?'Тренировка завершена':'Посылка на месте.';
  const subtitle=training?'Повтори маршрут самостоятельно, чтобы получить награды.':A.storageOK?'Доставка подтверждена. Результат и награды сохранены.':'Доставка подтверждена. Запись не удалась — скачай копию прогресса.';
  const medalCount=medals.filter(m=>m.state==='won').length;
  const payment=delivered?(result.first?'Первая доставка по этому контракту.':result.totalCredits?'Доплата за улучшение результата.':'Результат уже оплачен. Новая доплата — за улучшение рекорда.'):'Тренировка не начисляет награды.';
  const medalList=`<div class="completion-medals">${medals.map((m,i)=>`<article class="completion-medal" data-state="${m.state}"><span class="completion-medal-icon" aria-hidden="true">${O.MedalArt.svg(O.Medals.rules(l)[i].type)}</span><div><div class="completion-medal-heading"><h4>${esc(m.title)}</h4><span>${training?'Без зачёта':m.state==='won'?(result.newMask&m.bit?'Новая':'✓ Выполнено'):m.earned?'Есть ранее':'Не получена'}</span></div><p>${esc(m.condition)}</p><small>${esc(m.detail)}</small></div></article>`).join('')}</div>`;
  const career=`<div class="completion-career"><span>ТВОЙ РАНГ</span><strong>${esc(rank.name)}</strong><div class="completion-rank-track"><i style="width:${rank.next?P.clamp((A.profile.xp-rank.xp)/(rank.next.xp-rank.xp)*100,0,100):100}%"></i></div><small>${rank.next?`${money(Math.max(0,rank.next.xp-A.profile.xp))} XP до ранга «${esc(rank.next.name)}»`:'Достигнут высший ранг'}</small></div>`;
  collapse();restoreSaveWarning();$('flightReview').hidden=false;
  $('resultScreen').hidden=false;$('resultScreen').dataset.outcome=training?'training':won?'won':'failed';
  const content=failure?failedSummary(l,s,failure,medalList,cargo):`
    <header class="completion-hero">
      <div class="completion-copy"><div class="completion-kicker"><span class="completion-signal" aria-hidden="true"></span>${training?'УЧЕБНЫЙ РЕЙС':'ДОСТАВКА ПОДТВЕРЖДЕНА'}<span class="completion-mode">${s.mode==='pro'?'PRO ×1,7':'ОБЫЧНЫЙ РЕЙС'}</span></div>
      <h2 id="resultTitle" tabindex="-1">${title}</h2><p>${esc(subtitle)}</p>
      <div class="completion-route"><span>КОНТРАКТ ${String(O.Campaign.number(l.id)).padStart(2,'0')}</span><strong>${esc(l.name)}</strong>${slot?`<span class="completion-window">${slot}</span>`:''}${approach?`<span class="completion-approach">${approach}</span>`:''}</div></div>
      <div class="completion-visual">${O.DockingPreview.markup()}<div class="completion-seal" aria-label="Оценка ${q.grade}, ${q.score} из 100"><div class="completion-seal-orbit" aria-hidden="true"></div><span>КАЧЕСТВО РЕЙСА</span><strong>${q.grade}</strong><b>${q.score}<small> / 100</small></b></div></div>
    </header>
    <div class="completion-facts" aria-label="Параметры завершённого рейса"><div><span>Время</span><strong>${s.t.toFixed(2)} <small>с</small></strong>${l.launchTiming?`<span class="completion-delay">Старт +${launchTime(l.launchDelay)}</span>`:''}</div><div><span>Груз</span><strong>${cargo} <small>конт.</small></strong></div><div><span>Стартовый угол</span><strong>${s.launchAngle.toFixed(1)}<small>°</small></strong></div><div><span>Стартовая скорость</span><strong>${s.launchSpeed} <small>ед./с</small></strong></div></div>
    <div class="completion-grid"><div class="completion-main">
      <section class="completion-goals" aria-labelledby="resultGoalsTitle"><div class="completion-section-title"><h3 id="resultGoalsTitle">${training?'Цели маршрута':'Медали рейса'}</h3><span>${training?'Без зачёта':`${medalCount} из ${medals.length}`}</span></div>
      ${medalList}</section>
      ${result?.awards.length?`<details class="completion-awards"><summary id="resultAwardsTitle"><span>Новые достижения <b>+${result.awards.length}</b></span><span>+${result.awards.reduce((n,a)=>n+a.xp,0)} XP <i aria-hidden="true">⌄</i></span></summary>${result.awards.map(a=>`<div class="award-chip"><span aria-hidden="true">${a.icon}</span><strong>${esc(a.name)}</strong><b>+${a.xp} XP</b></div>`).join('')}</details>`:''}
      <details class="completion-breakdown"><summary>Подробности рейса <span aria-hidden="true">＋</span></summary>
      <div class="completion-detail-body"><p>${esc(subtitle)}</p><div class="completion-detail-facts"><span>Стартовый угол <b>${s.launchAngle.toFixed(1)}°</b></span><span>Стартовая скорость <b>${s.launchSpeed} ед./с</b></span></div>
      <h4>Оценка ${q.score} / 100</h4><div class="completion-quality">${Object.entries(q.parts).map(([key,value])=>`<div><span>${{cargo:'Груз · 50%',precision:'Стыковка · 20%',fuel:'Импульс · 15%',pace:'Темп · 15%'}[key]}</span><meter min="0" max="100" value="${Math.round(value*100)}" aria-label="${{cargo:'Груз',precision:'Стыковка',fuel:'Импульс',pace:'Темп'}[key]}"></meter><b>${Math.round(value*100)}%</b></div>`).join('')}</div>
      <h4>Условия медалей</h4>${medals.map(m=>`<p><b>${esc(m.title)}</b><br>${esc(m.condition)}<br><small>${esc(m.detail)} · ${esc(m.status)}</small></p>`).join('')}
      ${delivered?`<h4>Расчёт наград</h4><p>${esc(payment)}</p><div class="completion-ledger"><span>Стоимость результата <b>${q.potential} ◈</b></span><span>Выплачено по контракту <b>${result.paid} ◈</b></span></div>`:''}${career}<button class="completion-hangar text-button" data-action="nav" data-page="hangar">В ангар <span>↗</span></button></div></details>
    </div><aside class="completion-receipt" aria-labelledby="resultRewardTitle"><div class="completion-section-title"><h3 id="resultRewardTitle">${delivered?'Начислено за рейс':'Можно пробовать снова'}</h3><span aria-hidden="true">${delivered?'↗':'↺'}</span></div>
      ${delivered?`<div class="completion-credits"><span>Кредиты</span><strong>+${money(result.totalCredits)} <small>◈</small></strong></div><div class="completion-resources"><div><span>Данные</span><strong>+${result.data} <small>⬡</small></strong></div><div><span>Опыт</span><strong>+${result.totalXP} <small>XP</small></strong></div></div><p class="completion-payment">${esc(payment)}</p>`:`<div class="completion-no-loss"><strong>Без наград</strong><p>${esc(payment)}</p></div>`}
    </aside></div>
    ${delivered?`<div class="completion-next-note"><span>${next<0?'ЭКСПЕДИЦИЯ ПРОДОЛЖАЕТСЯ':'СЛЕДУЮЩИЙ КОНТРАКТ'}</span><strong>${next<0?'Выбери маршрут или улучши прежний рекорд':esc(L[next].name)}</strong></div>`:''}`;
  $('resultScreen').innerHTML=`<div class="completion-scroll">${content}</div><footer class="completion-actions"><button class="button quiet" id="resultReview" data-action="v8:analysis">${failure?'Ошибка на карте':'Разбор полёта'} <span>↗</span></button>${next>=0||!delivered?`<button class="button quiet" id="resultContracts" data-action="nav" data-page="campaign">К контрактам</button>`:''}<button class="cloud-header result-cloud" data-action="cloud-result" aria-label="Прогресс и аккаунт"><span aria-hidden="true">☁</span><span class="cloud-label">На устройстве</span></button><div class="completion-actions-main">${retryButton(s,l,{summary:true,training})}${delivered?`<button class="button primary" id="resultNext" data-action="next" aria-label="${next<0?'Все маршруты':'Следующий контракт: '+esc(L[next].name)}">${next<0?'Все маршруты':'Дальше'} <span>→</span></button>`:''}</div></footer>`;
  renderReview(s);
  $('resultAnalysisBar').querySelector('div span').textContent=l.name;
  resultView('summary');O.UI9?.onResult();O.Cloud?.refresh();
  O.DockingPreview.mount($('resultScreen'),{level:l,state:s,trail:O.Review.active?.data.points||A.trail,stats:A.stats(),color:G.SKINS.find(skin=>skin.id===A.profile.skin)?.color,trailStyle:A.profile.trail,shipModel:A.profile.model,appearance:O.Fleet.appearance(A.profile)});
}
function awardArt(a,done=false){
 const paths={campaign:'<path d="m20 10 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1Z"/>',mastery:'<circle cx="20" cy="20" r="8"/><path d="m16 20 3 3 6-7M12 27l-2 9 10-5 10 5-2-9"/>',routes:'<path d="M9 28c17 7 26-17 12-17-11 0-15 17 3 18M9 28l1-7m-1 7 7-1"/><circle cx="22" cy="12" r="2"/>',portals:'<ellipse cx="20" cy="20" rx="7" ry="12"/><ellipse cx="20" cy="20" rx="13" ry="7" transform="rotate(-40 20 20)"/>',courier:'<path d="m20 9 11 6v13l-11 6-11-6V15Zm-11 6 11 6 11-6m-11 6v13m-6-22 11 6"/>',engineering:'<circle cx="20" cy="20" r="9"/><circle cx="20" cy="20" r="3"/><path d="M20 7v4m0 18v4M7 20h4m18 0h4M11 11l3 3m12 12 3 3M11 29l3-3m12-12 3-3"/>',legacy:'<path d="m20 7 12 13-12 13L8 20Zm0 7 6 6-6 6-6-6Z"/>'};
 return `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="22" stroke="currentColor" opacity=".2"/><g transform="translate(4 4)" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">${paths[a.category]||paths.campaign}</g>${done?'<circle cx="40" cy="39" r="7" fill="#d2ddeb"/><path d="m37 39 2 2 4-4" stroke="#253043" stroke-width="1.5"/>':''}</svg>`;
}
function renderAwards(){
 const p=A.profile,defs=G.achievements,earned=new Set(p.achievements),progress=new Map(defs.map(a=>[a.id,earned.has(a.id)?a.target:a.progress(p)])),done=defs.filter(a=>earned.has(a.id)).length,rank=G.rank(p),percent=Math.round(done/defs.length*100);
 $('awardTotal').innerHTML=`${done}<small> / ${defs.length}</small><span>знаков отличия</span>`;
 $('awardCareer').innerHTML=`<div class="career-mark" aria-hidden="true"><svg viewBox="0 0 120 120" fill="none"><circle cx="60" cy="60" r="50" stroke="#c0d4f030"/><circle cx="60" cy="60" r="50" stroke="#d1dff3" stroke-width="2" stroke-dasharray="${done/defs.length*314.16} 314.16" transform="rotate(-90 60 60)"/><path d="m60 24 9 26 27 10-27 9-9 27-9-27-27-9 27-10Z" stroke="#b7cce8"/><path d="m60 42 5 13 13 5-13 5-5 13-5-13-13-5 13-5Z" fill="#b7cce826" stroke="#d9e5f7"/></svg></div><div class="career-copy"><span class="eyebrow">${percent}% КОЛЛЕКЦИИ</span><h3>${rank.name}</h3><p>${money(p.xp)} XP${rank.next?' · ещё '+money(rank.next.xp-p.xp)+' до следующего ранга':' · высший ранг'}</p><div class="career-stats"><span><b>${O.Campaign.count(p)}</b> доставок</span><span><b>${G.totalMedals(p)}</b> медалей</span></div></div>`;
 $('achievementCategories').innerHTML=[['all','Все разделы','∞'],...O.Achievements.CATEGORIES].map(([id,n])=>{const ds=id==='all'?defs:defs.filter(d=>d.category===id);return `<button class="${category===id?'active':''}" aria-pressed="${category===id}" data-action="v8:award-category" data-category="${id}"><span>${n}</span><small>${ds.filter(a=>earned.has(a.id)).length}<i> / ${ds.length}</i></small></button>`;}).join('');
 for(const b of $$('.award-filters button')){b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',String(b.dataset.filter===filter));}
 const near=defs.filter(a=>!earned.has(a.id)).sort((a,b)=>progress.get(b.id)/b.target-progress.get(a.id)/a.target)[0];
 $('achievementFocus').innerHTML=near?`<span class="focus-art">${awardArt(near)}</span><div><span class="eyebrow">СЛЕДУЮЩАЯ ЦЕЛЬ</span><h3>${near.name}</h3><p>${near.text}</p><div class="focus-progress"><span style="width:${progress.get(near.id)/near.target*100}%"></span></div><small>${progress.get(near.id)} / ${near.target}<span>+${near.xp} XP</span></small></div>`:'<div><span class="eyebrow">ВСЕ ОТКРЫТИЯ СОБРАНЫ</span><h3>Коллекция завершена</h3><p>За каждым знаком — пройденный путь.</p></div>';
 const list=defs.filter(a=>{const done=earned.has(a.id);return(category==='all'||a.category===category)&&(!query||(a.name+' '+a.text).toLowerCase().includes(query))&&(filter==='all'||filter==='earned'&&done||filter==='locked'&&!done||filter==='near'&&!done&&progress.get(a.id)/a.target>=.5);});
 $('awardSectionTitle').textContent=category==='all'?'Все разделы':O.Achievements.CATEGORIES.find(c=>c[0]===category)[1];$('awardResultCount').textContent=`${list.length} из ${defs.length}`;
 $('achievementGrid').innerHTML=list.map(a=>{const done=earned.has(a.id),n=progress.get(a.id);return `<article data-achievement="${a.id}" class="achievement-card ${done?'earned':''}"><div class="achievement-icon">${awardArt(a,done)}</div><div class="achievement-copy"><span class="achievement-section">${O.Achievements.CATEGORIES.find(c=>c[0]===a.category)[1]}</span><h3>${a.name}</h3><p>${a.text}</p><div class="award-progress" role="progressbar" aria-label="${a.name}" aria-valuemin="0" aria-valuemax="${a.target}" aria-valuenow="${n}"><i style="width:${Math.min(100,n/a.target*100)}%"></i></div><small><span>${done?'✓ Получено':n+' / '+a.target}</span><span>+${a.xp} XP</span></small></div></article>`;}).join('')||'<div class="award-empty"><span>⌕</span><h3>Пока пусто</h3><p>Попробуй другой запрос или статус достижения.</p><button class="button quiet" data-action="personal:clear">Показать всю коллекцию</button></div>';
}

function renderShop(){let id=A.shopLevel??A.currentId,mode=A.shopMode||A.profile.difficulty,l=P.prepareLevel(L[id],mode),st=A.stats();$('shopContext').innerHTML=`<strong>Эффект на выбранном контракте</strong><p><select id="shopLevelSelect" aria-label="Контракт для расчёта">${O.Campaign.order.map(id=>L[id]).map(q=>`<option value="${q.id}" ${q.id===id?'selected':''}>${O.Campaign.number(q.id)}. ${q.name}</option>`).join('')}</select> <select id="shopModeSelect" aria-label="Режим расчёта"><option value="normal" ${mode==='normal'?'selected':''}>Обычный</option><option value="pro" ${mode==='pro'?'selected':''}>ПРО</option></select></p><small>Покупка не отменяет обязательный маршрут, приём посылок и ограничения скорости.</small>`;
for(const key of ['docking','engine']){const lv=A.profile.upgrades[key],next=Math.min(5,lv+1),card=document.querySelector(`.upgrade-card[data-module="${key}"]`)||document.querySelector(`[data-action=upgrade][data-key="${key}"]`)?.closest('article');if(!card)continue;let text;if(key==='docking'){const p=structuredClone(A.profile);p.upgrades.docking=next;text=`Допуск здесь: ${P.captureRadius(l,G.stats(A.profile)).toFixed(1)} → ${P.captureRadius(l,G.stats(p)).toFixed(1)} ед.`;}else text=`Расчётный расход: ${Math.round((1-.03*lv)*100)}% → ${Math.round((1-.03*next)*100)}%`;let node=document.createElement('div');node.className='module-effect';node.innerHTML=`<b>${text}</b>${key==='docking'?'Бонус действует и на строгих станциях.':'Физическая скорость не меняется. Экономия улучшает топливную оценку при обычном запуске.'}`;card.querySelector('.module-spec')?.after(node);}}
function settings(t=tab){
 tab=['flight','display','control','save'].includes(t)?t:'flight';t=tab;const p=A.profile,s=p.settings;
 const toggle=(key,name,description)=>`<label class="preference-row"><span><strong>${name}</strong><small>${description}</small></span><input type="checkbox" role="switch" data-setting="${key}" ${s[key]?'checked':''}/><i aria-hidden="true"></i></label>`;
 let body='';
 if(t==='flight')body=O.FlightSettings.content(toggle)+`<details class="control-guide"><summary>Клавиши и жесты</summary><div><p><kbd>Пробел</kbd><span>Запуск / пауза</span></p><p><kbd>R</kbd><span>Повторить рейс</span></p><p><kbd>G</kbd><span>Гравитационное поле</span></p><p><kbd>← → / ↑ ↓</kbd><span>Угол / скорость</span></p><p>«Курс» — прицел. «Обзор» — перемещение карты. Два пальца или колесо — масштаб. Alt + перетаскивание — обзор.</p><p>В режиме «Планеты» стрелки перемещают выбранный мир, Shift увеличивает шаг.</p></div></details>`;
 if(t==='display')body=`<header class="preference-heading"><h3>Комфортный полёт</h3><p>Оставь на экране то, что помогает ориентироваться.</p></header><div class="preference-group">${toggle('grid','Гравитационное поле','Стрелки показывают направление притяжения.')}${toggle('ghost','Прошлая траектория','Сравнивай курс с предыдущей попыткой.')}</div><div class="preference-label">ВОСПРИЯТИЕ</div><div class="preference-group">${toggle('highContrast','Высокий контраст','Более заметные подписи и границы.')}${toggle('reducedMotion','Спокойные эффекты','Статичные предпросмотры и меньше декоративного движения.')}</div><p class="preference-note">Орбиты и скорость симуляции сохраняют свои правила при любых настройках.</p>`;
 if(t==='control')body=`<header class="preference-heading"><h3>Звуки и сигналы</h3><p>Настрой громкость навигационных сигналов и двигателя.</p></header><div class="preference-group">${toggle('sound','Звуки полёта','Сигналы маршрута, стыковки и тихий гул двигателя.')}</div><label class="preference-volume" for="soundVolume"><span>Громкость <output id="soundVolumeValue">${Math.round(s.volume*100)}%</output></span><input id="soundVolume" type="range" min="0" max="100" value="${Math.round(s.volume*100)}"/></label><button id="soundPreview" class="sound-preview" data-action="flight:sound-preview">▷ Проверить звук</button><p class="preference-note">Выбор громкости сохраняется. Можно настроить её заранее, даже когда звук выключен.</p>`;
 if(t==='save')body=`<header class="preference-heading"><h3>Прогресс и резервные копии</h3><p>Прогресс записывается после каждой доставки.</p></header><div class="storage-status ${A.storageOK?'':'bad'}"><span class="storage-dot"></span><div><strong>${A.storageOK?'На этом устройстве':'Сохранение недоступно'}</strong><p>${A.storageOK?'Автосохранение работает. Можно продолжить после закрытия игры.':'Скачай копию прогресса, чтобы сохранить результаты.'}</p><small>${G.completed(p)} доставок · ${G.totalMedals(p)} медалей</small></div></div><button class="account-setting" data-action="cloud"><span class="account-setting-icon">☁</span><span><strong>Аккаунт и облако</strong><small>Продолжай экспедицию на другом устройстве</small></span><b>↗</b></button><div class="preference-label">РЕЗЕРВНАЯ КОПИЯ</div><div class="backup-actions"><button data-action="export"><span>↓</span><strong>Скачать копию</strong><small>Файл прогресса JSON</small></button><button data-action="import"><span>↑</span><strong>Восстановить</strong><small>Из сохранённого файла</small></button></div><p class="preference-note">В копию входят ресурсы, награды, оснащение, курсы A/B и положения планет. Импорт заменит профиль после подтверждения.</p><details class="settings-danger"><summary>Удаление прогресса</summary><p>Сброс удалит профиль на этом устройстве. Сначала можно скачать резервную копию.</p><button class="button danger" data-action="v8:reset-confirm">Сбросить профиль…</button></details>`;
 A.openModal('Настройки',`<div class="preferences-layout"><nav class="settings-tabs" role="tablist" aria-label="Раздел настроек">${[['flight','Полёт','↗'],['display','Экран','◈'],['control','Звук','♫'],['save','Прогресс','◷']].map(([k,n,icon])=>`<button id="settings-${k}" role="tab" aria-controls="settingsPanel" aria-selected="${k===t}" tabindex="${k===t?'0':'-1'}" class="${k===t?'active':''}" data-action="v8:settings-tab" data-tab="${k}"><span aria-hidden="true">${icon}</span>${n}</button>`).join('')}</nav><section id="settingsPanel" class="settings-section" role="tabpanel" aria-labelledby="settings-${t}">${body}</section></div><footer class="preferences-footer"><span>Изменения сохраняются сразу</span><button class="button primary" data-action="close">Готово</button></footer>`,'БОРТОВОЙ КОМПЬЮТЕР');
 $('modal').classList.add('preferences-modal');O.FlightSettings.sync();
}

function resetConfirm(){A.openModal('Удалить прогресс?','<p>Экспортированные копии останутся целыми. Для подтверждения введи <b>СБРОС</b>.</p><input id="resetWord" class="reset-word" autocomplete="off"><div class="modal-actions"><button class="button quiet" data-action="close">Отмена</button><button class="button danger" id="resetFinal" data-action="reset" disabled>Удалить профиль</button></div>');$('resetWord').addEventListener('input',e=>$('resetFinal').disabled=e.target.value.trim()!=='СБРОС');}
function economy(){A.openModal('Экономика '+O.Campaign.order.length+' контрактов','<p>Каждый контракт хранит один денежный рекорд: обе ветви и ПРО делят максимум. Повтор приносит только рост стоимости результата. Ошибки бесплатны.</p><p>Пять ступеней требуют 2 / 8 / 20 / 40 / 64 завершённых контракта и 0 / 2 / 5 / 9 / 14 данных.</p><p>Цена — округлённое вверх до 5 значение B × t<sup>1,88</sup> × (1 + 0,025N) × (1 − скидка). Исследования дают до 8% скидки. Покупки и возвраты записываются по фактическим чекам.</p><p>Высшие ступени предполагают специализацию, а не выкуп всех модулей. За достижения — только опыт.</p><div class="modal-actions"><button class="button primary" data-action="close">Понятно</button></div>');}
function zoom(f){const c=A.camera;c.zoom=P.clamp(c.zoom*f,1,4);const edge=Math.max(28,64/c.zoom);c.cx=P.clamp(c.cx,600/c.zoom-edge,1200-600/c.zoom+edge);c.cy=P.clamp(c.cy,350/c.zoom-edge,700-350/c.zoom+edge);}
const actions={'v8:analysis':openReview,'v8:summary':()=>resultView('summary'),'v8:panel':()=>document.querySelector('.flight-panel').classList.toggle('nav-expanded'),'v8:branch':selectBranch,'v8:award-category':b=>{category=b.dataset.category;renderAwards();},'v8:award-filter':b=>{filter=b.dataset.filter;renderAwards();},'v8:settings-tab':b=>settings(b.dataset.tab),'v8:reset-confirm':resetConfirm,'v8:zoom-in':()=>zoom(1.25),'v8:zoom-out':()=>zoom(.8),'v8:zoom-reset':()=>{A.camera={zoom:1,cx:600,cy:350};},'v8:fullscreen':async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();schedule();}catch{A.toast('Браузер не разрешил полноэкранный режим.');}},'v8:report':showReport,
  'v8:review-event':()=>{
    A.closeModal();
    if(document.body.dataset.resultView!=='analysis')resultView('analysis');
    jumpToEvent(true);
  },
  'v8:compare':compareAttempts
};
document.addEventListener('click',e=>{let b=e.target.closest('[data-action]');if(b&&!b.disabled)actions[b.dataset.action]?.(b);});$('objectivesList').addEventListener('click',medalHelp);$('objectivesList').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();medalHelp();}});$('awardSearch').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();renderAwards();});document.addEventListener('change',e=>{if(e.target.id==='shopLevelSelect'){A.shopLevel=+e.target.value;A.renderHangar();}if(e.target.id==='shopModeSelect'){A.shopMode=e.target.value;A.renderHangar();}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b?.dataset.action==='personal:clear'){query='';filter='all';category='all';$('awardSearch').value='';renderAwards();$('awardSearch').focus();}if(b?.matches('.settings-tabs button,.achievement-categories button')){const selector=b.dataset.tab?'#settings-'+b.dataset.tab:'[data-action="v8:award-category"][data-category="'+b.dataset.category+'"]';requestAnimationFrame(()=>document.querySelector(selector)?.focus({preventScroll:true}));}});
document.addEventListener('keydown',e=>{if(!e.target.matches('.settings-tabs [role=tab]')||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const keys=['flight','display','control','save'],i=keys.indexOf(e.target.dataset.tab),n=e.key==='Home'?0:e.key==='End'?3:(i+(['ArrowLeft','ArrowUp'].includes(e.key)?3:1))%4;settings(keys[n]);$('settings-'+keys[n]).focus();});
O.V8={onLevel,onPage,sync,updateRoute,medalHelp,showResult,showReport,renderAwards,renderShop,settings,resetConfirm,economy,layout};schedule();
})(typeof globalThis!=='undefined'?globalThis:window);
