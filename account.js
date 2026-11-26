// ============================================
// АККАУНТ + СИНХРОНИЗАЦИЯ ПРОГРЕССА (Firebase Auth)
// ============================================
//
// Самодостаточный модуль: добавляет в шапку меню маленькую кнопку-иконку входа,
// окно входа и синхронизирует прогресс «Проверки знаний»
// (ключи localStorage `kc_fsrs_*`) в Realtime Database под `kc/<uid>`.
// Требует, чтобы на странице были подключены firebase-app/-auth/-database (compat)
// и firebase-config.js. Без них модуль молча выключается.

(function () {
    'use strict';

    if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') return;
    if (typeof firebase.auth !== 'function' || typeof firebase.database !== 'function') return;
    try { if (!firebase.apps.length) firebase.initializeApp(firebaseConfig); } catch (_) {}

    let auth, db;
    try { auth = firebase.auth(); db = firebase.database(); } catch (err) {
        console.error('Almanion account: Firebase Auth is unavailable.', err);
        return;
    }

    const KC_PREFIX = 'kc_fsrs_';
    const kcStorage = window.AlmanionKCStorage || null;
    const sGet = window.safeStorageGet || function (k) { try { return localStorage.getItem(k); } catch (_) { return null; } };
    const sSet = window.safeStorageSet || function (k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } };
    const sRemove = window.safeStorageRemove || function (k) { try { localStorage.removeItem(k); } catch (_) {} };

    let user = null;
    let kcRef = null;
    let kcStore = null;
    let settingsStore = null;
    let settingsSyncUid = null;
    let applyingRemote = false;
    let authBusy = false;
    let authBusyTarget = '';
    let authStateKnown = false;
    let persistenceReady = false;
    let persistenceMode = 'local';
    let persistenceFailure = false;
    let syncGeneration = 0;
    let popupAttemptId = 0;
    let homeAccessGeneration = 0;
    let homeRolesRef = null;
    let homeRolesHandler = null;
    const appleEnabled = typeof appleAuthEnabled !== 'undefined' && appleAuthEnabled === true
        && typeof firebase.auth.OAuthProvider === 'function';

    // Явно закрепляем сессию за устройством. По умолчанию Firebase также использует
    // LOCAL, но явная настройка защищает от унаследованного SESSION/NONE между
    // вкладками. Запускаем её заранее, чтобы Google popup открывался прямо из клика
    // пользователя и не блокировался браузером после асинхронного ожидания.
    try { auth.useDeviceLanguage(); } catch (_) {}
    const persistencePromise = auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .catch(function (err) {
            console.warn('Almanion account: persistent session is unavailable.', err);
            persistenceMode = 'session';
            return auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
        })
        .catch(function (err) {
            console.warn('Almanion account: tab session is unavailable.', err);
            persistenceMode = 'memory';
            return auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
        })
        .then(function () { persistenceReady = true; })
        .catch(function (err) {
            persistenceFailure = true;
            console.warn('Almanion account: authentication storage is unavailable.', err);
        })
        .finally(updateAuthControls);

    // ---------- Иконки ----------
    const IC_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    // Resolve relative to this script so the menu also works from /watch and file://.
    const profileUrl = new URL('profile.html', document.currentScript?.src || document.baseURI).href;
    const avatarIcons = {
        initial: ['Буква', ''],
        compass: ['Компас', '<circle cx="12" cy="12" r="9"/><path d="m16.5 7.5-2.8 6.2-6.2 2.8 2.8-6.2Z"/>'],
        moon: ['Месяц', '<path d="M19.8 15.6A8.6 8.6 0 0 1 8.4 4.2 8.6 8.6 0 1 0 19.8 15.6Z"/><path d="m17 4 .7 1.8 1.8.7-1.8.7L17 9l-.7-1.8-1.8-.7 1.8-.7Z"/>'],
        bolt: ['Молния', '<path d="m14 2-10 12h7l-1 8 10-13h-7l1-7Z"/>'],
        orbit: ['Орбита', '<circle cx="12" cy="12" r="6.6"/><ellipse cx="12" cy="12" rx="10.3" ry="3.2" transform="rotate(-32 12 12)"/>'],
        book: ['Книга', '<path d="M12 6.5c-2.5-2-5.6-2.3-9-1.7v13.5c3.6-.6 6.4 0 9 1.9 2.6-1.9 5.4-2.5 9-1.9V4.8c-3.4-.6-6.5-.3-9 1.7Zm0 0v13.7"/>'],
        peak: ['Горы', '<path d="m2.2 19 7.6-14 5 8.9 2.5-4.2L22 19H2.2Z"/><path d="m6.7 10.6 2.1.9 1.8-1.5 2 1"/>'],
        spark: ['Искра', '<path d="M12 2.7c.7 5.8 3.3 8.4 9.3 9.3-6 .9-8.6 3.5-9.3 9.3-.9-5.8-3.5-8.4-9.3-9.3 5.8-.9 8.4-3.5 9.3-9.3Z"/>'],
        cat: ['Кот', '<path d="m4.3 10-.1-6.1 5 3a13 13 0 0 1 5.6 0l5-3-.1 6.1c2.7 6.6-1.3 10-7.7 10s-10.4-3.4-7.7-10Z"/><path d="M8.7 12.8h.2m6.2 0h.2M11 15.6l1 .7 1-.7"/>']
    };
    const avatarColors = { iris: 'Ирис', ocean: 'Океан', mint: 'Мята', amber: 'Янтарь', rose: 'Роза', coral: 'Коралл', sky: 'Лёд', slate: 'Сланец' };
    const avatarShapes = { circle: 'Круг', tile: 'Квадрат', pebble: 'Камень' };
    let identity = {};
    let identityRef = null;
    let identityListener = null;

    function avatarMarkup(value, name) {
        const icon = Object.hasOwn(avatarIcons, value?.avatar) ? avatarIcons[value.avatar][1] : '';
        const color = Object.hasOwn(avatarColors, value?.color) ? value.color : 'iris';
        const shape = Object.hasOwn(avatarShapes, value?.shape) ? value.shape : 'circle';
        const initial = value?.monogram || Array.from(String(name || '').trim())[0] || 'А';
        return '<span class="account-avatar profile-mark" data-profile-color="' + color + '" data-profile-shape="' + shape + '" aria-hidden="true">' +
            (icon ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + icon + '</svg>' : escapeHtml(initial.toLocaleUpperCase('ru'))) + '</span>';
    }

    function refreshIdentity() {
        updateButton();
        const title = document.getElementById('accIdentityName');
        const mark = document.getElementById('accIdentityMark');
        if (!user || !title || !mark) return;
        title.textContent = identity.nickname || user.displayName || 'Мой аккаунт';
        mark.innerHTML = avatarMarkup(identity, identity.nickname || user.displayName || user.email);
    }

    function watchIdentity(account) {
        if (identityRef && identityListener) identityRef.off('value', identityListener);
        identityRef = null;
        identityListener = null;
        identity = {};
        if (!account) return;
        const ref = db.ref('accountProfiles/' + account.uid + '/identity');
        identityRef = ref;
        identityListener = function (snapshot) {
            if (identityRef !== ref || user?.uid !== account.uid) return;
            identity = snapshot.val() || {};
            refreshIdentity();
        };
        ref.on('value', identityListener, function () {
            if (identityRef !== ref) return;
            identity = {};
            refreshIdentity();
        });
    }
    const IC_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>';
    const IC_GOOGLE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
        '<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"/>' +
        '<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>' +
        '<path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"/>' +
        '<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>';

    const googleButton = '<button type="button" class="account-google-btn" id="accGoogle">' +
        IC_GOOGLE + '<span>Войти через Google</span></button>';
    const appleButtonBlack = new URL('images/sign-in-with-apple-black.png', profileUrl).href;
    const appleButtonWhite = new URL('images/sign-in-with-apple-white.png', profileUrl).href;
    const appleButton = '<button type="button" class="account-apple-btn" id="accApple" aria-label="Вход с Apple">' +
        '<img class="account-apple-light" src="' + appleButtonBlack + '" width="274" height="44" alt="">' +
        '<img class="account-apple-dark" src="' + appleButtonWhite + '" width="274" height="44" alt="">' +
        '</button><span class="account-oauth-progress" id="accAppleProgress" role="status" hidden></span>';

    // ---------- Кнопка в шапке меню ----------
    function buildButton() {
        const header = document.querySelector('.sidebar-header');
        if (document.getElementById('accountBtn')) return;
        const btn = document.createElement('button');
        btn.id = 'accountBtn';
        btn.className = 'account-btn';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Войти в аккаунт');
        btn.innerHTML = IC_USER;
        btn.addEventListener('click', onAccountClick);
        if (!header) {
            if (!document.body.classList.contains('home-page')) return;
            btn.classList.add('home-account-btn');
            (document.getElementById('homeControls') || document.body).appendChild(btn);
            updateButton();
            return;
        }
        let container = header.querySelector('.sidebar-header-buttons');
        if (!container) {
            container = document.createElement('div');
            container.className = 'sidebar-header-buttons';
            header.appendChild(container);
        }
        // Иконка аккаунта — левее кнопки сворачивания «‹» (она должна быть правее аккаунта).
        const collapseBtn = container.querySelector('.sidebar-collapse-btn');
        const settingsBtn = container.querySelector('#settingsButtonSidebar');
        const anchor = collapseBtn || settingsBtn || container.firstChild;
        if (anchor) container.insertBefore(btn, anchor);
        else container.appendChild(btn);
        updateButton();
    }

    function updateButton() {
        const btn = document.getElementById('accountBtn');
        if (!btn) return;
        btn.classList.toggle('is-loading', !authStateKnown);
        if (user) {
            const name = identity.nickname || user.displayName || user.email || '';
            btn.classList.add('signed-in');
            btn.title = name || 'Аккаунт';
            btn.setAttribute('aria-label', 'Аккаунт: ' + (name || 'вошли'));
            btn.innerHTML = avatarMarkup(identity, name);
        } else {
            btn.classList.remove('signed-in');
            btn.title = 'Войти';
            btn.setAttribute('aria-label', 'Войти в аккаунт');
            btn.innerHTML = IC_USER;
        }
    }

    function onAccountClick() {
        if (typeof window.closeMobileMenu === 'function') {
            // не закрываем меню принудительно — окно покажется поверх
        }
        if (user) openAccountMenu(); else openLoginModal(false);
    }

    // ---------- Окно входа ----------
    const forecastPhone = document.body?.classList.contains('forecast-page') && matchMedia(
        '(max-width: 759px), (orientation: landscape) and (max-width: 1024px) and (max-height: 540px) and (pointer: coarse)'
    );

    function followForecastAccountViewport(overlay) {
        const viewport = window.visualViewport;
        if (!forecastPhone || !viewport) return;
        const resize = () => {
            overlay.style.setProperty('--forecast-account-top', viewport.offsetTop + 'px');
            overlay.style.setProperty('--forecast-account-height', viewport.height + 'px');
            const field = document.activeElement;
            if (!forecastPhone.matches || !overlay.contains(field) || !field.matches('input')) return;
            const modal = field.closest('.account-modal');
            const bounds = modal.getBoundingClientRect(), input = field.getBoundingClientRect();
            if (input.bottom + 12 > bounds.bottom) modal.scrollTop += input.bottom + 12 - bounds.bottom;
            else if (input.top - 12 < bounds.top) modal.scrollTop -= bounds.top - input.top + 12;
        };
        viewport.addEventListener('resize', resize);
        viewport.addEventListener('scroll', resize, { passive: true });
        resize();
    }

    function ensureOverlay() {
        let ov = document.getElementById('accountOverlay');
        if (ov) return ov;
        ov = document.createElement('div');
        ov.id = 'accountOverlay';
        ov.className = 'auth-overlay hidden';
        ov.addEventListener('click', function (e) { if (e.target === ov) hideOverlay(); });
        ov.addEventListener('keydown', function (event) {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            hideOverlay();
        });
        ov.setAttribute('aria-hidden', 'true');
        document.body.appendChild(ov);
        initSwipeClose(ov);
        followForecastAccountViewport(ov);
        return ov;
    }
    function hideOverlay() {
        const ov = document.getElementById('accountOverlay');
        if (ov) {
            const restoreFocus = ov.contains(document.activeElement);
            ov.classList.add('hidden');
            ov.setAttribute('aria-hidden', 'true');
            const button = document.getElementById('accountBtn');
            if (restoreFocus && button) button.focus();
        }
    }

    // Свайп вниз закрывает окно (как и остальные модальные окна на мобильных).
    function initSwipeClose(overlay) {
        let startY = 0, currentY = 0, tracking = false, activated = false;
        const DEAD = 15;
        const getModal = () => overlay.querySelector('.auth-modal');
        overlay.addEventListener('touchstart', function (e) {
            if (window.innerWidth > 768) return;
            const m = getModal();
            if (!m || m.scrollTop > 5) return;
            startY = currentY = e.touches[0].clientY; tracking = true; activated = false;
        }, { passive: true });
        overlay.addEventListener('touchmove', function (e) {
            if (!tracking) return;
            const m = getModal(); if (!m) return;
            currentY = e.touches[0].clientY;
            const d = currentY - startY;
            if (!activated) { if (d > DEAD) { activated = true; startY = currentY; m.style.transition = 'none'; } return; }
            const sd = currentY - startY;
            if (sd > 0) { e.preventDefault(); m.style.transform = 'translateY(' + sd + 'px)'; overlay.style.background = 'rgba(0,0,0,' + Math.max(0, 0.6 - sd / 400) + ')'; }
        }, { passive: false });
        overlay.addEventListener('touchend', function () {
            if (!tracking) return; tracking = false;
            if (!activated) return; activated = false;
            const m = getModal(); if (!m) return;
            const d = currentY - startY;
            if (d > 60) {
                m.style.transition = 'transform 0.25s ease-out'; m.style.transform = 'translateY(100vh)';
                overlay.style.transition = 'background 0.25s ease-out'; overlay.style.background = 'rgba(0,0,0,0)';
                setTimeout(function () { hideOverlay(); m.style.transition = ''; m.style.transform = ''; overlay.style.transition = ''; overlay.style.background = ''; }, 250);
            } else {
                m.style.transition = 'transform 0.25s ease-out'; m.style.transform = '';
                overlay.style.transition = 'background 0.25s ease-out'; overlay.style.background = '';
                setTimeout(function () { m.style.transition = ''; overlay.style.transition = ''; }, 250);
            }
        });
    }

    function openLoginModal(registerMode) {
        const ov = ensureOverlay();
        let mode = registerMode ? 'register' : 'login';
        let rememberedEmail = '';
        function focusForm() {
            if (!forecastPhone?.matches) {
                ov.querySelector('#accEmail').focus();
                return;
            }
            const heading = ov.querySelector('#accTitle');
            heading.tabIndex = -1;
            heading.focus({ preventScroll: true });
        }
        function changeMode(nextMode) {
            if (authBusy) return;
            rememberedEmail = ov.querySelector('#accEmail').value;
            mode = nextMode;
            render();
            focusForm();
        }
        function render() {
            const resetMode = mode === 'reset';
            const submitLabel = resetMode ? 'Отправить письмо' : (mode === 'register' ? 'Зарегистрироваться' : 'Войти');
            ov.innerHTML =
                '<div class="auth-modal account-modal" role="dialog" aria-modal="true" aria-labelledby="accTitle">' +
                    '<button type="button" class="kc-close" id="accClose" aria-label="Закрыть">' + IC_CLOSE + '</button>' +
                    '<div class="auth-icon">' + IC_USER + '</div>' +
                    '<h2 id="accTitle">' + (resetMode ? 'Восстановление пароля' : (mode === 'register' ? 'Регистрация' : 'Вход в аккаунт')) + '</h2>' +
                    (resetMode
                        ? '<p class="account-reset-help" id="accResetHelp">Укажите почту аккаунта. Мы отправим ссылку для выбора нового пароля.</p>'
                        : (appleEnabled ? '<div class="account-oauth-buttons">' + appleButton + googleButton + '</div>' : googleButton) +
                          '<div class="account-or"><span>или</span></div>') +
                    '<form id="accForm" autocomplete="on" data-mode="' + mode + '"' + (resetMode ? ' aria-describedby="accResetHelp"' : '') + '>' +
                        '<label class="account-field-label" for="accEmail">Почта</label>' +
                        '<input type="email" id="accEmail" placeholder="Почта" autocomplete="email" autocapitalize="none" required>' +
                        (!resetMode
                            ? '<label class="account-field-label" for="accPass">Пароль</label>' +
                              '<input type="password" id="accPass" placeholder="Пароль (не менее 6 символов)" autocomplete="' + (mode === 'register' ? 'new-password' : 'current-password') + '" required minlength="6">'
                            : '') +
                        (mode === 'register'
                            ? '<label class="account-field-label" for="accPassConfirm">Повторите пароль</label><input type="password" id="accPassConfirm" placeholder="Повторите пароль" autocomplete="new-password" required minlength="6">'
                            : '') +
                        '<div class="account-error" id="accError" role="alert" hidden></div>' +
                        (resetMode ? '<div class="account-notice" id="accResetStatus" role="status" aria-live="polite" hidden></div>' : '') +
                        '<div class="account-notice" id="accStorageNotice" hidden></div>' +
                        '<button type="submit" class="auth-submit" id="accSubmit" data-label="' + submitLabel + '">' + submitLabel + '</button>' +
                    '</form>' +
                    (mode === 'login' ? '<button type="button" class="account-link" id="accForgot">Забыли пароль?</button>' : '') +
                    '<button type="button" class="account-link" id="accToggle">' +
                        (resetMode ? 'Вернуться ко входу' : (mode === 'register' ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться')) +
                    '</button>' +
                '</div>';
            ov.querySelector('#accEmail').value = rememberedEmail;
            ov.querySelector('#accClose').addEventListener('click', hideOverlay);
            const google = ov.querySelector('#accGoogle');
            if (google) google.addEventListener('click', signInGoogle);
            ov.querySelector('#accApple')?.addEventListener('click', function () { popupAuth('apple'); });
            const forgot = ov.querySelector('#accForgot');
            if (forgot) forgot.addEventListener('click', function () { changeMode('reset'); });
            ov.querySelector('#accToggle').addEventListener('click', function () {
                changeMode(mode === 'login' ? 'register' : 'login');
            });
            ov.querySelector('#accForm').addEventListener('submit', function (e) {
                e.preventDefault();
                if (authBusy) return;
                const form = e.currentTarget;
                const emailInput = ov.querySelector('#accEmail');
                emailInput.value = emailInput.value.trim();
                if (!form.reportValidity()) return;
                const email = ov.querySelector('#accEmail').value.trim();
                if (mode === 'reset') {
                    sendPasswordReset(email, form);
                    return;
                }
                const pass = ov.querySelector('#accPass').value;
                if (mode === 'register') {
                    const confirmationInput = ov.querySelector('#accPassConfirm');
                    if (!confirmationInput || pass !== confirmationInput.value) {
                        showError('Пароли не совпадают. Проверьте оба поля.');
                        if (confirmationInput) confirmationInput.focus();
                        return;
                    }
                    doEmail(function () { return auth.createUserWithEmailAndPassword(email, pass); }, function () {
                        if (!form.isConnected || ov.classList.contains('hidden')) return;
                        ov.innerHTML =
                            '<div class="auth-modal account-modal" role="dialog" aria-modal="true" aria-labelledby="registrationComplete">' +
                                '<h2 id="registrationComplete">Аккаунт создан</h2>' +
                                '<a id="registrationVerify" class="auth-submit account-editor-link">Подтвердить почту</a>' +
                                '<button type="button" id="registrationLater" class="account-link">Позже</button></div>';
                        const verify = ov.querySelector('#registrationVerify');
                        verify.href = profileUrl + '#email';
                        verify.addEventListener('click', hideOverlay);
                        ov.querySelector('#registrationLater').addEventListener('click', hideOverlay);
                        verify.focus();
                    });
                } else {
                    doEmail(function () { return auth.signInWithEmailAndPassword(email, pass); });
                }
            });
            updateAuthControls();
        }
        render();
        ov.classList.remove('hidden');
        ov.setAttribute('aria-hidden', 'false');
        if (forecastPhone?.matches) focusForm();
        else setTimeout(function () { try { focusForm(); } catch (_) {} }, 0);
    }

    const PASSWORD_RESET_COMPLETE = 'Если для этой почты доступно восстановление пароля, письмо со ссылкой будет отправлено. Проверьте входящие и папку «Спам». Если вы использовали другой способ входа, выберите его на странице входа.';

    function passwordResetMessage(err) {
        const code = (err && err.code) || '';
        if (code === 'auth/invalid-email' || code === 'auth/missing-email') return 'Введите корректную почту.';
        if (code === 'auth/network-request-failed') return 'Не удалось отправить письмо: нет связи с сервером. Проверьте интернет и повторите попытку.';
        if (code === 'auth/too-many-requests') return 'Слишком много запросов. Подождите несколько минут и попробуйте снова.';
        return 'Не удалось отправить письмо. Повторите попытку позже.';
    }

    function sendPasswordReset(email, form) {
        if (authBusy) return;
        clearError();
        const status = form.querySelector('#accResetStatus');
        status.hidden = false;
        status.textContent = 'Отправляем письмо…';
        form.setAttribute('aria-busy', 'true');
        setAuthBusy(true, 'Отправляем…', 'reset');
        // Password recovery does not create a session and does not need persistence.
        // Keep completion generic even on projects without email enumeration protection.
        return Promise.resolve()
            .then(function () { return auth.sendPasswordResetEmail(email); })
            .catch(function (err) {
                if (err && (err.code === 'auth/user-not-found' || err.code === 'auth/user-disabled')) return;
                throw err;
            })
            .then(function () { status.textContent = PASSWORD_RESET_COMPLETE; })
            .catch(function (err) {
                status.hidden = true;
                if (document.getElementById('accForm') === form) showError(passwordResetMessage(err));
            })
            .finally(function () {
                form.removeAttribute('aria-busy');
                setAuthBusy(false);
            });
    }

    function doEmail(action, onSuccess = hideOverlay) {
        if (authBusy) return;
        clearError();
        setAuthBusy(true, 'Входим…', 'email');
        persistencePromise
            .then(function () {
                if (!persistenceReady) throw { code: 'auth/web-storage-unsupported' };
                return action();
            })
            .then(onSuccess)
            .catch(function (err) { showError(authMessage(err)); })
            .finally(function () { setAuthBusy(false); });
    }

    function signInGoogle() {
        popupAuth('google');
    }

    function createOAuthProvider(kind) {
        if (kind === 'apple') {
            const provider = new firebase.auth.OAuthProvider('apple.com');
            provider.addScope('email');
            provider.addScope('name');
            return provider;
        }
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        return provider;
    }

    function popupAuth(kind, accountToLink) {
        if (authBusy) return;
        clearError();
        if (!persistenceReady) {
            showError('Хранилище авторизации ещё не готово. Подождите секунду и повторите вход.');
            return;
        }
        if (kind === 'apple' && !appleEnabled) return;
        if (accountToLink && auth.currentUser?.uid !== accountToLink.uid) return;

        const brand = kind === 'apple' ? 'Apple' : 'Google';
        const attemptId = ++popupAttemptId;
        const dialog = document.getElementById('accountOverlay')?.firstElementChild;
        const waiting = accountToLink ? 'Подтвердите привязку в окне Apple' : 'Завершите вход в окне ' + brand;
        setAuthBusy(true, waiting, kind);

        // Вызов должен происходить непосредственно из клика: иначе браузер может
        // заблокировать popup. Таймер не отменяет Firebase-запрос, но возвращает
        // управление форме, если встроенный браузер не сообщил о закрытии окна.
        const watchdog = setTimeout(function () {
            if (attemptId !== popupAttemptId) return;
            popupAttemptId++;
            setAuthBusy(false);
            if (dialog?.isConnected) showError('Окно ' + brand + ' не завершило вход. Закройте его и повторите попытку. Если окно не открылось, разрешите всплывающие окна или войдите по почте.');
        }, kind === 'apple' ? 90000 : 45000);

        let popupPromise;
        try {
            const provider = createOAuthProvider(kind);
            popupPromise = accountToLink ? accountToLink.linkWithPopup(provider) : auth.signInWithPopup(provider);
        } catch (err) {
            clearTimeout(watchdog);
            showError(authMessage(err, kind));
            setAuthBusy(false);
            return;
        }

        popupPromise
            .then(function (result) {
                if (attemptId !== popupAttemptId) return;
                if (accountToLink) {
                    const status = document.getElementById('accAppleStatus');
                    if (user?.uid !== result.user?.uid || !status) return;
                    const linkMenu = status.parentElement.querySelector('.account-provider-link');
                    if (linkMenu) linkMenu.hidden = true;
                    status.hidden = false;
                    status.textContent = 'Вход с Apple подключён';
                    if (!status.closest('#accountOverlay').classList.contains('hidden')) status.focus({ preventScroll: true });
                } else if (document.getElementById('accForm')) {
                    hideOverlay();
                }
            })
            .catch(function (err) {
                if (attemptId === popupAttemptId && dialog?.isConnected) showError(authMessage(err, kind));
            })
            .finally(function () {
                clearTimeout(watchdog);
                if (attemptId === popupAttemptId) setAuthBusy(false);
            });
    }

    function setAuthBusy(value, label, target) {
        authBusy = value;
        authBusyTarget = value ? (target || '') : '';
        updateAuthControls(label);
    }

    function updateAuthControls(label) {
        const google = document.getElementById('accGoogle');
        const apple = document.getElementById('accApple');
        const appleLink = document.getElementById('accAppleLink');
        const appleProgress = document.getElementById('accAppleProgress');
        const submit = document.getElementById('accSubmit');
        const signout = document.getElementById('accSignout');
        const notice = document.getElementById('accStorageNotice');
        const resetMode = document.getElementById('accForm')?.dataset.mode === 'reset';
        if (google) {
            google.disabled = authBusy || !persistenceReady;
            const googleLabel = google.querySelector('span');
            if (googleLabel) googleLabel.textContent = authBusyTarget === 'google' && label
                ? label
                : 'Войти через Google';
        }
        if (apple) apple.disabled = authBusy || !persistenceReady;
        if (appleLink) {
            appleLink.disabled = authBusy || !persistenceReady;
            appleLink.textContent = authBusyTarget === 'apple' ? (label || 'Привязываем…') : 'Привязать Apple';
        }
        if (appleProgress) {
            appleProgress.hidden = authBusyTarget !== 'apple';
            if (label || !authBusy) appleProgress.textContent = authBusyTarget === 'apple' ? label : '';
        }
        if (submit) {
            submit.disabled = authBusy || (!resetMode && !persistenceReady);
            if (!authBusy) submit.textContent = submit.dataset.label || 'Войти';
            else if ((authBusyTarget === 'email' || authBusyTarget === 'reset') && label) submit.textContent = label;
        }
        ['accForgot', 'accToggle'].forEach(function (id) {
            const control = document.getElementById(id);
            if (control) control.disabled = authBusy;
        });
        if (signout) {
            signout.disabled = authBusy;
            signout.textContent = authBusyTarget === 'signout' && label ? label : 'Выйти';
        }
        if (notice) {
            notice.hidden = resetMode || persistenceMode === 'local' || persistenceFailure;
            notice.textContent = persistenceMode === 'session'
                ? 'В приватном режиме вход сохранится только до закрытия браузера.'
                : 'Вход сохранится только до обновления этой вкладки.';
        }
        if (persistenceFailure && !resetMode) showError('Браузер полностью запретил хранилище авторизации. Разрешите данные сайта и обновите страницу.');
    }

    function clearError() {
        const el = document.getElementById('accError');
        if (el) { el.textContent = ''; el.hidden = true; }
    }
    function showError(msg) {
        const el = document.getElementById('accError');
        if (el) { el.textContent = msg; el.hidden = false; }
    }
    function authMessage(err, provider) {
        const c = (err && err.code) || '';
        const brand = provider === 'apple' ? 'Apple' : 'Google';
        if (provider === 'apple') {
            if (c === 'auth/account-exists-with-different-credential') return 'Сначала войдите в существующий аккаунт прежним способом, затем добавьте вход с Apple в меню аккаунта.';
            if (c === 'auth/credential-already-in-use') return 'Этот аккаунт Apple уже связан с другим профилем Almanion.';
            if (c === 'auth/provider-already-linked') return 'Вход с Apple уже подключён.';
            if (c === 'auth/operation-not-allowed') return 'Вход с Apple пока недоступен. Войдите другим способом.';
            if (c === 'auth/invalid-credential') return 'Apple не подтвердил вход. Откройте окно входа снова.';
        }
        if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found') return 'Неверная почта или пароль.';
        if (c === 'auth/email-already-in-use') return 'Эта почта уже зарегистрирована — войдите.';
        if (c === 'auth/weak-password') return 'Пароль слишком короткий (мин. 6 символов).';
        if (c === 'auth/invalid-email') return 'Некорректная почта.';
        if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return 'Окно ' + brand + ' закрыто до завершения входа.';
        if (c === 'auth/popup-blocked') return 'Браузер заблокировал окно ' + brand + '. Разрешите всплывающие окна для этого сайта и повторите вход.';
        if (c === 'auth/operation-not-supported-in-this-environment') return 'Этот браузер не поддерживает окно входа ' + brand + '. Откройте сайт в обычном браузере или войдите по почте.';
        if (c === 'auth/network-request-failed') return 'Нет связи с сервером входа. Проверьте интернет и повторите попытку.';
        if (c === 'auth/web-storage-unsupported') return 'Браузер запретил локальное хранилище, поэтому сохранить вход нельзя. Отключите строгий приватный режим для сайта.';
        if (c === 'auth/too-many-requests') return 'Слишком много попыток входа. Подождите несколько минут и попробуйте снова.';
        if (c === 'auth/account-exists-with-different-credential') return 'Аккаунт с этой почтой уже создан другим способом. Войдите по почте, затем повторите вход через Google.';
        if (c === 'auth/user-disabled') return 'Этот аккаунт отключён.';
        if (c === 'auth/operation-not-allowed') return 'Этот способ входа не включён в Firebase.';
        if (c === 'auth/unauthorized-domain') return 'Домен не разрешён в настройках Firebase Auth.';
        const publicCode = c ? c.replace(/^auth\//, '') : '';
        return 'Не удалось войти' + (publicCode ? ` (${publicCode})` : '') + '. Повторите попытку; если ошибка сохранится, обновите страницу.';
    }

    // ---------- Окно «вы вошли» ----------
    function openAccountMenu() {
        const ov = ensureOverlay();
        const email = (user && user.email) || 'Аккаунт';
        const appleLinked = user.providerData?.some(function (provider) { return provider.providerId === 'apple.com'; });
        ov.innerHTML =
            '<div class="auth-modal account-modal account-session-modal" role="dialog" aria-modal="true" aria-labelledby="accIdentityName">' +
                '<button class="kc-close" id="accClose" aria-label="Закрыть">' + IC_CLOSE + '</button>' +
                '<div class="account-identity"><div class="account-identity-mark" id="accIdentityMark"></div>' +
                    '<div><h2 id="accIdentityName"></h2><p class="account-email">' + escapeHtml(email) + '</p>' +
                        (user.email && !user.emailVerified ? '<a class="account-verify-link" id="accVerifyEmail">Подтвердить почту</a>' : '') + '</div>' +
                '</div>' +
                '<div class="account-error" id="accError" hidden></div>' +
                '<a class="auth-submit account-editor-link" id="accProfile">Мой профиль</a>' +
                '<div class="account-editor-slot" id="accountEditorSlot"></div>' +
                '<a class="auth-submit account-editor-link" href="/watch/connect.html">Мои часы</a>' +
                (appleEnabled
                    ? '<p class="account-notice" id="accAppleStatus" role="status" tabindex="-1"' + (appleLinked ? '>Вход с Apple подключён' : ' hidden>') + '</p>' +
                      (appleLinked ? '' :
                          '<details class="account-provider-link"><summary>Добавить вход с Apple</summary>' +
                          '<p>Аккаунт Apple и адрес, которым вы поделитесь, будут связаны с этим профилем Almanion.</p>' +
                          '<button type="button" class="account-google-btn" id="accAppleLink">Привязать Apple</button></details>')
                    : '') +
                '<button type="button" class="auth-submit account-signout" id="accSignout">Выйти</button>' +
            '</div>';
        ov.querySelector('#accProfile').href = profileUrl;
        const verifyLink = ov.querySelector('#accVerifyEmail');
        if (verifyLink) {
            verifyLink.href = profileUrl + '#email';
            verifyLink.addEventListener('click', hideOverlay);
        }
        refreshIdentity();
        const activeAccount = user;
        ov.querySelector('#accAppleLink')?.addEventListener('click', function () { popupAuth('apple', activeAccount); });
        ov.querySelector('#accClose').addEventListener('click', hideOverlay);
        ov.querySelector('#accSignout').addEventListener('click', function () {
            if (authBusy) return;
            setAuthBusy(true, 'Выходим…', 'signout');
            auth.signOut()
                .then(hideOverlay)
                .catch(function (err) { showError(authMessage(err)); })
                .finally(function () { setAuthBusy(false); });
        });
        showContentEditorLink(ov);
        ov.classList.remove('hidden');
        ov.setAttribute('aria-hidden', 'false');
        if (appleEnabled) updateAuthControls();
        ov.querySelector('#accProfile').focus({ preventScroll: true });
    }

    // ---------- Синхронизация прогресса ----------
    const volatileKcStores = new Map();

    function volatileKcKey(scope, key) { return String(scope || 'guest') + '|' + key; }
    function allKcKeys(scope) {
        const activeScope = String(scope || (user && user.uid) || 'guest');
        const scopedPrefix = activeScope + '|';
        const out = new Set();
        volatileKcStores.forEach(function (_, key) {
            if (key.indexOf(scopedPrefix) === 0) out.add(key.slice(scopedPrefix.length));
        });
        if (kcStorage) {
            kcStorage.list(activeScope, KC_PREFIX).forEach(function (key) { out.add(key); });
            return Array.from(out);
        }
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.indexOf(KC_PREFIX) === 0) out.add(k);
            }
        } catch (_) {}
        return Array.from(out);
    }
    function pageKey(storeKey) { return storeKey.replace(/[.#$/\[\]]/g, '_'); }
    function dataSyncApi() { return window.AlmanionDataSync || null; }

    function kcObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }

    function cloneKcValue(value) {
        if (value == null) return value;
        try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
    }

    function stableKcValue(value) {
        if (Array.isArray(value)) return value.map(stableKcValue);
        if (!value || typeof value !== 'object') return value;
        const out = {};
        Object.keys(value).sort().forEach(function (key) { out[key] = stableKcValue(value[key]); });
        return out;
    }

    function stableKcJson(value) {
        try { return JSON.stringify(stableKcValue(value)); } catch (_) { return String(value); }
    }

    function reviewEventId(event, fallbackId) {
        if (!event || typeof event !== 'object') return '';
        const id = event.id != null ? event.id : event.eventId;
        if (id != null && String(id)) return String(id);
        return fallbackId == null ? '' : String(fallbackId);
    }

    function reviewEventAt(event) {
        event = kcObject(event);
        return Number(event.at || event.reviewedAt || event.timestamp || event.updatedAt) || 0;
    }

    function reviewEventList(value) {
        if (Array.isArray(value)) return value.map(cloneKcValue).filter(function (event) { return event && typeof event === 'object'; });
        if (!value || typeof value !== 'object') return [];
        return Object.keys(value).map(function (key) {
            const event = cloneKcValue(value[key]);
            if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
            if (!reviewEventId(event)) event.id = key;
            return event;
        }).filter(Boolean);
    }

    function compareReviewEvents(a, b) {
        const atDiff = reviewEventAt(a) - reviewEventAt(b);
        if (atDiff) return atDiff > 0 ? 1 : -1;
        const aid = reviewEventId(a);
        const bid = reviewEventId(b);
        if (aid !== bid) return aid > bid ? 1 : -1;
        const aj = stableKcJson(a);
        const bj = stableKcJson(b);
        return aj === bj ? 0 : (aj > bj ? 1 : -1);
    }

    function mergeReviewEvents(a, b) {
        const events = new Map();
        reviewEventList(a).concat(reviewEventList(b)).forEach(function (event) {
            const explicitId = reviewEventId(event);
            const key = explicitId ? 'id:' + explicitId : 'legacy:' + stableKcJson(event);
            const previous = events.get(key);
            if (!previous) {
                events.set(key, cloneKcValue(event));
                return;
            }
            // Event ids are immutable. If an interrupted write nevertheless left
            // one side with a partial event, retain every field and resolve the
            // overlap deterministically so every tab converges on the same value.
            const winner = compareReviewEvents(previous, event) >= 0 ? previous : event;
            const loser = winner === previous ? event : previous;
            events.set(key, Object.assign({}, cloneKcValue(loser), cloneKcValue(winner)));
        });
        return Array.from(events.values()).sort(compareReviewEvents);
    }

    function explicitReviewEventIds(card) {
        const ids = new Set();
        reviewEventList(kcObject(card).reviewEvents).forEach(function (event) {
            const id = reviewEventId(event);
            if (id) ids.add(id);
        });
        return ids;
    }

    function isStrictSuperset(left, right) {
        if (left.size <= right.size) return false;
        for (const id of right) if (!left.has(id)) return false;
        return true;
    }

    function cardRevision(card) {
        card = kcObject(card);
        return Number(card.reviewRevision || card.stateRevision || card.revision
            || (card.__sync && card.__sync.revision)) || 0;
    }

    function compareCardStates(a, b) {
        if (a == null && b == null) return 0;
        if (a == null) return -1;
        if (b == null) return 1;
        if (typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) {
            const aj = stableKcJson(a), bj = stableKcJson(b);
            return aj === bj ? 0 : (aj > bj ? 1 : -1);
        }

        const aIds = explicitReviewEventIds(a);
        const bIds = explicitReviewEventIds(b);
        if (isStrictSuperset(aIds, bIds)) return 1;
        if (isStrictSuperset(bIds, aIds)) return -1;

        // v3 event histories provide a causal signal that is stronger than a
        // client clock. For divergent histories use revision/count first, then
        // a deterministic latest-event tie break. The legacy `last` comparison
        // remains the primary rule only for v2 cards without reviewEvents.
        if (aIds.size || bIds.size) {
            const vectors = [
                [cardRevision(a), cardRevision(b)],
                [aIds.size, bIds.size],
                [Number(a.reps) || 0, Number(b.reps) || 0]
            ];
            for (const pair of vectors) if (pair[0] !== pair[1]) return pair[0] > pair[1] ? 1 : -1;
            const aEvents = reviewEventList(a.reviewEvents).sort(compareReviewEvents);
            const bEvents = reviewEventList(b.reviewEvents).sort(compareReviewEvents);
            const latestCmp = compareReviewEvents(aEvents[aEvents.length - 1], bEvents[bEvents.length - 1]);
            if (latestCmp) return latestCmp;
        }

        const legacyVectors = [
            [Number(a.last) || 0, Number(b.last) || 0],
            [Number(a.updatedAt) || 0, Number(b.updatedAt) || 0],
            [cardRevision(a), cardRevision(b)],
            [Number(a.reps) || 0, Number(b.reps) || 0],
            [Number(a.lapses) || 0, Number(b.lapses) || 0]
        ];
        for (const pair of legacyVectors) if (pair[0] !== pair[1]) return pair[0] > pair[1] ? 1 : -1;
        const aj = stableKcJson(a), bj = stableKcJson(b);
        return aj === bj ? 0 : (aj > bj ? 1 : -1);
    }

    function mergeCardStates(a, b) {
        if (a == null) return cloneKcValue(b);
        if (b == null) return cloneKcValue(a);
        if (typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) {
            return cloneKcValue(compareCardStates(a, b) >= 0 ? a : b);
        }
        const useA = compareCardStates(a, b) >= 0;
        const winner = useA ? a : b;
        const loser = useA ? b : a;
        const out = Object.assign({}, cloneKcValue(loser), cloneKcValue(winner));
        if (Object.prototype.hasOwnProperty.call(a, 'reviewEvents')
            || Object.prototype.hasOwnProperty.call(b, 'reviewEvents')) {
            out.reviewEvents = mergeReviewEvents(a.reviewEvents, b.reviewEvents);
        }
        return out;
    }

    function parseKcStore(raw) {
        try {
            const parsed = JSON.parse(raw || '{}');
            return kcObject(parsed);
        } catch (_) { return {}; }
    }

    function getLocal(k, scope) {
        const activeScope = scope || (user && user.uid) || 'guest';
        const persisted = parseKcStore(kcStorage ? kcStorage.get(k, activeScope) : sGet(k));
        const volatile = volatileKcStores.get(volatileKcKey(activeScope, k));
        return volatile ? mergeStores(persisted, volatile) : persisted;
    }

    function reportKcPersistence(storeKey, persisted, source) {
        if (persisted !== false) return;
        console.warn('Almanion account: knowledge progress is kept in memory because local storage is unavailable.');
        try {
            window.dispatchEvent(new CustomEvent('kc-store-sync-status', {
                detail: { key: storeKey, persisted: false, source: source || 'account' }
            }));
        } catch (_) {}
    }

    function storeUpdatedAt(store) {
        store = store || {};
        let updatedAt = Number(store.__meta && store.__meta.updatedAt) || 0;
        reviewEventList(store.reviewEvents).forEach(function (event) {
            updatedAt = Math.max(updatedAt, reviewEventAt(event));
        });
        reviewEventList(store.__meta && store.__meta.reviewEvents).forEach(function (event) {
            updatedAt = Math.max(updatedAt, reviewEventAt(event));
        });
        Object.keys(store).forEach(function (key) {
            if (key === '__meta' || key === 'reviewEvents') return;
            // `due` is a future study deadline, not a modification time. Using it
            // here can make an older schedule overwrite answers from another device.
            const card = kcObject(store[key]);
            updatedAt = Math.max(updatedAt, Number(card.updatedAt) || 0, Number(card.last) || 0);
            reviewEventList(card.reviewEvents).forEach(function (event) {
                updatedAt = Math.max(updatedAt, reviewEventAt(event));
            });
        });
        return updatedAt;
    }

    function mergeStores(a, b) {
        a = a || {}; b = b || {};
        const out = {};
        const keys = new Set(Object.keys(a).concat(Object.keys(b)));
        keys.forEach(function (k) {
            if (k === '__meta') { out.__meta = mergeMeta(a.__meta, b.__meta); return; }
            if (k === 'reviewEvents') { out.reviewEvents = mergeReviewEvents(a.reviewEvents, b.reviewEvents); return; }
            const av = a[k], bv = b[k];
            out[k] = mergeCardStates(av, bv);
        });
        return out;
    }

    function hasContentEditorAccess(account) {
        if (!account) return Promise.resolve(false);
        const owner = account.uid === '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';
        return owner
            ? Promise.resolve(true)
            : db.ref('adminRoles/' + account.uid + '/contentEditor').once('value')
                .then(function (snapshot) { return snapshot.val() === true; })
                .catch(function () { return false; });
    }

    function hasSiteAdminAccess(account) {
        if (!account) return Promise.resolve(false);
        const owner = account.uid === '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';
        return owner
            ? Promise.resolve(true)
            : db.ref('adminRoles/' + account.uid + '/siteAdmin').once('value')
                .then(function (snapshot) { return snapshot.val() === true; })
                .catch(function () { return false; });
    }

    function hasEnglishAccess(account) {
        if (!account) return Promise.resolve(false);
        const owner = account.uid === '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';
        return owner
            ? Promise.resolve(true)
            : db.ref('adminRoles/' + account.uid + '/englishAccess').once('value')
                .then(function (snapshot) { return snapshot.val() === true; })
                .catch(function () { return false; });
    }

    function hasDutyEditorAccess(account) {
        if (!account) return Promise.resolve(false);
        const owner = account.uid === '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';
        return owner
            ? Promise.resolve(true)
            : db.ref('adminRoles/' + account.uid + '/dutyEditor').once('value')
                .then(function (snapshot) { return snapshot.val() === true; })
                .catch(function () { return false; });
    }

    function hasTourEditorAccess(account) {
        if (!account) return Promise.resolve(false);
        const owner = account.uid === '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';
        return owner
            ? Promise.resolve(true)
            : db.ref('adminRoles/' + account.uid + '/tourEditor').once('value')
                .then(function (snapshot) { return snapshot.val() === true; })
                .catch(function () { return false; });
    }

    function createHomeAccessLink(kind) {
        const link = document.createElement('a');
        link.className = 'home-editor-link';
        if (kind === 'planner') {
            link.id = 'homePlannerLink';
            link.href = 'planner.html';
            link.classList.add('home-planner-link');
            link.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3v3m12-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/><path d="M8 12h3v3H8z"/></svg><span>Планировщик</span>';
        } else if (kind === 'constructor') {
            link.id = 'homeConstructorLink';
            link.href = 'constructor.html';
            link.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg><span>Конструктор</span>';
        } else {
            link.id = 'homeAdminLink';
            link.href = 'admin.html';
            link.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6l7-3Z"/><path d="M9 12l2 2 4-4"/></svg><span>Админ-панель</span>';
        }
        return link;
    }

    function detachHomeRolesListener() {
        if (homeRolesRef && homeRolesHandler) {
            try { homeRolesRef.off('value', homeRolesHandler); } catch (_) {}
        }
        homeRolesRef = null;
        homeRolesHandler = null;
    }

    function clearHomeAccessLinks(slot) {
        slot.replaceChildren();
        slot.hidden = true;
        delete slot.dataset.accessSignature;
    }

    function renderHomeAccessLinks(slot, contentEditor, siteAdmin, plannerOwner) {
        const signature = (contentEditor ? '1' : '0') + (siteAdmin ? '1' : '0') + (plannerOwner ? '1' : '0');
        if (slot.dataset.accessSignature === signature) return;
        slot.dataset.accessSignature = signature;
        slot.replaceChildren();
        if (contentEditor) slot.appendChild(createHomeAccessLink('constructor'));
        if (siteAdmin) slot.appendChild(createHomeAccessLink('admin'));
        if (plannerOwner) slot.appendChild(createHomeAccessLink('planner'));
        slot.hidden = slot.childElementCount === 0;
    }

    function updateContestsLinks(allowed) {
        document.querySelectorAll('[data-contests-link]').forEach(link => { link.hidden = !allowed; });
    }

    function updateHomeAccessLinks() {
        updateContestsLinks(false);
        const slot = document.getElementById('homePrivilegedActions');
        if (!slot) return;
        const checkedUser = user;
        const generation = ++homeAccessGeneration;
        detachHomeRolesListener();
        clearHomeAccessLinks(slot);
        if (!checkedUser) return;
        const owner = checkedUser.uid === '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';
        if (owner) {
            renderHomeAccessLinks(slot, true, true, true);
            updateContestsLinks(!checkedUser.isAnonymous && !!checkedUser.email);
            return;
        }

        const rolesRef = db.ref('adminRoles/' + checkedUser.uid);
        const handleRoles = function (snapshot) {
            if (generation !== homeAccessGeneration || user !== checkedUser || !slot.isConnected) return;
            const roles = snapshot.val() || {};
            renderHomeAccessLinks(slot, roles.contentEditor === true, roles.siteAdmin === true, false);
            updateContestsLinks(!checkedUser.isAnonymous && !!checkedUser.email && roles.contestsAccess === true);
        };
        homeRolesRef = rolesRef;
        homeRolesHandler = handleRoles;
        rolesRef.on('value', handleRoles, function () {
            if (generation !== homeAccessGeneration || user !== checkedUser || !slot.isConnected) return;
            renderHomeAccessLinks(slot, false, false, false);
        });
    }

    function showContentEditorLink(overlay) {
        if (!user || !overlay) return;
        const slot = overlay.querySelector('#accountEditorSlot');
        if (!slot) return;
        hasContentEditorAccess(user).then(function (allowed) {
            if (!allowed || !slot.isConnected) return;
            const link = document.createElement('a');
            link.href = 'constructor.html';
            link.className = 'auth-submit account-editor-link';
            link.textContent = 'Конструктор конспектов';
            slot.appendChild(link);
        });
    }

    function mergeMeta(a, b) {
        a = a || {}; b = b || {};
        const aUpdatedAt = Number(a.updatedAt) || 0;
        const bUpdatedAt = Number(b.updatedAt) || 0;
        const newer = bUpdatedAt !== aUpdatedAt
            ? (bUpdatedAt > aUpdatedAt ? b : a)
            : (stableKcJson(b) >= stableKcJson(a) ? b : a);
        const older = newer === b ? a : b;
        const out = Object.assign({}, older, newer);
        // Две вкладки могут познакомить пользователя с новыми карточками в один
        // день. Берём больший счётчик, чтобы синхронизация не обнулила дневной лимит.
        if (a.introDate && a.introDate === b.introDate) {
            out.introDate = a.introDate;
            out.introCount = Math.max(a.introCount || 0, b.introCount || 0);
        }
        if (Object.prototype.hasOwnProperty.call(a, 'reviewEvents')
            || Object.prototype.hasOwnProperty.call(b, 'reviewEvents')) {
            out.reviewEvents = mergeReviewEvents(a.reviewEvents, b.reviewEvents);
        }
        out.schema = Math.max(Number(a.schema) || 0, Number(b.schema) || 0) || out.schema;
        out.updatedAt = Math.max(aUpdatedAt, bUpdatedAt);
        return out;
    }

    function applyRemotePage(storeKey, remoteStore, uid) {
        const scope = uid || (user && user.uid) || 'guest';
        const merged = mergeStores(getLocal(storeKey, scope), remoteStore);
        applyingRemote = true;
        let persisted = false;
        try { persisted = (kcStorage ? kcStorage.set(storeKey, JSON.stringify(merged), scope) : sSet(storeKey, JSON.stringify(merged))) === true; }
        catch (_) { persisted = false; }
        finally { applyingRemote = false; }
        const volatileKey = volatileKcKey(scope, storeKey);
        if (persisted) volatileKcStores.delete(volatileKey);
        else volatileKcStores.set(volatileKey, cloneKcValue(merged));
        reportKcPersistence(storeKey, persisted, 'cloud');
        if (window.KC && typeof window.KC.reload === 'function') {
            window.KC.reload(storeKey, cloneKcValue(merged), { persisted: persisted, source: 'cloud' });
        }
    }
    function pushPage(storeKey, suppliedStore, suppliedUpdatedAt) {
        if (!kcRef) return false;
        const hasSuppliedStore = suppliedStore && typeof suppliedStore === 'object' && !Array.isArray(suppliedStore);
        const local = hasSuppliedStore
            ? mergeStores(getLocal(storeKey, user && user.uid), suppliedStore)
            : getLocal(storeKey, user && user.uid);
        const updatedAt = Math.max(storeUpdatedAt(local), Number(suppliedUpdatedAt) || 0) || Date.now();
        if (kcStore) {
            try {
                kcStore.set(pageKey(storeKey), { key: storeKey, store: local }, { updatedAt: updatedAt });
                return true;
            } catch (err) {
                console.warn('Almanion account: progress could not be queued for sync.', err);
                reportKcPersistence(storeKey, false, 'sync-queue');
                return false;
            }
        }
        kcRef.child(pageKey(storeKey))
            .set(JSON.stringify({ key: storeKey, store: local }))
            .catch(function (err) { console.warn('Almanion account: progress sync failed.', err); });
        return true;
    }

    function startKcSync(uid) {
        stopKcSync();
        const generation = ++syncGeneration;
        kcRef = db.ref('kc/' + uid);
        const sync = dataSyncApi();
        if (sync) {
            kcStore = sync.createCollection({
                namespace: 'knowledgeCheck',
                owner: uid,
                storageKey: 'almanion_kc_sync_uid_' + uid,
                decodeRemote: function (remote) {
                    const records = {};
                    Object.keys(remote || {}).forEach(function (pk) {
                        try {
                            const blob = typeof remote[pk] === 'string' ? JSON.parse(remote[pk]) : remote[pk];
                            if (!blob || !blob.key) return;
                            records[pk] = {
                                key: blob.key,
                                store: blob.store || {},
                                updatedAt: storeUpdatedAt(blob.store || {}),
                                __sync: blob.__sync
                            };
                        } catch (_) {}
                    });
                    return records;
                },
                encodeRemote: function (record) {
                    const clean = sync.remoteRecord(record);
                    return JSON.stringify({ key: clean.key, store: clean.store, __sync: clean.__sync });
                },
                mergeRecord: function (localRecord, remoteRecord) {
                    const localMeta = sync.metadata(localRecord);
                    const remoteMeta = sync.metadata(remoteRecord);
                    if (localMeta.deleted || remoteMeta.deleted) {
                        return sync.compareRecords(localRecord, remoteRecord) >= 0 ? localRecord : remoteRecord;
                    }
                    const mergedStore = mergeStores(localRecord.store || {}, remoteRecord.store || {});
                    const winner = sync.compareRecords(localRecord, remoteRecord) >= 0 ? localRecord : remoteRecord;
                    const differsFromRemote = stableKcJson(mergedStore) !== stableKcJson(remoteRecord.store || {});
                    const updatedAt = Math.max(
                        localMeta.updatedAt,
                        remoteMeta.updatedAt,
                        storeUpdatedAt(mergedStore)
                    );
                    return {
                        key: winner.key || localRecord.key || remoteRecord.key,
                        store: mergedStore,
                        updatedAt: updatedAt,
                        __sync: {
                            schema: 1,
                            revision: Math.max(localMeta.revision, remoteMeta.revision) + (differsFromRemote ? 1 : 0),
                            updatedAt: updatedAt,
                            deviceId: differsFromRemote
                                ? (localMeta.deviceId || remoteMeta.deviceId)
                                : (sync.metadata(winner).deviceId || ''),
                            deleted: false,
                            pending: differsFromRemote
                        }
                    };
                },
                onChange: function (records, detail) {
                    if (generation !== syncGeneration || !user || user.uid !== uid) return;
                    if (detail && detail.type === 'error') {
                        console.warn('Almanion account: progress sync deferred.', detail.error);
                        return;
                    }
                    if (detail && (detail.type === 'set' || detail.type === 'ack')) return;
                    Object.keys(records || {}).forEach(function (pk) {
                        const record = records[pk];
                        if (record && record.key && !(record.__sync && record.__sync.deleted)) {
                            applyRemotePage(record.key, record.store || {}, uid);
                        }
                    });
                }
            });

            // Первый вход переносит имеющийся локальный прогресс. Сравниваем
            // содержимое по карточкам: одинаковое клиентское время не должно
            // скрыть карточку или событие, созданные в другой вкладке.
            allKcKeys(uid).forEach(function (storeKey) {
                const local = getLocal(storeKey, uid);
                if (!Object.keys(local).length) return;
                const id = pageKey(storeKey);
                const current = kcStore.get(id, { includeDeleted: true });
                const currentStore = current && !(current.__sync && current.__sync.deleted)
                    ? (current.store || {})
                    : {};
                const mergedStore = mergeStores(currentStore, local);
                if (!current || stableKcJson(mergedStore) !== stableKcJson(currentStore)) {
                    kcStore.set(id, { key: storeKey, store: mergedStore }, {
                        updatedAt: Math.max(
                            storeUpdatedAt(mergedStore),
                            current ? sync.metadata(current).updatedAt : 0
                        ) || Date.now(),
                        flush: false
                    });
                }
            });
            kcStore.connect(kcRef);
            return;
        }
        kcRef.once('value').then(function (snap) {
            if (generation !== syncGeneration || !user || user.uid !== uid || !kcRef) return;
            const remote = snap.val() || {};
            Object.keys(remote).forEach(function (pk) {
                try { const blob = JSON.parse(remote[pk]); if (blob && blob.key) applyRemotePage(blob.key, blob.store, uid); } catch (_) {}
            });
            // выгружаем все локальные страницы (объединённые) в облако
            allKcKeys(uid).forEach(function (storeKey) { pushPage(storeKey); });
            kcRef.on('value', onRemote, function () {});
        }).catch(function (err) {
            if (generation !== syncGeneration || !kcRef) return;
            console.warn('Almanion account: initial progress sync failed.', err);
            try { kcRef.on('value', onRemote, function () {}); } catch (_) {}
        });
    }
    function onRemote(snap) {
        const remote = snap.val() || {};
        Object.keys(remote).forEach(function (pk) {
            try { const blob = JSON.parse(remote[pk]); if (blob && blob.key) applyRemotePage(blob.key, blob.store, user && user.uid); } catch (_) {}
        });
    }
    function stopKcSync() {
        syncGeneration++;
        if (kcStore) { kcStore.disconnect(); kcStore = null; }
        if (kcRef) { try { kcRef.off(); } catch (_) {} kcRef = null; }
    }

    function startSettingsSync(uid) {
        settingsSyncUid = uid;
        const sync = dataSyncApi();
        const settingsApi = window.AlmanionSettings;
        if (!sync || !settingsApi || !settingsApi.ready || !user || user.uid !== uid) return;
        if (settingsStore) settingsStore.disconnect();

        const storageKey = 'almanion_settings_sync_uid_' + uid;
        const visualDefaultsVersion = Number(settingsApi.visualDefaultsVersion || 1);
        const mergeSettingsRecord = function (localRecord, remoteRecord) {
            const localValue = (localRecord && localRecord.value) || {};
            const remoteValue = (remoteRecord && remoteRecord.value) || {};
            const localVersion = Number(localValue.visualDefaultsVersion) || 0;
            const remoteVersion = Number(remoteValue.visualDefaultsVersion) || 0;

            // Once another device has completed the one-time migration, its
            // current preferences are authoritative and must not be reset again.
            if (remoteVersion >= visualDefaultsVersion) {
                if (localVersion < visualDefaultsVersion) return remoteRecord;
                return sync.compareRecords(localRecord, remoteRecord) >= 0 ? localRecord : remoteRecord;
            }
            if (localVersion >= visualDefaultsVersion) {
                const mergedValue = settingsApi.migrateVisualDefaults(Object.assign({}, localValue, remoteValue));
                const localMeta = sync.metadata(localRecord);
                const remoteMeta = sync.metadata(remoteRecord);
                return sync.normalizeRecord(Object.assign({}, localRecord, { value: mergedValue }), {
                    revision: Math.max(localMeta.revision, remoteMeta.revision),
                    updatedAt: Math.max(localMeta.updatedAt, remoteMeta.updatedAt),
                    deviceId: localMeta.deviceId,
                    pending: true
                });
            }
            return sync.compareRecords(localRecord, remoteRecord) >= 0 ? localRecord : remoteRecord;
        };
        let preferencesReady = false;
        const reconcilePreferences = function (records) {
            if (!settingsStore || !user || user.uid !== uid) return;
            const preferences = records && records.preferences;
            if (!preferences || (preferences.__sync && preferences.__sync.deleted)) {
                // Do not invent a fresh account value after a failed initial read:
                // it could overwrite an existing cloud preference set on another device.
                if (!settingsStore.remoteObserved || preferencesReady) return;
                const migrated = settingsApi.migrateVisualDefaults(settingsApi.get());
                preferencesReady = true;
                settingsApi.applySynced(migrated);
                settingsStore.set('preferences', { value: migrated }, { updatedAt: Date.now() });
                return;
            }

            const value = preferences.value || {};
            if (Number(value.visualDefaultsVersion) < visualDefaultsVersion) {
                const migrated = settingsApi.migrateVisualDefaults(value);
                preferencesReady = true;
                settingsApi.applySynced(migrated);
                settingsStore.set('preferences', { value: migrated }, { updatedAt: Date.now() });
                return;
            }
            preferencesReady = true;
            settingsApi.applySynced(value);
        };

        settingsStore = sync.createCollection({
            namespace: 'settings',
            owner: uid,
            storageKey: storageKey,
            mergeRecord: mergeSettingsRecord,
            onChange: function (records, detail) {
                if (!user || user.uid !== uid || settingsStore == null) return;
                if (detail && detail.type === 'error') {
                    console.warn('Almanion account: settings sync deferred.', detail.error);
                    return;
                }
                if (detail && (detail.type === 'set' || detail.type === 'ack')) return;
                reconcilePreferences(records);
            }
        });
        const activeStore = settingsStore;
        activeStore.connect(db.ref('userSettings/' + uid)).then(function () {
            if (settingsStore !== activeStore || !user || user.uid !== uid) return;
            reconcilePreferences(activeStore.snapshot({ includeDeleted: true }));
        });
    }

    function stopSettingsSync() {
        settingsSyncUid = null;
        if (settingsStore) settingsStore.disconnect();
        settingsStore = null;
    }

    function registerAccountDirectory(account) {
        if (!account || !account.uid || !account.email) return;
        db.ref('accountDirectory/' + account.uid).set({
            email: String(account.email).trim(),
            displayName: String(account.displayName || '').slice(0, 120),
            lastSeen: firebase.database.ServerValue.TIMESTAMP
        }).catch(function (err) {
            // Старые Firebase Rules могут ещё не содержать accountDirectory.
            // На вход и синхронизацию пользовательских данных это не влияет.
            console.warn('Almanion account: directory update failed.', err);
        });
    }

    // Локальные изменения прогресса (событие из knowledge-check.js) → выгрузка
    window.addEventListener('kc-store-changed', function (e) {
        if (applyingRemote) return;
        const detail = e && e.detail || {};
        const k = detail.key;
        if (!k) return;
        const hasPayload = detail.store && typeof detail.store === 'object' && !Array.isArray(detail.store);
        let payload = null;
        if (hasPayload) {
            // The event payload is the state that produced the event. Reading
            // localStorage again can return an older value after quota/private-mode
            // failures or a write from another tab.
            if (kcStorage && detail.scope && detail.scope !== user?.uid) return;
            payload = mergeStores(getLocal(k, user && user.uid), detail.store);
            if (detail.persisted === false) {
                volatileKcStores.set(volatileKcKey(user && user.uid, k), cloneKcValue(payload));
                reportKcPersistence(k, false, 'knowledge-check');
            } else if (detail.persisted === true) {
                volatileKcStores.delete(volatileKcKey(user && user.uid, k));
            }
        }
        if (!user || !kcRef) return;
        pushPage(k, payload, detail.updatedAt);
    });

    window.addEventListener('almanion-sync-retry', function () {
        if (user && kcRef) allKcKeys(user.uid).forEach(function (storeKey) { pushPage(storeKey); });
        if (kcStore) kcStore.flush();
        if (settingsStore) settingsStore.flush();
    });

    window.addEventListener('almanion-settings-ready', function () {
        if (user && settingsSyncUid === user.uid) startSettingsSync(user.uid);
    });

    window.addEventListener('almanion-settings-changed', function (event) {
        if (!user || !settingsStore) return;
        const detail = event && event.detail;
        if (!detail || !detail.settings) return;
        settingsStore.set('preferences', { value: detail.settings }, {
            updatedAt: Number(detail.updatedAt) || Date.now()
        });
    });

    // ---------- Состояние входа ----------
    auth.onAuthStateChanged(function (u) {
        authStateKnown = true;
        // Гость Матцентра не является зарегистрированным аккаунтом сайта.
        if (u && u.isAnonymous) u = null;
        if (user && user.uid !== u?.uid) {
            const overlay = document.getElementById('accountOverlay');
            if (overlay?.querySelector('#accIdentityName, #registrationComplete')) {
                hideOverlay();
                overlay.replaceChildren();
            }
        }
        user = u;
        watchIdentity(u);
        if (kcStorage) kcStorage.setScope(u ? u.uid : 'guest');
        updateButton();
        updateHomeAccessLinks();
        if (u) {
            registerAccountDirectory(u);
            startKcSync(u.uid);
            startSettingsSync(u.uid);
        } else {
            stopKcSync();
            stopSettingsSync();
        }
        window.dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user: user } }));
    }, function (err) {
        authStateKnown = true;
        user = null;
        watchIdentity(null);
        hideOverlay();
        if (kcStorage) kcStorage.setScope('guest');
        updateButton();
        updateHomeAccessLinks();
        console.warn('Almanion account: auth state restore failed.', err);
        window.dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user: null } }));
    });

    window.addEventListener('pageshow', function (event) {
        if (event.persisted) updateHomeAccessLinks();
    });

    window.addEventListener('pagehide', function (event) {
        if (!event.persisted) return;
        homeAccessGeneration++;
        updateContestsLinks(false);
        detachHomeRolesListener();
        const slot = document.getElementById('homePrivilegedActions');
        if (slot) clearHomeAccessLinks(slot);
    });

    window.AlmanionAccount = {
        open: onAccountClick,
        openLogin: function () { openLoginModal(false); },
        openAccount: function () { if (user) openAccountMenu(); else openLoginModal(false); },
        getUser: function () { return user; },
        isReady: function () { return authStateKnown; },
        profile: { icons: avatarIcons, colors: avatarColors, shapes: avatarShapes, avatarMarkup: avatarMarkup },
        hasContentEditorAccess: hasContentEditorAccess,
        hasSiteAdminAccess: hasSiteAdminAccess,
        hasEnglishAccess: hasEnglishAccess,
        hasDutyEditorAccess: hasDutyEditorAccess,
        hasTourEditorAccess: hasTourEditorAccess,
        exportData: function () {
            const sync = dataSyncApi();
            if (!sync) throw new Error('Слой синхронизации ещё не загружен');
            return sync.exportData();
        },
        importData: function (backup, options) {
            const sync = dataSyncApi();
            if (!sync) throw new Error('Слой синхронизации ещё не загружен');
            const changed = sync.importData(backup);
            window.dispatchEvent(new CustomEvent('almanion-data-imported', { detail: { changed: changed } }));
            if (!options || options.reload !== false) window.location.reload();
            return changed;
        },
        syncNow: function () {
            const tasks = [];
            if (kcStore) tasks.push(kcStore.flush());
            if (settingsStore) tasks.push(settingsStore.flush());
            window.dispatchEvent(new CustomEvent('almanion-sync-retry'));
            return Promise.all(tasks);
        },
        auth: auth,
        database: db
    };
    function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildButton);
    else buildButton();
})();
