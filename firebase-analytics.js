// ============================================
// АНАЛИТИКА И ОПРОСЫ (для всех страниц)
// ============================================

(function() {
    'use strict';

    // Проверяем, что Firebase загружен и конфиг заполнен
    // Analytics uses the signed-in account UID when one exists. Signed-out
    // visitors receive a Firebase Anonymous Auth UID in a secondary app, so
    // analytics authentication never changes the site's account session.
    if (typeof firebase === 'undefined') return;
    if (!firebaseConfig || firebaseConfig.apiKey === "ВСТАВЬ_СВОЙ_API_KEY") {
        console.warn('⚠️ Firebase конфиг не настроен. Аналитика отключена.');
        return;
    }

    // Инициализация Firebase (только если ещё не инициализирован)
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    const primaryApp = firebase.app();
    const primaryAuth = typeof firebase.auth === 'function' ? primaryApp.auth() : null;
    let db = null;
    let identityProvider = '';
    let identityContext = 'web';
    let visitorId = '';
    let identityGeneration = 0;
    let identityCleanup = [];
    const VISITOR_ID_KEY = 'almanion_visitor_id';

    // ============================================
    // УНИКАЛЬНЫЙ ID ПОСЕТИТЕЛЯ
    // ============================================

    function safeGet(key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    }
    function safeSet(key, value) {
        try { localStorage.setItem(key, value); } catch (_) { /* приватный режим / quota */ }
    }

    function getBrowserContext() {
        const ua = String(navigator.userAgent || '');
        const referrer = String(document.referrer || '');
        let referrerHost = '';
        try { referrerHost = new URL(referrer).hostname; } catch (_) {}
        return /Telegram|TelegramBot|\bTG\//i.test(ua) || /(^|\.)t\.me$/i.test(referrerHost)
            ? 'telegram'
            : 'web';
    }

    function providerFor(user) {
        if (!user) return '';
        if (user.isAnonymous) return 'anonymous';
        const providers = Array.isArray(user.providerData) ? user.providerData : [];
        return String(providers[0] && providers[0].providerId || 'account');
    }

    function getTelemetryApp() {
        const existing = firebase.apps.find(function (app) { return app.name === 'almanion-telemetry'; });
        return existing || firebase.initializeApp(firebaseConfig, 'almanion-telemetry');
    }

    async function getAnonymousIdentity() {
        const app = getTelemetryApp();
        const auth = app.auth();
        try {
            await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        } catch (_) {
            await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).catch(function () {});
        }
        let account = auth.currentUser;
        if (!account) account = (await auth.signInAnonymously()).user;
        return { user: account, database: app.database(), provider: 'anonymous' };
    }

    function identityMeta() {
        return {
            visitorId: visitorId,
            authProvider: identityProvider,
            browserContext: identityContext
        };
    }

    // ============================================
    // ТРЕКИНГ ПРИСУТСТВИЯ (КТО ОНЛАЙН)
    // ============================================

    let presenceIntervalId = null;
    let usageIntervalId = null;
    let usageSessionRef = null;
    let usageSessionStartedAt = 0;

    function trackPresence() {
        const presenceRef = db.ref('presence/' + visitorId);
        const connectedRef = db.ref('.info/connected');

        const onConnected = (snap) => {
            if (snap.val() === true) {
                // Устанавливаем данные присутствия
                presenceRef.set(Object.assign(identityMeta(), {
                    page: location.pathname,
                    pageTitle: document.title,
                    timestamp: firebase.database.ServerValue.TIMESTAMP,
                    userAgent: navigator.userAgent.substring(0, 100)
                }));

                // При отключении — удаляем
                presenceRef.onDisconnect().remove();
            }
        };
        connectedRef.on('value', onConnected);
        identityCleanup.push(function () {
            connectedRef.off('value', onConnected);
            presenceRef.onDisconnect().cancel().catch(function () {});
            presenceRef.remove().catch(function () {});
        });

        // Обновляем текущую страницу каждые 30 секунд
        // Сохраняем id, чтобы можно было очистить при уходе со страницы.
        if (presenceIntervalId) clearInterval(presenceIntervalId);
        presenceIntervalId = setInterval(() => {
            // visibilitychange optimization: не дёргаем Firebase, если вкладка скрыта
            if (document.visibilityState === 'hidden') return;
            presenceRef.update({
                page: location.pathname,
                pageTitle: document.title,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        }, 30000);
    }

    // Очищаем interval при выходе со страницы (и pagehide для мобильного Safari/iOS).
    function cleanupPresence() {
        if (presenceIntervalId) {
            clearInterval(presenceIntervalId);
            presenceIntervalId = null;
        }
    }
    window.addEventListener('beforeunload', cleanupPresence);
    window.addEventListener('pagehide', cleanupPresence);

    // ============================================
    // РЕГИСТРАЦИЯ УНИКАЛЬНОГО ПОСЕТИТЕЛЯ
    // ============================================

    function registerVisitor() {
        const today = localDayKey(new Date());
        const visitorRef = db.ref('visitors/' + visitorId);
        const meta = identityMeta();
        visitorRef.transaction(function (current) {
            const value = current && typeof current === 'object' ? current : {};
            return Object.assign({}, meta, {
                id: visitorId,
                firstVisit: Number(value.firstVisit) || firebase.database.ServerValue.TIMESTAMP,
                lastVisit: firebase.database.ServerValue.TIMESTAMP,
                lastPage: String(location.pathname || '/').slice(0, 180),
                pageViews: Math.max(0, Number(value.pageViews || value.visitCount) || 0) + 1
            });
        }).catch(function (err) {
            console.warn('Almanion analytics: visitor registration deferred.', err);
        });

        db.ref('dailyStats/' + today + '/' + visitorId).set(Object.assign({}, meta, {
            lastVisit: firebase.database.ServerValue.TIMESTAMP
        })).catch(function () {});
    }

    function localDayKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
    }

    function getUsageDevice() {
        const ua = navigator.userAgent || '';
        if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet';
        if (/Mobile|Android|iPhone|iPod/i.test(ua)) return 'mobile';
        return 'desktop';
    }

    function getReferrerHost() {
        if (!document.referrer) return 'direct';
        try {
            const host = new URL(document.referrer).hostname;
            return host === location.hostname ? 'internal' : (host || 'direct');
        } catch (_) {
            return 'direct';
        }
    }

    function trackUsageSession() {
        const today = localDayKey(new Date());
        usageSessionStartedAt = Date.now();
        usageSessionRef = db.ref('analyticsSessions/' + today + '/' + visitorId).push();
        const sessionData = Object.assign(identityMeta(), {
            page: String(location.pathname || '/').slice(0, 180),
            pageTitle: String(document.title || '').slice(0, 180),
            startedAt: firebase.database.ServerValue.TIMESTAMP,
            lastActive: firebase.database.ServerValue.TIMESTAMP,
            durationSeconds: 0,
            device: getUsageDevice(),
            referrerHost: getReferrerHost().slice(0, 120)
        });

        const updateDuration = (force) => {
            if (!usageSessionRef || (!force && document.hidden)) return;
            const durationSeconds = Math.max(0, Math.min(86400, Math.round((Date.now() - usageSessionStartedAt) / 1000)));
            usageSessionRef.update({
                durationSeconds: durationSeconds,
                lastActive: firebase.database.ServerValue.TIMESTAMP
            }).catch(() => {});
        };

        usageSessionRef.set(sessionData).then(() => {
            if (usageIntervalId) clearInterval(usageIntervalId);
            usageIntervalId = setInterval(() => updateDuration(false), 30000);
            const onVisibility = () => updateDuration(document.hidden);
            const onPageHide = () => updateDuration(true);
            document.addEventListener('visibilitychange', onVisibility);
            window.addEventListener('pagehide', onPageHide);
            identityCleanup.push(function () {
                document.removeEventListener('visibilitychange', onVisibility);
                window.removeEventListener('pagehide', onPageHide);
            });
        }).catch(() => {
            // Пока новые Firebase Rules ещё не опубликованы, не повторяем
            // заведомо запрещённую запись каждые 30 секунд.
            usageSessionRef = null;
        });
    }

    // ============================================
    // ПРИЁМ ОПРОСОВ ОТ АДМИНИСТРАТОРА
    // ============================================

    function listenForPolls() {
        const pollsRef = db.ref('polls');
        const query = pollsRef.orderByChild('active').equalTo(true);
        const handlePolls = (snapshot) => {
            snapshot.forEach((childSnap) => {
                const poll = childSnap.val();
                const pollId = childSnap.key;

                // Проверяем, не отвечали ли уже
                let answeredPolls = {};
                try { answeredPolls = JSON.parse(safeGet('almanion_answered_polls') || '{}'); } catch (_) { answeredPolls = {}; }
                if (answeredPolls[pollId]) return;

                // Показываем опрос
                showPoll(pollId, poll);
            });
        };
        query.on('value', handlePolls);
        identityCleanup.push(function () { query.off('value', handlePolls); });
    }

    function showPoll(pollId, poll) {
        // Удаляем предыдущий опрос, если есть
        const existing = document.getElementById('almanion-poll-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'almanion-poll-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.6); z-index: 100000;
            display: flex; align-items: center; justify-content: center;
            padding: 1rem; backdrop-filter: blur(4px);
            animation: pollFadeIn 0.3s ease;
        `;

        const isDark = document.body.classList.contains('dark-theme');

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: ${isDark ? '#1e293b' : '#ffffff'};
            border-radius: 16px; padding: 2rem; max-width: 480px; width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            color: ${isDark ? '#f1f5f9' : '#1e293b'};
            position: relative;
        `;

        const title = document.createElement('h3');
        title.textContent = poll.question || 'Опрос';
        title.style.cssText = `
            margin: 0 0 0.5rem 0; font-size: 1.3rem; font-weight: 700;
            color: ${isDark ? '#f1f5f9' : '#1e293b'};
        `;

        const subtitle = document.createElement('p');
        subtitle.textContent = poll.description || '';
        subtitle.style.cssText = `
            margin: 0 0 1.5rem 0; font-size: 0.95rem;
            color: ${isDark ? '#a8b8cc' : '#6c757d'};
        `;

        const optionsContainer = document.createElement('div');
        optionsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 0.75rem;';

        const options = poll.options || [];
        options.forEach((option, index) => {
            const btn = document.createElement('button');
            btn.textContent = option;
            btn.style.cssText = `
                padding: 0.85rem 1.25rem; border: 2px solid ${isDark ? '#334155' : '#e2e8f0'};
                border-radius: 12px; background: ${isDark ? '#0f172a' : '#f8fafc'};
                color: ${isDark ? '#f1f5f9' : '#1e293b'};
                font-size: 1rem; cursor: pointer; transition: all 0.2s ease;
                text-align: left; font-family: inherit;
            `;
            btn.addEventListener('mouseenter', () => {
                btn.style.borderColor = '#3b82f6';
                btn.style.background = isDark ? '#1e3a5f' : '#eff6ff';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.borderColor = isDark ? '#334155' : '#e2e8f0';
                btn.style.background = isDark ? '#0f172a' : '#f8fafc';
            });
            btn.addEventListener('click', () => {
                submitPollResponse(pollId, index, option, overlay);
            });
            optionsContainer.appendChild(btn);
        });

        // Кнопка "Пропустить"
        const skipBtn = document.createElement('button');
        skipBtn.textContent = 'Пропустить';
        skipBtn.style.cssText = `
            margin-top: 1rem; padding: 0.6rem; border: none;
            background: transparent; color: ${isDark ? '#64748b' : '#94a3b8'};
            font-size: 0.9rem; cursor: pointer; font-family: inherit;
            transition: color 0.2s;
        `;
        skipBtn.addEventListener('mouseenter', () => { skipBtn.style.color = isDark ? '#a8b8cc' : '#6c757d'; });
        skipBtn.addEventListener('mouseleave', () => { skipBtn.style.color = isDark ? '#64748b' : '#94a3b8'; });
        skipBtn.addEventListener('click', () => {
            markPollAnswered(pollId);
            overlay.remove();
        });

        modal.appendChild(title);
        if (poll.description) modal.appendChild(subtitle);
        modal.appendChild(optionsContainer);
        modal.appendChild(skipBtn);
        overlay.appendChild(modal);

        // Добавляем CSS анимацию
        if (!document.getElementById('poll-animation-style')) {
            const style = document.createElement('style');
            style.id = 'poll-animation-style';
            style.textContent = `
                @keyframes pollFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes pollSlideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `;
            document.head.appendChild(style);
        }
        modal.style.animation = 'pollSlideUp 0.3s ease';

        document.body.appendChild(overlay);
    }

    function submitPollResponse(pollId, optionIndex, optionText, overlay) {
        // Сохраняем ответ в Firebase
        db.ref('pollResponses/' + pollId + '/' + visitorId).set(Object.assign(identityMeta(), {
            optionIndex: optionIndex,
            optionText: optionText,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            page: location.pathname
        }));

        markPollAnswered(pollId);

        // Показываем благодарность
        const modal = overlay.querySelector('div');
        modal.innerHTML = `
            <div style="text-align: center; padding: 2rem 0;">
                <div style="font-size: 3rem; margin-bottom: 1rem;"><span class="eic eic-check" aria-hidden="true"></span></div>
                <h3 style="margin: 0 0 0.5rem 0; color: inherit;">Спасибо!</h3>
                <p style="margin: 0; opacity: 0.7;">Ваш ответ записан</p>
            </div>
        `;

        setTimeout(() => {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.3s ease';
            setTimeout(() => overlay.remove(), 300);
        }, 1500);
    }

    function markPollAnswered(pollId) {
        let answered = {};
        try { answered = JSON.parse(safeGet('almanion_answered_polls') || '{}'); } catch (_) { answered = {}; }
        answered[pollId] = Date.now();
        safeSet('almanion_answered_polls', JSON.stringify(answered));
    }

    // ============================================
    // ЛИЧНЫЕ СООБЩЕНИЯ ОТ АДМИНИСТРАТОРА
    // ============================================

    function listenForDirectMessages() {
        const dmRef = db.ref('directMessages/' + visitorId);
        const handleMessage = (snapshot) => {
            const msg = snapshot.val();
            const msgId = snapshot.key;
            if (!msg || msg.read) return;

            // Помечаем как прочитанное
            dmRef.child(msgId).update({ read: true, readAt: firebase.database.ServerValue.TIMESTAMP });

            // Если это опрос — показываем как опрос
            if (msg.options && msg.options.length > 0) {
                showPoll('dm_' + msgId, {
                    question: msg.message,
                    description: msg.description || null,
                    options: msg.options
                });
            } else {
                // Простое сообщение — показываем уведомление
                showDirectMessage(msgId, msg);
            }
        };
        dmRef.on('child_added', handleMessage);
        identityCleanup.push(function () { dmRef.off('child_added', handleMessage); });
    }

    function showDirectMessage(msgId, msg) {
        const existing = document.getElementById('almanion-dm-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'almanion-dm-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.6); z-index: 100000;
            display: flex; align-items: center; justify-content: center;
            padding: 1rem; backdrop-filter: blur(4px);
            animation: pollFadeIn 0.3s ease;
        `;

        const isDark = document.body.classList.contains('dark-theme');

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: ${isDark ? '#1e293b' : '#ffffff'};
            border-radius: 16px; padding: 2rem; max-width: 480px; width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            color: ${isDark ? '#f1f5f9' : '#1e293b'};
            text-align: center;
        `;

        modal.innerHTML = `
            <div style="font-size: 2rem; margin-bottom: 1rem;"><span class="eic eic-chat" aria-hidden="true"></span></div>
            <h3 style="margin: 0 0 1rem 0; font-size: 1.2rem; font-weight: 700;">Сообщение от администратора</h3>
            <p style="margin: 0 0 1.5rem 0; font-size: 1rem; line-height: 1.6; color: ${isDark ? '#cbd5e1' : '#374151'};">${msg.message.replace(/\n/g, '<br>')}</p>
            <button style="
                padding: 0.7rem 2rem; border: none; border-radius: 10px;
                background: #3b82f6; color: white; font-size: 1rem;
                cursor: pointer; font-family: inherit; font-weight: 600;
            ">Понятно</button>
        `;

        modal.querySelector('button').addEventListener('click', () => {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.3s ease';
            setTimeout(() => overlay.remove(), 300);
        });

        // Добавляем CSS анимацию если нет
        if (!document.getElementById('poll-animation-style')) {
            const style = document.createElement('style');
            style.id = 'poll-animation-style';
            style.textContent = `
                @keyframes pollFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes pollSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            `;
            document.head.appendChild(style);
        }
        modal.style.animation = 'pollSlideUp 0.3s ease';

        overlay.appendChild(modal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.style.opacity = '0';
                overlay.style.transition = 'opacity 0.3s ease';
                setTimeout(() => overlay.remove(), 300);
            }
        });

        document.body.appendChild(overlay);
    }

    // ============================================
    // ЗАПУСК
    // ============================================

    function trackPerformanceMetrics() {
        if (!window.performance || !usageSessionRef) return;
        const values = { lcp: 0, cls: 0, inp: 0, failedResources: 0 };
        const observers = [];
        const onResourceError = function (event) {
            const target = event && event.target;
            if (target && target !== window && (target.src || target.href)) values.failedResources += 1;
        };
        window.addEventListener('error', onResourceError, true);

        function observe(type, callback) {
            if (typeof PerformanceObserver !== 'function') return;
            try {
                const observer = new PerformanceObserver(function (list) {
                    list.getEntries().forEach(callback);
                });
                observer.observe({ type: type, buffered: true });
                observers.push(observer);
            } catch (_) {}
        }

        observe('largest-contentful-paint', function (entry) {
            values.lcp = Math.max(values.lcp, Math.round(entry.startTime || 0));
        });
        observe('layout-shift', function (entry) {
            if (!entry.hadRecentInput) values.cls += Number(entry.value) || 0;
        });
        observe('event', function (entry) {
            if (entry.interactionId) values.inp = Math.max(values.inp, Math.round(entry.duration || 0));
        });

        let deployment = 'unknown';
        fetch('/_build.json', { cache: 'force-cache' })
            .then(function (response) { return response.ok ? response.json() : null; })
            .then(function (metadata) {
                const revision = metadata && metadata.source && metadata.source.revision;
                if (revision) deployment = String(revision).slice(0, 40);
            })
            .catch(function () {});

        const metricRef = db.ref('webVitals/' + localDayKey(new Date()) + '/' + visitorId + '/' + usageSessionRef.key);
        const metricIdentity = identityMeta();
        let sent = false;
        function send() {
            if (sent) return;
            sent = true;
            const navigation = performance.getEntriesByType('navigation')[0];
            metricRef.set(Object.assign({}, metricIdentity, {
                page: String(location.pathname || '/').slice(0, 180),
                deployment: deployment,
                lcp: Math.max(0, Math.min(120000, Math.round(values.lcp))),
                cls: Math.max(0, Math.min(100, Math.round(values.cls * 10000) / 10000)),
                inp: Math.max(0, Math.min(120000, Math.round(values.inp))),
                navigationMs: Math.max(0, Math.min(120000, Math.round(navigation && navigation.duration || 0))),
                failedResources: Math.max(0, Math.min(100, values.failedResources)),
                recordedAt: firebase.database.ServerValue.TIMESTAMP
            })).catch(function () {});
        }

        const timer = window.setTimeout(send, 10000);
        const onPageHide = send;
        window.addEventListener('pagehide', onPageHide);
        identityCleanup.push(function () {
            window.clearTimeout(timer);
            window.removeEventListener('error', onResourceError, true);
            window.removeEventListener('pagehide', onPageHide);
            observers.forEach(function (observer) { observer.disconnect(); });
            send();
        });
    }

    function stopIdentityTracking() {
        if (presenceIntervalId) clearInterval(presenceIntervalId);
        if (usageIntervalId) clearInterval(usageIntervalId);
        presenceIntervalId = null;
        usageIntervalId = null;
        identityCleanup.splice(0).forEach(function (cleanup) {
            try { cleanup(); } catch (_) {}
        });
        usageSessionRef = null;
    }

    function startTracking(selection) {
        stopIdentityTracking();
        identityProvider = selection.provider || providerFor(selection.user);
        identityContext = getBrowserContext();
        visitorId = selection.user.uid;
        db = selection.database;
        safeSet(VISITOR_ID_KEY, visitorId);
        trackPresence();
        registerVisitor();
        trackUsageSession();
        trackPerformanceMetrics();
        listenForPolls();
        listenForDirectMessages();
        window.AlmanionAnalyticsIdentity = Object.freeze({
            id: visitorId,
            provider: identityProvider,
            context: identityContext,
            isAccount: identityProvider !== 'anonymous'
        });
        window.dispatchEvent(new CustomEvent('almanion:analytics-identity', {
            detail: window.AlmanionAnalyticsIdentity
        }));
    }

    async function selectIdentity(account) {
        if (account && !account.isAnonymous) {
            return { user: account, database: primaryApp.database(), provider: providerFor(account) };
        }
        return getAnonymousIdentity();
    }

    function init() {
        if (primaryAuth) {
            primaryAuth.onAuthStateChanged(async function (account) {
                const generation = ++identityGeneration;
                try {
                    const selection = await selectIdentity(account);
                    if (generation !== identityGeneration) return;
                    startTracking(selection);
                } catch (error) {
                    console.warn('Almanion analytics: authenticated telemetry is unavailable.', error);
                }
            });
            return;
        }
        console.warn('Almanion analytics: Firebase Auth is unavailable; telemetry is disabled.');
    }

    // Ждём загрузки DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
