/*
 * Progressive feature loader for ordinary note pages.
 * Reading/navigation paints first; account, cloud sync, study tools and editor
 * arrive during the first idle window or immediately when the user asks for one.
 */
(function () {
    'use strict';

    const loaded = new Map();
    const versions = {
        featureStyles: 'styles/site/features.css?v=20260911-1',
        editorStyles: 'styles/note-editor.css?v=20260904-2',
        printStyles: 'styles/print.css?v=20260908-3',
        settings: 'settings.js?v=20260911-1',
        search: 'search.js?v=20260907-1',
        print: 'print-export.js?v=20260908-3',
        knowledge: 'knowledge-check.js?v=20260911-1',
        newyear: 'newyear.js?v=20260911-1',
        firebaseApp: 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js',
        firebaseDatabase: 'https://www.gstatic.com/firebasejs/12.18.0/firebase-database-compat.js',
        firebaseAuth: 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth-compat.js',
        firebaseConfig: 'firebase-config.js?v=20260903-3',
        dataSync: 'data-sync.js?v=20260908-1',
        analytics: 'firebase-analytics.js?v=20260911-1',
        account: 'account.js?v=20260911-1',
        bookmarks: 'bookmarks.js?v=20260911-1',
        editor: 'note-editor.js?v=20260904-4'
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
    function loadAccount() {
        return Promise.all([loadSettings(), loadFirebase()])
            .then(function () { return loadScript('dataSync'); })
            .then(function () { return Promise.all([loadScript('analytics'), loadScript('account')]); })
            .then(function () { return loadStyle('editorStyles'); })
            .then(function () { return Promise.all([loadScript('bookmarks'), loadScript('editor')]); });
    }

    const features = {
        settings: loadSettings,
        search: loadSearch,
        print: function () { return loadStyle('printStyles').then(function () { return loadScript('print'); }); },
        knowledge: function () { return loadScript('knowledge'); },
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
        onIntent('#searchInput, .search-box', 'pointerdown', 'search');
        onIntent('#searchInput', 'focusin', 'search');
        window.addEventListener('almanion-load-newyear', function () { ensure('newyear').catch(function () {}); });

        const schedule = window.requestIdleCallback
            ? function (callback, timeout) { requestIdleCallback(callback, { timeout: timeout }); }
            : function (callback, timeout) { setTimeout(callback, Math.min(timeout, 400)); };

        schedule(function () {
            Promise.allSettled([
                ensure('settings'),
                ensure('search'),
                ensure('print'),
                ensure('knowledge'),
                ensure('account')
            ]);
        }, 800);

        try {
            const enabled = localStorage.getItem('newYearMode') === 'true';
            if (enabled) ensure('newyear').catch(function () {});
        } catch (_) {}
    }

    window.AlmanionNoteRuntime = Object.freeze({ ensure: ensure });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
