(function () {
    'use strict';
    const api = window.AlmanionBookmarks;
    if (!api) return;
    const english = document.documentElement.lang.startsWith('en');
    const t = english ? {
        title: 'Personal notes', edit: 'Personal note', add: 'Add a personal note', saved: 'Edit personal note', save: 'Save', remove: 'Delete note', back: 'Back to notes', empty: 'No notes yet', search: 'Search personal notes', close: 'Close', local: 'Stored on this device. Sign in to sync.', private: 'Visible only to you', placeholder: 'Your explanation, question or common mistake…', draft: 'Draft', draftSaved: 'Draft saved on this device', restored: 'Draft restored from this device', memoryOnly: 'Draft could not be saved on this device. Keep this page open or save the note.', discard: 'Discard draft', discarded: 'Draft discarded', discardError: 'Could not discard the draft. Try again.', saveError: 'Could not save the note. Your draft is still available.', cleanupError: 'The note was saved, but its draft could not be removed. Try saving again.', changed: 'Account changed. Reopen the note to continue.', emptyDraft: 'Empty draft'
    } : {
        title: 'Личные пометки', edit: 'Личная пометка', add: 'Добавить личную пометку', saved: 'Изменить личную пометку', save: 'Сохранить', remove: 'Удалить пометку', back: 'К списку', empty: 'Пометок пока нет', search: 'Поиск по пометкам', close: 'Закрыть', local: 'На этом устройстве. Войдите для синхронизации.', private: 'Видно только вам', placeholder: 'Своё объяснение, вопрос или типичная ошибка…', draft: 'Черновик', draftSaved: 'Черновик сохранён на этом устройстве', restored: 'Черновик восстановлен с этого устройства', memoryOnly: 'Не удалось сохранить черновик на устройстве. Не закрывайте страницу или сохраните пометку.', discard: 'Удалить черновик', discarded: 'Черновик удалён', discardError: 'Не удалось удалить черновик. Попробуйте ещё раз.', saveError: 'Не удалось сохранить пометку. Черновик остаётся доступен.', cleanupError: 'Пометка сохранена, но не удалось удалить её черновик. Повторите сохранение.', changed: 'Аккаунт изменился. Откройте пометку заново.', emptyDraft: 'Пустой черновик'
    };
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>';
    const DRAFT_PREFIX = 'almanion_personal_note_draft_v1:';
    // Only failed writes need an in-memory copy. Each block has its own key,
    // so edits in another tab cannot replace unrelated drafts.
    const memoryDrafts = new Map();
    let dialog, selected = null, savedFocus = null, query = '', owner = currentOwner();

    function currentOwner() { const uid = window.AlmanionAccount?.getUser?.()?.uid; return uid ? 'uid:' + uid : 'guest'; }
    function ownerPrefix(value) { return DRAFT_PREFIX + encodeURIComponent(value) + ':'; }
    function draftKey(value, id) { return ownerPrefix(value) + encodeURIComponent(id); }
    function cleanMetadata(value) {
        const result = {};
        for (const key of ['page', 'pageTitle', 'topicId', 'topicTitle', 'blockKey', 'title', 'excerpt', 'preview', 'type']) {
            if (typeof value?.[key] === 'string') result[key] = value[key].slice(0, 2000);
        }
        return result;
    }
    function readDraft(value, id) {
        const key = draftKey(value, id);
        if (memoryDrafts.has(key)) return memoryDrafts.get(key);
        try {
            const draft = JSON.parse(localStorage.getItem(key));
            if (draft?.version === 1 && draft.id === id && typeof draft.text === 'string' && draft.text.length <= 4000) {
                return { version: 1, id, text: draft.text, metadata: cleanMetadata(draft.metadata), updatedAt: Number(draft.updatedAt) || 0 };
            }
        } catch (_) {}
        return null;
    }
    function writeDraft(value, id, text, metadata) {
        const key = draftKey(value, id);
        const draft = { version: 1, id, text: String(text).slice(0, 4000), metadata: cleanMetadata(metadata), updatedAt: Date.now() };
        const serialized = JSON.stringify(draft);
        try {
            localStorage.setItem(key, serialized);
            if (localStorage.getItem(key) !== serialized) throw new Error('Draft not persisted');
            memoryDrafts.delete(key);
            return true;
        } catch (_) { memoryDrafts.set(key, draft); return false; }
    }
    function removeDraft(value, id) {
        const key = draftKey(value, id);
        try {
            localStorage.removeItem(key);
            if (localStorage.getItem(key) !== null) return false;
            memoryDrafts.delete(key);
            return true;
        } catch (_) { return false; }
    }
    function drafts(value) {
        const prefix = ownerPrefix(value), ids = new Set();
        try {
            for (let index = 0; index < localStorage.length; index++) {
                const key = localStorage.key(index);
                if (key?.startsWith(prefix)) {
                    try { ids.add(decodeURIComponent(key.slice(prefix.length))); } catch (_) {}
                }
            }
        } catch (_) {}
        for (const [key, draft] of memoryDrafts) if (key.startsWith(prefix)) ids.add(draft.id);
        return Array.from(ids, id => readDraft(value, id)).filter(Boolean);
    }
    function noteEntries() {
        const entries = new Map(api.notes().map(entry => [entry.id, entry]));
        for (const draft of drafts(owner)) {
            entries.set(draft.id, Object.assign({}, draft.metadata, api.record(draft.id), { id: draft.id, noteText: draft.text, updatedAt: draft.updatedAt, draft: true }));
        }
        return Array.from(entries.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }
    function updateEditorStatus(message) {
        const text = dialog.querySelector('textarea');
        if (!selected || !text) return;
        dialog.querySelector('.personal-note-count').textContent = text.value.length + ' / 4000';
        const discard = dialog.querySelector('[data-note-discard]');
        discard.hidden = !readDraft(selected.owner, selected.id);
        // Reader button styles set display explicitly, overriding UA [hidden].
        discard.style.display = discard.hidden ? 'none' : '';
        dialog.querySelector('.personal-note-draft-status').textContent = message || '';
    }
    function persistEditor() {
        const text = dialog?.querySelector('textarea');
        if (!selected || !text) return true;
        selected.text = text.value;
        // A failed note save may update bookmarks in memory. Reopening that
        // editor must not mistake the memory-only value for a durable baseline.
        const unconfirmedDraft = readDraft(selected.owner, selected.id)
            && (selected.owner !== currentOwner() || api.noteSavedOnDevice?.(selected.id, selected.originalText) !== true);
        const dirty = selected.text !== selected.originalText || !!unconfirmedDraft;
        const stored = dirty
            ? writeDraft(selected.owner, selected.id, selected.text, selected.metadata)
            : removeDraft(selected.owner, selected.id);
        updateEditorStatus(stored ? (dirty ? t.draftSaved : '') : t.memoryOnly);
        return stored;
    }
    function saveNote(text) {
        if (!selected || selected.owner !== currentOwner()) { updateEditorStatus(t.changed); return false; }
        persistEditor();
        try {
            if (!api.saveNote(selected.id, text, selected.metadata)) throw new Error('Note not persisted');
            // A failed save must not dismiss the editor or delete its draft.
            if ((api.record(selected.id)?.noteText || '') !== String(text || '').trim().slice(0, 4000)) throw new Error('Note not saved');
        } catch (_) { updateEditorStatus(t.saveError); return false; }
        if (!removeDraft(selected.owner, selected.id)) { updateEditorStatus(t.cleanupError); return false; }
        return true;
    }
    function selectNote(id, metadata) {
        const value = currentOwner(), record = api.record(id), draft = readDraft(value, id);
        const originalText = record?.noteText || '';
        selected = { id, owner: value, metadata: cleanMetadata(Object.assign({}, draft?.metadata, metadata, record)), originalText, text: draft ? draft.text : originalText, restored: !!draft };
    }
    function closeDialog() {
        persistEditor();
        dialog.close();
    }
    function create() {
        if (dialog) return;
        dialog = document.createElement('dialog'); dialog.className = 'reader-tool-dialog personal-notes-dialog';
        dialog.setAttribute('aria-labelledby', 'personalNotesTitle');
        dialog.innerHTML = '<header class="reader-tool-header"><div><span class="reader-tool-eyebrow personal-notes-privacy"></span><h2 id="personalNotesTitle">' + t.title + '</h2></div><button class="reader-tool-icon" type="button" data-note-close aria-label="' + t.close + '">×</button></header><div class="reader-tool-body personal-notes-content"></div>';
        dialog.addEventListener('click', event => {
            if (event.target === dialog || event.target.closest('[data-note-close]')) { closeDialog(); return; }
            if (event.target.closest('[data-note-back]')) { persistEditor(); selected = null; render(); }
            if (event.target.closest('[data-note-save]')) {
                if (!selected) return;
                if (saveNote(dialog.querySelector('textarea').value)) { selected = null; dialog.close(); }
            }
            if (event.target.closest('[data-note-delete]') && selected && saveNote('')) { selected = null; render(); }
            if (event.target.closest('[data-note-discard]') && selected) {
                if (!removeDraft(selected.owner, selected.id)) { updateEditorStatus(t.discardError); return; }
                selected.originalText = api.record(selected.id)?.noteText || '';
                selected.text = selected.originalText;
                selected.restored = false;
                render(); updateEditorStatus(t.discarded);
            }
            const edit = event.target.closest('[data-note-edit]');
            if (edit) { const entry = noteEntries().find(entry => entry.id === edit.dataset.noteEdit); if (entry) { selectNote(entry.id, entry); render(); } }
            const navigate = event.target.closest('[data-note-navigate]');
            if (navigate) { const entry = noteEntries().find(entry => entry.id === navigate.dataset.noteNavigate); if (entry) { closeDialog(); api.navigate(entry); } }
        });
        dialog.addEventListener('input', event => {
            if (event.target.matches('[data-note-search]')) { query = event.target.value; renderList(); }
            if (event.target.matches('textarea')) persistEditor();
        });
        dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
        dialog.addEventListener('close', () => {
            if (dialog.open) return;
            persistEditor();
            selected = null;
            document.body.classList.remove('reader-tools-open'); savedFocus?.focus?.();
        });
        document.body.append(dialog);
    }
    function renderList() {
        const list = dialog.querySelector('.personal-notes-list'); if (!list) return;
        const needle = query.toLocaleLowerCase();
        const entries = noteEntries().filter(entry => [entry.title, entry.noteText, entry.pageTitle, entry.topicTitle].join(' ').toLocaleLowerCase().includes(needle));
        list.innerHTML = entries.length ? entries.map(entry => '<article class="personal-note-card"><span>' + esc([entry.pageTitle, entry.topicTitle].filter(Boolean).join(' · ')) + (entry.draft ? ' · ' + t.draft : '') + '</span><button type="button" data-note-edit="' + esc(entry.id) + '"><strong>' + esc(entry.title || entry.topicTitle || t.edit) + '</strong><p>' + esc(entry.noteText || (entry.draft ? t.emptyDraft : '')) + '</p></button><button type="button" data-note-navigate="' + esc(entry.id) + '">' + (english ? 'Open block ↗' : 'К блоку ↗') + '</button></article>').join('') : '<p class="reader-tool-empty">' + t.empty + '</p>';
    }
    function render() {
        if (!dialog) return;
        dialog.querySelector('.personal-notes-privacy').textContent = window.AlmanionAccount?.getUser?.() ? t.private : t.local;
        dialog.querySelector('#personalNotesTitle').textContent = selected ? t.edit : t.title;
        const content = dialog.querySelector('.personal-notes-content');
        if (selected) {
            content.innerHTML = '<p class="personal-note-context">' + esc(selected.metadata.title || selected.metadata.topicTitle || '') + '</p><label class="reader-tool-visually-hidden" for="personalNoteText">' + t.edit + '</label><textarea id="personalNoteText" maxlength="4000" placeholder="' + t.placeholder + '"></textarea><div class="personal-note-meta"><span class="personal-note-count"></span></div><p class="personal-note-draft-status" role="status" aria-live="polite"></p><div class="personal-note-actions"><button type="button" data-note-back>' + t.back + '</button><button type="button" class="is-danger" data-note-discard hidden>' + t.discard + '</button>' + (selected.originalText ? '<button type="button" class="is-danger" data-note-delete>' + t.remove + '</button>' : '') + '<button type="button" class="reader-tool-primary" data-note-save>' + t.save + '</button></div>';
            content.querySelector('textarea').value = selected.text;
            updateEditorStatus(memoryDrafts.has(draftKey(selected.owner, selected.id)) ? t.memoryOnly : selected.restored ? t.restored : '');
            content.querySelector('textarea').focus();
        } else {
            content.innerHTML = '<input type="search" data-note-search aria-label="' + t.search + '" placeholder="' + t.search + '"><div class="personal-notes-list"></div>';
            content.querySelector('input').value = query; renderList();
        }
    }
    function open(box) {
        create();
        if (dialog.open) persistEditor();
        selected = null; owner = currentOwner();
        if (box) selectNote(api.blockId(box), api.metadata(box));
        savedFocus = document.activeElement;
        if (!dialog.open) dialog.showModal();
        document.body.classList.add('reader-tools-open'); render();
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
        window.addEventListener('pagehide', persistEditor);
        window.addEventListener('almanion-account-ready', event => {
            const next = event.detail?.user?.uid ? 'uid:' + event.detail.user.uid : 'guest';
            if (next !== owner) {
                if (dialog?.open) closeDialog();
                selected = null;
                query = '';
                // Do not leave the previous owner's text in a closed DOM tree.
                if (dialog) dialog.querySelector('.personal-notes-content').replaceChildren();
            }
            owner = next; buttons();
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
    window.AlmanionPersonalNotes = { open, refresh: buttons };
})();
