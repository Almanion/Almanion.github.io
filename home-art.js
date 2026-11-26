(function () {
    'use strict';

    const byId = id => document.getElementById('homeArt' + id);
    const dialog = byId('Dialog');
    if (!dialog) return;

    const publicCache = 'almanion:home-art:published';
    const ownerUid = '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';
    const dateFormat = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' });
    const palette = [
        ['#949aff', 'Сиреневый'], ['#79c6f7', 'Голубой'], ['#78d8b7', 'Мятный'],
        ['#eda0bb', 'Розовый'], ['#eeb97e', 'Янтарный'], ['#8a8d9e', 'Серый']
    ];
    const statuses = { pending: 'На проверке', returned: 'На доработку', published: 'Опубликован', withdrawn: 'Отозван' };
    const resources = new Map();
    const moduleUrl = document.currentScript.src;
    let publicReady = false, published = null, publicCanvas = null, observing = false;
    let editor = null, reviewPanel = null, session = null, opening = false, preview = false;
    let color = palette[0][0], erase = false;
    const header = byId('Header');
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => {
        dialog.style.setProperty('--home-art-header-height', header.offsetHeight + 'px');
    }).observe(header);

    function load(file, style = false) {
        if (resources.has(file)) return resources.get(file);
        const element = document.createElement(style ? 'link' : 'script');
        const source = new URL(file + '?v=20261126-1', moduleUrl).href;
        if (style) { element.rel = 'stylesheet'; element.href = source; }
        else { element.src = source; element.async = true; }
        const promise = new Promise((resolve, reject) => {
            element.onload = resolve;
            element.onerror = () => {
                element.remove();
                resources.delete(file);
                reject(new Error('Не удалось загрузить редактор фона'));
            };
            document.head.appendChild(element);
        });
        resources.set(file, promise);
        return promise;
    }

    function readCache(key) {
        try { return JSON.parse(localStorage.getItem(key)); }
        catch (_) { return null; }
    }

    function writeCache(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (_) { return false; }
    }

    function showNotice(message) {
        byId('Notice').hidden = !message;
        byId('Notice').textContent = message;
    }

    function updateSubmit() {
        if (!session || !editor) return;
        const { baseRevision, drawing, own, busy } = session;
        const waiting = own.some(entry => entry.status === 'pending' && entry.baseRevision === baseRevision && entry.drawing === drawing);
        const stale = publicReady && baseRevision !== (published?.revision || 'none');
        const unchanged = drawing === (published?.drawing || '[]');
        byId('Conflict').hidden = !stale;
        byId('Submit').disabled = !publicReady || busy || stale || unchanged || waiting;
        byId('Submit').textContent = waiting ? 'Отправлено' : 'На проверку';
    }

    async function drawPublic() {
        const initial = preview ? session?.drawing : published?.drawing;
        if (initial && initial !== '[]' && !publicCanvas) {
            try { await Promise.all([load('home-art-canvas.js'), load('styles/home-art.css', true)]); }
            catch (_) { return; }
            publicCanvas ||= window.AlmanionHomeArtCanvas.create(byId('Background'));
        }
        const drawing = preview ? session?.drawing : published?.drawing;
        const strokes = (publicCanvas && window.AlmanionHomeArtCanvas.decode(drawing)) || [];
        byId('Background').hidden = !strokes.length;
        publicCanvas?.setStrokes(strokes);
    }

    async function observePublished() {
        if (observing || !window.firebase?.apps?.length) return;
        observing = true;
        try {
            await load('home-art-store.js');
            const store = window.AlmanionHomeArtStore.create(firebase.database());
            store.watchPublished(record => {
                published = record;
                publicReady = true;
                writeCache(publicCache, record);
                if (session && !session.dirty) {
                    session.baseRevision = record?.revision || 'none';
                    session.drawing = record?.drawing || '[]';
                    editor?.setStrokes(window.AlmanionHomeArtCanvas.decode(session.drawing));
                    showNotice('');
                }
                drawPublic();
                updateSubmit();
            }, () => {
                if (session) showNotice('Общий фон недоступен. Рисунок можно сохранить на устройстве.');
            });
        } catch (_) { observing = false; }
    }

    function storeDraft() {
        if (!session) return;
        const { key, drawing, baseRevision } = session;
        if (!writeCache(key, { drawing, baseRevision })) showNotice('Не удалось сохранить черновик на устройстве.');
    }

    function canvasChanged(strokes, state) {
        byId('Undo').disabled = !state.canUndo;
        byId('Redo').disabled = !state.canRedo;
        byId('Clear').disabled = state.isEmpty;
        if (!session) return;
        const drawing = JSON.stringify(strokes);
        if (session.drawing !== drawing) {
            session.drawing = drawing;
            session.dirty = true;
            showNotice('');
            storeDraft();
        }
        updateSubmit();
    }

    function applyBrush() {
        for (const swatch of byId('Colors').children) {
            swatch.setAttribute('aria-pressed', String(!erase && swatch.dataset.color === color));
        }
        byId('Eraser').setAttribute('aria-pressed', String(erase));
        editor?.setBrush({ color, size: Number(byId('Size').value), erase });
    }

    function showCanvas() {
        reviewPanel?.stop();
        byId('Panel').hidden = true;
        byId('Canvas').inert = false;
        byId('Controls').inert = false;
        byId('Title').focus({ preventScroll: true });
    }

    function renderOwn() {
        const host = byId('Own');
        if (!session) return;
        host.replaceChildren();
        if (!session.own.length) {
            host.textContent = session.ownLoaded ? 'Отправленных рисунков пока нет.' : 'Загружаем рисунки…';
            return;
        }
        const list = document.createElement('ul');
        list.className = 'home-art-own-list';
        for (const entry of session.own) {
            const row = document.createElement('li');
            row.className = 'home-art-own-row';
            const title = document.createElement('strong');
            title.textContent = statuses[entry.status] || 'Рисунок';
            const time = document.createElement('span');
            time.textContent = dateFormat.format(entry.submittedAt);
            row.append(title, time);
            if (entry.note) {
                const note = document.createElement('p');
                note.textContent = entry.note;
                row.append(note);
            }
            if (entry.status === 'pending') {
                const withdraw = document.createElement('button');
                withdraw.type = 'button';
                withdraw.className = 'home-art-button';
                withdraw.textContent = 'Отозвать';
                withdraw.addEventListener('click', async () => {
                    withdraw.disabled = true;
                    try { await session.client.withdraw(entry); }
                    catch (_) { withdraw.textContent = 'Повторить'; withdraw.disabled = false; }
                });
                row.append(withdraw);
            }
            list.append(row);
        }
        host.append(list);
    }

    async function showPanel(review) {
        const current = session;
        if (!current || (review && !current.owner)) return;
        byId('Panel').hidden = false;
        byId('Canvas').inert = true;
        byId('Controls').inert = true;
        byId('PanelTitle').textContent = review ? 'Рисунки на проверке' : 'Мои рисунки';
        byId('Own').hidden = review;
        byId('Review').hidden = !review;
        byId('PanelTitle').focus({ preventScroll: true });
        if (!review) {
            reviewPanel?.stop();
            renderOwn();
            return;
        }
        byId('Review').textContent = 'Загружаем рисунки…';
        try {
            await Promise.all([load('home-art-review.js'), load('styles/home-art-review.css', true)]);
            if (current !== session || byId('Panel').hidden || byId('Review').hidden) return;
            reviewPanel?.stop();
            reviewPanel = window.AlmanionHomeArtReview.create({ host: byId('Review'), client: current.client });
            reviewPanel.start();
        } catch (_) { byId('Review').textContent = 'Не удалось загрузить рисунки. Откройте список ещё раз.'; }
    }

    async function open(trigger, review = false) {
        if (opening || session) return;
        const account = window.AlmanionAccount;
        const user = account?.getUser();
        if (!user || (review && user.uid !== ownerUid)) return;
        opening = true;
        trigger?.setAttribute('aria-busy', 'true');
        try {
            const [allowed] = await Promise.all([
                account.hasContentEditorAccess(user), load('home-art-canvas.js'), load('home-art-store.js'), load('styles/home-art.css', true)
            ]);
            if (!allowed || account.getUser()?.uid !== user.uid) return;
            const key = 'almanion:home-art:draft:' + user.uid;
            const draft = readCache(key);
            const drawing = draft?.drawing || published?.drawing || '[]';
            const baseRevision = draft?.baseRevision || published?.revision || 'none';
            const client = window.AlmanionHomeArtStore.create(firebase.database(), user);
            session = { key, uid: user.uid, owner: user.uid === ownerUid, baseRevision, drawing, client, own: [], dirty: Boolean(draft) };
            byId('ReviewButton').hidden = !session.owner;
            dialog.showModal();
            editor = window.AlmanionHomeArtCanvas.create(byId('Canvas'), {
                editable: true,
                onChange: canvasChanged,
                onLimit: () => showNotice('На холсте много штрихов. Освободите место отменой или очисткой.')
            });
            editor.setStrokes(window.AlmanionHomeArtCanvas.decode(drawing));
            applyBrush();
            showNotice(publicReady ? '' : 'Подключаем общий фон…');
            const current = session;
            current.unsubscribe = client.watchOwn(entries => {
                if (session !== current) return;
                current.own = entries;
                current.ownLoaded = true;
                updateSubmit();
                if (!byId('Panel').hidden && !byId('Own').hidden) renderOwn();
            }, () => {
                if (session !== current) return;
                byId('Own').textContent = 'Не удалось загрузить рисунки.';
            });
            if (review) showPanel(true);
            else showCanvas();
        } catch (_) {
            if (dialog.open) dialog.close();
            window.AlmanionToast?.show('Не удалось открыть редактор фона. Повторите попытку.', { type: 'error' });
        } finally {
            opening = false;
            trigger?.removeAttribute('aria-busy');
        }
    }

    function closeSession() {
        if (preview || dialog.open) return;
        reviewPanel?.stop();
        reviewPanel = null;
        session?.unsubscribe?.();
        editor?.destroy();
        session = editor = null;
        if (location.hash === '#background-review') history.replaceState(history.state, '', location.pathname + location.search);
    }

    async function submit() {
        const current = session;
        if (!current || byId('Submit').disabled) return;
        current.busy = true;
        updateSubmit();
        showNotice('Отправляем рисунок…');
        const waiting = setTimeout(() => {
            if (session === current) showNotice('Отправка продолжится при подключении. Черновик на устройстве.');
        }, 8000);
        try {
            await current.client.submit({ drawing: current.drawing, baseRevision: current.baseRevision });
            if (session === current) showNotice('Рисунок отправлен на проверку.');
        } catch (_) {
            if (session === current) showNotice('Не удалось отправить рисунок. Черновик сохранён на устройстве.');
        } finally {
            clearTimeout(waiting);
            if (session === current) {
                current.busy = false;
                updateSubmit();
            }
        }
    }

    function rebase(usePublished) {
        if (!session || !publicReady) return;
        session.baseRevision = published?.revision || 'none';
        if (usePublished) editor.setStrokes(window.AlmanionHomeArtCanvas.decode(published?.drawing));
        session.dirty = !usePublished;
        storeDraft();
        showNotice('');
        updateSubmit();
    }

    for (const [ink, label] of palette) {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'home-art-color';
        swatch.dataset.color = ink;
        swatch.style.setProperty('--ink-color', ink);
        swatch.title = label;
        swatch.setAttribute('aria-label', label);
        swatch.addEventListener('click', () => { color = ink; erase = false; applyBrush(); });
        byId('Colors').append(swatch);
    }

    byId('Size').addEventListener('input', applyBrush);
    byId('Eraser').addEventListener('click', () => { erase = !erase; applyBrush(); });
    byId('Undo').addEventListener('click', () => editor?.undo());
    byId('Redo').addEventListener('click', () => editor?.redo());
    byId('Clear').addEventListener('click', () => editor?.clear());
    byId('Close').addEventListener('click', () => dialog.close());
    byId('Submit').addEventListener('click', submit);
    byId('UsePublished').addEventListener('click', () => rebase(true));
    byId('KeepDraft').addEventListener('click', () => rebase(false));
    byId('History').addEventListener('click', () => showPanel(false));
    byId('ReviewButton').addEventListener('click', () => showPanel(true));
    byId('Back').addEventListener('click', showCanvas);
    byId('Preview').addEventListener('click', () => {
        if (!session) return;
        preview = true;
        showCanvas();
        dialog.close();
        byId('PreviewBar').hidden = false;
        byId('Resume').focus({ preventScroll: true });
        drawPublic();
    });
    byId('Resume').addEventListener('click', () => {
        byId('PreviewBar').hidden = true;
        if (!session) return;
        dialog.showModal();
        preview = false;
        drawPublic();
        showCanvas();
    });
    dialog.addEventListener('close', closeSession);
    document.addEventListener('click', event => {
        const trigger = event.target.closest('[data-home-art-open]');
        if (!trigger) return;
        if (preview) byId('Resume').click();
        else open(trigger);
    });
    dialog.addEventListener('keydown', event => {
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || !byId('Panel').hidden) return;
        event.preventDefault();
        if (event.shiftKey) editor?.redo();
        else editor?.undo();
    });

    function accountReady() {
        observePublished();
        if (session && session.uid !== window.AlmanionAccount?.getUser()?.uid) {
            preview = false;
            byId('PreviewBar').hidden = true;
            if (dialog.open) dialog.close();
            else closeSession();
            drawPublic();
        }
        if (location.hash === '#background-review') open(null, true);
    }

    published = readCache(publicCache);
    if (published?.drawing) drawPublic();
    window.addEventListener('almanion-account-ready', accountReady);
    window.addEventListener('hashchange', accountReady);
    if (window.AlmanionAccount?.isReady()) accountReady();
}());
