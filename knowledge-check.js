// ============================================
// ПРОВЕРКА ЗНАНИЙ — интервальное повторение (FSRS), в духе AnkiDroid
// ============================================
//
// Самодостаточный модуль: сам создаёт кнопку в сайдбаре и модальные окна,
// поэтому достаточно подключить этот скрипт на странице с темами (.topic[id])
// и определениями (.definition-box). Прогресс карточек хранится локально
// (localStorage) по странице и переживает перезагрузки и закрытие сайта.
//
// Алгоритм FSRS‑4.5 (Free Spaced Repetition Scheduler), дефолтные веса:
//   R(t,S) = (1 + FACTOR·t/S)^DECAY,  DECAY = −0.5,  FACTOR = 19/81  ⇒ R(S,S)=0.9
//   Интервал под удержание r:  I = S/FACTOR · (r^(1/DECAY) − 1)   ⇒ I(0.9,S)=S
// Кнопки: Снова(1) / Трудно(2) / Хорошо(3) / Легко(4) — как в Anki.

(function () {
    'use strict';

    // ---------- Безопасный localStorage ----------
    const kcGet = (window.safeStorageGet) || function (k) { try { return localStorage.getItem(k); } catch (_) { return null; } };
    const kcSet = (window.safeStorageSet) || function (k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } };

    // ---------- Настройки расписания (как дефолты Anki) ----------
    // Целевое удержание: чем выше — тем КОРОЧЕ интервалы и чаще повторения.
    // По умолчанию 0.95 (короче, чем дефолтные FSRS 0.90); «Экзамен» 0.97 — ещё короче.
    const RETENTION_KEY = 'kc_retention';
    const DEFAULT_RETENTION = 0.95;
    const RETENTION_PRESETS = [
        { r: 0.90, label: 'Спокойно' },
        { r: 0.95, label: 'Обычно' },
        { r: 0.97, label: 'Экзамен' }
    ];
    function getRetention() {
        const v = parseFloat(kcGet(RETENTION_KEY));
        return (v >= 0.80 && v <= 0.99) ? v : DEFAULT_RETENTION;
    }
    function setRetention(r) { kcSet(RETENTION_KEY, String(r)); }
    const NEW_PER_DAY = 20;     // лимит новых карточек в день
    const MAX_DAYS = 36500;     // потолок интервала
    const RELEARN_DAYS = 10 / 1440; // «переучивание» после «Снова» ≈ 10 минут
    const S_MIN = 0.05, S_MAX = MAX_DAYS;
    const DAY = 86400000;

    // ---------- FSRS‑4.5 ----------
    const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031,
               1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
    const DECAY = -0.5;
    const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // = 19/81 ≈ 0.2345679

    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

    function retrievability(elapsedDays, S) {
        return Math.pow(1 + FACTOR * elapsedDays / S, DECAY);
    }
    function intervalForStability(S, r) {
        return (S / FACTOR) * (Math.pow(r || getRetention(), 1 / DECAY) - 1);
    }
    function initDifficulty(G) {
        return clamp(W[4] - W[5] * (G - 3), 1, 10);
    }
    function nextDifficulty(D, G) {
        let d = D - W[6] * (G - 3);
        d = W[7] * W[4] + (1 - W[7]) * d; // возврат к среднему (к D0 «Хорошо» = W[4])
        return clamp(d, 1, 10);
    }
    function stabilityRecall(D, S, R, G) {
        const hard = (G === 2) ? W[15] : 1;
        const easy = (G === 4) ? W[16] : 1;
        const s = S * (1 + Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) *
                       (Math.exp(W[10] * (1 - R)) - 1) * hard * easy);
        return clamp(s, S_MIN, S_MAX);
    }
    function stabilityForget(D, S, R) {
        const s = W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R));
        return clamp(Math.min(s, S), S_MIN, S_MAX);
    }

    // Рассчитать новое состояние карточки для оценки G (без сохранения).
    // state: {S,D,last,reps,lapses} либо null (новая карточка).
    function project(state, G, now) {
        const res = {};
        if (!state || state.S == null) {
            res.S = clamp(W[G - 1], S_MIN, S_MAX);
            res.D = initDifficulty(G);
            res.reps = 1;
            res.lapses = (G === 1) ? 1 : 0;
        } else {
            const elapsed = Math.max(0, (now - state.last) / DAY);
            const R = retrievability(elapsed, state.S);
            res.D = nextDifficulty(state.D, G);
            if (G === 1) {
                res.S = stabilityForget(state.D, state.S, R);
                res.lapses = (state.lapses || 0) + 1;
            } else {
                res.S = stabilityRecall(state.D, state.S, R, G);
                res.lapses = state.lapses || 0;
            }
            res.reps = (state.reps || 0) + 1;
        }

        let iv = intervalForStability(res.S, getRetention()); // в днях
        if (G === 1) {
            iv = Math.min(iv, RELEARN_DAYS);       // «Снова» → вернуть в этой же сессии
            res.learning = true;
        } else {
            iv = Math.max(1, Math.round(iv));      // минимум 1 день (как в Anki)
            res.learning = false;
        }
        res.intervalDays = clamp(iv, RELEARN_DAYS, MAX_DAYS);
        res.due = now + res.intervalDays * DAY;
        res.last = now;
        return res;
    }

    // ---------- Иконки ----------
    const IC = {
        brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5a3 3 0 1 0-5.997.142 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.142 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg>',
        eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
        close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>',
        play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
        trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>'
    };

    // ---------- Состояние страницы ----------
    const STORE_KEY = 'kc_fsrs_' + location.pathname;
    let store = loadStore();
    let TOPICS = [];
    let session = null;
    let revealed = false;

    function loadStore() {
        try { return JSON.parse(kcGet(STORE_KEY) || '{}') || {}; } catch (_) { return {}; }
    }
    function saveStore() { kcSet(STORE_KEY, JSON.stringify(store)); }

    function todayStr() {
        const d = new Date();
        return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    }
    function introAllowance() {
        const m = store.__meta || {};
        if (m.introDate !== todayStr()) return NEW_PER_DAY;
        return Math.max(0, NEW_PER_DAY - (m.introCount || 0));
    }
    function recordIntro() {
        if (!store.__meta) store.__meta = {};
        if (store.__meta.introDate !== todayStr()) { store.__meta.introDate = todayStr(); store.__meta.introCount = 0; }
        store.__meta.introCount++;
    }

    // ---------- Темы и карточки ----------
    function discoverTopics() {
        const out = [];
        document.querySelectorAll('article.topic[id]').forEach(a => {
            const t = a.querySelector('.topic-title');
            if (t) out.push({ id: a.id, name: t.textContent.trim() });
        });
        return out;
    }

    function extractCards(topicIds) {
        const cards = [];
        topicIds.forEach(tid => {
            const topic = document.getElementById(tid);
            if (!topic) return;
            const tname = topic.querySelector('.topic-title')?.textContent.trim() || '';
            topic.querySelectorAll('.definition-box').forEach((box, i) => {
                const strong = box.querySelector('strong');
                if (!strong) return;
                const termClone = strong.cloneNode(true);
                termClone.querySelectorAll('.katex').forEach(el => el.remove());
                const term = termClone.textContent.trim();
                if (!term) return;
                const back = box.cloneNode(true);
                back.querySelectorAll('.bookmark-btn, .copy-block-btn').forEach(el => el.remove());
                cards.push({
                    id: tid + '::' + i + '::' + term,
                    topicId: tid,
                    topicName: tname,
                    term: term,
                    termHTML: strong.innerHTML,
                    backHTML: back.innerHTML
                });
            });
        });
        return cards;
    }

    // Счётчики due/new для темы (для списка тем — как колоды в Anki)
    function topicCounts(tid) {
        const now = Date.now();
        let due = 0, fresh = 0;
        extractCards([tid]).forEach(c => {
            const st = store[c.id];
            if (!st || st.S == null) fresh++;
            else if (st.due <= now) due++;
        });
        return { due, fresh };
    }

    // ---------- Рендер математики ----------
    function renderMath(el) {
        if (!el || typeof renderMathInElement === 'undefined') return;
        try {
            renderMathInElement(el, {
                delimiters: [
                    { left: '\\[', right: '\\]', display: true },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '$', right: '$', display: false }
                ],
                throwOnError: false, trust: true
            });
        } catch (_) {}
    }

    // ---------- Форматирование интервала ----------
    function fmtInterval(days) {
        if (days < 1) {
            const mins = Math.round(days * 1440);
            if (mins < 1) return '<1 мин';
            if (mins < 60) return mins + ' мин';
            return Math.round(days * 24) + ' ч';
        }
        if (days < 30) return Math.round(days) + ' дн';
        if (days < 365) return Math.round(days / 30) + ' мес';
        const y = days / 365;
        return (y < 10 ? y.toFixed(1) : Math.round(y)) + ' г';
    }

    function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
    function plural(n, one, few, many) {
        if (n % 10 === 1 && n % 100 !== 11) return one;
        if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return few;
        return many;
    }

    // ============================================
    //  DOM: кнопка + модальные окна
    // ============================================
    function buildUI() {
        // Убираем старую инлайн-разметку (если осталась на странице)
        ['topicSelectionOverlay', 'knowledgeCheckOverlay', 'newFeatureOverlay'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });

        // Кнопка в сайдбаре (переиспользуем существующую, иначе создаём)
        let btn = document.getElementById('knowledgeCheckBtn');
        if (!btn) {
            const container = document.querySelector('.sidebar-actions') || document.querySelector('.nav-menu');
            if (container) {
                btn = document.createElement('button');
                btn.id = 'knowledgeCheckBtn';
                btn.className = 'knowledge-check-btn';
                btn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg><span>Проверка знаний</span>';
                container.appendChild(btn);
            }
        }
        if (btn) btn.addEventListener('click', openSelect);

        // Оверлеи
        const select = document.createElement('div');
        select.className = 'auth-overlay hidden';
        select.id = 'kcSelectOverlay';
        select.innerHTML =
            '<div class="auth-modal kc-modal" id="kcSelectModal" role="dialog" aria-modal="true">' +
                '<button class="kc-close" id="kcSelectClose" aria-label="Закрыть">' + IC.close + '</button>' +
                '<div class="kc-head"><span class="kc-head-icon">' + IC.brain + '</span>' +
                    '<div class="kc-head-text"><h2 class="kc-title">Проверка знаний</h2>' +
                    '<p class="kc-subtitle">Интервальное повторение определений · FSRS</p></div></div>' +
                '<div class="kc-intensity">' +
                    '<span class="kc-intensity-lbl">Интервалы</span>' +
                    '<div class="kc-intensity-opts" id="kcIntensityOpts">' +
                        RETENTION_PRESETS.map(function (p) {
                            return '<button type="button" class="kc-intensity-btn" data-r="' + p.r +
                                '" title="удержание ' + Math.round(p.r * 100) + '%">' + p.label + '</button>';
                        }).join('') +
                    '</div>' +
                '</div>' +
                '<div class="kc-deck-list" id="kcDeckList"></div>' +
                '<div class="kc-actions">' +
                    '<button class="kc-btn kc-btn-ghost" id="kcSelectAll">Выбрать всё</button>' +
                    '<button class="kc-btn kc-btn-primary" id="kcStart">' + IC.play + 'Учить<span class="kc-count-badge" id="kcStartCount">0</span></button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(select);

        const review = document.createElement('div');
        review.className = 'auth-overlay hidden';
        review.id = 'kcReviewOverlay';
        review.innerHTML =
            '<div class="auth-modal kc-modal kc-modal-game" id="kcReviewModal" role="dialog" aria-modal="true">' +
                '<div class="kc-game-bar">' +
                    '<div class="kc-counts" id="kcCounts"></div>' +
                    '<button class="kc-close" id="kcReviewClose" aria-label="Закрыть">' + IC.close + '</button>' +
                '</div>' +
                '<div class="kc-progress-track" aria-hidden="true"><div class="kc-progress-fill" id="kcProgressFill"></div></div>' +
                '<div class="kc-content" id="kcContent"></div>' +
                '<div class="kc-grade-row" id="kcGrades" hidden></div>' +
            '</div>';
        document.body.appendChild(review);

        // Закрытие
        document.getElementById('kcSelectClose').addEventListener('click', () => hide('kcSelectOverlay'));
        document.getElementById('kcReviewClose').addEventListener('click', closeReview);
        select.addEventListener('click', e => { if (e.target === select) hide('kcSelectOverlay'); });
        review.addEventListener('click', e => { if (e.target === review) closeReview(); });

        document.getElementById('kcSelectAll').addEventListener('click', toggleSelectAll);
        document.getElementById('kcStart').addEventListener('click', startSession);

        const intensityOpts = document.getElementById('kcIntensityOpts');
        if (intensityOpts) intensityOpts.addEventListener('click', (e) => {
            const b = e.target.closest('.kc-intensity-btn');
            if (!b) return;
            setRetention(parseFloat(b.dataset.r));
            syncIntensity();
        });

        initSwipe('kcSelectOverlay', 'kcSelectModal', () => hide('kcSelectOverlay'));
        initSwipe('kcReviewOverlay', 'kcReviewModal', closeReview);
    }

    function hide(id) { document.getElementById(id)?.classList.add('hidden'); }

    // ============================================
    //  Экран выбора тем (список «колод»)
    // ============================================
    let selected = [];

    function openSelect() {
        TOPICS = discoverTopics();
        store = loadStore();
        if (selected.length === 0) selected = TOPICS.map(t => t.id); // по умолчанию — всё
        renderDeckList();
        syncIntensity();
        document.getElementById('kcSelectOverlay').classList.remove('hidden');
    }

    function syncIntensity() {
        const r = getRetention();
        document.querySelectorAll('#kcIntensityOpts .kc-intensity-btn').forEach(b => {
            b.classList.toggle('active', Math.abs(parseFloat(b.dataset.r) - r) < 0.001);
        });
    }

    function renderDeckList() {
        const list = document.getElementById('kcDeckList');
        list.innerHTML = '';
        let totalDue = 0, totalNew = 0;
        TOPICS.forEach(t => {
            const { due, fresh } = topicCounts(t.id);
            totalDue += due; totalNew += fresh;
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'kc-deck' + (selected.includes(t.id) ? ' selected' : '');
            card.dataset.topic = t.id;
            card.innerHTML =
                '<span class="kc-deck-check">' + IC.check + '</span>' +
                '<span class="kc-deck-name">' + escapeHtml(t.name) + '</span>' +
                '<span class="kc-deck-counts">' +
                    (due ? '<span class="kc-pill kc-pill-due" title="К повторению">' + due + '</span>' : '') +
                    (fresh ? '<span class="kc-pill kc-pill-new" title="Новые">' + fresh + '</span>' : '') +
                    (!due && !fresh ? '<span class="kc-pill kc-pill-done">' + IC.check + '</span>' : '') +
                '</span>';
            card.addEventListener('click', () => {
                if (selected.includes(t.id)) selected = selected.filter(x => x !== t.id);
                else selected.push(t.id);
                card.classList.toggle('selected');
                updateStartBtn();
            });
            list.appendChild(card);
        });
        updateStartBtn();
        updateSelectAllLabel();
    }

    function updateStartBtn() {
        const now = Date.now();
        let count = 0, allowance = introAllowance(), newSeen = 0;
        selected.forEach(tid => extractCards([tid]).forEach(c => {
            const st = store[c.id];
            if (!st || st.S == null) { if (newSeen < allowance) { newSeen++; count++; } }
            else if (st.due <= now) count++;
        }));
        const badge = document.getElementById('kcStartCount');
        badge.textContent = count;
        badge.classList.toggle('is-empty', count === 0);
        const start = document.getElementById('kcStart');
        start.disabled = selected.length === 0;
    }

    function updateSelectAllLabel() {
        const b = document.getElementById('kcSelectAll');
        if (b) b.textContent = (selected.length === TOPICS.length && TOPICS.length) ? 'Снять всё' : 'Выбрать всё';
    }

    function toggleSelectAll() {
        selected = (selected.length === TOPICS.length) ? [] : TOPICS.map(t => t.id);
        renderDeckList();
    }

    // ============================================
    //  Сессия повторения
    // ============================================
    function startSession() {
        if (selected.length === 0) return;
        const now = Date.now();
        const cards = extractCards(selected);
        const learn = [], review = [], fresh = [];
        cards.forEach(c => {
            const st = store[c.id];
            if (!st || st.S == null) fresh.push(c);
            else if (st.due <= now) (st.learning ? learn : review).push(c);
        });
        shuffle(review); shuffle(fresh);
        const allowance = introAllowance();
        const newCards = fresh.slice(0, allowance);

        const queue = []
            .concat(learn.map(c => ({ card: c, type: 'learn' })))
            .concat(review.map(c => ({ card: c, type: 'review' })))
            .concat(newCards.map(c => ({ card: c, type: 'new' })));

        if (queue.length === 0) { showEmptyState(); document.getElementById('kcSelectOverlay').classList.add('hidden'); document.getElementById('kcReviewOverlay').classList.remove('hidden'); return; }

        session = { queue, reviewed: 0, again: 0, good: 0, planned: queue.length };
        document.getElementById('kcSelectOverlay').classList.add('hidden');
        document.getElementById('kcReviewOverlay').classList.remove('hidden');
        showCard();
    }

    function counts() {
        const c = { 'new': 0, learn: 0, review: 0 };
        session.queue.forEach(q => { c[q.type]++; });
        return c;
    }

    function renderCounts() {
        const el = document.getElementById('kcCounts');
        if (!el) return;
        const c = counts();
        el.innerHTML =
            '<span class="kc-count kc-count-new" title="Новые">' + c['new'] + '</span>' +
            '<span class="kc-count kc-count-learn" title="Изучаются">' + c.learn + '</span>' +
            '<span class="kc-count kc-count-review" title="К повторению">' + c.review + '</span>';
        const fill = document.getElementById('kcProgressFill');
        if (fill) {
            const done = session.reviewed;
            const total = done + session.queue.length;
            fill.style.width = (total ? Math.round(done / total * 100) : 100) + '%';
        }
    }

    function showCard() {
        if (!session || session.queue.length === 0) { showSummary(); return; }
        revealed = false;
        const item = session.queue[0];
        const def = item.card;
        renderCounts();
        const content = document.getElementById('kcContent');
        content.innerHTML =
            '<div class="kc-card-wrap">' +
                '<div class="kc-topic-label">' + escapeHtml(def.topicName) + '</div>' +
                '<button type="button" class="kc-flashcard" id="kcFront">' +
                    '<span class="kc-flashcard-term">' + (def.termHTML || escapeHtml(def.term)) + '</span>' +
                    '<span class="kc-flashcard-tap">' + IC.eye + '<span>показать ответ</span></span>' +
                '</button>' +
                '<div class="kc-definition" id="kcBack" hidden>' + def.backHTML + '</div>' +
            '</div>';
        // Кнопки оценок — закреплённый футер модалки (вне прокручиваемого контента),
        // поэтому всегда видны даже на невысоких экранах; сбрасываем их под новую карточку.
        const grades = document.getElementById('kcGrades');
        if (grades) { grades.hidden = true; grades.innerHTML = ''; }
        const front = document.getElementById('kcFront');
        front.addEventListener('click', reveal);
        setTimeout(() => { renderMath(front); }, 30);
    }

    function reveal() {
        if (revealed || !session) return;
        revealed = true;
        const back = document.getElementById('kcBack');
        const front = document.getElementById('kcFront');
        const grades = document.getElementById('kcGrades');
        if (back) { back.hidden = false; back.classList.add('is-shown'); renderMath(back); }
        if (front) front.classList.add('is-revealed');

        // Превью интервалов для каждой оценки
        const st = store[session.queue[0].card.id];
        const now = Date.now();
        const labels = [
            { g: 1, cls: 'again', name: 'Снова' },
            { g: 2, cls: 'hard', name: 'Трудно' },
            { g: 3, cls: 'good', name: 'Хорошо' },
            { g: 4, cls: 'easy', name: 'Легко' }
        ];
        grades.innerHTML = labels.map(L => {
            const p = project(st, L.g, now);
            return '<button class="kc-grade kc-grade-' + L.cls + '" data-g="' + L.g + '">' +
                '<span class="kc-grade-iv">' + fmtInterval(p.intervalDays) + '</span>' +
                '<span class="kc-grade-lbl">' + L.name + '</span>' +
                '<kbd class="kc-kbd">' + L.g + '</kbd></button>';
        }).join('');
        grades.hidden = false;
        grades.querySelectorAll('.kc-grade').forEach(b => {
            b.addEventListener('click', () => grade(parseInt(b.dataset.g, 10)));
        });
    }

    function grade(G) {
        if (!revealed || !session || session.queue.length === 0) return;
        const item = session.queue.shift();
        const def = item.card;
        const prev = store[def.id];
        const wasNew = !prev || prev.S == null;
        const now = Date.now();
        const res = project(prev, G, now);

        store[def.id] = { S: res.S, D: res.D, due: res.due, last: res.last, reps: res.reps, lapses: res.lapses, learning: res.learning };
        if (wasNew) recordIntro();
        saveStore();

        session.reviewed++;
        if (G === 1) session.again++; else session.good++;

        if (res.learning) {
            // Вернуть карточку в этой же сессии (через несколько других)
            const pos = Math.min(session.queue.length, 2 + Math.floor(Math.random() * 2));
            session.queue.splice(pos, 0, { card: def, type: 'learn' });
        }
        showCard();
    }

    function showEmptyState() {
        revealed = false;
        const content = document.getElementById('kcContent');
        const fill = document.getElementById('kcProgressFill');
        if (fill) fill.style.width = '100%';
        document.getElementById('kcCounts').innerHTML = '';
        content.innerHTML =
            '<div class="kc-final">' +
                '<div class="kc-final-icon kc-final-icon-ok">' + IC.check + '</div>' +
                '<h3 class="kc-final-title">Всё повторено</h3>' +
                '<p class="kc-final-sub">На сегодня карточек к повторению нет. Возвращайтесь позже — расписание подскажет, когда.</p>' +
                '<div class="kc-final-actions"><button class="kc-btn kc-btn-primary" id="kcEmptyDone">Готово</button></div>' +
            '</div>';
        document.getElementById('kcEmptyDone').addEventListener('click', closeReview);
    }

    function showSummary() {
        revealed = false;
        const content = document.getElementById('kcContent');
        const fill = document.getElementById('kcProgressFill');
        if (fill) fill.style.width = '100%';
        document.getElementById('kcCounts').innerHTML = '';
        const reviewed = session ? session.reviewed : 0;
        const again = session ? session.again : 0;
        const acc = reviewed ? Math.round((1 - again / reviewed) * 100) : 100;

        // Когда следующая карта снова станет due
        let nextDue = nextDueAcrossSelected();
        const nextLbl = nextDue ? fmtInterval(Math.max(0, (nextDue - Date.now()) / DAY)) : null;

        content.innerHTML =
            '<div class="kc-final">' +
                '<div class="kc-final-icon kc-final-icon-ok">' + IC.trophy + '</div>' +
                '<h3 class="kc-final-title">Сессия завершена</h3>' +
                '<div class="kc-final-stats">' +
                    '<div class="kc-fstat"><span class="kc-fstat-val">' + reviewed + '</span><span class="kc-fstat-lbl">' + plural(reviewed, 'повтор', 'повтора', 'повторов') + '</span></div>' +
                    '<div class="kc-fstat kc-fstat-ok"><span class="kc-fstat-val">' + acc + '%</span><span class="kc-fstat-lbl">верно</span></div>' +
                    (nextLbl ? '<div class="kc-fstat"><span class="kc-fstat-val">' + nextLbl + '</span><span class="kc-fstat-lbl">до повтора</span></div>' : '') +
                '</div>' +
                '<div class="kc-final-actions">' +
                    '<button class="kc-btn kc-btn-ghost" id="kcAgainDecks">К темам</button>' +
                    '<button class="kc-btn kc-btn-primary" id="kcDone">Готово</button>' +
                '</div>' +
            '</div>';
        document.getElementById('kcDone').addEventListener('click', closeReview);
        document.getElementById('kcAgainDecks').addEventListener('click', () => {
            document.getElementById('kcReviewOverlay').classList.add('hidden');
            openSelect();
        });
    }

    function nextDueAcrossSelected() {
        const now = Date.now();
        let min = null;
        extractCards(selected).forEach(c => {
            const st = store[c.id];
            if (st && st.due > now) min = (min == null) ? st.due : Math.min(min, st.due);
        });
        return min;
    }

    function closeReview() {
        session = null;
        document.getElementById('kcReviewOverlay').classList.add('hidden');
    }

    function shuffle(a) {
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
        return a;
    }

    // ---------- Клавиатура: Space — показать; 1–4 — оценки ----------
    function initKeyboard() {
        document.addEventListener('keydown', e => {
            const ov = document.getElementById('kcReviewOverlay');
            if (!ov || ov.classList.contains('hidden') || !session) return;
            const tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if (!revealed && (e.key === ' ' || e.key === 'Enter' || e.code === 'Space')) { e.preventDefault(); reveal(); }
            else if (revealed && ['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); grade(parseInt(e.key, 10)); }
        });
    }

    // ---------- Свайп-закрытие на мобильных ----------
    function initSwipe(overlayId, modalId, onClose) {
        const overlay = document.getElementById(overlayId);
        if (!overlay) return;
        let startY = 0, currentY = 0, tracking = false, activated = false;
        const DEAD = 15;
        const getModal = () => document.getElementById(modalId);
        overlay.addEventListener('touchstart', e => {
            if (window.innerWidth > 768) return;
            const m = getModal();
            if (!m || m.scrollTop > 5) return;
            startY = currentY = e.touches[0].clientY; tracking = true; activated = false;
        }, { passive: true });
        overlay.addEventListener('touchmove', e => {
            if (!tracking) return;
            const m = getModal(); if (!m) return;
            currentY = e.touches[0].clientY;
            const d = currentY - startY;
            if (!activated) { if (d > DEAD) { activated = true; startY = currentY; m.style.transition = 'none'; } return; }
            const sd = currentY - startY;
            if (sd > 0) { e.preventDefault(); m.style.transform = 'translateY(' + sd + 'px)'; overlay.style.background = 'rgba(0,0,0,' + Math.max(0, 0.75 - sd / 400) + ')'; }
        }, { passive: false });
        overlay.addEventListener('touchend', () => {
            if (!tracking) return; tracking = false;
            if (!activated) return; activated = false;
            const m = getModal(); if (!m) return;
            const d = currentY - startY;
            if (d > 60) {
                m.style.transition = 'transform 0.25s ease-out'; m.style.transform = 'translateY(100vh)';
                overlay.style.transition = 'background 0.25s ease-out'; overlay.style.background = 'rgba(0,0,0,0)';
                setTimeout(() => { onClose(); m.style.transition = ''; m.style.transform = ''; overlay.style.transition = ''; overlay.style.background = ''; }, 250);
            } else {
                m.style.transition = 'transform 0.25s ease-out'; m.style.transform = '';
                overlay.style.transition = 'background 0.25s ease-out'; overlay.style.background = '';
                setTimeout(() => { m.style.transition = ''; overlay.style.transition = ''; }, 250);
            }
        });
    }

    // ---------- Инициализация ----------
    function init() {
        TOPICS = discoverTopics();
        if (TOPICS.length === 0) return; // нет тем — нечего повторять
        buildUI();
        initKeyboard();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    // Экспорт для отладки/тестов
    window.__kcFSRS = { project, intervalForStability, retrievability, W, DECAY, FACTOR, fmtInterval };
})();
