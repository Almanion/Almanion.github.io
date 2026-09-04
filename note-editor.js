(function () {
    'use strict';

    const EDIT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>';
    const OPEN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5"/><path d="m10 14 9-9"/><path d="M19 13v6H5V5h6"/></svg>';
    const CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    const TYPE_GROUPS = [
        { title: 'Основное', types: ['paragraph', 'heading', 'list', 'formula', 'image'] },
        { title: 'Учебные блоки', types: ['definition', 'theorem', 'lemma', 'statement', 'corollary', 'properties', 'proof', 'derivation', 'example', 'exercise', 'experiment', 'remark', 'reminder'] }
    ];
    const FALLBACK_TYPE_LABELS = {
        paragraph: 'Текст', heading: 'Малый заголовок', list: 'Список', formula: 'Формула', image: 'Изображение',
        definition: 'Определение', theorem: 'Теорема', lemma: 'Лемма', statement: 'Утверждение', corollary: 'Следствие',
        properties: 'Свойства', proof: 'Доказательство', derivation: 'Вывод', example: 'Пример', exercise: 'Упражнение',
        experiment: 'Эксперимент', remark: 'Замечание', reminder: 'Напоминание'
    };
    const TITLE_TYPES = new Set(['theorem', 'lemma', 'statement', 'corollary', 'properties', 'proof', 'example', 'exercise', 'experiment', 'reminder']);
    const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);
    let subject = null;
    let currentUser = null;
    let session = null;
    let dependenciesPromise = null;
    let accessGeneration = 0;
    let isLocalDemo = false;

    function fileName(path) {
        return decodeURIComponent(String(path || '').split('/').pop() || 'index.html').toLowerCase();
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function versionOf(section) {
        if (!section) return null;
        return {
            revision: Number(section.revision) || 0,
            updatedAt: Number(section.updatedAt) || 0,
            updatedBy: String(section.updatedBy || '')
        };
    }

    function sameVersion(section, expected) {
        if (!section || !expected) return !section && !expected;
        const actual = versionOf(section);
        return actual.revision === expected.revision
            && actual.updatedAt === expected.updatedAt
            && actual.updatedBy === expected.updatedBy;
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

    function constructorUrl(context) {
        const url = new URL('constructor.html', location.href);
        url.searchParams.set('subject', subject.id);
        url.searchParams.set('section', context.sectionId);
        if (context.subsectionId) url.searchParams.set('subsection', context.subsectionId);
        url.searchParams.set('return', location.pathname + location.search + location.hash);
        return url.href;
    }

    function loadScript(src, ready) {
        if (ready()) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-note-editor-src="' + src + '"]');
            if (existing) {
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', reject, { once: true });
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.dataset.noteEditorSrc = src;
            script.addEventListener('load', resolve, { once: true });
            script.addEventListener('error', () => reject(new Error('Не удалось загрузить ' + src)), { once: true });
            document.head.appendChild(script);
        });
    }

    function loadDependencies() {
        if (!dependenciesPromise) {
            dependenciesPromise = loadScript('constructor/model.js?v=20260904-inline-2', () => !!window.NoteModel)
                .then(() => loadScript('constructor/storage.js?v=20260904-inline-2', () => !!window.NoteStorage));
        }
        return dependenciesPromise;
    }

    function typeLabel(type) {
        const modelType = window.NoteModel && window.NoteModel.BLOCK_TYPES[type];
        return modelType && modelType.label || FALLBACK_TYPE_LABELS[type] || type;
    }

    async function fetchPublished(sectionId) {
        const response = await fetch('content/' + encodeURIComponent(subject.id) + '/sections/' + encodeURIComponent(sectionId) + '.json?v=' + Date.now(), { cache: 'no-store' });
        if (!response.ok) throw new Error(response.status === 404 ? 'Этот раздел ещё не переведён в формат конструктора' : 'Не удалось загрузить раздел');
        const raw = await response.json();
        return { raw, section: window.NoteModel.normalizeSection(raw, subject.id), timestamp: Number(raw.updatedAt) || 0 };
    }

    async function loadSection(context) {
        const published = await fetchPublished(context.sectionId);
        const localPromise = window.NoteStorage.listDrafts(currentUser.uid, subject.id).catch(() => []);
        const remotePromise = isLocalDemo
            ? Promise.resolve(null)
            : window.AlmanionAccount.database.ref('noteDrafts/' + subject.id + '/' + context.sectionId).once('value')
                .then(snapshot => snapshot.val() || null)
                .catch(() => null);
        const results = await Promise.all([localPromise, remotePromise]);
        const localEntry = results[0].find(entry => entry && entry.id === context.sectionId);
        const remoteRaw = results[1];
        const candidates = [published];
        if (localEntry && localEntry.section) {
            candidates.push({
                raw: localEntry.section,
                section: window.NoteModel.normalizeSection(localEntry.section, subject.id),
                timestamp: Number(localEntry.updatedAt || localEntry.section.updatedAt) || 0
            });
        }
        if (remoteRaw) {
            candidates.push({
                raw: remoteRaw,
                section: window.NoteModel.normalizeSection(remoteRaw, subject.id),
                timestamp: Number(remoteRaw.updatedAt) || 0
            });
        }
        candidates.sort((a, b) => b.timestamp - a.timestamp);
        return {
            section: clone(candidates[0].section),
            remoteVersion: versionOf(remoteRaw),
            source: candidates[0] === published ? 'published' : (candidates[0].raw === remoteRaw ? 'cloud' : 'local')
        };
    }

    function activeDocument() {
        if (!session) return null;
        if (!session.context.subsectionId) return session.section;
        return (session.section.subsections || []).find(item => item.id === session.context.subsectionId) || null;
    }

    function activeTree() {
        const document = activeDocument();
        if (!document) return { blocks: [] };
        if (session.context.subsectionId) {
            document.children = Array.isArray(document.children) ? document.children : [];
            return { blocks: document.children };
        }
        session.section.blocks = Array.isArray(session.section.blocks) ? session.section.blocks : [];
        return { blocks: session.section.blocks };
    }

    function blockLocation(id) {
        return window.NoteModel.findLocation(activeTree().blocks, id, null, 0);
    }

    function inputField(label, field, value, options) {
        const opts = options || {};
        return '<label class="note-inline-field' + (opts.wide ? ' is-wide' : '') + '">' +
            '<span>' + escapeHtml(label) + '</span>' +
            '<textarea class="note-inline-input' + (opts.mono ? ' is-mono' : '') + '" data-field="' + escapeHtml(field) + '"' +
            (opts.blockId ? ' data-block-id="' + escapeHtml(opts.blockId) + '"' : '') +
            ' rows="' + (opts.rows || 3) + '"' +
            (opts.placeholder ? ' placeholder="' + escapeHtml(opts.placeholder) + '"' : '') + '>' + escapeHtml(value) + '</textarea>' +
        '</label>';
    }

    function textInputField(label, field, value, options) {
        const opts = options || {};
        return '<label class="note-inline-field' + (opts.wide ? ' is-wide' : '') + '">' +
            '<span>' + escapeHtml(label) + '</span>' +
            '<input class="note-inline-input' + (opts.mono ? ' is-mono' : '') + '" type="text" data-field="' + escapeHtml(field) + '"' +
            (opts.blockId ? ' data-block-id="' + escapeHtml(opts.blockId) + '"' : '') +
            (opts.placeholder ? ' placeholder="' + escapeHtml(opts.placeholder) + '"' : '') +
            ' value="' + escapeHtml(value) + '">' +
        '</label>';
    }

    function blockFields(block) {
        const id = block.id;
        if (block.type === 'definition') {
            return '<div class="note-inline-field-grid is-definition">' +
                textInputField('Термин', 'term', block.term || '', { blockId: id, placeholder: 'Первый закон Ньютона' }) +
                '<label class="note-inline-field is-separator"><span>Разделитель</span><select class="note-inline-input" data-field="separator" data-block-id="' + escapeHtml(id) + '">' +
                    '<option value="—"' + (block.separator !== ':' ? ' selected' : '') + '>—</option><option value=":"' + (block.separator === ':' ? ' selected' : '') + '>:</option>' +
                '</select></label>' +
                inputField('Определение', 'content', block.content || '', { blockId: id, rows: 4, wide: true, placeholder: 'Содержание определения' }) +
            '</div>';
        }
        if (block.type === 'formula') {
            return inputField('LaTeX', 'latex', block.latex || '', { blockId: id, rows: 3, mono: true, wide: true, placeholder: '\\frac{a}{b}' });
        }
        if (block.type === 'list') {
            return inputField('Пункты — по одному на строку', 'items', (block.items || []).join('\n'), { blockId: id, rows: 4, wide: true });
        }
        if (block.type === 'image') {
            return '<div class="note-inline-field-grid">' +
                textInputField('Путь к изображению', 'src', block.src || '', { blockId: id, wide: true, placeholder: 'images/notes/…' }) +
                textInputField('Описание', 'alt', block.alt || '', { blockId: id }) +
                textInputField('Подпись', 'caption', block.caption || '', { blockId: id }) +
            '</div><p class="note-inline-hint">Загрузить новый файл и выбрать папку можно в полном конструкторе.</p>';
        }
        if (block.type === 'heading') {
            return textInputField('Заголовок', 'title', block.title || block.content || '', { blockId: id, wide: true });
        }
        const title = TITLE_TYPES.has(block.type)
            ? textInputField('Название', 'title', block.title || '', { blockId: id, wide: true, placeholder: typeLabel(block.type) })
            : '';
        return title + inputField(block.type === 'paragraph' ? 'Текст' : 'Содержание', 'content', block.content || '', {
            blockId: id, rows: block.type === 'paragraph' ? 4 : 3, wide: true
        });
    }

    function renderBlock(block, index, count, depth) {
        const canNest = window.NoteModel.isContainerType(block.type) && depth < window.NoteModel.MAX_NESTING_DEPTH;
        const children = Array.isArray(block.children) ? block.children : [];
        return '<article class="note-inline-block" data-block-card="' + escapeHtml(block.id) + '" style="--note-depth:' + depth + '">' +
            '<header class="note-inline-block-head">' +
                '<span class="note-inline-type">' + escapeHtml(typeLabel(block.type)) + '</span>' +
                '<span class="note-inline-block-actions" aria-label="Действия с блоком">' +
                    '<button type="button" data-action="up" data-block-id="' + escapeHtml(block.id) + '" title="Выше" aria-label="Переместить выше"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
                    '<button type="button" data-action="down" data-block-id="' + escapeHtml(block.id) + '" title="Ниже" aria-label="Переместить ниже"' + (index === count - 1 ? ' disabled' : '') + '>↓</button>' +
                    '<button type="button" data-action="duplicate" data-block-id="' + escapeHtml(block.id) + '" title="Создать копию" aria-label="Создать копию">⧉</button>' +
                    '<button type="button" class="is-danger" data-action="remove" data-block-id="' + escapeHtml(block.id) + '" title="Удалить" aria-label="Удалить блок">×</button>' +
                '</span>' +
            '</header>' +
            '<div class="note-inline-block-fields">' + blockFields(block) + '</div>' +
            (canNest ? '<div class="note-inline-children">' +
                (children.length ? children.map((child, childIndex) => renderBlock(child, childIndex, children.length, depth + 1)).join('') : '<p class="note-inline-empty-children">Вложенных блоков пока нет</p>') +
                '<button type="button" class="note-inline-add-child" data-action="open-picker" data-parent-id="' + escapeHtml(block.id) + '">+ Добавить внутрь</button>' +
            '</div>' : '') +
        '</article>';
    }

    function renderPicker() {
        return '<div class="note-inline-picker" hidden>' + TYPE_GROUPS.map(group =>
            '<section><h5>' + escapeHtml(group.title) + '</h5><div>' + group.types.filter(type => window.NoteModel.BLOCK_TYPES[type]).map(type =>
                '<button type="button" data-action="add-type" data-type="' + type + '">' + escapeHtml(typeLabel(type)) + '</button>'
            ).join('') + '</div></section>'
        ).join('') + '</div>';
    }

    function editorMarkup() {
        const document = activeDocument();
        const blocks = activeTree().blocks;
        const sourceText = session.source === 'cloud' ? 'Открыт облачный черновик' : session.source === 'local' ? 'Открыт локальный черновик' : 'Создан черновик из опубликованной версии';
        return '<div class="note-inline-editor" role="region" aria-label="Редактирование раздела">' +
            '<div class="note-inline-toolbar">' +
                '<div class="note-inline-editor-heading"><strong>Редактирование в конспекте</strong><span>' + sourceText + '</span></div>' +
                '<div class="note-inline-toolbar-actions">' +
                    '<span class="note-inline-save-state is-saved" role="status" aria-live="polite">Черновик готов</span>' +
                    '<a class="note-inline-open-builder" href="' + escapeHtml(constructorUrl(session.context)) + '">' + OPEN_ICON + '<span>Полный конструктор</span></a>' +
                    '<button class="note-inline-close" type="button" data-action="close">' + CLOSE_ICON + '<span>Закрыть</span></button>' +
                '</div>' +
            '</div>' +
            '<div class="note-inline-document-fields">' +
                textInputField(session.context.subsectionId ? 'Название подраздела' : 'Название раздела', 'document-title', document.title || '', { wide: true }) +
                textInputField('Короткое название в меню', 'document-nav-title', document.navTitle || document.title || '', { wide: true }) +
                (session.context.subsectionId ? inputField('Вводный текст', 'document-content', document.content || '', { rows: 2, wide: true }) : '') +
            '</div>' +
            '<div class="note-inline-block-list">' +
                (blocks.length ? blocks.map((block, index) => renderBlock(block, index, blocks.length, 0)).join('') : '<div class="note-inline-empty">В этом подразделе пока нет блоков.</div>') +
            '</div>' +
            '<div class="note-inline-editor-footer">' +
                '<button type="button" class="note-inline-add-root" data-action="open-picker" data-parent-id="">+ Добавить блок</button>' +
                '<span>Изменения сохраняются как черновик. Опубликованная версия не меняется.</span>' +
            '</div>' + renderPicker() +
        '</div>';
    }

    function keepTargetPosition(callback) {
        if (!session || !session.target) return callback();
        const before = session.target.getBoundingClientRect().top;
        callback();
        const after = session.target.getBoundingClientRect().top;
        if (Math.abs(after - before) > 1) window.scrollBy(0, after - before);
    }

    function renderEditor(focusId) {
        if (!session) return;
        const existing = session.editor;
        keepTargetPosition(() => {
            if (!existing) {
                session.editor = document.createElement('div');
                session.target.appendChild(session.editor);
            }
            session.editor.outerHTML = editorMarkup();
            session.editor = session.target.querySelector(':scope > .note-inline-editor');
        });
        bindEditorEvents();
        if (focusId) {
            const card = session.editor.querySelector('[data-block-card="' + CSS.escape(focusId) + '"]');
            const input = card && card.querySelector('.note-inline-input');
            if (input) input.focus({ preventScroll: true });
        }
    }

    function setSaveState(kind, message) {
        if (!session || !session.editor) return;
        const node = session.editor.querySelector('.note-inline-save-state');
        if (!node) return;
        node.className = 'note-inline-save-state is-' + kind;
        node.textContent = message;
    }

    function smartInput(input) {
        const original = input.value;
        const next = window.NoteModel.smartDashes(original);
        if (original === next) return next;
        const start = input.selectionStart;
        const removed = (original.slice(0, start).match(/--/g) || []).length;
        input.value = next;
        try { input.setSelectionRange(Math.max(0, start - removed), Math.max(0, start - removed)); } catch (_) {}
        return next;
    }

    function updateField(input) {
        if (!session || session.conflict) return;
        const field = input.dataset.field;
        const blockId = input.dataset.blockId;
        const value = input.tagName === 'SELECT' ? input.value : smartInput(input);
        if (blockId) {
            const location = blockLocation(blockId);
            if (!location) return;
            if (field === 'items') location.block.items = value.split(/\r?\n/);
            else location.block[field] = value;
        } else {
            const document = activeDocument();
            if (!document) return;
            if (field === 'document-title') document.title = value;
            if (field === 'document-nav-title') document.navTitle = value;
            if (field === 'document-content') document.content = value;
        }
        markChanged();
    }

    function markChanged() {
        if (!session) return;
        window.NoteModel.touch(session.section, currentUser.uid);
        session.dirty = true;
        setSaveState('saving', 'Сохраняем…');
        scheduleChangedSnapshot();
    }

    function scheduleChangedSnapshot() {
        if (!session) return;
        const snapshot = clone(session.section);
        const generation = ++session.saveGeneration;
        window.NoteStorage.putDraft(currentUser.uid, snapshot).then(() => {
            if (session && generation === session.saveGeneration) setSaveState('local', isLocalDemo ? 'Сохранено на устройстве' : 'Сохранено на устройстве…');
        }).catch(() => {
            if (session && generation === session.saveGeneration) setSaveState('error', 'Не удалось сохранить');
        });
        window.clearTimeout(session.remoteTimer);
        if (!isLocalDemo) session.remoteTimer = window.setTimeout(() => queueRemoteSave(generation), 900);
    }

    function queueRemoteSave(generation) {
        if (!session || session.conflict) return;
        const editingSession = session;
        const snapshot = clone(session.section);
        editingSession.remoteQueue = editingSession.remoteQueue
            .catch(() => {})
            .then(() => saveRemote(editingSession, snapshot, generation));
    }

    async function saveRemote(editingSession, section, generation) {
        if (!editingSession || editingSession.conflict) return false;
        const expected = editingSession.remoteVersion;
        let conflict = false;
        try {
            const reference = window.AlmanionAccount.database.ref('noteDrafts/' + section.subject + '/' + section.id);
            const result = await reference.transaction(remote => {
                if (!sameVersion(remote, expected)) {
                    conflict = true;
                    return;
                }
                conflict = false;
                return section;
            }, undefined, false);
            if (!result.committed) {
                if (conflict) showConflict(editingSession);
                else if (session === editingSession && generation === editingSession.saveGeneration) setSaveState('local', 'Сохранено только на устройстве');
                return false;
            }
            editingSession.remoteVersion = versionOf(section);
            if (session === editingSession && generation === editingSession.saveGeneration) {
                editingSession.dirty = false;
                setSaveState('saved', 'Все изменения сохранены');
            }
            return true;
        } catch (error) {
            console.warn('Inline note editor save:', error);
            if (session === editingSession && generation === editingSession.saveGeneration) setSaveState('local', 'Сохранено только на устройстве');
            return false;
        }
    }

    function showConflict(editingSession) {
        editingSession.conflict = true;
        if (session !== editingSession || !editingSession.editor) return;
        setSaveState('error', 'Есть более новая облачная версия');
        let notice = editingSession.editor.querySelector('.note-inline-conflict');
        if (!notice) {
            notice = document.createElement('div');
            notice.className = 'note-inline-conflict';
            notice.innerHTML = '<strong>Раздел изменён в другой вкладке.</strong><span>Ваша версия сохранена на устройстве и не перезаписала чужие изменения.</span><button type="button" data-action="load-cloud">Загрузить облачную версию</button>';
            editingSession.editor.querySelector('.note-inline-toolbar').after(notice);
        }
    }

    async function loadCloudVersion() {
        if (!session || isLocalDemo) return;
        const snapshot = await window.AlmanionAccount.database.ref('noteDrafts/' + subject.id + '/' + session.context.sectionId).once('value');
        if (!snapshot.exists()) {
            setSaveState('error', 'Облачный черновик не найден');
            return;
        }
        session.section = window.NoteModel.normalizeSection(snapshot.val(), subject.id);
        session.remoteVersion = versionOf(snapshot.val());
        session.conflict = false;
        session.dirty = false;
        await window.NoteStorage.putDraft(currentUser.uid, session.section);
        renderEditor();
        setSaveState('saved', 'Облачная версия загружена');
    }

    function changeStructure(action, blockId) {
        const tree = activeTree();
        let changed = false;
        let focusId = blockId;
        if (action === 'up') changed = window.NoteModel.moveWithinLevel(tree, blockId, -1);
        if (action === 'down') changed = window.NoteModel.moveWithinLevel(tree, blockId, 1);
        if (action === 'duplicate') {
            const copy = window.NoteModel.duplicateBlock(tree, blockId);
            changed = !!copy;
            focusId = copy && copy.id;
        }
        if (action === 'remove') {
            const location = blockLocation(blockId);
            if (!location) return;
            if (!window.confirm('Удалить блок «' + typeLabel(location.block.type) + '»?')) return;
            changed = window.NoteModel.removeBlock(tree, blockId);
            focusId = '';
        }
        if (!changed) return;
        window.NoteModel.touch(session.section, currentUser.uid);
        session.dirty = true;
        renderEditor(focusId);
        setSaveState('saving', 'Сохраняем…');
        scheduleChangedSnapshot();
    }

    function openPicker(button) {
        const picker = session.editor.querySelector('.note-inline-picker');
        session.pickerParentId = button.dataset.parentId || '';
        const wasHidden = picker.hidden;
        picker.hidden = !wasHidden;
        if (!picker.hidden) {
            button.after(picker);
            picker.querySelector('button').focus({ preventScroll: true });
        }
    }

    function addBlock(type) {
        if (!session || !window.NoteModel.BLOCK_TYPES[type]) return;
        const block = window.NoteModel.createBlock(type);
        if (session.pickerParentId) {
            const location = blockLocation(session.pickerParentId);
            if (!location || !window.NoteModel.isContainerType(location.block.type)) return;
            location.block.children = Array.isArray(location.block.children) ? location.block.children : [];
            location.block.children.push(block);
        } else {
            activeTree().blocks.push(block);
        }
        window.NoteModel.touch(session.section, currentUser.uid);
        session.dirty = true;
        renderEditor(block.id);
        setSaveState('saving', 'Сохраняем…');
        scheduleChangedSnapshot();
    }

    function bindEditorEvents() {
        if (!session || !session.editor) return;
        session.editor.addEventListener('input', event => {
            if (event.target.matches('[data-field]')) updateField(event.target);
        });
        session.editor.addEventListener('click', async event => {
            const button = event.target.closest('[data-action]');
            if (!button) return;
            const action = button.dataset.action;
            if (action === 'close') return closeEditor();
            if (action === 'open-picker') return openPicker(button);
            if (action === 'add-type') return addBlock(button.dataset.type);
            if (action === 'load-cloud') {
                button.disabled = true;
                try { await loadCloudVersion(); } catch (error) { setSaveState('error', 'Не удалось загрузить облачную версию'); }
                return;
            }
            changeStructure(action, button.dataset.blockId);
        });
    }

    function closeEditor() {
        if (!session) return;
        const closingSession = session;
        window.clearTimeout(closingSession.remoteTimer);
        if (closingSession.dirty && !isLocalDemo && !closingSession.conflict) {
            const snapshot = clone(closingSession.section);
            closingSession.remoteQueue = closingSession.remoteQueue
                .catch(() => {})
                .then(() => saveRemote(closingSession, snapshot, closingSession.saveGeneration));
        }
        const target = closingSession.target;
        const trigger = closingSession.trigger;
        session = null;
        target.classList.remove('note-inline-editing');
        const editor = target.querySelector(':scope > .note-inline-editor');
        if (editor) editor.remove();
        if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
    }

    function showLoadError(target, context, trigger, error) {
        const previous = target.querySelector(':scope > .note-inline-load-error');
        if (previous) previous.remove();
        const notice = document.createElement('div');
        notice.className = 'note-inline-load-error';
        notice.innerHTML = '<strong>Редактирование внутри страницы пока недоступно.</strong><span>' + escapeHtml(error.message || String(error)) + '</span><a href="' + escapeHtml(constructorUrl(context)) + '">Открыть полный конструктор</a>';
        target.appendChild(notice);
        window.setTimeout(() => notice.remove(), 9000);
        trigger.disabled = false;
        trigger.classList.remove('is-loading');
    }

    async function openEditor(target, context, trigger) {
        if (session && session.target === target) return;
        if (session) closeEditor();
        trigger.disabled = true;
        trigger.classList.add('is-loading');
        try {
            await loadDependencies();
            const loaded = await loadSection(context);
            session = {
                target,
                context,
                trigger,
                section: loaded.section,
                source: loaded.source,
                remoteVersion: loaded.remoteVersion,
                saveGeneration: 0,
                remoteTimer: 0,
                remoteQueue: Promise.resolve(),
                dirty: false,
                conflict: false,
                pickerParentId: '',
                editor: null
            };
            if (!activeDocument()) throw new Error('Подраздел не найден в структурном файле');
            target.classList.add('note-inline-editing');
            renderEditor();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            const firstInput = session.editor.querySelector('.note-inline-input');
            if (firstInput) firstInput.focus({ preventScroll: true });
        } catch (error) {
            console.warn('Inline note editor:', error);
            session = null;
            showLoadError(target, context, trigger, error);
            return;
        }
        trigger.disabled = false;
        trigger.classList.remove('is-loading');
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
                openEditor(target, context, button);
            });
            target.insertBefore(button, target.firstChild);
        });
    }

    function removeButtons() {
        closeEditor();
        document.querySelectorAll('.note-inline-edit-button').forEach(button => button.remove());
        document.querySelectorAll('.note-inline-load-error').forEach(node => node.remove());
        document.querySelectorAll('.note-inline-editable').forEach(node => node.classList.remove('note-inline-editable'));
    }

    async function updateAccess(user) {
        const generation = ++accessGeneration;
        currentUser = user;
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
        isLocalDemo = LOCAL_HOSTS.has(location.hostname) && new URLSearchParams(location.search).get('editor-demo') === '1';
        if (!editableTargets().length || (!window.AlmanionAccount && !isLocalDemo)) return;
        try {
            subject = await resolveSubject();
        } catch (error) {
            console.warn('Inline note editor:', error);
            return;
        }
        if (!subject) return;
        if (isLocalDemo) {
            currentUser = { uid: 'local-preview', email: 'dmb23930@gmail.com' };
            addButtons();
        } else {
            window.AlmanionAccount.auth.onAuthStateChanged(updateAccess, error => {
                console.warn('Inline note editor auth:', error);
                currentUser = null;
                removeButtons();
            });
        }
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && session) closeEditor();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
