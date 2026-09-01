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
    let fp = safeGet('matcenter_fp');
    if (fp) return Promise.resolve(fp);

    // 2. Если нет – генерируем и сохраняем
    return generateFingerprintAlgo().then(generated => {
        try {
            safeSet('matcenter_fp', generated);
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
    return parseInt(safeGet('matcenter_failed_attempts') || '0');
}

function setFailedAttempts(count) {
    safeSet('matcenter_failed_attempts', count.toString());
}

function getLockoutUntil() {
    return parseInt(safeGet('matcenter_lockout_until') || '0');
}

function setLockoutUntil(timestamp) {
    safeSet('matcenter_lockout_until', timestamp.toString());
}

function getLockoutCount() {
    return parseInt(safeGet('matcenter_lockout_count') || '0');
}

function getLastLockoutAt() {
    return parseInt(safeGet('matcenter_last_lockout_at') || '0');
}

function setLastLockoutAt(timestamp) {
    safeSet('matcenter_last_lockout_at', String(timestamp || 0));
}

function incrementLockoutCount() {
    const count = getLockoutCount() + 1;
    safeSet('matcenter_lockout_count', count.toString());
    return count;
}

function resetLockoutCount() {
    safeSet('matcenter_lockout_count', '0');
}

function getLockoutDuration() {
    const count = getLockoutCount();
    const index = Math.min(Math.max(count - 1, 0), LOCKOUT_DURATIONS.length - 1);
    return LOCKOUT_DURATIONS[index];
}

function getAttemptHistory() {
    const encrypted = safeGet('matcenter_attempt_history');
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
    safeSet('matcenter_attempt_history', encrypted);
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
    const encrypted = safeGet('matcenter_session');
    if (!encrypted) return null;
    
    // Используем fallback для расшифровки, если отпечаток еще не готов
    const fingerprint = deviceFingerprint || 'fallback';
    const session = decryptData(encrypted, fingerprint);
    if (!session) return null;
    
    // Проверяем срок действия (если сессия не бессрочная)
    if (Number.isFinite(session.expiresAt) && session.expiresAt < Date.now()) {
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
        // JSON does not support Infinity: it would be serialized as null anyway.
        // null explicitly means "valid until logout".
        expiresAt: SESSION_DURATION === Infinity ? null : Date.now() + SESSION_DURATION
    };
    
    const encrypted = encryptData(session, deviceFingerprint || 'fallback');
    safeSet('matcenter_session', encrypted);
    
    console.log('✅ Новая сессия создана');
    if (session.expiresAt == null) {
        console.log('   - Бессрочная (до явного выхода)');
    } else {
        console.log(`   - Истекает: ${new Date(session.expiresAt).toLocaleString()}`);
    }
    
    return session;
}

function clearSession() {
    safeRemove('matcenter_session');
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
    setLastLockoutAt(Date.now());
    
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
    const lastLockout = getLastLockoutAt();
    setFailedAttempts(0);
    setLockoutUntil(0);
    
    // Сбрасываем lockout count только если прошло достаточно времени
    const timeSinceLastLockout = lastLockout > 0 ? Date.now() - lastLockout : Infinity;
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
            authError.querySelector('.error-icon').innerHTML = '<span class="eic eic-clock" aria-hidden="true"></span>';
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

