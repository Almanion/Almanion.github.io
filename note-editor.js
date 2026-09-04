(function () {
    'use strict';

    const EDIT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>';
    const BACK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
    let subject = null;
    let overlay = null;
    let lastTrigger = null;
    let accessGeneration = 0;

    function fileName(path) {
        return decodeURIComponent(String(path || '').split('/').pop() || 'index.html').toLowerCase();
    }

    async function resolveSubject() {
        const page = fileName(location.pathname);
        const response = await fetch('content/subjects.json?v=' + Date.now(), { cache: 'no-store' });
        if (!response.ok) throw new Error('Не удалось загрузить список предметов');
        const subjects = await response.json();
        return subjects.find(item => fileName(item.page) === page) || null;
    }

    function editableTargets() {
        return Array.from(document.querySelectorAll('.constructor-content-section[data-constructor-section]')).flatMap(section => {
            const topics = Array.from(section.querySelectorAll(':scope > .constructor-topic[id], :scope > .topic[id]'));
            return topics.length ? topics : [section];
        });
    }

    function contextFor(target) {
        const section = target.matches('[data-constructor-section]') ? target : target.closest('[data-constructor-section]');
        const sectionId = section && section.dataset.constructorSection;
        const topicId = target.id || '';
        return {
            sectionId: sectionId || '',
            subsectionId: topicId && topicId !== sectionId ? topicId : '',
            title: (target.querySelector(':scope > .topic-title, :scope > .part-title') || target).textContent.trim().replace(/\s+/g, ' ')
        };
    }

    function constructorUrl(context, embedded) {
        const url = new URL('constructor.html', location.href);
        url.searchParams.set('subject', subject.id);
        url.searchParams.set('section', context.sectionId);
        if (context.subsectionId) url.searchParams.set('subsection', context.subsectionId);
        url.searchParams.set('return', location.pathname + location.search + location.hash);
        if (embedded) url.searchParams.set('embedded', '1');
        return url.href;
    }

    function closeEditor() {
        if (!overlay) return;
        const closing = overlay;
        overlay = null;
        closing.classList.remove('is-open');
        document.body.classList.remove('note-editor-open');
        window.setTimeout(() => closing.remove(), 210);
        if (lastTrigger && lastTrigger.isConnected) lastTrigger.focus();
    }

    function openEditor(context, trigger) {
        closeEditor();
        lastTrigger = trigger;
        const frameUrl = constructorUrl(context, true);
        const externalUrl = constructorUrl(context, false);
        overlay = document.createElement('div');
        overlay.className = 'note-editor-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Редактирование конспекта');
        overlay.innerHTML = '<div class="note-editor-panel">' +
            '<div class="note-editor-bar">' +
                '<button class="note-editor-close" type="button">' + BACK_ICON + '<span>К конспекту</span></button>' +
                '<span class="note-editor-title"></span>' +
                '<a class="note-editor-external" target="_blank" rel="noopener">Открыть отдельно ↗</a>' +
            '</div>' +
            '<iframe class="note-editor-frame" title="Конструктор конспектов"></iframe>' +
        '</div>';
        overlay.querySelector('.note-editor-title').textContent = context.title || 'Текущий раздел';
        overlay.querySelector('.note-editor-external').href = externalUrl;
        overlay.querySelector('.note-editor-frame').src = frameUrl;
        overlay.querySelector('.note-editor-close').addEventListener('click', closeEditor);
        overlay.addEventListener('mousedown', event => { if (event.target === overlay) closeEditor(); });
        document.body.appendChild(overlay);
        document.body.classList.add('note-editor-open');
        window.requestAnimationFrame(() => overlay && overlay.classList.add('is-open'));
        overlay.querySelector('.note-editor-close').focus();
    }

    function addButtons() {
        editableTargets().forEach(target => {
            if (target.querySelector(':scope > .note-inline-edit-button')) return;
            const context = contextFor(target);
            if (!context.sectionId) return;
            target.classList.add('note-inline-editable');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'note-inline-edit-button';
            button.setAttribute('aria-label', 'Редактировать этот раздел');
            button.title = 'Редактировать этот раздел';
            button.innerHTML = EDIT_ICON + '<span>Редактировать</span>';
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                openEditor(context, button);
            });
            target.insertBefore(button, target.firstChild);
        });
    }

    function removeButtons() {
        document.querySelectorAll('.note-inline-edit-button').forEach(button => button.remove());
        document.querySelectorAll('.note-inline-editable').forEach(node => node.classList.remove('note-inline-editable'));
        closeEditor();
    }

    async function updateAccess(user) {
        const generation = ++accessGeneration;
        if (!user || !subject) return removeButtons();
        const account = window.AlmanionAccount;
        const allowed = account && typeof account.hasContentEditorAccess === 'function'
            ? await account.hasContentEditorAccess(user)
            : false;
        if (generation !== accessGeneration) return;
        if (allowed) addButtons();
        else removeButtons();
    }

    async function start() {
        const localDemo = (location.hostname === '127.0.0.1' || location.hostname === 'localhost')
            && new URLSearchParams(location.search).get('editor-demo') === '1';
        if (!editableTargets().length || (!window.AlmanionAccount && !localDemo)) return;
        try {
            subject = await resolveSubject();
        } catch (error) {
            console.warn('Inline note editor:', error);
            return;
        }
        if (!subject) return;
        if (localDemo) {
            addButtons();
            return;
        }
        window.AlmanionAccount.auth.onAuthStateChanged(updateAccess, error => {
            console.warn('Inline note editor auth:', error);
            removeButtons();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && overlay) closeEditor();
        });
        window.addEventListener('message', event => {
            if (event.origin !== location.origin || !event.data || !overlay) return;
            if (event.data.type === 'note-constructor:close') closeEditor();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
