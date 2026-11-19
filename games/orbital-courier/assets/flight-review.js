/* Only history actually flown. No future simulation, reward or permanent storage. */
(function(root){'use strict';const O=root.Orbital;let recording=null,active=null;const memory=new Map(),key=()=>O.App.currentId+':'+O.App.profile.difficulty;
function snapshot(s){return {...s,cargo:s.cargo.slice(),teleports:[],cargoBodies:s.cargoBodies.map(c=>({...c,trail:[]})),branchProgress:structuredClone(s.branchProgress||{}),dropEvents:(s.dropEvents||[]).map(x=>({...x}))};}
function start(s){active=null;recording={key:key(),angle:s.launchAngle,speed:s.launchSpeed,frames:[snapshot(s)],resets:[]};}
function observe(a,b,l){if(!recording)return;if(a.flybyAngle>0&&b.flybyAngle===0&&a.flybyIndex===b.flybyIndex){const v=O.Routes.view(l,a),leg=v.flybys?.[a.flybyIndex];if(leg)recording.resets.push({t:b.t,leg:a.flybyIndex,branch:v.activeBranch,degrees:O.Physics.deg(a.flybyAngle)});}if(recording.frames.length<2400&&(b.t-recording.frames.at(-1).t>=.05||b.status!=='flying'))recording.frames.push(snapshot(b));}
function finish(s,points,level){const d=recording||{key:key(),angle:s.launchAngle,speed:s.launchSpeed,frames:[],resets:[]};d.final=snapshot(s);if(d.frames.at(-1)?.t===s.t)d.frames[d.frames.length-1]=d.final;else d.frames.push(d.final);d.points=points.map(p=>({...p}));d.level=level;const prev=memory.get(key())||[];memory.delete(key());memory.set(key(),[...prev,d].slice(-2));while(memory.size>4)memory.delete(memory.keys().next().value);recording=null;active={data:d,index:d.frames.length-1,compare:false};}
function prior(){return active?(memory.get(active.data.key)||[]).at(-2):null;}function clearView(){active=null;recording=null;}function selectTime(t){if(!active)return;let a=0,b=active.data.frames.length-1;while(a<b){let m=Math.ceil((a+b)/2);if(active.data.frames[m].t<=t)a=m;else b=m-1;}active.index=a;}function setCompare(){if(active)active.compare=!active.compare;}
function renderModel(){if(!active)return null;const s=active.data.frames[active.index];return{state:s,trail:active.data.points.filter(p=>(p.t||0)<=s.t),ghost:active.compare?prior()?.points:null};}
const decimal = new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 2});
const num = value => decimal.format(value);
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
  switch (s.reason) {
    case 'fuel': {
      const limit = rules.maxLaunchSpeed;
      return report('Слишком высокая скорость старта', station,
        `Снизь скорость запуска хотя бы на ${num(s.launchSpeed - limit)} ед./с. Станция проверяет её при стыковке.`,
        [['На старте', num(s.launchSpeed), 'ед./с'], ['Лимит контракта', num(limit), 'ед./с']]);
    }
    case 'overspeed':
      return report('Слишком быстрый заход', station,
        'Подбери более пологий заход или снизь стартовую скорость. При стыковке важна скорость капсулы относительно станции.',
        [['Относительно станции', compared(s.dockSpeed ?? P.dockVelocity(s, l).speed, rules.maxDockSpeed), 'ед./с'], ['Допустимо до', num(rules.maxDockSpeed), 'ед./с']]);
    case 'window': {
      const [opens, closes] = rules.window, early = s.t < opens;
      return report(early ? 'Станция ещё не открылась' : 'Окно приёма закрылось', station,
        early ? 'Удлини дугу подлёта, чтобы прибыть после открытия окна.' : 'Сократи дугу подлёта, чтобы успеть до закрытия окна.',
        [['Прибытие', compared(s.t, early ? opens : closes), 'с'], ['Окно приёма', num(opens) + '–' + num(closes), 'с']]);
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
      return report('Не завершён облёт', station,
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
O.Review={start,observe,finish,prior,clearView,selectTime,setCompare,renderModel,diagnosis,failureReport,get active(){return active;}};
})(typeof globalThis!=='undefined'?globalThis:window);
