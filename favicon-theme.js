(function () {
    'use strict';

    var ASSET_VERSION = '20260905-2';
    var iconSelector = 'link[rel~="icon"][type="image/svg+xml"]';

    function readSettings() {
        try {
            return JSON.parse(localStorage.getItem('siteSettings') || '{}') || {};
        } catch (_) {
            return {};
        }
    }

    function isDarkTheme() {
        var body = document.body;
        if (body) {
            if (body.classList.contains('experimental')) {
                return body.classList.contains('exp-dark');
            }
            if (body.classList.contains('dark-theme') || body.classList.contains('midnight-theme')) {
                return true;
            }
        }

        var earlyTheme = document.documentElement.dataset;
        if (earlyTheme.exp) return /-dark$/.test(earlyTheme.exp);
        if (earlyTheme.theme) return earlyTheme.theme === 'dark' || earlyTheme.theme === 'midnight';

        var settings = readSettings();
        if (settings.experimental !== false) return settings.expDark === true;
        return settings.theme === 'dark' || settings.theme === 'midnight';
    }

    function lightIconPath(link) {
        if (link.dataset.lightFavicon) return link.dataset.lightFavicon;
        var path = (link.getAttribute('href') || '').split(/[?#]/)[0];
        path = path.replace(/-dark\.svg$/i, '.svg');
        link.dataset.lightFavicon = path;
        return path;
    }

    function versioned(path) {
        return path + '?v=' + ASSET_VERSION;
    }

    function updateThemeFavicon() {
        var link = document.querySelector(iconSelector);
        if (!link) return;

        var lightPath = lightIconPath(link);
        if (!lightPath || !/\.svg$/i.test(lightPath)) return;

        var dark = isDarkTheme();
        var path = dark ? lightPath.replace(/\.svg$/i, '-dark.svg') : lightPath;
        var href = versioned(path);
        if (link.getAttribute('href') !== href) link.setAttribute('href', href);
        link.dataset.appliedFaviconTheme = dark ? 'dark' : 'light';
    }

    window.updateThemeFavicon = updateThemeFavicon;
    updateThemeFavicon();

    function observeAppliedTheme() {
        updateThemeFavicon();
        if (typeof MutationObserver !== 'function') return;

        var observer = new MutationObserver(updateThemeFavicon);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme', 'data-exp']
        });
        if (document.body) {
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ['class']
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeAppliedTheme, { once: true });
    } else {
        observeAppliedTheme();
    }

    window.addEventListener('storage', function (event) {
        if (event.key === 'siteSettings' || event.key === 'theme') updateThemeFavicon();
    });
    window.addEventListener('pageshow', updateThemeFavicon);
}());
