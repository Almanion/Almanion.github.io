/* Only history actually flown. No future simulation, reward or permanent storage. */
(function(root){'use strict';const O=root.Orbital;let recording=null,active=null;const memory=new Map(),key=()=>O.App.currentId+':'+O.App.profile.difficulty;
function snapshot(s){return {...s,cargo:s.cargo.slice(),teleports:[],cargoBodies:s.cargoBodies.map(c=>({...c,trail:[]})),branchProgress:structuredClone(s.branchProgress||{}),dropEvents:(s.dropEvents||[]).map(x=>({...x}))};}
function start(s){active=null;recording={key:key(),angle:s.launchAngle,speed:s.launchSpeed,frames:[snapshot(s)],resets:[]};}
function observe(a,b,l){
  if(!recording)return;
  const {frames,resets}=recording;
  const reset=a.flybyAngle>0&&b.flybyAngle===0&&a.flybyIndex===b.flybyIndex&&a.branchId===b.branchId;
  if(reset){
    const view=O.Routes.view(l,a);
    resets.push({t:b.t,leg:a.flybyIndex,branch:view.activeBranch,degrees:O.Physics.deg(a.flybyAngle)});
  }
  if(frames.length<2400&&(reset||b.t-frames.at(-1).t>=.05||b.status!=='flying'))frames.push(snapshot(b));
}
function finish(s,points,level){
  const data=recording||{key:key(),angle:s.launchAngle,speed:s.launchSpeed,frames:[],resets:[]};
  data.final=snapshot(s);
  if(data.frames.at(-1)?.t===s.t)data.frames[data.frames.length-1]=data.final;
  else data.frames.push(data.final);
  data.points=points.map(p=>({...p}));
  data.level=level;
  data.event=s.status==='won'?null:findEvent(data);
  const previous=memory.get(data.key)||[];
  memory.delete(data.key);
  memory.set(data.key,[...previous,data].slice(-2));
  while(memory.size>4)memory.delete(memory.keys().next().value);
  recording=null;
  active={data,index:data.frames.length-1,compare:false,model:null};
}
function prior(){return active?(memory.get(active.data.key)||[]).at(-2):null;}
function clearView(){active=null;recording=null;}
function frameIndex(frames,t){
  let lo=0,hi=frames.length-1;
  while(lo<hi){
    const mid=Math.ceil((lo+hi)/2);
    if(frames[mid].t<=t)lo=mid;else hi=mid-1;
  }
  return lo;
}
function currentFrame(){return active?.data.frames[active.index];}
function selectTime(t){
  if(!active)return;
  const index=frameIndex(active.data.frames,t);
  if(active.index!==index){active.index=index;active.model=null;}
}
function setCompare(){
  if(!prior())return;
  active.compare=!active.compare;
  active.model=null;
}
function renderModel(){
  if(!active)return null;
  if(!active.model){
    const state=currentFrame(),other=active.compare?prior():null;
    const ghostState=other?.frames[frameIndex(other.frames,state.t)]||null;
    active.model={state,
      trail:other?active.data.points:active.data.points.filter(p=>(p.t||0)<=state.t),
      ghost:other?.points||null,
      ghostState,
      ghostStation:ghostState&&other.level.launchDelay!==active.data.level.launchDelay?
        O.Physics.bodyAt(other.level.target,ghostState.t):null,
      event:active.data.event};
  }
  return active.model;
}
const decimal = new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 2});
const num = value => decimal.format(value);
const missedDock = (level,state) => level.launchTiming && (state.reason==='boundary'||state.reason==='timeout');
function failureReason(level,state){
  if(missedDock(level,state)&&(state.flybyIndex||0)<(level.flybys?.length||0))return 'flybys';
  return state.reason;
}
function eventPoint(frame,caption,target=null,goal=null){
  const event={x:frame.x,y:frame.y,t:frame.t,caption,target};
  return goal?{...event,goal}:event;
}

// A visit before the prerequisites or a jump between mouths is not a valid approach.
function closestApproach(frames,goal,targetAt,ready=()=>true){
  let eligible=null,nearest=null;
  for(const frame of frames){
    const target=targetAt(frame);
    if(!target)continue;
    const gap=Math.hypot(frame.x-target.x,frame.y-target.y)-target.r;
    const candidate={frame,target,gap};
    if(!nearest||gap<nearest.gap)nearest=candidate;
    if(ready(frame)&&(!eligible||gap<eligible.gap))eligible=candidate;
  }
  const hit=eligible||nearest;
  if(!hit)return null;
  const detail=!eligible?' · до выполнения условий':hit.gap>.01?` · до зоны ≈ ${num(hit.gap)} ед.`:'';
  return {...eventPoint(hit.frame,`${goal.label} · ближайший подлёт${detail}`,hit.target,goal),gap:hit.gap};
}

function findEvent({level,final:state,frames,resets}){
  const P=O.Physics,T=O.FlightObjectives,plan=T.plan(level,state);
  const progress=frame=>frame.branchProgress?.[plan.route.activeBranch]||frame;
  const title=failureReport(level,state,resets).title;
  const last=eventPoint(state,`${title} · ${num(state.t)} с`);
  const approach=(goal,ready,course=plan)=>goal&&closestApproach(frames,goal,
    frame=>T.position(course,goal,frame),ready);
  const terminal=goal=>goal?eventPoint(state,`${goal.label} · ${title}`,T.position(plan,goal,state),goal):last;
  const reason=failureReason(plan.route,state);
  if(missedDock(level,state)&&reason!=='flybys')return approach(plan.dock,frame=>progress(frame).flybyIndex>=plan.flybys.length)||last;
  switch(reason){
    case 'gates':
      return approach(plan.gates[state.gateIndex],frame=>progress(frame).gateIndex===state.gateIndex)||last;
    case 'portals':
    case 'branch': {
      const courses=state.reason==='branch'?level.branches.map(branch=>T.plan(level,null,branch.id)):[plan];
      const events=courses.flatMap(course=>{
        const goal=course.portals[state.reason==='branch'?0:state.portalIndex];
        if(!goal)return [];
        const {pair}=goal;
        const event=approach(goal,frame=>{
          const p=frame.branchProgress?.[pair.branch]||frame;
          return (!frame.branchId||!pair.branch||frame.branchId===pair.branch)&&frame.portalReadyAt<=frame.t&&
            p.flybyIndex>=(pair.afterFlybys||0)&&(pair.afterPortals===undefined||p.portalIndex===pair.afterPortals);
        },course);
        return event?[event]:[];
      });
      return events.sort((a,b)=>a.gap-b.gap)[0]||last;
    }
    case 'flybys': {
      const goal=plan.flybys[state.flybyIndex];
      if(!goal)return last;
      const reset=!state.flybyAngle&&resets.findLast(r=>r.leg===state.flybyIndex&&r.branch===plan.route.activeBranch);
      if(reset){
        const frame=frames[frameIndex(frames,reset.t)];
        return eventPoint(frame,`${goal.label} · сброс на ${Math.floor(reset.degrees)}° из ${goal.degrees}°`,
          T.position(plan,goal,frame),goal);
      }
      if(state.flybyAngle>0)
        return eventPoint(state,`${goal.label} · ${Math.floor(P.deg(state.flybyAngle))}° из ${goal.degrees}°`,
          T.position(plan,goal,state),goal);
      return approach(goal,frame=>progress(frame).flybyIndex===state.flybyIndex)||last;
    }
    case 'manifest': {
      const events=plan.cargo.filter(goal=>!state.cargo.includes(goal.index)).map(goal=>approach(goal)).filter(Boolean);
      return events.sort((a,b)=>a.gap-b.gap)[0]||last;
    }
    case 'deliveries': {
      const goal=plan.stops[state.dropIndex];
      return approach(goal,frame=>frame.dropIndex===state.dropIndex&&
        frame.flybyIndex>=(goal.body.afterFlybys||0)&&frame.portalIndex>=(goal.body.afterPortals||0))||last;
    }
    case 'drop-speed':return terminal(plan.stops[state.dropIndex]);
    case 'fuel':
    case 'overspeed':
    case 'window':return terminal(plan.dock);
    default:return last;
  }
}
// Keep a marginal miss visible even when the displayed numbers round to the same value.
function compared(value, limit) {
  if (value !== limit && num(value) === num(limit)) return (value > limit ? '> ' : '< ') + num(limit);
  return num(value);
}

function failureReport(level, s, resets = []) {
  const l = O.Routes.view(level, s), rules = l.rules || {}, P = O.Physics;
  function report(title, event, advice, facts = []) {
    return {title, event: event + ' · ' + num(s.t) + ' с', advice, facts};
  }
  const station = 'Прибытие на станцию';
  const reason=failureReason(l,s);
  if(missedDock(l,s)&&reason!=='flybys')return report('Капсула и док разминулись','Конец полёта',
    P.receptionWindows(l).length?'Подведи траекторию к отмеченному участку орбиты. Затем подбери время старта по прогнозу подлёта.':
      rules.maxDockSpeed?'Подбери момент старта так, чтобы после облёта капсула вышла вслед за станцией по ходу её движения.':
        'Измени время старта. Следи, чтобы прогноз положения дока совпал с траекторией капсулы.',
    [['Старт через',num(l.launchDelay),'с']]);
  switch (reason) {
    case 'fuel': {
      const limit = rules.maxLaunchSpeed;
      return report('Слишком высокая скорость старта', station,
        `Снизь скорость запуска хотя бы на ${num(s.launchSpeed - limit)} ед./с. Станция проверяет её при стыковке.`,
        [['На старте', num(s.launchSpeed), 'ед./с'], ['Лимит контракта', num(limit), 'ед./с']]);
    }
    case 'overspeed':
      return report('Слишком быстрый заход', station,
        l.launchTiming?'Сверь направление траектории со стрелкой у прогнозной метки. Скорректируй курс или время старта, чтобы догнать станцию по ходу её движения.':
          'Подбери более пологий заход или снизь стартовую скорость. При стыковке важна скорость капсулы относительно станции.',
        [['Относительно станции', compared(s.dockSpeed ?? P.dockVelocity(s, l).speed, rules.maxDockSpeed), 'ед./с'], ['Допустимо до', num(rules.maxDockSpeed), 'ед./с']]);
    case 'window': {
      const {windows,time,index}=P.receptionAt(l,s.t);
      const slot=index<0?windows.length-1:index;
      const [opens,closes]=windows[slot];
      const facts=[[l.launchTiming?'По часам сектора':'Прибытие',compared(time,index<0?closes:opens),'с'],
        [windows.length>1?O.FlightObjectives.receptionLabel(slot):'Окно приёма',num(opens)+'–'+num(closes),'с']];
      if(index>0)return report('Подлёт между окнами','Время полёта до шлюза',
        'Шлюз закрыт между двумя окнами. Сверь прогноз с расписанием и подстрой курс и время старта.',facts);
      const early=index===0;
      if(l.launchTiming)return report(early?'Шлюз ещё закрыт':'Приём уже завершён','Время полёта до шлюза',
        early?'Выбери более поздний старт и проверь прогноз. Светлая дуга показывает, где док принимает груз.':
          'Выбери более ранний старт и проверь прогноз. Светлая дуга показывает, где док принимает груз.',facts);
      return report(early ? 'Станция ещё не открылась' : 'Окно приёма закрылось', station,
        early ? 'Удлини дугу подлёта, чтобы прибыть после открытия окна.' : 'Сократи дугу подлёта, чтобы успеть до закрытия окна.',facts);
    }
    case 'manifest': {
      const count = O.Routes.collected(level, s), required = Math.max(rules.minCargo || 0, l.minCargo || 0);
      return report('Не хватает груза', station,
        l.activeBranch ? `Проложи курс через контейнеры ветви ${l.activeBranch} до подлёта к станции.` : 'Проведи капсулу ближе к контейнерам до подлёта к станции. Груз засчитывается, когда он на борту.',
        [['На борту по маршруту', count], ['Требуется', required]]);
    }
    case 'gates':
      return report('Пропущено контрольное кольцо', station, `Пройди кольцо № ${s.gateIndex + 1} по порядку, прежде чем лететь к станции.`,
        [['Пройдено колец', s.gateIndex], ['Всего на маршруте', l.gates.length]]);
    case 'portals':
      return report('Пропущен переход', station, `Направь капсулу в тёмный вход портала ${l.portalOrder[s.portalIndex]}. Светлое кольцо отмечает выход.`,
        [['Пройдено переходов', s.portalIndex], ['Всего на маршруте', l.portalOrder.length]]);
    case 'flybys': {
      const leg = l.flybys[s.flybyIndex], name = l.planets[leg.planet].name;
      const reset = resets.findLast(r => r.leg === s.flybyIndex && r.branch === l.activeBranch);
      const sweep = Math.floor(P.deg(s.flybyAngle));
      const facts = !sweep && reset ? [['Дуга перед сбросом', Math.floor(reset.degrees), '°'], ['Требуется', leg.degrees, '°']] :
        [['Набранная дуга', sweep, '°'], ['Требуется', leg.degrees, '°']];
      return report('Не завершён облёт', s.reason==='flybys'?station:'Конец полёта',
        `Удержи капсулу в зоне планеты «${name}» ${leg.direction > 0 ? 'по часовой стрелке' : 'против часовой стрелки'} до конца дуги.`, facts);
    }
    case 'branch':
      return report('Ветвь маршрута не выбрана', station, 'Пройди через первый входной портал одной из ветвей, затем следуй её маршруту.');
    case 'deliveries': {
      const stop = l.stops[s.dropIndex];
      return report('Пропущен получатель', station, `Сначала доставь посылку по адресу «${stop.name || stop.id}».`,
        [['Обслужено адресов', s.dropIndex], ['Всего на маршруте', l.stops.length]]);
    }
    case 'drop-speed': {
      const stop = l.stops[s.dropIndex], at = P.bodyAt(stop, s.t);
      const relative = Math.hypot(s.vx - (at.vx || 0), s.vy - (at.vy || 0));
      return report('Слишком быстрая передача груза', 'У получателя «' + (stop.name || stop.id) + '»',
        'Измени курс так, чтобы сблизиться с получателем на меньшей скорости.',
        [['Скорость сближения', compared(relative, stop.maxSpeed), 'ед./с'], ['Допустимо до', num(stop.maxSpeed), 'ед./с']]);
    }
    case 'planet': {
      const body = l.planets.map(p => P.bodyAt(p, s.t)).find(p => Math.hypot(s.x - p.x, s.y - p.y) <= p.r + P.SHIP_RADIUS + .01);
      return report('Столкновение с планетой', 'Удар',
        'Смести угол запуска, чтобы дуга огибала поверхность с большим запасом.',
        body?.name ? [['Планета', body.name], ['Угол запуска', num(s.launchAngle), '°']] : []);
    }
    case 'asteroid': return report('На пути оказался астероид', 'Удар', 'Смести угол запуска так, чтобы траектория прошла в стороне от астероида.');
    case 'wreck': return report('Столкновение с обломком станции', 'Удар', 'Измени угол запуска и проведи капсулу вокруг обломка.');
    case 'ice-debris': return report('Столкновение с ледяной грядой', 'Удар', 'Обогни край ледяной гряды. Проверь на записи, с какой стороны капсула подошла к преграде.');
    case 'boundary': return report('Капсула вышла за край карты', 'Выход за границу', 'Посмотри на последний изгиб траектории и поверни стартовый курс к внутренней части карты.');
    case 'timeout': {
      const target = P.bodyAt(l.target, s.t);
      return report('Время рейса истекло', 'Конец полёта', 'Попробуй более короткую дугу к станции. Долгий оборот вокруг планеты расходует время рейса.',
        [['Лимит рейса', num(l.timeLimit || 24), 'с'], ['До центра станции', num(Math.hypot(s.x - target.x, s.y - target.y)), 'ед.']]);
    }
    case 'portal-loop': return report('Капсула зациклилась в порталах', 'Остановка полёта', 'Измени угол входа в первый портал, чтобы выйти из цепочки переходов.');
    case 'numeric': return report('Расчёт полёта прерван', 'Остановка расчёта', 'Запусти рейс ещё раз. Если остановка повторится, сохрани угол и скорость для проверки.');
    default: return report('Полёт прерван', 'Конец полёта', 'Открой запись и проверь последний участок траектории.');
  }
}
function diagnosis(l,s){
  if(!s || s.status==='flying')return '';
  if(s.status!=='won'){const r=failureReport(l,s,active?.data.resets);return r.title+'. '+r.event+'. '+r.advice;}
  if(l.placement)return 'Гравитационная трасса пройдена: '+s.gateIndex+' контрольных кольца, груз '+s.cargo.length+' / '+l.cargo.length+'.';
  return `${s.branchId?'Ветвь '+s.branchId+'. ':''}Доставка: ${s.flybyIndex} облётов, ${s.portalIndex} переходов${l.stops?.length?', '+s.dropIndex+' промежуточных адреса':''}.`;
}
O.Review={start,observe,finish,prior,clearView,currentFrame,selectTime,setCompare,renderModel,diagnosis,failureReport,get active(){return active;}};
})(typeof globalThis!=='undefined'?globalThis:window);
