(function (win) {
    'use strict';

    const dates = new Intl.DateTimeFormat('ru-RU', {
        dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow'
    });

    function element(tag, className, text) {
        const node = win.document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function button(text, primary = false) {
        const node = element('button', 'home-art-review-button' + (primary ? ' is-primary' : ''), text);
        node.type = 'button';
        return node;
    }

    function createPreview(label, id) {
        const figure = element('figure', 'home-art-review-figure');
        figure.id = id;
        const canvas = element('canvas', 'home-art-review-canvas');
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', label);
        figure.append(canvas, element('figcaption', '', label));
        return { figure, canvas };
    }

    function create({ host, client, onPublished, onPendingCount }) {
        const list = element('ul', 'home-art-review-list');
        list.setAttribute('aria-label', 'Версии фона на проверке');
        const queueStatus = element('p', 'home-art-review-notice');
        queueStatus.setAttribute('role', 'status');
        const retry = button('Повторить');
        const queue = element('aside', 'home-art-review-queue');
        queue.append(queueStatus, retry, list);

        const detail = element('section', 'home-art-review-detail');
        const title = element('h3', 'home-art-review-title');
        const metadata = element('p', 'home-art-review-meta');
        const comparison = element('div', 'home-art-review-comparison');
        const choices = element('div', 'home-art-review-choices');
        choices.setAttribute('role', 'group');
        choices.setAttribute('aria-label', 'Предпросмотр фона');
        const before = createPreview('На сайте', 'homeArtReviewCurrent');
        const after = createPreview('Предложено', 'homeArtReviewProposed');
        const beforeButton = button('На сайте');
        const afterButton = button('Предложено');
        beforeButton.setAttribute('aria-controls', before.figure.id);
        afterButton.setAttribute('aria-controls', after.figure.id);
        choices.append(beforeButton, afterButton);
        comparison.append(before.figure, after.figure);

        const notice = element('p', 'home-art-review-notice home-art-review-decision-notice');
        notice.setAttribute('role', 'status');
        const decisionError = element('p', 'home-art-review-error');
        decisionError.setAttribute('role', 'alert');
        const approve = button('Опубликовать фон', true);
        const returnButton = button('Вернуть');
        returnButton.setAttribute('aria-expanded', 'false');
        const actions = element('div', 'home-art-review-actions');
        actions.append(approve, returnButton);

        const returnForm = element('form', 'home-art-review-return');
        returnForm.id = 'homeArtReviewReturn';
        returnButton.setAttribute('aria-controls', returnForm.id);
        const note = element('textarea', 'home-art-review-note');
        note.id = 'homeArtReviewNote';
        note.maxLength = 1200;
        note.required = true;
        note.rows = 3;
        const noteLabel = element('label', '', 'Комментарий редактору');
        noteLabel.htmlFor = note.id;
        const sendBack = button('Вернуть рисунок', true);
        sendBack.type = 'submit';
        const cancel = button('Отмена');
        const returnActions = element('div', 'home-art-review-actions');
        returnActions.append(sendBack, cancel);
        returnForm.append(noteLabel, note, returnActions);

        const result = element('p', 'home-art-review-result');
        result.setAttribute('role', 'status');
        detail.append(title, metadata, choices, comparison, notice, actions, returnForm, decisionError);
        const layout = element('div', 'home-art-review-layout');
        layout.append(queue, detail);
        host.classList.add('home-art-review');
        host.replaceChildren(result, layout);

        const canvasApi = win.AlmanionHomeArtCanvas;
        let engines = [];
        let pending = null;
        let published;
        let selected = null;
        let watchError = false;
        let publishedError = false;
        let busy = false;
        let active = false;
        let generation = 0;
        let subscriptions = [];

        function togglePreview(value) {
            comparison.dataset.preview = value;
            beforeButton.setAttribute('aria-pressed', String(value === 'current'));
            afterButton.setAttribute('aria-pressed', String(value === 'proposed'));
        }

        function closeForm() {
            returnForm.hidden = true;
            note.value = '';
            note.setCustomValidity('');
            returnButton.setAttribute('aria-expanded', 'false');
        }

        function currentEntry() {
            return pending?.find(item => item.id === selected);
        }

        function stale(entry) {
            return published !== undefined && entry.baseRevision !== (published?.revision ?? 'none');
        }

        function paintList() {
            const focused = list.contains(win.document.activeElement) ? win.document.activeElement.dataset.id : null;
            list.replaceChildren();
            if (watchError) queueStatus.textContent = 'Не удалось загрузить версии.';
            else if (pending === null) queueStatus.textContent = 'Загружаем версии…';
            else queueStatus.textContent = pending.length ? '' : 'Фонов на проверке пока нет.';
            retry.hidden = !watchError && !publishedError;
            for (const entry of pending ?? []) {
                const item = element('li', 'home-art-review-item');
                const control = element('button', 'home-art-review-entry');
                control.type = 'button';
                control.dataset.id = entry.id;
                control.disabled = busy;
                control.setAttribute('aria-pressed', String(entry.id === selected));
                const date = Number.isFinite(entry.submittedAt) ? dates.format(entry.submittedAt) : '';
                control.append(element('strong', '', entry.authorEmail || 'Редактор'), element('small', '', date));
                item.append(control);
                list.append(item);
                if (entry.id === focused && !busy) control.focus({ preventScroll: true });
            }
        }

        function paintDetail() {
            const entry = currentEntry();
            detail.hidden = !entry;
            if (!entry) return;
            const currentStrokes = published ? canvasApi.decode(published.drawing) : [];
            const suggestedStrokes = canvasApi.decode(entry.drawing);
            engines[0]?.setStrokes(currentStrokes ?? []);
            engines[1]?.setStrokes(suggestedStrokes ?? []);
            const date = Number.isFinite(entry.submittedAt) ? dates.format(entry.submittedAt) : '';
            title.textContent = entry.authorEmail || 'Редактор';
            metadata.textContent = date;
            notice.textContent = '';
            if (publishedError) notice.textContent = 'Не удалось загрузить текущий фон.';
            else if (published === undefined) notice.textContent = 'Загружаем текущий фон…';
            else if (stale(entry)) notice.textContent = 'Фон уже обновился. Верните рисунок редактору для сверки.';
            else if (!suggestedStrokes) notice.textContent = 'Не удалось прочитать предложенный рисунок.';
            else if (!currentStrokes) notice.textContent = 'Не удалось прочитать текущий рисунок.';
            else if (engines.some(engine => !engine)) notice.textContent = 'Предпросмотр недоступен в этом браузере.';
            approve.disabled = busy || published === undefined || publishedError || stale(entry)
                || !suggestedStrokes || engines.some(engine => !engine);
            returnButton.disabled = busy;
            sendBack.disabled = busy;
            cancel.disabled = busy;
            note.disabled = busy;
        }

        function select(id) {
            if (selected === id) return;
            selected = id;
            decisionError.textContent = '';
            togglePreview('proposed');
            closeForm();
        }

        function start() {
            if (active) return;
            active = true;
            const request = ++generation;
            engines = [before, after].map(view => canvasApi.create(view.canvas, { editable: false }));
            result.textContent = '';
            decisionError.textContent = '';
            select(null);
            closeForm();
            togglePreview('proposed');
            paintList();
            paintDetail();
            subscriptions = [
                client.watchPending(entries => {
                    if (request !== generation) return;
                    watchError = false;
                    pending = entries;
                    select(currentEntry()?.id ?? entries[0]?.id ?? null);
                    onPendingCount?.(entries.length);
                    paintList();
                    paintDetail();
                }, () => {
                    if (request !== generation) return;
                    watchError = true;
                    pending = null;
                    select(null);
                    paintList();
                    paintDetail();
                }),
                client.watchPublished(value => {
                    if (request !== generation) return;
                    publishedError = false;
                    published = value;
                    retry.hidden = !watchError;
                    paintDetail();
                }, () => {
                    if (request !== generation) return;
                    publishedError = true;
                    retry.hidden = false;
                    paintDetail();
                })
            ];
        }

        function stop() {
            if (!active) return;
            active = false;
            generation += 1;
            subscriptions.forEach(unsubscribe => unsubscribe());
            subscriptions = [];
            engines.forEach(engine => engine?.destroy());
            engines = [];
            pending = null;
            published = undefined;
            watchError = publishedError = busy = false;
            list.replaceChildren();
            detail.hidden = true;
            closeForm();
        }

        async function decide(publish) {
            const entry = currentEntry();
            if (busy || !entry) return;
            const message = note.value.trim();
            if (!publish && !message) {
                note.setCustomValidity('Укажите, что нужно исправить.');
                note.reportValidity();
                return;
            }
            const request = generation;
            busy = true;
            decisionError.textContent = '';
            result.textContent = '';
            paintList();
            paintDetail();
            try {
                if (publish) await client.approve(entry);
                else await client.returnForRevision(entry, message);
                if (publish) onPublished?.();
                if (request !== generation) return;
                result.textContent = publish ? 'Фон опубликован.' : 'Рисунок возвращён.';
                closeForm();
            } catch (error) {
                if (request !== generation) return;
                if (error?.code === 'stale-background') {
                    decisionError.textContent = 'Фон уже обновился. Проверьте текущую версию.';
                    try {
                        const latest = await client.readPublished();
                        if (request === generation) published = latest;
                    } catch {
                        if (request === generation) publishedError = true;
                    }
                } else {
                    decisionError.textContent = publish ? 'Не удалось опубликовать фон. Повторите попытку.' : 'Не удалось вернуть рисунок. Повторите попытку.';
                }
            } finally {
                if (request === generation) {
                    busy = false;
                    paintList();
                    paintDetail();
                    retry.hidden = !watchError && !publishedError;
                }
            }
        }

        list.addEventListener('click', event => {
            const control = event.target.closest('button[data-id]');
            if (!control || busy) return;
            select(control.dataset.id);
            result.textContent = '';
            paintList();
            paintDetail();
        });
        beforeButton.addEventListener('click', () => togglePreview('current'));
        afterButton.addEventListener('click', () => togglePreview('proposed'));
        approve.addEventListener('click', () => decide(true));
        returnButton.addEventListener('click', () => {
            decisionError.textContent = '';
            returnForm.hidden = false;
            returnButton.setAttribute('aria-expanded', 'true');
            note.focus();
        });
        cancel.addEventListener('click', () => {
            closeForm();
            returnButton.focus();
        });
        note.addEventListener('input', () => note.setCustomValidity(''));
        returnForm.addEventListener('submit', event => {
            event.preventDefault();
            decide(false);
        });
        retry.addEventListener('click', () => {
            stop();
            start();
        });
        retry.hidden = detail.hidden = returnForm.hidden = true;

        return { start, stop };
    }

    win.AlmanionHomeArtReview = { create };
})(window);
