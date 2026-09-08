(function () {
    'use strict';

    if (window.AlmanionPrintExport) return;

    const PRINT_CLASS = 'print-export-active';
    const SPLITTABLE_CLASS = 'print-splittable';
    const WIDE_CLASS = 'print-wide';
    const BLOCK_SELECTOR = [
        '.definition-box', '.formula-box', '.remark-box', '.reminder-box',
        '.experiment-box', '.derivation-box', '.theorem-box', '.lemma-box',
        '.example-box', '.statement-box', '.corollary-box', '.proof-box',
        '.exercise-box', '.properties-box', '.system-box', '.english-word-card'
    ].join(',');

    let originalTitle = '';
    let changedDetails = [];
    let cleanupTimer = 0;
    let exporting = false;

    function isEnglish() {
        return document.documentElement.lang === 'en' || document.body.dataset.uiLanguage === 'en';
    }

    function text(labelRu, labelEn) {
        return isEnglish() ? labelEn : labelRu;
    }

    function pageTitle() {
        const heading = document.querySelector('.main-content .page-header h1, .main-content h1');
        const value = String(heading && heading.textContent || document.title || 'Конспект')
            .replace(/\s+/g, ' ')
            .trim();
        return value || text('Конспект', 'Notes');
    }

    function preparePrintDocument() {
        if (document.body.classList.contains(PRINT_CLASS)) return;

        originalTitle = document.title;
        document.title = pageTitle() + text(' — конспект', ' — notes');
        document.body.classList.add(PRINT_CLASS);

        changedDetails = [];
        document.querySelectorAll('.main-content details:not([open])').forEach(function (details) {
            changedDetails.push(details);
            details.open = true;
        });

        document.querySelectorAll(BLOCK_SELECTOR).forEach(function (block) {
            const hasNestedBlock = Boolean(block.querySelector(BLOCK_SELECTOR));
            const hasExpandableContent = Boolean(block.querySelector(
                '.derivation-content, .proof-content, .english-translation-content, details'
            ));
            const isLong = block.scrollHeight > 620;
            block.classList.toggle(SPLITTABLE_CLASS, hasNestedBlock || hasExpandableContent || isLong);
        });

        document.querySelectorAll('.main-content .katex-display, .main-content table, .main-content pre').forEach(function (element) {
            const measured = Math.max(element.scrollWidth || 0, element.getBoundingClientRect().width || 0);
            element.classList.toggle(WIDE_CLASS, measured > 680);
            if (element.classList.contains('katex-display') && measured > 680) {
                const scale = Math.max(0.68, Math.min(1, 680 / measured));
                element.style.setProperty('--print-formula-scale', scale.toFixed(3));
            }
        });

        window.dispatchEvent(new CustomEvent('almanion:print-prepared', {
            detail: { title: pageTitle() }
        }));
    }

    function restoreDocument() {
        window.clearTimeout(cleanupTimer);
        cleanupTimer = 0;
        changedDetails.forEach(function (details) { details.open = false; });
        changedDetails = [];
        document.querySelectorAll('.' + SPLITTABLE_CLASS).forEach(function (element) {
            element.classList.remove(SPLITTABLE_CLASS);
        });
        document.querySelectorAll('.' + WIDE_CLASS).forEach(function (element) {
            element.classList.remove(WIDE_CLASS);
            element.style.removeProperty('--print-formula-scale');
        });
        document.body.classList.remove(PRINT_CLASS);
        if (originalTitle) document.title = originalTitle;
        originalTitle = '';
        exporting = false;
        updateButton(false);
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

    function button() {
        return document.getElementById('printExportButton');
    }

    function updateButton(busy) {
        const target = button();
        if (!target) return;
        target.disabled = busy;
        target.classList.toggle('is-preparing', busy);
        const label = target.querySelector('.print-export-label');
        if (label) label.textContent = busy
            ? text('Подготовка страниц…', 'Preparing pages…')
            : text('Экспорт в PDF', 'Export to PDF');
    }

    async function exportToPDF() {
        if (exporting) return;
        exporting = true;
        updateButton(true);
        preparePrintDocument();

        try {
            await waitForPrintableAssets();
            window.print();
        } catch (error) {
            console.error('Almanion print export:', error);
            restoreDocument();
        }
    }

    function createButton() {
        const footer = document.querySelector('.main-content > .page-footer');
        if (!footer || button()) return;

        const target = document.createElement('button');
        target.id = 'printExportButton';
        target.className = 'print-export-button';
        target.type = 'button';
        target.innerHTML = [
            '<svg viewBox="0 0 24 24" aria-hidden="true">',
            '<path d="M7 3.75h7l3 3V11"/>',
            '<path d="M14 3.75V7h3"/>',
            '<path d="M6 14.5h12a2 2 0 0 1 2 2v2.75H4V16.5a2 2 0 0 1 2-2Z"/>',
            '<path d="M7 19.25v1h10v-1M7.5 11h9"/>',
            '</svg>',
            '<span class="print-export-label">' + text('Экспорт в PDF', 'Export to PDF') + '</span>'
        ].join('');
        target.addEventListener('click', exportToPDF);
        footer.insertBefore(target, footer.firstChild);
    }

    function init() {
        if (!document.querySelector('.main-content') || !document.querySelector('.page-footer')) return;
        createButton();
        window.addEventListener('beforeprint', preparePrintDocument);
        window.addEventListener('afterprint', restoreDocument);
        window.addEventListener('focus', function () {
            if (!exporting || !document.body.classList.contains(PRINT_CLASS)) return;
            window.clearTimeout(cleanupTimer);
            cleanupTimer = window.setTimeout(restoreDocument, 800);
        });
    }

    window.AlmanionPrintExport = Object.freeze({
        prepare: preparePrintDocument,
        restore: restoreDocument,
        print: exportToPDF
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
