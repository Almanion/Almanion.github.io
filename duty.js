(function (root) {
    'use strict';

    const DATA_PATH = 'classDuty/grade10_1';
    const CACHE_KEY = 'almanion:class-duty:grade10_1:cache:v2';
    const DRAFT_PREFIX = 'almanion:class-duty:grade10_1:draft:v2:';
    const OWNER_EMAIL = 'dmb23930@gmail.com';

    const DEFAULT_DUTY_CONFIG = {
        cycle: [
            { id: 'group-01', order: 1, people: ['Нонна Близнец', 'Маша Кессель'] },
            { id: 'group-02', order: 2, people: ['Полина Лубневская', 'Марина Устинова'] },
            { id: 'group-03', order: 3, people: ['Аня Шубина', 'Инга Щербак'] },
            { id: 'group-04', order: 4, people: ['Катя Айзикович', 'Даша Волкова'] },
            { id: 'group-05', order: 5, people: ['Соня Гаранина', 'Уля Попова'] },
            { id: 'group-06', order: 6, people: ['Даня Луконин', 'Федя Гринь'] },
            { id: 'group-07', order: 7, people: ['Ваня Кисмерешкин', 'Дима Белоцерковцев'] },
            { id: 'group-08', order: 8, people: ['Миша Балуев', 'Никита Выровщиков'] },
            { id: 'group-09', order: 9, people: ['Максим Казаков', 'Саша Деревягин'] },
            { id: 'group-10', order: 10, people: ['Андрей Кузь', 'Артём Львов'] },
            { id: 'group-11', order: 11, people: ['Олег Чуднов', 'Дима Петров'] },
            { id: 'group-12', order: 12, people: ['Ярик Сысоев', 'Саша Михлин'] },
            { id: 'group-13', order: 13, people: ['Ваня Щербак', 'Ваня Коршиков'] },
            { id: 'group-14', order: 14, people: ['Гоша Шкурихин', 'Вова Дубейко', 'Саша Свердлов'] }
        ],
        calendar: {
            schoolStart: '2026-09-02',
            schoolEnd: '2027-05-25',
            weekStartsOn: 1,
            weekEndsOn: 6,
            vacations: [
                { id: 'vacation-autumn', start: '2026-10-28', end: '2026-11-04', label: 'Осенние каникулы' },
                { id: 'vacation-winter', start: '2026-12-28', end: '2027-01-10', label: 'Зимние каникулы' },
                { id: 'vacation-spring', start: '2027-03-22', end: '2027-03-28', label: 'Весенние каникулы' }
            ],
            daysOff: [
                { id: 'day-off-rally-1', date: '2026-09-18', label: 'Туристический слёт' },
                { id: 'day-off-rally-2', date: '2026-09-19', label: 'Туристический слёт' },
                { id: 'day-off-health', date: '2027-02-22', label: 'День здоровья' },
                { id: 'day-off-february-23', date: '2027-02-23', label: '23 февраля' },
                { id: 'day-off-march-8', date: '2027-03-08', label: '8 марта' },
                { id: 'day-off-may-1', date: '2027-05-01', label: '1 мая' },
                { id: 'day-off-may-10', date: '2027-05-10', label: 'Перенос выходного' }
            ],
            turnMerges: [
                { id: 'merge-autumn', start: '2026-10-26', end: '2026-11-07', label: 'Осенние каникулы' }
            ]
        },
        overrides: {}
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

    function hasOwn(value, key) {
        return !!value && Object.prototype.hasOwnProperty.call(value, key);
    }

    function collectionItems(value) {
        if (Array.isArray(value)) {
            return value.map(function (item, index) { return { key: String(index), value: item }; });
        }
        if (!value || typeof value !== 'object') return [];
        return Object.keys(value).sort().map(function (key) { return { key: key, value: value[key] }; });
    }

    function safeConfigId(value, fallback) {
        const id = String(value || '').trim();
        return /^[a-zA-Z0-9_-]{1,64}$/.test(id) ? id : fallback;
    }

    function normalizeSegments(value, fallbackStart, fallbackEnd) {
        const segments = collectionItems(value).map(function (item) {
            const segment = item.value && typeof item.value === 'object' ? item.value : {};
            const start = String(segment.start || '').trim();
            const end = String(segment.end || '').trim();
            if (!isIsoDate(start) || !isIsoDate(end) || start > end) return null;
            return { start: start, end: end };
        }).filter(Boolean).sort(function (a, b) {
            return a.start.localeCompare(b.start) || a.end.localeCompare(b.end);
        });
        if (!segments.length && isIsoDate(fallbackStart) && isIsoDate(fallbackEnd) && fallbackStart <= fallbackEnd) {
            return [{ start: fallbackStart, end: fallbackEnd }];
        }
        for (let index = 1; index < segments.length; index += 1) {
            if (segments[index].start <= segments[index - 1].end) return [];
        }
        return segments;
    }

    function entrySegments(entry) {
        const start = String(entry && entry.start || '').trim();
        const end = String(entry && entry.end || '').trim();
        const segments = normalizeSegments(entry && entry.segments, start, end);
        return segments.length ? segments : (isIsoDate(start) && isIsoDate(end) && start <= end
            ? [{ start: start, end: end }]
            : []);
    }

    function normalizeEntry(value, id) {
        const entry = value && typeof value === 'object' ? value : {};
        const rawStart = String(entry.start || '').trim();
        const rawEnd = String(entry.end || '').trim();
        const segments = normalizeSegments(entry.segments, rawStart, rawEnd);
        if (!segments.length) return null;
        const start = segments[0].start;
        const end = segments[segments.length - 1].end;
        const people = normalizePeople(entry.people);
        if (!people.length) return null;
        const normalized = {
            id: /^week-\d{4}-\d{2}-\d{2}$/.test(String(id || '')) ? String(id) : `week-${start}`,
            start: start,
            end: end,
            people: people,
            note: String(entry.note || '').trim().slice(0, 500),
            segments: segments
        };
        const groupId = safeConfigId(entry.groupId, '');
        if (groupId) normalized.groupId = groupId;
        return normalized;
    }

    function normalizeNamedRanges(value, prefix) {
        return collectionItems(value).map(function (item, index) {
            const range = item.value && typeof item.value === 'object' ? item.value : {};
            const start = String(range.start || '').trim();
            const end = String(range.end || '').trim();
            if (!isIsoDate(start) || !isIsoDate(end) || start > end) return null;
            return {
                id: safeConfigId(range.id || item.key, prefix + '-' + String(index + 1)),
                start: start,
                end: end,
                label: String(range.label || '').trim().slice(0, 120)
            };
        }).filter(Boolean).sort(function (a, b) {
            return a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.id.localeCompare(b.id);
        });
    }

    function normalizeDaysOff(value) {
        return collectionItems(value).map(function (item, index) {
            const raw = item.value;
            const day = raw && typeof raw === 'object' ? raw : { date: raw };
            const date = String(day.date || '').trim();
            if (!isIsoDate(date)) return null;
            return {
                id: safeConfigId(day.id || item.key, 'day-off-' + String(index + 1)),
                date: date,
                label: String(day.label || '').trim().slice(0, 120)
            };
        }).filter(Boolean).sort(function (a, b) {
            return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
        });
    }

    function normalizeCycle(value) {
        const groups = collectionItems(value).map(function (item, index) {
            const raw = item.value && typeof item.value === 'object' && !Array.isArray(item.value)
                ? item.value
                : { people: item.value };
            const people = normalizePeople(raw.people);
            if (!people.length) return null;
            const order = Number.isInteger(raw.order) && raw.order > 0 ? raw.order : index + 1;
            return {
                id: safeConfigId(raw.id || item.key, 'group-' + String(index + 1).padStart(2, '0')),
                order: order,
                people: people
            };
        }).filter(Boolean).sort(function (a, b) {
            return a.order - b.order || a.id.localeCompare(b.id);
        });
        const usedIds = new Set();
        return groups.filter(function (group) {
            if (usedIds.has(group.id)) return false;
            usedIds.add(group.id);
            return true;
        }).slice(0, 40);
    }

    function normalizeOverrides(value) {
        const overrides = {};
        if (!value || typeof value !== 'object') return overrides;
        Object.keys(value).sort().forEach(function (id) {
            if (!/^week-\d{4}-\d{2}-\d{2}$/.test(id)) return;
            const raw = value[id] && typeof value[id] === 'object' ? value[id] : {};
            const override = {};
            const groupId = safeConfigId(raw.groupId, '');
            if (groupId) override.groupId = groupId;
            if (hasOwn(raw, 'people')) override.people = normalizePeople(raw.people);
            if (hasOwn(raw, 'note')) override.note = String(raw.note || '').trim().slice(0, 500);
            if (raw.removed === true) override.removed = true;
            if (isIsoDate(raw.start)) override.start = String(raw.start);
            if (isIsoDate(raw.end)) override.end = String(raw.end);
            const segments = normalizeSegments(raw.segments);
            if (segments.length) {
                override.segments = segments;
                override.start = segments[0].start;
                override.end = segments[segments.length - 1].end;
            }
            if (Object.keys(override).length) overrides[id] = override;
        });
        return overrides;
    }

    function normalizeDutyConfig(value) {
        const config = value && typeof value === 'object' ? value : {};
        const calendar = config.calendar && typeof config.calendar === 'object' ? config.calendar : {};
        const schoolStart = String(calendar.schoolStart || '').trim();
        const schoolEnd = String(calendar.schoolEnd || '').trim();
        const cycle = normalizeCycle(config.cycle);
        if (cycle.length < 2 || cycle.length > 40 || !isIsoDate(schoolStart) || !isIsoDate(schoolEnd) || schoolStart > schoolEnd) return null;
        const withinSchoolYear = function (range) { return range.start >= schoolStart && range.end <= schoolEnd; };
        const validGroupIds = new Set(cycle.map(function (group) { return group.id; }));
        const overrides = normalizeOverrides(config.overrides);
        Object.keys(overrides).forEach(function (id) {
            const override = overrides[id];
            if (override.groupId && !validGroupIds.has(override.groupId)) delete override.groupId;
            if (!Object.keys(override).length) delete overrides[id];
        });
        return {
            cycle: cycle,
            calendar: {
                schoolStart: schoolStart,
                schoolEnd: schoolEnd,
                weekStartsOn: 1,
                weekEndsOn: 6,
                vacations: normalizeNamedRanges(calendar.vacations, 'vacation').filter(withinSchoolYear),
                daysOff: normalizeDaysOff(calendar.daysOff).filter(function (day) {
                    return day.date >= schoolStart && day.date <= schoolEnd;
                }),
                turnMerges: normalizeNamedRanges(calendar.turnMerges, 'merge').filter(withinSchoolYear)
            },
            overrides: overrides
        };
    }

    function configToFirebase(value) {
        const config = normalizeDutyConfig(value);
        if (!config) return null;
        const cycle = {};
        config.cycle.forEach(function (group) {
            const people = {};
            group.people.forEach(function (person, index) { people['person-' + index] = person; });
            cycle[group.id] = { order: group.order, people: people };
        });
        const rangesToObject = function (ranges) {
            const output = {};
            ranges.forEach(function (range) {
                output[range.id] = { start: range.start, end: range.end, label: range.label || '' };
            });
            return output;
        };
        const daysOff = {};
        config.calendar.daysOff.forEach(function (day) {
            daysOff[day.id] = { date: day.date, label: day.label || '' };
        });
        const overrides = {};
        Object.keys(config.overrides).forEach(function (id) {
            const source = config.overrides[id];
            const target = {};
            if (source.groupId) target.groupId = source.groupId;
            if (hasOwn(source, 'people')) {
                target.people = {};
                source.people.forEach(function (person, index) { target.people['person-' + index] = person; });
            }
            if (hasOwn(source, 'note')) target.note = source.note;
            if (source.removed === true) target.removed = true;
            if (source.start) target.start = source.start;
            if (source.end) target.end = source.end;
            if (source.segments && source.segments.length) {
                target.segments = {};
                source.segments.forEach(function (segment, index) {
                    target.segments['segment-' + index] = { start: segment.start, end: segment.end };
                });
            }
            overrides[id] = target;
        });
        return {
            cycle: cycle,
            calendar: {
                schoolStart: config.calendar.schoolStart,
                schoolEnd: config.calendar.schoolEnd,
                weekStartsOn: 1,
                weekEndsOn: 6,
                vacations: rangesToObject(config.calendar.vacations),
                daysOff: daysOff,
                turnMerges: rangesToObject(config.calendar.turnMerges)
            },
            overrides: overrides
        };
    }

    function isClosedSchoolDate(date, calendar) {
        if (calendar.daysOff.some(function (day) { return day.date === date; })) return true;
        return calendar.vacations.some(function (range) { return range.start <= date && date <= range.end; });
    }

    function mondayFor(dateValue) {
        const date = isoToUtc(dateValue);
        if (!date) return '';
        const offset = (date.getUTCDay() + 6) % 7;
        date.setUTCDate(date.getUTCDate() - offset);
        return dateToIso(date);
    }

    function activeSegmentsForWeek(weekStart, calendar) {
        const activeDays = [];
        for (let offset = 0; offset < 6; offset += 1) {
            const date = addDays(weekStart, offset);
            if (date < calendar.schoolStart || date > calendar.schoolEnd || isClosedSchoolDate(date, calendar)) continue;
            activeDays.push(date);
        }
        const segments = [];
        activeDays.forEach(function (date) {
            const previous = segments[segments.length - 1];
            if (previous && addDays(previous.end, 1) === date) previous.end = date;
            else segments.push({ start: date, end: date });
        });
        return segments;
    }

    function mergeForSegments(segments, merges) {
        return merges.find(function (merge) {
            return segments.some(function (segment) { return segment.start <= merge.end && segment.end >= merge.start; });
        }) || null;
    }

    function buildBaseDutyEntries(config) {
        const candidates = [];
        let weekStart = mondayFor(config.calendar.schoolStart);
        while (weekStart && weekStart <= config.calendar.schoolEnd) {
            const segments = activeSegmentsForWeek(weekStart, config.calendar);
            if (segments.length) candidates.push({
                weekStart: weekStart,
                segments: segments,
                merge: mergeForSegments(segments, config.calendar.turnMerges)
            });
            weekStart = addDays(weekStart, 7);
        }

        const turns = [];
        candidates.forEach(function (candidate) {
            const previous = turns[turns.length - 1];
            if (candidate.merge && previous && previous.mergeId === candidate.merge.id) {
                previous.segments = previous.segments.concat(candidate.segments);
                return;
            }
            turns.push({
                mergeId: candidate.merge ? candidate.merge.id : '',
                segments: candidate.segments.slice()
            });
        });

        return turns.map(function (turn, index) {
            const group = config.cycle[index % config.cycle.length];
            const start = turn.segments[0].start;
            return {
                id: `week-${start}`,
                start: start,
                end: turn.segments[turn.segments.length - 1].end,
                groupId: group.id,
                people: group.people.slice(),
                note: '',
                segments: turn.segments.map(function (segment) { return { start: segment.start, end: segment.end }; })
            };
        });
    }

    function applyDutyOverride(entry, override, cycle) {
        if (!override || override.removed === true) return override && override.removed === true ? null : entry;
        const next = {
            id: entry.id,
            start: entry.start,
            end: entry.end,
            groupId: entry.groupId,
            people: entry.people.slice(),
            note: entry.note || '',
            segments: entry.segments.map(function (segment) { return { start: segment.start, end: segment.end }; })
        };
        if (override.groupId) {
            const group = cycle.find(function (item) { return item.id === override.groupId; });
            if (group) {
                next.groupId = group.id;
                next.people = group.people.slice();
            }
        }
        if (hasOwn(override, 'people') && override.people.length) next.people = override.people.slice();
        if (hasOwn(override, 'note')) next.note = override.note;
        let segments = override.segments && override.segments.length ? override.segments : null;
        if (!segments && (override.start || override.end)) {
            const start = override.start || next.start;
            const end = override.end || next.end;
            segments = normalizeSegments(null, start, end);
        }
        if (segments && segments.length) {
            next.segments = segments.map(function (segment) { return { start: segment.start, end: segment.end }; });
            next.start = next.segments[0].start;
            next.end = next.segments[next.segments.length - 1].end;
        }
        return next;
    }

    function generateDutyEntries(value) {
        const config = normalizeDutyConfig(value);
        if (!config) return [];
        const overrides = config.overrides;
        const matchedOverrides = new Set();
        const entries = buildBaseDutyEntries(config).map(function (entry) {
            if (hasOwn(overrides, entry.id)) matchedOverrides.add(entry.id);
            return applyDutyOverride(entry, overrides[entry.id], config.cycle);
        }).filter(Boolean);

        Object.keys(overrides).forEach(function (id) {
            if (matchedOverrides.has(id)) return;
            const override = overrides[id];
            if (override.removed === true) return;
            const group = config.cycle.find(function (item) { return item.id === override.groupId; });
            const people = override.people && override.people.length
                ? override.people
                : (group ? group.people : []);
            const segments = override.segments && override.segments.length
                ? override.segments
                : normalizeSegments(null, override.start, override.end);
            if (!people.length || !segments.length) return;
            entries.push({
                id: id,
                start: segments[0].start,
                end: segments[segments.length - 1].end,
                groupId: group ? group.id : (override.groupId || ''),
                people: people.slice(),
                note: hasOwn(override, 'note') ? override.note : '',
                segments: segments.map(function (segment) { return { start: segment.start, end: segment.end }; })
            });
        });
        return entries.sort(function (a, b) { return a.start.localeCompare(b.start) || a.end.localeCompare(b.end); });
    }

    function sameStrings(first, second) {
        if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length) return false;
        return first.every(function (value, index) { return value === second[index]; });
    }

    function sameSegments(first, second) {
        if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length) return false;
        return first.every(function (segment, index) {
            return segment.start === second[index].start && segment.end === second[index].end;
        });
    }

    function deriveDutyOverrides(value, entries) {
        const config = normalizeDutyConfig(value);
        if (!config) return {};
        const configWithoutOverrides = {
            cycle: config.cycle,
            calendar: config.calendar,
            overrides: {}
        };
        const baseEntries = buildBaseDutyEntries(configWithoutOverrides);
        const editedEntries = (Array.isArray(entries) ? entries : []).map(function (entry, index) {
            return normalizeEntry(entry, entry && entry.id ? entry.id : `week-${entry && entry.start || index}`);
        }).filter(Boolean);
        const editedById = new Map(editedEntries.map(function (entry) { return [entry.id, entry]; }));
        const baseIds = new Set(baseEntries.map(function (entry) { return entry.id; }));
        const overrides = {};

        baseEntries.forEach(function (base) {
            const edited = editedById.get(base.id);
            if (!edited) {
                overrides[base.id] = { removed: true };
                return;
            }
            const override = {};
            const existing = config.overrides[base.id] || null;
            const matchingGroup = config.cycle.find(function (group) { return sameStrings(group.people, edited.people); });
            if (matchingGroup && (matchingGroup.id !== base.groupId || (existing && existing.groupId === matchingGroup.id))) {
                override.groupId = matchingGroup.id;
            }
            else if (!sameStrings(base.people, edited.people)) override.people = edited.people.slice();
            if ((edited.note || '') !== (base.note || '')) override.note = edited.note || '';
            const editedSegments = entrySegments(edited);
            if (!sameSegments(base.segments, editedSegments)) {
                if (editedSegments.length > 1) {
                    override.segments = editedSegments.map(function (segment) { return { start: segment.start, end: segment.end }; });
                } else if (editedSegments.length === 1) {
                    override.start = editedSegments[0].start;
                    override.end = editedSegments[0].end;
                }
            }
            if (Object.keys(override).length) overrides[base.id] = override;
        });

        editedEntries.forEach(function (entry) {
            if (baseIds.has(entry.id)) return;
            const override = {
                start: entry.start,
                end: entry.end,
                people: entry.people.slice(),
                note: entry.note || ''
            };
            const segments = entrySegments(entry);
            if (segments.length > 1) override.segments = segments;
            if (entry.groupId) override.groupId = entry.groupId;
            overrides[entry.id] = override;
        });
        return overrides;
    }

    function normalizeSchedule(value) {
        const schedule = value && typeof value === 'object' ? value : {};
        const config = normalizeDutyConfig(schedule.config);
        const rawEntries = schedule.entries && typeof schedule.entries === 'object' ? schedule.entries : {};
        const legacyEntries = Object.keys(rawEntries)
            .map(function (id) { return normalizeEntry(rawEntries[id], id); })
            .filter(Boolean)
            .sort(function (a, b) { return a.start.localeCompare(b.start) || a.end.localeCompare(b.end); });
        const generatedEntries = config ? generateDutyEntries(config) : [];
        return {
            version: config ? 2 : 1,
            className: '10-1',
            academicYear: String(schedule.academicYear || '2026/2027').slice(0, 20),
            revision: Number.isInteger(schedule.revision) && schedule.revision >= 0 ? schedule.revision : 0,
            updatedAt: Number(schedule.updatedAt) || 0,
            updatedBy: String(schedule.updatedBy || ''),
            config: config,
            entries: config ? generatedEntries : legacyEntries
        };
    }

    function scheduleState(entries, now) {
        const date = isIsoDate(now) ? now : todayIso(now instanceof Date ? now : undefined);
        const list = Array.isArray(entries) ? entries : [];
        let current = null;
        let currentSegment = null;
        let next = null;
        let nextSegment = null;
        list.forEach(function (entry) {
            entrySegments(entry).forEach(function (segment) {
                if (!current && segment.start <= date && segment.end >= date) {
                    current = entry;
                    currentSegment = segment;
                }
                if (segment.start > date && (!nextSegment || segment.start < nextSegment.start)) {
                    next = entry;
                    nextSegment = segment;
                }
            });
        });
        if (current && next && current.id === next.id) {
            next = null;
            nextSegment = null;
        }
        if (current) {
            list.some(function (entry) {
                if (entry.id === current.id) return false;
                const segment = entrySegments(entry).find(function (item) { return item.start > date; });
                if (!segment) return false;
                if (!nextSegment || segment.start < nextSegment.start) {
                    next = entry;
                    nextSegment = segment;
                }
                return false;
            });
        }
        const focus = current || next || (list.length ? list[list.length - 1] : null);
        const focusSegments = focus ? entrySegments(focus) : [];
        return {
            today: date,
            current: current,
            next: next,
            focus: focus,
            focusSegment: currentSegment || nextSegment || (focusSegments.length ? focusSegments[focusSegments.length - 1] : null)
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

    function formatEntryRange(entry) {
        const segments = entrySegments(entry);
        if (!segments.length) return '';
        return segments.map(function (segment) { return formatRange(segment.start, segment.end); }).join(' и ');
    }

    function monthKey(entry) {
        return String(entry && entry.start || '').slice(0, 7);
    }

    function entryMonthKeys(entry) {
        const keys = [];
        const seen = new Set();
        entrySegments(entry).forEach(function (segment) {
            let cursor = isoToUtc(segment.start.slice(0, 7) + '-01');
            const last = segment.end.slice(0, 7);
            while (cursor) {
                const key = dateToIso(cursor).slice(0, 7);
                if (!seen.has(key)) {
                    seen.add(key);
                    keys.push(key);
                }
                if (key >= last) break;
                cursor.setUTCMonth(cursor.getUTCMonth() + 1);
            }
        });
        return keys.sort();
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
            const segments = entrySegments(entry);
            return {
                index: index,
                id: String(entry.id || ''),
                start: segments.length ? segments[0].start : String(entry.start || '').trim(),
                end: segments.length ? segments[segments.length - 1].end : String(entry.end || '').trim(),
                groupId: safeConfigId(entry.groupId, ''),
                people: normalizePeople(entry.people),
                note: String(entry.note || '').trim(),
                segments: segments
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
            if (!entry.segments.length) {
                return { valid: false, index: entry.index, field: 'date', message: 'Добавьте хотя бы один корректный отрезок дежурства.' };
            }
            if (entry.segments.length > 3) {
                return { valid: false, index: entry.index, field: 'date', message: 'В одной объединённой смене может быть не больше трёх частей.' };
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
            const segments = entrySegments(entry);
            if (!segments.length) return;
            const id = /^week-\d{4}-\d{2}-\d{2}$/.test(String(entry.id || '')) ? entry.id : 'week-' + segments[0].start;
            const serialized = {
                start: segments[0].start,
                end: segments[segments.length - 1].end,
                people: people,
                note: String(entry.note || '').trim().slice(0, 500)
            };
            const groupId = safeConfigId(entry.groupId, '');
            if (groupId) serialized.groupId = groupId;
            if (segments.length > 1) {
                serialized.segments = {};
                segments.forEach(function (segment, index) {
                    serialized.segments['segment-' + index] = { start: segment.start, end: segment.end };
                });
            }
            output[id] = serialized;
        });
        return output;
    }

    const DEFAULT_SCHEDULE = {
        version: 2,
        className: '10-1',
        academicYear: '2026/2027',
        revision: 0,
        updatedAt: 0,
        updatedBy: '',
        config: configToFirebase(DEFAULT_DUTY_CONFIG),
        entries: entriesToFirebase(generateDutyEntries(DEFAULT_DUTY_CONFIG))
    };

    root.AlmanionDuty = {
        DATA_PATH: DATA_PATH,
        DEFAULT_DUTY_CONFIG: DEFAULT_DUTY_CONFIG,
        DEFAULT_SCHEDULE: DEFAULT_SCHEDULE,
        isIsoDate: isIsoDate,
        addDays: addDays,
        normalizePeople: normalizePeople,
        normalizeEntry: normalizeEntry,
        normalizeDutyConfig: normalizeDutyConfig,
        configToFirebase: configToFirebase,
        generateDutyEntries: generateDutyEntries,
        deriveDutyOverrides: deriveDutyOverrides,
        entrySegments: entrySegments,
        normalizeSchedule: normalizeSchedule,
        scheduleState: scheduleState,
        formatRange: formatRange,
        formatEntryRange: formatEntryRange,
        monthKey: monthKey,
        entryMonthKeys: entryMonthKeys,
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
    let editorConfig = null;
    let editorActiveTab = 'schedule';
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
                groupId: entry.groupId || '',
                people: entry.people.slice(),
                note: entry.note || '',
                segments: entrySegments(entry).map(function (segment) {
                    return { start: segment.start, end: segment.end };
                })
            };
        });
    }

    function copyDutyConfig(value) {
        return normalizeDutyConfig(configToFirebase(value || DEFAULT_DUTY_CONFIG));
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
        const startDate = isoToUtc(state.focusSegment ? state.focusSegment.start : state.focus.start);
        dateBox.querySelector('.duty-focus-day').textContent = String(startDate.getUTCDate());
        dateBox.querySelector('.duty-focus-month').textContent = MONTHS_GENITIVE[startDate.getUTCMonth()];
        label.textContent = state.current ? 'Сейчас дежурят' : (state.next ? 'Следующее дежурство' : 'Последнее дежурство в расписании');
        title.textContent = state.focus.people.join(' + ');
        range.textContent = formatEntryRange(state.focus);
        share.hidden = false;
    }

    function renderMonthFilters() {
        const rootElement = byId('dutyMonthFilters');
        const keys = Array.from(new Set(schedule.entries.flatMap(entryMonthKeys))).sort();
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
        const filtered = schedule.entries.filter(function (entry) {
            const monthMatches = selectedMonth === 'all' || entryMonthKeys(entry).includes(selectedMonth);
            const queryMatches = !query || entry.people.concat(entry.note || '').join(' ').toLocaleLowerCase('ru-RU').includes(query);
            return monthMatches && queryMatches;
        });
        rootElement.replaceChildren();
        empty.hidden = filtered.length > 0;
        if (!filtered.length) return;
        const state = scheduleState(schedule.entries);
        const groups = new Map();
        filtered.forEach(function (entry) {
            const key = selectedMonth === 'all' ? monthKey(entry) : selectedMonth;
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

    function syncEditorOverrides() {
        if (!editorConfig) return;
        editorConfig.overrides = deriveDutyOverrides(editorConfig, editorEntries);
    }

    function saveDraft() {
        if (!editorOpen || !account) return;
        syncEditorOverrides();
        const draft = {
            version: 2,
            baseRevision: editorBaseRevision,
            savedAt: Date.now(),
            config: configToFirebase(editorConfig),
            entries: editorEntries
        };
        safeWrite(draftKey(), JSON.stringify(draft));
        setDraftState('Черновик сохранён на устройстве', true);
    }

    function setEditorScheduleStatus(text) {
        const status = byId('dutyEditorScheduleStatus');
        if (status) status.textContent = text || '';
    }

    function updateEditorSummary() {
        const summary = byId('dutyEditorScheduleSummary');
        if (!summary) return;
        if (!editorConfig) {
            summary.hidden = true;
            summary.textContent = '';
            return;
        }
        const teamCount = editorConfig.cycle.length;
        summary.textContent = `${editorEntries.length} дежурств · ${teamCount} ${teamCount === 1 ? 'команда' : (teamCount < 5 ? 'команды' : 'команд')}`;
        summary.hidden = false;
    }

    function showEditorError(message, rowIndex, field) {
        const error = byId('dutyEditorError');
        error.textContent = message;
        error.hidden = !message;
        byId('dutyEditorOverlay').querySelectorAll('[aria-invalid="true"]').forEach(function (input) {
            input.removeAttribute('aria-invalid');
        });
        if (Number.isInteger(rowIndex)) {
            const row = byId('dutyEditorList').children[rowIndex];
            if (row) {
                const target = field === 'people'
                    ? row.querySelector('[data-field="people"]')
                    : (field === 'note'
                        ? row.querySelector('[data-field="note"]')
                        : row.querySelector('[data-field="start"], [data-segment-field="start"]'));
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
            } else {
                entry[field] = input.value;
                if (field === 'start' || field === 'end') {
                    entry.segments = isIsoDate(entry.start) && isIsoDate(entry.end) && entry.start <= entry.end
                        ? [{ start: entry.start, end: entry.end }]
                        : [];
                }
            }
            scheduleDraftSave();
        });
        label.append(caption, input);
        return label;
    }

    function makeSegmentEditor(entry, rowIndex) {
        const rootElement = document.createElement('fieldset');
        rootElement.className = 'duty-editor-segment-editor';
        const legend = document.createElement('legend');
        legend.textContent = 'Части объединённой смены';
        rootElement.appendChild(legend);
        entrySegments(entry).forEach(function (segment, segmentIndex) {
            const segmentRow = document.createElement('div');
            segmentRow.className = 'duty-editor-segment-row';
            const number = document.createElement('span');
            number.className = 'duty-editor-segment-number';
            number.textContent = String(segmentIndex + 1);
            const makeDate = function (captionText, field) {
                const label = document.createElement('label');
                label.className = 'duty-editor-field';
                const caption = document.createElement('span');
                caption.textContent = captionText;
                const input = document.createElement('input');
                input.type = 'date';
                input.value = segment[field];
                input.dataset.segmentField = field;
                input.autocomplete = 'off';
                input.addEventListener('change', function () {
                    const currentEntry = editorEntries[rowIndex];
                    const currentSegments = currentEntry ? entrySegments(currentEntry) : [];
                    if (!currentEntry || !currentSegments[segmentIndex]) return;
                    const candidate = currentSegments.map(function (item) { return { start: item.start, end: item.end }; });
                    candidate[segmentIndex][field] = input.value;
                    const normalized = normalizeSegments(candidate);
                    if (normalized.length !== candidate.length) {
                        showEditorError('Части смены должны идти по порядку, не пересекаться и содержать корректные даты.');
                        input.setAttribute('aria-invalid', 'true');
                        input.focus();
                        return;
                    }
                    currentEntry.segments = normalized;
                    currentEntry.start = normalized[0].start;
                    currentEntry.end = normalized[normalized.length - 1].end;
                    showEditorError('');
                    scheduleDraftSave();
                });
                label.append(caption, input);
                return label;
            };
            segmentRow.append(number, makeDate('Начало', 'start'), makeDate('Окончание', 'end'));
            rootElement.appendChild(segmentRow);
        });
        return rootElement;
    }

    function renderEditor() {
        const list = byId('dutyEditorList');
        list.replaceChildren();
        editorEntries.forEach(function (entry, index) {
            const row = document.createElement('div');
            row.className = 'duty-editor-row';
            row.dataset.index = String(index);
            row.dataset.weekNumber = String(index + 1);
            const segments = entrySegments(entry);
            const peopleField = makeEditorField('Дежурные · через запятую', 'text', entry.people.join(', '), 'people', index, 'Имя, имя');
            peopleField.classList.add('duty-editor-people-field');
            const noteField = makeEditorField('Комментарий · необязательно', 'text', entry.note || '', 'note', index, 'Например, замена');
            noteField.classList.add('duty-editor-note-field');
            if (segments.length > 1) {
                row.classList.add('has-segments');
                row.append(makeSegmentEditor(entry, index), peopleField, noteField);
            } else {
                row.append(
                    makeEditorField('Начало', 'date', entry.start, 'start', index),
                    makeEditorField('Окончание', 'date', entry.end, 'end', index),
                    peopleField,
                    noteField
                );
            }
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'duty-remove-row';
            remove.setAttribute('aria-label', 'Удалить неделю ' + formatEntryRange(entry));
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
        updateEditorSummary();
    }

    function makeCompactButton(text, label, handler) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'duty-compact-action';
        button.textContent = text;
        button.setAttribute('aria-label', label);
        button.addEventListener('click', handler);
        return button;
    }

    function makeStructuredField(labelText, type, value, onChange, className) {
        const label = document.createElement('label');
        label.className = className || 'duty-calendar-field';
        const caption = document.createElement('span');
        caption.textContent = labelText;
        const input = document.createElement('input');
        input.type = type;
        input.value = value || '';
        input.autocomplete = 'off';
        input.addEventListener('change', function () { onChange(input.value, input); });
        label.append(caption, input);
        return label;
    }

    function rejectStructuredInput(input, message) {
        showEditorError(message);
        input.setAttribute('aria-invalid', 'true');
        input.focus();
    }

    function pairedMergeId(vacationId) {
        return 'merge-' + String(vacationId || '').replace(/^vacation-/, '');
    }

    function syncPairedTurnMerge(config, vacation) {
        const merge = config.calendar.turnMerges.find(function (item) {
            return item.id === pairedMergeId(vacation.id);
        });
        if (!merge) return;
        merge.start = mondayFor(vacation.start);
        merge.end = addDays(mondayFor(vacation.end), 5);
        merge.label = vacation.label;
    }

    function commitEditorConfigChange(change, announcement) {
        if (!editorConfig) return false;
        syncEditorOverrides();
        const candidate = copyDutyConfig(editorConfig);
        change(candidate);
        candidate.cycle.forEach(function (group, index) { group.order = index + 1; });
        const normalized = normalizeDutyConfig(candidate);
        if (!normalized) {
            showEditorError('Проверьте цикл и границы учебного года. Нужны от 2 до 40 непустых команд.');
            return false;
        }
        const generatedEntries = generateDutyEntries(normalized);
        const generatedValidation = validateEntries(generatedEntries);
        if (!generatedValidation.valid) {
            showEditorError(generatedValidation.message);
            return false;
        }
        editorConfig = normalized;
        editorEntries = copyEntries(generatedEntries);
        removedEntry = null;
        const undo = byId('dutyUndoButton');
        if (undo) undo.hidden = true;
        renderEditor();
        renderCycleEditor();
        renderCalendarEditor();
        showEditorError('');
        setEditorScheduleStatus(announcement || 'График пересчитан.');
        scheduleDraftSave();
        return true;
    }

    function renderCycleEditor() {
        const list = byId('dutyCycleList');
        if (!list || !editorConfig) return;
        const addGroup = byId('dutyCycleAddGroupButton');
        if (addGroup) {
            addGroup.disabled = editorConfig.cycle.length >= 40;
            addGroup.title = addGroup.disabled ? 'В цикле уже 40 команд' : '';
        }
        list.replaceChildren();
        editorConfig.cycle.forEach(function (group, index) {
            const row = document.createElement('div');
            row.className = 'duty-cycle-row';
            row.dataset.groupId = group.id;
            const order = document.createElement('span');
            order.className = 'duty-cycle-order';
            order.textContent = String(index + 1);
            const people = document.createElement('div');
            people.className = 'duty-cycle-people';
            people.appendChild(makeStructuredField('Участники · через запятую', 'text', group.people.join(', '), function (value, input) {
                const names = normalizePeople(value.split(/[,\n]/));
                if (!names.length) {
                    input.setAttribute('aria-invalid', 'true');
                    showEditorError('В команде должен остаться хотя бы один человек.');
                    return;
                }
                commitEditorConfigChange(function (config) {
                    const target = config.cycle.find(function (item) { return item.id === group.id; });
                    if (target) target.people = names;
                }, 'Состав команды изменён, график пересчитан.');
            }, 'duty-cycle-person'));
            const actions = document.createElement('div');
            actions.className = 'duty-cycle-row-actions';
            const up = makeCompactButton('↑', 'Поднять команду ' + (index + 1), function () {
                if (index === 0) return;
                commitEditorConfigChange(function (config) {
                    const current = config.cycle[index];
                    config.cycle[index] = config.cycle[index - 1];
                    config.cycle[index - 1] = current;
                }, 'Порядок цикла изменён, график пересчитан.');
            });
            up.disabled = index === 0;
            const down = makeCompactButton('↓', 'Опустить команду ' + (index + 1), function () {
                if (index >= editorConfig.cycle.length - 1) return;
                commitEditorConfigChange(function (config) {
                    const current = config.cycle[index];
                    config.cycle[index] = config.cycle[index + 1];
                    config.cycle[index + 1] = current;
                }, 'Порядок цикла изменён, график пересчитан.');
            });
            down.disabled = index === editorConfig.cycle.length - 1;
            const remove = makeCompactButton('×', 'Удалить команду ' + (index + 1), function () {
                if (editorConfig.cycle.length <= 2) {
                    showEditorError('В цикле должны остаться хотя бы две команды.');
                    return;
                }
                commitEditorConfigChange(function (config) {
                    config.cycle = config.cycle.filter(function (item) { return item.id !== group.id; });
                }, 'Команда удалена, график пересчитан.');
            });
            remove.disabled = editorConfig.cycle.length <= 2;
            actions.append(up, down, remove);
            row.append(order, people, actions);
            list.appendChild(row);
        });
    }

    function nextConfigId(items, prefix) {
        const used = new Set(items.map(function (item) { return item.id; }));
        let number = 1;
        let id = prefix + '-' + String(number).padStart(2, '0');
        while (used.has(id)) {
            number += 1;
            id = prefix + '-' + String(number).padStart(2, '0');
        }
        return id;
    }

    function renderVacationRows() {
        const list = byId('dutyCalendarPeriods');
        if (!list || !editorConfig) return;
        list.replaceChildren();
        editorConfig.calendar.vacations.forEach(function (vacation) {
            const row = document.createElement('div');
            row.className = 'duty-calendar-row';
            const fields = document.createElement('div');
            fields.className = 'duty-calendar-fields';
            fields.append(
                makeStructuredField('Начало', 'date', vacation.start, function (value, input) {
                    if (!isIsoDate(value) || value > vacation.end) {
                        rejectStructuredInput(input, 'Начало каникул должно быть не позже окончания.');
                        return;
                    }
                    commitEditorConfigChange(function (config) {
                        const target = config.calendar.vacations.find(function (item) { return item.id === vacation.id; });
                        if (target) {
                            target.start = value;
                            syncPairedTurnMerge(config, target);
                        }
                    }, 'Каникулы изменены, график пересчитан.');
                }),
                makeStructuredField('Окончание', 'date', vacation.end, function (value, input) {
                    if (!isIsoDate(value) || value < vacation.start) {
                        rejectStructuredInput(input, 'Окончание каникул должно быть не раньше начала.');
                        return;
                    }
                    commitEditorConfigChange(function (config) {
                        const target = config.calendar.vacations.find(function (item) { return item.id === vacation.id; });
                        if (target) {
                            target.end = value;
                            syncPairedTurnMerge(config, target);
                        }
                    }, 'Каникулы изменены, график пересчитан.');
                }),
                makeStructuredField('Название', 'text', vacation.label, function (value) {
                    commitEditorConfigChange(function (config) {
                        const target = config.calendar.vacations.find(function (item) { return item.id === vacation.id; });
                        if (target) {
                            target.label = String(value || '').trim().slice(0, 120);
                            syncPairedTurnMerge(config, target);
                        }
                    }, 'Название каникул изменено.');
                })
            );
            const actions = document.createElement('div');
            actions.className = 'duty-calendar-row-actions';
            actions.appendChild(makeCompactButton('×', 'Удалить период «' + (vacation.label || 'Каникулы') + '»', function () {
                commitEditorConfigChange(function (config) {
                    config.calendar.vacations = config.calendar.vacations.filter(function (item) { return item.id !== vacation.id; });
                    config.calendar.turnMerges = config.calendar.turnMerges.filter(function (item) {
                        return item.id !== pairedMergeId(vacation.id);
                    });
                }, 'Период каникул удалён, график пересчитан.');
            }));
            row.append(fields, actions);
            list.appendChild(row);
        });
    }

    function renderDayOffRows() {
        const list = byId('dutyCalendarDays');
        if (!list || !editorConfig) return;
        list.replaceChildren();
        editorConfig.calendar.daysOff.forEach(function (day) {
            const row = document.createElement('div');
            row.className = 'duty-calendar-row';
            const fields = document.createElement('div');
            fields.className = 'duty-calendar-fields';
            fields.append(
                makeStructuredField('Дата', 'date', day.date, function (value, input) {
                    if (!isIsoDate(value)) {
                        rejectStructuredInput(input, 'Укажите корректную дату выходного.');
                        return;
                    }
                    commitEditorConfigChange(function (config) {
                        const target = config.calendar.daysOff.find(function (item) { return item.id === day.id; });
                        if (target) target.date = value;
                    }, 'Выходной изменён, график пересчитан.');
                }),
                makeStructuredField('Причина', 'text', day.label, function (value) {
                    commitEditorConfigChange(function (config) {
                        const target = config.calendar.daysOff.find(function (item) { return item.id === day.id; });
                        if (target) target.label = String(value || '').trim().slice(0, 120);
                    }, 'Подпись выходного изменена.');
                })
            );
            const actions = document.createElement('div');
            actions.className = 'duty-calendar-row-actions';
            actions.appendChild(makeCompactButton('×', 'Удалить выходной ' + day.date, function () {
                commitEditorConfigChange(function (config) {
                    config.calendar.daysOff = config.calendar.daysOff.filter(function (item) { return item.id !== day.id; });
                }, 'Выходной удалён, график пересчитан.');
            }));
            row.append(fields, actions);
            list.appendChild(row);
        });
    }

    function renderMergeRows() {
        const list = byId('dutyCalendarMerges');
        if (!list || !editorConfig) return;
        list.replaceChildren();
        editorConfig.calendar.turnMerges.forEach(function (merge) {
            const row = document.createElement('div');
            row.className = 'duty-calendar-row';
            const fields = document.createElement('div');
            fields.className = 'duty-calendar-fields';
            fields.append(
                makeStructuredField('С первой недели', 'date', merge.start, function (value, input) {
                    if (!isIsoDate(value) || value > merge.end) {
                        rejectStructuredInput(input, 'Начало объединения должно быть не позже окончания.');
                        return;
                    }
                    commitEditorConfigChange(function (config) {
                        const target = config.calendar.turnMerges.find(function (item) { return item.id === merge.id; });
                        if (target) target.start = value;
                    }, 'Объединение изменено, график пересчитан.');
                }),
                makeStructuredField('По последнюю неделю', 'date', merge.end, function (value, input) {
                    if (!isIsoDate(value) || value < merge.start) {
                        rejectStructuredInput(input, 'Окончание объединения должно быть не раньше начала.');
                        return;
                    }
                    commitEditorConfigChange(function (config) {
                        const target = config.calendar.turnMerges.find(function (item) { return item.id === merge.id; });
                        if (target) target.end = value;
                    }, 'Объединение изменено, график пересчитан.');
                }),
                makeStructuredField('Название', 'text', merge.label, function (value) {
                    commitEditorConfigChange(function (config) {
                        const target = config.calendar.turnMerges.find(function (item) { return item.id === merge.id; });
                        if (target) target.label = String(value || '').trim().slice(0, 120);
                    }, 'Название объединения изменено.');
                })
            );
            const actions = document.createElement('div');
            actions.className = 'duty-calendar-row-actions';
            actions.appendChild(makeCompactButton('×', 'Удалить объединение «' + (merge.label || 'Без названия') + '»', function () {
                commitEditorConfigChange(function (config) {
                    config.calendar.turnMerges = config.calendar.turnMerges.filter(function (item) { return item.id !== merge.id; });
                }, 'Объединение удалено, график пересчитан.');
            }));
            row.append(fields, actions);
            list.appendChild(row);
        });
    }

    function renderCalendarEditor() {
        if (!editorConfig) return;
        const start = byId('dutyCalendarSchoolStart');
        const end = byId('dutyCalendarSchoolEnd');
        if (start) start.value = editorConfig.calendar.schoolStart;
        if (end) end.value = editorConfig.calendar.schoolEnd;
        renderVacationRows();
        renderMergeRows();
        renderDayOffRows();
    }

    function renderStructuredEditor() {
        renderCycleEditor();
        renderCalendarEditor();
        updateEditorSummary();
    }

    function activateEditorTab(name, focusTab) {
        const tabsRoot = byId('dutyEditorTabs');
        if (!tabsRoot) return;
        const tabs = Array.from(tabsRoot.querySelectorAll('[data-duty-tab]'));
        const panels = Array.from(byId('dutyEditorContent').querySelectorAll('[data-duty-panel]'));
        if (!tabs.some(function (tab) { return tab.dataset.dutyTab === name; })) name = 'schedule';
        editorActiveTab = name;
        tabs.forEach(function (tab) {
            const active = tab.dataset.dutyTab === name;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
            tab.tabIndex = active ? 0 : -1;
            if (active && focusTab) tab.focus();
        });
        panels.forEach(function (panel) {
            const active = panel.dataset.dutyPanel === name;
            panel.hidden = !active;
            panel.classList.toggle('is-active', active);
        });
        byId('dutyEditorContent').scrollTop = 0;
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
        const compatibleDraft = storedDraft
            && storedDraft.version === 2
            && normalizeDutyConfig(storedDraft.config)
            && Array.isArray(storedDraft.entries)
            && storedDraft.entries.length;
        if (compatibleDraft) {
            editorConfig = copyDutyConfig(storedDraft.config || schedule.config || DEFAULT_DUTY_CONFIG);
            editorEntries = copyEntries(storedDraft.entries.map(function (entry, index) {
                return normalizeEntry({
                    start: entry.start,
                    end: entry.end,
                    groupId: entry.groupId,
                    people: entry.people,
                    note: entry.note,
                    segments: entry.segments
                }, entry.id || `week-${entry.start || index}`);
            }).filter(Boolean));
            editorBaseRevision = Number.isInteger(storedDraft.baseRevision) ? storedDraft.baseRevision : schedule.revision;
            editorDirty = true;
            setDraftState('Восстановлен черновик с этого устройства', true);
            if (schedule.revision > editorBaseRevision) showConflict('Ваш черновик сохранён, но облачное расписание уже обновилось.');
            else hideConflict();
        } else {
            if (storedDraft) safeRemove(draftKey());
            editorConfig = copyDutyConfig(schedule.config || DEFAULT_DUTY_CONFIG);
            editorEntries = schedule.config
                ? copyEntries(schedule.entries)
                : copyEntries(generateDutyEntries(editorConfig));
            editorDirty = false;
            setDraftState(storedDraft ? 'Старый черновик удалён · изменений нет' : 'Изменений нет', false);
            hideConflict();
        }
        removedEntry = null;
        conflictOverride = false;
        byId('dutyUndoButton').hidden = true;
        showEditorError('');
        renderEditor();
        renderStructuredEditor();
        const overlay = byId('dutyEditorOverlay');
        overlay.hidden = false;
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('duty-editor-open');
        editorOpen = true;
        activateEditorTab('schedule', false);
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

    function undoRemove() {
        if (!removedEntry) return;
        editorEntries.splice(Math.min(removedEntry.index, editorEntries.length), 0, removedEntry.entry);
        removedEntry = null;
        byId('dutyUndoButton').hidden = true;
        renderEditor();
        scheduleDraftSave();
    }

    function useCloudVersion() {
        editorConfig = copyDutyConfig(schedule.config || DEFAULT_DUTY_CONFIG);
        editorEntries = schedule.config
            ? copyEntries(schedule.entries)
            : copyEntries(generateDutyEntries(editorConfig));
        editorBaseRevision = schedule.revision;
        editorDirty = false;
        conflictOverride = false;
        safeRemove(draftKey());
        hideConflict();
        renderEditor();
        renderStructuredEditor();
        activateEditorTab(editorActiveTab, false);
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
        syncEditorOverrides();
        const publishConfig = normalizeDutyConfig(editorConfig);
        if (!publishConfig) {
            showEditorError('Не удалось собрать график: проверьте цикл, начало и окончание учебного года.');
            return;
        }
        const publishEntries = generateDutyEntries(publishConfig);
        const generatedValidation = validateEntries(publishEntries);
        if (!generatedValidation.valid) {
            showEditorError(generatedValidation.message, generatedValidation.index, generatedValidation.field);
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
            const nextRevision = cloudRevision + 1;
            const payload = {
                version: 2,
                className: '10-1',
                academicYear: schedule.academicYear || '2026/2027',
                revision: nextRevision,
                updatedAt: firebase.database.ServerValue.TIMESTAMP,
                updatedBy: account.uid,
                config: configToFirebase(publishConfig),
                entries: entriesToFirebase(publishEntries)
            };
            await database.ref(DATA_PATH).set(payload);
            editorConfig = copyDutyConfig(publishConfig);
            editorEntries = copyEntries(publishEntries);
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

    function bindEditorTabs() {
        const tabsRoot = byId('dutyEditorTabs');
        if (!tabsRoot) return;
        const tabs = Array.from(tabsRoot.querySelectorAll('[data-duty-tab]'));
        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () { activateEditorTab(tab.dataset.dutyTab, false); });
        });
        tabsRoot.addEventListener('keydown', function (event) {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
            event.preventDefault();
            const current = Math.max(0, tabs.findIndex(function (tab) { return tab.dataset.dutyTab === editorActiveTab; }));
            let next = current;
            if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
            if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = tabs.length - 1;
            activateEditorTab(tabs[next].dataset.dutyTab, true);
        });
    }

    function bindStructuredEditor() {
        bindEditorTabs();
        const addGroup = byId('dutyCycleAddGroupButton');
        if (addGroup) {
            addGroup.addEventListener('click', function () {
                if (!editorConfig || editorConfig.cycle.length >= 40) {
                    showEditorError('В цикле может быть не больше 40 команд.');
                    return;
                }
                commitEditorConfigChange(function (config) {
                    config.cycle.push({
                        id: nextConfigId(config.cycle, 'group'),
                        order: config.cycle.length + 1,
                        people: ['Новый дежурный', 'Второй дежурный']
                    });
                }, 'Команда добавлена, график пересчитан.');
            });
        }

        const schoolStart = byId('dutyCalendarSchoolStart');
        if (schoolStart) schoolStart.addEventListener('change', function () {
            const value = schoolStart.value;
            if (!isIsoDate(value) || (editorConfig && value > editorConfig.calendar.schoolEnd)) {
                rejectStructuredInput(schoolStart, 'Начало учебного года должно быть не позже окончания.');
                return;
            }
            commitEditorConfigChange(function (config) { config.calendar.schoolStart = value; }, 'Начало учебного года изменено, график пересчитан.');
        });
        const schoolEnd = byId('dutyCalendarSchoolEnd');
        if (schoolEnd) schoolEnd.addEventListener('change', function () {
            const value = schoolEnd.value;
            if (!isIsoDate(value) || (editorConfig && value < editorConfig.calendar.schoolStart)) {
                rejectStructuredInput(schoolEnd, 'Окончание учебного года должно быть не раньше начала.');
                return;
            }
            commitEditorConfigChange(function (config) { config.calendar.schoolEnd = value; }, 'Окончание учебного года изменено, график пересчитан.');
        });

        const addPeriod = byId('dutyCalendarAddPeriodButton');
        if (addPeriod) addPeriod.addEventListener('click', function () {
            if (!editorConfig) return;
            commitEditorConfigChange(function (config) {
                config.calendar.vacations.push({
                    id: nextConfigId(config.calendar.vacations, 'vacation'),
                    start: config.calendar.schoolEnd,
                    end: config.calendar.schoolEnd,
                    label: 'Новые каникулы'
                });
            }, 'Период добавлен, график пересчитан.');
        });

        const addDay = byId('dutyCalendarAddDayButton');
        if (addDay) addDay.addEventListener('click', function () {
            if (!editorConfig) return;
            commitEditorConfigChange(function (config) {
                config.calendar.daysOff.push({
                    id: nextConfigId(config.calendar.daysOff, 'day-off'),
                    date: config.calendar.schoolEnd,
                    label: 'Новый выходной'
                });
            }, 'Выходной добавлен, график пересчитан.');
        });

        const addMerge = byId('dutyCalendarAddMergeButton');
        if (addMerge) addMerge.addEventListener('click', function () {
            if (!editorConfig) return;
            commitEditorConfigChange(function (config) {
                config.calendar.turnMerges.push({
                    id: nextConfigId(config.calendar.turnMerges, 'merge'),
                    start: config.calendar.schoolStart,
                    end: config.calendar.schoolStart,
                    label: 'Новое объединение'
                });
            }, 'Объединение добавлено, настройте его границы.');
        });
    }

    function bindEvents() {
        bindStructuredEditor();
        byId('dutySearchInput').addEventListener('input', function (event) {
            searchQuery = event.target.value || '';
            renderGroups();
        });
        byId('dutyShareButton').addEventListener('click', shareFocus);
        byId('dutyEditButton').addEventListener('click', openEditor);
        byId('dutyEditorClose').addEventListener('click', closeEditor);
        byId('dutyEditorCancel').addEventListener('click', closeEditor);
        byId('dutyUndoButton').addEventListener('click', undoRemove);
        byId('dutyUseCloudButton').addEventListener('click', useCloudVersion);
        byId('dutyKeepDraftButton').addEventListener('click', keepDraftVersion);
        byId('dutyEditorSave').addEventListener('click', saveEditor);
        byId('dutyEditorOverlay').addEventListener('click', function (event) {
            if (event.target === event.currentTarget) closeEditor();
        });
        document.addEventListener('keydown', function (event) {
            if (!editorOpen) return;
            if (event.key === 'Escape') {
                closeEditor();
                return;
            }
            if (event.key !== 'Tab') return;
            const editor = byId('dutyEditorOverlay');
            const focusable = Array.from(editor.querySelectorAll(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
            )).filter(function (element) {
                return !element.hidden && !element.closest('[hidden]') && element.getAttribute('aria-hidden') !== 'true';
            });
            if (!focusable.length) {
                event.preventDefault();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && (document.activeElement === first || !editor.contains(document.activeElement))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
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
