(function () {
    'use strict';

    var ENTRY_KEY = 'almanion:page-transition-entry';
    var FALLBACK_EXIT_MS = 105;
    var SITE_PAGES = new Set([
        'index.html',
        'physics.html',
        'physics-10.html',
        'physics-exam.html',
        'chemistry.html',
        'chemistry-10.html',
        'math.html',
        'geometry.html',
        'geometry-formulas.html',
        'likbez.html',
        'literature-10.html',
        'matcenter.html'
    ]);

    function pageName(pathname) {
        var clean = pathname.replace(/\/+$/, '');
        var name = clean.slice(clean.lastIndexOf('/') + 1);
        return name || 'index.html';
    }

    function readSettings() {
        try { return JSON.parse(localStorage.getItem('siteSettings') || '{}') || {}; }
        catch (_) { return {}; }
    }

    function motionIsDisabled() {
        var settings = readSettings();
        return settings.animationLevel === 'off'
            || (typeof window.matchMedia === 'function'
                && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function setMotionClass() {
        document.documentElement.classList.toggle('site-page-transitions-off', motionIsDisabled());
    }

    function consumeEntryMarker() {
        if (motionIsDisabled()) return;
        try {
            if (sessionStorage.getItem(ENTRY_KEY) !== '1') return;
            sessionStorage.removeItem(ENTRY_KEY);
            document.documentElement.classList.add('site-page-entering');
            window.setTimeout(function () {
                document.documentElement.classList.remove('site-page-entering');
            }, 240);
        } catch (_) { /* Private browsing may deny session storage. */ }
    }

    function supportsCrossDocumentTransitions() {
        return 'onpageswap' in window && 'onpagereveal' in window;
    }

    function eligibleLink(event) {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return null;
        }
        var target = event.target;
        var link = target && typeof target.closest === 'function' ? target.closest('a[href]') : null;
        if (!link || link.hasAttribute('download')) return null;
        if (link.target && link.target.toLowerCase() !== '_self') return null;

        var url;
        try { url = new URL(link.href, window.location.href); } catch (_) { return null; }
        if (url.origin !== window.location.origin || (url.protocol !== 'http:' && url.protocol !== 'https:')) return null;
        if (!SITE_PAGES.has(pageName(window.location.pathname)) || !SITE_PAGES.has(pageName(url.pathname))) return null;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
        return url;
    }

    function initFallbackNavigation() {
        if (supportsCrossDocumentTransitions()) return;
        var leaving = false;

        document.addEventListener('click', function (event) {
            var url = eligibleLink(event);
            if (!url || leaving || motionIsDisabled()) return;

            event.preventDefault();
            leaving = true;
            document.documentElement.classList.add('site-page-leaving');
            document.documentElement.setAttribute('aria-busy', 'true');
            try { sessionStorage.setItem(ENTRY_KEY, '1'); } catch (_) { /* ignore */ }

            window.setTimeout(function () {
                window.location.assign(url.href);
            }, FALLBACK_EXIT_MS);
        }, true);
    }

    function initPageWarmup() {
        if (!document.createElement || !document.querySelectorAll) return;
        var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection && (connection.saveData || /(^|-)2g$/.test(connection.effectiveType || ''))) return;
        var warmed = new Set();

        function warm(link) {
            if (!link || !link.href) return;
            var url;
            try { url = new URL(link.href, window.location.href); } catch (_) { return; }
            if (url.origin !== window.location.origin || !SITE_PAGES.has(pageName(url.pathname))) return;
            var key = url.pathname + url.search;
            if (warmed.has(key) || key === window.location.pathname + window.location.search) return;
            warmed.add(key);
            var hint = document.createElement('link');
            hint.rel = 'prefetch';
            hint.as = 'document';
            hint.href = url.href;
            document.head.appendChild(hint);
        }

        ['pointerenter', 'focusin', 'touchstart'].forEach(function (eventName) {
            document.addEventListener(eventName, function (event) {
                var target = event.target;
                warm(target && typeof target.closest === 'function' ? target.closest('a[href]') : null);
            }, true);
        });

        // На главной заранее загружаются только видимые карточки текущего класса.
        // Подсказка браузеру имеет низкий приоритет и отключается при экономии трафика.
        if (pageName(window.location.pathname) === 'index.html') {
            var warmVisible = function () {
                Array.from(document.querySelectorAll('a.subject-card[href]'))
                    .filter(function (link) { return link.getClientRects().length > 0; })
                    .slice(0, 4)
                    .forEach(warm);
            };
            if (window.requestIdleCallback) window.requestIdleCallback(warmVisible, { timeout: 1800 });
            else window.setTimeout(warmVisible, 700);
        }
    }

    setMotionClass();
    consumeEntryMarker();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initFallbackNavigation();
            initPageWarmup();
        }, { once: true });
    } else {
        initFallbackNavigation();
        initPageWarmup();
    }

    window.addEventListener('pageshow', function (event) {
        document.documentElement.classList.remove('site-page-leaving');
        document.documentElement.removeAttribute('aria-busy');
        if (event.persisted) setMotionClass();
    });
}());
