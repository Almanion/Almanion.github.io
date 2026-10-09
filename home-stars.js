(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root?.document) {
        root.AlmanionHomeStars = api;
        api.init(root);
    }
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    let readState = () => null;
    function createStars(width, height, random) {
        const count = Math.max(24, Math.min(180, Math.round(width * height / 9000)));
        const rand = random || Math.random;
        // Stratification avoids dense random clusters. Coordinates survive resizing.
        const columns = Math.ceil(Math.sqrt(count * width / Math.max(1, height)));
        const rows = Math.ceil(count / columns);
        return Array.from({ length: count }, (_, i) => ({
            u: (i % columns + .15 + rand() * .7) / columns,
            v: (Math.floor(i / columns) + .15 + rand() * .7) / rows,
            radius: .95 + rand() * .9,
            alpha: .42 + rand() * .26,
            phase: rand() * Math.PI * 2,
            sparkle: i % 8 === 0,
            dx: 0, dy: 0
        }));
    }
    function influence(x, y, pointer, radius) {
        if (!pointer.active) return { x: 0, y: 0, glow: 0 };
        const dx = x - pointer.x, dy = y - pointer.y;
        const distance = Math.hypot(dx, dy);
        const strength = Math.max(0, 1 - distance / radius);
        const eased = strength * strength;
        return { x: dx / Math.max(1, distance) * eased * 12, y: dy / Math.max(1, distance) * eased * 12, glow: eased };
    }
    function init(win) {
        const doc = win.document;
        if (!doc.body.classList.contains('home-page') || doc.querySelector('.home-starfield')) return;
        const canvas = doc.createElement('canvas');
        canvas.className = 'home-starfield';
        canvas.setAttribute('aria-hidden', 'true');
        doc.body.prepend(canvas);
        const ctx = canvas.getContext('2d');
        if (!ctx) { canvas.remove(); return; }
        let width = 0, height = 0, stars = [], frame = 0, last = 0, color = '', paused = false;
        let mode = 'full', time = 0, touchUntil = 0;
        const pointer = { active: false, x: 0, y: 0 };
        readState = () => ({ mode, count: stars.length, touchActive: pointer.active && touchUntil > win.performance.now() });
        const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
        const coarse = win.matchMedia('(pointer: coarse)');
        function stop() { if (frame) win.cancelAnimationFrame(frame); frame = 0; }
        function draw(timestamp, moving) {
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = color;
            ctx.strokeStyle = color;
            if (touchUntil && timestamp > touchUntil) { pointer.active = false; touchUntil = 0; }
            const touchFade = touchUntil ? Math.min(1, Math.max(0, (touchUntil - timestamp) / 650)) : 1;
            stars.forEach(star => {
                const x = star.u * width, y = star.v * height;
                const target = moving ? influence(x, y, pointer, coarse.matches ? 100 : 155) : { x: 0, y: 0, glow: 0 };
                star.dx += (target.x * touchFade - star.dx) * .13;
                star.dy += (target.y * touchFade - star.dy) * .13;
                const drift = moving && mode === 'full' ? Math.sin(time / 8500 + star.phase) * 1.8 : 0;
                const alpha = star.alpha + (moving ? Math.sin(time / 3700 + star.phase) * .045 : 0) + target.glow * touchFade * .22;
                ctx.globalAlpha = alpha;
                const px = x + star.dx + drift, py = y + star.dy + drift * .5;
                ctx.beginPath(); ctx.arc(px, py, star.radius, 0, Math.PI * 2); ctx.fill();
                if (star.sparkle) {
                    const size = star.radius * 2.6 + target.glow;
                    ctx.globalAlpha = alpha * .65;
                    ctx.lineWidth = .85;
                    ctx.beginPath();
                    ctx.moveTo(px - size, py); ctx.lineTo(px + size, py);
                    ctx.moveTo(px, py - size); ctx.lineTo(px, py + size);
                    ctx.stroke();
                }
            });
            ctx.globalAlpha = 1;
        }
        function tick(timestamp) {
            frame = 0;
            if (paused || doc.hidden || mode === 'off') return;
            const delta = timestamp - last;
            if (delta >= (coarse.matches ? 1000 / 24 : 1000 / 30)) {
                time += last ? Math.min(delta, 70) : 0;
                last = timestamp;
                draw(timestamp, true);
            }
            frame = win.requestAnimationFrame(tick);
        }
        function resume() {
            stop(); last = 0;
            if (!paused && !doc.hidden && mode !== 'off') frame = win.requestAnimationFrame(tick);
            else draw(win.performance.now(), false);
            canvas.dataset.motion = mode;
        }
        function settings() {
            color = win.getComputedStyle(canvas).color;
            mode = reduced.matches || doc.body.classList.contains('animations-off') ? 'off'
                : doc.body.classList.contains('animations-medium') ? 'medium' : 'full';
            resume();
        }
        function resize() {
            width = win.innerWidth; height = win.innerHeight;
            const dpr = Math.min(1.75, win.devicePixelRatio || 1);
            canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            stars = createStars(width, height);
            canvas.dataset.count = String(stars.length);
            settings();
        }
        doc.addEventListener('pointermove', event => {
            if (event.pointerType === 'touch' || mode === 'off') return;
            pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true;
        }, { passive: true });
        doc.addEventListener('pointerdown', event => {
            if (event.pointerType !== 'touch' || mode === 'off') return;
            pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true;
            touchUntil = win.performance.now() + 1000;
        }, { passive: true });
        // A touch pointer leaves the document on finger-up: let its soft pulse finish.
        doc.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch') pointer.active = false; });
        doc.addEventListener('pointercancel', () => { pointer.active = false; });
        doc.addEventListener('visibilitychange', resume);
        win.addEventListener('resize', resize, { passive: true });
        win.addEventListener('almanion-settings-applied', settings);
        // Local settings announce their save before applying body classes.
        win.addEventListener('almanion-settings-changed', () => Promise.resolve().then(settings));
        win.addEventListener('pagehide', () => { paused = true; stop(); });
        win.addEventListener('pageshow', () => { paused = false; settings(); });
        reduced.addEventListener?.('change', settings);
        coarse.addEventListener?.('change', resize);
        resize();
    }
    return { createStars, influence, init, getState: () => readState() };
});
