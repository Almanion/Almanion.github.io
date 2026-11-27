/* Client-only handouts from the authenticated task data. */
(function (root) {
    'use strict';
    let overlay, lastFocus, previewUrl, pdfModule, stylesReady, draft, busy = false, revision = 0;
    const taskPageSize = 40;
    const background = new Map();
    const $ = id => document.getElementById(id);
    const sourceTasks = () => authToken ? getTasksForCurrentGrade().filter(task => Number.isInteger(task.number)) : [];
    const sourceMode = () => overlay.querySelector('[name="mcPrintSource"]:checked').value;
    const byTaskNumber = (a, b) => a.number - b.number;
    const taskNumber = task => String(task.numberText ?? task.number);

    function loadStyles() {
        if (!stylesReady) stylesReady = Promise.all(['styles/print.css?v=20261006-1', 'styles/matcenter-print.css?v=20261127-task-picker'].map(href => new Promise((resolve, reject) => {
            const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href;
            link.onload = resolve; link.onerror = () => { link.remove(); reject(new Error('Печатное оформление не загрузилось.')); };
            document.head.append(link);
        }))).catch(error => { stylesReady = null; throw error; });
        return stylesReady;
    }

    function loadPdf() {
        if (root.AlmanionPdfDownload?.generateHandouts) return Promise.resolve();
        if (!pdfModule) pdfModule = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'pdf-download.js?v=20261015-sum-limits';
            script.onload = resolve;
            script.onerror = () => { script.remove(); pdfModule = null; reject(new Error('Не удалось загрузить PDF-модуль. Попробуйте снова.')); };
            document.head.append(script);
        });
        return pdfModule;
    }

    function clearPreview() {
        $('mcPrintFrame').src = 'about:blank';
        $('mcPrintPreview').hidden = true;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = null;
        overlay.querySelectorAll('.print-export-dialog-header,.print-export-dialog-body,.print-export-dialog-footer').forEach(node => { node.inert = false; });
    }

    function selectionChanged() {
        $('mcPrintStatus').textContent = '';
        update();
    }

    function setSeriesIncluded(series, checked) {
        series.included.clear();
        if (checked) series.tasks.forEach(task => series.included.add(task));
    }

    function createTaskOption(task, included, showCondition = false) {
        const label = document.createElement('label');
        label.className = showCondition ? 'mc-print-result' : 'mc-print-number';
        const input = document.createElement('input');
        const number = document.createElement('span');
        input.type = 'checkbox';
        number.className = 'mc-print-task-id';
        number.textContent = taskNumber(task);
        const seriesTitle = showCondition ? task.series?.title : '';
        input.setAttribute('aria-label', `Задача ${number.textContent}${seriesTitle ? ' · ' + seriesTitle : ''}`);
        input.checked = included.has(task);
        label.append(input, number);
        if (showCondition) {
            const detail = document.createElement('span');
            detail.className = 'mc-print-result-detail';
            const condition = document.createElement('span');
            condition.textContent = task.description;
            detail.append(condition);
            if (seriesTitle) {
                const series = document.createElement('small');
                series.textContent = seriesTitle;
                detail.append(series);
            }
            label.append(detail);
        }
        input.addEventListener('change', () => {
            if (input.checked) included.add(task);
            else included.delete(task);
            if (showCondition && !input.checked && $('mcPrintOnlyPicked').checked) {
                const index = [...label.parentElement.children].indexOf(label);
                renderTaskResults(index);
            }
            selectionChanged();
        });
        return { label, input, task };
    }

    function createSeriesOption(series, index) {
        const item = document.createElement('div');
        item.className = 'mc-print-series-item';
        item.innerHTML = `<div class="mc-print-series-row">
            <label class="mc-print-series-master"><input type="checkbox"><span><strong></strong><small></small></span></label>
            <button type="button" class="mc-print-series-expand" aria-expanded="false">Состав
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
            </button>
        </div><div class="mc-print-numbers" role="group" hidden></div>`;
        const input = item.querySelector('input');
        const name = item.querySelector('strong');
        const detail = item.querySelector('small');
        const toggle = item.querySelector('button');
        const panel = item.querySelector('.mc-print-numbers');
        input.value = series.key;
        input.setAttribute('aria-label', series.title);
        name.textContent = series.title;
        const range = matcenterSeriesRange(series);
        const record = { ...series, input, detail, toggle, panel, range, included: new Set(), options: [] };
        toggle.setAttribute('aria-label', 'Состав — ' + series.title);
        panel.id = 'mcPrintNumbers-' + index;
        panel.setAttribute('aria-label', 'Задачи — ' + series.title);
        toggle.setAttribute('aria-controls', panel.id);
        input.addEventListener('change', () => {
            setSeriesIncluded(record, input.checked);
            selectionChanged();
        });
        toggle.addEventListener('click', () => {
            const expanded = panel.hidden;
            if (draft.expanded) {
                draft.expanded.panel.hidden = true;
                draft.expanded.toggle.setAttribute('aria-expanded', 'false');
            }
            draft.expanded = expanded ? record : null;
            if (!expanded) return;
            if (!record.options.length) {
                record.options = series.tasks.slice().sort(byTaskNumber).map(task => createTaskOption(task, record.included));
                panel.replaceChildren(...record.options.map(option => option.label));
            }
            panel.hidden = false;
            toggle.setAttribute('aria-expanded', 'true');
            update();
            panel.firstElementChild?.scrollIntoView({ block: 'nearest' });
        });
        $('mcPrintSeries').append(item);
        return record;
    }

    function findTasks(tasks, query) {
        if (!query) return tasks;
        const ranges = query.replace(/[№#]\s*/g, '').replace(/\s*[-–—]\s*/g, '-')
            .split(/[\s,;]+/).filter(Boolean).map(token => token.match(/^(\d+)(?:-(\d+))?$/));
        if (!ranges.length || ranges.some(range => !range)) return [];
        const limits = ranges.map(([, first, last]) => [Number(first), Number(last ?? first)]);
        return tasks.filter(task => limits.some(([first, last]) => task.number >= first && task.number <= last));
    }

    function renderTaskResults(focusIndex) {
        const filterPicked = $('mcPrintOnlyPicked').checked;
        const { tasks, picked } = draft.displayedPicker;
        const matching = findTasks(tasks, $('mcPrintTaskSearch').value.trim());
        draft.matches = filterPicked ? matching.filter(task => picked.has(task)) : matching;
        const results = draft.matches.slice(0, draft.limit).map(task => createTaskOption(task, picked, true));
        $('mcPrintTaskList').replaceChildren(...results.map(option => option.label));
        $('mcPrintTaskMore').hidden = draft.matches.length <= draft.limit;
        $('mcPrintTaskEmpty').hidden = draft.matches.length > 0;
        $('mcPrintTaskEmpty').textContent = filterPicked ? 'Нет выбранных задач в этом списке.' : 'Задачи с такими номерами не найдены.';
        if (focusIndex !== undefined) (results[Math.min(focusIndex, results.length - 1)]?.input || $('mcPrintOnlyPicked')).focus();
    }

    function update() {
        const mode = sourceMode();
        const picker = draft.taskPickers[mode];
        const showPicker = !!picker?.tasks.length;
        $('mcPrintSeriesSelection').hidden = mode !== 'series';
        $('mcPrintTaskSelection').hidden = !showPicker;
        $('mcPrintUnsolvedNote').hidden = mode !== 'unsolved' || !showPicker;
        if (showPicker && picker !== draft.displayedPicker) {
            draft.displayedPicker = picker;
            draft.limit = taskPageSize;
            $('mcPrintTaskSearch').value = '';
            $('mcPrintOnlyPicked').checked = false;
            $('mcPrintTaskResults').scrollTop = 0;
            renderTaskResults();
        }
        overlay.querySelectorAll('input').forEach(input => {
            input.disabled = busy || (input.name === 'mcPrintSource' && input.value === 'series' && !draft.series.length);
        });
        let seriesCount = 0;
        let seriesTotal = 0;
        for (const series of draft.series) {
            const count = series.included.size;
            const total = series.tasks.length;
            series.input.checked = count === total;
            series.input.indeterminate = count > 0 && count < total;
            series.detail.textContent = series.input.indeterminate ? `${series.range} · ${count} из ${total}` : series.range;
            series.toggle.disabled = busy;
            for (const option of series.options) option.input.checked = series.included.has(option.task);
            seriesCount += count;
            seriesTotal += total;
        }
        const count = picker ? picker.picked.size : seriesCount;
        $('mcPrintSelectAll').disabled = busy || seriesCount === seriesTotal;
        $('mcPrintClear').disabled = busy || !seriesCount;
        if (showPicker) {
            const hasQuery = Boolean($('mcPrintTaskSearch').value.trim());
            const pickMatches = $('mcPrintPickMatches');
            pickMatches.textContent = hasQuery ? 'Выбрать найденные' : 'Выбрать все';
            pickMatches.hidden = $('mcPrintOnlyPicked').checked || !draft.matches.length || (!hasQuery && mode !== 'unsolved');
            pickMatches.disabled = busy || !draft.matches.some(task => !picker.picked.has(task));
            $('mcPrintClearPicked').disabled = busy || !picker.picked.size;
            $('mcPrintTaskMore').disabled = busy;
        }
        overlay.querySelectorAll('[data-mc-print-action]').forEach(button => { button.disabled = busy || !count; });
        const empty = mode === 'series' ? 'Выберите серии или откройте их состав.'
            : showPicker ? 'Выберите задачи для печати.' : 'В разделе нет неразобранных задач.';
        $('mcPrintCount').textContent = count ? `${count} ${pluralizeTasks(count)}` : empty;
    }

    async function exportHandouts(mode) {
        if (busy || !isOpen() || !authToken) return;
        const source = sourceMode();
        const picker = draft.taskPickers[source];
        const series = draft.series.filter(item => item.included.size);
        const groups = picker
            ? [{ tasks: picker.tasks.filter(task => picker.picked.has(task)), heading: '' }]
            : series.map(item => ({ tasks: item.tasks.filter(task => item.included.has(task)), heading: /^Добавка\s*№/u.test(item.title) ? item.title : '' }));
        if (!groups.length || !groups[0].tasks.length) return;
        const token = ++revision;
        // Copy only the original numbers and statements into the PDF.
        const handouts = groups.map(group => ({ heading: group.heading, tasks: group.tasks.slice().sort(byTaskNumber).map(task => {
            let description = String(task.description ?? '');
            const matches = findUndelimitedMatcenterMath(description);
            for (const match of matches.reverse()) description = description.slice(0, match.start) + '\\(' + match.tex + '\\)' + description.slice(match.end);
            return { number: task.number, numberText: task.numberText, description };
        }) }));
        const titles = { series: series.map(item => item.title).join(', '), tasks: 'Выбранные задачи', unsolved: 'Неразобранные задачи' };
        const title = [getGradeTitle(draft.grade), titles[source]].join(' — ');
        busy = true;
        update();
        $('mcPrintStatus').textContent = 'Готовим печатный лист…';
        try {
            await loadPdf();
            if (token !== revision || !authToken || !isOpen()) return;
            const blob = await root.AlmanionPdfDownload.generateHandouts(handouts, title, { autoPrint: mode === 'print' });
            if (token !== revision || !authToken || !isOpen()) return;
            clearPreview();
            previewUrl = URL.createObjectURL(blob);
            if (mode === 'download') {
                const link = document.createElement('a');
                link.href = previewUrl;
                link.download = title.replace(/[<>:"/\\|?*]/g, '-').slice(0, 180) + '.pdf';
                document.body.append(link); link.click(); link.remove();
            } else {
                $('mcPrintFrame').src = previewUrl;
                $('mcPrintPreview').hidden = false;
                overlay.querySelectorAll('.print-export-dialog-header,.print-export-dialog-body,.print-export-dialog-footer').forEach(node => { node.inert = true; });
                $('mcPrintPreviewClose').focus({ preventScroll: true });
            }
            $('mcPrintStatus').textContent = '';
        } catch (error) {
            if (token === revision && isOpen()) $('mcPrintStatus').textContent = 'Не удалось создать PDF. ' + (error.message || 'Попробуйте снова.');
        } finally {
            if (token === revision) { busy = false; update(); }
        }
    }

    function createDialog() {
        if (overlay) return;
        overlay = document.createElement('div');
        overlay.id = 'mcPrintDialog';
        overlay.className = 'print-export-overlay';
        overlay.hidden = true;
        overlay.innerHTML = `<section class="print-export-dialog" role="dialog" aria-modal="true" aria-labelledby="mcPrintTitle" aria-describedby="mcPrintDescription">
            <header class="print-export-dialog-header">
                <span class="print-export-dialog-icon">${$('mcPrintButton').querySelector('svg').outerHTML}</span>
                <div><p class="print-export-eyebrow">PDF · 2 × A5 на A4</p><h2 id="mcPrintTitle">Печать задач</h2>
                    <p id="mcPrintDescription">По две серии на листе, сверху и снизу.</p></div>
                <button class="print-export-close" id="mcPrintClose" type="button" aria-label="Закрыть печать">×</button>
            </header>
            <div class="print-export-dialog-body">
                <div class="mc-print-selection">
                    <fieldset class="mc-print-modes" aria-label="Что печатать">
                        <label><input type="radio" name="mcPrintSource" value="series" checked>Серии</label>
                        <label><input type="radio" name="mcPrintSource" value="tasks">Задачи</label>
                        <label><input type="radio" name="mcPrintSource" value="unsolved">Неразобранные</label>
                    </fieldset>
                    <div id="mcPrintSeriesSelection">
                        <div class="mc-print-list-tools">
                            <button type="button" id="mcPrintSelectAll">Выбрать все</button>
                            <button type="button" id="mcPrintClear">Снять выбор</button>
                        </div>
                        <div id="mcPrintSeries" class="mc-print-list" role="group" aria-label="Серии для печати"></div>
                    </div>
                    <div id="mcPrintTaskSelection" hidden>
                        <label class="mc-print-search">
                            <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true"><circle cx="8.5" cy="8.5" r="4.75"/><path d="m12 12 4 4"/></svg>
                            <input id="mcPrintTaskSearch" type="search" aria-label="Номера задач" placeholder="Номера, например 16, 25–30" autocomplete="off">
                        </label>
                        <div class="mc-print-list-tools mc-print-task-tools">
                            <label><input type="checkbox" id="mcPrintOnlyPicked" aria-label="Только выбранные">Выбранные</label>
                            <button type="button" id="mcPrintPickMatches" hidden>Выбрать найденные</button>
                            <button type="button" id="mcPrintClearPicked">Снять выбор</button>
                        </div>
                        <div id="mcPrintTaskResults" class="mc-print-list">
                            <div id="mcPrintTaskList" role="group" aria-label="Задачи для печати"></div>
                            <p id="mcPrintTaskEmpty" role="status" hidden></p>
                            <button type="button" id="mcPrintTaskMore" hidden>Показать ещё</button>
                        </div>
                    </div>
                    <p id="mcPrintUnsolvedNote" hidden>Текущие и отложенные задачи из всего раздела. Личные отметки «решено» не учитываются.</p>
                </div>
            </div>
            <footer class="print-export-dialog-footer">
                <div class="mc-print-footer-info"><p id="mcPrintCount" role="status"></p><p id="mcPrintStatus" role="status"></p></div>
                <div class="mc-print-footer-actions">
                    <button class="print-export-cancel" data-mc-print-action="preview" type="button">Предпросмотр</button>
                    <button class="print-export-cancel" data-mc-print-action="download" type="button">Скачать PDF</button>
                    <button class="print-export-download" data-mc-print-action="print" type="button">Печать</button>
                </div>
            </footer>
            <section id="mcPrintPreview" hidden aria-label="Предпросмотр печатного листа">
                <div id="mcPrintPreviewBar">
                    <button type="button" class="print-export-cancel" id="mcPrintPreviewClose">Назад</button>
                    <button type="button" class="print-export-cancel" id="mcPrintOpenPdf">Открыть PDF</button>
                </div>
                <iframe id="mcPrintFrame" title="Предпросмотр печати" src="about:blank"></iframe>
            </section>
        </section>`;
        document.body.append(overlay);
        $('mcPrintClose').addEventListener('click', close);
        overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
        overlay.querySelector('.mc-print-modes').addEventListener('change', selectionChanged);
        for (const [id, checked] of [['mcPrintSelectAll', true], ['mcPrintClear', false]]) $(id).addEventListener('click', () => {
            draft.series.forEach(series => setSeriesIncluded(series, checked));
            selectionChanged();
        });
        function filterTasks() {
            draft.limit = taskPageSize;
            $('mcPrintTaskResults').scrollTop = 0;
            renderTaskResults();
            selectionChanged();
        }
        $('mcPrintTaskSearch').addEventListener('input', filterTasks);
        $('mcPrintOnlyPicked').addEventListener('change', filterTasks);
        $('mcPrintTaskMore').addEventListener('click', () => {
            const firstNew = draft.limit;
            draft.limit += taskPageSize;
            renderTaskResults(firstNew);
            update();
        });
        $('mcPrintPickMatches').addEventListener('click', () => {
            const { picked } = draft.displayedPicker;
            draft.matches.forEach(task => picked.add(task));
            renderTaskResults(0);
            selectionChanged();
        });
        $('mcPrintClearPicked').addEventListener('click', () => {
            draft.displayedPicker.picked.clear();
            renderTaskResults();
            selectionChanged();
            $('mcPrintTaskSearch').focus();
        });
        overlay.querySelectorAll('[data-mc-print-action]').forEach(button => button.addEventListener('click', () => exportHandouts(button.dataset.mcPrintAction)));
        $('mcPrintPreviewClose').addEventListener('click', () => { clearPreview(); overlay.querySelector('[data-mc-print-action="preview"]').focus(); });
        $('mcPrintOpenPdf').addEventListener('click', () => { if (previewUrl && authToken) window.open(previewUrl, '_blank', 'noopener'); });
        document.addEventListener('keydown', event => {
            if (!isOpen()) return;
            if (event.key === 'Escape') { event.preventDefault(); close(); }
            if (event.key === 'Tab') {
                const focusable = [...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),iframe')].filter(node => node.getClientRects().length && !node.closest('[inert]'));
                const first = focusable[0], last = focusable.at(-1);
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        });
    }

    function isOpen() { return !!overlay && !overlay.hidden; }
    async function open() {
        if (isOpen() || !sourceTasks().length) return;
        const token = revision;
        await loadStyles();
        const tasks = sourceTasks().sort(byTaskNumber);
        if (token !== revision || isOpen() || !tasks.length) return;
        createDialog();
        lastFocus = document.activeElement === document.body ? $('mcPrintButton') : document.activeElement;
        clearPreview();
        const series = MatcenterWorkspaceModel.seriesList(tasks, currentGrade).map(createSeriesOption);
        const selectedSeriesKey = getSelectedMatcenterSeries()?.key;
        series.forEach(item => setSeriesIncluded(item, item.key === selectedSeriesKey));
        const unreviewed = tasks.filter(t => ['Н', 'От', 'П'].includes(t.status));
        draft = {
            grade: currentGrade, series, taskPickers: {
                tasks: { tasks, picked: new Set() },
                unsolved: { tasks: unreviewed, picked: new Set(unreviewed) }
            }
        };
        $('mcPrintSeries').scrollTop = 0;
        overlay.querySelector('[name="mcPrintSource"][value="' + (series.length ? 'series' : 'unsolved') + '"]').checked = true;
        selectionChanged();
        overlay.hidden = false;
        document.body.classList.add('print-export-dialog-open');
        [...document.body.children].filter(node => node !== overlay).forEach(node => { background.set(node, node.inert); node.inert = true; });
        requestAnimationFrame(() => { if (isOpen()) { overlay.classList.add('is-open'); overlay.querySelector('[name="mcPrintSource"]:checked').focus({ preventScroll: true }); } });
    }
    function close(restoreFocus = true) {
        revision++;
        if (!overlay) return;
        busy = false;
        draft = null;
        clearPreview();
        $('mcPrintSeries').replaceChildren();
        $('mcPrintTaskList').replaceChildren();
        $('mcPrintCount').textContent = '';
        $('mcPrintStatus').textContent = '';
        overlay.hidden = true;
        overlay.classList.remove('is-open');
        document.body.classList.remove('print-export-dialog-open');
        background.forEach((inert, node) => { node.inert = inert; }); background.clear();
        if (restoreFocus && lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
        lastFocus = null;
    }
    root.MatcenterSeriesPrint = Object.freeze({ open, isOpen, reset: () => close(false) });
})(window);
