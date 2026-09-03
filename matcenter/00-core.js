// ============================================
// БЕЗОПАСНЫЕ ОБЁРТКИ ДЛЯ LOCALSTORAGE
// Используются повсюду, чтобы приватный режим / quota / cookies-off
// не крашили matcenter (а это страница, где они особенно критичны:
// авторизация, сессии, fingerprint, кеш задач).
// ============================================
const safeGet = (typeof window !== 'undefined' && window.safeStorageGet)
    ? window.safeStorageGet
    : function(k){ try { return window.localStorage.getItem(k); } catch (_) { return null; } };
const safeSet = (typeof window !== 'undefined' && window.safeStorageSet)
    ? window.safeStorageSet
    : function(k,v){ try { window.localStorage.setItem(k,v); return true; } catch (_) { return false; } };
const safeRemove = (typeof window !== 'undefined' && window.safeStorageRemove)
    ? window.safeStorageRemove
    : function(k){ try { window.localStorage.removeItem(k); } catch (_) {} };

// ============================================
// DEBUG LOGGING
// matcenter имеет много отладочных console.log — на проде они тратят CPU
// (форматирование строк, вывод в DevTools). Глушим по умолчанию.
// Включить отладку: safeSet('matcenter_debug', '1') и перезагрузить.
// error / warn / table остаются — для диагностики проблем.
// ============================================
(function muteVerboseLogs() {
    if (safeGet('matcenter_debug') === '1') return;
    const noop = function () {};
    console.log = noop;
    console.info = noop;
    console.debug = noop;
})();

// ============================================
// CONFIGURATION
// ============================================

// Google Apps Script endpoints.
// Первый — основная таблица (9 класс и т.д.), второй — летняя серия 9-10 (отдельная таблица).
// Можно добавлять ещё, фронт читает все и сливает задачи.
const API_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyR_Iz_fyg2s-bviRtkvF1Zz_KMdRCUgpoIVT1CF-lG6UiNkVfvor_nMXILPzk8xslA/exec';
const SUMMER_9_10_ENDPOINT = 'https://script.google.com/macros/s/AKfycbw_1QMpa29l9_ziOEVI13PLlHfhdUX5-Aqrg76hfIgXamUVitT0Sc_IwBwKb2Pqj0s/exec';

const TASKS_ENDPOINTS = [API_ENDPOINT, SUMMER_9_10_ENDPOINT].filter(Boolean);

// Security settings
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATIONS = [
    5 * 60 * 1000,      // 1-я блокировка: 5 минут
    15 * 60 * 1000,     // 2-я блокировка: 15 минут
    60 * 60 * 1000,     // 3-я блокировка: 1 час
    24 * 60 * 60 * 1000 // 4-я+ блокировка: 24 часа
];
const SESSION_DURATION = Infinity; // Неистекающие сессии (до явного выхода)
const FINGERPRINT_SALT = 'matcenter_v1_2024'; // Соль для отпечатка
const TASKS_CACHE_KEY = 'matcenter_tasks_cache';
const TASKS_CACHE_VERSION = 2;
const GRADE_STORAGE_KEY = 'matcenter_grade';
const FILTER_STORAGE_KEY = 'matcenter_filter';
const DEFAULT_GRADE = 'grade-9';
const DEFAULT_FILTER = 'all-tasks';
const MATCENTER_SOLVED_DB_PATH = 'matcenterSolved';
let lastTasksPayloadSignature = '';

const GRADE_SECTIONS = [
    { id: 'grade-9', title: '9 класс' },
    { id: 'grade-summer-9-10', title: 'Летняя серия 9-10' },
    { id: 'grade-10', title: '10 класс' },
    { id: 'grade-summer-10-11', title: 'Летняя серия 10-11' },
    { id: 'grade-11', title: '11 класс' }
];

const TASK_VIEW_IDS = ['all-tasks', 'current-series', 'postponed', 'unsolved'];

let allTasks = [];
let searchStatusFilter = 'all'; // all | current | postponed | unsolved
let currentGrade = DEFAULT_GRADE;
let currentFilter = 'all-tasks';
let authToken = null;
let matcenterAuthMode = 'detecting'; // account (v2) | legacy (старые deployment)
let lockoutTimer = null;
let autoRefreshTimer = null; // Таймер автообновления
let deviceFingerprint = null;
let isAdmin = false;
let personalSolvedAuth = null;
let personalSolvedDb = null;
let personalSolvedUser = null;
let personalSolvedRef = null;
let personalSolvedMap = {};
let personalSolvedInitialized = false;
// Подсказки теперь хранятся в Google Sheet (столбец Hint)

async function postMatcenterJson(endpoint, payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify(payload || {}),
            signal: controller.signal
        });
        if (!response.ok) {
            const error = new Error(`HTTP ${response.status}`);
            error.code = response.status === 401 || response.status === 403 ? 'AUTH' : 'HTTP';
            throw error;
        }
        const text = await response.text();
        try { return JSON.parse(text); }
        catch (_) { throw new Error('Сервер вернул некорректный ответ'); }
    } finally {
        clearTimeout(timeout);
    }
}

async function detectMatcenterAuthMode() {
    const remembered = safeGet('matcenter_auth_mode');
    const checks = await Promise.allSettled(
        TASKS_ENDPOINTS.map(endpoint => postMatcenterJson(endpoint, { action: 'capabilities' }))
    );
    const responses = checks.filter(item => item.status === 'fulfilled').map(item => item.value);
    if (responses.length === TASKS_ENDPOINTS.length && responses.every(data => Number(data.authVersion) >= 2)) {
        safeSet('matcenter_auth_mode', 'account');
        return 'account';
    }
    // После перехода на v2 сетевой сбой не должен возвращать пароль в legacy URL.
    if (remembered === 'account') return 'account';
    safeSet('matcenter_auth_mode', 'legacy');
    return 'legacy';
}

function getMatcenterFirebaseAuth() {
    if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') return null;
    try { return firebase.auth(); } catch (_) { return null; }
}

async function waitForMatcenterUser() {
    const auth = getMatcenterFirebaseAuth();
    if (!auth) return null;
    if (auth.currentUser) return auth.currentUser;
    return new Promise(resolve => {
        let settled = false;
        let unsubscribe = () => {};
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            unsubscribe();
            resolve(auth.currentUser || null);
        }, 3500);
        unsubscribe = auth.onAuthStateChanged(user => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            unsubscribe();
            resolve(user || null);
        }, () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            unsubscribe();
            resolve(null);
        });
    });
}

async function getMatcenterIdToken(forceRefresh = false) {
    const user = await waitForMatcenterUser();
    if (!user) {
        const error = new Error('Сначала войдите в аккаунт');
        error.code = 'ACCOUNT_REQUIRED';
        throw error;
    }
    return user.getIdToken(forceRefresh);
}

async function checkMatcenterAccountAccess() {
    const idToken = await getMatcenterIdToken();
    const results = await Promise.all(TASKS_ENDPOINTS.map(endpoint =>
        postMatcenterJson(endpoint, { action: 'accessStatus', idToken })
    ));
    return {
        allowed: results.every(data => data && data.success && data.allowed),
        isAdmin: results.length > 0 && results.every(data => data && data.isAdmin)
    };
}

async function authorizeMatcenterAccount(password) {
    const idToken = await getMatcenterIdToken(true);
    const results = await Promise.all(TASKS_ENDPOINTS.map(endpoint =>
        postMatcenterJson(endpoint, { action: 'authorizeAccount', idToken, password })
    ));
    const failure = results.find(data => !data || !data.success || !data.allowed);
    if (failure) {
        const error = new Error(failure.error || 'Не удалось подтвердить аккаунт');
        error.code = /парол/i.test(error.message) ? 'AUTH' : 'SERVER';
        throw error;
    }
    return { isAdmin: results.length > 0 && results.every(data => data.isAdmin) };
}

async function initializeMatcenterAccess(fingerprintPromise) {
    matcenterAuthMode = await detectMatcenterAuthMode();
    if (matcenterAuthMode === 'account') {
        safeRemove('matcenter_auth');
        clearSession();
        const user = await waitForMatcenterUser();
        if (!user) {
            showAuthForm();
            return;
        }
        try {
            const access = await checkMatcenterAccountAccess();
            if (!access.allowed) {
                showAuthForm();
                return;
            }
            authToken = 'account';
            isAdmin = access.isAdmin;
            hideAuthForm();
            const hadCache = applyTasksFromCache();
            await loadTasksFromGoogleSheets(false, hadCache);
        } catch (error) {
            authToken = null;
            showAuthForm();
            showMatcenterAuthMessage(error.message || 'Не удалось проверить доступ', false);
        }
        return;
    }

    const savedPassword = safeGet('matcenter_auth');
    if (!savedPassword) {
        showAuthForm();
        return;
    }

    authToken = savedPassword;
    hideAuthForm();
    const hadCache = applyTasksFromCache();
    try {
        await loadTasksFromGoogleSheets(false, hadCache);
        try {
            await fingerprintPromise;
            createSession(await hashPassword(savedPassword));
        } catch (error) {
            console.warn('Ошибка создания legacy-сессии:', error);
        }
    } catch (error) {
        const isAuthFailure = error && (error.code === 'AUTH'
            || /парол|недостаточно прав|unauthor|\b401\b|\b403\b/i.test(error.message || ''));
        if (hadCache && !isAuthFailure) {
            showMatcenterDataWarning('Сервер временно недоступен. Показана сохранённая копия задач.');
        } else {
            authToken = null;
            isAdmin = false;
            safeRemove('matcenter_auth');
            showAuthForm();
        }
    }
}

// ============================================
// SECURITY STATS & MONITORING
// ============================================

// Функция для просмотра статистики безопасности (доступна в консоли)
window.showSecurityStats = function() {
    console.log('═══════════════════════════════════════');
    console.log('🔒 СТАТИСТИКА БЕЗОПАСНОСТИ');
    console.log('═══════════════════════════════════════');
    
    const session = getSessionData();
    if (session) {
        console.log('📱 Текущая сессия:');
        console.log(`   ✓ Создана: ${new Date(session.createdAt).toLocaleString()}`);
        if (session.expiresAt == null) {
            console.log(`   ✓ Бессрочная`);
        } else {
            console.log(`   ✓ Истекает: ${new Date(session.expiresAt).toLocaleString()}`);
            const remaining = session.expiresAt - Date.now();
            const hours = Math.floor(remaining / 3600000);
            console.log(`   ✓ Осталось: ${hours} часов`);
        }
    } else {
        console.log('📱 Активная сессия: нет');
    }
    
    console.log('');
    console.log('🔍 Отпечаток устройства:');
    console.log(`   ${deviceFingerprint || 'не сгенерирован'}`);
    
    console.log('');
    console.log('⚠️ Неудачные попытки:');
    const failed = getFailedAttempts();
    console.log(`   Текущий счётчик: ${failed}/${MAX_FAILED_ATTEMPTS}`);
    
    const lockoutCount = getLockoutCount();
    console.log(`   Всего блокировок: ${lockoutCount}`);
    
    if (isLockedOut()) {
        const remaining = getRemainingLockoutTime();
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        console.log(`   🔒 ЗАБЛОКИРОВАНО: ${minutes}:${seconds.toString().padStart(2, '0')}`);
    } else {
        console.log(`   ✓ Не заблокировано`);
    }
    
    console.log('');
    console.log('📊 История попыток входа:');
    const history = getAttemptHistory();
    if (history.length > 0) {
        const last10 = history.slice(-10);
        last10.forEach((attempt, i) => {
            const time = new Date(attempt.timestamp).toLocaleTimeString();
            const status = attempt.success ? '✓' : '✗';
            const fp = attempt.fingerprint.substring(0, 8);
            console.log(`   ${status} ${time} - устройство ${fp}...`);
        });
        
        const successCount = history.filter(a => a.success).length;
        const failCount = history.filter(a => !a.success).length;
        console.log('');
        console.log(`   Успешных: ${successCount} | Неудачных: ${failCount}`);
    } else {
        console.log('   История пуста');
    }
    
    console.log('');
    const suspicious = detectSuspiciousActivity();
    if (suspicious) {
        console.log('🚨 ПОДОЗРИТЕЛЬНАЯ АКТИВНОСТЬ ОБНАРУЖЕНА!');
    } else {
        console.log('✅ Подозрительной активности не обнаружено');
    }
    
    console.log('═══════════════════════════════════════');
    console.log('💡 Для сброса: window.resetSecurityData()');
};

// Функция для полного сброса данных безопасности (защищена паролем)
window.resetSecurityData = function() {
    const secret = prompt('Введите секретный код для сброса:');
    
    // Простая проверка (можно улучшить)
    if (secret !== 'reset_matcenter_' + new Date().getFullYear()) {
        console.error('❌ Неверный секретный код');
        return;
    }
    
    if (!confirm('Это удалит ВСЕ данные безопасности! Продолжить?')) {
        return;
    }
    
    safeRemove('matcenter_failed_attempts');
    safeRemove('matcenter_lockout_until');
    safeRemove('matcenter_lockout_count');
    safeRemove('matcenter_last_lockout_at');
    safeRemove('matcenter_attempt_history');
    clearSession();
    
    console.log('✅ Все данные безопасности сброшены');
    console.log('🔄 Перезагрузка страницы...');
    location.reload();
};

// Подсказка в консоли
console.log('💡 Для просмотра статистики безопасности используйте: showSecurityStats()');
console.log('   Для сброса данных безопасности используйте: resetSecurityData()');

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('=================================');
    console.log('🚀 МатЦентр инициализация');
    console.log('=================================');
    
    // Инициализируем UI компоненты сразу (неблокирующие операции)
    initGradeNavigation();
    initMatCenterNavigation();
    initMatCenterSearch();
    initHintModal();
    initStatusFilter();
    initStatsClick();
    initRefreshButtons();
    initPersonalSolvedTasks();
    initSolvedTasksShare();
    initEscapeKey();
    initHintSwipe();
    restoreCurrentFilter();
    
    // Загружаем или генерируем отпечаток
    const cachedFP = safeGet('matcenter_fp');
    if (cachedFP) {
      deviceFingerprint = cachedFP;
      console.log('🔑 Загружен cached fingerprint');
    }
    
    // Запускаем генерацию отпечатка параллельно (не блокирует загрузку)
    // Только если кеша нет
    const fingerprintPromise = !cachedFP ? generateFingerprint().then(fp => {
        deviceFingerprint = fp;
        console.log(`✅ Отпечаток: ${fp.substring(0, 16)}...`);
    }) : Promise.resolve();
    
    await initializeMatcenterAccess(fingerprintPromise);
    
    // Инициализируем авторизацию (проверка сессии будет внутри)
    initAuth();
    
    // Автообновление каждые 5 минут (только если авторизован)
    // Очищаем старый таймер если существует
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
    }

    autoRefreshTimer = setInterval(() => {
        if (!authToken) return;
        // Не дёргаем сервер, пока админ редактирует подсказку
        const hintOverlay = document.getElementById('hintOverlay');
        if (hintOverlay && !hintOverlay.classList.contains('hidden')) {
            console.log('⏸ Автообновление отложено: открыта модалка подсказки');
            return;
        }
        // silent: не показываем большую плашку загрузки
        loadTasksFromGoogleSheets(false, true).catch(err => {
            console.error('Ошибка автообновления:', err);
        });
    }, 5 * 60 * 1000);
});

// Восстановление сохранённой секции (вызывается после init UI, до загрузки задач)
function restoreCurrentFilter() {
    try {
        const saved = safeGet(FILTER_STORAGE_KEY);
        if (saved && (TASK_VIEW_IDS.includes(saved) || saved.indexOf('topic-') === 0)) {
            currentFilter = saved;
        }
    } catch (e) { /* ignore */ }

    // Если сохранённый topic не подходит к текущему грейду — сбрасываем
    if (!isAllowedFilter(currentFilter)) {
        currentFilter = 'all-tasks';
    }

    const viewId = currentFilter.indexOf('topic-') === 0 ? 'all-tasks' : currentFilter;
    showTaskView(viewId);
    syncFilterUI();
    updateAllTasksTitleForFilter();
}

// Один обработчик на все кнопки .refresh-button (делегирование)
function initRefreshButtons() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.refresh-button[data-refresh]');
        if (!btn) return;
        if (btn.disabled) return;

        // Все refresh-кнопки крутим одновременно — единое визуальное состояние
        const allButtons = document.querySelectorAll('.refresh-button[data-refresh]');
        allButtons.forEach(b => { b.disabled = true; b.classList.add('spinning'); });

        // silent: показываем только вращающуюся кнопку, без большой плашки загрузки
        loadTasksFromGoogleSheets(false, true)
            .catch(err => {
                console.error('Ошибка обновления данных:', err);
                window.AlmanionToast?.show('Не удалось обновить данные. Проверьте соединение.', { type: 'error' });
            })
            .finally(() => {
                allButtons.forEach(b => { b.disabled = false; b.classList.remove('spinning'); });
            });
    });
}

// ============================================
// CRYPTOGRAPHY & FINGERPRINTING
// ============================================

// SHA-256 хеширование
