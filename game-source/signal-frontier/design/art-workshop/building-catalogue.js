'use strict';

// Slots have permanent IDs; old shared tasks and their uploads remain intact.
function expandBuildings(catalogue) {
  const entries = catalogue.entries, originals = [...entries];
  const turns = [[0,'Вход вниз'],[90,'Вход вправо'],[180,'Вход вверх'],[270,'Вход влево']];
  for (const model of catalogue.modelIndex.filter(m => m.building)) {
    const base = entries.find(e => e.id === 'MODEL-'+model.kind);
    if (!base) continue;
    base.buildingKind = model.kind;
    const templates = originals.filter(e => {
      if (e.id.startsWith('STATE-building-') || e.id.startsWith('PREP-turn-')) {
        return (e.referenceGuide?.options || []).some(o => o.id === base.id);
      }
      return e.id.startsWith('STATE-') && (e.referenceGuide?.refs || []).some(r => r.sourceId === base.id);
    }).filter(e => !e.id.startsWith('PREP-turn-'));
    const states = [{id:'ready',title:'Готовое здание',template:base}, ...templates.map(e=>({id:e.id,title:e.title.replace(/ — один утверждённый корпус$/, ''),template:e}))];
    for (const [angle,direction] of turns) for (const state of states) {
      if (angle === 0 && state.id === 'ready') continue;
      const template = state.template;
      const turn = originals.find(e=>e.id === 'PREP-turn-'+angle);
      const id = 'BUILD-'+model.kind+'-'+state.id+'-'+angle;
      if (entries.some(e=>e.id===id)) continue;
      entries.push({...template,id,title:model.name+' · '+state.title+' · '+direction.toLowerCase(),
        category:'Варианты построек',priority:'Дополнительно',buildingKind:model.kind,
        templateId:state.id==='ready' && turn ? turn.id : template.id,stateId:state.id,directionDegrees:angle,directionLabel:direction,stateLabel:state.title,
        purpose:'Отдельный рисунок и выбор для этой постройки, направления и состояния. Художественный образец для Babylon.js; дополнительный спрайт для Canvas.',
        prompt:(state.id==='ready' && turn ? turn.prompt : template.prompt.split('\n\n').filter(p=>!p.startsWith('ЕДИНАЯ ОРИЕНТАЦИЯ СОСТОЯНИЙ.')).join('\n\n'))+'\n\nКОНКРЕТНОЕ ЗАДАНИЕ: '+model.name+'. Состояние: '+state.title+'. '+direction+'. Использовать выбранный основной дизайн '+base.id+'. Сохранить конструкцию, масштаб и материалы. Камера неподвижна, высокая, 65° над землёй; меняется ориентация здания вокруг вертикальной оси. При работе над стадией стройки сохранить направление выбранного готового здания. Поворот объекта '+angle+'° от входа вниз; не поворачивать плоское изображение и не отражать его. Скрытая дверь может оставаться скрытой; не обходить здание камерой. Не возвращать вход вниз, если задано другое направление.',
        cameraNote:'Камера фиксирована, 65° над землёй, без крена. '+direction+'.',
        designFreedom:'preserve',cameraMode:'match-approved',objectYawDegrees:angle});
    }
  }
  const replaced = new Set(entries.filter(e=>e.id.startsWith('BUILD-')).map(e=>e.templateId));
  for (const entry of originals) if (replaced.has(entry.id) && !entry.id.startsWith('MODEL-')) {
    entry.legacyShared = true;
    entry.category = 'Прежние общие задания';
    entry.purpose = 'Сохранённые общие загрузки. Перенесите нужные рисунки в отдельные карточки построек кнопкой «Копировать в карточку»; оригиналы останутся здесь.';
  }
  return catalogue;
}
module.exports = { expandBuildings };
