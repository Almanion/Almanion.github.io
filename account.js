// ============================================
// АККАУНТ + СИНХРОНИЗАЦИЯ ПРОГРЕССА (Firebase Auth)
// ============================================
//
// Самодостаточный модуль: добавляет в шапку меню маленькую кнопку-иконку входа,
// окно входа (Google и почта+пароль) и синхронизирует прогресс «Проверки знаний»
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
    const sGet = window.safeStorageGet || function (k) { try { return localStorage.getItem(k); } catch (_) { return null; } };
    const sSet = window.safeStorageSet || function (k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } };

    let user = null;
    let kcRef = null;
    let applyingRemote = false;
    let authBusy = false;
    let authBusyTarget = '';
    let authStateKnown = false;
    let persistenceReady = false;
    let persistenceMode = 'local';
    let persistenceFailure = false;
    let syncGeneration = 0;
    let googleAttemptId = 0;
    let editorAccessGeneration = 0;
    let adminAccessGeneration = 0;
    const GOOGLE_POPUP_TIMEOUT_MS = 45000;

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
    const IC_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>';
    const IC_GOOGLE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
        '<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"/>' +
        '<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>' +
        '<path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"/>' +
        '<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>';

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
            document.body.appendChild(btn);
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
            const name = user.displayName || user.email || '';
            const initial = (name.trim()[0] || '?').toUpperCase();
            btn.classList.add('signed-in');
            btn.title = name || 'Аккаунт';
            btn.setAttribute('aria-label', 'Аккаунт: ' + (name || 'вошли'));
            btn.innerHTML = '<span class="account-avatar">' + escapeHtml(initial) + '</span>';
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
    function ensureOverlay() {
        let ov = document.getElementById('accountOverlay');
        if (ov) return ov;
        ov = document.createElement('div');
        ov.id = 'accountOverlay';
        ov.className = 'auth-overlay hidden';
        ov.addEventListener('click', function (e) { if (e.target === ov) hideOverlay(); });
        ov.setAttribute('aria-hidden', 'true');
        document.body.appendChild(ov);
        initSwipeClose(ov);
        return ov;
    }
    function hideOverlay() {
        const ov = document.getElementById('accountOverlay');
        if (ov) {
            ov.classList.add('hidden');
            ov.setAttribute('aria-hidden', 'true');
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
        function render() {
            ov.innerHTML =
                '<div class="auth-modal account-modal" role="dialog" aria-modal="true">' +
                    '<button class="kc-close" id="accClose" aria-label="Закрыть">' + IC_CLOSE + '</button>' +
                    '<div class="auth-icon">' + IC_USER + '</div>' +
                    '<h2>' + (mode === 'register' ? 'Регистрация' : 'Вход в аккаунт') + '</h2>' +
                    '<button type="button" class="account-google-btn" id="accGoogle">' + IC_GOOGLE + '<span>Войти через Google</span></button>' +
                    '<div class="account-or"><span>или</span></div>' +
                    '<form id="accForm" autocomplete="on">' +
                        '<input type="email" id="accEmail" placeholder="Почта" autocomplete="email" required>' +
                        '<input type="password" id="accPass" placeholder="Пароль (не менее 6 символов)" autocomplete="' + (mode === 'register' ? 'new-password' : 'current-password') + '" required minlength="6">' +
                        (mode === 'register'
                            ? '<input type="password" id="accPassConfirm" placeholder="Повторите пароль" autocomplete="new-password" required minlength="6">'
                            : '') +
                        '<div class="account-error" id="accError" hidden></div>' +
                        '<div class="account-notice" id="accStorageNotice" hidden></div>' +
                        '<button type="submit" class="auth-submit" id="accSubmit">' + (mode === 'register' ? 'Зарегистрироваться' : 'Войти') + '</button>' +
                    '</form>' +
                    '<button type="button" class="account-link" id="accToggle">' +
                        (mode === 'register' ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться') +
                    '</button>' +
                '</div>';
            ov.querySelector('#accClose').addEventListener('click', hideOverlay);
            ov.querySelector('#accGoogle').addEventListener('click', signInGoogle);
            ov.querySelector('#accToggle').addEventListener('click', function () {
                mode = (mode === 'register') ? 'login' : 'register';
                render();
            });
            ov.querySelector('#accForm').addEventListener('submit', function (e) {
                e.preventDefault();
                const email = ov.querySelector('#accEmail').value.trim();
                const pass = ov.querySelector('#accPass').value;
                if (mode === 'register') {
                    const confirmationInput = ov.querySelector('#accPassConfirm');
                    if (!confirmationInput || pass !== confirmationInput.value) {
                        showError('Пароли не совпадают. Проверьте оба поля.');
                        if (confirmationInput) confirmationInput.focus();
                        return;
                    }
                    doEmail(function () { return auth.createUserWithEmailAndPassword(email, pass); });
                } else {
                    doEmail(function () { return auth.signInWithEmailAndPassword(email, pass); });
                }
            });
            updateAuthControls();
        }
        render();
        ov.classList.remove('hidden');
        ov.setAttribute('aria-hidden', 'false');
        const email = ov.querySelector('#accEmail');
        if (email) setTimeout(function () { try { email.focus(); } catch (_) {} }, 0);
    }

    function doEmail(action) {
        if (authBusy) return;
        clearError();
        setAuthBusy(true, 'Входим…', 'email');
        persistencePromise
            .then(function () {
                if (!persistenceReady) throw { code: 'auth/web-storage-unsupported' };
                return action();
            })
            .then(function () { hideOverlay(); })
            .catch(function (err) { showError(authMessage(err)); })
            .finally(function () { setAuthBusy(false); });
    }

    function signInGoogle() {
        if (authBusy) return;
        clearError();
        if (!persistenceReady) {
            showError('Хранилище авторизации ещё не готово. Подождите секунду и повторите вход.');
            return;
        }

        const attemptId = ++googleAttemptId;
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        setAuthBusy(true, 'Завершите вход в окне Google', 'google');

        // Вызов должен происходить непосредственно из клика: иначе браузер может
        // заблокировать popup. Таймер не отменяет Firebase-запрос, но возвращает
        // управление форме, если встроенный браузер не сообщил о закрытии окна.
        const watchdog = setTimeout(function () {
            if (attemptId !== googleAttemptId || !authBusy || authBusyTarget !== 'google') return;
            googleAttemptId++;
            setAuthBusy(false);
            showError('Окно Google не завершило вход. Закройте его и повторите попытку. Если окно не открылось, разрешите всплывающие окна или войдите по почте.');
        }, GOOGLE_POPUP_TIMEOUT_MS);

        let popupPromise;
        try {
            popupPromise = auth.signInWithPopup(provider);
        } catch (err) {
            clearTimeout(watchdog);
            showError(authMessage(err));
            setAuthBusy(false);
            return;
        }

        popupPromise
            .then(function () {
                if (attemptId === googleAttemptId || !authBusy) hideOverlay();
            })
            .catch(function (err) {
                if (attemptId !== googleAttemptId) return;
                console.warn('Almanion account: Google sign-in failed.', err);
                showError(authMessage(err));
            })
            .finally(function () {
                clearTimeout(watchdog);
                if (attemptId === googleAttemptId) setAuthBusy(false);
            });
    }

    function setAuthBusy(value, label, target) {
        authBusy = value;
        authBusyTarget = value ? (target || '') : '';
        updateAuthControls(label);
    }

    function updateAuthControls(label) {
        const google = document.getElementById('accGoogle');
        const submit = document.getElementById('accSubmit');
        const signout = document.getElementById('accSignout');
        const notice = document.getElementById('accStorageNotice');
        if (google) {
            google.disabled = authBusy || !persistenceReady;
            const googleLabel = google.querySelector('span');
            if (googleLabel) googleLabel.textContent = authBusyTarget === 'google' && label
                ? label
                : 'Войти через Google';
        }
        if (submit) {
            submit.disabled = authBusy || !persistenceReady;
            if (!authBusy) submit.textContent = submit.closest('.auth-modal')?.querySelector('h2')?.textContent === 'Регистрация'
                ? 'Зарегистрироваться' : 'Войти';
            else if (authBusyTarget === 'email' && label) submit.textContent = label;
        }
        if (signout) {
            signout.disabled = authBusy;
            signout.textContent = authBusyTarget === 'signout' && label ? label : 'Выйти';
        }
        if (notice) {
            notice.hidden = persistenceMode === 'local' || persistenceFailure;
            notice.textContent = persistenceMode === 'session'
                ? 'В приватном режиме вход сохранится только до закрытия браузера.'
                : 'Вход сохранится только до обновления этой вкладки.';
        }
        if (persistenceFailure) showError('Браузер полностью запретил хранилище авторизации. Разрешите данные сайта и обновите страницу.');
    }

    function clearError() {
        const el = document.getElementById('accError');
        if (el) { el.textContent = ''; el.hidden = true; }
    }
    function showError(msg) {
        const el = document.getElementById('accError');
        if (el) { el.textContent = msg; el.hidden = false; }
    }
    function authMessage(err) {
        const c = (err && err.code) || '';
        if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found') return 'Неверная почта или пароль.';
        if (c === 'auth/email-already-in-use') return 'Эта почта уже зарегистрирована — войдите.';
        if (c === 'auth/weak-password') return 'Пароль слишком короткий (мин. 6 символов).';
        if (c === 'auth/invalid-email') return 'Некорректная почта.';
        if (c === 'auth/popup-closed-by-user') return 'Окно Google закрыто до завершения входа.';
        if (c === 'auth/popup-blocked') return 'Браузер заблокировал окно Google. Разрешите всплывающие окна для этого сайта и повторите вход.';
        if (c === 'auth/operation-not-supported-in-this-environment') return 'Этот браузер не поддерживает окно входа Google. Откройте сайт в обычном браузере или войдите по почте.';
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
        ov.innerHTML =
            '<div class="auth-modal account-modal" role="dialog" aria-modal="true">' +
                '<button class="kc-close" id="accClose" aria-label="Закрыть">' + IC_CLOSE + '</button>' +
                '<div class="auth-icon">' + IC_USER + '</div>' +
                '<h2>Вы вошли</h2>' +
                '<p class="account-email">' + escapeHtml(email) + '</p>' +
                '<div class="account-error" id="accError" hidden></div>' +
                '<div class="account-editor-slot" id="accountEditorSlot"></div>' +
                '<button type="button" class="auth-submit account-signout" id="accSignout">Выйти</button>' +
            '</div>';
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
    }

    // ---------- Синхронизация прогресса ----------
    function allKcKeys() {
        const out = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.indexOf(KC_PREFIX) === 0) out.push(k);
            }
        } catch (_) {}
        return out;
    }
    function pageKey(storeKey) { return storeKey.replace(/[.#$/\[\]]/g, '_'); }
    function getLocal(k) { try { return JSON.parse(sGet(k) || '{}') || {}; } catch (_) { return {}; } }

    function mergeStores(a, b) {
        a = a || {}; b = b || {};
        const out = {};
        const keys = new Set(Object.keys(a).concat(Object.keys(b)));
        keys.forEach(function (k) {
            if (k === '__meta') { out.__meta = mergeMeta(a.__meta, b.__meta); return; }
            const av = a[k], bv = b[k];
            if (av && bv) out[k] = ((bv.last || 0) >= (av.last || 0)) ? bv : av; // позже повторённая версия побеждает
            else out[k] = av || bv;
        });
        return out;
    }

    function hasContentEditorAccess(account) {
        if (!account) return Promise.resolve(false);
        const owner = String(account.email || '').trim().toLowerCase() === 'dmb23930@gmail.com';
        return owner
            ? Promise.resolve(true)
            : db.ref('adminRoles/' + account.uid + '/contentEditor').once('value')
                .then(function (snapshot) { return snapshot.val() === true; })
                .catch(function () { return false; });
    }

    function hasSiteAdminAccess(account) {
        if (!account) return Promise.resolve(false);
        const owner = String(account.email || '').trim().toLowerCase() === 'dmb23930@gmail.com';
        return owner
            ? Promise.resolve(true)
            : db.ref('adminRoles/' + account.uid + '/siteAdmin').once('value')
                .then(function (snapshot) { return snapshot.val() === true; })
                .catch(function () { return false; });
    }

    function updateHomeEditorLink() {
        const link = document.getElementById('homeConstructorLink');
        if (!link) return;
        const checkedUser = user;
        const generation = ++editorAccessGeneration;
        link.hidden = true;
        if (!checkedUser) return;
        hasContentEditorAccess(checkedUser).then(function (allowed) {
            if (generation !== editorAccessGeneration || user !== checkedUser || !link.isConnected) return;
            link.hidden = !allowed;
        });
    }

    function updateHomeAdminLink() {
        const link = document.getElementById('homeAdminLink');
        if (!link) return;
        const checkedUser = user;
        const generation = ++adminAccessGeneration;
        link.hidden = true;
        if (!checkedUser) return;
        hasSiteAdminAccess(checkedUser).then(function (allowed) {
            if (generation !== adminAccessGeneration || user !== checkedUser || !link.isConnected) return;
            link.hidden = !allowed;
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
        const newer = (b.updatedAt || 0) >= (a.updatedAt || 0) ? b : a;
        const older = newer === b ? a : b;
        const out = Object.assign({}, older, newer);
        // Две вкладки могут познакомить пользователя с новыми карточками в один
        // день. Берём больший счётчик, чтобы синхронизация не обнулила дневной лимит.
        if (a.introDate && a.introDate === b.introDate) {
            out.introDate = a.introDate;
            out.introCount = Math.max(a.introCount || 0, b.introCount || 0);
        }
        out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
        return out;
    }

    function applyRemotePage(storeKey, remoteStore) {
        const merged = mergeStores(getLocal(storeKey), remoteStore);
        applyingRemote = true;
        sSet(storeKey, JSON.stringify(merged));
        applyingRemote = false;
        if (window.KC && typeof window.KC.reload === 'function') window.KC.reload(storeKey);
    }
    function pushPage(storeKey) {
        if (!kcRef) return;
        kcRef.child(pageKey(storeKey))
            .set(JSON.stringify({ key: storeKey, store: getLocal(storeKey) }))
            .catch(function (err) { console.warn('Almanion account: progress sync failed.', err); });
    }

    function startKcSync(uid) {
        stopKcSync();
        const generation = ++syncGeneration;
        kcRef = db.ref('kc/' + uid);
        kcRef.once('value').then(function (snap) {
            if (generation !== syncGeneration || !user || user.uid !== uid || !kcRef) return;
            const remote = snap.val() || {};
            Object.keys(remote).forEach(function (pk) {
                try { const blob = JSON.parse(remote[pk]); if (blob && blob.key) applyRemotePage(blob.key, blob.store); } catch (_) {}
            });
            // выгружаем все локальные страницы (объединённые) в облако
            allKcKeys().forEach(pushPage);
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
            try { const blob = JSON.parse(remote[pk]); if (blob && blob.key) applyRemotePage(blob.key, blob.store); } catch (_) {}
        });
    }
    function stopKcSync() {
        syncGeneration++;
        if (kcRef) { try { kcRef.off(); } catch (_) {} kcRef = null; }
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
        if (!user || !kcRef || applyingRemote) return;
        const k = e && e.detail && e.detail.key;
        if (k) pushPage(k);
    });

    // ---------- Состояние входа ----------
    auth.onAuthStateChanged(function (u) {
        authStateKnown = true;
        user = u;
        updateButton();
        updateHomeEditorLink();
        updateHomeAdminLink();
        if (u) {
            registerAccountDirectory(u);
            startKcSync(u.uid);
        } else stopKcSync();
        window.dispatchEvent(new CustomEvent('almanion-account-ready', { detail: { user: user } }));
    }, function (err) {
        authStateKnown = true;
        user = null;
        updateButton();
        updateHomeEditorLink();
        updateHomeAdminLink();
        console.warn('Almanion account: auth state restore failed.', err);
    });

    window.AlmanionAccount = {
        open: onAccountClick,
        openLogin: function () { openLoginModal(false); },
        openAccount: function () { if (user) openAccountMenu(); else openLoginModal(false); },
        getUser: function () { return user; },
        auth: auth,
        database: db
    };
    function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildButton);
    else buildButton();
})();
