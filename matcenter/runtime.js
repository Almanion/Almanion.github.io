(function (root) {
    'use strict';

    const sources = Object.freeze({
        hints: 'matcenter/70-hints.js?v=20260911-2',
        settings: 'settings.js?v=20260911-1',
        analytics: 'firebase-analytics.js?v=20260911-1',
        newyear: 'newyear.js?v=20260911-1'
    });
    const pending = new Map();
    const initialized = new Set();

    function loadScript(feature) {
        if (!sources[feature]) return Promise.reject(new Error(`Unknown Matcenter feature: ${feature}`));
        if (pending.has(feature)) return pending.get(feature);

        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = sources[feature];
            script.async = true;
            script.dataset.matcenterFeature = feature;
            script.addEventListener('load', resolve, { once: true });
            script.addEventListener('error', () => reject(new Error(`Could not load ${feature}`)), { once: true });
            document.head.appendChild(script);
        }).then(() => {
            if (feature === 'hints' && !initialized.has(feature)) {
                if (typeof initHintModal === 'function') initHintModal();
                if (typeof initHintSwipe === 'function') initHintSwipe();
                initialized.add(feature);
            }
            return true;
        }).catch(error => {
            pending.delete(feature);
            throw error;
        });

        pending.set(feature, promise);
        return promise;
    }

    function idle(callback, timeout) {
        if (typeof root.requestIdleCallback === 'function') {
            root.requestIdleCallback(callback, { timeout });
        } else {
            root.setTimeout(callback, Math.min(timeout, 350));
        }
    }

    function readNewYearPreference() {
        try {
            if (root.localStorage.getItem('newYearMode') === 'true') return true;
            const settings = JSON.parse(root.localStorage.getItem('siteSettings') || '{}');
            return settings.newYearMode === true;
        } catch (_) {
            return false;
        }
    }

    function boot() {
        // Настройки появляются почти сразу, но не конкурируют за первый кадр со списком задач.
        idle(() => loadScript('settings').catch(() => null), 800);
        // Статистика не влияет на интерфейс и загружается после основного содержимого.
        idle(() => loadScript('analytics').catch(() => null), 2200);
        if (readNewYearPreference()) loadScript('newyear').catch(() => null);
    }

    root.addEventListener('almanion-load-newyear', () => loadScript('newyear').catch(() => null));
    root.MatcenterRuntime = Object.freeze({ ensure: loadScript });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})(window);
