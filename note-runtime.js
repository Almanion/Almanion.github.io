/*
 * Progressive feature loader for ordinary note pages.
 * Reading/navigation paints first; account, cloud sync, study tools and editor
 * load on intent. Authentication restores in the background so progress stays
 * scoped to the right account even before opening the study tools.
 */
(function () {
    'use strict';

    const loaded = new Map();
    const versions = {
        featureStyles: 'styles/site/features.css?v=20261002-1',
        bookmarksStyles: 'styles/bookmarks.css?v=20260920-2',
        editorStyles: 'styles/note-editor.css?v=20260929-2',
        readerToolsStyles: 'styles/reader-tools.css?v=20261002-1',
        personalNotes: 'personal-notes.js?v=20261002-1',
        offline: 'offline-library.js?v=20261002-1',
        printStyles: 'styles/print.css?v=20261002-1',
        filterStyles: 'styles/note-filter.css?v=20260929-3',
        filter: 'note-filter.js?v=20260929-1',
        settings: 'settings.js?v=20261002-1',
        search: 'search.js?v=20261002-1',
        print: 'print-export.js?v=20261002-1',
        knowledge: 'knowledge-check.js?v=20261002-2',
        newyear: 'newyear.js?v=20261002-1',
        firebaseApp: 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js',
        firebaseDatabase: 'https://www.gstatic.com/firebasejs/12.18.0/firebase-database-compat.js',
        firebaseAuth: 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth-compat.js',
        firebaseConfig: 'firebase-config.js?v=20260903-3',
        dataSync: 'data-sync.js?v=20260908-1',
        analytics: 'firebase-analytics.js?v=20260911-1',
        account: 'account.js?v=20260911-1',
        bookmarks: 'bookmarks.js?v=20261002-1',
        editor: 'note-editor.js?v=20261002-1'
    };

    function loadStyle(key) {
        if (loaded.has(key)) return loaded.get(key);
        const source = versions[key];
        const absolute = new URL(source, location.href).href.split('?')[0];
        const promise = new Promise(function (resolve, reject) {
            const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find(function (link) {
                return link.href && link.href.split('?')[0] === absolute;
            });
            if (existing) {
                if (existing.sheet || existing.dataset.runtimeLoaded === 'true') resolve(existing);
                else {
                    existing.addEventListener('load', function () { resolve(existing); }, { once: true });
                    existing.addEventListener('error', reject, { once: true });
                }
                return;
            }
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = source;
            link.dataset.runtimeFeature = key;
            link.addEventListener('load', function () {
                link.dataset.runtimeLoaded = 'true';
                resolve(link);
            }, { once: true });
            link.addEventListener('error', function () {
                loaded.delete(key);
                reject(new Error('Не удалось загрузить стили ' + key));
            }, { once: true });
            document.head.appendChild(link);
        });
        loaded.set(key, promise);
        return promise;
    }

    function loadScript(key) {
        if (loaded.has(key)) return loaded.get(key);
        const source = versions[key];
        const promise = new Promise(function (resolve, reject) {
            const existing = Array.from(document.scripts).find(function (script) {
                return script.src && script.src.split('?')[0] === new URL(source, location.href).href.split('?')[0];
            });
            if (existing) {
                // The runtime is placed after all parser-loaded dependencies.
                // An existing matching script has therefore already executed.
                resolve(existing);
                return;
            }
            const script = document.createElement('script');
            script.src = source;
            script.async = false;
            script.dataset.runtimeFeature = key;
            script.addEventListener('load', function () {
                script.dataset.runtimeLoaded = 'true';
                resolve(script);
            }, { once: true });
            script.addEventListener('error', function () {
                loaded.delete(key);
                reject(new Error('Не удалось загрузить ' + key));
            }, { once: true });
            document.head.appendChild(script);
        });
        loaded.set(key, promise);
        return promise;
    }

    function loadSettings() { return Promise.all([loadStyle('featureStyles'), loadScript('settings')]); }
    function loadSearch() {
        return loadScript('search').then(function () {
            if (window.AlmanionSearch && typeof window.AlmanionSearch.init === 'function') window.AlmanionSearch.init();
        });
    }
    function loadFirebase() {
        return loadScript('firebaseApp')
            .then(function () { return Promise.all([loadScript('firebaseDatabase'), loadScript('firebaseAuth')]); })
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
        return Promise.all([loadSettings(), loadFirebase()])
            .then(function () { return loadScript('dataSync'); })
            .then(function () { return loadScript('account'); });
    }

    const features = {
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

    function start() {
        // Filtering is part of the reading surface, not the export dialog.
        // Its persisted selection must also be restored after a plain reload.
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
                // The real module attaches to this same button after loading.
                // Suppress just the first click, then replay it exactly once.
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
        launcher('knowledgeCheckBtn', 'knowledge', 'Проверка знаний', document.querySelector('.sidebar-actions'));
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
            offline.addEventListener('click', async function () { offline.disabled = true; try { await ensure('offline'); await window.AlmanionOffline.open(); } finally { offline.disabled = false; } });
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

        const schedule = window.requestIdleCallback
            ? function (callback, timeout) { requestIdleCallback(callback, { timeout: timeout }); }
            : function (callback, timeout) { setTimeout(callback, Math.min(timeout, 400)); };

        schedule(function () {
            Promise.allSettled([
                ensure('settings'),
                ensure('bookmarks'),
                ensure('account')
            ]);
        }, 800);
        schedule(function () { loadScript('analytics').catch(function () {}); }, 2400);

        try {
            const enabled = localStorage.getItem('newYearMode') === 'true';
            if (enabled) ensure('newyear').catch(function () {});
        } catch (_) {}
    }

    window.AlmanionNoteRuntime = Object.freeze({ ensure: ensure });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
