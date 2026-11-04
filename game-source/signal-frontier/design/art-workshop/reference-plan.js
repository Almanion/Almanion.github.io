/* Shared reference rules for the local workshop and the downloadable catalogue. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SignalArtReferences = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const extraFiles = ['style-palette.png','deck-palette.png','interface-icons.png','game-scene.png','camera-guide.png','ore.png','ore-depleted.png','cache.png','relay.png','terminal.png','watch.png'];
  const objectFiles = { O01:'ore.png', O02:'cache.png', O03:'relay.png', O04:'terminal.png', O05:'watch.png', O06:'ore-depleted.png' };
  const builds = ['outpost','barracks','foundry','arsenal','bunker','logistics'];
  function plan(entry, catalogue, choice) {
    if (entry.promptVersion >= 5 && entry.referenceGuide) {
      const p=JSON.parse(JSON.stringify(entry.referenceGuide));
      if (p.options.length) {
        p.source=p.options.some(o=>o.id===choice) ? choice : p.options[0].id;
        const selected=catalogue.entries.find(e=>e.id===p.source);
        const kind=p.source.replace(/^MODEL-/,'');
        const file=catalogue.modelIndex.some(m=>m.kind===kind) ? kind+'.png' : selected?.referenceGuide?.refs[0]?.file;
        p.refs=[{file,label:selected?.title || p.source,sourceId:p.source,role:'Выбранный исходник'}];
      }
      return p;
    }
    const refs = [], options = [], byId = new Map(catalogue.entries.map(e => [e.id,e]));
    const redesign = entry.designFreedom === 'redesign';
    const models = new Map(catalogue.modelIndex.map(m => [m.kind,m]));
    let explanation = '', optional = false, needsResult = false, source = null;
    const add = (file, label, sourceId, role = 'Форма объекта') => {
      if (!refs.some(r => r.file === file && r.sourceId === sourceId)) refs.push({ file, label, sourceId: sourceId || null, role });
    };
    const model = kind => { if (models.has(kind)) add(kind+'.png',models.get(kind).name,'MODEL-'+kind,redesign?'Назначение и габарит':'Форма объекта'); };
    const obj = id => { if (objectFiles[id]) add(objectFiles[id],byId.get(id)?.title || id,id); };
    const palette = () => add('style-palette.png','Палитра и материалы проекта',null,'Стиль');
    if (entry.buildingKind && entry.id.startsWith('BUILD-')) {
      const baseId = 'MODEL-'+entry.buildingKind;
      const readyId = entry.directionDegrees ? 'BUILD-'+entry.buildingKind+'-ready-'+entry.directionDegrees : baseId;
      const ready = entry.stateId !== 'ready' && byId.has(readyId);
      const sourceId = ready ? readyId : baseId;
      add(entry.buildingKind+'.png',byId.get(sourceId)?.title || entry.title,sourceId,'Утверждённый дизайн');
      if (ready && sourceId !== baseId) model(entry.buildingKind);
      explanation = 'Эта карточка хранит только указанное здание, направление и состояние. Сначала выберите основной дизайн; для стадии стройки полезно также выбрать готовый вид в этом направлении. Для Babylon.js это художественные образцы: поворот и стройка выполняются объёмной моделью.';
    }
    else if (entry.id === 'STYLE-01') { model('outpost'); palette(); }
    else if (entry.id === 'STYLE-02') { model('rocket'); add('outpost.png','Эталон союзных материалов','STYLE-01','Стиль'); }
    else if (entry.id === 'STYLE-03') { add('game-scene.png','Текущая игровая сцена',null,'Композиция'); add('outpost.png','Эталон союзников','STYLE-01','Стиль'); add('rocket.png','Эталон противника','STYLE-02','Стиль'); }
    else if (entry.id.startsWith('MODEL-')) {
      const kind = entry.id.slice(6);
      if (kind === 'bastion-south') model('bastion'); else model(kind);
      palette();
    } else if (/^(CARD|MOTION)-/.test(entry.id)) {
      model(entry.id.replace(/^(CARD|MOTION)-/,''));
    } else if (/^(UI|TECH)-/.test(entry.id)) {
      add('interface-icons.png','Действующие SVG-значки',null,'Стиль линий'); optional = true;
      explanation = 'Это новый эскиз знака: отдельной исходной картинки не требуется. Лист значков можно приложить для одинаковой толщины линий.';
    } else if (/^T\d\d$/.test(entry.id)) {
      palette(); optional = true;
      explanation = 'Этот материал создаётся по описанию: готовая текстура не требуется. Палитру можно приложить как ориентир цвета. Игровую сцену не нужно превращать в текстуру.';
    } else if (/^D\d\d$/.test(entry.id)) {
      if (Number(entry.id.slice(1)) <= 12) { model('outpost'); palette(); explanation = 'Новый декоративный объект. Модель экстрактора нужна только для ракурса и масштаба деталей; копировать его назначение не нужно.'; }
      else { palette(); optional = true; explanation = 'Плоская декоративная накладка создаётся по описанию. Палитра необязательна; отдельную картинку заготовки делать не нужно.'; }
    } else if (objectFiles[entry.id]) {
      if (entry.id === 'O06') obj('O01'); else obj(entry.id);
      palette();
    } else if (entry.id.startsWith('STATE-building-') || entry.id.startsWith('PREP-turn-')) {
      const kinds = builds.concat(/^STATE-building-(damaged|critical|wreck)$/.test(entry.id) ? ['base','bastion','turret','jammer','citadel'] : []);
      for (const kind of kinds) if (models.has(kind)) options.push({ id:'MODEL-'+kind, label:models.get(kind).name });
      source = options.some(o => o.id === choice) ? choice : options[0]?.id;
      if (source) model(source.slice(6));
      explanation = 'Это повторяемое задание. Выберите одно здание ниже и приложите его изображение. Выбранный новый дизайн будет подставлен вместо нынешней модели.';
    } else if (entry.id.startsWith('STATE-')) {
      const map = {
        'STATE-bunker-scout':['bunker','scout'],
        'STATE-extractor-delivery':['outpost','O01'], 'STATE-extractor-care':['outpost'], 'STATE-extractor-exit':['outpost'],
        'STATE-barracks-door':['barracks'], 'STATE-foundry-work':['foundry'], 'STATE-arsenal-work':['arsenal'],
        'STATE-drone-cargo':['drone','O01'], 'STATE-drone-repair':['drone'],
        'STATE-relay-active':['O03'], 'STATE-terminal-active':['O04'], 'STATE-citadel-vulnerable':['citadel']
      };
      for (const id of map[entry.id] || (entry.id.startsWith('STATE-bunker-') ? ['bunker'] : [])) id.startsWith('O') ? obj(id) : model(id);
    } else if (entry.id.startsWith('PREP-')) {
      const seam = entry.id === 'PREP-seam';
      for (const e of catalogue.entries) if ((seam ? /^T\d\d$/.test(e.id) : !e.id.startsWith('PREP-'))) options.push({ id:e.id,label:e.title });
      source = options.some(o => o.id === choice) ? choice : null;
      needsResult = true;
      if (source) add(null,byId.get(source).title,source,'Изображение для обработки');
      explanation = 'Этот шаг обрабатывает уже готовое изображение. Сначала загрузите и выберите результат основного задания: мастерская возьмёт его автоматически. Создавать отдельный референс не нужно.';
    }
    if (entry.cameraMode === 'high-tactical' || entry.cameraMode === 'match-approved') add('camera-guide.png','Высокая камера · 65° над землёй',null,'Только ракурс, не дизайн');
    if (!explanation) explanation = redesign ? 'Это схема назначения и компоновки. Форму можно переработать в цельный корпус, а камеру поднять до 65° над землёй по отдельной схеме. Выбранный новый вариант подставляется автоматически.' : 'Исходники уже подготовлены. Если в связанном задании выбран новый вариант, он появится здесь автоматически. Самостоятельно рисовать референс не нужно.';
    return { refs, options, source, optional, needsResult, explanation };
  }
  return { plan, extraFiles };
});
