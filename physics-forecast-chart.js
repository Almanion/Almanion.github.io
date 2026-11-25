(function () {
    'use strict';

    const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
    const time = options => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', ...options });
    const minutes = time({}), seconds = time({ second: '2-digit' }), dated = time({ day: '2-digit', month: '2-digit' });
    const percent = value => fmt.format(value) + '%';
    const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

    // Prices are steps. At a timestamp shared by several events the last event wins.
    function pointAt(points, at) {
        let low = 0, high = points.length - 1;
        while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            if (points[mid].at <= at) low = mid;
            else high = mid - 1;
        }
        return low;
    }

    function scaleFor(low, high) {
        const step = [5, 10, 20, 25].find(unit => unit * 4 >= high - low + 6) || 25;
        const span = step * 4;
        const center = Math.round(((low + high - span) / 2) / step) * step;
        const bottom = clamp(center, Math.max(0, high - span), Math.min(low, 100 - span));
        return { bottom, top: bottom + span, step };
    }

    window.createPhysicsForecastChart = function (clock) {
        const el = id => document.getElementById(id);
        const svg = el('probChart'), slider = el('chartCursor'), tip = el('chartTip');
        const periodButtons = document.querySelectorAll('[data-range]');
        let market = null, online = false, lastSeen = 0, range = 'all', frame = null, inView = true;
        let pinnedAt = null, hoverAt = null, previousPrice = null, pointer = null;

        function selectRange(next) {
            range = next; pinnedAt = hoverAt = null;
            for (const button of periodButtons) button.setAttribute('aria-pressed', String(button.dataset.range === next));
        }

        function reset() {
            market = frame = pointer = previousPrice = null; lastSeen = 0; online = false;
            selectRange('all'); tip.hidden = true;
        }

        function readPoint() {
            if (!frame) return;
            const { start, end, x, y, h, w, live } = frame;
            const inspected = hoverAt ?? pinnedAt;
            const at = clamp(inspected ?? end, start, end);
            const price = market.chart[pointAt(market.chart, at)].p;
            const position = inspected === null || start === end ? 100 : 100 * (at - start) / (end - start);
            const timeText = (end - at >= 86400000 || window.PhysicsForecast.dayKey(at) !== window.PhysicsForecast.dayKey(end) ? dated : seconds).format(at);
            slider.value = String(position);
            slider.style.setProperty('--cursor-position', position + '%');
            slider.setAttribute('aria-valuetext', timeText + ' по Москве, ' + percent(price));
            el('chartReadout').textContent = timeText + ' мск' + (inspected === null ? '' : ' · ' + percent(price));
            el('chartState').textContent = inspected !== null ? 'История' : live ? 'Сейчас' : !online ? 'Нет связи' : 'Последняя цена';
            el('chartState').dataset.state = inspected === null && live ? 'live' : 'idle';
            el('chartReturn').hidden = pinnedAt === null;
            el('chartReturn').textContent = live ? 'К текущей цене' : 'К последней цене';
            el('chartInspection').setAttribute('visibility', inspected === null ? 'hidden' : 'visible');
            tip.hidden = inspected === null;
            if (inspected === null) return;
            const px = x(at), py = y(price);
            el('chartHair').setAttribute('d', 'M' + px + ' 7V' + (h - 7));
            el('chartDot').setAttribute('cx', px); el('chartDot').setAttribute('cy', py);
            tip.firstElementChild.textContent = percent(price); tip.lastElementChild.textContent = timeText;
            tip.dataset.left = String(px > w / 2); tip.dataset.above = String(py > h / 2);
            tip.style.left = px + 'px'; tip.style.top = py + 'px';
        }

        function draw(at) {
            if (!market || !svg.clientWidth || !svg.clientHeight) return;
            const latest = Math.max(market.openedAt, Math.min(online ? Math.max(at, market.chart.at(-1).at) : lastSeen, market.closedAt ?? market.endAt));
            const span = range === 'hour' ? 3600000 : range === 'day' ? 86400000 : Infinity;
            // Keep an inspected timestamp in view even as the live window moves past it.
            const end = pinnedAt === null ? latest : Math.min(latest, pinnedAt + span);
            const start = Math.max(market.openedAt, end - span);
            const points = market.chart, first = pointAt(points, start), last = pointAt(points, end);
            const lastPrice = points[last].p, current = points[pointAt(points, latest)].p;
            let low = points[first].p, high = low;
            for (let i = first + 1; i <= last; i++) {
                low = Math.min(low, points[i].p); high = Math.max(high, points[i].p);
            }
            const { bottom, top, step } = scaleFor(low, high);
            const w = svg.clientWidth, h = svg.clientHeight, pad = 10, right = w - pad;
            const x = t => end === start ? right : pad + (right - pad) * (t - start) / (end - start);
            const y = p => pad + (top - p) / (top - bottom) * (h - 2 * pad);
            const live = online && market.phase === 'open' && at < market.endAt;
            frame = { start, end, x, y, h, w, live };
            svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
            el('chartGradient').setAttribute('y2', h);
            let grid = '', path = 'M' + x(start).toFixed(1) + ' ' + y(points[first].p).toFixed(1);
            const ticks = el('chartScale').children;
            for (let i = 0; i < ticks.length; i++) {
                const value = top - i * step;
                ticks[i].textContent = percent(value);
                grid += 'M' + pad + ' ' + y(value).toFixed(1) + 'H' + right;
            }
            for (let i = first + 1; i <= last; i++) {
                path += 'H' + x(points[i].at).toFixed(1) + 'V' + y(points[i].p).toFixed(1);
            }
            path += 'H' + right;
            el('chartGrid').setAttribute('d', grid);
            el('chartLine').setAttribute('d', path);
            el('chartArea').setAttribute('d', path + 'V' + (h - pad) + 'H' + x(start).toFixed(1) + 'Z');
            el('chartMarker').setAttribute('transform', 'translate(' + right + ' ' + y(lastPrice).toFixed(1) + ')');
            svg.dataset.live = String(live && end === latest);
            svg.setAttribute('aria-label', 'Вероятность работы в конце графика ' + percent(lastPrice) + '. Шкала от ' + percent(bottom) + ' до ' + percent(top) + '.');
            el('probability').textContent = percent(current);
            el('complement').textContent = 'Не будет · ' + percent(100 - current);
            const delta = lastPrice - points[first].p;
            el('chartDelta').hidden = !delta;
            el('chartDelta').dataset.direction = delta > 0 ? 'up' : 'down';
            el('chartDelta').textContent = (delta > 0 ? '+' : '−') + fmt.format(Math.abs(delta)) + ' п. п.';
            const axis = end - start < 120000 ? seconds : window.PhysicsForecast.dayKey(start) === window.PhysicsForecast.dayKey(end) ? minutes : dated;
            el('chartStart').textContent = axis.format(start); el('chartEnd').textContent = axis.format(end);
            const middle = axis.format((start + end) / 2);
            el('chartMiddle').textContent = middle === axis.format(start) || middle === axis.format(end) ? '' : middle;
            readPoint();
            if (previousPrice !== null && current !== previousPrice && live && end === latest && inView && !document.hidden &&
                !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.body.matches('.animations-off, .animations-medium') &&
                document.documentElement.dataset.pageMotion !== 'off') {
                el('chartMarker').lastElementChild.animate?.([
                    { transform: 'translateY(' + (y(previousPrice) - y(current)) + 'px)' }, { transform: 'translateY(0)' }
                ], { duration: 320, easing: 'ease-out' });
                if (last > first) {
                    const change = el('chartChange');
                    change.setAttribute('d', 'M' + x(points[last].at) + ' ' + y(points[last - 1].p) + 'V' + y(current) + 'H' + right);
                    change.animate?.([{ opacity: .75 }, { opacity: 0 }], { duration: 650, easing: 'ease-out' });
                }
            }
            previousPrice = current;
        }

        function update(next, connected) {
            const at = clock();
            if (market?.day !== next.day) reset();
            if (connected || online) lastSeen = Math.max(at, next.chart.at(-1).at);
            else if (!lastSeen) lastSeen = next.chart.at(-1).at;
            market = next; online = connected; draw(at);
        }
        function tick(at) {
            if (frame?.live && inView) draw(at);
        }
        function fromPointer(event) {
            const rect = svg.getBoundingClientRect();
            const ratio = clamp((event.clientX - rect.left - 10) / Math.max(1, rect.width - 20), 0, 1);
            return frame.start + ratio * (frame.end - frame.start);
        }
        for (const button of periodButtons) button.addEventListener('click', () => { selectRange(button.dataset.range); draw(clock()); });
        slider.addEventListener('input', () => {
            if (!frame) return;
            const ratio = slider.valueAsNumber / 100;
            hoverAt = null; pinnedAt = ratio >= 1 ? null : frame.start + ratio * (frame.end - frame.start);
            if (pinnedAt === null) draw(clock());
            else readPoint();
        });
        el('chartReturn').addEventListener('click', () => { pinnedAt = hoverAt = null; draw(clock()); slider.focus({ preventScroll: true }); });
        svg.addEventListener('pointerdown', e => { if (frame && e.isPrimary && e.button === 0) pointer = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
        svg.addEventListener('pointermove', e => {
            if (!frame || !e.isPrimary || (!pointer && e.pointerType !== 'mouse')) return;
            if (pointer && e.pointerType !== 'mouse' && Math.abs(e.clientY - pointer.y) > Math.abs(e.clientX - pointer.x) + 5) {
                pointer = hoverAt = null; readPoint(); return;
            }
            hoverAt = fromPointer(e); readPoint();
        });
        svg.addEventListener('pointerup', e => {
            if (!frame || pointer?.id !== e.pointerId) return;
            pinnedAt = fromPointer(e); pointer = hoverAt = null; readPoint();
        });
        function leave() { pointer = hoverAt = null; readPoint(); }
        svg.addEventListener('pointercancel', leave); svg.addEventListener('pointerleave', leave);
        new ResizeObserver(() => draw(clock())).observe(svg);
        new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; if (inView) draw(clock()); }).observe(el('marketChart'));
        return { update, tick, reset };
    };
}());
