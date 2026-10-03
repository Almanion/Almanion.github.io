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
    panel.innerHTML = '<summary>' + (english ? 'Show blocks' : 'Показывать блоки') +
        '<span class="note-filter-count"></span></summary><div class="note-filter-options"></div>' +
        '<button type="button" class="note-filter-reset">' + (english ? 'Show all' : 'Показать всё') + '</button>';
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
        panel.querySelector('.note-filter-count').textContent = selected === null ? '' : (english ? 'Filter on' : 'Фильтр включён');
        window.dispatchEvent(new CustomEvent('almanion:note-filter-changed'));
    }
    function renderOptions() {
        const available = types.filter(type => main.querySelector(type[3]));
        available.push(['text', 'Остальной текст', 'Other text']);
        const options = panel.querySelector('.note-filter-options');
        options.replaceChildren();
        available.forEach(type => {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'checkbox'; input.value = type[0];
            label.append(input, document.createTextNode(type[english ? 2 : 1]));
            options.appendChild(label);
        });
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
    panel.querySelector('button').addEventListener('click', () => { selected = null; save(); });
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
