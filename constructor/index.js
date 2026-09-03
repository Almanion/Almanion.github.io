(function () {
    'use strict';

    const Model = window.NoteModel;
    const Renderer = window.NoteRenderer;
    const Storage = window.NoteStorage;
    const config = window.NOTE_CONSTRUCTOR_CONFIG || {};
    const OWNER_EMAIL = String(config.ownerEmail || 'dmb23930@gmail.com').toLowerCase();
    const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
    const BLOCK_ICONS = { up: '↑', down: '↓', indent: '↳', outdent: '↰', duplicate: '⧉', remove: '×' };
    const STATUS_LABELS = { draft: 'Черновик', ready: 'К проверке', published: 'Опубликовано' };

    const state = {
        user: null,
        isOwner: false,
        subjects: [],
        subject: '',
        sections: [],
        current: null,
        publishedManifest: null,
        publishedSections: [],
        hydrated: false,
        localTimer: 0,
        remoteTimer: 0,
        saveGeneration: 0,
        dragId: '',
        previewGeneration: 0,
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
        setSaveState('idle', remoteResult.status === 'rejected' ? 'Черновики доступны на устройстве' : 'Все изменения сохранены');
        renderAll();
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
            const active = state.current && state.current.id === section.id;
            return '<div class="builder-section-row' + (active ? ' is-active' : '') + '" data-section-id="' + escapeHtml(section.id) + '">' +
                '<button class="builder-section-item' + (active ? ' is-active' : '') + '" type="button" data-section-select="' + escapeHtml(section.id) + '">' +
                    '<strong>' + escapeHtml(section.navTitle || section.title) + '</strong>' +
                    '<span class="builder-section-status is-' + escapeHtml(section.reviewStatus) + '"></span>' +
                    '<small>' + escapeHtml(STATUS_LABELS[section.reviewStatus] || 'Черновик') + '</small>' +
                '</button>' +
                '<div class="builder-section-order" aria-label="Порядок раздела">' +
                    '<button type="button" data-section-move="-1" title="Выше"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
                    '<button type="button" data-section-move="1" title="Ниже"' + (index === state.sections.length - 1 ? ' disabled' : '') + '>↓</button>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    function typeOptions(selected) {
        return Object.keys(Model.BLOCK_TYPES).map(type =>
            '<option value="' + type + '"' + (type === selected ? ' selected' : '') + '>' + escapeHtml(Model.BLOCK_TYPES[type].label) + '</option>'
        ).join('');
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
        return '<label class="builder-field"><span>Короткий заголовок — необязательно</span><input data-block-field="title" value="' + escapeHtml(block.title || '') + '"></label>' +
            textArea('content', 'Содержание', block.content, '', 'Основной текст блока');
    }

    function renderBlockEditor(block, depth, index, count) {
        const canNest = Model.isContainerType(block.type) && depth < Model.MAX_NESTING_DEPTH;
        const children = Array.isArray(block.children) ? block.children : [];
        return '<article class="builder-block" draggable="true" data-block-id="' + escapeHtml(block.id) + '" data-depth="' + depth + '">' +
            '<div class="builder-block-head">' +
                '<span class="builder-block-kind">' + escapeHtml(Model.BLOCK_TYPES[block.type].label) + '</span>' +
                '<div class="builder-block-actions">' +
                    actionButton('up', 'Переместить выше', index === 0) +
                    actionButton('down', 'Переместить ниже', index === count - 1) +
                    actionButton('indent', 'Вложить в предыдущий блок', index === 0 || depth >= Model.MAX_NESTING_DEPTH) +
                    actionButton('outdent', 'Поднять на уровень выше', depth === 0) +
                    actionButton('duplicate', 'Создать копию') +
                    actionButton('remove', 'Удалить блок') +
                '</div>' +
            '</div>' +
            '<div class="builder-block-fields">' + blockFields(block) + '</div>' +
            (canNest ? '<div class="builder-child-zone"><div class="builder-child-zone-head"><span>Вложенные блоки</span><div class="builder-child-add"><select aria-label="Тип вложенного блока">' + typeOptions('paragraph') + '</select><button class="builder-button is-quiet" type="button" data-add-child>Добавить</button></div></div><div class="builder-child-list">' + children.map((child, childIndex) => renderBlockEditor(child, depth + 1, childIndex, children.length)).join('') + '</div></div>' : '') +
        '</article>';
    }

    function renderEditor() {
        const hasCurrent = !!state.current;
        el('editorEmpty').hidden = hasCurrent;
        el('editorContent').hidden = !hasCurrent;
        if (!hasCurrent) return;
        el('sectionTitle').value = state.current.title;
        el('sectionNavTitle').value = state.current.navTitle;
        el('sectionSlug').textContent = '#' + state.current.id;
        el('reviewStatus').value = state.current.reviewStatus;
        const published = isPublishedSection(state.current.id);
        const deleteButton = el('deleteSectionButton');
        deleteButton.hidden = published && !state.isOwner;
        deleteButton.title = published ? 'Удалить раздел с сайта' : 'Удалить черновик';
        deleteButton.setAttribute('aria-label', deleteButton.title);
        el('blockList').innerHTML = state.current.blocks.map((block, index) => renderBlockEditor(block, 0, index, state.current.blocks.length)).join('');
    }

    function currentPreviewTheme() {
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
                '<link rel="stylesheet" href="style-new.css?v=20260903-5">' +
                '<link rel="stylesheet" href="styles/typography.css?v=20260903-1">' +
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
        renderAll();
        scheduleSave();
        toast('Раздел создан и сохранён как черновик');
    }

    function openDeleteSectionDialog() {
        if (!state.current || state.deleting) return;
        const published = isPublishedSection(state.current.id);
        if (published && !state.isOwner) return;
        el('deleteSectionTitle').textContent = published ? 'Удалить опубликованный раздел?' : 'Удалить черновик?';
        el('deleteSectionDescription').textContent = published
            ? 'Раздел исчезнет с сайта после обновления GitHub Pages. История останется доступна в GitHub.'
            : 'Черновик будет удалён с этого устройства и из аккаунта. Вернуть его после удаления не получится.';
        el('deleteSectionName').textContent = state.current.navTitle || state.current.title;
        el('deleteSectionConfirm').textContent = published ? 'Удалить с сайта' : 'Удалить черновик';
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
    }

    function selectSection(id) {
        const section = state.sections.find(item => item.id === id);
        if (!section || section === state.current) return;
        state.current = section;
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
        return state.current ? Model.findLocation(state.current.blocks, blockId, null, 0) : null;
    }

    function handleBlockAction(blockId, action) {
        if (!state.current) return;
        if (action === 'up') Model.moveWithinLevel(state.current, blockId, -1);
        else if (action === 'down') Model.moveWithinLevel(state.current, blockId, 1);
        else if (action === 'indent') Model.indentBlock(state.current, blockId);
        else if (action === 'outdent') Model.outdentBlock(state.current, blockId);
        else if (action === 'duplicate') Model.duplicateBlock(state.current, blockId);
        else if (action === 'remove') {
            const snapshot = clone(state.current);
            if (!Model.removeBlock(state.current, blockId)) return;
            changed(true);
            toast('Блок удалён.', false, { label: 'Отменить', run: function () { Object.assign(state.current, snapshot); changed(true); } });
            return;
        }
        changed(true);
    }

    function addRootBlock() {
        if (!state.current) return;
        state.current.blocks.push(Model.createBlock(el('newBlockType').value));
        changed(true);
        const blocks = el('blockList').querySelectorAll('.builder-block[data-depth="0"]');
        const last = blocks[blocks.length - 1];
        if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        assets.forEach(asset => {
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

    function bindEvents() {
        el('builderLoginButton').addEventListener('click', () => window.AlmanionAccount.openLogin());
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
        el('deleteSectionButton').addEventListener('click', openDeleteSectionDialog);
        el('deleteSectionClose').addEventListener('click', closeDeleteSectionDialog);
        el('deleteSectionCancel').addEventListener('click', closeDeleteSectionDialog);
        el('deleteSectionConfirm').addEventListener('click', deleteCurrentSection);
        el('deleteSectionDialog').addEventListener('click', event => {
            if (event.target === el('deleteSectionDialog')) closeDeleteSectionDialog();
        });
        el('sectionList').addEventListener('click', event => {
            const select = event.target.closest('[data-section-select]');
            if (select) return selectSection(select.dataset.sectionSelect);
            const move = event.target.closest('[data-section-move]');
            if (move) {
                const row = move.closest('[data-section-id]');
                if (row) selectSection(row.dataset.sectionId);
                moveSection(Number(move.dataset.sectionMove));
            }
        });
        el('sectionTitle').addEventListener('input', event => { state.current.title = event.target.value; changed(false); });
        el('sectionNavTitle').addEventListener('input', event => { state.current.navTitle = event.target.value; changed(false); });
        el('reviewStatus').addEventListener('change', event => { state.current.reviewStatus = event.target.value; changed(false); });
        el('addBlockButton').addEventListener('click', addRootBlock);
        el('blockList').addEventListener('input', event => {
            const field = event.target.dataset.blockField;
            if (!field) return;
            const card = event.target.closest('[data-block-id]');
            const location = card && findBlock(card.dataset.blockId);
            if (!location) return;
            if (field === 'items') location.block.items = event.target.value.split(/\r?\n/);
            else location.block[field] = event.target.value;
            changed(false);
        });
        el('blockList').addEventListener('change', event => {
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
            const addChild = event.target.closest('[data-add-child]');
            if (addChild) {
                const card = addChild.closest('[data-block-id]');
                const select = addChild.parentElement.querySelector('select');
                if (card && select && Model.addChild(state.current, card.dataset.blockId, select.value)) changed(true);
            }
        });
        el('blockList').addEventListener('dragstart', event => {
            const card = event.target.closest('[data-block-id]');
            if (!card) return;
            state.dragId = card.dataset.blockId;
            card.classList.add('is-dragging');
            event.dataTransfer.effectAllowed = 'move';
        });
        el('blockList').addEventListener('dragover', event => {
            const card = event.target.closest('[data-block-id]');
            if (!card || card.dataset.blockId === state.dragId) return;
            event.preventDefault();
            card.classList.add('is-drop-target');
        });
        el('blockList').addEventListener('dragleave', event => {
            const card = event.target.closest('[data-block-id]');
            if (card) card.classList.remove('is-drop-target');
        });
        el('blockList').addEventListener('drop', event => {
            const card = event.target.closest('[data-block-id]');
            if (!card) return;
            event.preventDefault();
            if (Model.moveBefore(state.current, state.dragId, card.dataset.blockId)) changed(true);
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
            el('builderPreview').classList.remove('is-open');
            el('previewToggle').setAttribute('aria-pressed', 'false');
        });
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
            if (event.key === 'Escape') {
                closeSectionDialog();
                closeDeleteSectionDialog();
                el('builderPreview').classList.remove('is-open');
                el('previewToggle').setAttribute('aria-pressed', 'false');
            }
        });
        window.addEventListener('beforeunload', () => {
            if (state.current && state.hydrated) Storage.putDraft(state.user.uid, clone(state.current));
        });
    }

    function start() {
        el('newBlockType').innerHTML = typeOptions('paragraph');
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
