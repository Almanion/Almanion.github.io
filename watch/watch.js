(function () {
    'use strict';
    const main = document.getElementById('watchMain'), heading = document.getElementById('watchHeading');
    const back = document.getElementById('watchBack'), controls = document.querySelector('.watch-controls');
    const storageKey = 'almanion-watch-v1', requests = new Map();
    const TYPES = { definition:'Определение', theorem:'Теорема', lemma:'Лемма', statement:'Утверждение', formula:'Формула', corollary:'Следствие', properties:'Свойства', proof:'Доказательство', derivation:'Вывод', experiment:'Опыт', remark:'Замечание', example:'Пример', exercise:'Упражнение', reminder:'Напоминание', system:'Система', stress:'Ударение' };
    let preferences = {}, catalogue, active, media = [], returnTo = '#home', savedScroll = null, generation = 0, mathPromise;
    try { preferences = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch (_) {}
    preferences.scale = Math.max(.8, Math.min(1.8, Number(preferences.scale) || 1));
    preferences.grade = [9,10,11].includes(preferences.grade) ? preferences.grade : 10;
    preferences.theme = preferences.theme === 'light' ? 'light' : 'dark';
    function save() { try { localStorage.setItem(storageKey, JSON.stringify(preferences)); } catch (_) {} }
    function apply() { document.documentElement.dataset.theme = preferences.theme; document.documentElement.style.setProperty('--size', preferences.scale); document.querySelector('meta[name="theme-color"]').content = preferences.theme === 'light' ? '#fbfbfe' : '#000000'; }
    apply();
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
    function screen(title, reading) { heading.textContent = title; back.hidden = route()[0] === 'home'; controls.hidden = !reading; document.body.dataset.reading = String(!!reading); main.replaceChildren(); }
    function home() {
        screen('Конспекты');
        const grade = button(preferences.grade + ' класс', () => go('#grades'), main); grade.className = 'watch-grade';
        const last = preferences.last;
        if (last && catalogue.subjects.some(item => item.id === last.id)) main.append(link('Продолжить', readHash(last.id, last.topic, last.index), last.title));
        const order = ['physics-10','physics','math','geometry','chemistry','russian-ege','chemistry-10','literature-10'];
        for (const item of catalogue.subjects.filter(item => !item.extra && item.grades.includes(preferences.grade)).sort((a,b) => order.indexOf(a.id) - order.indexOf(b.id))) main.append(link(item.title.replace(/\s*[·|]\s*.*/, ''), '#topics/' + item.id));
        main.append(element('p', 'Дополнительно', 'watch-heading'));
        for (const item of catalogue.subjects.filter(item => item.extra)) main.append(link(item.title, '#topics/' + item.id));
        main.append(link('Дежурство 10-1', '#duty'));
        main.append(link('Настройки', '#settings'));
        const full = element('a', 'Обычная версия', 'watch-home-link'); full.href = '../index.html'; main.append(full);
    }
    function grades() { screen('Класс'); for (const grade of [9,10,11]) button(grade + ' класс', () => { preferences.grade = grade; save(); go('#home'); }, main).className = 'watch-link'; }
    function topicList(data) {
        screen(data.title.replace(/\s*[·|]\s*.*/, ''));
        const input = element('input', undefined, 'watch-search'); input.type = 'search'; input.placeholder = 'Раздел или термин'; input.setAttribute('aria-label', 'Поиск раздела или термина');
        const list = element('div'); main.append(input, list);
        function show() {
            const q = input.value.trim().toLocaleLowerCase().replace(/ё/g,'е'); let count = 0, group = '';
            list.replaceChildren();
            for (const topic of data.topics) {
                const matches = value => value.toLocaleLowerCase().replace(/ё/g,'е').includes(q);
                const hit = q && topic.terms?.find(item => matches(item.term));
                if (q && !matches(topic.title + ' ' + topic.group) && !hit) continue;
                if (topic.group && group !== topic.group) { group = topic.group; list.append(element('p', group, 'watch-heading')); }
                list.append(link(topic.title, readHash(data.id, topic.id, hit ? hit.index : 0), hit ? hit.term : undefined)); count++;
            }
            if (!count) list.append(note('Не найдено'));
        }
        input.addEventListener('input', show); show();
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
        const { data, topic, index } = active, position = data.topics.indexOf(topic), next = index + direction;
        if (next >= 0 && next < topic.count) go(readHash(data.id, topic.id, next), true);
        else { const target = data.topics[position + direction]; if (target) go(readHash(data.id, target.id, direction > 0 ? 0 : target.count - 1), true); }
    }
    function rememberScroll() { savedScroll = scrollY / Math.max(1,document.documentElement.scrollHeight - innerHeight); }
    function openTools() { returnTo = location.hash; rememberScroll(); go('#settings'); }
    async function reading(id, topicId, rawIndex, token, asMedia) {
        const data = await subject(id), topic = data.topics.find(item => item.id === topicId) || data.topics[0];
        let index = Math.min(topic.count - 1, Math.max(0, parseInt(rawIndex,10) || 0));
        let block = await blockAt(data, topic, index);
        // A new publication may insert blocks. Restore a canonical block ID
        // rather than silently pointing at a different card with the same index.
        const last = preferences.last;
        if (last?.id === id && last.topic === topic.id && last.index === index && last.block !== block.id) {
            for (let i = 0; i < topic.count; i++) { const candidate = await blockAt(data, topic, i); if (candidate.id === last.block) { index = i; block = candidate; break; } }
        }
        if (token !== generation) return;
        if (route()[0] === 'read' && (Number(rawIndex) !== index || topic.id !== topicId)) history.replaceState(null,'',readHash(id,topic.id,index));
        active = { data, topic, index, block };
        screen(data.title.replace(/\s*[·|]\s*.*/, ''), true);
        back.hidden = true;
        main.append(element('h1', topic.title, 'watch-topic-heading'), element('p', (index + 1) + ' / ' + topic.count, 'watch-counter'));
        if (TYPES[block.type]) { const label = element('p', TYPES[block.type], 'watch-type'); label.dataset.kind = block.type; main.append(label); }
        const card = cleanContent(block.html, data); card.dataset.kind = block.type; main.append(card);
        const primary = card.firstElementChild;
        if (primary?.classList.contains(block.type + '-box')) { primary.classList.remove(block.type + '-box'); primary.removeAttribute('data-watch-type'); }
        if (/\\\(|\\\[|\$\$/.test(card.textContent)) {
            try { await loadMath(); if (token !== generation) return;
                window.renderMathInElement(card, { throwOnError:false, trust:false, delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false}] });
            } catch (_) { if (token === generation) { main.append(note('Формулы пока в текстовом виде')); const retry = button('Повторить формулы', () => render(), main); retry.className = 'watch-magnify'; } }
        }
        if (token !== generation) return;
        media = Array.from(card.querySelectorAll('img,svg,table,.katex-display')).filter(node => !node.parentElement.closest('svg,.katex,table'));
        media.forEach((node, mediaIndex) => {
            if (node.matches('table,.katex-display')) { const wrap = element('div', undefined, 'watch-scroll'); node.before(wrap); wrap.append(node); }
            const enlarge = element('button', node.matches('img,svg') ? 'Увеличить рисунок' : 'Увеличить'); enlarge.type = 'button'; enlarge.className = 'watch-magnify';
            enlarge.addEventListener('click', () => { returnTo = readHash(id, topic.id, index); rememberScroll(); go('#media/' + mediaIndex); });
            const wrapper = node.closest('.watch-scroll'); if (wrapper) wrapper.after(enlarge); else node.after(enlarge);
        });
        preferences.last = { id, topic:topic.id, index, block:block.id, title:topic.title }; save();
        const position = data.topics.indexOf(topic);
        document.getElementById('watchPrev').disabled = !index && !position;
        document.getElementById('watchNext').disabled = index === topic.count - 1 && position === data.topics.length - 1;
        if (asMedia) mediaView(asMedia);
    }
    function settingsView() {
        screen('Настройки');
        const value = element('p', Math.round(preferences.scale * 100) + '%', 'watch-status'), row = element('div', undefined, 'watch-grid');
        function scale(change) { preferences.scale = Math.round(Math.max(.8, Math.min(1.8, preferences.scale + change)) * 100) / 100; apply(); save(); value.textContent = Math.round(preferences.scale * 100) + '%'; minus.disabled = preferences.scale <= .8; plus.disabled = preferences.scale >= 1.8; }
        const minus = button('−', () => scale(-.1), row, 'Уменьшить текст'); button('100%', () => { preferences.scale = 1; scale(0); }, row, 'Обычный размер'); const plus = button('+', () => scale(.1), row, 'Увеличить текст');
        main.append(value, row); scale(0);
        const preview = element('p', 'Конспекты', 'watch-card watch-status'); main.append(preview);
        const themes = element('div', undefined, 'watch-grid');
        for (const [theme, title] of [['dark','Тёмная'],['light','Светлая']]) button(title, () => { preferences.theme = theme; apply(); save(); for (const node of themes.children) node.classList.toggle('active', node.dataset.theme === theme); }, themes).dataset.theme = theme;
        for (const node of themes.children) node.classList.toggle('active', node.dataset.theme === preferences.theme);
        main.append(themes);
        if (active) {
            main.append(link('Разделы', '#topics/' + active.data.id));
            const full = link('Обычный конспект', '../' + active.data.page + '#' + active.topic.id); main.append(full);
        }
        main.append(link('Главная', '#home'));
        if (returnTo.startsWith('#read/')) main.append(link('Читать', returnTo));
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
            else if (view === 'topics') { const data = await subject(id); if (token !== generation) return; topicList(data); }
            else if (view === 'read') await reading(id,topic,index,token);
            else if (view === 'settings') settingsView();
            else if (view === 'duty') await dutyView(id, token);
            else if (view === 'media') { if (!media.length && preferences.last) { const last = preferences.last; returnTo = readHash(last.id,last.topic,last.index); await reading(last.id,last.topic,last.index,token); } if (token === generation) mediaView(Number(id)); }
            else go('#home',true);
            if (token === generation) {
                const restoring = view === 'read' && returnTo === location.hash && savedScroll !== null;
                window.scrollTo({ top:restoring ? savedScroll * Math.max(0,document.documentElement.scrollHeight - innerHeight) : 0, behavior:'instant' });
                if (view === 'read') savedScroll = null;
            }
        } catch (_) {
            if (token !== generation) return;
            screen('Не загрузилось'); main.append(note('Проверь соединение и повтори попытку.')); button('Повторить', () => render(), main).className = 'watch-link'; main.append(link('Главная','#home'));
        }
    }
    back.addEventListener('click', navigateBack);
    document.getElementById('watchPrev').addEventListener('click', () => step(-1));
    document.getElementById('watchNext').addEventListener('click', () => step(1));
    document.getElementById('watchTools').addEventListener('click', openTools);
    document.addEventListener('keydown', event => { if (route()[0] !== 'read' || event.target.closest('input,button,a') || event.ctrlKey || event.altKey || event.metaKey) return; if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); step(event.key === 'ArrowRight' ? 1 : -1); } });
    window.addEventListener('hashchange', render);
    window.addEventListener('storage', event => { if (event.key === storageKey) { try { preferences = JSON.parse(event.newValue) || preferences; apply(); } catch (_) {} } });
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js', { scope:'./' }).catch(() => {});
    window.AlmanionWatch = { getState:() => ({ scale:preferences.scale, grade:preferences.grade, reading:active && { id:active.data.id, topic:active.topic.id, index:active.index }, last:preferences.last }) };
    render();
})();
