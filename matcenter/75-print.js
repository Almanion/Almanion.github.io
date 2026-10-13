/* Private, client-only series handouts. Never collect cards, hints or marks. */
(function (root) {
    'use strict';
    let overlay, lastFocus, previewUrl, pdfModule, stylesReady, busy = false, revision = 0;
    const background = new Map();
    const $ = id => document.getElementById(id);
    const available = () => authToken ? MatcenterWorkspaceModel.seriesList(allTasks, currentGrade) : [];
    const sourceTasks = () => authToken ? getTasksForCurrentGrade() : [];
    const unsolvedMode = () => overlay.querySelector('[name="mcPrintSource"]:checked')?.value === 'unsolved';
    const selected = () => {
        const keys = new Set([...$('mcPrintSeries').querySelectorAll('input:checked')].map(input => input.value));
        return available().filter(series => keys.has(series.key));
    };

    function loadStyles() {
        if (!stylesReady) stylesReady = Promise.all(['styles/print.css?v=20261006-1', 'styles/matcenter-print.css?v=20261013-3'].map(href => new Promise((resolve, reject) => {
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
            script.src = 'pdf-download.js?v=20261014-1';
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

    function update() {
        const series = selected(), unsolved = unsolvedMode();
        const count = unsolved ? sourceTasks().filter(t => ['Н', 'От', 'П'].includes(t.status)).length
            : series.reduce((sum, item) => sum + item.tasks.length, 0);
        $('mcPrintSeriesSelection').hidden = unsolved;
        $('mcPrintUnsolvedNote').hidden = !unsolved;
        overlay.querySelectorAll('input').forEach(input => { input.disabled = busy || input.value === 'series' && !available().length; });
        $('mcPrintSelectAll').disabled = busy; $('mcPrintClear').disabled = busy;
        overlay.querySelectorAll('[data-mc-print-action]').forEach(button => { button.disabled = busy || !count; });
        $('mcPrintCount').textContent = count ? `${count} ${pluralizeTasks(count)} · исходная нумерация`
            : unsolved ? 'В этом разделе нет неразобранных задач.' : 'Выберите одну или несколько серий.';
    }

    async function exportSeries(mode) {
        if (busy || !isOpen()) return;
        const series = selected(), unsolved = unsolvedMode();
        const groups = unsolved ? [{ tasks: sourceTasks().filter(t => ['Н', 'От', 'П'].includes(t.status)), heading: '' }]
            : series.map(item => ({ tasks: item.tasks, heading: /^Добавка\s*№/u.test(item.title) ? item.title : '' }));
        if (!groups.length || groups.some(group => !group.tasks.length)) return;
        const token = ++revision;
        // Snapshot this series from authenticated data, not the currently
        // filtered/partially rendered DOM. Do not mutate or renumber any row.
        const handouts = groups.map(group => ({ heading: group.heading, tasks: group.tasks.slice().sort((a, b) => a.number - b.number).map(task => {
            let description = String(task.description ?? '');
            const matches = findUndelimitedMatcenterMath(description);
            for (const match of matches.reverse()) description = description.slice(0, match.start) + '\\(' + match.tex + '\\)' + description.slice(match.end);
            return { number: task.number, numberText: task.numberText, description };
        }) }));
        const title = [getGradeTitle(currentGrade), unsolved ? 'Неразобранные задачи' : series.map(item => item.title).join(', ')].join(' — ');
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
        overlay.innerHTML = '<section class="print-export-dialog" role="dialog" aria-modal="true" aria-labelledby="mcPrintTitle" aria-describedby="mcPrintDescription">' +
            '<header class="print-export-dialog-header"><span class="print-export-dialog-icon">' + $('mcPrintButton').querySelector('svg').outerHTML + '</span><div><p class="print-export-eyebrow">PDF · 2 × A5 на A4</p><h2 id="mcPrintTitle">Печать задач</h2><p id="mcPrintDescription">По две серии на листе: сверху и снизу, в порядке списка. A4, вертикально, масштаб 100%.</p></div><button class="print-export-close" id="mcPrintClose" type="button" aria-label="Закрыть печать">×</button></header>' +
            '<div class="print-export-dialog-body"><div class="mc-print-selection"><fieldset class="mc-print-modes"><legend class="sr-only">Что печатать</legend><label><input type="radio" name="mcPrintSource" value="series" checked>Целые серии</label><label><input type="radio" name="mcPrintSource" value="unsolved">Неразобранные</label></fieldset><div id="mcPrintSeriesSelection"><div class="mc-print-list-tools"><button type="button" id="mcPrintSelectAll">Выбрать все</button><button type="button" id="mcPrintClear">Снять выбор</button></div><div id="mcPrintSeries" role="group" aria-label="Серии для печати"></div></div><p id="mcPrintUnsolvedNote" hidden>Из всего текущего раздела: текущие и отложенные задачи. Личные отметки «решено» не учитываются.</p><p id="mcPrintCount" role="status" aria-live="polite"></p></div></div>' +
            '<footer class="print-export-dialog-footer"><p id="mcPrintStatus" role="status" aria-live="polite"></p><div><button class="print-export-cancel" data-mc-print-action="preview" type="button">Предпросмотр</button><button class="print-export-cancel" data-mc-print-action="download" type="button">Скачать PDF</button><button class="print-export-download" data-mc-print-action="print" type="button">Печать</button></div></footer>' +
            '<section id="mcPrintPreview" hidden aria-label="Предпросмотр печатного листа"><div id="mcPrintPreviewBar"><button type="button" class="print-export-cancel" id="mcPrintPreviewClose">Назад</button><button type="button" class="print-export-cancel" id="mcPrintOpenPdf">Открыть PDF</button></div><iframe id="mcPrintFrame" title="Предпросмотр серии" src="about:blank"></iframe></section></section>';
        document.body.append(overlay);
        $('mcPrintClose').addEventListener('click', close);
        overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
        overlay.querySelector('.mc-print-selection').addEventListener('change', () => { $('mcPrintStatus').textContent = ''; update(); });
        for (const [id, checked] of [['mcPrintSelectAll', true], ['mcPrintClear', false]]) $(id).addEventListener('click', () => {
            $('mcPrintSeries').querySelectorAll('input').forEach(input => { input.checked = checked; }); update();
        });
        overlay.querySelectorAll('[data-mc-print-action]').forEach(button => button.addEventListener('click', () => exportSeries(button.dataset.mcPrintAction)));
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
        await loadStyles();
        if (isOpen() || !sourceTasks().length) return;
        createDialog();
        lastFocus = document.activeElement === document.body ? $('mcPrintButton') : document.activeElement;
        clearPreview();
        $('mcPrintSeries').replaceChildren(...available().map(series => {
            const label = document.createElement('label'), input = document.createElement('input');
            input.type = 'checkbox'; input.value = series.key; input.setAttribute('aria-label', series.title);
            input.checked = series.key === getSelectedMatcenterSeries()?.key;
            const name = document.createElement('span'); name.textContent = series.title;
            const range = document.createElement('small'); range.textContent = matcenterSeriesRange(series);
            label.append(input, name, range); return label;
        }));
        overlay.querySelector('[name="mcPrintSource"][value="' + (available().length ? 'series' : 'unsolved') + '"]').checked = true;
        $('mcPrintStatus').textContent = '';
        update();
        overlay.hidden = false;
        document.body.classList.add('print-export-dialog-open');
        [...document.body.children].filter(node => node !== overlay).forEach(node => { background.set(node, node.inert); node.inert = true; });
        requestAnimationFrame(() => { if (isOpen()) { overlay.classList.add('is-open'); overlay.querySelector('[name="mcPrintSource"]:checked').focus({ preventScroll: true }); } });
    }
    function close(restoreFocus = true) {
        if (!overlay) return;
        revision++; busy = false;
        clearPreview();
        $('mcPrintSeries').replaceChildren();
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
