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
    try { auth = firebase.auth(); db = firebase.database(); } catch (_) { return; }

    const KC_PREFIX = 'kc_fsrs_';
    const sGet = window.safeStorageGet || function (k) { try { return localStorage.getItem(k); } catch (_) { return null; } };
    const sSet = window.safeStorageSet || function (k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } };

    let user = null;
    let kcRef = null;
    let applyingRemote = false;

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
        if (!header) return;
        if (document.getElementById('accountBtn')) return;
        let container = header.querySelector('.sidebar-header-buttons');
        if (!container) {
            container = document.createElement('div');
            container.className = 'sidebar-header-buttons';
            header.appendChild(container);
        }
        const btn = document.createElement('button');
        btn.id = 'accountBtn';
        btn.className = 'account-btn';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Войти в аккаунт');
        btn.innerHTML = IC_USER;
        btn.addEventListener('click', onAccountClick);
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
        document.body.appendChild(ov);
        return ov;
    }
    function hideOverlay() {
        const ov = document.getElementById('accountOverlay');
        if (ov) ov.classList.add('hidden');
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
                        '<div class="account-error" id="accError" hidden></div>' +
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
                if (mode === 'register') doEmail(auth.createUserWithEmailAndPassword(email, pass));
                else doEmail(auth.signInWithEmailAndPassword(email, pass));
            });
        }
        render();
        ov.classList.remove('hidden');
    }

    function doEmail(promise) {
        const sub = document.getElementById('accSubmit');
        if (sub) { sub.disabled = true; }
        promise.then(function () { hideOverlay(); }).catch(function (err) { showError(authMessage(err)); })
            .finally(function () { if (sub) sub.disabled = false; });
    }
    function signInGoogle() {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).then(function () { hideOverlay(); }).catch(function (err) { showError(authMessage(err)); });
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
        if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return 'Вход отменён.';
        if (c === 'auth/operation-not-allowed') return 'Этот способ входа не включён в Firebase.';
        if (c === 'auth/unauthorized-domain') return 'Домен не разрешён в настройках Firebase Auth.';
        return (err && err.message) || 'Не удалось войти.';
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
                '<button type="button" class="auth-submit account-signout" id="accSignout">Выйти</button>' +
            '</div>';
        ov.querySelector('#accClose').addEventListener('click', hideOverlay);
        ov.querySelector('#accSignout').addEventListener('click', function () {
            auth.signOut().then(hideOverlay);
        });
        ov.classList.remove('hidden');
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
            if (k === '__meta') { out.__meta = a.__meta || b.__meta; return; }
            const av = a[k], bv = b[k];
            if (av && bv) out[k] = ((bv.last || 0) >= (av.last || 0)) ? bv : av; // позже повторённая версия побеждает
            else out[k] = av || bv;
        });
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
        kcRef.child(pageKey(storeKey)).set(JSON.stringify({ key: storeKey, store: getLocal(storeKey) }));
    }

    function startKcSync(uid) {
        kcRef = db.ref('kc/' + uid);
        kcRef.once('value').then(function (snap) {
            const remote = snap.val() || {};
            Object.keys(remote).forEach(function (pk) {
                try { const blob = JSON.parse(remote[pk]); if (blob && blob.key) applyRemotePage(blob.key, blob.store); } catch (_) {}
            });
            // выгружаем все локальные страницы (объединённые) в облако
            allKcKeys().forEach(pushPage);
            kcRef.on('value', onRemote, function () {});
        }).catch(function () {
            try { kcRef.on('value', onRemote, function () {}); } catch (_) {}
        });
    }
    function onRemote(snap) {
        const remote = snap.val() || {};
        Object.keys(remote).forEach(function (pk) {
            try { const blob = JSON.parse(remote[pk]); if (blob && blob.key) applyRemotePage(blob.key, blob.store); } catch (_) {}
        });
    }
    function stopKcSync() { if (kcRef) { try { kcRef.off(); } catch (_) {} kcRef = null; } }

    // Локальные изменения прогресса (событие из knowledge-check.js) → выгрузка
    window.addEventListener('kc-store-changed', function (e) {
        if (!user || !kcRef || applyingRemote) return;
        const k = e && e.detail && e.detail.key;
        if (k) pushPage(k);
    });

    // ---------- Состояние входа ----------
    auth.onAuthStateChanged(function (u) {
        user = u;
        updateButton();
        if (u) startKcSync(u.uid); else stopKcSync();
    });

    function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildButton);
    else buildButton();
})();
