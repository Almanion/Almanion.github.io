(function () {
    'use strict';

    const ANALYTICS_DAYS = 14;
    let analyticsLoading = false;
    let accountDirectory = {};
    let adminRoles = {};

    function byId(id) { return document.getElementById(id); }

    function showAdminToast(message, isError) {
        let stack = byId('adminToastStack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'adminToastStack';
            stack.className = 'admin-toast-stack';
            stack.setAttribute('aria-live', 'polite');
            document.body.appendChild(stack);
        }
        const toast = document.createElement('div');
        toast.className = 'admin-toast' + (isError ? ' is-error' : '');
        toast.textContent = message;
        stack.appendChild(toast);
        window.setTimeout(function () { toast.remove(); }, 4200);
    }

    // Существующие действия панели вызывают alert(). Переводим такие сообщения
    // в ненавязчивые уведомления, оставляя системный confirm только для удаления.
    window.alert = function (message) {
        const text = String(message == null ? '' : message);
        showAdminToast(text, /ошиб|не удалось|недостаточно/i.test(text));
    };

    function localDayKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
    }

    function recentDays(count) {
        const result = [];
        const now = new Date();
        now.setHours(12, 0, 0, 0);
        for (let offset = count - 1; offset >= 0; offset--) {
            const date = new Date(now);
            date.setDate(now.getDate() - offset);
            result.push({ key: localDayKey(date), date: date });
        }
        return result;
    }

    function flattenSessions(dayValue) {
        const sessions = [];
        Object.keys(dayValue || {}).forEach(function (visitorId) {
            const visitorSessions = dayValue[visitorId] || {};
            Object.keys(visitorSessions).forEach(function (sessionId) {
                const session = visitorSessions[sessionId];
                if (!session || typeof session !== 'object') return;
                sessions.push(Object.assign({ visitorId: visitorId, sessionId: sessionId }, session));
            });
        });
        return sessions;
    }

    function formatDuration(seconds) {
        const value = Math.max(0, Math.round(Number(seconds) || 0));
        if (value < 60) return value + ' сек';
        const minutes = Math.round(value / 60);
        if (minutes < 60) return minutes + ' мин';
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        return hours + ' ч' + (rest ? ' ' + rest + ' мин' : '');
    }

    function pageLabel(page) {
        const path = String(page || '/').split('?')[0];
        if (path === '/' || path === '/index.html') return 'Главная';
        return decodeURIComponent(path.replace(/^\//, '').replace(/\.html$/i, '')) || 'Главная';
    }

    function increment(map, key) {
        const normalized = key || 'Неизвестно';
        map[normalized] = (map[normalized] || 0) + 1;
    }

    function renderTrend(days) {
        const root = byId('usageTrend');
        if (!root) return;
        root.replaceChildren();
        const maxViews = Math.max(1, ...days.map(function (day) { return day.sessions.length; }));
        days.forEach(function (day) {
            const column = document.createElement('div');
            column.className = 'usage-trend-day';
            column.title = day.date.toLocaleDateString('ru-RU') + ': ' + day.sessions.length;

            const wrap = document.createElement('div');
            wrap.className = 'usage-trend-bar-wrap';
            const bar = document.createElement('div');
            bar.className = 'usage-trend-bar';
            bar.style.height = Math.max(3, Math.round(day.sessions.length / maxViews * 100)) + '%';
            wrap.appendChild(bar);

            const value = document.createElement('span');
            value.className = 'usage-trend-value';
            value.textContent = String(day.sessions.length);
            const label = document.createElement('span');
            label.className = 'usage-trend-label';
            label.textContent = String(day.date.getDate());
            column.append(wrap, value, label);
            root.appendChild(column);
        });
    }

    function renderBreakdown(rootId, entries, labels) {
        const root = byId(rootId);
        if (!root) return;
        root.replaceChildren();
        const list = document.createElement('div');
        list.className = 'usage-breakdown-list';
        const sorted = Object.entries(entries).sort(function (a, b) { return b[1] - a[1]; });
        const total = sorted.reduce(function (sum, item) { return sum + item[1]; }, 0);
        if (!total) {
            const empty = document.createElement('div');
            empty.className = 'no-data';
            empty.textContent = 'Данных пока нет';
            root.appendChild(empty);
            return;
        }
        sorted.slice(0, 7).forEach(function (item) {
            const row = document.createElement('div');
            row.className = 'usage-breakdown-row';
            const name = document.createElement('span');
            name.textContent = (labels && labels[item[0]]) || item[0];
            const value = document.createElement('strong');
            value.textContent = item[1] + ' · ' + Math.round(item[1] / total * 100) + '%';
            const track = document.createElement('div');
            track.className = 'usage-breakdown-track';
            const fill = document.createElement('div');
            fill.className = 'usage-breakdown-fill';
            fill.style.width = (item[1] / total * 100) + '%';
            track.appendChild(fill);
            row.append(name, value, track);
            list.appendChild(row);
        });
        root.appendChild(list);
    }

    function renderTopPages(entries) {
        const root = byId('topPages');
        if (!root) return;
        root.replaceChildren();
        const sorted = Object.entries(entries).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);
        if (!sorted.length) {
            const empty = document.createElement('div');
            empty.className = 'no-data';
            empty.textContent = 'Данных пока нет';
            root.appendChild(empty);
            return;
        }
        const list = document.createElement('div');
        list.className = 'usage-page-list';
        sorted.forEach(function (item) {
            const row = document.createElement('div');
            row.className = 'usage-page-row';
            const name = document.createElement('span');
            name.textContent = pageLabel(item[0]);
            name.title = String(item[0]);
            const value = document.createElement('strong');
            value.textContent = String(item[1]);
            row.append(name, value);
            list.appendChild(row);
        });
        root.appendChild(list);
    }

    async function loadUsageAnalytics(showFeedback) {
        if (analyticsLoading) return;
        analyticsLoading = true;
        const button = byId('refreshUsageBtn');
        if (button) button.disabled = true;
        try {
            const days = recentDays(ANALYTICS_DAYS);
            const snapshots = await Promise.all(days.map(function (day) {
                return db.ref('analyticsSessions/' + day.key).once('value');
            }));
            const analyticsDays = days.map(function (day, index) {
                return Object.assign({}, day, { sessions: flattenSessions(snapshots[index].val()) });
            });
            const sessions = analyticsDays.flatMap(function (day) { return day.sessions; });
            const todaySessions = analyticsDays[analyticsDays.length - 1].sessions;
            const pages = {};
            const devices = {};
            const sources = {};
            sessions.forEach(function (session) {
                increment(pages, session.page || '/');
                increment(devices, session.device || 'desktop');
                increment(sources, session.referrerHost || 'direct');
            });

            const completedDurations = sessions
                .map(function (session) { return Number(session.durationSeconds) || 0; })
                .filter(function (seconds) { return seconds > 0; });
            const averageDuration = completedDurations.length
                ? completedDurations.reduce(function (sum, value) { return sum + value; }, 0) / completedDurations.length
                : 0;

            const weeklyDays = analyticsDays.slice(-7);
            const visitorDays = {};
            weeklyDays.forEach(function (day) {
                const seenToday = new Set(day.sessions.map(function (session) { return session.visitorId; }));
                seenToday.forEach(function (visitorId) {
                    if (!visitorDays[visitorId]) visitorDays[visitorId] = new Set();
                    visitorDays[visitorId].add(day.key);
                });
            });
            const visitorIds = Object.keys(visitorDays);
            const returning = visitorIds.filter(function (visitorId) { return visitorDays[visitorId].size > 1; }).length;

            if (byId('pagesCount')) byId('pagesCount').textContent = String(todaySessions.length);
            if (byId('avgDuration')) byId('avgDuration').textContent = formatDuration(averageDuration);
            if (byId('returningRate')) byId('returningRate').textContent = visitorIds.length ? Math.round(returning / visitorIds.length * 100) + '%' : '0%';
            renderTrend(analyticsDays);
            renderBreakdown('deviceBreakdown', devices, { desktop: 'Компьютеры', mobile: 'Телефоны', tablet: 'Планшеты' });
            renderBreakdown('trafficSources', sources, { direct: 'Прямые переходы', internal: 'Внутри сайта' });
            renderTopPages(pages);
            if (showFeedback) showAdminToast('Аналитика обновлена');
        } catch (error) {
            console.error('Admin analytics:', error);
            showAdminToast('Не удалось загрузить расширенную аналитику', true);
        } finally {
            analyticsLoading = false;
            if (button) button.disabled = false;
        }
    }

    function isOwner(user) {
        return !!user && String(user.email || '').trim().toLowerCase() === SITE_OWNER_EMAIL;
    }

    function findAccount(value) {
        const query = String(value || '').trim();
        if (!query) return null;
        if (accountDirectory[query]) return { uid: query, account: accountDirectory[query] };
        const lower = query.toLowerCase();
        const uid = Object.keys(accountDirectory).find(function (key) {
            return String(accountDirectory[key].email || '').trim().toLowerCase() === lower;
        });
        return uid ? { uid: uid, account: accountDirectory[uid] } : null;
    }

    function fillRoleForm(uid) {
        const account = accountDirectory[uid] || {};
        const role = adminRoles[uid] || {};
        byId('adminRoleAccount').value = account.email || uid;
        byId('siteAdminRole').checked = role.siteAdmin === true;
        byId('matcenterAdminRole').checked = role.matcenterAdmin === true;
        byId('contentEditorRole').checked = role.contentEditor === true;
        byId('adminRoleAccount').focus();
    }

    function roleBadge(text, owner) {
        const badge = document.createElement('span');
        badge.className = 'admin-role-badge' + (owner ? ' is-owner' : '');
        badge.textContent = text;
        return badge;
    }

    function renderAdminRoles() {
        const root = byId('adminRolesList');
        if (!root) return;
        root.replaceChildren();
        const list = document.createElement('div');
        list.className = 'admin-roles-list';

        const ownerRow = document.createElement('div');
        ownerRow.className = 'admin-role-row';
        const ownerIdentity = document.createElement('div');
        ownerIdentity.className = 'admin-role-identity';
        const ownerEmail = document.createElement('b');
        ownerEmail.textContent = SITE_OWNER_EMAIL;
        const ownerCaption = document.createElement('small');
        ownerCaption.textContent = 'Владелец — доступ нельзя отозвать из панели';
        ownerIdentity.append(ownerEmail, ownerCaption);
        const ownerBadges = document.createElement('div');
        ownerBadges.className = 'admin-role-badges';
        ownerBadges.append(roleBadge('Владелец', true), roleBadge('Сайт'), roleBadge('Матцентр'), roleBadge('Редактор'));
        ownerRow.append(ownerIdentity, ownerBadges);
        list.appendChild(ownerRow);

        Object.keys(adminRoles).sort(function (a, b) {
            return String((adminRoles[a] || {}).email || '').localeCompare(String((adminRoles[b] || {}).email || ''), 'ru');
        }).forEach(function (uid) {
            const role = adminRoles[uid] || {};
            if (!role.siteAdmin && !role.matcenterAdmin && !role.contentEditor) return;
            if (String(role.email || '').toLowerCase() === SITE_OWNER_EMAIL) return;
            const account = accountDirectory[uid] || {};
            const row = document.createElement('div');
            row.className = 'admin-role-row';
            const identity = document.createElement('div');
            identity.className = 'admin-role-identity';
            const email = document.createElement('b');
            email.textContent = account.email || role.email || uid;
            const details = document.createElement('small');
            details.textContent = (account.displayName ? account.displayName + ' · ' : '') + uid;
            identity.append(email, details);
            const badges = document.createElement('div');
            badges.className = 'admin-role-badges';
            if (role.siteAdmin) badges.appendChild(roleBadge('Сайт'));
            if (role.matcenterAdmin) badges.appendChild(roleBadge('Матцентр'));
            if (role.contentEditor) badges.appendChild(roleBadge('Редактор'));
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'btn btn-outline btn-sm';
            edit.textContent = 'Изменить';
            edit.addEventListener('click', function () { fillRoleForm(uid); });
            row.append(identity, badges, edit);
            list.appendChild(row);
        });
        root.appendChild(list);
    }

    async function loadRoleManager(user) {
        const section = byId('adminRolesSection');
        if (!section) return;
        if (!isOwner(user)) {
            section.hidden = true;
            return;
        }
        section.hidden = false;
        try {
            const results = await Promise.all([
                db.ref('accountDirectory').once('value'),
                db.ref('adminRoles').once('value')
            ]);
            accountDirectory = results[0].val() || {};
            adminRoles = results[1].val() || {};
            const datalist = byId('accountDirectoryOptions');
            datalist.replaceChildren();
            Object.keys(accountDirectory).forEach(function (uid) {
                const account = accountDirectory[uid] || {};
                if (!account.email) return;
                const option = document.createElement('option');
                option.value = account.email;
                option.label = (account.displayName ? account.displayName + ' · ' : '') + uid;
                datalist.appendChild(option);
            });
            renderAdminRoles();
        } catch (error) {
            console.error('Admin roles:', error);
            showAdminToast('Не удалось загрузить список администраторов', true);
        }
    }

    async function saveAdminRoles(event) {
        event.preventDefault();
        const user = auth.currentUser;
        if (!isOwner(user)) return;
        const target = findAccount(byId('adminRoleAccount').value);
        if (!target) {
            showAdminToast('Аккаунт не найден. Пользователю нужно хотя бы один раз войти на сайт.', true);
            return;
        }
        if (String(target.account.email || '').trim().toLowerCase() === SITE_OWNER_EMAIL) {
            showAdminToast('Права владельца заданы системой и не требуют изменения');
            return;
        }
        const siteAdmin = byId('siteAdminRole').checked;
        const matcenterAdmin = byId('matcenterAdminRole').checked;
        const contentEditor = byId('contentEditorRole').checked;
        const saveButton = event.currentTarget.querySelector('button[type="submit"]');
        saveButton.disabled = true;
        try {
            const ref = db.ref('adminRoles/' + target.uid);
            if (!siteAdmin && !matcenterAdmin && !contentEditor) {
                await ref.remove();
            } else {
                await ref.set({
                    email: String(target.account.email || '').trim(),
                    siteAdmin: siteAdmin,
                    matcenterAdmin: matcenterAdmin,
                    contentEditor: contentEditor,
                    updatedAt: firebase.database.ServerValue.TIMESTAMP,
                    updatedBy: user.uid
                });
            }
            byId('adminRoleForm').reset();
            showAdminToast(siteAdmin || matcenterAdmin || contentEditor ? 'Роли пользователя сохранены' : 'Все дополнительные роли отозваны');
            await loadRoleManager(user);
        } catch (error) {
            console.error('Save admin roles:', error);
            showAdminToast('Не удалось сохранить права', true);
        } finally {
            saveButton.disabled = false;
        }
    }

    function initControls() {
        const refresh = byId('refreshUsageBtn');
        if (refresh) refresh.addEventListener('click', function () { loadUsageAnalytics(true); });
        const roleForm = byId('adminRoleForm');
        if (roleForm) roleForm.addEventListener('submit', saveAdminRoles);
        const roleAccount = byId('adminRoleAccount');
        if (roleAccount) roleAccount.addEventListener('change', function () {
            const target = findAccount(roleAccount.value);
            if (target) fillRoleForm(target.uid);
        });
    }

    initControls();
    auth.onAuthStateChanged(async function (user) {
        if (!user) return;
        let hasSiteAccess = isOwner(user);
        if (!hasSiteAccess) {
            try {
                const snapshot = await db.ref('adminRoles/' + user.uid + '/siteAdmin').once('value');
                hasSiteAccess = snapshot.val() === true;
            } catch (_) {
                hasSiteAccess = false;
            }
        }
        if (!hasSiteAccess || !auth.currentUser || auth.currentUser.uid !== user.uid) return;
        loadUsageAnalytics(false);
        loadRoleManager(user);
    });
})();
