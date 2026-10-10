(function () {
    'use strict';

    if (window.AlmanionPrintExport) return;

    const PRINT_CLASS = 'print-export-active';
    const DIALOG_CLASS = 'print-export-dialog-open';
    const SPLITTABLE_CLASS = 'print-splittable';
    const WIDE_CLASS = 'print-wide';
    const EXCLUDED_ATTRIBUTE = 'data-print-excluded';
    const FIRST_SECTION_ATTRIBUTE = 'data-print-first-section';
    const FIRST_TOPIC_ATTRIBUTE = 'data-print-first-topic';
    const SELECTED_SECTION_ATTRIBUTE = 'data-print-selected-section';
    const BLOCK_SELECTOR = [
        '.definition-box', '.formula-box', '.remark-box', '.reminder-box',
        '.experiment-box', '.derivation-box', '.theorem-box', '.lemma-box',
        '.example-box', '.statement-box', '.corollary-box', '.proof-box',
        '.exercise-box', '.properties-box', '.system-box', '.english-word-card'
    ].join(',');
    const PDF_ICON = [
        '<svg viewBox="0 0 24 24" aria-hidden="true">',
        '<path d="M7 3.75h7l3 3V11"/>',
        '<path d="M14 3.75V7h3"/>',
        '<path d="M6 14.5h12a2 2 0 0 1 2 2v2.75H4V16.5a2 2 0 0 1 2-2Z"/>',
        '<path d="M7 19.25v1h10v-1M7.5 11h9"/>',
        '</svg>'
    ].join('');

    let originalTitle = '';
    let changedDetails = [];
    let changedExpansions = [];
    let cleanupTimer = 0;
    let exporting = false;
    let selectionInitialized = false;
    let selectedKeys = new Set();
    let catalogue = { groups: [], items: [] };
    let lastFocusedElement = null;
    let pdfModulePromise = null;
    let previewUrl = '';

    function isEnglish() {
        return document.documentElement.lang === 'en' || document.body.dataset.uiLanguage === 'en';
    }

    function text(labelRu, labelEn) {
        return isEnglish() ? labelEn : labelRu;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizedLabel(value, fallback) {
        const label = String(value || '')
            .replace(/\s+/g, ' ')
            .replace(/^\s*[▾▼]\s*/, '')
            .trim();
        return label || fallback;
    }

    function pageTitle() {
        const heading = document.querySelector('.main-content .page-header h1, .main-content h1');
        return normalizedLabel(heading && heading.textContent || document.title, text('Конспект', 'Notes'));
    }

    function collectCatalogue() {
        const previousTotal = catalogue.items.length;
        const previouslyAll = selectionInitialized && previousTotal > 0 && selectedKeys.size === previousTotal;
        const groups = Array.from(document.querySelectorAll('.main-content > .content-section')).map(function (section, groupIndex) {
            const groupTitleNode = section.querySelector(':scope > .part-title, :scope > .part-title-row .part-title');
            const groupTitle = normalizedLabel(groupTitleNode && groupTitleNode.textContent, text('Раздел', 'Section'));
            let itemElements = Array.from(section.querySelectorAll(':scope > .topic'));
            if (!itemElements.length) itemElements = [section];
            const items = itemElements.map(function (element, itemIndex) {
                const titleNode = element === section
                    ? groupTitleNode
                    : element.querySelector(':scope > .topic-title, :scope > h2, :scope > h3');
                const title = normalizedLabel(titleNode && titleNode.textContent, groupTitle + ' ' + (itemIndex + 1));
                const stableId = String(element.id || groupIndex + '-' + itemIndex);
                return {
                    key: 'section-' + groupIndex + '-' + stableId,
                    title,
                    element,
                    groupIndex
                };
            });
            return { key: 'group-' + groupIndex, title: groupTitle, element: section, items };
        });
        const items = groups.flatMap(function (group) { return group.items; });
        const availableKeys = new Set(items.map(function (item) { return item.key; }));

        if (!selectionInitialized || previouslyAll) {
            selectedKeys = new Set(availableKeys);
            selectionInitialized = true;
        } else {
            selectedKeys = new Set(Array.from(selectedKeys).filter(function (key) { return availableKeys.has(key); }));
        }
        catalogue = { groups, items };
        return catalogue;
    }

    function currentItem() {
        if (!catalogue.items.length) return null;
        const active = document.querySelector('.main-content .topic.exp-reader-current');
        if (active) {
            const match = catalogue.items.find(function (item) { return item.element === active; });
            if (match) return match;
        }
        const hash = decodeURIComponent(window.location.hash.slice(1));
        if (hash) {
            const match = catalogue.items.find(function (item) {
                return item.element.id === hash || item.element.querySelector('#' + CSS.escape(hash));
            });
            if (match) return match;
        }
        const viewportAnchor = Math.max(72, window.innerHeight * 0.22);
        const nearest = catalogue.items.reduce(function (best, item) {
            const rect = item.element.getBoundingClientRect();
            const distance = rect.bottom < 0
                ? Math.abs(rect.bottom) + window.innerHeight
                : Math.abs(rect.top - viewportAnchor);
            return !best || distance < best.distance ? { item, distance } : best;
        }, null);
        return nearest && nearest.item;
    }

    function selectAll() {
        selectedKeys = new Set(catalogue.items.map(function (item) { return item.key; }));
        updateSelectionUi();
    }

    function selectCurrent() {
        const item = currentItem();
        selectedKeys = new Set(item ? [item.key] : []);
        updateSelectionUi();
    }

    function clearSelection() {
        selectedKeys.clear();
        updateSelectionUi();
    }

    function sectionCountLabel(count) {
        if (isEnglish()) return count === 1 ? 'section' : 'sections';
        const lastTwo = count % 100;
        const last = count % 10;
        if (lastTwo >= 11 && lastTwo <= 14) return 'разделов';
        if (last === 1) return 'раздел';
        if (last >= 2 && last <= 4) return 'раздела';
        return 'разделов';
    }

    function renderSelectionList() {
        const root = document.getElementById('printExportSelection');
        if (!root) return;
        root.innerHTML = catalogue.groups.map(function (group, groupIndex) {
            return '<section class="print-export-group" data-print-group="' + groupIndex + '">' +
                '<label class="print-export-group-heading">' +
                    '<input type="checkbox" data-print-group-toggle="' + groupIndex + '">' +
                    '<span><strong>' + escapeHtml(group.title) + '</strong><small>' + group.items.length + ' ' + sectionCountLabel(group.items.length) + '</small></span>' +
                '</label>' +
                '<div class="print-export-options">' + group.items.map(function (item) {
                    return '<label class="print-export-option">' +
                        '<input type="checkbox" data-print-item="' + escapeHtml(item.key) + '">' +
                        '<span>' + escapeHtml(item.title) + '</span>' +
                    '</label>';
                }).join('') + '</div>' +
            '</section>';
        }).join('');
        updateSelectionUi();
    }

    function updateSelectionUi() {
        const selectedCount = catalogue.items.filter(function (item) { return selectedKeys.has(item.key); }).length;
        document.querySelectorAll('[data-print-item]').forEach(function (input) {
            input.checked = selectedKeys.has(input.dataset.printItem);
        });
        document.querySelectorAll('[data-print-group-toggle]').forEach(function (input) {
            const group = catalogue.groups[Number(input.dataset.printGroupToggle)];
            const count = group ? group.items.filter(function (item) { return selectedKeys.has(item.key); }).length : 0;
            input.checked = !!group && count === group.items.length;
            input.indeterminate = count > 0 && !!group && count < group.items.length;
        });
        const summary = document.getElementById('printExportCount');
        if (summary) summary.textContent = text('Выбрано ', 'Selected ') + selectedCount + text(' из ', ' of ') + catalogue.items.length;
        const download = document.getElementById('printExportDownload');
        if (download) download.disabled = selectedItems().length === 0 || exporting;
        ['printExportPreview', 'printExportPrint'].forEach(function (id) {
            const control = document.getElementById(id);
            if (control) control.disabled = selectedItems().length === 0 || exporting;
        });
        const current = currentItem();
        document.querySelectorAll('[data-print-preset]').forEach(function (preset) {
            const isActive = preset.dataset.printPreset === 'all'
                ? selectedCount === catalogue.items.length
                : preset.dataset.printPreset === 'none'
                    ? selectedCount === 0
                    : selectedCount === 1 && !!current && selectedKeys.has(current.key);
            preset.classList.toggle('is-active', isActive);
            preset.setAttribute('aria-pressed', String(isActive));
        });
    }

    function selectedItems() {
        return catalogue.items.filter(function (item) {
            return selectedKeys.has(item.key) && !item.element.querySelector('.note-filter-empty');
        });
    }

    function applySelectionToDocument() {
        document.querySelectorAll('[' + EXCLUDED_ATTRIBUTE + '],[' + FIRST_SECTION_ATTRIBUTE + '],[' + FIRST_TOPIC_ATTRIBUTE + '],[' + SELECTED_SECTION_ATTRIBUTE + ']').forEach(function (element) {
            element.removeAttribute(EXCLUDED_ATTRIBUTE);
            element.removeAttribute(FIRST_SECTION_ATTRIBUTE);
            element.removeAttribute(FIRST_TOPIC_ATTRIBUTE);
            element.removeAttribute(SELECTED_SECTION_ATTRIBUTE);
        });
        const visibleGroups = [];
        catalogue.groups.forEach(function (group) {
            const visibleItems = group.items.filter(function (item) {
                return selectedKeys.has(item.key) && !item.element.querySelector('.note-filter-empty');
            });
            if (!visibleItems.length) {
                group.element.setAttribute(EXCLUDED_ATTRIBUTE, '');
                return;
            }
            group.element.setAttribute(SELECTED_SECTION_ATTRIBUTE, '');
            visibleGroups.push(group.element);
            if (visibleItems[0].element !== group.element) {
                visibleItems[0].element.setAttribute(FIRST_TOPIC_ATTRIBUTE, '');
            }
            group.items.forEach(function (item) {
                if (!visibleItems.includes(item) && item.element !== group.element) item.element.setAttribute(EXCLUDED_ATTRIBUTE, '');
            });
        });
        if (visibleGroups[0]) visibleGroups[0].setAttribute(FIRST_SECTION_ATTRIBUTE, '');
    }

    function printDocumentTitle() {
        const selected = selectedItems();
        if (selected.length === 1) return pageTitle() + ' — ' + selected[0].title;
        if (selected.length && selected.length < catalogue.items.length) {
            return pageTitle() + text(' — выбранные разделы', ' — selected sections');
        }
        return pageTitle() + text(' — конспект', ' — notes');
    }

    function preparePrintDocument() {
        if (document.body.classList.contains(PRINT_CLASS)) return;
        collectCatalogue();
        if (!selectedKeys.size) selectAll();

        originalTitle = document.title;
        document.title = printDocumentTitle();
        document.body.classList.add(PRINT_CLASS);
        applySelectionToDocument();
        selectedItems().forEach(function (item) {
            if (window.AlmanionMath) window.AlmanionMath.render(item.element);
        });

        changedDetails = [];
        document.querySelectorAll('.main-content details:not([open])').forEach(function (details) {
            if (details.closest('[' + EXCLUDED_ATTRIBUTE + ']')) return;
            changedDetails.push(details);
            details.open = true;
        });
        changedExpansions = [];
        document.querySelectorAll('.main-content :is(.proof-content,.derivation-content,.english-translation-content)[hidden]').forEach(function (content) {
            if (content.closest('[' + EXCLUDED_ATTRIBUTE + ']')) return;
            changedExpansions.push(content);
            content.hidden = false;
        });

        document.querySelectorAll(BLOCK_SELECTOR).forEach(function (block) {
            if (block.closest('[' + EXCLUDED_ATTRIBUTE + ']')) return;
            const hasNestedBlock = Boolean(block.querySelector(BLOCK_SELECTOR));
            const hasExpandableContent = Boolean(block.querySelector(
                '.derivation-content, .proof-content, .english-translation-content, details'
            ));
            const isLong = block.scrollHeight > 620;
            block.classList.toggle(SPLITTABLE_CLASS, hasNestedBlock || hasExpandableContent || isLong);
        });

        window.dispatchEvent(new CustomEvent('almanion:print-prepared', {
            detail: { title: pageTitle(), sections: selectedItems().map(function (item) { return item.element.id; }) }
        }));
    }

    function fitPrintLayout() {
        // beforeprint runs with print styles applied. Measure the A4 column, not
        // the current phone/desktop viewport or an invisible reader section.
        document.querySelectorAll('.main-content .katex-display').forEach(function (element) {
            element.style.removeProperty('--print-formula-scale');
            const formula = element.querySelector('.katex-html');
            const available = element.clientWidth;
            const width = formula && formula.getBoundingClientRect().width;
            if (available && width > available) {
                element.classList.add(WIDE_CLASS);
                element.style.setProperty('--print-formula-scale', String(Math.min(1, available / width)));
            }
        });
        document.querySelectorAll(BLOCK_SELECTOR).forEach(function (block) {
            if (block.getBoundingClientRect().height > 700) block.classList.add(SPLITTABLE_CLASS);
        });
    }

    function restoreDocument() {
        window.clearTimeout(cleanupTimer);
        cleanupTimer = 0;
        changedDetails.forEach(function (details) { details.open = false; });
        changedDetails = [];
        changedExpansions.forEach(function (content) { content.hidden = true; });
        changedExpansions = [];
        document.querySelectorAll('.' + SPLITTABLE_CLASS).forEach(function (element) {
            element.classList.remove(SPLITTABLE_CLASS);
        });
        document.querySelectorAll('.' + WIDE_CLASS).forEach(function (element) {
            element.classList.remove(WIDE_CLASS);
            element.style.removeProperty('--print-formula-scale');
        });
        document.querySelectorAll('[' + EXCLUDED_ATTRIBUTE + '],[' + FIRST_SECTION_ATTRIBUTE + '],[' + FIRST_TOPIC_ATTRIBUTE + '],[' + SELECTED_SECTION_ATTRIBUTE + ']').forEach(function (element) {
            element.removeAttribute(EXCLUDED_ATTRIBUTE);
            element.removeAttribute(FIRST_SECTION_ATTRIBUTE);
            element.removeAttribute(FIRST_TOPIC_ATTRIBUTE);
            element.removeAttribute(SELECTED_SECTION_ATTRIBUTE);
        });
        document.body.classList.remove(PRINT_CLASS);
        if (originalTitle) document.title = originalTitle;
        originalTitle = '';
        exporting = false;
        updateBusyState(false);
    }

    function settle(promise, timeoutMs) {
        return Promise.race([
            Promise.resolve(promise).catch(function () {}),
            new Promise(function (resolve) { window.setTimeout(resolve, timeoutMs); })
        ]);
    }

    async function waitForPrintableAssets() {
        const waits = [];
        if (document.fonts && document.fonts.ready) waits.push(settle(document.fonts.ready, 2400));
        document.querySelectorAll('.main-content img').forEach(function (image) {
            if (image.closest('[' + EXCLUDED_ATTRIBUTE + ']')) return;
            if (image.complete) {
                if (typeof image.decode === 'function') waits.push(settle(image.decode(), 1400));
                return;
            }
            waits.push(settle(new Promise(function (resolve) {
                image.addEventListener('load', resolve, { once: true });
                image.addEventListener('error', resolve, { once: true });
            }), 2400));
        });
        await Promise.all(waits);
        await new Promise(function (resolve) {
            requestAnimationFrame(function () { requestAnimationFrame(resolve); });
        });
    }

    function updateBusyState(busy) {
        document.querySelectorAll('.print-export-button').forEach(function (target) {
            target.disabled = busy;
            target.classList.toggle('is-preparing', busy);
            const label = target.querySelector('.print-export-label');
            if (label) label.textContent = busy ? text('Подготовка страниц…', 'Preparing pages…') : text('Скачать PDF', 'Download PDF');
        });
        const download = document.getElementById('printExportDownload');
        if (download) {
            download.classList.toggle('is-preparing', busy);
            download.textContent = busy ? text('Подготовка…', 'Preparing…') : text('Скачать PDF', 'Download PDF');
        }
        ['printExportPreview', 'printExportPrint'].forEach(function (id) {
            const control = document.getElementById(id);
            if (control) control.disabled = busy || !selectedItems().length;
        });
        updateSelectionUi();
    }

    function loadPdfModule() {
        if (window.AlmanionPdfDownload) return Promise.resolve();
        if (!pdfModulePromise) pdfModulePromise = new Promise(function (resolve, reject) {
            const script = document.createElement('script');
            script.src = 'pdf-download.js?v=20261007-1';
            script.onload = resolve;
            script.onerror = function () { pdfModulePromise = null; script.remove(); reject(new Error('PDF module unavailable')); };
            document.head.appendChild(script);
        });
        return pdfModulePromise;
    }

    async function exportToPDF(mode) {
        if (typeof mode !== 'string') mode = 'download';
        if (exporting || !selectedItems().length) return;
        exporting = true;
        updateBusyState(true);
        try {
            await loadPdfModule();
            const blob = await window.AlmanionPdfDownload.generate(selectedItems(), printDocumentTitle(), { autoPrint: mode === 'print' });
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            previewUrl = URL.createObjectURL(blob);
            if (mode === 'preview' || mode === 'print') {
                const frame = document.getElementById('printExportPreviewFrame');
                // The PDF's standard named Print action runs when its viewer is
                // ready, without reaching into a browser-owned/cross-origin frame.
                frame.onload = null;
                frame.src = previewUrl;
                document.getElementById('printExportPreviewPanel').hidden = false;
                setPreviewBackgroundInert(true);
                document.getElementById('printExportPreviewClose').focus({ preventScroll: true });
            } else {
                const link = document.createElement('a');
                link.href = previewUrl;
                link.download = printDocumentTitle().replace(/[<>:"/\\|?*]/g, '-') + '.pdf';
                document.body.appendChild(link); link.click(); link.remove();
            }
        } catch (error) {
            console.error('Almanion PDF download:', error);
            const description = document.getElementById('printExportDescription');
            if (description) { description.setAttribute('role', 'alert'); description.textContent = text('Не удалось создать PDF. ', 'Could not create PDF. ') + (error.message || ''); }
        } finally { exporting = false; updateBusyState(false); }
    }

    function printNotes() { return exportToPDF('print'); }

    function createLauncher() {
        const existing = document.getElementById('printExportButton');
        if (existing) {
            existing.addEventListener('click', openDialog);
            return;
        }
        const target = document.createElement('button');
        target.id = 'printExportButton';
        target.className = 'print-export-button';
        target.type = 'button';
        target.setAttribute('aria-haspopup', 'dialog');
        target.setAttribute('aria-controls', 'printExportDialog');
        target.innerHTML = PDF_ICON + '<span class="print-export-label">' + text('Скачать PDF', 'Download PDF') + '</span><span class="print-export-chevron" aria-hidden="true">›</span>';
        target.addEventListener('click', openDialog);

        const sidebar = document.querySelector('.sidebar');
        const nav = sidebar && sidebar.querySelector('.nav-menu');
        if (sidebar && nav) {
            const slot = document.createElement('div');
            slot.className = 'print-export-menu-slot';
            slot.appendChild(target);
            sidebar.insertBefore(slot, nav);
        } else {
            target.classList.add('print-export-button-floating');
            document.body.appendChild(target);
        }
    }

    function createDialog() {
        if (document.getElementById('printExportDialog')) return;
        const overlay = document.createElement('div');
        overlay.id = 'printExportDialog';
        overlay.className = 'print-export-overlay';
        overlay.hidden = true;
        overlay.innerHTML =
            '<section class="print-export-dialog" role="dialog" aria-modal="true" aria-labelledby="printExportTitle" aria-describedby="printExportDescription">' +
                '<header class="print-export-dialog-header">' +
                    '<span class="print-export-dialog-icon">' + PDF_ICON + '</span>' +
                    '<div><p class="print-export-eyebrow">PDF · A4</p><h2 id="printExportTitle">' + text('Экспорт конспекта', 'Export notes') + '</h2><p id="printExportDescription">' + text('Выберите разделы, которые войдут в документ.', 'Choose the sections to include in the document.') + '</p></div>' +
                    '<button class="print-export-close" type="button" data-print-close aria-label="' + text('Закрыть', 'Close') + '">×</button>' +
                '</header>' +
                '<div class="print-export-dialog-body">' +
                    '<div class="print-export-presets" aria-label="' + text('Быстрый выбор', 'Quick selection') + '">' +
                        '<button type="button" data-print-preset="all">' + text('Весь конспект', 'All notes') + '</button>' +
                        '<button type="button" data-print-preset="current">' + text('Текущий раздел', 'Current section') + '</button>' +
                        '<button type="button" data-print-preset="none">' + text('Снять выбор', 'Clear') + '</button>' +
                    '</div>' +
                    '<div class="print-export-selection-heading"><strong>' + text('Содержание', 'Contents') + '</strong><span id="printExportCount"></span></div>' +
                    '<div class="print-export-selection" id="printExportSelection"></div>' +
                '</div>' +
                '<footer class="print-export-dialog-footer">' +
                    '<div><button class="print-export-cancel" id="printExportPrint" type="button">' + text('Печать', 'Print') + '</button><button class="print-export-cancel" id="printExportPreview" type="button">' + text('Предпросмотр', 'Preview') + '</button><button class="print-export-download" id="printExportDownload" type="button">' + text('Скачать PDF', 'Download PDF') + '</button></div>' +
                '</footer>' +
                '<section class="print-export-preview" id="printExportPreviewPanel" hidden><button type="button" class="print-export-cancel" id="printExportPreviewClose">' + text('Закрыть предпросмотр', 'Close preview') + '</button><iframe id="printExportPreviewFrame" title="' + text('Предпросмотр PDF', 'PDF preview') + '"></iframe></section>' +
            '</section>';
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function (event) {
            if (event.target === overlay || event.target.closest('[data-print-close]')) {
                closeDialog();
                return;
            }
            const preset = event.target.closest('[data-print-preset]');
            if (preset) {
                if (preset.dataset.printPreset === 'all') selectAll();
                else if (preset.dataset.printPreset === 'current') selectCurrent();
                else clearSelection();
            }
        });
        overlay.addEventListener('change', function (event) {
            const itemInput = event.target.closest('[data-print-item]');
            if (itemInput) {
                if (itemInput.checked) selectedKeys.add(itemInput.dataset.printItem);
                else selectedKeys.delete(itemInput.dataset.printItem);
                updateSelectionUi();
                return;
            }
            const groupInput = event.target.closest('[data-print-group-toggle]');
            if (!groupInput) return;
            const group = catalogue.groups[Number(groupInput.dataset.printGroupToggle)];
            if (!group) return;
            group.items.forEach(function (item) {
                if (groupInput.checked) selectedKeys.add(item.key);
                else selectedKeys.delete(item.key);
            });
            updateSelectionUi();
        });
        document.getElementById('printExportDownload').addEventListener('click', exportToPDF);
        document.getElementById('printExportPrint').addEventListener('click', printNotes);
        document.getElementById('printExportPreview').addEventListener('click', function () { exportToPDF('preview'); });
        document.getElementById('printExportPreviewClose').addEventListener('click', function () {
            document.getElementById('printExportPreviewFrame').onload = null;
            document.getElementById('printExportPreviewFrame').src = 'about:blank';
            document.getElementById('printExportPreviewPanel').hidden = true;
            setPreviewBackgroundInert(false);
            document.getElementById('printExportPreview').focus({ preventScroll: true });
        });
    }

    function setPreviewBackgroundInert(inert) {
        document.querySelectorAll('#printExportDialog .print-export-dialog-header, #printExportDialog .print-export-dialog-body, #printExportDialog .print-export-dialog-footer')
            .forEach(function (node) { node.inert = inert; });
    }

    function openDialog() {
        if (exporting) return;
        collectCatalogue();
        renderSelectionList();
        const description = document.getElementById('printExportDescription');
        if (description) description.removeAttribute('role');
        if (description) description.textContent = window.AlmanionNoteFilter && window.AlmanionNoteFilter.active()
            ? text('В PDF войдут только выбранные типы блоков. Пустые разделы будут пропущены.', 'Only selected block types will be included. Empty sections will be skipped.')
            : text('Выберите разделы, которые войдут в документ.', 'Choose the sections to include in the document.');
        const overlay = document.getElementById('printExportDialog');
        if (!overlay) return;
        lastFocusedElement = document.activeElement;
        document.getElementById('printExportPreviewPanel').hidden = true;
        setPreviewBackgroundInert(false);
        overlay.hidden = false;
        document.body.classList.add(DIALOG_CLASS);
        window.requestAnimationFrame(function () {
            overlay.classList.add('is-open');
            const focusTarget = overlay.querySelector('[data-print-preset="all"]');
            if (focusTarget) focusTarget.focus({ preventScroll: true });
        });
    }

    function closeDialog(restoreFocus) {
        const overlay = document.getElementById('printExportDialog');
        if (!overlay || overlay.hidden) return;
        document.getElementById('printExportPreviewFrame').onload = null;
        document.getElementById('printExportPreviewFrame').src = 'about:blank';
        overlay.classList.remove('is-open');
        overlay.hidden = true;
        document.body.classList.remove(DIALOG_CLASS);
        if (restoreFocus !== false && lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
            lastFocusedElement.focus({ preventScroll: true });
        }
        lastFocusedElement = null;
    }

    function init() {
        if (!document.querySelector('.main-content')) return;
        if (!document.querySelector('link[href^="styles/note-filter.css"]')) {
            const style = document.createElement('link');
            style.rel = 'stylesheet'; style.href = 'styles/note-filter.css?v=20261010-2';
            document.head.appendChild(style);
        }
        if (!document.querySelector('script[src^="note-filter.js"]')) {
            const script = document.createElement('script');
            script.src = 'note-filter.js?v=20261010-2'; document.head.appendChild(script);
        }
        collectCatalogue();
        createLauncher();
        createDialog();
        window.addEventListener('beforeprint', function () {
            preparePrintDocument();
            fitPrintLayout();
        });
        window.addEventListener('afterprint', restoreDocument);
        window.addEventListener('focus', function () {
            if (!exporting || !document.body.classList.contains(PRINT_CLASS)) return;
            window.clearTimeout(cleanupTimer);
            cleanupTimer = window.setTimeout(restoreDocument, 800);
        });
        document.addEventListener('keydown', function (event) {
            if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'KeyP') {
                event.preventDefault();
                openDialog();
                return;
            }
            const overlay = document.getElementById('printExportDialog');
            if (event.key === 'Escape' && overlay && !overlay.hidden) {
                event.preventDefault();
                closeDialog();
                return;
            }
            if (event.key === 'Tab' && overlay && !overlay.hidden) {
                const focusable = Array.from(overlay.querySelectorAll('button:not(:disabled), input:not(:disabled)'))
                    .filter(function (node) { return node.getClientRects().length && !node.closest('[inert]'); });
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        });
    }

    window.AlmanionPrintExport = Object.freeze({
        open: openDialog,
        prepare: preparePrintDocument,
        restore: restoreDocument,
        print: printNotes,
        download: exportToPDF
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
