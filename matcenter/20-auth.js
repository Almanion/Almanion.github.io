async function initAuth() {
    const authForm = document.getElementById('authForm');
    const passwordInput = document.getElementById('passwordInput');
    const authError = document.getElementById('authError');
    const authSubmit = document.getElementById('authSubmit');
    const submitText = authSubmit.querySelector('.submit-text');
    const submitSpinner = authSubmit.querySelector('.submit-spinner');
    const authModal = document.getElementById('authModal');
    const logoutButton = document.getElementById('logoutButton');

    if (authModal && !authModal.dataset.focusTrapReady) {
        authModal.dataset.focusTrapReady = 'true';
        authModal.addEventListener('keydown', (event) => {
            if (event.key !== 'Tab') return;
            const focusable = Array.from(authModal.querySelectorAll('input, button, [tabindex]:not([tabindex="-1"])'))
                .filter(element => !element.disabled && element.offsetParent !== null);
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });
    }

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
        authToken = safeGet('matcenter_auth');
        if (authToken) {
            try {
                hideAuthForm();
                const hadCache = applyTasksFromCache();
                await loadTasksFromGoogleSheets(false, hadCache);
                
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
            safeSet('matcenter_auth', password);
            
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

            // Network and server failures are not failed password attempts and
            // must not lock a legitimate user out.
            if (!error || error.code !== 'AUTH') {
                authError.style.display = 'flex';
                authError.style.background = 'rgba(245, 158, 11, 0.12)';
                authError.querySelector('.error-icon').innerHTML = '<span class="eic eic-alert" aria-hidden="true"></span>';
                authError.querySelector('.error-text').textContent =
                    'Не удалось связаться с сервером. Попробуйте ещё раз.';
                submitText.style.display = 'inline';
                submitSpinner.style.display = 'none';
                authSubmit.disabled = false;
                passwordInput.disabled = false;
                passwordInput.focus();
                return;
            }
            
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
                authError.querySelector('.error-icon').innerHTML = '<span class="eic eic-alert" aria-hidden="true"></span>';
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
                authError.querySelector('.error-icon').innerHTML = '<span class="eic eic-alert" aria-hidden="true"></span>';
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

function setMatcenterAuthPageLocked(locked) {
    document.body.classList.toggle('matcenter-auth-open', locked);
    ['.main-content', '#sidebar', '#menuToggle', '#scrollToTop'].forEach(selector => {
        const element = document.querySelector(selector);
        if (!element) return;
        element.inert = locked;
        if (locked) element.setAttribute('aria-hidden', 'true');
        else element.removeAttribute('aria-hidden');
    });
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
        authOverlay.setAttribute('aria-hidden', 'false');
        setMatcenterAuthPageLocked(true);
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
        authOverlay.setAttribute('aria-hidden', 'true');
        setMatcenterAuthPageLocked(false);
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
    safeRemove('matcenter_auth'); // Удаляем сохранённый пароль
    safeRemove(TASKS_CACHE_KEY); // После выхода защищённые данные не должны оставаться в кэше
    showMatcenterDataWarning('');
    
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
    const progressWrap = document.getElementById('matcenterProgress');
    if (progressWrap) progressWrap.hidden = true;
    
    console.log('👋 Выход выполнен');
    
    showAuthForm();
}

// ============================================
// DATA FETCHING
// ============================================

