(function (root) {
    'use strict';

    const DATA_PATH = 'classDuty/grade10_1';
    const CACHE_KEY = 'almanion:class-duty:grade10_1:cache';
    const DRAFT_PREFIX = 'almanion:class-duty:grade10_1:draft:';
    const OWNER_EMAIL = 'dmb23930@gmail.com';

    const DEFAULT_SCHEDULE = {
        version: 1,
        className: '10-1',
        academicYear: '2026/2027',
        revision: 0,
        updatedAt: 0,
        updatedBy: '',
        entries: {
            'week-2026-09-02': { start: '2026-09-02', end: '2026-09-05', people: { 'person-0': 'Нонна Маша' }, note: '' },
            'week-2026-09-07': { start: '2026-09-07', end: '2026-09-12', people: { 'person-0': 'Полина Марина' }, note: '' },
            'week-2026-09-14': { start: '2026-09-14', end: '2026-09-19', people: { 'person-0': 'Ани Инга' }, note: '' },
            'week-2026-09-21': { start: '2026-09-21', end: '2026-09-26', people: { 'person-0': 'Катя Даша' }, note: '' },
            'week-2026-09-28': { start: '2026-09-28', end: '2026-10-03', people: { 'person-0': 'Даня Федя' }, note: '' },
            'week-2026-10-05': { start: '2026-10-05', end: '2026-10-10', people: { 'person-0': 'Ваня Ки. Дима Б.' }, note: '' },
            'week-2026-10-12': { start: '2026-10-12', end: '2026-10-17', people: { 'person-0': 'Выровщиков Никита Юрьевич' }, note: '' }
        }
    };

    const MONTHS_GENITIVE = [
        'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    const MONTHS_NOMINATIVE = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];

    function isIsoDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
        const parts = String(value).split('-').map(Number);
        const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        return date.getUTCFullYear() === parts[0]
            && date.getUTCMonth() === parts[1] - 1
            && date.getUTCDate() === parts[2];
    }

    function isoToUtc(value) {
        if (!isIsoDate(value)) return null;
        const parts = value.split('-').map(Number);
        return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    }

    function dateToIso(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function todayIso(date) {
        const value = date instanceof Date ? date : new Date();
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function addDays(iso, days) {
        const date = isoToUtc(iso);
        if (!date) return '';
        date.setUTCDate(date.getUTCDate() + Number(days || 0));
        return dateToIso(date);
    }

    function normalizePeople(value) {
        const source = Array.isArray(value)
            ? value
            : (value && typeof value === 'object' ? Object.values(value) : [value]);
        return source
            .map(function (person) { return String(person || '').trim(); })
            .filter(Boolean)
            .slice(0, 20);
    }

    function normalizeEntry(value, id) {
        const entry = value && typeof value === 'object' ? value : {};
        const start = String(entry.start || '').trim();
        const end = String(entry.end || '').trim();
        if (!isIsoDate(start) || !isIsoDate(end) || start > end) return null;
        const people = normalizePeople(entry.people);
        if (!people.length) return null;
        return {
            id: /^week-\d{4}-\d{2}-\d{2}$/.test(String(id || '')) ? String(id) : `week-${start}`,
            start: start,
            end: end,
            people: people,
            note: String(entry.note || '').trim().slice(0, 500)
        };
    }

    function normalizeSchedule(value) {
        const schedule = value && typeof value === 'object' ? value : {};
        const rawEntries = schedule.entries && typeof schedule.entries === 'object' ? schedule.entries : {};
        const entries = Object.keys(rawEntries)
            .map(function (id) { return normalizeEntry(rawEntries[id], id); })
            .filter(Boolean)
            .sort(function (a, b) { return a.start.localeCompare(b.start) || a.end.localeCompare(b.end); });
        return {
            version: 1,
            className: '10-1',
            academicYear: String(schedule.academicYear || '2026/2027').slice(0, 20),
            revision: Number.isInteger(schedule.revision) && schedule.revision >= 0 ? schedule.revision : 0,
            updatedAt: Number(schedule.updatedAt) || 0,
            updatedBy: String(schedule.updatedBy || ''),
            entries: entries
        };
    }

    function scheduleState(entries, now) {
        const date = isIsoDate(now) ? now : todayIso(now instanceof Date ? now : undefined);
        const list = Array.isArray(entries) ? entries : [];
        const current = list.find(function (entry) { return entry.start <= date && entry.end >= date; }) || null;
        const next = list.find(function (entry) { return entry.start > date; }) || null;
        return {
            today: date,
            current: current,
            next: next,
            focus: current || next || (list.length ? list[list.length - 1] : null)
        };
    }

    function formatRange(start, end) {
        const first = isoToUtc(start);
        const last = isoToUtc(end);
        if (!first || !last) return '';
        const firstDay = first.getUTCDate();
        const lastDay = last.getUTCDate();
        const firstMonth = first.getUTCMonth();
        const lastMonth = last.getUTCMonth();
        const firstYear = first.getUTCFullYear();
        const lastYear = last.getUTCFullYear();
        if (firstYear === lastYear && firstMonth === lastMonth) {
            return `${firstDay}–${lastDay} ${MONTHS_GENITIVE[firstMonth]}`;
        }
        if (firstYear === lastYear) {
            return `${firstDay} ${MONTHS_GENITIVE[firstMonth]} — ${lastDay} ${MONTHS_GENITIVE[lastMonth]}`;
        }
        return `${firstDay} ${MONTHS_GENITIVE[firstMonth]} ${firstYear} — ${lastDay} ${MONTHS_GENITIVE[lastMonth]} ${lastYear}`;
    }

    function monthKey(entry) {
        return String(entry && entry.start || '').slice(0, 7);
    }

    function monthLabel(key) {
        const match = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
        if (!match) return '';
        return `${MONTHS_NOMINATIVE[Number(match[2]) - 1]} ${match[1]}`;
    }

    function nextWeekAfter(entries, now) {
        const list = Array.isArray(entries) ? entries : [];
        let candidate = list.length ? addDays(list[list.length - 1].end, 1) : todayIso(now instanceof Date ? now : undefined);
        let date = isoToUtc(candidate);
        if (!date) date = isoToUtc(todayIso());
        const weekday = date.getUTCDay();
        const delta = weekday === 1 ? 0 : ((8 - weekday) % 7);
        date.setUTCDate(date.getUTCDate() + delta);
        const start = dateToIso(date);
        return { start: start, end: addDays(start, 5), people: [''], note: '' };
    }

    function validateEntries(entries) {
        if (!Array.isArray(entries) || !entries.length) return { valid: false, message: 'Добавьте хотя бы одну неделю.' };
        if (entries.length > 80) return { valid: false, message: 'В одном расписании может быть не больше 80 недель.' };
        const sorted = entries.map(function (entry, index) {
            return {
                index: index,
                start: String(entry.start || '').trim(),
                end: String(entry.end || '').trim(),
                people: normalizePeople(entry.people),
                note: String(entry.note || '').trim()
            };
        }).sort(function (a, b) { return a.start.localeCompare(b.start); });
        for (let i = 0; i < sorted.length; i += 1) {
            const entry = sorted[i];
            if (!isIsoDate(entry.start) || !isIsoDate(entry.end)) {
                return { valid: false, index: entry.index, field: 'date', message: 'Проверьте даты в неделе №' + (entry.index + 1) + '.' };
            }
            if (entry.start > entry.end) {
                return { valid: false, index: entry.index, field: 'date', message: 'Начало недели не может быть позже её окончания.' };
            }
            if (!entry.people.length) {
                return { valid: false, index: entry.index, field: 'people', message: 'Укажите хотя бы одного дежурного в неделе №' + (entry.index + 1) + '.' };
            }
            if (entry.people.some(function (person) { return person.length > 120; })) {
                return { valid: false, index: entry.index, field: 'people', message: 'Имя или подпись не должны быть длиннее 120 символов.' };
            }
            if (entry.note.length > 500) {
                return { valid: false, index: entry.index, field: 'note', message: 'Комментарий не должен быть длиннее 500 символов.' };
            }
            if (i > 0 && entry.start <= sorted[i - 1].end) {
                return { valid: false, index: entry.index, field: 'date', message: 'Недели не должны пересекаться.' };
            }
        }
        return { valid: true, entries: sorted };
    }

    function entriesToFirebase(entries) {
        const output = {};
        entries.slice().sort(function (a, b) { return a.start.localeCompare(b.start); }).forEach(function (entry) {
            const people = {};
            normalizePeople(entry.people).forEach(function (person, index) { people['person-' + index] = person; });
            output['week-' + entry.start] = {
                start: entry.start,
                end: entry.end,
                people: people,
                note: String(entry.note || '').trim().slice(0, 500)
            };
        });
        return output;
    }

    root.AlmanionDuty = {
        DATA_PATH: DATA_PATH,
        DEFAULT_SCHEDULE: DEFAULT_SCHEDULE,
        isIsoDate: isIsoDate,
        addDays: addDays,
        normalizePeople: normalizePeople,
        normalizeSchedule: normalizeSchedule,
        scheduleState: scheduleState,
        formatRange: formatRange,
        monthKey: monthKey,
        monthLabel: monthLabel,
        nextWeekAfter: nextWeekAfter,
        validateEntries: validateEntries,
        entriesToFirebase: entriesToFirebase
    };

    if (typeof document === 'undefined') return;

    function byId(id) { return document.getElementById(id); }
    function safeRead(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
    function safeWrite(key, value) { try { localStorage.setItem(key, value); return true; } catch (_) { return false; } }
    function safeRemove(key) { try { localStorage.removeItem(key); } catch (_) {} }
    function parseStored(key) { try { return JSON.parse(safeRead(key) || 'null'); } catch (_) { return null; } }
    function toast(message, type) {
        if (root.AlmanionToast && typeof root.AlmanionToast.show === 'function') {
            root.AlmanionToast.show(message, { type: type || 'info' });
        }
    }

    let database = null;
    let dataRef = null;
    let schedule = normalizeSchedule(DEFAULT_SCHEDULE);
    let sourceKind = 'default';
    let selectedMonth = 'all';
    let searchQuery = '';
    let account = null;
    let canEdit = false;
    let editorEntries = [];
    let editorBaseRevision = 0;
    let editorOpen = false;
    let editorDirty = false;
    let conflictOverride = false;
    let removedEntry = null;
    let draftTimer = 0;
    let focusEntry = null;

    function copyEntries(entries) {
        return entries.map(function (entry) {
            return {
                id: entry.id || `week-${entry.start}`,
                start: entry.start,
                end: entry.end,
                people: entry.people.slice(),
                note: entry.note || ''
            };
        });
    }

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
        const cached = parseStored(CACHE_KEY);
        const normalizedCache = normalizeSchedule(cached);
        if (normalizedCache.entries.length) {
            schedule = normalizedCache;
            sourceKind = 'cache';
            setSyncStatus('Показана последняя сохранённая версия', true);
        } else {
            schedule = normalizeSchedule(DEFAULT_SCHEDULE);
            sourceKind = 'default';
            setSyncStatus('Стартовое расписание · ожидает первой публикации', true);
        }
        renderAll();
    }

    function loadCloudSchedule() {
        if (!database) {
            loadFallback();
            return;
        }
        dataRef = database.ref(DATA_PATH);
        dataRef.on('value', function (snapshot) {
            const raw = snapshot.val();
            if (raw) {
                const next = normalizeSchedule(raw);
                if (next.entries.length) {
                    const previousRevision = schedule.revision;
                    schedule = next;
                    sourceKind = 'cloud';
                    safeWrite(CACHE_KEY, JSON.stringify(raw));
                    const stamp = formatUpdatedAt(next.updatedAt);
                    setSyncStatus(stamp ? 'Обновлено ' + stamp : 'Синхронизировано');
                    if (editorOpen && next.revision > editorBaseRevision && next.revision !== previousRevision) {
                        showConflict('Пока вы редактировали, расписание обновил другой человек.');
                    }
                    renderAll();
                    return;
                }
            }
            schedule = normalizeSchedule(DEFAULT_SCHEDULE);
            sourceKind = 'default';
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
        if (kind === 'next') return 'Следующие';
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
        const startDate = isoToUtc(state.focus.start);
        dateBox.querySelector('.duty-focus-day').textContent = String(startDate.getUTCDate());
        dateBox.querySelector('.duty-focus-month').textContent = MONTHS_GENITIVE[startDate.getUTCMonth()];
        label.textContent = state.current ? 'Сейчас дежурят' : (state.next ? 'Следующее дежурство' : 'Последнее дежурство в расписании');
        title.textContent = state.focus.people.join(', ');
        range.textContent = formatRange(state.focus.start, state.focus.end);
        share.hidden = false;
    }

    function renderMonthFilters() {
        const rootElement = byId('dutyMonthFilters');
        const keys = Array.from(new Set(schedule.entries.map(monthKey)));
        if (selectedMonth !== 'all' && keys.indexOf(selectedMonth) === -1) selectedMonth = 'all';
        rootElement.replaceChildren();
        [{ key: 'all', label: 'Все' }].concat(keys.map(function (key) {
            return { key: key, label: monthLabel(key).replace(/ \d{4}$/, '') };
        })).forEach(function (item) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'duty-month-filter';
            button.classList.toggle('is-active', selectedMonth === item.key);
            button.setAttribute('aria-pressed', selectedMonth === item.key ? 'true' : 'false');
            button.textContent = item.label;
            button.addEventListener('click', function () {
                selectedMonth = item.key;
                renderMonthFilters();
                renderGroups();
            });
            rootElement.appendChild(button);
        });
    }

    function makeWeekCard(entry, state) {
        const kind = stateForEntry(entry, state);
        const card = document.createElement('article');
        card.className = 'duty-week-card is-' + kind;
        card.dataset.start = entry.start;

        const top = document.createElement('div');
        top.className = 'duty-week-topline';
        const range = document.createElement('p');
        range.className = 'duty-week-range';
        range.textContent = formatRange(entry.start, entry.end);
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

    function renderGroups() {
        const rootElement = byId('dutyGroups');
        const empty = byId('dutyEmpty');
        const query = searchQuery.trim().toLocaleLowerCase('ru-RU');
        const filtered = schedule.entries.filter(function (entry) {
            const monthMatches = selectedMonth === 'all' || monthKey(entry) === selectedMonth;
            const queryMatches = !query || entry.people.concat(entry.note || '').join(' ').toLocaleLowerCase('ru-RU').includes(query);
            return monthMatches && queryMatches;
        });
        rootElement.replaceChildren();
        empty.hidden = filtered.length > 0;
        if (!filtered.length) return;
        const state = scheduleState(schedule.entries);
        const groups = new Map();
        filtered.forEach(function (entry) {
            const key = monthKey(entry);
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
            entries.forEach(function (entry) { grid.appendChild(makeWeekCard(entry, state)); });
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
        const text = `Дежурство 10‑1 · ${formatRange(focusEntry.start, focusEntry.end)}: ${focusEntry.people.join(', ')}`;
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

    function draftKey() {
        return DRAFT_PREFIX + (account && account.uid ? account.uid : 'unknown');
    }

    function setDraftState(text, dirty) {
        const element = byId('dutyDraftState');
        element.textContent = text;
        element.classList.toggle('is-dirty', !!dirty);
    }

    function scheduleDraftSave() {
        editorDirty = true;
        setDraftState('Сохраняем черновик…', true);
        window.clearTimeout(draftTimer);
        draftTimer = window.setTimeout(saveDraft, 250);
    }

    function saveDraft() {
        if (!editorOpen || !account) return;
        const draft = {
            baseRevision: editorBaseRevision,
            savedAt: Date.now(),
            entries: editorEntries
        };
        safeWrite(draftKey(), JSON.stringify(draft));
        setDraftState('Черновик сохранён на устройстве', true);
    }

    function showEditorError(message, rowIndex, field) {
        const error = byId('dutyEditorError');
        error.textContent = message;
        error.hidden = !message;
        byId('dutyEditorList').querySelectorAll('[aria-invalid="true"]').forEach(function (input) {
            input.removeAttribute('aria-invalid');
        });
        if (Number.isInteger(rowIndex)) {
            const row = byId('dutyEditorList').children[rowIndex];
            if (row) {
                const target = field === 'people'
                    ? row.querySelector('[data-field="people"]')
                    : (field === 'note' ? row.querySelector('[data-field="note"]') : row.querySelector('[data-field="start"]'));
                if (target) {
                    target.setAttribute('aria-invalid', 'true');
                    target.focus();
                }
            }
        }
    }

    function makeEditorField(labelText, type, value, field, rowIndex, placeholder) {
        const label = document.createElement('label');
        label.className = 'duty-editor-field';
        const caption = document.createElement('span');
        caption.textContent = labelText;
        const input = document.createElement('input');
        input.type = type;
        input.value = value;
        input.dataset.field = field;
        input.placeholder = placeholder || '';
        input.autocomplete = 'off';
        input.addEventListener('input', function () {
            const entry = editorEntries[rowIndex];
            if (!entry) return;
            if (field === 'people') {
                entry.people = input.value.split(/[,\n]/).map(function (item) { return item.trim(); }).filter(Boolean);
            } else entry[field] = input.value;
            scheduleDraftSave();
        });
        label.append(caption, input);
        return label;
    }

    function renderEditor() {
        const list = byId('dutyEditorList');
        list.replaceChildren();
        editorEntries.forEach(function (entry, index) {
            const row = document.createElement('div');
            row.className = 'duty-editor-row';
            row.dataset.index = String(index);
            row.dataset.weekNumber = String(index + 1);
            row.append(
                makeEditorField('Начало', 'date', entry.start, 'start', index),
                makeEditorField('Окончание', 'date', entry.end, 'end', index),
                makeEditorField('Дежурные · через запятую', 'text', entry.people.join(', '), 'people', index, 'Имя, имя'),
                makeEditorField('Комментарий · необязательно', 'text', entry.note || '', 'note', index, 'Например, замена')
            );
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'duty-remove-row';
            remove.setAttribute('aria-label', 'Удалить неделю ' + formatRange(entry.start, entry.end));
            const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            icon.setAttribute('viewBox', '0 0 24 24');
            icon.setAttribute('fill', 'none');
            icon.setAttribute('stroke', 'currentColor');
            icon.setAttribute('stroke-width', '1.8');
            icon.setAttribute('stroke-linecap', 'round');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5');
            icon.appendChild(path);
            remove.appendChild(icon);
            remove.addEventListener('click', function () {
                removedEntry = { entry: editorEntries[index], index: index };
                editorEntries.splice(index, 1);
                byId('dutyUndoButton').hidden = false;
                renderEditor();
                scheduleDraftSave();
            });
            row.appendChild(remove);
            list.appendChild(row);
        });
    }

    function showConflict(text) {
        const notice = byId('dutyEditorNotice');
        byId('dutyEditorNoticeTitle').textContent = 'Есть более новая облачная версия';
        byId('dutyEditorNoticeText').textContent = text || 'Выберите, какую версию продолжить редактировать.';
        notice.hidden = false;
        conflictOverride = false;
    }

    function hideConflict() {
        byId('dutyEditorNotice').hidden = true;
    }

    function openEditor() {
        if (!canEdit || !account) return;
        editorBaseRevision = schedule.revision;
        const storedDraft = parseStored(draftKey());
        if (storedDraft && Array.isArray(storedDraft.entries) && storedDraft.entries.length) {
            editorEntries = copyEntries(storedDraft.entries.map(function (entry, index) {
                return normalizeEntry({
                    start: entry.start,
                    end: entry.end,
                    people: entry.people,
                    note: entry.note
                }, entry.id || `week-${entry.start || index}`);
            }).filter(Boolean));
            editorBaseRevision = Number.isInteger(storedDraft.baseRevision) ? storedDraft.baseRevision : schedule.revision;
            editorDirty = true;
            setDraftState('Восстановлен черновик с этого устройства', true);
            if (schedule.revision > editorBaseRevision) showConflict('Ваш черновик сохранён, но облачное расписание уже обновилось.');
            else hideConflict();
        } else {
            editorEntries = copyEntries(schedule.entries);
            editorDirty = false;
            setDraftState('Изменений нет', false);
            hideConflict();
        }
        removedEntry = null;
        conflictOverride = false;
        byId('dutyUndoButton').hidden = true;
        showEditorError('');
        renderEditor();
        const overlay = byId('dutyEditorOverlay');
        overlay.hidden = false;
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('duty-editor-open');
        editorOpen = true;
        byId('dutyEditorContent').scrollTop = 0;
        byId('dutyEditorClose').focus();
    }

    function closeEditor() {
        if (!editorOpen) return;
        window.clearTimeout(draftTimer);
        if (editorDirty) saveDraft();
        const overlay = byId('dutyEditorOverlay');
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('duty-editor-open');
        editorOpen = false;
        byId('dutyEditButton').focus();
    }

    function addNextWeek() {
        const next = nextWeekAfter(editorEntries);
        editorEntries.push({ id: `week-${next.start}`, start: next.start, end: next.end, people: next.people, note: '' });
        editorEntries.sort(function (a, b) { return a.start.localeCompare(b.start); });
        renderEditor();
        scheduleDraftSave();
        const rows = byId('dutyEditorList').children;
        const row = rows[rows.length - 1];
        if (row) {
            const content = byId('dutyEditorContent');
            content.scrollTo({ top: content.scrollHeight, behavior: 'smooth' });
            const people = row.querySelector('[data-field="people"]');
            if (people) people.focus();
        }
    }

    function undoRemove() {
        if (!removedEntry) return;
        editorEntries.splice(Math.min(removedEntry.index, editorEntries.length), 0, removedEntry.entry);
        removedEntry = null;
        byId('dutyUndoButton').hidden = true;
        renderEditor();
        scheduleDraftSave();
    }

    function useCloudVersion() {
        editorEntries = copyEntries(schedule.entries);
        editorBaseRevision = schedule.revision;
        editorDirty = false;
        conflictOverride = false;
        safeRemove(draftKey());
        hideConflict();
        renderEditor();
        setDraftState('Загружена облачная версия', false);
        showEditorError('');
    }

    function keepDraftVersion() {
        conflictOverride = true;
        hideConflict();
        setDraftState('Ваш вариант готов к публикации', true);
    }

    async function saveEditor() {
        if (!account || !canEdit || !database) {
            showEditorError('Не удалось подтвердить право на редактирование. Войдите в аккаунт ещё раз.');
            return;
        }
        const validation = validateEntries(editorEntries);
        if (!validation.valid) {
            showEditorError(validation.message, validation.index, validation.field);
            return;
        }
        const button = byId('dutyEditorSave');
        button.disabled = true;
        button.textContent = 'Публикуем…';
        showEditorError('');
        try {
            const snapshot = await database.ref(DATA_PATH).once('value');
            const cloud = snapshot.val();
            const cloudRevision = cloud && Number.isInteger(cloud.revision) ? cloud.revision : 0;
            if (cloudRevision > editorBaseRevision && !conflictOverride) {
                showConflict('Расписание изменилось после открытия редактора. Ваш черновик не потерян.');
                return;
            }
            const normalized = validation.entries.map(function (entry) {
                return {
                    start: entry.start,
                    end: entry.end,
                    people: entry.people,
                    note: entry.note
                };
            });
            const nextRevision = cloudRevision + 1;
            await database.ref(DATA_PATH).set({
                version: 1,
                className: '10-1',
                academicYear: schedule.academicYear || '2026/2027',
                revision: nextRevision,
                updatedAt: firebase.database.ServerValue.TIMESTAMP,
                updatedBy: account.uid,
                entries: entriesToFirebase(normalized)
            });
            editorEntries = copyEntries(normalizeSchedule({ entries: entriesToFirebase(normalized) }).entries);
            editorBaseRevision = nextRevision;
            editorDirty = false;
            conflictOverride = false;
            safeRemove(draftKey());
            setDraftState('Опубликовано', false);
            hideConflict();
            toast('Расписание обновлено', 'success');
            closeEditor();
        } catch (error) {
            const code = String(error && error.code || '');
            if (/permission|denied/i.test(code + ' ' + String(error && error.message || ''))) {
                showEditorError('Firebase отклонил сохранение. Возможно, роль редактора была отозвана или расписание уже изменилось.');
                showConflict('Проверьте облачную версию перед повторной публикацией.');
            } else {
                showEditorError('Не удалось опубликовать расписание. Черновик сохранён на этом устройстве.');
            }
            saveDraft();
        } finally {
            button.disabled = false;
            button.textContent = 'Опубликовать';
        }
    }

    function updateEditorAccess(user) {
        if (editorOpen && (!user || !account || account.uid !== user.uid)) closeEditor();
        account = user || null;
        canEdit = false;
        const edit = byId('dutyEditButton');
        edit.hidden = true;
        if (!account) return;
        const isOwner = String(account.email || '').trim().toLowerCase() === OWNER_EMAIL;
        const checker = root.AlmanionAccount && root.AlmanionAccount.hasDutyEditorAccess;
        const accessPromise = isOwner
            ? Promise.resolve(true)
            : (typeof checker === 'function' ? checker(account) : Promise.resolve(false));
        accessPromise.then(function (allowed) {
            if (!account || account.uid !== user.uid) return;
            canEdit = allowed === true;
            edit.hidden = !canEdit;
            if (!canEdit && editorOpen) closeEditor();
        });
    }

    function bindEvents() {
        byId('dutySearchInput').addEventListener('input', function (event) {
            searchQuery = event.target.value || '';
            renderGroups();
        });
        byId('dutyShareButton').addEventListener('click', shareFocus);
        byId('dutyEditButton').addEventListener('click', openEditor);
        byId('dutyEditorClose').addEventListener('click', closeEditor);
        byId('dutyEditorCancel').addEventListener('click', closeEditor);
        byId('dutyAddWeekButton').addEventListener('click', addNextWeek);
        byId('dutyUndoButton').addEventListener('click', undoRemove);
        byId('dutyUseCloudButton').addEventListener('click', useCloudVersion);
        byId('dutyKeepDraftButton').addEventListener('click', keepDraftVersion);
        byId('dutyEditorSave').addEventListener('click', saveEditor);
        byId('dutyEditorOverlay').addEventListener('click', function (event) {
            if (event.target === event.currentTarget) closeEditor();
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && editorOpen) closeEditor();
        });
        root.addEventListener('beforeunload', function () {
            window.clearTimeout(draftTimer);
            if (editorOpen && editorDirty) saveDraft();
        });
        root.addEventListener('almanion-account-ready', function (event) {
            updateEditorAccess(event.detail && event.detail.user);
        });
    }

    function init() {
        bindEvents();
        renderAll();
        if (root.AlmanionAccount) {
            database = root.AlmanionAccount.database || null;
            updateEditorAccess(root.AlmanionAccount.getUser ? root.AlmanionAccount.getUser() : null);
        } else if (typeof firebase !== 'undefined' && typeof firebase.database === 'function') {
            try {
                if (!firebase.apps.length && typeof firebaseConfig !== 'undefined') firebase.initializeApp(firebaseConfig);
                database = firebase.database();
            } catch (_) { database = null; }
        }
        loadCloudSchedule();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
}(typeof window !== 'undefined' ? window : globalThis));
