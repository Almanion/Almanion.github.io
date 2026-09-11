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
    let googleAttemptId = 0;
    let homeAccessGeneration = 0;
    let homeRolesRef = null;
    let homeRolesHandler = null;
    let englishAccessGeneration = 0;
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

    function createHomeAccessLink(kind) {
        const link = document.createElement('a');
        link.className = 'home-editor-link';
        if (kind === 'constructor') {
            link.id = 'homeConstructorLink';
            link.href = 'constructor.html';
            link.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg><span>Открыть конструктор</span>';
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

    function renderHomeAccessLinks(slot, contentEditor, siteAdmin) {
        const signature = (contentEditor ? '1' : '0') + (siteAdmin ? '1' : '0');
        if (slot.dataset.accessSignature === signature) return;
        slot.dataset.accessSignature = signature;
        slot.replaceChildren();
        if (contentEditor) slot.appendChild(createHomeAccessLink('constructor'));
        if (siteAdmin) slot.appendChild(createHomeAccessLink('admin'));
        slot.hidden = slot.childElementCount === 0;
    }

    function updateHomeAccessLinks() {
        const slot = document.getElementById('homePrivilegedActions');
        if (!slot) return;
        const checkedUser = user;
        const generation = ++homeAccessGeneration;
        detachHomeRolesListener();
        clearHomeAccessLinks(slot);
        if (!checkedUser) return;
        const owner = checkedUser.uid === '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';
        if (owner) {
            renderHomeAccessLinks(slot, true, true);
            return;
        }

        const rolesRef = db.ref('adminRoles/' + checkedUser.uid);
        const handleRoles = function (snapshot) {
            if (generation !== homeAccessGeneration || user !== checkedUser || !slot.isConnected) return;
            const roles = snapshot.val() || {};
            renderHomeAccessLinks(slot, roles.contentEditor === true, roles.siteAdmin === true);
        };
        homeRolesRef = rolesRef;
        homeRolesHandler = handleRoles;
        rolesRef.on('value', handleRoles, function () {
            if (generation !== homeAccessGeneration || user !== checkedUser || !slot.isConnected) return;
            renderHomeAccessLinks(slot, false, false);
        });
    }

    function updateHomeEnglishCard() {
        const link = document.getElementById('homeEnglishCard');
        if (!link) return;
        const grid = link.closest('.subjects-grid');
        const checkedUser = user;
        const generation = ++englishAccessGeneration;
        link.hidden = true;
        if (grid) grid.classList.add('english-card-hidden');
        if (!checkedUser) return;
        hasEnglishAccess(checkedUser).then(function (allowed) {
            if (generation !== englishAccessGeneration || user !== checkedUser || !link.isConnected) return;
            link.hidden = !allowed;
            if (grid) grid.classList.toggle('english-card-hidden', !allowed);
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
        user = u;
        if (kcStorage) kcStorage.setScope(u ? u.uid : 'guest');
        updateButton();
        updateHomeAccessLinks();
        updateHomeEnglishCard();
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
        if (kcStorage) kcStorage.setScope('guest');
        updateButton();
        updateHomeAccessLinks();
        updateHomeEnglishCard();
        console.warn('Almanion account: auth state restore failed.', err);
    });

    window.addEventListener('pageshow', function (event) {
        if (event.persisted) updateHomeAccessLinks();
    });

    window.addEventListener('pagehide', function (event) {
        if (!event.persisted) return;
        homeAccessGeneration++;
        detachHomeRolesListener();
        const slot = document.getElementById('homePrivilegedActions');
        if (slot) clearHomeAccessLinks(slot);
    });

    window.AlmanionAccount = {
        open: onAccountClick,
        openLogin: function () { openLoginModal(false); },
        openAccount: function () { if (user) openAccountMenu(); else openLoginModal(false); },
        getUser: function () { return user; },
        hasContentEditorAccess: hasContentEditorAccess,
        hasSiteAdminAccess: hasSiteAdminAccess,
        hasEnglishAccess: hasEnglishAccess,
        hasDutyEditorAccess: hasDutyEditorAccess,
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
