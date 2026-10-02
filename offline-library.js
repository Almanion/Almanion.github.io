(function () {
    'use strict';
    const INDEX = 'almanion-offline-index-v1', PREFIX = 'almanion-offline-pack-';
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const bytesLabel = bytes => bytes < 1048576 ? Math.ceil(bytes / 1024) + ' КБ' : (bytes / 1048576).toFixed(1).replace('.', ',') + ' МБ';
    let catalogue = [], installed = {}, job = null, dialog, returnFocus;
    const supported = () => window.isSecureContext && 'serviceWorker' in navigator && 'caches' in window && !!window.crypto?.subtle;
    const key = id => new URL('/__offline/' + id, location.origin).href;
    async function installedPacks() {
        const index = await caches.open(INDEX), result = {};
        for (const request of await index.keys()) {
            if (!new URL(request.url).pathname.startsWith('/__offline/')) continue;
            try {
                const entry = await (await index.match(request)).json();
                if (entry.cacheName?.startsWith(PREFIX) && await caches.has(entry.cacheName)) {
                    const pack = await caches.open(entry.cacheName);
                    if ((await pack.keys()).length === entry.fileCount) result[entry.id] = entry;
                }
            } catch (_) {}
        }
        return result;
    }
    async function load() {
        const index = await caches.open(INDEX);
        try {
            const response = await fetch('/offline-library.json?offline-download=catalogue', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
            if (!response.ok) throw new Error('Каталог недоступен');
            const value = await response.clone().json();
            if (value.schemaVersion !== 1 || !Array.isArray(value.subjects)) throw new Error('Некорректный каталог');
            await index.put('/__offline-catalogue', response);
            catalogue = value.subjects;
        } catch (error) {
            const cached = await index.match('/__offline-catalogue');
            if (!cached) throw error;
            catalogue = (await cached.json()).subjects;
        }
        installed = await installedPacks();
    }
    const svg = paths => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
    const downloadIcon = svg('<path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5"/>');
    const checkIcon = svg('<path d="m6 12 4 4 8-8"/>');
    function render() {
        if (!dialog) return;
        const rows = dialog.querySelector('.offline-subjects');
        const active = location.pathname.split('/').pop();
        const ordered = catalogue.slice().sort((a, b) => Number(b.page === active) - Number(a.page === active));
        rows.innerHTML = ordered.map(subject => {
            const pack = installed[subject.id], current = pack && pack.version === subject.version;
            const loading = job?.id === subject.id;
            const percent = loading ? Math.round(job.done / Math.max(1, job.total) * 100) : 0;
            const state = loading ? 'Загрузка · ' + percent + '%' : current ? 'Доступно без сети' : pack ? 'Есть обновление' : 'Не загружено';
            return '<article data-offline-subject="' + esc(subject.id) + '" class="offline-subject' + (current ? ' is-ready' : '') + '">' +
                '<div class="offline-subject-mark">' + (current ? checkIcon : downloadIcon) + '</div><div class="offline-subject-copy"><h3>' + esc(subject.title) + '</h3><div><span class="offline-subject-state">' + state + '</span><span>' + bytesLabel(subject.bytes) + '</span></div>' +
                (loading ? '<progress max="100" value="' + percent + '" aria-label="Загрузка ' + esc(subject.title) + '"></progress>' : '') + '</div><div class="offline-subject-actions">' +
                (loading ? '<button type="button" data-offline-cancel>Отменить</button>' : current ? '<a href="' + esc(subject.page) + '">Читать</a>' : '<button type="button" class="reader-tool-primary" data-offline-download="' + esc(subject.id) + '"' + (job || !navigator.onLine ? ' disabled' : '') + '>' + (pack ? 'Обновить' : 'Скачать') + '</button>') +
                (pack && !loading ? '<button type="button" class="reader-tool-icon" data-offline-remove="' + esc(subject.id) + '" aria-label="Удалить загрузку ' + esc(subject.title) + '" title="Удалить с устройства">' + svg('<path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V3h6v4"/>') + '</button>' : '') + '</div></article>';
        }).join('');
        const packs = Object.values(installed);
        dialog.querySelector('.offline-storage').textContent = packs.length ? 'На устройстве: ' + packs.length + ' · ' + bytesLabel(packs.reduce((sum, pack) => sum + pack.bytes, 0)) : 'Загрузки сохраняются на этом устройстве';
        dialog.querySelector('.offline-connection').textContent = navigator.onLine ? '' : 'Нет сети. Уже загруженные конспекты можно читать.';
    }
    function announce(message, error) {
        const node = dialog?.querySelector('.offline-message');
        if (node) { node.textContent = message; node.classList.toggle('is-error', !!error); }
    }
    function abortError() { return new DOMException('Отменено', 'AbortError'); }
    function deadline(promise, signal, milliseconds = 12000) {
        if (signal.aborted) return Promise.reject(abortError());
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => finish(reject, new Error('Не удалось подготовить офлайн-чтение. Повторите попытку.')), milliseconds);
            const abort = () => finish(reject, abortError());
            function finish(callback, result) { clearTimeout(timer); signal.removeEventListener('abort', abort); callback(result); }
            signal.addEventListener('abort', abort, { once: true });
            Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
        });
    }
    function ping(worker, signal) {
        return new Promise(resolve => {
            if (!worker) return resolve(false);
            const channel = new MessageChannel();
            const done = value => { clearTimeout(timer); signal.removeEventListener('abort', abort); channel.port1.close(); channel.port2.close(); resolve(value); };
            const timer = setTimeout(() => done(false), 1500);
            const abort = () => done(false);
            if (signal.aborted) return done(false);
            signal.addEventListener('abort', abort, { once: true });
            channel.port1.onmessage = event => done(event.data?.offlineLibrary === 1);
            worker.postMessage({ type: 'OFFLINE_LIBRARY_PING' }, [channel.port2]);
        });
    }
    async function prepareWorker(signal) {
        const registration = await deadline(navigator.serviceWorker.register('/sw.js', { scope: '/' }), signal);
        await deadline(navigator.serviceWorker.ready, signal);
        if (await ping(navigator.serviceWorker.controller || registration.active, signal)) return;
        await deadline(registration.update(), signal);
        if (registration.installing) await new Promise(resolve => {
            const worker = registration.installing;
            const timer = setTimeout(() => done(), 12000);
            const done = () => { clearTimeout(timer); worker.removeEventListener('statechange', changed); signal.removeEventListener('abort', done); resolve(); };
            const changed = () => { if (worker.state === 'installed' || worker.state === 'redundant') done(); };
            worker.addEventListener('statechange', changed);
            signal.addEventListener('abort', done, { once: true });
            changed();
        });
        if (signal.aborted) throw abortError();
        registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
        for (let attempt = 0; attempt < 6; attempt++) {
            if (signal.aborted) throw abortError();
            if (await ping(navigator.serviceWorker.controller || registration.active, signal)) return;
        }
        throw new Error('Обновите страницу, чтобы включить офлайн-чтение.');
    }
    async function download(id) {
        if (job) return;
        const subject = catalogue.find(item => item.id === id);
        if (!subject || !supported()) return;
        const controller = new AbortController();
        const cacheName = PREFIX + id + '-' + subject.version + '-' + crypto.randomUUID();
        job = { id, done: 0, total: subject.files.length, controller };
        render(); announce('');
        let committed = false;
        try {
            await prepareWorker(controller.signal);
            const estimate = await navigator.storage?.estimate?.();
            if (estimate?.quota && estimate.quota - (estimate.usage || 0) < subject.bytes * 1.15) throw new Error('Недостаточно места. Удалите ненужную загрузку и повторите.');
            const cache = await caches.open(cacheName);
            let cursor = 0, fatalError = null;
            const worker = async () => {
                try {
                while (cursor < subject.files.length) {
                    if (controller.signal.aborted) throw new DOMException('Отменено', 'AbortError');
                    const file = subject.files[cursor++];
                    const source = new URL(file.source, location.origin);
                    const url = new URL(file.url, location.origin);
                    if (source.origin !== location.origin || !/^[a-f0-9]{64}$/.test(file.sha256) || (url.origin !== location.origin && !/^https:\/\/cdn\.jsdelivr\.net\/npm\/katex@/.test(url.href))) throw new Error('Некорректный пакет загрузки');
                    source.searchParams.set('offline-download', subject.version);
                    const response = await fetch(source, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
                    if (!response.ok) throw new Error('Не удалось загрузить часть конспекта. Повторите загрузку.');
                    const body = await response.clone().arrayBuffer();
                    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', body)), byte => byte.toString(16).padStart(2, '0')).join('');
                    if (body.byteLength !== file.bytes || digest !== file.sha256) throw new Error('Сайт обновился во время загрузки. Откройте окно заново и повторите.');
                    if (controller.signal.aborted) throw new DOMException('Отменено', 'AbortError');
                    // A synthetic response has no source URL: relative font/image
                    // references resolve against the original cached request URL.
                    const headers = new Headers(response.headers);
                    headers.delete('Content-Encoding'); headers.set('Content-Length', String(body.byteLength));
                    await cache.put(url.href, new Response(body, { status: response.status, headers }));
                    job.done++;
                    const row = dialog?.querySelector('[data-offline-subject="' + id + '"]');
                    if (row) { const percent = Math.round(job.done / Math.max(1, job.total) * 100); row.querySelector('progress').value = percent; row.querySelector('.offline-subject-state').textContent = 'Загрузка · ' + percent + '%'; }
                }
                } catch (error) { if (error.name !== 'AbortError' && !fatalError) fatalError = error; controller.abort(); throw error; }
            };
            const results = await Promise.allSettled(Array.from({ length: 4 }, worker));
            const failure = results.find(result => result.status === 'rejected');
            if (failure) throw fatalError || failure.reason;
            if (controller.signal.aborted) throw new DOMException('Отменено', 'AbortError');
            const index = await caches.open(INDEX);
            const previous = await index.match(key(id));
            const previousInfo = previous ? await previous.json() : null;
            const record = { id, title: subject.title, page: subject.page, version: subject.version, bytes: subject.bytes, fileCount: subject.files.length, cacheName, downloadedAt: Date.now() };
            // A single index write commits the fully verified package. The old
            // package survives cancellation, failure and insufficient storage.
            await index.put(key(id), new Response(JSON.stringify(record), { headers: { 'Content-Type': 'application/json' } }));
            committed = true;
            installed[id] = record;
            navigator.serviceWorker.controller?.postMessage({ type: 'OFFLINE_LIBRARY_CHANGED' });
            if (previousInfo?.cacheName?.startsWith(PREFIX)) await caches.delete(previousInfo.cacheName);
            navigator.storage?.persist?.().catch(() => {});
            announce('Готово: ' + subject.title);
        } catch (error) {
            announce(error.name === 'AbortError' ? 'Загрузка отменена.' + (installed[id] ? ' Предыдущая копия сохранена.' : '') : error.name === 'QuotaExceededError' ? 'Недостаточно места на устройстве.' : error.message || 'Не удалось скачать конспект.', error.name !== 'AbortError');
        } finally {
            if (!committed) await caches.delete(cacheName);
            job = null; render();
        }
    }
    async function remove(id) {
        const entry = installed[id];
        if (!entry || job?.id === id) return;
        const index = await caches.open(INDEX);
        await index.delete(key(id));
        await caches.delete(entry.cacheName);
        delete installed[id];
        navigator.serviceWorker.controller?.postMessage({ type: 'OFFLINE_LIBRARY_CHANGED' });
        render(); announce('Загрузка удалена с устройства. Конспект на сайте не изменён.');
    }
    function createDialog() {
        if (dialog) return;
        dialog = document.createElement('dialog');
        dialog.className = 'reader-tool-dialog offline-dialog';
        dialog.setAttribute('aria-labelledby', 'offlineLibraryTitle');
        dialog.innerHTML = '<header class="reader-tool-header"><div><span class="reader-tool-eyebrow">Библиотека на устройстве</span><h2 id="offlineLibraryTitle">Конспекты без сети</h2></div><button class="reader-tool-icon" type="button" data-offline-close aria-label="Закрыть">' + svg('<path d="m6 6 12 12M18 6 6 18"/>') + '</button></header><div class="reader-tool-body"><p class="offline-connection" role="status"></p><div class="offline-subjects"><p>Загружаем список предметов…</p></div></div><footer class="reader-tool-footer"><span class="offline-storage"></span><p class="offline-message" role="status" aria-live="polite"></p></footer>';
        dialog.addEventListener('click', event => {
            if (event.target === dialog || event.target.closest('[data-offline-close]')) dialog.close();
            const add = event.target.closest('[data-offline-download]'); if (add) download(add.dataset.offlineDownload);
            if (event.target.closest('[data-offline-cancel]')) job?.controller.abort();
            const del = event.target.closest('[data-offline-remove]'); if (del) remove(del.dataset.offlineRemove);
        });
        dialog.addEventListener('close', () => { document.body.classList.remove('reader-tools-open'); returnFocus?.focus?.(); });
        document.body.append(dialog);
        window.addEventListener('online', render); window.addEventListener('offline', render);
    }
    async function open() {
        createDialog();
        if (!dialog.open) { returnFocus = document.activeElement; dialog.showModal(); document.body.classList.add('reader-tools-open'); }
        if (!supported()) { dialog.querySelector('.offline-subjects').replaceChildren(); announce('Откройте сайт по HTTPS. В этом режиме браузер не поддерживает офлайн-загрузку.', true); return; }
        try { await load(); render(); } catch (_) { dialog.querySelector('.offline-subjects').replaceChildren(); announce('Не удалось получить список предметов. Проверьте сеть и откройте окно снова.', true); }
    }
    window.AlmanionOffline = { open, download, installedPacks };
})();
