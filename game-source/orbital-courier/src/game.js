/* Application state machine and accessible DOM UI. Physics lives in physics.js. */
(function (root) {
  'use strict';
  const O=root.Orbital,P=O.Physics,G=O.Progress,L=O.LEVELS,E=O.Economy,C=O.Campaign;
  const $=id=>document.getElementById(id), $$=selector=>[...document.querySelectorAll(selector)];
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad=n=>String(n).padStart(2,'0');
  const plural=(n,one,few,many)=>n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many;
  const money=n=>Math.round(n).toLocaleString('ru-RU');
  const starHTML=mask=>`<span class="stars">${[1,2,4].map(bit=>`<span class="${mask&bit?'on':''}">★</span>`).join('')}</span>`;
  let storage=null;try{storage=root.localStorage;}catch{/* Some file:// and private modes deny storage. */}
  const loaded=G.read(storage);
  const app={heroTime:0,heroPointer:{x:0,y:0},heroTarget:{x:0,y:0},profile:loaded.profile,screen:'home',currentId:C.order[0],angle:0,speed:200,
    activeLevel:null,assisted:false,state:null,paused:false,accumulator:0,timeScale:loaded.profile.settings.playbackSpeed,trail:[],ghosts:{},aims:{},preview:null,
    cosmeticTab:'models',campaignSector:-1,campaignQuery:'',campaignFilter:'open',attemptHistory:{},transitioning:false,transitionToken:0,previewDirty:true,particles:[],lastResult:null,storageOK:loaded.available,modalPause:false,frameTime:0};
  app.camera={zoom:1,cx:600,cy:350};app.branchView='A';O.App=app;let lastPlaybackPreference=app.profile.settings.playbackSpeed;
  const sound=new O.Sound(),gameRenderer=new O.Renderer($('gameCanvas')),heroRenderer=new O.Renderer($('heroCanvas'));
  const homeMotionPreference=root.matchMedia('(prefers-reduced-motion: reduce)');
  let heroPaused=false,heroLastDraw=-Infinity,heroStillKey='',homeChartKey='';
  const cataloguePreviews=new IntersectionObserver((entries,observer)=>{
    for(const {isIntersecting,target:canvas} of entries){
      if(!isIntersecting)continue;
      observer.unobserve(canvas);
      if(canvas.isConnected&&app.screen==='campaign')drawRouteChart(canvas,L[+canvas.dataset.mini]);
    }
  },{rootMargin:'100px'});
  app.sound=sound;const modal=$('modal');

  function skin(){return G.SKINS.find(s=>s.id===app.profile.skin)||G.SKINS[0];}
  function level(){return app.activeLevel||P.prepareLevel(L[app.currentId],app.profile.difficulty,app.profile.layouts?.[courseKey()]);}
  function displayState(){return O.Review?.currentFrame()||app.state;}
  function displayLevel(){return O.Routes.view(level(),displayState(),app.branchView);}
  function flightGuide(state=displayState()){
    return O.FlightObjectives.inspect(level(),state,app.branchView,state?.stats||stats());
  }
  function stats(){const st=G.stats(app.profile);if(app.profile.difficulty==='pro')st.preview*=.6;return st;}
  function isFlying(){return app.screen==='play'&&app.state?.status==='flying';}
  function isAiming(){return app.screen==='play'&&!app.state;}
  function save(reason='progress'){
    app.storageOK=G.write(storage,app.profile);$('saveWarning').hidden=app.storageOK;
    root.dispatchEvent(new CustomEvent(app.storageOK?'orbital-save':'orbital-save-error',{detail:{reason}}));
    return app.storageOK;
  }
  function toast(message,error=false){
    const el=document.createElement('div');el.className='toast'+(error?' error':'');el.textContent=message;
    $('toastArea').replaceChildren(el);setTimeout(()=>el.remove(),3800);
  }
  function awardNotice(awards,prefix=''){
    const message=awards.map(a=>`${a.name} · +${a.xp} XP`).join('; ');
    if(message)toast(`${prefix?prefix+'\n':''}Достижения: ${message}`);
    if(app.screen==='awards')renderAwards();
  }
  function homeContract(){
    const {profile}=app;
    return G.unlocked(profile,profile.lastLevel)?L[profile.lastLevel]:L[G.nextLevel(profile)];
  }
  function contractTask(l){
    if(l.id===4)return 'Обогни Титан и состыкуйся со станцией.';
    if(l.id===8)return 'Найди курс к станции в поле трёх планет.';
    return l.brief;
  }
  function drawRouteChart(canvas,l){
    const {difficulty,layouts}=app.profile;
    const prepared=P.prepareLevel(l,difficulty,layouts?.[`${l.id}:${difficulty}`]);
    new O.Renderer(canvas).routeChart(prepared);
  }
  function renderHome(){
    const p=app.profile,l=homeContract(),r=G.rank(p);
    const returning=l.id!==C.order[0]||G.record(p,l.id).attempts>0||C.current(p,l.id);
    $('homeFlightSector').textContent=`${returning?'Последний рейс':'Первый рейс'} · ${O.SECTORS[l.sector].name}`;
    $('homeFlightName').textContent=l.name;
    $('homeFlightTask').textContent=contractTask(l);
    $('homeCompleted').innerHTML=`${C.count(p)} <small>/ ${C.order.length}</small>`;
    $('homeMedals').innerHTML=`${campaignMedals(p)} <small>/ ${C.order.length*3}</small>`;
    $('homeRank').textContent=r.name;
    const part=r.next?(p.xp-r.xp)/(r.next.xp-r.xp):1;
    $('homeXPBar').style.width=`${P.clamp(part,0,1)*100}%`;
    $('homeXPLabel').textContent=r.next?`До ранга «${r.next.name}» · ${money(r.next.xp-p.xp)} XP`:'Высший ранг';
    const chartKey=JSON.stringify([l.id,p.difficulty,p.layouts?.[`${l.id}:${p.difficulty}`]]);
    if(chartKey!==homeChartKey){
      drawRouteChart($('homeRouteMap'),l);
      homeChartKey=chartKey;
    }
  }
  function updateProfileUI(){
    if(app.profile.settings.playbackSpeed!==lastPlaybackPreference){lastPlaybackPreference=app.profile.settings.playbackSpeed;app.timeScale=lastPlaybackPreference;}
    const p=app.profile;
    $('creditValue').textContent=money(p.credits);$('dataValue').textContent=p.data;$('rankBadge').textContent=G.rank(p).name;
    if(document.body.dataset.page==='home')renderHome();
    document.body.classList.toggle('high-contrast',!!p.settings.highContrast);sound.enabled=p.settings.sound;sound.setVolume(p.settings.volume);document.body.classList.toggle('reduce-motion',p.settings.reducedMotion);
    $('saveWarning').hidden=app.storageOK;
    const motion=$('homeMotionToggle'),limited=p.settings.reducedMotion||homeMotionPreference.matches;
    motion.disabled=limited;motion.setAttribute('aria-pressed',String(heroPaused||limited));
    motion.textContent=limited?'Без анимации':heroPaused?'Оживить космос':'Пауза анимации';
  }
  function go(page,force=false){
    if(!['home','campaign','hangar','awards','play'].includes(page))return;
    if(isFlying()&&page!=='play'&&!force){
      openModal('Прервать полёт?',`<p>Нынешняя попытка закончится. Уже заработанные кредиты, медали и улучшения сохранятся.</p><div class="modal-actions"><button class="button quiet" data-action="close">Продолжить полёт</button><button class="button primary" data-action="force-nav" data-page="${page}">Перейти</button></div>`);
      return;
    }
    if(app.transitioning&&page!=='play')cancelTravel();
    if(O.Navigation?.beforeGo(page))return;
    if(page!=='campaign')cataloguePreviews.disconnect();
    closeModal();if(page!=='play'){app.state=null;app.paused=false;app.accumulator=0;}
    app.screen=page;document.body.dataset.page=page;for(const el of $$('.screen')){el.hidden=el.id!==page;el.classList.toggle('active',el.id===page);}
    for(const b of $$('.topbar nav [data-page],.mobile-nav [data-page]'))b.classList.toggle('active',b.dataset.page===page||(page==='play'&&b.dataset.page==='campaign'));
    if(page==='campaign')renderCampaign();if(page==='hangar')renderHangar();if(page==='awards')renderAwards();
    O.UI9?.onPage(page);O.V8?.onPage(page);updateProfileUI();root.scrollTo({top:0,behavior:'instant'});
  }
  function campaignMedals(p){return C.order.reduce((n,id)=>n+G.medalCount(L[id].routeRevision>8?G.viewRecord(p,id).currentMedals:G.record(p,id).medals),0);}
  function lockReason(l){return G.lockReason(app.profile,l.id);}
  function contractCard(l,open,current){
    const p=app.profile,r=G.record(p,l.id),done=C.current(p,l.id),number=C.number(l.id);
    const info=done?`${r.bestScore}/100${r.proWon?' · ПРО':''}`:
      l.routeRevision>8&&(r.medals&1)?'Новый маршрут · прежний рекорд сохранён':'';
    const task=open?contractTask(l):lockReason(l);
    return `<button type="button" class="mission-card${current?' current':''}${done?' completed':''}" data-action="mission" data-id="${l.id}"
      ${open?'':'disabled'} aria-label="${escape(l.name)}" aria-describedby="contractTask${l.id}">
      <span class="dispatch-thumb"><canvas data-mini="${l.id}" width="360" height="210" aria-hidden="true"></canvas></span>
      <span class="dispatch-card-copy">
        <small class="dispatch-card-sector">${pad(number)} · ${escape(O.SECTORS[l.sector].name)}${done?' · Доставлен':''}</small>
        <strong class="dispatch-name">${escape(l.name)}</strong>
        <span class="mission-status" id="contractTask${l.id}">${escape(task)}</span>
        ${info?`<small class="dispatch-note">${done?starHTML(r.medals)+' ':''}${info}</small>`:''}
      </span>
      <span class="dispatch-arrow" aria-hidden="true">${open?'↗':''}</span>
    </button>`;
  }
  function renderCampaign(){
    const p=app.profile,selected=app.campaignSector,filter=app.campaignFilter;
    const query=app.campaignQuery.trim().toLowerCase(),tokens=query.split(/\s+/);
    const levels=C.order.map(id=>L[id]),available=new Set(C.order.filter(id=>G.unlocked(p,id)));
    const quickView=!query&&selected===-1&&filter==='open',lastId=homeContract().id;
    const tier=C.tiers.find(t=>t.sectors.includes(selected));
    const focused=document.activeElement?.dataset;
    $('campaignTotal').innerHTML=`<strong>${C.count(p)} / ${C.order.length}</strong> доставлено`;
    $('availableCount').textContent=available.size;
    document.querySelector('[data-action="available-contracts"]').setAttribute('aria-pressed',String(quickView));
    $('difficultyTabs').innerHTML=C.tiers.map((t,i)=>`<button type="button" data-action="campaign-tier" data-tier="${i}" aria-pressed="${t===tier}">${t.name}</button>`).join('');
    $('sectorSelect').innerHTML='<option value="-1">Все секторы</option>'+C.sectors.map(id=>`<option value="${id}">${escape(O.SECTORS[id].name)}</option>`).join('');
    $('sectorSelect').value=selected;
    $('sectorTabs').innerHTML=[
      `<button type="button" class="dispatch-sector-choice" data-action="sector" data-sector="-1" aria-pressed="${selected===-1}">Все секторы</button>`,
      ...(tier?.sectors||C.sectors).map(id=>{
        const group=levels.filter(l=>l.sector===id);
        return `<button type="button" class="dispatch-sector-choice" data-action="sector" data-sector="${id}" aria-pressed="${selected===id}">
          ${escape(O.SECTORS[id].name)} <small>${group.filter(l=>C.current(p,l.id)).length}/${group.length}</small></button>`;
      })
    ].join('');
    for(const b of $$('[data-action=contract-filter]'))b.setAttribute('aria-pressed',String(b.dataset.filter===filter));
    const visible=levels.filter(l=>{
      if(query){
        const label=`${C.number(l.id)} ${pad(C.number(l.id))} ${l.name} ${O.SECTORS[l.sector].name}`.toLowerCase();
        if(!tokens.every(token=>label.includes(token)))return false;
      }else if(selected!==-1&&l.sector!==selected)return false;
      if(filter==='open'&&!available.has(l.id))return false;
      if(filter==='unfinished'&&C.current(p,l.id))return false;
      if(filter==='new'&&l.newIn!==13)return false;
      return true;
    });
    if(quickView){
      visible.sort((a,b)=>Number(b.id===lastId)-Number(a.id===lastId)||Number(C.current(p,a.id))-Number(C.current(p,b.id)));
    }
    const sector=!query&&selected>=0?O.SECTORS[selected]:null;
    const overview=$('sectorOverview');
    overview.hidden=!sector;
    overview.innerHTML=sector?`<h2>${escape(sector.name)}</h2><span>${visible.filter(l=>C.current(p,l.id)).length} / ${visible.length} доставлено</span>`:'';
    cataloguePreviews.disconnect();
    $('missionGrid').innerHTML=visible.length?visible.map(l=>contractCard(l,available.has(l.id),l.id===lastId)).join(''):
      `<div class="contract-empty"><strong>Маршрутов не найдено</strong><p>Попробуй другой сектор, номер или фильтр.</p><button class="button quiet" data-action="clear-contracts">Сбросить фильтры</button></div>`;
    $('contractResultCount').hidden=quickView;
    $('contractResultCount').textContent=`Показано ${visible.length} из ${C.order.length} контрактов`;
    const charts=$$('#missionGrid canvas[data-mini]');
    for(const canvas of charts.slice(0,2))drawRouteChart(canvas,L[+canvas.dataset.mini]);
    for(const canvas of charts.slice(2))cataloguePreviews.observe(canvas);
    if(focused?.action==='campaign-tier')document.querySelector(`[data-tier="${focused.tier}"]`)?.focus({preventScroll:true});
    if(focused?.action==='sector')document.querySelector(`#sectorTabs [data-sector="${focused.sector}"]`)?.focus({preventScroll:true});
  }
  function chooseSector(id){
    app.campaignSector=C.sectors.includes(id)?id:-1;
    app.campaignQuery='';$('contractSearch').value='';app.campaignFilter='all';
    renderCampaign();
  }
  function setCampaignOptions(open){
    $('campaignOptions').hidden=!open;
    document.querySelector('[data-action="campaign-options"]').setAttribute('aria-expanded',String(open));
  }
  function resetCampaignFilters(filter){
    app.campaignSector=-1;
    app.campaignQuery='';$('contractSearch').value='';
    app.campaignFilter=filter;
  }
  function courseKey(){return `${app.currentId}:${app.profile.difficulty}`;}
  const timingText=value=>value.toFixed(1).replace('.',',')+' с';
  const clockText=value=>value.toLocaleString('ru-RU',{maximumFractionDigits:2});
  const scheduleText=O.FlightObjectives.windowLabel;
  function aimValues(){
    const {launchDelay}=level();
    return {angle:app.angle,speed:app.speed,...(launchDelay!==undefined?{launchDelay}:{})};
  }
  function courseText(q){
    return `${q.angle.toFixed(1)}° / ${q.speed}${q.launchDelay!==undefined?' · старт +'+timingText(q.launchDelay):''}`;
  }
  function renderCourseMemory(){
    const saved=app.profile.courses[courseKey()]||[],disabled=!!app.state;
    $('courseSlots').innerHTML=[0,1].map(i=>`<div class="course-slot"><b>КУРС ${i?'B':'A'}</b><button data-action="recall-course" data-slot="${i}" ${disabled||!saved[i]?'disabled':''} aria-label="Применить курс ${i?'B':'A'}">${saved[i]?`${courseText(saved[i])}<span>Применить ↗</span>`:'Пока пусто'}</button><button class="store-course" data-action="store-course" data-slot="${i}" ${disabled?'disabled':''} aria-label="Записать текущий курс в ${i?'B':'A'}">Записать</button></div>`).join('');
    const last=app.attemptHistory?.[courseKey()]?.at(-1);
    $('previousAimButton').disabled=disabled||!last;$('previousAimButton').textContent=last?`↶ Прошлый запуск: ${courseText(last)}`:'↶ Здесь появится прошлый запуск';
    $('compassArrow').setAttribute('transform',`rotate(${-app.angle} 26 26)`);
    $('previousLevel').disabled=!G.unlocked(app.profile,C.adjacent(app.currentId,-1));
    $('followingLevel').disabled=!G.unlocked(app.profile,C.adjacent(app.currentId,1));
    $('levelPosition').textContent=`${pad(C.number(app.currentId))} / ${C.order.length}`;
    $('angleRange').style.setProperty('--range',((app.angle+180)/360*100)+'%');
    $('speedRange').style.setProperty('--range',((app.speed-60)/(stats().maxSpeed-60)*100)+'%');
  }
  function storeCourse(slot){if(!isAiming())return;if(P.layoutProblem(level(),level().layout))return toast('Сначала размести планеты без пересечений.',true);const key=courseKey();app.profile.courses[key]??=[null,null];app.profile.courses[key][slot]={...aimValues(),...(level().layout?{layout:structuredClone(level().layout)}:{})};save();renderCourseMemory();toast(`Курс ${slot?'B':'A'}${level().layout?' и планеты':''} записан`);}
  function useCourse(q,persistLayout=true){
    if(!isAiming()||!q)return;
    if(q.layout)setLayout(q.layout,persistLayout);
    setLaunchDelay(q.launchDelay);
    setAim(q.angle,q.speed);
  }
  function recallCourse(slot){useCourse(app.profile.courses[courseKey()]?.[slot]);}
  function setLaunchDelay(value){
    const base=L[app.currentId];
    if(!isAiming()||!base.launchTiming)return;
    const delay=P.launchDelay(base,value);
    if(delay===level().launchDelay)return;
    app.activeLevel=P.prepareLevel(base,app.profile.difficulty,level().layout,delay);
    app.aims[app.currentId]=aimValues();
    app.previewDirty=true;syncLaunchTiming();
  }
  function syncLaunchTiming(){
    const l=level(),range=$('launchDelayRange'),visible=isAiming()&&!!l.launchTiming;
    $('launchTiming').hidden=!visible;
    range.disabled=!visible;
    const schedule=$('dockSchedule'),windows=visible?P.receptionWindows(l):[];
    const limit=visible&&!windows.length?l.rules.maxDockSpeed:0;
    schedule.hidden=!windows.length&&!limit;
    schedule.dataset.windows=String(windows.length);
    schedule.classList.toggle('dock-speed-limit',!!limit);
    if(windows.length>1){
      const legend=windows.map((interval,i)=>`<span class="dock-slot" data-slot="${i}">${O.FlightObjectives.receptionLabel(i)} ${scheduleText(interval)}</span>`).join(' ');
      if(schedule.innerHTML!==legend)schedule.innerHTML=legend;
    }else schedule.textContent=windows.length?'Приём '+scheduleText(windows[0]):limit?`Сближение ≤ ${limit} ед./с`:'';
    if(!visible)return;
    range.max=l.launchTiming.max;
    if(+range.value!==l.launchDelay)range.value=l.launchDelay;
    range.setAttribute('aria-valuetext',timingText(l.launchDelay));
    range.style.setProperty('--range-fill',l.launchDelay/l.launchTiming.max*100+'%');
    $('launchDelayValue').textContent=timingText(l.launchDelay);
    $('launchDelayMax').textContent=clockText(l.launchTiming.max)+' с';
    const focused=document.activeElement;
    $('launchEarlier').disabled=$('launchDelayReset').disabled=l.launchDelay===0;
    $('launchLater').disabled=l.launchDelay>=l.launchTiming.max;
    if(focused?.disabled&&$('launchTiming').contains(focused))range.focus({preventScroll:true});
  }
  function previewFlight(){
    const l=level(),s=stats();
    const duration=P.forecastDuration(l,s.preview);
    const forecast=P.simulate(l,app.angle,app.speed,s,duration,l.launchTiming?4:7);
    if(l.launchTiming){
      const meeting=forecast.rendezvous=P.stationForecast(l,forecast),state=forecast.state;
      const elapsed=state.status==='crash'?state.t:meeting.ship.t;
      const {windows,time,index}=P.receptionAt(l,elapsed),multiple=windows.length>1;
      const incompleteFlyby=state.status!=='crash'&&state.flybyIndex<(l.flybys?.length||0);
      let status=windows.length?'Промах':`Промах ≈ ${Math.max(1,Math.round(meeting.gap))} ед.`;
      if(state.status==='won')status=multiple?O.FlightObjectives.receptionLabel(index):'Стыковка';
      else if(state.reason==='window')status=index<0?'Приём окончен':index>0?'Между окнами':'Шлюз закрыт';
      else if(state.reason==='manifest')status='Нужен груз';
      else if(state.reason==='overspeed')status='Быстро';
      else if(state.status==='crash')status='Столкновение';
      else if(incompleteFlyby)status='Нужен облёт';
      else if(meeting.contact)status='Док отклонит заход';
      const showSpeed=l.rules.maxDockSpeed&&(state.status==='won'||state.reason==='overspeed');
      const stamp=showSpeed?`${Math.ceil(state.dockSpeed-1e-7)}\u00a0ед./с`:
        windows.length?`${multiple?'':'в '}${clockText(time)} с`:'+'+timingText(elapsed);
      $('launchForecast').textContent=incompleteFlyby?status:`${status} · ${stamp.replace(/ с$/,'\u00a0с')}`;
      $('launchForecast').dataset.contact=String(state.status==='won');
    }
    return forecast;
  }
  function setLayout(coordinates,persist=true){
    if(!isAiming()||!L[app.currentId].placement)return false;
    const base=L[app.currentId],layout=P.planetLayout(base,coordinates),problem=P.layoutProblem(base,layout);
    app.activeLevel=P.prepareLevel(base,app.profile.difficulty,layout);app.previewDirty=true;app.ghosts[app.currentId]=[];
    if(persist&&!problem&&!app.assisted){app.profile.layouts??={};app.profile.layouts[courseKey()]=layout;save();}
    O.UI9?.sync();return !problem;
  }
  function cancelTravel(){app.transitionToken++;app.transitioning=false;$('routeTransition').hidden=true;$('routeTransition').classList.remove('running');}
  function travelToLevel(id,confirmed=false){
    if(app.transitioning||!Number.isInteger(id)||id<0||id>=L.length)return;
    if(!G.unlocked(app.profile,id)){toast(lockReason(L[id]),true);return;}
    if(isFlying()&&!confirmed){openModal('Перейти к другому контракту?',`<p>Текущая попытка будет остановлена. Полученные награды сохраняются.</p><div class="modal-actions"><button class="button quiet" data-action="close">Остаться</button><button class="button primary" data-action="confirm-travel" data-id="${id}">Перейти</button></div>`);return;}
    if(O.Navigation?.beforeTravel(id))return;
    closeModal();if(app.profile.settings.reducedMotion||root.matchMedia('(prefers-reduced-motion: reduce)').matches||app.screen==='play'&&id===app.currentId){loadLevel(id);return;}
    const token=++app.transitionToken;app.transitioning=true;app.paused=true;
    $('jumpFrom').textContent=app.screen==='play'?pad(C.number(app.currentId)):'OC';$('jumpTo').textContent=pad(C.number(id));
    $('jumpTitle').textContent=L[id].name;$('jumpSector').textContent=O.SECTORS[L[id].sector].name;
    $('routeTransition').hidden=false;$('routeTransition').classList.remove('running');void $('routeTransition').offsetWidth;$('routeTransition').classList.add('running');
    setTimeout(()=>{if(app.transitionToken===token)loadLevel(id);},300);
    setTimeout(()=>{if(app.transitionToken!==token)return;app.transitioning=false;$('routeTransition').hidden=true;$('routeTransition').classList.remove('running');$('gameCanvas').focus({preventScroll:true});},760);
  }
  function moduleArt(key){
    const art={
      scanner:'<circle cx="40" cy="40" r="26" opacity=".25"/><circle cx="40" cy="40" r="17" opacity=".55"/><path d="M40 10V4M40 76v-6M10 40H4M76 40h-6M40 40l19-19M40 40l-9 13"/><circle cx="40" cy="40" r="4" fill="currentColor"/><circle cx="59" cy="21" r="3"/><path d="M40 14a26 26 0 0 1 26 26" stroke-width="3"/>',
      magnet:'<circle cx="40" cy="40" r="10"/><circle cx="40" cy="40" r="22" stroke-dasharray="4 6" opacity=".5"/><path d="M12 18Q8 55 34 45M66 17Q77 49 50 41M21 67Q47 71 41 51"/><path d="M29 44l5 1-2 5M54 37l-4 4 5 3M37 55l4-4 4 4"/><rect x="7" y="8" width="10" height="12" rx="2"/><rect x="62" y="7" width="10" height="12" rx="2"/>',
      docking:'<circle cx="40" cy="40" r="17"/><circle cx="40" cy="40" r="23" stroke-dasharray="18 5"/><path d="M16 40H7M64 40h9M40 17V8M40 63v9M34 40h12M40 34v12"/><rect x="3" y="25" width="10" height="30" rx="1"/><rect x="67" y="25" width="10" height="30" rx="1"/>',
      engine:'<path d="M25 24L33 8h14l8 16v22H25ZM25 31L14 45v12l11-9M55 31l11 14v12l-11-9M29 46l-4 9h30l-4-9M30 61l-3 11M40 59v18M50 61l3 11"/><rect x="32" y="26" width="16" height="14" rx="2"/>'
    };
    return `<svg viewBox="0 0 80 80" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${art[key]}</svg>`;
  }
  function chassisArt(){
    return `<svg viewBox="0 0 360 160" aria-label="Схема оснащения капсулы"><g fill="none" stroke="#6ba4bc" stroke-width="1"><ellipse cx="180" cy="80" rx="133" ry="51" stroke-dasharray="3 7" opacity=".35"/><path d="M27 80h306M180 12v136" opacity=".18"/><circle cx="180" cy="80" r="46" opacity=".3"/></g><g transform="translate(180 80) rotate(-23)"><path d="M54 0L-34-27l10 27-10 27Z" fill="#112c3b" stroke="#9ddecf" stroke-width="1.8"/><path d="M-27-17L18 0-27 17M-18 0H41" fill="none" stroke="#6af4cd" opacity=".65"/><path d="M-27-6h-28M-29 0h-43M-27 6h-28" stroke="#6af4cd" opacity=".6"/><rect x="-2" y="-5" width="13" height="10" rx="2" fill="#b9ffe8"/></g><g font-family="ui-monospace,Consolas,monospace" font-size="9" fill="#a2bbca" text-anchor="middle">${Object.keys(G.UPGRADE_DEFS).map((k,i)=>{const x=[59,301,59,301][i],y=[33,33,132,132][i];return `<text x="${x}" y="${y}">${['NAV','FIELD','DOCK','THRUST'][i]} / ${app.profile.upgrades[k]}</text>`;}).join('')}</g></svg>`;
  }
  function renderHangar(){
    const p=app.profile,done=G.completed(p),research=G.research(p),installed=G.installed(p);
    const planned=p.wishlist&&G.quote(p,p.wishlist);
    const wish=planned&&!planned.max?`<div class="saving-goal"><span>ЦЕЛЬ · ${G.UPGRADE_DEFS[p.wishlist].name}</span><strong>${money(Math.min(p.credits,planned.cost))} / ${money(planned.cost)} ◈</strong><div class="progress"><i style="width:${Math.min(100,p.credits/planned.cost*100)}%"></i></div><small>${planned.dataMissing?`Ещё ${planned.dataMissing} данных ⬡`:'Исследовательских данных достаточно'}</small></div>`:'';
    $('shopSummary').innerHTML=`<div class="chassis-preview"><div class="eyebrow">OC—239 / ЛИЧНАЯ КАПСУЛА</div>${chassisArt()}<div class="chassis-caption"><span>${G.rank(p).name}</span><b>${installed} / 20 <small>СТУПЕНЕЙ</small></b></div></div><div class="hangar-ledger"><div class="hangar-funds"><div><span>КРЕДИТЫ</span><strong class="credit-number">${money(p.credits)} <small>◈</small></strong></div><div><span>ИССЛЕДОВАНИЯ</span><strong class="data-number">${p.data} <small>⬡</small></strong></div></div><div class="hangar-license"><span>${done} доставок</span><span>Скидка ${(Math.min(.08,research*.002)*100).toFixed(1)}%</span><span>Вложено ${money(G.invested(p))} ◈</span></div>${wish}<div class="hangar-tools"><button class="text-button" data-action="respec-info">↺ Пересобрать капсулу</button><button class="text-button" data-action="economy-info">Как устроены цены →</button></div></div>`;
    const accents={scanner:'#78d9ff',magnet:'#bea4ff',docking:'#83ebc7',engine:'#ffc282'};
    $('upgradeGrid').innerHTML=Object.entries(G.UPGRADE_DEFS).map(([key,d],i)=>{
      const q=G.quote(p,key),lv=q.lv,max=q.max,selected=p.wishlist===key;
      const label=max?'Максимальная ступень':q.canBuy?'Установить модуль ↗':!q.eligible?'Лицензия ещё закрыта':'Не хватает ресурсов';
      const reason=max?'Все пять ступеней установлены':!q.eligible?`Откроется после ${q.required} доставок · сейчас ${done}`:[q.missing?`ещё ${money(q.missing)} ◈`:'кредиты собраны',q.dataMissing?`ещё ${q.dataMissing} ⬡`:'данных достаточно'].join(' · ');
      return `<article class="upgrade-card module-card ${selected?'wishlisted':''}" data-module="${key}" style="--module:${accents[key]}"><div class="module-head"><div class="module-identity"><span class="module-code">0${i+1} / ${['NAVIGATION','TRACTOR FIELD','DOCKING','PROPULSION'][i]}</span><h3>${d.name}</h3></div><div class="module-art">${moduleArt(key)}</div></div><p class="module-description">${d.description}</p><div class="module-spec"><div><span>СЕЙЧАС</span><strong>${d.values[lv]}<small>${d.unit}</small></strong></div>${!max?`<span class="spec-arrow">→</span><div class="spec-next"><span>ПОСЛЕ УСТАНОВКИ</span><strong>${d.values[lv+1]}<small>${d.unit}</small></strong></div>`:'<div class="module-max">✓ Полная мощность</div>'}</div><div class="module-tier"><span>СТУПЕНЬ ${lv} / 5</span><div class="level-bars" aria-label="Уровень ${lv} из 5">${[1,2,3,4,5].map(t=>`<i class="${t<=lv?'on':''}"></i>`).join('')}</div></div><div class="module-purchase"><div class="module-price">${max?'<span>ПОЛНОСТЬЮ ОСНАЩЁН</span>':`<strong>${money(q.cost)} <small>◈</small></strong><span class="data-price">${q.dataCost?`${q.dataCost} ⬡`:'Без данных'}</span>`}</div><span class="purchase-reason">${reason}</span><div class="module-actions"><button class="button ${q.canBuy?'primary':'quiet'}" data-action="upgrade" data-key="${key}" ${q.canBuy?'':'disabled'}>${label}</button>${!max?`<button class="module-bookmark ${selected?'selected':''}" data-action="wishlist" data-key="${key}" aria-pressed="${selected}" aria-label="${selected?'Убрать цель накопления':'Копить на этот модуль'}" title="${selected?'Цель накопления':'Планировать покупку'}">${selected?'✓':'＋'}</button>`:''}</div></div><details class="upgrade-plan"><summary>Пять ступеней развития</summary><div class="price-ladder">${[1,2,3,4,5].map((t,j)=>`<span class="${j<lv?'owned':j===lv?'next':''}"><small>${['I','II','III','IV','V'][j]}</small>${j<lv?'✓':money(E.price(key,t,installed+Math.max(0,j-lv),research))}<small>${j<lv?'':`${E.DATA_COSTS[j]} ⬡`}</small></span>`).join('')}</div><small>Расчётный порядок: сначала этот модуль. Другие покупки изменят смету.</small></details></article>`;
    }).join('');
    $('skinGrid').innerHTML=G.SKINS.map(s=>{const selected=p.skin===s.id,open=O.Cosmetics.unlocked(p,s)||selected;return `<button class="skin-card ${selected?'selected':''}" style="--skin:${s.color}" data-action="skin" data-key="${s.id}" ${open?'':'disabled'}><span class="skin-shape">➤</span><strong>${s.name}</strong><small>${selected?'Выбрано':open?'Выбрать окраску':`${s.xp} XP${s.requirement?' · '+s.requirement:''}`}</small></button>`;}).join('');
    renderCosmetics();O.V8?.renderShop();O.Hangar?.enhance();
  }
  function trailThumbnail(t){
    const paths={vector:'<path d="M10 45Q48 46 67 26T113 22"/>',comet:'<path d="M8 43Q44 45 68 26T113 22" stroke-width="9" opacity=".16"/><path d="M8 43Q44 45 68 26T113 22"/><circle cx="36" cy="38" r="2"/><circle cx="58" cy="38" r="1.5"/>',ion:'<path d="M9 40Q49 44 68 23T113 22M9 46Q49 50 70 30T113 22"/>',photon:'<path d="M10 45Q48 46 67 26T113 22" stroke-dasharray="1 8" stroke-width="4"/>',plasma:'<path d="M10 45 23 40 36 43 47 33 60 38 72 22 84 30 95 19 113 22"/>',aurora:'<path d="M10 39Q38 61 67 24T113 22" stroke="#ac9fff"/><path d="M10 47Q40 32 67 32T113 22"/>',rift:'<path d="M10 45Q48 46 67 26T113 22"/><circle cx="30" cy="43" r="6"/><circle cx="61" cy="33" r="5"/><circle cx="87" cy="20" r="4"/>'};
    return `<svg viewBox="0 0 128 62" aria-hidden="true"><g fill="none" stroke="${t.color}" stroke-width="2" stroke-linecap="round">${paths[t.id]||paths[{fork:'ion',tidal:'photon',postal:'aurora',cartographer:'rift'}[t.id]]||paths.vector}</g><path d="m117 22-14-6 3 6-3 6Z" fill="#e6fff4"/></svg>`;
  }
  function renderCosmetics(){
    const p=app.profile,tab=app.cosmeticTab||'models',selected=O.Cosmetics.find(p.trail);
    $('modelPanel').hidden=tab!=='models';$('skinPanel').hidden=tab!=='skins';$('trailPanel').hidden=tab!=='trails';
    for(const b of $$('[data-action=cosmetic-tab]')){const chosen=b.dataset.tab===tab;b.setAttribute('aria-selected',String(chosen));b.tabIndex=chosen?0:-1;}
    $('trailGrid').innerHTML=O.Cosmetics.TRAILS.map(t=>{const open=O.Cosmetics.unlocked(p,t),chosen=p.trail===t.id;
      return `<button class="trail-card ${chosen?'selected':''} ${open?'':'locked'}" data-action="trail" data-key="${t.id}" aria-pressed="${chosen}" ${open?'':'disabled'} style="--trail:${t.color}">${trailThumbnail(t)}<span class="trail-card-name">${t.name}</span><span class="trail-card-description">${t.description}</span><span class="trail-card-status">${chosen?'✓ Выбран':open?'Выбрать хвост':`${money(t.xp)} XP${t.requirement?' · '+t.requirement:''}${t.xp>p.xp?' · ещё '+money(t.xp-p.xp):''}`}</span></button>`;
    }).join('');
    $('trailPreviewName').textContent=`${selected.name} / ${skin().name}`;$('trailPreviewDescription').textContent=selected.description;
    $('cosmeticXP').textContent=`${money(p.xp)} XP · хвостов открыто ${O.Cosmetics.TRAILS.filter(t=>O.Cosmetics.unlocked(p,t)).length} из ${O.Cosmetics.TRAILS.length}. Опыт накопительный: выбор ничего не списывает.`;
  }
  function confirmUpgrade(key){
    const q=G.quote(app.profile,key),d=G.UPGRADE_DEFS[key];if(!q?.canBuy){renderHangar();return;}
    openModal('Установить модуль?',`<div class="purchase-preview"><span>${d.icon}</span><div><h3>${d.name}</h3><strong>${d.values[q.lv]} → ${d.values[q.lv+1]} ${d.unit}</strong></div></div><div class="result-rewards"><div>Цена сейчас<strong>${q.cost} ◈ + ${q.dataCost} ⬡</strong></div><div>После установки<strong>${money(app.profile.credits-q.cost)} ◈ / ${app.profile.data-q.dataCost} ⬡</strong></div></div><p>Чек сохранится: при пересборке возвращаются потраченные ресурсы.</p><div class="modal-actions"><button class="button quiet" data-action="close">Отмена</button><button class="button primary" data-action="confirm-upgrade" data-key="${key}" data-cost="${q.cost}" data-data="${q.dataCost}" data-tier="${q.lv}">Подтвердить покупку</button></div>`,'АНГАР / СМЕТА');
  }
  function economyInfo(){if(O.V8)return O.V8.economy();
    openModal('Платят за результат, а не за число рейсов',`<p>Оценка Q: <strong>50% груз + 20% точность захода + 15% экономия импульса + 15% темп</strong>. Награда результата: B × M × (0,25 + 0,75 × (Q/100)<sup>1,65</sup>), округление вниз. M = 1 в обычном режиме, 1,7 в ПРО.</p><div class="info-box">За контракт хранится одна максимальная уже выплаченная сумма. Улучшил результат — получил только разницу. Та же доставка, рестарт и слабый повтор денег не дают. Тренировка с точным курсом не даёт ничего и не открывает уровни.</div><p>Данные ⬡: 1 за оценку ≥80, ещё 1 за ≥94; в ПРО дополнительно 1 за доставку и 1 за оценку ≥85. Выплачивается только рост максимального права на данные. До 4 на контракт, без повторного фарма.</p><p>Цена ступени t: округление вверх до 5 от <strong>B<sub>модуля</sub> × t<sup>1,7</sup> × (1 + 0,025N) × (1 − скидка)</strong>. N — число установленных ступеней. Скидка — 0,2% за каждую когда-либо заработанную единицу данных, не более 8%.</p><p>Пять ступеней требуют 2/7/14/24/34 доставки и 0/1/3/6/10 данных. Высокая прокачка — выбор специализации, а не гарантированный выкуп всего магазина. Ошибки бесплатны; долгов и таймеров ожидания нет.</p><div class="modal-actions"><button class="button primary" data-action="close">Понятно</button></div>`,'ЭКОНОМИКА');
  }
  function respecInfo(){
    const p=app.profile,inherited=p.receipts.some(r=>r.inherited);
    openModal('Пересобрать капсулу?',`<p>Оплаченные ступени будут сняты, а унаследованные без чека останутся. Прогресс, оценки и лицензии останутся. По чекам вернутся <strong>${G.invested(p)} ◈ и ${G.dataInvested(p)} ⬡</strong>.</p>${inherited?'<div class="info-box danger-note"><strong>Внимание: есть унаследованные улучшения из старой версии.</strong> Они останутся установленными: за неоплаченное оборудование возврата нет. Экспортируй сохранение перед пересборкой.</div>':''}<p>Можно выбрать другую специализацию. Возврат идёт по чекам, а не по текущим ценам: перепродажа не создаёт деньги.</p><div class="modal-actions"><button class="button quiet" data-action="close">Оставить как есть</button><button class="button primary" data-action="respec-confirm">Пересобрать и вернуть ресурсы</button></div>`,'АНГАР / ПЕРЕСБОРКА');
  }
  function renderAwards(){if(O.V8)return O.V8.renderAwards();
    const p=app.profile;$('awardTotal').innerHTML=`${p.achievements.length} / ${G.achievements.length}<span>достижений</span>`;
    $('achievementGrid').innerHTML=G.achievements.map(a=>{
      const done=p.achievements.includes(a.id);
      return `<article class="achievement-card ${done?'earned':''}"><div class="achievement-icon">${a.icon}</div><div><h3>${a.name}</h3><p>${a.text}</p><small>${done?'✓ ПОЛУЧЕНО':`+${a.xp} XP`}</small></div></article>`;
    }).join('');
  }
  function setAim(angle,speed){
    if(app.state)return;
    if(!Number.isFinite(angle)||!Number.isFinite(speed))return;
    app.angle=Math.round(P.clamp(angle,-180,180)*10)/10||0;
    app.speed=Math.round(P.clamp(speed,60,stats().maxSpeed));
    app.aims[app.currentId]=aimValues();app.previewDirty=true;syncControls();updateMedalStates();
  }
  function syncControls(){
    $('angleInput').value=app.angle.toFixed(1);$('angleRange').value=app.angle;
    $('speedInput').value=app.speed;$('speedRange').value=app.speed;
    for(const id of ['speedInput','speedRange'])$(id).max=stats().maxSpeed;
    const disabled=!!app.state;
    syncLaunchTiming();
    for(const el of $$('.control input,.number-wrap button'))el.disabled=disabled;
    $('launchButton').textContent=!app.state?'Запуск ↗':isFlying()?(app.paused?'Продолжить':'Пауза'):'Ещё раз ↺';
    $('mobileLaunch').textContent=$('launchButton').textContent;
    $('fineAimButton').classList.toggle('primary',app.profile.settings.fineAim);$('fineAimButton').setAttribute('aria-pressed',String(app.profile.settings.fineAim));
    $('fineAimCaption').textContent=app.profile.settings.fineAim?'Шаг 0,1° / 1 ед.':'Шаг 0,5° / 2 ед.';
    $('fineAimButton').disabled=disabled;
    $('pauseButton').disabled=!isFlying();
    $('scannerValue').textContent=level().launchTiming?'Прогноз на весь рейс':`Прогноз: ${stats().preview.toFixed(1)} с`;
    $('fieldButton').classList.toggle('primary',app.profile.settings.grid);
    for(const el of $$('[data-action=difficulty]')){el.disabled=disabled;el.classList.toggle('selected',el.dataset.mode===app.profile.difficulty);el.setAttribute('aria-pressed',String(el.dataset.mode===app.profile.difficulty));}
    $('trainingBadge').hidden=!app.assisted;
    $('gravityCaption').textContent=stats().gravity?`Радиус захвата: ${stats().gravity}`:'Захват не установлен';
    renderCourseMemory();updateMedalStates();O.UI9?.sync();
  }
  function renderRoute(){O.V8?.updateRoute(true);}
  function updateRoute(guide){O.V8?.updateRoute(false,guide);}
  function routeHelp(){
    openModal('Гравитационный маршрут',`<p>Нужно облететь указанные планеты <strong>по порядку и в направлении стрелок</strong>. Каждый манёвр — больше половины оборота вокруг отдельной планеты, а не просто касание кольца.</p><p>Пунктирная окружность у активной планеты — зона манёвра. Дуга растёт, пока капсула остаётся внутри. Выход сбрасывает только текущую дугу; уже завершённые сохраняются.</p><p>Кольца задают ветви маршрута. После всех облётов и колец доставь три контейнера на станцию. Прямой перелёт и большой круг вокруг всей системы не заменяют отдельные манёвры.</p><div class="info-box">Грузы находятся на разных ветвях. Сначала добейся правильной формы траектории, затем уточняй угол шагом 0,1° и скорость шагом 1. Мышью или пальцем можно грубо задать направление.</div><div class="modal-actions"><button class="button primary" data-action="close">К маршруту</button></div>`,'ПЛАН ПОЛЁТА');
  }
  function medalIcon(key){return O.MedalArt.svg(key);}
  function updateMedalStates(){
    // Scrubbing the recording must not make the awarded medals disappear.
    const l=O.Routes.view(level(),app.state,app.branchView),r=G.viewRecord(app.profile,l.id),ds=O.Medals.describe(l,app.state,app.speed,r,app.assisted,stats());
    for(const d of ds){const card=$('medal-'+d.key);if(!card)continue;
      if(card.dataset.state!==d.state)card.dataset.state=d.state;
      card.querySelector('.medal-detail').textContent=d.detail==='Этапы 0 / 0'?'До станции':d.detail;
      card.querySelector('.medal-live').textContent=d.status;
      card.querySelector('.medal-archive').textContent=d.earned?'✓ Получена':d.archive?'Архив v7':'Новая цель';
      card.querySelector('.medal-archive').classList.toggle('owned',d.earned);
      card.querySelector('.medal-track i').style.width=`${Math.max(0,Math.min(1,d.progress))*100}%`;
      card.setAttribute('aria-label',`${d.title}. ${d.condition}. ${d.detail}. ${d.status}. ${d.earned?'Уже есть в коллекции.':''}`);
    }
    $('medalLegend').textContent=app.assisted?'Тренировка: медали не выдаются':app.state?.status==='won'?'Итог рейса · перемотка не меняет награды':'Засчитываются только после доставки';
  }
  function updateObjectives(){
    const l=level(),r=G.viewRecord(app.profile,l.id),rules=O.Medals.rules(l);
    const cargoCount=O.Routes.cargoIds(l,app.state,app.branchView).length;
    $('objectivesList').innerHTML=O.Medals.describe(l,app.state,app.speed,r,app.assisted,stats()).map((d,i)=>`
      <article role="button" tabindex="0" id="medal-${d.key}" class="medal-card" data-state="pending" title="${escape(d.title+'. '+d.condition)}">
        <div class="medal-symbol">${medalIcon(rules[i].type)}</div><span class="medal-target">${O.FlightObjectives.medalTarget(rules[i],cargoCount)}</span>
        <div class="medal-copy"><div class="medal-name"><h3>${d.title}</h3><span class="medal-archive"></span></div><p class="medal-condition">${d.condition}</p><div class="medal-readout"><strong class="medal-detail"></strong><span class="medal-live"></span></div><div class="medal-track"><i></i></div></div>
      </article>`).join('');
    updateMedalStates();
    const cap=Math.floor(E.baseReward(l)*(app.profile.difficulty==='pro'?1.7:1));
    $('contractReward').textContent=`до ${Math.max(0,cap-r.paid)} ◈`;
  }
  function medalHelp(){O.V8?.medalHelp();}
  function loadLevel(id){
    if(!Number.isInteger(id)||id<0||id>=L.length||!G.unlocked(app.profile,id)){toast(L[id]?lockReason(L[id]):'Контракт недоступен.',true);return;}
    if(O.Navigation?.beforeLevel(id))return;
    closeModal();app.currentId=id;const aim=app.aims[id];
    app.activeLevel=P.prepareLevel(L[id],app.profile.difficulty,app.profile.layouts?.[courseKey()],aim?.launchDelay);app.assisted=false;app.profile.lastLevel=id;app.state=null;app.paused=false;app.accumulator=0;app.trail=[];app.particles=[];app.lastResult=null;app.camera={zoom:1,cx:600,cy:350};app.branchView='A';
    const l=level();app.angle=aim?aim.angle:l.initialAngle;app.speed=P.clamp(aim?aim.speed:l.initialSpeed,60,stats().maxSpeed);
    app.previewDirty=true;go('play',true);
    $('flightSector').textContent=`КОНТРАКТ ${pad(C.number(id))} / ${O.SECTORS[l.sector].name.toUpperCase()}`;
    $('flightTitle').textContent=l.name;$('flightBrief').textContent=l.brief;
    $('flightDetails').open=false;
    setStage(l.dynamic?(l.motionKind==='station'?'ПЕРЕХВАТ · ГОТОВНОСТЬ':'ОРБИТЫ · ГОТОВНОСТЬ'):'КАПСУЛА ГОТОВА','');
    syncControls();renderRoute();updateObjectives();updateTelemetry();save();O.V8?.onLevel();O.UI9?.onLevel();O.PlanetWorkshop?.onLevel();O.Navigation?.onLevel(id);
  }
  function setStage(label,caption){$('stagePill').innerHTML=`<i class="live-dot"></i> ${label}`;$('stageBottom').textContent='';$('stageBottom').hidden=true;}
  function launch(){
    if(app.screen!=='play'||app.transitioning)return;
    if(isFlying()){pause();return;}
    if(app.state){retry();return;}
    const placementProblem=P.layoutProblem(level(),level().layout);if(placementProblem){toast(placementProblem,true);return;}
    closeModal();app.state=P.createState(level(),app.angle,app.speed,stats());app.state.assisted=app.assisted;O.Review?.start(app.state);
    app.accumulator=0;app.trail=[{x:app.state.x,y:app.state.y}];app.preview=null;app.paused=false;app.lastResult=null;
    const key=courseKey();app.attemptHistory[key]=[...(app.attemptHistory[key]||[]).slice(-4),{...aimValues(),...(level().layout?{layout:structuredClone(level().layout)}:{})}];
    G.launch(app.profile,app.currentId);save();sound.play('launch');syncControls();
    setStage(app.assisted?'ТРЕНИРОВКА · БЕЗ НАГРАД':app.profile.difficulty==='pro'?'ПРО · КАПСУЛА В ПОЛЁТЕ':'КАПСУЛА В ПОЛЁТЕ',level().expert?'Пройди контрольные кольца и выполни условия шлюза.':'Груз притягивается только после установки гравитационного захвата.');
  }
  function retry(){
    if(app.screen!=='play')return;
    if(app.trail.length>1)app.ghosts[app.currentId]=app.trail.slice();
    loadLevel(app.currentId);
  }
  function burst(x,y,color,count=28){
    if(app.profile.settings.reducedMotion)return;
    for(let i=0;i<count;i++){
      const a=Math.random()*Math.PI*2,v=25+Math.random()*95,life=0.4+Math.random()*0.8;
      app.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life,maxLife:life,r:1+Math.random()*2,color});
    }
  }
  function finish(){
    const s=app.state;app.ghosts[app.currentId]=app.trail.slice();
    app.accumulator=0;syncControls();updateTelemetry();
    if(s.status==='won'){
      const before=G.rank(app.profile),result=G.complete(app.profile,level(),s);
      app.lastResult=result;save('contract');updateProfileUI();updateObjectives();sound.play('win');burst(s.x,s.y,skin().color,45);
      setStage(result.training?'ТРЕНИРОВКА ЗАВЕРШЕНА':'ДОСТАВЛЕНО',result.training?'Демонстрация без наград. Для зачёта выбери самостоятельный рейс.':'Оценка рейса определяет оплату. Повторные выплаты — только за улучшение.');
      if(app.storageOK&&G.rank(app.profile).index>before.index)toast(`Новый ранг: ${G.rank(app.profile).name}!`);
      if(O.Review&&O.V8){O.Review.finish(s,app.trail,level());O.V8.showResult(result);}else showWin(result);
    }else{
      sound.play('fail');burst(s.x,s.y,'#ff9f86',32);setStage('МАРШРУТ НЕ ЗАВЕРШЁН');if(O.Review&&O.V8){O.Review.finish(s,app.trail,level());O.V8.showResult(null);}else showFail();
    }
  }
  function showWin(r){
    const s=app.state,l=level(),mask=r.training?0:O.Medals.mask(l,s,G.record(app.profile,l.id)),q=r.quality;
    const labels={cargo:'Груз · 50%',precision:'Точность захода · 20%',fuel:'Импульс · 15%',pace:'Темп · 15%'};
    const bars=Object.entries(q.parts).map(([k,v])=>`<div class="quality-line"><span>${labels[k]}</span><div class="progress"><i style="width:${Math.round(v*100)}%"></i></div><b>${Math.round(v*100)}%</b></div>`).join('');
    const training=r.training?'<div class="info-box danger-note">Тренировка: кредиты, данные, опыт, медали и открытие следующего контракта не начисляются.</div>':'';
    openModal(r.training?'Тренировочный рейс завершён':'Контракт принят',`<div class="grade-block"><strong class="grade-${q.grade}">${q.grade}</strong><div><b>${q.score}/100</b><span>${q.mode==='pro'?'ПРО · множитель 1,7':'Обычный рейс'}</span></div>${starHTML(mask)}</div>${training}<div class="quality-breakdown">${bars}</div><div class="result-summary"><div><span>ДОПЛАТА</span><b>+${r.totalCredits} <small>◈</small></b></div><div><span>ДАННЫЕ</span><b>+${r.data} <small>⬡</small></b></div><div><span>ПОЛЁТ</span><b>${s.t.toFixed(2)} <small>с</small></b></div></div><div class="result-rewards"><div>Стоимость этого результата<strong>${q.potential} ◈</strong></div><div>Ранее выплаченные деньги не повторяются<strong>${r.training?'тренировка':`${r.paid} ◈ всего`}</strong></div><div>Опыт<strong>+${r.totalXP} XP</strong></div></div>${r.awards.map(a=>`<div class="award-chip">${a.icon} ${a.name} · +${a.xp} XP</div>`).join('')}<div class="modal-actions"><button class="button quiet" data-action="retry">Ещё раз ↺</button><button class="button quiet" data-action="nav" data-page="hangar">В ангар</button>${!r.training?`<button class="button primary" data-action="next">${C.adjacent(l.id,1)<0?'Все маршруты':'Дальше ↗'}</button>`:''}</div>`,'ПРОТОКОЛ ДОСТАВКИ');
  }
  function showFail(){
    if(O.V8&&O.Review?.active)return O.V8.showReport();
    openModal('Полёт прерван',`<p>${escape(O.Review?.diagnosis(level(),app.state)||'Проверь угол и скорость перед следующим запуском.')}</p><div class="modal-actions"><button class="button primary" data-action="retry">Изменить курс</button></div>`, 'РАЗБОР РЕЙСА');
  }
  function updateTelemetry(guide=flightGuide()){
    updateRoute(guide);updateMedalStates();O.V8?.sync();const s=displayState();$('flightTime').innerHTML=`${(s?.t||0).toFixed(2)} <small>с</small>`;
    $('flightVelocity').innerHTML=`${s?Math.hypot(s.vx,s.vy).toFixed(0):app.speed} <small>ед./с</small>`;
    $('flightCargo').textContent=`${guide.carried} / ${guide.plan.cargo.length}`;
    $('speedButton').textContent=`×${app.timeScale}`;
    const pulls=s?.cargoBodies?.filter(c=>c.phase==='pulling').length||0;
    const missing=s?.cargoBodies?.filter(c=>c.phase==='lost').length||0;
    const items=[];
    if(guide.plan.gates.length)items.push(`Кольца ${guide.count.gate}/${guide.plan.gates.length}`);
    if(pulls)items.push(`Притягивается: ${pulls}`);
    if(missing)items.push(`Груз потерян: ${missing}`);
    if(s&&level().target.motion)items.push(`Относительная скорость: ${P.dockVelocity(s,level()).speed.toFixed(0)}`);
    $('flightStatus').textContent=items.join(' · ');$('flightStatus').hidden=items.length===0;
  }
  function setPlaybackSpeed(rate){if(!G.PLAYBACK_RATES.includes(rate))return;app.timeScale=rate;app.profile.settings.playbackSpeed=rate;lastPlaybackPreference=rate;save();updateTelemetry();O.FlightSettings?.sync();}
  function openModal(title,body,eyebrow='БОРТОВОЙ КОМПЬЮТЕР'){
    modal.classList.remove('preferences-modal','mode-modal');
    O.UI9?.beforeModal();
    if(!modal.open){app.modalPause=app.paused;if(isFlying())app.paused=true;}
    $('modalContent').innerHTML=`<div class="modal-inner"><button class="modal-close" data-action="close" aria-label="Закрыть">×</button><div class="eyebrow">${eyebrow}</div><h2 id="modalTitle">${title}</h2>${body}</div>`;
    if(!modal.open)modal.showModal();modal.scrollTop=0;document.body.classList.add('modal-open');syncControls();O.UI9?.afterModal();
  }
  function closeModal(){
    if(!modal.open)return;modal.close();document.body.classList.remove('modal-open');O.UI9?.modalClosed();app.paused=app.modalPause;app.accumulator=0;syncControls();
  }
  function pause(){
    if(!isFlying())return;
    if(modal.open){closeModal();return;}
    openModal('На связи, пилот',`<p>Полёт приостановлен. Время симуляции не идёт.</p><div class="modal-actions"><button class="button quiet" data-action="retry">С начала</button><button class="button primary" data-action="close">Продолжить ↗</button></div>`,'ПАУЗА');
  }
  function showHint(exact=false){
    if(app.screen!=='play')return;
    const l=level();
    if(exact){
      openModal('Точный курс — только тренировка',`<p>Диспетчер покажет проверенный пример для выбранного режима. <strong>При применении включится тренировка без наград и без открытия следующего контракта.</strong></p><p>Обычная текстовая подсказка не штрафуется. Числа маршрута не показываются до согласия на тренировку.</p><div class="modal-actions"><button class="button quiet" data-action="close">Продолжу сам</button><button class="button primary" data-action="apply-solution">Тренироваться без наград</button></div>`,'СИМУЛЯТОР');
    }else{
      const help=l.launchTiming?
        (l.rules.maxDockSpeed?'Прогноз сближения учитывает скорость и направление движения капсулы и дока.':
          P.receptionWindows(l).length?'Расписание шлюза и прогноз подлёта показывают время по часам сектора. На отмеченных участках орбиты шлюз открыт.':
          'На карте отмечены станция в момент старта и её положение при сближении. В ПРО зона стыковки меньше.'):
        'Меняй сначала угол, затем скорость. Контейнеры и контрольные кольца помогают читать маршрут. В ПРО станция уже, а прогноз короче.';
      openModal('Курс можно уточнить',`<p>${l.hint}</p><div class="info-box">${help} Подсказка не снижает оценку.</div><div class="modal-actions"><button class="button quiet" data-action="close">Разберусь сам</button><button class="button primary" data-action="exact-hint">Тренировка с точным курсом</button></div>`,'ПОДСКАЗКА');
    }
  }
  function applySolution(){
    const chosenBranch=app.branchView;retry();app.branchView=chosenBranch;const l=level(),course=l.solutions?.find(c=>c.branch===chosenBranch)||(app.profile.difficulty==='pro'?(l.proSolution||l.solution):l.solution);
    app.assisted=true;useCourse(course,false);
    setStage('ТРЕНИРОВКА · БЕЗ НАГРАД',`Пример${course.branch?' ветви '+course.branch:''}: ${course.angle}° / ${course.speed} ед./с. Для зачётного рейса нажми «Заново».`);
    toast('Точный курс установлен. Этот запуск — без наград.');
  }
  function showSettings(){if(O.V8)return O.V8.settings();
    const s=app.profile.settings;
    const options=[['sound','Звуковые сигналы','Синтезированные эффекты, без фоновой музыки.'],['grid','Поле тяготения','Показывать направление ускорения в разных точках.'],['ghost','След предыдущей попытки','Серая линия помогает уточнять маршрут.'],['reducedMotion','Меньше анимаций','Меньше декоративного движения. Планеты, станция и груз продолжают двигаться по правилам игры.']];
    openModal('Сохранение и настройки',`${options.map(([key,title,caption])=>`<label class="check-row"><span>${title}<small>${caption}</small></span><input type="checkbox" data-setting="${key}" ${s[key]?'checked':''}></label>`).join('')}<h3>Твой прогресс остаётся у тебя</h3><p>Автосохранение: <strong>${app.storageOK?'доступно в этом браузере':'недоступно — используй экспорт'}</strong>. Оно привязано к браузеру и адресу игры. При переносе папки, очистке данных или смене браузера импортируй резервную копию.</p><div class="modal-actions"><button class="button quiet" data-action="export">Экспорт в JSON ↓</button><button class="button quiet" data-action="import">Импорт из JSON ↑</button></div><div class="info-box">В игре нет сервера, аккаунта, рекламы и отправки данных. Для надёжности экспортируй сохранение перед переносом игры. Экспорт содержит прогресс, но не текущий полёт.</div><div class="modal-actions"><button class="button danger" data-action="reset-confirm">Сбросить прогресс</button><button class="button primary" data-action="close">Готово</button></div>`,'НАСТРОЙКИ');
  }
  function exportSave(){app.profile.flags=app.profile.flags||{};app.profile.flags.export=true;const awards=G.awardAchievements(app.profile);save();updateProfileUI();
    const blob=new Blob([JSON.stringify(app.profile,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`orbital-courier-save-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);const message='Резервная копия подготовлена. Сохрани JSON-файл.';toast(message);awardNotice(awards,message);
  }
  async function importSave(file){
    if(!file)return;if(file.size>2*1024*1024){toast('Сохранение слишком большое. Лимит — 2 МБ.',true);return;}
    try{
      const raw=JSON.parse(await file.text()),parsed=G.sanitize(raw);const migrationNotice=raw.version<3?`<div class="info-box"><strong>Перенос в версию 8.</strong> Уровни, медали и купленные модули сохраняются. Старый баланс ${money(parsed.migration.oldCredits)} ◈ пересчитан в ${money(parsed.credits)} ◈ по новой модели. Унаследованные улучшения сохраняются, но не имеют денежного возврата при пересборке. Долгов нет. Сохрани исходный JSON как резервную копию.</div>`:'';
      openModal('Загрузить этот прогресс?',`${migrationNotice}<p>В файле: ${G.completed(parsed)} контрактов, ${G.totalMedals(parsed)} медалей и ${money(parsed.credits)} кредитов. Текущий прогресс будет заменён.</p><div class="modal-actions"><button class="button quiet" data-action="close">Отмена</button><button class="button primary" id="confirmImport">Загрузить</button></div>`);
      $('confirmImport').addEventListener('click',()=>{
        app.profile=parsed;app.state=null;app.aims={};app.ghosts={};save();go('home',true);toast('Прогресс восстановлен.');
      },{once:true});
    }catch(error){toast('Не удалось загрузить сохранение: '+error.message,true);}
  }
  function resetConfirm(){if(O.V8)return O.V8.resetConfirm();
    openModal('Начать заново?',`<p>Кредиты, опыт, медали и улучшения будут удалены из этого браузера. Экспортированная копия останется целой.</p><div class="modal-actions"><button class="button quiet" data-action="close">Отмена</button><button class="button danger" data-action="reset">Да, сбросить</button></div>`,'СБРОС ПРОГРЕССА');
  }
  const actions={
    'delay-earlier':()=>setLaunchDelay(level().launchDelay-0.1),
    'delay-later':()=>setLaunchDelay(level().launchDelay+0.1),
    'delay-reset':()=>setLaunchDelay(0),
    'available-contracts':()=>{
      resetCampaignFilters('open');
      setCampaignOptions(false);renderCampaign();
    },
    'campaign-options':()=>setCampaignOptions($('campaignOptions').hidden),
    'new-routes':()=>{resetCampaignFilters('new');go('campaign');},
    'portal-help':()=>openModal('Парные переходы',`<p><strong>Тёмный центр — вход. Светлое кольцо — выход.</strong> Капсула мгновенно перемещается к выходу с теми же скоростью и направлением. Импульс не добавляется, игровое время не пропускается.</p><p>Собранные контейнеры летят с капсулой. Груз, который ещё тянется полем, остаётся на прежней стороне. Переход не засчитывает кольца и облёты между отверстиями; незавершённая дуга сбрасывается.</p><p>Порталы односторонние. На картах с двумя парами порядок A → B, с тремя — A → B → C. У входа и соответствующего выхода одинаковая буква и цвет.</p><div class="info-box">Это игровая модель червоточины, а не реалистичная чёрная дыра. У самого портала нет дополнительного гравитационного поля.</div><div class="modal-actions"><button class="button primary" data-action="close">Понятно</button></div>`,'РАЗЛОМ ПРОСТРАНСТВА'),
    'previous-level':()=>travelToLevel(C.adjacent(app.currentId,-1)),'following-level':()=>travelToLevel(C.adjacent(app.currentId,1)),
    'confirm-travel':b=>travelToLevel(+b.dataset.id,true),
    'contract-filter':b=>{app.campaignFilter=b.dataset.filter;app.campaignSector=-1;renderCampaign();},
    'clear-contracts':()=>{resetCampaignFilters('all');renderCampaign();},
    'store-course':b=>storeCourse(+b.dataset.slot),'recall-course':b=>recallCourse(+b.dataset.slot),
    'previous-aim':()=>useCourse(app.attemptHistory[courseKey()]?.at(-1)),
    'medal-help':medalHelp,'cosmetic-tab':b=>{app.cosmeticTab=b.dataset.tab==='trails'?'trails':'skins';renderCosmetics();},
    trail:b=>{const t=O.Cosmetics.TRAILS.find(t=>t.id===b.dataset.key);if(t&&O.Cosmetics.unlocked(app.profile,t)){app.profile.trail=t.id;save();renderCosmetics();sound.play('click');}},
    'route-help':routeHelp,maneuvers:()=>{app.campaignSector=7;go('campaign');},
    nav:b=>{
      if(b.dataset.page==='campaign'&&b.dataset.view==='open'){
        resetCampaignFilters('open');setCampaignOptions(false);
      }
      go(b.dataset.page);
    },
    'force-nav':b=>go(b.dataset.page,true),close:closeModal,
    continue:()=>travelToLevel(homeContract().id),
    mission:b=>travelToLevel(+b.dataset.id), 'return-flight':()=>loadLevel(G.unlocked(app.profile,app.profile.lastLevel)?app.profile.lastLevel:G.nextLevel(app.profile)),
    launch,retry,pause,settings:showSettings,hint:()=>showHint(false),'exact-hint':()=>showHint(true),'apply-solution':applySolution,
    'angle-down':()=>setAim(app.angle-(app.profile.settings.fineAim?0.1:0.5),app.speed),'angle-up':()=>setAim(app.angle+(app.profile.settings.fineAim?0.1:0.5),app.speed),
    'speed-down':()=>setAim(app.angle,app.speed-(app.profile.settings.fineAim?1:2)),'speed-up':()=>setAim(app.angle,app.speed+(app.profile.settings.fineAim?1:2)),
    'toggle-grid':()=>{app.profile.settings.grid=!app.profile.settings.grid;save();syncControls();},
    speed:()=>setPlaybackSpeed(G.PLAYBACK_RATES[(G.PLAYBACK_RATES.indexOf(app.timeScale)+1)%G.PLAYBACK_RATES.length]),
    'home-motion':()=>{heroPaused=!heroPaused;updateProfileUI();},
    next:()=>G.unlocked(app.profile,C.adjacent(app.currentId,1))?travelToLevel(C.adjacent(app.currentId,1)):go('campaign'),
    sector:b=>chooseSector(Number(b.dataset.sector)),
    'campaign-tier':b=>chooseSector(C.tiers[+b.dataset.tier].sectors[0]),
    'fine-aim':()=>{if(app.state)return;app.profile.settings.fineAim=!app.profile.settings.fineAim;save();syncControls();},
    wishlist:b=>{app.profile.wishlist=app.profile.wishlist===b.dataset.key?null:b.dataset.key;save();renderHangar();},
    'economy-info':economyInfo,
    'respec-info':respecInfo,
    'respec-confirm':()=>{const r=G.respec(app.profile);closeModal();save();updateProfileUI();renderHangar();const message=`Пересборка: возвращено ${r.credits} ◈ и ${r.data} ⬡`;toast(message);awardNotice(r.awards,message);},
    difficulty:b=>{if(app.state)return;app.profile.difficulty=b.dataset.mode==='pro'?'pro':'normal';save();loadLevel(app.currentId);},
    experts:()=>{app.campaignSector=8;go('campaign');},
    dynamic:()=>{app.campaignSector=11;go('campaign');},
    upgrade:b=>confirmUpgrade(b.dataset.key),
    'confirm-upgrade':b=>{
      const current=G.quote(app.profile,b.dataset.key);
      if(!current?.canBuy){closeModal();renderHangar();toast('Условия покупки изменились. Проверь ресурсы.',true);return;}
      if(current.cost!==+b.dataset.cost||current.dataCost!==+b.dataset.data||current.lv!==+b.dataset.tier){confirmUpgrade(b.dataset.key);toast('Цена обновилась. Проверь новую смету.');return;}
      const result=G.buy(app.profile,b.dataset.key);
      if(!result.ok){toast(result.message,true);closeModal();renderHangar();return;}
      closeModal();save();updateProfileUI();renderHangar();sound.play('upgrade');
      const message=`Модуль улучшен · −${result.cost} ◈ / −${result.data} ⬡`;toast(message);awardNotice(result.awards,message);
    },
    skin:b=>{const s=G.SKINS.find(x=>x.id===b.dataset.key);if(s&&O.Cosmetics.unlocked(app.profile,s)){app.profile.skin=s.id;save();renderHangar();}},
    export:exportSave,import:()=>{$('importFile').value='';$('importFile').click();},'reset-confirm':resetConfirm,
    reset:()=>{app.profile=G.fresh();app.state=null;app.aims={};app.ghosts={};save();go('home',true);toast('Начата новая экспедиция.');}
  };
  document.addEventListener('click',event=>{
    if(O.Navigation?.handleLink(event))return;
    const b=event.target.closest('[data-action]');if(!b||b.disabled)return;
    if(app.transitioning)return;
    sound.unlock();const action=actions[b.dataset.action];if(action)action(b);
  });
  document.querySelector('.cosmetic-tabs').addEventListener('keydown',event=>{
    if(event.target.closest('[data-action="hangar:collection"]'))return;
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();app.cosmeticTab=event.key==='Home'?'skins':event.key==='End'?'trails':app.cosmeticTab==='skins'?'trails':'skins';renderCosmetics();$(app.cosmeticTab==='skins'?'skinTab':'trailTab').focus();
  });
  document.addEventListener('change',event=>{
    const key=event.target.dataset.setting;
    if(key&&Object.hasOwn(app.profile.settings,key)){
      app.profile.settings[key]=event.target.checked;save();updateProfileUI();syncControls();
      if(key==='sound'&&event.target.checked){sound.unlock().then(()=>sound.play('click'));}
    }
  });
  // Numeric editing and held buttons are implemented in interface-v9.js.
  $('launchDelayRange').addEventListener('input',event=>setLaunchDelay(event.target.valueAsNumber));
  $('contractSearch').addEventListener('input',event=>{
    app.campaignQuery=event.target.value;
    if(app.campaignQuery.trim()){
      app.campaignSector=-1;
      if(app.campaignFilter==='open')app.campaignFilter='all';
    }
    renderCampaign();
  });
  $('sectorSelect').addEventListener('change',event=>chooseSector(+event.target.value));
  $('importFile').addEventListener('change',event=>importSave(event.target.files[0]));
  modal.addEventListener('cancel',event=>{event.preventDefault();closeModal();});
  // Unified pointer gestures and keyboard shortcuts live in interface-v9.js.
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)sound.silence();
    if(document.hidden&&isFlying()&&!modal.open)pause();
    app.accumulator=0;app.frameTime=performance.now();
  });
  root.addEventListener('pagehide',()=>{sound.silence();save();});
  document.addEventListener('pointerdown',()=>sound.unlock(),{capture:true,passive:true});
  document.addEventListener('keydown',()=>sound.unlock(),{capture:true});
  document.addEventListener('input',e=>{if(e.target.id!=='soundVolume')return;app.profile.settings.volume=Number(e.target.value)/100;sound.setVolume(app.profile.settings.volume);$('soundVolumeValue').textContent=e.target.value+'%';save();});
  document.addEventListener('change',e=>{if(e.target.id==='soundVolume')sound.play('cargo');});
  let lastTelemetry=0,tickCount=0,lastGuide;
  function frame(now){
    sound.flight(isFlying()&&!app.paused&&!document.hidden&&!app.transitioning&&!O.Review?.active?.playing,Math.hypot(app.state?.vx||0,app.state?.vy||0));
    const elapsed=Math.min(0.1,Math.max(0,(now-(app.frameTime||now))/1000));app.frameTime=now;
    if(app.screen==='play'){
      if(isAiming()&&app.previewDirty){app.preview=previewFlight();app.previewDirty=false;}
      if(isFlying()&&!app.paused&&!app.transitioning){
        app.accumulator+=elapsed*app.timeScale;
        while(app.accumulator>=P.DT&&app.state.status==='flying'){
          const previous=app.state,previousCargo=app.state.cargo.length,previousJumps=app.state.portalJumps;app.state=P.step(app.state,level());O.Review?.observe(previous,app.state,level());
          if(app.state.portalJumps>previousJumps){for(const jump of app.state.teleports.slice(-(app.state.portalJumps-previousJumps))){app.trail.push({...jump.from,t:jump.t},{...jump.to,t:jump.t,break:true});burst(jump.from.x,jump.from.y,'#baa4ff',18);burst(jump.to.x,jump.to.y,'#baa4ff',22);}sound.play('portal',(app.state.x/600-1)*.6);} app.accumulator-=P.DT;
          if(app.state.flybyIndex>previous.flybyIndex)sound.play('flyby');
          else if(app.state.gateIndex>previous.gateIndex)sound.play('gate');
          if(++tickCount%3===0||app.state.status!=='flying')app.trail.push({x:app.state.x,y:app.state.y,t:app.state.t});
          if(app.state.cargo.length>previousCargo){sound.play('cargo');burst(app.state.x,app.state.y,'#ffc37c',14);}
          if(app.state.status!=='flying'){finish();break;}
        }
      }
      for(const p of app.particles){p.x+=p.vx*elapsed;p.y+=p.vy*elapsed;p.life-=elapsed;}
      app.particles=app.particles.filter(p=>p.life>0);
      const t=app.profile.settings.reducedMotion?0:now/1000;
      const review=O.Review?.renderModel(),state=displayState(),guide=flightGuide(state);
      gameRenderer.draw(guide.plan.route,{camera:app.camera,review:!!review,time:t,angle:app.angle,speed:app.speed,color:skin().color,model:app.profile.model,appearance:O.Fleet.appearance(app.profile),stats:state?.stats||stats(),state,guide,
        preview:app.state?null:app.preview,trail:review?.trail||app.trail,trailStyle:app.profile.trail,
        ghost:review?review.ghost:app.profile.settings.ghost?app.ghosts[app.currentId]:null,
        reviewPrevious:review?.ghostState,reviewStation:review?.ghostStation,reviewEvent:review?.event,
        aimPointer:app.aimPointer,grid:app.profile.settings.grid,reducedMotion:app.profile.settings.reducedMotion,
        locateGoal:app.goalHighlight?.goal===guide.next&&now<app.goalHighlight.until,
        particles:review?null:app.particles,banked:G.viewRecord(app.profile,app.currentId).cargo});
      if(now-lastTelemetry>85){updateTelemetry(guide);lastTelemetry=now;}
      else if(lastGuide?.next!==guide.next||lastGuide?.needed!==guide.needed||lastGuide?.available.length!==guide.available.length)updateRoute(guide);
      lastGuide=guide;
    }else if(app.screen==='hangar'){
      if(O.Hangar)O.Hangar.preview(now);else O.Cosmetics.preview($('trailPreview'),app.profile.trail,skin().color,now/1000,app.profile.settings.reducedMotion);
    }else if(app.screen==='home'){
      const reduced=app.profile.settings.reducedMotion||homeMotionPreference.matches,still=reduced||heroPaused;
      if(!document.hidden&&!still)app.heroTime+=elapsed;
      const blend=1-Math.exp(-elapsed*5);
      for(const key of ['x','y','strength'])app.heroPointer[key]=(app.heroPointer[key]||0)+((app.heroTarget[key]||0)-(app.heroPointer[key]||0))*blend;
      const key=[innerWidth,innerHeight,root.devicePixelRatio,skin().color,app.profile.model,app.profile.trail,app.profile.finish,app.profile.livery,reduced,heroPaused].join(':');
      if(!document.hidden&&(still?key!==heroStillKey:now-heroLastDraw>=32)){
        heroRenderer.hero(reduced?2:app.heroTime,skin().color,still?{x:0,y:0}:app.heroPointer,app.profile.model,app.profile.trail,reduced,O.Fleet.appearance(app.profile));
        heroLastDraw=now;heroStillKey=still?key:'';
      }
    }
    requestAnimationFrame(frame);
  }
  const heroArea=document.documentElement;
  function guideStars(event){
    if(app.screen!=='home')return;
    const r=$('heroCanvas').getBoundingClientRect();
    app.heroTarget={x:P.clamp((event.clientX-r.left)/r.width*2-1,-1,1),y:P.clamp((event.clientY-r.top)/r.height*2-1,-1,1),strength:1};
  }
  function releaseStars(){app.heroTarget={x:0,y:0,strength:0};}
  heroArea.addEventListener('pointermove',guideStars,{passive:true});
  heroArea.addEventListener('pointerdown',guideStars,{passive:true});
  heroArea.addEventListener('pointerleave',releaseStars);
  heroArea.addEventListener('pointercancel',releaseStars);
  heroArea.addEventListener('pointerup',event=>{if(event.pointerType==='touch')releaseStars();});
  root.addEventListener('blur',releaseStars);
  homeMotionPreference.addEventListener('change',()=>{heroStillKey='';updateProfileUI();});
  // Expose semantic commands for the included browser smoke test, not a server API.
  Object.assign(app,{travelToLevel,homeContract,renderCampaign,storeCourse,recallCourse,setLayout,setPlaybackSpeed,loadLevel,setAim,setLaunchDelay,launch,retry,go,save,updateProfileUI,exportSave,applySolution,finish,level,displayLevel,displayState,flightGuide,stats,openModal,closeModal,toast,showWin,showFail,syncControls,updateObjectives,renderHangar,renderAwards,actions});
  if(!Object.keys(app.profile.records).length&&root.matchMedia('(prefers-reduced-motion: reduce)').matches)app.profile.settings.reducedMotion=true;
  document.body.dataset.page=O.Navigation?.initialPage||'home';updateProfileUI();requestAnimationFrame(frame);
  if(loaded.migrated){save();openModal('Прогресс перенесён в версию 8',`<p>Пройденные уровни и купленные модули сохранены. Новые контракты продолжают прежнюю кампанию.</p><div class="info-box">Старый баланс: ${money(app.profile.migration.oldCredits)} ◈. Новый баланс: ${money(app.profile.credits)} ◈. Награды пересчитаны по новой экономике, расходы на сохранённые улучшения учтены. Долгов нет. Исходное сохранение не удалено. Унаследованные модули не имеют денежного возврата при пересборке.</div><div class="modal-actions"><button class="button primary" data-action="close">Продолжить</button></div>`);}
  if(loaded.upgraded){save();toast('Версия 8: прогресс сохранён. Старые медали — в архиве; новые цели отмечены отдельно.');}
  if(loaded.error)toast('Автосохранение недоступно или повреждено. Используй экспорт или импорт резервной копии.',true);
})(typeof globalThis!=='undefined'?globalThis:window);
