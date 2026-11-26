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
    const changedAssets = new Set([
        'home-art-store.js', 'home-art-review.js', 'styles/home-art.css', 'styles/home-art-review.css', 'profile-image.js'
    ]);
    const moduleUrl = document.currentScript.src;
    const photoAction = byId('PhotoAction');
    const photoFile = byId('PhotoFile');
    const photoMenu = byId('PhotoMenu');
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
        const version = changedAssets.has(file) ? '20261126-2' : '20261126-1';
        const source = new URL(file + '?v=' + version, moduleUrl).href;
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

    function sameBackground(first, second) {
        return (first?.drawing || '[]') === (second?.drawing || '[]') && (first?.photo || '') === (second?.photo || '');
    }

    function renderPhoto(image, photo) {
        if (!image) return;
        const source = window.AlmanionHomeArtStore?.photoUrl?.(photo) || '';
        if (source && image.getAttribute('src') !== source) image.src = source;
        else if (!source) image.removeAttribute('src');
        image.hidden = !source;
    }

    function closePhotoMenu(restoreFocus = false) {
        if (!photoMenu || photoMenu.hidden) return;
        photoMenu.hidden = true;
        photoAction.setAttribute('aria-expanded', 'false');
        if (restoreFocus) photoAction.focus({ preventScroll: true });
    }

    function updatePhotoControls() {
        if (!photoAction) return;
        const hasPhoto = Boolean(session?.photo);
        const label = hasPhoto ? 'Фото фона' : 'Загрузить фото';
        photoAction.setAttribute('aria-label', label);
        photoAction.title = label;
        photoAction.toggleAttribute('data-has-photo', hasPhoto);
        photoAction.disabled = Boolean(session?.photoBusy);
        renderPhoto(byId('CanvasPhoto'), session?.photo);
        if (byId('Clear')) {
            byId('Clear').setAttribute('aria-label', hasPhoto ? 'Очистить штрихи' : 'Очистить холст');
            byId('Clear').title = hasPhoto ? 'Очистить штрихи' : 'Очистить холст';
        }
    }

    function updateSubmit() {
        if (!session || !editor) return;
        const { baseRevision, own, busy, photoBusy } = session;
        const waiting = own.some(entry => entry.status === 'pending' && entry.baseRevision === baseRevision && sameBackground(entry, session));
        const stale = publicReady && baseRevision !== (published?.revision || 'none');
        const unchanged = sameBackground(session, published);
        byId('Conflict').hidden = !stale;
        byId('Submit').disabled = !publicReady || busy || photoBusy || stale || unchanged || waiting;
        byId('Submit').textContent = waiting ? 'Отправлено' : 'На проверку';
    }

    async function drawPublic() {
        const initial = preview ? session : published;
        const needsCanvas = initial?.drawing && initial.drawing !== '[]';
        const needsPhoto = initial?.photo && byId('BackgroundPhoto');
        const dependencies = [];
        if (needsCanvas && !publicCanvas) dependencies.push(load('home-art-canvas.js'));
        if (needsPhoto && !window.AlmanionHomeArtStore) dependencies.push(load('home-art-store.js'));
        if (needsCanvas || needsPhoto) dependencies.push(load('styles/home-art.css', true));
        if (dependencies.length) {
            try { await Promise.all(dependencies); }
            catch (_) { return; }
        }
        const current = preview ? session : published;
        if (current?.drawing && current.drawing !== '[]' && window.AlmanionHomeArtCanvas) {
            publicCanvas ||= window.AlmanionHomeArtCanvas.create(byId('Background'));
        }
        const strokes = (publicCanvas && window.AlmanionHomeArtCanvas.decode(current?.drawing)) || [];
        byId('Background').hidden = !strokes.length;
        publicCanvas?.setStrokes(strokes);
        renderPhoto(byId('BackgroundPhoto'), current?.photo);
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
                if (session && (!session.dirty || sameBackground(session, record))) {
                    const matchesDraft = session.dirty;
                    session.baseRevision = record?.revision || 'none';
                    session.drawing = record?.drawing || '[]';
                    session.photo = record?.photo || '';
                    session.dirty = false;
                    showNotice('');
                    if (matchesDraft) storeDraft();
                    else editor?.setStrokes(window.AlmanionHomeArtCanvas.decode(session.drawing));
                    updatePhotoControls();
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
        const { key, drawing, baseRevision, photo } = session;
        if (!writeCache(key, { drawing, baseRevision, photo })) showNotice('Не удалось сохранить черновик на устройстве.');
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
        closePhotoMenu();
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
        closePhotoMenu();
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
            const hasDraft = Boolean(draft && (!publicReady || !sameBackground(draft, published)));
            const source = hasDraft ? draft : published;
            const drawing = source?.drawing || '[]';
            const candidatePhoto = source?.photo;
            const photo = window.AlmanionHomeArtStore.photoUrl(candidatePhoto) ? candidatePhoto : '';
            const baseRevision = (hasDraft ? draft.baseRevision : published?.revision) || 'none';
            const client = window.AlmanionHomeArtStore.create(firebase.database(), user);
            session = { key, uid: user.uid, owner: user.uid === ownerUid, baseRevision, drawing, photo, client, own: [], dirty: hasDraft };
            byId('ReviewButton').hidden = !session.owner;
            dialog.showModal();
            editor = window.AlmanionHomeArtCanvas.create(byId('Canvas'), {
                editable: true,
                onChange: canvasChanged,
                onLimit: () => showNotice('На холсте много штрихов. Освободите место отменой или очисткой.')
            });
            editor.setStrokes(window.AlmanionHomeArtCanvas.decode(drawing));
            updatePhotoControls();
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
        closePhotoMenu();
        updatePhotoControls();
        if (location.hash === '#background-review') history.replaceState(history.state, '', location.pathname + location.search);
    }

    async function submit() {
        const current = session;
        if (!current || byId('Submit').disabled) return;
        current.busy = true;
        updateSubmit();
        showNotice('Отправляем фон…');
        const waiting = setTimeout(() => {
            if (session === current) showNotice('Отправка продолжится при подключении.');
        }, 8000);
        try {
            await current.client.submit({ drawing: current.drawing, photo: current.photo, baseRevision: current.baseRevision });
            if (session === current) showNotice('Фон отправлен на проверку.');
        } catch (_) {
            if (session === current) showNotice('Не удалось отправить фон. Повторите попытку.');
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
        if (usePublished) {
            session.photo = published?.photo || '';
            editor.setStrokes(window.AlmanionHomeArtCanvas.decode(published?.drawing));
            updatePhotoControls();
        }
        session.dirty = !usePublished;
        showNotice('');
        storeDraft();
        updateSubmit();
    }

    function selectPhoto(photo) {
        if (!session) return;
        showNotice('');
        if (session.photo === photo) return;
        session.photo = photo;
        session.dirty = true;
        storeDraft();
        updatePhotoControls();
        updateSubmit();
    }

    photoAction?.addEventListener('click', () => {
        if (!session || session.photoBusy) return;
        if (!session.photo) { photoFile.click(); return; }
        if (!photoMenu.hidden) { closePhotoMenu(true); return; }
        photoMenu.hidden = false;
        photoAction.setAttribute('aria-expanded', 'true');
        byId('PhotoChoose').focus({ preventScroll: true });
    });
    byId('PhotoChoose')?.addEventListener('click', () => {
        closePhotoMenu(true);
        photoFile.click();
    });
    byId('PhotoRemove')?.addEventListener('click', () => {
        closePhotoMenu(true);
        selectPhoto('');
    });
    photoFile?.addEventListener('change', async () => {
        const file = photoFile.files[0];
        photoFile.value = '';
        const current = session;
        if (!file || !current || current.photoBusy) return;
        current.photoBusy = true;
        showNotice('Готовим фото…');
        updatePhotoControls();
        updateSubmit();
        try {
            await load('profile-image.js');
            const photo = await window.AlmanionProfileImage.encodeBackground(file);
            if (session === current) selectPhoto(photo);
        } catch (error) {
            if (session === current) showNotice(error.message || 'Не удалось открыть фото.');
        } finally {
            if (session === current) {
                current.photoBusy = false;
                updatePhotoControls();
                updateSubmit();
                if (dialog.open && byId('Panel').hidden) photoAction.focus({ preventScroll: true });
            }
        }
    });

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
    dialog.addEventListener('cancel', event => {
        if (photoMenu && !photoMenu.hidden) {
            event.preventDefault();
            closePhotoMenu(true);
        }
    });
    dialog.addEventListener('click', event => {
        if (photoMenu && !photoMenu.hidden && !photoMenu.contains(event.target) && !photoAction.contains(event.target)) closePhotoMenu();
    });
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
    if (published?.drawing || published?.photo) drawPublic();
    window.addEventListener('almanion-account-ready', accountReady);
    window.addEventListener('hashchange', accountReady);
    if (window.AlmanionAccount?.isReady()) accountReady();
}());
