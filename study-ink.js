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

    function mount(host, attempt, scope) {
        const storageKey = 'kc_ink_v1:' + scope + ':' + location.pathname;
        let saved;
        try { saved = JSON.parse(sessionStorage.getItem(storageKey)); } catch {}
        const valid = saved?.attempt === attempt && Array.isArray(saved.history);
        const history = valid ? saved.history : [];
        let count = valid ? Math.min(saved.count, history.length) : 0;
        // Coordinates are centred. Preserve the sheet's proportions on
        // rotation, including any new ink drawn in the extra space.
        let bounds = valid ? saved.bounds : null;
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
            button('undo', 'Отменить штрих') + button('redo', 'Вернуть штрих') + '</div></div>' +
            '<div id="kcSketchBody"><div class="kc-ink-surface"><canvas class="kc-ink-paper" role="img" aria-label="Поле для рисования пальцем или стилусом"></canvas></div>' +
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
            try {
                if (history.length) sessionStorage.setItem(storageKey, JSON.stringify({ attempt, count, history, bounds }));
                else sessionStorage.removeItem(storageKey);
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
            const start = Math.max(0, from - 2);
            context.beginPath();
            context.moveTo(points[start], points[start + 1]);
            for (let i = start + 2; i < points.length; i += 2) context.lineTo(points[i], points[i + 1]);
            context.stroke();
        }

        function redraw() {
            if (!expanded || host.hidden) return;
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const dpr = Math.min(3, window.devicePixelRatio || 1);
            const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
            scale = bounds ? Math.min(rect.width / bounds.width, rect.height / bounds.height) : rect.width / 360;
            const style = getComputedStyle(host);
            colors = Object.fromEntries(Object.keys(pens).map(key => [key, style.getPropertyValue('--kc-ink-' + key).trim()]));
            context.setTransform(scale * w / rect.width, 0, 0, scale * h / rect.height, w / 2, h / 2);
            clearPaper();
            for (let i = 0; i < count; i++) paint(history[i]);
            if (active) paint(active.stroke);
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
                const x = Math.round((left - rect.width / 2) / scale * 10) / 10;
                const y = Math.round((top - rect.height / 2) / scale * 10) / 10;
                bounds.width = Math.max(bounds.width, Math.abs(x) * 2);
                bounds.height = Math.max(bounds.height, Math.abs(y) * 2);
                const last = points.length - 2;
                if (last < 0 || Math.hypot(x - points[last], y - points[last + 1]) >= .55) points.push(x, y);
            }
            if (points.length > from) paint(stroke, from);
        }
        function finish(keep) {
            if (!active) return;
            const { id, stroke } = active;
            active = null;
            if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
            if (keep && stroke.points.length) commit(stroke);
            else redraw();
        }
        function begin(event) {
            if (!inContact(event) || (event.pointerType === 'mouse' && event.button !== 0)) return;
            if (active) {
                if (event.pointerType !== 'pen' || active.type !== 'touch') return;
                finish(false); // Pen contact takes precedence over a resting palm.
            }
            event.preventDefault();
            const rect = canvas.getBoundingClientRect();
            if (!bounds) bounds = { width: rect.width / scale, height: rect.height / scale };
            active = { id: event.pointerId, type: event.pointerType, stroke: newStroke(toolFor(event)) };
            canvas.setPointerCapture(event.pointerId);
            addSamples([event], rect);
        }
        canvas.addEventListener('pointerdown', begin);
        // A rapid stroke can otherwise start a native fling that consumes the
        // next tap on Undo or Show answer, even with touch-action: none.
        canvas.addEventListener('touchstart', event => event.preventDefault(), { passive: false });
        canvas.addEventListener('pointermove', event => {
            // A barrel button already held in the air makes tip-down a move.
            if (!active && event.pointerType === 'pen' && event.buttons && inContact(event)) { begin(event); return; }
            if (active?.id !== event.pointerId) return;
            if (!inContact(event)) { finish(true); return; }
            const tool = toolFor(event);
            if (tool !== active.stroke.tool) {
                commit(active.stroke);
                active.stroke = newStroke(tool);
            }
            const samples = event.getCoalescedEvents?.() || [];
            addSamples([...samples, event], canvas.getBoundingClientRect());
        });
        canvas.addEventListener('pointerup', event => {
            if (active?.id !== event.pointerId) return;
            addSamples([event], canvas.getBoundingClientRect());
            finish(true);
        });
        for (const name of ['pointercancel', 'lostpointercapture']) {
            canvas.addEventListener(name, event => { if (active?.id === event.pointerId) finish(true); });
        }
        canvas.addEventListener('contextmenu', event => event.preventDefault());

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
        const theme = new MutationObserver(redraw);
        theme.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        const saveOnLeave = () => finish(true);
        window.addEventListener('pagehide', saveOnLeave);
        syncTools();
        redraw();

        return {
            answer() {
                if (answered) return;
                answered = true;
                finish(true);
                host.hidden = !count || history[count - 1].tool === 'clear';
                setExpanded(false);
            },
            destroy(discard = false) {
                finish(true);
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
