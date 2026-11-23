(function () {
    'use strict';

    var ASSET_VERSION = '20261123-book-light';
    var iconSelector = 'link[rel~="icon"][type="image/svg+xml"]';
    var systemTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');

    function readSettings() {
        try {
            return JSON.parse(localStorage.getItem('siteSettings') || '{}') || {};
        } catch (_) {
            return {};
        }
    }

    function pageTone() {
        var root = document.documentElement.dataset;
        var classes = document.body && document.body.classList;
        if (root.theme) return root.theme;
        if (root.exp) return root.exp.split('-')[1];
        if (classes && classes.contains('experimental')) return classes.contains('exp-dark') ? 'dark' : 'light';
        if (classes && (classes.contains('dark-theme') || classes.contains('midnight-theme'))) return 'dark';
        return '';
    }

    function iconAppearance(link) {
        var settings = readSettings();
        var root = document.documentElement.dataset;
        // The palette is shared across tabs. Each page keeps its own light/dark background.
        var palette = settings.expMode || root.palette || (root.exp || '').split('-')[0];
        var graphite = palette ? palette === 'graphite' : !!(document.body && document.body.classList.contains('exp-graphite'));
        var tone = pageTone() || link.dataset.faviconTone || settings.expTheme || settings.theme;
        if (!tone) tone = settings.expDark ? 'dark' : 'light';
        var dark = tone === 'system' ? !!(systemTheme && systemTheme.matches) : tone === 'dark' || tone === 'midnight';
        return { graphite: graphite, dark: dark };
    }

    function lightIconPath(link) {
        if (link.dataset.lightFavicon) return link.dataset.lightFavicon;
        var path = (link.getAttribute('href') || '').split(/[?#]/)[0];
        path = path.replace(/(?:-graphite)?(?:-dark)?\.svg$/i, '.svg');
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

        var theme = iconAppearance(link);
        var suffix = (theme.graphite ? '-graphite' : '') + (theme.dark ? '-dark' : '');
        var path = lightPath.replace(/\.svg$/i, suffix + '.svg');
        var href = versioned(path);
        if (link.getAttribute('href') !== href) link.setAttribute('href', href);
        link.dataset.appliedFaviconTheme = (theme.graphite ? 'graphite-' : '') + (theme.dark ? 'dark' : 'light');
    }

    window.updateThemeFavicon = updateThemeFavicon;
    updateThemeFavicon();

    function observeAppliedTheme() {
        updateThemeFavicon();
        if (typeof MutationObserver !== 'function') return;

        var observer = new MutationObserver(updateThemeFavicon);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme', 'data-exp', 'data-palette']
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
    if (systemTheme && systemTheme.addEventListener) systemTheme.addEventListener('change', updateThemeFavicon);
}());
