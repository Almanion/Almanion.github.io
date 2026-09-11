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
        { selector: '.example-box', kind: 'example', label: 'Примеры', singular: 'пример', prompt: 'Воспроизведите пример' }
    ];
    const GENERIC_TITLES = new Set([
        'определение', 'definition', 'формула', 'formula', 'вывод', 'derivation',
        'замечание', 'замечания', 'remark', 'теорема', 'theorem', 'лемма', 'lemma',
        'утверждение', 'утверждения', 'statement', 'следствие', 'corollary',
        'свойство', 'свойства', 'properties', 'доказательство', 'proof',
        'эксперимент', 'experiment', 'пример', 'примеры', 'example'
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

    function studyProfile() {
        return {
            types: CARD_TYPES,
            defaultKinds: isLikbezPage()
                ? ['definition', 'theorem', 'lemma', 'statement', 'corollary']
                : ['definition'],
            subtitle: 'Повторение материалов прямо из конспекта',
            empty: 'В выбранных разделах пока нет блоков выбранных типов.'
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
    const CARD_SELECTOR = CARD_TYPES.map(type => type.selector).join(', ');

    function discoverTopics() {
        const out = [];
        document.querySelectorAll('article.topic[id]').forEach(a => {
            const t = a.querySelector('.topic-title');
            if (!t || !a.querySelector(CARD_SELECTOR)) return;
            const counts = {};
            CARD_TYPES.forEach(type => { counts[type.kind] = a.querySelectorAll(type.selector).length; });
            out.push({ id: a.id, name: t.textContent.trim(), counts: counts });
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
            if (CARD_TYPES.some(type => parent.matches && parent.matches(type.selector))) return true;
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
        const back = box.cloneNode(true);
        if (back.querySelectorAll) {
            back.querySelectorAll('.bookmark-btn, .copy-block-btn, .inline-edit-btn, .note-edit-btn').forEach(el => el.remove());
            if (['theorem', 'lemma', 'statement', 'corollary'].includes(kind)) {
                back.querySelectorAll('.proof-box').forEach(el => el.remove());
            }
        }
        return back.innerHTML;
    }

    function plainCardText(box) {
        const clone = box.cloneNode(true);
        if (clone.querySelectorAll) {
            clone.querySelectorAll(CARD_SELECTOR + ', .bookmark-btn, .copy-block-btn, .inline-edit-btn, .note-edit-btn')
                .forEach(el => el.remove());
        }
        return normalizeTitle(clone.textContent || '');
    }

    function contextualTitle(box, type, topicName, index) {
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
            if (CARD_TYPES.some(candidate => parent.matches && parent.matches(candidate.selector))) {
                const parentStrong = semanticStrong(parent);
                const parentTitle = readableTerm(parentStrong);
                if (parentTitle) return { text: parentTitle, html: parentStrong.innerHTML };
            }
            parent = parent.parentElement;
        }

        if (box.previousElementSibling) {
            let previous = box.previousElementSibling;
            for (let depth = 0; previous && depth < 3; depth++, previous = previous.previousElementSibling) {
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

    function extractTopicCards(tid) {
        if (cardCache.has(tid)) return cardCache.get(tid);
        const cards = [];
        const topic = document.getElementById(tid);
        if (!topic) return cards;
        const tname = topic.querySelector('.topic-title')?.textContent.trim() || '';

        CARD_TYPES.forEach(type => {
            const typeBoxes = Array.from(topic.querySelectorAll(type.selector));
            typeBoxes.forEach((box, i) => {
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
                    backHTML: backHTML,
                    contentHash: hashString(normalizeTitle(box.textContent) + '|' + backHTML),
                    legacyIds: legacyCardIds(tid, type, box, i, typeBoxes.length, displayTerm, tname)
                });
            });
        });

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
                const confirmationReady = normalized.pendingConfirmations > 0 && normalized.confirmationDue <= now;
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
        const profile = studyProfile();
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
        select.setAttribute('aria-hidden', 'true');
        select.innerHTML =
            '<div class="auth-modal kc-modal" id="kcSelectModal" role="dialog" aria-modal="true" aria-labelledby="kcSelectTitle" tabindex="-1">' +
                '<button class="kc-close" id="kcSelectClose" aria-label="Закрыть">' + IC.close + '</button>' +
                '<div class="kc-head"><span class="kc-head-icon">' + IC.brain + '</span>' +
                    '<div class="kc-head-text"><h2 class="kc-title" id="kcSelectTitle">Проверка знаний</h2>' +
                    '<p class="kc-subtitle">' + escapeHtml(profile.subtitle) + '</p></div></div>' +
                '<div class="kc-session-resume" id="kcSessionResume" hidden></div>' +
                '<section class="kc-filter-section" aria-labelledby="kcTypesHeading">' +
                    '<div class="kc-filter-heading-row"><h3 class="kc-filter-heading" id="kcTypesHeading">Что повторять</h3>' +
                    '<p class="kc-filter-hint">Можно выбрать несколько типов</p></div>' +
                    '<div class="kc-type-list" id="kcTypeList"></div>' +
                '</section>' +
                '<section class="kc-filter-section" aria-labelledby="kcTopicsHeading">' +
                    '<div class="kc-filter-heading-row"><h3 class="kc-filter-heading" id="kcTopicsHeading">Разделы</h3></div>' +
                    '<div class="kc-deck-list" id="kcDeckList"></div>' +
                '</section>' +
                '<div class="kc-session-options">' +
                    '<fieldset class="kc-session-size"><legend class="kc-session-size-label">Размер текущей сессии</legend>' +
                    '<div class="kc-size-list" id="kcSizeList">' +
                        '<button type="button" class="kc-size-option" data-limit="15" aria-pressed="false"><span class="kc-size-name">Короткая</span><span class="kc-size-meta">до 15 карточек</span></button>' +
                        '<button type="button" class="kc-size-option" data-limit="30" aria-pressed="false"><span class="kc-size-name">Обычная</span><span class="kc-size-meta">до 30 карточек</span></button>' +
                        '<button type="button" class="kc-size-option" data-limit="all" aria-pressed="true"><span class="kc-size-name">Все</span><span class="kc-size-meta">без ограничения</span></button>' +
                    '</div></fieldset>' +
                '</div>' +
                '<div class="kc-recommendation" id="kcRecommendation" aria-live="polite"></div>' +
                '<div class="kc-session-notice kc-session-notice-error" id="kcSelectNotice" hidden aria-live="polite"></div>' +
                '<div class="kc-actions">' +
                    '<button class="kc-btn kc-btn-ghost" id="kcSelectAll">Выбрать всё</button>' +
                    '<button class="kc-btn kc-btn-primary" id="kcStart">' + IC.play + 'Учить<span class="kc-count-badge" id="kcStartCount">0</span></button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(select);

        const review = document.createElement('div');
        review.className = 'auth-overlay hidden';
        review.id = 'kcReviewOverlay';
        review.setAttribute('aria-hidden', 'true');
        review.innerHTML =
            '<div class="auth-modal kc-modal kc-modal-game" id="kcReviewModal" role="dialog" aria-modal="true" aria-label="Сессия проверки знаний" tabindex="-1">' +
                '<div class="kc-game-bar">' +
                    '<div class="kc-counts" id="kcCounts"></div>' +
                    '<div class="kc-game-actions">' +
                        '<button class="kc-icon-btn" id="kcUndoBtn" type="button" aria-label="Отменить последнюю оценку" title="Отменить последнюю оценку" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-2"/></svg></button>' +
                        '<button class="kc-pause-btn" id="kcPauseBtn" type="button" aria-label="Поставить сессию на паузу" title="Пауза"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg></button>' +
                        '<button class="kc-close" id="kcReviewClose" aria-label="Закрыть">' + IC.close + '</button>' +
                    '</div>' +
                '</div>' +
                '<div class="kc-progress-summary"><span class="kc-progress-copy" id="kcProgressCopy"></span><span class="kc-progress-detail" id="kcProgressDetail"></span></div>' +
                '<div class="kc-progress-track" aria-hidden="true"><div class="kc-progress-fill" id="kcProgressFill"></div></div>' +
                '<div class="kc-session-notice kc-session-notice-error" id="kcReviewNotice" hidden aria-live="polite"></div>' +
                '<div class="kc-content" id="kcContent"></div>' +
                '<details class="kc-grade-guide" id="kcGradeGuide" hidden><summary class="kc-grade-guide-title">Как выбрать оценку</summary>' +
                    '<div class="kc-grade-guide-list">' +
                        '<div class="kc-grade-guide-item kc-grade-guide-again"><span><span class="kc-grade-guide-label">Снова</span> — не вспомнил; нужно два уверенных ответа.</span></div>' +
                        '<div class="kc-grade-guide-item kc-grade-guide-hard"><span><span class="kc-grade-guide-label">Трудно</span> — вспомнил с большим усилием; нужна ещё одна проверка.</span></div>' +
                        '<div class="kc-grade-guide-item kc-grade-guide-good"><span><span class="kc-grade-guide-label">Хорошо</span> — ответил верно без подсказки.</span></div>' +
                        '<div class="kc-grade-guide-item kc-grade-guide-easy"><span><span class="kc-grade-guide-label">Легко</span> — полный ответ возник сразу.</span></div>' +
                    '</div></details>' +
                '<div class="kc-grade-row" id="kcGrades" hidden></div>' +
            '</div>';
        document.body.appendChild(review);

        // Закрытие
        document.getElementById('kcSelectClose').addEventListener('click', () => hide('kcSelectOverlay'));
        document.getElementById('kcReviewClose').addEventListener('click', closeReview);
        document.getElementById('kcPauseBtn').addEventListener('click', pauseSession);
        document.getElementById('kcUndoBtn').addEventListener('click', undoLastGrade);
        select.addEventListener('click', e => { if (e.target === select) hide('kcSelectOverlay'); });
        review.addEventListener('click', e => { if (e.target === review) closeReview(); });

        document.getElementById('kcSelectAll').addEventListener('click', toggleSelectAll);
        document.getElementById('kcStart').addEventListener('click', startSession);
        document.querySelectorAll('#kcSizeList .kc-size-option').forEach(button => {
            button.addEventListener('click', () => {
                sessionLimit = button.dataset.limit === 'all' ? 'all' : Number(button.dataset.limit);
                savePreferences();
                renderSessionSize();
                updateStartBtn();
            });
        });

        initSwipe('kcSelectOverlay', 'kcSelectModal', () => hide('kcSelectOverlay'));
        initSwipe('kcReviewOverlay', 'kcReviewModal', closeReview);
        initDialogAccessibility(select, review);
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
            if (lastDialogOpener && lastDialogOpener.isConnected && typeof lastDialogOpener.focus === 'function') {
                lastDialogOpener.focus({ preventScroll: true });
            }
            return;
        }
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
            if (!overlay) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                if (overlay.id === 'kcReviewOverlay') closeReview();
                else hide('kcSelectOverlay');
                return;
            }
            if (event.key !== 'Tab') return;
            const modal = overlay.querySelector('[role="dialog"]');
            if (!modal) return;
            const focusable = Array.from(modal.querySelectorAll(
                'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )).filter(function (element) { return element.offsetParent !== null; });
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

    function hide(id) {
        document.getElementById(id)?.classList.add('hidden');
        if (lastDialogOpener && typeof lastDialogOpener.focus === 'function') lastDialogOpener.focus();
    }

    // ============================================
    //  Экран выбора тем (список «колод»)
    // ============================================
    let selected = [];
    let selectedKinds = [];
    let sessionLimit = 'all';

    function loadPreferences() {
        try {
            const value = JSON.parse(kcGet(PREFS_KEY) || '{}') || {};
            return {
                topics: Array.isArray(value.topics) ? value.topics : [],
                kinds: Array.isArray(value.kinds) ? value.kinds : [],
                limit: value.limit === 'all' ? 'all' : ([15, 30].includes(Number(value.limit)) ? Number(value.limit) : 'all')
            };
        } catch (_) { return { topics: [], kinds: [], limit: 'all' }; }
    }

    function savePreferences() {
        kcSet(PREFS_KEY, JSON.stringify({ topics: selected, kinds: selectedKinds, limit: sessionLimit }));
    }

    function allPageCards() {
        return extractCards(TOPICS.map(topic => topic.id));
    }

    function availableKinds() {
        const counts = Object.create(null);
        CARD_TYPES.forEach(type => { counts[type.kind] = 0; });
        TOPICS.filter(topic => selected.includes(topic.id)).forEach(topic => {
            CARD_TYPES.forEach(type => { counts[type.kind] += Number(topic.counts[type.kind] || 0); });
        });
        return counts;
    }

    function openSelect() {
        cardCache = new Map();
        TOPICS = discoverTopics();
        if (!session) store = loadStore();
        const prefs = loadPreferences();
        if (!selected.length) selected = prefs.topics;
        selected = selected.filter(id => TOPICS.some(topic => topic.id === id));
        if (selected.length === 0) selected = TOPICS.map(t => t.id);
        if (!selectedKinds.length) selectedKinds = prefs.kinds;
        sessionLimit = prefs.limit;
        const kindCounts = availableKinds();
        selectedKinds = selectedKinds.filter(kind => CARD_TYPES.some(type => type.kind === kind) && kindCounts[kind] > 0);
        if (selectedKinds.length === 0) {
            selectedKinds = studyProfile().defaultKinds.filter(kind => kindCounts[kind] > 0);
            if (!selectedKinds.length) selectedKinds = CARD_TYPES.filter(type => kindCounts[type.kind] > 0).map(type => type.kind);
        }
        renderTypeFilters();
        renderDeckList();
        renderSessionSize();
        renderResumeBanner();
        savePreferences();
        if (storeDirty) { saveStore(); storeDirty = false; }
        lastDialogOpener = document.activeElement;
        document.getElementById('kcSelectOverlay').classList.remove('hidden');
        setTimeout(() => document.getElementById('kcSelectModal')?.focus(), 0);
    }

    function renderTypeFilters() {
        const list = document.getElementById('kcTypeList');
        if (!list) return;
        const counts = availableKinds();
        list.innerHTML = '';
        CARD_TYPES.forEach(type => {
            const count = counts[type.kind] || 0;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'kc-type-chip' + (selectedKinds.includes(type.kind) ? ' is-selected' : '') + (!count ? ' is-unavailable' : '');
            button.dataset.kind = type.kind;
            button.disabled = !count;
            button.setAttribute('aria-pressed', selectedKinds.includes(type.kind) ? 'true' : 'false');
            button.innerHTML = '<span class="kc-type-icon" aria-hidden="true">' + (selectedKinds.includes(type.kind) ? IC.check : '·') + '</span>' +
                '<span class="kc-type-copy"><span class="kc-type-name">' + escapeHtml(type.label) + '</span></span>' +
                '<span class="kc-type-count">' + count + '</span>';
            button.addEventListener('click', () => {
                if (selectedKinds.includes(type.kind)) selectedKinds = selectedKinds.filter(kind => kind !== type.kind);
                else selectedKinds.push(type.kind);
                savePreferences();
                renderTypeFilters();
                renderDeckList();
            });
            list.appendChild(button);
        });
    }

    function renderSessionSize() {
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

    function renderResumeBanner() {
        const host = document.getElementById('kcSessionResume');
        if (!host) return;
        const saved = savedSession();
        if (!saved) { host.hidden = true; host.innerHTML = ''; return; }
        const remaining = saved.queue.length;
        host.hidden = false;
        host.innerHTML = '<div class="kc-session-resume-copy"><span class="kc-session-resume-title">Незавершённая сессия</span>' +
            '<span class="kc-session-resume-meta">Осталось ' + remaining + ' ' + plural(remaining, 'карточка', 'карточки', 'карточек') + '</span></div>' +
            '<div class="kc-session-resume-actions"><button type="button" class="kc-btn kc-btn-primary" id="kcResumeSession">Продолжить</button>' +
            '<button type="button" class="kc-btn kc-btn-ghost" id="kcDiscardSession">Сбросить</button></div>';
        document.getElementById('kcResumeSession').addEventListener('click', resumeSavedSession);
        document.getElementById('kcDiscardSession').addEventListener('click', () => {
            kcRemove(SESSION_KEY);
            renderResumeBanner();
        });
    }

    function renderDeckList() {
        const list = document.getElementById('kcDeckList');
        list.innerHTML = '';
        let totalDue = 0, totalNew = 0;
        TOPICS.forEach(t => {
            const { due, fresh } = topicCounts(t.id, selectedKinds);
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
                savePreferences();
                renderTypeFilters();
                renderDeckList();
            });
            list.appendChild(card);
        });
        updateStartBtn();
        updateSelectAllLabel();
    }

    function updateStartBtn() {
        const now = Date.now();
        const selectedCards = extractCards(selected, selectedKinds);
        const plan = buildRecommendation(selectedCards, now, { limit: sessionLimit, kinds: selectedKinds });
        const count = plan.queue.length;
        const badge = document.getElementById('kcStartCount');
        badge.textContent = count;
        badge.classList.toggle('is-empty', count === 0);
        const start = document.getElementById('kcStart');
        start.disabled = selected.length === 0 || selectedKinds.length === 0 || count === 0;
        const recommendation = document.getElementById('kcRecommendation');
        if (recommendation) {
            if (selected.length === 0) {
                recommendation.innerHTML = '<strong>Выберите темы</strong><span>Алгоритм соберёт все новые и назначенные к повторению карточки.</span>';
            } else if (selectedKinds.length === 0) {
                recommendation.innerHTML = '<strong>Выберите типы карточек</strong><span>Например, только определения или формулы и выводы.</span>';
            } else if (selectedCards.length === 0) {
                recommendation.innerHTML = '<strong>Пока нечего проверять</strong><span>' +
                    escapeHtml(studyProfile().empty) + '</span>';
            } else if (count === 0) {
                recommendation.innerHTML = '<strong>Всё усвоено</strong><span>Следующие повторения появятся по интервальному расписанию.</span>';
            } else {
                const parts = [];
                if (plan.reviewCount) parts.push(plan.reviewCount + ' к повторению');
                if (plan.newCount) parts.push(plan.newCount + ' ' + plural(plan.newCount, 'новая', 'новые', 'новых'));
                if (plan.deferred) parts.push(plan.deferred + ' останутся на следующую сессию');
                recommendation.innerHTML = '<strong>Рекомендовано: ' + count + ' ' + plural(count, 'карточка', 'карточки', 'карточек') + '</strong>' +
                    '<span><span class="kc-visually-hidden">Состав: </span>' + parts.join(' · ') +
                    '</span>';
            }
        }
    }

    function updateSelectAllLabel() {
        const b = document.getElementById('kcSelectAll');
        if (b) b.textContent = (selected.length === TOPICS.length && TOPICS.length) ? 'Снять всё' : 'Выбрать всё';
    }

    function toggleSelectAll() {
        selected = (selected.length === TOPICS.length) ? [] : TOPICS.map(t => t.id);
        savePreferences();
        renderTypeFilters();
        renderDeckList();
    }

    // ============================================
    //  Сессия повторения
    // ============================================
    function startSession() {
        if (selected.length === 0 || selectedKinds.length === 0) return;
        const now = Date.now();
        const cards = extractCards(selected, selectedKinds);
        const plan = buildRecommendation(cards, now, { limit: sessionLimit, kinds: selectedKinds });
        const queue = plan.queue;

        if (queue.length === 0) { showEmptyState(); document.getElementById('kcSelectOverlay').classList.add('hidden'); document.getElementById('kcReviewOverlay').classList.remove('hidden'); return; }

        session = {
            queue: queue,
            selectedTopicIds: selected.slice(),
            selectedKinds: selectedKinds.slice(),
            limit: sessionLimit,
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
        document.getElementById('kcSelectOverlay').classList.add('hidden');
        document.getElementById('kcReviewOverlay').classList.remove('hidden');
        setTimeout(() => document.getElementById('kcReviewModal')?.focus(), 0);
        showCard();
    }

    function resumeSavedSession() {
        const restored = savedSession();
        if (!restored) { renderResumeBanner(); return; }
        session = restored;
        selected = restored.selectedTopicIds.slice();
        selectedKinds = restored.selectedKinds.slice();
        sessionLimit = restored.limit;
        document.getElementById('kcSelectOverlay').classList.add('hidden');
        document.getElementById('kcReviewOverlay').classList.remove('hidden');
        setTimeout(() => document.getElementById('kcReviewModal')?.focus(), 0);
        showCard();
    }

    function persistSession() {
        if (!session || !session.queue.length) return kcRemove(SESSION_KEY);
        return kcSet(SESSION_KEY, serializeSession(session)) !== false;
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
            const mastered = Object.keys(session.mastered).length;
            fill.style.width = (session.planned ? Math.round(mastered / session.planned * 100) : 100) + '%';
        }
        const mastered = Object.keys(session.mastered).length;
        const progressCopy = document.getElementById('kcProgressCopy');
        const progressDetail = document.getElementById('kcProgressDetail');
        if (progressCopy) progressCopy.textContent = 'Закреплено ' + mastered + ' из ' + session.planned;
        if (progressDetail) progressDetail.textContent = session.reviewed + ' ' + plural(session.reviewed, 'ответ', 'ответа', 'ответов') + ' · осталось ' + session.queue.length;
        const undo = document.getElementById('kcUndoBtn');
        if (undo) undo.disabled = !session.undoStack || session.undoStack.length === 0;
    }

    function clearWait() {
        if (waitTimer) clearTimeout(waitTimer);
        waitTimer = null;
    }

    function nextReadyCard() {
        const now = Date.now();
        const index = session.queue.findIndex(item => !item.availableAt || item.availableAt <= now);
        if (index < 0) return false;
        if (index > 0) session.queue.unshift(session.queue.splice(index, 1)[0]);
        return true;
    }

    function showCard() {
        if (!session || session.queue.length === 0) { showSummary(); return; }
        clearWait();
        if (!nextReadyCard()) { showWaitState(); return; }
        revealed = false;
        const item = session.queue[0];
        const def = item.card;
        renderCounts();
        const content = document.getElementById('kcContent');
        content.innerHTML =
            '<div class="kc-card-wrap">' +
                '<div class="kc-card-context"><div class="kc-topic-label">' + escapeHtml(def.topicName) + '</div>' +
                    (def.kindLabel ? '<span class="kc-kind-label kc-kind-' + escapeHtml(def.kind || 'definition') + '">' + escapeHtml(def.kindLabel) + '</span>' : '') +
                '</div>' +
                '<button type="button" class="kc-flashcard" id="kcFront">' +
                    (def.questionLead ? '<span class="kc-flashcard-prompt">' + escapeHtml(def.questionLead) + '</span>' : '') +
                    '<span class="kc-flashcard-term">' + (def.termHTML || escapeHtml(def.term)) + '</span>' +
                    '<span class="kc-flashcard-tap">' + IC.eye + '<span>показать ответ</span></span>' +
                '</button>' +
                '<div class="kc-definition" id="kcBack" hidden>' + def.backHTML + '</div>' +
                '<div class="kc-card-tools"><button type="button" class="kc-tool-btn kc-tool-source" id="kcGoToSource"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 3h7v7"/><path d="m10 14 11-11"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>К блоку в конспекте</button></div>' +
            '</div>';
        // Кнопки оценок — закреплённый футер модалки (вне прокручиваемого контента),
        // поэтому всегда видны даже на невысоких экранах; сбрасываем их под новую карточку.
        const grades = document.getElementById('kcGrades');
        if (grades) { grades.hidden = true; grades.innerHTML = ''; }
        const guide = document.getElementById('kcGradeGuide');
        if (guide) { guide.hidden = true; guide.open = false; }
        const front = document.getElementById('kcFront');
        front.addEventListener('click', reveal);
        document.getElementById('kcGoToSource')?.addEventListener('click', () => goToSource(def));
        setTimeout(() => { renderMath(front); }, 30);
    }

    function showWaitState() {
        revealed = false;
        renderCounts();
        const earliest = Math.min(...session.queue.map(item => finite(item.availableAt, Date.now())));
        const content = document.getElementById('kcContent');
        const grades = document.getElementById('kcGrades');
        const guide = document.getElementById('kcGradeGuide');
        if (grades) grades.hidden = true;
        if (guide) guide.hidden = true;
        content.innerHTML = '<div class="kc-state-screen"><span class="kc-state-icon">' + IC.brain + '</span>' +
            '<h3 class="kc-state-title">Небольшая пауза</h3><p class="kc-state-copy">Короткий интервал помогает проверить, действительно ли ответ закрепился.</p>' +
            '<div class="kc-wait-time" id="kcWaitTime"></div><div class="kc-wait-track"><div class="kc-wait-fill" id="kcWaitFill"></div></div>' +
            '<div class="kc-state-actions"><button type="button" class="kc-btn kc-btn-ghost" id="kcRepeatNow">Повторить сейчас</button>' +
            '<button type="button" class="kc-btn kc-btn-primary" id="kcWaitPause">Продолжить позже</button></div></div>';
        const update = () => {
            const left = Math.max(0, earliest - Date.now());
            const label = document.getElementById('kcWaitTime');
            const bar = document.getElementById('kcWaitFill');
            if (label) label.textContent = Math.ceil(left / 1000) + ' с';
            if (bar) bar.style.width = Math.min(100, Math.max(0, 100 - left / MINUTE * 100)) + '%';
            if (left <= 0) { clearWait(); showCard(); }
            else waitTimer = setTimeout(update, 500);
        };
        document.getElementById('kcRepeatNow').addEventListener('click', () => {
            session.queue.forEach(item => { if (item.availableAt === earliest) item.availableAt = 0; });
            persistSession();
            showCard();
        });
        document.getElementById('kcWaitPause').addEventListener('click', pauseSession);
        update();
    }

    function reveal() {
        if (revealed || !session) return;
        revealed = true;
        const back = document.getElementById('kcBack');
        const front = document.getElementById('kcFront');
        const grades = document.getElementById('kcGrades');
        if (back) { back.hidden = false; back.classList.add('is-shown'); renderMath(back); }
        if (front) front.classList.add('is-revealed');
        const guide = document.getElementById('kcGradeGuide');
        if (guide) guide.hidden = false;

        // Превью интервалов для каждой оценки
        const item = session.queue[0];
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
            return '<button class="kc-grade kc-grade-' + L.cls + '" data-g="' + L.g + '">' +
                '<span class="kc-grade-iv">' + (p ? fmtInterval(p.intervalDays) : 'в сессии') + '</span>' +
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
        const item = session.queue[0];
        const now = Date.now();
        const transition = sessionTransition(session, item, G, now);
        if (!transition) return;
        session = transition.session;
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
        persistState(result.cardId, result.state);
        persistSession();
        showCard();
    }

    function findSourceElement(card) {
        if (!card) return null;
        if (card.sourceId) {
            const byId = document.getElementById(card.sourceId);
            if (byId) return byId;
        }
        const topic = document.getElementById(card.topicId);
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
        persistSession();
        clearWait();
        document.getElementById('kcReviewOverlay').classList.add('hidden');
        if (window.experimentalReader?.isActive?.()) {
            window.experimentalReader.revealElement(target, { source: 'knowledge-check', animate: false, scroll: false, updateHash: true });
        }
        if (typeof window.closeMobileMenu === 'function') window.closeMobileMenu();
        session = null;
        setTimeout(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.add('nav-highlight');
            setTimeout(() => target.classList.remove('nav-highlight'), 1500);
        }, 80);
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
                '<p class="kc-final-sub">Все выбранные карточки уже усвоены. Расписание подскажет время следующего повторения.</p>' +
                '<div class="kc-final-actions"><button class="kc-btn kc-btn-primary" id="kcEmptyDone">Готово</button></div>' +
            '</div>';
        document.getElementById('kcEmptyDone').addEventListener('click', closeReview);
    }

    function showSummary() {
        clearWait();
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
                '<p class="kc-final-sub">Все выбранные карточки закреплены. Следующий показ назначен по индивидуальному расписанию.</p>' +
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
        document.getElementById('kcDone').addEventListener('click', finishSession);
        document.getElementById('kcAgainDecks').addEventListener('click', () => {
            document.getElementById('kcReviewOverlay').classList.add('hidden');
            kcRemove(SESSION_KEY);
            session = null;
            openSelect();
        });
    }

    function nextDueAcrossSelected() {
        const now = Date.now();
        let min = null;
        extractCards(selected, selectedKinds).forEach(c => {
            const st = normalizeState(stateForCard(c));
            const due = st && st.pendingConfirmations > 0 ? st.confirmationDue : (st && st.due);
            if (st && due > now) min = (min == null) ? due : Math.min(min, due);
        });
        return min;
    }

    function closeReview() {
        clearWait();
        if (session && session.queue.length) persistSession();
        else kcRemove(SESSION_KEY);
        session = null;
        document.getElementById('kcReviewOverlay').classList.add('hidden');
    }

    function pauseSession() {
        if (!session) return;
        persistSession();
        clearWait();
        session = null;
        document.getElementById('kcReviewOverlay').classList.add('hidden');
        openSelect();
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
        clearWait();
        session = null;
        revealed = false;
        store = loadStore();
        selected = [];
        selectedKinds = [];
        sessionLimit = 'all';
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
        if (detail.key === STORE_KEY) {
            store = loadStore();
            cardCache = new Map();
        }
    });

    // Хук для синхронизации аккаунта (account.js): применить уже объединённый
    // снимок сразу, в том числе если облако ответило во время открытой сессии.
    window.KC = window.KC || {};
    window.KC.reload = function (key, snapshot) {
        if (key !== STORE_KEY) return;
        store = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
            ? cloneJSON(snapshot)
            : loadStore();
        if (!store.__meta) store.__meta = { schema: SCHEMA_VERSION, updatedAt: 0 };
        cardCache = new Map();
    };
})();
