(function (root) {
    'use strict';

    const {
        DATA_PATH, CACHE_KEY, DEFAULT_SCHEDULE, normalizeSchedule, entrySegments, scheduleState,
        todayIso, monthKey, entryMonthKeys, monthLabel, formatDayMonth, formatRange, formatEntryRange
    } = root.AlmanionDuty;

    const byId = id => document.getElementById(id);
    const storage = {
        read(key) {
            try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
        },
        write(key, value) {
            try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
        },
        remove(key) {
            try { localStorage.removeItem(key); } catch (_) {}
        }
    };

    function toast(message, type) {
        if (root.AlmanionToast && typeof root.AlmanionToast.show === 'function') {
            root.AlmanionToast.show(message, { type: type || 'info' });
        }
    }

    let schedule = normalizeSchedule(DEFAULT_SCHEDULE);
    let selectedMonth = null;
    let searchQuery = '';
    let focusEntry = null;

    function setSyncStatus(text, offline) {
        const element = byId('dutySyncStatus');
        if (!element) return;
        element.textContent = text;
        element.classList.toggle('is-offline', !!offline);
    }

    function formatUpdatedAt(timestamp) {
        if (!timestamp) return '';
        try {
            return new Intl.DateTimeFormat('ru-RU', {
                day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
            }).format(new Date(timestamp));
        } catch (_) { return ''; }
    }

    function loadFallback() {
        const cached = storage.read(CACHE_KEY);
        const normalizedCache = normalizeSchedule(cached);
        if (normalizedCache.entries.length) {
            schedule = normalizedCache;
            setSyncStatus('Показана последняя сохранённая версия', true);
        } else {
            schedule = normalizeSchedule(DEFAULT_SCHEDULE);
            setSyncStatus('Стартовое расписание · ожидает первой публикации', true);
        }
        renderAll();
    }

    function loadCloudSchedule(database, onRevisionChanged) {
        if (!database) {
            loadFallback();
            return;
        }
        database.ref(DATA_PATH).on('value', function (snapshot) {
            const raw = snapshot.val();
            if (raw) {
                const next = normalizeSchedule(raw);
                if (next.entries.length) {
                    const previousRevision = schedule.revision;
                    schedule = next;
                    storage.write(CACHE_KEY, raw);
                    const stamp = formatUpdatedAt(next.updatedAt);
                    setSyncStatus(stamp ? 'Обновлено ' + stamp : 'Синхронизировано');
                    onRevisionChanged(next.revision, previousRevision);
                    renderAll();
                    return;
                }
            }
            schedule = normalizeSchedule(DEFAULT_SCHEDULE);
            setSyncStatus('Стартовое расписание · ожидает первой публикации', true);
            renderAll();
        }, function () {
            loadFallback();
        });
    }

    function stateForEntry(entry, state) {
        if (state.current && entry.id === state.current.id) return 'current';
        if (state.next && entry.id === state.next.id) return 'next';
        if (entry.end < state.today) return 'past';
        return 'future';
    }

    function entryStateLabel(kind) {
        if (kind === 'current') return 'Сейчас';
        if (kind === 'next') return 'Следующее';
        if (kind === 'past') return 'Прошло';
        return 'Позже';
    }

    function renderFocus() {
        const state = scheduleState(schedule.entries);
        focusEntry = state.focus;
        const focus = byId('dutyFocus');
        const label = byId('dutyFocusLabel');
        const title = byId('dutyFocusTitle');
        const range = byId('dutyFocusRange');
        const dateBox = byId('dutyFocusDate');
        const share = byId('dutyShareButton');
        byId('dutyNext').hidden = !(state.current && state.next);
        if (state.current && state.next) {
            byId('dutyNextPeople').textContent = state.next.people.join(' + ');
            byId('dutyNextRange').textContent = formatEntryRange(state.next);
        }
        focus.classList.toggle('is-current', !!state.current);
        if (!state.focus) {
            label.textContent = 'Расписание пока пусто';
            title.textContent = 'Дежурные ещё не назначены';
            range.textContent = '';
            dateBox.querySelector('.duty-focus-day').textContent = '—';
            dateBox.querySelector('.duty-focus-month').textContent = '—';
            share.hidden = true;
            return;
        }
        const startDate = formatDayMonth(state.focusSegment ? state.focusSegment.start : state.focus.start);
        dateBox.querySelector('.duty-focus-day').textContent = startDate.day;
        dateBox.querySelector('.duty-focus-month').textContent = startDate.month;
        label.textContent = state.current ? 'Сейчас дежурят' : (state.next ? 'Следующее дежурство' : 'Последнее дежурство в расписании');
        title.textContent = state.focus.people.join(' + ');
        range.textContent = formatEntryRange(state.focus);
        share.hidden = false;
    }

    function updateMonthScroll() {
        const list = byId('dutyMonthFilters');
        const previous = byId('dutyMonthsPrev');
        const next = byId('dutyMonthsNext');
        if (!list || !previous || !next) return;
        const overflowing = list.scrollWidth > list.clientWidth + 2;
        previous.hidden = next.hidden = !overflowing;
        previous.disabled = list.scrollLeft <= 2;
        next.disabled = list.scrollLeft >= list.scrollWidth - list.clientWidth - 2;
    }

    function renderMonthFilters() {
        const rootElement = byId('dutyMonthFilters');
        const scrollLeft = rootElement.scrollLeft;
        const keys = Array.from(new Set(schedule.entries.flatMap(entryMonthKeys))).sort();
        if (selectedMonth === null) {
            const current = todayIso().slice(0, 7);
            selectedMonth = keys.includes(current) ? current : (keys.find(key => key >= current) || keys[keys.length - 1] || 'all');
        }
        if (selectedMonth !== 'all' && keys.indexOf(selectedMonth) === -1) selectedMonth = 'all';
        rootElement.replaceChildren();
        [{ key: 'all', label: 'Весь год' }].concat(keys.map(function (key) {
            return { key: key, label: monthLabel(key).replace(/ \d{4}$/, '') };
        })).forEach(function (item) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'duty-month-filter';
            button.classList.toggle('is-active', selectedMonth === item.key);
            button.setAttribute('aria-pressed', selectedMonth === item.key ? 'true' : 'false');
            button.textContent = item.label;
            button.dataset.month = item.key;
            button.addEventListener('click', function () {
                selectedMonth = item.key;
                // Keep both keyboard focus and the position of the month strip.
                rootElement.querySelectorAll('button').forEach(function (filter) {
                    const active = filter.dataset.month === selectedMonth;
                    filter.classList.toggle('is-active', active);
                    filter.setAttribute('aria-pressed', String(active));
                });
                renderGroups();
            });
            rootElement.appendChild(button);
        });
        rootElement.scrollLeft = scrollLeft;
        updateMonthScroll();
    }

    function makeWeekCard(entry, state) {
        const kind = stateForEntry(entry, state);
        const card = document.createElement('article');
        card.className = 'duty-week-card is-' + kind;
        card.dataset.start = entry.start;

        const top = document.createElement('div');
        top.className = 'duty-week-topline';
        const segments = entrySegments(entry);
        let range;
        if (segments.length > 1) {
            range = document.createElement('ul');
            range.className = 'duty-week-segments';
            segments.forEach(function (segment) {
                const item = document.createElement('li');
                item.className = 'duty-week-segment';
                item.textContent = formatRange(segment.start, segment.end);
                range.appendChild(item);
            });
        } else {
            range = document.createElement('p');
            range.className = 'duty-week-range';
            range.textContent = formatEntryRange(entry);
        }
        const badge = document.createElement('span');
        badge.className = 'duty-week-state';
        badge.textContent = entryStateLabel(kind);
        top.append(range, badge);

        const people = document.createElement('ul');
        people.className = 'duty-week-people';
        entry.people.forEach(function (person) {
            const item = document.createElement('li');
            item.className = 'duty-person';
            item.textContent = person;
            people.appendChild(item);
        });
        card.append(top, people);
        if (entry.note) {
            const note = document.createElement('p');
            note.className = 'duty-week-note';
            note.textContent = entry.note;
            card.appendChild(note);
        }
        return card;
    }

    function makeHolidaySeparator(vacation) {
        const separator = document.createElement('div');
        separator.className = 'duty-holiday-separator';
        const title = document.createElement('p');
        title.className = 'duty-holiday-title';
        title.textContent = vacation.label || 'Каникулы';
        const range = document.createElement('p');
        range.className = 'duty-holiday-range';
        range.textContent = formatRange(vacation.start, vacation.end);
        separator.append(title, range);
        return separator;
    }

    function renderGroups() {
        const rootElement = byId('dutyGroups');
        const empty = byId('dutyEmpty');
        const query = searchQuery.trim().toLocaleLowerCase('ru-RU');
        const visibleMonth = query ? 'all' : selectedMonth;
        const filtered = schedule.entries.filter(function (entry) {
            const monthMatches = visibleMonth === 'all' || entryMonthKeys(entry).includes(visibleMonth);
            const queryMatches = !query || entry.people.concat(entry.note || '').join(' ').toLocaleLowerCase('ru-RU').includes(query);
            return monthMatches && queryMatches;
        });
        rootElement.replaceChildren();
        empty.hidden = filtered.length > 0;
        if (!filtered.length) return;
        const state = scheduleState(schedule.entries);
        const groups = new Map();
        filtered.forEach(function (entry) {
            const key = visibleMonth === 'all' ? monthKey(entry) : visibleMonth;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(entry);
        });
        groups.forEach(function (entries, key) {
            const section = document.createElement('section');
            section.className = 'duty-month-group';
            const heading = document.createElement('h3');
            heading.className = 'duty-month-title';
            heading.textContent = monthLabel(key);
            const grid = document.createElement('div');
            grid.className = 'duty-week-grid';
            const vacations = schedule.config && !query
                ? schedule.config.calendar.vacations.filter(function (vacation) {
                    return selectedMonth === 'all'
                        ? vacation.start.slice(0, 7) === key
                        : vacation.start.slice(0, 7) <= key && vacation.end.slice(0, 7) >= key;
                })
                : [];
            entries.map(function (entry) { return { date: entry.start, entry: entry }; })
                .concat(vacations.map(function (vacation) { return { date: vacation.start, vacation: vacation }; }))
                .sort(function (a, b) { return a.date.localeCompare(b.date); })
                .forEach(function (item) {
                    grid.appendChild(item.entry ? makeWeekCard(item.entry, state) : makeHolidaySeparator(item.vacation));
                });
            section.append(heading, grid);
            rootElement.appendChild(section);
        });
    }

    function renderAll() {
        renderFocus();
        renderMonthFilters();
        renderGroups();
    }

    function shareFocus() {
        if (!focusEntry) return;
        const text = `Дежурство 10‑1 · ${formatEntryRange(focusEntry)}: ${focusEntry.people.join(' + ')}`;
        if (navigator.share) {
            navigator.share({ title: 'Дежурство 10‑1', text: text }).catch(function (error) {
                if (error && error.name !== 'AbortError') copyText(text);
            });
            return;
        }
        copyText(text);
    }

    function copyText(text) {
        const done = function () { toast('Дежурство скопировано', 'success'); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
        } else fallbackCopy(text, done);
    }

    function fallbackCopy(text, done) {
        const input = document.createElement('textarea');
        input.value = text;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        try { if (document.execCommand('copy')) done(); } catch (_) {}
        input.remove();
    }

    function getDatabase() {
        if (root.AlmanionAccount) return root.AlmanionAccount.database || null;
        if (typeof firebase === 'undefined' || typeof firebase.database !== 'function') return null;
        try {
            if (!firebase.apps.length && typeof firebaseConfig !== 'undefined') firebase.initializeApp(firebaseConfig);
            return firebase.database();
        } catch (_) {
            return null;
        }
    }

    function init() {
        const database = getDatabase();
        const editor = root.AlmanionDutyEditor.attach({ database, getSchedule: () => schedule, byId, storage, toast });
        byId('dutySearchInput').addEventListener('input', function (event) {
            searchQuery = event.target.value || '';
            renderGroups();
        });
        byId('dutyShareButton').addEventListener('click', shareFocus);
        renderAll();
        const extra = byId('dutyExtraDetails');
        const dates = [...extra.querySelectorAll('[data-duty-date]')].map(day => day.dataset.dutyDate).sort();
        let displayedDate;
        function updateDatedSchedule() {
            const today = todayIso();
            if (displayedDate === today) return;
            displayedDate = today;
            const past = today > dates.at(-1);
            byId('dutyExtraTitle').textContent = past ? 'Архив дежурств по дням' : 'Дежурство по дням';
            extra.open = (!past && today >= dates[0]) || location.hash === '#dutyExtraSchedule';
            renderFocus();
        }
        updateDatedSchedule();
        document.addEventListener('visibilitychange', () => { if (!document.hidden) updateDatedSchedule(); });
        root.addEventListener('hashchange', () => { if (location.hash === '#dutyExtraSchedule') extra.open = true; });
        const months = byId('dutyMonthFilters');
        if (months) months.addEventListener('scroll', updateMonthScroll, { passive: true });
        [['dutyMonthsPrev', -1], ['dutyMonthsNext', 1]].forEach(function (control) {
            const button = byId(control[0]);
            if (button && months) button.addEventListener('click', function () {
                const reduced = root.matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('animations-off');
                months.scrollBy({ left: control[1] * Math.max(120, months.clientWidth * 0.8), behavior: reduced ? 'instant' : 'smooth' });
            });
        });
        root.addEventListener('resize', updateMonthScroll);
        loadCloudSchedule(database, editor.onRevisionChanged);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
}(window));
