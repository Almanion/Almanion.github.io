'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5v8l-9 5-9-5V8Zm-9 5 9 5 9-5M12 13v8"/></svg>';
  let catalogue, library = { items: {}, revision: -1 }, token, dataDir, current, filter = 'all', busy = false, toastTimer, refreshBusy = false;
  const drafts = new Map();
  const referenceChoices = new Map();
  const entries = () => catalogue?.entries || [];
  const record = id => library.items[id] || { selected: null, note: '', assets: [] };
  const alive = id => record(id).assets.filter(a => !a.archived);
  const chosen = id => alive(id).find(a => a.id === record(id).selected);
  const models = id => record(id).models || [];
  const chosenModel = id => models(id).find(a=>!a.archived && a.id===chosen(id)?.selectedModel && a.sourceImageId===chosen(id)?.id);
  const status = id => (entries().find(e=>e.id===id)?.assetType==='model' ? chosenModel(id) : chosen(id)) ? 'ready' : alive(id).length ? 'review' : 'empty';
  const size = bytes => bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + ' МиБ' : Math.max(1,Math.round(bytes/1024)) + ' КиБ';
  const meta = asset => `${asset.width} × ${asset.height} · ${size(asset.bytes)}`;
  function showToast(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
    toastTimer = setTimeout(() => $('toast').hidden = true, 4200);
  }
  function connection(ok) {
    $('connection').textContent = ok ? 'На этом компьютере' : 'Нет связи с мастерской';
    $('connection').classList.toggle('offline', !ok);
  }
  async function api(url, method = 'GET', body, retried = false) {
    let res;
    try { res = await fetch(url, { method, headers: { 'X-Art-Token': token || '', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
    catch { connection(false); throw Error('Мастерская не отвечает. Запустите её ярлыком и повторите действие.'); }
    const data = await res.json();
    if (res.status === 403 && !retried && method !== 'GET') {
      const session = await api('/api/session'); token = session.token;
      return api(url, method, body, true);
    }
    if (!res.ok) throw Error(data.error || 'Не удалось выполнить действие.');
    connection(true); return data;
  }
  async function copy(text, message = 'Скопировано') {
    let done = false;
    try { await navigator.clipboard.writeText(text); done = true; } catch {}
    if (!done) {
      const area = document.createElement('textarea'); area.value = text; area.setAttribute('aria-label','Текст для копирования');
      document.body.append(area); area.select();
      try { done = document.execCommand('copy'); } catch {}
      area.remove();
    }
    showToast(done ? message : 'Откройте полный промпт и скопируйте текст вручную.');
  }
  function acceptState(next) {
    if (next.revision < library.revision) return;
    library = next; renderList(); renderGallery(); renderReferences(); renderModels();
  }
  function referenceKind(entry) {
    const direct = entry.id.replace(/^(MODEL|CARD|MOTION)-/, '');
    if (catalogue.modelIndex.some(m => m.kind === direct)) return direct;
    return entry.ref.match(/references\/([a-z]+)\.png/)?.[1] || null;
  }
  function entryThumbnail(entry) {
    const asset = chosen(entry.id) || alive(entry.id).at(-1);
    if (asset) return '/previews/' + asset.id;
    const kind = referenceKind(entry);
    if (kind) return '/references/' + kind + '.png';
    const ref = SignalArtReferences.plan(entry,catalogue).refs.find(r=>r.file);
    return ref ? '/references/' + ref.file : null;
  }
  function renderList() {
    if (!catalogue) return;
    const q = $('search').value.trim().toLocaleLowerCase('ru'), category = $('category').value;
    const primary = entries(), ready = primary.filter(e => status(e.id) === 'ready').length;
    $('totals').textContent = `${catalogue.stats?.models ?? primary.filter(e=>e.assetType==='model').length} моделей · ${catalogue.stats?.textures ?? 0} текстур`;
    $('ready-count').textContent = ready; $('ready-count').title = 'Выбрано для работы';
    $('mobile-count').textContent = `${ready} выбрано для работы`;
    const visible = entries().filter(e => (!q || (e.id+' '+e.title+' '+e.category+' '+e.purpose).toLocaleLowerCase('ru').includes(q)) && (!category || e.category === category) && (filter === 'all' || status(e.id) === filter));
    $('list-count').textContent = `${visible.length} из ${entries().length}`;
    $('reset-filter').hidden = !q && !category && filter === 'all';
    const scroll = $('prompt-list').scrollTop;
    $('prompt-list').innerHTML = visible.map(e => {
      const image = entryThumbnail(e), st = status(e.id), amount = alive(e.id).length;
      return `<button class="entry" data-entry="${e.id}" aria-current="${current?.id === e.id}" title="${esc(e.title)}"><span class="entry-thumb">${image ? `<img src="${image}" alt="" loading="lazy">` : icon}</span><span class="entry-body"><strong>${esc(e.title)}</strong><small>${esc(e.id)}</small></span>${st !== 'empty' ? `<span class="entry-status ${st}">${chosenModel(e.id) ? '3D' : chosen(e.id) ? '2D' : amount}</span>` : ''}</button>`;
    }).join('') || '<p class="muted">Ничего не найдено. Сбросьте фильтры или измените запрос.</p>';
    $('prompt-list').scrollTop = scroll;
  }
  function select(id) {
    current = entries().find(e => e.id === id || e.id === catalogue.aliases?.[id]) || entries().find(e => e.id === 'MODEL-outpost') || entries()[0];
    history.replaceState(null, '', '#' + current.id);
    document.body.classList.remove('nav-open'); $('catalogue-toggle').setAttribute('aria-expanded','false');
    renderDetail(); renderList();
    const list=$('prompt-list'), active=list.querySelector('[aria-current="true"]');
    if(active){const box=active.getBoundingClientRect(),bounds=list.getBoundingClientRect();if(box.top<bounds.top)list.scrollTop-=bounds.top-box.top;else if(box.bottom>bounds.bottom)list.scrollTop+=box.bottom-bounds.bottom;}
  }
  function pageNavigation(e) {
    const sequence=entries().filter(p=>p.assetType===e.assetType),index=sequence.findIndex(p=>p.id===e.id);
    const button=(p,back)=>`<button class="page-link ${back?'previous':'next'}" ${p?`data-page="${p.id}"`:'disabled'}><span>${back?'← Назад':'Далее →'}</span><small>${esc(p?.title || (back?'Начало списка':'Конец списка'))}</small></button>`;
    return `<nav class="page-navigation" aria-label="Переход между ${e.assetType==='model'?'моделями':'текстурами'}">${button(sequence[index-1],true)}<span class="page-position">${e.assetType==='model'?'Модель':'Текстура'}<strong>${index+1} <i>/ ${sequence.length}</i></strong></span>${button(sequence[index+1],false)}</nav>`;
  }
  const number=value=>value.toLocaleString('ru');
  function geometryPanel(e) {
    const g=e.geometry;if(!g)return `<div class="texture-budget"><strong>Только изображение · 3D-модель не нужна</strong><span>${esc(e.format)}</span></div>`;
    return `<section class="geometry-panel" aria-label="Рекомендуемая геометрия"><div class="geometry-heading"><h3>Ориентир для игровой модели</h3><button id="copy-model-brief" class="text-button">Копировать требования к 3D</button></div><div class="geometry-stats"><div><small>Треугольники · GLB</small><strong>${number(g.triangles.min)}–${number(g.triangles.max)}</strong></div><div><small>Четырёхугольники · Blender</small><strong>≈ ${number(g.quads.min)}–${number(g.quads.max)}</strong></div><div><small>Цель для первого ремеша</small><strong>${number(g.triangles.target)} <em>треуг.</em></strong></div><div><small>Текстуры / материалы</small><strong>${g.textureSize/1024}K <em>/ 1–${g.materials}</em></strong></div></div><p>${esc(g.reason)}</p><details><summary>Как пользоваться этими числами</summary><p>Это рекомендация для готовой игровой копии, не ограничение загрузки. Более подробный мастер можно сохранить здесь и упростить позже. Если сетка почти целиком состоит из квадов, один четырёхугольник обычно даёт два треугольника. В смешанной сетке проверяйте итоговый GLB. Производительность также зависит от материалов, текстур, анимаций и числа объектов в кадре.</p></details></section>`;
  }
  function renderDetail() {
    if (!current) return;
    const e = current;
    const isModel=e.assetType==='model';
    $('detail').innerHTML = `${pageNavigation(e)}<div class="detail-heading"><div><div class="eyebrow">${esc(e.category)} · ${esc(e.id)}</div><h2>${esc(e.title)}</h2><p class="purpose">${esc(e.purpose)}</p></div><span class="kind-badge">${isModel ? 'Изображение → 3D' : 'Текстура'}</span></div>
      ${geometryPanel(e)}
      <section class="work-stage"><div class="stage-heading"><span class="stage-number">01</span><div><h3>Изображение${isModel ? ' для генерации 3D' : ''}</h3><p>Загрузите результат и отметьте лучший вариант.</p></div></div>
      <div class="generation-actions"><button id="copy-prompt" class="button">Копировать промпт</button><a class="button secondary" href="/api/generation-kit/${e.id}" download>Скачать всё для генерации · ZIP</a></div><div class="generation-workbench"><div class="generation-prompt"><h4>Самостоятельный промпт</h4><p>Скопируйте весь текст в генератор изображений.</p><pre id="standalone-prompt" tabindex="0">${esc(e.prompt)}</pre><div class="generation-check"><strong>Проверить результат</strong><p>${esc(e.check)}</p></div></div><aside class="generation-references"><h4>Материалы для этой картинки</h4><div id="reference-list" class="reference-list"></div></aside></div>
      <section class="upload-panel compact-upload" id="drop-zone" aria-label="Загрузка изображений"><div class="upload-copy"><strong>Добавить изображение</strong><p>Перетащите файл или вставьте через Ctrl+V</p><small>PNG, JPEG, WebP · до 32 МиБ</small></div><button id="choose-files" class="button secondary">Выбрать изображение</button><input id="file-input" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden></section>
      <div class="variants-head"><h3>Варианты <span id="variant-count"></span></h3><span class="muted" id="selection-note"></span></div><div id="gallery" class="gallery"></div><div id="empty-variants" class="empty-variants"><strong>Первый шаг — изображение</strong>Скопируйте промпт выше, создайте рисунок и загрузите результат.</div><details id="archive" class="archive" hidden><summary id="archive-label"></summary><div id="archive-gallery" class="gallery"></div></details>
      </section>
      ${isModel ? '<section class="work-stage model-stage"><div class="stage-heading"><span class="stage-number">02</span><div><h3>3D-модель по изображению</h3><p>GLB для игры · BLEND для дальнейшего редактирования</p></div></div><div id="model-content"></div></section>' : ''}
      <section class="notes"><label for="note">Заметка к объекту</label><textarea id="note" maxlength="8000" placeholder="Что сохранить, что доработать"></textarea><div class="note-actions"><span id="note-state">Заметка доступна при дальнейшей работе над игрой</span><button id="save-note" class="button secondary small">Сохранить заметку</button></div></section>${pageNavigation(e)}`;
    if($('copy-model-brief'))$('copy-model-brief').onclick=()=>copy(e.modelBrief,'Требования к 3D скопированы');
    $('note').value = drafts.get(e.id) ?? record(e.id).note;
    $('note').addEventListener('input', () => { drafts.set(e.id, $('note').value); $('note-state').textContent = 'Есть несохранённые изменения'; });
    $('copy-prompt').onclick=()=>copy(e.prompt,'Самостоятельный промпт скопирован. Материалы — рядом или в ZIP.');
    $('choose-files').onclick = () => $('file-input').click();
    $('file-input').onchange = event => { const files = [...event.target.files]; event.target.value = ''; upload(files, e); };
    $('save-note').onclick = async () => {
      const button = $('save-note'), value = $('note').value; button.disabled = true;
      try { const data = await api('/api/prompt/' + e.id, 'PUT', { note: value }); acceptState(data.library); if (drafts.get(e.id) === value) drafts.delete(e.id); if (current.id === e.id) $('note-state').textContent = 'Заметка сохранена на компьютере'; showToast('Заметка сохранена'); }
      catch (error) { showToast(error.message); }
      finally { if (button.isConnected) button.disabled = false; }
    };
    const zone = $('drop-zone'); let depth = 0;
    zone.addEventListener('dragenter', event => { if (![...event.dataTransfer.types].includes('Files')) return; event.preventDefault(); depth++; zone.classList.add('dragging'); });
    zone.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
    zone.addEventListener('dragleave', () => { if (--depth <= 0) zone.classList.remove('dragging'); });
    zone.addEventListener('drop', event => { event.preventDefault(); depth = 0; zone.classList.remove('dragging'); upload([...event.dataTransfer.files], e); });
    renderReferences(); renderGallery(); renderModels();
  }
  function activeReferencePlan() {
    let plan = SignalArtReferences.plan(current,catalogue,referenceChoices.get(current.id));
    if (plan.needsResult) {
      const options = plan.options.filter(o=>chosen(o.id));
      const source = options.some(o=>o.id===plan.source) ? plan.source : options[0]?.id;
      plan = SignalArtReferences.plan(current,catalogue,source);
      plan.options = options;
      if (source) plan.explanation = 'Выбранный результат уже подставлен ниже. Скачайте его и приложите при обработке. При необходимости можно выбрать другой готовый результат; отдельный референс рисовать не нужно.';
    }
    return plan;
  }
  function renderReferences() {
    if (!$('reference-list') || !current) return;
    const plan = activeReferencePlan(), refs = [];
    for (const ref of plan.refs) {
      const asset = ref.sourceId && chosen(ref.sourceId);
      if (asset) refs.push({ image:'/previews/'+asset.id, full:'/files/'+asset.id, title:'Ваш выбранный рисунок', caption:'Образец для сохранения внешнего вида' });
      else if (ref.file && !refs.some(r=>r.full==='/references/'+ref.file)) refs.push({ image:'/references/'+ref.file, full:'/references/'+ref.file, title:ref.label||'Образец', caption:ref.role||'Цвет и материалы' });
    }
    const waiting = plan.needsResult && !plan.source;
    const tag = plan.optional ? 'Можно без референса' : waiting ? 'Сначала готовый результат' : 'Изображения подготовлены';
    const selector = plan.options.length ? `<label class="ref-source-label" for="reference-source">${plan.needsResult ? 'Какой результат обработать' : 'Для какого здания'}</label><select id="reference-source">${plan.options.map(o=>`<option value="${o.id}" ${o.id===plan.source?'selected':''}>${esc(o.label)}</option>`).join('')}</select>` : '';
    const start = waiting ? `<button class="text-button" data-entry="${current.id==='PREP-seam'?'T01':'MODEL-outpost'}">Открыть основное задание →</button>` : '';
    const card = r => `<div class="ref-item"><a class="ref-image" href="${r.full}" data-reference="${r.full}" data-title="${esc(r.title)}"><img src="${r.image}" alt="${esc(r.title)}" loading="lazy"></a><div class="ref-caption"><strong>${esc(r.title)}</strong><small>${esc(r.caption)}</small><a href="${r.full}?download=1" download>Скачать референс</a></div></div>`;
    $('reference-list').innerHTML = `<div class="reference-help"><strong>Все материалы на этой странице</strong><p>Приложите нужные образцы к запросу или скачайте весь комплект выше. Промпт можно использовать и без картинок.</p></div>` + refs.map(card).join('');
    $('copy-prompt').disabled = waiting;
    $('copy-prompt').title = waiting ? 'Сначала загрузите и выберите изображение в основном задании' : '';
    if ($('reference-source')) $('reference-source').onchange = event => { referenceChoices.set(current.id,event.target.value); renderReferences(); };
  }
  function variantCard(asset, archived = false) {
    const selected = record(current.id).selected === asset.id;
    return `<article class="variant ${selected ? 'chosen' : ''}"><button class="variant-image checker" data-view="${asset.id}" aria-label="Открыть ${esc(asset.filename)}"><img src="/previews/${asset.id}" alt="${esc(asset.filename)}" loading="lazy">${selected ? '<span class="chosen-label">Выбран для работы</span>' : ''}</button><div class="variant-body"><p class="filename" title="${esc(asset.filename)}">${esc(asset.filename)}</p><p class="variant-meta">${meta(asset)}</p><div class="variant-actions">${current.legacy && !archived ? `<button class="button secondary small" data-copy="${asset.id}">Копировать в карточку</button>` : ''}${archived ? `<button class="button secondary small" data-restore="${asset.id}">Вернуть</button>` : `<button class="button ${selected ? 'secondary' : ''} small" data-select="${asset.id}" aria-pressed="${selected}">${selected ? 'Основа выбрана ✓' : 'Выбрать основой'}</button><button class="text-button" data-archive="${asset.id}" aria-label="В архив: ${esc(asset.filename)}">В архив</button>`}</div></div></article>`;
  }
  function renderGallery() {
    if (!$('gallery') || !current) return;
    const files = alive(current.id), archived = record(current.id).assets.filter(a => a.archived);
    $('variant-count').textContent = files.length ? String(files.length) : '';
    $('selection-note').textContent = chosen(current.id) ? 'Вариант для дальнейшей работы выбран' : files.length ? (current.assetType==='model'?'Выберите основу для модели':'Выберите текстуру') : '';
    $('gallery').innerHTML = files.slice().reverse().map(a => variantCard(a)).join('');
    $('empty-variants').hidden = !!files.length;
    $('archive').hidden = !archived.length; $('archive-label').textContent = `Архив · ${archived.length}`;
    $('archive-gallery').innerHTML = archived.slice().reverse().map(a => variantCard(a,true)).join('');
  }
  function renderModels() {
    if (!$('model-content')) return;
    const entry=current, source=chosen(entry.id);
    if (!source) {
      $('model-content').innerHTML='<div class="model-placeholder">'+icon+'<strong>Сначала выберите изображение основой</strong><p>После этого здесь можно загрузить созданную по нему модель.<br>Готовые GLB и исходники Blender не потеряются при смене рисунка.</p></div>';
      return;
    }
    const linked=models(entry.id).filter(a=>a.sourceImageId===source.id), active=linked.filter(a=>!a.archived), archived=linked.filter(a=>a.archived);
    const card=a=>{
      const selected=source[a.role==='source'?'selectedSource':'selectedModel']===a.id && !a.archived;
      const stats=a.ext==='glb' ? `${a.triangles.toLocaleString('ru')} треуг. · ${a.textures} текстур · ${a.animations} анимаций` : 'Редактируемый исходник · открывается в Blender';
      const budget=entry.geometry?.triangles;
      const budgetHint=a.ext==='glb' && budget ? (a.triangles>budget.max ? `<small class="geometry-fit over">Выше ориентира ${number(budget.max)}: оригинал можно оставить, для игры подготовить облегчённую копию.</small>` : `<small class="geometry-fit">${a.triangles<budget.min?'Ниже ориентира — проверьте сохранность силуэта.':'Геометрия в рекомендуемом диапазоне.'}</small>`) : '';
      return `<article class="model-card ${selected?'chosen':''}"><div class="model-file-symbol">${icon}<span>${a.ext.toUpperCase()}</span></div><div class="model-file-info"><strong title="${esc(a.filename)}">${esc(a.filename)}</strong><small>${size(a.bytes)} · ${esc(stats)}</small><span class="model-status">${selected ? (a.role==='source'?'Выбранный исходник':'Выбранная модель для игры') : a.archived ? 'В архиве' : a.role==='source'?'Исходник Blender':'Вариант модели'}</span>${budgetHint}</div><div class="model-actions">${a.ext==='glb'?`<button class="button secondary small" data-model-view="${a.id}">Осмотреть 3D</button>`:''}<a class="text-button" href="/models/${a.id}?download=1" download>Скачать</a>${a.archived?`<button class="text-button" data-model-restore="${a.id}">Вернуть</button>`:`<button class="button ${selected?'secondary':''} small" data-model-select="${a.id}" aria-pressed="${selected}">${selected?'Снять выбор':'Выбрать'}</button><button class="text-button" data-model-archive="${a.id}">В архив</button>`}</div></article>`;
    };
    const otherSources=record(entry.id).assets.filter(i=>!i.archived && i.id!==source.id && models(entry.id).some(m=>m.sourceImageId===i.id && !m.archived));
    $('model-content').innerHTML=`<div class="model-source"><button class="source-preview checker" data-view="${source.id}" aria-label="Открыть исходное изображение"><img src="/previews/${source.id}" alt="Выбранное изображение"></button><div><span class="eyebrow">Основа этой модели</span><strong>${esc(source.filename)}</strong><p>Прикрепляем файлы только к этому рисунку.</p><a href="/files/${source.id}?download=1" download>Скачать изображение для Meshy</a></div></div><div class="model-instructions"><strong>Создайте модель по выбранному рисунку</strong><p>Загрузите изображение в генератор 3D. Готовый результат экспортируйте в <b>GLB с текстурами</b> и добавьте ниже. Если дорабатывали модель в Blender, сохраните здесь и <b>BLEND</b>. Можно хранить несколько версий и выбрать GLB и исходник независимо.</p></div><section id="model-drop-zone" class="upload-panel compact-upload"><div class="upload-copy"><strong>Добавить 3D-файлы</strong><p>Перетащите модель и исходник сюда</p><small>GLB, BLEND · до 128 МиБ каждый · без изменения оригиналов</small></div><button id="choose-model-files" class="button">Выбрать 3D-файлы</button><input id="model-file-input" type="file" accept=".glb,.blend" multiple hidden></section><div class="model-list">${active.map(card).join('') || '<p class="model-empty">Для этого изображения пока нет моделей.</p>'}</div>${archived.length?`<details class="archive"><summary>Архив 3D-файлов · ${archived.length}</summary><div class="model-list">${archived.map(card).join('')}</div></details>`:''}${otherSources.length?`<details class="other-sources"><summary>Модели по другим изображениям · ${otherSources.length}</summary><p>Выберите соответствующий рисунок основой, чтобы открыть его модели.</p>${otherSources.map(i=>`<button class="text-button" data-source-select="${i.id}">${esc(i.filename)}</button>`).join('')}</details>`:''}<p class="integration-note">Выбор сохраняется для дальнейшей работы. Загрузка не заменяет объект в игре автоматически; материалы, масштаб и анимации проверяются при внедрении.</p>`;
    $('choose-model-files').onclick=()=>$('model-file-input').click();
    $('model-file-input').onchange=event=>{const files=[...event.target.files];event.target.value='';upload(files,entry,source.id);};
    const zone=$('model-drop-zone');
    zone.ondragover=event=>{event.preventDefault();zone.classList.add('dragging');};
    zone.ondragleave=()=>zone.classList.remove('dragging');
    zone.ondrop=event=>{event.preventDefault();zone.classList.remove('dragging');upload([...event.dataTransfer.files],entry,source.id);};
  }
  async function thumbnail(file) {
    if (file.size > 32 * 1024 * 1024) throw Error('Файл больше 32 МиБ. Экспортируйте более компактный PNG, JPEG или WebP.');
    let bitmap;
    try { bitmap = await createImageBitmap(file); } catch { throw Error('Не удалось прочитать картинку. Используйте PNG, JPEG или WebP.'); }
    try {
      if (bitmap.width * bitmap.height > 40_000_000 || bitmap.width > 16384 || bitmap.height > 16384) throw Error('Максимум 40 мегапикселей и 16 384 px по стороне.');
      const scale = Math.min(1,512/Math.max(bitmap.width,bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1,Math.round(bitmap.width*scale)); canvas.height = Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      return await new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Не удалось подготовить превью.')), 'image/webp', .86));
    } finally { bitmap.close(); }
  }
  function transfer(file, preview, entry, onProgress, sourceImageId) {
    return new Promise((resolve,reject) => {
      const request = new XMLHttpRequest(); request.open('POST',sourceImageId ? '/api/upload-model/'+entry.id+'/'+sourceImageId : '/api/upload/'+entry.id); request.timeout = 120000;
      request.setRequestHeader('X-Art-Token',token); request.setRequestHeader('X-File-Name',encodeURIComponent(file.name || 'clipboard.png'));
      request.setRequestHeader('X-Preview-Bytes',String(preview?.size || 0)); request.setRequestHeader('Content-Type','application/octet-stream');
      request.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded/event.total*100)); };
      request.onload = () => { try { const data = JSON.parse(request.responseText); if (request.status >= 200 && request.status < 300) resolve(data); else reject(Error(data.error || 'Ошибка загрузки.')); } catch { reject(Error('Не удалось прочитать ответ мастерской.')); } };
      request.onerror = () => { connection(false); reject(Error('Нет связи с мастерской. Исходный файл остался у вас; повторите загрузку.')); };
      request.ontimeout = () => reject(Error('Загрузка заняла слишком много времени. Повторите попытку.'));
      request.send(preview ? new Blob([file,preview]) : file);
    });
  }
  async function upload(files, entry, sourceImageId) {
    if (!files.length || !entry) return;
    if (busy) { showToast('Дождитесь окончания текущей загрузки, затем добавьте следующие файлы.'); return; }
    busy = true; $('upload-progress').hidden = false; $('notice').hidden = true;
    let added = 0, duplicate = 0; const errors = [];
    try {
      const session = await api('/api/session'); token = session.token;
      for (const [i,file] of files.entries()) {
        $('upload-progress').querySelector('span').textContent = `В «${entry.title}» · ${i+1}/${files.length} · ${file.name || 'изображение из буфера'}`;
        const bar = $('upload-progress').querySelector('progress'); bar.value = 0;
        try {
          if (sourceImageId && file.size>128*1024*1024) throw Error('Максимум 128 МиБ на 3D-файл.');
          if (sourceImageId && !/\.(glb|blend)$/i.test(file.name)) throw Error('Нужен GLB или BLEND. Изображения загружаются на первом шаге.');
          const preview = sourceImageId ? null : await thumbnail(file), data = await transfer(file,preview,entry,value=>bar.value=value,sourceImageId);
          acceptState(data.library); connection(true); if (data.duplicate) duplicate++; else added++;
        } catch (error) { errors.push((file.name || 'Изображение') + ': ' + error.message); }
      }
    } catch (error) { errors.push(error.message); }
    finally { busy = false; $('upload-progress').hidden = true; }
    if (errors.length) { $('notice').textContent = errors.join(' · '); $('notice').hidden = false; }
    if (added || duplicate) showToast(added ? `Сохранено: ${added}. Объект: ${entry.title}.` : 'Этот файл уже есть у объекта. Сохранённый вариант показан в списке.');
  }
  function openViewer(url, title, info = '') {
    $('viewer-title').textContent = title; $('viewer-info').textContent = info;
    $('viewer-image').src = url; $('viewer-image').alt = title; $('viewer-download').href = url + '?download=1';
    $('viewer').showModal();
  }
  async function load() {
    try {
      const data = await api('/api/state'); catalogue = data.catalogue; library = data.library; token = data.token; dataDir = data.dataDir;
      $('storage-path').value = dataDir;
      $('category').innerHTML = '<option value="">Все разделы</option>' + [...new Set(entries().map(e=>e.category))].map(c=>`<option>${esc(c)}</option>`).join('');
      select(location.hash.slice(1));
    } catch (error) {
      $('detail').innerHTML = `<div class="loading"><h2>Мастерская пока недоступна</h2><p>${esc(error.message)}</p><button id="retry" class="button">Повторить</button></div>`;
      $('retry').onclick = load;
    }
  }
  let modelController, modelPreview;
  function closeModel() {modelController?.abort();modelPreview?.dispose();modelPreview=null;}
  async function inspectModel(asset) {
    closeModel();modelController=new AbortController();const controller=modelController;
    $('model-viewer-title').textContent=asset.filename;$('model-download').href='/models/'+asset.id+'?download=1';
    $('model-viewer-status').textContent='Загрузка модели…';$('model-viewer-status').hidden=false;
    $('model-reset').disabled=true;$('model-viewer').showModal();
    try {
      const {openModel}=await import('/model-viewer.js');if(controller.signal.aborted)return;
      const preview=await openModel($('model-canvas'),'/models/'+asset.id,controller.signal);
      if(controller.signal.aborted){preview.dispose();return;}
      modelPreview=preview;$('model-viewer-status').hidden=true;$('model-reset').disabled=false;
    } catch(error) {
      if(!controller.signal.aborted) $('model-viewer-status').textContent='Не удалось показать модель. Файл сохранён; его можно скачать и открыть в Blender. '+error.message;
    }
  }
  document.addEventListener('click', async event => {
    const pageButton=event.target.closest('[data-page]');
    if(pageButton){select(pageButton.dataset.page);window.scrollTo({top:0,behavior:'instant'});const heading=$('detail').querySelector('h2');heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});return;}
    const entryButton = event.target.closest('[data-entry]'); if (entryButton) return select(entryButton.dataset.entry);
    const modelView=event.target.closest('[data-model-view]');
    if(modelView)return inspectModel(models(current.id).find(a=>a.id===modelView.dataset.modelView));
    const modelAction=event.target.closest('[data-model-select],[data-model-archive],[data-model-restore]');
    if(modelAction){
      const id=modelAction.dataset.modelSelect || modelAction.dataset.modelArchive || modelAction.dataset.modelRestore;
      const asset=models(current.id).find(a=>a.id===id), source=record(current.id).assets.find(a=>a.id===asset.sourceImageId);
      const body=modelAction.dataset.modelSelect ? {selected:source[asset.role==='source'?'selectedSource':'selectedModel']!==id} : {archived:!!modelAction.dataset.modelArchive};
      modelAction.disabled=true;
      try{acceptState((await api('/api/model/'+id,'PATCH',body)).library);showToast(body.archived?'Файл в архиве. Оригинал сохранён.':'Выбор 3D-файла сохранён');}
      catch(error){showToast(error.message);modelAction.disabled=false;}
      return;
    }
    const sourceButton=event.target.closest('[data-source-select]');
    if(sourceButton){try{acceptState((await api('/api/prompt/'+current.id,'PUT',{selected:sourceButton.dataset.sourceSelect})).library);}catch(error){showToast(error.message);}return;}
    const copyButton = event.target.closest('[data-copy]');
    if (copyButton) {
      const target=$('copy-target')?.value; if (!target) return showToast('Выберите карточку назначения.');
      copyButton.disabled=true;
      try { const data=await api('/api/copy-asset','POST',{asset:copyButton.dataset.copy,target}); acceptState(data.library); select(target); showToast('Рисунок скопирован. Выберите лучший вариант в этой карточке.'); }
      catch(error) {showToast(error.message);copyButton.disabled=false;}
      return;
    }
    const ref = event.target.closest('[data-reference]'); if (ref) { event.preventDefault(); return openViewer(ref.dataset.reference,ref.dataset.title,'Референс для генерации'); }
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) { const asset = record(current.id).assets.find(a=>a.id===viewButton.dataset.view); return openViewer('/files/'+asset.id,asset.filename,meta(asset)); }
    const action = event.target.closest('[data-select],[data-archive],[data-restore]');
    if (action) {
      const id = current.id; action.disabled = true;
      try {
        let data;
        if (action.dataset.select) {
          const selected = record(id).selected === action.dataset.select ? null : action.dataset.select;
          data = await api('/api/prompt/'+id,'PUT',{selected}); showToast(selected ? 'Вариант выбран для дальнейшей работы над игрой' : 'Выбор снят');
        } else { const archived = !!action.dataset.archive; data = await api('/api/asset/'+(action.dataset.archive || action.dataset.restore),'PATCH',{archived}); showToast(archived ? 'Вариант перемещён в архив. Оригинал сохранён.' : 'Вариант возвращён'); }
        acceptState(data.library);
      } catch (error) { showToast(error.message); if (action.isConnected) action.disabled = false; }
    }
    const bg = event.target.closest('[data-bg]'); if (bg) {
      $('viewer-stage').className = 'viewer-stage ' + bg.dataset.bg;
      document.querySelectorAll('[data-bg]').forEach(b=>b.setAttribute('aria-pressed',String(b===bg)));
    }
  });
  $('search').addEventListener('input',renderList); $('category').addEventListener('change',renderList);
  $('status-tabs').addEventListener('click',event=>{ const button = event.target.closest('[data-status]'); if (!button) return; filter=button.dataset.status; document.querySelectorAll('[data-status]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderList(); });
  $('reset-filter').onclick = () => { $('search').value=''; $('category').value=''; filter='all'; document.querySelectorAll('[data-status]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.status==='all')));renderList(); };
  $('catalogue-toggle').onclick = () => { const open=document.body.classList.toggle('nav-open'); $('catalogue-toggle').setAttribute('aria-expanded',String(open)); };
  $('viewer-close').onclick = () => $('viewer').close(); $('viewer').addEventListener('close',()=>$('viewer-image').removeAttribute('src'));
  $('model-viewer-close').onclick=()=>$('model-viewer').close();$('model-viewer').addEventListener('close',closeModel);
  $('model-reset').onclick=()=>modelPreview?.reset();
  $('storage-button').onclick = () => $('storage').showModal(); $('storage-close').onclick = () => $('storage').close(); $('copy-path').onclick = () => copy(dataDir,'Путь к папке скопирован');
  document.addEventListener('paste',event=>{ if (!current || event.target.closest('input,textarea,[contenteditable]') || $('viewer').open || $('storage').open || $('model-viewer').open) return; const files=[...event.clipboardData.items].filter(i=>i.kind==='file').map(i=>i.getAsFile()).filter(Boolean); if (files.length) {event.preventDefault();upload(files,current);} });
  document.addEventListener('dragover',event=>{ if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); });
  document.addEventListener('drop',event=>{ if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); });
  window.addEventListener('beforeunload',event=>{ if (busy || [...drafts].some(([id,note])=>note!==record(id).note)) { event.preventDefault(); event.returnValue=''; } });
  window.addEventListener('hashchange',()=>catalogue && select(location.hash.slice(1)));
  async function refresh() {
    if (!catalogue || document.hidden || refreshBusy || busy) return;
    refreshBusy = true;
    try { const data = await api('/api/library'); if (data.library.revision > library.revision) acceptState(data.library); } catch {} finally { refreshBusy=false; }
  }
  setInterval(refresh,15000); window.addEventListener('focus',refresh);
  load();
})();
