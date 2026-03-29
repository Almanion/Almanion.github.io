// ============================================
// CONFIGURATION
// ============================================

// Google Apps Script endpoint
const API_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyR_Iz_fyg2s-bviRtkvF1Zz_KMdRCUgpoIVT1CF-lG6UiNkVfvor_nMXILPzk8xslA/exec';

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

let allTasks = [];
let searchStatusFilter = 'all'; // all | current | postponed | unsolved
let currentFilter = 'all';
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
    initMatCenterNavigation();
    initMatCenterSearch();
    initHintModal();
    initStatusFilter();
    initStatsClick();
    initRetryButton();
    initEscapeKey();
    initHintSwipe();
    
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
                displayTasks(allTasks);
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
    
    // Кнопка обновления в заголовке
    const refreshButton = document.getElementById('refreshButton');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            refreshButton.disabled = true;
            refreshButton.classList.add('spinning');

            loadTasksFromGoogleSheets()
                .catch(err => {
                    console.error('Ошибка обновления данных:', err);
                    alert('Не удалось обновить данные. Проверьте соединение.');
                })
                .finally(() => {
                    refreshButton.disabled = false;
                    refreshButton.classList.remove('spinning');
                });
        });
    }
    
    // Автообновление каждые 5 минут (только если авторизован)
    // Очищаем старый таймер если существует
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
    }
    
    autoRefreshTimer = setInterval(() => {
        if (authToken) {
            loadTasksFromGoogleSheets().catch(err => {
                console.error('Ошибка автообновления:', err);
                // При ошибке автообновления не разлогиниваем пользователя
            });
        }
    }, 5 * 60 * 1000);
});

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
                    displayTasks(allTasks);
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
                displayTasks(allTasks);
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
    document.getElementById('solvedTasks').textContent = '0';
    document.getElementById('currentSeries').textContent = '0';
    document.getElementById('postponedTasks').textContent = '0';
    
    console.log('👋 Выход выполнен');
    
    showAuthForm();
}

// ============================================
// DATA FETCHING
// ============================================

async function loadTasksFromGoogleSheets(fromAuthAttempt = false) {
    const loadingMessage = document.getElementById('loadingMessage');
    const retryBtn = document.getElementById('retryButton');
    
    const showRetryUI = (msg) => {
        if (!loadingMessage) return;
        loadingMessage.style.display = 'block';
        loadingMessage.innerHTML = `<p class="loading-error">${msg}</p><button id="retryButton" class="retry-button">🔄 Попробовать снова</button>`;
        document.getElementById('retryButton')?.addEventListener('click', () => loadTasksFromGoogleSheets(false));
    };
    
    if (loadingMessage) {
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
        
        allTasks = tasks;
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
        
        displayTasks(tasks);
        updateStatistics(tasks);
        
        // Сохраняем в кэш для офлайн-режима
        try {
            localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify({ tasks, timestamp: Date.now() }));
        } catch (e) { /* ignore */ }
        
        // Скрываем сообщение о загрузке и очищаем его содержимое
        if (loadingMessage) {
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
        
        // Пробуем загрузить из кэша
        try {
            const raw = localStorage.getItem(TASKS_CACHE_KEY);
            if (raw) {
                const { tasks } = JSON.parse(raw);
                if (Array.isArray(tasks) && tasks.length > 0) {
                    allTasks = tasks;
                    displayTasks(tasks);
                    updateStatistics(tasks);
                }
            }
        } catch (e) { /* ignore */ }
        
        showRetryUI(error.message || 'Ошибка загрузки');
    }
}

// ============================================
// DATA LOADING
// ============================================

async function loadFromAppsScript() {
    console.log('🔵 Загрузка данных с сервера...');
    
    let response;
    let usedMethod = 'POST';
    
    // Используем только GET (обходит CORS preflight)
    console.log('🔄 Используем GET запрос...');
    usedMethod = 'GET';
    
    const clientId = deviceFingerprint ? deviceFingerprint.substring(0, 16) : 'unknown';
    const url = `${API_ENDPOINT}?password=${encodeURIComponent(authToken)}&clientId=${encodeURIComponent(clientId)}`;
    
    try {
        response = await fetch(url);
        console.log('📡 GET ответ получен, статус:', response.status);
    } catch (error) {
        console.error('❌ Ошибка сети при загрузке данных:', error);
        throw new Error('Не удалось подключиться к серверу. Проверьте интернет-соединение.');
    }
    
    console.log(`✅ Использован метод: ${usedMethod}`);
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const text = await response.text();
    console.log('📄 Сырой ответ (первые 500 символов):', text.substring(0, 500));
    
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        console.error('❌ Ошибка парсинга JSON:', e);
        console.log('Полный ответ:', text);
        throw new Error('Не удалось распарсить ответ от сервера');
    }
    
    console.log('📊 Данные распарсены:', data);
    
    if (!data.success) {
        console.error('❌ Сервер вернул ошибку:', data.error);
        throw new Error(data.error || 'Ошибка загрузки данных');
    }
    
    console.log('✅ Сервер вернул задач:', data.count);
    console.log('🔑 Статус админа:', data.isAdmin ? 'ДА' : 'НЕТ');
    console.log('Первая задача:', data.tasks[0]);
    
    // Логируем уникальные статусы
    const uniqueStatuses = [...new Set(data.tasks.map(t => t.status))];
    console.log('🏷️ Уникальные статусы в данных:', uniqueStatuses);
    console.log('Примеры задач по статусам:');
    uniqueStatuses.forEach(status => {
        const example = data.tasks.find(t => t.status === status);
        console.log(`  "${status}" (длина: ${status.length}, коды: ${[...status].map(c => c.charCodeAt(0)).join(',')})`, 
                    '- Пример:', example ? `#${example.number}` : 'нет');
    });
    
    // Валидация данных перед преобразованием
    if (!Array.isArray(data.tasks)) {
        console.error('❌ Неверный формат данных: tasks не является массивом');
        throw new Error('Неверный формат данных от сервера');
    }
    
    // Преобразуем данные в нужный формат с валидацией
    const tasks = data.tasks.map((task, index) => {
        // Валидация обязательных полей
        if (!task || typeof task !== 'object') {
            console.warn(`⚠️ Пропускаем некорректную задачу на позиции ${index}`);
            return null;
        }
        
        if (!task.number || !task.status) {
            console.warn(`⚠️ Пропускаем задачу без номера или статуса на позиции ${index}`);
            return null;
        }
        
        const cleanNumber = extractNumber(task.number);
        if (cleanNumber === null || isNaN(cleanNumber)) {
            console.warn(`⚠️ Пропускаем задачу с некорректным номером: ${task.number}`);
            return null;
        }
        
        return {
            number: cleanNumber,
            numberText: String(task.number),
            status: String(task.status).trim(),
            description: task.description ? String(task.description) : 'Условие не указано',
            hint: task.hint ? String(task.hint) : ''
        };
    }).filter(task => task !== null); // Удаляем null значения
    
    console.log('🎉 Преобразовано задач:', tasks.length);
    
    return {
        tasks: tasks,
        isAdmin: data.isAdmin || false
    };
}

// Извлечение номера из текста типа "98 (ЛЗ 36)"
function extractNumber(text) {
    const match = text.match(/^(\d+)/);
    return match ? parseInt(match[1]) : null;
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
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Задачи не найдены</p>';
        return;
    }
    
    console.log(`📦 Отображение ${tasks.length} задач в контейнере ${containerId}`);
    
    // Статистика по статусам отображаемых задач
    const statusCounts = {};
    tasks.forEach(t => {
        statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
    });
    console.log('Статусы отображаемых задач:', statusCounts);
    
    // Сортировка задач по номеру (от большего к меньшему)
    const sortedTasks = [...tasks].sort((a, b) => b.number - a.number);
    
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
    if (!task || !task.number) {
        console.warn('⚠️ Пропускаем задачу без номера:', task);
        const emptyCard = document.createElement('div');
        emptyCard.style.display = 'none';
        return emptyCard;
    }
    
    const taskCard = document.createElement('div');
    taskCard.className = 'task-card';
    
    // Определяем класс по статусу
    let statusClass = '';
    if (task.status === 'От') {
        statusClass = 'postponed'; // Отложены: "От" (красный)
    } else if (task.status === 'П') {
        statusClass = 'with-hint'; // С подсказкой: "П" (фиолетовый)
    } else if (task.status === 'Н') {
        statusClass = 'current-series'; // Текущая серия: "Н" (оранжевый)
    } else if (task.status === 'Р') {
        statusClass = 'solved'; // Разобрано: "Р" (зелёный)
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
    
    // Для админов добавляем возможность изменения статуса
    const statusBadgeHTML = isAdmin 
        ? `<div class="task-status-badge clickable" data-task-number="${escapeHtml(String(task.number))}">${getStatusText(task.status)}</div>`
        : `<div class="task-status-badge">${getStatusText(task.status)}</div>`;
    
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
        'Н': 'Новая',
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
                
                // Перерисовываем задачи
                displayTasks(allTasks);
                
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

// Изменить статус задачи на сервере
async function changeTaskStatus(taskNumber, newStatus) {
    console.log(`🔄 Изменение статуса задачи №${taskNumber} на "${newStatus}"...`);
    
    const url = `${API_ENDPOINT}?password=${encodeURIComponent(authToken)}&action=changeStatus&taskNumber=${encodeURIComponent(taskNumber)}&newStatus=${encodeURIComponent(newStatus)}`;
    
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

function updateStatistics(tasks) {
    const total = tasks.length;
    const current = tasks.filter(t => t.status === 'Н').length; // Текущая серия: "Н"
    const postponed = tasks.filter(t => t.status === 'От' || t.status === 'П').length; // Откладыши: "От" + "П"
    const unsolved = current + postponed;
    
    document.getElementById('totalTasks').textContent = total;
    document.getElementById('solvedTasks').textContent = unsolved;
    document.getElementById('currentSeries').textContent = current;
    document.getElementById('postponedTasks').textContent = postponed;
    
    // Обновляем заголовки секций
    updateSectionTitle('current-series', `Текущая серия (${current})`);
    updateSectionTitle('postponed', `Отложенные задачи (${postponed})`);
    updateSectionTitle('unsolved', `Неразобранные задачи (${unsolved})`);
}

function updateSectionTitle(sectionId, title) {
    const section = document.getElementById(sectionId);
    if (section) {
        const titleElement = section.querySelector('.part-title');
        if (titleElement) {
            titleElement.textContent = title;
        }
    }
}

// ============================================
// UI HELPERS
// ============================================

function initStatsClick() {
    document.querySelectorAll('.stat-card.clickable[data-filter]').forEach(card => {
        card.addEventListener('click', () => {
            const filterId = card.dataset.filter;
            const link = document.querySelector(`.nav-link[href="#${filterId}"]`);
            if (link) link.click();
        });
    });
}

function initRetryButton() {
    const btn = document.getElementById('retryButton');
    if (!btn) return;
    btn.addEventListener('click', () => {
        if (authToken) loadTasksFromGoogleSheets().catch(() => {});
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
    const overlay = document.getElementById('hintOverlay');
    const modal = document.getElementById('hintModal');
    if (!overlay || !modal || overlay.dataset.hintSwipeInit) return;
    overlay.dataset.hintSwipeInit = 'true';
    let startY = 0, currentY = 0, tracking = false, activated = false;
    const DEAD_ZONE = 15;
    overlay.addEventListener('touchstart', (e) => {
        if (window.innerWidth > 768) return;
        if (modal.scrollTop > 5) return;
        startY = e.touches[0].clientY;
        currentY = startY;
        tracking = true;
        activated = false;
    }, { passive: true });
    overlay.addEventListener('touchmove', (e) => {
        if (!tracking) return;
        currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;
        if (!activated) {
            if (deltaY > DEAD_ZONE) { activated = true; startY = currentY; modal.style.transition = 'none'; }
            return;
        }
        if (deltaY > 0) {
            e.preventDefault();
            modal.style.transform = `translateY(${deltaY}px)`;
        }
    }, { passive: false });
    overlay.addEventListener('touchend', () => {
        if (!tracking) return;
        tracking = false;
        if (!activated) return;
        activated = false;
        const deltaY = currentY - startY;
        if (deltaY > 60) {
            hideHintModal();
            modal.style.transform = '';
            modal.style.transition = '';
        } else {
            modal.style.transition = 'transform 0.25s ease-out';
            modal.style.transform = '';
            setTimeout(() => { modal.style.transition = ''; }, 250);
        }
    });
}

// ============================================
// НАВИГАЦИЯ
// ============================================

function initMatCenterNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            const targetId = link.getAttribute('href').substring(1);
            
            // Скрываем все секции
            document.querySelectorAll('.content-section').forEach(section => {
                section.style.display = 'none';
            });
            
            // Показываем нужную секцию
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.style.display = 'block';
                
                // Фильтруем и отображаем задачи
                filterAndDisplayTasks(targetId);
            }
            
            // Прокрутка к секции
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    });
}

function filterAndDisplayTasks(filterId) {
    currentFilter = filterId;
    let filteredTasks = [];
    let containerId = '';
    
    switch (filterId) {
        case 'all-tasks':
            filteredTasks = allTasks;
            containerId = 'tasksContainer';
            break;
        case 'current-series':
            filteredTasks = allTasks.filter(t => t.status === 'Н'); // Текущая серия: "Н"
            containerId = 'currentSeriesContainer';
            break;
        case 'postponed':
            filteredTasks = allTasks.filter(t => t.status === 'От' || t.status === 'П'); // Откладыши: "От" + "П"
            containerId = 'postponedContainer';
            break;
        case 'unsolved':
            filteredTasks = allTasks.filter(t => t.status === 'Н' || t.status === 'От' || t.status === 'П'); // Все неразобранные
            containerId = 'unsolvedContainer';
            break;
    }
    
    displayTasks(filteredTasks, containerId);
}

// Получить задачи для текущего фильтра
function getTasksForCurrentFilter() {
    switch (currentFilter) {
        case 'all-tasks':
            return allTasks;
        case 'current-series':
            return allTasks.filter(t => t.status === 'Н');
        case 'postponed':
            return allTasks.filter(t => t.status === 'От' || t.status === 'П');
        case 'unsolved':
            return allTasks.filter(t => t.status === 'Н' || t.status === 'От' || t.status === 'П');
        default:
            return allTasks;
    }
}

// ============================================
// ПОИСК
// ============================================

function initStatusFilter() {
    const statusFilterEl = document.getElementById('statusFilter');
    const mobileStatusFilter = document.getElementById('mobileStatusFilter');

    if (statusFilterEl) {
        statusFilterEl.addEventListener('change', () => {
            searchStatusFilter = statusFilterEl.value || 'all';
            if (mobileStatusFilter) mobileStatusFilter.value = statusFilterEl.value;
            runSearch();
        });
    }

    if (mobileStatusFilter) {
        mobileStatusFilter.addEventListener('change', () => {
            searchStatusFilter = mobileStatusFilter.value || 'all';
            if (statusFilterEl) statusFilterEl.value = mobileStatusFilter.value;
            runSearch();
        });
    }
}

function getContainerIdForFilter() {
    const map = { 'all-tasks': 'tasksContainer', 'current-series': 'currentSeriesContainer', 'postponed': 'postponedContainer', 'unsolved': 'unsolvedContainer' };
    return map[currentFilter] || 'tasksContainer';
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
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const activeStatus = statusFilterEl ? statusFilterEl.value : '';

    let currentTasks = getTasksForCurrentFilter();

    if (activeStatus) {
        currentTasks = currentTasks.filter(t => t.status === activeStatus);
    }

    if (searchTerm) {
        const queryWords = searchTerm.split(/\s+/).filter(w => w.length > 0);
        currentTasks = currentTasks.filter(task => {
            const numStr = task.number.toString();
            const desc = task.description.toLowerCase();
            // Быстрая проверка: весь запрос как подстрока (для номеров и точных фраз)
            if (numStr.includes(searchTerm) || desc.includes(searchTerm)) return true;
            // Каждое слово должно найтись (И-логика)
            return queryWords.every(qWord => matchWordRu(qWord, numStr, desc));
        });
    }

    const containerId = getContainerIdForFilter();

    if (currentTasks.length === 0 && (searchTerm || activeStatus)) {
        showNoResultsMessage(containerId, searchTerm, activeStatus);
    } else {
        displayTasks(currentTasks, containerId);
    }
}

function showNoResultsMessage(containerId, searchTerm, statusFilter) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const statusLabels = { 'Р': 'Разобрано', 'Н': 'Текущая серия', 'От': 'Отложена', 'П': 'С подсказкой' };
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
        debounceTimer = setTimeout(runSearch, 250);
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
                        displayTasks(allTasks);
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
                            displayTasks(allTasks);
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
        const url = `${API_ENDPOINT}?password=${encodeURIComponent(authToken)}&action=setHint&taskNumber=${encodeURIComponent(taskNumber)}&hintText=${encodeURIComponent(hintText)}`;
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