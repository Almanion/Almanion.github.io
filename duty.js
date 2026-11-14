(function (root) {
    'use strict';

    const DATA_PATH = 'classDuty/grade10_1';
    const CACHE_KEY = 'almanion:class-duty:grade10_1:cache:v2';

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
        return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date || new Date());
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

    function formatDayMonth(iso) {
        const date = isoToUtc(iso);
        return { day: String(date.getUTCDate()), month: MONTHS_GENITIVE[date.getUTCMonth()] };
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

    const schedule = {
        DATA_PATH, CACHE_KEY, DEFAULT_DUTY_CONFIG, DEFAULT_SCHEDULE,
        isIsoDate, todayIso, addDays, mondayFor, normalizePeople, normalizeSegments,
        normalizeEntry, entrySegments, normalizeDutyConfig, normalizeSchedule,
        generateDutyEntries, deriveDutyOverrides, scheduleState, nextWeekAfter,
        monthKey, entryMonthKeys, monthLabel, formatDayMonth, formatRange, formatEntryRange,
        validateEntries, configToFirebase, entriesToFirebase
    };

    root.AlmanionDuty = schedule;
    if (typeof module === 'object' && module.exports) module.exports = schedule;
}(typeof window !== 'undefined' ? window : globalThis));
