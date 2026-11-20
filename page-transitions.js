(function () {
    'use strict';

    // Only public reading pages are eligible for speculative requests.
    const publicPages = new Set([
        'index.html', 'physics.html', 'physics-10.html', 'physics-exam.html',
        'chemistry.html', 'chemistry-10.html', 'math.html', 'geometry.html',
        'geometry-formulas.html', 'likbez.html', 'literature-10.html', 'russian-ege.html'
    ]);
    const directory = new URL('.', location.href);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    function syncMotion(event) {
        let level;
        try { level = JSON.parse(localStorage.getItem('siteSettings') || '{}')?.animationLevel; }
        catch (_) { /* Storage is optional. */ }
        document.documentElement.dataset.pageMotion = level === 'medium' || level === 'off' ? level : 'max';
        const transition = event?.viewTransition;
        if (transition) {
            // The browser can skip a navigation snapshot, e.g. on an immediate Back.
            transition.ready?.catch(() => {});
            if (reducedMotion.matches || level === 'off') transition.skipTransition();
        }
    }

    for (const name of ['pageswap', 'pagereveal', 'pageshow', 'almanion-settings-changed', 'almanion-settings-applied']) {
        window.addEventListener(name, syncMotion);
    }
    window.addEventListener('storage', event => {
        if (!event.key || event.key === 'siteSettings') syncMotion();
    });
    syncMotion();

    if (!/^https?:$/.test(location.protocol)) return;
    const warmed = new Set();
    let pending;
    let timer;

    function cancel() {
        clearTimeout(timer);
        pending = null;
    }

    function warm(link) {
        const connection = navigator.connection;
        if (!navigator.onLine || connection?.saveData || /2g$/.test(connection?.effectiveType || '')) return;
        if (warmed.size >= 2 || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
        let url;
        try { url = new URL(link.href); } catch (_) { return; }
        const name = url.pathname.slice(directory.pathname.length) || 'index.html';
        if (url.origin !== directory.origin || !url.pathname.startsWith(directory.pathname) || !publicPages.has(name)) return;
        if (url.search || url.username || url.password || name === (location.pathname.split('/').pop() || 'index.html')) return;
        url.hash = '';
        if (warmed.has(url.href)) return;
        warmed.add(url.href);
        const hint = document.createElement('link');
        hint.rel = 'prefetch';
        hint.as = 'document';
        hint.href = url.href;
        document.head.appendChild(hint);
    }

    function schedule(event) {
        if (event.type === 'pointerover' && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
        const link = event.target.closest?.('a[href]');
        if (!link || pending === link || (event.type === 'focusin' && !link.matches(':focus-visible'))) return;
        cancel();
        pending = link;
        timer = setTimeout(() => { pending = null; warm(link); }, 80);
    }

    function leave(event) {
        if (pending && !pending.contains(event.relatedTarget)) cancel();
    }

    document.addEventListener('pointerover', schedule);
    document.addEventListener('pointerout', leave);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', leave);
    window.addEventListener('pagehide', cancel);
}());
