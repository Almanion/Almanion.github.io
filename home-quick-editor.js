(function (win) {
    'use strict';

    const MAX_ITEMS = 5;
    const CATEGORY_ORDER = ['grade-10-11', 'grade-10', 'grade-9', 'services', 'class-10-1', 'archive'];
    const CATEGORY_LABELS = {
        'grade-10-11': '10–11 классы',
        'grade-10': '10 класс',
        'grade-9': '9 класс',
        services: 'Дополнительно',
        'class-10-1': 'Класс 10‑1',
        archive: 'Архив'
    };
    let initialized = false;
    let draft = [];
    let restoreFocus = null;
    let dialog;
    let optionsRoot;
    let countNode;
    let hintNode;
    let saveButton;

    function dashboard() {
        return win.AlmanionHomeDashboard;
    }

    function iconMarkup(item) {
        return '<span class="home-quick-option-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#' + item.icon + '"/></svg></span>';
    }

    function optionMarkup(item) {
        const index = draft.indexOf(item.id);
        const selected = index >= 0;
        const limited = draft.length >= MAX_ITEMS && !selected;
        return '<button type="button" class="home-quick-option' + (selected ? ' is-selected' : '') + (limited ? ' is-limit' : '') +
            '" data-quick-id="' + item.id + '" data-subject="' + item.subject + '" aria-pressed="' + selected + '" aria-disabled="' + limited + '">' +
            iconMarkup(item) + '<span class="home-quick-option-copy"><strong>' + item.title + '</strong><small>' + item.context +
            '</small></span><span class="home-quick-option-order" aria-hidden="true">' + (selected ? index + 1 : '+') + '</span></button>';
    }

    function render(message) {
        const api = dashboard();
        const items = api ? api.getAvailableItems() : [];
        optionsRoot.innerHTML = CATEGORY_ORDER.map(function (category) {
            const group = items.filter(function (item) { return item.category === category; });
            if (!group.length) return '';
            return '<section class="home-quick-option-group"><h3>' + CATEGORY_LABELS[category] +
                '</h3><div class="home-quick-option-list">' + group.map(optionMarkup).join('') + '</div></section>';
        }).join('');
        countNode.textContent = draft.length + ' из ' + MAX_ITEMS;
        hintNode.textContent = message || (draft.length === MAX_ITEMS
            ? 'Выбрано максимальное количество.'
            : 'Порядок выбора станет порядком карточек.');
        hintNode.classList.toggle('is-warning', !!message);
        saveButton.disabled = draft.length === 0;
    }

    function close() {
        if (!dialog || dialog.hidden) return;
        dialog.hidden = true;
        win.document.body.classList.remove('home-quick-dialog-open');
        if (restoreFocus && restoreFocus.isConnected && restoreFocus.focus) restoreFocus.focus();
        restoreFocus = null;
    }

    function save() {
        const api = dashboard();
        if (!api || !draft.length || !api.saveSelection(draft)) return;
        close();
        if (win.AlmanionToast && typeof win.AlmanionToast.show === 'function') {
            win.AlmanionToast.show('Быстрый доступ сохранён', { type: 'success' });
        }
    }

    function onOptionClick(event) {
        const button = event.target.closest('.home-quick-option');
        if (!button || !optionsRoot.contains(button)) return;
        const id = button.dataset.quickId;
        const index = draft.indexOf(id);
        if (index >= 0) {
            draft.splice(index, 1);
            render();
        } else if (draft.length >= MAX_ITEMS) {
            render('Сначала уберите один из выбранных пунктов.');
        } else {
            draft.push(id);
            render();
        }
    }

    function init() {
        if (initialized) return true;
        const doc = win.document;
        dialog = doc.getElementById('homeQuickDialog');
        optionsRoot = doc.getElementById('homeQuickOptions');
        countNode = doc.getElementById('homeQuickCount');
        hintNode = doc.getElementById('homeQuickHint');
        saveButton = doc.getElementById('homeQuickSave');
        if (!dialog || !optionsRoot || !countNode || !hintNode || !saveButton) return false;
        initialized = true;
        optionsRoot.addEventListener('click', onOptionClick);
        saveButton.addEventListener('click', save);
        dialog.querySelectorAll('[data-home-quick-close]').forEach(function (button) { button.addEventListener('click', close); });
        dialog.addEventListener('click', function (event) { if (event.target === dialog) close(); });
        doc.addEventListener('keydown', function (event) {
            if (dialog.hidden) return;
            if (event.key === 'Escape') {
                close();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = Array.from(dialog.querySelectorAll('button:not(:disabled)'));
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && doc.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && doc.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });
        win.addEventListener('almanion-account-ready', function (event) {
            if (!event.detail || !event.detail.user) close();
        });
        return true;
    }

    function open() {
        const api = dashboard();
        const state = api && api.getState();
        if (!state || !state.user || !init()) return;
        restoreFocus = win.document.activeElement;
        draft = state.selection.slice(0, MAX_ITEMS);
        render();
        dialog.hidden = false;
        win.document.body.classList.add('home-quick-dialog-open');
        win.requestAnimationFrame(function () {
            const target = optionsRoot.querySelector('.home-quick-option.is-selected') || dialog.querySelector('[data-home-quick-close]');
            if (target) target.focus();
        });
    }

    win.AlmanionHomeQuickEditor = { open: open, close: close };
}(window));
