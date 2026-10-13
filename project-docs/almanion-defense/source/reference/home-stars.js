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
    // One switch removes only the click wave, preserving stars and hover links.
    const CLICK_WAVES_ENABLED = true;
    let configureWaves = () => {};
    function createStars(width, height, random) {
        const count = Math.max(24, Math.min(180, Math.round(width * height / 9000)));
        const rand = random || Math.random;
        const groupCount = Math.max(3, Math.min(6, Math.round(count / 28)));
        // Loose, rotated elliptical clusters, with some centres near the outer
        // margins so the cards don't conceal the whole star field.
        const groups = Array.from({ length: groupCount }, (_, i) => ({
            x: width * (i === groupCount - 1 ? .25 + rand() * .5
                : i % 2 ? .88 + rand() * .08 : .04 + rand() * .08),
            y: height * (i + .2 + rand() * .6) / groupCount,
            spread: Math.min(width, height) * (.045 + rand() * .035),
            stretch: 1.15 + rand() * .7,
            angle: rand() * Math.PI * 2
        }));
        const stars = [];
        for (let i = 0; i < count; i++) {
            const group = i < Math.round(count * .7) ? groups[i % groupCount] : null;
            let point;
            for (let attempt = 0; attempt < 16; attempt++) {
                let x = width * (.015 + rand() * .97), y = height * (.015 + rand() * .97);
                if (group) {
                    // Box–Muller gives soft cores and sparse outskirts, not rings.
                    const distance = Math.sqrt(-2 * Math.log(Math.max(.000001, rand())));
                    const angle = rand() * Math.PI * 2;
                    const gx = Math.cos(angle) * distance * group.spread;
                    const gy = Math.sin(angle) * distance * group.spread * group.stretch;
                    x = group.x + gx * Math.cos(group.angle) - gy * Math.sin(group.angle);
                    y = group.y + gx * Math.sin(group.angle) + gy * Math.cos(group.angle);
                }
                if (x < 4 || y < 4 || x > width - 4 || y > height - 4) continue;
                if (stars.some(star => (star.u * width - x) ** 2 + (star.v * height - y) ** 2 < 20.25)) continue;
                point = { x, y }; break;
            }
            point ||= { x: width * (.015 + rand() * .97), y: height * (.015 + rand() * .97) };
            const brightness = rand();
            stars.push({
                u: point.x / width, v: point.y / height,
                radius: .95 + brightness * .9,
                alpha: .38 + brightness * .28,
                phase: rand() * Math.PI * 2,
                sparkle: false,
                dx: 0, dy: 0
            });
        }
        stars.filter(star => star.alpha > .63).sort((a, b) => b.alpha - a.alpha)
            .slice(0, Math.max(1, Math.round(count * .025))).forEach(star => { star.sparkle = true; });
        return stars;
    }
    function influence(x, y, pointer, radius) {
        if (!pointer.active) return { x: 0, y: 0, glow: 0 };
        const dx = x - pointer.x, dy = y - pointer.y;
        const distance = Math.hypot(dx, dy);
        const strength = Math.max(0, 1 - distance / radius);
        const eased = strength * strength;
        return { x: dx / Math.max(1, distance) * eased * 12, y: dy / Math.max(1, distance) * eased * 12, glow: eased };
    }
    function createConnections(stars, width, height, maxLength) {
        // Neighbours are computed only when the sky changes, not on each frame.
        // Prefer short edges and bound each star's degree to avoid dense tangles.
        const candidates = [], degree = new Uint8Array(stars.length), edges = [];
        for (let a = 0; a < stars.length; a++) for (let b = a + 1; b < stars.length; b++) {
            const distance = Math.hypot((stars[a].u - stars[b].u) * width, (stars[a].v - stars[b].v) * height);
            if (distance >= 5 && distance <= maxLength) candidates.push({ a, b, distance });
        }
        candidates.sort((a, b) => a.distance - b.distance);
        candidates.forEach(edge => {
            if (degree[edge.a] >= 5 || degree[edge.b] >= 5) return;
            degree[edge.a]++; degree[edge.b]++;
            edges.push(edge);
        });
        return edges;
    }
    function connectionOpacity(a, b, pointer, radius) {
        if (!pointer.active || radius <= 0) return 0;
        const distance = Math.max(Math.hypot(a.x - pointer.x, a.y - pointer.y), Math.hypot(b.x - pointer.x, b.y - pointer.y));
        const strength = Math.max(0, 1 - distance / radius);
        // Both ends stay within the interaction circle; its rim fades to zero.
        return strength * strength * (3 - 2 * strength) * .42;
    }
    function createWavePlan(stars, edges, width, height, x, y, radius) {
        const neighbours = stars.map(() => []);
        edges.forEach(edge => {
            neighbours[edge.a].push({ node: edge.b, length: edge.distance });
            neighbours[edge.b].push({ node: edge.a, length: edge.distance });
        });
        let source = -1, nearest = radius;
        stars.forEach((star, i) => {
            const distance = Math.hypot(star.u * width - x, star.v * height - y);
            if (neighbours[i].length && distance <= nearest) { nearest = distance; source = i; }
        });
        if (source < 0) return null;
        // Weighted shortest paths: a wave can reach only this component, and
        // a long edge takes longer than a short one. Cycles never restart it.
        const distances = stars.map(() => Infinity), visited = stars.map(() => false);
        distances[source] = 0;
        for (let step = 0; step < stars.length; step++) {
            let next = -1;
            for (let i = 0; i < stars.length; i++) {
                if (!visited[i] && Number.isFinite(distances[i]) && (next < 0 || distances[i] < distances[next])) next = i;
            }
            if (next < 0) break;
            visited[next] = true;
            neighbours[next].forEach(edge => {
                distances[edge.node] = Math.min(distances[edge.node], distances[next] + edge.length);
            });
        }
        let reach = 0;
        edges.forEach(edge => {
            if (!Number.isFinite(distances[edge.a])) return;
            // The two fronts may meet inside a cycle's edge, beyond either end.
            reach = Math.max(reach, (distances[edge.a] + distances[edge.b] + edge.distance) / 2);
        });
        return { source, distances, reach };
    }
    function waveIntensity(distance, travelled) {
        if (!Number.isFinite(distance) || travelled < 0) return 0;
        const age = travelled - distance;
        const strength = age < 0 ? Math.max(0, 1 + age / 22) : Math.max(0, 1 - age / 100);
        return strength * strength * (3 - 2 * strength);
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
        let mode = 'full', time = 0, touchUntil = 0, edges = [], edgeFade = 0, visibleEdges = 0;
        let waves = [], wavesEnabled = CLICK_WAVES_ENABLED, lastWave = -Infinity, visibleWaveEdges = 0, press = null;
        const pointer = { active: false, x: 0, y: 0 };
        readState = () => ({ mode, count: stars.length, edges: visibleEdges, touchActive: pointer.active && touchUntil > win.performance.now(),
            wavesEnabled, waves: waves.length, waveEdges: visibleWaveEdges, waveReach: Math.max(0, ...waves.map(wave => wave.reach)) });
        configureWaves = enabled => {
            wavesEnabled = CLICK_WAVES_ENABLED && enabled !== false;
            if (!wavesEnabled) { waves = []; visibleWaveEdges = 0; }
        };
        const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
        const coarse = win.matchMedia('(pointer: coarse)');
        function stop() { if (frame) win.cancelAnimationFrame(frame); frame = 0; }
        function draw(timestamp, moving) {
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = color;
            ctx.strokeStyle = color;
            if (touchUntil && timestamp > touchUntil) { pointer.active = false; touchUntil = 0; }
            const touchFade = touchUntil ? Math.min(1, Math.max(0, (touchUntil - timestamp) / 650)) : 1;
            if (!moving) waves = [];
            waves = waves.filter(wave => timestamp - wave.start < (wave.reach + 100) / wave.speed * 1000);
            const travelling = waves.map(wave => ({ ...wave, travelled: Math.max(0, timestamp - wave.start) * wave.speed / 1000 }));
            const glowAt = distanceFor => Math.min(1, travelling.reduce((glow, wave) => glow + waveIntensity(distanceFor(wave), wave.travelled), 0));
            const points = stars.map((star, i) => {
                const x = star.u * width, y = star.v * height;
                const target = moving ? influence(x, y, pointer, coarse.matches ? 100 : 155) : { x: 0, y: 0, glow: 0 };
                star.dx += (target.x * touchFade - star.dx) * .13;
                star.dy += (target.y * touchFade - star.dy) * .13;
                const drift = moving && mode === 'full' ? Math.sin(time / 8500 + star.phase) * 1.8 : 0;
                const alpha = star.alpha + (moving ? Math.sin(time / 3700 + star.phase) * .025 : 0) + target.glow * touchFade * .16;
                const waveGlow = glowAt(wave => wave.distances[i]);
                return { x: x + star.dx + drift, y: y + star.dy + drift * .5, alpha: alpha + waveGlow * .12, glow: target.glow, waveGlow };
            });
            edgeFade = moving ? edgeFade + ((pointer.active ? touchFade : 0) - edgeFade) * .14 : 0;
            visibleEdges = 0;
            if (edgeFade > .005) {
                const centre = { x: pointer.x, y: pointer.y, active: true };
                ctx.lineWidth = .65;
                edges.forEach(edge => {
                    const a = points[edge.a], b = points[edge.b];
                    const opacity = connectionOpacity(a, b, centre, coarse.matches ? 140 : 220) * edgeFade;
                    if (opacity < .003) return;
                    ctx.globalAlpha = opacity;
                    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
                    visibleEdges++;
                });
            }
            visibleWaveEdges = 0;
            if (travelling.length) {
                ctx.lineWidth = .85;
                edges.forEach(edge => {
                    const a = points[edge.a], b = points[edge.b];
                    const slices = Math.max(1, Math.ceil(edge.distance / 20));
                    let lit = false;
                    for (let i = 0; i < slices; i++) {
                        const from = i / slices, to = (i + 1) / slices, middle = (from + to) / 2;
                        const glow = glowAt(wave => Math.min(wave.distances[edge.a] + middle * edge.distance,
                            wave.distances[edge.b] + (1 - middle) * edge.distance));
                        if (glow < .015) continue;
                        ctx.globalAlpha = glow * (mode === 'medium' ? .15 : .22);
                        ctx.beginPath();
                        ctx.moveTo(a.x + (b.x - a.x) * from, a.y + (b.y - a.y) * from);
                        ctx.lineTo(a.x + (b.x - a.x) * to, a.y + (b.y - a.y) * to);
                        ctx.stroke(); lit = true;
                    }
                    if (lit) visibleWaveEdges++;
                });
            }
            stars.forEach((star, i) => {
                const point = points[i], px = point.x, py = point.y;
                ctx.globalAlpha = point.alpha;
                ctx.beginPath(); ctx.arc(px, py, star.radius + point.waveGlow * .3, 0, Math.PI * 2); ctx.fill();
                if (star.sparkle) {
                    const size = star.radius * 2.2 + point.glow * .5;
                    ctx.globalAlpha = point.alpha * .5;
                    ctx.lineWidth = .65;
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
            if (mode === 'off') { pointer.active = false; touchUntil = 0; waves = []; press = null; }
            resume();
        }
        function resize() {
            width = win.innerWidth; height = win.innerHeight;
            const dpr = Math.min(1.75, win.devicePixelRatio || 1);
            canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            stars = createStars(width, height);
            edges = createConnections(stars, width, height, coarse.matches ? 90 : 120);
            waves = []; visibleWaveEdges = 0; press = null;
            canvas.dataset.count = String(stars.length);
            settings();
        }
        doc.addEventListener('pointermove', event => {
            if (press && event.pointerId === press.id && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) press = null;
            if (event.pointerType === 'touch' || mode === 'off') return;
            pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true;
        }, { passive: true });
        doc.addEventListener('pointerdown', event => {
            if (mode !== 'off' && wavesEnabled && !doc.body.classList.contains('modal-open') && event.isPrimary !== false && event.button === 0 &&
                !event.target.closest('a, button, input, textarea, select, label, summary, [role="dialog"], [contenteditable="true"]')) {
                press = { id: event.pointerId, x: event.clientX, y: event.clientY, start: win.performance.now() };
            } else press = null;
            if (event.pointerType !== 'touch' || mode === 'off') return;
            pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true;
            touchUntil = win.performance.now() + 1000;
        }, { passive: true });
        doc.addEventListener('pointerup', event => {
            const tap = press; press = null;
            const now = win.performance.now();
            if (!tap || tap.id !== event.pointerId || mode === 'off' || !wavesEnabled || waves.length >= 3 || now - tap.start > 700 ||
                now - lastWave < 240 || Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 10) return;
            const plan = createWavePlan(stars, edges, width, height, tap.x, tap.y, coarse.matches ? 140 : 220);
            if (!plan) return;
            lastWave = now;
            waves.push({ ...plan, start: now, speed: coarse.matches ? 400 : 520 });
        }, { passive: true });
        // A touch pointer leaves the document on finger-up: let its soft pulse finish.
        doc.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch') pointer.active = false; });
        doc.addEventListener('pointercancel', () => { pointer.active = false; press = null; });
        doc.addEventListener('scroll', () => { press = null; }, { passive: true, capture: true });
        doc.addEventListener('visibilitychange', () => { waves = []; press = null; resume(); });
        win.addEventListener('resize', resize, { passive: true });
        win.addEventListener('almanion-settings-applied', settings);
        // Local settings announce their save before applying body classes.
        win.addEventListener('almanion-settings-changed', () => Promise.resolve().then(settings));
        win.addEventListener('pagehide', () => { paused = true; waves = []; press = null; stop(); });
        win.addEventListener('pageshow', () => { paused = false; settings(); });
        reduced.addEventListener?.('change', settings);
        coarse.addEventListener?.('change', resize);
        resize();
    }
    return { createStars, createConnections, connectionOpacity, createWavePlan, waveIntensity, influence, init,
        setWavesEnabled: enabled => configureWaves(enabled), getState: () => readState() };
});
