(function () {
    'use strict';
    const api = window.AlmanionBookmarks;
    if (!api) return;
    const english = document.documentElement.lang.startsWith('en');
    const t = english ? { title: 'Personal notes', edit: 'Personal note', add: 'Add a personal note', saved: 'Edit personal note', save: 'Save', remove: 'Delete note', cancel: 'Cancel', empty: 'No notes yet', search: 'Search personal notes', close: 'Close', local: 'Stored on this device. Sign in to sync.', private: 'Visible only to you', placeholder: 'Your explanation, question or common mistake…', changed: 'Account changed. Reopen the note to continue.' } : { title: 'Личные пометки', edit: 'Личная пометка', add: 'Добавить личную пометку', saved: 'Изменить личную пометку', save: 'Сохранить', remove: 'Удалить пометку', cancel: 'Отмена', empty: 'Пометок пока нет', search: 'Поиск по пометкам', close: 'Закрыть', local: 'На этом устройстве. Войдите для синхронизации.', private: 'Видно только вам', placeholder: 'Своё объяснение, вопрос или типичная ошибка…', changed: 'Аккаунт изменился. Откройте пометку заново.' };
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>';
    let dialog, selected = null, savedFocus = null, query = '', owner = null;
    function create() {
        if (dialog) return;
        dialog = document.createElement('dialog'); dialog.className = 'reader-tool-dialog personal-notes-dialog';
        dialog.setAttribute('aria-labelledby', 'personalNotesTitle');
        dialog.innerHTML = '<header class="reader-tool-header"><div><span class="reader-tool-eyebrow personal-notes-privacy"></span><h2 id="personalNotesTitle">' + t.title + '</h2></div><button class="reader-tool-icon" type="button" data-note-close aria-label="' + t.close + '">×</button></header><div class="reader-tool-body personal-notes-content"></div>';
        dialog.addEventListener('click', event => {
            if (event.target === dialog || event.target.closest('[data-note-close]')) dialog.close();
            if (event.target.closest('[data-note-back]')) { selected = null; render(); }
            if (event.target.closest('[data-note-save]')) {
                if (!selected) return;
                api.saveNote(selected.id, dialog.querySelector('textarea').value, selected.metadata);
                dialog.close();
            }
            if (event.target.closest('[data-note-delete]') && selected) { api.saveNote(selected.id, '', selected.metadata); selected = null; render(); }
            const edit = event.target.closest('[data-note-edit]');
            if (edit) { const entry = api.record(edit.dataset.noteEdit); if (entry) { selected = { id: edit.dataset.noteEdit, metadata: entry }; render(); } }
            const navigate = event.target.closest('[data-note-navigate]');
            if (navigate) { const entry = api.record(navigate.dataset.noteNavigate); if (entry) { dialog.close(); api.navigate(Object.assign({ id: navigate.dataset.noteNavigate }, entry)); } }
        });
        dialog.addEventListener('input', event => {
            if (event.target.matches('[data-note-search]')) { query = event.target.value; renderList(); }
            if (event.target.matches('textarea')) dialog.querySelector('.personal-note-count').textContent = event.target.value.length + ' / 4000';
        });
        dialog.addEventListener('close', () => { document.body.classList.remove('reader-tools-open'); savedFocus?.focus?.(); });
        document.body.append(dialog);
    }
    function renderList() {
        const list = dialog.querySelector('.personal-notes-list'); if (!list) return;
        const needle = query.toLocaleLowerCase();
        const entries = api.notes().filter(entry => [entry.title, entry.noteText, entry.pageTitle, entry.topicTitle].join(' ').toLocaleLowerCase().includes(needle));
        list.innerHTML = entries.length ? entries.map(entry => '<article class="personal-note-card"><span>' + esc(entry.pageTitle) + ' · ' + esc(entry.topicTitle) + '</span><button type="button" data-note-edit="' + esc(entry.id) + '"><strong>' + esc(entry.title) + '</strong><p>' + esc(entry.noteText) + '</p></button><button type="button" data-note-navigate="' + esc(entry.id) + '">' + (english ? 'Open block ↗' : 'К блоку ↗') + '</button></article>').join('') : '<p class="reader-tool-empty">' + t.empty + '</p>';
    }
    function render() {
        if (!dialog) return;
        dialog.querySelector('.personal-notes-privacy').textContent = window.AlmanionAccount?.getUser?.() ? t.private : t.local;
        dialog.querySelector('#personalNotesTitle').textContent = selected ? t.edit : t.title;
        const content = dialog.querySelector('.personal-notes-content');
        if (selected) {
            const record = api.record(selected.id);
            const text = record?.noteText || '';
            content.innerHTML = '<p class="personal-note-context">' + esc(selected.metadata.title || selected.metadata.topicTitle || '') + '</p><label class="reader-tool-visually-hidden" for="personalNoteText">' + t.edit + '</label><textarea id="personalNoteText" maxlength="4000" placeholder="' + t.placeholder + '"></textarea><div class="personal-note-meta"><span class="personal-note-count">' + text.length + ' / 4000</span></div><div class="personal-note-actions"><button type="button" data-note-back>' + t.cancel + '</button>' + (text ? '<button type="button" class="is-danger" data-note-delete>' + t.remove + '</button>' : '') + '<button type="button" class="reader-tool-primary" data-note-save>' + t.save + '</button></div>';
            content.querySelector('textarea').value = text;
            content.querySelector('textarea').focus();
        } else {
            content.innerHTML = '<input type="search" data-note-search aria-label="' + t.search + '" placeholder="' + t.search + '"><div class="personal-notes-list"></div>';
            content.querySelector('input').value = query; renderList();
        }
    }
    function open(box) {
        create(); selected = box ? { id: api.blockId(box), metadata: api.metadata(box) } : null;
        savedFocus = document.activeElement; owner = window.AlmanionAccount?.getUser?.()?.uid || null;
        dialog.showModal(); document.body.classList.add('reader-tools-open'); render();
    }
    function buttons(root) {
        (root || document).querySelectorAll('.has-bookmark-action, .has-personal-note-action').forEach(box => {
            if (box.parentElement?.closest(api.blockSelector) || box.closest('.kc-modal, .bookmarks-overlay, .print-container, .note-inline-editor')) return;
            let button = box.querySelector(':scope > .personal-note-btn');
            if (!button) {
                button = document.createElement('button'); button.type = 'button'; button.className = 'personal-note-btn block-action-btn'; button.innerHTML = icon;
                button.onclick = event => { event.preventDefault(); event.stopPropagation(); open(box); };
                box.classList.add('has-personal-note-action'); box.append(button);
            }
            const active = !!api.record(api.blockId(box))?.noteText;
            button.classList.toggle('has-note', active); button.title = active ? t.saved : t.add; button.setAttribute('aria-label', button.title);
        });
    }
    function start() {
        const nav = document.querySelector('.sidebar .print-export-menu-slot, .sidebar .nav-menu');
        if (nav && !document.querySelector('#personalNotesButton')) {
            const button = document.createElement('button'); button.type = 'button'; button.id = 'personalNotesButton'; button.className = 'reader-tool-menu-button'; button.innerHTML = icon + '<span>' + t.title + '</span>'; button.onclick = () => open();
            nav.matches('.nav-menu') ? nav.before(button) : nav.append(button);
        }
        buttons();
        window.addEventListener('almanion-block-actions-ready', event => buttons(event.detail?.root));
        window.addEventListener('almanion:content-ready', event => buttons(event.detail?.root));
        window.addEventListener('almanion-personal-notes-changed', () => { buttons(); if (dialog?.open && !selected) renderList(); });
        window.addEventListener('almanion-account-ready', event => {
            const next = event.detail?.user?.uid || null;
            if (dialog?.open && next !== owner) dialog.close();
            owner = next; buttons();
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
    window.AlmanionPersonalNotes = { open, refresh: buttons };
})();
