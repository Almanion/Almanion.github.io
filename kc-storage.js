/*
 * Account-scoped persistence for the knowledge-check module.
 *
 * Logical keys stay stable for Firebase (`kc_fsrs_/physics.html`), while the
 * physical localStorage key also contains the current Firebase UID.  The scope
 * lives in sessionStorage so one tab can never expose another account's cache
 * while authentication state is being restored.
 */
(function () {
    'use strict';

    const PREFIX = 'almanion_kc_scope_v1:';
    const TAB_SCOPE_KEY = 'almanion_kc_tab_scope_v1';
    const LEGACY_OWNER_KEY = 'almanion_kc_local_owner_v1';
    const MIGRATION_KEY = 'almanion_kc_scoped_migration_v1';
    const LOGICAL_PREFIXES = ['kc_fsrs_', 'kc_session_v3_', 'kc_preferences_v3_'];

    function rawGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
    function rawSet(key, value) { try { localStorage.setItem(key, value); return true; } catch (_) { return false; } }
    function rawRemove(key) { try { localStorage.removeItem(key); return true; } catch (_) { return false; } }
    function tabGet(key) { try { return sessionStorage.getItem(key); } catch (_) { return null; } }
    function tabSet(key, value) { try { sessionStorage.setItem(key, value); return true; } catch (_) { return false; } }

    function normalizeScope(value) {
        const scope = String(value || '').trim();
        return scope && /^[A-Za-z0-9:_-]{1,180}$/.test(scope) ? scope : 'guest';
    }

    function isLogicalKey(key) {
        const value = String(key || '');
        return LOGICAL_PREFIXES.some(function (prefix) { return value.indexOf(prefix) === 0; });
    }

    function physicalKey(logicalKey, scope) {
        return PREFIX + encodeURIComponent(normalizeScope(scope)) + ':' + encodeURIComponent(String(logicalKey || ''));
    }

    function parsePhysicalKey(key) {
        if (String(key || '').indexOf(PREFIX) !== 0) return null;
        const rest = String(key).slice(PREFIX.length);
        const divider = rest.indexOf(':');
        if (divider < 0) return null;
        try {
            return {
                scope: decodeURIComponent(rest.slice(0, divider)),
                key: decodeURIComponent(rest.slice(divider + 1))
            };
        } catch (_) { return null; }
    }

    let activeScope = normalizeScope(tabGet(TAB_SCOPE_KEY) || 'guest');

    function migrateLegacyOnce() {
        if (rawGet(MIGRATION_KEY) === '1') return;
        const targetScope = normalizeScope(rawGet(LEGACY_OWNER_KEY) || 'guest');
        const legacyKeys = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (isLogicalKey(key)) legacyKeys.push(key);
            }
        } catch (_) { return; }

        legacyKeys.forEach(function (key) {
            const value = rawGet(key);
            const destination = physicalKey(key, targetScope);
            if (value != null && rawGet(destination) == null) rawSet(destination, value);
            rawRemove(key);
        });
        rawSet(MIGRATION_KEY, '1');
    }

    function dispatch(name, detail) {
        try { window.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (_) {}
    }

    function setScope(nextScope) {
        const normalized = normalizeScope(nextScope);
        if (normalized === activeScope) return activeScope;
        const previous = activeScope;
        dispatch('almanion-kc-scope-changing', { previous: previous, next: normalized });
        activeScope = normalized;
        tabSet(TAB_SCOPE_KEY, activeScope);
        dispatch('almanion-kc-scope-changed', { previous: previous, current: activeScope });
        return activeScope;
    }

    function get(key, scope) {
        return rawGet(physicalKey(key, scope == null ? activeScope : scope));
    }

    function set(key, value, scope) {
        return rawSet(physicalKey(key, scope == null ? activeScope : scope), value);
    }

    function remove(key, scope) {
        return rawRemove(physicalKey(key, scope == null ? activeScope : scope));
    }

    function list(scope, prefix) {
        const normalized = normalizeScope(scope == null ? activeScope : scope);
        const logicalPrefix = String(prefix || '');
        const result = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const parsed = parsePhysicalKey(localStorage.key(i));
                if (parsed && parsed.scope === normalized && parsed.key.indexOf(logicalPrefix) === 0) {
                    result.push(parsed.key);
                }
            }
        } catch (_) {}
        return result.sort();
    }

    migrateLegacyOnce();

    window.addEventListener('storage', function (event) {
        const parsed = parsePhysicalKey(event && event.key);
        if (!parsed || parsed.scope !== activeScope) return;
        dispatch('almanion-kc-external-change', {
            scope: parsed.scope,
            key: parsed.key,
            newValue: event.newValue
        });
    });

    window.AlmanionKCStorage = Object.freeze({
        get: get,
        set: set,
        remove: remove,
        list: list,
        scope: function () { return activeScope; },
        setScope: setScope,
        physicalKey: physicalKey,
        isLogicalKey: isLogicalKey,
        globalGet: rawGet,
        globalSet: rawSet,
        globalRemove: rawRemove
    });
})();
