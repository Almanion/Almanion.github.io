(() => {
    'use strict';

    const kinds = {
        avatar: { aspect: 1, title: 'Кадрирование аватара' },
        cover: { aspect: 3, title: 'Кадрирование обложки' }
    };
    const maximumZoom = 6;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const glyph = path => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"/></svg>';
    let ui;
    let session;

    function size(current) {
        const { width, height } = current.image;
        return current.rotation % 180 ? [height, width] : [width, height];
    }

    function frame(current, zoom = current.zoom) {
        const [width, height] = size(current);
        return {
            ...window.AlmanionProfileImage.frame(width, height, current.aspect, zoom, current.offsetX, current.offsetY),
            rotation: current.rotation
        };
    }

    function position(current, zoom, anchor, fraction = { x: .5, y: .5 }) {
        current.zoom = clamp(zoom, 1, maximumZoom);
        const next = frame(current);
        const [width, height] = size(current);
        const roomX = width - next.width;
        const roomY = height - next.height;
        current.offsetX = roomX > 0 ? clamp((anchor.x - fraction.x * next.width) / roomX, 0, 1) : .5;
        current.offsetY = roomY > 0 ? clamp((anchor.y - fraction.y * next.height) / roomY, 0, 1) : .5;
        renderSoon(current);
    }

    function center(crop) {
        return { x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 };
    }

    function paint(canvas, current, crop) {
        const width = canvas.clientWidth;
        if (!width) return;
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        const pixelWidth = Math.round(width * scale);
        const pixelHeight = Math.round(pixelWidth / current.aspect);
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
            canvas.width = pixelWidth;
            canvas.height = pixelHeight;
        }
        window.AlmanionProfileImage.paint(canvas.getContext('2d'), current.image.source, crop, pixelWidth, pixelHeight);
    }

    function renderSoon(current) {
        if (current.animation || !current.image || session !== current) return;
        current.animation = requestAnimationFrame(() => {
            current.animation = 0;
            if (session !== current) return;
            const crop = frame(current);
            paint(ui.canvas, current, crop);
            if (current.kind === 'avatar') paint(ui.preview, current, crop);
            const value = Math.round(current.zoom * 100) + '%';
            ui.zoom.value = current.zoom;
            ui.zoom.setAttribute('aria-valuetext', value);
            ui.zoomValue.value = value;
        });
    }

    function reset(current) {
        current.zoom = 1;
        current.offsetX = current.offsetY = .5;
        current.rotation = 0;
        renderSoon(current);
    }

    function rotate(current) {
        const anchor = center(frame(current));
        const [, height] = size(current);
        current.rotation = (current.rotation + 90) % 360;
        position(current, current.zoom, { x: height - anchor.y, y: anchor.x });
    }

    function move(current, dx, dy) {
        const crop = frame(current);
        const target = center(crop);
        const rect = ui.stage.getBoundingClientRect();
        target.x -= dx * crop.width / rect.width;
        target.y -= dy * crop.height / rect.height;
        position(current, current.zoom, target);
    }

    function gesture(current) {
        const [a, b] = current.pointers.values();
        const rect = ui.stage.getBoundingClientRect();
        return {
            distance: Math.max(12, Math.hypot(a.x - b.x, a.y - b.y)),
            fraction: { x: ((a.x + b.x) / 2 - rect.left) / rect.width, y: ((a.y + b.y) / 2 - rect.top) / rect.height }
        };
    }

    function pointerDown(event) {
        const current = session;
        if (!current?.image || current.saving || current.pointers.size === 2 || event.button !== 0) return;
        current.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        ui.stage.setPointerCapture(event.pointerId);
        ui.stage.classList.add('is-dragging');
        if (current.pointers.size === 2) {
            const { distance, fraction } = gesture(current);
            const crop = frame(current);
            current.pinch = {
                distance, zoom: current.zoom,
                anchor: { x: crop.x + fraction.x * crop.width, y: crop.y + fraction.y * crop.height }
            };
        }
    }

    function pointerMove(event) {
        const current = session;
        const previous = current?.pointers.get(event.pointerId);
        if (!previous) return;
        current.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (current.pinch) {
            const { distance, fraction } = gesture(current);
            const pinch = current.pinch;
            position(current, pinch.zoom * distance / pinch.distance, pinch.anchor, fraction);
        } else {
            move(current, event.clientX - previous.x, event.clientY - previous.y);
        }
    }

    function pointerEnd(event) {
        if (!session?.pointers.delete(event.pointerId)) return;
        session.pinch = null;
        if (!session.pointers.size) ui.stage.classList.remove('is-dragging');
    }

    function releasePointers(current) {
        const ids = Array.from(current.pointers.keys());
        current.pointers.clear();
        current.pinch = null;
        ids.forEach(id => {
            if (ui.stage.hasPointerCapture(id)) ui.stage.releasePointerCapture(id);
        });
        ui.stage.classList.remove('is-dragging');
    }

    function stageKey(event) {
        const current = session;
        if (!current?.image || current.saving || event.altKey || event.ctrlKey || event.metaKey) return;
        const step = event.shiftKey ? 28 : 8;
        const arrows = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (arrows[event.key]) move(current, ...arrows[event.key]);
        else if (event.key === '+' || event.key === '=') position(current, current.zoom * 1.2, center(frame(current)));
        else if (event.key === '-') position(current, current.zoom / 1.2, center(frame(current)));
        else return;
        event.preventDefault();
    }

    function status(message, error = false) {
        ui.error.textContent = error ? message : '';
        ui.error.hidden = !error;
        ui.status.textContent = error ? '' : message;
    }

    function updateControls(current) {
        ui.controls.disabled = !current.image || current.saving;
        ui.stage.tabIndex = current.image && !current.saving ? 0 : -1;
        ui.confirm.disabled = !current.image || current.saving;
        ui.confirm.textContent = current.saving ? 'Подготовка…' : 'Применить';
        ui.dialog.setAttribute('aria-busy', String(current.saving));
    }

    function finish(value, restoreFocus = true) {
        if (!session) return;
        const current = session;
        session = null;
        releasePointers(current);
        cancelAnimationFrame(current.animation);
        current.observer?.disconnect();
        current.image?.release();
        ui.canvas.width = ui.preview.width = 1;
        ui.canvas.height = ui.preview.height = 1;
        if (ui.dialog.open) ui.dialog.close();
        if (restoreFocus && current.trigger?.getClientRects().length) current.trigger.focus({ preventScroll: true });
        current.resolve(value);
    }

    async function confirm() {
        const current = session;
        if (!current?.image || current.saving) return;
        releasePointers(current);
        current.saving = true;
        status('');
        updateControls(current);
        try {
            const output = await window.AlmanionProfileImage.encode(current.image.source, frame(current), current.kind);
            if (session === current) finish(output);
        } catch (error) {
            if (session === current) {
                current.saving = false;
                updateControls(current);
                status(error.message || 'Не удалось подготовить изображение.', true);
                ui.confirm.focus({ preventScroll: true });
            }
        }
    }

    function build() {
        const dialog = document.createElement('dialog');
        dialog.className = 'profile-crop-dialog';
        dialog.setAttribute('aria-labelledby', 'profileCropTitle');
        dialog.innerHTML = `
            <header class="profile-crop-header">
                <h2 id="profileCropTitle"></h2>
                <button data-crop-close type="button" class="profile-crop-icon" aria-label="Закрыть" autofocus>${glyph('m6 6 12 12M6 18 18 6')}</button>
            </header>
            <div class="profile-crop-body">
                <div class="profile-crop-stage" data-crop-stage role="group" aria-label="Кадр фото" aria-describedby="profileCropHelp" tabindex="-1">
                    <div class="profile-crop-mask" data-crop-mask><canvas data-crop-image aria-hidden="true"></canvas></div>
                    <p class="profile-crop-status" data-crop-status role="status"></p>
                </div>
                <p id="profileCropHelp" class="profile-crop-help">Перетащите фото. <span class="profile-crop-key-help">Стрелки сдвигают кадр, + и − меняют масштаб.</span><span class="profile-crop-touch-help">Разведите пальцы, чтобы приблизить.</span></p>
                <p class="profile-crop-error" data-crop-error role="alert" hidden></p>
                <fieldset class="profile-crop-tools" data-crop-tools aria-label="Кадрирование">
                    <div class="profile-crop-scale">
                        <label for="profileCropZoom">Масштаб</label>
                        <output for="profileCropZoom" data-crop-value aria-hidden="true">100%</output>
                        <input id="profileCropZoom" data-crop-zoom type="range" min="1" max="6" step="0.01" value="1">
                    </div>
                    <div class="profile-crop-adjust">
                        <button data-crop-rotate type="button" class="profile-crop-icon" aria-label="Повернуть на 90°" title="Повернуть на 90°">${glyph('M20 9A8 8 0 1 0 20 15M20 3v6h-6')}</button>
                        <button data-crop-reset type="button" class="profile-crop-icon" aria-label="Сбросить кадрирование" title="Сбросить кадрирование">${glyph('M4 11a8 8 0 1 1 2.2 6M4 5v6h6')}</button>
                    </div>
                </fieldset>
            </div>
            <footer class="profile-crop-footer">
                <div class="profile-crop-preview" data-crop-preview aria-hidden="true">
                    <div class="profile-crop-mask"><canvas></canvas></div><span>В шапке</span>
                </div>
                <button type="button" class="profile-secondary" data-crop-cancel>Отмена</button>
                <button type="button" class="profile-primary" data-crop-confirm>Применить</button>
            </footer>`;
        document.body.append(dialog);
        const query = name => dialog.querySelector('[data-crop-' + name + ']');
        const stage = query('stage');
        const zoom = query('zoom');
        ui = {
            dialog, stage, zoom, zoomValue: query('value'), canvas: query('image'),
            title: dialog.querySelector('h2'), previewBox: query('preview'), preview: query('preview').querySelector('canvas'),
            status: query('status'), error: query('error'), controls: query('tools'), confirm: query('confirm')
        };
        [query('close'), query('cancel')].forEach(button => button.addEventListener('click', () => finish(null)));
        dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
        dialog.addEventListener('close', () => { if (!dialog.open) finish(null); });
        stage.addEventListener('pointerdown', pointerDown);
        stage.addEventListener('pointermove', pointerMove);
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => stage.addEventListener(type, pointerEnd));
        stage.addEventListener('keydown', stageKey);
        zoom.addEventListener('input', () => {
            if (!session?.image) return;
            position(session, Number(zoom.value), center(frame(session)));
        });
        query('rotate').addEventListener('click', () => { if (session?.image) rotate(session); });
        query('reset').addEventListener('click', () => { if (session?.image) reset(session); });
        ui.confirm.addEventListener('click', confirm);
        window.addEventListener('resize', () => { if (session) renderSoon(session); });
    }

    function open({ file, kind, trigger }) {
        if (!file || !Object.hasOwn(kinds, kind)) return Promise.resolve(null);
        if (!ui) build();
        finish(null, false);
        return new Promise(resolve => {
            const settings = kinds[kind];
            const current = { kind, aspect: settings.aspect, trigger, resolve, pointers: new Map(), zoom: 1, offsetX: .5, offsetY: .5, rotation: 0 };
            session = current;
            ui.dialog.dataset.kind = kind;
            ui.title.textContent = settings.title;
            ui.previewBox.hidden = true;
            ui.stage.dataset.ready = 'false';
            ui.zoom.value = 1;
            ui.zoomValue.value = '100%';
            status('Открываем фото…');
            updateControls(current);
            ui.dialog.showModal();
            Promise.resolve().then(() => {
                if (!window.AlmanionProfileImage) throw new Error('Редактор фото не загрузился. Обновите страницу.');
                return window.AlmanionProfileImage.load(file);
            }).then(image => {
                if (session !== current) { image.release(); return; }
                current.image = image;
                ui.stage.dataset.ready = 'true';
                ui.previewBox.hidden = kind !== 'avatar';
                status('');
                updateControls(current);
                if (typeof ResizeObserver === 'function') {
                    current.observer = new ResizeObserver(() => renderSoon(current));
                    current.observer.observe(ui.stage);
                }
                renderSoon(current);
            }).catch(error => {
                if (session === current) status(error.message || 'Не удалось открыть фото.', true);
            });
        });
    }

    window.AlmanionProfileCrop = Object.freeze({ open, close: () => finish(null) });
})();
