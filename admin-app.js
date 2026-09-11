// Основная логика панели управления. Загружается после Firebase.
'use strict';

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

if (firebaseConfig.apiKey === "ВСТАВЬ_СВОЙ_API_KEY") {
    document.querySelector('.login-card').innerHTML = `
        <h1><span class="eic eic-warn" aria-hidden="true"></span> Настройка</h1>
        <p style="color: #f59e0b;">Firebase конфиг не заполнен.<br>Отредактируй <code>firebase-config.js</code></p>
    `;
}

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const SITE_OWNER_EMAIL = 'dmb23930@gmail.com';
const SITE_OWNER_UID = '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';

// ============================================
// КЭШ ИМЁН ПОСЕТИТЕЛЕЙ
// ============================================

let visitorNamesCache = {};

function loadVisitorNames() {
    db.ref('visitorNames').on('value', (snapshot) => {
        visitorNamesCache = snapshot.val() || {};
        // Перерисовываем таблицы при обновлении имён
        if (lastOnlineSnapshot) renderOnlineTable(lastOnlineSnapshot);
        if (lastVisitorsSnapshot) renderAllVisitors(lastVisitorsSnapshot, visitorsListPeriod);
    });
}

function getVisitorDisplayName(visitorId) {
    return visitorNamesCache[visitorId] || null;
}

async function renameVisitor(visitorId) {
    const currentName = visitorNamesCache[visitorId] || '';
    const shortId = visitorId.substring(0, 15);
    const name = await AdminUI.prompt(
        `ID: ${shortId}…\nОставьте поле пустым, чтобы убрать имя.`,
        currentName,
        { title: 'Имя посетителя', inputLabel: 'Отображаемое имя', confirmLabel: 'Сохранить' }
    );
    if (name === null) return; // Отмена

    const action = name.trim() === ''
        ? db.ref('visitorNames/' + visitorId).remove()
        : db.ref('visitorNames/' + visitorId).set(name.trim());

    action.catch(err => {
        console.error('Ошибка переименования:', err);
        AdminUI.notify('Не удалось сохранить имя: ' + err.message, { tone: 'error' });
    });
}

// ============================================
// АВТОРИЗАЦИЯ
// ============================================

const loginScreen = document.getElementById('loginScreen');
const dashboard = document.getElementById('dashboard');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginError = document.getElementById('loginError');

loginBtn.addEventListener('click', login);
document.getElementById('loginPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
});
document.getElementById('loginEmail').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('loginPassword').focus();
});
logoutBtn.addEventListener('click', () => auth.signOut());

function login() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showLoginError('Заполните все поля');
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Вход...';

    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            loginError.style.display = 'none';
        })
        .catch((error) => {
            let msg = 'Ошибка входа';
            if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                msg = 'Неверный email или пароль';
            } else if (error.code === 'auth/too-many-requests') {
                msg = 'Слишком много попыток. Попробуйте позже';
            } else if (error.code === 'auth/invalid-credential') {
                msg = 'Неверный email или пароль';
            }
            showLoginError(msg);
            loginBtn.disabled = false;
            loginBtn.textContent = 'Войти';
        });
}

function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.style.display = 'block';
}

// Одного Firebase-входа недостаточно: любой посетитель может создать
// обычный аккаунт на сайте. Право администратора хранится отдельно в
// /adminRoles/<uid>/siteAdmin и дополнительно проверяется правилами Realtime Database.
let adminAuthCheckGeneration = 0;

auth.onAuthStateChanged(async (user) => {
    const generation = ++adminAuthCheckGeneration;
    if (user) {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Проверка доступа...';
        try {
            let hasAccess = user.uid === SITE_OWNER_UID;
            if (!hasAccess) {
                const accessSnapshot = await db.ref('adminRoles/' + user.uid + '/siteAdmin').once('value');
                hasAccess = accessSnapshot.val() === true;
            }
            if (generation !== adminAuthCheckGeneration) return;
            if (!hasAccess) {
                await auth.signOut();
                showLoginError('У этого аккаунта нет прав администратора');
                return;
            }

            loginError.style.display = 'none';
            loginScreen.style.display = 'none';
            dashboard.style.display = 'block';
            document.getElementById('adminEmail').textContent = user.email;
            initDashboard();
        } catch (error) {
            if (generation !== adminAuthCheckGeneration) return;
            await auth.signOut().catch(() => {});
            showLoginError('Не удалось проверить права администратора');
        }
    } else {
        loginScreen.style.display = 'flex';
        dashboard.style.display = 'none';
        loginBtn.disabled = false;
        loginBtn.textContent = 'Войти';
    }
});

// ============================================
// DASHBOARD: СТАТИСТИКА РЕАЛЬНОГО ВРЕМЕНИ
// ============================================

let dashboardInitialized = false;

function initDashboard() {
    if (dashboardInitialized) return;
    dashboardInitialized = true;

    loadVisitorNames();
    listenOnlineUsers();
    loadUniqueVisitors();
    loadTodayVisitors();
    listenPolls();
    initPollForm();
    loadAllVisitors('all');
}

// --- Онлайн пользователи ---
let lastOnlineSnapshot = null;

function listenOnlineUsers() {
    db.ref('presence').on('value', (snapshot) => {
        const data = snapshot.val() || {};
        lastOnlineSnapshot = data;

        const users = Object.values(data);
        document.getElementById('onlineCount').textContent = users.length;

        renderOnlineTable(data);
    });
}

function renderOnlineTable(data) {
    const users = Object.values(data || {});
    const tbody = document.getElementById('onlineTableBody');

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">Никого нет онлайн</td></tr>';
        return;
    }

    users.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    tbody.innerHTML = users.map(user => {
        const vid = user.visitorId || '?';
        const name = getVisitorDisplayName(vid);
        const shortId = vid.substring(0, 12);
        const isMobile = /Mobile|Android|iPhone|iPad/i.test(user.userAgent || '');
        const deviceClass = isMobile ? 'device-mobile' : 'device-desktop';
        const deviceLabel = isMobile ? '<span class="eic eic-phone" aria-hidden="true"></span> Мобильный' : '<span class="eic eic-laptop" aria-hidden="true"></span> Десктоп';
        const page = (user.page || '/').replace(/^\//, '') || 'index';
        const pageDisplay = page.replace('.html', '');
        const timeAgo = getTimeAgo(user.timestamp);

        const nameHtml = name
            ? `<span class="visitor-name" onclick="renameVisitor(${inlineArg(vid)})" title="Клик для переименования">
                   <span class="name-label">${escapeHtml(name)}</span>
                   <span class="name-id">${shortId}…</span>
                   <span class="edit-icon"><span class="eic eic-pen" aria-hidden="true"></span></span>
               </span>`
            : `<span class="visitor-name" onclick="renameVisitor(${inlineArg(vid)})" title="Клик для присвоения имени">
                   <code style="font-size:0.8rem; color:var(--text-secondary)">${shortId}…</code>
                   <span class="edit-icon"><span class="eic eic-pen" aria-hidden="true"></span></span>
               </span>`;

        return `<tr>
            <td>${nameHtml}</td>
            <td><span class="page-badge">${escapeHtml(pageDisplay)}</span></td>
            <td><span class="device-badge ${deviceClass}">${deviceLabel}</span></td>
            <td style="color:var(--text-secondary)">${timeAgo}</td>
            <td style="white-space:nowrap;">
                <button class="action-btn" onclick="openVisitorProfile(${inlineArg(vid)})" title="Профиль посетителя"><span class="eic eic-clip" aria-hidden="true"></span></button>
                <button class="action-btn" onclick="openDirectMessage(${inlineArg(vid)})" title="Написать сообщение"><span class="eic eic-mail" aria-hidden="true"></span></button>
            </td>
        </tr>`;
    }).join('');
}

function getTimeAgo(timestamp) {
    if (!timestamp) return '—';
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 10) return 'только что';
    if (diff < 60) return `${diff}с назад`;
    if (diff < 3600) return `${Math.floor(diff / 60)}м назад`;
    return `${Math.floor(diff / 3600)}ч назад`;
}

// --- Уникальные посетители ---
function loadUniqueVisitors() {
    db.ref('accountDirectory').on('value', (snapshot) => {
        const data = snapshot.val() || {};
        const accountCount = Object.entries(data).filter(([uid, account]) => (
            uid && account && typeof account === 'object' && typeof account.email === 'string'
        )).length;
        document.getElementById('uniqueCount').textContent = accountCount;
    });
}

// --- Посетители сегодня ---
function loadTodayVisitors() {
    const now = new Date();
    const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    db.ref('dailyStats/' + today).on('value', (snapshot) => {
        const data = snapshot.val() || {};
        const identities = Object.values(data).filter(value => value && typeof value === 'object');
        const accounts = identities.filter(value => value.authProvider && value.authProvider !== 'anonymous').length;
        const anonymous = identities.filter(value => value.authProvider === 'anonymous').length;
        const accountCounter = document.getElementById('todayCount');
        const anonymousCounter = document.getElementById('anonymousTodayCount');
        accountCounter.textContent = accounts;
        accountCounter.title = accounts + ' стабильных UID зарегистрированных аккаунтов';
        anonymousCounter.textContent = anonymous;
        anonymousCounter.title = anonymous + ' браузерных профилей; это не число уникальных людей';
    });
}

// ============================================
// ПРОФИЛЬ ПОСЕТИТЕЛЯ (ИСТОРИЯ)
// ============================================

function openVisitorProfile(visitorId) {
    const name = getVisitorDisplayName(visitorId);
    const displayName = name || visitorId.substring(0, 20) + '…';
    const existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
        <div class="modal profile-modal">
            <div class="profile-header">
                <div class="profile-avatar"><span class="eic eic-user" aria-hidden="true"></span></div>
                <div class="profile-info">
                    <h3>${escapeHtml(displayName)}
                        <span class="edit-icon" style="cursor:pointer; font-size:0.8rem; opacity:0.5;" onclick="renameVisitor(${inlineArg(visitorId)})" title="Переименовать"><span class="eic eic-pen" aria-hidden="true"></span></span>
                    </h3>
                    <div class="profile-id">${escapeHtml(visitorId)}</div>
                </div>
            </div>
            <div class="modal-body" id="profileBody">
                <div class="history-empty pulse">Загрузка истории...</div>
            </div>
            <div class="modal-actions" style="padding-top:1rem; border-top: 1px solid var(--border); flex-shrink:0;">
                <button class="btn btn-outline btn-sm" onclick="openDirectMessage(${inlineArg(visitorId)}); this.closest('.modal-overlay').remove();"><span class="eic eic-mail" aria-hidden="true"></span> Написать</button>
                <button class="btn btn-outline btn-sm" onclick="this.closest('.modal-overlay').remove()">Закрыть</button>
            </div>
        </div>
    `;

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
    currentProfileVisitorId = visitorId;
    loadVisitorProfile(visitorId);
}

async function loadVisitorProfile(visitorId) {
    const body = document.getElementById('profileBody');
    if (!body) return;

    const allItems = [];

    try {
        // 1. Загружаем отправленные личные сообщения
        const dmSnap = await db.ref('directMessages/' + visitorId).once('value');
        const dms = dmSnap.val() || {};
        for (const [msgId, msg] of Object.entries(dms)) {
            if (msg.type === 'poll') {
                // Проверяем, ответил ли посетитель на личный опрос
                let answerText = null;
                try {
                    const dmRespSnap = await db.ref('pollResponses/dm_' + msgId + '/' + visitorId).once('value');
                    const dmResp = dmRespSnap.val();
                    if (dmResp) {
                        answerText = dmResp.optionText || (msg.options ? msg.options[dmResp.optionIndex] : '?');
                    }
                } catch (e) { /* нет доступа — пропускаем */ }

                allItems.push({
                    time: msg.timestamp || 0,
                    type: 'dm-poll',
                    typeLabel: '<span class="eic eic-chart" aria-hidden="true"></span> Личный опрос',
                    text: msg.message,
                    extra: answerText
                        ? '<span class="eic eic-check" aria-hidden="true"></span> Ответ: ' + answerText
                        : '<span class="eic eic-clock" aria-hidden="true"></span> Варианты: ' + (msg.options || []).join(', ') + ' (нет ответа)',
                    read: msg.read,
                    deletePath: 'directMessages/' + visitorId + '/' + msgId
                });
            } else {
                allItems.push({
                    time: msg.timestamp || 0,
                    type: 'msg',
                    typeLabel: '<span class="eic eic-chat" aria-hidden="true"></span> Сообщение',
                    text: msg.message,
                    extra: null,
                    read: msg.read,
                    deletePath: 'directMessages/' + visitorId + '/' + msgId
                });
            }
        }

        // 2. Загружаем ответы на глобальные опросы
        const pollsSnap = await db.ref('polls').once('value');
        const polls = pollsSnap.val() || {};

        for (const [pollId, poll] of Object.entries(polls)) {
            const respSnap = await db.ref('pollResponses/' + pollId + '/' + visitorId).once('value');
            const resp = respSnap.val();
            if (resp) {
                allItems.push({
                    time: resp.timestamp || 0,
                    type: 'vote',
                    typeLabel: '<span class="eic eic-check" aria-hidden="true"></span> Ответ на опрос',
                    text: poll.question || '(без вопроса)',
                    extra: resp.optionText || (poll.options ? poll.options[resp.optionIndex] : '?'),
                    read: null,
                    deletePath: 'pollResponses/' + pollId + '/' + visitorId
                });
            }
        }

        // Сортируем по времени (новые сверху)
        allItems.sort((a, b) => b.time - a.time);

        if (allItems.length === 0) {
            body.innerHTML = '<div class="history-empty">Нет истории для этого посетителя</div>';
            return;
        }

        // Группируем: сообщения и ответы
        const messagesHtml = allItems.filter(i => i.type === 'msg' || i.type === 'dm-poll').map(item => renderHistoryItem(item)).join('');
        const votesHtml = allItems.filter(i => i.type === 'vote').map(item => renderHistoryItem(item)).join('');

        let html = '';

        if (messagesHtml) {
            html += `<div class="profile-section">
                <div class="profile-section-title"><span class="eic eic-mail" aria-hidden="true"></span> Отправленные сообщения (${allItems.filter(i => i.type === 'msg' || i.type === 'dm-poll').length})</div>
                ${messagesHtml}
            </div>`;
        }

        if (votesHtml) {
            html += `<div class="profile-section">
                <div class="profile-section-title"><span class="eic eic-chart" aria-hidden="true"></span> Ответы на опросы (${allItems.filter(i => i.type === 'vote').length})</div>
                ${votesHtml}
            </div>`;
        }

        body.innerHTML = html;

    } catch (err) {
        console.error('Ошибка загрузки профиля:', err);
        body.innerHTML = `<div class="history-empty"><span class="eic eic-alert" aria-hidden="true"></span> Ошибка: ${escapeHtml(err.message)}</div>`;
    }
}

// Текущий visitorId профиля (для перезагрузки после удаления)
let currentProfileVisitorId = null;

function renderHistoryItem(item) {
    const time = item.time ? formatDate(item.time) : '—';
    const typeClass = 'history-type-' + item.type.replace('-', '-');
    const readBadge = item.read === true ? ' <span class="eic eic-check" aria-hidden="true"></span>' : (item.read === false ? ' (не прочитано)' : '');

    let extraHtml = '';
    if (item.type === 'vote') {
        extraHtml = `<div class="history-answer">→ ${escapeHtml(item.extra)}</div>`;
    } else if (item.extra) {
        extraHtml = `<div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.25rem;">${escapeHtml(item.extra)}</div>`;
    }

    const deleteBtn = item.deletePath
        ? `<button class="action-btn" style="width:24px; height:24px; font-size:0.7rem;" onclick="deleteHistoryItem(${inlineArg(item.deletePath)})" title="Удалить"><span class="eic eic-trash" aria-hidden="true"></span></button>`
        : '';

    return `
        <div class="history-item">
            <div class="history-meta">
                <span class="history-type ${typeClass}">${item.typeLabel}${readBadge}</span>
                <span style="display:flex; align-items:center; gap:0.4rem;">
                    ${deleteBtn}
                    <span class="history-time">${time}</span>
                </span>
            </div>
            <div class="history-text">${escapeHtml(item.text)}</div>
            ${extraHtml}
        </div>
    `;
}

async function deleteHistoryItem(path) {
    if (!await AdminUI.confirm('Запись исчезнет из истории посещений.', {
        title: 'Удалить запись?', confirmLabel: 'Удалить', danger: true
    })) return;
    db.ref(path).remove()
        .then(() => {
            // Перезагружаем профиль
            if (currentProfileVisitorId) {
                loadVisitorProfile(currentProfileVisitorId);
            }
        })
        .catch(err => {
            AdminUI.notify('Не удалось удалить запись: ' + err.message, { tone: 'error' });
        });
}

function formatDate(timestamp) {
    const d = new Date(timestamp);
    const now = new Date();
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');

    if (d.toDateString() === now.toDateString()) {
        return `Сегодня, ${hours}:${mins}`;
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
        return `Вчера, ${hours}:${mins}`;
    }

    return `${day}.${month}, ${hours}:${mins}`;
}

// ============================================
// ЛИЧНЫЕ СООБЩЕНИЯ КОНКРЕТНОМУ ПОСЕТИТЕЛЮ
// ============================================

function openDirectMessage(visitorId) {
    const name = getVisitorDisplayName(visitorId) || visitorId.substring(0, 15) + '…';
    const existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
        <div class="modal">
            <h3><span class="eic eic-mail" aria-hidden="true"></span> Сообщение для <span style="color:var(--accent-hover)">${escapeHtml(name)}</span></h3>

            <div style="display:flex; gap:0.5rem; margin-bottom:1rem;">
                <button class="btn btn-sm btn-outline dm-mode-btn active" data-mode="message" onclick="switchDmMode(this, 'message')"><span class="eic eic-chat" aria-hidden="true"></span> Сообщение</button>
                <button class="btn btn-sm btn-outline dm-mode-btn" data-mode="poll" onclick="switchDmMode(this, 'poll')"><span class="eic eic-chart" aria-hidden="true"></span> Опрос</button>
            </div>

            <div id="dmMessageForm">
                <div class="form-group">
                    <label>Текст сообщения</label>
                    <textarea id="dmText" rows="3" placeholder="Введите текст сообщения..." style="resize:vertical;"></textarea>
                </div>
            </div>

            <div id="dmPollForm" style="display:none;">
                <div class="form-group">
                    <label>Вопрос</label>
                    <input type="text" id="dmPollQuestion" placeholder="Вопрос для этого посетителя">
                </div>
                <div class="form-group">
                    <label>Описание (необязательно)</label>
                    <input type="text" id="dmPollDesc" placeholder="Краткое пояснение...">
                </div>
                <div class="form-group">
                    <label>Варианты</label>
                    <div id="dmOptionsList" style="display:flex; flex-direction:column; gap:0.5rem;">
                        <input type="text" class="dm-poll-option" placeholder="Вариант 1">
                        <input type="text" class="dm-poll-option" placeholder="Вариант 2">
                    </div>
                    <button class="add-option-btn" style="margin-top:0.5rem;" onclick="addDmOption()">+ Добавить</button>
                </div>
            </div>

            <div class="modal-actions">
                <button class="btn btn-outline btn-sm" onclick="this.closest('.modal-overlay').remove()">Отмена</button>
                <button class="btn btn-primary btn-sm" onclick="sendDirectMessage(${inlineArg(visitorId)})">Отправить</button>
            </div>
        </div>
    `;

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
}

function switchDmMode(btn, mode) {
    document.querySelectorAll('.dm-mode-btn').forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.color = 'var(--text-secondary)';
    });
    btn.classList.add('active');
    btn.style.background = 'rgba(59,130,246,0.15)';
    btn.style.color = 'var(--accent-hover)';

    document.getElementById('dmMessageForm').style.display = mode === 'message' ? 'block' : 'none';
    document.getElementById('dmPollForm').style.display = mode === 'poll' ? 'block' : 'none';
}

function addDmOption() {
    const list = document.getElementById('dmOptionsList');
    const count = list.querySelectorAll('.dm-poll-option').length;
    if (count >= 6) { AdminUI.notify('Можно добавить не больше шести вариантов.'); return; }
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dm-poll-option';
    input.placeholder = 'Вариант ' + (count + 1);
    list.appendChild(input);
}

function sendDirectMessage(visitorId) {
    const isMessageMode = document.getElementById('dmMessageForm').style.display !== 'none';
    const sendBtn = document.querySelector('.modal-actions .btn-primary');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Отправка...'; }

    if (isMessageMode) {
        const text = document.getElementById('dmText').value.trim();
        if (!text) { AdminUI.notify('Введите текст сообщения.'); if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Отправить'; } return; }

        db.ref('directMessages/' + visitorId).push({
            message: text,
            type: 'message',
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            read: false
        }).then(() => {
            const overlay = document.querySelector('.modal-overlay');
            if (overlay) overlay.remove();
            AdminUI.notify('Сообщение отправлено.', { tone: 'success' });
        }).catch(err => {
            console.error('Ошибка отправки:', err);
            AdminUI.notify('Не удалось отправить сообщение: ' + err.message, { tone: 'error' });
            if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Отправить'; }
        });
    } else {
        const question = document.getElementById('dmPollQuestion').value.trim();
        const desc = document.getElementById('dmPollDesc').value.trim();
        const options = [];
        document.querySelectorAll('.dm-poll-option').forEach(input => {
            if (input.value.trim()) options.push(input.value.trim());
        });

        if (!question) { AdminUI.notify('Введите вопрос.'); if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Отправить'; } return; }
        if (options.length < 2) { AdminUI.notify('Добавьте минимум два варианта.'); if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Отправить'; } return; }

        db.ref('directMessages/' + visitorId).push({
            message: question,
            description: desc || null,
            options: options,
            type: 'poll',
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            read: false
        }).then(() => {
            const overlay = document.querySelector('.modal-overlay');
            if (overlay) overlay.remove();
            AdminUI.notify('Опрос отправлен посетителю.', { tone: 'success' });
        }).catch(err => {
            console.error('Ошибка отправки:', err);
            AdminUI.notify('Не удалось отправить опрос: ' + err.message, { tone: 'error' });
            if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Отправить'; }
        });
    }
}

// ============================================
// DASHBOARD: ОПРОСЫ
// ============================================

function initPollForm() {
    const addBtn = document.getElementById('addOptionBtn');
    const sendBtn = document.getElementById('sendPollBtn');
    const optionsList = document.getElementById('optionsList');

    addBtn.addEventListener('click', () => {
        const count = optionsList.querySelectorAll('.option-row').length;
        if (count >= 6) {
            AdminUI.notify('Можно добавить не больше шести вариантов.');
            return;
        }
        const row = document.createElement('div');
        row.className = 'option-row';
        row.innerHTML = `
            <input type="text" placeholder="Вариант ${count + 1}" class="poll-option">
            <button class="remove-option" title="Удалить">×</button>
        `;
        optionsList.appendChild(row);
        bindRemoveButtons();
    });

    sendBtn.addEventListener('click', sendPoll);
    bindRemoveButtons();
}

function bindRemoveButtons() {
    document.querySelectorAll('.remove-option').forEach(btn => {
        btn.onclick = function() {
            const rows = document.querySelectorAll('.option-row');
            if (rows.length <= 2) {
                AdminUI.notify('В опросе должно остаться минимум два варианта.');
                return;
            }
            this.closest('.option-row').remove();
        };
    });
}

function sendPoll() {
    const question = document.getElementById('pollQuestion').value.trim();
    const description = document.getElementById('pollDescription').value.trim();
    const optionInputs = document.querySelectorAll('.poll-option');
    const options = [];

    optionInputs.forEach(input => {
        const val = input.value.trim();
        if (val) options.push(val);
    });

    if (!question) {
        AdminUI.notify('Введите вопрос.');
        return;
    }
    if (options.length < 2) {
        AdminUI.notify('Добавьте минимум два варианта ответа.');
        return;
    }

    const pollData = {
        question: question,
        description: description || null,
        options: options,
        active: true,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        createdBy: auth.currentUser.email
    };

    db.ref('polls').push(pollData)
        .then(() => {
            document.getElementById('pollQuestion').value = '';
            document.getElementById('pollDescription').value = '';
            document.querySelectorAll('.poll-option').forEach(input => input.value = '');
            AdminUI.notify('Опрос опубликован.', { tone: 'success' });
        })
        .catch(err => {
            AdminUI.notify('Не удалось опубликовать опрос: ' + err.message, { tone: 'error' });
        });
}

// --- Список опросов ---
function listenPolls() {
    db.ref('polls').orderByChild('createdAt').on('value', (snapshot) => {
        const pollsList = document.getElementById('pollsList');
        const polls = [];

        snapshot.forEach(childSnap => {
            polls.push({ id: childSnap.key, ...childSnap.val() });
        });

        if (polls.length === 0) {
            pollsList.innerHTML = '<div class="no-data">Опросов пока нет</div>';
            return;
        }

        polls.reverse();

        pollsList.innerHTML = polls.map(poll => {
            const statusClass = poll.active ? 'poll-active' : 'poll-closed';
            const statusText = poll.active ? '● Активен' : '○ Закрыт';

            return `
                <div class="poll-card" id="poll-${poll.id}">
                    <div class="poll-card-header">
                        <div>
                            <h4>${escapeHtml(poll.question)}</h4>
                            ${poll.description ? `<p style="font-size:0.85rem; color:var(--text-secondary); margin-top:0.25rem;">${escapeHtml(poll.description)}</p>` : ''}
                        </div>
                        <div style="display: flex; gap: 0.5rem; align-items: center; flex-shrink: 0;">
                            <span class="poll-status ${statusClass}">${statusText}</span>
                            ${poll.active ?
                                `<button class="btn btn-danger btn-sm" onclick="closePoll(${inlineArg(poll.id)})">Закрыть</button>` :
                                `<button class="btn btn-outline btn-sm" onclick="deletePoll(${inlineArg(poll.id)})">Удалить</button>`
                            }
                        </div>
                    </div>
                    <div class="poll-results" id="results-${poll.id}">
                        <div class="no-data pulse" style="padding: 0.5rem;">Загрузка результатов...</div>
                    </div>
                </div>
            `;
        }).join('');

        polls.forEach(poll => loadPollResults(poll));
    });
}

function loadPollResults(poll) {
    db.ref('pollResponses/' + poll.id).on('value', (snapshot) => {
        const responses = snapshot.val() || {};
        const container = document.getElementById('results-' + poll.id);
        if (!container) return;

        const options = poll.options || [];
        const counts = new Array(options.length).fill(0);
        let total = 0;

        // Сохраняем детали по каждому ответу
        const voterDetails = [];

        Object.entries(responses).forEach(([visitorId, resp]) => {
            if (resp.optionIndex >= 0 && resp.optionIndex < options.length) {
                counts[resp.optionIndex]++;
                total++;
                voterDetails.push({
                    visitorId: visitorId,
                    optionIndex: resp.optionIndex,
                    optionText: resp.optionText || options[resp.optionIndex],
                    timestamp: resp.timestamp
                });
            }
        });

        if (total === 0) {
            container.innerHTML = '<div class="no-data" style="padding: 0.5rem;">Ответов пока нет</div>';
            return;
        }

        // Сортируем по времени
        voterDetails.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        const barsHtml = options.map((opt, i) => {
            const percent = total > 0 ? (counts[i] / total * 100) : 0;
            return `
                <div class="poll-result-row">
                    <span class="poll-result-label">${escapeHtml(opt)}</span>
                    <div class="poll-result-bar-container">
                        <div class="poll-result-bar c${i % 6}" style="width: ${percent}%"></div>
                    </div>
                    <span class="poll-result-count">${counts[i]} (${Math.round(percent)}%)</span>
                </div>
            `;
        }).join('');

        const voterRowsHtml = voterDetails.map(v => {
            const name = getVisitorDisplayName(v.visitorId);
            const displayName = name || v.visitorId.substring(0, 15) + '…';
            const colorIdx = v.optionIndex % 6;
            const colors = ['var(--accent)', 'var(--success)', 'var(--warning)', '#a78bfa', '#f472b6', '#34d399'];
            return `
                <div class="poll-voter-row">
                    <span class="poll-voter-name" style="cursor:pointer;" onclick="renameVisitor(${inlineArg(v.visitorId)})" title="Клик для переименования">${escapeHtml(displayName)}</span>
                    <span class="poll-voter-answer" style="color:${colors[colorIdx]}">${escapeHtml(v.optionText)}</span>
                </div>
            `;
        }).join('');

        const pollCardId = poll.id.replace(/[^a-zA-Z0-9_-]/g, '');

        container.innerHTML = barsHtml +
            `<div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.5rem;">
                <button class="poll-details-toggle" onclick="toggleVoterList(${inlineArg('voters-' + pollCardId)})"><span class="eic eic-users" aria-hidden="true"></span> Показать ответы по посетителям (${total})</button>
                <span style="font-size:0.8rem; color:var(--text-secondary);">Всего: ${total}</span>
            </div>
            <div class="poll-voter-list" id="voters-${pollCardId}">
                ${voterRowsHtml}
            </div>`;
    });
}

function toggleVoterList(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.toggle('open');
        const btn = el.previousElementSibling.querySelector('.poll-details-toggle');
        if (btn) {
            btn.textContent = el.classList.contains('open')
                ? btn.textContent.replace('Показать', 'Скрыть')
                : btn.textContent.replace('Скрыть', 'Показать');
        }
    }
}

async function closePoll(pollId) {
    if (!await AdminUI.confirm('После закрытия посетители больше не увидят этот опрос.', {
        title: 'Закрыть опрос?', confirmLabel: 'Закрыть'
    })) return;
    db.ref('polls/' + pollId + '/active').set(false)
        .then(() => AdminUI.notify('Опрос закрыт.', { tone: 'success' }))
        .catch(err => AdminUI.notify('Не удалось закрыть опрос: ' + err.message, { tone: 'error' }));
}

async function deletePoll(pollId) {
    if (!await AdminUI.confirm('Опрос и все полученные ответы будут удалены безвозвратно.', {
        title: 'Удалить опрос?', confirmLabel: 'Удалить', danger: true
    })) return;
    Promise.all([
        db.ref('polls/' + pollId).remove(),
        db.ref('pollResponses/' + pollId).remove()
    ]).then(() => AdminUI.notify('Опрос удалён.', { tone: 'success' }))
        .catch(err => AdminUI.notify('Не удалось удалить опрос: ' + err.message, { tone: 'error' }));
}

// ============================================
// УТИЛИТЫ
// ============================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function inlineArg(value) {
    return escapeHtml(JSON.stringify(String(value)));
}

// ============================================
// МАССОВАЯ РАССЫЛКА
// ============================================

// Обновляем счётчик получателей
let onlineVisitorIds = [];

// Подписка на онлайн для счётчика рассылки + обновление списка посетителей
db.ref('presence').on('value', (snap) => {
    const data = snap.val() || {};
    onlineVisitorIds = Object.values(data).map(u => u.visitorId).filter(Boolean);
    const el = document.getElementById('broadcastCount');
    if (el) el.textContent = onlineVisitorIds.length;
    // Перерисовываем список всех посетителей — обновить онлайн-точки
    if (lastVisitorsSnapshot) renderAllVisitors(lastVisitorsSnapshot, visitorsListPeriod);
});

document.getElementById('broadcastBtn')?.addEventListener('click', async () => {
    const text = document.getElementById('broadcastText').value.trim();
    if (!text) { AdminUI.notify('Введите текст сообщения.'); return; }
    if (onlineVisitorIds.length === 0) { AdminUI.notify('Сейчас нет посетителей онлайн.'); return; }

    if (!await AdminUI.confirm(`Сообщение получат посетители онлайн: ${onlineVisitorIds.length}.`, {
        title: 'Отправить всем?', confirmLabel: 'Отправить'
    })) return;

    const btn = document.getElementById('broadcastBtn');
    btn.disabled = true;
    btn.textContent = 'Отправка...';

    const promises = onlineVisitorIds.map(vid =>
        db.ref('directMessages/' + vid).push({
            message: text,
            type: 'message',
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            read: false,
            broadcast: true
        })
    );

    Promise.all(promises)
        .then(() => {
            document.getElementById('broadcastText').value = '';
            AdminUI.notify(`Сообщение отправлено: ${onlineVisitorIds.length}.`, { tone: 'success' });
        })
        .catch(err => AdminUI.notify('Не удалось выполнить рассылку: ' + err.message, { tone: 'error' }))
        .finally(() => {
            btn.disabled = false;
            btn.textContent = 'Отправить всем';
        });
});

// ============================================
// ВСЕ ПОСЕТИТЕЛИ (ЖУРНАЛ) — REAL-TIME
// ============================================

let visitorsListPeriod = 'all';
let visitorsListener = null;
let lastVisitorsSnapshot = null;
let visitorsWasLoaded = false;

function setAllVisitorsCollapsed(collapsed) {
    const body = document.getElementById('allVisitorsBody');
    const button = document.getElementById('allVisitorsToggle');
    if (!body || !button) return;
    body.hidden = collapsed;
    button.setAttribute('aria-expanded', String(!collapsed));
    button.querySelector('[aria-hidden]').textContent = collapsed ? '+' : '−';
    button.querySelector('.admin-collapse-label').textContent = collapsed ? 'Показать' : 'Скрыть';
    localStorage.setItem('admin-all-visitors-collapsed', collapsed ? '1' : '0');
    if (collapsed && visitorsListener) {
        db.ref('visitors').off('value', visitorsListener);
        visitorsListener = null;
    } else if (!collapsed && visitorsWasLoaded) loadAllVisitors(visitorsListPeriod);
}

function loadAllVisitors(period) {
    visitorsListPeriod = period;
    visitorsWasLoaded = true;

    // Снимаем старый слушатель
    if (visitorsListener) {
        db.ref('visitors').off('value', visitorsListener);
    }

    const container = document.getElementById('allVisitorsList');
    container.innerHTML = '<div class="no-data pulse">Загрузка...</div>';

    // Подписываемся на real-time обновления
    visitorsListener = db.ref('visitors').on('value', (snap) => {
        lastVisitorsSnapshot = snap.val() || {};
        renderAllVisitors(lastVisitorsSnapshot, visitorsListPeriod);
    });

    // Подсветим активную кнопку
    document.querySelectorAll('#allVisitorsList').forEach(() => {
        const section = container.closest('.section');
        if (section) {
            section.querySelectorAll('.btn-outline').forEach(btn => {
                btn.style.background = '';
                btn.style.color = '';
                btn.style.borderColor = '';
            });
            // Подсветка через data-period невозможна, подсветим по тексту
            const labels = { all: 'Все', today: 'Сегодня', week: 'За неделю' };
            section.querySelectorAll('.btn-outline').forEach(btn => {
                if (btn.textContent.trim() === labels[period]) {
                    btn.style.background = 'rgba(59,130,246,0.15)';
                    btn.style.color = 'var(--accent-hover)';
                    btn.style.borderColor = 'var(--accent)';
                }
            });
        }
    });
}

function renderAllVisitors(data, period) {
    const container = document.getElementById('allVisitorsList');

    let visitors = Object.entries(data).map(([id, v]) => ({
        id,
        name: getVisitorDisplayName(id),
        lastVisit: v.lastVisit || 0,
        pageViews: v.pageViews || v.visitCount || 0,
        authProvider: v.authProvider || 'legacy',
        browserContext: v.browserContext || 'web',
        lastPage: v.lastPage || '/'
    }));

    const now = Date.now();
    if (period === 'today') {
        const todayStart = new Date().setHours(0, 0, 0, 0);
        visitors = visitors.filter(v => v.lastVisit >= todayStart);
    } else if (period === 'week') {
        visitors = visitors.filter(v => v.lastVisit >= now - 7 * 24 * 60 * 60 * 1000);
    }

    visitors.sort((a, b) => b.lastVisit - a.lastVisit);

    if (visitors.length === 0) {
        container.innerHTML = '<div class="no-data">Нет посетителей за этот период</div>';
        return;
    }

    container.innerHTML = `
        <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.75rem;">
            Найдено: ${visitors.length} · <span style="color:var(--success);">● live</span>
        </div>
        <div style="overflow-x:auto;">
            <table class="online-table">
                <thead>
                    <tr>
                        <th>Посетитель</th>
                        <th>Посл. визит</th>
                        <th>Просмотров</th>
                        <th>Посл. страница</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${visitors.map(v => {
                        const displayName = v.name || v.id.substring(0, 14) + '…';
                        const nameClass = v.name ? 'color:var(--accent-hover); font-weight:600;' : 'color:var(--text-secondary); font-size:0.8rem;';
                        const page = (v.lastPage || '/').replace(/^\//, '').replace('.html', '') || 'index';
                        const time = v.lastVisit ? formatDate(v.lastVisit) : '—';
                        const isOnline = onlineVisitorIds.includes(v.id);
                        const onlineDot = isOnline ? '<span class="status-dot" style="margin-right:0.3rem;"></span>' : '';
                        return `<tr>
                            <td>
                                ${onlineDot}<span style="${nameClass} cursor:pointer;" onclick="renameVisitor(${inlineArg(v.id)})" title="Переименовать">
                                    ${escapeHtml(displayName)}
                                </span>
                            </td>
                            <td style="color:var(--text-secondary); font-size:0.85rem;">${time}</td>
                            <td style="text-align:center;" title="${v.authProvider === 'anonymous' ? 'Анонимный браузер' : (v.authProvider === 'legacy' ? 'Старая запись' : 'Аккаунт')}${v.browserContext === 'telegram' ? ' · Telegram' : ''}">${v.pageViews}</td>
                            <td><span class="page-badge">${escapeHtml(page)}</span></td>
                            <td style="white-space:nowrap;">
                                <button class="action-btn" onclick="openVisitorProfile(${inlineArg(v.id)})" title="Профиль"><span class="eic eic-clip" aria-hidden="true"></span></button>
                                <button class="action-btn" onclick="openDirectMessage(${inlineArg(v.id)})" title="Написать"><span class="eic eic-mail" aria-hidden="true"></span></button>
                                <button class="action-btn" onclick="deleteVisitor(${inlineArg(v.id)})" title="Удалить" style="color:var(--danger);"><span class="eic eic-trash" aria-hidden="true"></span></button>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function deleteVisitor(visitorId) {
    const name = getVisitorDisplayName(visitorId) || visitorId.substring(0, 20);
    if (!await AdminUI.confirm(`Профиль «${name}», его имя и личные сообщения будут удалены.`, {
        title: 'Удалить профиль?', confirmLabel: 'Удалить', danger: true
    })) return;

    Promise.all([
        db.ref('visitors/' + visitorId).remove(),
        db.ref('visitorNames/' + visitorId).remove(),
        db.ref('directMessages/' + visitorId).remove()
    ]).then(() => {
        AdminUI.notify('Профиль посетителя удалён.', { tone: 'success' });
    }).catch(err => {
        AdminUI.notify('Не удалось удалить профиль: ' + err.message, { tone: 'error' });
    });
}

const allVisitorsToggle = document.getElementById('allVisitorsToggle');
if (allVisitorsToggle) {
    const initiallyCollapsed = localStorage.getItem('admin-all-visitors-collapsed') === '1';
    setAllVisitorsCollapsed(initiallyCollapsed);
    allVisitorsToggle.addEventListener('click', () => {
        setAllVisitorsCollapsed(allVisitorsToggle.getAttribute('aria-expanded') === 'true');
    });
}

// ============================================
// УПРАВЛЕНИЕ ДАННЫМИ
// ============================================

async function clearDailyStats() {
    if (!await AdminUI.confirm('Счётчики активности за все дни будут удалены.', {
        title: 'Очистить дневную статистику?', confirmLabel: 'Очистить', danger: true
    })) return;
    db.ref('dailyStats').remove()
        .then(() => AdminUI.notify('Дневная статистика очищена.', { tone: 'success' }))
        .catch(err => AdminUI.notify('Не удалось очистить статистику: ' + err.message, { tone: 'error' }));
}

async function clearAllPresence() {
    if (!await AdminUI.confirm('Текущие подключения появятся снова после следующего обновления.', {
        title: 'Сбросить список онлайн?', confirmLabel: 'Сбросить'
    })) return;
    db.ref('presence').remove()
        .then(() => AdminUI.notify('Список онлайн сброшен.', { tone: 'success' }))
        .catch(err => AdminUI.notify('Не удалось сбросить список: ' + err.message, { tone: 'error' }));
}

async function clearAllData() {
    const code = await AdminUI.prompt(
        'Будут удалены аналитика, посетители, сообщения и опросы. Роли и пользовательские данные конспектов не затрагиваются.',
        '',
        { title: 'Удалить аналитические данные?', inputLabel: 'Введите УДАЛИТЬ', confirmLabel: 'Продолжить', danger: true }
    );
    if (code === null) return;
    if (code !== 'УДАЛИТЬ') { AdminUI.notify('Подтверждение не совпало — данные сохранены.'); return; }

    Promise.all([
        db.ref('visitors').remove(),
        db.ref('dailyStats').remove(),
        db.ref('visitorNames').remove(),
        db.ref('directMessages').remove(),
        db.ref('polls').remove(),
        db.ref('pollResponses').remove(),
        db.ref('analyticsSessions').remove(),
        db.ref('webVitals').remove(),
        db.ref('presence').remove()
    ]).then(() => {
        AdminUI.notify('Аналитические данные удалены.', { tone: 'success' });
    }).catch(err => {
        AdminUI.notify('Не удалось удалить данные: ' + err.message, { tone: 'error' });
    });
}
