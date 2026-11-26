(() => {
    'use strict';

    const coordinateMax = 10000;
    const maxPoints = 8500;
    const maxStrokes = 250;
    const maxHistory = 40;
    const maxDrawingLength = 120000;
    const minAspect = .1;
    const maxAspect = 10;
    const defaultColor = '#838cf4';
    const colorPattern = /^#[0-9a-f]{6}$/i;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    function fitFrame(width, height, aspect) {
        if (aspect === null) return { left: 0, top: 0, width, height };
        const frameWidth = Math.min(width, height * aspect);
        const frameHeight = frameWidth / aspect;
        return { left: (width - frameWidth) / 2, top: (height - frameHeight) / 2, width: frameWidth, height: frameHeight };
    }

    function validateStrokes(raw) {
        if (!Array.isArray(raw) || raw.length > maxStrokes) return null;
        const strokes = [];
        let pointCount = 0;
        for (const stroke of raw) {
            if (!stroke || typeof stroke.color !== 'string' || !colorPattern.test(stroke.color) ||
                typeof stroke.erase !== 'boolean' || !Number.isInteger(stroke.size) || stroke.size < 1 || stroke.size > 32) return null;
            const points = stroke.points;
            if (!Array.isArray(points) || points.length < 2 || points.length % 2) return null;
            pointCount += points.length / 2;
            if (pointCount > maxPoints) return null;
            const copy = Array.from(points);
            if (!copy.every(point => Number.isInteger(point) && point >= 0 && point <= coordinateMax)) return null;
            strokes.push({ color: stroke.color.toLowerCase(), size: stroke.size, erase: stroke.erase, points: copy });
        }
        return strokes;
    }

    function decode(drawing) {
        if (typeof drawing !== 'string' || drawing.length > maxDrawingLength) return null;
        try {
            return validateStrokes(JSON.parse(drawing));
        } catch {
            return null;
        }
    }

    function sanitizeStrokes(raw) {
        return validateStrokes(raw) || [];
    }

    function create(canvas, { editable = false, onChange, onLimit } = {}) {
        const context = canvas.getContext('2d');
        if (!context) return null;

        const listeners = new AbortController();
        const past = [];
        const future = [];
        const touches = new Set();
        const brush = { color: defaultColor, size: 5, erase: false };
        let strokes = [];
        let pointCount = 0;
        let active = null;
        let frame = 0;
        let needsRedraw = true;
        let destroyed = false;
        let aspect = null;
        let drawingFrame = fitFrame(0, 0, aspect);

        function paint(stroke, from = 0) {
            const points = stroke.points;
            if (from >= points.length) return;
            const { width, height, left, top } = drawingFrame;
            const scaleX = width / coordinateMax;
            const scaleY = height / coordinateMax;
            const brushWidth = Math.max(1, Math.min(width, height) * stroke.size / 600);
            context.save();
            context.beginPath();
            context.rect(left, top, width, height);
            context.clip();
            context.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
            context.strokeStyle = context.fillStyle = stroke.color;
            context.lineWidth = stroke.erase ? brushWidth * 2.5 : brushWidth;
            context.lineCap = context.lineJoin = 'round';
            context.beginPath();
            if (points.length === 2) {
                context.arc(left + points[0] * scaleX, top + points[1] * scaleY, context.lineWidth / 2, 0, 2 * Math.PI);
                context.fill();
            } else {
                const start = Math.max(0, from - 2);
                context.moveTo(left + points[start] * scaleX, top + points[start + 1] * scaleY);
                for (let index = start + 2; index < points.length; index += 2) {
                    context.lineTo(left + points[index] * scaleX, top + points[index + 1] * scaleY);
                }
                context.stroke();
            }
            context.restore();
        }

        function render() {
            frame = 0;
            if (needsRedraw) {
                const { width, height } = canvas.getBoundingClientRect();
                if (!width || !height) return;
                drawingFrame = fitFrame(width, height, aspect);
                const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4000000 / (width * height)));
                const pixelWidth = Math.max(1, Math.round(width * ratio));
                const pixelHeight = Math.max(1, Math.round(height * ratio));
                if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
                    canvas.width = pixelWidth;
                    canvas.height = pixelHeight;
                }
                context.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
                context.clearRect(0, 0, width, height);
                strokes.forEach(stroke => paint(stroke));
                if (active) active.painted = 0;
                needsRedraw = false;
            }
            if (active && drawingFrame.width && drawingFrame.height) {
                paint(active.stroke, active.painted);
                active.painted = active.stroke.points.length;
            }
        }

        function queueRender(redraw = false) {
            needsRedraw ||= redraw;
            if (!frame && !destroyed) frame = requestAnimationFrame(render);
        }

        function getStrokes() {
            return strokes.map(stroke => ({ ...stroke, points: stroke.points.slice() }));
        }

        function getState() {
            return { canUndo: past.length > 0, canRedo: future.length > 0, isEmpty: strokes.length === 0 };
        }

        function setDrawing(next, redraw = true) {
            strokes = next;
            pointCount = next.reduce((total, stroke) => total + stroke.points.length / 2, 0);
            if (redraw) queueRender(true);
            onChange?.(getStrokes(), getState());
        }

        function commit(next, redraw = true) {
            past.push(strokes);
            if (past.length > maxHistory) past.shift();
            future.length = 0;
            setDrawing(next, redraw);
        }

        function finish(keep) {
            if (!active) return;
            const { stroke, limited } = active;
            if (keep && stroke.points.length) {
                // Finish the current path before replacing it with history.
                if (!needsRedraw && drawingFrame.width && drawingFrame.height) paint(stroke, active.painted);
                active = null;
                commit([...strokes, stroke], needsRedraw);
            } else {
                active = null;
                queueRender(true);
            }
            if (limited) onLimit?.();
        }

        function setStrokes(raw) {
            finish(false);
            past.length = future.length = 0;
            setDrawing(sanitizeStrokes(raw));
        }

        function setAspect(value = null) {
            if (value !== null && (!Number.isFinite(value) || value < minAspect || value > maxAspect)) return;
            if (aspect === value) return;
            finish(false);
            aspect = value;
            queueRender(true);
        }

        function undo() {
            finish(false);
            if (!past.length) return;
            future.push(strokes);
            setDrawing(past.pop());
        }

        function redo() {
            finish(false);
            if (!future.length) return;
            past.push(strokes);
            setDrawing(future.pop());
        }

        function clear() {
            finish(false);
            if (strokes.length) commit([]);
        }

        function setBrush(next) {
            if (typeof next.color === 'string' && colorPattern.test(next.color)) brush.color = next.color.toLowerCase();
            if (Number.isFinite(next.size)) brush.size = Math.max(1, Math.min(32, Math.round(next.size)));
            if (typeof next.erase === 'boolean') brush.erase = next.erase;
        }

        function isPenInContact(event) {
            return Boolean(event.buttons & (1 | 32)) || event.pressure > 0;
        }

        function isErasing(event) {
            return brush.erase || (event.pointerType === 'pen' && Boolean(event.buttons & (2 | 32)));
        }

        function addSamples(events, rect = canvas.getBoundingClientRect(), fitted = fitFrame(rect.width, rect.height, aspect)) {
            if (!fitted.width || !fitted.height) return;
            const points = active.stroke.points;
            const before = points.length;
            const unitX = coordinateMax / fitted.width;
            const unitY = coordinateMax / fitted.height;
            for (const event of events) {
                const x = clamp(Math.round((event.clientX - rect.left - fitted.left) * unitX), 0, coordinateMax);
                const y = clamp(Math.round((event.clientY - rect.top - fitted.top) * unitY), 0, coordinateMax);
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                const last = points.length - 2;
                if (last >= 0 && Math.hypot((x - points[last]) / unitX, (y - points[last + 1]) / unitY) < 1.2) continue;
                if (pointCount + points.length / 2 >= maxPoints) {
                    active.limited = true;
                    break;
                }
                points.push(x, y);
            }
            if (points.length !== before) queueRender();
        }

        function begin(event, capture = true) {
            const { pointerId: id, pointerType: type } = event;
            if ((type === 'mouse' && event.button !== 0) || (type === 'pen' && !isPenInContact(event))) return;
            event.preventDefault();
            if (type === 'touch') {
                touches.add(id);
                if (capture) canvas.setPointerCapture(id);
                if (touches.size > 1 && active?.type === 'touch') finish(false);
                if (touches.size !== 1) return;
            }
            if (type === 'pen' && active?.type === 'touch') finish(false);
            if (active) return;
            if (strokes.length >= maxStrokes || pointCount >= maxPoints) {
                onLimit?.();
                return;
            }
            const erase = isErasing(event);
            if (erase && !strokes.length) return;
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const nextAspect = aspect ?? clamp(rect.width / rect.height, minAspect, maxAspect);
            const fitted = fitFrame(rect.width, rect.height, nextAspect);
            const x = event.clientX - rect.left - fitted.left;
            const y = event.clientY - rect.top - fitted.top;
            if (x < 0 || x > fitted.width || y < 0 || y > fitted.height) return;
            setAspect(nextAspect);
            const stroke = { ...brush, erase, points: [] };
            active = { id, type, stroke, painted: 0, limited: false };
            if (capture && type !== 'touch') canvas.setPointerCapture(id);
            addSamples([event], rect, fitted);
        }

        function move(event) {
            const isPen = event.pointerType === 'pen';
            if (active?.id !== event.pointerId) {
                // Some pens report tip-down as pointermove when the barrel button is held.
                if (isPen && event.buttons && isPenInContact(event)) begin(event);
                return;
            }
            if (isPen && !isPenInContact(event)) {
                finish(true);
                return;
            }
            if (isPen && isErasing(event) !== active.stroke.erase) {
                finish(true);
                begin(event, false);
                return;
            }
            const samples = event.getCoalescedEvents?.() || [];
            addSamples([...samples, event]);
        }

        function lift(event) {
            touches.delete(event.pointerId);
            if (active?.id !== event.pointerId) return;
            if (event.type === 'pointerup') {
                addSamples([event]);
                finish(true);
            } else {
                finish(false);
            }
        }

        function destroy() {
            destroyed = true;
            listeners.abort();
            resizeObserver?.disconnect();
            cancelAnimationFrame(frame);
            if (active) touches.add(active.id);
            for (const id of touches) {
                if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
            }
            touches.clear();
        }

        const options = { signal: listeners.signal };
        const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => queueRender(true)) : null;
        resizeObserver?.observe(canvas);
        window.addEventListener('resize', () => queueRender(true), options);
        if (editable) {
            canvas.addEventListener('pointerdown', begin, options);
            canvas.addEventListener('pointermove', move, options);
            for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
                canvas.addEventListener(name, lift, options);
            }
            canvas.addEventListener('touchstart', event => event.preventDefault(), { ...options, passive: false });
        }
        queueRender(true);
        return { getStrokes, getState, setStrokes, setAspect, getAspect: () => aspect, undo, redo, clear, setBrush, destroy };
    }

    window.AlmanionHomeArtCanvas = { create, decode, sanitizeStrokes };
})();
