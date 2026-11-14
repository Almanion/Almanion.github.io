let matcenterAccountGateBusy = false;
let matcenterPasswordSignInBusy = false;

function showMatcenterAuthMessage(message, isError = true) {
    const authError = document.getElementById('authError');
    if (!authError) return;
    authError.style.display = 'flex';
    authError.style.background = isError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.12)';
    const icon = authError.querySelector('.error-icon');
    const text = authError.querySelector('.error-text');
    if (icon) icon.innerHTML = '<span class="eic eic-alert" aria-hidden="true"></span>';
    if (text) text.textContent = message;
}

function updateMatcenterAuthCopy() {
    const title = document.getElementById('authTitle');
    const note = document.getElementById('matcenterAccountNote');
    const accountButton = document.getElementById('matcenterAccountLogin');
    const passwordInput = document.getElementById('passwordInput');
    const submit = document.getElementById('authSubmit');
    if (!title || !note || !accountButton || !passwordInput || !submit) return;

    const user = getMatcenterFirebaseAuth()?.currentUser || null;
    if (!user || user.isAnonymous) {
        title.textContent = 'Введите пароль';
        note.hidden = true;
        accountButton.hidden = false;
        accountButton.textContent = 'Войти в аккаунт';
        passwordInput.hidden = false;
        submit.hidden = false;
        submit.querySelector('.submit-text').textContent = 'Войти';
    } else {
        title.textContent = 'Подтвердите доступ';
        note.hidden = false;
        note.textContent = `Аккаунт ${user.email || 'пользователя'} ещё не подтверждён для Матцентра. Введите пароль один раз.`;
        accountButton.hidden = true;
        passwordInput.hidden = false;
        submit.hidden = false;
        submit.querySelector('.submit-text').textContent = 'Подтвердить аккаунт';
    }
}

async function refreshMatcenterAccountGate() {
    if (matcenterPasswordSignInBusy) return;
    if (authToken || matcenterAccountGateBusy) {
        updateMatcenterAuthCopy();
        return;
    }
    updateMatcenterAuthCopy();
    if (!getMatcenterFirebaseAuth()?.currentUser) return;
    matcenterAccountGateBusy = true;
    try {
        const access = await checkMatcenterAccountAccess();
        if (!access.allowed) return;
        authToken = 'account';
        isAdmin = access.isAdmin;
        hideAuthForm();
        await hydrateTasksCacheFromIndexedDb();
        const hadCache = applyTasksFromCache();
        await loadTasksFromGoogleSheets(false, hadCache);
    } catch (error) {
        showMatcenterAuthMessage(error.message || 'Не удалось проверить доступ', false);
    } finally {
        matcenterAccountGateBusy = false;
    }
}

async function initAuth() {
    const authForm = document.getElementById('authForm');
    const passwordInput = document.getElementById('passwordInput');
    const authError = document.getElementById('authError');
    const authSubmit = document.getElementById('authSubmit');
    const submitText = authSubmit.querySelector('.submit-text');
    const submitSpinner = authSubmit.querySelector('.submit-spinner');
    const authModal = document.getElementById('authModal');
    const logoutButton = document.getElementById('logoutButton');
    const accountLoginButton = document.getElementById('matcenterAccountLogin');

    accountLoginButton?.addEventListener('click', () => {
        if (window.AlmanionAccount?.openLogin) window.AlmanionAccount.openLogin();
        else showMatcenterAuthMessage('Форма аккаунта ещё загружается. Повторите через секунду.', false);
    });
    window.addEventListener('almanion-account-ready', refreshMatcenterAccountGate);
    updateMatcenterAuthCopy();

    if (authModal && !authModal.dataset.focusTrapReady) {
        authModal.dataset.focusTrapReady = 'true';
        authModal.addEventListener('keydown', (event) => {
            if (event.key !== 'Tab') return;
            const focusable = Array.from(authModal.querySelectorAll('a[href], input, button, [tabindex]:not([tabindex="-1"])'))
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

    if (logoutButton && !logoutButton.dataset.listenerAttached) {
        logoutButton.addEventListener('click', () => {
            if (confirm('Вы уверены, что хотите выйти?')) {
                logout();
            }
        });
        logoutButton.dataset.listenerAttached = 'true';
    }

    if (authToken) {
        return;
    }
    
    if (isLockedOut()) {
        updateLockoutUI();
        lockoutTimer = setInterval(() => {
            if (!updateLockoutUI()) {
                clearInterval(lockoutTimer);
                lockoutTimer = null;
            }
        }, 1000);
    }
    
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (isLockedOut()) {
            updateLockoutUI();
            return;
        }
        
        const password = passwordInput.value;
        if (matcenterPasswordSignInBusy) return;
        matcenterPasswordSignInBusy = true;
        
        authError.style.display = 'none';
        
        submitText.style.display = 'none';
        submitSpinner.style.display = 'flex';
        authSubmit.disabled = true;
        passwordInput.disabled = true;
        
        // Пароль отправляется только один раз в POST-теле и никогда не хранится.
        try {
            const access = await authorizeMatcenterAccount(password);
            authToken = 'account';
            isAdmin = access.isAdmin;
            safeRemove('matcenter_auth');
            passwordInput.value = '';
            await hydrateTasksCacheFromIndexedDb();
            const hadCache = applyTasksFromCache();
            try {
                await loadTasksFromGoogleSheets(true, hadCache);
            } catch (loadError) {
                // Доступ уже подтверждён. Если сохранённая копия есть, временный
                // сетевой сбой не должен снова запирать пользователя на экране входа.
                if (!hadCache) throw loadError;
                showMatcenterDataWarning('Не удалось обновить задачи. Показана последняя сохранённая копия.');
            }
            
            addAttemptToHistory(true, deviceFingerprint);
            console.log(isAdmin ? '✅ Успешный вход (АДМИН)' : '✅ Успешный вход');
            
            resetFailedAttempts();
            
            hideAuthForm();
            
            if (allTasks.length > 0) {
                refreshCurrentView();
            }
            
        } catch (error) {
            authToken = null;

            // Network and server failures are not failed password attempts and
            // must not lock a legitimate user out.
            if (error && error.code === 'ACCOUNT_REQUIRED') {
                showMatcenterAuthMessage('Сначала войдите в аккаунт.', false);
                updateMatcenterAuthCopy();
                submitText.style.display = 'inline';
                submitSpinner.style.display = 'none';
                authSubmit.disabled = false;
                passwordInput.disabled = false;
                return;
            }

            if (!error || error.code !== 'AUTH') {
                const serverMessage = String(error && error.message || '');
                const permissionMissing = /UrlFetchApp\.fetch|script\.external_request|нет разрешения на вызов/i.test(serverMessage);
                const configMissing = /FIREBASE_WEB_API_KEY/i.test(serverMessage);
                let message = 'Не удалось связаться с сервером. Попробуйте ещё раз.';
                if (permissionMissing) {
                    message = 'Сервер Матцентра ещё не получил разрешение Google на проверку аккаунтов. Владельцу нужно один раз запустить authorizeExternalRequests в обоих Apps Script проектах.';
                } else if (configMissing) {
                    message = 'В настройках сервера Матцентра не задан FIREBASE_WEB_API_KEY.';
                }
                showMatcenterAuthMessage(message, true);
                submitText.style.display = 'inline';
                submitSpinner.style.display = 'none';
                authSubmit.disabled = false;
                passwordInput.disabled = false;
                passwordInput.focus();
                return;
            }
            
            addAttemptToHistory(false, deviceFingerprint);
            
            const failedAttempts = getFailedAttempts() + 1;
            setFailedAttempts(failedAttempts);
            
            console.warn(`⚠️ Неудачная попытка входа: ${failedAttempts}/${MAX_FAILED_ATTEMPTS}`);
            
            authModal.classList.add('shake');
            setTimeout(() => {
                authModal.classList.remove('shake');
            }, 400);
            
            if (detectSuspiciousActivity()) {
                authError.querySelector('.error-icon').innerHTML = '<span class="eic eic-alert" aria-hidden="true"></span>';
                authError.querySelector('.error-text').textContent = 
                    'Обнаружена подозрительная активность!';
                authError.style.display = 'flex';
                authError.style.background = 'rgba(239, 68, 68, 0.2)';
            }
            
            if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
                startLockout();
                updateLockoutUI();
                
                if (lockoutTimer) clearInterval(lockoutTimer);
                lockoutTimer = setInterval(() => {
                    if (!updateLockoutUI()) {
                        clearInterval(lockoutTimer);
                        lockoutTimer = null;
                    }
                }, 1000);
            } else {
                authError.style.display = 'flex';
                authError.style.background = 'rgba(239, 68, 68, 0.1)';
                authError.querySelector('.error-icon').innerHTML = '<span class="eic eic-alert" aria-hidden="true"></span>';
                authError.querySelector('.error-text').textContent = 
                    `Неверный пароль. Осталось попыток: ${MAX_FAILED_ATTEMPTS - failedAttempts}`;
                
                submitText.style.display = 'inline';
                submitSpinner.style.display = 'none';
                authSubmit.disabled = false;
                passwordInput.disabled = false;
            }
            
            passwordInput.value = '';
            if (!isLockedOut()) {
                passwordInput.focus();
            }
        } finally {
            matcenterPasswordSignInBusy = false;
        }
    });
    
}

function setMatcenterAuthPageLocked(locked) {
    document.body.classList.toggle('matcenter-auth-open', locked);
    ['.main-content', '#sidebar', '#menuToggle', '#scrollToTop'].forEach(selector => {
        const element = document.querySelector(selector);
        if (!element) return;
        element.inert = locked;
        if (locked) element.setAttribute('aria-hidden', 'true');
        else element.removeAttribute('aria-hidden');
        if (!locked && element.id === 'sidebar' && typeof syncSidebarVisibility === 'function') syncSidebarVisibility(element);
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

    updateMatcenterAuthCopy();
    
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
    window.MatcenterSeriesPrint?.reset();
    document.getElementById('mcPrintButton').disabled = true;
    
    // Очищаем таймеры
    if (lockoutTimer) {
        clearInterval(lockoutTimer);
        lockoutTimer = null;
    }
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }
    
    // Очищаем локальную сессию. Серверное подтверждение UID остаётся: после
    // следующего входа в тот же аккаунт повторный пароль Матцентра не нужен.
    clearSession();
    safeRemove('matcenter_auth');
    safeRemove(TASKS_CACHE_KEY); // После выхода защищённые данные не должны оставаться в кэше
    showMatcenterDataWarning('');
    
    // Очищаем данные
    allTasks = [];
    matcenterTasksState = 'pending';
    if (typeof invalidateMatcenterRenderCache === 'function') invalidateMatcenterRenderCache();
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
    
    getMatcenterFirebaseAuth()?.signOut().catch(() => {});
    showAuthForm();
}

// ============================================
// DATA FETCHING
// ============================================

