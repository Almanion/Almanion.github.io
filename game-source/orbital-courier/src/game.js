/* Application state machine and accessible DOM UI. Physics lives in physics.js. */
(function (root) {
  'use strict';
  const O=root.Orbital,P=O.Physics,G=O.Progress,L=O.LEVELS,E=O.Economy,C=O.Campaign;
  const $=id=>document.getElementById(id), $$=selector=>[...document.querySelectorAll(selector)];
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad=n=>String(n).padStart(2,'0');
  const money=n=>Math.round(n).toLocaleString('ru-RU');
  const starHTML=mask=>`<span class="stars">${[1,2,4].map(bit=>`<span class="${mask&bit?'on':''}">★</span>`).join('')}</span>`;
  let storage=null;try{storage=root.localStorage;}catch{/* Some file:// and private modes deny storage. */}
  const loaded=G.read(storage);
  const app={heroTime:0,heroPointer:{x:0,y:0},heroTarget:{x:0,y:0},profile:loaded.profile,screen:'home',currentId:0,angle:0,speed:200,
    activeLevel:null,assisted:false,state:null,paused:false,accumulator:0,timeScale:1,trail:[],ghosts:{},aims:{},preview:null,
    cosmeticTab:'skins',campaignSector:null,campaignQuery:'',campaignFilter:'all',contractPreviews:[],attemptHistory:{},transitioning:false,transitionToken:0,previewDirty:true,particles:[],lastResult:null,storageOK:loaded.available,modalPause:false,frameTime:0};
  app.camera={zoom:1,cx:600,cy:350};app.branchView='A';O.App=app;
  const sound=new O.Sound(),gameRenderer=new O.Renderer($('gameCanvas')),heroRenderer=new O.Renderer($('heroCanvas'));
  app.sound=sound;const modal=$('modal');

  function skin(){return G.SKINS.find(s=>s.id===app.profile.skin)||G.SKINS[0];}
  function level(){return app.activeLevel||P.prepareLevel(L[app.currentId],app.profile.difficulty);}
  function displayState(){return O.Review?.renderModel()?.state||app.state;}
  function displayLevel(){return O.Routes.view(level(),displayState(),app.branchView);}
  function stats(){const st=G.stats(app.profile);if(app.profile.difficulty==='pro')st.preview*=.6;return st;}
  function isFlying(){return app.screen==='play'&&app.state?.status==='flying';}
  function isAiming(){return app.screen==='play'&&!app.state;}
  function save(){
    app.storageOK=G.write(storage,app.profile);$('saveWarning').hidden=app.storageOK;
    if(app.storageOK)root.dispatchEvent(new CustomEvent('orbital-save'));
  }
  function toast(message,error=false){
    const el=document.createElement('div');el.className='toast'+(error?' error':'');el.textContent=message;
    $('toastArea').replaceChildren(el);setTimeout(()=>el.remove(),3800);
  }
  function updateProfileUI(){
    const p=app.profile,r=G.rank(p),done=C.count(p),medals=G.totalMedals(p);
    $('creditValue').textContent=money(p.credits);$('dataValue').textContent=p.data;$('rankBadge').textContent=r.name;
    $('homeCompleted').innerHTML=`${pad(done)} <small>/ ${L.length}</small>`;
    $('homeMedals').innerHTML=`${pad(medals)} <small>/ ${L.length*3}</small>`;$('homeRank').textContent=r.name;
    const part=r.next?(p.xp-r.xp)/(r.next.xp-r.xp):1;
    $('homeXPBar').style.width=`${P.clamp(part,0,1)*100}%`;
    $('homeXPLabel').textContent=r.next?`${money(p.xp)} XP · ещё ${money(r.next.xp-p.xp)} до ранга «${r.next.name}»`:`${money(p.xp)} XP · высший ранг`;
    $('continueButton').innerHTML=done===0&&G.record(p,0).attempts===0?'Первое отправление <span>↗</span>':done===L.length?'Переиграть маршруты <span>↗</span>':'Продолжить экспедицию <span>↗</span>';
    document.body.classList.toggle('high-contrast',!!p.settings.highContrast);sound.enabled=p.settings.sound;sound.setVolume(p.settings.volume);document.body.classList.toggle('reduce-motion',p.settings.reducedMotion);
    $('saveWarning').hidden=app.storageOK;
  }
  function go(page,force=false){
    if(!['home','campaign','hangar','awards','play'].includes(page))return;
    if(isFlying()&&page!=='play'&&!force){
      openModal('Прервать полёт?',`<p>Нынешняя попытка закончится. Уже заработанные кредиты, медали и улучшения сохранятся.</p><div class="modal-actions"><button class="button quiet" data-action="close">Продолжить полёт</button><button class="button primary" data-action="force-nav" data-page="${page}">Перейти</button></div>`);
      return;
    }
    if(app.transitioning&&page!=='play')cancelTravel();
    closeModal();if(page!=='play'){app.state=null;app.paused=false;app.accumulator=0;}
    app.screen=page;document.body.dataset.page=page;for(const el of $$('.screen')){el.hidden=el.id!==page;el.classList.toggle('active',el.id===page);}
    for(const b of $$('.topbar nav button,.mobile-nav button'))b.classList.toggle('active',b.dataset.page===page||(page==='play'&&b.dataset.page==='campaign'));
    if(page==='campaign')renderCampaign();if(page==='hangar')renderHangar();if(page==='awards')renderAwards();
    O.UI9?.onPage(page);O.V8?.onPage(page);updateProfileUI();root.scrollTo({top:0,behavior:'instant'});
  }
  function lockReason(l){const previous=C.adjacent(l.id,-1);return previous<0?'Первый контракт':`После №${pad(C.number(previous))} «${L[previous].name}»`;}
  function sectorDescription(i){
    const list=['Первые запуски. Научись читать траекторию и собирать груз.','Гравитационные повороты у крупных миров.','Дальние маршруты и точный выбор начальной скорости.','Ледяные планеты и спокойная точная навигация.','Контейнеры среди камней и красных миров.','Дальше от дома — ближе к пределу своего курса.','Сложная геометрия дальних доставок.','Восьмёрки между двумя планетами и возвращение к первой.','Три–четыре облёта двух центров притяжения.','Три планеты. Три отдельные петли. Один запуск.','Строгая приёмка: груз, кольца и время прибытия.','Первый маршрут среди движущихся планет.','Последовательные петли вокруг трёх движущихся миров.','Заверши облёты и встреться со станцией.','От трёх встреч до шести последовательных облётов движущихся миров.','Парные переходы между облётами. Вектор скорости сохраняется.'];
    return O.SECTORS[i]?.description||list[i]||'';
  }
  function renderCampaign(){
    const p=app.profile;if(app.campaignSector===null)app.campaignSector=L[G.nextLevel(p)]?.sector||0;
    const selected=app.campaignSector,query=(app.campaignQuery||'').trim().toLowerCase(),filter=app.campaignFilter||'all';
    $('campaignTotal').innerHTML=`${C.count(p)} <small>/ ${L.length}</small><span>${G.totalMedals(p)} медалей · ${O.SECTORS.length} секторов</span>`;
    $('difficultyTabs').innerHTML=C.tiers.map((t,i)=>`<button data-action="campaign-tier" data-tier="${i}" aria-pressed="${t.sectors.includes(selected)}" style="--tier:${t.color}"><small>${i+1} / 5</small>${t.name}</button>`).join('');
    $('sectorSelect').innerHTML=C.sectors.map(i=>{const s=O.SECTORS[i];return `<option value="${i}" ${i===selected?'selected':''}>${pad(C.sectors.indexOf(i)+1)} · ${escape(s.name)}</option>`;}).join('')+`<option value="-1" ${selected===-1?'selected':''}>Все секторы</option>`;
    $('sectorTabs').innerHTML=C.sectors.filter(i=>selected<0||C.tiers.some(t=>t.sectors.includes(selected)&&t.sectors.includes(i))).map(i=>{const s=O.SECTORS[i];
      const ls=L.filter(l=>l.sector===i),done=ls.filter(l=>C.current(p,l.id)).length;
      return `<button data-action="sector" data-sector="${i}" class="sector-choice ${selected===i?'active':''}" style="--sector:${s.color}" aria-pressed="${selected===i}"><span class="sector-index">${pad(C.sectors.indexOf(i)+1)}</span><span class="sector-name">${escape(s.name)}<i class="sector-track"><i style="width:${done/ls.length*100}%"></i></i></span><small>${done}/${ls.length}</small>${i===19?'<span class="sector-new-dot" title="Новый блок"></span>':''}</button>`;
    }).join('')+`<button class="sector-choice ${selected===-1?'active':''}" data-action="sector" data-sector="-1"><span class="sector-index">∞</span><span class="sector-name">Все маршруты</span><small>${L.length}</small></button>`;
    for(const b of $$('[data-action=contract-filter]')){const active=b.dataset.filter===filter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
    const visible=C.order.map(id=>L[id]).filter(l=>{
      const r=G.record(p,l.id),open=G.unlocked(p,l.id),done=C.current(p,l.id);
      if(query){const tokens=query.split(/\s+/);const hay=`${C.number(l.id)} ${pad(C.number(l.id))} ${l.name} ${O.SECTORS[l.sector].name}`.toLowerCase();if(!tokens.every(t=>hay.includes(t)))return false;}
      else if(selected!==-1&&l.sector!==selected)return false;
      if(filter==='open'&&!open)return false;
      if(filter==='unfinished'&&done)return false;
      if(filter==='new'&&l.newIn!==11)return false;
      return true;
    });
    const isSingle=selected>=0&&!query,sector=isSingle?O.SECTORS[selected]:null,secLevels=isSingle?L.filter(l=>l.sector===selected):visible;
    const done=secLevels.filter(l=>C.current(p,l.id)).length;
    $('sectorOverview').innerHTML=`<div class="sector-overview" style="--sector:${sector?.color||'#6af4cd'}"><div class="sector-orbit-mark" aria-hidden="true"><i></i><i></i><b>${isSingle?pad(C.sectors.indexOf(selected)+1):'∞'}</b></div><div class="sector-overview-copy"><span class="eyebrow">${query?'РЕЗУЛЬТАТЫ ПОИСКА':isSingle?'СЕКТОР / '+pad(C.sectors.indexOf(selected)+1):'НАВИГАЦИОННЫЙ КАТАЛОГ'}</span><h3>${query?escape(query):sector?escape(sector.name):filter==='new'?'Новые горизонты':'Вся сеть маршрутов'}</h3><p>${isSingle?sectorDescription(selected):'Выбери контракт. Освоенные маршруты и награды остаются с тобой.'}</p></div><div class="sector-progress"><strong>${done}<small> / ${secLevels.length}</small></strong><span>доставлено</span></div></div>`;
    let previousSector=-1;
    $('missionGrid').innerHTML=visible.length?visible.map((l,index)=>{
      const r=G.record(p,l.id),open=G.unlocked(p,l.id),done=C.current(p,l.id),next=G.nextLevel(p)===l.id,s=O.SECTORS[l.sector];
      const group=(!isSingle&&previousSector!==l.sector)?`<h3 class="contract-group-heading">${pad(C.sectors.indexOf(l.sector)+1)} / ${escape(s.name)}</h3>`:'';previousSector=l.sector;
      const tags=l.branches?[`${l.branches.length} маршрута`,`${l.branches[0].flybys.length} облёта на ветвь`]:l.stops?[`${l.stops.length+1} адреса`,`${l.flybys.length} облёта`]:[l.flybys?.length?`${l.flybys.length} облёта`:`${l.planets.length} планет`,l.portals?.length?`${l.portals.length} ${l.portals.length===1?'переход':'перехода'}`:l.target.motion?'Перехват':l.dynamic?'Живые орбиты':l.expert?'Эксперт':'Навигация'];
      return `${group}<button class="mission-card contract-card ${open?'':'locked'} ${next?'current':''} ${done?'completed':''}" style="--sector:${s.color};--card-delay:${index%4*45}ms" data-action="mission" data-id="${l.id}" ${open?'':'disabled'} aria-label="Контракт ${C.number(l.id)}: ${escape(l.name)}. ${open?'Открыть':'Закрыт: '+lockReason(l)}"><div class="contract-preview"><canvas data-mini="${l.id}" width="480" height="280" aria-hidden="true"></canvas><span class="mission-number">${pad(C.number(l.id))}</span><span class="contract-state">${!open?'○ ЗАКРЫТ':done?'✓ ДОСТАВЛЕН':next?'↗ СЛЕДУЮЩИЙ':l.newIn===11?'НОВЫЙ':'ГОТОВ К СТАРТУ'}</span><span class="preview-launch" aria-hidden="true">↗</span></div><div class="mission-content"><div class="contract-tags">${[C.tier(l.id).name,...tags].map(t=>`<span>${t}</span>`).join('')}</div><h4>${escape(l.name)}</h4><div class="mission-meta">${starHTML(l.routeRevision>8&&!done?0:r.medals)}<span>${done?`${r.bestScore}/100${r.proWon?' · PRO ✓':''}`:`до ${E.capReward(l)} ◈`}</span></div><span class="mission-status">${!open?lockReason(l):done?'Улучшить рекорд':l.routeRevision>8&&(r.medals&1)?'Новый маршрут · прежний рекорд сохранён':l.portals?.length?'Два пространства — один импульс':l.maneuver?'Собери груз на разных ветвях':'Выбрать курс и отправить капсулу'}</span></div></button>`;
    }).join(''):`<div class="contract-empty"><strong>Маршрутов не найдено</strong><p>Попробуй другой сектор, номер или фильтр.</p><button class="button quiet" data-action="clear-contracts">Сбросить поиск</button></div>`;
    $('contractResultCount').textContent=`Показано ${visible.length} из ${L.length} контрактов`;
    app.contractPreviews=[];
    requestAnimationFrame(()=>{if(app.screen!=='campaign')return;for(const canvas of $$('canvas[data-mini]')){const l=L[+canvas.dataset.mini],renderer=new O.Renderer(canvas);renderer.draw(l,{hideShip:false,angle:l.initialAngle,speed:140,time:0});app.contractPreviews.push({canvas,renderer,level:l});}});
  }
  function chooseSector(value){app.campaignSector=P.clamp(value,-1,O.SECTORS.length-1);app.campaignQuery='';$('contractSearch').value='';app.campaignFilter='all';renderCampaign();}
  function courseKey(){return `${app.currentId}:${app.profile.difficulty}`;}
  function renderCourseMemory(){
    const saved=app.profile.courses[courseKey()]||[],disabled=!!app.state;
    $('courseSlots').innerHTML=[0,1].map(i=>`<div class="course-slot"><b>${i?'B':'A'}</b><button data-action="recall-course" data-slot="${i}" ${disabled||!saved[i]?'disabled':''} aria-label="Применить курс ${i?'B':'A'}">${saved[i]?`${saved[i].angle.toFixed(1)}° <span>/ ${saved[i].speed}</span>`:'Не записан'}</button><button class="store-course" data-action="store-course" data-slot="${i}" ${disabled?'disabled':''} aria-label="Записать текущий курс в ${i?'B':'A'}" title="Записать текущий курс"><span aria-hidden="true">↓</span><small>Записать</small></button></div>`).join('');
    const last=app.attemptHistory?.[courseKey()]?.at(-1);
    $('previousAimButton').disabled=disabled||!last;$('previousAimButton').textContent=last?`↶ Прошлый запуск: ${last.angle.toFixed(1)}° / ${last.speed}`:'↶ Здесь появится прошлый запуск';
    $('compassArrow').setAttribute('transform',`rotate(${-app.angle} 26 26)`);
    $('navModeLabel').textContent=!app.state?'Настройка курса':isFlying()?(app.paused?'Полёт на паузе':'Курс зафиксирован'):'Готов к новой попытке';
    $('previousLevel').disabled=!G.unlocked(app.profile,C.adjacent(app.currentId,-1));
    $('followingLevel').disabled=!G.unlocked(app.profile,C.adjacent(app.currentId,1));
    $('levelPosition').textContent=`${pad(C.number(app.currentId))} / ${L.length}`;
    $('angleRange').style.setProperty('--range',((app.angle+180)/360*100)+'%');
    $('speedRange').style.setProperty('--range',((app.speed-60)/(stats().maxSpeed-60)*100)+'%');
  }
  function storeCourse(slot){if(!isAiming())return;const key=courseKey();app.profile.courses[key]??=[null,null];app.profile.courses[key][slot]={angle:app.angle,speed:app.speed};save();renderCourseMemory();toast(`Курс ${slot?'B':'A'} записан`);}
  function recallCourse(slot){const q=app.profile.courses[courseKey()]?.[slot];if(isAiming()&&q)setAim(q.angle,q.speed);}
  function cancelTravel(){app.transitionToken++;app.transitioning=false;$('routeTransition').hidden=true;$('routeTransition').classList.remove('running');}
  function travelToLevel(id,confirmed=false){
    if(app.transitioning||!Number.isInteger(id)||id<0||id>=L.length)return;
    if(!G.unlocked(app.profile,id)){toast(lockReason(L[id]),true);return;}
    if(isFlying()&&!confirmed){openModal('Перейти к другому контракту?',`<p>Текущая попытка будет остановлена. Полученные награды сохраняются.</p><div class="modal-actions"><button class="button quiet" data-action="close">Остаться</button><button class="button primary" data-action="confirm-travel" data-id="${id}">Перейти</button></div>`);return;}
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
    const p=app.profile,tab=app.cosmeticTab||'skins',selected=O.Cosmetics.find(p.trail);
    $('skinPanel').hidden=tab!=='skins';$('trailPanel').hidden=tab!=='trails';
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
    app.angle=Math.round(P.clamp(angle,-180,180)*10)/10;
    app.speed=Math.round(P.clamp(speed,60,stats().maxSpeed));
    app.aims[app.currentId]={angle:app.angle,speed:app.speed};app.previewDirty=true;syncControls();
  }
  function syncControls(){
    $('angleInput').value=app.angle.toFixed(1);$('angleRange').value=app.angle;
    $('speedInput').value=app.speed;$('speedRange').value=app.speed;
    for(const id of ['speedInput','speedRange'])$(id).max=stats().maxSpeed;
    const disabled=!!app.state;
    for(const el of $$('.control input,.number-wrap button'))el.disabled=disabled;
    $('launchButton').textContent=!app.state?'Запуск ↗':isFlying()?(app.paused?'Продолжить':'Пауза'):'Ещё раз ↺';
    $('mobileLaunch').textContent=$('launchButton').textContent;
    $('fineAimButton').classList.toggle('primary',app.profile.settings.fineAim);$('fineAimButton').setAttribute('aria-pressed',String(app.profile.settings.fineAim));
    $('fineAimCaption').textContent=app.profile.settings.fineAim?'Шаг 0,1° / 1 ед.':'Шаг 0,5° / 2 ед.';
    $('fineAimButton').disabled=disabled;
    $('pauseButton').disabled=!isFlying();
    $('scannerValue').textContent=`Прогноз: ${stats().preview.toFixed(1)} с`;
    $('fieldButton').classList.toggle('primary',app.profile.settings.grid);
    for(const el of $$('[data-action=difficulty]')){el.disabled=disabled;el.classList.toggle('selected',el.dataset.mode===app.profile.difficulty);el.setAttribute('aria-pressed',String(el.dataset.mode===app.profile.difficulty));}
    $('trainingBadge').hidden=!app.assisted;
    $('gravityCaption').textContent=stats().gravity?`Радиус захвата: ${stats().gravity}`:'Захват не установлен';
    renderCourseMemory();updateMedalStates();O.UI9?.sync();
  }
  function renderRoute(){if(O.V8)return O.V8.updateRoute(true);
    const l=level(),legs=l.flybys||[];$('routePanel').hidden=!legs.length;
    $('routeSteps').innerHTML=legs.map((f,i)=>`<li data-leg="${i}"><span class="route-number">${i+1}</span><div><b>${l.planets[f.planet].name} <em>${f.direction>0?'↻':'↺'}</em></b><small class="route-value">${f.degrees}°</small></div></li>`).join('');
    updateRoute();
  }
  function updateRoute(){if(O.V8)return O.V8.updateRoute();
    const portals=level().portalOrder||[];$('portalProgress').hidden=!portals.length;
    $('portalProgress').innerHTML=portals.map((id,i)=>`<span class="${i<(app.state?.portalIndex||0)?'done':''}">${i<(app.state?.portalIndex||0)?'✓':'◎'} ${id} <small>вход → выход</small></span>`).join('')+'<button class="text-button" data-action="portal-help">Как работает?</button>';
    const legs=level().flybys||[],s=app.state,indexNow=s?.flybyIndex||0,leg=legs[indexNow];
    $('activeStep').textContent=s?.status==='won'?'Маршрут завершён':(s?.portalIndex||0)<Math.min(indexNow,portals.length)?`Перейти через портал ${portals[s?.portalIndex||0]}`:leg?`${level().planets[leg.planet].name} ${leg.direction>0?'↻':'↺'} · ${Math.min(leg.degrees,Math.floor(P.deg(s?.flybyAngle||0)))}° / ${leg.degrees}°`:(s?.gateIndex||0)<(level().gates?.length||0)?`Кольцо ${(s?.gateIndex||0)+1} из ${level().gates.length}`:(s?.portalIndex||0)<portals.length?`Перейти через портал ${portals[s?.portalIndex||0]}`:'Доставить груз на станцию';
    $('planCounter').textContent=legs.length?`${indexNow}/${legs.length}`:'';
    if(!legs.length)return;
    const index=app.state?.flybyIndex||0;
    $('routeStatus').textContent=`${index} / ${legs.length} манёвра`;
    for(const el of $('routeSteps').children){const i=+el.dataset.leg,done=i<index,active=i===index;
      el.classList.toggle('done',done);el.classList.toggle('active',active);
      el.querySelector('.route-value').textContent=done?'✓ Пройден':active?`${Math.min(legs[i].degrees,Math.floor(P.deg(app.state?.flybyAngle||0)))}° / ${legs[i].degrees}°`:`${legs[i].degrees}°`;
    }
  }
  function routeHelp(){
    openModal('Гравитационный маршрут',`<p>Нужно облететь указанные планеты <strong>по порядку и в направлении стрелок</strong>. Каждый манёвр — больше половины оборота вокруг отдельной планеты, а не просто касание кольца.</p><p>Пунктирная окружность у активной планеты — зона манёвра. Дуга растёт, пока капсула остаётся внутри. Выход сбрасывает только текущую дугу; уже завершённые сохраняются.</p><p>Кольца задают ветви маршрута. После всех облётов и колец доставь три контейнера на станцию. Прямой перелёт и большой круг вокруг всей системы не заменяют отдельные манёвры.</p><div class="info-box">Грузы находятся на разных ветвях. Сначала добейся правильной формы траектории, затем уточняй угол шагом 0,1° и скорость шагом 1. Мышью или пальцем можно грубо задать направление.</div><div class="modal-actions"><button class="button primary" data-action="close">К маршруту</button></div>`,'ПЛАН ПОЛЁТА');
  }
  function medalIcon(key){
    const paths={precision:'<circle cx="24" cy="25" r="9"/><path d="M24 12v9m0 8v9M11 25h9m8 0h9"/>',time:'<circle cx="24" cy="25" r="12"/><path d="M24 17v9l6 3"/>',branches:'<path d="M24 37V25m0 0-10-10m10 10 10-10M11 20v-8h8m10 0h8v8"/>',delivery:'<path d="M12 25h17"/><path d="M24 18l8 7-8 7"/><rect x="13.5" y="16" width="9" height="18" rx="2.5" fill="currentColor" fill-opacity=".11"/><path d="M18 19v12"/><circle cx="18" cy="21" r="1.2" fill="currentColor" stroke="none"/>',economy:'<path d="M29 11 17 27h8l-2 12 12-16h-8Z" fill="currentColor" fill-opacity=".16"/><path d="M27 14 20 24h6l-2 10 8-11h-5Z"/><path d="M14 37c3 2 6 3 10 3 5 0 9-1 13-4" opacity=".85"/>',cargo:'<path d="m24 14 12 7v14l-12 7-12-7V21Zm-12 7 12 7 12-7m-12 7v14"/><path d="M18 19.5h5v5h-5zM25 26h5v5h-5z" fill="currentColor" fill-opacity=".14" stroke="none"/><path d="M19 20.5h3m-1.5-1.5v3m5 5h3m-1.5-1.5v3"/>'};
    return `<svg viewBox="0 0 48 58" aria-hidden="true"><path class="medal-ribbon" d="m11 37-3 17 10-4 6 6 3-16m10-3 3 17-10-4-6 6-3-16"/><circle class="medal-rim" cx="24" cy="25" r="21"/><circle class="medal-inner" cx="24" cy="25" r="17"/>${paths[key]||paths.delivery}</svg>`;
  }
  function updateMedalStates(){
    const l=displayLevel(),r=G.viewRecord(app.profile,l.id),ds=O.Medals.describe(l,displayState(),app.speed,r,app.assisted,stats());
    for(const d of ds){const card=$('medal-'+d.key);if(!card)continue;
      if(card.dataset.state!==d.state)card.dataset.state=d.state;
      card.querySelector('.medal-detail').textContent=d.detail==='Этапы 0 / 0'?'До станции':d.detail;
      card.querySelector('.medal-live').textContent=d.status;
      card.querySelector('.medal-archive').textContent=d.earned?'✓ Получена':d.archive?'Архив v7':'Новая цель';
      card.querySelector('.medal-archive').classList.toggle('owned',d.earned);
      card.querySelector('.medal-track i').style.width=`${Math.max(0,Math.min(1,d.progress))*100}%`;
      card.setAttribute('aria-label',`${d.title}. ${d.condition}. ${d.detail}. ${d.status}. ${d.earned?'Уже есть в коллекции.':''}`);
    }
    $('medalLegend').textContent=app.assisted?'Тренировка: медали не выдаются':'Засчитываются только после доставки';
  }
  function updateObjectives(){
    const l=level(),r=G.viewRecord(app.profile,l.id),rules=l.rules||{};
    $('objectivesList').innerHTML=O.Medals.describe(l,app.state,app.speed,r,app.assisted,stats()).map((d,i)=>`<article role="button" tabindex="0" id="medal-${d.key}" class="medal-card" data-state="pending"><div class="medal-symbol">${medalIcon(O.Medals.rules(l)[i].type)}</div><div class="medal-copy"><div class="medal-name"><h3>${d.title}</h3><span class="medal-archive"></span></div><p class="medal-condition">${d.condition}</p><div class="medal-readout"><strong class="medal-detail"></strong><span class="medal-live"></span></div><div class="medal-track"><i></i></div></div></article>`).join('');
    updateMedalStates();
    const req=[];
    if(l.gates?.length)req.push(`Кольца: ${Array.from({length:l.gates.length},(_,i)=>i+1).join(' → ')}`);
    if(rules.minCargo)req.push(`Обязательный груз: ${rules.minCargo}`);
    if(rules.captureCap)req.push(`Радиус приёма: ${rules.captureCap} ед.`);
    if(rules.maxDockSpeed)req.push(`${l.target.motion?'Относительная скорость':'Скорость у станции'} ≤ ${rules.maxDockSpeed}`);
    if(rules.maxLaunchSpeed)req.push(`Старт ≤ ${rules.maxLaunchSpeed} ед./с`);
    if(rules.window)req.push(`Прибытие: ${rules.window[0].toFixed(2)}–${rules.window[1].toFixed(2)} с`);
    $('strictRules').innerHTML=req.map(x=>`<span class="rule-chip">${x}</span>`).join('');
    const cap=Math.floor(E.baseReward(l)*(app.profile.difficulty==='pro'?1.7:1));
    $('contractReward').textContent=`до ${Math.max(0,cap-r.paid)} ◈`;
  }
  function medalHelp(){if(O.V8)return O.V8.medalHelp();
    const l=level();
    openModal('Медали — три отдельные цели',`<div class="medal-help-grid"><p><strong>Доставка.</strong> Выполни обязательные облёты, кольца, порталы и требования станции, затем пристыкуйся.</p><p><strong>Экономный старт.</strong> Успешно доставь капсулу со стартовой скоростью не выше <b>${l.parSpeed} ед./с</b>. Скорость в середине полёта на эту медаль не влияет.</p><p><strong>Полный груз.</strong> Привези все ${l.cargo.length} контейнера <b>в одном рейсе</b>. Притягиваемый груз ещё не находится на борту.</p></div><div class="info-box">Полоса показывает текущую попытку. Метка «В коллекции» относится к прошлым доставкам и не означает, что цель выполнена сейчас. На неудачном рейсе и в тренировке новые медали не выдаются. Рейтинг и денежный рекорд рассчитываются отдельно.</div><div class="modal-actions"><button class="button primary" data-action="close">К маршруту</button></div>`,'ЦЕЛИ РЕЙСА');
  }
  function loadLevel(id){
    if(!Number.isInteger(id)||id<0||id>=L.length||!G.unlocked(app.profile,id)){toast('Сначала заверши предыдущий контракт.',true);return;}
    closeModal();app.currentId=id;app.activeLevel=P.prepareLevel(L[id],app.profile.difficulty);app.assisted=false;app.profile.lastLevel=id;app.state=null;app.paused=false;app.accumulator=0;app.trail=[];app.particles=[];app.lastResult=null;app.camera={zoom:1,cx:600,cy:350};app.branchView='A';
    const l=level(),aim=app.aims[id];app.angle=aim?aim.angle:l.initialAngle;app.speed=P.clamp(aim?aim.speed:l.initialSpeed,60,stats().maxSpeed);
    app.previewDirty=true;go('play',true);
    $('flightSector').textContent=`КОНТРАКТ ${pad(C.number(id))} / ${O.SECTORS[l.sector].name.toUpperCase()}`;
    $('flightTitle').textContent=l.name;$('flightBrief').textContent=l.brief;
    document.querySelector('.stage-corner').textContent=`OC / FLIGHT ${pad(C.number(id))}`;
    $('flightDetails').open=false;$('flightPlan').open=!root.matchMedia('(max-width:900px)').matches;
    setStage(l.dynamic?(l.motionKind==='station'?'ПЕРЕХВАТ · ГОТОВНОСТЬ':'ОРБИТЫ · ГОТОВНОСТЬ'):'КАПСУЛА ГОТОВА','');
    syncControls();renderRoute();updateObjectives();updateTelemetry();save();O.V8?.onLevel();O.UI9?.onLevel();
  }
  function setStage(label,caption){$('stagePill').innerHTML=`<i class="live-dot"></i> ${label}`;$('stageBottom').textContent='';$('stageBottom').hidden=true;}
  function launch(){
    if(app.screen!=='play'||app.transitioning)return;
    if(isFlying()){pause();return;}
    if(app.state){retry();return;}
    closeModal();app.state=P.createState(level(),app.angle,app.speed,stats());app.state.assisted=app.assisted;O.Review?.start(app.state);
    app.accumulator=0;app.trail=[{x:app.state.x,y:app.state.y}];app.preview=null;app.paused=false;app.lastResult=null;
    const key=courseKey();app.attemptHistory[key]=[...(app.attemptHistory[key]||[]).slice(-4),{angle:app.angle,speed:app.speed}];
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
      app.lastResult=result;save();updateProfileUI();updateObjectives();sound.play('win');burst(s.x,s.y,skin().color,45);
      setStage(result.training?'ТРЕНИРОВКА ЗАВЕРШЕНА':'ДОСТАВЛЕНО',result.training?'Демонстрация без наград. Для зачёта выбери самостоятельный рейс.':'Оценка рейса определяет оплату. Повторные выплаты — только за улучшение.');
      if(G.rank(app.profile).index>before.index)toast(`Новый ранг: ${G.rank(app.profile).name}!`);
      if(O.Review){O.Review.finish(s,app.trail,level());O.V8.showResult(result);}else showWin(result);
    }else{
      sound.play('fail');burst(s.x,s.y,'#ff9f86',32);setStage('МАРШРУТ НЕ ЗАВЕРШЁН','Ничего не потеряно. Измени направление или скорость и попробуй снова.');if(O.Review){O.Review.finish(s,app.trail,level());O.V8.showResult(null);}else showFail();
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
    const reason=app.state.reason;
    const messages={portals:'Не выполнен порядок переходов. Войди в тёмные порталы в указанном порядке: A → B → C, если они есть на карте. Светлые кольца являются выходами.', 'portal-loop':'Нестабильная цепочка переходов. Измени курс.',flybys:'Не завершена последовательность облётов. Станция принимает груз только после всех манёвров. Порядок и направление указаны в плане под картой. Выход из зоны текущей планеты сбрасывает незавершённую дугу.',planet:'Капсула встретилась с поверхностью планеты. Попробуй более широкую дугу или другую стартовую скорость.',asteroid:'На пути оказался астероид. Он не притягивает капсулу, но столкновение с ним прерывает рейс.',boundary:'Капсула вышла за пределы навигационной карты. Уменьши скорость или скорректируй угол.',timeout:'Истекло время полёта. Капсула могла попасть на слишком длинную орбиту — измени стартовый импульс.',numeric:'Расчёт остановлен из-за некорректного состояния. Повтори запуск.',gates:'Не пройдены все контрольные кольца по порядку. Зелёное кольцо уже зачтено; оранжевое — следующее.',manifest:'Недостаточно груза для этого контракта. Сверь обязательный минимум; притягиваемый, но не захваченный груз ещё не находится на борту.',fuel:'Превышен лимит стартового импульса контракта.',overspeed:'Станция не приняла капсулу: скорость захода выше допуска. Измени импульс или дугу.',window:'Прибытие вне временного окна. Показанный интервал относится ко времени симуляции, а не к часам телефона.'};
    openModal('Ещё один точный импульс',`<p>${messages[reason]||'Маршрут не завершён.'}</p><div class="info-box">Попытки бесплатны. Серая линия покажет предыдущий маршрут, а пунктир — начало нового.</div><div class="modal-actions"><button class="button quiet" data-action="hint">Помощь диспетчера</button><button class="button primary" data-action="retry">Ещё раз ↺</button></div>`,'ПОЛЁТ ПРЕРВАН');
  }
  function updateTelemetry(){
    updateRoute();updateMedalStates();O.V8?.sync();const s=displayState();$('flightTime').innerHTML=`${(s?.t||0).toFixed(2)} <small>с</small>`;
    $('flightVelocity').innerHTML=`${s?Math.hypot(s.vx,s.vy).toFixed(0):app.speed} <small>ед./с</small>`;
    $('flightCargo').textContent=`${O.Routes.collected(level(),s)} / ${O.Routes.cargoIds(level(),s,app.branchView).length}`;
    $('speedButton').textContent=`×${app.timeScale}`;
    const pulls=s?.cargoBodies?.filter(c=>c.phase==='pulling').length||0;
    const missing=s?.cargoBodies?.filter(c=>c.phase==='lost').length||0;
    const items=[];
    if(level().gates?.length)items.push(`Кольца ${s?.gateIndex||0}/${level().gates.length}`);
    if(pulls)items.push(`Притягивается: ${pulls}`);
    if(missing)items.push(`Груз потерян: ${missing}`);
    if(s&&level().target.motion)items.push(`Относительная скорость: ${P.dockVelocity(s,level()).speed.toFixed(0)}`);
    $('flightStatus').textContent=items.join(' · ');$('flightStatus').hidden=items.length===0;
  }
  function openModal(title,body,eyebrow='БОРТОВОЙ КОМПЬЮТЕР'){
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
      openModal('Курс можно уточнить',`<p>${l.hint}</p><div class="info-box">Меняй сначала угол, затем скорость. Контейнеры и контрольные кольца помогают читать маршрут. В ПРО станция уже, а прогноз короче. Подсказка не снижает оценку.</div><div class="modal-actions"><button class="button quiet" data-action="close">Разберусь сам</button><button class="button primary" data-action="exact-hint">Тренировка с точным курсом</button></div>`,'ПОДСКАЗКА');
    }
  }
  function applySolution(){
    const chosenBranch=app.branchView;retry();app.branchView=chosenBranch;const l=level(),course=l.solutions?.find(c=>c.branch===chosenBranch)||(app.profile.difficulty==='pro'?(l.proSolution||l.solution):l.solution);
    app.assisted=true;setAim(course.angle,course.speed);syncControls();
    setStage('ТРЕНИРОВКА · БЕЗ НАГРАД',`Пример${course.branch?' ветви '+course.branch:''}: ${course.angle}° / ${course.speed} ед./с. Для зачётного рейса нажми «Заново».`);
    toast('Точный курс установлен. Этот запуск — без наград.');
  }
  function showHelp(){
    openModal('Точнее курс. Дороже результат.',`<div class="help-steps"><div class="help-step"><span>01</span><p><strong>Настрой угол и скорость.</strong>На компьютере тяни мышью от капсулы. На телефоне веди пальцем по карте или используй кнопки ±. Точный режим даёт шаг 0,1°.</p></div><div class="help-step"><span>02</span><p><strong>Выбери обычный режим или ПРО.</strong>В ПРО станция уже, обязателен груз, прогноз на 40% короче. Потенциальная оплата выше, но повторно выплачивается только улучшение рекорда.</p></div><div class="help-step"><span>03</span><p><strong>Выполни контракт.</strong>На экспертных маршрутах нужны кольца по порядку, заданный груз, иногда — время и скорость прибытия. Эти требования видны до старта.</p></div></div><div class="info-box"><strong>Собственная гравитация:</strong> купи гравитационный захват I. Попав в поле, контейнер реально летит к кораблю. Пока он не достиг капсулы, он не засчитан. Через планеты груз не проходит. Прокачка повышает и радиус, и силу поля.</div><p>Кредиты — за лучший результат контракта. Данные ⬡ — за высокий балл и ПРО. Старшие ступени дороги: выбирай специализацию. Пересборка возвращает фактические затраты по чекам.</p><p>Ошибки бесплатны. Точная подсказка доступна в тренировке, которая не даёт наград. Условия открытия указаны в каталоге. Новые развилки и многоадресные рейсы открываются после 20 доставок. Орбиты начинаются при запуске и сбрасываются при повторе; при перехвате важна относительная скорость.</p><p><kbd>Пробел</kbd> запуск / пауза · <kbd>R</kbd> повтор · <kbd>G</kbd> поле · <kbd>←</kbd><kbd>→</kbd> угол · <kbd>↑</kbd><kbd>↓</kbd> скорость.</p><div class="modal-actions"><button class="button primary" data-action="close">К полёту ↗</button></div>`,'ИНСТРУКТАЖ');
  }
  function showSettings(){if(O.V8)return O.V8.settings();
    const s=app.profile.settings;
    const options=[['sound','Звуковые сигналы','Синтезированные эффекты, без фоновой музыки.'],['grid','Поле тяготения','Показывать направление ускорения в разных точках.'],['ghost','След предыдущей попытки','Серая линия помогает уточнять маршрут.'],['reducedMotion','Меньше анимаций','Меньше декоративного движения. Планеты, станция и груз продолжают двигаться по правилам игры.']];
    openModal('Сохранение и настройки',`${options.map(([key,title,caption])=>`<label class="check-row"><span>${title}<small>${caption}</small></span><input type="checkbox" data-setting="${key}" ${s[key]?'checked':''}></label>`).join('')}<h3>Твой прогресс остаётся у тебя</h3><p>Автосохранение: <strong>${app.storageOK?'доступно в этом браузере':'недоступно — используй экспорт'}</strong>. Оно привязано к браузеру и адресу игры. При переносе папки, очистке данных или смене браузера импортируй резервную копию.</p><div class="modal-actions"><button class="button quiet" data-action="export">Экспорт в JSON ↓</button><button class="button quiet" data-action="import">Импорт из JSON ↑</button></div><div class="info-box">В игре нет сервера, аккаунта, рекламы и отправки данных. Для надёжности экспортируй сохранение перед переносом игры. Экспорт содержит прогресс, но не текущий полёт.</div><div class="modal-actions"><button class="button danger" data-action="reset-confirm">Сбросить прогресс</button><button class="button primary" data-action="close">Готово</button></div>`,'НАСТРОЙКИ');
  }
  function exportSave(){app.profile.flags=app.profile.flags||{};app.profile.flags.export=true;G.awardAchievements(app.profile);save();updateProfileUI();
    const blob=new Blob([JSON.stringify(app.profile,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`orbital-courier-save-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('Резервная копия подготовлена. Сохрани JSON-файл.');
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
    'new-routes':()=>{app.campaignSector=-1;app.campaignFilter='new';app.campaignQuery='';$('contractSearch').value='';go('campaign');},
    'portal-help':()=>openModal('Парные переходы',`<p><strong>Тёмный центр — вход. Светлое кольцо — выход.</strong> Капсула мгновенно перемещается к выходу с теми же скоростью и направлением. Импульс не добавляется, игровое время не пропускается.</p><p>Собранные контейнеры летят с капсулой. Груз, который ещё тянется полем, остаётся на прежней стороне. Переход не засчитывает кольца и облёты между отверстиями; незавершённая дуга сбрасывается.</p><p>Порталы односторонние. На картах с двумя парами порядок A → B, с тремя — A → B → C. У входа и соответствующего выхода одинаковая буква и цвет.</p><div class="info-box">Это игровая модель червоточины, а не реалистичная чёрная дыра. У самого портала нет дополнительного гравитационного поля.</div><div class="modal-actions"><button class="button primary" data-action="close">Понятно</button></div>`,'РАЗЛОМ ПРОСТРАНСТВА'),
    'previous-level':()=>travelToLevel(C.adjacent(app.currentId,-1)),'following-level':()=>travelToLevel(C.adjacent(app.currentId,1)),
    'confirm-travel':b=>travelToLevel(+b.dataset.id,true),
    'contract-filter':b=>{app.campaignFilter=b.dataset.filter;app.campaignSector=-1;renderCampaign();},
    'clear-contracts':()=>{app.campaignQuery='';$('contractSearch').value='';app.campaignFilter='all';app.campaignSector=-1;renderCampaign();},
    'current-sector':()=>chooseSector(L[G.nextLevel(app.profile)].sector),
    'sector-prev':()=>chooseSector(C.sectors[Math.max(0,C.sectors.indexOf(app.campaignSector)-1)]),
    'sector-next':()=>chooseSector(C.sectors[Math.min(C.sectors.length-1,C.sectors.indexOf(app.campaignSector)+1)]),
    'store-course':b=>storeCourse(+b.dataset.slot),'recall-course':b=>recallCourse(+b.dataset.slot),
    'previous-aim':()=>{const last=app.attemptHistory[courseKey()]?.at(-1);if(isAiming()&&last)setAim(last.angle,last.speed);},
    'medal-help':medalHelp,'cosmetic-tab':b=>{app.cosmeticTab=b.dataset.tab==='trails'?'trails':'skins';renderCosmetics();},
    trail:b=>{const t=O.Cosmetics.TRAILS.find(t=>t.id===b.dataset.key);if(t&&O.Cosmetics.unlocked(app.profile,t)){app.profile.trail=t.id;save();renderCosmetics();sound.play('click');}},
    'route-help':routeHelp,maneuvers:()=>{app.campaignSector=7;go('campaign');},nav:b=>go(b.dataset.page), 'force-nav':b=>go(b.dataset.page,true),close:closeModal,
    continue:()=>C.count(app.profile)===L.length?go('campaign'):travelToLevel(G.nextLevel(app.profile)),
    mission:b=>travelToLevel(+b.dataset.id), 'return-flight':()=>loadLevel(G.unlocked(app.profile,app.profile.lastLevel)?app.profile.lastLevel:G.nextLevel(app.profile)),
    launch,retry,pause,help:showHelp,settings:showSettings,hint:()=>showHint(false),'exact-hint':()=>showHint(true),'apply-solution':applySolution,
    'angle-down':()=>setAim(app.angle-(app.profile.settings.fineAim?0.1:0.5),app.speed),'angle-up':()=>setAim(app.angle+(app.profile.settings.fineAim?0.1:0.5),app.speed),
    'speed-down':()=>setAim(app.angle,app.speed-(app.profile.settings.fineAim?1:2)),'speed-up':()=>setAim(app.angle,app.speed+(app.profile.settings.fineAim?1:2)),
    'toggle-grid':()=>{app.profile.settings.grid=!app.profile.settings.grid;save();syncControls();},
    speed:()=>{app.timeScale=app.timeScale===.5?1:app.timeScale===1?2:app.timeScale===2?4:.5;updateTelemetry();},
    next:()=>G.unlocked(app.profile,C.adjacent(app.currentId,1))?travelToLevel(C.adjacent(app.currentId,1)):go('campaign'),
    sector:b=>chooseSector(Number(b.dataset.sector)),
    'campaign-tier':b=>chooseSector(C.tiers[+b.dataset.tier].sectors[0]),
    'fine-aim':()=>{if(app.state)return;app.profile.settings.fineAim=!app.profile.settings.fineAim;save();syncControls();},
    wishlist:b=>{app.profile.wishlist=app.profile.wishlist===b.dataset.key?null:b.dataset.key;save();renderHangar();},
    'economy-info':economyInfo,
    'respec-info':respecInfo,
    'contract-info':()=>openModal('Условия приёмки',`<p>${escape(level().brief)}</p><div class="contract-rules modal-rules">${$('strictRules').innerHTML}</div>${level().dynamic?'<div class="info-box">Пунктирные петли — орбиты, а не маршрут корабля. Бледный контур — положение объекта в конце прогноза. Движение начинается при запуске; повтор возвращает начальные позиции. Для движущейся станции ограничение скорости проверяется относительно неё.</div>':''}<p>Условия проверяются при входе в зону станции.</p><div class="modal-actions"><button class="button primary" data-action="close">Понятно</button></div>`),
    'respec-confirm':()=>{const r=G.respec(app.profile);closeModal();save();updateProfileUI();renderHangar();toast(`Пересборка: возвращено ${r.credits} ◈ и ${r.data} ⬡`);},
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
      toast(`Модуль улучшен · −${result.cost} ◈ / −${result.data} ⬡`);for(const a of result.awards)toast(`Достижение: ${a.name} · +${a.xp} XP`);
    },
    skin:b=>{const s=G.SKINS.find(x=>x.id===b.dataset.key);if(s&&O.Cosmetics.unlocked(app.profile,s)){app.profile.skin=s.id;save();renderHangar();}},
    export:exportSave,import:()=>{$('importFile').value='';$('importFile').click();},'reset-confirm':resetConfirm,
    reset:()=>{app.profile=G.fresh();app.state=null;app.aims={};app.ghosts={};save();go('home',true);toast('Начата новая экспедиция.');}
  };
  document.addEventListener('click',event=>{
    const b=event.target.closest('[data-action]');if(!b||b.disabled)return;
    if(app.transitioning)return;
    sound.unlock();const action=actions[b.dataset.action];if(action)action(b);
  });
  document.querySelector('.cosmetic-tabs').addEventListener('keydown',event=>{
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
  $('contractSearch').addEventListener('input',event=>{app.campaignQuery=event.target.value;renderCampaign();});
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
  let lastTelemetry=0,tickCount=0;
  function frame(now){
    sound.flight(isFlying()&&!app.paused&&!document.hidden&&!app.transitioning&&!O.Review?.active?.playing,Math.hypot(app.state?.vx||0,app.state?.vy||0));
    const elapsed=Math.min(0.1,Math.max(0,(now-(app.frameTime||now))/1000));app.frameTime=now;
    if(app.screen==='play'){
      if(isAiming()&&app.previewDirty){app.preview=P.simulate(level(),app.angle,app.speed,stats(),stats().preview,7);app.previewDirty=false;}
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
      const review=O.Review?.renderModel();gameRenderer.draw(displayLevel(),{camera:app.camera,review:!!review,time:t,angle:app.angle,speed:app.speed,color:skin().color,stats:stats(),state:displayState(),
        preview:app.state?null:app.preview,trail:review?.trail||app.trail,trailStyle:app.profile.trail,ghost:review?.ghost||(app.profile.settings.ghost?app.ghosts[app.currentId]:null),
        aimPointer:app.aimPointer,grid:app.profile.settings.grid,reducedMotion:app.profile.settings.reducedMotion,particles:app.particles,banked:G.viewRecord(app.profile,app.currentId).cargo});
      if(now-lastTelemetry>85){updateTelemetry();lastTelemetry=now;}
    }else if(app.screen==='hangar'){
      if(O.Hangar)O.Hangar.preview(now);else O.Cosmetics.preview($('trailPreview'),app.profile.trail,skin().color,now/1000,app.profile.settings.reducedMotion);
    }else if(app.screen==='campaign'&&!app.profile.settings.reducedMotion&&now-lastTelemetry>70){
      for(const item of app.contractPreviews||[]){if(!item.canvas.isConnected)continue;const card=item.canvas.closest('button');if(card.matches(':hover,:focus-visible')&&!card.disabled){item.renderer.draw(item.level,{hideShip:true,time:now/1000,state:{t:(now/1000)%12,x:item.level.start.x,y:item.level.start.y,status:'preview',cargo:[]}});}}
      lastTelemetry=now;
    }else if(app.screen==='home'){
      if(!document.hidden)app.heroTime+=elapsed;
      const blend=1-Math.exp(-elapsed*5);
      for(const key of ['x','y','strength'])app.heroPointer[key]=(app.heroPointer[key]||0)+((app.heroTarget[key]||0)-(app.heroPointer[key]||0))*blend;
      heroRenderer.hero(app.profile.settings.reducedMotion?2:app.heroTime,skin().color,
        app.profile.settings.reducedMotion?{x:0,y:0}:app.heroPointer);
    }
    requestAnimationFrame(frame);
  }
  const heroArea=$('heroCanvas').closest('.hero');
  function guideStars(event){
    const r=$('heroCanvas').getBoundingClientRect();
    app.heroTarget={x:P.clamp((event.clientX-r.left)/r.width*2-1,-1,1),y:P.clamp((event.clientY-r.top)/r.height*2-1,-1,1),strength:1};
  }
  function releaseStars(){app.heroTarget={x:0,y:0,strength:0};}
  heroArea.addEventListener('pointermove',guideStars,{passive:true});
  heroArea.addEventListener('pointerdown',guideStars,{passive:true});
  heroArea.addEventListener('pointerleave',releaseStars);
  heroArea.addEventListener('pointercancel',releaseStars);
  heroArea.addEventListener('pointerup',event=>{if(event.pointerType==='touch')releaseStars();});
  // Expose semantic commands for the included browser smoke test, not a server API.
  Object.assign(app,{travelToLevel,renderCampaign,storeCourse,recallCourse,loadLevel,setAim,launch,retry,go,save,updateProfileUI,exportSave,applySolution,finish,level,displayLevel,displayState,stats,openModal,closeModal,toast,showWin,showFail,syncControls,updateObjectives,renderHangar,renderAwards,actions});
  if(!Object.keys(app.profile.records).length&&root.matchMedia('(prefers-reduced-motion: reduce)').matches)app.profile.settings.reducedMotion=true;
  document.body.dataset.page='home';updateProfileUI();requestAnimationFrame(frame);
  if(loaded.migrated){save();openModal('Прогресс перенесён в версию 8',`<p>Пройденные уровни и купленные модули сохранены. Новые контракты продолжают прежнюю кампанию.</p><div class="info-box">Старый баланс: ${money(app.profile.migration.oldCredits)} ◈. Новый баланс: ${money(app.profile.credits)} ◈. Награды пересчитаны по новой экономике, расходы на сохранённые улучшения учтены. Долгов нет. Исходное сохранение не удалено. Унаследованные модули не имеют денежного возврата при пересборке.</div><div class="modal-actions"><button class="button primary" data-action="close">Продолжить</button></div>`);}
  if(loaded.upgraded){save();toast('Версия 8: прогресс сохранён. Старые медали — в архиве; новые цели отмечены отдельно.');}
  if(loaded.error)toast('Автосохранение недоступно или повреждено. Используй экспорт или импорт резервной копии.',true);
})(typeof globalThis!=='undefined'?globalThis:window);
