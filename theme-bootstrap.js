(function () {
    'use strict';

    var SETTINGS_KEY = 'siteSettings';
    var MIGRATION_KEY = 'almanion:visual-defaults:2026-09-05-v1';
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
            expMode: 'prism',
            expTheme: 'system',
            expDark: dark,
            matcenterSolvedAnimation: 'circle'
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
        if (settings.experimental !== false) {
            var mode = settings.expMode === 'graphite' ? 'graphite' : 'prism';
            root.dataset.exp = mode + (settings.expDark ? '-dark' : '-light');
            root.style.backgroundColor = mode === 'graphite'
                ? (settings.expDark ? '#09090b' : '#fafafa')
                : (settings.expDark ? '#0e0e16' : '#fbfbfe');
            root.style.color = settings.expDark ? '#ececf4' : '#16161f';
            return;
        }
        root.dataset.theme = settings.theme || 'light';
    }

    function ensureSettings() {
        var previous = readSettings();
        var migrated = migrationWasApplied();
        var next = migrated ? normalize(previous) : defaults();
        if (JSON.stringify(previous) !== JSON.stringify(next)) writeSettings(next);
        if (!migrated) {
            try { localStorage.setItem('newYearMode', 'false'); } catch (_) { /* ignore */ }
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

        if (document.body && settings.experimental !== false) {
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
        systemIsDark: systemIsDark
    };
}());
