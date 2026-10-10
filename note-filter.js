(function () {
    'use strict';
    // Stress words already have a part-of-speech selector. The generic block
    // filter only offered "Other text" here and could hide the entire dictionary.
    if (document.body?.dataset.noteSubject === 'russian-ege') {
        try { localStorage.removeItem('note-block-filter:' + location.pathname); } catch (_) {}
        return;
    }
    function init() {
    if (window.AlmanionNoteFilter) return;
    const main = document.querySelector('.main-content');
    if (!main) return;
    const english = document.documentElement.lang === 'en';
    const types = [
        ['definition', 'Определения', 'Definitions', '.definition-box,.english-word-card'],
        ['statement', 'Формулировки', 'Statements', '.theorem-box,.lemma-box,.statement-box'],
        ['formula', 'Формулы', 'Formulas', '.formula-box,.system-box'],
        ['corollary', 'Следствия и свойства', 'Corollaries and properties', '.corollary-box,.properties-box'],
        ['proof', 'Доказательства', 'Proofs', '.proof-box'],
        ['derivation', 'Выводы', 'Derivations', '.derivation-box'],
        ['experiment', 'Опыты', 'Experiments', '.experiment-box'],
        ['remark', 'Замечания', 'Remarks', '.remark-box,.reminder-box'],
        ['example', 'Примеры и задачи', 'Examples and exercises', '.example-box,.exercise-box']
    ];
    const selector = types.map(type => type[3]).join(',');
    const key = 'note-block-filter:' + location.pathname;
    let selected = null; // null means all, including types added later.
    try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (Array.isArray(saved)) selected = new Set(saved);
    } catch (_) {}
    const panel = document.createElement('details');
    panel.className = 'note-filter';
    panel.innerHTML = '<summary>' +
        '<svg class="note-filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="var(--bg-secondary)"/><circle cx="15" cy="17" r="2" fill="var(--bg-secondary)"/></svg>' +
        '<span class="note-filter-title">' + (english ? 'Show blocks' : 'Показывать блоки') + '</span>' +
        '<span class="note-filter-count"></span>' +
        '<svg class="note-filter-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary>' +
        '<div class="note-filter-popover"><div class="note-filter-options" role="group" aria-label="' + (english ? 'Block types' : 'Типы блоков') + '"></div>' +
        '<div class="note-filter-actions"><button type="button" class="note-filter-reset">' + (english ? 'Show all' : 'Показать всё') + '</button>' +
        '<button type="button" class="note-filter-done">' + (english ? 'Done' : 'Готово') + '</button></div></div>';
    const first = main.querySelector(':scope > .content-section');
    if (!first) return;
    const controls = main.querySelector(':scope > .note-reader-controls');
    if (controls) controls.appendChild(panel);
    else main.insertBefore(panel, first);

    function apply() {
        main.querySelectorAll('[data-note-filter-hidden],[data-note-filter-shell]').forEach(el => {
            el.removeAttribute('data-note-filter-hidden');
            el.removeAttribute('data-note-filter-shell');
        });
        main.querySelectorAll('.note-filter-empty').forEach(el => el.remove());
        if (selected !== null) {
            function visit(el, inherited, headingContext) {
                if (el.matches('.note-filter-empty')) return false;
                const type = types.find(type => el.matches(type[3]));
                const allowed = type ? selected.has(type[0]) : inherited;
                const hasBlocks = !!el.querySelector(selector);
                if (!hasBlocks && !el.matches('.topic')) {
                    const keep = allowed || (headingContext && el.matches('h2,h3,h4,.part-title-row,.topic-title,.subsection-title'));
                    if (!keep) el.setAttribute('data-note-filter-hidden', '');
                    return keep;
                }
                // Preserve nodes/listeners; only unwrap an excluded container visually.
                // Text nodes need an element so they can be hidden without deleting content.
                if (!allowed) Array.from(el.childNodes).forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                        const span = document.createElement('span');
                        node.replaceWith(span);
                        span.appendChild(node);
                    }
                });
                let any = allowed;
                Array.from(el.children).forEach(child => {
                    any = visit(child, allowed, headingContext && !type) || any;
                });
                if (!any) el.setAttribute('data-note-filter-hidden', '');
                else if (type && !allowed) el.setAttribute('data-note-filter-shell', '');
                return any;
            }
            main.querySelectorAll(':scope > .content-section').forEach(section => {
                Array.from(section.children).forEach(el => visit(el, selected.has('text'), true));
                const topics = section.querySelectorAll(':scope > .topic');
                (topics.length ? Array.from(topics) : [section]).forEach(topic => {
                    const found = Array.from(topic.querySelectorAll(selector)).some(el =>
                        !el.closest('[data-note-filter-hidden]') && !el.hasAttribute('data-note-filter-shell'));
                    if (!found && !selected.has('text')) {
                        topic.removeAttribute('data-note-filter-hidden');
                        const empty = document.createElement('p');
                        empty.className = 'note-filter-empty';
                        empty.textContent = english ? 'No selected block types in this section.' : 'В этом разделе нет выбранных типов блоков.';
                        topic.appendChild(empty);
                    }
                });
            });
        }
        panel.querySelectorAll('input').forEach(input => { input.checked = selected === null || selected.has(input.value); });
        const inputs = Array.from(panel.querySelectorAll('input'));
        const count = panel.querySelector('.note-filter-count');
        const checked = inputs.filter(input => input.checked).length;
        count.textContent = selected === null ? (english ? 'All' : 'Все') : checked + '/' + inputs.length;
        count.setAttribute('aria-label', english ? checked + ' of ' + inputs.length + ' types selected' : 'Выбрано типов: ' + checked + ' из ' + inputs.length);
        panel.dataset.active = String(selected !== null);
        panel.querySelector('.note-filter-reset').disabled = selected === null;
        window.dispatchEvent(new CustomEvent('almanion:note-filter-changed'));
    }
    function renderOptions() {
        const available = types.filter(type => main.querySelector(type[3]));
        available.push(['text', 'Остальной текст', 'Other text']);
        const options = panel.querySelector('.note-filter-options');
        const focused = options.contains(document.activeElement) ? document.activeElement.value : null;
        options.replaceChildren();
        available.forEach(type => {
            const label = document.createElement('label');
            label.className = 'note-filter-option';
            label.dataset.type = type[0];
            const input = document.createElement('input');
            input.type = 'checkbox'; input.value = type[0];
            const swatch = document.createElement('span');
            swatch.className = 'note-filter-swatch'; swatch.setAttribute('aria-hidden', 'true');
            const name = document.createElement('span');
            name.className = 'note-filter-option-name'; name.textContent = type[english ? 2 : 1];
            const check = document.createElement('span');
            check.className = 'note-filter-check'; check.setAttribute('aria-hidden', 'true');
            label.append(input, swatch, name, check);
            options.appendChild(label);
            if (focused === type[0]) input.focus({ preventScroll: true });
        });
        scheduleFit();
    }
    function save() {
        try { localStorage.setItem(key, JSON.stringify(selected === null ? null : Array.from(selected))); } catch (_) {}
        apply();
    }
    panel.addEventListener('change', () => {
        selected = new Set(Array.from(panel.querySelectorAll('input:checked'), input => input.value));
        if (selected.size === panel.querySelectorAll('input').length) selected = null;
        save();
    });
    panel.querySelector('.note-filter-reset').addEventListener('click', () => {
        // Reset becomes disabled after restoring all types. Keep focus inside
        // the picker so this does not accidentally count as leaving the menu.
        panel.querySelector('.note-filter-done').focus({ preventScroll: true });
        selected = null; save();
    });
    const summary = panel.querySelector('summary');
    function close(restoreFocus) {
        panel.open = false;
        if (restoreFocus) summary.focus({ preventScroll: true });
    }
    panel.querySelector('.note-filter-done').addEventListener('click', () => close(true));
    document.addEventListener('pointerdown', event => {
        if (panel.open && !panel.contains(event.target)) close(false);
    }, { capture: true, passive: true });
    document.addEventListener('keydown', event => {
        if (!panel.open || event.key !== 'Escape') return;
        event.preventDefault(); event.stopPropagation(); close(true);
    }, true);
    panel.addEventListener('focusout', event => {
        if (event.relatedTarget) {
            if (!panel.contains(event.relatedTarget)) close(false);
        } else {
            // Focusin follows focusout; a microtask can run between the two and
            // prematurely hide a checkbox or the Done button being focused.
            setTimeout(() => { if (panel.open && !panel.contains(document.activeElement)) close(false); }, 0);
        }
    });
    // Match the available screen space, including reading zoom and the mobile dock.
    // Only the options scroll; the two footer actions remain reachable.
    let fitFrame = 0;
    function fitPopover() {
        fitFrame = 0;
        if (!panel.open) return;
        const popover = panel.querySelector('.note-filter-popover');
        const scale = popover.getBoundingClientRect().width / popover.offsetWidth || 1;
        const anchor = panel.getBoundingClientRect();
        const dock = document.querySelector('.exp-bottom-nav');
        const dockRect = dock?.getBoundingClientRect();
        const bottom = dockRect?.height && getComputedStyle(dock).position === 'fixed' ? dockRect.top : innerHeight;
        const below = bottom - anchor.bottom - 8 * scale - 12;
        const above = anchor.top - 8 * scale - 12;
        const up = below < 160 * scale && above > below;
        popover.dataset.side = up ? 'up' : 'down';
        popover.style.maxHeight = Math.max(88, (up ? above : below) / scale) + 'px';
    }
    function scheduleFit() {
        if (!fitFrame) fitFrame = requestAnimationFrame(fitPopover);
    }
    panel.addEventListener('toggle', scheduleFit);
    window.addEventListener('resize', scheduleFit, { passive: true });
    document.addEventListener('scroll', () => { if (panel.open) scheduleFit(); }, { capture: true, passive: true });
    renderOptions(); apply();
    let timer;
    new MutationObserver(records => {
        if (!records.some(record => Array.from(record.addedNodes).some(node => node.nodeType === 1 &&
            (node.matches(selector + ',.content-section,.topic') || node.querySelector(selector))))) return;
        clearTimeout(timer);
        timer = setTimeout(() => { renderOptions(); apply(); }, 80);
    }).observe(main, { childList: true, subtree: true });
    window.AlmanionNoteFilter = { reset: () => { selected = null; save(); }, active: () => selected !== null, refresh: apply };
    }
    init();
    // English notes arrive only after the protected content has loaded.
    if (!window.AlmanionNoteFilter) {
        const observer = new MutationObserver(() => {
            init();
            if (window.AlmanionNoteFilter) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
})();
