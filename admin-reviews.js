(function () {
    'use strict';

    const byId = id => document.getElementById(id);
    const dates = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow' });
    const reviewIdPattern = /^[-_A-Za-z0-9]{20}$/;
    const fieldLabels = {
        title: 'Заголовок', navTitle: 'Название в меню', order: 'Порядок раздела',
        type: 'Тип блока', term: 'Термин', separator: 'Разделитель', content: 'Текст',
        latex: 'Формула', items: 'Пункты', notebook: 'Запись в тетрадь',
        src: 'Изображение', alt: 'Описание изображения', caption: 'Подпись',
        studyEnabled: 'Включено в «Учить»', studyTitle: 'Название карточки', studyFormulas: 'Формулы для карточек',
        navHtml: 'Оглавление', contentHtml: 'Материал'
    };
    const changeLabels = { added: 'Добавлено', removed: 'Удалено', edited: 'Изменено', moved: 'Перемещено' };
    const sectionFields = ['title', 'navTitle', 'order', 'navHtml', 'contentHtml'];
    const mimeTypes = {
        png: 'image/png', apng: 'image/apng', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
        gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp',
        ico: 'image/x-icon', tif: 'image/tiff', tiff: 'image/tiff'
    };

    function textNode(tag, text, className) {
        const node = document.createElement(tag);
        node.textContent = text;
        if (className) node.className = className;
        return node;
    }

    function blockLabel(type) {
        return window.NoteModel.BLOCK_TYPES[type]?.label || 'Блок';
    }

    function fieldValue(node, key) {
        const value = node[key];
        if (key === 'type') return blockLabel(value);
        if (key === 'studyEnabled') return value === false ? 'Нет' : 'Да';
        if (key === 'studyFormulas') return { include: 'Включать', exclude: 'Исключать' }[value] || 'Автоматически';
        if (Array.isArray(value)) return value.map(item => '• ' + item).join('\n');
        return value == null ? '' : String(value);
    }

    function collectRows(section) {
        const rows = new Map();
        if (!section) return rows;
        rows.set('section', { node: section, title: 'Раздел', parent: '', scope: '' });
        function visit(items, parent, scope) {
            items.forEach((block, index) => {
                if (!block || typeof block !== 'object') return;
                let id = 'block:' + (block.id || parent + ':' + index);
                if (rows.has(id)) id += ':' + parent + ':' + index;
                const label = blockLabel(block.type);
                const title = block.term || block.title || label;
                rows.set(id, { node: block, title, parent, scope });
                if (Array.isArray(block.children)) visit(block.children, id, title);
            });
        }
        if (Array.isArray(section.blocks)) visit(section.blocks, 'section:body', 'Раздел');
        if (Array.isArray(section.subsections)) visit(section.subsections.map(subsection => ({ ...subsection, type: 'subsection' })), 'section:subsections', 'Подразделы');
        return rows;
    }

    function sharedPositions(rows, other) {
        const counts = new Map(), positions = new Map();
        for (const [key, row] of rows) {
            if (other.get(key)?.parent !== row.parent) continue;
            const position = (counts.get(row.parent) || 0) + 1;
            counts.set(row.parent, position);
            positions.set(key, position);
        }
        return positions;
    }

    function differences(base, version) {
        const oldRows = collectRows(base), newRows = collectRows(version);
        const beforeOrder = sharedPositions(oldRows, newRows), afterOrder = sharedPositions(newRows, oldRows);
        return [...new Set([...newRows.keys(), ...oldRows.keys()])].flatMap(key => {
            const before = oldRows.get(key), after = newRows.get(key), row = after || before;
            const fields = key === 'section' ? sectionFields : Object.keys(fieldLabels).filter(field => field !== 'order');
            const changed = fields.flatMap(field => {
                if (before && after && fieldValue(before.node, field) === fieldValue(after.node, field)) return [];
                const oldValue = before ? fieldValue(before.node, field) : '';
                const newValue = after ? fieldValue(after.node, field) : '';
                return oldValue || newValue ? [{ label: fieldLabels[field], before: oldValue, after: newValue }] : [];
            });
            let kind = changed.length ? 'edited' : 'moved';
            if (before && after && before.parent !== after.parent) changed.unshift({ label: 'Расположение', before: before.scope, after: after.scope });
            else if (before && after && beforeOrder.get(key) !== afterOrder.get(key)) changed.unshift({
                label: 'Место среди общих блоков', before: String(beforeOrder.get(key)), after: String(afterOrder.get(key))
            });
            if (!changed.length && before && after) return [];
            if (!before) kind = 'added';
            if (!after) kind = 'removed';
            return [{ ...row, kind, changed }];
        });
    }

    function diffCard(change) {
        const details = document.createElement('details');
        details.className = 'admin-review-change';
        details.dataset.kind = change.kind;
        const summary = document.createElement('summary');
        summary.append(textNode('span', changeLabels[change.kind], 'admin-review-change-kind'), textNode('strong', change.title));
        if (change.scope) summary.append(textNode('small', change.scope, 'admin-review-change-scope'));
        details.append(summary);
        for (const field of change.changed) {
            const section = document.createElement('section'), values = document.createElement('div');
            values.className = 'admin-review-values';
            section.append(textNode('h4', field.label), values);
            for (const [key, caption] of [['before', 'На сайте'], ['after', 'Предложено']]) {
                if (!field[key] && (change.kind === 'added' || change.kind === 'removed')) continue;
                const value = document.createElement('div');
                value.append(textNode('span', caption), textNode('pre', field[key] || '—'));
                values.append(value);
            }
            details.append(section);
        }
        return details;
    }

    function imageAttachments(files) {
        const filesWithImages = files.filter(file => file && file.encoding === 'base64').flatMap(file => {
            const path = String(file.path || ''), name = path.split('/').pop();
            const mime = mimeTypes[name.split('.').pop().toLowerCase()];
            const content = String(file.content || '');
            if (!name || !mime || content.length > 3_600_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) return [];
            const figure = document.createElement('figure'), image = document.createElement('img');
            image.alt = name;
            image.loading = 'lazy';
            image.src = 'data:' + mime + ';base64,' + content;
            figure.append(image, textNode('figcaption', name));
            return [figure];
        });
        if (!filesWithImages.length) return null;
        const details = document.createElement('details'), gallery = document.createElement('div');
        gallery.className = 'admin-review-attachments';
        gallery.append(...filesWithImages);
        details.className = 'admin-review-change';
        details.append(textNode('summary', 'Вложения (' + filesWithImages.length + ')'), gallery);
        return details;
    }

    window.createAdminReviews = function ({ database, currentUser, ownerUid, accountName }) {
        const inbox = byId('reviewInboxList'), inboxStatus = byId('reviewInboxStatus'), inboxRetry = byId('reviewInboxRetry');
        const detail = byId('reviewDetail'), detailStatus = byId('reviewDetailStatus'), detailRetry = byId('reviewDetailRetry');
        const title = byId('reviewTitle'), staleNotice = byId('reviewStale'), diff = byId('reviewDiff');
        const actions = byId('reviewActions'), approveButton = byId('reviewPublish'), returnButton = byId('reviewReturn');
        const returnForm = byId('reviewReturnForm'), returnNote = byId('reviewReturnNote'), returnSubmit = byId('reviewReturnSubmit');
        const actionError = byId('reviewActionError'), tabCount = byId('reviewTabCount'), inboxCount = byId('reviewInboxCount');
        const subjects = new Map();
        let client, unsubscribe, selected = '', entries = [], loaded = false, visible = false;
        let details = null, busy = false, requestSequence = 0, session = 0;
        let requestedReviewMissing = false;

        const owner = user => user?.uid === ownerUid && !user.isAnonymous;
        const subjectName = subject => subjects.get(subject) || subject;
        const currentEntry = () => entries.find(entry => entry.id === selected);

        function setCount() {
            const count = entries.length;
            tabCount.hidden = !count;
            inboxCount.hidden = !count;
            tabCount.textContent = count > 99 ? '99+' : count ? String(count) : '';
            inboxCount.textContent = count ? String(count) : '';
        }

        function authorName(entry) {
            return accountName(entry.authorUid) || entry.authorEmail || 'Редактор';
        }

        function submissionMeta(entry) {
            return [authorName(entry), Number(entry.submittedAt) > 0 ? dates.format(entry.submittedAt) : ''].filter(Boolean).join(' · ');
        }

        function paintInbox() {
            const focusId = inbox.contains(document.activeElement) ? document.activeElement.dataset.reviewId : null;
            inbox.replaceChildren(...entries.map(entry => {
                const item = document.createElement('li');
                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.reviewId = entry.id;
                button.className = 'admin-review-item';
                button.disabled = busy;
                if (entry.id === selected) button.setAttribute('aria-current', 'true');
                button.append(textNode('span', subjectName(entry.subject), 'admin-review-context'),
                    textNode('strong', entry.title),
                    textNode('small', submissionMeta(entry)));
                if (entry.status === 'publishing') button.append(textNode('span', 'Проверка публикации', 'admin-review-item-state'));
                item.append(button);
                return item;
            }));
            if (focusId) [...inbox.querySelectorAll('button')].find(button => button.dataset.reviewId === focusId)?.focus({ preventScroll: true });
        }

        function closeReturn() {
            returnForm.hidden = true;
            returnButton.setAttribute('aria-expanded', 'false');
            returnNote.value = '';
        }

        function paintActions() {
            const entry = currentEntry();
            actions.hidden = !details || !entry;
            const publishing = entry?.status === 'publishing';
            approveButton.disabled = busy || !details?.version || !entry || (!publishing && !details.baseMatches);
            approveButton.textContent = busy ? 'Подождите…' : publishing ? 'Проверить публикацию' : 'Утвердить и опубликовать';
            returnButton.hidden = publishing;
            returnButton.disabled = busy;
            returnSubmit.disabled = busy || publishing;
            byId('reviewReturnCancel').disabled = busy;
            if (publishing) closeReturn();
        }

        function showNotice(message, retry) {
            detailStatus.textContent = message;
            detailRetry.hidden = !retry;
        }

        function paintDetail() {
            const entry = currentEntry();
            if (!entry) return;
            title.textContent = entry.title;
            byId('reviewContext').textContent = subjectName(entry.subject) + ' · Версия ' + entry.revision;
            byId('reviewAuthor').textContent = submissionMeta(entry);
            const publishing = entry.status === 'publishing';
            staleNotice.hidden = !publishing && (!details || details.baseMatches || !details.base);
            staleNotice.textContent = publishing
                ? 'Публикация могла завершиться. Проверьте результат перед следующим действием.'
                : 'Опубликованный раздел обновился после начала правок. Верните версию редактору для сверки с текущим материалом.';
            paintActions();
        }

        function focusDetail() {
            title.focus({ preventScroll: true });
            detail.scrollIntoView({ block: matchMedia('(max-width: 980px)').matches ? 'start' : 'nearest', behavior: 'instant' });
        }

        function renderDetails(base, version) {
            const changes = differences(base.section, version.section);
            const heading = textNode('h3', changes.length ? 'Что изменилось (' + changes.length + ')' : 'Изменения', 'admin-review-diff-heading');
            diff.append(heading);
            if (changes.length) {
                diff.append(...changes.map(diffCard));
                diff.querySelector('details').open = true;
            } else {
                diff.append(textNode('p', 'Изменений в тексте и структуре раздела нет.', 'admin-review-notice'));
            }
            const attachments = imageAttachments(Array.isArray(version.files) ? version.files : []);
            if (attachments) diff.append(attachments);
        }

        async function openReview(id, focus = false) {
            selected = id;
            details = null;
            const request = ++requestSequence, entry = currentEntry();
            paintInbox();
            closeReturn();
            diff.replaceChildren();
            actionError.hidden = true;
            detail.hidden = !entry || !visible;
            if (!entry || !visible || !client) return;
            paintDetail();
            detail.setAttribute('aria-busy', 'true');
            showNotice('Загружаем версию и опубликованный раздел…');
            if (focus) focusDetail();
            const [version, base] = await Promise.allSettled([
                client.getVersion(id),
                window.NoteReview.readBase(entry)
            ]);
            if (request !== requestSequence || !owner(currentUser())) return;
            detail.setAttribute('aria-busy', 'false');
            const packageMatches = version.status === 'fulfilled' && version.value?.section &&
                version.value.authorUid === entry.authorUid && version.value.subject === entry.subject &&
                version.value.sectionId === entry.sectionId && version.value.section.title === entry.title &&
                version.value.section.revision === entry.revision;
            if (!packageMatches) {
                details = { version: null, base: null, baseMatches: false };
                showNotice('Не удалось прочитать отправленную версию. Повторите загрузку или верните её редактору.', true);
                paintDetail();
                return;
            }
            const published = base.status === 'fulfilled' ? base.value : null;
            details = {
                version: version.value, base: published,
                baseMatches: !!published && (published.hash || '') === (version.value.baseHash || '')
            };
            if (published) renderDetails(published, version.value);
            showNotice(published ? '' : 'Опубликованный раздел недоступен. Повторите загрузку, чтобы сверить правки.', !published);
            paintDetail();
        }

        function showInboxStatus() {
            inboxStatus.textContent = requestedReviewMissing ? 'Эта версия уже недоступна для проверки.'
                : entries.length ? '' : 'Новых версий на проверку пока нет.';
        }

        function openRequestedReview() {
            if (!loaded || !visible || location.hash !== '#reviews') return false;
            const url = new URL(location.href);
            const id = url.searchParams.get('review');
            if (!id || !reviewIdPattern.test(id)) return false;
            url.searchParams.delete('review');
            history.replaceState(history.state, '', url.href);
            const available = entries.some(entry => entry.id === id);
            requestedReviewMissing = !available;
            openReview(available ? id : '', available);
            showInboxStatus();
            return true;
        }

        function receive(items) {
            const previousIds = new Set(entries.map(entry => entry.id));
            entries = items;
            if (loaded) {
                const arrivals = entries.filter(entry => entry.status === 'pending' && !previousIds.has(entry.id));
                if (arrivals.length) window.AdminUI.notify(arrivals.length === 1
                    ? 'Раздел «' + arrivals[0].title + '» отправлен на проверку.'
                    : 'В редакции появились новые версии.');
            }
            loaded = true;
            setCount();
            inboxRetry.hidden = true;
            if (openRequestedReview()) return;
            showInboxStatus();
            if (!currentEntry() && !requestedReviewMissing) openReview(entries[0]?.id || '');
            else {
                paintInbox();
                paintDetail();
            }
        }

        function subscribe() {
            const user = currentUser();
            if (!owner(user)) return;
            const activeSession = session;
            inboxStatus.textContent = 'Загрузка…';
            inboxRetry.hidden = true;
            const onError = () => {
                if (session !== activeSession || !owner(currentUser())) return;
                inboxStatus.textContent = 'Не удалось загрузить очередь.';
                inboxRetry.hidden = false;
            };
            try {
                unsubscribe?.();
                client ??= window.NoteReview.create({ database, user });
                unsubscribe = client.watchPending(items => {
                    if (session === activeSession && owner(currentUser())) receive(items);
                }, onError);
            } catch (_) {
                onError();
            }
        }

        async function submitDecision(kind) {
            const entry = currentEntry(), activeClient = client;
            const originalDetails = details, activeSession = session;
            if (!entry || !details || busy || !owner(currentUser())) return;
            if (kind === 'returned' && entry.status !== 'pending') return;
            if (kind === 'published' && (!details.version || (!details.baseMatches && entry.status !== 'publishing'))) return;
            const note = returnNote.value.trim();
            if (kind === 'returned' && !note) {
                actionError.textContent = 'Напишите, что нужно доработать.';
                actionError.hidden = false;
                returnNote.focus();
                return;
            }
            busy = true;
            paintInbox();
            paintActions();
            actionError.hidden = true;
            try {
                if (kind === 'published') {
                    if (entry.status === 'pending' && !await window.AdminUI.confirm('Версия «' + entry.title + '» будет отправлена на сайт.', {
                        title: 'Утвердить версию', confirmLabel: 'Опубликовать'
                    })) return;
                    if (session !== activeSession || currentEntry()?.id !== entry.id || !owner(currentUser())) return;
                    await activeClient.publish(entry.id, originalDetails.version);
                } else {
                    await activeClient.decide(entry.id, { status: 'returned', note });
                }
                if (session !== activeSession || !owner(currentUser())) return;
                window.AdminUI.notify(kind === 'published' ? 'Версия утверждена. Сайт обновляется.' : 'Версия возвращена редактору.', { tone: 'success' });
            } catch (error) {
                if (session !== activeSession || currentEntry()?.id !== entry.id || !owner(currentUser())) return;
                if (error?.code === 'stale-base') {
                    originalDetails.baseMatches = false;
                    paintDetail();
                    actionError.textContent = 'Опубликованный материал уже изменился. Верните версию редактору.';
                } else if (error?.code === 'publisher-unavailable' || error?.code === 'review-rejected') {
                    actionError.textContent = error.message;
                } else {
                    actionError.textContent = kind === 'published'
                        ? 'Публикацию не удалось подтвердить. Проверьте состояние и повторите.'
                        : 'Не удалось вернуть версию. Повторите попытку.';
                }
                actionError.hidden = false;
            } finally {
                if (session === activeSession) {
                    busy = false;
                    paintInbox();
                    paintActions();
                }
            }
        }

        inbox.addEventListener('click', event => {
            const id = event.target.closest('[data-review-id]')?.dataset.reviewId;
            if (!id || busy) return;
            if (requestedReviewMissing) {
                requestedReviewMissing = false;
                showInboxStatus();
            }
            if (id === selected && !detail.hidden) focusDetail();
            else openReview(id, true);
        });
        inboxRetry.addEventListener('click', subscribe);
        detailRetry.addEventListener('click', () => openReview(selected));
        approveButton.addEventListener('click', () => submitDecision('published'));
        returnButton.addEventListener('click', () => {
            returnForm.hidden = !returnForm.hidden;
            returnButton.setAttribute('aria-expanded', String(!returnForm.hidden));
            if (!returnForm.hidden) (matchMedia('(pointer: coarse)').matches ? returnSubmit : returnNote).focus({ preventScroll: true });
        });
        returnForm.addEventListener('submit', event => { event.preventDefault(); submitDecision('returned'); });
        byId('reviewReturnCancel').addEventListener('click', () => { closeReturn(); returnButton.focus(); });

        return {
            start() {
                const user = currentUser();
                if (!owner(user) || client) return;
                subscribe();
                const activeSession = session;
                fetch('content/subjects.json').then(response => response.ok ? response.json() : []).then(items => {
                    if (session !== activeSession || !owner(currentUser())) return;
                    for (const item of items) subjects.set(item.id, item.title);
                    paintInbox();
                    paintDetail();
                }).catch(() => {});
            },
            stop() {
                ++session;
                ++requestSequence;
                unsubscribe?.();
                unsubscribe = client = details = null;
                entries = [];
                busy = loaded = false;
                requestedReviewMissing = false;
                selected = '';
                closeReturn();
                detail.hidden = true;
                detail.setAttribute('aria-busy', 'false');
                for (const node of [title, byId('reviewContext'), byId('reviewAuthor'), detailStatus, staleNotice, actionError]) node.textContent = '';
                diff.replaceChildren();
                inbox.replaceChildren();
                inboxRetry.hidden = detailRetry.hidden = actionError.hidden = true;
                setCount();
            },
            setVisible(next) {
                const changed = visible !== next;
                visible = next;
                if (openRequestedReview() || !changed) return;
                if (visible && selected && !details) openReview(selected);
                else detail.hidden = !visible || !selected;
            }
        };
    };
})();
