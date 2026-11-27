// ============================================
// ПРОВЕРКА ЗНАНИЙ — адаптивное интервальное повторение
// ============================================
//
// Самодостаточный модуль: сам создаёт кнопку в сайдбаре и модальные окна,
// поэтому достаточно подключить этот скрипт на странице с темами (.topic[id])
// и смысловыми учебными блоками. Прогресс карточек хранится локально
// (localStorage) по странице и переживает перезагрузки и закрытие сайта.
//
// Планировщик использует модель DSR: difficulty (трудность), stability
// (устойчивость памяти) и retrievability (текущая вероятность вспомнить).
// Слабые и просроченные карточки идут первыми, но в сессию входят все новые и
// назначенные к повторению карточки без дневной квоты. После «Снова»/«Трудно»
// карточка возвращается до уверенного ответа. Старые записи с лестницей step
// мигрируют без потери due/last.

(function () {
    'use strict';

    // ---------- Безопасный localStorage ----------
    const scopedStorage = window.AlmanionKCStorage || null;
    const kcGet = scopedStorage
        ? function (k) { return scopedStorage.get(k); }
        : ((window.safeStorageGet) || function (k) { try { return localStorage.getItem(k); } catch (_) { return null; } });
    const kcSet = scopedStorage
        ? function (k, v) { return scopedStorage.set(k, v); }
        : ((window.safeStorageSet) || function (k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } });
    const kcRemove = scopedStorage
        ? function (k) { return scopedStorage.remove(k); }
        : ((window.safeStorageRemove) || function (k) { try { localStorage.removeItem(k); return true; } catch (_) { return false; } });

    // ---------- Адаптивное расписание ----------
    const MINUTE = 60000;
    const DAY = 86400000;
    const TARGET_RETENTION = 0.90;
    const DECAY = -0.5;
    const FACTOR = 19 / 81;
    const MIN_STABILITY = 1 / 1440;
    const MAX_DAYS = 36500;
    const SCHEMA_VERSION = 3;
    const SCHEDULER_VERSION = 'fsrs-6@5.4.2';
    const MAX_REVIEW_EVENTS = 200;
    const FSRS_ASSET = 'vendor/ts-fsrs.umd.js?v=5.4.2';

    // Нужна только для точной миграции старых состояний.
    const STEPS_MIN = [1, 3, 5, 10, 30, 60, 180, 300, 1440, 4320, 7200];
    const LAST_STEP = STEPS_MIN.length - 1;

    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const cloneJSON = value => value == null ? value : JSON.parse(JSON.stringify(value));

    let fsrsScheduler = null;
    let fsrsLoading = null;

    function ensureFsrs() {
        if (window.FSRS && typeof window.FSRS.fsrs === 'function') {
            getFsrsScheduler();
            return Promise.resolve(true);
        }
        if (fsrsLoading) return fsrsLoading;
        if (!document || !document.head || typeof document.createElement !== 'function') return Promise.resolve(false);
        fsrsLoading = new Promise(resolve => {
            const existing = document.querySelector && document.querySelector('script[data-kc-fsrs]');
            if (existing) {
                existing.addEventListener('load', () => { getFsrsScheduler(); resolve(true); }, { once: true });
                existing.addEventListener('error', () => resolve(false), { once: true });
                return;
            }
            const script = document.createElement('script');
            script.src = FSRS_ASSET;
            script.async = true;
            script.dataset.kcFsrs = 'true';
            script.addEventListener('load', () => { getFsrsScheduler(); resolve(true); }, { once: true });
            script.addEventListener('error', () => resolve(false), { once: true });
            document.head.appendChild(script);
        });
        return fsrsLoading;
    }

    function getFsrsScheduler() {
        if (fsrsScheduler) return fsrsScheduler;
        if (!window.FSRS || typeof window.FSRS.fsrs !== 'function') return null;
        try {
            fsrsScheduler = window.FSRS.fsrs({
                request_retention: TARGET_RETENTION,
                maximum_interval: MAX_DAYS,
                enable_fuzz: true,
                enable_short_term: true,
                learning_steps: ['1m', '5m'],
                relearning_steps: ['1m', '5m']
            });
        } catch (error) {
            console.warn('Knowledge check: FSRS could not be initialized.', error);
            fsrsScheduler = null;
        }
        return fsrsScheduler;
    }

    function phaseFromFsrsState(value, fallback) {
        const state = Math.round(finite(value, -1));
        if (state === 0) return 'new';
        if (state === 1) return 'learning';
        if (state === 2) return 'review';
        if (state === 3) return 'relearning';
        return fallback || 'review';
    }

    function fsrsStateFromPhase(value) {
        if (value === 'learning') return 1;
        if (value === 'relearning') return 3;
        if (value === 'new') return 0;
        return 2;
    }

    function normalizeReviewEvents(events) {
        if (!Array.isArray(events)) return [];
        const seen = new Set();
        return events.filter(event => {
            if (!event || !event.id || seen.has(String(event.id))) return false;
            seen.add(String(event.id));
            return true;
        }).slice(-MAX_REVIEW_EVENTS).map(event => cloneJSON(event));
    }

    // Длина ступени в минутах (после лестницы — удвоение от последней ступени).
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
        if (G === 1) return 0;                    // Снова → в начало лестницы
        if (G === 2) return s;                    // Трудно → та же ступень
        if (G === 3) return s + 1;                // Хорошо → следующая
        return s + 2;                             // Легко → через одну
    }

    function isNewState(state) {
        if (state && state.fresh === true) return true;
        return !state || (state.step == null && state.stability == null && state.reps == null && state.fsrsState == null);
    }

    function normalizeState(state) {
        if (isNewState(state)) return null;
        const last = finite(state.lastReview, finite(state.last, Date.now()));
        const due = finite(state.due, last);
        const legacyDays = Math.max(MIN_STABILITY, Math.abs(due - last) / DAY);
        const legacyStepDays = typeof state.step === 'number' ? stepMinutes(state.step) / 1440 : legacyDays;
        const stability = clamp(finite(state.stability, Math.max(legacyDays, legacyStepDays)), MIN_STABILITY, MAX_DAYS);
        const reps = Math.max(0, Math.round(finite(state.reps, 0)));
        const lapses = Math.max(0, Math.round(finite(state.lapses, 0)));
        const originalPhase = state.phase || (state.learning ? 'learning' : 'review');
        const fsrsState = clamp(Math.round(finite(state.fsrsState, fsrsStateFromPhase(originalPhase))), 0, 3);
        const phase = phaseFromFsrsState(fsrsState, originalPhase);
        return {
            v: SCHEMA_VERSION,
            fresh: false,
            schedulerVersion: state.schedulerVersion || (Number(state.v) >= 3 ? SCHEDULER_VERSION : 'legacy-dsr'),
            step: typeof state.step === 'number' ? state.step : Math.max(0, reps - lapses),
            phase: phase,
            fsrsState: fsrsState,
            stability: stability,
            difficulty: clamp(finite(state.difficulty, 5 + Math.min(3, lapses * 0.35)), 1, 10),
            due: due,
            last: last,
            lastReview: last,
            elapsedDays: Math.max(0, finite(state.elapsedDays, state.elapsed_days || 0)),
            scheduledDays: Math.max(0, finite(state.scheduledDays, state.scheduled_days || Math.max(0, (due - last) / DAY))),
            learningSteps: Math.max(0, Math.round(finite(state.learningSteps, state.learning_steps || 0))),
            reps: reps,
            lapses: lapses,
            learning: phase !== 'review',
            lastGrade: clamp(Math.round(finite(state.lastGrade, 0)), 0, 4),
            pendingConfirmations: Math.max(0, Math.round(finite(state.pendingConfirmations, 0))),
            confirmationDue: Math.max(0, finite(state.confirmationDue, 0)),
            contentHash: String(state.contentHash || ''),
            contentChangedAt: Math.max(0, finite(state.contentChangedAt, 0)),
            revision: Math.max(0, Math.round(finite(state.revision, reps))),
            updatedAt: Math.max(last, finite(state.updatedAt, last)),
            reviewEvents: normalizeReviewEvents(state.reviewEvents)
        };
    }

    function toFsrsCard(state, now) {
        const normalized = normalizeState(state);
        if (!normalized) return window.FSRS.createEmptyCard(new Date(now));
        return {
            due: new Date(normalized.due),
            stability: normalized.stability,
            difficulty: normalized.difficulty,
            elapsed_days: normalized.elapsedDays,
            scheduled_days: normalized.scheduledDays,
            reps: normalized.reps,
            lapses: normalized.lapses,
            learning_steps: normalized.learningSteps,
            state: normalized.fsrsState,
            last_review: new Date(normalized.lastReview)
        };
    }

    function fromFsrsCard(card, previous, G, now) {
        const old = normalizeState(previous);
        const due = card.due instanceof Date ? card.due.getTime() : finite(card.due, now);
        const last = card.last_review instanceof Date ? card.last_review.getTime() : finite(card.last_review, now);
        const phase = phaseFromFsrsState(card.state, 'review');
        return {
            v: SCHEMA_VERSION,
            fresh: false,
            schedulerVersion: SCHEDULER_VERSION,
            step: nextStep(old, G),
            phase: phase,
            fsrsState: Math.round(finite(card.state, fsrsStateFromPhase(phase))),
            stability: clamp(finite(card.stability, MIN_STABILITY), MIN_STABILITY, MAX_DAYS),
            difficulty: clamp(finite(card.difficulty, 5), 1, 10),
            intervalDays: clamp(Math.max(MIN_STABILITY, (due - now) / DAY), MIN_STABILITY, MAX_DAYS),
            due: due,
            last: last,
            lastReview: last,
            elapsedDays: Math.max(0, finite(card.elapsed_days, 0)),
            scheduledDays: Math.max(0, finite(card.scheduled_days, 0)),
            learningSteps: Math.max(0, Math.round(finite(card.learning_steps, 0))),
            reps: Math.max(0, Math.round(finite(card.reps, (old ? old.reps : 0) + 1))),
            lapses: Math.max(0, Math.round(finite(card.lapses, (old ? old.lapses : 0) + (G === 1 ? 1 : 0)))),
            learning: phase !== 'review',
            lastGrade: G,
            pendingConfirmations: old ? old.pendingConfirmations : 0,
            confirmationDue: old ? old.confirmationDue : 0,
            contentHash: old ? old.contentHash : '',
            contentChangedAt: old ? old.contentChangedAt : 0,
            revision: (old ? old.revision : 0) + 1,
            updatedAt: now,
            reviewEvents: old ? old.reviewEvents : []
        };
    }

    function retrievability(state, now) {
        const st = normalizeState(state);
        if (!st) return 0;
        const scheduler = getFsrsScheduler();
        if (scheduler && st.fsrsState === 2) {
            try {
                return clamp(Number(scheduler.get_retrievability(toFsrsCard(st, now), new Date(now), false)), 0, 1);
            } catch (_) {}
        }
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
            v: SCHEMA_VERSION,
            fresh: false,
            schedulerVersion: 'compatible-dsr-v3',
            step: nextStep(previous, G),
            phase: phase,
            fsrsState: fsrsStateFromPhase(phase),
            stability: clamp(stability, MIN_STABILITY, MAX_DAYS),
            difficulty: nextDifficulty(old && old.difficulty, G),
            intervalDays: clamp(intervalDays, MIN_STABILITY, MAX_DAYS),
            due: now + clamp(intervalDays, MIN_STABILITY, MAX_DAYS) * DAY,
            last: now,
            lastReview: now,
            elapsedDays: old ? Math.max(0, (now - old.last) / DAY) : 0,
            scheduledDays: phase === 'review' ? clamp(intervalDays, MIN_STABILITY, MAX_DAYS) : 0,
            learningSteps: phase === 'review' ? 0 : Math.max(0, nextStep(previous, G)),
            reps: (old ? old.reps : 0) + 1,
            lapses: (old ? old.lapses : 0) + (G === 1 ? 1 : 0),
            learning: phase !== 'review',
            lastGrade: G,
            pendingConfirmations: old ? old.pendingConfirmations : 0,
            confirmationDue: old ? old.confirmationDue : 0,
            contentHash: old ? old.contentHash : '',
            contentChangedAt: old ? old.contentChangedAt : 0,
            revision: (old ? old.revision : 0) + 1,
            updatedAt: now,
            reviewEvents: old ? old.reviewEvents : []
        };
    }

    // Рассчитать состояние после оценки (1 Снова · 2 Трудно · 3 Хорошо · 4 Легко).
    function projectBase(state, G, now) {
        G = clamp(Math.round(finite(G, 3)), 1, 4);
        now = finite(now, Date.now());
        const scheduler = getFsrsScheduler();
        if (scheduler) {
            try {
                return fromFsrsCard(scheduler.next(toFsrsCard(state, now), new Date(now), G).card, state, G, now);
            } catch (error) {
                console.warn('Knowledge check: FSRS projection failed, using the compatible scheduler.', error);
            }
        }
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

    function project(state, G, now) {
        now = finite(now, Date.now());
        G = clamp(Math.round(finite(G, 3)), 1, 4);
        const result = projectBase(state, G, now);
        if (state && typeof state === 'object') {
            result.reviewEvents = normalizeReviewEvents([
                ...normalizeReviewEvents(state.reviewEvents),
                ...normalizeReviewEvents(result.reviewEvents)
            ]);
            result.revision = Math.max(result.revision, Math.max(0, Math.round(finite(state.revision, 0))) + 1);
            if (!result.contentHash && state.contentHash) result.contentHash = String(state.contentHash);
            if (!result.contentChangedAt && state.contentChangedAt) result.contentChangedAt = finite(state.contentChangedAt, 0);
        }
        result.fresh = false;
        return appendReviewEvent(result, reviewEvent('', G, now, 'schedule'));
    }

    ensureFsrs();

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
    const SESSION_KEY = 'kc_session_v3_' + location.pathname;
    const PREFS_KEY = 'kc_preferences_v3_' + location.pathname;
    const PAUSE_KEY = 'kc_preferences_v3_review_pause';
    const PAUSE_OPTIONS = new Map([[0, 'Без пауз'], [15, '15 с'], [30, '30 с'], [60, '1 мин'], [120, '2 мин']]);
    let pauseSeconds = readPause();

    function readPause() {
        const value = kcGet(PAUSE_KEY);
        return value != null && value !== '' && PAUSE_OPTIONS.has(Number(value)) ? Number(value) : 60;
    }

    // Stored confirmation times include the original one-minute interval.
    // Apply the reader's current preference to old sessions as well as new ones.
    function confirmationTime(scheduled) {
        return scheduled && pauseSeconds ? scheduled - MINUTE + pauseSeconds * 1000 : 0;
    }

    function readyAt(item) {
        return item.practiceOnly ? confirmationTime(item.availableAt) : (item.availableAt || 0);
    }

    function setPause(seconds) {
        pauseSeconds = seconds;
        kcSet(PAUSE_KEY, String(seconds));
        renderPauseOptions();
    }

    function renderPauseOptions() {
        document.getElementById('kcPauseValue').textContent = PAUSE_OPTIONS.get(pauseSeconds);
        document.getElementById('kcDisableManualPauses').hidden = pauseSeconds === 0;
        document.querySelectorAll('#kcPauseOptions [data-seconds]').forEach(button => {
            button.setAttribute('aria-pressed', String(Number(button.dataset.seconds) === pauseSeconds));
        });
    }
    const DEVICE_KEY = 'kc_device_id';
    const kcGlobalGet = scopedStorage ? scopedStorage.globalGet : kcGet;
    const kcGlobalSet = scopedStorage ? scopedStorage.globalSet : kcSet;
    let deviceId = kcGlobalGet(DEVICE_KEY) || '';
    function getDeviceId() {
        if (!deviceId) {
            deviceId = 'device-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
            kcGlobalSet(DEVICE_KEY, deviceId);
        }
        return deviceId;
    }
    let store = loadStore();
    let TOPICS = [];
    let cardCache = new Map();
    let storeDirty = false;
    let session = null;
    let revealed = false;
    let uiInitialized = false;
    let keyboardInitialized = false;
    let lastDialogOpener = null;
    let pendingProjections = null;
    let waitTimer = null;
    let dialogInerted = [];

    const CARD_TYPES = [
        { selector: '.accent-word-card', kind: 'stress', label: 'Ударения', singular: 'слово', prompt: 'Поставьте ударение' },
        { selector: '.definition-box', kind: 'definition', label: 'Определения', singular: 'определение', prompt: 'Дайте определение' },
        { selector: '.formula-box', kind: 'formula', label: 'Формулы', singular: 'формулу', prompt: 'Воспроизведите формулу' },
        { selector: '.derivation-box', kind: 'derivation', label: 'Выводы', singular: 'вывод', prompt: 'Воспроизведите вывод' },
        { selector: '.remark-box', kind: 'remark', label: 'Замечания', singular: 'замечание', prompt: 'Воспроизведите замечание' },
        { selector: '.theorem-box', kind: 'theorem', label: 'Теоремы', singular: 'теорему', prompt: 'Сформулируйте теорему' },
        { selector: '.lemma-box', kind: 'lemma', label: 'Леммы', singular: 'лемму', prompt: 'Сформулируйте лемму' },
        { selector: '.statement-box', kind: 'statement', label: 'Утверждения', singular: 'утверждение', prompt: 'Сформулируйте утверждение' },
        { selector: '.corollary-box', kind: 'corollary', label: 'Следствия', singular: 'следствие', prompt: 'Сформулируйте следствие' },
        { selector: '.properties-box', kind: 'properties', label: 'Свойства', singular: 'свойства', prompt: 'Воспроизведите свойства' },
        { selector: '.proof-box', kind: 'proof', label: 'Доказательства', singular: 'доказательство', prompt: 'Воспроизведите доказательство' },
        { selector: '.experiment-box', kind: 'experiment', label: 'Эксперименты', singular: 'эксперимент', prompt: 'Опишите эксперимент' },
        { selector: '.example-box', kind: 'example', label: 'Примеры', singular: 'пример', prompt: 'Воспроизведите пример' },
        { selector: 'table', kind: 'table', label: 'Таблицы', singular: 'строку', prompt: 'Восстановите строку таблицы' }
    ];
    const GENERIC_TITLES = new Set([
        'определение', 'definition', 'формула', 'formula', 'вывод', 'derivation',
        'замечание', 'замечания', 'remark', 'теорема', 'theorem', 'лемма', 'lemma',
        'утверждение', 'утверждения', 'statement', 'следствие', 'corollary',
        'свойство', 'свойства', 'properties', 'доказательство', 'proof',
        'эксперимент', 'experiment', 'пример', 'примеры', 'example', 'ударение', 'ударения'
    ]);
    const LEGACY_TYPE_LABELS = {
        definition: 'Определение',
        theorem: 'Теорема',
        lemma: 'Лемма',
        statement: 'Утверждение',
        corollary: 'Следствие'
    };

    function isLikbezPage() {
        return /(?:^|\/)likbez\.html$/i.test(location.pathname);
    }

    function isRussianStressPage() {
        return document.body?.dataset.noteSubject === 'russian-ege';
    }

    function studyProfile() {
        return {
            types: CARD_TYPES,
            defaultKinds: isRussianStressPage()
                ? ['stress']
                : (isLikbezPage()
                    ? ['definition', 'theorem', 'lemma', 'statement', 'corollary']
                    : ['definition']),
            empty: 'В выбранных темах нет карточек этих типов.'
        };
    }

    function loadStore() {
        try {
            const value = JSON.parse(kcGet(STORE_KEY) || '{}') || {};
            if (!value.__meta) value.__meta = {};
            value.__meta.schema = Math.max(Number(value.__meta.schema) || 0, SCHEMA_VERSION);
            return value;
        } catch (_) {
            return { __meta: { schema: SCHEMA_VERSION, updatedAt: 0 } };
        }
    }
    function saveStore() {
        if (!store.__meta) store.__meta = {};
        store.__meta.schema = SCHEMA_VERSION;
        store.__meta.updatedAt = Date.now();
        const snapshot = cloneJSON(store);
        const persisted = kcSet(STORE_KEY, JSON.stringify(snapshot)) !== false;
        // Сигнал для account.js (синхронизация прогресса в облако).
        try {
            window.dispatchEvent(new CustomEvent('kc-store-changed', {
                detail: {
                    key: STORE_KEY,
                    scope: scopedStorage ? scopedStorage.scope() : '',
                    store: snapshot,
                    updatedAt: store.__meta.updatedAt,
                    persisted: persisted
                }
            }));
        } catch (_) {}
        return persisted;
    }

    function persistState(cardId, state, options) {
        if (!cardId) return false;
        const source = options && options.store;
        if (source && typeof source === 'object') store = source;
        if (state == null) delete store[cardId];
        else store[cardId] = cloneJSON(state);
        return saveStore();
    }

    // ---------- Темы и карточки ----------
    const CARD_SELECTOR = CARD_TYPES.filter(type => type.kind !== 'table').map(type => type.selector).join(', ');

    function discoverTopics() {
        const out = [];
        document.querySelectorAll('article.topic[id]').forEach(a => {
            if (a.dataset && a.dataset.kcIgnore === 'true') return;
            const t = a.querySelector('.topic-title');
            if (!t) return;
            const counts = {};
            CARD_TYPES.forEach(type => { counts[type.kind] = 0; });
            extractTopicCards(a.id).forEach(card => { counts[card.kind]++; });
            if (!Object.values(counts).some(Boolean)) return;
            const section = a.closest('.content-section');
            const group = section?.querySelector('.part-title')?.textContent.trim() || '';
            out.push({ id: a.id, name: t.textContent.trim(), group, counts });
        });
        return out;
    }

    function normalizeTitle(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/^[\s:—–-]+|[\s:—–.-]+$/g, '')
            .trim();
    }

    function isGenericCardTitle(value) {
        return GENERIC_TITLES.has(normalizeTitle(value).toLocaleLowerCase('ru-RU'));
    }

    function isNestedInOtherCard(node, box) {
        let parent = node && node.parentElement;
        while (parent && parent !== box) {
            if (CARD_TYPES.some(type => type.kind !== 'table' && parent.matches && parent.matches(type.selector))) return true;
            parent = parent.parentElement;
        }
        return false;
    }

    function semanticStrong(box) {
        const all = Array.from(box.querySelectorAll('strong')).filter(node => !isNestedInOtherCard(node, box));
        const direct = Array.from(box.children || []).filter(node => node.tagName === 'STRONG');
        const ordered = direct.concat(all.filter(node => !direct.includes(node)));
        return ordered.find(node => {
            const term = readableTerm(node);
            return term && !isGenericCardTitle(term);
        }) || null;
    }

    function firstLegacyStrong(box) {
        return Array.from(box.children || []).find(node => node.tagName === 'STRONG')
            || (box.querySelector && box.querySelector('strong'))
            || null;
    }

    function readableTerm(strong) {
        if (!strong) return '';
        const clone = strong.cloneNode(true);
        if (clone.querySelectorAll) clone.querySelectorAll('.katex-html').forEach(el => el.remove());
        return normalizeTitle(clone.textContent
            .replace(/\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$[^$]*\$/g, ' ')
            .replace(/\s+/g, ' '));
    }

    function answerHTML(box, kind) {
        if (kind === 'stress') {
            const stressedWord = normalizeTitle(box.querySelector('.accent-word')?.textContent || box.textContent);
            return '<div class="kc-stress-answer"><span class="kc-stress-word">' + escapeHtml(stressedWord) + '</span></div>';
        }
        const back = box.cloneNode(true);
        if (back.querySelectorAll) {
            back.querySelectorAll('.bookmark-btn, .copy-block-btn, .inline-edit-btn, .note-edit-btn, .personal-note-btn, .personal-note-excerpt').forEach(el => el.remove());
            if (['theorem', 'lemma', 'statement', 'corollary'].includes(kind)) {
                back.querySelectorAll('.proof-box').forEach(el => el.remove());
            }
        }
        return back.innerHTML;
    }

    function plainCardText(box) {
        const clone = box.cloneNode(true);
        if (clone.querySelectorAll) {
            clone.querySelectorAll(CARD_SELECTOR + ', .bookmark-btn, .copy-block-btn, .inline-edit-btn, .note-edit-btn, .personal-note-btn, .personal-note-excerpt')
                .forEach(el => el.remove());
        }
        return normalizeTitle(clone.textContent || '');
    }

    function contextualTitle(box, type, topicName, index) {
        if (box.dataset?.kcTitle) return { text: normalizeTitle(box.dataset.kcTitle), html: escapeHtml(normalizeTitle(box.dataset.kcTitle)) };
        if (type.kind === 'stress') {
            const word = normalizeTitle(box.dataset.searchWord || box.textContent).toLocaleLowerCase('ru-RU');
            return { text: word, html: escapeHtml(word) };
        }
        const strong = semanticStrong(box);
        const own = readableTerm(strong);
        if (own) return { text: own, html: strong.innerHTML };

        if (type.kind === 'definition') {
            const text = plainCardText(box);
            const prefix = text.match(/^(.{2,120}?)(?:\s*[:—–]\s+)/);
            if (prefix && !isGenericCardTitle(prefix[1])) return { text: normalizeTitle(prefix[1]), html: '' };
        }

        let parent = box.parentElement;
        while (parent && parent !== document.body) {
            if (CARD_TYPES.some(candidate => candidate.kind !== 'table' && parent.matches && parent.matches(candidate.selector))) {
                const parentStrong = semanticStrong(parent);
                const parentTitle = readableTerm(parentStrong);
                if (parentTitle) return { text: parentTitle, html: parentStrong.innerHTML };
            }
            parent = parent.parentElement;
        }

        if (box.previousElementSibling) {
            let previous = box.previousElementSibling;
            for (let depth = 0; previous && depth < 3; depth++, previous = previous.previousElementSibling) {
                if (previous.closest?.('[data-kc-ignore="true"]')) continue;
                const candidate = previous.matches && previous.matches('h3, h4, .subsection-title')
                    ? normalizeTitle(previous.textContent)
                    : readableTerm(previous.querySelector && previous.querySelector('strong'));
                if (candidate && !isGenericCardTitle(candidate)) return { text: candidate, html: '' };
            }
        }

        return {
            text: topicName + (index > 0 ? ' · ' + type.singular + ' ' + (index + 1) : ''),
            html: ''
        };
    }

    const PROMPT_CONTEXT_TYPES = new Set(['example', 'experiment', 'derivation', 'proof', 'formula']);
    const PROMPT_CONTEXT_PARENT = '.example-box, .experiment-box';
    const SETUP_PREFIX = /^(?:дано|условие|исходные данные|given)\s*[:—–]/i;

    function promptContext(box, kind) {
        if (!PROMPT_CONTEXT_TYPES.has(kind)) return null;
        const parent = box.parentElement?.closest?.(PROMPT_CONTEXT_PARENT);
        const example = box.matches?.(PROMPT_CONTEXT_PARENT) ? box : parent;
        if (!example) return null;

        const parts = [];
        const setup = document.createElement('p');
        for (const child of example.childNodes) {
            if (child.nodeType === 3 && (setup.childNodes.length || SETUP_PREFIX.test(child.textContent.trim()))) {
                setup.appendChild(child.cloneNode());
                continue;
            }
            if (child.nodeType !== 1) continue;
            if (setup.childNodes.length) {
                if (child.matches('em, strong, code, span')) {
                    setup.appendChild(child.cloneNode(true));
                    continue;
                }
                parts.push(setup.outerHTML);
                setup.textContent = '';
            }
            // The setup belongs before the solution. A sibling solution or its
            // illustration can contain the very result this card asks for.
            if (child.contains(box) || child.matches(CARD_SELECTOR)) break;
            if (child.matches('[data-kc-ignore="true"]')) continue;
            if (child.matches('img, figure:has(img), figure:has(svg[viewBox])')) {
                const figure = child.cloneNode(true);
                figure.removeAttribute('id');
                figure.removeAttribute('data-note-filter-hidden');
                figure.querySelectorAll('button, .personal-note-excerpt').forEach(el => el.remove());
                parts.push(figure.outerHTML);
            } else if (child.matches('p') && SETUP_PREFIX.test(child.textContent.trim())) {
                parts.push('<p>' + tableCellHTML(child) + '</p>');
            }
        }
        if (setup.childNodes.length) parts.push(setup.outerHTML);
        const title = example === box ? '' : readableTerm(semanticStrong(example));
        return title || parts.length ? { title, html: parts.join('') } : null;
    }

    function hashString(value) {
        let hash = 2166136261;
        const text = String(value || '');
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function stableCardId(input) {
        input = input || {};
        const page = String(location.pathname || '/').replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '') || 'page';
        const topic = String(input.topicId || 'topic');
        const kind = String(input.kind || 'block');
        const sourceId = normalizeTitle(input.sourceId || '');
        const identity = sourceId || normalizeTitle(input.term || '') || hashString(input.answerText || 'card');
        return 'kc:' + page + ':' + hashString(topic) + ':' + kind + ':' + hashString(identity);
    }

    function sourceIdFor(box) {
        return normalizeTitle(
            (box.dataset && (box.dataset.kcId || box.dataset.noteBlock || box.dataset.blockId)) ||
            (box.getAttribute && (box.getAttribute('data-kc-id') || box.getAttribute('data-note-block') || box.getAttribute('data-block-id'))) ||
            box.id || ''
        );
    }

    function legacyCardIds(tid, type, box, index, count, displayTerm, topicName) {
        const ids = [];
        const legacyLabel = LEGACY_TYPE_LABELS[type.kind];
        if (legacyLabel) {
            const legacyTerm = readableTerm(firstLegacyStrong(box));
            const fallbackTerm = legacyLabel + ' ' + (index + 1);
            const legacyDisplayTerm = isGenericCardTitle(legacyTerm)
                ? String(topicName || '') + (count > 1 ? ' · ' + legacyLabel.toLocaleLowerCase('ru-RU') + ' ' + (index + 1) : '')
                : (legacyTerm || fallbackTerm);
            if (type.kind === 'definition') ids.push(tid + '::' + index + '::' + (legacyTerm || fallbackTerm));
            else ids.push(tid + '::likbez-' + type.kind + '::' + index + '::' + legacyDisplayTerm);
        }
        // Keep the aliases emitted by the first v3 build as well; a cached page
        // may already have saved a review under one of them.
        ids.push(tid + '::' + index + '::' + displayTerm);
        ids.push(tid + '::likbez-' + type.kind + '::' + index + '::' + displayTerm);
        return Array.from(new Set(ids.filter(Boolean)));
    }

    function stateForCard(card) {
        if (store[card.id]) return store[card.id];
        const alias = (card.legacyIds || []).find(id => store[id]);
        if (!alias) return null;
        store[card.id] = Object.assign({}, store[alias], { migratedFrom: alias });
        delete store[alias];
        storeDirty = true;
        return store[card.id];
    }

    function refreshStateForContent(card, state, now) {
        const normalized = normalizeState(state);
        if (!normalized) return null;
        if (!normalized.contentHash) {
            normalized.contentHash = card.contentHash;
            return normalized;
        }
        if (normalized.contentHash !== card.contentHash) {
            normalized.contentHash = card.contentHash;
            normalized.contentChangedAt = now;
            normalized.due = Math.min(normalized.due, now);
            normalized.updatedAt = now;
        }
        return normalized;
    }

    function displayedFormulas(topic) {
        const formulas = [], seen = new Set();
        function add(node, tex) {
            if (node.closest?.('.formula-box, .kc-modal')) return;
            if (node.closest?.('[data-kc-ignore="true"]')) return;
            tex = String(tex || '').trim();
            if (!tex) return;
            const policy = node.closest?.('[data-kc-formulas]')?.dataset.kcFormulas;
            if (policy === 'exclude') return;
            if (policy !== 'include' && node.closest?.('.proof-box, .example-box, .exercise-box')) return;
            const owner = node.closest?.(CARD_SELECTOR) || node.parentElement || topic;
            const key = sourceIdFor(owner) + '|' + tex.replace(/\s+/g, ' ');
            if (seen.has(key)) return;
            seen.add(key);
            formulas.push({ node: node, owner: owner, tex: tex, key: key, policy: policy, derivation: node.closest?.('.derivation-box'), multiline: /\\begin\{(?:aligned|align\*?|gathered|split|eqnarray\*?)\}/.test(tex) });
        }
        topic.querySelectorAll('.katex-display').forEach(node => add(node, node.querySelector('annotation[encoding="application/x-tex"]')?.textContent));
        if (document.createTreeWalker) {
            const walker = document.createTreeWalker(topic, 4);
            let text;
            while ((text = walker.nextNode())) {
                const parent = text.parentElement;
                if (!parent || parent.closest('script, style, .katex, .katex-display, .formula-box, button')) continue;
                const expression = /\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$/g;
                let match;
                while ((match = expression.exec(text.textContent))) add(parent, match[1] || match[2]);
            }
        }
        // A derivation contributes its final standalone result, not every
        // intermediate substitution. Explicit editor inclusion overrides this.
        return formulas.filter((formula, index) => formula.policy === 'include' || (!formula.multiline && (!formula.derivation || !formulas.slice(index + 1).some(next => next.derivation === formula.derivation))));
    }

    // Keep row identity independent of ordering and rendered KaTeX markup.
    function tableCellHTML(cell) {
        const clone = cell.cloneNode(true);
        clone.querySelectorAll('.katex').forEach(math => {
            const tex = math.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
            if (!tex) return;
            const display = math.parentElement?.classList.contains('katex-display');
            (display ? math.parentElement : math).replaceWith(document.createTextNode((display ? '\\[' : '\\(') + tex + (display ? '\\]' : '\\)')));
        });
        // auto-render wraps inline formulas in an otherwise empty span.
        Array.from(clone.querySelectorAll('span')).reverse().forEach(span => {
            if (!span.attributes.length) span.replaceWith(...span.childNodes);
        });
        clone.querySelectorAll('button, .bookmark-btn, .copy-block-btn, .inline-edit-btn, .personal-note-btn, .personal-note-excerpt').forEach(el => el.remove());
        clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        clone.querySelectorAll('[aria-labelledby]').forEach(el => {
            const title = el.querySelector('title')?.textContent;
            el.removeAttribute('aria-labelledby');
            if (title) el.setAttribute('aria-label', title);
        });
        return clone.innerHTML;
    }

    function extractTableRows(topic, topicName) {
        const result = [];
        topic.querySelectorAll('table').forEach(table => {
            if (table.closest('[data-kc-ignore="true"]') || table.querySelector('table')) return;
            const headerRows = Array.from(table.tHead?.rows || []);
            if (headerRows.length !== 1) return;
            const headers = Array.from(headerRows[0].cells);
            if (headers.length < 2 || headers.some(cell => cell.colSpan !== 1 || cell.rowSpan !== 1)) return;
            const keyColumn = table.dataset.kcKeyColumn == null ? 0 : Number(table.dataset.kcKeyColumn);
            if (!Number.isInteger(keyColumn) || keyColumn < 0 || keyColumn >= headers.length) return;
            const labels = headers.map(cell => normalizeTitle(cell.textContent));
            if (labels.some(label => !label)) return;
            const owner = table.closest('[data-kc-id]');
            const tableTitle = table.dataset.kcTitle || normalizeTitle(table.caption?.textContent) ||
                readableTerm(owner && semanticStrong(owner)) || topicName;
            const tableId = sourceIdFor(table) || (sourceIdFor(owner || table) + ':' + hashString(labels.join('|')));
            // A merged body cannot be split into independent rows reliably.
            const rows = Array.from(table.tBodies || []).flatMap(body => Array.from(body.rows));
            if (rows.some(row => Array.from(row.cells).some(cell => cell.colSpan !== 1 || cell.rowSpan !== 1))) return;
            rows.forEach(row => {
                if (row.closest('[data-kc-ignore="true"]') || row.cells.length !== headers.length) return;
                const cells = Array.from(row.cells), html = cells.map(tableCellHTML);
                const key = normalizeTitle(html[keyColumn]);
                if (!key || !normalizeTitle(cells[keyColumn].textContent)) return;
                const sourceId = 'table-row:' + tableId + ':' + (sourceIdFor(row) || hashString(key));
                row.dataset.kcRowSource = sourceId;
                const term = normalizeTitle(cells[keyColumn].textContent);
                const fields = labels.filter((_, i) => i !== keyColumn);
                const back = '<dl class="kc-table-answer">' + cells.map((cell, i) =>
                    '<div class="kc-table-field"><dt>' + escapeHtml(labels[i]) + '</dt><dd>' + (html[i].trim() || '—') + '</dd></div>'
                ).join('') + '</dl>';
                result.push({
                    id: stableCardId({ topicId: topic.id, kind: 'table', sourceId: sourceId }),
                    sourceId: sourceId, topicId: topic.id, topicName: topicName, tableTitle: tableTitle,
                    kind: 'table', kindLabel: 'Строка таблицы', term: term, termHTML: html[keyColumn],
                    questionLead: 'Вспомните: ' + fields.join(', ').toLocaleLowerCase('ru-RU'),
                    backHTML: back, contentHash: hashString(back), legacyIds: []
                });
            });
        });
        return result;
    }

    function extractTopicCards(tid) {
        if (cardCache.has(tid)) return cardCache.get(tid);
        const cards = [];
        const topic = document.getElementById(tid);
        if (!topic) return cards;
        const tname = topic.querySelector('.topic-title')?.textContent.trim() || '';

        CARD_TYPES.forEach(type => {
            if (type.kind === 'table') return;
            const typeBoxes = Array.from(topic.querySelectorAll(type.selector));
            typeBoxes.forEach((box, i) => {
                if (box.closest?.('[data-kc-ignore="true"]')) return;
                if (type.kind === 'formula' && box.closest?.('[data-kc-formulas]')?.dataset.kcFormulas === 'exclude') return;
                const title = contextualTitle(box, type, tname, i);
                const displayTerm = title.text || (tname + ' · ' + type.singular + ' ' + (i + 1));
                const backHTML = answerHTML(box, type.kind);
                const sourceId = sourceIdFor(box);
                const id = stableCardId({ topicId: tid, kind: type.kind, sourceId: sourceId, term: displayTerm, answerText: box.textContent });
                cards.push({
                    id: id,
                    sourceId: sourceId,
                    topicId: tid,
                    topicName: tname,
                    kind: type.kind,
                    kindLabel: type.label,
                    sourceOrdinal: i,
                    term: displayTerm,
                    termHTML: title.html || escapeHtml(displayTerm),
                    questionLead: type.kind === 'definition' ? '' : type.prompt,
                    context: promptContext(box, type.kind),
                    backHTML: backHTML,
                    contentHash: hashString(normalizeTitle(box.textContent) + '|' + backHTML),
                    legacyIds: legacyCardIds(tid, type, box, i, typeBoxes.length, displayTerm, tname)
                });
            });
        });

        const formulaType = CARD_TYPES.find(type => type.kind === 'formula');
        displayedFormulas(topic).forEach((formula, index) => {
            const title = contextualTitle(formula.owner, formulaType, tname, index);
            const left = formula.tex.split(/=|\\(?:approx|sim|propto|equiv|leq|geq)\b/)[0].trim().replace(/[.,;]+$/, '');
            if (left && left.length < 90 && left !== formula.tex.trim() && !/\\begin|\\end|\\\\/.test(left)) {
                title.text += ' · ' + left;
                title.html = (title.html || escapeHtml(title.text.slice(0, -(left.length + 3)))) + ' · \\(' + escapeHtml(left) + '\\)';
            }
            const sourceId = 'math:' + hashString(formula.key);
            const backHTML = '<div class="formula-box">\\[' + escapeHtml(formula.tex) + '\\]</div>';
            cards.push({
                id: stableCardId({ topicId: tid, kind: 'formula', sourceId: sourceId }),
                sourceId: sourceId, topicId: tid, topicName: tname, kind: 'formula', kindLabel: formulaType.label,
                sourceOrdinal: index, term: title.text, termHTML: title.html || escapeHtml(title.text),
                questionLead: formulaType.prompt, backHTML: backHTML,
                contentHash: hashString(formula.tex), legacyIds: []
            });
        });

        cards.push(...extractTableRows(topic, tname));
        const duplicates = new Map();
        cards.forEach(card => {
            if (!duplicates.has(card.id)) duplicates.set(card.id, []);
            duplicates.get(card.id).push(card);
        });
        duplicates.forEach(group => {
            if (group.length < 2) return;
            group.forEach(card => { card.id += ':' + card.contentHash; });
        });

        cardCache.set(tid, cards);
        return cards;
    }

    function extractCards(topicIds, kinds) {
        const cards = [];
        topicIds.forEach(tid => cards.push(...extractTopicCards(tid)));
        if (!Array.isArray(kinds) || kinds.length === 0) return cards;
        const selected = new Set(kinds);
        return cards.filter(card => selected.has(card.kind));
    }

    // Счётчики due/new для темы (для списка тем — как колоды в Anki)
    function topicCounts(tid, kinds) {
        const now = Date.now();
        let due = 0, fresh = 0;
        extractCards([tid], kinds).forEach(c => {
            const raw = stateForCard(c);
            const st = refreshStateForContent(c, raw, now);
            if (st && raw !== st) { store[c.id] = st; storeDirty = true; }
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

    function buildRecommendation(cards, now, options) {
        options = options || {};
        const allowedKinds = Array.isArray(options.kinds) && options.kinds.length
            ? new Set(options.kinds)
            : null;
        const eligible = (Array.isArray(cards) ? cards : []).filter(card => !allowedKinds || allowedKinds.has(card.kind));
        const due = [];
        const fresh = [];
        eligible.forEach(card => {
            const raw = stateForCard(card);
            const state = refreshStateForContent(card, raw, now);
            if (state && state !== raw) {
                store[card.id] = state;
                storeDirty = true;
            }
            if (isNewState(state)) fresh.push(card);
            else {
                const normalized = normalizeState(state);
                const confirmationReady = normalized.pendingConfirmations > 0 && confirmationTime(normalized.confirmationDue) <= now;
                if (confirmationReady || normalized.due <= now) {
                    due.push({
                        card: card,
                        state: normalized,
                        score: (confirmationReady ? 1000 : 0) + recommendationScore(normalized, now)
                    });
                }
            }
        });
        due.sort((a, b) => b.score - a.score || a.state.due - b.state.due || a.card.id.localeCompare(b.card.id));

        const limit = options.limit === 'all' || options.limit == null
            ? Infinity
            : Math.max(0, Math.floor(finite(options.limit, 0)));
        const reviewPicked = due.slice(0, limit).map(x => ({
            card: x.card,
            type: x.state.pendingConfirmations > 0 || x.state.phase !== 'review' ? 'learn' : 'review',
            practiceOnly: x.state.pendingConfirmations > 0,
            availableAt: x.state.pendingConfirmations > 0 ? x.state.confirmationDue : x.state.due
        }));
        const remaining = Math.max(0, limit - reviewPicked.length);
        const newPicked = spreadNewCards(fresh).slice(0, remaining).map(card => ({ card: card, type: 'new' }));
        const queue = mixRecommendedQueue(reviewPicked, newPicked);

        return {
            queue: queue,
            dueTotal: due.length,
            reviewCount: reviewPicked.length,
            newCount: newPicked.length,
            newTotal: fresh.length,
            deferred: Math.max(0, due.length + fresh.length - queue.length)
        };
    }

    // «Снова» требует двух последующих уверенных ответов, «Трудно» — одного.
    // Ограничения по числу показов нет: карточка остаётся в очереди, пока это
    // требование не обнулится ответами «Хорошо» или «Легко».
    function pendingSuccessesAfterGrade(current, G) {
        const pending = Math.max(0, Math.round(finite(current, 0)));
        if (G === 1) return Math.max(pending, 2);
        if (G === 2) return Math.max(pending, 1);
        return Math.max(0, pending - 1);
    }

    function reviewEvent(cardId, G, now, mode) {
        return {
            id: getDeviceId() + ':' + Math.round(now).toString(36) + ':' + Math.random().toString(36).slice(2, 8),
            cardId: cardId,
            grade: G,
            at: now,
            mode: mode || 'schedule',
            scheduler: SCHEDULER_VERSION
        };
    }

    function appendReviewEvent(state, event) {
        const next = cloneJSON(state) || {};
        next.reviewEvents = normalizeReviewEvents([...(next.reviewEvents || []), event]);
        next.updatedAt = Math.max(finite(next.updatedAt, 0), finite(event && event.at, Date.now()));
        return next;
    }

    function sessionSnapshot(value, includeUndo) {
        if (!value || typeof value !== 'object') return null;
        const snapshot = {
            version: 3,
            selectedTopicIds: Array.isArray(value.selectedTopicIds) ? value.selectedTopicIds.slice() : [],
            selectedKinds: Array.isArray(value.selectedKinds) ? value.selectedKinds.slice() : [],
            limit: value.limit == null ? 'all' : value.limit,
            startedAt: finite(value.startedAt, Date.now()),
            updatedAt: finite(value.updatedAt, Date.now()),
            reviewed: Math.max(0, Math.round(finite(value.reviewed, 0))),
            again: Math.max(0, Math.round(finite(value.again, 0))),
            recalled: Math.max(0, Math.round(finite(value.recalled, 0))),
            planned: Math.max(0, Math.round(finite(value.planned, 0))),
            cardStats: cloneJSON(value.cardStats || {}),
            mastered: cloneJSON(value.mastered || {}),
            states: cloneJSON(value.states || {}),
            queue: (Array.isArray(value.queue) ? value.queue : []).map(item => ({
                cardId: item.cardId || (item.card && item.card.id),
                type: item.type || 'review',
                practiceOnly: !!item.practiceOnly,
                availableAt: Math.max(0, finite(item.availableAt, 0))
            })).filter(item => item.cardId)
        };
        if (value.reviewPosition && value.reviewPosition.cardId === snapshot.queue[0]?.cardId) {
            snapshot.reviewPosition = {
                cardId: value.reviewPosition.cardId,
                revealed: !!value.reviewPosition.revealed,
                scrollTop: Math.max(0, finite(value.reviewPosition.scrollTop, 0))
            };
        }
        if (includeUndo) snapshot.undoStack = (Array.isArray(value.undoStack) ? value.undoStack : []).slice(-1).map(entry => cloneJSON(entry));
        return snapshot;
    }

    function serializeSession(value) {
        const snapshot = sessionSnapshot(value, true);
        return snapshot ? JSON.stringify(snapshot) : '';
    }

    function restoreSession(serialized, cards) {
        try {
            const raw = typeof serialized === 'string' ? JSON.parse(serialized) : cloneJSON(serialized);
            if (!raw || !Array.isArray(raw.queue) || !raw.states) return null;
            const byId = new Map((Array.isArray(cards) ? cards : []).map(card => [card.id, card]));
            const restored = sessionSnapshot(raw, true);
            restored.queue = raw.queue.map(item => {
                const cardId = item.cardId || (item.card && item.card.id);
                const card = byId.get(cardId);
                return card ? {
                    card: card,
                    cardId: cardId,
                    type: item.type || 'review',
                    practiceOnly: !!item.practiceOnly,
                    availableAt: Math.max(0, finite(item.availableAt, 0))
                } : null;
            }).filter(Boolean);
            if (!restored.queue.length) return null;
            restored.undoStack = Array.isArray(raw.undoStack) ? raw.undoStack.slice(-1) : [];
            return restored;
        } catch (_) {
            return null;
        }
    }

    function sessionTransition(currentSession, item, G, now) {
        if (!currentSession || !item || !item.card || !item.card.id) return null;
        now = finite(now, Date.now());
        G = clamp(Math.round(finite(G, 3)), 1, 4);
        const before = sessionSnapshot(currentSession, false);
        const next = restoreSession(before, (currentSession.queue || []).map(entry => entry.card).filter(Boolean)) || cloneJSON(currentSession);
        next.undoStack = [{ snapshot: before, cardId: item.card.id, card: cloneJSON(item.card) }];

        const index = next.queue.findIndex(entry => (entry.cardId || entry.card.id) === item.card.id);
        if (index >= 0) next.queue.splice(index, 1);
        const hasSessionState = Object.prototype.hasOwnProperty.call(next.states, item.card.id);
        const previousRaw = hasSessionState ? next.states[item.card.id] : store[item.card.id];
        const previous = normalizeState(previousRaw);
        const confirmation = !!item.practiceOnly || !!(previous && previous.pendingConfirmations > 0);
        let event = reviewEvent(item.card.id, G, now, confirmation ? 'confirmation' : 'schedule');
        let state;

        if (confirmation && previous) {
            state = cloneJSON(previous);
            state.pendingConfirmations = pendingSuccessesAfterGrade(previous.pendingConfirmations, G);
            state.confirmationDue = state.pendingConfirmations > 0 ? now + MINUTE : 0;
            if (state.pendingConfirmations === 0 && state.phase !== 'review') {
                state.phase = 'review';
                state.fsrsState = 2;
                state.learning = false;
                state.due = Math.max(finite(state.due, now), now + Math.max(1, state.stability) * DAY);
                state.scheduledDays = Math.max(1, (state.due - now) / DAY);
            }
            state.lastGrade = G;
            state.updatedAt = now;
            state = appendReviewEvent(state, event);
        } else {
            state = project(previousRaw, G, now);
            state.pendingConfirmations = pendingSuccessesAfterGrade(0, G);
            state.confirmationDue = state.pendingConfirmations > 0 ? now + MINUTE : 0;
            event = state.reviewEvents[state.reviewEvents.length - 1] || event;
            event.cardId = item.card.id;
            state.reviewEvents[state.reviewEvents.length - 1] = event;
        }
        next.states[item.card.id] = state;
        next.reviewed = Math.max(0, finite(next.reviewed, 0)) + 1;
        if (G === 1) next.again = Math.max(0, finite(next.again, 0)) + 1;
        else next.recalled = Math.max(0, finite(next.recalled, 0)) + 1;
        const stats = next.cardStats[item.card.id] || { shown: 0, pendingSuccesses: 0 };
        stats.shown += 1;
        stats.pendingSuccesses = state.pendingConfirmations;
        next.cardStats[item.card.id] = stats;

        if (state.pendingConfirmations > 0) {
            delete next.mastered[item.card.id];
            const distance = G === 1 ? 2 : 4;
            next.queue.splice(Math.min(next.queue.length, distance), 0, {
                card: item.card,
                cardId: item.card.id,
                type: 'learn',
                practiceOnly: true,
                availableAt: state.confirmationDue
            });
        } else {
            next.mastered[item.card.id] = true;
        }
        next.updatedAt = now;
        return { session: next, state: state, event: event };
    }

    function undoSession(currentSession, cards) {
        if (!currentSession || !Array.isArray(currentSession.undoStack) || !currentSession.undoStack.length) return null;
        const entry = currentSession.undoStack[currentSession.undoStack.length - 1];
        const knownCards = (cards || (currentSession.queue || []).map(item => item.card).filter(Boolean)).slice();
        if (entry.card && !knownCards.some(card => card.id === entry.card.id)) knownCards.push(entry.card);
        const restored = restoreSession(entry.snapshot, knownCards);
        if (!restored) return null;
        const currentState = cloneJSON(currentSession.states && currentSession.states[entry.cardId] || null);
        const previousState = cloneJSON(restored.states && restored.states[entry.cardId] || null);
        const previousEventIds = new Set(normalizeReviewEvents(previousState && previousState.reviewEvents).map(event => event.id));
        const currentEvents = normalizeReviewEvents(currentState && currentState.reviewEvents);
        const now = Date.now();
        const undoEvent = reviewEvent(entry.cardId, 0, now, 'undo');
        undoEvent.undoes = currentEvents
            .map(event => event.id)
            .filter(id => id && !previousEventIds.has(id));
        const reviewEvents = normalizeReviewEvents([
            ...normalizeReviewEvents(previousState && previousState.reviewEvents),
            ...currentEvents,
            undoEvent
        ]);
        const revision = Math.max(
            Math.max(0, Math.round(finite(previousState && previousState.revision, 0))),
            Math.max(0, Math.round(finite(currentState && currentState.revision, 0)))
        ) + 1;
        let compensatedState;
        if (previousState && !isNewState(previousState)) {
            compensatedState = Object.assign({}, previousState, {
                fresh: false,
                revision: revision,
                updatedAt: now,
                reviewEvents: reviewEvents
            });
        } else {
            compensatedState = {
                v: SCHEMA_VERSION,
                fresh: true,
                schedulerVersion: SCHEDULER_VERSION,
                pendingConfirmations: 0,
                confirmationDue: 0,
                contentHash: String((previousState && previousState.contentHash) || (currentState && currentState.contentHash) || ''),
                contentChangedAt: Math.max(0, finite((previousState && previousState.contentChangedAt) || (currentState && currentState.contentChangedAt), 0)),
                revision: revision,
                updatedAt: now,
                reviewEvents: reviewEvents
            };
        }
        restored.states[entry.cardId] = compensatedState;
        restored.updatedAt = now;
        restored.undoStack = [];
        return { session: restored, state: compensatedState, cardId: entry.cardId, event: undoEvent };
    }

    // ---------- Рендер математики ----------
    function renderMath(el) {
        if (!el) return;
        if (window.AlmanionMath) {
            window.AlmanionMath.render(el);
            return;
        }
        if (typeof renderMathInElement === 'undefined') return;
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

    function initMathScrolling(content) {
        let frame = 0;
        function update() {
            frame = 0;
            content.querySelectorAll('.katex').forEach(math => {
                const display = math.parentElement.closest('.katex-display');
                if (display || !math.getClientRects().length) return;
                const line = math.closest('p, li, dd, figcaption, .kc-definition, .kc-question, .kc-prompt-media');
                if (!line) return;
                const style = getComputedStyle(line);
                const available = line.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
                const wide = Array.from(math.querySelectorAll('.base')).some(base => base.getBoundingClientRect().width > available + 1);
                math.classList.toggle('kc-math-inline', wide);
            });
            content.querySelectorAll('.katex-display, .kc-math-inline, [data-kc-scrollable]').forEach(line => {
                // Ignore hidden answers, then remeasure on their first render.
                const mathLine = line.matches('.katex-display, .kc-math-inline');
                if (mathLine && !line.clientWidth) return;
                const scrollable = mathLine && line.scrollWidth > line.clientWidth + 1;
                line.toggleAttribute('data-kc-scrollable', scrollable);
                const hint = line.nextElementSibling?.classList.contains('kc-math-hint') ? line.nextElementSibling : null;
                if (scrollable) {
                    line.tabIndex = 0;
                    line.setAttribute('role', 'region');
                    if (!line.hasAttribute('aria-label')) line.setAttribute('aria-label', 'Формула с горизонтальной прокруткой');
                    if (!hint) {
                        const label = document.createElement('span');
                        label.className = 'kc-math-hint';
                        label.setAttribute('aria-hidden', 'true');
                        label.textContent = 'Прокрутите формулу вбок';
                        line.after(label);
                    }
                } else if (hint) {
                    line.removeAttribute('tabindex');
                    line.removeAttribute('role');
                    line.removeAttribute('aria-label');
                    hint.remove();
                }
            });
        }
        function measure() {
            if (!frame) frame = requestAnimationFrame(update);
        }
        new MutationObserver(measure).observe(content, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open']
        });
        if (window.ResizeObserver) new ResizeObserver(measure).observe(content);
        document.fonts?.addEventListener('loadingdone', measure);
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
                btn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg><span>Учить</span>';
                container.appendChild(btn);
            }
        }
        if (btn && !btn.hasAttribute('data-learn-launcher')) btn.addEventListener('click', event => launchLearning(event.currentTarget));

        // Оверлеи
        const select = document.createElement('div');
        select.className = 'auth-overlay hidden';
        select.id = 'kcSelectOverlay';
        select.setAttribute('aria-hidden', 'true');
        select.innerHTML =
            '<div class="auth-modal kc-modal" id="kcSelectModal" role="dialog" aria-modal="true" aria-labelledby="kcSelectTitle" tabindex="-1">' +
                '<button class="kc-close" id="kcSelectClose" aria-label="Закрыть">' + IC.close + '</button>' +
                '<div class="kc-head"><h2 class="kc-title" id="kcSelectTitle">Учить</h2></div>' +
                '<div class="kc-select-scroll">' +
                '<div id="kcSelectChoices">' +
                '<div id="kcQuickOptions">' +
                    '<div id="kcManualPause" hidden><div class="kc-pause-art" aria-hidden="true"></div>' +
                        '<button type="button" class="kc-turn-off-pauses" id="kcDisableManualPauses">Отключить паузы</button></div>' +
                    '<div class="kc-session-resume" id="kcSessionResume" hidden></div>' +
                    '<div class="kc-paragraph-choice" id="kcQuickChoice" hidden><strong id="kcQuickTopic"></strong>' +
                        '<button type="button" class="kc-btn kc-btn-primary" id="kcQuickStart"><span>Этот параграф</span><small id="kcQuickCount"></small></button></div>' +
                '</div>' +
                '<button type="button" class="kc-btn kc-btn-ghost kc-configure" id="kcConfigure" aria-controls="kcCustomOptions" aria-expanded="false">Выбрать темы</button>' +
                '<div id="kcCustomOptions">' +
                '<div class="kc-session-notice kc-session-notice-error" id="kcSelectNotice" hidden aria-live="polite"></div>' +
                '<div class="kc-study-sections" id="kcStudySections" role="group" aria-label="Вид заданий" hidden>' +
                    '<button type="button" class="kc-size-option" data-section="blocks" aria-pressed="true">Блоки</button>' +
                    '<button type="button" class="kc-size-option" data-section="tables" aria-pressed="false">Таблицы</button>' +
                '</div>' +
                '<details class="kc-filter-section kc-study-disclosure" id="kcTypeOptions">' +
                    '<summary id="kcTypesHeading"><span>Типы карточек</span><small id="kcTypesSelected"></small></summary>' +
                    '<div class="kc-type-list" id="kcTypeList"></div>' +
                '</details>' +
                '<details class="kc-filter-section kc-study-disclosure" id="kcTopicOptions">' +
                    '<summary><span id="kcTopicsHeading">Темы</span><small id="kcTopicCount" aria-live="polite"></small></summary>' +
                    '<div class="kc-disclosure-body"><div class="kc-topic-tools">' +
                    '<label class="kc-topic-search">' +
                        '<span class="kc-visually-hidden">Поиск тем</span>' +
                        '<input type="search" id="kcTopicSearch" placeholder="Найти тему" autocomplete="off"></label>' +
                    '<button type="button" class="kc-btn kc-btn-ghost" id="kcSelectAll">Снять выбор</button></div>' +
                    '<div class="kc-deck-list" id="kcDeckList"></div>' +
                    '<p class="kc-no-topics" id="kcNoTopics" role="status" hidden>Темы не найдены</p>' +
                    '</div></details>' +
                '<details class="kc-filter-section kc-study-disclosure" id="kcSizeOptions">' +
                    '<summary><span>Карточек за занятие</span><small id="kcSizeValue"></small></summary>' +
                    '<div class="kc-disclosure-body kc-size-list" id="kcSizeList" role="group" aria-label="Карточек за занятие">' +
                        '<button type="button" class="kc-size-option" data-limit="15" aria-pressed="false"><span class="kc-size-name">Короткая</span><span class="kc-size-meta">до 15 карточек</span></button>' +
                        '<button type="button" class="kc-size-option" data-limit="30" aria-pressed="false"><span class="kc-size-name">Обычная</span><span class="kc-size-meta">до 30 карточек</span></button>' +
                        '<button type="button" class="kc-size-option" data-limit="all" aria-pressed="true"><span class="kc-size-name">Все</span><span class="kc-size-meta">без ограничения</span></button>' +
                    '</div></details>' +
                '</div>' +
                '<details class="kc-filter-section kc-study-disclosure" id="kcPauseOptions">' +
                    '<summary><span>Паузы повторения</span><small id="kcPauseValue"></small></summary>' +
                    '<div class="kc-disclosure-body kc-pause-choices" role="group" aria-label="Время до повторения карточки">' +
                        [...PAUSE_OPTIONS].map(([seconds, label]) => '<button class="kc-btn kc-btn-ghost" type="button" data-seconds="' + seconds + '">' + label + '</button>').join('') +
                    '</div></details>' +
                '</div>' +
                '<section id="kcStartConfirmation" class="kc-start-confirmation" aria-labelledby="kcConfirmTitle" hidden>' +
                    '<h3 id="kcConfirmTitle" tabindex="-1">Начать новое занятие?</h3>' +
                    '<p>Текущее занятие завершится. Уже выставленные оценки учитываются при следующих повторениях.</p>' +
                    '<div class="kc-actions">' +
                        '<button type="button" class="kc-btn kc-btn-ghost" id="kcCancelStart">Отмена</button>' +
                        '<button type="button" class="kc-btn kc-btn-primary" id="kcConfirmStart">Начать</button>' +
                    '</div>' +
                '</section>' +
                '</div>' +
                '<div class="kc-actions">' +
                    '<div class="kc-selection-status" id="kcRecommendation" role="status" hidden></div>' +
                    '<button class="kc-btn kc-btn-primary" id="kcStart">' + IC.play + 'Учить<span class="kc-count-badge" id="kcStartCount">0</span></button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(select);

        const review = document.createElement('div');
        review.className = 'auth-overlay hidden';
        review.id = 'kcReviewOverlay';
        review.setAttribute('aria-hidden', 'true');
        review.innerHTML =
            '<div class="auth-modal kc-modal kc-modal-game" id="kcReviewModal" role="dialog" aria-modal="true" aria-label="Сессия обучения" tabindex="-1">' +
                '<div class="kc-game-bar">' +
                    '<details class="kc-progress-summary kc-study-disclosure" id="kcProgressDetails">' +
                        '<summary><span class="kc-progress-copy" id="kcProgressCopy"></span></summary>' +
                        '<div class="kc-progress-panel">' +
                            '<dl class="kc-progress-counts" id="kcCounts"></dl>' +
                            '<p class="kc-progress-detail" id="kcProgressDetail"></p>' +
                            '<details class="kc-grade-guide" id="kcGradeGuide" hidden><summary class="kc-grade-guide-title">Как выбрать оценку</summary>' +
                                '<div class="kc-grade-guide-list">' +
                                    '<div class="kc-grade-guide-item kc-grade-guide-again"><span><span class="kc-grade-guide-label">Снова</span><span> — не вспомнил.</span></span></div>' +
                                    '<div class="kc-grade-guide-item kc-grade-guide-hard"><span><span class="kc-grade-guide-label">Трудно</span><span> — вспомнил с усилием.</span></span></div>' +
                                    '<div class="kc-grade-guide-item kc-grade-guide-good"><span><span class="kc-grade-guide-label">Хорошо</span><span> — ответил без подсказки.</span></span></div>' +
                                    '<div class="kc-grade-guide-item kc-grade-guide-easy"><span><span class="kc-grade-guide-label">Легко</span><span> — вспомнил сразу.</span></span></div>' +
                                '</div></details>' +
                        '</div>' +
                    '</details>' +
                    '<div class="kc-game-actions">' +
                        '<button class="kc-tool-btn" id="kcChooseTopics" type="button" aria-label="Выбрать темы">Темы</button>' +
                        '<button class="kc-icon-btn" id="kcUndoBtn" type="button" aria-label="Отменить последнюю оценку" title="Отменить последнюю оценку" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-2"/></svg></button>' +
                        '<button class="kc-pause-btn" id="kcPauseBtn" type="button" aria-label="Поставить сессию на паузу" title="Пауза"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg></button>' +
                        '<button class="kc-close" id="kcReviewClose" aria-label="Закрыть">' + IC.close + '</button>' +
                    '</div>' +
                '</div>' +
                '<div class="kc-progress-track" id="kcProgress" role="progressbar" aria-label="Прогресс занятия" aria-valuemin="0" aria-valuemax="100"><div class="kc-progress-fill" id="kcProgressFill"></div></div>' +
                '<div class="kc-session-notice kc-session-notice-error" id="kcReviewNotice" hidden aria-live="polite"></div>' +
                '<div class="kc-content" id="kcContent"></div>' +
                '<div class="kc-review-actions">' +
                    '<button type="button" class="kc-btn kc-btn-primary" id="kcFront" aria-controls="kcBack" hidden>' + IC.eye + '<span>Показать ответ</span></button>' +
                    '<div class="kc-grade-row" id="kcGrades" role="group" aria-label="Оценить ответ" hidden></div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(review);

        const returnButton = document.createElement('button');
        returnButton.type = 'button';
        returnButton.className = 'kc-return kc-btn kc-btn-primary';
        returnButton.id = 'kcReturnToCard';
        returnButton.textContent = 'Вернуться к карточке';
        returnButton.dataset.printExclude = 'true';
        returnButton.hidden = true;
        returnButton.addEventListener('click', () => resumeSavedSession(returnButton));
        document.body.appendChild(returnButton);

        // Закрытие
        document.getElementById('kcSelectClose').addEventListener('click', closeSelect);
        document.getElementById('kcReviewClose').addEventListener('click', closeReview);
        document.getElementById('kcChooseTopics').addEventListener('click', () => {
            if (revealed || session?.reviewed) untouchedQuickStart = null;
            closeReview();
            openSelect(undefined, 'topics');
        });
        document.getElementById('kcPauseBtn').addEventListener('click', pauseSession);
        document.getElementById('kcUndoBtn').addEventListener('click', undoLastGrade);
        select.addEventListener('click', e => { if (e.target === select) closeSelect(); });
        review.addEventListener('click', e => { if (e.target === review) closeReview(); });
        review.addEventListener('click', event => {
            const details = document.getElementById('kcProgressDetails');
            if (details.open && !details.contains(event.target)) details.open = false;
        });

        document.getElementById('kcFront').addEventListener('click', () => reveal());
        document.getElementById('kcDisableManualPauses').addEventListener('click', () => {
            setPause(0);
            renderResumeBanner();
            updateStartBtn();
            document.getElementById('kcResumeSession')?.focus({ preventScroll: true });
        });
        document.getElementById('kcPauseOptions').addEventListener('click', event => {
            const choice = event.target.closest('[data-seconds]');
            if (choice) { setPause(Number(choice.dataset.seconds)); renderResumeBanner(); updateStartBtn(); }
        });
        document.getElementById('kcSelectAll').addEventListener('click', toggleSelectAll);
        document.getElementById('kcTopicSearch').addEventListener('input', renderDeckList);
        document.getElementById('kcStart').addEventListener('click', event => requestStart(selected, selectedKinds, sessionLimit, event.currentTarget));
        document.getElementById('kcCancelStart').addEventListener('click', cancelStart);
        document.getElementById('kcConfirmStart').addEventListener('click', confirmStart);
        document.getElementById('kcQuickStart').addEventListener('click', () => {
            if (quickChoice) requestStart(quickChoice.ids, quickChoice.kinds, 'all', document.getElementById('kcQuickStart'));
        });
        document.getElementById('kcConfigure').addEventListener('click', () => {
            if (selectMode === 'topics' && resumeAvailable) resumeSavedSession();
            else setCustomOptions(document.getElementById('kcCustomOptions').hidden);
        });
        document.querySelectorAll('#kcStudySections [data-section]').forEach(button => {
            button.addEventListener('click', () => {
                if (studySection === button.dataset.section) return;
                savePreferences();
                studySection = button.dataset.section;
                applySectionPreferences(sectionPreferences[studySection]);
                renderStudySection();
                renderTypeFilters();
                renderDeckList();
                savePreferences();
            });
        });
        document.querySelectorAll('#kcSizeList .kc-size-option').forEach(button => {
            button.addEventListener('click', () => {
                sessionLimit = button.dataset.limit === 'all' ? 'all' : Number(button.dataset.limit);
                savePreferences();
                renderSessionSize();
                updateStartBtn();
            });
        });

        initSwipe('kcSelectOverlay', 'kcSelectModal', closeSelect);
        initDialogAccessibility(select, review);
        initMathScrolling(document.getElementById('kcContent'));
        const sketchScreen = matchMedia(SKETCH_SCREEN);
        sketchScreen.addEventListener('change', () => {
            if (sketchScreen.matches) attachSketch();
            else releaseSketch();
        });
    }

    function restoreDialogBackground() {
        dialogInerted.forEach(function (entry) {
            entry.element.inert = entry.inert;
            if (entry.ariaHidden == null) entry.element.removeAttribute('aria-hidden');
            else entry.element.setAttribute('aria-hidden', entry.ariaHidden);
        });
        dialogInerted = [];
    }

    function visibleDialogOverlay() {
        return ['kcReviewOverlay', 'kcSelectOverlay']
            .map(function (id) { return document.getElementById(id); })
            .find(function (element) { return element && !element.classList.contains('hidden'); }) || null;
    }

    function syncDialogAccessibility() {
        restoreDialogBackground();
        const visible = visibleDialogOverlay();
        ['kcReviewOverlay', 'kcSelectOverlay'].forEach(function (id) {
            const overlay = document.getElementById(id);
            if (overlay) overlay.setAttribute('aria-hidden', overlay === visible ? 'false' : 'true');
        });
        if (!visible) {
            document.body.classList.remove('kc-dialog-open');
            if (lastDialogOpener && lastDialogOpener.isConnected && typeof lastDialogOpener.focus === 'function') {
                lastDialogOpener.focus({ preventScroll: true });
            }
            return;
        }
        document.body.classList.add('kc-dialog-open');
        Array.from(document.body.children).forEach(function (element) {
            if (element === visible || element.tagName === 'SCRIPT' || element.tagName === 'STYLE') return;
            dialogInerted.push({
                element: element,
                inert: !!element.inert,
                ariaHidden: element.getAttribute('aria-hidden')
            });
            element.inert = true;
            element.setAttribute('aria-hidden', 'true');
        });
    }

    function initDialogAccessibility(select, review) {
        const observer = new MutationObserver(syncDialogAccessibility);
        observer.observe(select, { attributes: true, attributeFilter: ['class'] });
        observer.observe(review, { attributes: true, attributeFilter: ['class'] });
        document.addEventListener('keydown', function (event) {
            const overlay = visibleDialogOverlay();
            if (!overlay || event.defaultPrevented || document.body.classList.contains('lightbox-open')) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                if (pendingStart) cancelStart();
                else if (overlay.id === 'kcSelectOverlay') closeSelect();
                else if (document.getElementById('kcProgressDetails').open) {
                    const progress = document.getElementById('kcProgressDetails');
                    progress.open = false;
                    progress.querySelector('summary').focus();
                } else closeReview();
                return;
            }
            if (event.key !== 'Tab') return;
            const modal = overlay.querySelector('[role="dialog"]');
            if (!modal) return;
            const focusable = Array.from(modal.querySelectorAll(
                'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
            )).filter(function (element) {
                const closed = element.closest('details:not([open])');
                return element.getClientRects().length && (!closed || closed.firstElementChild === element);
            });
            if (!focusable.length) {
                event.preventDefault();
                modal.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
                event.preventDefault();
                first.focus();
            }
        });
    }

    function closeSelect() {
        pendingStart = null;
        document.getElementById('kcSelectOverlay').classList.add('hidden');
    }

    // ============================================
    //  Экран выбора тем (список «колод»)
    // ============================================
    let selected = [];
    let selectedKinds = [];
    let sessionLimit = 'all';
    let studySection = 'blocks';
    let sectionPreferences = {};
    let quickChoice = null;
    let pendingStart = null;
    let resumeAvailable = false;
    let selectMode = 'menu';
    let untouchedQuickStart = null;
    const expandedTopicGroups = new Map();

    function currentParagraphChoice() {
        const current = document.querySelector('.topic.exp-reader-current')
            || [...document.querySelectorAll('.main-content article.topic[id]')].find(topic =>
                topic.getClientRects().length && topic.getBoundingClientRect().bottom > 90);
        if (!current) return null;
        const topics = current.id === 'stress-all'
            ? TOPICS.filter(topic => topic.counts.stress > 0)
            : TOPICS.filter(topic => topic.id === current.id);
        const kinds = CARD_TYPES.filter(type => topics.some(topic => topic.counts[type.kind])).map(type => type.kind);
        return kinds.length ? { ids: topics.map(topic => topic.id), kinds, name: current.querySelector('.topic-title').textContent.trim() } : null;
    }

    function setCustomOptions(open) {
        document.getElementById('kcCustomOptions').hidden = !open;
        document.getElementById('kcQuickOptions').hidden = open;
        document.querySelector('#kcSelectModal > .kc-actions').hidden = !open;
        const toggle = document.getElementById('kcConfigure');
        toggle.hidden = selectMode === 'learn' || (!quickChoice && !resumeAvailable);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.textContent = open ? 'Назад' : 'Выбрать темы';
        document.querySelector('#kcSelectModal .kc-select-scroll').scrollTop = 0;
        if (open) {
            renderTypeFilters();
            renderDeckList();
            renderSessionSize();
        }
    }

    function sectionTopics() {
        return TOPICS.filter(topic => studySection === 'tables' ? topic.counts.table > 0 :
            Object.keys(topic.counts).some(kind => kind !== 'table' && topic.counts[kind] > 0));
    }

    function renderStudySection() {
        const tables = studySection === 'tables';
        document.getElementById('kcStudySections').hidden = !TOPICS.some(topic => topic.counts.table > 0);
        document.querySelectorAll('#kcStudySections [data-section]').forEach(button => {
            const active = button.dataset.section === studySection;
            button.setAttribute('aria-pressed', String(active));
            button.classList.toggle('is-selected', active);
        });
        document.getElementById('kcTypeOptions').hidden = tables;
        document.getElementById('kcTopicsHeading').textContent = tables ? 'Темы с таблицами' : 'Темы';
        document.querySelectorAll('#kcSizeList [data-limit]').forEach(button => {
            if (button.dataset.limit !== 'all') button.querySelector('.kc-size-meta').textContent = 'до ' + button.dataset.limit + (tables ? ' строк' : ' карточек');
        });
    }

    function loadPreferences() {
        try {
            const value = JSON.parse(kcGet(PREFS_KEY) || '{}') || {};
            return {
                topics: Array.isArray(value.topics) ? value.topics : null,
                kinds: Array.isArray(value.kinds) ? value.kinds : null,
                section: value.section === 'tables' ? 'tables' : 'blocks',
                sections: value.sections && typeof value.sections === 'object' ? value.sections : {},
                limit: value.limit === 'all' ? 'all' : ([15, 30].includes(Number(value.limit)) ? Number(value.limit) : 'all')
            };
        } catch (_) { return { topics: null, kinds: null, limit: 'all', section: 'blocks', sections: {} }; }
    }

    function savePreferences() {
        sectionPreferences[studySection] = { topics: selected.slice(), kinds: selectedKinds.slice() };
        kcSet(PREFS_KEY, JSON.stringify({ topics: selected, kinds: selectedKinds, limit: sessionLimit, section: studySection, sections: sectionPreferences }));
    }

    function allPageCards() {
        return extractCards(TOPICS.map(topic => topic.id));
    }

    function countKinds(topics) {
        const counts = Object.create(null);
        CARD_TYPES.forEach(type => { counts[type.kind] = 0; });
        topics.forEach(topic => {
            CARD_TYPES.forEach(type => { counts[type.kind] += Number(topic.counts[type.kind] || 0); });
        });
        return counts;
    }

    function applySectionPreferences(saved) {
        const topics = sectionTopics();
        selected = Array.isArray(saved?.topics)
            ? saved.topics.filter(id => topics.some(topic => topic.id === id))
            : topics.map(topic => topic.id);
        if (studySection === 'tables') {
            selectedKinds = ['table'];
            return;
        }
        const counts = countKinds(topics);
        const available = CARD_TYPES.filter(type => type.kind !== 'table' && counts[type.kind] > 0).map(type => type.kind);
        const preferred = Array.isArray(saved?.kinds) ? saved.kinds : studyProfile().defaultKinds;
        selectedKinds = preferred.filter(kind => available.includes(kind));
        if (preferred.length && !selectedKinds.length) selectedKinds = available;
    }

    function launchLearning(opener) {
        return openSelect(opener, 'learn');
    }

    function openSelect(opener, mode = 'menu') {
        if (!uiInitialized) return false;
        if (opener) lastDialogOpener = opener;
        selectMode = mode;
        if (mode !== 'topics') untouchedQuickStart = null;
        cardCache = new Map();
        TOPICS = discoverTopics();
        if (!session) store = loadStore();
        pauseSeconds = readPause();
        if (mode === 'learn') {
            const saved = savedSession();
            if (saved) {
                session = saved;
                openReview(saved.reviewPosition);
                return true;
            }
        }
        quickChoice = currentParagraphChoice();
        if (mode === 'learn' && quickChoice && startSession(quickChoice.ids, quickChoice.kinds, 'all', true)) {
            untouchedQuickStart = session.startedAt;
            return true;
        }
        const prefs = loadPreferences();
        sectionPreferences = prefs.sections;
        studySection = prefs.section === 'tables' && TOPICS.some(t => t.counts.table) ? 'tables' : 'blocks';
        applySectionPreferences(sectionPreferences[studySection] || (studySection === prefs.section ? prefs : null));
        sessionLimit = prefs.limit;
        pendingStart = null;
        document.getElementById('kcSelectChoices').hidden = false;
        document.getElementById('kcStartConfirmation').hidden = true;
        const notice = document.getElementById('kcSelectNotice');
        notice.hidden = mode !== 'learn';
        if (!notice.hidden) notice.textContent = quickChoice
            ? 'В этом параграфе всё повторено. Можно выбрать другую тему.'
            : 'В этом параграфе нет карточек. Выберите другую тему.';
        document.getElementById('kcTopicSearch').value = '';
        expandedTopicGroups.clear();
        document.querySelectorAll('#kcSelectChoices details[open]').forEach(details => { details.open = false; });
        renderPauseOptions();
        renderStudySection();
        renderResumeBanner();
        const manualPause = document.getElementById('kcManualPause');
        manualPause.hidden = mode !== 'pause' || !resumeAvailable;
        if (!manualPause.hidden) manualPause.querySelector('.kc-pause-art').innerHTML = pauseArtwork('kcManual');
        setCustomOptions(mode === 'topics' || mode === 'learn' || (!quickChoice && !resumeAvailable));
        savePreferences();
        if (storeDirty) { saveStore(); storeDirty = false; }
        document.getElementById('kcSelectOverlay').classList.remove('hidden');
        setTimeout(() => document.getElementById('kcSelectModal')?.focus(), 0);
    }

    function renderTypeFilters() {
        const list = document.getElementById('kcTypeList');
        if (!list) return;
        const topics = sectionTopics();
        const counts = countKinds(topics.filter(topic => selected.includes(topic.id)));
        const available = countKinds(topics);
        const active = CARD_TYPES.filter(type => selectedKinds.includes(type.kind));
        document.getElementById('kcTypesSelected').textContent = active.length === 1 ? active[0].label :
            active.length ? 'Выбрано ' + active.length : 'Выберите типы';
        list.replaceChildren();
        CARD_TYPES.forEach(type => {
            if (type.kind === 'table' || !available[type.kind]) return;
            const count = counts[type.kind] || 0;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'kc-type-chip' + (selectedKinds.includes(type.kind) ? ' is-selected' : '');
            button.dataset.kind = type.kind;
            button.setAttribute('aria-pressed', selectedKinds.includes(type.kind) ? 'true' : 'false');
            button.innerHTML = '<span class="kc-type-icon" aria-hidden="true">' + (selectedKinds.includes(type.kind) ? IC.check : '') + '</span>' +
                '<span class="kc-type-copy"><span class="kc-type-name">' + escapeHtml(type.label) + '</span></span>' +
                '<span class="kc-type-count">' + count + '</span>';
            button.addEventListener('click', () => {
                if (selectedKinds.includes(type.kind)) selectedKinds = selectedKinds.filter(kind => kind !== type.kind);
                else selectedKinds.push(type.kind);
                savePreferences();
                renderTypeFilters();
                renderDeckList();
                list.querySelector('[data-kind="' + type.kind + '"]')?.focus({ preventScroll: true });
            });
            list.appendChild(button);
        });
    }

    function renderSessionSize() {
        document.getElementById('kcSizeValue').textContent = sessionLimit === 'all' ? 'Все' : String(sessionLimit);
        document.querySelectorAll('#kcSizeList .kc-size-option').forEach(button => {
            const value = button.dataset.limit === 'all' ? 'all' : Number(button.dataset.limit);
            const active = value === sessionLimit;
            button.classList.toggle('is-selected', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function savedSession() {
        const raw = kcGet(SESSION_KEY);
        return raw ? restoreSession(raw, allPageCards()) : null;
    }

    function itemCount(count, kinds) {
        const unit = kinds.length === 1 && kinds[0] === 'table'
            ? plural(count, 'строка', 'строки', 'строк')
            : plural(count, 'карточка', 'карточки', 'карточек');
        return count + ' ' + unit;
    }

    function renderResumeBanner() {
        const host = document.getElementById('kcSessionResume');
        const saved = savedSession();
        resumeAvailable = !!saved;
        host.hidden = !saved;
        host.replaceChildren();
        if (saved) {
            const topic = saved.selectedTopicIds.length === 1 ? TOPICS.find(t => t.id === saved.selectedTopicIds[0]) : null;
            host.innerHTML =
                '<strong>' + escapeHtml(topic?.name || 'Незавершённое занятие') + '</strong>' +
                '<button type="button" class="kc-btn kc-btn-primary" id="kcResumeSession"><span>Продолжить</span>' +
                    '<small>' + escapeHtml('Осталось ' + itemCount(saved.queue.length, saved.selectedKinds)) + '</small></button>' +
                '<button type="button" class="kc-btn kc-btn-ghost" id="kcRestartSession">Начать заново</button>';
            document.getElementById('kcResumeSession').addEventListener('click', () => resumeSavedSession());
            document.getElementById('kcRestartSession').addEventListener('click', event =>
                requestStart(saved.selectedTopicIds, saved.selectedKinds, saved.limit, event.currentTarget));
        }

        const sameParagraph = saved && quickChoice && saved.limit === 'all' &&
            saved.selectedTopicIds.length === quickChoice.ids.length && saved.selectedTopicIds.every(id => quickChoice.ids.includes(id)) &&
            saved.selectedKinds.length === quickChoice.kinds.length && saved.selectedKinds.every(kind => quickChoice.kinds.includes(kind));
        document.getElementById('kcQuickChoice').hidden = !quickChoice || sameParagraph;
        if (quickChoice && !sameParagraph) {
            const plan = buildRecommendation(extractCards(quickChoice.ids, quickChoice.kinds), Date.now(), { limit: 'all' });
            const quick = document.getElementById('kcQuickStart');
            quick.classList.toggle('kc-btn-primary', !saved);
            quick.classList.toggle('kc-btn-ghost', !!saved);
            quick.disabled = !plan.queue.length;
            document.getElementById('kcQuickTopic').textContent = quickChoice.name;
            document.getElementById('kcQuickCount').textContent = itemCount(plan.queue.length, quickChoice.kinds);
        }
    }

    function normalizeTopicQuery(value) {
        return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
    }

    function matchingTopics() {
        const query = normalizeTopicQuery(document.getElementById('kcTopicSearch').value);
        const words = query.split(/\s+/).filter(Boolean);
        return sectionTopics().filter(topic => {
            const label = normalizeTopicQuery(topic.group + ' ' + topic.name);
            return words.every(word => label.includes(word));
        });
    }

    function renderDeckList() {
        const list = document.getElementById('kcDeckList');
        const focusedTopic = document.activeElement?.dataset.topic;
        const topics = matchingTopics();
        const searching = !!normalizeTopicQuery(document.getElementById('kcTopicSearch').value);
        const groups = new Map();
        topics.forEach(topic => {
            const group = topic.group || 'Темы';
            if (!groups.has(group)) groups.set(group, []);
            groups.get(group).push(topic);
        });
        list.replaceChildren();
        groups.forEach((entries, name) => {
            const details = document.createElement('details');
            details.className = 'kc-topic-group kc-study-disclosure';
            details.open = searching || expandedTopicGroups.get(name) === true;
            const selectedCount = entries.filter(topic => selected.includes(topic.id)).length;
            const heading = document.createElement('summary');
            heading.innerHTML = '<span>' + escapeHtml(name) + '</span><small>' + selectedCount + ' / ' + entries.length + '</small>';
            const cards = document.createElement('div');
            cards.className = 'kc-topic-group-list';
            entries.forEach(t => {
                const checked = selected.includes(t.id);
                const { due, fresh } = selectedKinds.length ? topicCounts(t.id, selectedKinds) : { due: 0, fresh: 0 };
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'kc-deck' + (checked ? ' selected' : '');
                card.dataset.topic = t.id;
                card.setAttribute('aria-pressed', String(checked));
                card.innerHTML =
                    '<span class="kc-deck-check" aria-hidden="true">' + IC.check + '</span>' +
                    '<span class="kc-deck-name">' + escapeHtml(t.name) + '</span>' +
                    '<span class="kc-deck-counts">' +
                        (due ? '<span class="kc-pill kc-pill-due" title="К повторению">' + due + '</span>' : '') +
                        (fresh ? '<span class="kc-pill kc-pill-new" title="Новые">' + fresh + '</span>' : '') +
                    '</span>';
                card.addEventListener('click', () => {
                    selected = checked ? selected.filter(id => id !== t.id) : selected.concat(t.id);
                    savePreferences();
                    renderTypeFilters();
                    renderDeckList();
                });
                cards.append(card);
            });
            if (!searching) details.addEventListener('toggle', () => {
                if (details.isConnected) expandedTopicGroups.set(name, details.open);
            });
            details.append(heading, cards);
            list.append(details);
        });
        if (focusedTopic) list.querySelector('[data-topic="' + CSS.escape(focusedTopic) + '"]')?.focus({ preventScroll: true });
        document.getElementById('kcNoTopics').hidden = topics.length > 0;
        const selectedCount = selected.length;
        document.getElementById('kcTopicCount').textContent = 'Выбрано ' + selectedCount + ' ' + plural(selectedCount, 'тема', 'темы', 'тем');
        updateStartBtn();
        const selectAll = document.getElementById('kcSelectAll');
        const allChecked = topics.every(topic => selected.includes(topic.id));
        selectAll.disabled = !topics.length;
        if (searching) selectAll.textContent = allChecked ? 'Снять найденные' : 'Выбрать найденные';
        else selectAll.textContent = allChecked ? 'Снять выбор' : 'Выбрать всё';
    }

    function updateStartBtn() {
        const now = Date.now();
        const selectedCards = selectedKinds.length ? extractCards(selected, selectedKinds) : [];
        const plan = buildRecommendation(selectedCards, now, { limit: sessionLimit, kinds: selectedKinds });
        const count = plan.queue.length;
        const badge = document.getElementById('kcStartCount');
        badge.textContent = count;
        badge.classList.toggle('is-empty', count === 0);
        const start = document.getElementById('kcStart');
        start.disabled = selected.length === 0 || selectedKinds.length === 0 || count === 0;
        badge.setAttribute('aria-label', itemCount(count, selectedKinds));
        const status = document.getElementById('kcRecommendation');
        let message = '';
        if (!selected.length) message = 'Выберите темы';
        else if (!selectedKinds.length) message = 'Выберите типы карточек';
        else if (!selectedCards.length) message = studyProfile().empty;
        else if (!count) message = 'Пока нет карточек к повторению';
        else if (plan.deferred) message = 'Ещё ' + plan.deferred + ' на следующее занятие';
        status.textContent = message;
        status.hidden = !message;
    }

    function toggleSelectAll() {
        const ids = matchingTopics().map(topic => topic.id);
        selected = ids.every(id => selected.includes(id))
            ? selected.filter(id => !ids.includes(id))
            : Array.from(new Set(selected.concat(ids)));
        savePreferences();
        renderTypeFilters();
        renderDeckList();
    }

    // ============================================
    //  Сессия повторения
    // ============================================
    function requestStart(ids, kinds, limit, opener) {
        const saved = savedSession();
        if (!saved || (saved.startedAt === untouchedQuickStart && !saved.reviewed && !saved.reviewPosition?.revealed)) {
            startSession(ids, kinds, limit);
            return;
        }
        const scroll = document.querySelector('#kcSelectModal .kc-select-scroll');
        pendingStart = { ids: ids.slice(), kinds: kinds.slice(), limit, opener, scrollTop: scroll.scrollTop, since: saved.startedAt };
        document.getElementById('kcSelectChoices').hidden = true;
        document.getElementById('kcStartConfirmation').hidden = false;
        document.querySelector('#kcSelectModal > .kc-actions').hidden = true;
        scroll.scrollTop = 0;
        document.getElementById('kcConfirmTitle').focus({ preventScroll: true });
    }

    function cancelStart() {
        if (!pendingStart) return;
        const { opener, scrollTop } = pendingStart;
        pendingStart = null;
        document.getElementById('kcStartConfirmation').hidden = true;
        document.getElementById('kcSelectChoices').hidden = false;
        document.querySelector('#kcSelectModal > .kc-actions').hidden = document.getElementById('kcCustomOptions').hidden;
        document.querySelector('#kcSelectModal .kc-select-scroll').scrollTop = scrollTop;
        opener?.focus({ preventScroll: true });
    }

    function confirmStart() {
        if (!pendingStart) return;
        const { ids, kinds, limit, since } = pendingStart;
        const saved = savedSession();
        cancelStart();
        if (saved && saved.startedAt !== since) {
            openSelect();
            return;
        }
        startSession(ids, kinds, limit);
    }

    function startSession(topicIds, kinds, limit, quickLaunch = false) {
        if (!topicIds.length || !kinds.length) return false;
        const now = Date.now();
        const cards = extractCards(topicIds, kinds);
        const plan = buildRecommendation(cards, now, { limit, kinds });
        const queue = plan.queue;

        if (storeDirty) { saveStore(); storeDirty = false; }
        if (!queue.length) {
            if (quickLaunch) return false;
            const notice = document.getElementById('kcSelectNotice');
            notice.hidden = false;
            notice.textContent = 'Пока нет карточек к повторению';
            renderResumeBanner();
            // A stale count can occur when another tab reviewed the deck.
            // Keep the saved session and show the current selection.
            setCustomOptions(true);
            return false;
        }

        session = {
            queue: queue,
            selectedTopicIds: topicIds.slice(),
            selectedKinds: kinds.slice(),
            limit,
            startedAt: now,
            updatedAt: now,
            reviewed: 0,
            again: 0,
            recalled: 0,
            planned: queue.length,
            cardStats: Object.create(null),
            mastered: Object.create(null),
            states: queue.reduce((states, item) => {
                const raw = stateForCard(item.card);
                const refreshed = refreshStateForContent(item.card, raw, now);
                // A fresh tombstone carries causal undo events. Keep it in the
                // session so the next real answer supersedes the cancelled one
                // on every device instead of losing that history.
                states[item.card.id] = refreshed || (raw && isNewState(raw) ? cloneJSON(raw) : null);
                return states;
            }, Object.create(null)),
            undoStack: []
        };
        persistSession();
        openReview();
        return true;
    }

    function resumeSavedSession(sourceButton) {
        const restored = savedSession();
        if (!restored) {
            if (sourceButton) {
                sourceButton.hidden = true;
                openSelect(lastDialogOpener);
            } else {
                renderResumeBanner();
                setCustomOptions(!quickChoice);
            }
            return;
        }
        session = restored;
        openReview(restored.reviewPosition);
    }

    function openReview(position) {
        document.getElementById('kcReturnToCard').hidden = true;
        document.getElementById('kcReviewNotice').hidden = true;
        document.getElementById('kcSelectOverlay').classList.add('hidden');
        document.getElementById('kcReviewOverlay').classList.remove('hidden');
        syncDialogAccessibility();
        showCard(position);
    }

    function saveReviewPosition() {
        const card = session?.queue[0]?.card;
        if (!card) return;
        session.reviewPosition = { cardId: card.id, revealed, scrollTop: document.getElementById('kcContent').scrollTop };
        persistSession();
    }

    function persistSession() {
        if (!session || !session.queue.length) return kcRemove(SESSION_KEY);
        return kcSet(SESSION_KEY, serializeSession(session)) !== false;
    }

    function renderCounts() {
        const counts = { new: 0, learn: 0, review: 0 };
        session.queue.forEach(item => { counts[item.type]++; });
        document.getElementById('kcCounts').innerHTML =
            '<div><dt>Новые</dt><dd class="kc-count kc-count-new">' + counts.new + '</dd></div>' +
            '<div><dt>Изучаются</dt><dd class="kc-count kc-count-learn">' + counts.learn + '</dd></div>' +
            '<div><dt>К повторению</dt><dd class="kc-count kc-count-review">' + counts.review + '</dd></div>';
        const mastered = Object.keys(session.mastered).length;
        const percent = session.planned ? Math.round(mastered / session.planned * 100) : 100;
        const fill = document.getElementById('kcProgressFill');
        fill.style.width = percent + '%';
        document.getElementById('kcProgress').setAttribute('aria-valuenow', String(percent));
        const progressCopy = document.getElementById('kcProgressCopy');
        const progressDetail = document.getElementById('kcProgressDetail');
        progressCopy.textContent = 'Закреплено ' + mastered + ' из ' + session.planned;
        progressDetail.textContent = session.reviewed + ' ' + plural(session.reviewed, 'ответ', 'ответа', 'ответов') + ' · осталось ' + session.queue.length;
        const undo = document.getElementById('kcUndoBtn');
        undo.disabled = !session.undoStack?.length;
    }

    function clearWait() {
        if (waitTimer) clearTimeout(waitTimer);
        waitTimer = null;
    }

    function nextReadyCard() {
        const now = Date.now();
        const index = session.queue.findIndex(item => readyAt(item) <= now);
        if (index < 0) return false;
        if (index > 0) session.queue.unshift(session.queue.splice(index, 1)[0]);
        return true;
    }

    function resetReviewActions() {
        releaseSketch();
        document.getElementById('kcFront').hidden = true;
        document.getElementById('kcGrades').hidden = true;
        document.getElementById('kcGrades').replaceChildren();
        document.getElementById('kcProgressDetails').open = false;
        const guide = document.getElementById('kcGradeGuide');
        guide.hidden = true;
        guide.open = false;
    }

    const SKETCH_SCREEN = '(max-width: 768px), (max-width: 1180px) and (any-pointer: coarse)';
    let sketch = null;

    function releaseSketch(discard = false) {
        sketch?.destroy(discard);
        sketch = null;
    }

    async function attachSketch() {
        const host = document.getElementById('kcSketch');
        if (!host || !session || !matchMedia(SKETCH_SCREEN).matches) return;
        const current = session;
        const attempt = [current.startedAt, current.reviewed, current.queue[0].card.id].join('/');
        try {
            await window.AlmanionNoteRuntime.ensure('studyInk');
        } catch {
            if (host.isConnected && current === session && !revealed) {
                const retry = document.createElement('button');
                retry.type = 'button';
                retry.className = 'kc-btn kc-btn-ghost';
                retry.textContent = 'Загрузить черновик';
                retry.onclick = attachSketch;
                host.replaceChildren(retry);
                host.hidden = false;
            }
            return;
        }
        if (sketch || !host.isConnected || current !== session || !matchMedia(SKETCH_SCREEN).matches) return;
        host.hidden = false;
        host.addEventListener('pointerdown', () => { untouchedQuickStart = null; }, { once: true });
        sketch = window.AlmanionStudyInk.mount(host, attempt, scopedStorage?.scope?.() || 'guest');
        if (revealed) sketch?.answer();
    }

    function showCard(position) {
        resetReviewActions();
        if (!session || session.queue.length === 0) { showSummary(); return; }
        clearWait();
        if (!nextReadyCard()) { showWaitState(); return; }
        revealed = false;
        const item = session.queue[0];
        const def = item.card;
        renderCounts();
        const content = document.getElementById('kcContent');
        const context = def.context;
        const sourceLabel = def.kind === 'table' ? 'К строке в конспекте' : 'К блоку в конспекте';
        content.innerHTML =
            '<div class="kc-card-wrap">' +
                '<div class="kc-card-context"><div class="kc-topic-label">' + escapeHtml(def.topicName) + '</div>' +
                    '<div class="kc-card-meta">' +
                        (def.kindLabel ? '<span class="kc-kind-label kc-kind-' + escapeHtml(def.kind || 'definition') + '">' + escapeHtml(def.kindLabel) + '</span>' : '') +
                        '<button type="button" class="kc-tool-btn kc-tool-source" id="kcGoToSource">' + sourceLabel + '</button>' +
                    '</div>' +
                '</div>' +
                (def.tableTitle ? '<p class="kc-table-caption">' + escapeHtml(def.tableTitle) + '</p>' : '') +
                '<div class="kc-question" id="kcQuestion">' +
                    (def.questionLead ? '<p class="kc-question-lead">' + escapeHtml(def.questionLead) + '</p>' : '') +
                    (context?.title && context.title !== def.term ? '<p class="kc-question-context">' + escapeHtml(context.title) + '</p>' : '') +
                    '<h3 id="kcQuestionTitle" tabindex="-1">' + (def.termHTML || escapeHtml(def.term)) + '</h3>' +
                '</div>' +
                (context?.html ? '<details class="kc-prompt-context kc-study-disclosure" id="kcPromptContext" open>' +
                    '<summary>Условие</summary><div class="kc-prompt-media">' + context.html + '</div></details>' : '') +
                '<div class="kc-definition" id="kcBack" role="region" aria-label="Ответ" tabindex="-1" hidden>' + def.backHTML + '</div>' +
                '<div id="kcSketch" hidden></div>' +
            '</div>';
        attachSketch();
        document.getElementById('kcFront').hidden = false;
        content.querySelector('.kc-topic-label').title = def.topicName;
        document.getElementById('kcGoToSource').addEventListener('click', () => goToSource(def));
        content.querySelectorAll('.kc-prompt-media :is(img, svg[role="img"])').forEach(image => {
            if (image.localName === 'img') image.loading = 'eager';
            image.tabIndex = 0;
            image.setAttribute('aria-haspopup', 'dialog');
        });
        renderMath(document.getElementById('kcQuestion'));
        renderMath(document.getElementById('kcPromptContext'));
        content.scrollTop = 0;
        if (position?.cardId === def.id && position.revealed) reveal(position.scrollTop);
        else {
            if (position?.cardId === def.id) content.scrollTop = position.scrollTop;
            document.getElementById('kcQuestionTitle').focus({ preventScroll: true });
        }
    }

    function pauseArtwork(id) {
        const speed = 1.4;
        const between = (low, high) => low + Math.random() * (high - low);
        const direction = Math.random() < .5 ? -1 : 1;
        // Two independently phased motions let neighbours meet and separate
        // without putting the whole scene on the same repeating path.
        const circles = [
            { x: 123, radius: 24, period: 7 }, { x: 162, radius: 13, period: 5.8 },
            { x: 207, radius: 22, period: 8.4 }, { x: 246, radius: 9, period: 6.4 }
        ].map(({ x, radius, period }) => {
            const driftTime = period / speed, liftTime = driftTime * between(.73, 1.42);
            const cx = Math.round(180 + direction * (x - 180) + between(-7, 7));
            const cy = Math.round(64 + between(-10, 10)), r = Math.round(radius * between(.86, 1.12));
            const motion = `--drift:${between(13, 19).toFixed(1)}px;--lift:${between(7, 16).toFixed(1)}px;` +
                `--drift-time:${driftTime.toFixed(3)}s;--lift-time:${liftTime.toFixed(3)}s;` +
                `--drift-phase:${(-Math.random() * 2 * driftTime).toFixed(3)}s;--lift-phase:${(-Math.random() * 2 * liftTime).toFixed(3)}s`;
            return `<g class="kc-bubble-orbit" style="${motion}"><circle class="kc-bubble" cx="${cx}" cy="${cy}" r="${r}"/></g>`;
        }).join('');
        return `<svg viewBox="0 0 360 128" width="360" height="128" focusable="false">
                <defs>
                    <filter id="${id}Liquid" filterUnits="userSpaceOnUse" x="45" y="0" width="270" height="128" color-interpolation-filters="sRGB">
                        <feGaussianBlur stdDeviation="5"/>
                        <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -8"/>
                    </filter>
                    <linearGradient id="${id}Tint" x2="1" y2=".35">
                        <stop stop-color="var(--accent-color)"/><stop offset="1" stop-color="var(--kc-bubble-end)"/>
                    </linearGradient>
                    <mask id="${id}Pool" maskUnits="userSpaceOnUse" x="0" y="0" width="360" height="128">
                        <g fill="white" filter="url(#${id}Liquid)">${circles}</g>
                    </mask>
                </defs>
                <rect width="360" height="128" fill="url(#${id}Tint)" mask="url(#${id}Pool)"/>
            </svg>`;
    }

    function showWaitState() {
        revealed = false;
        renderCounts();
        const next = session.queue.reduce((first, item) => readyAt(item) < readyAt(first) ? item : first);
        const earliest = readyAt(next);
        const content = document.getElementById('kcContent');
        content.innerHTML = '<section class="kc-state-screen kc-intermission" aria-labelledby="kcWaitHeading">' +
            '<div class="kc-pause-art" aria-hidden="true">' + pauseArtwork('kcWait') + '</div>' +
            '<h3 class="kc-state-title" id="kcWaitHeading">До повторения</h3>' +
            '<div class="kc-wait-time" id="kcWaitTime" role="timer"></div><div class="kc-wait-track"><div class="kc-wait-fill" id="kcWaitFill"></div></div>' +
            '<div class="kc-state-actions"><button type="button" class="kc-btn kc-btn-primary" id="kcRepeatNow">Повторить сейчас</button>' +
            '<button type="button" class="kc-btn kc-btn-ghost" id="kcWaitPause">Продолжить позже</button></div>' +
            '<button type="button" class="kc-turn-off-pauses" id="kcDisablePauses">Отключить паузы</button></section>';
        const update = () => {
            const left = Math.max(0, earliest - Date.now());
            const label = document.getElementById('kcWaitTime');
            const bar = document.getElementById('kcWaitFill');
            const seconds = Math.ceil(left / 1000);
            if (label) label.textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
            if (bar) bar.style.width = clamp(100 - left / (pauseSeconds * 10), 0, 100) + '%';
            if (left <= 0) { clearWait(); showCard(); }
            else waitTimer = setTimeout(update, 500);
        };
        document.getElementById('kcRepeatNow').addEventListener('click', () => {
            next.availableAt = 0;
            persistSession();
            showCard();
        });
        document.getElementById('kcDisablePauses').addEventListener('click', () => { setPause(0); showCard(); });
        document.getElementById('kcWaitPause').addEventListener('click', pauseSession);
        content.scrollTop = 0;
        document.getElementById('kcRepeatNow').focus({ preventScroll: true });
        update();
    }

    function reveal(scrollTop = 0) {
        if (revealed || !session) return;
        revealed = true;
        sketch?.answer();
        const back = document.getElementById('kcBack');
        const question = document.getElementById('kcQuestion');
        const context = document.getElementById('kcPromptContext');
        const grades = document.getElementById('kcGrades');
        const item = session.queue[0];
        const title = back.querySelector(':scope > strong:first-child, :scope > :is(.derivation-content, .proof-content, .experiment-content) > strong:first-child');
        question.classList.add('is-revealed');
        if (title && readableTerm(title) === normalizeTitle(item.card.term)) question.hidden = true;
        if (context) context.open = false;
        back.hidden = false;
        renderMath(back);
        document.getElementById('kcFront').hidden = true;
        document.getElementById('kcGradeGuide').hidden = false;

        // Превью интервалов для каждой оценки
        const st = session.states[item.card.id] || store[item.card.id];
        const now = Date.now();
        const labels = [
            { g: 1, cls: 'again', name: 'Снова' },
            { g: 2, cls: 'hard', name: 'Трудно' },
            { g: 3, cls: 'good', name: 'Хорошо' },
            { g: 4, cls: 'easy', name: 'Легко' }
        ];
        grades.innerHTML = labels.map(L => {
            const p = item.practiceOnly ? null : project(st, L.g, now);
            return '<button type="button" class="kc-grade kc-grade-' + L.cls + '" data-g="' + L.g + '">' +
                '<span class="kc-grade-lbl">' + L.name + '</span>' +
                '<span class="kc-grade-iv">' + escapeHtml(p ? fmtInterval(p.intervalDays) : 'в сессии') + '</span></button>';
        }).join('');
        grades.hidden = false;
        grades.querySelectorAll('.kc-grade').forEach(b => {
            b.addEventListener('click', () => grade(parseInt(b.dataset.g, 10)));
        });
        back.focus({ preventScroll: true });
        document.getElementById('kcContent').scrollTop = scrollTop;
    }

    function grade(G) {
        if (!revealed || !session || session.queue.length === 0) return;
        const item = session.queue[0];
        const now = Date.now();
        const transition = sessionTransition(session, item, G, now);
        if (!transition) return;
        releaseSketch(true);
        session = transition.session;
        delete session.reviewPosition;
        const persisted = persistState(item.card.id, transition.state);
        persistSession();
        const notice = document.getElementById('kcReviewNotice');
        if (!persisted && notice) {
            notice.hidden = false;
            notice.textContent = 'Локальное хранилище недоступно. Ответ сохранён в текущей вкладке и будет передан в аккаунт при первой возможности.';
        }
        showCard();
    }

    function undoLastGrade() {
        if (!session) return;
        const result = undoSession(session, allPageCards());
        if (!result) return;
        session = result.session;
        delete session.reviewPosition;
        persistState(result.cardId, result.state);
        persistSession();
        showCard();
    }

    function findSourceElement(card) {
        if (!card) return null;
        const topic = document.getElementById(card.topicId);
        if (card.kind === 'table') {
            return Array.from(topic?.querySelectorAll('[data-kc-row-source]') || [])
                .find(row => row.dataset.kcRowSource === card.sourceId) || topic;
        }
        if (topic && card.sourceId?.startsWith('math:')) {
            return displayedFormulas(topic).find(formula => 'math:' + hashString(formula.key) === card.sourceId)?.node || topic;
        }
        if (card.sourceId) {
            const byId = document.getElementById(card.sourceId);
            if (byId) return byId;
        }
        const type = CARD_TYPES.find(entry => entry.kind === card.kind);
        if (!topic || !type) return topic;
        const boxes = Array.from(topic.querySelectorAll(type.selector));
        if (card.sourceId) {
            const exact = boxes.find(box => sourceIdFor(box) === card.sourceId);
            if (exact) return exact;
        }
        return boxes[card.sourceOrdinal] || topic;
    }

    function goToSource(card) {
        const target = findSourceElement(card);
        if (!target) return;
        saveReviewPosition();
        releaseSketch();
        clearWait();
        document.getElementById('kcReviewOverlay').classList.add('hidden');
        if (window.experimentalReader?.isActive?.()) {
            window.experimentalReader.revealElement(target, { source: 'knowledge-check', animate: false, scroll: false, updateHash: true });
        }
        window.AlmanionNoteFilter?.revealMatch(target);
        if (typeof window.closeMobileMenu === 'function') window.closeMobileMenu(false);
        session = null;
        document.getElementById('kcReturnToCard').hidden = false;
        requestAnimationFrame(() => {
            if (!target.hasAttribute('tabindex')) {
                target.tabIndex = -1;
                target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
            }
            target.focus({ preventScroll: true });
            target.scrollIntoView({ behavior: 'auto', block: 'center' });
            target.classList.add('nav-highlight');
            setTimeout(() => target.classList.remove('nav-highlight'), 1500);
        });
    }

    function showSummary() {
        clearWait();
        revealed = false;
        const content = document.getElementById('kcContent');
        renderCounts();
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
                '<p class="kc-final-sub">Все выбранные задания закреплены. Следующий показ назначен по индивидуальному расписанию.</p>' +
                '<div class="kc-final-stats">' +
                    '<div class="kc-fstat"><span class="kc-fstat-val">' + unique + '</span><span class="kc-fstat-lbl">' + (session?.selectedKinds?.length === 1 && session.selectedKinds[0] === 'table' ? plural(unique, 'строка', 'строки', 'строк') : plural(unique, 'карточка', 'карточки', 'карточек')) + '</span></div>' +
                    '<div class="kc-fstat"><span class="kc-fstat-val">' + reviewed + '</span><span class="kc-fstat-lbl">' + plural(reviewed, 'ответ', 'ответа', 'ответов') + '</span></div>' +
                    '<div class="kc-fstat kc-fstat-ok"><span class="kc-fstat-val">' + acc + '%</span><span class="kc-fstat-lbl">вспомнено</span></div>' +
                    (nextLbl ? '<div class="kc-fstat"><span class="kc-fstat-val">' + nextLbl + '</span><span class="kc-fstat-lbl">до повтора</span></div>' : '') +
                '</div>' +
                '<div class="kc-final-actions">' +
                    '<button class="kc-btn kc-btn-ghost" id="kcAgainDecks">К темам</button>' +
                    '<button class="kc-btn kc-btn-primary" id="kcDone">Готово</button>' +
                '</div>' +
            '</div>';
        document.getElementById('kcDone').addEventListener('click', finishSession);
        document.getElementById('kcAgainDecks').addEventListener('click', () => {
            document.getElementById('kcReviewOverlay').classList.add('hidden');
            kcRemove(SESSION_KEY);
            session = null;
            openSelect(undefined, 'topics');
        });
        content.scrollTop = 0;
        document.getElementById('kcDone').focus({ preventScroll: true });
    }

    function nextDueAcrossSelected() {
        const now = Date.now();
        let min = null;
        extractCards(session?.selectedTopicIds || selected, session?.selectedKinds || selectedKinds).forEach(c => {
            const st = normalizeState(stateForCard(c));
            const due = st && st.pendingConfirmations > 0 ? confirmationTime(st.confirmationDue) : (st && st.due);
            if (st && due > now) min = (min == null) ? due : Math.min(min, due);
        });
        return min;
    }

    function closeReview() {
        releaseSketch();
        clearWait();
        if (session?.queue.length) saveReviewPosition();
        else kcRemove(SESSION_KEY);
        session = null;
        document.getElementById('kcReviewOverlay').classList.add('hidden');
    }

    function pauseSession() {
        if (!session) return;
        releaseSketch();
        saveReviewPosition();
        clearWait();
        session = null;
        document.getElementById('kcReviewOverlay').classList.add('hidden');
        openSelect(undefined, 'pause');
    }

    function finishSession() {
        kcRemove(SESSION_KEY);
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
            if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || document.body.classList.contains('lightbox-open')) return;
            if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
            if (!revealed && [' ', 'Enter'].includes(e.key)) {
                if (document.getElementById('kcFront').hidden || e.target.closest?.('a, button, summary, [tabindex="0"]')) return;
                e.preventDefault();
                reveal();
            } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
                e.preventDefault();
                grade(Number(e.key));
            }
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
            if (!e.target.closest?.('.kc-head') || e.target.closest('button')) return;
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
        cardCache = new Map();
        if (!uiInitialized) {
            buildUI();
            uiInitialized = true;
        }
        if (!keyboardInitialized) {
            initKeyboard();
            keyboardInitialized = true;
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    window.addEventListener('almanion:content-ready', init);

    // Экспорт для отладки/тестов
    window.__kcFSRS = {
        project,
        normalizeState,
        retrievability,
        intervalForStability,
        recommendationScore,
        buildRecommendation,
        pendingSuccessesAfterGrade,
        stepMinutes,
        nextStep,
        STEPS_MIN,
        TARGET_RETENTION,
        fmtInterval,
        isLikbezPage,
        studyProfile,
        extractCards,
        stableCardId,
        persistState,
        sessionTransition,
        serializeSession,
        restoreSession,
        undoSession
    };

    function resetForStorageScope() {
        releaseSketch();
        clearWait();
        session = null;
        revealed = false;
        store = loadStore();
        selected = [];
        selectedKinds = [];
        studySection = 'blocks';
        sectionPreferences = {};
        sessionLimit = 'all';
        pauseSeconds = readPause();
        pendingStart = null;
        document.getElementById('kcReturnToCard')?.setAttribute('hidden', '');
        ['kcReviewOverlay', 'kcSelectOverlay'].forEach(function (id) {
            document.getElementById(id)?.classList.add('hidden');
        });
        cardCache = new Map();
    }

    window.addEventListener('almanion-kc-scope-changing', function () {
        if (session && session.queue && session.queue.length) persistSession();
    });
    window.addEventListener('almanion-kc-scope-changed', resetForStorageScope);
    window.addEventListener('almanion-kc-external-change', function (event) {
        const detail = event && event.detail || {};
        if (detail.key === PAUSE_KEY) {
            pauseSeconds = readPause();
            if (uiInitialized) renderPauseOptions();
            if (session && document.getElementById('kcWaitTime')) showCard();
        }
        if (detail.key === STORE_KEY) {
            store = loadStore();
            cardCache = new Map();
        }
    });

    // Хук для синхронизации аккаунта (account.js): применить уже объединённый
    // снимок сразу, в том числе если облако ответило во время открытой сессии.
    window.KC = window.KC || {};
    window.KC.open = launchLearning;
    window.KC.reload = function (key, snapshot) {
        if (key !== STORE_KEY) return;
        store = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
            ? cloneJSON(snapshot)
            : loadStore();
        if (!store.__meta) store.__meta = { schema: SCHEMA_VERSION, updatedAt: 0 };
        cardCache = new Map();
    };
})();
