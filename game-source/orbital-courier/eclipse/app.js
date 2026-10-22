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
  const STORIES = {
    eclipse: { sector: 'ЛУНА ИЛЬ / ОРБИТА 07', mark: '◐', title: 'Открой нам путь.', lead: 'Крепость Собирателей держит захваченный мир. Наш флот под огнём. Перехвати гравитационный узел, открой крепость и вернись из боя.', approach: 'Пройди над луной и захвати узел. Его поле позволит атаковать крепость.', arrival: 'Луна прикроет заход. Найди курс к светящемуся узлу над её краем.', approachIntel: 'Тень луны закрывает корабль от огня. Золотой ретранслятор заглушит один залп и сохранит союзный корабль.', exit: 'Дойди до синего коридора выхода. Луна притягивает корабль, а обломки пересекают маршрут.', hazard: 'Следы обломков показывают их движение. Измени момент старта или скорость, чтобы разойтись с ними.' },
    rift: { sector: 'РАЗРУШЕННОЕ КОЛЬЦО / РАЗЛОМ 03', mark: '◌', title: 'Найди проход.', lead: 'Расколотое орбитальное кольцо окружает крепость. Секции дрейфуют поперёк маршрута. Проведи корабль через разлом и открой союзному флоту коридор.', approach: 'Пройди между секциями кольца и захвати гравитационный узел. Обломки движутся: учитывай время встречи.', arrival: 'Лира: секции кольца дрейфуют. Ищем проход к узлу, затем открываем крепость.', approachIntel: 'Не проходи вплотную к обломкам. Задержка старта меняет положение движущихся секций, а торможение помогает пропустить их вперёд.', exit: 'Выйди к синему коридору через движущиеся секции кольца. Оставь запас для торможения.', hazard: 'Дрейфующие секции могут закрыть вчерашний проход. Сверяй прогноз, момент старта и относительную скорость.' },
    pulsar: { sector: 'ИОННАЯ ДУГА / ПУЛЬСАР 09', mark: 'ϟ', title: 'Поймай тишину.', lead: 'Ионный фронт пульсирует между кораблём и крепостью. В коротком затишье можно прорваться без повреждений; щит оставь для самого опасного пересечения.', approach: 'Захвати узел за ионным фронтом. Выбери безопасное окно старта или включи щит перед разрядом.', arrival: 'Лира: фронт набирает заряд. Сверь время старта с безопасным окном.', approachIntel: 'Фронт чередует разряд и затишье. Ускорение и торможение меняют время пересечения, щит выдерживает один разряд.', exit: 'Пройди ионный фронт и выйди к синему коридору. Следи за следующим безопасным окном.', hazard: 'Пауза позволяет спокойно выбрать момент для щита, разгона или торможения. Использованные системы восстановятся на следующем этапе.' },
    binary: { sector: 'ДВОЙНАЯ СИСТЕМА / РУБЕЖ 12', mark: '◑', title: 'Удержись между мирами.', lead: 'Две луны тянут корабль в разные стороны. Крепость спрятана в их гравитационном узле. Используй оба поля, чтобы выйти к цели, а затем выберись из двойного притяжения.', approach: 'Пройди через двойное гравитационное поле и захвати узел. Следи за обязательными точками маршрута.', arrival: 'Лира: здесь два центра притяжения. Сначала пройди отмеченную точку маршрута, затем забирай узел.', approachIntel: 'Поле второй луны меняет кривизну курса. Разгон помогает выйти из притяжения; торможение даёт полю больше времени развернуть корабль.', exit: 'Выбери курс к синему коридору между двумя гравитационными полями. Избегай поверхностей обеих лун.', hazard: 'Слабый импульс сильнее изгибает маршрут. Разгон и торможение доступны по одному разу: проверяй направление скорости перед включением.' },
    ark: { sector: 'КОВЧЕГ / ОРБИТАЛЬНАЯ ВЕРФЬ', mark: '⬡', title: 'Забери тех, кто остался.', lead: 'Собиратели захватили орбитальную верфь вместе с её экипажем. Подбери эвакуационную капсулу, захвати узел и проведи флот через защиту верфи.', approach: 'Сначала подбери эвакуационную капсулу, затем захвати гравитационный узел. Не задень движущиеся заслоны верфи.', arrival: 'Лира: капсула подаёт сигнал. Сначала забираем людей, затем идём к узлу.', approachIntel: 'Эвакуационная капсула — обязательная цель. Заслоны движутся: выбери окно старта, а во время полёта пропусти опасную секцию торможением.', exit: 'Проведи корабль к синему коридору за пределами верфи. Учитывай движение заслонов и сохрани место для коррекции скорости.', hazard: 'Прогноз учитывает движущиеся заслоны. Подбирай время прохода; корпус не выдержит столкновения с секцией верфи.' }
  };
  Object.assign(STORIES, {
    seam: { sector: 'РАЗОРВАННЫЙ РУКАВ / ШОВ 31', mark: '⫶', title: 'Собери путь из разрывов.', lead: 'После пространственного сдвига три навигационных маяка оказались по разные стороны разрыва. Прямого пути больше нет. Пройди через парные врата и восстанови сеть: каждый новый маяк находится в другой складке пространства.', approach: 'Активируй маяк I перед первым разломом, затем войди в парное кольцо. Корабль выйдет из другой точки с повёрнутым вектором скорости.', approachIntel: 'Каждая пара сохраняет скорость, но поворачивает импульс. Прогноз проходит через все врата: не пытайся соединить маяки прямой линией.', arrival: 'Лира: маяки погасли. Смотри на пары колец: вход здесь, выход — в другой части разрыва.', middleTitle: 'Найди верхнюю складку', middle: 'После перехода восстанови маяк II. Белые риски показывают выходной импульс. Кнопка D меняет ориентацию следующей пары: 0°, +6°, −6°.', exitTitle: 'Замкни пространственную сеть', exit: 'Пройди вторую пару врат и восстанови маяк III в нижней складке. Он завершит сеть. Это один непрерывный полёт: импульс и использованные системы сохраняются.', hazard: 'Разгон и торможение доступны по одному разу на весь полёт. Пауза остановит время и даст проверить новый выход.', resultTitle: 'Сеть снова видит звёзды.', result: 'Три навигационных маяка восстановлены. Спасательные корабли получили безопасную карту пространственного разрыва.', hint: 'Белые риски у портала показывают выходной вектор. Опорный курс проходит цепочку врат без переключения: сначала посмотри весь прогноз. D поворачивает следующую пару и даёт альтернативную траекторию; повторное переключение позволяет вернуть расчёт.' },
    sisyphus: { sector: 'ПОЯС ГЕЛИЯ / КОЛОНИЯ «ДОМ»', mark: '◈', title: 'Сдвинь неизбежное.', lead: 'Крупный астероид идёт к жилой колонии. Оружие расколет его на сотни опасных обломков. Сравняй скорость, захвати камень буксиром и тяни его в сторону от людей — масса груза изменит движение корабля.', approach: 'Сблизься с астероидом на малой относительной скорости. Автосцепка поймает груз; D позволяет зацепить его вручную чуть дальше.', approachIntel: 'Смотри на скорость относительно астероида. После захвата трос передаёт тягу: резкий рывок может растянуть связь. Это тяжёлый груз, не неподвижная точка.', arrival: 'Диспетчер: колония на линии столкновения. Нужен буксир, не удар. Сначала сравняй скорость с камнем.', middleTitle: 'Измени траекторию камня', middle: 'После захвата буксируй астероид к отмеченному безопасному проходу. Торможение меняет натяжение; D отцепляет трос, когда камень уже направлен мимо колонии.', exitTitle: 'Подтверди безопасный пролёт', exit: 'Проведи астероид за контрольный рубеж по безопасной траектории. Людей спасает движение груза: уйти самому недостаточно. Синий коридор для корабля здесь не нужен.', hazard: 'Учитывай массу астероида и его инерцию. Разгон — один на весь полёт; проверь, куда направлен общий импульс до его включения.', resultTitle: '«Дом» останется дома.', result: 'Астероид выведен с линии столкновения и прошёл контрольный рубеж. Колонии больше не грозит удар.', hint: 'Опорный курс выводит корабль на сближение с малой относительной скоростью: автосцепка сработает сама. После захвата следи за тросом и прогнозом астероида. Кнопка D нужна для ручного захвата или отцепки; сначала добейся безопасной траектории груза.' },
    archive: { sector: 'МЁРТВАЯ ТУМАННОСТЬ / АРХИВ 00', mark: '⌁', title: 'Верни то, что скрыли.', lead: 'В заброшенном архиве хранится карта исчезнувших колоний. Охрана всё ещё патрулирует станцию. Пройди через пыль, замедлись у терминала, скачай данные и уйди до того, как тревога замкнёт выход.', approach: 'Проберись к терминалу между конусами патрулей. Пылевые облака скрывают корабль от сканеров.', approachIntel: 'Конусы охраны движутся. Вне укрытия растёт обнаружение. D включает глушитель на 3 секунды и снижает заметность на 92%. Доступно одно включение на весь полёт.', arrival: 'Лира: связь только шёпотом. Карта внутри архива. Пыль нас скроет; свет патруля — выдаст.', middleTitle: 'Скачай карту колоний', middle: 'Останься у терминала на малой скорости. Скачивание идёт автоматически, пока корабль в зоне связи. Торможение помогает задержаться в зоне связи. Если патруль поворачивает к тебе, выбери короткое окно для глушителя D.', exitTitle: 'Унеси карту из тумана', exit: 'Когда загрузка завершена, дойди с данными до теневого шлюза. Работа манёвровых двигателей повышает заметность: лишний импульс может выдать корабль на выходе.', hazard: 'Достигнутая точка ещё не означает успех. Следи за процентом загрузки и обнаружением; пауза даёт время включить глушитель до пересечения конуса.', resultTitle: 'Архив больше не молчит.', result: 'Карта исчезнувших колоний скопирована и доставлена за пределы патрульной зоны. Теперь у поисковой группы есть координаты.', hint: 'Опорный курс проходит через пылевое укрытие и область терминала. Скачивание требует 2,2 секунды в круге терминала при скорости до 90 м/с: слабый импульс или торможение помогут остаться в зоне. Глушитель D скрывает корабль на 3 секунды и доступен один раз. После загрузки нужен теневой шлюз. Прогноз учитывает движение охраны и обнаружение.' }
  });
  const story = () => STORIES[operationId] || STORIES.eclipse;
  const expedition = () => E.isExpedition ? E.isExpedition(operationId) : E.operation(operationId).kind === 'expedition';
  const phaseCount = () => E.phaseCount ? E.phaseCount(operationId) : expedition() ? 1 : 3;
  const finalPhase = () => phase === phaseCount() - 1;
  const mission = () => expedition() && E.missionInfo ? E.missionInfo(state) : null;
  const resultKey = () => expedition() ? 'mission' : tactic;
  const finalRecord = () => ({ x: state.x, y: state.y, t: state.t, ...(expedition() && E.missionSnapshot ? { mission: E.missionSnapshot(state) } : {}) });
  const scene = () => E.scene ? E.scene(state) : { node: E.NODE, exit: E.EXIT };
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
  let phase = Number.isInteger(saved.phase) && saved.phase >= 0 && saved.phase < phaseCount() ? saved.phase : 0, tactic = E.TACTICS.includes(saved.tactic) ? saved.tactic : 'breach';
  let carry = phase ? cleanCarry(saved.carry) : { fleet: 6 };
  const cleanCompleted = list => Array.isArray(list) ? list.slice(0, 3).filter(x => x && [0, 1, 2].includes(x.phase)).map(x => ({ phase: x.phase, time: finite(x.time, 0, 0, 120), hull: finite(x.hull, 3, 0, 3), fleet: finite(x.fleet, 6, 0, 6), ally: finite(x.ally, 2, 0, 2), signal: x.signal === true, boost: x.boost === true, brake: x.brake === true })) : [];
  let completed = cleanCompleted(saved.completed);
  let attempts = Math.round(finite(saved.attempts, 0, 0, 99999)), hints = Math.round(finite(saved.hints, 0, 0, 99999)), plans = {}, best = {};
  for (const t of [...E.TACTICS, 'mission']) {
    if (saved.best?.[t] && Number.isFinite(saved.best[t].time)) best[t] = { time: finite(saved.best[t].time, 120, 0, 120), fleet: finite(saved.best[t].fleet, 1, 1, 6) };
    for (const p of [0, 1, 2]) { const key = `${p}:${t}`; if (saved.plans?.[key]) plans[key] = E.cleanPlan(saved.plans[key], p, t, operationId); }
  }
  let plan, state, prediction, previous = null, mode = 'plan', editing = false, speed = 1, accumulator = 0, last = 0, eventIndex = 0, renderTime = 0, lastViewKey = '';
  let hintPlan = null, pendingNext = null, dirty = false, resumeMode = 'running', actionNotice = '', finished = saved.finished === true && completed.length === phaseCount();
  let undo = [], redo = [], editStart = null, gesture = null, holdTimer = 0, heldButton = null, pointerButton = null;
  const pointers = new Set();
  const battle = new B.Timeline();
  const renderer = new root.EclipseRenderer($('battlefield')), sound = new root.Orbital.Sound(); sound.enabled = settings.sound; sound.setVolume(.35);
  const dialogs = [...document.querySelectorAll('dialog')], isDialogOpen = () => dialogs.some(d => d.open);
  let camera = 'overview';
  function snapshot(override = {}) { return { version: 2, operation: operationId, phase, tactic, carry, completed, attempts, hints, plans, best, settings, finished, final: finished ? finalRecord() : undefined, ...override }; }
  function save(override) {
    const current = snapshot(override); operations[operationId] = current;
    try { localStorage.setItem(KEY, JSON.stringify({ ...current, operations })); $('saveStatus').textContent = 'Операция сохранена на этом устройстве'; }
    catch { $('saveStatus').textContent = 'Хранилище недоступно · попытка остаётся в этой вкладке'; }
    $('deviceSaveStatus').textContent = $('saveStatus').textContent;
  }
  function openDialog(id) {
    stopInput(); accumulator = 0; sound.silence(); const dialog = $(id); if (!dialog.open) dialog.showModal();
    if (id === 'briefing') { $('briefingTitle').focus({ preventScroll: true }); dialog.scrollTop = 0; }
  }
  function closeDialog(id) { $(id).close(); last = performance.now(); accumulator = 0; }
  function setRadio(text) { if ($('radioText').textContent !== text) $('radioText').textContent = text; }
  function reference() {
    if (E.hint) { const value = E.hint(phase, tactic, operationId); if (value) return value; }
    if (phase === 0) return { ...REFERENCES.approach, ...(operationId === 'rift' ? { angle: -54, speed: 77.5 } : operationId === 'pulsar' ? { angle: -50.5, speed: 90 } : {}), delay: 0 };
    return { ...REFERENCES[tactic], delay: operationId === 'pulsar' ? tactic === 'escort' ? .5 : 2 : 0 };
  }
  function setup(initial = false) {
    stopInput(); undo = []; redo = []; editStart = null;
    plan = plans[`${phase}:${tactic}`] || { ...E.defaults(phase, tactic, operationId) };
    if (!expedition() && !plans[`${phase}:${tactic}`] && phase < 2) plan = { ...reference(), angle: reference().angle + (phase === 0 ? -3 : tactic === 'rebound' ? 8 : 10), delay: 0 };
    plan = E.cleanPlan(plan, phase, tactic, operationId);
    state = E.create(phase, tactic, plan, carry, operationId); mode = 'plan'; accumulator = 0; eventIndex = 0; editing = false; pendingNext = null; actionNotice = ''; battle.reset();
    if (!initial) previous = null;
    const meta = PHASES[phase], currentStory = story(), advanced = ['binary', 'ark'].includes(operationId), info = phase === 1 ? advanced && tactic === 'escort' ? { objective: 'Прикрой бомбардировщик во время обоих залпов: на 4,5 и 7,5 с. Его курс отмечен золотом.', intel: 'В этой операции нужно прикрыть оба залпа. Держись в радиусе 145 м от союзника: разгон и торможение помогают выровнять время сближения. На 9-й секунде он атакует генератор.' } : TACTIC_INFO[tactic] : { objective: phase === 0 ? currentStory.approach : currentStory.exit, intel: phase === 0 ? currentStory.approachIntel : currentStory.hazard };
    const operation = E.operation(operationId);
    const custom = expedition(), missionInfo = mission();
    document.title = operation.name + (custom ? ' — самостоятельная экспедиция' : ' — боевая операция');
    $('operationName').textContent = operation.name.toUpperCase(); $('operationTag').textContent = operation.tag; $('operationDetail').textContent = operation.detail;
    $('mapSector').textContent = currentStory.sector;
    $('phaseLabel').textContent = custom ? 'ЭКСПЕДИЦИЯ / НЕПРЕРЫВНЫЙ ПОЛЁТ' : `МАНЁВР 0${phase + 1} / 03`; $('objectiveTitle').textContent = operation.titles[phase]; $('objectiveText').textContent = info.objective; $('intelText').textContent = info.intel + (phase === 1 && ['binary', 'ark'].includes(operationId) ? ' ' + currentStory.hazard : ''); setRadio(phase === 0 ? currentStory.arrival : phase === 2 ? '«Заря» начинает атаку. Следуй к синему коридору выхода; системы манёвра восстановлены.' : meta.radio);
    $('mobileObjective').textContent = info.objective;
    $('step0Text').textContent = operationId === 'ark' ? 'Спасти капсулу' : operationId === 'binary' ? 'Пройти рубеж' : 'Захватить узел';
    $('step1Text').textContent = 'Открыть крепость'; $('step2Text').textContent = 'Выйти из боя';
    $('briefingTitle').textContent = currentStory.title; $('briefingLead').textContent = currentStory.lead;
    $('briefingArtLabel').textContent = operation.name.toUpperCase() + ' / ' + currentStory.sector;
    $('briefingApproachTitle').textContent = operation.titles[0]; $('briefingApproachText').textContent = currentStory.approach;
    $('briefingExitTitle').textContent = custom ? currentStory.exitTitle : operation.titles[2]; $('briefingExitText').textContent = currentStory.exit;
    $('briefingSystemsText').textContent = custom ? 'Разгон +18% помогает изменить момент встречи или передать грузу импульс. Торможение −25% снижает скорость: полезно у терминала и при сближении. У каждой экспедиции своя система D — она описана в задачах выше.' : 'Разгон +18% помогает выйти из притяжения. Торможение −25% меняет момент встречи с препятствием. Щит на 2 с защищает от огня и ионного разряда.';
    $('briefingSystemsLabel').textContent = custom ? 'В ПОЛЁТЕ · ПО ОДНОМУ ЗАРЯДУ НА ВСЮ МИССИЮ' : 'В ПОЛЁТЕ · ПО ОДНОМУ ЗАРЯДУ НА ЭТАП';
    $('windowLead').textContent = custom ? 'Время старта меняет момент встречи с движущимися объектами. Прогноз показывает путь с текущим курсом и режимом системы миссии; ручные действия D, разгон и торможение в него заранее не включены.' : 'Пока корабль ждёт, препятствия движутся, а ионный фронт меняет состояние. Прогноз сразу покажет результат нового окна. Разгон и торможение станут доступны после фактического старта.';
    $('briefingSource').textContent = custom ? 'ЭКСПЕДИЦИОННАЯ СЛУЖБА / ЛИРА' : 'ПЕРЕДАЧА С ФЛАГМАНА «ЗАРЯ»';
    $('briefingMiddleTitle').textContent = custom ? currentStory.middleTitle : 'Выбери способ атаки';
    $('briefingMiddleText').textContent = custom ? currentStory.middle : 'Обойди щит, верни вражеский залп или прикрой союзника. Перемещай якорь и следи за траекторией.';
    $('briefingControlHelp').textContent = custom ? 'Один непрерывный полёт, три задачи. Пробел — старт / пауза, D — система миссии, Q — разгон, F — торможение; на телефоне — кнопки под картой. Действие можно выбрать на паузе: прогноз пересчитается сразу. Восстановления зарядов между подцелями нет.' : 'Планируй без спешки. Можно выбрать действие на паузе: прогноз сразу пересчитается. Q — разгон, F — торможение, E — щит; на телефоне — кнопки под картой. Для захваченного снаряда на втором этапе эти системы недоступны.';
    $('briefingApproachTitle').textContent = custom ? (missionInfo?.steps?.[0]?.title || 'Найди подход') : operation.titles[0];
    $('chooseBriefingOperation').textContent = 'Выбрать поле боя · ' + E.OPERATIONS.length + ' операций';
    document.querySelector('[data-tactic="escort"] small').textContent = advanced ? 'Прикрыть оба залпа' : 'Провести бомбардировщик';
    $('tactics').hidden = custom || phase !== 1; $('anchorControls').hidden = custom || phase !== 1;
    $('hullLabel').textContent = phase === 1 && tactic === 'rebound' ? 'КОРАБЛЬ В УКРЫТИИ' : 'ТВОЙ КОРПУС';
    $('mapHint').textContent = 'Потяни по карте, чтобы задать курс';
    for (let i = 0; i < 3; i++) { $('step' + i).classList.toggle('done', i < phase); if (i === phase) $('step' + i).setAttribute('aria-current', 'step'); else $('step' + i).removeAttribute('aria-current'); }
    document.querySelectorAll('[data-tactic]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tactic === tactic)));
    if (custom) { $('objectiveTitle').textContent = missionInfo?.title || operation.name; $('objectiveText').textContent = missionInfo?.objective || currentStory.approach; $('intelText').textContent = missionInfo?.intel || currentStory.approachIntel; $('mobileObjective').textContent = missionInfo?.objective || currentStory.approach; setRadio(missionInfo?.radio || currentStory.arrival); }
    writeInputs(); forecast(); sync();
  }
  function writeInputs(keepFocused = true) {
    for (const name of ['angle', 'speed']) { if (!keepFocused || document.activeElement !== $(name)) $(name).value = String(plan[name]); $(name + 'Range').value = String(plan[name]); }
    for (const [id, key] of [['anchorX', 'ax'], ['anchorY', 'ay']]) if (!keepFocused || document.activeElement !== $(id)) $(id).value = String(plan[key]);
    $('delay').value = String(plan.delay); $('delayValue').textContent = plan.delay ? plan.delay.toFixed(2).replace(/0$/, '') + ' с' : 'Сразу';
    $('delayToggle').textContent = plan.delay ? 'Старт +' + plan.delay.toFixed(2).replace(/0$/, '') + ' с' : 'Старт сразу';
  }
  function forecast() {
    prediction = mode === 'plan' ? E.simulate(phase, tactic, plan, carry, operationId) : E.project(state); dirty = false;
    const good = prediction.status === 'won'; $('forecastStatus').dataset.good = String(good);
    const predictedMission = expedition() && E.missionInfo ? E.missionInfo(prediction) : null;
    $('forecastTitle').textContent = !settings.forecast ? 'Прогноз скрыт' : good ? 'Манёвр достижим' : 'Курс требует внимания';
    const objectives = E.checkpoints ? E.checkpoints(prediction).filter(x => x.required) : [];
    $('forecastDetail').textContent = !settings.forecast ? 'Включи прогноз, чтобы проверить курс.' : good ? expedition() ? `${prediction.t.toFixed(1)} с · задачи ${predictedMission?.steps?.filter(x => x.done).length || 0}/3 · корпус ${prediction.hull}/3` : `${prediction.t.toFixed(1)} с · флот ${prediction.fleet}/6${prediction.signal ? ' · ретранслятор захвачен' : ''}${objectives.length ? ' · цели ' + objectives.filter(x => x.done).length + '/' + objectives.length : ''}${phase === 1 && tactic === 'escort' ? ' · прикрыто залпов: ' + prediction.coverCount + '/2' : ''}` : prediction.reason;
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
    $('anchorTool').hidden = expedition() || phase !== 1;
    $('mapHint').textContent = editing ? 'Перетащи якорь · стрелки перемещают его' : 'Потяни по карте · ← → курс, ↑ ↓ импульс';
    document.body.dataset.tool = editing ? 'anchor' : 'course';
  }
  function updatePlan(change, record = true) {
    if (mode !== 'plan') return; const nextPlan = E.cleanPlan({ ...plan, ...change }, phase, tactic, operationId);
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
    if (mode !== 'plan') return; stopInput(); editing = anchor && phase === 1 && !expedition();
    if (editing) camera = 'overview'; renderer.needsDraw = true; sync();
  }
  function stopHold() { clearTimeout(holdTimer); holdTimer = 0; heldButton = null; }
  function stopInput(cancel = false) {
    stopHold(); gesture = null; pointers.clear(); if (editStart) finishEdit(cancel);
  }
  function act(kind) {
    if (!['running', 'paused'].includes(mode) || isDialogOpen() || kind === 'shield' && expedition()) return;
    const applied = kind === 'mission' ? E.interact?.(state) : kind === 'shield' ? E.shield(state) : E.maneuver(state, kind);
    if (!applied) return;
    const labels = { boost: 'Разгон выполнен · скорость +18%', brake: 'Торможение выполнено · скорость −25%', shield: 'Щит включён на 2 секунды полёта' };
    actionNotice = kind === 'mission' ? (mission()?.actionNotice || mission()?.status || 'Система миссии переключена') : labels[kind];
    if (E.project) {
      prediction = E.project(state); const good = prediction.status === 'won';
      $('forecastStatus').dataset.good = String(good);
      $('forecastTitle').textContent = !settings.forecast ? 'Прогноз скрыт' : 'Прогноз пересчитан после действия';
      $('forecastDetail').textContent = !settings.forecast ? 'Включи прогноз, чтобы проверить оставшийся маршрут.' : good ? `Оставшийся маршрут достижим · финиш ${prediction.t.toFixed(1)} с${expedition() ? ' · корпус ' + prediction.hull + '/3' : ' · флот ' + prediction.fleet + '/6'}` : prediction.reason;
      $('courseStatus').textContent = !settings.forecast ? 'Прогноз скрыт' : good ? 'Курс пересчитан · финиш ' + prediction.t.toFixed(1) + ' с' : prediction.reason;
      $('courseStatus').dataset.good = String(good);
      $('windowForecast').textContent = $('forecastTitle').textContent + ' · ' + $('forecastDetail').textContent; $('windowForecast').dataset.good = String(good);
    }
    setRadio(actionNotice + '. ' + (mode === 'paused' ? 'Пауза сохраняется: продолжи, когда будешь готов.' : 'Оставшийся маршрут пересчитан.'));
    renderer.needsDraw = true; sync();
  }
  function syncManeuvers(cinematic) {
    const flying = ['running', 'paused'].includes(mode) && !cinematic, projectile = !expedition() && phase === 1 && tactic === 'rebound';
    const details = mission(); $('missionActionRow').hidden = !details || !flying;
    if (details) { $('missionActionLabel').textContent = details.actionLabel || 'Система миссии'; $('missionActionHint').textContent = details.actionHint || 'Специальное действие'; $('missionAction').disabled = !flying || !E.canInteract?.(state); $('missionAction').setAttribute('aria-label', $('missionActionLabel').textContent + '. ' + $('missionActionHint').textContent); }
    $('combatActions').hidden = !flying || projectile;
    for (const kind of ['boost', 'brake']) {
      const used = !!state[kind + 'Used'], available = flying && E.canManeuver?.(state, kind);
      $(kind).disabled = !available; $(kind).dataset.used = String(used);
      $(kind + 'Status').textContent = used ? kind === 'boost' ? 'использован' : 'использовано' : state.flightT === 0 ? 'после старта' : kind === 'boost' ? '+18% скорости' : '−25% скорости';
      $(kind).setAttribute('aria-label', (kind === 'boost' ? 'Разгон' : 'Торможение') + ': ' + $(kind + 'Status').textContent + '. ' + (available ? expedition() ? 'Доступен один раз за весь полёт.' : 'Доступен один раз за этап.' : used ? expedition() ? 'Восстановится в новой попытке.' : 'Восстановится на следующем этапе.' : 'Дождись фактического старта.'));
    }
    const feedback = actionNotice || (state.flightT === 0 ? 'Системы манёвра включатся после старта.' : mode === 'paused' ? 'Можно выбрать действие на паузе. Оно изменит курс после продолжения.' : (expedition() ? 'Разгон и торможение — по одному на весь полёт. D — система миссии.' : 'Разгон и торможение — по одному разу за этап. Пауза даёт время решить.'));
    if ($('maneuverFeedback').textContent !== feedback) $('maneuverFeedback').textContent = feedback;
  }
  function sync() {
    const cinematic = mode === 'cinematic' || mode === 'paused' && resumeMode === 'cinematic';
    const running = mode === 'running' || mode === 'paused' || cinematic, locked = mode !== 'plan', custom = expedition(), details = mission();
    document.body.dataset.kind = custom ? 'expedition' : 'battle';
    $('stateBadge').textContent = mode === 'running' ? 'МАНЁВР ВЫПОЛНЯЕТСЯ' : mode === 'paused' ? 'ТАКТИЧЕСКАЯ ПАУЗА' : cinematic ? 'ПРОРЫВ ФЛОТА' : mode === 'review' ? state.status === 'won' ? 'МАНЁВР ЗАВЕРШЁН' : 'РАЗБОР ПОЛЁТА' : 'ПЛАНИРОВАНИЕ';
    $('stateBadge').classList.toggle('live', mode === 'running'); $('timer').textContent = state.t.toFixed(2).padStart(5, '0') + ' с';
    $('fleetValue').textContent = `${state.fleet} / 6`; $('fleetMeter').style.width = state.fleet / 6 * 100 + '%'; $('hullValue').textContent = `${state.hull} / 3`; $('hullMeter').style.width = state.hull / 3 * 100 + '%';
    $('fleetLabel').textContent = custom ? details?.metricLabel || 'ЦЕЛЬ МИССИИ' : 'СОЮЗНЫЙ ФЛОТ';
    if (custom) { $('fleetValue').textContent = details?.metricValue || '0 / 3'; $('fleetMeter').style.width = Math.round(E.clamp(details?.metricRatio || 0, 0, 1) * 100) + '%'; }
    $('mobileVitals').textContent = custom ? `${details?.metricValue || 'Задачи 0/3'} · Корпус ${state.hull}/3` : `Флот ${state.fleet}/6 · Корпус ${state.hull}/3`;
    for (const id of ['angle', 'angleRange', 'speed', 'speedRange', 'anchorX', 'anchorY', 'anchorTool', 'delay']) $(id).disabled = locked;
    document.querySelectorAll('[data-adjust]').forEach(b => b.disabled = locked);
    document.querySelectorAll('[data-tactic]').forEach(b => b.disabled = locked);
    $('launch').hidden = running; $('pause').hidden = !running; $('shield').hidden = custom || !running || cinematic || phase === 1 && tactic === 'rebound';
    $('rate').disabled = cinematic; $('battleMoment').hidden = !cinematic;
    $('launch').textContent = mode === 'review' ? state.status === 'won' ? finalPhase() ? 'Итоги операции ↗' : 'Следующий манёвр ↗' : 'Изменить курс ↗' : 'Выполнить манёвр ↗';
    $('pause').textContent = mode === 'paused' ? 'Продолжить ▶' : 'Пауза Ⅱ'; $('shield').disabled = state.shieldUsed;
    $('shieldLabel').textContent = 'Щит'; $('shieldStatus').textContent = state.shield > 0 ? state.shield.toFixed(1) + ' с' : state.shieldUsed ? 'использован' : 'защита на 2 с';
    $('shield').setAttribute('aria-label', state.shield > 0 ? 'Щит активен ещё ' + state.shield.toFixed(1) + ' секунды' : state.shieldUsed ? custom ? 'Щит использован. Восстановится в новой попытке.' : 'Щит использован. Восстановится на следующем этапе.' : 'Включить защитный щит на 2 секунды полёта');
    $('shield').dataset.active = String(state.shield > 0); $('anchorTool').setAttribute('aria-pressed', String(editing));
    $('soundEnabled').checked = settings.sound; $('reducedMotion').checked = settings.reduced; $('showForecast').checked = settings.forecast;
    $('forecastToggle').setAttribute('aria-pressed', String(settings.forecast)); $('forecastToggle').lastElementChild.textContent = settings.forecast ? 'вкл.' : 'выкл.';
    $('cameraToggle').setAttribute('aria-pressed', String(camera === 'follow')); $('cameraToggle').textContent = camera === 'follow' ? 'Вся карта' : 'Крупнее ⊕';
    $('tacticalButton').textContent = custom ? 'Задачи экспедиции' : phase === 1 ? NAMES[tactic] + ' · тактика' : 'Задача и курс';
    $('signalStatus').textContent = state.signal || completed.some(x => x.signal) ? state.jam ? 'Ретранслятор готов · заглушит залп' : 'Ретранслятор захвачен' : 'Бонус: захватить золотой ретранслятор';
    $('signalStatus').hidden = custom || phase !== 0 && !state.jam;
    const storm = E.stormAt(state), charge = phase === 1 && tactic === 'breach' ? state.charge / .8 : 0;
    const checkpoints = E.checkpoints ? E.checkpoints(state).filter(x => x.required) : [], pending = checkpoints.find(x => !x.done);
    const target = pending ? 'Цель: ' + pending.label : checkpoints.length ? operationId === 'ark' ? 'Капсула на борту · к узлу' : 'Рубеж пройден · к узлу' : '';
    const combat = mode === 'running' && state.flightT === 0 ? `Старт через ${Math.max(0, plan.delay - state.t).toFixed(1)} с` : charge > 0 && mode === 'running' ? `Огонь по генератору · ${Math.round(charge * 100)}%` : storm ? `${storm.active ? 'Ионный фронт' : 'Безопасное окно'} · ${storm.remaining.toFixed(1)} с` : phase === 1 && tactic === 'escort' ? `Прикрыто ${state.coverCount}/2 · звено ${state.allyHull}/2` : state.jam ? 'Следующий залп будет заглушён' : 'Залп крепости · ' + (5 - state.t % 5).toFixed(1) + ' с';
    $('combatStatus').textContent = [target, combat].filter(Boolean).join(' · ');
    $('combatStatus').hidden = cinematic || mode === 'review' || phase === 2 && !storm && !target;
    $('combatStatus').dataset.warning = String(!!storm?.active);
    if (custom && details) {
      $('combatStatus').textContent = details.status || details.objective; $('combatStatus').hidden = mode === 'review'; $('combatStatus').dataset.warning = String(!!details.alert);
      $('objectiveTitle').textContent = details.title || E.operation(operationId).name; $('objectiveText').textContent = details.objective; $('mobileObjective').textContent = details.objective; $('intelText').textContent = details.intel || story().approachIntel;
      for (let i = 0; i < 3; i++) { const item = details.steps?.[i]; $('step' + i + 'Text').textContent = item?.title || 'Задача ' + (i + 1); $('step' + i).classList.toggle('done', !!item?.done); if (item?.active && !item.done) $('step' + i).setAttribute('aria-current', 'step'); else $('step' + i).removeAttribute('aria-current'); }
    }
    document.body.dataset.reduced = String(settings.reduced); document.body.dataset.phase = String(phase); document.body.dataset.mode = mode; document.body.dataset.camera = camera;
    syncManeuvers(cinematic); syncEditor();
  }
  function launch() {
    if (mode === 'review') { if (state.status === 'won') finalPhase() ? outcome() : next(); else retry(); return; }
    if (mode !== 'plan' || isDialogOpen()) return;
    stopInput();
    forecast(); plans[`${phase}:${tactic}`] = { ...plan }; state = E.create(phase, tactic, plan, carry, operationId); mode = 'running'; editing = false; actionNotice = ''; attempts++; accumulator = 0; eventIndex = 0; battle.reset(); save();
    sound.unlock(); sound.play('launch'); setRadio(expedition() ? (mission()?.radio || story().arrival) : phase === 1 && tactic === 'rebound' ? 'Залп под нашим контролем. Поле должно вернуть его к реактору.' : 'Импульс дан. Наблюдаю за курсом.'); sync();
  }
  function pause() { if (!['running', 'paused', 'cinematic'].includes(mode)) return; if (mode === 'paused') mode = resumeMode; else { resumeMode = mode; mode = 'paused'; } accumulator = 0; sound.silence(); sync(); }
  function retry() {
    stopInput();
    dialogs.forEach(d => { if (d.open) d.close(); }); previous = state.t > 0 ? state : previous; completed = completed.filter(x => x.phase < phase); finished = false;
    state = E.create(phase, tactic, plan, carry, operationId); mode = 'plan'; accumulator = 0; eventIndex = 0; pendingNext = null; actionNotice = ''; battle.reset(); sound.silence(); forecast(); sync(); save(); setRadio('Курс можно изменить. Предыдущая траектория осталась на карте. Системы манёвра восстановлены.');
  }
  function endManeuver() {
    mode = 'review'; accumulator = 0; sound.silence();
    if (state.status === 'won') {
      completed = completed.filter(x => x.phase < phase).concat({ phase, time: state.t, hull: state.hull, fleet: state.fleet, ally: state.allyHull, signal: state.signal, boost: !!state.boostUsed, brake: !!state.brakeUsed });
      const node = scene().node || state;
      pendingNext = { phase: Math.min(phaseCount() - 1, phase + 1), carry: { fleet: state.fleet, jam: state.jam, x: phase === 0 || tactic === 'rebound' && phase === 1 ? node.x : state.x, y: phase === 0 || tactic === 'rebound' && phase === 1 ? node.y : state.y } };
      if (finalPhase()) { finished = true; const time = completed.reduce((sum, r) => sum + r.time, 0), key = resultKey(); if (!best[key] || time < best[key].time) best[key] = { time, fleet: state.fleet }; save({ final: finalRecord() }); }
      else save(pendingNext);
    } else { save(); }
    if (state.status === 'won' && phase === 1 && !expedition()) {
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
    const won = state.status === 'won', final = won && finalPhase(), custom = expedition(), details = mission();
    $('outcomeEyebrow').textContent = final ? 'ОПЕРАЦИЯ ЗАВЕРШЕНА / ' + (custom ? E.operation(operationId).name.toUpperCase() : NAMES[tactic].toUpperCase()) : `МАНЁВР 0${phase + 1} / ${won ? 'ВЫПОЛНЕН' : 'ПОВТОР ДОСТУПЕН'}`;
    $('outcomeTitle').textContent = final ? 'Коридор открыт.' : won ? phase === 0 ? 'Узел наш.' : 'Крепость открыта.' : 'Скорректируем курс.';
    $('outcomeText').textContent = final ? `Операция «${E.operation(operationId).name}» завершена. «Заря» прошла за щит, ты вернулся из боя.${operationId === 'ark' ? ' Экипаж эвакуационной капсулы спасён.' : operationId === 'binary' ? ' Рубеж между двумя лунами пройден.' : ''}${completed.some(x => x.signal) ? ' Ретранслятор перехвачен — дополнительная цель выполнена.' : ''}` : state.reason;
    const time = final ? completed.reduce((sum, r) => sum + r.time, 0) : state.t;
    const stats = final ? [['ВРЕМЯ МАНЁВРОВ', time.toFixed(1) + ' с'], ['ФЛОТ СОХРАНЁН', state.fleet + ' / 6'], ['ЗАПУСКОВ', attempts]] : [['ВРЕМЯ', time.toFixed(1) + ' с'], ['ФЛОТ', state.fleet + ' / 6'], ['КОРПУС', state.hull + ' / 3']];
    $('outcomeStats').replaceChildren(...stats.map(([name, value]) => { const div = document.createElement('div'), label = document.createElement('span'), strong = document.createElement('strong'); label.textContent = name; strong.textContent = value; div.append(label, strong); return div; }));
    const maneuvers = completed.reduce((sum, result) => sum + Number(!!result.boost) + Number(!!result.brake), 0);
    $('outcomeAdvice').textContent = final ? `Пройдено способов: ${Object.keys(best).length} / 3. ${hints ? 'Использовано подсказок: ' + hints + '.' : 'Самостоятельный расчёт, без подсказок.'} Коррекций скорости: ${maneuvers}. Попробуй другое поле боя или способ атаки.` : won ? phase === 0 ? 'Контрольная точка сохранена. Теперь выбери тактику и настрой гравитационный якорь. Разгон, торможение и щит восстановлены.' : 'Контрольная точка сохранена. ' + story().hazard : 'Прежний маршрут останется на карте. Измени курс или окно старта; в полёте разгон помогает выйти из притяжения, а торможение — пропустить препятствие. Флот, корпус и системы восстановятся до начала этапа.';
    if (custom) {
      $('outcomeEyebrow').textContent = won ? 'ЭКСПЕДИЦИЯ ЗАВЕРШЕНА' : 'ЭКСПЕДИЦИЯ / РАЗБОР ПОЛЁТА';
      $('outcomeTitle').textContent = won ? story().resultTitle : 'Есть другой путь.'; $('outcomeText').textContent = won ? story().result : state.reason;
      const customStats = [['ВРЕМЯ', time.toFixed(1) + ' с'], ['ЗАДАЧИ', (details?.steps?.filter(x => x.done).length || 0) + ' / 3'], ['КОРПУС', state.hull + ' / 3']];
      $('outcomeStats').replaceChildren(...customStats.map(([name, value]) => { const div = document.createElement('div'), label = document.createElement('span'), strong = document.createElement('strong'); label.textContent = name; strong.textContent = value; div.append(label, strong); return div; }));
      $('outcomeAdvice').textContent = won ? (hints ? 'Опорных курсов использовано: ' + hints + '. ' : 'Самостоятельный расчёт, без подсказок. ') + 'Лучшее время: ' + (best.mission?.time || time).toFixed(1) + ' с. Попробуй улучшить маршрут или выбери следующую экспедицию.' : story().hint + ' Предыдущая траектория останется на карте; новая попытка восстановит все системы.';
    }
    $('outcomePrimary').textContent = final ? custom ? 'Улучшить маршрут ↗' : 'Пройти другим способом ↗' : won ? 'Следующий манёвр ↗' : 'Изменить курс ↗'; openDialog('outcome');
  }
  function next() { if (!pendingNext) return; phase = pendingNext.phase; carry = pendingNext.carry; setup(); save(); $('battlefield').focus({ preventScroll: true }); }
  function newOperation() {
    phase = 0; carry = { fleet: 6 }; completed = []; attempts = 0; hints = 0; finished = false; plans = {}; previous = null; setup(); save(); window.scrollTo({ top: 0, behavior: settings.reduced ? 'instant' : 'smooth' });
  }
  function showOperations() {
    save(pendingNext && !finalPhase() ? pendingNext : undefined);
    dialogs.forEach(d => { if (d.open) d.close(); });
    const items = [], groups = [['Экспедиции · новые механики', E.OPERATIONS.filter(o => o.kind === 'expedition')], ['Боевые операции', E.OPERATIONS.filter(o => o.kind !== 'expedition')]];
    for (const [label, list] of groups) {
      if (!list.length) continue; const heading = document.createElement('h3'); heading.className = 'operation-group-title'; heading.textContent = label; items.push(heading);
      for (const o of list) {
        const button = document.createElement('button'), art = document.createElement('span'), title = document.createElement('strong'), tag = document.createElement('small'), detail = document.createElement('p'), progress = document.createElement('span');
        button.className = 'operation-card'; button.dataset.operation = o.id; button.setAttribute('aria-pressed', String(operationId === o.id));
        art.className = 'operation-art art-' + o.id; art.setAttribute('aria-hidden', 'true'); art.textContent = (STORIES[o.id] || STORIES.eclipse).mark;
        tag.textContent = (o.kind === 'expedition' ? 'ЭКСПЕДИЦИЯ / ' : 'ОПЕРАЦИЯ / ') + o.tag; title.textContent = o.name; detail.textContent = o.description;
        const run = operations[o.id]; progress.className = 'operation-progress'; progress.textContent = run?.finished ? o.kind === 'expedition' ? 'Выполнена · ' + finite(run.best?.mission?.time || run.completed?.[0]?.time, 0, 0, 120).toFixed(1) + ' с' : 'Пройдена · способов ' + Object.keys(run.best || {}).length + '/3' : run?.phase ? 'Продолжить · этап ' + (run.phase + 1) + '/3' : operationId === o.id ? 'Текущая операция' : 'Начать полёт ↗';
        button.append(art, tag, title, detail, progress); button.addEventListener('click', () => selectOperation(o.id)); items.push(button);
      }
    }
    $('operationList').replaceChildren(...items);
    openDialog('operationsDialog');
  }
  function restoreFinal(record) {
    if (expedition() && E.restoreFinal) { E.restoreFinal(state, record.final || {}); mode = 'review'; sync(); outcome(); return; }
    const exit = scene().exit;
    state.status = 'won'; state.reason = 'Операция завершена'; state.x = finite(record.final?.x, exit.x, 0, E.W); state.y = finite(record.final?.y, exit.y, 0, E.H);
    state.t = completed[2]?.time || 0; state.flightT = Math.max(0, state.t - plan.delay); state.fleet = completed[2]?.fleet || 1; state.hull = completed[2]?.hull || 3; mode = 'review'; sync(); outcome();
  }
  function selectOperation(id) {
    closeDialog('operationsDialog');
    if (id === operationId) return;
    operationId = E.operation(id).id; const unseen = !operations[operationId], run = operations[operationId] || {};
    phase = Number.isInteger(run.phase) && run.phase >= 0 && run.phase < phaseCount() ? run.phase : 0; tactic = E.TACTICS.includes(run.tactic) ? run.tactic : 'breach';
    carry = phase ? cleanCarry(run.carry) : { fleet: 6 }; completed = cleanCompleted(run.completed);
    attempts = Math.round(finite(run.attempts, 0, 0, 99999)); hints = Math.round(finite(run.hints, 0, 0, 99999)); plans = {}; best = {};
    for (const t of [...E.TACTICS, 'mission']) {
      if (Number.isFinite(run.best?.[t]?.time)) best[t] = { time: finite(run.best[t].time, 120, 0, 120), fleet: finite(run.best[t].fleet, 1, 1, 6) };
      for (const p of [0, 1, 2]) if (run.plans?.[`${p}:${t}`]) plans[`${p}:${t}`] = E.cleanPlan(run.plans[`${p}:${t}`], p, t, operationId);
    }
    finished = run.finished === true && completed.length === phaseCount(); setup();
    if (finished) restoreFinal(run);
    else if (expedition() && unseen) { $('begin').textContent = 'Начать экспедицию ↗'; openDialog('briefing'); }
    save(); renderer.needsDraw = true;
  }
  function findHint() {
    if (phase < 2) return reference();
    const preferred = reference();
    if (E.simulate(phase, tactic, preferred, carry, operationId).status === 'won') return preferred;
    // Prefer an early window. Search later windows only when the actual checkpoint needs one.
    for (const delay of [...new Set([preferred.delay, 0, .5, 1, 1.5, 2, 2.5, 3, 3.5, 4])]) {
      let result = null, score = Infinity;
      for (let angle = -180; angle <= 180; angle += 2) for (let speed = 65; speed <= 170; speed += 5) {
        const candidate = { ...plan, angle, speed, delay }, simulation = E.simulate(2, tactic, candidate, carry, operationId);
        if (simulation.status === 'won' && simulation.t < score) { score = simulation.t; result = candidate; }
      }
      if (result) return result;
    }
    return null;
  }
  function requestHint() {
    if (mode !== 'plan') return; hintPlan = findHint();
    $('navigatorText').textContent = !hintPlan ? 'Проверь отмеченные цели и препятствия. Попробуй изменить момент старта, затем направление и импульс.' : phase === 0 ? story().approach + ' Опорный курс учитывает обязательные точки и движение препятствий.' : phase === 2 ? 'Этот курс рассчитан из твоего текущего положения с учётом гравитации и движущихся препятствий. Изменение скорости меняет момент встречи с ними.' : tactic === 'breach' ? 'Проведи корабль вокруг крепости к подсвеченному сектору за щитом. Якорь загнёт курс, а с тыла генератор открыт для автоматического огня.' : tactic === 'rebound' ? 'Перемести якорь так, чтобы поле развернуло залп за пунктирной линией. Небольшой импульс позволит снаряду сделать петлю. Разгон и торможение для захваченного снаряда недоступны.' : 'Следуй вдоль золотого курса. Нужно оказаться рядом с бомбардировщиком во время отмеченных залпов. Торможение и разгон помогают удержаться рядом с ним.';
    if (expedition()) $('navigatorText').textContent = story().hint;
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
  $('missionAction').addEventListener('click', () => act('mission'));
  for (const kind of ['boost', 'brake', 'shield']) $(kind).addEventListener('click', () => act(kind));
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
  document.querySelectorAll('[data-tactic]').forEach(button => button.addEventListener('click', () => { if (expedition() || phase !== 1 || mode !== 'plan') return; plans[`${phase}:${tactic}`] = { ...plan }; tactic = button.dataset.tactic; setup(); save(); }));
  $('outcomePrimary').addEventListener('click', () => { closeDialog('outcome'); if (state.status !== 'won') retry(); else if (finalPhase()) { if (expedition()) { newOperation(); return; } tactic = E.TACTICS[(E.TACTICS.indexOf(tactic) + 1) % 3]; newOperation(); } else next(); });
  $('reviewPath').addEventListener('click', () => closeDialog('outcome')); $('hintButton').addEventListener('click', requestHint); $('closeHint').addEventListener('click', () => closeDialog('navigator'));
  $('applyHint').addEventListener('click', () => { closeDialog('navigator'); if (hintPlan) { hints++; updatePlan(hintPlan); forecast(); setRadio('Опорный курс введён. Можешь использовать его или попробовать улучшить.'); } });
  $('restartOperation').addEventListener('click', () => openDialog('confirmRestart')); $('cancelNew').addEventListener('click', () => closeDialog('confirmRestart')); $('confirmNew').addEventListener('click', () => { closeDialog('confirmRestart'); newOperation(); });
  function preference(key, value) { settings[key] = value; sound.enabled = settings.sound; if (settings.sound) sound.unlock(); forecast(); sync(); save(pendingNext && !finalPhase() ? pendingNext : undefined); }
  $('soundEnabled').addEventListener('change', e => preference('sound', e.target.checked)); $('reducedMotion').addEventListener('change', e => preference('reduced', e.target.checked)); $('showForecast').addEventListener('change', e => preference('forecast', e.target.checked)); $('forecastToggle').addEventListener('click', () => preference('forecast', !settings.forecast));
  $('battlefield').addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    pointers.add(event.pointerId);
    if (pointers.size !== 1) { gesture = null; finishEdit(true); return; }
    const mini = renderer.minimap, box = $('battlefield').getBoundingClientRect(), x = event.clientX - box.left, y = event.clientY - box.top;
    if (mini && x >= mini.x && x <= mini.x + mini.w && y >= mini.y && y <= mini.y + mini.h) { camera = 'overview'; renderer.needsDraw = true; sync(); return; }
    if (mode !== 'plan') return;
    event.preventDefault(); $('battlefield').focus({ preventScroll: true }); finishEdit(); beginEdit();
    const p = renderer.point(event.clientX, event.clientY), grab = !expedition() && phase === 1 && !editing && E.distance(p, { x: plan.ax, y: plan.ay }) < (event.pointerType === 'touch' ? 26 : 18) / renderer.scale;
    gesture = { id: event.pointerId, anchor: !expedition() && phase === 1 && (editing || grab), dx: grab ? plan.ax - p.x : 0, dy: grab ? plan.ay - p.y : 0 };
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
    if (event.code === 'KeyA' && phase === 1 && !expedition()) setTool(true);
    if (event.code === 'KeyZ') toggleCamera();
    if (event.code === 'KeyH' && mode === 'plan') requestHint();
    if (event.code === 'Space' && /^(BUTTON|A)$/.test(document.activeElement?.tagName || '')) return;
    if (event.code === 'Space') { event.preventDefault(); ['running', 'paused', 'cinematic'].includes(mode) ? pause() : launch(); }
    if (event.code === 'KeyR') { event.preventDefault(); retry(); }
    if (event.code === 'KeyD' && expedition() && ['running', 'paused'].includes(mode)) { event.preventDefault(); act('mission'); }
    if (event.code === 'KeyE' && expedition()) return;
    if (['KeyQ', 'KeyF', 'KeyE'].includes(event.code) && ['running', 'paused'].includes(mode)) { event.preventDefault(); act({ KeyQ: 'boost', KeyF: 'brake', KeyE: 'shield' }[event.code]); }
  });
  document.addEventListener('keyup', event => { if (event.code.startsWith('Arrow') && editStart && !gesture && !heldButton && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) finishEdit(); });
  window.addEventListener('blur', () => stopInput()); window.addEventListener('resize', () => stopInput());
  window.addEventListener('pagehide', () => stopInput());
  document.addEventListener('visibilitychange', () => { stopInput(); if (document.hidden && ['running', 'cinematic'].includes(mode)) pause(); last = performance.now(); accumulator = 0; });
  function frame(now) {
    const dt = Math.min(.1, Math.max(0, (now - (last || now)) / 1000)); last = now;
    const stopped = isDialogOpen() || document.hidden || mode === 'paused' || mode === 'review';
    if (!stopped && !settings.reduced) renderTime += dt;
    battle.advance(dt, { paused: stopped, phase, running: mode === 'running', fleet: state.fleet, flightTime: state.t, jammed: state.jam > 0, scene: scene(), operation: state.operation, state });
    if (dirty) forecast();
    if (mode === 'running' && !isDialogOpen() && !document.hidden) {
      accumulator += dt * speed;
      while (accumulator >= E.DT && mode === 'running') {
        E.step(state); accumulator -= E.DT;
        while (eventIndex < state.events.length) { const ev = state.events[eventIndex++]; battle.receive(ev, state); if (ev.text && (expedition() || ['hit', 'ally-hit', 'protect', 'blocked', 'signal', 'jammed', 'storm-hit', 'objective', 'checkpoint', 'rescue', 'boost', 'brake'].includes(ev.type))) setRadio(ev.text); }
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
