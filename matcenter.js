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
const GRADE_STORAGE_KEY = 'matcenter_grade';
const FILTER_STORAGE_KEY = 'matcenter_filter';
const DEFAULT_GRADE = 'grade-9';
const DEFAULT_FILTER = 'all-tasks';

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
let lockoutTimer = null;
let autoRefreshTimer = null; // Таймер автообновления
let deviceFingerprint = null;
let isAdmin = false;
// Подсказки теперь хранятся в Google Sheet (столбец Hint)

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
        if (session.expiresAt === Infinity) {
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
    const secret = prompt('⚠️ Введите секретный код для сброса:');
    
    // Простая проверка (можно улучшить)
    if (secret !== 'reset_matcenter_' + new Date().getFullYear()) {
        console.error('❌ Неверный секретный код');
        return;
    }
    
    if (!confirm('⚠️ Это удалит ВСЕ данные безопасности! Продолжить?')) {
        return;
    }
    
    localStorage.removeItem('matcenter_failed_attempts');
    localStorage.removeItem('matcenter_lockout_until');
    localStorage.removeItem('matcenter_lockout_count');
    localStorage.removeItem('matcenter_attempt_history');
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
    initEscapeKey();
    initHintSwipe();
    restoreCurrentFilter();
    
    // Загружаем или генерируем отпечаток
    const cachedFP = localStorage.getItem('matcenter_fp');
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
    
    // Проверяем, есть ли сохранённый пароль
    const savedPassword = localStorage.getItem('matcenter_auth');
    console.log('🔑 Сохранённый пароль:', savedPassword ? 'найден ✅' : 'не найден ❌');
    
    if (savedPassword) {
        authToken = savedPassword;
        
        // Сразу скрываем форму и показываем меню
        hideAuthForm();
        
        try {
            // Пробуем загрузить данные с сохранённым паролем
            console.log('🔄 Попытка загрузки с сохранённым паролем...');
            const result = await loadTasksFromGoogleSheets();
            // isAdmin будет установлен внутри loadTasksFromGoogleSheets()
            console.log(isAdmin ? '✅ Загрузка успешна! (АДМИН)' : '✅ Загрузка успешна! Пользователь авторизован.');
            
            // Перерисовываем задачи сразу
            if (allTasks.length > 0) {
                refreshCurrentView();
            }
            
            // Создаём сессию сразу (важно для сохранения между перезагрузками)
            try {
                await fingerprintPromise; // Ждём отпечаток
                const passwordHash = await hashPassword(savedPassword);
                createSession(passwordHash);
                console.log('✅ Сессия создана');
            } catch (err) {
                console.warn('⚠️ Ошибка создания сессии:', err);
            }
            
        } catch (error) {
            // Если ошибка (например, пароль изменился) - показываем форму входа обратно
            console.warn('⚠️ Сохранённый пароль недействителен:', error.message);
            authToken = null;
            isAdmin = false;
            localStorage.removeItem('matcenter_auth');
            showAuthForm();
        }
    } else {
        console.log('📋 Показываем форму авторизации...');
        showAuthForm();
    }
    
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
        const saved = localStorage.getItem(FILTER_STORAGE_KEY);
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
                alert('Не удалось обновить данные. Проверьте соединение.');
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
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Добавляем функцию для получения или создания отпечатка
function getOrCreateFingerprint() {
    // 1. Пытаемся взять из localStorage, если уже создан
    let fp = localStorage.getItem('matcenter_fp');
    if (fp) return Promise.resolve(fp);

    // 2. Если нет – генерируем и сохраняем
    return generateFingerprintAlgo().then(generated => {
        try {
            localStorage.setItem('matcenter_fp', generated);
        } catch (e) {
            console.warn('Не удалось сохранить отпечаток:', e);
        }
        return generated;
    });
}

// Старый generateFingerprint переименовываем во внутренний алгоритм
async function generateFingerprintAlgo() {
    const components = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset(),
        navigator.platform
    ];
    const fingerprintString = components.join('|') + FINGERPRINT_SALT;
    return await hashPassword(fingerprintString);
}

// Новый generateFingerprint делает кеширование
async function generateFingerprint() {
    return await getOrCreateFingerprint();
}

// Простое XOR шифрование для localStorage (достаточно для базовой обфускации)
function encryptData(data, key) {
    const dataStr = JSON.stringify(data);
    let result = '';
    for (let i = 0; i < dataStr.length; i++) {
        result += String.fromCharCode(dataStr.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(result);
}

function decryptData(encrypted, key) {
    try {
        const decoded = atob(encrypted);
        let result = '';
        for (let i = 0; i < decoded.length; i++) {
            result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return JSON.parse(result);
    } catch (e) {
        return null;
    }
}

// Генерация случайного session token
function generateSessionToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// ============================================
// SECURITY & LOCKOUT
// ============================================

function getFailedAttempts() {
    return parseInt(localStorage.getItem('matcenter_failed_attempts') || '0');
}

function setFailedAttempts(count) {
    localStorage.setItem('matcenter_failed_attempts', count.toString());
}

function getLockoutUntil() {
    return parseInt(localStorage.getItem('matcenter_lockout_until') || '0');
}

function setLockoutUntil(timestamp) {
    localStorage.setItem('matcenter_lockout_until', timestamp.toString());
}

function getLockoutCount() {
    return parseInt(localStorage.getItem('matcenter_lockout_count') || '0');
}

function incrementLockoutCount() {
    const count = getLockoutCount() + 1;
    localStorage.setItem('matcenter_lockout_count', count.toString());
    return count;
}

function resetLockoutCount() {
    localStorage.setItem('matcenter_lockout_count', '0');
}

function getLockoutDuration() {
    const count = getLockoutCount();
    const index = Math.min(count, LOCKOUT_DURATIONS.length - 1);
    return LOCKOUT_DURATIONS[index];
}

function getAttemptHistory() {
    const encrypted = localStorage.getItem('matcenter_attempt_history');
    if (!encrypted) return [];
    return decryptData(encrypted, deviceFingerprint || 'fallback') || [];
}

function addAttemptToHistory(success, fingerprint) {
    const history = getAttemptHistory();
    history.push({
        timestamp: Date.now(),
        success: success,
        fingerprint: fingerprint
    });
    
    // Храним только последние 50 попыток
    if (history.length > 50) {
        history.shift();
    }
    
    const encrypted = encryptData(history, deviceFingerprint || 'fallback');
    localStorage.setItem('matcenter_attempt_history', encrypted);
}

function detectSuspiciousActivity() {
    const history = getAttemptHistory();
    if (history.length < 5) return false;
    
    const recentAttempts = history.slice(-10);
    const uniqueFingerprints = new Set(recentAttempts.map(a => a.fingerprint));
    const failedAttempts = recentAttempts.filter(a => !a.success).length;
    
    // Подозрительно, если:
    // 1. Много разных устройств пытаются войти
    // 2. Очень много неудачных попыток
    if (uniqueFingerprints.size > 3 || failedAttempts > 7) {
        console.warn('🚨 ПОДОЗРИТЕЛЬНАЯ АКТИВНОСТЬ ОБНАРУЖЕНА!');
        console.warn(`   - Уникальных устройств: ${uniqueFingerprints.size}`);
        console.warn(`   - Неудачных попыток: ${failedAttempts}`);
        return true;
    }
    
    return false;
}

// Управление сессиями
function getSessionData() {
    const encrypted = localStorage.getItem('matcenter_session');
    if (!encrypted) return null;
    
    // Используем fallback для расшифровки, если отпечаток еще не готов
    const fingerprint = deviceFingerprint || 'fallback';
    const session = decryptData(encrypted, fingerprint);
    if (!session) return null;
    
    // Проверяем срок действия (если сессия не бессрочная)
    if (session.expiresAt !== Infinity && session.expiresAt < Date.now()) {
        console.warn('⏰ Сессия истекла');
        clearSession();
        return null;
    }
    
    // Проверяем отпечаток устройства (только если он уже сгенерирован)
    if (deviceFingerprint && session.fingerprint !== deviceFingerprint) {
        console.warn('🚨 Несоответствие отпечатка устройства! Возможная кража токена.');
        clearSession();
        return null;
    }
    
    return session;
}

function createSession(passwordHash) {
    const session = {
        token: generateSessionToken(),
        passwordHash: passwordHash,
        fingerprint: deviceFingerprint,
        createdAt: Date.now(),
        expiresAt: SESSION_DURATION === Infinity ? Infinity : Date.now() + SESSION_DURATION
    };
    
    const encrypted = encryptData(session, deviceFingerprint || 'fallback');
    localStorage.setItem('matcenter_session', encrypted);
    
    console.log('✅ Новая сессия создана');
    if (session.expiresAt === Infinity) {
        console.log('   - Бессрочная (до явного выхода)');
    } else {
        console.log(`   - Истекает: ${new Date(session.expiresAt).toLocaleString()}`);
    }
    
    return session;
}

function clearSession() {
    localStorage.removeItem('matcenter_session');
    // НЕ удаляем matcenter_auth - пароль должен сохраняться для автовхода
    console.log('🗑️ Сессия очищена');
}

function isLockedOut() {
    const lockoutUntil = getLockoutUntil();
    if (lockoutUntil > Date.now()) {
        return true;
    }
    // Если время блокировки истекло, сбрасываем
    if (lockoutUntil > 0) {
        setLockoutUntil(0);
        setFailedAttempts(0);
    }
    return false;
}

function getRemainingLockoutTime() {
    const lockoutUntil = getLockoutUntil();
    const remaining = lockoutUntil - Date.now();
    return remaining > 0 ? remaining : 0;
}

function startLockout() {
    const lockoutCount = incrementLockoutCount();
    const duration = getLockoutDuration();
    const lockoutUntil = Date.now() + duration;
    setLockoutUntil(lockoutUntil);
    
    const minutes = Math.floor(duration / 60000);
    const hours = Math.floor(minutes / 60);
    
    let timeStr;
    if (hours > 0) {
        timeStr = `${hours} ${hours === 1 ? 'час' : hours < 5 ? 'часа' : 'часов'}`;
    } else {
        timeStr = `${minutes} ${minutes === 1 ? 'минуту' : minutes < 5 ? 'минуты' : 'минут'}`;
    }
    
    console.warn(`🔒 Блокировка #${lockoutCount} активирована на ${timeStr}`);
    
    if (lockoutCount > 2) {
        console.warn('⚠️ ВНИМАНИЕ: Повторные блокировки увеличивают время блокировки!');
    }
}

function resetFailedAttempts() {
    setFailedAttempts(0);
    setLockoutUntil(0);
    
    // Сбрасываем lockout count только если прошло достаточно времени
    const lastLockout = getLockoutUntil();
    const timeSinceLastLockout = Date.now() - lastLockout;
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    
    if (timeSinceLastLockout > ONE_WEEK || getLockoutCount() === 0) {
        resetLockoutCount();
        console.log('✅ Счётчики полностью сброшены (прошло больше недели)');
    } else {
        console.log('✅ Счётчик неудачных попыток сброшен (lockout count сохранён)');
    }
}

function updateLockoutUI() {
    const authError = document.getElementById('authError');
    const passwordInput = document.getElementById('passwordInput');
    const authSubmit = document.getElementById('authSubmit');
    const submitText = authSubmit?.querySelector('.submit-text');
    const submitSpinner = authSubmit?.querySelector('.submit-spinner');
    
    if (isLockedOut()) {
        const remaining = getRemainingLockoutTime();
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        
        if (authError) {
            authError.style.display = 'flex';
            authError.querySelector('.error-icon').textContent = '⏱️';
            authError.querySelector('.error-text').textContent = 
                `Слишком много попыток. Повторите через ${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        if (passwordInput) passwordInput.disabled = true;
        if (authSubmit) {
            authSubmit.disabled = true;
            if (submitText) submitText.textContent = 'Заблокировано';
        }
        
        return true;
    } else {
        if (passwordInput) passwordInput.disabled = false;
        if (authSubmit) {
            authSubmit.disabled = false;
            if (submitText) submitText.textContent = 'Войти';
        }
        return false;
    }
}

// ============================================
// АВТОРИЗАЦИЯ
// ============================================

async function initAuth() {
    const authForm = document.getElementById('authForm');
    const passwordInput = document.getElementById('passwordInput');
    const authError = document.getElementById('authError');
    const authSubmit = document.getElementById('authSubmit');
    const submitText = authSubmit.querySelector('.submit-text');
    const submitSpinner = authSubmit.querySelector('.submit-spinner');
    const authModal = document.getElementById('authModal');
    const logoutButton = document.getElementById('logoutButton');

    // Сразу вешаем обработчик выхода, чтобы он работал в любом случае
    if (logoutButton && !logoutButton.dataset.listenerAttached) {
        logoutButton.addEventListener('click', () => {
            if (confirm('Вы уверены, что хотите выйти?')) {
                logout();
            }
        });
        logoutButton.dataset.listenerAttached = 'true';
    }

    // 🔒 Проверяем, есть ли уже отпечаток (если был сгенерирован ранее)
    if (!deviceFingerprint) {
        console.log('🔍 Генерация отпечатка устройства...');
        deviceFingerprint = await generateFingerprint();
        console.log(`✅ Отпечаток: ${deviceFingerprint.substring(0, 16)}...`);
    }
    
    // 🔍 Проверяем подозрительную активность (неблокирующая проверка)
    if (detectSuspiciousActivity()) {
        console.warn('⚠️ Обнаружена подозрительная активность! Рекомендуется усиленная защита.');
    }
    
    // 🔐 Проверяем существующую сессию (только если не было автозагрузки)
    if (authToken) {
        return; // Уже загружено в DOMContentLoaded
    }
    
    const existingSession = getSessionData();
    if (existingSession) {
        console.log('✅ Найдена действительная сессия');
        authToken = localStorage.getItem('matcenter_auth');
        if (authToken) {
            try {
                const result = await loadTasksFromGoogleSheets();
                // isAdmin будет установлен внутри loadTasksFromGoogleSheets()
                hideAuthForm();
                
                // Перерисовываем задачи чтобы отобразить подсказки
                if (allTasks.length > 0) {
                    refreshCurrentView();
                }
                
                console.log(isAdmin ? '✅ Автоматический вход выполнен через сессию (АДМИН)' : '✅ Автоматический вход выполнен через сессию');
                return;
            } catch (error) {
                console.warn('⚠️ Сессия недействительна, требуется повторный вход');
                clearSession();
            }
        }
    }
    
    // Проверка блокировки при загрузке
    if (isLockedOut()) {
        updateLockoutUI();
        // Запускаем таймер обновления
        lockoutTimer = setInterval(() => {
            if (!updateLockoutUI()) {
                // Блокировка снята
                clearInterval(lockoutTimer);
                lockoutTimer = null;
            }
        }, 1000);
    }
    
    // Форма входа
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Проверяем блокировку
        if (isLockedOut()) {
            updateLockoutUI();
            return;
        }
        
        const password = passwordInput.value;
        
        // Скрываем ошибку
        authError.style.display = 'none';
        
        // Показываем спиннер
        submitText.style.display = 'none';
        submitSpinner.style.display = 'flex';
        authSubmit.disabled = true;
        passwordInput.disabled = true;
        
        // Хешируем пароль
        const passwordHash = await hashPassword(password);
        
        // Пробуем загрузить данные с этим паролем
        try {
            authToken = password;
            const response = await loadTasksFromGoogleSheets(true);
            
            // Если успешно:
            // 1. Создаём сессию
            createSession(passwordHash);
            
            // isAdmin уже установлен внутри loadTasksFromGoogleSheets()
            
            // 2. Сохраняем пароль (для API)
            localStorage.setItem('matcenter_auth', password);
            
            // 3. Логируем успешную попытку
            addAttemptToHistory(true, deviceFingerprint);
            console.log(isAdmin ? '✅ Успешный вход (АДМИН)' : '✅ Успешный вход');
            
            // 5. Сбрасываем счётчики
            resetFailedAttempts();
            
            // 6. Скрываем форму
            hideAuthForm();
            
            // 7. Перерисовываем задачи чтобы отобразить подсказки
            if (allTasks.length > 0) {
                refreshCurrentView();
            }
            
        } catch (error) {
            // Если ошибка:
            authToken = null;
            
            // 1. Логируем неудачную попытку
            addAttemptToHistory(false, deviceFingerprint);
            
            // 2. Увеличиваем счётчик
            const failedAttempts = getFailedAttempts() + 1;
            setFailedAttempts(failedAttempts);
            
            console.warn(`⚠️ Неудачная попытка входа: ${failedAttempts}/${MAX_FAILED_ATTEMPTS}`);
            
            // 3. Анимация тряски
            authModal.classList.add('shake');
            setTimeout(() => {
                authModal.classList.remove('shake');
            }, 400);
            
            // 4. Проверяем подозрительную активность
            if (detectSuspiciousActivity()) {
                authError.querySelector('.error-icon').textContent = '🚨';
                authError.querySelector('.error-text').textContent = 
                    'Обнаружена подозрительная активность!';
                authError.style.display = 'flex';
                authError.style.background = 'rgba(239, 68, 68, 0.2)';
            }
            
            // 5. Проверяем, нужно ли блокировать
            if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
                startLockout();
                updateLockoutUI();
                
                // Запускаем таймер обновления
                if (lockoutTimer) clearInterval(lockoutTimer);
                lockoutTimer = setInterval(() => {
                    if (!updateLockoutUI()) {
                        clearInterval(lockoutTimer);
                        lockoutTimer = null;
                    }
                }, 1000);
            } else {
                // Показываем обычную ошибку
                authError.style.display = 'flex';
                authError.style.background = 'rgba(239, 68, 68, 0.1)';
                authError.querySelector('.error-icon').textContent = '🚫';
                authError.querySelector('.error-text').textContent = 
                    `Неверный пароль. Осталось попыток: ${MAX_FAILED_ATTEMPTS - failedAttempts}`;
                
                // Возвращаем кнопку в исходное состояние
                submitText.style.display = 'inline';
                submitSpinner.style.display = 'none';
                authSubmit.disabled = false;
                passwordInput.disabled = false;
            }
            
            // Очищаем и фокусируем поле
            passwordInput.value = '';
            if (!isLockedOut()) {
                passwordInput.focus();
            }
        }
    });
    
    // Обработчик кнопки выхода уже добавлен выше (строка 566-573)
    // Не дублируем обработчик здесь
}

function showAuthForm() {
    console.log('📋 showAuthForm() вызвана');
    
    const authOverlay = document.getElementById('authOverlay');
    const logoutSection = document.getElementById('logoutSection');
    const passwordInput = document.getElementById('passwordInput');
    const authError = document.getElementById('authError');
    const authSubmit = document.getElementById('authSubmit');
    const submitText = authSubmit?.querySelector('.submit-text');
    const submitSpinner = authSubmit?.querySelector('.submit-spinner');
    
    if (authOverlay) {
        authOverlay.classList.remove('hidden');
        console.log('✅ Форма авторизации показана');
    }
    
    // Очищаем поле пароля
    if (passwordInput) {
        passwordInput.value = '';
    }
    
    // Возвращаем кнопку в нормальное состояние
    if (submitText && submitSpinner && authSubmit) {
        submitText.style.display = 'inline';
        submitSpinner.style.display = 'none';
    }
    
    // Проверяем блокировку
    if (isLockedOut()) {
        console.warn('⚠️ Форма заблокирована из-за предыдущих неудачных попыток');
        updateLockoutUI();
        
        // Запускаем таймер обновления
        if (lockoutTimer) clearInterval(lockoutTimer);
        lockoutTimer = setInterval(() => {
            if (!updateLockoutUI()) {
                clearInterval(lockoutTimer);
                lockoutTimer = null;
                // После снятия блокировки фокусируем поле
                if (passwordInput) passwordInput.focus();
            }
        }, 1000);
    } else {
        // Скрываем ошибку
        if (authError) {
            authError.style.display = 'none';
        }
        
        if (passwordInput) {
            passwordInput.disabled = false;
            setTimeout(() => {
                passwordInput.focus();
            }, 200);
        }
        
        if (authSubmit) {
            authSubmit.disabled = false;
        }
    }
    
    if (logoutSection) {
        logoutSection.style.display = 'none';
        console.log('✅ Кнопка "Выйти" скрыта');
    }
}

function hideAuthForm() {
    console.log('📋 hideAuthForm() вызвана');
    
    const authOverlay = document.getElementById('authOverlay');
    const logoutSection = document.getElementById('logoutSection');
    
    // Останавливаем таймер блокировки
    if (lockoutTimer) {
        clearInterval(lockoutTimer);
        lockoutTimer = null;
    }
    
    if (authOverlay) {
        authOverlay.classList.add('hidden');
        console.log('✅ Форма авторизации скрыта');
    }
    
    if (logoutSection) {
        logoutSection.style.display = 'block';
        console.log('✅ Кнопка "Выйти" показана');
    }
}

function logout() {
    authToken = null;
    isAdmin = false;
    
    // Очищаем таймеры
    if (lockoutTimer) {
        clearInterval(lockoutTimer);
        lockoutTimer = null;
    }
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }
    
    // Очищаем сессию и пароль
    clearSession();
    localStorage.removeItem('matcenter_auth'); // Удаляем сохранённый пароль
    
    // Очищаем данные
    allTasks = [];
    document.getElementById('tasksContainer').innerHTML = '';
    document.getElementById('currentSeriesContainer').innerHTML = '';
    document.getElementById('postponedContainer').innerHTML = '';
    document.getElementById('unsolvedContainer').innerHTML = '';
    
    // Сбрасываем статистику
    document.getElementById('totalTasks').textContent = '0';
    document.getElementById('unsolvedTasks').textContent = '0';
    document.getElementById('currentSeries').textContent = '0';
    document.getElementById('postponedTasks').textContent = '0';
    
    console.log('👋 Выход выполнен');
    
    showAuthForm();
}

// ============================================
// DATA FETCHING
// ============================================

async function loadTasksFromGoogleSheets(fromAuthAttempt = false, silent = false) {
    const loadingMessage = document.getElementById('loadingMessage');
    const retryBtn = document.getElementById('retryButton');

    const showRetryUI = (msg) => {
        if (!loadingMessage) return;
        loadingMessage.style.display = 'block';
        loadingMessage.innerHTML = `<p class="loading-error">${msg}</p><button id="retryButton" class="retry-button">🔄 Попробовать снова</button>`;
        document.getElementById('retryButton')?.addEventListener('click', () => loadTasksFromGoogleSheets(false));
    };

    // В silent-режиме (refresh-кнопка, автообновление) не показываем большую плашку
    if (!silent && loadingMessage) {
        loadingMessage.style.display = 'block';
        loadingMessage.innerHTML = `<div class="spinner"></div><p>Загрузка задач...</p>`;
        if (retryBtn) retryBtn.style.display = 'none';
    }
    
    console.log('=================================');
    console.log('🚀 Начало загрузки данных');
    console.log('Endpoint:', API_ENDPOINT ? 'настроен ✅' : 'не настроен ❌');
    console.log('=================================');
    
    try {
        let tasks = [];
        let adminFlag = false;
        
        // Загружаем данные с проверкой пароля
        console.log('📍 Метод загрузки: Авторизованный доступ');
        console.log('Endpoint:', API_ENDPOINT.substring(0, 30) + '...');
        const result = await loadFromAppsScript();
        tasks = result.tasks;
        adminFlag = result.isAdmin;
        
        console.log('=================================');
        console.log('📊 РЕЗУЛЬТАТ ЗАГРУЗКИ:');
        console.log('Задач загружено:', tasks.length);
        console.log('Статусы:', {
            'Р (разобрано)': tasks.filter(t => t.status === 'Р').length,
            'Н (текущая серия)': tasks.filter(t => t.status === 'Н').length,
            'П (отложены с подсказкой)': tasks.filter(t => t.status === 'П').length,
            'От (отложены)': tasks.filter(t => t.status === 'От').length
        });
        console.log('=================================');
        
        if (tasks.length === 0) {
            throw new Error('Не удалось загрузить задачи - пустой массив');
        }
        
        allTasks = normalizeAllTasks(tasks);
        isAdmin = adminFlag;
        
        // Детальная статистика по загруженным задачам
        console.log('=================================');
        console.log('📋 ДЕТАЛЬНЫЙ СПИСОК ЗАДАЧ:');
        const tasksByStatus = {
            'Р': tasks.filter(t => t.status === 'Р'),
            'Н': tasks.filter(t => t.status === 'Н'),
            'П': tasks.filter(t => t.status === 'П'),
            'От': tasks.filter(t => t.status === 'От'),
            'Другие': tasks.filter(t => !['Р', 'Н', 'П', 'От'].includes(t.status))
        };
        
        for (const [status, statusTasks] of Object.entries(tasksByStatus)) {
            if (statusTasks.length > 0) {
                console.log(`${status}: ${statusTasks.length} задач`);
                console.log('  Примеры:', statusTasks.slice(0, 3).map(t => `#${t.number} (${t.status})`).join(', '));
            }
        }
        console.log('=================================');
        
        updateStatistics(getTasksForCurrentGrade());
        refreshCurrentView();
        
        // Сохраняем в кэш для офлайн-режима
        try {
            localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify({ tasks, timestamp: Date.now() }));
        } catch (e) { /* ignore */ }
        
        // Скрываем сообщение о загрузке и очищаем его содержимое
        if (!silent && loadingMessage) {
            loadingMessage.style.display = 'none';
            loadingMessage.innerHTML = ''; // Очищаем содержимое
        }

        console.log('✅ УСПЕХ! Данные отображены на странице');

    } catch (error) {
        console.error('=================================');
        console.error('❌ ОШИБКА ЗАГРУЗКИ:');
        console.error('Тип:', error.name);
        console.error('Сообщение:', error.message);
        console.error('Стек:', error.stack);
        console.error('=================================');

        if (fromAuthAttempt) {
            if (loadingMessage) loadingMessage.style.display = 'none';
            throw error;
        }

        // В silent-режиме не показываем плашку с ошибкой — пробрасываем наверх,
        // вызывающий покажет alert; данные на странице остаются прежними
        if (silent) {
            throw error;
        }

        // Пробуем загрузить из кэша
        try {
            const raw = localStorage.getItem(TASKS_CACHE_KEY);
            if (raw) {
                const { tasks } = JSON.parse(raw);
                if (Array.isArray(tasks) && tasks.length > 0) {
                    allTasks = normalizeAllTasks(tasks);
                    updateStatistics(getTasksForCurrentGrade());
                    refreshCurrentView();
                }
            }
        } catch (e) { /* ignore */ }

        showRetryUI(error.message || 'Ошибка загрузки');
    }
}

// ============================================
// DATA LOADING
// ============================================

async function loadFromOneEndpoint(endpoint, endpointIdx) {
    const clientId = deviceFingerprint ? deviceFingerprint.substring(0, 16) : 'unknown';
    const url = `${endpoint}?password=${encodeURIComponent(authToken)}&clientId=${encodeURIComponent(clientId)}`;

    let response;
    try {
        response = await fetch(url);
    } catch (error) {
        throw new Error('Сеть: ' + (error && error.message || error));
    }

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error('Невалидный JSON: ' + text.substring(0, 100));
    }

    if (!data.success) {
        throw new Error(data.error || 'Ошибка сервера');
    }

    if (!Array.isArray(data.tasks)) {
        throw new Error('tasks не массив');
    }

    const tasks = data.tasks.map((task, index) => {
        if (!task || typeof task !== 'object') return null;
        if (task.number === undefined || task.number === null || task.number === '') return null;

        const cleanNumber = extractNumber(task.number);
        if (cleanNumber === null || isNaN(cleanNumber)) return null;

        const gradeRaw = task.grade ? String(task.grade).trim() : '';
        const grade = gradeRaw && GRADE_SECTIONS.some(g => g.id === gradeRaw)
            ? gradeRaw
            : DEFAULT_GRADE;

        const statusRaw = task.status == null ? '' : String(task.status).trim();

        return {
            number: cleanNumber,
            numberText: String(task.number),
            status: statusRaw,
            description: task.description ? String(task.description) : 'Условие не указано',
            hint: task.hint ? String(task.hint) : '',
            grade,
            _endpointIdx: endpointIdx
        };
    }).filter(t => t !== null);

    return {
        tasks: tasks,
        isAdmin: !!data.isAdmin
    };
}

async function loadFromAppsScript() {
    console.log('🔵 Загрузка с', TASKS_ENDPOINTS.length, 'таблиц(ы)...');

    if (TASKS_ENDPOINTS.length === 0) {
        throw new Error('Не настроены endpoints в matcenter.js');
    }

    const results = await Promise.allSettled(
        TASKS_ENDPOINTS.map((url, idx) => loadFromOneEndpoint(url, idx))
    );

    const allTasks = [];
    let isAdmin = false;
    let successCount = 0;
    let lastError = null;

    results.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
            successCount++;
            allTasks.push(...r.value.tasks);
            if (r.value.isAdmin) isAdmin = true;
            console.log(`✅ Endpoint #${idx}: ${r.value.tasks.length} задач${r.value.isAdmin ? ' (АДМИН)' : ''}`);
        } else {
            lastError = r.reason;
            console.warn(`⚠️ Endpoint #${idx} не отвечает:`, r.reason && r.reason.message || r.reason);
        }
    });

    // Если ни одна таблица не ответила — это полный отказ.
    if (successCount === 0) {
        throw lastError instanceof Error
            ? lastError
            : new Error('Не удалось загрузить ни одну из таблиц');
    }

    console.log('🎉 Всего задач со всех таблиц:', allTasks.length);

    return {
        tasks: allTasks,
        isAdmin: isAdmin
    };
}

// Извлечение номера из текста типа "98 (ЛЗ 36)" или "8.5 Алгебра".
// Поддерживает дробные числа — нужно для псевдо-задач разделов (0.5, 8.5, …).
function extractNumber(text) {
    const str = String(text == null ? '' : text).trim();
    const match = str.match(/^(\d+(?:[.,]\d+)?)/);
    if (!match) return null;
    return parseFloat(match[1].replace(',', '.'));
}

// ============================================
// ОТОБРАЖЕНИЕ ЗАДАЧ
// ============================================

function displayTasks(tasks, containerId = 'tasksContainer') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`⚠️ Контейнер ${containerId} не найден!`);
        return;
    }
    
    if (!tasks || !Array.isArray(tasks)) {
        console.warn(`⚠️ Некорректный массив задач`);
        return;
    }
    
    if (tasks.length === 0) {
        if (getTasksForCurrentGrade().length === 0) {
            showEmptyGradeMessage(container);
        } else {
            container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Задачи не найдены</p>';
        }
        return;
    }
    
    console.log(`📦 Отображение ${tasks.length} задач в контейнере ${containerId}`);
    
    // Статистика по статусам отображаемых задач
    const statusCounts = {};
    tasks.forEach(t => {
        statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
    });
    console.log('Статусы отображаемых задач:', statusCounts);
    
    // Летние серии выдаются целиком, удобнее по возрастанию (1, 2, 3, …).
    // Обычные классы — по убыванию (свежие задачи сверху).
    const ascending = typeof currentGrade === 'string' && currentGrade.indexOf('summer') !== -1;
    const sortedTasks = [...tasks].sort((a, b) => ascending ? a.number - b.number : b.number - a.number);
    
    container.innerHTML = '';
    
    let addedCount = 0;
    sortedTasks.forEach((task, index) => {
        try {
            const taskElement = createTaskElement(task);
            container.appendChild(taskElement);
            addedCount++;
        } catch (error) {
            console.error(`❌ Ошибка при создании элемента для задачи #${task.number} (индекс ${index}):`, error);
        }
    });
    
    console.log(`✅ Добавлено в DOM: ${addedCount} из ${sortedTasks.length} задач`);
    
    // Проверим реальное количество элементов в контейнере
    const actualCount = container.querySelectorAll('.task-card').length;
    console.log(`🔍 Реальное количество .task-card в DOM: ${actualCount}`);
}

function createTaskElement(task) {
    // Валидация данных задачи
    if (!task || task.number === undefined || task.number === null || isNaN(task.number)) {
        console.warn('⚠️ Пропускаем задачу без номера:', task);
        const emptyCard = document.createElement('div');
        emptyCard.style.display = 'none';
        return emptyCard;
    }

    // Псевдо-задача (раздел или вводный текст) — дробный номер вида 0.5, 8.5 и т.д.
    if (!Number.isInteger(task.number)) {
        const banner = document.createElement('div');
        banner.className = 'task-section-banner';
        const inner = document.createElement('div');
        inner.className = 'task-section-banner-inner';
        inner.textContent = task.description || '';
        banner.appendChild(inner);
        // KaTeX-рендер формул, если есть
        if (typeof renderLatexInElement === 'function') {
            setTimeout(() => renderLatexInElement(banner), 0);
        }
        return banner;
    }

    const taskCard = document.createElement('div');
    taskCard.className = 'task-card';

    // В летних сериях статусов нет вообще — не подкрашиваем карточки и не показываем бейдж.
    const isSummerTask = isSummerGrade(task.grade);

    // Определяем класс по статусу (только для не-летних)
    let statusClass = '';
    if (!isSummerTask) {
        if (task.status === 'От') {
            statusClass = 'postponed'; // Отложены: "От" (красный)
        } else if (task.status === 'П') {
            statusClass = 'with-hint'; // С подсказкой: "П" (фиолетовый)
        } else if (task.status === 'Н') {
            statusClass = 'current-series'; // Текущая серия: "Н" (оранжевый)
        } else if (task.status === 'Р') {
            statusClass = 'solved'; // Разобрано: "Р" (зелёный)
        }
    }

    if (statusClass) {
        taskCard.classList.add(statusClass);
    }
    
    // Безопасное получение numberText
    const numberText = task.numberText || String(task.number);
    
    // Отображаем номер с пометкой если есть (с защитой от XSS!)
    const safeNumberText = escapeHtml(numberText.replace(/^\d+\s*/, ''));
    const displayNumber = numberText !== String(task.number)
        ? `${escapeHtml(String(task.number))} <span class="task-note">${safeNumberText}</span>`
        : escapeHtml(String(task.number));
    
    // Безопасное получение description
    const description = task.description || 'Условие не указано';
    
    // Проверяем наличие подсказки
    const hint = task.hint || null;
    const hasHint = hint !== null;
    
    // Формируем HTML подсказки
    let hintHTML = '';
    if (hasHint) {
        // Обрезаем начальные и конечные пробелы/переносы, но сохраняем внутренние переносы
        const trimmedHint = hint.trim();
        hintHTML = `
            <button class="task-toggle hint-toggle">
                <span class="toggle-icon">💡</span>
                Показать подсказку
            </button>
            <div class="task-hint" data-hint-id="hint-${escapeHtml(String(task.number))}">${escapeHtml(trimmedHint)}</div>
        `;
    }
    
    // Формируем HTML кнопки для админа
    let adminButtonHTML = '';
    if (isAdmin) {
        adminButtonHTML = `
            <button class="admin-hint-button" title="${hasHint ? 'Изменить подсказку' : 'Добавить подсказку'}">
                💡 Подсказка
            </button>
        `;
    }
    
    // Бейдж статуса: в летних сериях статусы не используются — вообще ничего не показываем.
    // В обычных классах: показываем статус, а для админа дополнительно даём поставить.
    let statusBadgeHTML = '';
    if (!isSummerTask) {
        if (task.status) {
            statusBadgeHTML = isAdmin
                ? `<div class="task-status-badge clickable" data-task-number="${escapeHtml(String(task.number))}">${getStatusText(task.status)}</div>`
                : `<div class="task-status-badge">${getStatusText(task.status)}</div>`;
        } else if (isAdmin) {
            statusBadgeHTML = `<div class="task-status-badge clickable empty" data-task-number="${escapeHtml(String(task.number))}">+ статус</div>`;
        }
    }
    
    taskCard.innerHTML = `
        <div class="task-header">
            <div class="task-number">Задача ${displayNumber}</div>
            ${statusBadgeHTML}
        </div>
        <button class="task-toggle task-condition-toggle">
            <span class="toggle-icon">▼</span>
            Показать условие
        </button>
        <div class="task-description">
            <div class="task-description-inner">${escapeHtml(description)}</div>
        </div>
        ${hintHTML}
        ${adminButtonHTML}
    `;
    
    // Обработчик раскрытия/скрытия условия
    const toggleBtn = taskCard.querySelector('.task-condition-toggle');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const isOpen = taskCard.classList.toggle('open');
            toggleBtn.innerHTML = isOpen
                ? '<span class="toggle-icon">▲</span> Скрыть условие'
                : '<span class="toggle-icon">▼</span> Показать условие';

            // Рендерим LaTeX-формулы при первом раскрытии условия
            if (isOpen) {
                const descEl = taskCard.querySelector('.task-description');
                if (descEl && !descEl.dataset.latexRendered && typeof renderLatexInElement === 'function') {
                    renderLatexInElement(descEl);
                    descEl.dataset.latexRendered = 'true';
                }
            }
        });
    }
    
    // Обработчик раскрытия/скрытия подсказки
    const hintToggleBtn = taskCard.querySelector('.hint-toggle');
    if (hintToggleBtn) {
        hintToggleBtn.addEventListener('click', () => {
            const isOpen = taskCard.classList.toggle('hint-open');
            hintToggleBtn.innerHTML = isOpen
                ? '<span class="toggle-icon">💡</span> Скрыть подсказку'
                : '<span class="toggle-icon">💡</span> Показать подсказку';
            if(isOpen){hintToggleBtn.classList.add('active');}else{hintToggleBtn.classList.remove('active');}
            
            // Рендерим LaTeX формулы при первом открытии
            if (isOpen) {
                const hintElement = taskCard.querySelector('.task-hint');
                if (hintElement && !hintElement.dataset.latexRendered) {
                    renderLatexInElement(hintElement);
                    hintElement.dataset.latexRendered = 'true';
                }
            }
        });
    }
    
    // Обработчик кнопки админа для добавления/изменения подсказки
    const adminButton = taskCard.querySelector('.admin-hint-button');
    if (adminButton) {
        adminButton.addEventListener('click', (e) => {
            e.stopPropagation();
            showHintModal(task.number, hint || '');
        });
    }
    
    // Обработчик клика на статус для админов
    if (isAdmin) {
        const statusBadge = taskCard.querySelector('.task-status-badge.clickable');
        if (statusBadge) {
            statusBadge.addEventListener('click', (e) => {
                e.stopPropagation();
                showStatusDropdown(statusBadge, task);
            });
        }
    }
    
    return taskCard;
}

function getStatusText(status) {
    const statusMap = {
        'Р': 'Разобрано',
        'П': 'Подсказка',
        'Н': 'Серия',
        'От': 'Отложена'
    };
    return statusMap[status] || status;
}

// Показать выпадающий список выбора статуса
function showStatusDropdown(badgeElement, task) {
    // Удаляем существующий dropdown, если есть
    const existingDropdown = document.querySelector('.status-dropdown');
    if (existingDropdown) {
        existingDropdown.remove();
    }
    
    // Создаём dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'status-dropdown';
    
    const statuses = [
        { code: 'Р', text: 'Разобрано' },
        { code: 'П', text: 'Подсказка' },
        { code: 'От', text: 'Отложена' }
    ];
    
    statuses.forEach(status => {
        const option = document.createElement('div');
        option.className = 'status-option';
        if (status.code === task.status) {
            option.classList.add('current');
        }
        option.textContent = status.text;
        option.dataset.statusCode = status.code;
        
        option.addEventListener('click', async (e) => {
            e.stopPropagation();
            
            // Показываем загрузку
            option.innerHTML = '<span class="spinner-small"></span> Сохранение...';
            option.style.pointerEvents = 'none';
            
            try {
                // Убеждаемся, что номер задачи передается как строка
                const taskNumberStr = String(task.number || '');
                console.log(`🔄 Изменение статуса: task.number="${task.number}", taskNumberStr="${taskNumberStr}"`);
                await changeTaskStatus(taskNumberStr, status.code);
                
                // Успех - обновляем UI
                dropdown.remove();
                
                // Обновляем статус в массиве задач
                const taskIndex = allTasks.findIndex(t => t.number === task.number);
                if (taskIndex !== -1) {
                    allTasks[taskIndex].status = status.code;
                }
                
                updateStatistics(getTasksForCurrentGrade());
                refreshCurrentView();
                
            } catch (error) {
                option.innerHTML = status.text;
                option.style.pointerEvents = 'auto';
                alert('Ошибка изменения статуса: ' + error.message);
            }
        });
        
        dropdown.appendChild(option);
    });
    
    // Позиционируем dropdown под бейджем, не выходя за экран
    document.body.appendChild(dropdown);
    const rect = badgeElement.getBoundingClientRect();
    const ddRect = dropdown.getBoundingClientRect();
    const pad = 10;
    const ddWidth = ddRect.width || 160;
    if (rect.right + ddWidth > window.innerWidth - pad) {
        dropdown.style.left = 'auto';
        dropdown.style.right = `${window.innerWidth - rect.right}px`;
    } else {
        const left = Math.max(pad, rect.left);
        dropdown.style.left = `${left}px`;
        dropdown.style.right = 'auto';
    }
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${rect.bottom + 5}px`;
    
    // Закрытие dropdown при клике вне его
    setTimeout(() => {
        const closeDropdown = (e) => {
            if (!dropdown.contains(e.target) && e.target !== badgeElement) {
                dropdown.remove();
                document.removeEventListener('click', closeDropdown);
            }
        };
        document.addEventListener('click', closeDropdown);
    }, 0);
}

// Найти endpoint, к которому принадлежит задача (для админских операций).
// Если задача не нашлась — используем первый endpoint как запасной.
function getEndpointForTask(taskNumber) {
    const numKey = extractNumber(taskNumber);
    const task = allTasks.find(t => t.number === numKey || String(t.numberText) === String(taskNumber));
    if (task && typeof task._endpointIdx === 'number' && TASKS_ENDPOINTS[task._endpointIdx]) {
        return TASKS_ENDPOINTS[task._endpointIdx];
    }
    return TASKS_ENDPOINTS[0];
}

// Изменить статус задачи на сервере
async function changeTaskStatus(taskNumber, newStatus) {
    console.log(`🔄 Изменение статуса задачи №${taskNumber} на "${newStatus}"...`);

    const endpoint = getEndpointForTask(taskNumber);
    const url = `${endpoint}?password=${encodeURIComponent(authToken)}&action=changeStatus&taskNumber=${encodeURIComponent(taskNumber)}&newStatus=${encodeURIComponent(newStatus)}`;
    
    try {
        const response = await fetch(url);
        const responseText = await response.text();
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('❌ Ошибка парсинга ответа сервера:', parseError);
            throw new Error('Сервер вернул некорректный JSON: ' + responseText);
        }
        
        if (!data.success) {
            console.error('❌ Сервер вернул ошибку:', data.error);
            throw new Error(data.error || 'Ошибка при изменении статуса');
        }
        
        console.log('✅ Статус успешно изменён на сервере');
        return data;
        
    } catch (error) {
        console.error('❌ Не удалось изменить статус на сервере:', error);
        throw error;
    }
}

// Экранирование HTML для безопасности
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// СТАТИСТИКА
// ============================================

function getGradeTitle(gradeId) {
    const section = GRADE_SECTIONS.find(g => g.id === gradeId);
    return section ? section.title : gradeId;
}

function normalizeAllTasks(tasks) {
    if (!Array.isArray(tasks)) return [];
    return tasks.map(task => ({
        ...task,
        grade: task.grade && GRADE_SECTIONS.some(g => g.id === task.grade)
            ? task.grade
            : DEFAULT_GRADE
    }));
}

function getTasksForCurrentGrade() {
    return allTasks.filter(t => t.grade === currentGrade);
}

// Является ли грейд летней серией (там нет статусов, разделы — по темам).
function isSummerGrade(grade) {
    return typeof grade === 'string' && grade.indexOf('summer') !== -1;
}

// Разделы летней серии 9-10 по номерам реальных задач.
// Если структура серии изменится — править здесь.
const SUMMER_SECTIONS = {
    'grade-summer-9-10': [
        { id: 'topic-mayskie',  title: 'Майские сборы',           minNum: 1,  maxNum: 8 },
        { id: 'topic-combin',   title: 'Комбинаторика',            minNum: 9,  maxNum: 13 },
        { id: 'topic-algebra',  title: 'Алгебра',                  minNum: 14, maxNum: 17 },
        { id: 'topic-numbers',  title: 'Теория чисел',             minNum: 18, maxNum: 19 },
        { id: 'topic-analysis', title: 'Математический анализ',    minNum: 20, maxNum: 22 },
        { id: 'topic-analytic', title: 'Аналитическая теория чисел', minNum: 23, maxNum: 25 },
        { id: 'topic-mersenne', title: 'Простота чисел Мерсенна',  minNum: 26, maxNum: 40 },
        { id: 'topic-geometry', title: 'Геометрия',                minNum: 41, maxNum: 59 },
    ]
};

function getSummerSectionsFor(grade) {
    return SUMMER_SECTIONS[grade] || [];
}

function getSummerSectionById(grade, id) {
    return getSummerSectionsFor(grade).find(s => s.id === id) || null;
}

function syncGradeNavUI() {
    document.querySelectorAll('.grade-link, .grade-card').forEach(el => {
        el.classList.toggle('active', el.dataset.grade === currentGrade);
    });

    const title = getGradeTitle(currentGrade);
    const navTitle = document.getElementById('gradeNavTitle');
    if (navTitle) navTitle.textContent = title;

    // Помечаем body — у летних серий другие UI-правила (нет статусов, темы вместо фильтров)
    document.body.classList.toggle('is-summer-grade', isSummerGrade(currentGrade));

    // Заголовок секции #all-tasks учитывает текущую тему (для летних серий)
    updateAllTasksTitleForFilter();
}

// Заголовок секции #all-tasks — для летних серий показываем имя темы, иначе «… — все задачи».
function updateAllTasksTitleForFilter() {
    const el = document.getElementById('allTasksTitle');
    if (!el) return;
    const gradeTitle = getGradeTitle(currentGrade);
    if (typeof currentFilter === 'string' && currentFilter.indexOf('topic-') === 0) {
        const section = getSummerSectionById(currentGrade, currentFilter);
        if (section) {
            el.textContent = `${gradeTitle} — ${section.title}`;
            return;
        }
    }
    el.textContent = `${gradeTitle} — все задачи`;
}

// Перестраивает список пунктов навигации в сайдбаре под текущий грейд.
// Для летних серий — «Все задачи» + темы (Майские сборы, Алгебра, …).
// Для обычных классов — стандартные «Все задачи / Текущая серия / Откладыши / Неразобранные».
function rebuildNavMenu(grade) {
    const navTitleEl = document.getElementById('gradeNavTitle');
    if (!navTitleEl) return;
    const navSection = navTitleEl.closest('.nav-section');
    if (!navSection) return;
    const listEl = navSection.querySelector('ul');
    if (!listEl) return;

    const items = [{ id: 'all-tasks', title: 'Все задачи' }];
    if (isSummerGrade(grade)) {
        getSummerSectionsFor(grade).forEach(s => {
            items.push({ id: s.id, title: s.title });
        });
    } else {
        items.push({ id: 'current-series', title: 'Текущая серия' });
        items.push({ id: 'postponed',      title: 'Откладыши' });
        items.push({ id: 'unsolved',       title: 'Неразобранные' });
    }

    listEl.innerHTML = items.map(item => {
        const isActive = item.id === currentFilter ? ' active' : '';
        return `<li><a href="#${item.id}" class="nav-link${isActive}">${escapeHtml(item.title)}</a></li>`;
    }).join('');
}

// Правильное склонение русских числительных: 1 задача, 2 задачи, 5 задач
function pluralizeTasks(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'задача';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'задачи';
    return 'задач';
}

// Обновление счётчиков задач на карточках классов
function updateGradeCounts() {
    GRADE_SECTIONS.forEach(g => {
        // Псевдо-задачи (дробные номера) в счётчик не идут.
        const count = allTasks.filter(t => t.grade === g.id && Number.isInteger(t.number)).length;
        const countEl = document.querySelector(`[data-count-grade="${g.id}"]`);
        if (countEl) countEl.textContent = count;
        // Меняем подпись «задача/задачи/задач» под числом
        const card = document.querySelector(`.grade-card[data-grade="${g.id}"]`);
        const subEl = card ? card.querySelector('.grade-card-sub') : null;
        if (subEl) subEl.textContent = pluralizeTasks(count);
    });
}

// Синхронизация active-классов на nav-link и стат-картах
function syncFilterUI() {
    document.querySelectorAll('.nav-link').forEach(l => {
        const href = l.getAttribute('href') || '';
        l.classList.toggle('active', href === `#${currentFilter}`);
    });
    document.querySelectorAll('.stat-card.clickable[data-filter]').forEach(c => {
        c.classList.toggle('active', c.dataset.filter === currentFilter);
    });
    // В летних сериях select-фильтр работает как переключатель тем —
    // обновляем выбранное значение, чтобы оно соответствовало активной секции.
    if (isSummerGrade(currentGrade)) {
        const wantValue = currentFilter.indexOf('topic-') === 0 ? currentFilter : '';
        ['statusFilter', 'mobileStatusFilter'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (Array.from(el.options).some(o => o.value === wantValue)) {
                el.value = wantValue;
            }
            el.classList.toggle('has-filter', el.value !== '');
        });
    }
}

function setCurrentGrade(gradeId) {
    if (!GRADE_SECTIONS.some(g => g.id === gradeId)) return;

    currentGrade = gradeId;
    try {
        localStorage.setItem(GRADE_STORAGE_KEY, gradeId);
    } catch (e) { /* ignore */ }

    // Перестраиваем sidebar nav под новый грейд (его список пунктов меняется)
    rebuildNavMenu(currentGrade);
    rebuildStatusFilters(currentGrade);

    // Если текущий фильтр недоступен в новом грейде — сбрасываем на «Все задачи»
    if (!isAllowedFilter(currentFilter)) {
        currentFilter = 'all-tasks';
        try { localStorage.setItem(FILTER_STORAGE_KEY, currentFilter); } catch (e) { /* ignore */ }
        showTaskView('all-tasks');
    } else if (currentFilter.indexOf('topic-') === 0) {
        showTaskView('all-tasks');
    }

    syncGradeNavUI();
    syncFilterUI();
    updateStatistics(getTasksForCurrentGrade());
    refreshCurrentView();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function initGradeNavigation() {
    try {
        const saved = localStorage.getItem(GRADE_STORAGE_KEY);
        if (saved && GRADE_SECTIONS.some(g => g.id === saved)) {
            currentGrade = saved;
        }
    } catch (e) { /* ignore */ }

    rebuildNavMenu(currentGrade);
    syncGradeNavUI();

    document.querySelectorAll('.grade-link, .grade-card').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const gradeId = link.dataset.grade;
            if (gradeId) setCurrentGrade(gradeId);
            if (typeof closeMobileMenu === 'function') closeMobileMenu();
        });
    });
}

function hideAllTaskViews() {
    TASK_VIEW_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function showTaskView(viewId) {
    hideAllTaskViews();
    const el = document.getElementById(viewId);
    if (el) el.style.display = 'block';
}

function refreshCurrentView() {
    const searchInput = document.getElementById('searchInput');
    const statusFilterEl = document.getElementById('statusFilter');
    const hasSearch = searchInput && normalizeSearchText(searchInput.value);
    const hasStatusFilter = statusFilterEl && statusFilterEl.value;

    if (hasSearch || hasStatusFilter) {
        runSearch();
    } else {
        filterAndDisplayTasks(currentFilter);
    }
}

function showEmptyGradeMessage(container) {
    const title = escapeHtml(getGradeTitle(currentGrade));
    container.innerHTML = `
        <div class="empty-grade-message">
            <span class="empty-grade-icon">📂</span>
            <p>В разделе «${title}» пока нет задач</p>
        </div>
    `;
}

function updateStatistics(tasks) {
    // Псевдо-задачи (заголовки разделов / вводные тексты) — дробные номера,
    // их в статистике не учитываем.
    const realTasks = tasks.filter(t => Number.isInteger(t.number));
    const total = realTasks.length;
    const current = realTasks.filter(t => t.status === 'Н').length; // Текущая серия: "Н"
    const postponed = realTasks.filter(t => t.status === 'От' || t.status === 'П').length; // Откладыши: "От" + "П"
    const unsolved = current + postponed;

    document.getElementById('totalTasks').textContent = total;
    document.getElementById('unsolvedTasks').textContent = unsolved;
    document.getElementById('currentSeries').textContent = current;
    document.getElementById('postponedTasks').textContent = postponed;

    // Обновляем заголовки секций с указанием класса для согласованности
    const gradeTitle = getGradeTitle(currentGrade);
    updateSectionTitle('currentSeriesTitle', `${gradeTitle} — текущая серия (${current})`);
    updateSectionTitle('postponedTitle', `${gradeTitle} — откладыши (${postponed})`);
    updateSectionTitle('unsolvedTitle', `${gradeTitle} — неразобранные (${unsolved})`);

    // Обновляем счётчики на карточках разделов (по всем классам)
    updateGradeCounts();
}

function updateSectionTitle(elementId, title) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = title;
}

// ============================================
// UI HELPERS
// ============================================

function initStatsClick() {
    document.querySelectorAll('.stat-card.clickable[data-filter]').forEach(card => {
        card.addEventListener('click', () => {
            const filterId = card.dataset.filter;
            if (filterId) setCurrentFilter(filterId, { scrollTop: true });
        });
    });
}

function initEscapeKey() {
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const hintOverlay = document.getElementById('hintOverlay');
        if (hintOverlay && !hintOverlay.classList.contains('hidden')) {
            hideHintModal();
        }
    });
}

function initHintSwipe() {
    const overlay  = document.getElementById('hintOverlay');
    const modal    = document.getElementById('hintModal');
    const dragZone = document.getElementById('hintDragHandle');
    const header   = modal ? modal.querySelector('.hint-modal-header') : null;
    if (!overlay || !modal || overlay.dataset.hintSwipeInit) return;
    overlay.dataset.hintSwipeInit = 'true';

    let startY = 0, currentY = 0, tracking = false;

    function onTouchStart(e) {
        if (window.innerWidth > 768) return;
        startY  = e.touches[0].clientY;
        currentY = startY;
        tracking = true;
        modal.style.transition = 'none';
    }

    // Слушаем только drag-handle и шапку — они не скроллятся,
    // поэтому passive:true не мешает preventDefault в touchmove
    if (dragZone) dragZone.addEventListener('touchstart', onTouchStart, { passive: true });
    if (header)   header.addEventListener('touchstart',   onTouchStart, { passive: true });

    // Движение — на document, чтобы палец мог уходить за границу шапки
    document.addEventListener('touchmove', (e) => {
        if (!tracking) return;
        currentY = e.touches[0].clientY;
        const dy = currentY - startY;
        if (dy > 0) {
            e.preventDefault();
            modal.style.transform = `translateY(${dy}px)`;
        } else {
            modal.style.transform = '';
        }
    }, { passive: false });

    document.addEventListener('touchend', () => {
        if (!tracking) return;
        tracking = false;
        const dy = currentY - startY;
        if (dy > 80) {
            // Анимируем вниз, затем закрываем
            modal.style.transition = 'transform 0.22s ease-out';
            modal.style.transform  = `translateY(110%)`;
            setTimeout(() => {
                hideHintModal();
                modal.style.transform  = '';
                modal.style.transition = '';
            }, 220);
        } else {
            // Возврат на место
            modal.style.transition = 'transform 0.25s ease-out';
            modal.style.transform  = '';
            setTimeout(() => { modal.style.transition = ''; }, 250);
        }
    });
}

// ============================================
// НАВИГАЦИЯ
// ============================================

function initMatCenterNavigation() {
    // nav-link могут пересоздаваться при смене грейда — делегируем клик
    document.addEventListener('click', (e) => {
        const link = e.target.closest('.nav-link');
        if (!link) return;
        if (!link.closest('.nav-menu')) return; // только из sidebar-меню
        e.preventDefault();
        const targetId = (link.getAttribute('href') || '').substring(1);
        if (targetId) setCurrentFilter(targetId, { scrollTop: true });
        if (typeof closeMobileMenu === 'function') closeMobileMenu();
    });
}

// Разрешённые фильтры для текущего грейда.
function isAllowedFilter(filterId) {
    if (TASK_VIEW_IDS.includes(filterId)) return true;
    if (filterId.indexOf('topic-') === 0) {
        return !!getSummerSectionById(currentGrade, filterId);
    }
    return false;
}

// Единая точка смены активной секции: применяет поиск/фильтр и обновляет UI
function setCurrentFilter(filterId, opts = {}) {
    if (!isAllowedFilter(filterId)) return;

    currentFilter = filterId;
    try { localStorage.setItem(FILTER_STORAGE_KEY, filterId); } catch (e) { /* ignore */ }

    // Темы летних серий рендерятся внутри секции #all-tasks
    const viewId = filterId.indexOf('topic-') === 0 ? 'all-tasks' : filterId;
    showTaskView(viewId);
    syncFilterUI();
    updateAllTasksTitleForFilter();
    refreshCurrentView(); // сам выберет runSearch() или filterAndDisplayTasks()

    if (opts.scrollTop) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Псевдо-задачи (баннеры разделов) показываем только если рядом есть видимые реальные задачи.
function filterTasksByTopic(tasks, topicSection) {
    return tasks.filter(t => {
        if (Number.isInteger(t.number)) {
            return t.number >= topicSection.minNum && t.number <= topicSection.maxNum;
        }
        // Псевдо-задача (баннер): включаем, если её номер «попадает» внутрь диапазона темы
        // (например, 13.5 — баннер «Алгебра» — попадает в [14;17] как 13.5 < 14, поэтому
        //  её НЕ берём; внутренние переходные тексты вроде 26.5/28.5 — берём, если они внутри [26;40]).
        return t.number > topicSection.minNum && t.number < topicSection.maxNum;
    });
}

function filterAndDisplayTasks(filterId) {
    currentFilter = filterId;
    const gradeTasks = getTasksForCurrentGrade();
    let filteredTasks = [];
    let containerId = 'tasksContainer';

    if (filterId.indexOf('topic-') === 0) {
        const section = getSummerSectionById(currentGrade, filterId);
        filteredTasks = section ? filterTasksByTopic(gradeTasks, section) : gradeTasks;
        containerId = 'tasksContainer';
    } else {
        switch (filterId) {
            case 'all-tasks':
                filteredTasks = gradeTasks;
                containerId = 'tasksContainer';
                break;
            case 'current-series':
                filteredTasks = gradeTasks.filter(t => t.status === 'Н');
                containerId = 'currentSeriesContainer';
                break;
            case 'postponed':
                filteredTasks = gradeTasks.filter(t => t.status === 'От' || t.status === 'П');
                containerId = 'postponedContainer';
                break;
            case 'unsolved':
                filteredTasks = gradeTasks.filter(t => t.status === 'Н' || t.status === 'От' || t.status === 'П');
                containerId = 'unsolvedContainer';
                break;
            default:
                filteredTasks = gradeTasks;
                containerId = 'tasksContainer';
        }
    }

    displayTasks(filteredTasks, containerId);
}

// Получить задачи для текущего фильтра
function getTasksForCurrentFilter() {
    const gradeTasks = getTasksForCurrentGrade();

    if (currentFilter.indexOf('topic-') === 0) {
        const section = getSummerSectionById(currentGrade, currentFilter);
        return section ? filterTasksByTopic(gradeTasks, section) : gradeTasks;
    }

    switch (currentFilter) {
        case 'all-tasks':
            return gradeTasks;
        case 'current-series':
            return gradeTasks.filter(t => t.status === 'Н');
        case 'postponed':
            return gradeTasks.filter(t => t.status === 'От' || t.status === 'П');
        case 'unsolved':
            return gradeTasks.filter(t => t.status === 'Н' || t.status === 'От' || t.status === 'П');
        default:
            return gradeTasks;
    }
}

// ============================================
// ПОИСК
// ============================================

// Перестраивает опции select-фильтров под текущий грейд:
// — летние серии → выбор темы (Все темы / Майские сборы / Алгебра / …);
// — обычные классы → выбор статуса (Все / Серия / Подсказка / Отложена / Разобрано).
function rebuildStatusFilters(grade) {
    const desktop = document.getElementById('statusFilter');
    const mobile  = document.getElementById('mobileStatusFilter');
    const summer  = isSummerGrade(grade);

    const opts = summer
        ? [
            { value: '', label: 'Все темы' },
            ...getSummerSectionsFor(grade).map(s => ({ value: s.id, label: s.title }))
        ]
        : [
            { value: '',   label: 'Все' },
            { value: 'Н',  label: 'Серия' },
            { value: 'П',  label: 'Подсказка' },
            { value: 'От', label: 'Отложена' },
            { value: 'Р',  label: 'Разобрано' }
        ];

    [desktop, mobile].forEach(sel => {
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = opts.map(o =>
            `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`
        ).join('');
        const hasPrev = opts.some(o => o.value === prev);
        sel.value = hasPrev ? prev : '';
        sel.classList.toggle('has-filter', sel.value !== '');
    });
}

function initStatusFilter() {
    const statusFilterEl = document.getElementById('statusFilter');
    const mobileStatusFilter = document.getElementById('mobileStatusFilter');

    function syncFilterClass(el) {
        if (!el) return;
        el.classList.toggle('has-filter', el.value !== '');
    }

    function handleChange(value, mirror) {
        if (mirror) {
            mirror.value = value;
            syncFilterClass(mirror);
        }
        if (isSummerGrade(currentGrade)) {
            // В летних сериях select — это переключатель тем
            setCurrentFilter(value || 'all-tasks');
        } else {
            // В обычных классах — фильтр по статусу
            searchStatusFilter = value || 'all';
            runSearch();
        }
    }

    if (statusFilterEl) {
        statusFilterEl.addEventListener('change', () => {
            syncFilterClass(statusFilterEl);
            handleChange(statusFilterEl.value, mobileStatusFilter);
        });
    }

    if (mobileStatusFilter) {
        mobileStatusFilter.addEventListener('change', () => {
            syncFilterClass(mobileStatusFilter);
            handleChange(mobileStatusFilter.value, statusFilterEl);
        });
    }

    // Изначальная сборка опций под стартовый грейд
    rebuildStatusFilters(currentGrade);

    // Начальная синхронизация значения (если что-то сохранилось)
    const initialValue = (statusFilterEl && statusFilterEl.value)
        || (mobileStatusFilter && mobileStatusFilter.value)
        || '';
    if (statusFilterEl) statusFilterEl.value = initialValue;
    if (mobileStatusFilter) mobileStatusFilter.value = initialValue;
    syncFilterClass(statusFilterEl);
    syncFilterClass(mobileStatusFilter);
    if (!isSummerGrade(currentGrade)) {
        searchStatusFilter = initialValue || 'all';
    }
}

function getContainerIdForFilter() {
    const map = { 'all-tasks': 'tasksContainer', 'current-series': 'currentSeriesContainer', 'postponed': 'postponedContainer', 'unsolved': 'unsolvedContainer' };
    return map[currentFilter] || 'tasksContainer';
}

function normalizeSearchText(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s+/g, ' ')
        .trim();
}

function splitSearchQuery(query) {
    const normalized = normalizeSearchText(query);
    if (!normalized) return [];

    const tokens = [];
    const regex = /"([^"]+)"|(\S+)/g;
    let match;

    while ((match = regex.exec(normalized)) !== null) {
        const token = normalizeSearchText(match[1] || match[2]);
        if (token) tokens.push(token);
    }

    return tokens;
}

function taskMatchesSearch(task, queryTokens, fullQuery) {
    const haystack = normalizeSearchText([
        task.number,
        task.numberText,
        task.description,
        task.hint
    ].join(' '));

    // Быстрый путь: вся фраза есть целиком.
    if (fullQuery && haystack.includes(fullQuery)) return true;

    // Иначе каждая часть запроса должна присутствовать.
    return queryTokens.every(token => haystack.includes(token));
}

// ============================================
// РУССКИЙ СТЕММЕР
// ============================================

// Упрощённый стеммер: отрезает типичные русские окончания.
// Возвращает приближённый корень слова (≥ 3 букв).
function roughStemRu(word) {
    if (word.length <= 3) return word;
    const w = word.toLowerCase();

    // От длинных к коротким — важен порядок
    const suffixes = [
        'ениями','аниями','ениях','аниях','ениям','аниям',
        'ностью','ностей','ностям','ностях','ностями',
        'ений','аний','ением','анием','ениях','аниях',
        'ения','ание','ению','анию',
        'ости','ость','ести','есть',
        'ться','ться',
        'ами','ями','ими','ыми',
        'ого','его','ому','ему',
        'ах','ях','ам','ям',
        'ым','им','ых','их',
        'ов','ев',
        'ой','ей','ую','юю',
        'ья','ью','ьи',
        'ся','сь','ть','ти',
        'ый','ий','ые','ие',
        'ая','яя','ое','ее',
        'а','я','у','ю','е','о','и','ы',
    ];

    for (const s of suffixes) {
        if (w.endsWith(s) && w.length - s.length >= 3) {
            return w.slice(0, w.length - s.length);
        }
    }
    return w;
}

// Проверяет, совпадает ли слово запроса с любым словом в тексте
// (точно или через стеммер)
function matchWordRu(qWord, numStr, desc) {
    // Прямое совпадение
    if (numStr.includes(qWord) || desc.includes(qWord)) return true;

    // Стемминг только для слов 4+ символов (не цифр)
    if (qWord.length < 4 || /^\d+$/.test(qWord)) return false;

    const qStem = roughStemRu(qWord);
    if (qStem.length < 3) return false;

    // Разбиваем описание на слова и сравниваем стеммы
    const descWords = desc.split(/[\s,;:.!?()\[\]«»\-–—\/]+/);
    return descWords.some(dWord => {
        if (dWord.length < 3) return false;
        // Описательное слово начинается с корня запроса
        if (dWord.startsWith(qStem)) return true;
        // Совпадение по стеммам
        const dStem = roughStemRu(dWord);
        return dStem === qStem;
    });
}

function runSearch() {
    const searchInput = document.getElementById('searchInput');
    const statusFilterEl = document.getElementById('statusFilter');
    const searchTerm = searchInput ? searchInput.value : '';
    const normalizedTerm = normalizeSearchText(searchTerm);
    const activeStatus = statusFilterEl ? statusFilterEl.value : '';

    let currentTasks = getTasksForCurrentFilter();

    if (activeStatus) {
        currentTasks = currentTasks.filter(t => t.status === activeStatus);
    }

    if (normalizedTerm) {
        const queryTokens = splitSearchQuery(normalizedTerm);
        currentTasks = currentTasks.filter(task => {
            return taskMatchesSearch(task, queryTokens, normalizedTerm);
        });
    }

    const containerId = getContainerIdForFilter();

    if (currentTasks.length === 0 && (normalizedTerm || activeStatus)) {
        showNoResultsMessage(containerId, normalizedTerm, activeStatus);
    } else {
        displayTasks(currentTasks, containerId);
    }
}

function showNoResultsMessage(containerId, searchTerm, statusFilter) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const statusLabels = { 'Р': 'Разобрано', 'Н': 'Серия', 'От': 'Отложена', 'П': 'Подсказка' };
    const statusLabel = statusFilter ? (statusLabels[statusFilter] || statusFilter) : '';

    let hint = '';
    if (searchTerm && statusLabel) {
        hint = `По запросу «${escapeHtml(searchTerm)}» в категории «${escapeHtml(statusLabel)}»`;
    } else if (searchTerm) {
        hint = `По запросу «${escapeHtml(searchTerm)}»`;
    } else if (statusLabel) {
        hint = `В категории «${escapeHtml(statusLabel)}»`;
    }

    container.innerHTML = `
        <div class="no-results-message">
            <span class="no-results-icon">🔍</span>
            <p>Ничего не найдено</p>
            ${hint ? `<p class="no-results-hint">${hint}</p>` : ''}
            <button class="no-results-clear" onclick="clearSearch()">Сбросить фильтр</button>
        </div>
    `;
}

function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    const statusFilterEl = document.getElementById('statusFilter');
    const mobileSearchInput = document.getElementById('mobileSearchInput');
    const mobileStatusFilter = document.getElementById('mobileStatusFilter');
    const searchClearBtn = document.getElementById('searchClearBtn');
    const mobileSearchClear = document.getElementById('mobileSearchClear');

    if (searchInput) searchInput.value = '';
    if (statusFilterEl) statusFilterEl.value = '';
    if (mobileSearchInput) mobileSearchInput.value = '';
    if (mobileStatusFilter) mobileStatusFilter.value = '';
    if (searchClearBtn) searchClearBtn.classList.remove('visible');
    if (mobileSearchClear) mobileSearchClear.classList.remove('visible');
    if (statusFilterEl) statusFilterEl.classList.remove('has-filter');
    if (mobileStatusFilter) mobileStatusFilter.classList.remove('has-filter');

    searchStatusFilter = 'all';

    displayTasks(getTasksForCurrentFilter(), getContainerIdForFilter());
}

window.clearSearch = clearSearch;

function initMatCenterSearch() {
    const searchInput = document.getElementById('searchInput');
    const mobileSearchInput = document.getElementById('mobileSearchInput');
    const searchClearBtn = document.getElementById('searchClearBtn');
    const mobileSearchClear = document.getElementById('mobileSearchClear');

    let debounceTimer = null;

    function updateClearBtns(value) {
        const hasValue = value.length > 0;
        if (searchClearBtn) searchClearBtn.classList.toggle('visible', hasValue);
        if (mobileSearchClear) mobileSearchClear.classList.toggle('visible', hasValue);
    }

    function handleInput(value, source) {
        if (source === 'sidebar' && mobileSearchInput) mobileSearchInput.value = value;
        if (source === 'mobile' && searchInput) searchInput.value = value;
        updateClearBtns(value);
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runSearch, 150);
    }

    if (searchInput) {
        searchInput.addEventListener('input', () => handleInput(searchInput.value, 'sidebar'));
    }

    if (mobileSearchInput) {
        mobileSearchInput.addEventListener('input', () => handleInput(mobileSearchInput.value, 'mobile'));
    }

    if (searchClearBtn) {
        searchClearBtn.addEventListener('click', clearSearch);
    }

    if (mobileSearchClear) {
        mobileSearchClear.addEventListener('click', clearSearch);
    }

    // Начальная синхронизация: один инпут может иметь восстановленный браузером текст
    const initialValue = (searchInput && searchInput.value)
        || (mobileSearchInput && mobileSearchInput.value)
        || '';
    if (searchInput) searchInput.value = initialValue;
    if (mobileSearchInput) mobileSearchInput.value = initialValue;
    updateClearBtns(initialValue);
}

// ============================================
// СИСТЕМА ПОДСКАЗОК (АДМИН)
// ============================================

// Рендеринг LaTeX формул в элементе
function renderLatexInElement(element, attempts = 0) {
    const maxAttempts = 50; // Максимум 5 секунд ожидания (50 * 100ms)
    
    if (typeof renderMathInElement === 'undefined') {
        if (attempts < maxAttempts) {
            console.warn(`⚠️ KaTeX auto-render ещё не загружен, попытка ${attempts + 1}/${maxAttempts}...`);
            setTimeout(() => renderLatexInElement(element, attempts + 1), 100);
        } else {
            console.error('❌ KaTeX не загрузился за 5 секунд');
        }
        return;
    }
    
    try {
        renderMathInElement(element, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '\\[', right: '\\]', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\(', right: '\\)', display: false}
            ],
            throwOnError: false,
            trust: false
        });
        console.log('✅ LaTeX отрендерен в подсказке');
    } catch (error) {
        console.error('❌ Ошибка рендеринга LaTeX:', error);
    }
}

// Подсказки теперь хранятся в Google Sheet и загружаются вместе с задачами

// Добавление/обновление подсказки
function setTaskHint(taskNumber, hintText) {
    if (!isAdmin) {
        console.error('❌ Только админы могут добавлять подсказки');
        return false;
    }
    
    // Обновляем allTasks локально
    const t = allTasks.find(t => t.number === taskNumber);
    if (t) {
        t.hint = hintText.trim();
        console.log(`✅ Подсказка для задачи №${taskNumber} обновлена локально`);
    } else {
        console.warn(`⚠️ Задача №${taskNumber} не найдена в allTasks`);
    }
    
    return true;
}

// Подсказка берётся напрямую из task.hint

// Сброс состояния кнопок модального окна
function resetHintModalButtons() {
    const saveBtn = document.getElementById('hintSaveBtn');
    const deleteBtn = document.getElementById('hintDeleteBtn');
    
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '💾 Сохранить';
        saveBtn.style.opacity = '1';
    }
    
    if (deleteBtn) {
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = '🗑️ Удалить подсказку';
        deleteBtn.style.opacity = '1';
    }
}

// Показать модальное окно добавления подсказки
function showHintModal(taskNumber, currentHint = '') {
    const modal = document.getElementById('hintModal');
    const overlay = document.getElementById('hintOverlay');
    const textarea = document.getElementById('hintTextarea');
    const taskNumberSpan = document.getElementById('hintTaskNumber');
    
    if (!modal || !overlay || !textarea || !taskNumberSpan) {
        console.error('❌ Элементы модального окна не найдены');
        return;
    }
    
    // Сбрасываем состояние кнопок перед открытием
    resetHintModalButtons();
    
    taskNumberSpan.textContent = taskNumber;
    textarea.value = currentHint;
    overlay.classList.remove('hidden');
    
    setTimeout(() => textarea.focus(), 100);
}

// Скрыть модальное окно подсказки
function hideHintModal() {
    const overlay = document.getElementById('hintOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
    
    // Сбрасываем состояние кнопок после закрытия
    resetHintModalButtons();
}

// Инициализация обработчиков модального окна подсказок
function initHintModal() {
    const saveBtn = document.getElementById('hintSaveBtn');
    const deleteBtn = document.getElementById('hintDeleteBtn');
    const cancelBtn = document.getElementById('hintCancelBtn');
    const closeBtn = document.getElementById('hintCloseBtn');
    const overlay = document.getElementById('hintOverlay');
    
    // Сохранение подсказки
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const taskNumber = parseInt(document.getElementById('hintTaskNumber').textContent);
            const hintText = document.getElementById('hintTextarea').value;
            
            // Блокируем кнопку и показываем загрузку
            const originalText = saveBtn.innerHTML;
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-small"></span> Сохранение...';
            saveBtn.style.opacity = '0.7';
            
            try {
                if (setTaskHint(taskNumber, hintText)) {
                    await pushHintToServer(taskNumber, hintText);
                    
                    // Показываем успех
                    saveBtn.innerHTML = '✓ Сохранено!';
                    saveBtn.style.opacity = '1';
                    
                    // Через 500ms закрываем модалку
                    setTimeout(() => {
                        hideHintModal();
                        refreshCurrentView();
                        console.log(`✅ Подсказка для задачи №${taskNumber} сохранена`);
                    }, 500);
                }
            } catch (error) {
                // В случае ошибки возвращаем кнопку в исходное состояние
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalText;
                saveBtn.style.opacity = '1';
                console.error('Ошибка сохранения:', error);
            }
        });
    }
    
    // Удаление подсказки
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async ()=>{
            const taskNumber = parseInt(document.getElementById('hintTaskNumber').textContent);
            if(confirm(`Удалить подсказку для задачи №${taskNumber}?`)){
                // Блокируем кнопку и показываем загрузку
                const originalText = deleteBtn.innerHTML;
                deleteBtn.disabled = true;
                deleteBtn.innerHTML = '<span class="spinner-small"></span> Удаление...';
                deleteBtn.style.opacity = '0.7';
                
                try {
                    if(setTaskHint(taskNumber,'')){
                        await pushHintToServer(taskNumber,'');
                        
                        // Показываем успех
                        deleteBtn.innerHTML = '✓ Удалено!';
                        deleteBtn.style.opacity = '1';
                        
                        // Через 500ms закрываем модалку
                        setTimeout(() => {
                            hideHintModal();
                            refreshCurrentView();
                        }, 500);
                    }
                } catch (error) {
                    // В случае ошибки возвращаем кнопку в исходное состояние
                    deleteBtn.disabled = false;
                    deleteBtn.innerHTML = originalText;
                    deleteBtn.style.opacity = '1';
                    console.error('Ошибка удаления:', error);
                }
            }
        });
    }
    
    // Отмена
    if (cancelBtn) {
        cancelBtn.addEventListener('click', hideHintModal);
    }
    
    // Закрытие через крестик
    if (closeBtn) {
        closeBtn.addEventListener('click', hideHintModal);
    }
    
    // Закрытие по клику на фон
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                hideHintModal();
            }
        });
    }
}

async function pushHintToServer(taskNumber, hintText) {
    console.log(`🔄 Отправка подсказки для задачи №${taskNumber} на сервер...`);
    console.log(`   Пароль: ${authToken ? 'есть' : 'нет'}, taskNumber: ${taskNumber}, hintText length: ${hintText.length}`);
    
    try {
        // Используем GET вместо POST (обходит CORS)
        const endpoint = getEndpointForTask(taskNumber);
        const url = `${endpoint}?password=${encodeURIComponent(authToken)}&action=setHint&taskNumber=${encodeURIComponent(taskNumber)}&hintText=${encodeURIComponent(hintText)}`;
        const response = await fetch(url);
        
        const responseText = await response.text();
        console.log('📥 Ответ сервера (raw):', responseText);
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('❌ Ошибка парсинга ответа сервера:', parseError);
            throw new Error('Сервер вернул некорректный JSON: ' + responseText);
        }
        
        if (!data.success) {
            console.error('❌ Сервер вернул ошибку:', data.error || 'неизвестная ошибка');
            throw new Error(data.error || 'Ошибка при сохранении подсказки на сервере');
        }
        
        console.log('✅ Подсказка успешно сохранена на сервере');
        return data;
        
    } catch (error) {
        console.error('❌ Не удалось отправить подсказку на сервер:', error);
        alert('Не удалось сохранить подсказку: ' + error.message);
        throw error;
    }
}

console.log('✅ Сайт загружен успешно!');