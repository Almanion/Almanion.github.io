// A temporary sheet for one attempt. Logical coordinates keep handwriting
// proportional across rotation, zoom and different device pixel ratios.
(() => {
    'use strict';

    const pens = { graphite: 'Чернила', blue: 'Синий', teal: 'Бирюзовый', coral: 'Коралловый' };
    const paths = {
        pen: '<path d="m4 15.5-.8 4.3 4.3-.8L19 7.5l-3.5-3.5zM13.5 6l3.5 3.5"/>',
        undo: '<path d="M9 5 4 10l5 5M5 10h8a5 5 0 0 1 0 10"/>',
        redo: '<path d="m15 5 5 5-5 5m4-5h-8a5 5 0 0 0 0 10"/>',
        erase: '<path d="m10 19-5-5a2 2 0 0 1 0-2.8l7.8-7.8a2 2 0 0 1 2.8 0l4.4 4.4a2 2 0 0 1 0 2.8L11.6 19H10Zm-2-11 7 7m-5 4h10"/>',
        clear: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 10.5v6m4-6v6"/>',
        check: '<path d="m5 12 4 4L19 6"/>'
    };
    function icon(name) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + '</svg>';
    }
    function button(action, label) {
        return '<button type="button" data-action="' + action + '" aria-label="' + label + '" title="' + label + '">' + icon(action) + '</button>';
    }

    const limitZoom = value => Math.max(.25, Math.min(4, value));
    const touchSlop = 8; // CSS pixels between a resting fingertip and a deliberate stroke.

    function mount(host, attempt, scope) {
        const storageKey = 'kc_ink_v1:' + scope + ':' + location.pathname;
        let saved;
        try { saved = JSON.parse(sessionStorage.getItem(storageKey)); } catch {}
        const valid = saved?.attempt === attempt && Array.isArray(saved.history);
        const history = valid ? saved.history : [];
        let count = valid ? Math.min(saved.count, history.length) : 0;
        // The first sheet sets the unit for existing strokes, even when the
        // user later writes beyond it. The view centre is in those same units.
        const oldBounds = valid ? saved.bounds : null;
        let bounds = oldBounds && [oldBounds.width, oldBounds.height].every(n => Number.isFinite(n) && n > 0) ? oldBounds : null;
        const view = { x: 0, y: 0, zoom: 1 };
        if (valid && saved.view && [saved.view.x, saved.view.y, saved.view.zoom].every(Number.isFinite)) {
            Object.assign(view, { x: saved.view.x, y: saved.view.y, zoom: limitZoom(saved.view.zoom) });
        }
        const touches = new Map();
        const strokePaths = new WeakMap();
        let gesture = null;
        let frame = 0;
        let saveTimer = 0;
        let scale = 1;
        let pen = window.AlmanionKCStorage?.get('kc_preferences_v3_ink');
        if (!Object.hasOwn(pens, pen)) pen = 'graphite';
        let erasing = false;
        let active = null;
        let answered = false;
        let colors = {};

        host.className = 'kc-sketch';
        host.innerHTML = '<div class="kc-sketch-heading"><button class="kc-sketch-toggle" type="button" aria-expanded="true" aria-controls="kcSketchBody">' +
            icon('pen') + '<span>Черновик</span></button><div class="kc-ink-history">' +
            '<button type="button" data-action="reset-view" aria-label="Вернуть исходный вид черновика" title="Вернуть исходный вид черновика">100%</button>' +
            button('undo', 'Отменить штрих') + button('redo', 'Вернуть штрих') + '</div></div>' +
            '<div id="kcSketchBody"><div class="kc-ink-surface"><canvas class="kc-ink-paper" role="img" tabindex="0" aria-label="Рисуйте одним пальцем или стилусом. Двумя пальцами двигайте и масштабируйте черновик."></canvas></div>' +
            '<div class="kc-ink-tools"><div class="kc-ink-colors" role="group" aria-label="Цвет пера">' +
            Object.entries(pens).map(([key, label]) => '<button type="button" data-pen="' + key + '" aria-label="' + label + '" title="' + label + '">' +
                '<span style="--swatch:var(--kc-ink-' + key + ')">' + icon('check') + '</span></button>').join('') +
            '</div><div class="kc-ink-edit">' + button('erase', 'Ластик') + button('clear', 'Очистить черновик') + '</div></div></div>';
        const canvas = host.querySelector('canvas');
        const context = canvas.getContext('2d');
        if (!context) { host.hidden = true; return null; }
        const body = host.querySelector('#kcSketchBody');
        const toggle = host.querySelector('.kc-sketch-toggle');
        const edits = host.querySelector('.kc-ink-history');
        const resetView = host.querySelector('[data-action="reset-view"]');
        let expanded = true;

        function syncTools() {
            host.querySelector('[data-action="undo"]').disabled = !count;
            host.querySelector('[data-action="redo"]').disabled = count === history.length;
            host.querySelector('[data-action="clear"]').disabled = !count || history[count - 1].tool === 'clear';
            host.querySelector('[data-action="erase"]').setAttribute('aria-pressed', String(erasing));
            host.querySelectorAll('[data-pen]').forEach(option =>
                option.setAttribute('aria-pressed', String(!erasing && pen === option.dataset.pen)));
        }

        function persist() {
            clearTimeout(saveTimer);
            try {
                if (history.length || view.x || view.y || view.zoom !== 1) {
                    sessionStorage.setItem(storageKey, JSON.stringify({ attempt, count, history, bounds, view }));
                } else sessionStorage.removeItem(storageKey);
            } catch { /* The sheet remains usable when browser storage is full. */ }
        }

        function clearPaper() {
            context.save();
            context.resetTransform();
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.restore();
        }
        function paint(stroke, from = 0) {
            const points = stroke.points;
            if (stroke.tool === 'clear') { clearPaper(); return; }
            if (!points.length) return;
            const erase = stroke.tool === 'erase';
            context.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
            context.strokeStyle = context.fillStyle = erase ? '#000' : colors[stroke.tool];
            context.lineWidth = stroke.width;
            context.lineCap = context.lineJoin = 'round';
            if (!from) {
                context.beginPath();
                context.arc(points[0], points[1], context.lineWidth / 2, 0, Math.PI * 2);
                context.fill();
            }
            let path = strokePaths.get(stroke);
            if (!path) {
                path = new Path2D();
                const start = Math.max(0, from - 2);
                path.moveTo(points[start], points[start + 1]);
                for (let i = start + 2; i < points.length; i += 2) path.lineTo(points[i], points[i + 1]);
                if (!from && stroke !== active?.stroke) strokePaths.set(stroke, path);
            }
            context.stroke(path);
        }

        function baseScale(rect) {
            if (!bounds) bounds = { width: 360, height: 360 * rect.height / rect.width };
            return Math.min(rect.width / bounds.width, rect.height / bounds.height);
        }
        function readColors() {
            const style = getComputedStyle(host);
            colors = Object.fromEntries(Object.keys(pens).map(key => [key, style.getPropertyValue('--kc-ink-' + key).trim()]));
        }
        function redraw() {
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
            if (!expanded || host.hidden) return;
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const dpr = Math.min(3, window.devicePixelRatio || 1);
            const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
            scale = baseScale(rect) * view.zoom;
            const originX = rect.width / 2 - view.x * scale;
            const originY = rect.height / 2 - view.y * scale;
            context.setTransform(scale * w / rect.width, 0, 0, scale * h / rect.height,
                originX * w / rect.width, originY * h / rect.height);
            // Keep the dot grid anchored to the paper and legible at either zoom limit.
            let step = 18 * scale;
            while (step < 9) step *= 2;
            while (step > 36) step /= 2;
            canvas.style.backgroundSize = step + 'px ' + step + 'px';
            canvas.style.backgroundPosition = (originX % step - step / 2) + 'px ' + (originY % step - step / 2) + 'px';
            const percent = Math.round(view.zoom * 100) + '%';
            if (resetView.textContent !== percent) resetView.textContent = percent;
            resetView.disabled = Math.abs(view.x) < .01 && Math.abs(view.y) < .01 && Math.abs(view.zoom - 1) < .0001;
            clearPaper();
            for (let i = 0; i < count; i++) paint(history[i]);
            if (active) paint(active.stroke);
        }

        function queueRedraw() {
            if (!frame) frame = requestAnimationFrame(redraw);
        }

        function commit(stroke) {
            history.splice(count);
            history.push(stroke);
            count++;
            syncTools();
            persist();
        }

        function newStroke(tool) {
            return { tool, width: (tool === 'erase' ? 20 : 2.25) / scale, points: [] };
        }

        function setExpanded(value) {
            if (!value && (active || touches.size)) { finish(true); endTouches(); }
            expanded = value;
            toggle.setAttribute('aria-expanded', String(value));
            edits.hidden = body.hidden = !value;
            if (value) redraw();
        }

        function toolFor(event) {
            return erasing || (event.pointerType === 'pen' && (event.buttons & (2 | 32))) ? 'erase' : pen;
        }
        function inContact(event) {
            return event.pointerType !== 'pen' || !!(event.buttons & (1 | 32)) || event.pressure > 0;
        }
        function addSamples(events, rect) {
            const stroke = active.stroke;
            const points = stroke.points;
            const from = points.length;
            for (const event of events) {
                const left = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
                const top = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
                const x = Math.round((view.x + (left - rect.width / 2) / scale) * 10) / 10;
                const y = Math.round((view.y + (top - rect.height / 2) / scale) * 10) / 10;
                const last = points.length - 2;
                if (last < 0 || Math.hypot(x - points[last], y - points[last + 1]) >= .55) points.push(x, y);
            }
            if (points.length > from) paint(stroke, from);
        }
        function finish(keep) {
            if (!active) return;
            const { id, stroke } = active;
            active = null;
            if (!touches.has(id) && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
            if (keep && stroke.points.length) commit(stroke);
            else redraw();
        }

        // The world point between the fingertips stays under their midpoint
        // while both the distance and the position of the pair change.
        function worldAt(x, y, rect) {
            const unit = baseScale(rect) * view.zoom;
            return {
                x: view.x + (x - rect.left - rect.width / 2) / unit,
                y: view.y + (y - rect.top - rect.height / 2) / unit
            };
        }
        function placeAt(anchor, x, y, zoom, rect) {
            view.zoom = limitZoom(zoom);
            const unit = baseScale(rect) * view.zoom;
            view.x = anchor.x - (x - rect.left - rect.width / 2) / unit;
            view.y = anchor.y - (y - rect.top - rect.height / 2) / unit;
            queueRedraw();
        }
        function measurePair(ids) {
            const a = touches.get(ids[0]), b = touches.get(ids[1]);
            return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, span: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) };
        }
        function startGesture() {
            const ids = Array.from(touches.keys()).slice(0, 2);
            const pair = measurePair(ids);
            gesture = { ids, span: pair.span, zoom: view.zoom, anchor: worldAt(pair.x, pair.y, canvas.getBoundingClientRect()) };
        }
        function moveGesture() {
            const pair = measurePair(gesture.ids);
            placeAt(gesture.anchor, pair.x, pair.y, gesture.zoom * pair.span / gesture.span, canvas.getBoundingClientRect());
        }
        function endTouches() {
            for (const id of touches.keys()) {
                if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
            }
            touches.clear();
            if (gesture) persist();
            gesture = null;
        }

        function begin(event) {
            if (!inContact(event) || (event.pointerType === 'mouse' && event.button !== 0)) return;
            event.preventDefault();
            if (event.pointerType === 'pen' && touches.size) {
                if (active?.type === 'touch') finish(false);
                endTouches(); // Ignore palms still down until they are lifted.
            }
            if (frame) redraw();
            if (event.pointerType === 'touch') {
                if (active && active.type !== 'touch') return;
                touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
                canvas.setPointerCapture(event.pointerId);
                if (touches.size === 2) {
                    // Discard the resting first fingertip, but keep an intentional
                    // line already drawn before the second finger joined it.
                    if (active) finish(active.travel >= touchSlop);
                    startGesture();
                    return;
                }
                if (touches.size > 2) return;
            }
            if (active) return;
            const rect = canvas.getBoundingClientRect();
            active = { id: event.pointerId, type: event.pointerType, stroke: newStroke(toolFor(event)),
                startX: event.clientX, startY: event.clientY, travel: 0 };
            if (event.pointerType !== 'touch') canvas.setPointerCapture(event.pointerId);
            addSamples([event], rect);
        }
        canvas.addEventListener('pointerdown', begin);
        // A rapid stroke can otherwise start a native fling that consumes the
        // next tap on Undo or Show answer, even with touch-action: none.
        canvas.addEventListener('touchstart', event => event.preventDefault(), { passive: false });
        canvas.addEventListener('pointermove', event => {
            // A barrel button already held in the air makes tip-down a move.
            if (event.pointerType === 'pen' && active?.type !== 'pen' && event.buttons && inContact(event)) { begin(event); return; }
            if (touches.has(event.pointerId)) {
                touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
                if (gesture) {
                    if (gesture.ids.includes(event.pointerId)) moveGesture();
                    return;
                }
            }
            if (active?.id !== event.pointerId) return;
            if (!inContact(event)) { finish(true); return; }
            if (active.type === 'touch') {
                const distance = Math.hypot(event.clientX - active.startX, event.clientY - active.startY);
                active.travel = Math.max(active.travel, distance);
            }
            const tool = toolFor(event);
            if (tool !== active.stroke.tool) {
                commit(active.stroke);
                active.stroke = newStroke(tool);
            }
            const samples = event.getCoalescedEvents?.() || [];
            addSamples([...samples, event], canvas.getBoundingClientRect());
        });
        function lift(event) {
            if (active?.id === event.pointerId) {
                if (event.type === 'pointerup') addSamples([event], canvas.getBoundingClientRect());
                finish(event.type === 'pointerup' || active.type !== 'touch' || active.travel >= touchSlop);
            }
            const inPair = gesture?.ids.includes(event.pointerId);
            if (inPair && event.type === 'pointerup') {
                touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
                moveGesture();
            }
            touches.delete(event.pointerId);
            if (!inPair) return;
            gesture = null;
            if (touches.size >= 2) startGesture();
            // A remaining finger can join another pair, but cannot start a stroke until lifted.
            persist();
        }
        for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, lift);
        canvas.addEventListener('contextmenu', event => event.preventDefault());

        function resetViewport() {
            finish(true);
            endTouches();
            Object.assign(view, { x: 0, y: 0, zoom: 1 });
            redraw();
            persist();
        }
        canvas.addEventListener('wheel', event => {
            event.preventDefault();
            if (active || touches.size) return;
            const rect = canvas.getBoundingClientRect();
            const pixels = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
            if (event.ctrlKey) {
                const anchor = worldAt(event.clientX, event.clientY, rect);
                placeAt(anchor, event.clientX, event.clientY, view.zoom * Math.exp(-event.deltaY * pixels * .01), rect);
            } else {
                const unit = baseScale(rect) * view.zoom;
                view.x += event.deltaX * pixels / unit;
                view.y += event.deltaY * pixels / unit;
                queueRedraw();
            }
            clearTimeout(saveTimer);
            saveTimer = setTimeout(persist, 180);
        }, { passive: false });
        canvas.addEventListener('keydown', event => {
            if (event.ctrlKey || event.metaKey || event.altKey || active || touches.size) return;
            const step = 48 / (baseScale(canvas.getBoundingClientRect()) * view.zoom);
            switch (event.key) {
                case 'ArrowLeft': view.x -= step; break;
                case 'ArrowRight': view.x += step; break;
                case 'ArrowUp': view.y -= step; break;
                case 'ArrowDown': view.y += step; break;
                case '+': case '=': view.zoom = limitZoom(view.zoom * 1.25); break;
                case '-': view.zoom = limitZoom(view.zoom / 1.25); break;
                case '0': case 'Home': Object.assign(view, { x: 0, y: 0, zoom: 1 }); break;
                default: return;
            }
            event.preventDefault();
            event.stopPropagation();
            queueRedraw();
            persist();
        });

        toggle.addEventListener('click', () => setExpanded(!expanded));
        host.addEventListener('click', event => {
            const control = event.target.closest('[data-pen], [data-action]');
            if (!control || control.disabled) return;
            if (control.dataset.pen) {
                pen = control.dataset.pen;
                erasing = false;
                window.AlmanionKCStorage?.set('kc_preferences_v3_ink', pen);
            } else {
                switch (control.dataset.action) {
                    case 'reset-view': resetViewport(); return;
                    case 'erase': erasing = !erasing; break;
                    case 'undo': if (count) count--; break;
                    case 'redo': if (count < history.length) count++; break;
                    case 'clear': commit({ tool: 'clear', points: [] }); break;
                }
                redraw();
                persist();
            }
            syncTools();
        });
        const resize = new ResizeObserver(redraw);
        resize.observe(canvas);
        const theme = new MutationObserver(() => { readColors(); queueRedraw(); });
        theme.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        const saveOnLeave = () => { finish(true); endTouches(); persist(); };
        window.addEventListener('pagehide', saveOnLeave);
        syncTools();
        readColors();
        redraw();

        return {
            answer() {
                if (answered) return;
                answered = true;
                saveOnLeave();
                host.hidden = !count || history[count - 1].tool === 'clear';
                setExpanded(false);
            },
            destroy(discard = false) {
                saveOnLeave();
                cancelAnimationFrame(frame);
                resize.disconnect();
                theme.disconnect();
                window.removeEventListener('pagehide', saveOnLeave);
                if (discard) { try { sessionStorage.removeItem(storageKey); } catch {} }
                host.replaceChildren();
                host.hidden = true;
            }
        };
    }
    window.AlmanionStudyInk = { mount };
})();
