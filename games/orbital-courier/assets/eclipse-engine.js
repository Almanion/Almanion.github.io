/* Eclipse's deterministic tactical simulation. Independent of campaign saves. */
(function (root) {
  'use strict';
  const DT = 1 / 120, W = 1100, H = 660;
  const MOON = Object.freeze({ x: 410, y: 350, r: 94, mu: 350000 });
  const FORT = Object.freeze({ x: 870, y: 325, r: 60 });
  const NODE = Object.freeze({ x: 650, y: 185, r: 35 });
  const EXIT = Object.freeze({ x: 125, y: 135, r: 48 });
  const TACTICS = Object.freeze(['breach', 'rebound', 'escort']);
  const OPERATIONS = Object.freeze([
    { id: 'eclipse', name: 'Затмение', tag: 'ПРОРЫВ', description: 'Тень луны, три способа открыть крепость и отход под прикрытием флота.', detail: 'Перехвати золотой ретранслятор на заходе: он заглушит один залп крепости.', signal: { x: 470, y: 170, r: 24 }, titles: ['За тенью луны', 'Открыть крепость', 'Живым из огня'] },
    { id: 'rift', name: 'Разлом', tag: 'ОБЛОМКИ КОЛЬЦА', description: 'Узкие проходы между секциями разрушенного кольца. Точность курса важнее мощности.', detail: 'Обломки кольца опасны на всех этапах. На заходе и при отходе секции движутся: задержка старта меняет момент встречи.', signal: { x: 470, y: 175, r: 21 }, titles: ['Мёртвое кольцо', 'Трещина в броне', 'Между обломками'] },
    { id: 'pulsar', name: 'Пульсар', tag: 'ОКНА В ШТОРМЕ', description: 'Ионный фронт перекрывает курс. Выбери окно старта или пройди разряд под щитом.', detail: 'Разряд длится 2,25 с, затем безопасное окно — 3,55 с. Задержка старта сдвигает момент пересечения; щит выдерживает один разряд.', signal: { x: 470, y: 170, r: 24 }, titles: ['В ритме бури', 'Сердце шторма', 'Последний просвет'] },
    { id:'binary', name:'Близнецы', tag:'ДВОЙНАЯ ГРАВИТАЦИЯ', description:'Два спутника меняют траекторию. Проведи корабль через навигационный коридор и ударь с нижней орбиты.', detail:'Перед захватом узла пройди навигационную метку. Второй спутник притягивает корабль на всех этапах: привычный импульс здесь не подходит.', signal:{x:470,y:490,r:24}, titles:['Между двух миров','Нижняя орбита','Обратный прилив'] },
    { id:'ark', name:'Ковчег', tag:'ЭВАКУАЦИЯ ВЕРФИ', description:'Забери эвакуационную капсулу у запертой верфи, открой выход и выведи её сквозь движущиеся створки.', detail:'На заходе сначала перехвати эвакуационную капсулу. Створки верфи перемещаются: выбери курс через открытый проём и момент старта.', signal:{x:460,y:160,r:22}, titles:['Забрать последних','Снять блокаду','Вывести Ковчег'] }
  ]);
  const SCENES = Object.freeze({
    eclipse: { moon: MOON, fort: FORT, node: NODE, exit: EXIT, start: {x:120,y:505}, reboundStart:{x:795,y:325}, theme:'eclipse' },
    binary: { moon:{x:410,y:310,r:82,mu:310000}, companion:{x:630,y:105,r:48,mu:90000}, fort:{x:870,y:355,r:60}, node:{x:650,y:475,r:35}, exit:{x:125,y:525,r:48}, start:{x:120,y:155}, reboundStart:{x:795,y:355}, theme:'binary' },
    ark: { moon:{x:360,y:365,r:72,mu:280000}, fort:{x:875,y:280,r:60}, node:{x:610,y:155,r:32}, exit:{x:170,y:85,r:42}, start:{x:110,y:510}, reboundStart:{x:800,y:280}, theme:'ark' }
  });
  for (const layout of Object.values(SCENES)) {
    for (const value of Object.values(layout)) if (value && typeof value === 'object') Object.freeze(value);
    Object.freeze(layout);
  }
  function scene(value) { const id=typeof value==='string'?value:value&&value.operation; return SCENES[id] || SCENES.eclipse; }
  const operation = id => OPERATIONS.find(x => x.id === id) || OPERATIONS[0];
  function wreckageAt(s, t = s.t) {
    if (s.operation !== 'rift') return [];
    if (s.phase === 0) return [{x:340,y:155,r:25},{x:510,y:270,r:28},{x:585,y:105,r:24},{x:555,y:150+Math.sin(t*.65-2.8)*55,r:18}];
    if (s.phase === 1) return [{x:950,y:145,r:24},{x:795,y:490,r:26},{x:750,y:245,r:20}];
    return [{x:500+Math.sin(t*.35)*18,y:95+t*5,r:21},{x:760-t*8,y:180,r:24},{x:270+t*7,y:435,r:27}];
  }
  function stormAt(s, t = s.t) {
    if (s.operation !== 'pulsar') return null;
    const cycle = ((t % 5.8) + 5.8) % 5.8, active = cycle < 2.25;
    return { x: s.phase === 0 ? 545 : s.phase === 1 ? 750 : 550, top: 45, bottom: 615, r: 12, active, warning: cycle > 5.2, remaining: active ? 2.25 - cycle : 5.8 - cycle };
  }
  function hazardsAt(s,t=s.t) {
    if(s.operation!=='ark'||s.phase===1)return [];
    const x=s.phase===0?510:470, center=s.phase===0?205+Math.sin(t*.55)*38:165+Math.sin(t*.5+1)*52, gap=s.phase===0?65:100;
    const top=45,bottom=615,low=center-gap,high=center+gap;
    // An open edge has no physical section: a zero-height rectangle would still
    // acquire a collision radius and leave an invisible obstacle in the opening.
    return [[top,Math.min(bottom,low)],[Math.max(top,high),bottom]]
      .filter(([from,to])=>to>from)
      .map(([from,to])=>({type:'gate',x,y:(from+to)/2,halfWidth:10,halfHeight:(to-from)/2,open:false}));
  }
  function checkpoints(s) {
    const points=s.operation==='binary'?[{id:'nav',x:470,y:490,r:40,label:'Навигационная метка',required:true}]:s.operation==='ark'?[{id:'capsule',x:460,y:160,r:38,label:'Эвакуационная капсула',required:true}]:[];
    return s.phase===0?points.map(p=>({...p,done:!!s.objectiveHits[p.id]})):[];
  }
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const number = (n, fallback, a, b) => Number.isFinite(n) ? clamp(n, a, b) : fallback;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function defaults(phase, tactic = 'breach', scenario = 'eclipse') {
    if (scenario === 'binary' || scenario === 'ark') return {...defaults(phase,tactic),...hint(phase,tactic,scenario)};
    if (phase === 0) return { angle: -42, speed: 105, ax: 760, ay: 410 };
    if (phase === 2) return { angle: -165, speed: 120, ax: 760, ay: 410 };
    return tactic === 'rebound' ? { angle: 180, speed: 130, ax: 650, ay: 410 } :
      tactic === 'escort' ? { angle: 60, speed: 80, ax: 800, ay: 440 } :
        { angle: -8, speed: 100, ax: 820, ay: 430 };
  }
  function cleanPlan(raw, phase, tactic, scenario = 'eclipse') {
    const d = defaults(phase, tactic, scenario); raw = raw || {};
    return { angle: number(raw.angle, d.angle, -180, 180), speed: number(raw.speed, d.speed, 55, 170),
      ax: number(raw.ax, d.ax, 540, 1000), ay: number(raw.ay, d.ay, 65, 570), delay: number(raw.delay, 0, 0, 4) };
  }
  function segmentDistance(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const u = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(p.x - a.x - dx * u, p.y - a.y - dy * u);
  }
  function covered(p, value=p) { const {moon,fort,companion}=scene(value);return [moon,companion].filter(Boolean).some(body=>segmentDistance(body,fort,p)<body.r+4&&distance(p,fort)>distance(body,fort)); }
  function allyAt(t,value) {
    const u = clamp(t / 9, 0, 1), v = 1 - u;
    const id=typeof value==='string'?value:value&&value.operation;const original={x:v*v*650+2*v*u*615+u*u*985,y:v*v*215+2*v*u*650+u*u*415}; if(id==='binary')return {x:original.x,y:660-original.y+30};if(id==='ark')return {x:original.x-40,y:original.y-30};return original;
  }
  function debrisAt(t,value) {
    const id=typeof value==='string'?value:value&&value.operation; if(id==='binary')return [{x:570-t*6,y:95+t*7,r:23},{x:740-t*5,y:540-t*10,r:22}];if(id==='ark')return [{x:390+t*5,y:90+t*9,r:22},{x:770-t*9,y:495,r:24}];
    return [{ x: 590 + Math.sin(t * .34) * 24, y: 115 + t * 11, r: 25 },
      { x: 700 - t * 12, y: 430 + Math.cos(t * .3) * 25, r: 31 },
      { x: 290 + t * 9, y: 165 + Math.sin(t * .5) * 32, r: 20 }];
  }
  function create(phase = 0, tactic = 'breach', raw, carry = {}, scenario = 'eclipse') {
    phase = Number.isInteger(phase) ? clamp(phase, 0, 2) : 0;
    tactic = TACTICS.includes(tactic) ? tactic : 'breach';
    const plan = cleanPlan(raw, phase, tactic, scenario), layout=scene(scenario);
    const start = phase === 0 ? { ...layout.start } : phase === 1 ?
      tactic === 'rebound' ? {...layout.reboundStart} : { x: layout.node.x, y: layout.node.y } :
      { x: number(carry.x, 960, 15, W - 15), y: number(carry.y, 210, 20, H - 20) };
    const angle = plan.angle * Math.PI / 180;
    return { phase, tactic, plan, operation: operation(scenario).id, t: 0, flightT: 0, ticks: 0, x: start.x, y: start.y,
      vx: Math.cos(angle) * plan.speed, vy: Math.sin(angle) * plan.speed,
      hull: 3, fleet: number(carry.fleet, 6, 1, 6), allyHull: 2, coverCount: 0,
      shield: 0, shieldUsed: false, boostUsed:false, brakeUsed:false, objectiveHits:{}, charge: 0, closest: Infinity, status: 'running', reason: '',
      events: [], shots: 0, signal: false, jam: Math.round(number(carry.jam, 0, 0, 1)), stormContact: false, minX: start.x, path: [{ ...start, t: 0 }], start, finish: null };
  }
  function gravity(s, x, y) {
    let ax = 0, ay = 0;
    const layout=scene(s),bodies=[layout.moon];if(layout.companion)bodies.push(layout.companion);
    if (s.phase === 1) bodies.push({ x: s.plan.ax, y: s.plan.ay, mu: s.tactic === 'rebound' ? 750000 : 140000 });
    for (const body of bodies) {
      const dx = body.x - x, dy = body.y - y, r2 = dx * dx + dy * dy + 38 * 38;
      const f = body.mu / Math.pow(r2, 1.5); ax += dx * f; ay += dy * f;
    }
    return { x: ax, y: ay };
  }
  function event(s, type, text, position = s) { s.events.push({ type, text, t: s.t, x: position.x, y: position.y }); }
  function end(s, status, reason) {
    if (s.status !== 'running') return;
    s.status = status; s.reason = reason;
    s.finish = { x: s.x, y: s.y, t: s.t };
    event(s, status, reason);
  }
  function shield(s) {
    if (s.status !== 'running' || s.shieldUsed || s.tactic === 'rebound' && s.phase === 1) return false;
    s.shieldUsed = true; s.shield = 2; event(s, 'shield', 'Защитное поле включено'); return true;
  }
  function canManeuver(s,kind) { return (kind==='boost'||kind==='brake')&&s.status==='running'&&s.t>s.plan.delay+1e-8&&!(s.phase===1&&s.tactic==='rebound')&&!s[kind+'Used']; }
  function maneuver(s,kind) { if(!canManeuver(s,kind))return false;const factor=kind==='boost'?1.18:.75;s.vx*=factor;s.vy*=factor;s[kind+'Used']=true;event(s,kind,kind==='boost'?'Маневровый разгон':'Тормозной импульс');return true; }
  function segmentRect(a,b,rect) { let enter=0,leave=1;for(const axis of ['x','y']) {const half=axis==='x'?rect.halfWidth:rect.halfHeight,d=b[axis]-a[axis],low=rect[axis]-half-6,high=rect[axis]+half+6;if(Math.abs(d)<1e-10){if(a[axis]<low||a[axis]>high)return false;}else{let t0=(low-a[axis])/d,t1=(high-a[axis])/d;if(t0>t1)[t0,t1]=[t1,t0];enter=Math.max(enter,t0);leave=Math.min(leave,t1);if(enter>leave)return false;}}return leave>=0&&enter<=1; }
  function step(s, dt = DT) {
    if (s.status !== 'running') return s;
    const {moon,fort,node,exit,companion}=scene(s);
    if (s.phase === 1 && !validAnchor(s.plan,s)) { end(s, 'lost', 'Якорь слишком близко к луне или крепости. Перемести его за красную границу.'); return s; }
    const old = { x: s.x, y: s.y }, before = s.t;
    s.ticks++; s.t = s.ticks * dt; s.shield = Math.max(0, s.shield - dt);
    s.flightT = Math.max(0, s.t - s.plan.delay);
    if (s.t <= s.plan.delay + 1e-8) return s;
    const a = gravity(s, s.x, s.y);
    s.x += s.vx * dt + .5 * a.x * dt * dt; s.y += s.vy * dt + .5 * a.y * dt * dt;
    const b = gravity(s, s.x, s.y); s.vx += .5 * (a.x + b.x) * dt; s.vy += .5 * (a.y + b.y) * dt;
    s.minX = Math.min(s.minX, s.x);
    if (s.ticks % 6 === 0) s.path.push({ x: s.x, y: s.y, t: s.t });
    for (const rock of wreckageAt(s)) if (segmentDistance(rock, old, s) < rock.r + 6) { end(s, 'lost', 'Удар о секцию кольца. Обойди её край; при отходе попробуй другое окно старта.'); return s; }
    for(const gate of hazardsAt(s))if(segmentRect(old,s,gate)){end(s,'lost','Столкновение со створкой верфи. Проведи курс через открытый проём или измени момент старта.');return s;}
    for(const point of checkpoints(s))if(!point.done&&segmentDistance(point,old,s)<point.r){s.objectiveHits[point.id]=true;event(s,'objective',point.id==='capsule'?'Эвакуационная капсула принята на борт. Теперь захвати узел.':'Навигационная метка пройдена. Коридор подтверждён.',point);}
    const storm = stormAt(s), inStorm = storm && Math.min(old.x, s.x) < storm.x + storm.r + 5 && Math.max(old.x, s.x) > storm.x - storm.r - 5 && s.y > storm.top && s.y < storm.bottom;
    if (inStorm && storm.active && !s.stormContact) {
      if (s.shield > 0) { event(s, 'blocked', 'Щит поглотил ионный разряд'); s.stormContact = true; }
      else { event(s, 'storm-hit', 'Ионный разряд'); end(s, 'lost', 'Курс пересёк активный разряд. Измени задержку старта или включи щит перед фронтом.'); return s; }
    }
    if (!inStorm) s.stormContact = false;
    if (s.phase === 0 && !s.signal && segmentDistance(operation(s.operation).signal, old, s) < operation(s.operation).signal.r) { s.signal = true; s.jam = 1; event(s, 'signal', 'Ретранслятор захвачен. Один залп крепости будет заглушён.'); }
    if (segmentDistance(moon, old, s) < moon.r + 6 || companion && segmentDistance(companion,old,s)<companion.r+6) { end(s, 'lost', 'Столкновение с луной. Проведи курс выше или ниже её края.'); return s; }
    const fortDistance = segmentDistance(fort, old, s);
    if (s.phase === 1 && s.tactic === 'rebound' && s.minX < fort.x-190 && s.flightT > 2 && fortDistance < fort.r + 12 && s.vx > 0) {
      end(s, 'won', 'Залп возвращён в реактор. Щит крепости отключён.'); return s;
    }
    if (fortDistance < fort.r + 6) { end(s, 'lost', s.tactic === 'rebound' ? 'Залп попал в броню. Верни его к крепости с обратного курса.' : 'Столкновение с крепостью. Оставь место для облёта.'); return s; }
    if (s.phase === 0) {
      s.closest = Math.min(s.closest, distance(s, node));
      if(segmentDistance(node,old,s)<node.r){if(checkpoints(s).some(p=>p.required&&!p.done))end(s,'lost',s.operation==='ark'?'Капсула осталась у верфи. Сначала перехвати её, затем захвати узел.':'Навигационная метка пропущена. Пройди отмеченный коридор перед узлом.');else end(s,'won','Гравитационный узел захвачен. Доступ к полю открыт.');}
    } else if (s.phase === 1 && s.tactic === 'breach') {
      const range = distance(s, fort), exposed = s.x > fort.x + 55 && range < 205;
      s.charge = clamp(s.charge + (exposed ? dt : -dt * .25), 0, .8);
      if (exposed && Math.floor(before * 7) !== Math.floor(s.t * 7)) event(s, 'fire', 'Огонь по генератору');
      if (s.charge >= .8) end(s, 'won', 'Генератор уничтожен с тыла. Коридор для флота открыт.');
    } else if (s.phase === 1 && s.tactic === 'escort') {
      for (const at of [8.15, 8.4, 8.65]) if (before < at + s.plan.delay && s.t + 1e-8 >= at + s.plan.delay) event(s, 'torpedo', 'Бомбардировщик выпускает торпеды', allyAt(at,s));
      for (const at of [4.5, 7.5]) if (before < at + s.plan.delay && s.t + 1e-8 >= at + s.plan.delay) {
        const protectedAlly = distance(s, allyAt(at,s)) <= 145;
        if (protectedAlly) { s.coverCount++; event(s, 'protect', 'Бомбардировщик прикрыт', allyAt(at,s)); }
        else { s.allyHull--; event(s, 'ally-hit', 'Бомбардировщик под огнём', allyAt(at,s)); }
      }
      if (s.allyHull <= 0) end(s, 'lost', 'Бомбардировщик потерян. Будь в радиусе 145 м от него во время залпа на 4,5 или 7,5 с.');
      else if ((s.operation === 'binary' || s.operation === 'ark') && s.flightT >= 9 && s.coverCount < 2) end(s, 'lost', 'Бомбардировщик не завершил боевой заход. В этой операции прикрой оба залпа: на 4,5 и 7,5 с.');
      else if (s.flightT >= 9) end(s, 'won', 'Бомбардировщик уничтожил генератор. Щит крепости отключён.');
    } else if (s.phase === 2) {
      for (const rock of debrisAt(s.t,s)) {
        if (segmentDistance(rock, old, s) < rock.r + 6) { end(s, 'lost', 'Удар обломка. Измени курс или скорость, чтобы разойтись с ним.'); break; }
      }
      s.closest = Math.min(s.closest, distance(s, exit));
      if (s.status === 'running' && segmentDistance(exit, old, s) < exit.r) end(s, 'won', 'Корабль вышел из зоны боя. Флот начинает освобождение мира.');
    }
    if (s.phase < 2 && s.status === 'running') {
      const salvo = Math.floor((s.t + 1e-8) / 5);
      if (salvo > s.shots) {
        s.shots = salvo;
        const jammed = s.jam > 0;
        if (jammed) { s.jam--; event(s, 'jammed', 'Ретранслятор сорвал вражеский залп. Флот сохранён.', fort); }
        else { s.fleet--; event(s, 'salvo', 'Крепость открывает огонь'); }
        const direction = Math.atan2(s.y - fort.y, s.x - fort.x);
        if (!jammed && !(s.phase === 1 && s.tactic === 'rebound') && !covered(s,s) && Math.abs(direction) > 2.4) {
          if (s.shield > 0) event(s, 'blocked', 'Залп поглощён щитом');
          else { s.hull--; event(s, 'hit', 'Попадание по корпусу'); }
        }
      }
      if (s.hull <= 0) end(s, 'lost', 'Корабль потерян. Используй тень луны или щит перед залпом.');
      if (s.fleet <= 0) end(s, 'lost', 'Флот отступил. Более быстрый манёвр оставит союзникам время.');
    }
    if (s.status === 'running' && (s.x < 15 || s.x > W - 15 || s.y < 20 || s.y > H - 20)) end(s, 'lost', 'Курс выходит из зоны операции. Скорректируй направление или импульс.');
    if (s.status === 'running' && s.t >= 24) end(s, 'lost', 'Манёвр затянулся. Увеличь импульс или выбери более прямой курс.');
    return s;
  }
  function simulate(phase, tactic, plan, carry, scenario = 'eclipse') {
    const s = create(phase, tactic, plan, carry, scenario);
    while (s.status === 'running') step(s);
    return s;
  }
  // Reusing the live integrator keeps emergency burns and their prediction identical.
  function project(source) {
    const clone = value => Array.isArray(value) ? value.map(clone) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key,item]) => [key,clone(item)])) : value;
    const s=clone(source);
    while(s.status==='running')step(s);
    return s;
  }
  const REFERENCES = Object.freeze({
    eclipse:{approach:{angle:-51,speed:85},bonus:{angle:-56.5,speed:70},attack:{breach:{angle:10,speed:145,ax:805,ay:195},rebound:{angle:165,speed:65,ax:735,ay:335},escort:{angle:45,speed:65,ax:560,ay:90}},exit:{breach:{angle:-166,speed:85},rebound:{angle:-174,speed:170},escort:{angle:-144,speed:120}}},
    rift:{approach:{angle:-54,speed:77.5},bonus:{angle:-55,speed:75},attack:{breach:{angle:10,speed:145,ax:805,ay:195},rebound:{angle:165,speed:65,ax:735,ay:335},escort:{angle:45,speed:65,ax:560,ay:90}},exit:{breach:{angle:-162,speed:65},rebound:{angle:-174,speed:170},escort:{angle:-144,speed:120}}},
    pulsar:{approach:{angle:-50.5,speed:90},bonus:{angle:-58.5,speed:65,delay:1},attack:{breach:{angle:10,speed:145,ax:805,ay:195,delay:2},rebound:{angle:165,speed:65,ax:735,ay:335,delay:2},escort:{angle:45,speed:65,ax:560,ay:90,delay:.5}},exit:{breach:{angle:-166,speed:95,delay:.5},rebound:{angle:-162,speed:65,delay:1},escort:{angle:-144,speed:120}}},
    binary:{approach:{angle:51,speed:85},bonus:{angle:57,speed:67.5},attack:{breach:{angle:-10,speed:145,ax:805,ay:465},rebound:{angle:-157.5,speed:85,ax:750,ay:340},escort:{angle:-45,speed:65,ax:560,ay:570}},exit:{breach:{angle:172,speed:170},rebound:{angle:172,speed:170},escort:{angle:139,speed:135}}},
    ark:{approach:{angle:-55,speed:85},bonus:{angle:-60,speed:70},attack:{breach:{angle:5,speed:165,ax:795,ay:180},rebound:{angle:160,speed:80,ax:755,ay:290},escort:{angle:35,speed:75,ax:580,ay:165}},exit:{breach:{angle:-169,speed:135},rebound:{angle:-173,speed:170},escort:{angle:-145,speed:170}}}
  });
  function hint(phase,tactic='breach',scenario='eclipse') {
    const refs=REFERENCES[operation(scenario).id], key=TACTICS.includes(tactic)?tactic:'breach';
    return {...(phase===0?refs.approach:phase===2?refs.exit[key]:refs.attack[key])};
  }
  function validAnchor(p,value) { const a={x:p.ax,y:p.ay},{moon,fort,companion}=scene(value);return distance(a,fort)>=118&&distance(a,moon)>=moon.r+45&&(!companion||distance(a,companion)>=companion.r+35); }
  const api = { DT, W, H, MOON, FORT, NODE, EXIT, TACTICS, OPERATIONS, REFERENCES, operation, scene, checkpoints, hazardsAt, canManeuver, maneuver, project, hint, wreckageAt, stormAt, clamp, distance, defaults, cleanPlan, create, step, simulate, shield, covered, allyAt, debrisAt, segmentDistance, validAnchor };
  root.EclipseEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
