/* Private, client-only series handouts. Never collect cards, hints or marks. */
(function (root) {
    'use strict';
    let overlay, lastFocus, previewUrl, pdfModule, stylesReady, busy = false, revision = 0;
    const background = new Map();
    const $ = id => document.getElementById(id);
    const available = () => authToken ? MatcenterWorkspaceModel.seriesList(allTasks, currentGrade) : [];
    const selected = () => available().find(series => series.key === $('mcPrintSeries').value);

    function loadStyles() {
        if (!stylesReady) stylesReady = Promise.all(['styles/print.css?v=20261006-1', 'styles/matcenter-print.css?v=20261013-1'].map(href => new Promise((resolve, reject) => {
            const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href;
            link.onload = resolve; link.onerror = () => { link.remove(); reject(new Error('Печатное оформление не загрузилось.')); };
            document.head.append(link);
        }))).catch(error => { stylesReady = null; throw error; });
        return stylesReady;
    }

    function loadPdf() {
        if (root.AlmanionPdfDownload?.generateHandout) return Promise.resolve();
        if (!pdfModule) pdfModule = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'pdf-download.js?v=20261013-1';
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
        const series = selected();
        $('mcPrintSeries').disabled = busy;
        overlay.querySelectorAll('[data-mc-print-action]').forEach(button => { button.disabled = busy || !series; });
        $('mcPrintCount').textContent = series ? `${series.tasks.length} ${pluralizeTasks(series.tasks.length)} · исходная нумерация` : '';
    }

    async function exportSeries(mode) {
        const series = selected();
        if (busy || !series || !isOpen()) return;
        const token = ++revision;
        // Snapshot this series from authenticated data, not the currently
        // filtered/partially rendered DOM. Do not mutate or renumber any row.
        const tasks = series.tasks.slice().sort((a, b) => a.number - b.number).map(task => {
            let description = String(task.description ?? '');
            const matches = findUndelimitedMatcenterMath(description);
            for (const match of matches.reverse()) description = description.slice(0, match.start) + '\\(' + match.tex + '\\)' + description.slice(match.end);
            return { number: task.number, numberText: task.numberText, description };
        });
        const title = [getGradeTitle(currentGrade), series.title, series.year].filter(Boolean).join(' — ');
        busy = true;
        update();
        $('mcPrintStatus').textContent = 'Готовим печатный лист…';
        try {
            await loadPdf();
            if (token !== revision || !authToken || !isOpen()) return;
            const blob = await root.AlmanionPdfDownload.generateHandout(tasks, title, {
                autoPrint: mode === 'print',
                // Camp titles reproduce the original printed add-on headings.
                heading: /^Добавка\s*№/u.test(series.title) ? series.title : ''
            });
            if (token !== revision || !authToken || !isOpen()) return;
            clearPreview();
            previewUrl = URL.createObjectURL(blob);
            if (mode === 'download') {
                const link = document.createElement('a');
                link.href = previewUrl;
                link.download = title.replace(/[<>:"/\\|?*]/g, '-') + '.pdf';
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
            '<header class="print-export-dialog-header"><span class="print-export-dialog-icon">' + $('mcPrintButton').querySelector('svg').outerHTML + '</span><div><p class="print-export-eyebrow">PDF · A4</p><h2 id="mcPrintTitle">Печать серии</h2><p id="mcPrintDescription">Условия подряд, как на исходном листке. Без карточек, подсказок и отметок.</p></div><button class="print-export-close" id="mcPrintClose" type="button" aria-label="Закрыть печать">×</button></header>' +
            '<div class="print-export-dialog-body"><div class="mc-print-selection"><label for="mcPrintSeries">Серия</label><select id="mcPrintSeries" class="mc-select"></select><p id="mcPrintCount"></p></div></div>' +
            '<footer class="print-export-dialog-footer"><p id="mcPrintStatus" role="status" aria-live="polite"></p><div><button class="print-export-cancel" data-mc-print-action="preview" type="button">Предпросмотр</button><button class="print-export-cancel" data-mc-print-action="download" type="button">Скачать PDF</button><button class="print-export-download" data-mc-print-action="print" type="button">Печать</button></div></footer>' +
            '<section id="mcPrintPreview" hidden aria-label="Предпросмотр печатного листа"><div id="mcPrintPreviewBar"><button type="button" class="print-export-cancel" id="mcPrintPreviewClose">Назад</button><button type="button" class="print-export-cancel" id="mcPrintOpenPdf">Открыть PDF</button></div><iframe id="mcPrintFrame" title="Предпросмотр серии" src="about:blank"></iframe></section></section>';
        document.body.append(overlay);
        $('mcPrintClose').addEventListener('click', close);
        overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
        $('mcPrintSeries').addEventListener('change', () => { $('mcPrintStatus').textContent = ''; update(); });
        overlay.querySelectorAll('[data-mc-print-action]').forEach(button => button.addEventListener('click', () => exportSeries(button.dataset.mcPrintAction)));
        $('mcPrintPreviewClose').addEventListener('click', () => { clearPreview(); overlay.querySelector('[data-mc-print-action="preview"]').focus(); });
        $('mcPrintOpenPdf').addEventListener('click', () => { if (previewUrl && authToken) window.open(previewUrl, '_blank', 'noopener'); });
        document.addEventListener('keydown', event => {
            if (!isOpen()) return;
            if (event.key === 'Escape') { event.preventDefault(); close(); }
            if (event.key === 'Tab') {
                const focusable = [...overlay.querySelectorAll('button:not(:disabled),select:not(:disabled),iframe')].filter(node => node.getClientRects().length && !node.closest('[inert]'));
                const first = focusable[0], last = focusable.at(-1);
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        });
    }

    function isOpen() { return !!overlay && !overlay.hidden; }
    async function open() {
        if (isOpen() || !available().length) return;
        await loadStyles();
        if (isOpen() || !available().length) return;
        createDialog();
        lastFocus = document.activeElement === document.body ? $('mcPrintButton') : document.activeElement;
        clearPreview();
        $('mcPrintSeries').replaceChildren(new Option('Выберите серию', ''), ...available().map(series => new Option(series.title, series.key)));
        $('mcPrintSeries').value = getSelectedMatcenterSeries()?.key || '';
        $('mcPrintStatus').textContent = '';
        update();
        overlay.hidden = false;
        document.body.classList.add('print-export-dialog-open');
        [...document.body.children].filter(node => node !== overlay).forEach(node => { background.set(node, node.inert); node.inert = true; });
        requestAnimationFrame(() => { if (isOpen()) { overlay.classList.add('is-open'); $('mcPrintSeries').focus({ preventScroll: true }); } });
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
