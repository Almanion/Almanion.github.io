(function (root) {
    'use strict';

    const {
        DATA_PATH, DEFAULT_DUTY_CONFIG,
        isIsoDate, addDays, mondayFor, normalizePeople, normalizeSegments,
        normalizeEntry, entrySegments, normalizeDutyConfig, generateDutyEntries,
        deriveDutyOverrides, formatEntryRange, validateEntries, configToFirebase, entriesToFirebase
    } = root.AlmanionDuty;

    function attach({ database, getSchedule, byId, storage, toast }) {
        const DRAFT_PREFIX = 'almanion:class-duty:grade10_1:draft:v2:';
        const OWNER_UID = '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';

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
            storage.write(draftKey(), draft);
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
                            input.value = currentSegments[segmentIndex][field];
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
            const schedule = getSchedule();
            editorBaseRevision = schedule.revision;
            const storedDraft = storage.read(draftKey());
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
                if (storedDraft) storage.remove(draftKey());
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
            const schedule = getSchedule();
            editorConfig = copyDutyConfig(schedule.config || DEFAULT_DUTY_CONFIG);
            editorEntries = schedule.config
                ? copyEntries(schedule.entries)
                : copyEntries(generateDutyEntries(editorConfig));
            editorBaseRevision = schedule.revision;
            editorDirty = false;
            conflictOverride = false;
            storage.remove(draftKey());
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
                    academicYear: getSchedule().academicYear || '2026/2027',
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
                storage.remove(draftKey());
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
            const isOwner = account.uid === OWNER_UID;
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

        function onRevisionChanged(revision, previousRevision) {
            if (editorOpen && revision > editorBaseRevision && revision !== previousRevision) {
                showConflict('Пока вы редактировали, расписание обновил другой человек.');
            }
        }

        bindEvents();
        updateEditorAccess(root.AlmanionAccount?.getUser?.());
        return { onRevisionChanged };
    }

    root.AlmanionDutyEditor = { attach };
}(window));
