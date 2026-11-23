(function () {
    'use strict';

    var SETTINGS_KEY = 'siteSettings';
    var MIGRATION_KEY = 'almanion:visual-defaults:2026-09-05-v1';
    var VISUAL_DEFAULTS_VERSION = 1;
    var colorSchemeQuery = typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;

    function systemIsDark() {
        return !!(colorSchemeQuery && colorSchemeQuery.matches);
    }

    function defaults() {
        var dark = systemIsDark();
        return {
            theme: dark ? 'dark' : 'light',
            newYearMode: false,
            animationLevel: 'max',
            hoverEffects: true,
            experimental: true,
            readerLayout: 'sections',
            expMode: 'prism',
            expTheme: 'system',
            expDark: dark,
            matcenterSolvedAnimation: 'circle',
            visualDefaultsVersion: VISUAL_DEFAULTS_VERSION
        };
    }

    function readSettings() {
        try {
            return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
        } catch (_) {
            return {};
        }
    }

    function writeSettings(settings) {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (_) {
            return false;
        }
    }

    function normalize(settings) {
        var result = Object.assign(defaults(), settings || {});
        // Older releases used the site design switch for continuous reading.
        var legacyFeed = result.experimental === false;
        result.readerLayout = legacyFeed || result.readerLayout === 'feed' ? 'feed' : 'sections';
        result.experimental = true;
        result.visualDefaultsVersion = VISUAL_DEFAULTS_VERSION;
        if (legacyFeed && settings.theme) {
            if (settings.theme === 'sepia') result.expMode = 'sepia';
            result.expTheme = settings.theme === 'dark' || settings.theme === 'midnight' ? 'dark' : 'light';
        }
        if (result.expMode !== 'sepia' && result.expMode !== 'graphite') result.expMode = 'prism';
        if (result.expTheme !== 'system' && result.expTheme !== 'light' && result.expTheme !== 'dark') {
            result.expTheme = typeof result.expDark === 'boolean'
                ? (result.expDark ? 'dark' : 'light')
                : 'system';
        }
        result.expDark = result.expTheme === 'system' ? systemIsDark() : result.expTheme === 'dark';
        return result;
    }

    function migrationWasApplied() {
        try { return localStorage.getItem(MIGRATION_KEY) === '1'; } catch (_) { return false; }
    }

    function markMigrationApplied() {
        try { localStorage.setItem(MIGRATION_KEY, '1'); } catch (_) { /* Storage may be unavailable. */ }
    }

    function applyEarlyTheme(settings) {
        var root = document.documentElement;
        root.dataset.pageMotion = settings.animationLevel;
        var palettes = {
            prism: ['#fbfbfe', '#0e0e16', '#16161f', '#ececf4'],
            graphite: ['#fafafa', '#09090b', '#18181b', '#f4f4f5'],
            sepia: ['#f6f0e5', '#201b17', '#35291f', '#efe4d5']
        };
        var colors = palettes[settings.expMode];
        root.dataset.exp = settings.expMode + (settings.expDark ? '-dark' : '-light');
        root.style.backgroundColor = colors[settings.expDark ? 1 : 0];
        root.style.color = colors[settings.expDark ? 3 : 2];
    }

    function applyBody(settings) {
        settings = settings || currentSettings;
        var classes = document.body.classList;
        classes.add('experimental');
        ['prism', 'graphite', 'sepia'].forEach(function (mode) {
            classes.toggle('exp-' + mode, settings.expMode === mode);
        });
        classes.toggle('exp-dark', settings.expDark);
        if (document.body.hasAttribute('data-note-subject') || document.body.hasAttribute('data-reader-layout')) {
            document.body.dataset.readerLayout = settings.readerLayout;
        }
    }

    function ensureSettings() {
        var previous = readSettings();
        var migrated = migrationWasApplied();
        var next = normalize(previous);
        if (JSON.stringify(previous) !== JSON.stringify(next)) writeSettings(next);
        if (!migrated) {
            try { localStorage.setItem('newYearMode', String(next.newYearMode === true)); } catch (_) { /* ignore */ }
            markMigrationApplied();
        }
        applyEarlyTheme(next);
        return next;
    }

    var currentSettings = ensureSettings();

    function handleSystemThemeChange(event) {
        var settings = normalize(readSettings());
        if (settings.expTheme !== 'system') return;

        settings.expDark = !!event.matches;
        writeSettings(settings);
        applyEarlyTheme(settings);

        if (document.body) {
            document.body.classList.toggle('exp-dark', settings.expDark);
        }
        if (document.documentElement.hasAttribute('data-palette')) {
            document.documentElement.dataset.theme = settings.expDark ? 'dark' : 'light';
        }

        window.dispatchEvent(new CustomEvent('almanion-system-theme-changed', {
            detail: { dark: settings.expDark }
        }));
    }

    if (colorSchemeQuery) {
        if (typeof colorSchemeQuery.addEventListener === 'function') {
            colorSchemeQuery.addEventListener('change', handleSystemThemeChange);
        } else if (typeof colorSchemeQuery.addListener === 'function') {
            colorSchemeQuery.addListener(handleSystemThemeChange);
        }
    }

    window.AlmanionThemeBootstrap = {
        migrationKey: MIGRATION_KEY,
        settings: currentSettings,
        ensureSettings: ensureSettings,
        normalize: normalize,
        applyBody: applyBody,
        applyEarlyTheme: applyEarlyTheme,
        systemIsDark: systemIsDark
    };
}());
