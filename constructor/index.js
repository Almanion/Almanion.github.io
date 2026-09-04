(function () {
    'use strict';

    const Model = window.NoteModel;
    const Renderer = window.NoteRenderer;
    const Storage = window.NoteStorage;
    const config = window.NOTE_CONSTRUCTOR_CONFIG || {};
    const OWNER_EMAIL = String(config.ownerEmail || 'dmb23930@gmail.com').toLowerCase();
    const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
    const BLOCK_ICONS = { up: '↑', down: '↓', indent: '↳', outdent: '↰', add: '+', duplicate: '⧉', remove: '×' };
    const STATUS_LABELS = { draft: 'Черновик', ready: 'К проверке', published: 'Опубликовано' };
    const BLOCK_PICKER_GROUPS = [
        { title: 'Текст и структура', types: ['paragraph', 'heading', 'list', 'formula', 'image'] },
        { title: 'Учебные блоки', types: ['definition', 'theorem', 'lemma', 'proof', 'derivation', 'example', 'experiment', 'remark'] }
    ];
    const BLOCK_DESCRIPTIONS = {
        paragraph: ['Т', 'Обычный текст'], heading: ['Aa', 'Малый заголовок'], list: ['≡', 'Список пунктов'], formula: ['ƒ', 'LaTeX-формула'], image: ['▧', 'Изображение'],
        definition: ['О', 'Термин и смысл'], theorem: ['Т', 'Утверждение'], lemma: ['Л', 'Вспомогательный факт'], proof: ['Д', 'Ход доказательства'], derivation: ['→', 'Вывод формулы'],
        example: ['П', 'Разобранный пример'], experiment: ['Э', 'Описание опыта'], remark: ['!', 'Важное уточнение']
    };

    const state = {
        user: null,
        isOwner: false,
        subjects: [],
        subject: '',
        sections: [],
        current: null,
        currentSubsectionId: '',
        publishedManifest: null,
        publishedSections: [],
        hydrated: false,
        localTimer: 0,
        remoteTimer: 0,
        saveGeneration: 0,
        dragId: '',
        insertAfterId: '',
        pickerParentId: '',
        previewGeneration: 0,
        previewTheme: localStorage.getItem('note-constructor-preview-theme') || 'site',
        deleting: false
    };

    const el = id => document.getElementById(id);
    const clone = value => JSON.parse(JSON.stringify(value));
    const escapeHtml = Renderer.escapeHtml;

    function toast(message, isError, action) {
        const item = document.createElement('div');
        item.className = 'builder-toast' + (isError ? ' is-error' : '');
        item.textContent = message;
        if (action && action.label && typeof action.run === 'function') {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'builder-text-action';
            button.textContent = action.label;
            button.addEventListener('click', function () { action.run(); item.remove(); });
            item.append(' ', button);
        }
        el('builderToastStack').appendChild(item);
        window.setTimeout(() => item.remove(), action ? 6500 : 4200);
    }

    function setSaveState(kind, text) {
        el('saveState').dataset.state = kind;
        el('saveStateText').textContent = text;
    }

    function normalizeEmail(user) {
        return String(user && user.email || '').trim().toLowerCase();
    }

    async function checkAccess(user) {
        if (!user) return false;
        if (normalizeEmail(user) === OWNER_EMAIL) return true;
        const snapshot = await window.AlmanionAccount.database.ref('adminRoles/' + user.uid + '/contentEditor').once('value');
        return snapshot.val() === true;
    }

    function showGate(message, loginVisible) {
        el('builderGate').hidden = false;
        el('builderShell').hidden = true;
        el('builderGateText').textContent = message;
        el('builderLoginButton').hidden = !loginVisible;
    }

    async function onAuthState(user) {
        state.user = user || null;
        state.isOwner = normalizeEmail(user) === OWNER_EMAIL;
        if (!user) {
            showGate('Войдите в аккаунт редактора, чтобы открыть конструктор.', true);
            return;
        }
        showGate('Проверяем права редактора…', false);
        try {
            if (!await checkAccess(user)) {
                showGate('У этого аккаунта нет роли «Редактор конспектов». Назначить её может главный администратор.', false);
                return;
            }
            el('builderGate').hidden = true;
            el('builderShell').hidden = false;
            el('publishButton').hidden = !state.isOwner;
            await initializeWorkspace();
        } catch (error) {
            console.error('Constructor access:', error);
            showGate('Не удалось проверить права. Проверьте соединение и правила Firebase, затем обновите страницу.', false);
        }
    }

    async function fetchJson(path) {
        const response = await fetch(path + (path.includes('?') ? '&' : '?') + 'v=' + Date.now(), { cache: 'no-store' });
        if (!response.ok) throw new Error(path + ': HTTP ' + response.status);
        return response.json();
    }

    async function initializeWorkspace() {
        if (!state.subjects.length) {
            state.subjects = await fetchJson('content/subjects.json');
            el('subjectSelect').innerHTML = state.subjects.map(subject =>
                '<option value="' + escapeHtml(subject.id) + '">' + escapeHtml(subject.title) + '</option>'
            ).join('');
        }
        const remembered = localStorage.getItem('note-constructor-subject');
        const initial = state.subjects.some(subject => subject.id === remembered) ? remembered : state.subjects[0].id;
        el('subjectSelect').value = initial;
        await loadSubject(initial);
    }

    function compareSections(a, b) {
        return (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.title).localeCompare(String(b.title), 'ru');
    }

    function manifestEntryId(entry) {
        return typeof entry === 'string' ? entry : entry && entry.id;
    }

    function isPublishedSection(id) {
        const entries = state.publishedManifest && Array.isArray(state.publishedManifest.sections)
            ? state.publishedManifest.sections
            : [];
        return entries.some(entry => manifestEntryId(entry) === id);
    }

    function sectionSubsections(section) {
        return section && Array.isArray(section.subsections) ? section.subsections : [];
    }

    function activeSubsection() {
        return state.currentSubsectionId && state.current
            ? sectionSubsections(state.current).find(item => item.id === state.currentSubsectionId) || null
            : null;
    }

    function activeDocument() {
        return activeSubsection() || state.current;
    }

    function activeBlockList() {
        const subsection = activeSubsection();
        if (subsection) {
            subsection.children = Array.isArray(subsection.children) ? subsection.children : [];
            return subsection.children;
        }
        if (!state.current) return [];
        state.current.blocks = Array.isArray(state.current.blocks) ? state.current.blocks : [];
        return state.current.blocks;
    }

    function activeBlockTree() {
        return { blocks: activeBlockList() };
    }

    function newestSection() {
        const candidates = Array.prototype.slice.call(arguments).filter(Boolean);
        return candidates.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))[0] || null;
    }

    async function loadPublished(subject) {
        const manifest = await fetchJson('content/' + subject + '/manifest.json');
        const entries = Array.isArray(manifest.sections) ? manifest.sections : [];
        const sections = await Promise.all(entries.map(async (entry, index) => {
            const id = typeof entry === 'string' ? entry : entry.id;
            const raw = await fetchJson('content/' + subject + '/sections/' + id + '.json');
            const section = Model.normalizeSection(raw, subject);
            section.reviewStatus = 'published';
            section.order = Number(raw.order) || (index + 1) * 1000;
            return section;
        }));
        return { manifest, sections };
    }

    async function loadRemoteDrafts(subject) {
        const snapshot = await window.AlmanionAccount.database.ref('noteDrafts/' + subject).once('value');
        const value = snapshot.val() || {};
        return Object.keys(value).map(id => Model.normalizeSection(value[id], subject));
    }

    async function loadSubject(subject) {
        const pendingSection = state.hydrated && state.current ? clone(state.current) : null;
        flushTimers();
        if (pendingSection && state.user) {
            await Storage.putDraft(state.user.uid, pendingSection);
            await window.AlmanionAccount.database.ref('noteDrafts/' + pendingSection.subject + '/' + pendingSection.id).set(pendingSection).catch(function () {});
        }
        state.hydrated = false;
        state.subject = subject;
        state.current = null;
        state.currentSubsectionId = '';
        state.sections = [];
        state.publishedSections = [];
        localStorage.setItem('note-constructor-subject', subject);
        setSaveState('saving', 'Загружаем разделы…');
        renderEditor();
        renderSections();

        const [publishedResult, remoteResult, localResult] = await Promise.allSettled([
            loadPublished(subject),
            loadRemoteDrafts(subject),
            Storage.listDrafts(state.user.uid, subject)
        ]);
        const published = publishedResult.status === 'fulfilled'
            ? publishedResult.value
            : { manifest: { schemaVersion: 1, subject, title: subject, sections: [] }, sections: [] };
        state.publishedManifest = published.manifest;
        state.publishedSections = published.sections.map(section => clone(section));
        const remote = remoteResult.status === 'fulfilled' ? remoteResult.value : [];
        const local = localResult.status === 'fulfilled' ? localResult.value.map(entry => Model.normalizeSection(entry.section, subject)) : [];

        const ids = new Set(published.sections.concat(remote, local).map(section => section.id));
        state.sections = Array.from(ids).map(id => newestSection(
            published.sections.find(section => section.id === id),
            remote.find(section => section.id === id),
            local.find(section => section.id === id)
        )).sort(compareSections);
        state.hydrated = true;
        state.current = state.sections[0] || null;
        state.currentSubsectionId = '';
        setSaveState('idle', remoteResult.status === 'rejected' ? 'Черновики доступны на устройстве' : 'Все изменения сохранены');
        renderAll();
        el('builderPreview').scrollTop = 0;
        const subjectConfig = state.subjects.find(item => item.id === subject);
        el('subjectPageLink').href = subjectConfig ? subjectConfig.page : subject + '.html';
        if (publishedResult.status === 'rejected') toast('Не удалось прочитать опубликованные разделы.', true);
        if (remoteResult.status === 'rejected') toast('Облачные черновики недоступны. Локальное сохранение продолжает работать.', true);
    }

    function renderAll() {
        renderSections();
        renderEditor();
        renderPreview();
    }

    function renderSections() {
        const root = el('sectionList');
        if (!state.sections.length) {
            root.innerHTML = '<div class="builder-list-empty">Новых разделов пока нет</div>';
            return;
        }
        root.innerHTML = state.sections.map((section, index) => {
            const selectedSection = state.current && state.current.id === section.id;
            const active = selectedSection && !state.currentSubsectionId;
            const subsections = sectionSubsections(section);
            return '<div class="builder-section-row" data-section-id="' + escapeHtml(section.id) + '">' +
                '<div class="builder-section-main"><button class="builder-section-item' + (active ? ' is-active' : '') + '" type="button" data-section-select="' + escapeHtml(section.id) + '">' +
                    '<strong>' + escapeHtml(section.navTitle || section.title) + '</strong>' +
                    '<span class="builder-section-status is-' + escapeHtml(section.reviewStatus) + '"></span>' +
                    '<small>' + escapeHtml(STATUS_LABELS[section.reviewStatus] || 'Черновик') + '</small>' +
                '</button><button class="builder-add-subsection" type="button" data-add-subsection="' + escapeHtml(section.id) + '" aria-label="Добавить подраздел" title="Добавить подраздел">＋</button></div>' +
                '<div class="builder-section-order" aria-label="Порядок раздела">' +
                    '<button type="button" data-section-move="-1" title="Выше"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
                    '<button type="button" data-section-move="1" title="Ниже"' + (index === state.sections.length - 1 ? ' disabled' : '') + '>↓</button>' +
                '</div>' + (subsections.length ? '<div class="builder-subsection-list">' + subsections.map(subsection =>
                    '<button class="builder-subsection-item' + (selectedSection && state.currentSubsectionId === subsection.id ? ' is-active' : '') + '" type="button" data-subsection-select="' + escapeHtml(subsection.id) + '" title="' + escapeHtml(subsection.title) + '">' + escapeHtml(subsection.navTitle || subsection.title) + '</button>'
                ).join('') + '</div>' : '') +
            '</div>';
        }).join('');
    }

    function actionButton(action, label, disabled) {
        return '<button class="builder-block-action' + (action === 'remove' ? ' is-delete' : '') + '" type="button" data-block-action="' + action + '" aria-label="' + escapeHtml(label) + '" title="' + escapeHtml(label) + '"' + (disabled ? ' disabled' : '') + '>' + BLOCK_ICONS[action] + '</button>';
    }

    function textArea(field, label, value, className, placeholder) {
        return '<label class="builder-field"><span>' + escapeHtml(label) + '</span><textarea data-block-field="' + field + '"' + (className ? ' class="' + className + '"' : '') + (placeholder ? ' placeholder="' + escapeHtml(placeholder) + '"' : '') + '>' + escapeHtml(value || '') + '</textarea></label>';
    }

    function blockFields(block) {
        if (block.type === 'heading') return textArea('title', 'Подзаголовок', block.title || block.content, '', 'Название подраздела');
        if (block.type === 'formula') return textArea('latex', 'LaTeX', block.latex || '', 'builder-formula-input', String.raw`E = mc^2`);
        if (block.type === 'list') return textArea('items', 'Пункты — по одному в строке', (block.items || []).join('\n'), '', 'Первый пункт\nВторой пункт');
        if (block.type === 'image') {
            return '<div class="builder-image-row">' +
                '<label class="builder-field"><span>Путь к изображению</span><input data-block-field="src" value="' + escapeHtml(block.src || '') + '" placeholder="images/notes/' + escapeHtml(state.subject) + '/image.webp"></label>' +
                '<label class="builder-button is-secondary builder-file-button">Загрузить<input type="file" data-image-file accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"></label>' +
                '</div>' +
                '<label class="builder-field"><span>Описание для доступности</span><input data-block-field="alt" value="' + escapeHtml(block.alt || '') + '"></label>' +
                '<label class="builder-field"><span>Подпись</span><input data-block-field="caption" value="' + escapeHtml(block.caption || '') + '"></label>' +
                '<span class="builder-image-note">Файл хранится локально до публикации, затем попадёт в <code>images/notes/' + escapeHtml(state.subject) + '/</code>.</span>';
        }
        if (block.type === 'paragraph') return textArea('content', 'Текст', block.content, '', 'Текст конспекта. Доступны **полужирный**, *курсив* и `код`.');
        if (block.type === 'definition') {
            const separator = block.separator === ':' ? ':' : '—';
            return '<div class="builder-definition-structure">' +
                '<label class="builder-field"><span>Термин</span><input data-block-field="term" value="' + escapeHtml(block.term || block.title || '') + '" placeholder="Например, I закон Ньютона"></label>' +
                '<label class="builder-field builder-definition-separator"><span>Разделитель</span><select data-block-field="separator" aria-label="Разделитель определения"><option value="—"' + (separator === '—' ? ' selected' : '') + '>— тире</option><option value=":"' + (separator === ':' ? ' selected' : '') + '>: двоеточие</option></select></label>' +
                '</div>' +
                textArea('content', 'Определение', block.content, '', 'Содержание определения');
        }
        if (block.type === 'remark' || block.type === 'derivation') {
            return textArea('content', block.type === 'remark' ? 'Текст замечания' : 'Текст вывода', block.content, '', 'Основной текст блока');
        }
        return '<label class="builder-field"><span>Короткий заголовок — необязательно</span><input data-block-field="title" value="' + escapeHtml(block.title || '') + '"></label>' +
            textArea('content', 'Содержание', block.content, '', 'Основной текст блока');
    }

    function renderBlockEditor(block, depth, index, count) {
        const canNest = Model.isContainerType(block.type) && depth < Model.MAX_NESTING_DEPTH;
        const children = Array.isArray(block.children) ? block.children : [];
        return '<article class="builder-block' + (state.insertAfterId === block.id ? ' is-selected' : '') + '" data-block-id="' + escapeHtml(block.id) + '" data-depth="' + depth + '">' +
            '<div class="builder-block-head">' +
                '<button class="builder-drag-handle" type="button" draggable="true" data-drag-handle aria-label="Перетащить блок" title="Перетащить блок">⠿</button>' +
                '<span class="builder-block-kind">' + escapeHtml(Model.BLOCK_TYPES[block.type].label) + '</span>' +
                '<div class="builder-block-actions">' +
                    actionButton('up', 'Переместить выше', index === 0) +
                    actionButton('down', 'Переместить ниже', index === count - 1) +
                    actionButton('indent', 'Вложить в предыдущий блок', index === 0 || depth >= Model.MAX_NESTING_DEPTH) +
                    actionButton('outdent', 'Поднять на уровень выше', depth === 0) +
                    actionButton('add', 'Добавить блок после этого') +
                    actionButton('duplicate', 'Создать копию') +
                    actionButton('remove', 'Удалить блок') +
                '</div>' +
            '</div>' +
            '<div class="builder-block-fields">' + blockFields(block) + '</div>' +
            (canNest ? '<div class="builder-child-zone"><div class="builder-child-zone-head"><span>Вложенные блоки</span><div class="builder-child-add"><button class="builder-button is-quiet" type="button" data-open-block-picker data-parent-id="' + escapeHtml(block.id) + '">＋ Добавить</button></div></div><div class="builder-child-list">' + children.map((child, childIndex) => renderBlockEditor(child, depth + 1, childIndex, children.length)).join('') + '</div><div class="builder-drop-zone" data-drop-parent="' + escapeHtml(block.id) + '">Перетащите блок сюда, чтобы вложить</div></div>' : '') +
        '</article>';
    }

    function renderEditor() {
        const hasCurrent = !!state.current;
        el('editorEmpty').hidden = hasCurrent;
        el('editorContent').hidden = !hasCurrent;
        if (!hasCurrent) return;
        const subsection = activeSubsection();
        const document = subsection || state.current;
        el('documentKind').textContent = subsection ? 'Подраздел' : 'Раздел';
        el('documentTitleLabel').textContent = subsection ? 'Полное название подраздела' : 'Заголовок раздела';
        el('documentNavTitleLabel').textContent = subsection ? 'Короткое название в меню' : 'Название в меню';
        el('sectionTitle').value = document.title;
        el('sectionNavTitle').value = document.navTitle;
        el('sectionSlug').textContent = '#' + document.id;
        el('reviewStatus').value = state.current.reviewStatus;
        el('reviewStatusControl').hidden = !!subsection;
        const published = isPublishedSection(state.current.id);
        const deleteButton = el('deleteSectionButton');
        deleteButton.hidden = !subsection && published && !state.isOwner;
        deleteButton.title = subsection ? 'Удалить подраздел' : (published ? 'Удалить раздел с сайта' : 'Удалить черновик');
        deleteButton.setAttribute('aria-label', deleteButton.title);
        el('deleteDocumentLabel').textContent = subsection ? 'Удалить подраздел' : 'Удалить';
        const blocks = activeBlockList();
        if (state.insertAfterId && !Model.findLocation(blocks, state.insertAfterId, null, 0)) state.insertAfterId = '';
        el('blockList').innerHTML = blocks.map((block, index) => renderBlockEditor(block, 0, index, blocks.length)).join('');
        updateAddDockContext();
        window.requestAnimationFrame(autoResizeTextareas);
    }

    function currentPreviewTheme() {
        const selected = state.previewTheme;
        if (selected && selected !== 'site') {
            const parts = selected.split('-');
            const mode = parts[0];
            const dark = parts[1] === 'dark';
            if (mode === 'legacy') {
                return { bodyClass: (dark ? 'dark-theme ' : '') + 'no-hover constructor-preview-page', label: 'Старый · ' + (dark ? 'тёмная' : 'светлая') };
            }
            const palette = mode === 'graphite' ? 'graphite' : 'prism';
            return {
                bodyClass: 'experimental exp-' + palette + (dark ? ' exp-dark' : '') + ' no-hover constructor-preview-page',
                label: (palette === 'graphite' ? 'Графит' : 'Призма') + (dark ? ' · тёмная' : ' · светлая')
            };
        }
        let settings = {};
        try { settings = JSON.parse(localStorage.getItem('siteSettings') || '{}') || {}; } catch (_) {}
        if (settings.experimental === false) {
            const theme = settings.theme || (localStorage.getItem('theme') === 'dark' ? 'dark' : 'light');
            const labels = { light: 'Старый · светлая', dark: 'Старый · тёмная', sepia: 'Старый · сепия', midnight: 'Старый · полночь' };
            return {
                bodyClass: (theme && theme !== 'light' ? theme + '-theme ' : '') + 'no-hover constructor-preview-page',
                label: labels[theme] || labels.light
            };
        }
        const mode = settings.expMode === 'graphite' ? 'graphite' : 'prism';
        const dark = settings.expDark === true;
        return {
            bodyClass: 'experimental exp-' + mode + (dark ? ' exp-dark' : '') + ' no-hover constructor-preview-page',
            label: (mode === 'graphite' ? 'Графит' : 'Призма') + (dark ? ' · тёмная' : ' · светлая')
        };
    }

    function ensurePreviewRoot() {
        const frame = el('previewFrame');
        let doc = frame.contentDocument;
        if (!doc || !doc.getElementById('previewContent')) {
            const baseHref = new URL('.', window.location.href).href;
            doc.open();
            doc.write('<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
                '<base href="' + escapeHtml(baseHref) + '">' +
                '<link rel="stylesheet" href="styles/site/index.css?v=20260903-5">' +
                '<link rel="stylesheet" href="styles/tokens.css?v=20260903-1">' +
                '<link rel="stylesheet" href="style-new.css?v=20260904-7">' +
                '<link rel="stylesheet" href="styles/typography.css?v=20260904-2">' +
                '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">' +
                '<link rel="stylesheet" href="constructor/preview.css?v=20260903-1">' +
                '</head><body><main class="main-content" id="previewContent"></main></body></html>');
            doc.close();
            doc = frame.contentDocument;
        }
        const theme = currentPreviewTheme();
        doc.body.className = theme.bodyClass;
        el('previewThemeLabel').textContent = theme.label;
        return doc.getElementById('previewContent');
    }

    async function renderPreview() {
        const root = ensurePreviewRoot();
        const generation = ++state.previewGeneration;
        if (!state.current) {
            root.innerHTML = '<div class="builder-preview-placeholder"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg><strong>Здесь появится раздел</strong><span>Создайте материал или выберите черновик слева</span></div>';
            return;
        }
        root.innerHTML = Renderer.renderSection(state.current);
        try {
            const assets = await Storage.listAssets(state.user.uid, state.subject, state.current.id);
            if (generation !== state.previewGeneration) return;
            assets.forEach(asset => {
                const figure = root.querySelector('[data-note-block="' + CSS.escape(asset.blockId) + '"]');
                const image = figure && figure.querySelector('img');
                if (image && asset.dataUrl) image.src = asset.dataUrl;
            });
        } catch (_) {}
        if (typeof window.renderMathInElement === 'function') {
            try {
                window.renderMathInElement(root, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '\\[', right: '\\]', display: true },
                        { left: '\\(', right: '\\)', display: false }
                    ],
                    throwOnError: false
                });
            } catch (_) {}
        }
        const subsection = activeSubsection();
        if (subsection) {
            const target = root.querySelector('#' + CSS.escape(subsection.id));
            if (target) target.scrollIntoView({ block: 'start' });
        } else if (root.ownerDocument.defaultView) root.ownerDocument.defaultView.scrollTo(0, 0);
    }

    function flushTimers() {
        window.clearTimeout(state.localTimer);
        window.clearTimeout(state.remoteTimer);
        state.localTimer = 0;
        state.remoteTimer = 0;
    }

    function changed(structural) {
        if (!state.current || !state.hydrated) return;
        Model.touch(state.current, state.user.uid);
        el('reviewStatus').value = state.current.reviewStatus;
        setSaveState('saving', 'Сохраняем…');
        if (structural) renderEditor();
        renderSections();
        renderPreview();
        scheduleSave();
    }

    function scheduleSave() {
        if (!state.current || !state.hydrated) return;
        const section = clone(state.current);
        const generation = ++state.saveGeneration;
        window.clearTimeout(state.remoteTimer);
        Storage.putDraft(state.user.uid, section).then(function () {
            if (generation === state.saveGeneration) setSaveState('saving', 'Сохранено на устройстве…');
        }).catch(function (error) {
            console.error('Local draft:', error);
            if (generation === state.saveGeneration) setSaveState('error', 'Не удалось сохранить на устройстве');
        });
        state.remoteTimer = window.setTimeout(() => saveRemote(section, generation), 1100);
    }

    async function saveRemote(section, generation) {
        if (!state.hydrated || !state.user || section.subject !== state.subject) return;
        try {
            await window.AlmanionAccount.database.ref('noteDrafts/' + section.subject + '/' + section.id).set(section);
            if (generation === state.saveGeneration) setSaveState('idle', 'Все изменения сохранены');
        } catch (error) {
            console.error('Remote draft:', error);
            if (generation === state.saveGeneration) setSaveState('error', 'Сохранено только на устройстве');
        }
    }

    async function saveNow() {
        if (!state.current) return;
        flushTimers();
        const section = clone(state.current);
        const generation = ++state.saveGeneration;
        await Storage.putDraft(state.user.uid, section);
        await saveRemote(section, generation);
    }

    function openSectionDialog() {
        el('sectionDialog').hidden = false;
        el('newSectionTitle').value = '';
        window.setTimeout(() => el('newSectionTitle').focus(), 30);
    }

    function closeSectionDialog() { el('sectionDialog').hidden = true; }

    function uniqueSectionId(title) {
        const base = Model.slugify(title);
        let id = base;
        let suffix = 2;
        while (state.sections.some(section => section.id === id)) id = base.slice(0, 58) + '-' + suffix++;
        return id;
    }

    function createSection(title) {
        const section = Model.createSection(state.subject, title);
        section.id = uniqueSectionId(title);
        section.order = state.sections.length ? Math.max(...state.sections.map(item => Number(item.order) || 0)) + 1000 : 1000;
        section.updatedBy = state.user.uid;
        state.sections.push(section);
        state.sections.sort(compareSections);
        state.current = section;
        state.currentSubsectionId = '';
        renderAll();
        scheduleSave();
        toast('Раздел создан и сохранён как черновик');
    }

    function openSubsectionDialog(sectionId) {
        const section = state.sections.find(item => item.id === sectionId);
        if (!section) return;
        state.current = section;
        state.currentSubsectionId = '';
        el('newSubsectionTitle').value = '';
        el('newSubsectionNavTitle').value = '';
        el('subsectionDialog').hidden = false;
        renderAll();
        window.setTimeout(() => el('newSubsectionTitle').focus(), 30);
    }

    function closeSubsectionDialog() { el('subsectionDialog').hidden = true; }

    function uniqueSubsectionId(title) {
        const base = Model.slugify(title);
        const used = new Set(state.sections.flatMap(section => sectionSubsections(section).map(item => item.id)).concat(state.sections.map(section => section.id)));
        let id = base;
        let suffix = 2;
        while (used.has(id)) id = base.slice(0, 58) + '-' + suffix++;
        return id;
    }

    function createSubsection(title, navTitle) {
        if (!state.current) return;
        const subsection = Model.createSubsection(title, navTitle);
        subsection.id = uniqueSubsectionId(title);
        state.current.subsections = sectionSubsections(state.current);
        state.current.subsections.push(subsection);
        state.currentSubsectionId = subsection.id;
        state.insertAfterId = '';
        changed(true);
        toast('Подраздел создан');
    }

    function openDeleteSectionDialog() {
        if (!state.current || state.deleting) return;
        const subsection = activeSubsection();
        const published = isPublishedSection(state.current.id);
        if (!subsection && published && !state.isOwner) return;
        el('deleteSectionTitle').textContent = subsection ? 'Удалить подраздел?' : (published ? 'Удалить опубликованный раздел?' : 'Удалить черновик?');
        el('deleteSectionDescription').textContent = subsection
            ? 'Подраздел и все вложенные в него блоки будут удалены из текущего черновика.'
            : published
            ? 'Раздел исчезнет с сайта после обновления GitHub Pages. История останется доступна в GitHub.'
            : 'Черновик будет удалён с этого устройства и из аккаунта. Вернуть его после удаления не получится.';
        el('deleteSectionKind').textContent = subsection ? 'Подраздел' : 'Раздел';
        el('deleteSectionName').textContent = subsection ? (subsection.navTitle || subsection.title) : (state.current.navTitle || state.current.title);
        el('deleteSectionConfirm').textContent = subsection ? 'Удалить подраздел' : (published ? 'Удалить с сайта' : 'Удалить черновик');
        el('deleteSectionDialog').hidden = false;
        window.setTimeout(() => el('deleteSectionCancel').focus(), 30);
    }

    function closeDeleteSectionDialog() {
        if (state.deleting) return;
        el('deleteSectionDialog').hidden = true;
    }

    function removeSectionFromWorkspace(sectionId) {
        const index = state.sections.findIndex(section => section.id === sectionId);
        if (index === -1) return;
        state.sections.splice(index, 1);
        state.current = state.sections[Math.min(index, state.sections.length - 1)] || null;
        state.currentSubsectionId = '';
        state.insertAfterId = '';
    }

    function selectSection(id, subsectionId) {
        const section = state.sections.find(item => item.id === id);
        if (!section) return;
        const nextSubsectionId = subsectionId && sectionSubsections(section).some(item => item.id === subsectionId) ? subsectionId : '';
        if (section === state.current && nextSubsectionId === state.currentSubsectionId) return;
        state.current = section;
        state.currentSubsectionId = nextSubsectionId;
        state.insertAfterId = '';
        if (el('builderShell').classList.contains('is-outline-fullscreen')) setFullscreenPanel('outline', false);
        renderAll();
        if (window.innerWidth < 760) el('builderEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function moveSection(delta) {
        if (!state.current) return;
        const index = state.sections.indexOf(state.current);
        const target = index + delta;
        if (target < 0 || target >= state.sections.length) return;
        const other = state.sections[target];
        const currentOrder = state.current.order;
        state.current.order = other.order;
        other.order = currentOrder;
        Model.touch(other, state.user.uid);
        Storage.putDraft(state.user.uid, clone(other));
        saveRemote(clone(other), -1);
        state.sections.sort(compareSections);
        changed(false);
    }

    function findBlock(blockId) {
        return state.current ? Model.findLocation(activeBlockList(), blockId, null, 0) : null;
    }

    function handleBlockAction(blockId, action) {
        if (!state.current) return;
        const tree = activeBlockTree();
        if (action === 'add') {
            state.insertAfterId = blockId;
            updateAddDockContext();
            openBlockPicker('');
            return;
        }
        if (action === 'up') Model.moveWithinLevel(tree, blockId, -1);
        else if (action === 'down') Model.moveWithinLevel(tree, blockId, 1);
        else if (action === 'indent') Model.indentBlock(tree, blockId);
        else if (action === 'outdent') Model.outdentBlock(tree, blockId);
        else if (action === 'duplicate') Model.duplicateBlock(tree, blockId);
        else if (action === 'remove') {
            const snapshot = clone(state.current);
            if (!Model.removeBlock(tree, blockId)) return;
            changed(true);
            toast('Блок удалён.', false, { label: 'Отменить', run: function () { Object.assign(state.current, snapshot); changed(true); } });
            return;
        }
        changed(true);
    }

    function renderBlockPicker() {
        el('blockPickerOptions').innerHTML = BLOCK_PICKER_GROUPS.map(group =>
            '<section class="builder-block-picker-group"><h3>' + escapeHtml(group.title) + '</h3><div class="builder-block-picker-grid">' + group.types.map(type => {
                const meta = BLOCK_DESCRIPTIONS[type] || ['', ''];
                return '<button class="builder-block-choice" type="button" data-create-block="' + type + '"><span class="builder-block-choice-icon" aria-hidden="true">' + escapeHtml(meta[0]) + '</span><strong>' + escapeHtml(Model.BLOCK_TYPES[type].label) + '</strong><small>' + escapeHtml(meta[1]) + '</small></button>';
            }).join('') + '</div></section>'
        ).join('');
    }

    function updateAddDockContext() {
        const location = state.insertAfterId ? findBlock(state.insertAfterId) : null;
        const subsection = activeSubsection();
        el('addDockTitle').textContent = subsection ? 'Продолжить подраздел' : 'Продолжить раздел';
        el('addDockContext').textContent = location
            ? 'Новый блок появится после «' + Model.BLOCK_TYPES[location.block.type].label + '»'
            : 'Новый блок появится в конце';
    }

    function openBlockPicker(parentId) {
        if (!state.current) return;
        state.pickerParentId = parentId || '';
        const parent = state.pickerParentId ? findBlock(state.pickerParentId) : null;
        el('blockPickerContext').textContent = parent
            ? 'Блок будет вложен в «' + Model.BLOCK_TYPES[parent.block.type].label + '».'
            : (state.insertAfterId ? 'Блок появится сразу после выбранного.' : 'Блок появится в конце текущего материала.');
        el('blockPicker').hidden = false;
        document.body.classList.add('builder-modal-open');
        window.setTimeout(() => el('blockPicker').querySelector('[data-create-block]')?.focus(), 30);
    }

    function closeBlockPicker() {
        state.pickerParentId = '';
        el('blockPicker').hidden = true;
        document.body.classList.remove('builder-modal-open');
    }

    function createBlockFromPicker(type) {
        if (!state.current || !Model.BLOCK_TYPES[type] || Model.BLOCK_TYPES[type].structural) return;
        const block = Model.createBlock(type);
        if (state.pickerParentId) {
            const parent = findBlock(state.pickerParentId);
            if (!parent || !Model.isContainerType(parent.block.type)) return;
            parent.block.children = Array.isArray(parent.block.children) ? parent.block.children : [];
            parent.block.children.push(block);
        } else {
            const selected = state.insertAfterId ? findBlock(state.insertAfterId) : null;
            if (selected) selected.list.splice(selected.index + 1, 0, block);
            else activeBlockList().push(block);
        }
        state.insertAfterId = block.id;
        closeBlockPicker();
        changed(true);
        window.requestAnimationFrame(() => {
            const card = el('blockList').querySelector('[data-block-id="' + CSS.escape(block.id) + '"]');
            card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const field = card?.querySelector('textarea,input');
            if (field) field.focus();
        });
    }

    function autoResizeTextareas() {
        el('blockList').querySelectorAll('textarea').forEach(area => {
            area.style.height = 'auto';
            area.style.height = Math.min(420, Math.max(92, area.scrollHeight)) + 'px';
        });
    }

    function applySmartDashes(target) {
        if (!target || typeof target.value !== 'string') return;
        const field = target.dataset.blockField;
        if (field === 'latex' || field === 'src') return;
        const before = target.value;
        if (!before.includes('--')) return;
        const start = target.selectionStart;
        const prefix = typeof start === 'number' ? before.slice(0, start) : '';
        target.value = Model.smartDashes(before);
        if (typeof start === 'number') {
            const removed = (prefix.match(/--/g) || []).length;
            const next = start - removed;
            target.setSelectionRange(next, next);
        }
    }

    async function handleImage(blockId, file) {
        if (!file) return;
        if (!file.type.startsWith('image/')) return toast('Можно выбрать только изображение.', true);
        if (file.size > MAX_IMAGE_BYTES) return toast('Изображение больше 2,5 МБ. Сожмите его перед загрузкой.', true);
        const location = findBlock(blockId);
        if (!location) return;
        const extension = (file.name.match(/\.[a-z0-9]+$/i) || ['.webp'])[0].toLowerCase();
        const filename = Date.now() + '-' + Model.slugify(file.name.replace(/\.[^.]+$/, '')).slice(0, 40) + extension;
        const targetPath = 'images/notes/' + state.subject + '/' + filename;
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
        location.block.src = targetPath;
        if (!location.block.alt) location.block.alt = file.name.replace(/\.[^.]+$/, '');
        await Storage.putAsset(state.user.uid, state.subject, state.current.id, blockId, { path: targetPath, mimeType: file.type, dataUrl });
        changed(true);
        toast('Изображение прикреплено к черновику');
    }

    function manifestWithCurrent(section) {
        const manifest = clone(state.publishedManifest || { schemaVersion: 1, subject: state.subject, title: state.subject, sections: [] });
        const entries = Array.isArray(manifest.sections) ? manifest.sections : [];
        const nextEntry = { id: section.id, title: section.title, navTitle: section.navTitle, updatedAt: section.updatedAt };
        const index = entries.findIndex(entry => (typeof entry === 'string' ? entry : entry.id) === section.id);
        if (index === -1) entries.push(nextEntry); else entries[index] = nextEntry;
        const order = new Map(state.sections.map((item, i) => [item.id, i]));
        entries.sort((a, b) => (order.get(typeof a === 'string' ? a : a.id) ?? 99999) - (order.get(typeof b === 'string' ? b : b.id) ?? 99999));
        manifest.sections = entries;
        return manifest;
    }

    function manifestWithoutSection(sectionId) {
        const manifest = clone(state.publishedManifest || { schemaVersion: 1, subject: state.subject, title: state.subject, sections: [] });
        manifest.sections = (Array.isArray(manifest.sections) ? manifest.sections : [])
            .filter(entry => manifestEntryId(entry) !== sectionId);
        return manifest;
    }

    function collectImagePaths(section) {
        const paths = new Set();
        const visit = blocks => (Array.isArray(blocks) ? blocks : []).forEach(block => {
            const path = block && block.type === 'image' ? String(block.src || '').replace(/\\/g, '/') : '';
            if (path.startsWith('images/notes/' + state.subject + '/')) paths.add(path);
            visit(block && block.children);
        });
        visit(section && section.blocks);
        sectionSubsections(section).forEach(subsection => visit(subsection.children));
        return paths;
    }

    function publishedDeletePaths(sectionId) {
        const publishedSection = state.publishedSections.find(section => section.id === sectionId);
        const sectionImages = collectImagePaths(publishedSection);
        const sharedImages = new Set();
        state.publishedSections.forEach(section => {
            if (section.id === sectionId) return;
            collectImagePaths(section).forEach(path => sharedImages.add(path));
        });
        return ['content/' + state.subject + '/sections/' + sectionId + '.json']
            .concat(Array.from(sectionImages).filter(path => !sharedImages.has(path)));
    }

    async function deletePublishedSection(section) {
        const manifest = manifestWithoutSection(section.id);
        const idToken = await state.user.getIdToken(true);
        const response = await fetch(config.publisherEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'deleteNotes',
                idToken,
                subject: state.subject,
                sectionId: section.id,
                files: [{
                    path: 'content/' + state.subject + '/manifest.json',
                    content: JSON.stringify(manifest, null, 2) + '\n',
                    encoding: 'utf-8'
                }],
                deletePaths: publishedDeletePaths(section.id)
            })
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Сервер удаления вернул ошибку');
        state.publishedManifest = manifest;
        state.publishedSections = state.publishedSections.filter(item => item.id !== section.id);
    }

    async function deleteCurrentSection() {
        if (!state.current || state.deleting) return;
        const subsection = activeSubsection();
        if (subsection) {
            const snapshot = clone(state.current);
            state.current.subsections = sectionSubsections(state.current).filter(item => item.id !== subsection.id);
            state.currentSubsectionId = '';
            el('deleteSectionDialog').hidden = true;
            changed(true);
            toast('Подраздел удалён.', false, { label: 'Отменить', run: function () { Object.assign(state.current, snapshot); state.currentSubsectionId = subsection.id; changed(true); } });
            return;
        }
        const section = clone(state.current);
        const published = isPublishedSection(section.id);
        if (published && !state.isOwner) return;

        const confirmButton = el('deleteSectionConfirm');
        state.deleting = true;
        confirmButton.disabled = true;
        confirmButton.textContent = published ? 'Удаляем с сайта…' : 'Удаляем…';
        flushTimers();
        state.saveGeneration += 1;
        state.hydrated = false;

        try {
            if (published) {
                await deletePublishedSection(section);
                await window.AlmanionAccount.database.ref('noteDrafts/' + section.subject + '/' + section.id).remove().catch(() => {});
            } else {
                await window.AlmanionAccount.database.ref('noteDrafts/' + section.subject + '/' + section.id).remove();
            }
            await Storage.removeDraft(state.user.uid, section.subject, section.id);
            await Storage.removeSectionAssets(state.user.uid, section.subject, section.id).catch(() => {});
            removeSectionFromWorkspace(section.id);
            state.hydrated = true;
            el('deleteSectionDialog').hidden = true;
            renderAll();
            toast(published ? 'Раздел удалён. GitHub Pages обновится через несколько минут.' : 'Черновик удалён');
        } catch (error) {
            state.hydrated = true;
            console.error('Delete section:', error);
            const message = String(error && error.message || error);
            const backendHint = published && /Неизвестное действие|Unknown action/i.test(message)
                ? ' Обновите deployment Apps Script кодом из актуального apps-script.gs.'
                : '';
            toast('Не удалось удалить раздел: ' + message + '.' + backendHint, true);
        } finally {
            state.deleting = false;
            confirmButton.disabled = false;
            confirmButton.textContent = published ? 'Удалить с сайта' : 'Удалить черновик';
        }
    }

    async function publicationFiles() {
        const section = clone(state.current);
        section.reviewStatus = 'published';
        section.updatedAt = Date.now();
        section.updatedBy = state.user.uid;
        const manifest = manifestWithCurrent(section);
        const files = [
            { path: 'content/' + state.subject + '/sections/' + section.id + '.json', content: JSON.stringify(section, null, 2) + '\n', encoding: 'utf-8' },
            { path: 'content/' + state.subject + '/manifest.json', content: JSON.stringify(manifest, null, 2) + '\n', encoding: 'utf-8' }
        ];
        const assets = await Storage.listAssets(state.user.uid, state.subject, section.id).catch(() => []);
        const referencedImages = collectImagePaths(section);
        assets.filter(asset => referencedImages.has(String(asset.path || '').replace(/\\/g, '/'))).forEach(asset => {
            const comma = asset.dataUrl.indexOf(',');
            if (comma !== -1) files.push({ path: asset.path, content: asset.dataUrl.slice(comma + 1), encoding: 'base64' });
        });
        return { section, manifest, files };
    }

    function downloadJson(value, filename) {
        const blob = new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    async function exportBundle() {
        if (!state.current) return toast('Сначала создайте раздел.', true);
        const bundle = await publicationFiles();
        downloadJson({ schemaVersion: 1, subject: state.subject, createdAt: Date.now(), files: bundle.files }, state.subject + '-' + state.current.id + '-publication.json');
        toast('Пакет публикации скачан');
    }

    async function publishCurrent() {
        if (!state.isOwner || !state.current) return;
        const errors = Model.validateSection(state.current);
        if (errors.length) return toast(errors[0], true);
        const button = el('publishButton');
        button.disabled = true;
        button.textContent = 'Публикуем…';
        try {
            await saveNow();
            const bundle = await publicationFiles();
            const idToken = await state.user.getIdToken(true);
            const response = await fetch(config.publisherEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'publishNotes', idToken, subject: state.subject, sectionId: state.current.id, files: bundle.files })
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Сервер публикации вернул ошибку');
            Object.assign(state.current, bundle.section);
            state.publishedManifest = bundle.manifest;
            const publishedIndex = state.publishedSections.findIndex(section => section.id === bundle.section.id);
            if (publishedIndex === -1) state.publishedSections.push(clone(bundle.section));
            else state.publishedSections[publishedIndex] = clone(bundle.section);
            await Storage.putDraft(state.user.uid, state.current);
            await saveRemote(clone(state.current), ++state.saveGeneration);
            renderAll();
            toast('Опубликовано. GitHub Pages обновится через несколько минут.');
        } catch (error) {
            console.error('Publish notes:', error);
            toast('Не удалось опубликовать: ' + (error.message || error) + '. Можно скачать пакет публикации.', true);
        } finally {
            button.disabled = false;
            button.textContent = 'Опубликовать';
        }
    }

    function setFullscreenPanel(kind, open) {
        const shell = el('builderShell');
        const preview = kind === 'preview';
        shell.classList.toggle(preview ? 'is-preview-fullscreen' : 'is-outline-fullscreen', open);
        if (open) shell.classList.remove(preview ? 'is-outline-fullscreen' : 'is-preview-fullscreen');
        const button = el(preview ? 'previewFullscreenButton' : 'outlineFullscreenButton');
        button.setAttribute('aria-pressed', String(open));
        button.title = open ? 'Вернуть обычный размер' : (preview ? 'Развернуть предпросмотр' : 'Развернуть структуру');
        button.setAttribute('aria-label', button.title);
        if (preview && open) {
            el('builderPreview').classList.add('is-open');
            el('builderPreview').scrollTop = 0;
        }
    }

    function toggleFullscreenPanel(kind) {
        const shell = el('builderShell');
        const className = kind === 'preview' ? 'is-preview-fullscreen' : 'is-outline-fullscreen';
        setFullscreenPanel(kind, !shell.classList.contains(className));
    }

    function setupResizablePanels() {
        const shell = el('builderShell');
        const root = document.documentElement;
        const storedOutline = Number(localStorage.getItem('note-constructor-outline-width'));
        const storedPreview = Number(localStorage.getItem('note-constructor-preview-width'));
        const minimumEditorWidth = 480;
        const resizerWidth = 12;
        const limits = { outline: [220, 520], preview: [340, 760] };
        const properties = { outline: '--builder-outline-width', preview: '--builder-preview-width' };
        const storageKeys = { outline: 'note-constructor-outline-width', preview: 'note-constructor-preview-width' };
        let storedWidthsApplied = false;

        function readWidth(kind) {
            const fallback = kind === 'outline' ? 270 : 440;
            return Number.parseFloat(getComputedStyle(root).getPropertyValue(properties[kind])) || fallback;
        }

        function setWidth(kind, value, persist) {
            const otherKind = kind === 'outline' ? 'preview' : 'outline';
            const bounds = limits[kind];
            const availableMaximum = window.innerWidth - minimumEditorWidth - resizerWidth - readWidth(otherKind);
            const maximum = Math.max(bounds[0], Math.min(bounds[1], availableMaximum));
            const limited = Math.max(bounds[0], Math.min(maximum, Math.round(value)));
            root.style.setProperty(properties[kind], limited + 'px');
            if (persist !== false) localStorage.setItem(storageKeys[kind], String(limited));
            return limited;
        }

        function fitPanels(persist) {
            if (window.innerWidth <= 1280) return;
            let outline = !storedWidthsApplied && storedOutline >= 220 && storedOutline <= 520 ? storedOutline : readWidth('outline');
            let preview = !storedWidthsApplied && storedPreview >= 340 && storedPreview <= 760 ? storedPreview : readWidth('preview');
            storedWidthsApplied = true;
            const maximumCombined = window.innerWidth - minimumEditorWidth - resizerWidth;
            const excess = Math.max(0, outline + preview - maximumCombined);
            preview = Math.max(limits.preview[0], preview - excess);
            outline = Math.max(limits.outline[0], Math.min(outline, maximumCombined - preview));
            root.style.setProperty(properties.outline, Math.round(outline) + 'px');
            root.style.setProperty(properties.preview, Math.round(preview) + 'px');
            if (persist !== false) {
                localStorage.setItem(storageKeys.outline, String(Math.round(outline)));
                localStorage.setItem(storageKeys.preview, String(Math.round(preview)));
            }
        }

        fitPanels(true);

        function bind(handle, kind) {
            handle.addEventListener('pointerdown', event => {
                if (window.innerWidth <= 1280) return;
                event.preventDefault();
                const startX = event.clientX;
                const panel = kind === 'outline' ? el('sectionList').closest('.builder-sections') : el('builderPreview');
                const startWidth = panel.getBoundingClientRect().width;
                handle.classList.add('is-active');
                shell.classList.add('is-resizing');
                function move(moveEvent) {
                    const delta = kind === 'outline' ? moveEvent.clientX - startX : startX - moveEvent.clientX;
                    setWidth(kind, startWidth + delta, true);
                }
                function stop() {
                    handle.classList.remove('is-active');
                    shell.classList.remove('is-resizing');
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', stop);
                    window.removeEventListener('pointercancel', stop);
                }
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', stop, { once: true });
                window.addEventListener('pointercancel', stop, { once: true });
            });
            handle.addEventListener('keydown', event => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const current = readWidth(kind);
                const direction = event.key === 'ArrowRight' ? 1 : -1;
                setWidth(kind, current + direction * 16 * (kind === 'outline' ? 1 : -1), true);
            });
        }
        bind(el('outlineResizer'), 'outline');
        bind(el('previewResizer'), 'preview');
        window.addEventListener('resize', () => fitPanels(true));
    }

    function bindEvents() {
        el('builderLoginButton').addEventListener('click', () => window.AlmanionAccount.openLogin());
        ['newSectionTitle', 'newSubsectionTitle', 'newSubsectionNavTitle'].forEach(id => el(id).addEventListener('input', event => applySmartDashes(event.target)));
        el('subjectSelect').addEventListener('change', event => loadSubject(event.target.value));
        el('newSectionButton').addEventListener('click', openSectionDialog);
        el('emptyNewSectionButton').addEventListener('click', openSectionDialog);
        el('sectionDialogClose').addEventListener('click', closeSectionDialog);
        el('sectionDialogCancel').addEventListener('click', closeSectionDialog);
        el('sectionDialog').addEventListener('click', event => { if (event.target === el('sectionDialog')) closeSectionDialog(); });
        el('sectionDialogForm').addEventListener('submit', event => {
            event.preventDefault();
            const title = el('newSectionTitle').value.trim();
            if (!title) return;
            closeSectionDialog();
            createSection(title);
        });
        el('subsectionDialogClose').addEventListener('click', closeSubsectionDialog);
        el('subsectionDialogCancel').addEventListener('click', closeSubsectionDialog);
        el('subsectionDialog').addEventListener('click', event => { if (event.target === el('subsectionDialog')) closeSubsectionDialog(); });
        el('subsectionDialogForm').addEventListener('submit', event => {
            event.preventDefault();
            const title = el('newSubsectionTitle').value.trim();
            const navTitle = el('newSubsectionNavTitle').value.trim();
            if (!title) return;
            closeSubsectionDialog();
            createSubsection(title, navTitle);
        });
        el('deleteSectionButton').addEventListener('click', openDeleteSectionDialog);
        el('deleteSectionClose').addEventListener('click', closeDeleteSectionDialog);
        el('deleteSectionCancel').addEventListener('click', closeDeleteSectionDialog);
        el('deleteSectionConfirm').addEventListener('click', deleteCurrentSection);
        el('deleteSectionDialog').addEventListener('click', event => {
            if (event.target === el('deleteSectionDialog')) closeDeleteSectionDialog();
        });
        el('sectionList').addEventListener('click', event => {
            const addSubsection = event.target.closest('[data-add-subsection]');
            if (addSubsection) return openSubsectionDialog(addSubsection.dataset.addSubsection);
            const subsection = event.target.closest('[data-subsection-select]');
            if (subsection) {
                const row = subsection.closest('[data-section-id]');
                if (row) selectSection(row.dataset.sectionId, subsection.dataset.subsectionSelect);
                return;
            }
            const select = event.target.closest('[data-section-select]');
            if (select) return selectSection(select.dataset.sectionSelect);
            const move = event.target.closest('[data-section-move]');
            if (move) {
                const row = move.closest('[data-section-id]');
                if (row) selectSection(row.dataset.sectionId);
                moveSection(Number(move.dataset.sectionMove));
            }
        });
        el('sectionTitle').addEventListener('input', event => { applySmartDashes(event.target); const document = activeDocument(); if (document) document.title = event.target.value; changed(false); });
        el('sectionNavTitle').addEventListener('input', event => { applySmartDashes(event.target); const document = activeDocument(); if (document) document.navTitle = event.target.value; changed(false); });
        el('reviewStatus').addEventListener('change', event => { state.current.reviewStatus = event.target.value; changed(false); });
        el('openBlockPickerButton').addEventListener('click', () => openBlockPicker(''));
        el('blockPickerClose').addEventListener('click', closeBlockPicker);
        el('blockPickerCancel').addEventListener('click', closeBlockPicker);
        el('blockPicker').addEventListener('click', event => {
            if (event.target === el('blockPicker')) return closeBlockPicker();
            const choice = event.target.closest('[data-create-block]');
            if (choice) createBlockFromPicker(choice.dataset.createBlock);
        });
        el('blockList').addEventListener('input', event => {
            const field = event.target.dataset.blockField;
            if (!field) return;
            applySmartDashes(event.target);
            const card = event.target.closest('[data-block-id]');
            const location = card && findBlock(card.dataset.blockId);
            if (!location) return;
            if (field === 'items') location.block.items = event.target.value.split(/\r?\n/);
            else location.block[field] = event.target.value;
            if (event.target.matches('textarea')) autoResizeTextareas();
            changed(false);
        });
        el('blockList').addEventListener('focusin', event => {
            const card = event.target.closest('[data-block-id]');
            if (!card) return;
            state.insertAfterId = card.dataset.blockId;
            el('blockList').querySelectorAll('.builder-block.is-selected').forEach(item => item.classList.remove('is-selected'));
            card.classList.add('is-selected');
            updateAddDockContext();
        });
        el('blockList').addEventListener('change', event => {
            const field = event.target.dataset.blockField;
            if (field && event.target.matches('select')) {
                const card = event.target.closest('[data-block-id]');
                const location = card && findBlock(card.dataset.blockId);
                if (location) {
                    location.block[field] = event.target.value;
                    changed(false);
                }
                return;
            }
            if (!event.target.matches('[data-image-file]')) return;
            const card = event.target.closest('[data-block-id]');
            if (card) handleImage(card.dataset.blockId, event.target.files && event.target.files[0]);
        });
        el('blockList').addEventListener('click', event => {
            const action = event.target.closest('[data-block-action]');
            if (action) {
                const card = action.closest('[data-block-id]');
                if (card) handleBlockAction(card.dataset.blockId, action.dataset.blockAction);
                return;
            }
            const addChild = event.target.closest('[data-open-block-picker]');
            if (addChild) openBlockPicker(addChild.dataset.parentId);
        });
        el('blockList').addEventListener('dragstart', event => {
            if (!event.target.closest('[data-drag-handle]')) return event.preventDefault();
            const card = event.target.closest('[data-block-id]');
            if (!card) return;
            state.dragId = card.dataset.blockId;
            card.classList.add('is-dragging');
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', state.dragId);
        });
        el('blockList').addEventListener('dragover', event => {
            const zone = event.target.closest('[data-drop-parent]');
            if (zone && zone.dataset.dropParent !== state.dragId) {
                event.preventDefault();
                zone.classList.add('is-drop-target');
                event.dataTransfer.dropEffect = 'move';
                return;
            }
            const card = event.target.closest('[data-block-id]');
            if (!card || card.dataset.blockId === state.dragId) return;
            event.preventDefault();
            card.classList.add('is-drop-target');
        });
        el('blockList').addEventListener('dragleave', event => {
            const zone = event.target.closest('[data-drop-parent]');
            if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('is-drop-target');
            const card = event.target.closest('[data-block-id]');
            if (card && !card.contains(event.relatedTarget)) card.classList.remove('is-drop-target');
        });
        el('blockList').addEventListener('drop', event => {
            const zone = event.target.closest('[data-drop-parent]');
            if (zone) {
                event.preventDefault();
                const moved = Model.moveIntoContainer(activeBlockTree(), state.dragId, zone.dataset.dropParent);
                state.dragId = '';
                if (moved) changed(true);
                return;
            }
            const card = event.target.closest('[data-block-id]');
            if (!card) return;
            event.preventDefault();
            const moved = Model.moveBefore(activeBlockTree(), state.dragId, card.dataset.blockId);
            state.dragId = '';
            if (moved) changed(true);
        });
        el('blockList').addEventListener('dragend', () => {
            state.dragId = '';
            el('blockList').querySelectorAll('.is-dragging,.is-drop-target').forEach(node => node.classList.remove('is-dragging', 'is-drop-target'));
        });
        el('previewToggle').addEventListener('click', () => {
            const open = !el('builderPreview').classList.contains('is-open');
            el('builderPreview').classList.toggle('is-open', open);
            el('previewToggle').setAttribute('aria-pressed', open ? 'true' : 'false');
        });
        el('previewCloseButton').addEventListener('click', () => {
            setFullscreenPanel('preview', false);
            el('builderPreview').classList.remove('is-open');
            el('previewToggle').setAttribute('aria-pressed', 'false');
        });
        el('previewThemeSelect').addEventListener('change', event => {
            state.previewTheme = event.target.value;
            localStorage.setItem('note-constructor-preview-theme', state.previewTheme);
            renderPreview();
        });
        el('previewFullscreenButton').addEventListener('click', () => toggleFullscreenPanel('preview'));
        el('outlineFullscreenButton').addEventListener('click', () => toggleFullscreenPanel('outline'));
        el('builderPreview').addEventListener('click', event => {
            const button = event.target.closest('[data-preview-size]');
            if (!button) return;
            const size = button.dataset.previewSize === 'mobile' ? 'mobile' : 'wide';
            el('previewCanvas').dataset.size = size;
            el('builderPreview').querySelectorAll('[data-preview-size]').forEach(item => {
                const active = item.dataset.previewSize === size;
                item.classList.toggle('is-active', active);
                item.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
        });
        el('exportButton').addEventListener('click', exportBundle);
        el('publishButton').addEventListener('click', publishCurrent);
        document.addEventListener('keydown', event => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                openBlockPicker('');
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                saveNow();
                return;
            }
            if (event.key === 'Escape') {
                if (!el('blockPicker').hidden) closeBlockPicker();
                closeSectionDialog();
                closeSubsectionDialog();
                closeDeleteSectionDialog();
                setFullscreenPanel('preview', false);
                setFullscreenPanel('outline', false);
                el('builderPreview').classList.remove('is-open');
                el('previewToggle').setAttribute('aria-pressed', 'false');
            }
        });
        window.addEventListener('beforeunload', () => {
            if (state.current && state.hydrated) Storage.putDraft(state.user.uid, clone(state.current));
        });
    }

    function start() {
        renderBlockPicker();
        const allowedPreviewThemes = Array.from(el('previewThemeSelect').options).map(option => option.value);
        if (!allowedPreviewThemes.includes(state.previewTheme)) state.previewTheme = 'site';
        el('previewThemeSelect').value = state.previewTheme;
        setupResizablePanels();
        bindEvents();
        const account = window.AlmanionAccount;
        if (!account || !account.auth) return showGate('Не удалось запустить систему аккаунтов. Обновите страницу.', false);
        // Локальный режим нужен только для визуальных тестов интерфейса. На
        // github.io это условие недостижимо и не ослабляет проверку ролей.
        if ((location.hostname === '127.0.0.1' || location.hostname === 'localhost') && new URLSearchParams(location.search).get('demo') === '1') {
            onAuthState({ uid: 'local-preview', email: OWNER_EMAIL, getIdToken: function () { return Promise.reject(new Error('Локальный режим')); } });
            return;
        }
        account.auth.onAuthStateChanged(onAuthState, error => {
            console.error('Constructor auth:', error);
            showGate('Не удалось восстановить вход. Обновите страницу.', true);
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
