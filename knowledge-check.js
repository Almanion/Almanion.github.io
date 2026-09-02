// ============================================
// ПРОВЕРКА ЗНАНИЙ — адаптивное интервальное повторение
// ============================================
//
// Самодостаточный модуль: сам создаёт кнопку в сайдбаре и модальные окна,
// поэтому достаточно подключить этот скрипт на странице с темами (.topic[id])
// и определениями (.definition-box). Прогресс карточек хранится локально
// (localStorage) по странице и переживает перезагрузки и закрытие сайта.
//
// Планировщик использует модель DSR: difficulty (трудность), stability
// (устойчивость памяти) и retrievability (текущая вероятность вспомнить).
// Слабые и просроченные карточки идут первыми, число новых карточек зависит от
// накопившихся повторов, а повтор внутри сессии назначается только после
// «Снова»/«Трудно». Старые записи с лестницей step мигрируют без потери due/last.

(function () {
    'use strict';

    // ---------- Безопасный localStorage ----------
    const kcGet = (window.safeStorageGet) || function (k) { try { return localStorage.getItem(k); } catch (_) { return null; } };
    const kcSet = (window.safeStorageSet) || function (k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } };

    // ---------- Адаптивное расписание ----------
    const MINUTE = 60000;
    const DAY = 86400000;
    const TARGET_RETENTION = 0.90;
    const DECAY = -0.5;
    const FACTOR = 19 / 81;
    const MIN_STABILITY = 1 / 1440;
    const MAX_DAYS = 36500;
    const NEW_PER_DAY = 12;
    const MAX_SESSION_CARDS = 30;
    const MAX_SAME_SESSION_PRESENTATIONS = 5;

    // Нужна только для точной миграции старых состояний.
    const STEPS_MIN = [1, 3, 5, 10, 30, 60, 180, 300, 1440, 4320, 7200];
    const LAST_STEP = STEPS_MIN.length - 1;

    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

    // Длина ступени в минутах (после лесенки — удвоение от последней ступени).
    function stepMinutes(step) {
        if (step <= 0) return STEPS_MIN[0];
        if (step <= LAST_STEP) return STEPS_MIN[step];
        return Math.min(STEPS_MIN[LAST_STEP] * Math.pow(2, step - LAST_STEP), MAX_DAYS * 1440);
    }
    // Старая ступень сохраняется в записи для совместимости с уже закэшированной
    // версией сайта, но больше не управляет расписанием.
    function nextStep(state, G) {
        const s = (state && typeof state.step === 'number') ? state.step : -1; // -1 = новая
        if (s < 0) return [0, 1, 2, 4][G - 1];   // новая карточка
        if (G === 1) return 0;                    // Снова → в начало лесенки
        if (G === 2) return s;                    // Трудно → та же ступень
        if (G === 3) return s + 1;                // Хорошо → следующая
        return s + 2;                             // Лёгко → через одну
    }

    function isNewState(state) {
        return !state || (state.step == null && state.stability == null && state.reps == null);
    }

    function normalizeState(state) {
        if (isNewState(state)) return null;
        const last = finite(state.last, Date.now());
        const legacyDays = Math.max(MIN_STABILITY, (finite(state.due, last) - last) / DAY);
        const legacyStepDays = typeof state.step === 'number' ? stepMinutes(state.step) / 1440 : legacyDays;
        const stability = clamp(finite(state.stability, Math.max(legacyDays, legacyStepDays)), MIN_STABILITY, MAX_DAYS);
        const reps = Math.max(0, Math.round(finite(state.reps, 0)));
        const lapses = Math.max(0, Math.round(finite(state.lapses, 0)));
        return {
            v: 2,
            step: typeof state.step === 'number' ? state.step : Math.max(0, reps - lapses),
            phase: state.phase || (state.learning ? 'learning' : 'review'),
            stability: stability,
            difficulty: clamp(finite(state.difficulty, 5 + Math.min(3, lapses * 0.35)), 1, 10),
            due: finite(state.due, last),
            last: last,
            reps: reps,
            lapses: lapses,
            lastGrade: finite(state.lastGrade, 0)
        };
    }

    function retrievability(state, now) {
        const st = normalizeState(state);
        if (!st) return 0;
        const elapsed = Math.max(0, (now - st.last) / DAY);
        return clamp(Math.pow(1 + FACTOR * elapsed / st.stability, DECAY), 0, 1);
    }

    function intervalForStability(stability, retention) {
        return clamp(stability / FACTOR * (Math.pow(retention, 1 / DECAY) - 1), MIN_STABILITY, MAX_DAYS);
    }

    function nextDifficulty(previous, G) {
        if (!previous) return [8.5, 7, 5, 3.5][G - 1];
        const delta = [1.2, 0.4, -0.15, -0.65][G - 1];
        return clamp(previous + 0.08 * (5 - previous) + delta, 1, 10);
    }

    function finishProjection(previous, G, now, stability, intervalDays, phase) {
        const old = normalizeState(previous);
        return {
            v: 2,
            step: nextStep(previous, G),
            phase: phase,
            stability: clamp(stability, MIN_STABILITY, MAX_DAYS),
            difficulty: nextDifficulty(old && old.difficulty, G),
            intervalDays: clamp(intervalDays, MIN_STABILITY, MAX_DAYS),
            due: now + clamp(intervalDays, MIN_STABILITY, MAX_DAYS) * DAY,
            last: now,
            reps: (old ? old.reps : 0) + 1,
            lapses: (old ? old.lapses : 0) + (G === 1 ? 1 : 0),
            learning: phase !== 'review',
            lastGrade: G
        };
    }

    // Рассчитать состояние после оценки (1 Снова · 2 Трудно · 3 Хорошо · 4 Легко).
    function project(state, G, now) {
        G = clamp(Math.round(finite(G, 3)), 1, 4);
        const old = normalizeState(state);

        if (!old) {
            const stability = [0.08, 0.30, 1, 4][G - 1];
            const intervals = [1 / 1440, 8 / 1440, 1, 4];
            return finishProjection(null, G, now, stability, intervals[G - 1], G < 3 ? 'learning' : 'review');
        }

        if (old.phase === 'learning' || old.phase === 'relearning') {
            if (G === 1) return finishProjection(old, G, now, Math.max(0.04, old.stability * 0.7), 1 / 1440, old.phase);
            if (G === 2) return finishProjection(old, G, now, Math.max(0.25, old.stability * 1.05), 8 / 1440, old.phase);
            const relearning = old.phase === 'relearning';
            const multiplier = G === 4 ? (relearning ? 1.8 : 3.2) : (relearning ? 1.25 : 2.2);
            const floor = G === 4 ? (relearning ? 3 : 4) : 1;
            const stability = Math.max(floor, old.stability * multiplier);
            return finishProjection(old, G, now, stability, intervalForStability(stability, TARGET_RETENTION), 'review');
        }

        const R = retrievability(old, now);
        const difficulty = nextDifficulty(old.difficulty, G);
        if (G === 1) {
            const lapseStability = Math.min(old.stability, Math.max(0.15,
                0.5 * Math.pow(old.stability, 0.65) * (11 - difficulty) / 10));
            return finishProjection(old, G, now, lapseStability, 2 / 1440, 'relearning');
        }

        const memoryGain = (11 - difficulty) * Math.pow(old.stability, -0.20) *
            (Math.exp((1 - R) * 2.8) - 1);
        const gradeGain = G === 2 ? 0.35 : (G === 3 ? 0.75 : 1.15);
        const minimumGrowth = G === 2 ? 1.12 : (G === 3 ? 1.30 : 1.75);
        let stability = Math.max(old.stability * minimumGrowth, old.stability * (1 + memoryGain * gradeGain));
        if (G === 4) stability *= 1.08;
        stability = clamp(stability, MIN_STABILITY, MAX_DAYS);
        return finishProjection(old, G, now, stability, intervalForStability(stability, TARGET_RETENTION), 'review');
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
    function saveStore() {
        if (!store.__meta) store.__meta = {};
        store.__meta.schema = 2;
        store.__meta.updatedAt = Date.now();
        kcSet(STORE_KEY, JSON.stringify(store));
        // Сигнал для account.js (синхронизация прогресса в облако).
        try { window.dispatchEvent(new CustomEvent('kc-store-changed', { detail: { key: STORE_KEY } })); } catch (_) {}
    }

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
            if (isNewState(st)) fresh++;
            else if (normalizeState(st).due <= now) due++;
        });
        return { due, fresh };
    }

    function recommendationScore(state, now) {
        const st = normalizeState(state);
        if (!st) return -1;
        if (st.phase === 'learning' || st.phase === 'relearning') return 100 + (now - st.due) / DAY;
        const risk = 1 - retrievability(st, now);
        const overdueDays = Math.max(0, (now - st.due) / DAY);
        const overdueRelative = overdueDays / Math.max(0.25, st.stability);
        const lapseRate = st.lapses / Math.max(1, st.reps);
        return risk * 8 + Math.min(4, overdueRelative) + st.difficulty * 0.08 + lapseRate * 2;
    }

    function spreadNewCards(cards) {
        const buckets = new Map();
        cards.forEach(card => {
            if (!buckets.has(card.topicId)) buckets.set(card.topicId, []);
            buckets.get(card.topicId).push(card);
        });
        const out = [];
        const groups = Array.from(buckets.values());
        let added = true;
        while (added) {
            added = false;
            groups.forEach(group => {
                if (group.length) { out.push(group.shift()); added = true; }
            });
        }
        return out;
    }

    function mixRecommendedQueue(review, fresh) {
        const queue = [];
        let ri = 0, ni = 0;
        while (ri < review.length || ni < fresh.length) {
            for (let i = 0; i < 3 && ri < review.length; i++, ri++) queue.push(review[ri]);
            if (ni < fresh.length) queue.push(fresh[ni++]);
            if (ri >= review.length && ni < fresh.length) queue.push(fresh[ni++]);
        }
        return queue;
    }

    function buildRecommendation(cards, now) {
        const due = [];
        const fresh = [];
        cards.forEach(card => {
            const state = store[card.id];
            if (isNewState(state)) fresh.push(card);
            else {
                const normalized = normalizeState(state);
                if (normalized.due <= now) due.push({ card: card, state: normalized, score: recommendationScore(normalized, now) });
            }
        });
        due.sort((a, b) => b.score - a.score || a.state.due - b.state.due || a.card.id.localeCompare(b.card.id));

        const reviewPicked = due.slice(0, MAX_SESSION_CARDS).map(x => ({
            card: x.card,
            type: x.state.phase === 'review' ? 'review' : 'learn'
        }));
        const freeSlots = Math.max(0, MAX_SESSION_CARDS - reviewPicked.length);
        const suggestedNew = due.length >= 24 ? 0 : clamp(Math.round(8 - due.length / 4), 2, 8);
        const newCount = Math.min(freeSlots, introAllowance(), suggestedNew, fresh.length);
        const newPicked = spreadNewCards(fresh).slice(0, newCount).map(card => ({ card: card, type: 'new' }));

        return {
            queue: mixRecommendedQueue(reviewPicked, newPicked),
            dueTotal: due.length,
            reviewCount: reviewPicked.length,
            newCount: newPicked.length,
            newTotal: fresh.length,
            deferred: Math.max(0, due.length - reviewPicked.length)
        };
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
                    '<p class="kc-subtitle">Адаптивное повторение определений</p></div></div>' +
                '<div class="kc-recommendation" id="kcRecommendation" aria-live="polite"></div>' +
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
        document.getElementById('kcSelectOverlay').classList.remove('hidden');
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
        const plan = buildRecommendation(extractCards(selected), now);
        const count = plan.queue.length;
        const badge = document.getElementById('kcStartCount');
        badge.textContent = count;
        badge.classList.toggle('is-empty', count === 0);
        const start = document.getElementById('kcStart');
        start.disabled = selected.length === 0;
        const recommendation = document.getElementById('kcRecommendation');
        if (recommendation) {
            if (selected.length === 0) {
                recommendation.innerHTML = '<strong>Выберите темы</strong><span>Алгоритм соберёт короткую сессию.</span>';
            } else if (count === 0) {
                recommendation.innerHTML = '<strong>На сейчас всё</strong><span>Повторения появятся, когда начнёт снижаться вероятность вспомнить.</span>';
            } else {
                const parts = [];
                if (plan.reviewCount) parts.push(plan.reviewCount + ' к повторению');
                if (plan.newCount) parts.push(plan.newCount + ' ' + plural(plan.newCount, 'новая', 'новые', 'новых'));
                recommendation.innerHTML = '<strong>Рекомендовано: ' + count + ' ' + plural(count, 'карточка', 'карточки', 'карточек') + '</strong>' +
                    '<span><span class="kc-visually-hidden">Состав: </span>' + parts.join(' · ') +
                    (plan.deferred ? ' · ещё ' + plan.deferred + ' в следующую сессию' : '') + '</span>';
            }
        }
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
        const plan = buildRecommendation(cards, now);
        const queue = plan.queue;

        if (queue.length === 0) { showEmptyState(); document.getElementById('kcSelectOverlay').classList.add('hidden'); document.getElementById('kcReviewOverlay').classList.remove('hidden'); return; }

        session = {
            queue: queue,
            reviewed: 0,
            again: 0,
            recalled: 0,
            planned: queue.length,
            cardStats: Object.create(null)
        };
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
        const wasNew = isNewState(prev);
        const now = Date.now();
        const res = project(prev, G, now);

        store[def.id] = {
            v: res.v,
            step: res.step,
            phase: res.phase,
            stability: res.stability,
            difficulty: res.difficulty,
            due: res.due,
            last: res.last,
            reps: res.reps,
            lapses: res.lapses,
            learning: res.learning,
            lastGrade: res.lastGrade
        };
        if (wasNew) recordIntro();
        saveStore();

        session.reviewed++;
        if (G === 1) session.again++; else session.recalled++;

        // Внутрисессионные повторы адаптивны: уверенно вспомненная карточка не
        // дублируется, «Трудно» требует ещё одного успешного извлечения, «Снова» —
        // двух. Ограничение не даёт одной сложной карточке захватить всю сессию.
        const stats = session.cardStats[def.id] || { shown: 0, pendingSuccesses: 0 };
        stats.shown++;
        if (G === 1) stats.pendingSuccesses = Math.max(stats.pendingSuccesses, 2);
        else if (G === 2) stats.pendingSuccesses = Math.max(stats.pendingSuccesses, 1);
        else stats.pendingSuccesses = Math.max(0, stats.pendingSuccesses - 1);
        session.cardStats[def.id] = stats;

        if (stats.pendingSuccesses > 0 && stats.shown < MAX_SAME_SESSION_PRESENTATIONS) {
            const distance = G === 1 ? 2 : 4;
            const pos = Math.min(session.queue.length, distance);
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
        const unique = session ? Object.keys(session.cardStats).length : 0;
        const acc = reviewed ? Math.round((1 - again / reviewed) * 100) : 100;

        // Когда следующая карта снова станет due
        let nextDue = nextDueAcrossSelected();
        const nextLbl = nextDue ? fmtInterval(Math.max(0, (nextDue - Date.now()) / DAY)) : null;

        content.innerHTML =
            '<div class="kc-final">' +
                '<div class="kc-final-icon kc-final-icon-ok">' + IC.trophy + '</div>' +
                '<h3 class="kc-final-title">Сессия завершена</h3>' +
                '<div class="kc-final-stats">' +
                    '<div class="kc-fstat"><span class="kc-fstat-val">' + unique + '</span><span class="kc-fstat-lbl">' + plural(unique, 'карточка', 'карточки', 'карточек') + '</span></div>' +
                    '<div class="kc-fstat"><span class="kc-fstat-val">' + reviewed + '</span><span class="kc-fstat-lbl">' + plural(reviewed, 'ответ', 'ответа', 'ответов') + '</span></div>' +
                    '<div class="kc-fstat kc-fstat-ok"><span class="kc-fstat-val">' + acc + '%</span><span class="kc-fstat-lbl">вспомнено</span></div>' +
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
            const st = normalizeState(store[c.id]);
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
            // Не перехватываем свайп, если внутренний прокручиваемый список не вверху —
            // иначе пролистывание списка случайно закрывает окно.
            const sc = e.target.closest && e.target.closest('.kc-deck-list, .kc-content');
            if (sc && sc.scrollTop > 5) return;
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
    window.__kcFSRS = {
        project,
        normalizeState,
        retrievability,
        intervalForStability,
        recommendationScore,
        buildRecommendation,
        stepMinutes,
        nextStep,
        STEPS_MIN,
        TARGET_RETENTION,
        MAX_SESSION_CARDS,
        fmtInterval
    };

    // Хук для синхронизации аккаунта (account.js): перечитать прогресс из localStorage,
    // когда облако прислало изменения (но не посреди активной сессии повторения).
    window.KC = window.KC || {};
    window.KC.reload = function (key) {
        if (key === STORE_KEY && !session) store = loadStore();
    };
})();
