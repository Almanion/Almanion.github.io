// ============================================
// АНАЛИТИКА И ОПРОСЫ (для всех страниц)
// ============================================

(function() {
    'use strict';

    // Проверяем, что Firebase загружен и конфиг заполнен
    if (typeof firebase === 'undefined') return;
    if (!firebaseConfig || firebaseConfig.apiKey === "ВСТАВЬ_СВОЙ_API_KEY") {
        console.warn('⚠️ Firebase конфиг не настроен. Аналитика отключена.');
        return;
    }

    // Инициализация Firebase (только если ещё не инициализирован)
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    const db = firebase.database();
    const VISITOR_ID_KEY = 'almanion_visitor_id';
    const VISITOR_NAME_KEY = 'almanion_visitor_name';

    // ============================================
    // УНИКАЛЬНЫЙ ID ПОСЕТИТЕЛЯ
    // ============================================

    function safeGet(key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    }
    function safeSet(key, value) {
        try { localStorage.setItem(key, value); } catch (_) { /* приватный режим / quota */ }
    }

    function getVisitorId() {
        let id = safeGet(VISITOR_ID_KEY);
        if (!id) {
            id = 'v_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            safeSet(VISITOR_ID_KEY, id);
        }
        return id;
    }

    const visitorId = getVisitorId();

    // ============================================
    // ТРЕКИНГ ПРИСУТСТВИЯ (КТО ОНЛАЙН)
    // ============================================

    let presenceIntervalId = null;

    function trackPresence() {
        const presenceRef = db.ref('presence/' + visitorId);
        const connectedRef = db.ref('.info/connected');

        connectedRef.on('value', (snap) => {
            if (snap.val() === true) {
                // Устанавливаем данные присутствия
                presenceRef.set({
                    visitorId: visitorId,
                    page: location.pathname,
                    pageTitle: document.title,
                    timestamp: firebase.database.ServerValue.TIMESTAMP,
                    userAgent: navigator.userAgent.substring(0, 100)
                });

                // При отключении — удаляем
                presenceRef.onDisconnect().remove();
            }
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
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const visitorRef = db.ref('visitors/' + visitorId);

        // set() гарантированно создаёт/обновляет узел без необходимости чтения
        visitorRef.child('lastVisit').set(firebase.database.ServerValue.TIMESTAMP);
        visitorRef.child('lastPage').set(location.pathname);
        visitorRef.child('visitCount').set(firebase.database.ServerValue.increment(1));

        visitorRef.child('id').set(visitorId).then(() => {
            console.log('✅ Visitor registered:', visitorId);
        }).catch(err => {
            console.error('❌ Visitor registration failed:', err.message);
        });

        // Счётчик уникальных посетителей за день
        db.ref('dailyStats/' + today + '/' + visitorId).set(true);
    }

    // ============================================
    // ПРИЁМ ОПРОСОВ ОТ АДМИНИСТРАТОРА
    // ============================================

    function listenForPolls() {
        const pollsRef = db.ref('polls');

        pollsRef.orderByChild('active').equalTo(true).on('value', (snapshot) => {
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
        });
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
        db.ref('pollResponses/' + pollId + '/' + visitorId).set({
            optionIndex: optionIndex,
            optionText: optionText,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            page: location.pathname
        });

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

        dmRef.on('child_added', (snapshot) => {
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
        });
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

    function init() {
        try {
            trackPresence();
            registerVisitor();
            listenForPolls();
            listenForDirectMessages();
        } catch (e) {
            console.warn('⚠️ Ошибка инициализации аналитики:', e);
        }
    }

    // Ждём загрузки DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
