(function () {
    'use strict';
    const main = document.getElementById('watchMain'), heading = document.getElementById('watchHeading');
    const back = document.getElementById('watchBack'), controls = document.querySelector('.watch-controls');
    const storageKey = 'almanion-watch-v1', requests = new Map();
    const TYPES = { definition:'Определение', theorem:'Теорема', lemma:'Лемма', statement:'Утверждение', formula:'Формула', corollary:'Следствие', properties:'Свойства', proof:'Доказательство', derivation:'Вывод', experiment:'Опыт', remark:'Замечание', example:'Пример', exercise:'Упражнение', reminder:'Напоминание', system:'Система', stress:'Ударение' };
    let preferences = {}, catalogue, active, media = [], returnTo = '#home', savedScroll = null, generation = 0, mathPromise, qrPromise, reader, swipe, connectionClient, favoriteSignature = '';
    try { preferences = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch (_) {}
    preferences.scale = Math.max(.8, Math.min(1.8, Number(preferences.scale) || 1));
    preferences.grade = [9,10,11].includes(preferences.grade) ? preferences.grade : 10;
    preferences.theme = preferences.theme === 'light' ? 'light' : 'dark';
    preferences.favoritesOnly = preferences.favoritesOnly === true;
    function save() { try { localStorage.setItem(storageKey, JSON.stringify(preferences)); } catch (_) {} }
    function apply() { document.documentElement.dataset.theme = preferences.theme; document.documentElement.style.setProperty('--size', preferences.scale); document.querySelector('meta[name="theme-color"]').content = preferences.theme === 'light' ? '#fbfbfe' : '#000000'; }
    apply();
    let favoriteStore;
    try {
        const key = 'almanion_bookmarks_guest';
        if (!localStorage.getItem(key) && localStorage.getItem('almanion_bookmarks')) localStorage.setItem(key, localStorage.getItem('almanion_bookmarks'));
    } catch (_) {}
    if (window.AlmanionDataSync) favoriteStore = window.AlmanionDataSync.createCollection({namespace:'bookmarks',owner:'guest',storageKey:'almanion_bookmarks_guest'});
    function favorites() { favoriteStore?.refreshFromStorage(); return favoriteStore?.snapshot() || {}; }
    const favoriteKey = (id, block) => id + '__b__' + encodeURIComponent(block);
    function isFavorite(id, block, records) { const entry = (records || favorites())[favoriteKey(id,block)]; return !!entry && !entry.deleted && !entry.noteOnly; }
    function visibleIndexes(data,topic) {
        if (!preferences.favoritesOnly) return Array.from({length:topic.count},(_,index) => index);
        const records = favorites();
        return (topic.ids || []).flatMap((id,index) => isFavorite(data.id,id,records) ? [index] : []);
    }
    function filterButtons(parent, changed) {
        const row = element('div', undefined, 'watch-grid watch-filter');
        for (const [only,title] of [[false,'Все'],[true,'Избранные']]) {
            const control = button(title, () => { preferences.favoritesOnly = only; save(); update(); changed(); },row);
            control.dataset.only = String(only);
        }
        function update() { for (const control of row.children) { const selected = control.dataset.only === String(preferences.favoritesOnly); control.classList.toggle('active',selected); control.setAttribute('aria-pressed',String(selected)); } }
        update(); parent.append(row); return row;
    }
    function favoriteButton(parent, context = active, compact = false) {
        if (!context?.block) return;
        const {data,topic,block} = context, key = favoriteKey(data.id,block.id);
        const control = button(isFavorite(data.id,block.id) ? '★ В избранном' : '☆ В избранное', () => {
            if (!favoriteStore) return;
            const existing = favorites()[key];
            if (isFavorite(data.id,block.id)) {
                if (existing.noteText) favoriteStore.set(key,{...existing,noteOnly:true}); else favoriteStore.remove(key,existing);
            } else {
                const template = document.createElement('template'); template.innerHTML = block.html;
                const text = template.content.textContent.replace(/\s+/g,' ').trim();
                const source = template.content.firstElementChild;
                const regular = source?.matches('.definition-box,.formula-box,.theorem-box,.remark-box,.lemma-box,.example-box,.statement-box,.corollary-box,.properties-box,.experiment-box,.derivation-box,.system-box') && (source.getAttribute('data-note-block') || source.getAttribute('data-kc-id')) === block.id;
                favoriteStore.set(key,{...existing,deleted:false,noteOnly:false,page:regular ? '/' + data.page : new URL('./',location.href).pathname,pageTitle:data.title,topicId:regular ? topic.id : 'bookmark/' + [data.id,block.id].map(encodeURIComponent).join('/'),topicTitle:topic.title,blockKey:block.id,type:block.type,title:template.content.querySelector('strong,b')?.textContent.trim().slice(0,140) || text.slice(0,140),preview:text.slice(0,320),timestamp:existing?.timestamp || Date.now()});
            }
            if (reader && reader.token === generation && route()[0] === 'read') {
                if (preferences.favoritesOnly) { rememberScroll(); render(); }
                else { update(); selectBlock(context.index); }
            } else render();
        },parent,isFavorite(data.id,block.id) ? 'Убрать из избранного' : 'Добавить в избранное');
        function update() {
            const saved = isFavorite(data.id,block.id);
            control.textContent = compact ? saved ? '★' : '☆' : saved ? '★ В избранном' : '☆ В избранное';
            control.setAttribute('aria-pressed',String(saved)); control.setAttribute('aria-label',saved ? 'Убрать из избранного' : 'Добавить в избранное');
        }
        control.className = 'watch-favorite' + (compact ? ' watch-favorite-icon' : ''); update(); control.disabled = !favoriteStore;
    }
    function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
    function link(text, href, detail) { const node = element('a', undefined, 'watch-link'); node.href = href; node.append(element('span', text)); if (detail) node.append(element('small', detail)); return node; }
    function button(text, action, parent, label) { const node = element('button', text); node.type = 'button'; if (label) node.setAttribute('aria-label', label); node.addEventListener('click', action); parent.append(node); return node; }
    function note(text) { return element('p', text, 'watch-status'); }
    function route() { try { return (location.hash.slice(1) || 'home').split('/').map(decodeURIComponent); } catch (_) { return ['home']; } }
    const readHash = (id, topic, index) => '#read/' + [id, topic, index].map(encodeURIComponent).join('/');
    function go(hash, replace) { if (replace || location.hash === hash) { history.replaceState(null, '', hash); render(); } else location.hash = hash; }
    function navigateBack() {
        const [view, id] = route();
        if (view === 'read') go('#topics/' + encodeURIComponent(id));
        else if (view === 'topics') go('#home');
        else if (view === 'settings' || view === 'media') go(returnTo);
        else go('#home');
    }
    async function json(source) {
        if (!/^(?:catalogue\.json|data\/[a-z0-9-]+\.json)$/.test(source)) throw new Error('Некорректный адрес материала');
        if (requests.has(source)) return requests.get(source);
        const promise = (async () => {
            const url = new URL(source, location.href.split('#')[0]), controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 9000);
            try {
                const response = await fetch(url, { signal:controller.signal });
                if (!response.ok) throw new Error('Материал не загрузился');
                const data = await response.clone().json();
                if (data.schemaVersion !== 1) throw new Error('Обнови страницу');
                if (window.caches) try {
                    const cache = await caches.open('almanion-watch-readings'); await cache.put(url, response);
                    const keys = await cache.keys(), metadata = key => /\/data\/[a-z][a-z0-9-]*-[a-f0-9]{16}\.json$/.test(new URL(key.url).pathname);
                    const expendable = keys.filter(key => !/catalogue\.json$/.test(new URL(key.url).pathname) && !metadata(key)).concat(keys.filter(metadata));
                    await Promise.all(expendable.slice(0, Math.max(0, keys.length - 80)).map(key => cache.delete(key)));
                } catch (_) {}
                return data;
            } catch (error) {
                if (window.caches) { const response = await caches.match(url); if (response) return response.json(); }
                throw error;
            } finally { clearTimeout(timer); }
        })();
        requests.set(source, promise);
        if (requests.size > 12) requests.delete(requests.keys().next().value);
        try { return await promise; } catch (error) { requests.delete(source); throw error; }
    }
    function loadMath() {
        if (window.renderMathInElement && document.querySelector('[data-watch-math]')?.sheet) return Promise.resolve();
        if (mathPromise) return mathPromise;
        let style = document.querySelector('[data-watch-math]');
        const styleReady = new Promise((resolve,reject) => {
            if (style?.sheet) { resolve(); return; }
            if (!style) { style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '../vendor/katex/katex.min.css'; style.dataset.watchMath = 'true'; }
            style.onload = resolve; style.onerror = () => { style.remove(); reject(new Error('Не загрузились стили формул')); };
            if (!style.isConnected) document.head.append(style);
        });
        mathPromise = new Promise((resolve, reject) => {
            function script(src, next) { const tag = document.createElement('script'); tag.src = src; tag.onload = next; tag.onerror = () => { tag.remove(); reject(new Error('Не загрузились формулы')); }; document.head.append(tag); }
            script('../vendor/katex/katex.min.js', () => script('../vendor/katex/contrib/auto-render.min.js', resolve));
        });
        let timer;
        mathPromise = Promise.race([Promise.all([mathPromise,styleReady]),new Promise((_,reject) => { timer = setTimeout(() => reject(new Error('Формулы не загрузились вовремя')),9000); })]).finally(() => clearTimeout(timer)).catch(error => { mathPromise = null; throw error; });
        return mathPromise;
    }
    async function subject(id) {
        const item = catalogue.subjects.find(value => value.id === id);
        if (!item) throw new Error('Предмет не найден');
        return json(item.path);
    }
    async function blockAt(data, topic, index) {
        let cursor = 0;
        for (const part of topic.parts) {
            if (index < cursor + part.count) return (await json(part.path)).blocks[index - cursor];
            cursor += part.count;
        }
        throw new Error('Блок не найден');
    }
    function screen(title, reading) {
        reader?.observer?.disconnect(); reader?.loader?.disconnect(); reader = null; swipe = null;
        document.body.dataset.pairing = 'false';
        heading.textContent = title; back.hidden = route()[0] === 'home'; controls.hidden = !reading; document.body.dataset.reading = String(!!reading); main.replaceChildren();
    }
    function home() {
        screen('Конспекты');
        const grade = button(preferences.grade + ' класс', () => go('#grades'), main); grade.className = 'watch-grade';
        const last = preferences.last;
        if (last && catalogue.subjects.some(item => item.id === last.id)) main.append(link('Продолжить', readHash(last.id, last.topic, last.index), last.title));
        main.append(link('Избранное','#favorites'));
        const order = ['physics-10','physics','math','geometry','chemistry','russian-ege','chemistry-10','literature-10'];
        for (const item of catalogue.subjects.filter(item => !item.extra && item.grades.includes(preferences.grade)).sort((a,b) => order.indexOf(a.id) - order.indexOf(b.id))) main.append(link(item.title.replace(/\s*[·|]\s*.*/, ''), '#topics/' + item.id));
        main.append(element('p', 'Дополнительно', 'watch-heading'));
        for (const item of catalogue.subjects.filter(item => item.extra)) main.append(link(item.title, '#topics/' + item.id));
        main.append(link('Дежурство 10-1', '#duty'));
        main.append(link('Телефон', '#pair'));
        main.append(link('Настройки', '#settings'));
        const full = element('a', 'Обычная версия', 'watch-home-link'); full.href = '../index.html'; main.append(full);
    }
    function grades() { screen('Класс'); for (const grade of [9,10,11]) button(grade + ' класс', () => { preferences.grade = grade; save(); go('#home'); }, main).className = 'watch-link'; }
    function topicList(data) {
        screen(data.title.replace(/\s*[·|]\s*.*/, ''));
        const input = element('input', undefined, 'watch-search'); input.type = 'search'; input.placeholder = 'Раздел или термин'; input.setAttribute('aria-label', 'Поиск раздела или термина');
        const list = element('div'); main.append(input); filterButtons(main,show); main.append(list);
        function show() {
            const q = input.value.trim().toLocaleLowerCase().replace(/ё/g,'е'); let count = 0, group = '';
            const records = favorites();
            list.replaceChildren();
            for (const topic of data.topics) {
                const matches = value => value.toLocaleLowerCase().replace(/ё/g,'е').includes(q);
                const indexes = (topic.ids || []).flatMap((id,index) => isFavorite(data.id,id,records) ? [index] : []);
                if (preferences.favoritesOnly && !indexes.length) continue;
                const hit = q && topic.terms?.find(item => matches(item.term) && (!preferences.favoritesOnly || indexes.includes(item.index)));
                if (q && !matches(topic.title + ' ' + topic.group) && !hit) continue;
                if (topic.group && group !== topic.group) { group = topic.group; list.append(element('p', group, 'watch-heading')); }
                list.append(link(topic.title, readHash(data.id, topic.id, hit ? hit.index : preferences.favoritesOnly ? indexes[0] : 0), hit ? hit.term : undefined)); count++;
            }
            if (!count) list.append(note(q ? 'Не найдено' : preferences.favoritesOnly ? 'Избранных блоков пока нет' : 'Не найдено'));
        }
        input.addEventListener('input', show); show();
    }
    function favoritesView() {
        screen('Избранное');
        const records = favorites(); let count = 0;
        for (const item of catalogue.subjects) {
            const entries = Object.entries(records).filter(([key,entry]) => key.startsWith(item.id + '__b__') && !entry.noteOnly);
            if (!entries.length) continue;
            const node = link(item.title,'#topics/' + item.id,String(entries.length));
            node.addEventListener('click', () => { preferences.favoritesOnly = true; save(); }); main.append(node); count++;
        }
        if (!count) { main.append(note('Избранных блоков пока нет')); main.append(link('Открыть конспекты','#home')); }
    }
    function labelTypes(card) {
        for (const [type, label] of Object.entries(TYPES)) for (const node of card.querySelectorAll('.' + type + '-box')) node.dataset.watchType = label;
        for (const node of card.querySelectorAll('[hidden]')) node.removeAttribute('hidden');
    }
    function cleanContent(html, data) {
        if (!window.AlmanionSafeHtml) throw new Error('Не загрузилось безопасное отображение');
        const card = element('div', undefined, 'watch-card');
        const template = document.createElement('template'); template.innerHTML = html;
        const base = new URL('../' + data.page, location.href);
        for (const node of template.content.querySelectorAll('img[src], a[href]')) {
            const name = node.tagName === 'IMG' ? 'src' : 'href';
            const raw = node.getAttribute(name);
            if (raw) node.setAttribute(name, new URL(raw, base).href);
            if (name === 'src') { node.loading = 'lazy'; node.decoding = 'async'; }
        }
        card.innerHTML = window.AlmanionSafeHtml.sanitize(template.innerHTML);
        for (const node of card.querySelectorAll('a[href]')) {
            const url = new URL(node.href), subject = catalogue.subjects.find(item => url.origin === location.origin && url.pathname === '/' + item.page);
            if (subject) node.href = '#topics/' + subject.id;
        }
        labelTypes(card); return card;
    }
    function step(direction) {
        if (!active) return;
        const next = neighbor(direction);
        if (next) { savedScroll = null; go(readHash(active.data.id,next.id,visibleIndexes(active.data,next)[0] || 0),true); }
    }
    function neighbor(direction) {
        if (!active) return null;
        for (let position = active.data.topics.indexOf(active.topic) + direction; position >= 0 && position < active.data.topics.length; position += direction) {
            const topic = active.data.topics[position]; if (visibleIndexes(active.data,topic).length) return topic;
        }
        return null;
    }
    function selectBlock(index) {
        if (!reader || reader.token !== generation) return;
        const entry = reader.rows.get(index); if (!entry) return;
        active = {data:reader.data,topic:reader.topic,index,block:entry.block};
        reader.counter.textContent = (reader.indexes.indexOf(index) + 1) + ' / ' + reader.indexes.length;
        const last = preferences.last;
        if (last?.id !== active.data.id || last.topic !== active.topic.id || last.block !== active.block.id || last.index !== index) {
            preferences.last = {id:active.data.id,topic:active.topic.id,index,block:active.block.id,title:active.topic.title}; save();
        }
        if (route()[0] === 'read') history.replaceState(null,'',readHash(active.data.id,active.topic.id,index));
    }
    function selectVisible(state) {
        if (state !== reader || state.token !== generation || !state.ready) return;
        const anchor = innerHeight * .25;
        const candidates = [...new Set([...state.visible,active?.index])].map(index => state.rows.get(index)).filter(Boolean).map(entry => {
            const rect = entry.node.getBoundingClientRect();
            return {entry,visible:rect.bottom > 0 && rect.top < innerHeight,distance:rect.top <= anchor && rect.bottom > anchor ? 0 : Math.min(Math.abs(rect.top-anchor),Math.abs(rect.bottom-anchor))};
        }).filter(candidate => candidate.visible).sort((a,b) => a.distance-b.distance);
        if (candidates[0]) selectBlock(candidates[0].entry.index);
    }
    function rememberScroll() {
        if (!active?.block || !reader) return;
        const row = reader.rows.get(active.index)?.node;
        if (row) { const rect = row.getBoundingClientRect(); savedScroll = {block:active.block.id,fraction:-rect.top / Math.max(1,rect.height)}; }
    }
    function openTools() { returnTo = location.hash; rememberScroll(); go('#settings'); }
    async function reading(id, topicId, rawIndex, token) {
        const data = await subject(id); let topic = data.topics.find(item => item.id === topicId) || data.topics[0];
        let index = Math.min(topic.count - 1, Math.max(0, parseInt(rawIndex,10) || 0));
        const last = preferences.last;
        if (last?.id === id && last.topic === topic.id && last.index === index && topic.ids?.includes(last.block)) index = topic.ids.indexOf(last.block);
        const indexes = visibleIndexes(data,topic);
        if (indexes.length && !indexes.includes(index)) index = indexes.find(value => value >= index) ?? indexes[0];
        if (token !== generation) return;
        screen(data.title.replace(/\s*[·|]\s*.*/, ''),true); back.hidden = true; media = [];
        active = {data,topic,index,block:null};
        const titleRow = element('div',undefined,'watch-reader-heading'), titles = element('div');
        const counter = element('p','', 'watch-counter'); titles.append(element('h1',topic.title,'watch-topic-heading'),counter); titleRow.append(titles);
        button('Аа',openTools,titleRow,'Масштаб и навигация').className = 'watch-reader-tools'; main.append(titleRow);
        filterButtons(main, () => { rememberScroll(); render(); });
        const feed = element('div',undefined,'watch-feed'), sentinel = note('Загрузка…'); sentinel.classList.add('watch-load'); main.append(feed,sentinel);
        reader = {token,data,topic,indexes,rows:new Map(),visible:new Set(),counter,feed,sentinel,pending:false,ready:false};
        const state = reader;
        state.observer = new IntersectionObserver(entries => {
            if (state !== reader || token !== generation) return;
            for (const entry of entries) { const value = Number(entry.target.dataset.index); if (entry.isIntersecting) state.visible.add(value); else state.visible.delete(value); }
            selectVisible(state);
        },{threshold:0});
        state.loader = new IntersectionObserver(entries => { if (state.ready && !sentinel.querySelector('button') && entries.some(entry => entry.isIntersecting)) appendBlocks(state); },{rootMargin:'120px'});
        document.getElementById('watchPrev').disabled = !neighbor(-1); document.getElementById('watchNext').disabled = !neighbor(1);
        if (!indexes.length) {
            sentinel.hidden = true; counter.hidden = true; feed.append(note('Избранных блоков пока нет'));
            button('Показывать все', () => { preferences.favoritesOnly = false; save(); render(); },feed).className = 'watch-link'; reader.ready = true; window.scrollTo({top:0,behavior:'instant'}); return;
        }
        while (state.rows.size <= indexes.indexOf(index)) {
            const success = await appendBlocks(state); if (token !== generation) return;
            if (!success) { state.ready = true; if (state.rows.size) selectBlock([...state.rows.keys()].at(-1)); return; }
        }
        selectBlock(index);
        const target = state.rows.get(index).node, restore = savedScroll?.block === active.block.id ? savedScroll : null;
        savedScroll = null;
        if (restore || index !== indexes[0]) window.scrollTo({top:scrollY + target.getBoundingClientRect().top + (restore ? restore.fraction * target.offsetHeight : 0),behavior:'instant'});
        else window.scrollTo({top:0,behavior:'instant'});
        state.ready = true;
        state.loader.observe(sentinel);
        selectVisible(state);
    }
    async function appendBlocks(state) {
        if (state.pending || state !== reader || state.token !== generation) return;
        const next = state.indexes.filter(index => !state.rows.has(index)).slice(0,8);
        if (!next.length) { state.sentinel.hidden = true; return true; }
        state.pending = true; state.sentinel.hidden = false; state.sentinel.replaceChildren(document.createTextNode('Загрузка…'));
        try {
            for (const index of next) {
                const block = await blockAt(state.data,state.topic,index);
                if (state !== reader || state.token !== generation) return;
                const node = element('article',undefined,'watch-block'); node.dataset.index = index; node.dataset.blockId = block.id;
                node.setAttribute('aria-label','Блок ' + (index + 1));
                const tools = element('div',undefined,'watch-block-heading');
                if (TYPES[block.type]) { const label = element('p',TYPES[block.type],'watch-type'); label.dataset.kind = block.type; tools.append(label); }
                favoriteButton(tools,{data:state.data,topic:state.topic,index,block},true); node.append(tools);
                const card = cleanContent(block.html,state.data); card.dataset.kind = block.type; node.append(card); state.feed.append(node);
                state.rows.set(index,{node,index,block});
                await enhanceCard(card,state,index);
                if (state !== reader || state.token !== generation) return;
                state.observer?.observe(node);
            }
            state.sentinel.hidden = state.rows.size === state.indexes.length;
        } catch (_) {
            if (state !== reader || state.token !== generation) return;
            state.sentinel.replaceChildren(note('Не загрузились следующие блоки'));
            button('Повторить', () => { state.ready = true; appendBlocks(state).then(() => state.loader.observe(state.sentinel)); },state.sentinel);
            return false;
        } finally { state.pending = false; }
        if (state === reader && state.token === generation && state.ready && !state.sentinel.hidden && !state.sentinel.querySelector('button') && state.sentinel.getBoundingClientRect().top < innerHeight + 120) requestAnimationFrame(() => appendBlocks(state));
        return true;
    }
    async function enhanceCard(card,state,index) {
        const {block} = state.rows.get(index);
        const primary = card.firstElementChild;
        if (primary?.classList.contains(block.type + '-box')) { primary.classList.remove(block.type + '-box'); primary.removeAttribute('data-watch-type'); }
        if (/\\\(|\\\[|\$\$/.test(card.textContent)) {
            try { if (state.mathFailed) throw new Error('Math unavailable'); await loadMath(); if (state !== reader || state.token !== generation) return;
                window.renderMathInElement(card, { throwOnError:false, trust:false, delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false}] });
            } catch (_) { if (state === reader && state.token === generation) { state.mathFailed = true; card.append(note('Формулы пока в текстовом виде')); button('Повторить формулы', () => { rememberScroll(); render(); },card).className = 'watch-magnify'; } }
        }
        if (state !== reader || state.token !== generation) return;
        const graphics = Array.from(card.querySelectorAll('img,svg,table,.katex-display')).filter(node => !node.parentElement.closest('svg,.katex,table'));
        for (const node of graphics) {
            media.push(node);
            if (node.matches('table,.katex-display')) { const wrap = element('div', undefined, 'watch-scroll'); node.before(wrap); wrap.append(node); }
            const enlarge = element('button', node.matches('img,svg') ? 'Увеличить рисунок' : 'Увеличить'); enlarge.type = 'button'; enlarge.className = 'watch-magnify';
            enlarge.addEventListener('click', () => { selectBlock(index); returnTo = readHash(state.data.id,state.topic.id,index); rememberScroll(); go('#media/' + media.indexOf(node)); });
            const wrapper = node.closest('.watch-scroll'); if (wrapper) wrapper.after(enlarge); else node.after(enlarge);
        }
    }
    function settingsView() {
        screen('Настройки');
        filterButtons(main, () => {});
        favoriteButton(main);
        const value = element('p', Math.round(preferences.scale * 100) + '%', 'watch-status'), row = element('div', undefined, 'watch-grid');
        function scale(change) { preferences.scale = Math.round(Math.max(.8, Math.min(1.8, preferences.scale + change)) * 100) / 100; apply(); save(); value.textContent = Math.round(preferences.scale * 100) + '%'; minus.disabled = preferences.scale <= .8; plus.disabled = preferences.scale >= 1.8; }
        const minus = button('−', () => scale(-.1), row, 'Уменьшить текст'); button('100%', () => { preferences.scale = 1; scale(0); }, row, 'Обычный размер'); const plus = button('+', () => scale(.1), row, 'Увеличить текст');
        main.append(value, row); scale(0);
        const preview = element('p', 'Конспекты', 'watch-card watch-status'); main.append(preview);
        const themes = element('div', undefined, 'watch-grid');
        for (const [theme, title] of [['dark','Тёмная'],['light','Светлая']]) button(title, () => { preferences.theme = theme; apply(); save(); for (const node of themes.children) node.classList.toggle('active', node.dataset.theme === theme); }, themes).dataset.theme = theme;
        for (const node of themes.children) node.classList.toggle('active', node.dataset.theme === preferences.theme);
        main.append(themes);
        main.append(link(connectionClient?.status().linked ? 'Подключённый телефон' : 'Подключить телефон','#pair'));
        if (active) {
            main.append(link('Разделы', '#topics/' + active.data.id));
            const full = link('Обычный конспект', '../' + active.data.page + '#' + active.topic.id); main.append(full);
        }
        main.append(link('Главная', '#home'));
        if (returnTo.startsWith('#read/')) main.append(link('Читать', returnTo));
    }
    const syncLabels = {local:'Не подключено',checking:'Проверяем подключение…',waiting:'Подтверди на телефоне',synced:'Избранное синхронизировано',pending:'Ожидает синхронизации',offline:'Нет сети — сохранено на часах',revoked:'Телефон отключил эти часы',expired:'Код истёк',unavailable:'Подключение недоступно'};
    function syncStatus() { return connectionClient ? syncLabels[connectionClient.status().state] || 'Подключено' : 'Подключение недоступно'; }
    async function pairingView(token) {
        screen('Телефон');
        if (!connectionClient) { main.append(note('Подключение не загрузилось'),link('Главная','#home')); return; }
        const status=connectionClient.status(), label=note(syncStatus()); label.id='watchSyncStatus'; main.append(label);
        if (status.linked) {
            main.classList.add('watch-connected');
            button('Синхронизировать',()=>connectionClient.tick(),main).className='watch-link';
            button('Отключить',async()=>{
                try { await connectionClient.unlink(); render(); }
                catch(error) { label.textContent=window.AlmanionWatchSync.message(error); }
            },main).className='watch-link';
            main.append(link('Избранное','#favorites')); return;
        }
        main.classList.remove('watch-connected');
        if (status.code && status.expiresAt && status.state!=='expired' && status.state!=='unavailable') {
            const box=element('div',undefined,'watch-pair-qr'); box.setAttribute('aria-label','QR-код для подключения телефона');
            const code=element('div',undefined,'watch-pair-code');
            for(const group of status.code.match(/.{4}/g)) code.append(element('span',group));
            main.append(box,code,note('Код действует 5 минут'));
            document.body.dataset.pairing='true';
            try {
                if (!window.qrcode) {
                    if(!qrPromise) qrPromise=new Promise((resolve,reject)=>{
                        const script=document.createElement('script'),version=new URL(document.querySelector('script[src^="sync.js"]').src).searchParams.get('v');script.src='qr.js'+(version ? '?v='+encodeURIComponent(version) : '');
                        const timer=setTimeout(()=>{script.remove();reject(new Error('QR timeout'));},8000);
                        script.onload=()=>{clearTimeout(timer);if(window.qrcode) resolve();else reject(new Error('QR unavailable'));};
                        script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('QR unavailable'));};document.head.append(script);
                    }).catch(error=>{qrPromise=null;throw error;});
                    await qrPromise;
                }
                if (generation!==token) return;
                const qr=window.qrcode(0,'L');qr.addData(new URL('connect.html',location.href).href+'#'+status.code);qr.make();
                box.innerHTML=qr.createSvgTag({cellSize:3,margin:12,scalable:true});
                requestAnimationFrame(()=>{
                    if(generation!==token) return;
                    const rect=box.getBoundingClientRect();window.scrollTo({top:scrollY+rect.top-(innerHeight-rect.height)/2,behavior:'instant'});
                });
            } catch(_) { box.append(note('Введи код на телефоне: almanion.github.io/watch/connect.html')); }
        }
        const create=button(status.code ? 'Новый код' : 'Подключить телефон',async()=>{
            create.disabled=true;
            try { await connectionClient.begin();if(generation===token) render(); }
            catch(error) { label.textContent=window.AlmanionWatchSync.message(error); }
            finally { create.disabled=false; }
        },main);create.className='watch-link';
        main.append(link('Главная','#home'));
    }
    function mediaView(index) {
        const source = media[index]; if (!source) { go(returnTo, true); return; }
        screen('Приближение');
        const row = element('div', undefined, 'watch-grid'), box = element('div', undefined, 'watch-media'), inner = element('div', undefined, 'watch-media-inner');
        let size = 1;
        function zoom(next) {
            const x = (box.scrollLeft + box.clientWidth/2)/size, y = (box.scrollTop + box.clientHeight/2)/size;
            size = Math.max(1,Math.min(4,next)); inner.style.setProperty('--media-size',size);
            requestAnimationFrame(() => box.scrollTo(x * size - box.clientWidth/2,y * size - box.clientHeight/2));
        }
        button('−', () => zoom(size - .5), row, 'Уменьшить рисунок или формулу');
        button('1×', () => { size = 1; inner.style.setProperty('--media-size', size); box.scrollTo(0,0); }, row, 'Исходный масштаб');
        button('+', () => zoom(size + .5), row, 'Увеличить рисунок или формулу');
        const clone = source.cloneNode(true); if (clone.tagName === 'IMG') clone.loading = 'eager'; inner.append(clone); box.append(inner); main.append(row, box, link('Вернуться', returnTo));
    }
    async function dutyView(rawIndex, token) {
        let entries, copied = false;
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 3500);
        try {
            const response = await fetch(catalogue.duty.endpoint, { signal:controller.signal });
            if (!response.ok) throw new Error('Duty request failed');
            entries = Object.values(await response.json() || {});
            if (!entries.length) throw new Error('Empty duty response');
            preferences.duty = entries.map(entry => ({ start:entry.start, end:entry.end, people:entry.people, segments:entry.segments })); save();
        } catch (_) { entries = preferences.duty || (await json(catalogue.duty.path)).entries; copied = true; }
        finally { clearTimeout(timer); }
        if (token !== generation) return;
        entries = entries.filter(Boolean).flatMap(entry => {
            const segments = entry.segments && typeof entry.segments === 'object' ? Object.values(entry.segments) : [];
            return segments.length ? segments.map(segment => ({ ...entry, start:segment.start, end:segment.end })) : [entry];
        }).filter(entry => /^\d{4}-\d{2}-\d{2}$/.test(entry.start) && /^\d{4}-\d{2}-\d{2}$/.test(entry.end) && entry.people).sort((a,b) => a.start.localeCompare(b.start));
        screen('Дежурство 10-1');
        if (!entries.length) { main.append(note('Расписания пока нет')); return; }
        const dateParts = new Intl.DateTimeFormat('en', { timeZone:'Europe/Moscow', year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(new Date());
        const today = ['year','month','day'].map(type => dateParts.find(part => part.type === type).value).join('-');
        const current = entries.findIndex(entry => entry.end >= today);
        const index = rawIndex === undefined ? current < 0 ? entries.length - 1 : current : Math.max(0,Math.min(entries.length - 1,Number(rawIndex) || 0));
        const entry = entries[index], format = date => new Intl.DateTimeFormat('ru', { day:'numeric',month:'short',timeZone:'UTC' }).format(new Date(date + 'T12:00:00Z'));
        main.append(note(format(entry.start) + ' — ' + format(entry.end)));
        for (const person of Object.values(entry.people)) main.append(element('p', String(person), 'watch-topic'));
        const row = element('div', undefined, 'watch-grid');
        button('‹', () => go('#duty/' + (index - 1),true), row, 'Предыдущее дежурство').disabled = index === 0;
        button('›', () => go('#duty/' + (index + 1),true), row, 'Следующее дежурство').disabled = index === entries.length - 1;
        main.append(row); if (copied) main.append(note('Сохранённая копия'));
    }
    async function render() {
        const token = ++generation, [view,id,topic,index] = route();
        try {
            if (!catalogue) catalogue = await json('catalogue.json');
            if (token !== generation) return;
            if (view === 'home') home();
            else if (view === 'grades') grades();
            else if (view === 'favorites') favoritesView();
            else if (view === 'topics') { const data = await subject(id); if (token !== generation) return; topicList(data); }
            else if (view === 'bookmark') {
                const data = await subject(id), target = data.topics.find(item => item.ids?.includes(topic));
                if (token !== generation) return;
                try { sessionStorage.removeItem('almanion_bookmark_target'); } catch (_) {}
                if (target) go(readHash(id,target.id,target.ids.indexOf(topic)),true);
                else { screen('Избранное'); main.append(note('Блок больше недоступен'),link('Разделы','#topics/' + id)); }
            }
            else if (view === 'read') await reading(id,topic,index,token);
            else if (view === 'settings') settingsView();
            else if (view === 'pair') await pairingView(token);
            else if (view === 'duty') await dutyView(id, token);
            else if (view === 'media') { if (!media.length && preferences.last) { const last = preferences.last; returnTo = readHash(last.id,last.topic,last.index); await reading(last.id,last.topic,last.index,token); } if (token === generation) mediaView(Number(id)); }
            else go('#home',true);
            if (token === generation && view !== 'read') window.scrollTo({top:0,behavior:'instant'});
        } catch (_) {
            if (token !== generation) return;
            screen('Не загрузилось'); main.append(note('Проверь соединение и повтори попытку.')); button('Повторить', () => render(), main).className = 'watch-link'; main.append(link('Главная','#home'));
        }
    }
    back.addEventListener('click', navigateBack);
    document.getElementById('watchPrev').addEventListener('click', () => step(-1));
    document.getElementById('watchNext').addEventListener('click', () => step(1));
    document.getElementById('watchTools').addEventListener('click', openTools);
    let scrollFrame;
    window.addEventListener('scroll', () => {
        if (scrollFrame || !reader?.ready) return;
        scrollFrame = requestAnimationFrame(() => {
            scrollFrame = null;
            if (!reader) return;
            selectVisible(reader);
            // Layout changes can keep the sentinel intersecting while a batch is
            // pending. A real scroll must still be able to request the next batch.
            if (!reader.sentinel.hidden && !reader.sentinel.querySelector('button') && reader.sentinel.getBoundingClientRect().top < innerHeight + 120) appendBlocks(reader);
        });
    },{passive:true});
    main.addEventListener('touchstart', event => {
        swipe = null;
        if (!reader?.ready || reader.token !== generation || route()[0] !== 'read' || event.touches.length !== 1 || !event.target.closest('.watch-feed') || event.target.closest('button,a,input,textarea,select,summary,img,svg,table,.watch-scroll,.katex') || window.getSelection()?.toString()) return;
        const touch = event.touches[0]; swipe = {id:touch.identifier,x:touch.clientX,y:touch.clientY,time:performance.now(),token:generation,locked:false};
    },{passive:true});
    main.addEventListener('touchmove', event => {
        if (!swipe) return;
        const touch = event.touches[0];
        if (event.touches.length !== 1 || touch.identifier !== swipe.id || swipe.token !== generation || performance.now() - swipe.time > 700 || window.getSelection()?.toString()) { swipe = null; return; }
        const dx = touch.clientX-swipe.x, dy = touch.clientY-swipe.y;
        if (Math.abs(dy) > 24 || (!swipe.locked && Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)*.65)) { swipe = null; return; }
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)*2) swipe.locked = true;
        if (swipe.locked && event.cancelable) event.preventDefault();
    },{passive:false});
    main.addEventListener('touchend', event => {
        const gesture = swipe; swipe = null;
        const touch = gesture && Array.from(event.changedTouches).find(value => value.identifier === gesture.id);
        if (!touch || event.touches.length || gesture.token !== generation || !gesture.locked || performance.now()-gesture.time > 700 || window.getSelection()?.toString()) return;
        const dx = touch.clientX-gesture.x, dy = touch.clientY-gesture.y;
        if (Math.abs(dx) >= Math.max(36,Math.min(60,innerWidth*.22)) && Math.abs(dx) > Math.abs(dy)*2) step(dx < 0 ? 1 : -1);
    },{passive:true});
    main.addEventListener('touchcancel', () => { swipe = null; },{passive:true});
    document.addEventListener('keydown', event => { if (route()[0] !== 'read' || event.target.closest('input,button,a') || event.ctrlKey || event.altKey || event.metaKey) return; if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); step(event.key === 'ArrowRight' ? 1 : -1); } });
    window.addEventListener('hashchange', render);
    window.addEventListener('storage', event => {
        if (event.key === storageKey) { try { preferences = JSON.parse(event.newValue) || preferences; apply(); } catch (_) {} }
        if (event.key === 'almanion_bookmarks_guest' || event.key?.startsWith('almanion_data_sync_pending_v1:bookmarks|guest|')) render();
    });
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js', { scope:'./' }).catch(() => {});
    window.AlmanionWatch = { getState:() => ({ scale:preferences.scale, grade:preferences.grade, reading:active && { id:active.data.id, topic:active.topic.id, index:active.index }, last:preferences.last }) };
    if (window.AlmanionWatchSync && typeof firebaseConfig!=='undefined' && favoriteStore) {
        try {
        connectionClient=new window.AlmanionWatchSync.Client({config:firebaseConfig,storage:localStorage,fetch:window.fetch.bind(window),crypto:window.crypto,sync:window.AlmanionDataSync,guestStore:favoriteStore,visible:()=>!document.hidden,
            onStore:store=>{rememberScroll();favoriteStore=store;if(catalogue) render();},
            onChange:(records,detail)=>{
                const signature=JSON.stringify(Object.entries(records).map(([id,value])=>[id,value.deleted,value.noteOnly,value.title,value.type]).sort());
                const changed=signature!==favoriteSignature;favoriteSignature=signature;
                if(changed && !['set','delete','ack'].includes(detail.type) && catalogue){rememberScroll();render();}
            },
            onStatus:status=>{
                const label=document.getElementById('watchSyncStatus');if(label) label.textContent=syncLabels[status.state] || 'Подключено';
                if(route()[0]==='pair' && status.linked && !main.classList.contains('watch-connected')) render();
            }
        });
        connectionClient.start();
        window.addEventListener('online',()=>connectionClient.schedule(0));
        document.addEventListener('visibilitychange',()=>{if(!document.hidden) connectionClient.schedule(0);});
        window.addEventListener('pagehide',()=>connectionClient.stop());
        window.addEventListener('pageshow',()=>connectionClient.start());
        } catch (_) { connectionClient=null; /* Local reading still works when browser storage is blocked. */ }
    }
    render();
})();
