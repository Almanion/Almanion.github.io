(function (win) {
    'use strict';

    const core = win.AlmanionPlannerCore;
    if (!core) return;

    const CATEGORY = {
        school: { label: 'Школа', color: '#6575d8' },
        crimson: { label: 'Crimson', color: '#b25e7a' },
        math: { label: 'Математика', color: '#7a66c6' },
        programming: { label: 'Программирование', color: '#4b86a8' },
        personal: { label: 'Личное', color: '#8b785d' },
        sport: { label: 'Спорт', color: '#4f806b' }
    };
    const VIEW_LABELS = { today: 'Сегодня', week: 'Неделя', month: 'Месяц', goals: 'Цели', inbox: 'Входящие' };
    const TYPE_COLLECTION = { event: 'events', task: 'tasks', series: 'series', goal: 'goals' };
    const PLANNER_API_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyR_Iz_fyg2s-bviRtkvF1Zz_KMdRCUgpoIVT1CF-lG6UiNkVfvor_nMXILPzk8xslA/exec';
    const TELEGRAM_ALL_DAY_TIME = '09:00';
    const TELEGRAM_SYNC_DAYS = 44;
    const TELEGRAM_SYNC_DELAY = 1200;
    const TELEGRAM_MAX_REMINDERS = 500;
    const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const RU_WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
    const store = new core.Store();

    let state = core.defaultData();
    let selectedDate = core.dateKey(new Date());
    let currentView = 'today';
    let activeUid = '';
    let authorized = false;
    let editingKind = '';
    let lastModalOpener = null;
    let telegramSyncTimer = 0;
    let telegramSyncInFlight = null;
    let telegramSyncAgain = false;
    let telegramStatusRequest = null;
    let accountGeneration = 0;
    const telegramRequestControllers = new Set();

    const doc = win.document;
    const refs = {};

    function byId(id) { return doc.getElementById(id); }
    function esc(value) {
        const node = doc.createElement('div');
        node.textContent = value == null ? '' : String(value);
        return node.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function num(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : (fallback || 0); }
    function values(map) { return Object.values(core.objectMap(map)); }
    function categoryFor(item) { return CATEGORY[item && item.category] || CATEGORY.personal; }
    function toast(message, type) {
        if (win.AlmanionToast && typeof win.AlmanionToast.show === 'function') win.AlmanionToast.show(message, { type: type || 'info' });
    }
    function formatDate(value, options) {
        const date = core.parseDate(value);
        return new Intl.DateTimeFormat('ru-RU', options || { day: 'numeric', month: 'long' }).format(date);
    }
    function isToday(value) { return value === core.dateKey(new Date()); }
    function dateTitle(value) {
        const date = core.parseDate(value);
        return date.getDate() + ' ' + RU_MONTHS[date.getMonth()];
    }
    function isRecurring(item) { return item && item.recurrence && item.recurrence.frequency && item.recurrence.frequency !== 'none'; }
    function taskDone(item, occurrenceDate) {
        if (!item) return false;
        if (!isRecurring(item)) return item.done === true;
        return !!(item.completedDates && item.completedDates[occurrenceDate]);
    }

    function currentAccountUser() {
        const account = win.AlmanionAccount;
        return account && typeof account.getUser === 'function' ? account.getUser() : null;
    }

    async function plannerBackendRequest(action, payload, forceRefresh) {
        const user = currentAccountUser();
        if (!user || !core.isOwner(user)) throw new Error('Сначала войдите в аккаунт владельца');
        const requestUid = user.uid;
        const requestGeneration = accountGeneration;
        const idToken = await user.getIdToken(forceRefresh === true);
        if (requestGeneration !== accountGeneration || requestUid !== activeUid) {
            const staleError = new Error('Аккаунт изменился');
            staleError.code = 'STALE_ACCOUNT';
            throw staleError;
        }
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        if (controller) telegramRequestControllers.add(controller);
        const timeout = win.setTimeout(function () { if (controller) controller.abort(); }, 25000);
        try {
            const response = await fetch(PLANNER_API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(Object.assign({ action: action, idToken: idToken }, payload || {})),
                signal: controller && controller.signal
            });
            if (requestGeneration !== accountGeneration || requestUid !== activeUid) {
                const staleError = new Error('Аккаунт изменился');
                staleError.code = 'STALE_ACCOUNT';
                throw staleError;
            }
            if (!response.ok) throw new Error('Сервер вернул HTTP ' + response.status);
            const result = await response.json();
            if (requestGeneration !== accountGeneration || requestUid !== activeUid) throw Object.assign(new Error('Аккаунт изменился'), { code: 'STALE_ACCOUNT' });
            if (!result || result.success !== true) {
                const message = String(result && result.error || 'Сервис Telegram недоступен');
                if (!forceRefresh && /сессия|токен|account session|sign in/i.test(message)) {
                    return plannerBackendRequest(action, payload, true);
                }
                if (/неизвестное действие|unknown action/i.test(message)) {
                    throw new Error('Обновите deployment Apps Script: в текущей версии ещё нет Telegram');
                }
                throw new Error(message);
            }
            return result;
        } catch (error) {
            if (error && error.name === 'AbortError') {
                if (requestGeneration !== accountGeneration || requestUid !== activeUid) {
                    const staleError = new Error('Аккаунт изменился');
                    staleError.code = 'STALE_ACCOUNT';
                    throw staleError;
                }
                throw new Error('Сервер не ответил вовремя');
            }
            throw error;
        } finally {
            win.clearTimeout(timeout);
            if (controller) telegramRequestControllers.delete(controller);
        }
    }

    function reminderInstant(date, time) {
        const value = Date.parse(String(date || '') + 'T' + String(time || TELEGRAM_ALL_DAY_TIME) + ':00+03:00');
        return Number.isFinite(value) ? value : 0;
    }

    function buildTelegramReminders() {
        const now = Date.now();
        const start = core.dateKey(new Date());
        const end = core.addDays(start, TELEGRAM_SYNC_DAYS);
        const result = [];
        core.expandItems(state.events, start, end).forEach(function (item) {
            const leads = Array.from(new Set((item.reminderMinutes || []).map(Number).filter(function (lead) {
                return Number.isFinite(lead) && lead > 0 && lead <= 10080;
            }))).slice(0, 4);
            if (!leads.length) return;
            const eventAt = reminderInstant(item.occurrenceDate, item.startTime || TELEGRAM_ALL_DAY_TIME);
            if (!eventAt) return;
            leads.forEach(function (lead) {
                const sendAt = eventAt - lead * 60000;
                if (sendAt < now - 30 * 60000 || sendAt > now + (TELEGRAM_SYNC_DAYS + 1) * 86400000) return;
                result.push({
                    id: String(item.id || 'event').slice(0, 120) + '@' + item.occurrenceDate + ':' + lead,
                    title: String(item.title || 'Событие').trim().slice(0, 160),
                    sendAt: Math.round(sendAt),
                    eventAt: Math.round(eventAt)
                });
            });
        });
        return result.sort(function (left, right) {
            return left.sendAt - right.sendAt || left.id.localeCompare(right.id);
        }).slice(0, TELEGRAM_MAX_REMINDERS);
    }

    function telegramSnapshotHash(reminders) {
        const input = JSON.stringify(reminders || []);
        let hash = 2166136261;
        for (let index = 0; index < input.length; index++) {
            hash ^= input.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16);
    }

    function telegramHashStorageKey() {
        return 'almanion:planner:telegram-hash:' + String(activeUid || 'owner');
    }

    function readTelegramHash() {
        try { return win.localStorage.getItem(telegramHashStorageKey()) || ''; } catch (_) { return ''; }
    }

    function writeTelegramHash(value) {
        try { win.localStorage.setItem(telegramHashStorageKey(), String(value || '')); } catch (_) {}
    }

    function formatTelegramSyncTime(timestamp) {
        if (!Number(timestamp)) return '';
        return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(Number(timestamp)));
    }

    function setTelegramPanel(status, message, meta, enabled) {
        const badge = byId('plannerTelegramState');
        const copy = byId('plannerTelegramStatus');
        const details = byId('plannerTelegramMeta');
        const toggle = refs.plannerUtilityContent && refs.plannerUtilityContent.querySelector('[data-telegram-toggle]');
        const test = refs.plannerUtilityContent && refs.plannerUtilityContent.querySelector('[data-telegram-test]');
        if (badge) {
            badge.className = 'planner-integration-state is-' + (status || 'idle');
            badge.textContent = status === 'connected' ? 'Подключено' : status === 'idle' ? 'Готово' : status === 'error' ? 'Ошибка' : status === 'setup' ? 'Нужна настройка' : 'Проверяем…';
        }
        if (copy && message) copy.textContent = message;
        if (details) details.textContent = meta || '';
        if (toggle && typeof enabled === 'boolean') {
            toggle.dataset.telegramEnabled = enabled ? 'true' : 'false';
            toggle.textContent = enabled ? 'Отключить' : 'Подключить';
            toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            toggle.disabled = status === 'checking';
            if (status === 'checking') toggle.setAttribute('aria-busy', 'true');
            else toggle.removeAttribute('aria-busy');
        }
        if (test) test.disabled = status === 'checking' || status === 'setup';
    }

    function applyTelegramStatus(result) {
        if (!result || !result.ready) {
            if (state.settings.telegramEnabled) store.updateSettings({ telegramEnabled: false });
            setTelegramPanel('setup', 'Добавьте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в Script Properties.', '', false);
            return;
        }
        const enabled = result.enabled === true;
        if (!!state.settings.telegramEnabled !== enabled) store.updateSettings({ telegramEnabled: enabled });
        const count = Math.max(0, Number(result.pendingCount) || 0);
        const synced = formatTelegramSyncTime(result.lastSyncAt);
        const lastError = String(result.lastError || '').trim();
        setTelegramPanel(lastError ? 'error' : (enabled ? 'connected' : 'idle'), lastError || (enabled ? 'Напоминания будут приходить в личный чат с ботом.' : 'Бот настроен. Подключите напоминания.'), (enabled ? 'В очереди: ' + count : '') + (synced ? (enabled ? ' · ' : '') + 'Синхронизация: ' + synced : ''), enabled);
    }

    async function refreshTelegramStatus(quiet) {
        if (telegramStatusRequest) return telegramStatusRequest;
        const requestGeneration = accountGeneration;
        setTelegramPanel('checking', 'Проверяем связь с ботом…', '', !!state.settings.telegramEnabled);
        telegramStatusRequest = plannerBackendRequest('plannerTelegramStatus').then(function (result) {
            applyTelegramStatus(result);
            return result;
        }).catch(function (error) {
            if (error && error.code === 'STALE_ACCOUNT') return null;
            setTelegramPanel('error', String(error && error.message || error), '', !!state.settings.telegramEnabled);
            if (!quiet) toast(String(error && error.message || 'Не удалось проверить Telegram'), 'error');
            return null;
        }).finally(function () { if (requestGeneration === accountGeneration) telegramStatusRequest = null; });
        return telegramStatusRequest;
    }

    async function syncTelegramReminders(force, propagateError) {
        if (!authorized || !state.settings.telegramEnabled) return null;
        if (Object.keys(store.pending).length || store.lastError || !store.remoteLoaded) return null;
        const syncGeneration = accountGeneration;
        const reminders = buildTelegramReminders();
        const hash = telegramSnapshotHash(reminders);
        if (!force && hash === readTelegramHash()) return null;
        if (telegramSyncInFlight) {
            telegramSyncAgain = true;
            return telegramSyncInFlight;
        }
        telegramSyncInFlight = plannerBackendRequest('plannerTelegramSync', { reminders: reminders }).then(function (result) {
            writeTelegramHash(hash);
            applyTelegramStatus(result);
            return result;
        }).catch(function (error) {
            if (error && error.code === 'STALE_ACCOUNT') return null;
            setTelegramPanel('error', String(error && error.message || error), 'Изменения останутся в плане и будут отправлены при следующей синхронизации.', true);
            if (propagateError) throw error;
            return null;
        }).finally(function () {
            if (syncGeneration !== accountGeneration) return;
            telegramSyncInFlight = null;
            if (telegramSyncAgain) {
                telegramSyncAgain = false;
                scheduleTelegramSync(true, 0);
            }
        });
        return telegramSyncInFlight;
    }

    function scheduleTelegramSync(force, delay) {
        if (!authorized || !state.settings.telegramEnabled) return;
        win.clearTimeout(telegramSyncTimer);
        telegramSyncTimer = win.setTimeout(function () { syncTelegramReminders(force === true); }, typeof delay === 'number' ? delay : TELEGRAM_SYNC_DELAY);
    }

    async function toggleTelegram(button) {
        const enabled = button && button.dataset.telegramEnabled === 'true';
        if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
        setTelegramPanel('checking', enabled ? 'Отключаем напоминания…' : 'Подключаем напоминания…', '', enabled);
        try {
            if (enabled) {
                const result = await plannerBackendRequest('plannerTelegramDisable');
                await store.updateSettings({ telegramEnabled: false });
                writeTelegramHash('');
                applyTelegramStatus(result);
                toast('Telegram-напоминания отключены', 'success');
            } else {
                const result = await plannerBackendRequest('plannerTelegramEnable');
                await store.updateSettings({ telegramEnabled: true });
                applyTelegramStatus(result);
                await syncTelegramReminders(true, true);
                toast('Telegram-напоминания подключены', 'success');
            }
        } catch (error) {
            if (error && error.code === 'STALE_ACCOUNT') return;
            setTelegramPanel('error', String(error && error.message || error), '', !!state.settings.telegramEnabled);
            toast(String(error && error.message || 'Не удалось изменить Telegram'), 'error');
            if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
        }
    }

    async function testTelegram(button) {
        if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
        try {
            await plannerBackendRequest('plannerTelegramTest');
            toast('Тестовое сообщение отправлено', 'success');
        } catch (error) {
            if (error && error.code === 'STALE_ACCOUNT') return;
            toast(String(error && error.message || 'Не удалось отправить тест'), 'error');
        } finally {
            if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
        }
    }

    function cacheRefs() {
        [
            'personalGate', 'personalGateTitle', 'personalGateText', 'personalGateLogin', 'plannerApp', 'plannerMobileNav',
            'plannerMiniDate', 'plannerViewNav', 'plannerInboxBadge', 'plannerHeadingEyebrow', 'plannerHeadingTitle',
            'plannerPrev', 'plannerNext', 'plannerTodayButton', 'plannerAddButton', 'plannerMobileAdd', 'plannerMobileMore', 'plannerSummary',
            'plannerContent', 'plannerExportButton', 'plannerIntegrationsButton', 'plannerItemModal', 'plannerItemForm',
            'plannerItemTitle', 'plannerItemId', 'plannerItemName', 'plannerItemDate', 'plannerItemCategory', 'plannerItemStart',
            'plannerItemEnd', 'plannerItemRepeat', 'plannerItemReminder', 'plannerSeriesTotal', 'plannerGoalTarget',
            'plannerGoalUnit', 'plannerTaskDeadline', 'plannerWeekdays', 'plannerItemNotes', 'plannerFormError',
            'plannerRepeatInterval', 'plannerRepeatUntil', 'plannerSeriesSolved', 'plannerSeriesWritten', 'plannerGoalCurrent',
            'plannerDeleteButton', 'plannerUtilityModal', 'plannerUtilityTitle', 'plannerUtilityContent'
        ].forEach(function (id) { refs[id] = byId(id); });
    }

    function showGate(mode) {
        authorized = false;
        doc.querySelectorAll('.planner-modal-layer:not([hidden])').forEach(closeModal);
        win.clearTimeout(telegramSyncTimer);
        telegramRequestControllers.forEach(function (controller) { controller.abort(); });
        telegramRequestControllers.clear();
        telegramStatusRequest = null;
        telegramSyncInFlight = null;
        telegramSyncAgain = false;
        refs.plannerApp.hidden = true;
        refs.plannerMobileNav.hidden = true;
        refs.personalGate.hidden = false;
        refs.personalGateLogin.hidden = mode === 'checking';
        if (mode === 'checking') {
            refs.personalGateTitle.textContent = 'Проверяем аккаунт…';
            refs.personalGateText.textContent = 'Планировщик доступен только владельцу.';
        } else if (mode === 'wrong') {
            refs.personalGateTitle.textContent = 'Нет доступа';
            refs.personalGateText.textContent = 'Этот аккаунт не может открыть личный план.';
            refs.personalGateLogin.textContent = 'Сменить аккаунт';
        } else {
            refs.personalGateTitle.textContent = 'Войдите в аккаунт';
            refs.personalGateText.textContent = 'Для открытия личного плана требуется вход.';
            refs.personalGateLogin.textContent = 'Войти';
        }
    }

    function showApp() {
        authorized = true;
        refs.personalGate.hidden = true;
        refs.plannerApp.hidden = false;
        refs.plannerMobileNav.hidden = false;
        render();
        refreshTelegramStatus(true).then(function () { scheduleTelegramSync(false, 0); });
    }

    function handleAccount(user) {
        if (user && core.isOwner(user) && activeUid === user.uid) return;
        accountGeneration += 1;
        const generation = accountGeneration;
        if (!user) {
            activeUid = '';
            store.disconnect();
            showGate('guest');
            return;
        }
        if (!core.isOwner(user)) {
            activeUid = '';
            store.disconnect();
            showGate('wrong');
            return;
        }
        activeUid = user.uid;
        showGate('checking');
        const database = win.AlmanionAccount && win.AlmanionAccount.database;
        if (!database) {
            refs.personalGateTitle.textContent = 'Не удалось открыть план';
            refs.personalGateText.textContent = 'Firebase недоступен. Обновите страницу.';
            return;
        }
        store.connect(user, database).then(function () { if (generation === accountGeneration) showApp(); }).catch(function () {
            if (generation !== accountGeneration) return;
            activeUid = '';
            refs.personalGateTitle.textContent = 'Не удалось открыть план';
            refs.personalGateText.textContent = 'Проверьте подключение и правила доступа Firebase.';
        });
    }

    function eventsFor(date) { return core.expandItems(state.events, date, date); }
    function tasksFor(date, includeOverdue) {
        const items = core.expandItems(state.tasks, date, date);
        if (includeOverdue) {
            values(state.tasks).forEach(function (task) {
                if (isRecurring(task) || task.date >= date || task.done) return;
                items.push(Object.assign({}, task, { occurrenceDate: task.date, occurrenceId: task.id + '@' + task.date, overdue: true }));
            });
        }
        return items.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    }

    function minutes(time) {
        const match = String(time || '').match(/^(\d{2}):(\d{2})$/);
        return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
    }
    function freeMinutes(date) {
        const intervals = [];
        [core.addDays(date, -1), date].forEach(function (day) {
            eventsFor(day).forEach(function (item) {
                if (item.allDay || !item.startTime || !item.endTime) return;
                let start = minutes(item.startTime);
                let end = minutes(item.endTime);
                if (end <= start) end += 1440;
                if (day !== date) { start -= 1440; end -= 1440; }
                start = Math.max(0, start);
                end = Math.min(1440, end);
                if (end > start) intervals.push([start, end]);
            });
        });
        intervals.sort(function (a, b) { return a[0] - b[0]; });
        let used = 0;
        let current = null;
        intervals.forEach(function (range) {
            if (!current) current = range.slice();
            else if (range[0] <= current[1]) current[1] = Math.max(current[1], range[1]);
            else { used += current[1] - current[0]; current = range.slice(); }
        });
        if (current) used += current[1] - current[0];
        return Math.max(0, 1440 - used);
    }

    function summaryMarkup() {
        const events = eventsFor(selectedDate).filter(function (item) { return item.id !== 'system-sleep'; });
        const tasks = tasksFor(selectedDate, true).filter(function (item) { return !taskDone(item, item.occurrenceDate); });
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const next = events.filter(function (item) { return item.startTime && (!isToday(selectedDate) || minutes(item.startTime) >= currentTime); })[0];
        const activeGoals = values(state.goals).filter(function (goal) { return num(goal.current) < num(goal.target, 1); }).length + values(state.series).filter(function (series) { return num(series.solved) < num(series.total, 1); }).length;
        const free = freeMinutes(selectedDate);
        const cards = [
            { value: next ? next.startTime : '—', label: next ? next.title : 'Нет следующего события', icon: '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/>' },
            { value: String(events.length), label: events.length === 1 ? 'событие' : 'событий', icon: '<path d="M5 3v3m14-3v3M3 8h18M4 5h16a1 1 0 0 1 1 1v15H3V6a1 1 0 0 1 1-1Z"/>' },
            { value: String(tasks.length), label: 'дел осталось', icon: '<path d="M5 12l4 4L19 6"/>' },
            { value: Math.floor(free / 60) + ' ч ' + (free % 60 ? free % 60 + ' мин' : ''), label: activeGoals + ' активных целей', icon: '<path d="M4 18h16M6 15V9m6 6V5m6 10v-3"/>' }
        ];
        return cards.map(function (card) {
            return '<article class="planner-summary-card"><span class="planner-summary-icon"><svg viewBox="0 0 24 24">' + card.icon + '</svg></span><div><strong>' + esc(card.value) + '</strong><span>' + esc(card.label) + '</span></div></article>';
        }).join('');
    }

    function agendaItem(item) {
        const category = categoryFor(item);
        const recurring = core.recurrenceText(item);
        return '<article class="planner-agenda-item" data-edit-kind="event" data-edit-id="' + esc(item.id) + '" role="button" tabindex="0" style="--item-color:' + category.color + '">' +
            '<span class="planner-agenda-time">' + esc(item.allDay || !item.startTime ? 'весь день' : item.startTime) + '</span><span class="planner-agenda-mark"></span>' +
            '<div class="planner-agenda-copy"><strong>' + esc(item.title) + '</strong><span>' + esc(category.label + (recurring ? ' · ' + recurring : '') + (item.notes ? ' · ' + item.notes : '')) + '</span></div>' +
            '<div class="planner-agenda-actions"><button type="button" data-edit-kind="event" data-edit-id="' + esc(item.id) + '" aria-label="Изменить"><svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button></div></article>';
    }

    function taskItem(item) {
        const done = taskDone(item, item.occurrenceDate);
        return '<article class="planner-task-row' + (done ? ' is-done' : '') + '">' +
            '<button class="planner-task-check" type="button" data-task-toggle="' + esc(item.id) + '" data-task-date="' + esc(item.occurrenceDate) + '" aria-label="' + (done ? 'Вернуть задачу' : 'Выполнить задачу') + '">' + (done ? '✓' : '') + '</button>' +
            '<div><strong>' + esc(item.title) + '</strong><small>' + esc((item.overdue ? 'Просрочено · ' + formatDate(item.date) : (item.deadlineTime || categoryFor(item).label))) + '</small></div>' +
            '<button type="button" data-edit-kind="task" data-edit-id="' + esc(item.id) + '" aria-label="Изменить">•••</button></article>';
    }

    function emptyMarkup(title, text) { return '<div class="planner-empty"><div><strong>' + esc(title) + '</strong><span>' + esc(text) + '</span></div></div>'; }

    function renderToday() {
        const events = eventsFor(selectedDate);
        const tasks = tasksFor(selectedDate, true);
        const visibleEvents = events.filter(function (item) { return item.id !== 'system-sleep'; });
        const sleep = events.find(function (item) { return item.id === 'system-sleep'; });
        const eventMarkup = visibleEvents.length ? visibleEvents.map(agendaItem).join('') : emptyMarkup('День свободен', 'Добавьте событие или гибкий блок.');
        const taskMarkup = tasks.length ? tasks.map(taskItem).join('') : emptyMarkup('Задач нет', 'Ничего не требует внимания.');
        return '<div class="planner-today-grid"><section class="planner-panel"><div class="planner-section-heading"><h2>Расписание</h2><button type="button" data-add-for-date="' + selectedDate + '">+ Событие</button></div><div class="planner-agenda">' + eventMarkup + '</div>' +
            (sleep ? '<div class="planner-agenda" style="margin-top:.5rem">' + agendaItem(sleep) + '</div>' : '') + '</section>' +
            '<aside><section class="planner-panel"><div class="planner-section-heading"><h2>Задачи</h2><button type="button" data-add-task-date="' + selectedDate + '">+ Задача</button></div><div class="planner-side-list">' + taskMarkup + '</div></section>' +
            seriesSnapshotMarkup() + '</aside></div>';
    }

    function seriesSnapshotMarkup() {
        const series = values(state.series).filter(function (item) { return item.date <= selectedDate; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })[0];
        if (!series) return '<section class="planner-panel"><div class="planner-section-heading"><h2>Серия кружка</h2><button type="button" data-add-series>Создать</button></div>' + emptyMarkup('Серия не добавлена', 'Укажите число задач и отмечайте продвижение.') + '</section>';
        const solved = num(series.solved);
        const total = Math.max(1, num(series.total, 1));
        return '<section class="planner-panel"><div class="planner-section-heading"><h2>Текущая серия</h2><button type="button" data-edit-kind="series" data-edit-id="' + esc(series.id) + '">Изменить</button></div>' +
            '<article class="planner-goal-card"><header><div><h3>' + esc(series.title) + '</h3><p>' + esc(formatDate(series.date)) + '</p></div><strong>' + solved + '/' + total + '</strong></header><div class="planner-progress"><span style="width:' + Math.min(100, solved / total * 100) + '%"></span></div><div class="planner-goal-meta"><span>решено</span><span>' + num(series.written) + ' оформлено</span></div><div class="planner-goal-controls"><button type="button" data-series-delta="-1" data-series-id="' + esc(series.id) + '">−</button><button type="button" data-series-delta="1" data-series-id="' + esc(series.id) + '">+ решено</button></div></article></section>';
    }

    function combinedForDate(date) {
        return eventsFor(date).filter(function (item) { return item.id !== 'system-sleep'; }).map(function (item) { return Object.assign({ renderType: 'event' }, item); })
            .concat(tasksFor(date, false).map(function (item) { return Object.assign({ renderType: 'task' }, item); }))
            .sort(function (a, b) { return String(a.startTime || a.deadlineTime || '99:99').localeCompare(String(b.startTime || b.deadlineTime || '99:99')); });
    }

    function renderWeek() {
        const start = core.startOfWeek(selectedDate);
        let columns = '';
        for (let index = 0; index < 7; index++) {
            const date = core.addDays(start, index);
            const day = core.parseDate(date);
            const items = combinedForDate(date);
            columns += '<section class="planner-day-column' + (isToday(date) ? ' is-today' : '') + '" data-select-date="' + date + '" role="button" tabindex="0"><header class="planner-day-heading"><span>' + esc(RU_WEEKDAYS[day.getDay()].slice(0, 2)) + '</span><strong>' + day.getDate() + '</strong></header><div class="planner-day-events">' +
                items.map(function (item) { const category = categoryFor(item); return '<article class="planner-week-event" data-edit-kind="' + item.renderType + '" data-edit-id="' + esc(item.id) + '" role="button" tabindex="0" style="--item-color:' + category.color + '"><strong>' + esc(item.title) + '</strong><span>' + esc(item.startTime || item.deadlineTime || category.label) + '</span></article>'; }).join('') + '</div></section>';
        }
        return '<div class="planner-board planner-week-wrap"><div class="planner-week">' + columns + '</div></div>';
    }

    function renderMonth() {
        const selected = core.parseDate(selectedDate);
        const monthStart = new Date(selected.getFullYear(), selected.getMonth(), 1, 12);
        const gridStart = core.startOfWeek(core.dateKey(monthStart));
        const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(function (day) { return '<div class="planner-month-weekday">' + day + '</div>'; }).join('');
        let days = '';
        for (let index = 0; index < 42; index++) {
            const date = core.addDays(gridStart, index);
            const parsed = core.parseDate(date);
            const items = combinedForDate(date).slice(0, 3);
            days += '<article class="planner-month-day' + (parsed.getMonth() !== selected.getMonth() ? ' is-outside' : '') + (isToday(date) ? ' is-today' : '') + '" data-select-date="' + date + '" role="button" tabindex="0" aria-label="' + esc(formatDate(date) + (items.length ? ': ' + items.map(function (item) { return item.title; }).join(', ') : ', нет событий')) + '"><strong>' + parsed.getDate() + '</strong><div class="planner-month-events">' + items.map(function (item) { return '<span class="planner-month-event" style="--item-color:' + categoryFor(item).color + '">' + esc(item.title) + '</span>'; }).join('') + (combinedForDate(date).length > 3 ? '<span class="planner-month-event">ещё ' + (combinedForDate(date).length - 3) + '</span>' : '') + '</div></article>';
        }
        return '<div class="planner-board"><div class="planner-month">' + weekdays + days + '</div></div>';
    }

    function goalCard(goal, kind) {
        const current = kind === 'series' ? num(goal.solved) : num(goal.current);
        const target = Math.max(1, num(kind === 'series' ? goal.total : goal.target, 1));
        const unit = kind === 'series' ? 'задач' : (goal.unit || '');
        return '<article class="planner-goal-card"><header><div><h3>' + esc(goal.title) + '</h3><p>' + esc((kind === 'series' ? 'Серия · ' : '') + formatDate(goal.date)) + '</p></div><button type="button" data-edit-kind="' + kind + '" data-edit-id="' + esc(goal.id) + '" aria-label="Изменить">•••</button></header><div class="planner-progress"><span style="width:' + Math.min(100, current / target * 100) + '%"></span></div><div class="planner-goal-meta"><span>' + current + ' из ' + target + ' ' + esc(unit) + '</span><span>' + Math.round(current / target * 100) + '%</span></div><div class="planner-goal-controls"><button type="button" data-goal-kind="' + kind + '" data-goal-id="' + esc(goal.id) + '" data-goal-delta="-1">−</button><button type="button" data-goal-kind="' + kind + '" data-goal-id="' + esc(goal.id) + '" data-goal-delta="1">+ Отметить</button></div></article>';
    }

    function renderGoals() {
        const goals = values(state.goals).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
        const series = values(state.series).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
        const all = goals.map(function (goal) { return goalCard(goal, 'goal'); }).concat(series.map(function (item) { return goalCard(item, 'series'); }));
        return '<section class="planner-panel"><div class="planner-section-heading"><h2>Цели и серии</h2><button type="button" data-add-goal>+ Цель</button></div><div class="planner-card-grid">' + (all.length ? all.join('') : emptyMarkup('Целей пока нет', 'Создайте измеримую цель или серию кружка.')) + '</div></section>';
    }

    function inboxCard(item) {
        return '<article class="planner-inbox-card"><header><div><h3>' + esc(item.title || item.payload && item.payload.title || 'Новая запись') + '</h3><p>' + esc((item.source || 'Импорт') + (item.payload && item.payload.date ? ' · ' + formatDate(item.payload.date) : '')) + '</p></div></header>' +
            (item.notes ? '<p>' + esc(item.notes) + '</p>' : '') + '<div class="planner-inbox-actions"><button type="button" data-inbox-accept="' + esc(item.id) + '">Добавить в план</button><button type="button" data-inbox-reject="' + esc(item.id) + '">Отклонить</button></div></article>';
    }

    function renderInbox() {
        const items = values(state.inbox).filter(function (item) { return item.status !== 'accepted'; }).sort(function (a, b) { return num(b.createdAt) - num(a.createdAt); });
        const sourceCards = '<article class="planner-inbox-card"><header><div><h3>Crimson</h3><p>Расписание меняется по неделям</p></div></header><p>Пока письма не подключены, добавляйте занятия одной записью. Автоматический импорт появится после настройки почтового моста.</p><div class="planner-inbox-actions"><button type="button" data-add-crimson>Добавить занятие</button></div></article>' +
            '<article class="planner-inbox-card"><header><div><h3>ChatGPT</h3><p>Математика и программирование</p></div></header><p>Вставьте структурированный пакет из чата — каждое действие сначала попадёт сюда на проверку.</p><div class="planner-inbox-actions"><button type="button" data-open-import>Импортировать план</button></div></article>';
        return '<section class="planner-panel"><div class="planner-section-heading"><h2>Новые предложения</h2><button type="button" data-open-import>Импорт</button></div><div class="planner-card-grid">' + sourceCards + items.map(inboxCard).join('') + '</div></section>';
    }

    function renderHeading() {
        const date = core.parseDate(selectedDate);
        refs.plannerMiniDate.innerHTML = '<strong>' + date.getDate() + '</strong><span>' + esc(RU_MONTHS[date.getMonth()] + ' · ' + RU_WEEKDAYS[date.getDay()]) + '</span>';
        if (currentView === 'week') {
            const start = core.startOfWeek(selectedDate);
            refs.plannerHeadingEyebrow.textContent = formatDate(start) + ' — ' + formatDate(core.addDays(start, 6));
        } else if (currentView === 'month') {
            refs.plannerHeadingEyebrow.textContent = String(date.getFullYear());
        } else {
            refs.plannerHeadingEyebrow.textContent = RU_WEEKDAYS[date.getDay()] + ' · ' + dateTitle(selectedDate);
        }
        refs.plannerHeadingTitle.textContent = currentView === 'month'
            ? new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(date)
            : VIEW_LABELS[currentView];
    }

    function render() {
        if (!authorized) return;
        renderHeading();
        refs.plannerSummary.innerHTML = summaryMarkup();
        if (currentView === 'today') refs.plannerContent.innerHTML = renderToday();
        else if (currentView === 'week') refs.plannerContent.innerHTML = renderWeek();
        else if (currentView === 'month') refs.plannerContent.innerHTML = renderMonth();
        else if (currentView === 'goals') refs.plannerContent.innerHTML = renderGoals();
        else refs.plannerContent.innerHTML = renderInbox();
        const inboxCount = values(state.inbox).filter(function (item) { return item.status !== 'accepted'; }).length;
        refs.plannerInboxBadge.textContent = inboxCount;
        refs.plannerInboxBadge.hidden = inboxCount === 0;
        doc.querySelectorAll('[data-view]').forEach(function (button) { button.classList.toggle('is-active', button.dataset.view === currentView); });
        refs.plannerMobileMore.classList.toggle('is-active', currentView === 'month' || currentView === 'inbox');
    }

    function changeView(view) {
        if (!VIEW_LABELS[view]) return;
        currentView = view;
        render();
        win.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function shiftPeriod(direction) {
        if (currentView === 'month') {
            const date = core.parseDate(selectedDate);
            const preferredDay = date.getDate();
            date.setDate(1);
            date.setMonth(date.getMonth() + direction);
            const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
            date.setDate(Math.min(preferredDay, lastDay));
            selectedDate = core.dateKey(date);
        } else selectedDate = core.addDays(selectedDate, direction * (currentView === 'week' ? 7 : 1));
        render();
    }

    function closeModal(layer) {
        if (!layer) return;
        layer.hidden = true;
        layer.setAttribute('aria-hidden', 'true');
        doc.body.style.overflow = '';
        if (lastModalOpener && lastModalOpener.isConnected) lastModalOpener.focus();
        lastModalOpener = null;
    }
    function openModal(layer) {
        lastModalOpener = doc.activeElement;
        layer.hidden = false;
        layer.setAttribute('aria-hidden', 'false');
        doc.body.style.overflow = 'hidden';
        const focusTarget = layer.querySelector('input:not([type="hidden"]), textarea, select, button, [tabindex="0"]');
        if (focusTarget) setTimeout(function () { focusTarget.focus(); }, 0);
    }

    function setItemType(type) {
        refs.plannerItemForm.querySelectorAll('[name="itemType"]').forEach(function (radio) { radio.checked = radio.value === type; });
        refs.plannerItemForm.querySelectorAll('.planner-event-only').forEach(function (node) { node.hidden = type !== 'event'; });
        refs.plannerItemForm.querySelectorAll('.planner-task-only').forEach(function (node) { node.hidden = type !== 'task'; });
        refs.plannerItemForm.querySelectorAll('.planner-series-only').forEach(function (node) { node.hidden = type !== 'series'; });
        refs.plannerItemForm.querySelectorAll('.planner-goal-only').forEach(function (node) { node.hidden = type !== 'goal'; });
        refs.plannerItemForm.querySelectorAll('.planner-repeat-only').forEach(function (node) { node.hidden = type !== 'event' && type !== 'task'; });
        refs.plannerItemForm.querySelectorAll('.planner-repeat-details').forEach(function (node) { node.hidden = !['event', 'task'].includes(type) || refs.plannerItemRepeat.value === 'none'; });
        refs.plannerItemForm.querySelectorAll('.planner-field input, .planner-field select').forEach(function (field) { field.disabled = field.closest('.planner-field').hidden; });
        refs.plannerWeekdays.hidden = !['event', 'task'].includes(type) || refs.plannerItemRepeat.value !== 'weekly';
    }

    function findItem(kind, id) { return state[TYPE_COLLECTION[kind]] && state[TYPE_COLLECTION[kind]][id]; }

    function openItem(kind, id, date) {
        const item = id ? findItem(kind, id) : null;
        editingKind = item ? kind : '';
        refs.plannerItemForm.reset();
        refs.plannerItemId.value = item && item.id || '';
        refs.plannerItemName.value = item && item.title || '';
        refs.plannerItemDate.value = item && item.date || date || selectedDate;
        refs.plannerItemCategory.value = item && item.category || (kind === 'series' ? 'math' : 'personal');
        refs.plannerItemStart.value = item && item.startTime || '';
        refs.plannerItemEnd.value = item && item.endTime || '';
        refs.plannerItemRepeat.value = item && item.recurrence && item.recurrence.frequency || 'none';
        refs.plannerRepeatInterval.value = item && item.recurrence && item.recurrence.interval || 1;
        refs.plannerRepeatUntil.value = item && item.recurrence && item.recurrence.until || '';
        refs.plannerItemReminder.value = item && item.reminderMinutes && item.reminderMinutes[0] || '';
        refs.plannerSeriesTotal.value = item && item.total || 10;
        refs.plannerSeriesSolved.value = num(item && item.solved);
        refs.plannerSeriesWritten.value = num(item && item.written);
        refs.plannerGoalCurrent.value = num(item && item.current);
        refs.plannerGoalTarget.value = item && item.target || 1;
        refs.plannerGoalUnit.value = item && item.unit || 'шагов';
        refs.plannerTaskDeadline.value = item && item.deadlineTime || '';
        refs.plannerItemNotes.value = item && item.notes || '';
        refs.plannerFormError.hidden = true;
        const type = kind || 'event';
        setItemType(type);
        refs.plannerItemTitle.textContent = item ? 'Изменить запись' : (type === 'series' ? 'Новая серия' : type === 'goal' ? 'Новая цель' : type === 'task' ? 'Новая задача' : 'Новое событие');
        refs.plannerDeleteButton.hidden = !item || item.system === true;
        refs.plannerItemForm.querySelectorAll('[name="itemType"]').forEach(function (radio) { radio.disabled = !!(item && item.system); });
        const selectedDays = item && item.recurrence && item.recurrence.days || [core.parseDate(refs.plannerItemDate.value).getDay()];
        refs.plannerWeekdays.querySelectorAll('input').forEach(function (input) { input.checked = selectedDays.map(Number).includes(Number(input.value)); });
        openModal(refs.plannerItemModal);
        setTimeout(function () { refs.plannerItemName.focus(); }, 0);
    }

    function formType() { const selected = refs.plannerItemForm.querySelector('[name="itemType"]:checked'); return selected ? selected.value : 'event'; }

    function saveItem(event) {
        event.preventDefault();
        if (!authorized) return;
        const type = formType();
        const title = refs.plannerItemName.value.trim();
        if (!title) {
            refs.plannerFormError.textContent = 'Введите название.';
            refs.plannerFormError.hidden = false;
            return;
        }
        const id = refs.plannerItemId.value || core.safeId(type);
        const repeat = ['event', 'task'].includes(type) ? refs.plannerItemRepeat.value : 'none';
        const existing = editingKind ? findItem(editingKind, id) : null;
        const common = {
            id: id,
            title: title,
            category: refs.plannerItemCategory.value,
            date: refs.plannerItemDate.value,
            recurrence: { frequency: repeat, interval: repeat === 'none' ? 1 : Number(refs.plannerRepeatInterval.value) || 1 },
            notes: refs.plannerItemNotes.value.trim(),
            createdAt: existing && existing.createdAt || Date.now()
        };
        const until = refs.plannerRepeatUntil.value;
        if (repeat !== 'none' && until) common.recurrence.until = until;
        if (repeat === 'weekly') common.recurrence.days = Array.from(refs.plannerWeekdays.querySelectorAll('input:checked')).map(function (input) { return Number(input.value); });
        let validation = '';
        if (!Number.isFinite(core.parseDate(common.date).getTime())) validation = 'Укажите корректную дату.';
        else if (type === 'event' && refs.plannerItemEnd.value && !refs.plannerItemStart.value) validation = 'Укажите время начала или очистите время окончания для события на весь день.';
        else if (repeat !== 'none' && until && until < common.date) validation = 'Окончание повторений не может быть раньше начала.';
        else if (repeat === 'weekly' && !common.recurrence.days.length) validation = 'Выберите хотя бы один день недели.';
        else if (type === 'series' && (num(refs.plannerSeriesSolved.value) > num(refs.plannerSeriesTotal.value) || num(refs.plannerSeriesWritten.value) > num(refs.plannerSeriesSolved.value))) validation = 'Оформленных задач не может быть больше решённых, а решённых — больше общего числа.';
        if (validation) {
            refs.plannerFormError.textContent = validation;
            refs.plannerFormError.hidden = false;
            return;
        }
        if (existing && existing.system && type === 'event') common.system = true;
        let item = common;
        if (type === 'event') item = Object.assign(common, {
            startTime: refs.plannerItemStart.value,
            endTime: refs.plannerItemEnd.value,
            allDay: !refs.plannerItemStart.value,
            reminderMinutes: refs.plannerItemReminder.value ? [Number(refs.plannerItemReminder.value)] : []
        });
        else if (type === 'task') item = Object.assign(common, {
            deadlineTime: refs.plannerTaskDeadline.value,
            done: !!(existing && existing.done === true),
            completedDates: existing && existing.completedDates || {}
        });
        else if (type === 'series') item = Object.assign(common, {
            total: Math.max(1, num(refs.plannerSeriesTotal.value, 1)),
            attempted: num(existing && existing.attempted),
            solved: num(refs.plannerSeriesSolved.value),
            independent: num(existing && existing.independent),
            written: num(refs.plannerSeriesWritten.value),
            checked: num(existing && existing.checked)
        });
        else item = Object.assign(common, { target: Math.max(1, num(refs.plannerGoalTarget.value, 1)), current: num(refs.plannerGoalCurrent.value), unit: refs.plannerGoalUnit.value.trim() || 'шагов' });

        const collection = TYPE_COLLECTION[type];
        const updates = {};
        if (editingKind && editingKind !== type) updates[TYPE_COLLECTION[editingKind] + '/' + id] = null;
        updates[collection + '/' + id] = Object.assign(item, { updatedAt: Date.now() });
        store.patch(updates);
        closeModal(refs.plannerItemModal);
    }

    function deleteItem() {
        const id = refs.plannerItemId.value;
        if (!id || !editingKind || !authorized || !win.confirm('Удалить запись? Для повторяющейся записи будут удалены все повторения.')) return;
        store.remove(TYPE_COLLECTION[editingKind], id);
        closeModal(refs.plannerItemModal);
    }

    function toggleTask(id, date) {
        const task = state.tasks[id];
        if (!task) return;
        const next = Object.assign({}, task);
        if (isRecurring(task)) {
            next.completedDates = Object.assign({}, task.completedDates || {});
            if (next.completedDates[date]) delete next.completedDates[date]; else next.completedDates[date] = true;
        } else next.done = !task.done;
        store.upsert('tasks', next);
    }

    function changeProgress(kind, id, delta) {
        const collection = TYPE_COLLECTION[kind];
        const item = state[collection] && state[collection][id];
        if (!item) return;
        const next = Object.assign({}, item);
        const key = kind === 'series' ? 'solved' : 'current';
        const maximum = Math.max(1, num(kind === 'series' ? item.total : item.target, 1));
        next[key] = Math.max(kind === 'series' ? num(item.written) : 0, Math.min(maximum, num(item[key]) + delta));
        store.upsert(collection, next);
    }

    function acceptInbox(id) {
        const item = state.inbox[id];
        if (!item || !TYPE_COLLECTION[item.targetType]) return;
        const normalized = normalizeImportedCandidate(Object.assign({}, item.payload || {}, { type: item.targetType }));
        if (!normalized) return toast('Предложение содержит некорректные данные', 'error');
        const payload = Object.assign({}, normalized);
        delete payload.type;
        const updates = {};
        updates[TYPE_COLLECTION[item.targetType] + '/' + payload.id] = Object.assign(payload, { updatedAt: Date.now() });
        updates['inbox/' + id] = null;
        store.patch(updates);
    }

    function utilityMarkup(mode) {
        if (mode === 'export') return '<section class="planner-utility-section"><h3>Календарь</h3><p>Файл ICS содержит события на ближайший год и встроенные напоминания. Его можно открыть в Google Calendar.</p><div class="planner-utility-actions"><button type="button" data-export-ics>Скачать .ics</button></div></section>' +
            '<section class="planner-utility-section"><h3>Резервная копия</h3><p>Полный личный архив: календарь, задачи, цели и спортивные записи.</p><div class="planner-utility-actions"><button type="button" data-export-json>Скачать JSON</button><label>Восстановить из JSON<input type="file" accept="application/json" data-import-json-file></label></div></section>';
        if (mode === 'mobile') return '<section class="planner-utility-section"><h3>Разделы</h3><div class="planner-utility-actions planner-mobile-more-actions"><button type="button" data-mobile-view="month">Месяц</button><button type="button" data-mobile-view="inbox">Входящие</button><button type="button" data-mobile-utility="export">Экспорт и копия</button><button type="button" data-mobile-utility="integrations">Связи и импорт</button></div></section>';
        return '<section class="planner-utility-section planner-integration-section"><div class="planner-integration-heading"><h3>Telegram</h3><span class="planner-integration-state is-checking" id="plannerTelegramState" role="status" aria-live="polite">Проверяем…</span></div><p id="plannerTelegramStatus">Проверяем связь с ботом…</p><p class="planner-integration-note">Для события без времени время начала считается равным 09:00 по Москве.</p><div class="planner-utility-actions"><button type="button" data-telegram-toggle data-telegram-enabled="' + (state.settings.telegramEnabled ? 'true' : 'false') + '" aria-pressed="' + (state.settings.telegramEnabled ? 'true' : 'false') + '">' + (state.settings.telegramEnabled ? 'Отключить' : 'Подключить') + '</button><button type="button" data-telegram-test disabled>Отправить тест</button><button type="button" data-telegram-refresh>Обновить статус</button></div><div class="planner-integration-meta" id="plannerTelegramMeta"></div></section>' +
            '<section class="planner-utility-section"><h3>Crimson</h3><p>Следующий этап — почтовый мост Apps Script: письма будут превращаться в предложения во «Входящих», а не сразу менять календарь.</p></section>' +
            '<section class="planner-utility-section"><h3>Импорт из ChatGPT</h3><p>Вставьте JSON с массивами events, tasks и goals либо массив объектов с полем type.</p><div class="planner-import-box"><textarea id="plannerStructuredImport" placeholder=\'{"tasks":[{"title":"Решить задачу","date":"2026-09-24","category":"math"}]}\'></textarea><div class="planner-utility-actions" style="margin-top:.55rem"><button type="button" data-import-structured>Разобрать план</button></div><div class="planner-import-status" id="plannerImportStatus"></div></div></section>';
    }

    function openUtility(mode) {
        refs.plannerUtilityTitle.textContent = mode === 'export' ? 'Экспорт и резервная копия' : mode === 'mobile' ? 'Ещё' : 'Связи и импорт';
        refs.plannerUtilityContent.innerHTML = utilityMarkup(mode);
        openModal(refs.plannerUtilityModal);
        if (mode === 'integrations') refreshTelegramStatus(true);
    }

    function normalizeImportedCandidate(candidate) {
        if (!candidate || !TYPE_COLLECTION[candidate.type]) return null;
        const type = candidate.type;
        const title = String(candidate.title || '').trim().slice(0, 160);
        if (!title) return null;
        const rawDate = String(candidate.date || '');
        const parsedDate = core.parseDate(rawDate);
        const date = !Number.isNaN(parsedDate.getTime()) && core.dateKey(parsedDate) === rawDate ? rawDate : selectedDate;
        const category = CATEGORY[candidate.category] ? candidate.category : (type === 'series' ? 'math' : 'personal');
        const frequency = /^(daily|weekly)$/.test(candidate.recurrence && candidate.recurrence.frequency || '')
            ? candidate.recurrence.frequency : 'none';
        const recurrence = { frequency: frequency, interval: Math.max(1, Math.min(52, num(candidate.recurrence && candidate.recurrence.interval, 1))) };
        if (frequency === 'weekly') {
            const days = Array.isArray(candidate.recurrence && candidate.recurrence.days)
                ? candidate.recurrence.days.map(Number).filter(function (day) { return day >= 0 && day <= 6; }) : [];
            recurrence.days = days.length ? Array.from(new Set(days)) : [core.parseDate(date).getDay()];
        }
        const common = {
            type: type, id: core.safeId(type), title: title, category: category, date: date, recurrence: recurrence,
            notes: String(candidate.notes || '').trim().slice(0, 1200), createdAt: Date.now()
        };
        if (type === 'event') {
            const startTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.startTime || '') ? candidate.startTime : '';
            const endTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.endTime || '') ? candidate.endTime : '';
            return Object.assign(common, { startTime: startTime, endTime: endTime, allDay: !startTime, reminderMinutes: (Array.isArray(candidate.reminderMinutes) ? candidate.reminderMinutes : []).map(Number).filter(function (minute) { return minute > 0 && minute <= 10080; }).slice(0, 4) });
        }
        if (type === 'task') return Object.assign(common, { deadlineTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.deadlineTime || '') ? candidate.deadlineTime : '', done: false, completedDates: {} });
        if (type === 'series') return Object.assign(common, { total: Math.max(1, Math.min(200, num(candidate.total, 1))), attempted: 0, solved: Math.max(0, num(candidate.solved)), independent: 0, written: 0, checked: 0 });
        return Object.assign(common, { target: Math.max(1, Math.min(100000, num(candidate.target, 1))), current: Math.max(0, num(candidate.current)), unit: String(candidate.unit || 'шагов').trim().slice(0, 40) || 'шагов' });
    }

    function importStructured() {
        const field = byId('plannerStructuredImport');
        const status = byId('plannerImportStatus');
        if (!field || !status) return;
        try {
            const parsed = JSON.parse(field.value);
            let candidates = [];
            if (Array.isArray(parsed)) candidates = parsed;
            else ['events', 'tasks', 'goals', 'series'].forEach(function (key) {
                (Array.isArray(parsed[key]) ? parsed[key] : []).forEach(function (payload) { candidates.push(Object.assign({ type: key === 'events' ? 'event' : key === 'tasks' ? 'task' : key === 'goals' ? 'goal' : 'series' }, payload)); });
            });
            candidates = candidates.map(normalizeImportedCandidate).filter(Boolean);
            if (!candidates.length) throw new Error('Не найдено записей с title и type.');
            candidates.forEach(function (candidate) {
                const id = core.safeId('inbox');
                const type = candidate.type;
                const payload = Object.assign({}, candidate);
                delete payload.type;
                store.upsert('inbox', { id: id, source: 'ChatGPT', title: payload.title, targetType: type, payload: payload, createdAt: Date.now(), status: 'pending' });
            });
            status.textContent = 'Добавлено предложений: ' + candidates.length;
            currentView = 'inbox';
        } catch (error) { status.textContent = 'Ошибка: ' + (error && error.message || 'неверный формат'); }
    }

    function exportIcs() {
        const start = core.addDays(core.dateKey(new Date()), -30);
        const end = core.addDays(start, 395);
        core.download('almanion-plan.ics', core.createIcs(state, start, end), 'text/calendar;charset=utf-8');
    }
    function exportJson() { core.download('almanion-personal-backup.json', JSON.stringify(state, null, 2), 'application/json;charset=utf-8'); }
    function importJsonFile(file) {
        if (!file) return;
        file.text().then(function (text) {
            const data = JSON.parse(text);
            if (!data || typeof data !== 'object' || Array.isArray(data) || !['events','tasks','goals','series','sport'].some(function (key) { return Object.prototype.hasOwnProperty.call(data, key); })) throw new Error('invalid-backup');
            if (!win.confirm('Заменить текущий личный план данными из резервной копии? Перед заменой сайт скачает страховочную копию.')) throw new Error('cancelled');
            core.download('almanion-personal-before-restore.json', JSON.stringify(state, null, 2), 'application/json;charset=utf-8');
            return store.importState(data);
        }).then(function (saved) {
            closeModal(refs.plannerUtilityModal);
            toast(saved ? 'Резервная копия восстановлена' : 'Копия восстановлена на устройстве и ждёт синхронизации', saved ? 'success' : 'info');
        }).catch(function (error) {
            if (error && error.message === 'cancelled') return;
            toast('Не удалось прочитать резервную копию', 'error');
        });
    }

    function contentClick(event) {
        if (!authorized) return;
        const target = event.target.closest('button, [data-edit-kind], [data-select-date]');
        if (!target) return;
        if (target.dataset.editKind) return openItem(target.dataset.editKind, target.dataset.editId, selectedDate);
        if (target.dataset.selectDate) { selectedDate = target.dataset.selectDate; currentView = 'today'; return render(); }
        if (target.dataset.addForDate) return openItem('event', '', target.dataset.addForDate);
        if (target.dataset.addTaskDate) return openItem('task', '', target.dataset.addTaskDate);
        if (target.hasAttribute('data-add-series')) return openItem('series', '', selectedDate);
        if (target.hasAttribute('data-add-goal')) return openItem('goal', '', selectedDate);
        if (target.hasAttribute('data-add-crimson')) { openItem('event', '', selectedDate); refs.plannerItemCategory.value = 'crimson'; return; }
        if (target.hasAttribute('data-open-import')) return openUtility('integrations');
        if (target.dataset.taskToggle) return toggleTask(target.dataset.taskToggle, target.dataset.taskDate);
        if (target.dataset.seriesId) return changeProgress('series', target.dataset.seriesId, num(target.dataset.seriesDelta));
        if (target.dataset.goalId) return changeProgress(target.dataset.goalKind, target.dataset.goalId, num(target.dataset.goalDelta));
        if (target.dataset.inboxAccept) return acceptInbox(target.dataset.inboxAccept);
        if (target.dataset.inboxReject) return store.remove('inbox', target.dataset.inboxReject);
    }

    function bindEvents() {
        refs.personalGateLogin.addEventListener('click', function () {
            if (win.AlmanionAccount) win.AlmanionAccount.openLogin();
        });
        refs.plannerViewNav.addEventListener('click', function (event) { const button = event.target.closest('[data-view]'); if (button) changeView(button.dataset.view); });
        refs.plannerMobileNav.addEventListener('click', function (event) { const button = event.target.closest('[data-view]'); if (button) changeView(button.dataset.view); });
        refs.plannerMobileMore.addEventListener('click', function () { openUtility('mobile'); });
        refs.plannerPrev.addEventListener('click', function () { shiftPeriod(-1); });
        refs.plannerNext.addEventListener('click', function () { shiftPeriod(1); });
        refs.plannerTodayButton.addEventListener('click', function () { selectedDate = core.dateKey(new Date()); render(); });
        refs.plannerAddButton.addEventListener('click', function () { openItem('event', '', selectedDate); });
        refs.plannerMobileAdd.addEventListener('click', function () { openItem('event', '', selectedDate); });
        refs.plannerExportButton.addEventListener('click', function () { openUtility('export'); });
        refs.plannerIntegrationsButton.addEventListener('click', function () { openUtility('integrations'); });
        refs.plannerContent.addEventListener('click', contentClick);
        refs.plannerContent.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const target = event.target.closest('[data-edit-kind], [data-select-date]');
            if (!target || target !== event.target) return;
            event.preventDefault();
            target.click();
        });
        refs.plannerItemForm.addEventListener('change', function (event) {
            if (event.target.name === 'itemType') setItemType(event.target.value);
            if (event.target === refs.plannerItemRepeat) setItemType(formType());
        });
        refs.plannerItemForm.addEventListener('submit', saveItem);
        refs.plannerDeleteButton.addEventListener('click', deleteItem);
        doc.querySelectorAll('[data-close-modal]').forEach(function (button) { button.addEventListener('click', function () { closeModal(button.closest('.planner-modal-layer')); }); });
        doc.querySelectorAll('.planner-modal-layer').forEach(function (layer) { layer.addEventListener('click', function (event) { if (event.target === layer) closeModal(layer); }); });
        refs.plannerUtilityContent.addEventListener('click', function (event) {
            const target = event.target.closest('button');
            if (!target) return;
            if (target.hasAttribute('data-export-ics')) exportIcs();
            else if (target.hasAttribute('data-export-json')) exportJson();
            else if (target.hasAttribute('data-import-structured')) importStructured();
            else if (target.dataset.mobileView) { closeModal(refs.plannerUtilityModal); changeView(target.dataset.mobileView); }
            else if (target.dataset.mobileUtility) {
                const opener = lastModalOpener;
                openUtility(target.dataset.mobileUtility);
                lastModalOpener = opener;
            }
            else if (target.hasAttribute('data-telegram-toggle')) toggleTelegram(target);
            else if (target.hasAttribute('data-telegram-test')) testTelegram(target);
            else if (target.hasAttribute('data-telegram-refresh')) refreshTelegramStatus(false);
        });
        refs.plannerUtilityContent.addEventListener('change', function (event) { if (event.target.hasAttribute('data-import-json-file')) importJsonFile(event.target.files && event.target.files[0]); });
        doc.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') doc.querySelectorAll('.planner-modal-layer:not([hidden])').forEach(closeModal);
            if (event.key === 'Tab') {
                const layer = doc.querySelector('.planner-modal-layer:not([hidden])');
                if (layer) {
                    const focusable = Array.from(layer.querySelectorAll('button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]')).filter(function (node) { return node.offsetParent !== null; });
                    if (focusable.length) {
                        const first = focusable[0];
                        const last = focusable[focusable.length - 1];
                        if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
                        else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
                    }
                }
            }
            if (authorized && !doc.querySelector('.planner-modal-layer:not([hidden])') && (event.key.toLowerCase() === 'n' || (event.ctrlKey && event.key.toLowerCase() === 'k')) && !/INPUT|TEXTAREA|SELECT/.test(doc.activeElement && doc.activeElement.tagName || '')) {
                event.preventDefault();
                openItem('event', '', selectedDate);
            }
        });
    }

    function init() {
        cacheRefs();
        bindEvents();
        store.subscribe(function (next, detail) {
            state = next;
            if (authorized && detail.source !== 'sync' && detail.source !== 'error') render();
            if (authorized && state.settings.telegramEnabled && detail && ['local', 'remote', 'seed', 'sync'].includes(detail.source)) scheduleTelegramSync(false);
        });
        core.mountSyncStatus(store, byId('personalSyncStatus'));
        showGate('checking');
        win.addEventListener('almanion-account-ready', function (event) { handleAccount(event.detail && event.detail.user); });
        const account = win.AlmanionAccount;
        if (account && account.auth && typeof account.auth.onAuthStateChanged === 'function') account.auth.onAuthStateChanged(handleAccount);
        else handleAccount(account && account.getUser ? account.getUser() : null);
        win.addEventListener('online', function () { scheduleTelegramSync(true, 0); });
        doc.addEventListener('visibilitychange', function () { if (!doc.hidden) scheduleTelegramSync(false, 0); });
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
}(window));
