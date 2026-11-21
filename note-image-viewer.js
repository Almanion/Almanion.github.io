(function () {
    var ov, imgEl, opener, scale = 1, tx = 0, ty = 0, lastTouchAt = 0;

    function apply() { imgEl.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')'; }
    function reset() { scale = 1; tx = 0; ty = 0; if (imgEl) { imgEl.style.transition = ''; apply(); } }

    function build() {
        ov = document.createElement('div');
        ov.id = 'lightboxOverlay';
        ov.className = 'lightbox-overlay';
        ov.setAttribute('role', 'dialog');
        ov.setAttribute('aria-modal', 'true');
        ov.setAttribute('aria-label', 'Просмотр иллюстрации');
        ov.innerHTML =
            '<button class="lightbox-close" type="button" aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg></button>' +
            '<img class="lightbox-img" alt="" draggable="false">';
        document.body.appendChild(ov);
        imgEl = ov.querySelector('.lightbox-img');

        ov.querySelector('.lightbox-close').addEventListener('click', close);
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });

        // Двойной клик (десктоп) — зум к точке
        imgEl.addEventListener('dblclick', function (e) { if (Date.now() - lastTouchAt >= 500) toggleZoom(e.clientX, e.clientY); });
        // Колесо мыши — зум
        ov.addEventListener('wheel', function (e) {
            e.preventDefault();
            scale = Math.min(5, Math.max(1, scale * (e.deltaY < 0 ? 1.15 : 0.87)));
            if (scale <= 1.02) reset(); else apply();
        }, { passive: false });

        wireTouch();
    }

    function toggleZoom(cx, cy) {
        imgEl.style.transition = 'transform 0.2s ease';
        if (scale > 1) { reset(); imgEl.style.transition = 'transform 0.2s ease'; }
        else {
            scale = 2.5;
            var r = imgEl.getBoundingClientRect();
            tx = (r.left + r.width / 2 - cx) * (scale - 1);
            ty = (r.top + r.height / 2 - cy) * (scale - 1);
            apply();
        }
        setTimeout(function () { if (imgEl) imgEl.style.transition = ''; }, 220);
    }

    function wireTouch() {
        var startDist = 0, startScale = 1, sx = 0, sy = 0, px = 0, py = 0, mode = '', lastTap = 0;
        function d2(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }

        imgEl.addEventListener('touchstart', function (e) {
            lastTouchAt = Date.now();
            imgEl.style.transition = '';
            if (e.touches.length === 2) { mode = 'pinch'; startDist = d2(e.touches); startScale = scale; return; }
            var now = lastTouchAt;
            if (now - lastTap < 300) { mode = ''; lastTap = 0; toggleZoom(e.touches[0].clientX, e.touches[0].clientY); return; }
            lastTap = now;
            mode = scale > 1 ? 'pan' : 'swipe';
            sx = e.touches[0].clientX; sy = e.touches[0].clientY; px = tx; py = ty;
        }, { passive: true });

        imgEl.addEventListener('touchmove', function (e) {
            if (mode === 'pinch' && e.touches.length === 2) {
                e.preventDefault();
                scale = Math.min(5, Math.max(1, startScale * d2(e.touches) / startDist));
                apply();
            } else if (mode === 'pan' && e.touches.length === 1) {
                e.preventDefault();
                tx = px + (e.touches[0].clientX - sx);
                ty = py + (e.touches[0].clientY - sy);
                apply();
            } else if (mode === 'swipe' && e.touches.length === 1) {
                var dy = e.touches[0].clientY - sy;
                if (dy > 0) { e.preventDefault(); imgEl.style.transform = 'translateY(' + dy + 'px)'; ov.style.background = 'rgba(0,0,0,' + Math.max(0, 0.92 - dy / 500) + ')'; }
            }
        }, { passive: false });

        imgEl.addEventListener('touchend', function (e) {
            if (mode === 'swipe') {
                var dy = (e.changedTouches[0] ? e.changedTouches[0].clientY : sy) - sy;
                ov.style.transition = 'background 0.2s ease';
                ov.style.background = '';
                if (dy > 90) { close(); }
                else { imgEl.style.transition = 'transform 0.2s ease'; apply(); }
                setTimeout(function () { if (ov) ov.style.transition = ''; if (imgEl) imgEl.style.transition = ''; }, 220);
            }
            if (scale <= 1.02) reset();
            mode = '';
        });
    }

    function open(source) {
        const inline = source.localName === 'svg';
        const src = inline ? diagramUrl(source) : source.currentSrc || source.getAttribute('src');
        if (!src) return;
        opener = source;
        const alt = inline ? source.querySelector('title')?.textContent || source.getAttribute('aria-label') : source.alt;
        if (!ov) build();
        imgEl.src = src;
        imgEl.alt = alt || '';
        reset();
        document.body.classList.add('lightbox-open');
        ov.classList.add('open');
        ov.querySelector('button').focus({ preventScroll: true });
    }
    function close() {
        if (!ov) return;
        ov.classList.remove('open');
        ov.style.background = '';
        document.body.classList.remove('lightbox-open');
        opener?.focus({ preventScroll: true });
    }

    function diagramUrl(svg) {
        const copy = svg.cloneNode(true);
        copy.style.backgroundColor = getComputedStyle(svg).backgroundColor;
        const originals = [svg, ...svg.querySelectorAll('*')];
        const copies = [copy, ...copy.querySelectorAll('*')];
        originals.forEach((el, i) => {
            const style = getComputedStyle(el);
            for (const paint of ['fill', 'stroke', 'color']) {
                if (/^(rgb|#)/.test(style[paint])) copies[i].style[paint] = style[paint];
            }
        });
        copy.removeAttribute('tabindex');
        copy.removeAttribute('aria-haspopup');
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(copy));
    }

    window.AlmanionImageViewer = { open };
    document.addEventListener('keydown', function (e) {
        if (!ov?.classList.contains('open')) return;
        if (e.key === 'Escape') close();
        if (e.key === 'Tab') { e.preventDefault(); ov.querySelector('button').focus(); }
    });
})();
