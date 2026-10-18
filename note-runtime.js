/* Note-page features load on intent; authentication restores in the background. */
(function () {
    'use strict';

    const loaded = new Map();
    const RESOURCE_TIMEOUT_MS = 12000;
    let accountAttempt = null;
    let accountServicesStarted = false;
    const versions = {
        experiments: 'experiment-notebook.js?v=20261014-1',
        featureStyles: 'styles/site/features.css?v=20261002-1',
        bookmarksStyles: 'styles/bookmarks.css?v=20260920-2',
        editorStyles: 'styles/note-editor.css?v=20260929-2',
        readerToolsStyles: 'styles/reader-tools.css?v=20261002-2',
        personalNotes: 'personal-notes.js?v=20261018-1',
        offline: 'offline-library.js?v=20261002-2',
        printStyles: 'styles/print.css?v=20261016-3',
        filterStyles: 'styles/note-filter.css?v=20261010-2',
        filter: 'note-filter.js?v=20261010-2',
        settings: 'settings.js?v=20261002-1',
        search: 'search.js?v=20261002-1',
        print: 'print-export.js?v=20261016-3',
        knowledge: 'knowledge-check.js?v=20261016-1',
        newyear: 'newyear.js?v=20261002-1',
        firebaseApp: 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js',
        firebaseDatabase: 'https://www.gstatic.com/firebasejs/12.18.0/firebase-database-compat.js',
        firebaseAuth: 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth-compat.js',
        firebaseConfig: 'firebase-config.js?v=20260903-3',
        dataSync: 'data-sync.js?v=20260908-1',
        analytics: 'firebase-analytics.js?v=20261009-4',
        account: 'account.js?v=20261018-1',
        bookmarks: 'bookmarks.js?v=20261018-1',
        editor: 'note-editor.js?v=20261015-1'
    };

    function loadResource(key, isStyle) {
        if (loaded.has(key)) return loaded.get(key);
        const source = versions[key];
        const absolute = new URL(source, location.href).href.split('?')[0];
        const promise = new Promise(function (resolve, reject) {
            const existing = Array.from(isStyle ? document.querySelectorAll('link[rel="stylesheet"]') : document.scripts).find(function (element) {
                const url = isStyle ? element.href : element.src;
                return url && url.split('?')[0] === absolute;
            });
            if (existing && (existing.dataset.runtimeLoaded === 'true' || (isStyle ? existing.sheet : !existing.dataset.runtimeFeature))) {
                resolve(existing);
                return;
            }
            const element = existing || document.createElement(isStyle ? 'link' : 'script');
            if (!existing) {
                element.dataset.runtimeFeature = key;
                if (isStyle) { element.rel = 'stylesheet'; element.href = source; }
                else {
                    element.src = source;
                    // Dependencies are sequenced by promises below. An ordered
                    // dynamic-script queue would let a stalled CDN block PDF,
                    // bookmarks and every later local script in that queue.
                    element.async = true;
                }
                element.addEventListener('load', function () {
                    element.dataset.runtimeLoaded = 'true';
                    if (key === 'account' && window.AlmanionAccount) document.getElementById('runtimeAccountButton')?.remove();
                    // A timed-out request may still succeed later. Resume the
                    // remaining dependency chain without re-executing the SDK.
                    if (key.startsWith('firebase') && accountServicesStarted && !accountAttempt && !window.AlmanionAccount) {
                        ensure('account').then(function () { return loadScript('analytics'); }).catch(function () {});
                    }
                }, { once: true });
                element.addEventListener('error', function () { element.remove(); }, { once: true });
            }
            function cleanup() {
                clearTimeout(timer);
                element.removeEventListener('load', onLoad);
                element.removeEventListener('error', onError);
            }
            function onLoad() { cleanup(); resolve(element); }
            function onError() {
                cleanup();
                reject(new Error('Не удалось загрузить ' + key));
            }
            const timer = setTimeout(function () {
                cleanup();
                // Keep a slow request alive: re-inserting the same compat SDK
                // could execute it twice after a late network response.
                reject(new Error('Истекло время загрузки ' + key + '. Повторите попытку.'));
            }, RESOURCE_TIMEOUT_MS);
            element.addEventListener('load', onLoad, { once: true });
            element.addEventListener('error', onError, { once: true });
            if (!existing) document.head.appendChild(element);
        }).catch(function (error) {
            if (loaded.get(key) === promise) loaded.delete(key);
            throw error;
        });
        loaded.set(key, promise);
        return promise;
    }

    function loadStyle(key) { return loadResource(key, true); }
    function loadScript(key) { return loadResource(key, false); }

    function loadSettings() { return Promise.all([loadStyle('featureStyles'), loadScript('settings')]); }
    function loadSearch() {
        return loadScript('search').then(function () {
            if (window.AlmanionSearch && typeof window.AlmanionSearch.init === 'function') window.AlmanionSearch.init();
        });
    }
    function loadFirebase() {
        return (window.firebase && typeof window.firebase.initializeApp === 'function' ? Promise.resolve() : loadScript('firebaseApp'))
            .then(function () { return Promise.all([
                window.firebase && typeof window.firebase.database === 'function' ? Promise.resolve() : loadScript('firebaseDatabase'),
                window.firebase && typeof window.firebase.auth === 'function' ? Promise.resolve() : loadScript('firebaseAuth')
            ]); })
            .then(function () { return loadScript('firebaseConfig'); });
    }
    function loadBookmarks() {
        return Promise.all([
            loadStyle('featureStyles'),
            loadStyle('bookmarksStyles'),
            loadScript('dataSync')
        ]).then(function () { return loadScript('bookmarks'); })
            .then(function () { return loadStyle('readerToolsStyles'); })
            .then(function () { return loadScript('personalNotes'); });
    }
    function loadAccount() {
        if (accountAttempt) return accountAttempt;
        const button = document.getElementById('runtimeAccountButton');
        if (button) {
            button.disabled = true;
            button.title = 'Подключаем аккаунт… Локальные функции уже доступны.';
            button.setAttribute('aria-label', button.title);
        }
        accountAttempt = Promise.all([loadSettings(), loadFirebase()])
            .then(function () { return loadScript('dataSync'); })
            .then(function () { return loadScript('account'); })
            .then(function () { if (button) button.remove(); })
            .catch(function (error) {
                if (button) {
                    button.disabled = false;
                    button.title = 'Аккаунт недоступен. Нажмите, чтобы повторить подключение.';
                    button.setAttribute('aria-label', button.title);
                }
                throw error;
            }).finally(function () { accountAttempt = null; });
        return accountAttempt;
    }

    const features = {
        experiments: function () { return loadScript('experiments'); },
        settings: loadSettings,
        search: loadSearch,
        print: function () { return loadStyle('printStyles').then(function () { return loadScript('print'); }); },
        knowledge: function () { return loadStyle('featureStyles').then(function () { return loadScript('knowledge'); }); },
        bookmarks: loadBookmarks,
        offline: function () { return loadStyle('readerToolsStyles').then(function () { return loadScript('offline'); }); },
        account: loadAccount,
        newyear: function () { return loadScript('newyear'); }
    };

    function ensure(feature) {
        const loader = features[feature];
        if (!loader) return Promise.reject(new Error('Unknown note feature: ' + feature));
        return loader().catch(function (error) {
            console.warn('Almanion note runtime:', error);
            throw error;
        });
    }

    function onIntent(selector, eventName, feature) {
        document.addEventListener(eventName, function (event) {
            if (event.target && event.target.closest(selector)) ensure(feature).catch(function () {});
        }, { capture: true, passive: eventName !== 'keydown' });
    }

    function startAccountServices() {
        accountServicesStarted = true;
        const home = document.body.classList.contains('home-page');
        const header = document.querySelector('.sidebar-header');
        const target = home ? document.getElementById('homeControls') : header;
        if (target && !document.getElementById('accountBtn') && !document.getElementById('runtimeAccountButton')) {
            const button = document.createElement('button');
            button.id = 'runtimeAccountButton';
            button.type = 'button';
            button.className = 'account-btn' + (home ? ' home-account-btn' : '');
            button.title = 'Подключаем аккаунт… Локальные функции уже доступны.';
            button.setAttribute('aria-label', button.title);
            button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 21v-2a7 7 0 0 0-14 0v2"/><circle cx="13" cy="7" r="4"/></svg>';
            button.disabled = true;
            button.addEventListener('click', function () {
                ensure('account').then(function () {
                    document.getElementById('accountBtn')?.click();
                    return loadScript('analytics');
                }).catch(function () {
                    window.AlmanionToast?.show('Не удалось подключить аккаунт. Локальные функции доступны; повторите подключение позже.', { type: 'error' });
                });
            });
            if (home) target.prepend(button);
            else {
                let controls = header.querySelector('.sidebar-header-buttons');
                if (!controls) { controls = document.createElement('div'); controls.className = 'sidebar-header-buttons'; header.appendChild(controls); }
                controls.prepend(button);
            }
        }
        window.addEventListener('online', function () {
            ensure('account').then(function () { return loadScript('analytics'); }).catch(function () {});
        });
    }

    function start() {
        startAccountServices();
        const schedule = window.requestIdleCallback
            ? function (callback, timeout) { requestIdleCallback(callback, { timeout: timeout }); }
            : function (callback, timeout) { setTimeout(callback, Math.min(timeout, 400)); };
        if (document.body.classList.contains('home-page')) {
            schedule(function () {
                ensure('account').then(function () { return loadScript('analytics'); }).catch(function () {});
            }, 800);
            return;
        }
        if (document.querySelector('.experiment-box')) ensure('experiments').catch(function () {});
        onIntent('.experiment-box', 'pointerdown', 'experiments');
        // Restore reading filters independently of the PDF dialog.
        loadStyle('filterStyles').then(function () { return loadScript('filter'); }).catch(function () {});
        onIntent('#searchInput, .search-box', 'pointerdown', 'search');
        onIntent('#searchInput', 'focusin', 'search');
        window.addEventListener('almanion-load-newyear', function () { ensure('newyear').catch(function () {}); });
        const icons = {
            knowledge: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>',
            print: '<path d="M7 3h7l3 3v5M14 3v4h3M6 14h12a2 2 0 0 1 2 2v3H4v-3a2 2 0 0 1 2-2ZM7 19v2h10v-2"/>'
        };
        function launcher(id, feature, label, container) {
            if (!container || document.getElementById(id)) return;
            const button = document.createElement('button');
            button.id = id;
            button.type = 'button';
            button.className = feature === 'print' ? 'print-export-button' : 'knowledge-check-btn';
            button.setAttribute('aria-haspopup', 'dialog');
            button.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' + icons[feature] + '</svg><span' + (feature === 'print' ? ' class="print-export-label"' : '') + '>' + label + '</span>';
            button.addEventListener('click', async function activate(event) {
                // Load on first intent, then replay once on the real handler.
                event.stopImmediatePropagation();
                button.disabled = true;
                try {
                    await ensure(feature);
                    button.removeEventListener('click', activate);
                    button.disabled = false;
                    button.click();
                } catch (_) {
                    button.disabled = false;
                    button.title = 'Не удалось загрузить. Нажмите, чтобы повторить.';
                }
            });
            container.appendChild(button);
        }
        launcher('knowledgeCheckBtn', 'knowledge', 'Учить', document.querySelector('.sidebar-actions'));
        document.addEventListener('keydown', event => {
            if (window.AlmanionPrintExport || !(event.ctrlKey || event.metaKey) || event.altKey || event.code !== 'KeyP') return;
            event.preventDefault();
            ensure('print').then(() => window.AlmanionPrintExport.open()).catch(() => {});
        });
        loadStyle('printStyles').catch(function () {});
        const nav = document.querySelector('.sidebar .nav-menu');
        if (nav) {
            const slot = document.createElement('div');
            slot.className = 'print-export-menu-slot';
            nav.before(slot);
            launcher('printExportButton', 'print', 'Скачать PDF', slot);
            const offline = document.createElement('button');
            offline.type = 'button'; offline.id = 'offlineLibraryButton'; offline.className = 'reader-tool-menu-button';
            offline.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5"/></svg><span>Читать без сети</span>';
            offline.addEventListener('click', async function () {
                offline.disabled = true;
                try { await ensure('offline'); await window.AlmanionOffline.open(); }
                catch (_) { window.AlmanionToast?.show('Не удалось открыть загрузки. Повторите попытку.', { type: 'error' }); }
                finally { offline.disabled = false; }
            });
            slot.append(offline);
        }
        function loadEditor() { return loadStyle('editorStyles').then(function () { return loadScript('editor'); }); }
        if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && new URLSearchParams(location.search).get('editor-demo') === '1') {
            loadEditor().catch(function () {});
        }
        window.addEventListener('almanion-account-ready', async function (event) {
            const user = event.detail && event.detail.user;
            if (!user || !window.AlmanionAccount) return;
            try {
                if (await window.AlmanionAccount.hasContentEditorAccess(user)) await loadEditor();
            } catch (error) { console.warn('Almanion editor:', error); }
        });

        schedule(function () {
            Promise.allSettled([
                ensure('settings'),
                ensure('bookmarks'),
                ensure('account')
            ]);
        }, 800);
        schedule(function () {
            ensure('account').then(function () { return loadScript('analytics'); }).catch(function () {});
        }, 2400);

        try {
            const enabled = localStorage.getItem('newYearMode') === 'true';
            if (enabled) ensure('newyear').catch(function () {});
        } catch (_) {}
    }

    window.AlmanionNoteRuntime = Object.freeze({ ensure: ensure });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
