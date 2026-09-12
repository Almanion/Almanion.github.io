(function (root) {
    'use strict';

    const TOUR_PATH = 'classTour/grade10_1/autumn2026';
    const ROSTER_PATH = 'classRosters/grade10_1';
    const DUTY_PATH = 'classDuty/grade10_1';
    const OWNER_UID = '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';
    const CACHE_KEY = 'almanion:class-tour:grade10_1:autumn2026:cache:v1';
    const DRAFT_PREFIX = 'almanion:class-tour:grade10_1:autumn2026:draft:v1:';
    const PERSON_PREFIX = 'almanion:class-10-1:v1:';

    const INITIAL_PEOPLE = {
        p_f49a0dfa47d62172ce64bd13: 'Нонна Близнец',
        p_0d28daeda165dcddc71254ee: 'Полина Лубневская',
        p_b68c65b8a480570a4be1c43d: 'Инга Щербак',
        p_2c706aabfc44848c0f094ccb: 'Катя Айзикович',
        p_60790019bc96a2723716413a: 'Даша Волкова',
        p_e57b8d01500f056b9c9b5d76: 'Дима Белоцерковцев',
        p_e075ca8c4695b65c854478f0: 'Саша Деревягин',
        p_e79c83b27fcbcd5476da8fc1: 'Артём Львов',
        p_f84bdd78429392089fd3bac0: 'Дима Петров',
        p_1f91dacb2db945c9ab6a2044: 'Ваня Коршиков',
        p_eecbb0d6f693010d88294c2c: 'Вова Дубейко'
    };

    const DEFAULT_TOUR = {
        version: 1,
        className: '10-1',
        eventKey: 'autumn2026',
        revision: 0,
        updatedAt: 0,
        updatedBy: '',
        info: {
            title: 'Туристический слёт 10-1',
            startDate: '2026-09-17',
            endDate: '2026-09-19',
            location: 'Озеро Уловное · район ст. Сосново, Приозерский район Ленинградской области',
            route: 'Электропоезд Санкт-Петербург, Финляндский вокзал → о. п. Колосково (78 км)',
            departure: '17 сентября, после 4-го урока',
            return: '19 сентября; время возвращения можно выбрать',
            leader: 'Алёна Александровна Лобанова'
        },
        schedule: [
            { id: 'departure-school', title: 'Отъезд из школы', date: '2026-09-17', startTime: '', endTime: '', timeLabel: 'После 4-го урока', location: '', note: '', order: 1 },
            { id: 'train-koloscovo', title: 'Электропоезд до Колосково', date: '2026-09-17', startTime: '14:19', endTime: '', timeLabel: '14:19', location: 'Финляндский вокзал', note: 'Остановочный пункт «Колосково», 78 км', order: 2 },
            { id: 'return-home', title: 'Возвращение', date: '2026-09-19', startTime: '', endTime: '', timeLabel: 'Время можно выбрать', location: '', note: '', order: 3 }
        ],
        activities: [
            { id: 'night-rally', title: 'Ночное ралли', order: 1, participants: [] },
            { id: 'orienteering', title: 'Ориентирование', order: 2, participants: ['p_f84bdd78429392089fd3bac0', 'p_2c706aabfc44848c0f094ccb', 'p_1f91dacb2db945c9ab6a2044', 'p_e57b8d01500f056b9c9b5d76'] },
            { id: 'volleyball', title: 'Волейбол', order: 3, participants: [] },
            { id: 'lunch-contest', title: 'Конкурс обедов', order: 4, participants: [] },
            { id: 'obstacle-course', title: 'Полоса препятствий', order: 5, participants: ['p_f84bdd78429392089fd3bac0', 'p_2c706aabfc44848c0f094ccb', 'p_1f91dacb2db945c9ab6a2044', 'p_e57b8d01500f056b9c9b5d76', 'p_eecbb0d6f693010d88294c2c', 'p_0d28daeda165dcddc71254ee', 'p_f49a0dfa47d62172ce64bd13'] },
            { id: 'water-tourism', title: 'Техника водного туризма', order: 6, participants: ['p_e075ca8c4695b65c854478f0', 'p_b68c65b8a480570a4be1c43d', 'p_1f91dacb2db945c9ab6a2044', 'p_eecbb0d6f693010d88294c2c', 'p_60790019bc96a2723716413a'] },
            { id: 'sup-sprint', title: 'САП-спринт', order: 7, participants: ['p_e79c83b27fcbcd5476da8fc1', 'p_e075ca8c4695b65c854478f0', 'p_e57b8d01500f056b9c9b5d76'] },
            { id: 'shooting', title: 'Тир', order: 8, participants: ['p_2c706aabfc44848c0f094ccb', 'p_e075ca8c4695b65c854478f0'] },
            { id: 'open-lecture', title: 'Открытый лекторий', order: 9, participants: [] },
            { id: 'bonfire', title: 'Большой костёр', order: 10, participants: [] }
        ],
        tents: [],
        meals: [
            { id: 'meal-2026-09-17-breakfast', date: '2026-09-17', type: 'breakfast', title: 'Завтрак', note: '', order: 1, participants: [] },
            { id: 'meal-2026-09-17-lunch', date: '2026-09-17', type: 'lunch', title: 'Обед', note: '', order: 2, participants: [] },
            { id: 'meal-2026-09-17-dinner', date: '2026-09-17', type: 'dinner', title: 'Ужин', note: '', order: 3, participants: [] },
            { id: 'meal-2026-09-18-breakfast', date: '2026-09-18', type: 'breakfast', title: 'Завтрак', note: '', order: 4, participants: [] },
            { id: 'meal-2026-09-18-lunch', date: '2026-09-18', type: 'lunch', title: 'Обед', note: '', order: 5, participants: [] },
            { id: 'meal-2026-09-18-dinner', date: '2026-09-18', type: 'dinner', title: 'Ужин', note: '', order: 6, participants: [] },
            { id: 'meal-2026-09-19-breakfast', date: '2026-09-19', type: 'breakfast', title: 'Завтрак', note: '', order: 7, participants: [] },
            { id: 'meal-2026-09-19-lunch', date: '2026-09-19', type: 'lunch', title: 'Обед', note: '', order: 8, participants: [] },
            { id: 'meal-2026-09-19-dinner', date: '2026-09-19', type: 'dinner', title: 'Ужин', note: '', order: 9, participants: [] }
        ],
        people: INITIAL_PEOPLE
    };

    const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
    const MEAL_TYPES = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин' };

    function hasOwn(value, key) { return !!value && Object.prototype.hasOwnProperty.call(value, key); }
    function text(value, limit) { return String(value == null ? '' : value).trim().slice(0, limit || 500); }
    function isIsoDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
        const parts = String(value).split('-').map(Number);
        const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
    }
    function isTime(value) { return value === '' || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')); }
    function collection(value) {
        if (Array.isArray(value)) return value.map(function (item, index) { return { key: String(index), value: item }; });
        if (!value || typeof value !== 'object') return [];
        return Object.keys(value).map(function (key) { return { key: key, value: value[key] }; });
    }
    function participantIds(value) {
        const source = Array.isArray(value) ? value : (value && typeof value === 'object' ? Object.keys(value).filter(function (key) { return value[key] === true; }) : []);
        return Array.from(new Set(source.map(String).filter(function (id) { return /^p_[a-f0-9]{24}$/.test(id); }))).slice(0, 60);
    }
    function safeId(value, fallback) {
        const id = String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
        return /^[a-z][a-z0-9-]{1,47}$/.test(id) ? id : fallback;
    }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function sortByOrder(items) { return items.sort(function (a, b) { return a.order - b.order || a.id.localeCompare(b.id); }); }

    function normalizeSchedule(value) {
        return sortByOrder(collection(value).map(function (entry, index) {
            const raw = entry.value && typeof entry.value === 'object' ? entry.value : {};
            const date = text(raw.date, 10);
            const startTime = text(raw.startTime, 5);
            const endTime = text(raw.endTime, 5);
            if (!isIsoDate(date) || !isTime(startTime) || !isTime(endTime)) return null;
            return {
                id: safeId(raw.id || entry.key, 'event-' + (index + 1)),
                title: text(raw.title, 120), date: date, startTime: startTime, endTime: endTime,
                timeLabel: text(raw.timeLabel, 80), location: text(raw.location, 200), note: text(raw.note, 300),
                order: Number.isInteger(raw.order) && raw.order > 0 ? raw.order : index + 1
            };
        }).filter(function (item) { return item && item.title; }));
    }

    function normalizeActivities(value) {
        return sortByOrder(collection(value).map(function (entry, index) {
            const raw = entry.value && typeof entry.value === 'object' ? entry.value : {};
            const titleValue = text(raw.title, 120);
            if (!titleValue) return null;
            return { id: safeId(raw.id || entry.key, 'activity-' + (index + 1)), title: titleValue, order: Number.isInteger(raw.order) && raw.order > 0 ? raw.order : index + 1, participants: participantIds(raw.participants) };
        }).filter(Boolean));
    }

    function normalizeTents(value) {
        return sortByOrder(collection(value).map(function (entry, index) {
            const raw = entry.value && typeof entry.value === 'object' ? entry.value : {};
            const titleValue = text(raw.title, 120);
            if (!titleValue) return null;
            return { id: safeId(raw.id || entry.key, 'tent-' + (index + 1)), title: titleValue, capacity: Math.max(1, Math.min(20, Number.parseInt(raw.capacity, 10) || 4)), note: text(raw.note, 240), order: Number.isInteger(raw.order) && raw.order > 0 ? raw.order : index + 1, participants: participantIds(raw.participants) };
        }).filter(Boolean));
    }

    function normalizeMeals(value) {
        return sortByOrder(collection(value).map(function (entry, index) {
            const raw = entry.value && typeof entry.value === 'object' ? entry.value : {};
            const date = text(raw.date, 10);
            const type = hasOwn(MEAL_TYPES, raw.type) ? raw.type : 'breakfast';
            if (!isIsoDate(date)) return null;
            return { id: safeId(raw.id || entry.key, 'meal-' + (index + 1)), date: date, type: type, title: text(raw.title, 80) || MEAL_TYPES[type], note: text(raw.note, 240), order: Number.isInteger(raw.order) && raw.order > 0 ? raw.order : index + 1, participants: participantIds(raw.participants) };
        }).filter(Boolean));
    }

    function normalizePeople(value) {
        const result = {};
        if (!value || typeof value !== 'object') return result;
        Object.keys(value).forEach(function (id) {
            const name = text(value[id] && typeof value[id] === 'object' ? value[id].displayName : value[id], 120);
            if (/^p_[a-f0-9]{24}$/.test(id) && name) result[id] = name;
        });
        return result;
    }

    function normalizeTour(value) {
        const raw = value && typeof value === 'object' ? value : {};
        const info = raw.info && typeof raw.info === 'object' ? raw.info : {};
        const startDate = text(info.startDate, 10);
        const endDate = text(info.endDate, 10);
        const normalized = {
            version: 1,
            className: '10-1',
            eventKey: 'autumn2026',
            revision: Number.isInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0,
            updatedAt: Number(raw.updatedAt) || 0,
            updatedBy: text(raw.updatedBy, 128),
            info: {
                title: text(info.title, 120), startDate: startDate, endDate: endDate,
                location: text(info.location, 300), route: text(info.route, 300),
                departure: text(info.departure, 240), return: text(info.return, 240), leader: text(info.leader, 120)
            },
            schedule: normalizeSchedule(raw.schedule),
            activities: normalizeActivities(raw.activities),
            tents: normalizeTents(raw.tents),
            meals: normalizeMeals(raw.meals),
            people: normalizePeople(raw.people)
        };
        return validateTour(normalized).valid ? normalized : null;
    }

    function validateTour(value) {
        if (!value || !value.info) return { valid: false, message: 'Данные слёта повреждены.' };
        const info = value.info;
        if (!info.title || !isIsoDate(info.startDate) || !isIsoDate(info.endDate) || info.startDate > info.endDate) return { valid: false, message: 'Проверьте название и даты слёта.' };
        if (!info.location || !info.route || !info.departure || !info.return || !info.leader) return { valid: false, message: 'Заполните все поля обзора.' };
        if (!value.schedule.length) return { valid: false, message: 'В расписании должно остаться хотя бы одно событие.' };
        if (!value.activities.length) return { valid: false, message: 'В программе должно остаться хотя бы одно мероприятие.' };
        if (!value.meals.length) return { valid: false, message: 'Добавьте хотя бы один приём пищи.' };
        const invalidTime = value.schedule.find(function (item) {
            return !text(item.title, 120) || !isIsoDate(item.date) || item.date < info.startDate || item.date > info.endDate
                || !isTime(item.startTime) || !isTime(item.endTime) || (item.endTime && !item.startTime)
                || (item.startTime && item.endTime && item.startTime > item.endTime);
        });
        if (invalidTime) return { valid: false, message: 'Проверьте дату и время события «' + invalidTime.title + '».' };
        const invalidActivity = value.activities.find(function (item) { return !text(item.title, 120); });
        if (invalidActivity) return { valid: false, message: 'У каждого мероприятия должно быть название.' };
        const invalidMeal = value.meals.find(function (item) {
            return !isIsoDate(item.date) || item.date < info.startDate || item.date > info.endDate || !hasOwn(MEAL_TYPES, item.type) || !text(item.title, 80);
        });
        if (invalidMeal) return { valid: false, message: 'Проверьте дату и тип приёма пищи.' };
        const invalidTent = value.tents.find(function (item) { return !item.title || item.capacity < 1 || item.capacity > 20; });
        if (invalidTent) return { valid: false, message: 'Проверьте название и вместимость палатки.' };
        const tentMembers = new Set();
        for (const tent of value.tents) {
            if (participantIds(tent.participants).length > tent.capacity) return { valid: false, message: 'В палатке «' + tent.title + '» выбрано больше людей, чем мест.' };
            for (const id of participantIds(tent.participants)) {
                if (tentMembers.has(id)) return { valid: false, message: 'Один человек не может быть указан сразу в нескольких палатках.' };
                tentMembers.add(id);
            }
        }
        return { valid: true, message: '' };
    }

    function objectWithIds(items, mapper) {
        const result = {};
        items.forEach(function (item, index) { result[item.id] = mapper(item, index); });
        return result;
    }
    function participantsObject(ids) {
        const result = {};
        participantIds(ids).forEach(function (id) { result[id] = true; });
        return result;
    }
    function referencedPeople(value, roster) {
        const ids = new Set();
        ['activities', 'tents', 'meals'].forEach(function (key) { value[key].forEach(function (item) { item.participants.forEach(function (id) { ids.add(id); }); }); });
        const people = {};
        ids.forEach(function (id) {
            const name = text((roster && roster[id] && roster[id].displayName) || value.people[id], 120);
            if (name) people[id] = name;
        });
        return people;
    }

    function tourToFirebase(value, roster) {
        const tour = normalizeTour(value);
        if (!tour) return null;
        const schedule = objectWithIds(tour.schedule, function (item, index) {
            const result = { title: item.title, date: item.date, order: index + 1, timeLabel: item.timeLabel, location: item.location, note: item.note };
            if (item.startTime) result.startTime = item.startTime;
            if (item.endTime) result.endTime = item.endTime;
            return result;
        });
        const activities = objectWithIds(tour.activities, function (item, index) {
            const result = { title: item.title, order: index + 1 };
            const participants = participantsObject(item.participants);
            if (Object.keys(participants).length) result.participants = participants;
            return result;
        });
        const tents = objectWithIds(tour.tents, function (item, index) {
            const result = { title: item.title, capacity: item.capacity, note: item.note, order: index + 1 };
            const participants = participantsObject(item.participants);
            if (Object.keys(participants).length) result.participants = participants;
            return result;
        });
        const meals = objectWithIds(tour.meals, function (item, index) {
            const result = { date: item.date, type: item.type, title: item.title, note: item.note, order: index + 1 };
            const participants = participantsObject(item.participants);
            if (Object.keys(participants).length) result.participants = participants;
            return result;
        });
        const output = {
            version: 1, className: '10-1', eventKey: 'autumn2026', revision: tour.revision,
            updatedAt: tour.updatedAt, updatedBy: tour.updatedBy,
            info: clone(tour.info), schedule: schedule, activities: activities, meals: meals,
            people: referencedPeople(tour, roster)
        };
        if (Object.keys(tents).length) output.tents = tents;
        return output;
    }

    function localDateParts(value) {
        const parts = String(value).split('-').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    function todayIso(now) {
        const date = now && typeof now.getFullYear === 'function' ? now : new Date();
        return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    }
    function dateLabel(value, withWeekday) {
        const date = localDateParts(value);
        const base = date.getDate() + ' ' + MONTHS[date.getMonth()];
        return withWeekday ? base + ', ' + WEEKDAYS[date.getDay()] : base;
    }
    function daysLabel(count) {
        const lastTwo = count % 100;
        const last = count % 10;
        if (lastTwo >= 11 && lastTwo <= 14) return count + ' дней';
        if (last === 1) return count + ' день';
        if (last >= 2 && last <= 4) return count + ' дня';
        return count + ' дней';
    }
    function tourState(info, now) {
        const today = todayIso(now);
        if (today < info.startDate) {
            const days = Math.ceil((localDateParts(info.startDate) - localDateParts(today)) / 86400000);
            return { key: 'upcoming', label: 'До слёта ' + daysLabel(days) };
        }
        if (today > info.endDate) return { key: 'past', label: 'Слёт завершён' };
        return { key: 'active', label: 'Слёт идёт' };
    }
    function scheduleItemState(item, now) {
        const date = now && typeof now.getFullYear === 'function' ? now : new Date();
        const today = todayIso(date);
        if (today < item.date) return { key: 'upcoming', label: 'Впереди' };
        if (today > item.date) return { key: 'past', label: 'Прошло' };
        if (!item.startTime) return { key: 'active', label: 'Сегодня' };
        const currentMinutes = date.getHours() * 60 + date.getMinutes();
        const startParts = item.startTime.split(':').map(Number);
        const startMinutes = startParts[0] * 60 + startParts[1];
        if (currentMinutes < startMinutes) return { key: 'upcoming', label: 'Впереди' };
        if (item.endTime) {
            const endParts = item.endTime.split(':').map(Number);
            if (currentMinutes <= endParts[0] * 60 + endParts[1]) return { key: 'active', label: 'Сейчас' };
            return { key: 'past', label: 'Прошло' };
        }
        if (currentMinutes <= startMinutes + 60) return { key: 'active', label: 'Сейчас' };
        return { key: 'past', label: 'Прошло' };
    }

    async function personId(name) {
        if (!root.crypto || !root.crypto.subtle || typeof TextEncoder === 'undefined') throw new Error('Secure hashing is unavailable');
        const canonical = PERSON_PREFIX + text(name, 120).normalize('NFKC').toLocaleLowerCase('ru');
        const digest = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
        return 'p_' + Array.from(new Uint8Array(digest)).map(function (byte) { return byte.toString(16).padStart(2, '0'); }).join('').slice(0, 24);
    }

    root.AlmanionClassTour = Object.freeze({
        TOUR_PATH: TOUR_PATH,
        ROSTER_PATH: ROSTER_PATH,
        DUTY_PATH: DUTY_PATH,
        DEFAULT_TOUR: clone(DEFAULT_TOUR),
        normalizeTour: normalizeTour,
        validateTour: validateTour,
        tourToFirebase: tourToFirebase,
        tourState: tourState,
        scheduleItemState: scheduleItemState,
        personId: personId,
        referencedPeople: referencedPeople
    });

    if (typeof document === 'undefined') return;

    function byId(id) { return document.getElementById(id); }
    function safeRead(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
    function safeWrite(key, value) { try { localStorage.setItem(key, value); return true; } catch (_) { return false; } }
    function safeRemove(key) { try { localStorage.removeItem(key); } catch (_) {} }
    function toast(message, type) {
        if (root.AlmanionToast && typeof root.AlmanionToast.show === 'function') root.AlmanionToast.show(message, { type: type || 'info' });
    }
    function make(tag, className, content) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (content != null) node.textContent = content;
        return node;
    }
    function removeIcon() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5M14 11v5');
        svg.appendChild(path); return svg;
    }

    let database = null;
    let dataRef = null;
    let account = null;
    let canEdit = false;
    let tour = normalizeTour(DEFAULT_TOUR);
    let sourceKind = 'default';
    let roster = {};
    let editorTour = null;
    let editorBaseRevision = 0;
    let editorOpen = false;
    let editorDirty = false;
    let editorActiveTab = 'overview';
    let conflictOverride = false;
    let draftTimer = 0;
    let pickerTarget = null;
    let pickerSelection = new Set();
    let statusTimer = 0;

    function setSyncStatus(message, offline) {
        const node = byId('tourSyncStatus');
        node.textContent = message;
        node.classList.toggle('is-offline', !!offline);
        node.hidden = !offline;
    }
    function formatUpdatedAt(timestamp) {
        if (!timestamp) return '';
        try { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp)); }
        catch (_) { return ''; }
    }
    function personName(id, currentTour) { return (currentTour.people && currentTour.people[id]) || (roster[id] && roster[id].displayName) || 'Участник'; }
    function appendPeople(container, ids, currentTour) {
        const values = participantIds(ids);
        if (!values.length) return;
        const list = make('div', 'tour-people-list');
        values.forEach(function (id) { list.appendChild(make('span', 'tour-person-chip', personName(id, currentTour))); });
        container.appendChild(list);
    }

    function renderOverview() {
        const info = tour.info;
        byId('tourTitle').textContent = info.title;
        document.title = info.title + ' | Конспекты';
        const start = localDateParts(info.startDate);
        const end = localDateParts(info.endDate);
        const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
        byId('tourDateRange').textContent = sameMonth
            ? start.getDate() + '–' + end.getDate() + ' ' + MONTHS[start.getMonth()] + ' ' + start.getFullYear()
            : dateLabel(info.startDate) + ' — ' + dateLabel(info.endDate) + ' ' + end.getFullYear();
        const dateMark = document.querySelector('.tour-date-mark');
        dateMark.querySelector('strong').textContent = String(start.getDate());
        dateMark.querySelector('span').textContent = MONTHS[start.getMonth()];
        byId('tourDeparture').textContent = info.departure;
        const locationParts = info.location.split(' · ');
        byId('tourLocation').textContent = locationParts[0] || info.location;
        byId('tourLocationDetail').textContent = locationParts.slice(1).join(' · ');
        byId('tourLocationDetail').hidden = locationParts.length < 2;
        const train = tour.schedule.find(function (item) { return item.id === 'train-koloscovo'; });
        byId('tourRouteTitle').textContent = train && train.startTime ? 'Электропоезд в ' + train.startTime : 'Дорога до места';
        byId('tourRoute').textContent = info.route;
        byId('tourLeader').textContent = info.leader;
        byId('tourReturn').textContent = info.return;
        updateTimeStates();
    }

    function updateTimeStates() {
        const state = tourState(tour.info, new Date());
        const badge = byId('tourEventState');
        badge.textContent = state.label;
        badge.className = 'tour-event-state is-' + state.key;
        document.querySelectorAll('.tour-timeline-item[data-event-id]').forEach(function (node) {
            const item = tour.schedule.find(function (candidate) { return candidate.id === node.dataset.eventId; });
            if (!item) return;
            const itemState = scheduleItemState(item, new Date());
            node.classList.remove('is-upcoming', 'is-active', 'is-past');
            node.classList.add('is-' + itemState.key);
            const stateNode = node.querySelector('.tour-timeline-state');
            if (stateNode) stateNode.textContent = itemState.label;
        });
    }

    function renderTimeline() {
        const rootNode = byId('tourTimeline');
        rootNode.replaceChildren();
        const groups = new Map();
        tour.schedule.forEach(function (item) {
            if (!groups.has(item.date)) groups.set(item.date, []);
            groups.get(item.date).push(item);
        });
        Array.from(groups.keys()).sort().forEach(function (date) {
            const day = make('section', 'tour-timeline-day');
            const header = make('header', 'tour-timeline-day-header');
            header.append(make('strong', '', dateLabel(date)), make('span', '', WEEKDAYS[localDateParts(date).getDay()]));
            day.appendChild(header);
            groups.get(date).forEach(function (item) {
                const state = scheduleItemState(item, new Date());
                const row = make('article', 'tour-timeline-item is-' + state.key);
                row.dataset.eventId = item.id;
                const time = item.startTime && item.endTime ? item.startTime + '–' + item.endTime : (item.startTime || item.timeLabel || 'Время уточняется');
                row.appendChild(make('div', 'tour-timeline-time', time));
                row.appendChild(make('span', 'tour-timeline-marker'));
                const body = make('div', 'tour-timeline-body');
                body.appendChild(make('h3', '', item.title));
                const details = [item.location, item.note].filter(Boolean).join(' · ');
                if (details) body.appendChild(make('p', '', details));
                row.append(body, make('span', 'tour-timeline-state', state.label));
                day.appendChild(row);
            });
            rootNode.appendChild(day);
        });
    }

    function renderProgram() {
        const rootNode = byId('tourProgram');
        rootNode.replaceChildren();
        tour.activities.forEach(function (activity) { rootNode.appendChild(make('div', 'tour-program-item', activity.title)); });
    }

    function renderTents() {
        const rootNode = byId('tourTents');
        const empty = byId('tourTentsEmpty');
        rootNode.replaceChildren();
        empty.hidden = tour.tents.length > 0;
        tour.tents.forEach(function (tent) {
            const card = make('article', 'tour-tent-card');
            const titleRow = make('div', 'tour-card-title-row');
            titleRow.append(make('h3', '', tent.title), make('span', '', tent.participants.length + ' из ' + tent.capacity));
            card.appendChild(titleRow);
            appendPeople(card, tent.participants, tour);
            if (tent.note) card.appendChild(make('p', 'tour-meal-note', tent.note));
            rootNode.appendChild(card);
        });
    }

    function renderActivities() {
        const rootNode = byId('tourActivities');
        const empty = byId('tourActivitiesEmpty');
        rootNode.replaceChildren();
        const assigned = tour.activities.filter(function (activity) { return participantIds(activity.participants).length > 0; });
        empty.hidden = assigned.length > 0;
        assigned.forEach(function (activity) {
            const card = make('article', 'tour-activity-card');
            const titleRow = make('div', 'tour-card-title-row');
            titleRow.append(make('h3', '', activity.title), make('span', '', activity.participants.length + ' чел.'));
            card.appendChild(titleRow);
            appendPeople(card, activity.participants, tour);
            rootNode.appendChild(card);
        });
    }

    function renderMeals() {
        const rootNode = byId('tourMeals');
        const empty = byId('tourMealsEmpty');
        rootNode.replaceChildren();
        const publishedMeals = tour.meals.filter(function (meal) {
            return participantIds(meal.participants).length > 0 || !!String(meal.note || '').trim();
        });
        empty.hidden = publishedMeals.length > 0;
        const dates = new Map();
        publishedMeals.forEach(function (meal) {
            if (!dates.has(meal.date)) dates.set(meal.date, []);
            dates.get(meal.date).push(meal);
        });
        Array.from(dates.keys()).sort().forEach(function (date) {
            const card = make('article', 'tour-meal-day');
            const header = document.createElement('header');
            header.append(make('h3', '', dateLabel(date)), make('p', '', WEEKDAYS[localDateParts(date).getDay()]));
            card.appendChild(header);
            dates.get(date).sort(function (a, b) { return a.order - b.order; }).forEach(function (meal) {
                const slot = make('section', 'tour-meal-slot');
                slot.appendChild(make('h4', '', meal.title || MEAL_TYPES[meal.type]));
                appendPeople(slot, meal.participants, tour);
                if (meal.note) slot.appendChild(make('p', 'tour-meal-note', meal.note));
                card.appendChild(slot);
            });
            rootNode.appendChild(card);
        });
    }

    function renderAll() {
        renderOverview();
        renderTimeline();
        renderProgram();
        renderTents();
        renderActivities();
        renderMeals();
    }

    function loadFallback() {
        const cached = safeRead(CACHE_KEY);
        if (cached) {
            try {
                const normalized = normalizeTour(JSON.parse(cached));
                if (normalized) { tour = normalized; sourceKind = 'cache'; setSyncStatus('Сохранённая копия · нет связи', true); renderAll(); return; }
            } catch (_) {}
        }
        tour = normalizeTour(DEFAULT_TOUR);
        sourceKind = 'default';
        setSyncStatus('Исходные данные · нет связи', true);
        renderAll();
    }

    function loadCloudTour() {
        if (!database) { loadFallback(); return; }
        dataRef = database.ref(TOUR_PATH);
        dataRef.on('value', function (snapshot) {
            const raw = snapshot.val();
            const normalized = raw && normalizeTour(raw);
            if (!normalized) {
                tour = normalizeTour(DEFAULT_TOUR);
                sourceKind = 'default';
                setSyncStatus('Исходные данные · ожидают первой публикации', true);
            } else {
                const previousRevision = tour.revision;
                tour = normalized;
                sourceKind = 'cloud';
                safeWrite(CACHE_KEY, JSON.stringify(raw));
                const stamp = formatUpdatedAt(tour.updatedAt);
                setSyncStatus(stamp ? 'Обновлено ' + stamp : 'Синхронизировано');
                if (editorOpen && tour.revision > editorBaseRevision && tour.revision !== previousRevision) showConflict();
            }
            renderAll();
        }, function () { loadFallback(); });
    }

    function draftKey() { return DRAFT_PREFIX + (account ? account.uid : 'signed-out'); }
    function setDraftState(message, dirty) {
        const state = byId('tourDraftState');
        state.textContent = message;
        state.classList.toggle('is-dirty', !!dirty);
    }
    function saveDraft() {
        if (!account || !editorTour || !editorDirty) return;
        safeWrite(draftKey(), JSON.stringify({ version: 1, baseRevision: editorBaseRevision, savedAt: Date.now(), data: editorTour }));
        setDraftState('Черновик сохранён', true);
    }
    function scheduleDraftSave() {
        editorDirty = true;
        setDraftState('Сохраняем черновик…', true);
        window.clearTimeout(draftTimer);
        draftTimer = window.setTimeout(saveDraft, 280);
    }
    function showEditorError(message) {
        const node = byId('tourEditorError');
        node.hidden = !message;
        node.textContent = message || '';
    }
    function showConflict() { byId('tourEditorConflict').hidden = false; }
    function hideConflict() { byId('tourEditorConflict').hidden = true; }

    function rosterObject(value) {
        const result = {};
        const members = value && value.members && typeof value.members === 'object' ? value.members : {};
        Object.keys(members).forEach(function (id) {
            const member = members[id] || {};
            if (/^p_[a-f0-9]{24}$/.test(id) && text(member.displayName, 120)) result[id] = { displayName: text(member.displayName, 120), order: Number(member.order) || 999, active: member.active === true };
        });
        return result;
    }
    function rosterNamesFromDuty(value) {
        const cycle = value && value.config && value.config.cycle;
        let names = [];
        if (cycle && typeof cycle === 'object') {
            names = collection(cycle).sort(function (a, b) { return Number(a.value.order) - Number(b.value.order); }).flatMap(function (entry) {
                const people = entry.value && entry.value.people;
                return collection(people).map(function (person) { return text(person.value, 120); }).filter(Boolean);
            });
        } else if (value && value.entries && typeof value.entries === 'object') {
            names = collection(value.entries).sort(function (a, b) { return String(a.value.start || '').localeCompare(String(b.value.start || '')); }).flatMap(function (entry) {
                return collection(entry.value && entry.value.people).map(function (person) { return text(person.value, 120); }).filter(Boolean);
            });
        }
        return names.filter(function (name, index, allNames) { return allNames.indexOf(name) === index; });
    }
    async function buildRosterMembers(names) {
        const members = {};
        for (let index = 0; index < names.length; index += 1) {
            const id = await personId(names[index]);
            members[id] = { displayName: names[index], order: index + 1, active: true };
        }
        return members;
    }
    function sameRoster(left, right) {
        const a = Object.keys(left).sort(); const b = Object.keys(right).sort();
        return a.length === b.length && a.every(function (id, index) { return id === b[index] && left[id].displayName === right[id].displayName && left[id].order === right[id].order && left[id].active === right[id].active; });
    }
    async function syncOwnerRoster() {
        const results = await Promise.all([database.ref(ROSTER_PATH).once('value'), database.ref(DUTY_PATH).once('value')]);
        const currentRaw = results[0].val();
        const current = rosterObject(currentRaw);
        const names = rosterNamesFromDuty(results[1].val());
        if (!names.length) {
            if (Object.keys(current).length) { roster = current; return; }
            throw new Error('Не удалось подготовить закрытый список класса из расписания дежурств.');
        }
        const members = await buildRosterMembers(names);
        if (!sameRoster(current, members)) {
            await database.ref(ROSTER_PATH).set({
                version: 1,
                className: '10-1',
                revision: currentRaw && Number.isInteger(currentRaw.revision) ? currentRaw.revision + 1 : 1,
                updatedAt: firebase.database.ServerValue.TIMESTAMP,
                updatedBy: account.uid,
                members: members
            });
        }
        roster = members;
    }
    async function ensureRoster() {
        if (!database || !account) throw new Error('Для выбора людей требуется подключение к Firebase.');
        if (account.uid === OWNER_UID) {
            await syncOwnerRoster();
            return roster;
        }
        const snapshot = await database.ref(ROSTER_PATH).once('value');
        roster = rosterObject(snapshot.val());
        if (!Object.keys(roster).length) throw new Error('Закрытый список класса ещё не подготовлен владельцем.');
        return roster;
    }

    function createField(labelText, type, value, spanClass, onChange, options, constraints) {
        const label = make('label', 'tour-field ' + (spanClass || ''));
        label.appendChild(make('span', '', labelText));
        let input;
        if (type === 'textarea') { input = document.createElement('textarea'); input.rows = 2; }
        else if (type === 'select') {
            input = document.createElement('select');
            (options || []).forEach(function (option) { const node = document.createElement('option'); node.value = option.value; node.textContent = option.label; input.appendChild(node); });
        } else { input = document.createElement('input'); input.type = type || 'text'; }
        const limits = constraints || {};
        if (Number.isInteger(limits.maxLength) && limits.maxLength > 0) input.maxLength = limits.maxLength;
        if (limits.min != null) input.min = String(limits.min);
        if (limits.max != null) input.max = String(limits.max);
        if (limits.step != null) input.step = String(limits.step);
        input.value = value == null ? '' : value;
        input.addEventListener(type === 'select' ? 'change' : 'input', function () {
            const normalizedValue = onChange(input.value);
            if (normalizedValue != null && String(normalizedValue) !== input.value) input.value = String(normalizedValue);
            scheduleDraftSave();
        });
        label.appendChild(input);
        return label;
    }
    function removeButton(onClick, label) {
        const button = make('button', 'tour-remove-button');
        button.type = 'button'; button.setAttribute('aria-label', label || 'Удалить'); button.appendChild(removeIcon()); button.addEventListener('click', onClick);
        return button;
    }
    function selectedChips(ids) {
        const holder = make('div', 'tour-editor-selected');
        participantIds(ids).forEach(function (id) { holder.appendChild(make('span', 'tour-person-chip', (roster[id] && roster[id].displayName) || editorTour.people[id] || 'Участник')); });
        return holder;
    }
    function peopleButton(title, ids, onApply, options) {
        const button = make('button', 'tour-pick-people', ids.length ? 'Выбрано: ' + ids.length : 'Выбрать людей');
        button.type = 'button';
        button.addEventListener('click', function () { openPicker(title, ids, onApply, options); });
        return button;
    }

    function renderScheduleEditor() {
        const list = byId('tourScheduleEditor'); list.replaceChildren();
        editorTour.schedule.forEach(function (item, index) {
            const row = make('article', 'tour-editor-row');
            row.append(
                createField('Событие', 'text', item.title, 'span-5', function (value) { item.title = text(value, 120); }, null, { maxLength: 120 }),
                createField('Дата', 'date', item.date, 'span-3', function (value) { item.date = value; }),
                createField('Начало', 'time', item.startTime, 'span-2', function (value) { item.startTime = value; }),
                createField('Конец', 'time', item.endTime, 'span-2', function (value) { item.endTime = value; }),
                createField('Подпись времени', 'text', item.timeLabel, 'span-4', function (value) { item.timeLabel = text(value, 80); }, null, { maxLength: 80 }),
                createField('Место', 'text', item.location, 'span-4', function (value) { item.location = text(value, 200); }, null, { maxLength: 200 }),
                createField('Примечание', 'text', item.note, 'span-2', function (value) { item.note = text(value, 300); }, null, { maxLength: 300 })
            );
            const actions = make('div', 'tour-editor-row-actions');
            actions.appendChild(removeButton(function () {
                if (editorTour.schedule.length <= 1) return showEditorError('В расписании должно остаться хотя бы одно событие.');
                editorTour.schedule.splice(index, 1); reorder(editorTour.schedule); renderScheduleEditor(); scheduleDraftSave();
            }, 'Удалить событие'));
            row.appendChild(actions); list.appendChild(row);
        });
    }
    function renderTentsEditor() {
        const list = byId('tourTentsEditor'); list.replaceChildren();
        editorTour.tents.forEach(function (item, index) {
            const row = make('article', 'tour-editor-row');
            row.append(
                createField('Название', 'text', item.title, 'span-6', function (value) { item.title = text(value, 120); }, null, { maxLength: 120 }),
                createField('Мест', 'number', item.capacity, 'span-2', function (value) { item.capacity = Math.max(1, Math.min(20, Number.parseInt(value, 10) || 1)); return item.capacity; }, null, { min: 1, max: 20, step: 1 }),
                createField('Примечание', 'text', item.note, 'span-2', function (value) { item.note = text(value, 240); }, null, { maxLength: 240 })
            );
            const actions = make('div', 'tour-editor-row-actions'); actions.appendChild(removeButton(function () { editorTour.tents.splice(index, 1); reorder(editorTour.tents); renderTentsEditor(); scheduleDraftSave(); }, 'Удалить палатку')); row.appendChild(actions);
            const pickHolder = make('div', 'span-12');
            pickHolder.append(peopleButton(item.title, item.participants, function (ids) {
                editorTour.tents.forEach(function (other) { if (other !== item) other.participants = participantIds(other.participants).filter(function (id) { return !ids.includes(id); }); });
                item.participants = ids; renderTentsEditor(); scheduleDraftSave();
            }, { max: item.capacity }), selectedChips(item.participants));
            row.appendChild(pickHolder); list.appendChild(row);
        });
        if (!editorTour.tents.length) list.appendChild(make('div', 'tour-empty', 'Палаток пока нет. Добавьте первую палатку.'));
    }
    function renderActivitiesEditor() {
        const list = byId('tourActivitiesEditor'); list.replaceChildren();
        editorTour.activities.forEach(function (item, index) {
            const row = make('article', 'tour-editor-row');
            row.appendChild(createField('Мероприятие', 'text', item.title, 'span-10', function (value) { item.title = text(value, 120); }, null, { maxLength: 120 }));
            const actions = make('div', 'tour-editor-row-actions'); actions.appendChild(removeButton(function () {
                if (editorTour.activities.length <= 1) return showEditorError('В программе должно остаться хотя бы одно мероприятие.');
                editorTour.activities.splice(index, 1); reorder(editorTour.activities); renderActivitiesEditor(); scheduleDraftSave();
            }, 'Удалить мероприятие')); row.appendChild(actions);
            const pickHolder = make('div', 'span-12');
            pickHolder.append(peopleButton(item.title, item.participants, function (ids) { item.participants = ids; renderActivitiesEditor(); scheduleDraftSave(); }), selectedChips(item.participants));
            row.appendChild(pickHolder); list.appendChild(row);
        });
    }
    function renderMealsEditor() {
        const list = byId('tourMealsEditor'); list.replaceChildren();
        editorTour.meals.forEach(function (item, index) {
            const row = make('article', 'tour-editor-row');
            row.append(
                createField('Дата', 'date', item.date, 'span-3', function (value) { item.date = value; }),
                createField('Приём пищи', 'select', item.type, 'span-3', function (value) { item.type = value; item.title = MEAL_TYPES[value]; }, Object.keys(MEAL_TYPES).map(function (key) { return { value: key, label: MEAL_TYPES[key] }; })),
                createField('Примечание', 'text', item.note, 'span-4', function (value) { item.note = text(value, 240); }, null, { maxLength: 240 })
            );
            const actions = make('div', 'tour-editor-row-actions'); actions.appendChild(removeButton(function () {
                if (editorTour.meals.length <= 1) return showEditorError('Должен остаться хотя бы один приём пищи.');
                editorTour.meals.splice(index, 1); reorder(editorTour.meals); renderMealsEditor(); scheduleDraftSave();
            }, 'Удалить приём пищи')); row.appendChild(actions);
            const pickHolder = make('div', 'span-12');
            pickHolder.append(peopleButton(dateLabel(item.date) + ' · ' + MEAL_TYPES[item.type], item.participants, function (ids) { item.participants = ids; renderMealsEditor(); scheduleDraftSave(); }), selectedChips(item.participants));
            row.appendChild(pickHolder); list.appendChild(row);
        });
    }
    function reorder(items) { items.forEach(function (item, index) { item.order = index + 1; }); }
    function revealLastEditorRow(listId) {
        window.requestAnimationFrame(function () {
            const list = byId(listId);
            const row = list && list.lastElementChild;
            if (!row) return;
            row.scrollIntoView({ block: 'center', behavior: root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
            const field = row.querySelector('input, textarea, select, button');
            if (field) field.focus({ preventScroll: true });
        });
    }
    function nextId(items, prefix) {
        let number = items.length + 1; let id = prefix + '-' + number;
        const ids = new Set(items.map(function (item) { return item.id; }));
        while (ids.has(id)) { number += 1; id = prefix + '-' + number; }
        return id;
    }
    function renderEditorLists() { renderScheduleEditor(); renderTentsEditor(); renderActivitiesEditor(); renderMealsEditor(); }

    function fillOverviewEditor() {
        const fields = {
            tourFieldTitle: 'title', tourFieldStartDate: 'startDate', tourFieldEndDate: 'endDate', tourFieldLocation: 'location',
            tourFieldRoute: 'route', tourFieldDeparture: 'departure', tourFieldReturn: 'return', tourFieldLeader: 'leader'
        };
        Object.keys(fields).forEach(function (id) { byId(id).value = editorTour.info[fields[id]]; });
    }
    function activateEditorTab(name, focus) {
        editorActiveTab = ['overview', 'schedule', 'tents', 'activities', 'meals'].includes(name) ? name : 'overview';
        document.querySelectorAll('[data-tour-tab]').forEach(function (tab) {
            const active = tab.dataset.tourTab === editorActiveTab;
            tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
            if (active && focus) tab.focus();
        });
        document.querySelectorAll('[data-tour-panel]').forEach(function (panel) { const active = panel.dataset.tourPanel === editorActiveTab; panel.hidden = !active; panel.classList.toggle('is-active', active); });
        byId('tourEditorContent').scrollTop = 0;
    }

    async function openEditor(tab) {
        if (!canEdit || !account || editorOpen) return;
        showEditorError('');
        try { await ensureRoster(); }
        catch (error) { toast(error.message || 'Не удалось загрузить закрытый список класса', 'error'); return; }
        editorBaseRevision = tour.revision;
        editorTour = clone(tour);
        editorDirty = false;
        conflictOverride = false;
        const stored = safeRead(draftKey());
        if (stored) {
            try {
                const draft = JSON.parse(stored);
                const normalized = draft && draft.version === 1 && normalizeTour(draft.data);
                if (normalized) {
                    editorTour = normalized; editorBaseRevision = Number.isInteger(draft.baseRevision) ? draft.baseRevision : tour.revision; editorDirty = true;
                    setDraftState('Черновик восстановлен', true);
                    if (tour.revision > editorBaseRevision) showConflict(); else hideConflict();
                } else { safeRemove(draftKey()); setDraftState('Изменений нет', false); hideConflict(); }
            } catch (_) { safeRemove(draftKey()); setDraftState('Изменений нет', false); hideConflict(); }
        } else { setDraftState('Изменений нет', false); hideConflict(); }
        fillOverviewEditor(); renderEditorLists(); activateEditorTab(tab || 'overview', false);
        editorOpen = true;
        const overlay = byId('tourEditorOverlay'); overlay.hidden = false; overlay.setAttribute('aria-hidden', 'false'); document.body.classList.add('tour-modal-open');
        window.setTimeout(function () { const selected = document.querySelector('[data-tour-tab].is-active'); if (selected) selected.focus(); }, 0);
    }
    function closeEditor() {
        if (!editorOpen) return;
        window.clearTimeout(draftTimer); if (editorDirty) saveDraft();
        closePicker(); editorOpen = false; editorTour = null;
        const overlay = byId('tourEditorOverlay'); overlay.hidden = true; overlay.setAttribute('aria-hidden', 'true'); document.body.classList.remove('tour-modal-open');
        byId('tourEditButton').focus();
    }
    function useCloudVersion() {
        editorTour = clone(tour); editorBaseRevision = tour.revision; editorDirty = false; conflictOverride = false; safeRemove(draftKey()); hideConflict(); setDraftState('Открыта облачная версия', false); fillOverviewEditor(); renderEditorLists();
    }
    function keepDraftVersion() { conflictOverride = true; hideConflict(); setDraftState('Черновик будет опубликован поверх облачной версии', true); }

    function setEditorBehindPicker(hidden) {
        const dialog = byId('tourEditorDialog');
        if (!dialog) return;
        if (hidden) {
            dialog.setAttribute('inert', '');
            dialog.setAttribute('aria-hidden', 'true');
        } else {
            dialog.removeAttribute('inert');
            dialog.removeAttribute('aria-hidden');
        }
    }
    function pickerReturnContext(node) {
        const row = node && typeof node.closest === 'function' ? node.closest('.tour-editor-row') : null;
        const list = row && row.parentElement;
        return {
            listId: list && list.id ? list.id : '',
            rowIndex: list ? Array.from(list.children).indexOf(row) : -1
        };
    }
    function restorePickerFocus(target) {
        if (!target) return;
        let node = target.returnFocus;
        if (!node || !node.isConnected) {
            const list = target.returnListId && byId(target.returnListId);
            const row = list && target.returnRowIndex >= 0 ? list.children[target.returnRowIndex] : null;
            node = row && row.querySelector('.tour-pick-people');
        }
        if (node && node.isConnected && !node.closest('[hidden]')) node.focus();
        else {
            const tab = document.querySelector('[data-tour-tab="' + editorActiveTab + '"]');
            if (tab) tab.focus();
        }
    }
    function openPicker(title, ids, onApply, options) {
        if (!Object.keys(roster).length) { showEditorError('Список класса недоступен. Закройте редактор и попробуйте снова.'); return; }
        const returnFocus = document.activeElement;
        const returnContext = pickerReturnContext(returnFocus);
        pickerTarget = {
            onApply: onApply,
            max: options && Number.isInteger(options.max) && options.max > 0 ? options.max : 0,
            returnFocus: returnFocus,
            returnListId: returnContext.listId,
            returnRowIndex: returnContext.rowIndex
        };
        pickerSelection = new Set(participantIds(ids));
        byId('tourPickerTitle').textContent = title || 'Выберите участников';
        byId('tourPickerSearch').value = '';
        renderPickerList();
        const overlay = byId('tourPickerOverlay'); overlay.hidden = false; overlay.setAttribute('aria-hidden', 'false');
        byId('tourPickerSearch').focus();
        setEditorBehindPicker(true);
    }
    function closePicker(skipFocusRestore) {
        const target = pickerTarget;
        pickerTarget = null;
        const overlay = byId('tourPickerOverlay'); overlay.hidden = true; overlay.setAttribute('aria-hidden', 'true');
        setEditorBehindPicker(false);
        if (skipFocusRestore !== true) restorePickerFocus(target);
    }
    function renderPickerList() {
        const list = byId('tourPickerList'); list.replaceChildren();
        const query = byId('tourPickerSearch').value.trim().toLocaleLowerCase('ru');
        Object.keys(roster).filter(function (id) { return roster[id].active && roster[id].displayName.toLocaleLowerCase('ru').includes(query); }).sort(function (a, b) { return roster[a].order - roster[b].order; }).forEach(function (id) {
            const label = make('label', 'tour-picker-option');
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = pickerSelection.has(id);
            checkbox.addEventListener('change', function () {
                if (checkbox.checked && pickerTarget && pickerTarget.max && pickerSelection.size >= pickerTarget.max) checkbox.checked = false;
                else if (checkbox.checked) pickerSelection.add(id);
                else pickerSelection.delete(id);
                updatePickerCount();
            });
            label.append(checkbox, make('span', '', roster[id].displayName)); list.appendChild(label);
        });
        if (!list.childElementCount) list.appendChild(make('p', 'tour-unassigned', 'Совпадений нет'));
        updatePickerCount();
    }
    function updatePickerCount() {
        const max = pickerTarget && pickerTarget.max;
        byId('tourPickerCount').textContent = max ? 'Выбрано: ' + pickerSelection.size + ' из ' + max : (pickerSelection.size ? 'Выбрано: ' + pickerSelection.size : 'Не выбрано');
    }
    function applyPicker() {
        if (!pickerTarget) return;
        const target = pickerTarget;
        const apply = target.onApply;
        const ids = Array.from(pickerSelection).sort(function (a, b) { return roster[a].order - roster[b].order; });
        closePicker(true);
        apply(ids);
        restorePickerFocus(target);
    }

    async function saveEditor() {
        if (!database || !account || !canEdit || !editorTour) return showEditorError('Нет подключения или права редактора были отозваны.');
        const draftValidation = validateTour(editorTour);
        if (!draftValidation.valid) { showEditorError(draftValidation.message); return; }
        const normalized = normalizeTour(editorTour);
        const validation = normalized ? validateTour(normalized) : { valid: false, message: 'Проверьте обязательные поля.' };
        if (!validation.valid) { showEditorError(validation.message); return; }
        const publicPeople = referencedPeople(normalized, roster);
        const expectedPeople = new Set();
        ['activities', 'tents', 'meals'].forEach(function (key) { normalized[key].forEach(function (item) { item.participants.forEach(function (id) { expectedPeople.add(id); }); }); });
        if (Object.keys(publicPeople).length !== expectedPeople.size) return showEditorError('Один из выбранных участников отсутствует в закрытом списке класса.');
        showEditorError('');
        const button = byId('tourEditorSave'); button.disabled = true; button.textContent = 'Публикуем…';
        let conflict = false;
        try {
            const result = await database.ref(TOUR_PATH).transaction(function (current) {
                const currentRevision = current && Number.isInteger(current.revision) ? current.revision : 0;
                if (currentRevision > editorBaseRevision && !conflictOverride) { conflict = true; return; }
                const payload = tourToFirebase(normalized, roster);
                payload.revision = currentRevision + 1;
                payload.updatedAt = firebase.database.ServerValue.TIMESTAMP;
                payload.updatedBy = account.uid;
                return payload;
            }, undefined, false);
            if (!result.committed) {
                if (conflict) { showConflict(); showEditorError('Сначала выберите, какую версию продолжить редактировать.'); }
                else showEditorError('Не удалось опубликовать данные. Черновик сохранён.');
                saveDraft(); return;
            }
            safeRemove(draftKey()); editorDirty = false; conflictOverride = false; setDraftState('Опубликовано', false); toast('Информация о слёте обновлена', 'success'); closeEditor();
        } catch (error) {
            console.error('Class tour publish:', error);
            showEditorError(String(error && error.code || '').includes('PERMISSION_DENIED') ? 'Firebase отклонил сохранение. Проверьте роль редактора и опубликованные правила базы.' : 'Не удалось опубликовать данные. Черновик сохранён на этом устройстве.');
            saveDraft();
        } finally { button.disabled = false; button.textContent = 'Опубликовать'; }
    }

    function updateEditorAccess(user) {
        if (editorOpen && (!user || !account || account.uid !== user.uid)) closeEditor();
        account = user || null; canEdit = false;
        const buttons = [byId('tourEditButton')].concat(Array.from(document.querySelectorAll('[data-open-editor]')));
        buttons.forEach(function (button) { button.hidden = true; });
        if (!account) return;
        const checker = root.AlmanionAccount && root.AlmanionAccount.hasTourEditorAccess;
        const access = account.uid === OWNER_UID
            ? Promise.resolve(true)
            : (typeof checker === 'function'
                ? checker(account)
                : (database
                    ? database.ref('adminRoles/' + account.uid + '/tourEditor').once('value').then(function (snapshot) { return snapshot.val() === true; }).catch(function () { return false; })
                    : Promise.resolve(false)));
        access.then(function (allowed) {
            if (!account || account.uid !== user.uid) return;
            canEdit = allowed === true;
            buttons.forEach(function (button) { button.hidden = !canEdit; });
            if (!canEdit && editorOpen) closeEditor();
        });
    }

    function bindOverviewInputs() {
        const fields = {
            tourFieldTitle: 'title', tourFieldStartDate: 'startDate', tourFieldEndDate: 'endDate', tourFieldLocation: 'location',
            tourFieldRoute: 'route', tourFieldDeparture: 'departure', tourFieldReturn: 'return', tourFieldLeader: 'leader'
        };
        Object.keys(fields).forEach(function (id) {
            byId(id).addEventListener('input', function (event) { if (!editorTour) return; editorTour.info[fields[id]] = text(event.target.value, event.target.maxLength || 300); scheduleDraftSave(); });
        });
    }
    function bindTabs() {
        const tabs = Array.from(document.querySelectorAll('[data-tour-tab]'));
        tabs.forEach(function (tab) { tab.addEventListener('click', function () { activateEditorTab(tab.dataset.tourTab, false); }); });
        byId('tourEditorTabs').addEventListener('keydown', function (event) {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault(); const current = Math.max(0, tabs.findIndex(function (tab) { return tab.dataset.tourTab === editorActiveTab; })); let next = current;
            if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
            if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
            if (event.key === 'Home') next = 0; if (event.key === 'End') next = tabs.length - 1;
            activateEditorTab(tabs[next].dataset.tourTab, true);
        });
    }
    function trapFocus(event, overlay) {
        if (event.key !== 'Tab' || overlay.hidden) return;
        const focusable = Array.from(overlay.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')).filter(function (node) { return !node.hidden && !node.closest('[hidden]'); });
        if (!focusable.length) { event.preventDefault(); return; }
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    function bindEvents() {
        bindOverviewInputs(); bindTabs();
        byId('tourEditButton').addEventListener('click', function () { openEditor('overview'); });
        document.querySelectorAll('[data-open-editor]').forEach(function (button) { button.addEventListener('click', function () { openEditor(button.dataset.openEditor); }); });
        byId('tourEditorClose').addEventListener('click', closeEditor); byId('tourEditorCancel').addEventListener('click', closeEditor); byId('tourEditorSave').addEventListener('click', saveEditor);
        byId('tourUseCloudButton').addEventListener('click', useCloudVersion); byId('tourKeepDraftButton').addEventListener('click', keepDraftVersion);
        byId('tourEditorOverlay').addEventListener('click', function (event) { if (event.target === event.currentTarget) closeEditor(); });
        byId('tourPickerClose').addEventListener('click', closePicker); byId('tourPickerCancel').addEventListener('click', closePicker); byId('tourPickerApply').addEventListener('click', applyPicker);
        byId('tourPickerSearch').addEventListener('input', renderPickerList); byId('tourPickerOverlay').addEventListener('click', function (event) { if (event.target === event.currentTarget) closePicker(); });
        byId('tourAddSchedule').addEventListener('click', function () { editorTour.schedule.push({ id: nextId(editorTour.schedule, 'event'), title: 'Новое событие', date: editorTour.info.startDate, startTime: '', endTime: '', timeLabel: 'Время уточняется', location: '', note: '', order: editorTour.schedule.length + 1 }); renderScheduleEditor(); scheduleDraftSave(); revealLastEditorRow('tourScheduleEditor'); });
        byId('tourAddTent').addEventListener('click', function () { editorTour.tents.push({ id: nextId(editorTour.tents, 'tent'), title: 'Новая палатка', capacity: 4, note: '', order: editorTour.tents.length + 1, participants: [] }); renderTentsEditor(); scheduleDraftSave(); revealLastEditorRow('tourTentsEditor'); });
        byId('tourAddActivity').addEventListener('click', function () { editorTour.activities.push({ id: nextId(editorTour.activities, 'activity'), title: 'Новое мероприятие', order: editorTour.activities.length + 1, participants: [] }); renderActivitiesEditor(); scheduleDraftSave(); revealLastEditorRow('tourActivitiesEditor'); });
        byId('tourAddMeal').addEventListener('click', function () { const type = 'breakfast'; editorTour.meals.push({ id: nextId(editorTour.meals, 'meal'), date: editorTour.info.startDate, type: type, title: MEAL_TYPES[type], note: '', order: editorTour.meals.length + 1, participants: [] }); renderMealsEditor(); scheduleDraftSave(); revealLastEditorRow('tourMealsEditor'); });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') { if (!byId('tourPickerOverlay').hidden) closePicker(); else if (editorOpen) closeEditor(); return; }
            if (!byId('tourPickerOverlay').hidden) trapFocus(event, byId('tourPickerOverlay')); else if (editorOpen) trapFocus(event, byId('tourEditorOverlay'));
        });
        root.addEventListener('beforeunload', function () { window.clearTimeout(draftTimer); if (editorOpen && editorDirty) saveDraft(); });
        root.addEventListener('almanion-account-ready', function (event) { updateEditorAccess(event.detail && event.detail.user); });
    }

    function init() {
        bindEvents(); renderAll();
        if (root.AlmanionAccount) {
            database = root.AlmanionAccount.database || null;
            updateEditorAccess(root.AlmanionAccount.getUser ? root.AlmanionAccount.getUser() : null);
        } else if (typeof firebase !== 'undefined' && typeof firebase.database === 'function') {
            try { if (!firebase.apps.length && typeof firebaseConfig !== 'undefined') firebase.initializeApp(firebaseConfig); database = firebase.database(); } catch (_) { database = null; }
        }
        loadCloudTour();
        statusTimer = window.setInterval(updateTimeStates, 60000);
        root.addEventListener('pagehide', function () { window.clearInterval(statusTimer); }, { once: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
}(typeof window !== 'undefined' ? window : globalThis));
