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

    const sideNames = { yes: 'Да', no: 'Нет' };
    const pad = 10;

    // Use the original timestamps. Within a crowded pixel column keep both extrema and its endpoints.
    function stepPath(points, first, last, x, y, start, end, width) {
        let path = 'M' + x(start).toFixed(1) + ' ' + y(points[first].p).toFixed(1);
        function add(i) { path += 'H' + x(points[i].at).toFixed(1) + 'V' + y(points[i].p).toFixed(1); }
        if (last - first <= width * 2) {
            for (let i = first + 1; i <= last; i++) add(i);
        } else {
            for (let i = first + 1; i <= last;) {
                const begin = i, column = Math.floor(x(points[i].at));
                let min = i, max = i;
                do {
                    if (points[i].p < points[min].p) min = i;
                    if (points[i].p > points[max].p) max = i;
                    i++;
                } while (i <= last && Math.floor(x(points[i].at)) === column);
                const indices = [...new Set([begin, min, max, i - 1])].sort((a, b) => a - b);
                for (const index of indices) add(index);
            }
        }
        return path + 'H' + x(end).toFixed(1);
    }

    function tradeVolume(trades, start, end, width) {
        const count = end === start ? 1 : clamp(Math.floor(width / 12), 1, 120);
        const bins = Array(count).fill(0);
        const indexAt = at => clamp(Math.floor((at - start) / Math.max(1, end - start) * count), 0, count - 1);
        let low = 0, high = trades.length;
        while (low < high) {
            const mid = (low + high) >>> 1;
            if (trades[mid].at < start) low = mid + 1;
            else high = mid;
        }
        let total = 0;
        for (let i = low; i < trades.length && trades[i].at <= end; i++) {
            bins[indexAt(trades[i].at)] += trades[i].qty;
            total += trades[i].qty;
        }
        return { bins, total, indexAt };
    }

    window.createPhysicsForecastChart = function (clock) {
        const el = id => document.getElementById(id);
        const card = el('marketChart'), svg = el('probChart'), slider = el('chartCursor'), tip = el('chartTip');
        const dialog = el('chartDialog'), expand = el('chartExpand'), spacer = document.createElement('div');
        const periodButtons = [...card.querySelectorAll('[data-range]')], sides = [...card.querySelectorAll('[data-chart-side]')];
        const reduced = matchMedia('(prefers-reduced-motion: reduce)');
        const priceForSide = yes => side === 'yes' ? yes : 100 - yes;
        let market = null, online = false, lastSeen = 0, range = 'all', side = 'yes', frame = null, inView = true;
        let pinnedAt = null, hoverAt = null, pointer = null, previousPrice = null, previousTrades = 0, reveal = true;
        spacer.className = 'forecast-chart-space';
        spacer.setAttribute('aria-hidden', 'true');

        function motionLevel() {
            const mode = document.documentElement.dataset.pageMotion, classes = document.body.classList;
            if (!inView || document.hidden || reduced.matches || mode === 'off' || classes.contains('animations-off')) return 'off';
            return mode === 'medium' || classes.contains('animations-medium') ? 'medium' : 'full';
        }

        function cancelTransitions() {
            for (const id of ['chartSeries', 'chartChange', 'chartVolumes', 'probability']) {
                for (const animation of el(id).getAnimations?.() || []) animation.cancel();
            }
        }
        reduced.addEventListener('change', () => { if (reduced.matches) cancelTransitions(); });

        function selectRange(next) {
            cancelTransitions();
            range = next; pinnedAt = hoverAt = null; reveal = true;
            for (const button of periodButtons) button.setAttribute('aria-pressed', String(button.dataset.range === next));
        }

        function selectSide(next) {
            cancelTransitions();
            side = next; card.dataset.side = next; previousPrice = null; reveal = true;
            for (const button of sides) button.setAttribute('aria-pressed', String(button.dataset.chartSide === next));
        }

        function resizeButton(full) {
            const label = full ? 'Свернуть график' : 'Развернуть график';
            expand.setAttribute('aria-label', label); expand.title = label;
            expand.setAttribute('aria-expanded', String(full));
            el('chartDialogQuestion').hidden = !full;
        }
        function restore(focus) {
            if (!spacer.isConnected) return;
            spacer.replaceWith(card); resizeButton(false);
            if (focus) expand.focus({ preventScroll: true });
        }
        expand.hidden = typeof dialog.showModal !== 'function';
        expand.addEventListener('click', () => {
            if (dialog.open) { dialog.close(); restore(true); return; }
            if (!market) return;
            spacer.style.height = card.getBoundingClientRect().height + 'px';
            card.replaceWith(spacer); dialog.append(card);
            el('chartDialogQuestion').textContent = market.question;
            resizeButton(true);
            dialog.showModal();
            expand.focus({ preventScroll: true });
            draw(clock());
        });
        dialog.addEventListener('close', () => { if (!dialog.open) restore(true); });
        dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

        function reset() {
            if (dialog.open) dialog.close();
            restore(false);
            market = frame = pointer = previousPrice = null; previousTrades = lastSeen = 0; online = false;
            selectRange('all'); selectSide('yes'); tip.hidden = true;
            svg.dataset.live = 'false'; el('chartDialogQuestion').textContent = '';
        }

        function readPoint() {
            if (!frame) return;
            const { start, end, x, y, h, w, volume, live } = frame;
            const inspected = hoverAt ?? pinnedAt, at = clamp(inspected ?? end, start, end);
            const price = priceForSide(market.chart[pointAt(market.chart, at)].p);
            const position = inspected === null || start === end ? 100 : 100 * (at - start) / (end - start);
            const sameDay = window.PhysicsForecast.dayKey(at) === window.PhysicsForecast.dayKey(end);
            const timeText = (sameDay ? seconds : dated).format(at);
            const qty = volume.bins[volume.indexAt(at)];
            slider.value = String(position);
            slider.style.setProperty('--cursor-position', position + '%');
            slider.setAttribute('aria-valuetext', timeText + ' по Москве, «' + sideNames[side] + '» ' + percent(price) + ', объём за интервал ' + fmt.format(qty));
            el('chartReadout').textContent = timeText + ' мск' + (inspected === null ? '' : ' · ' + percent(price));
            el('chartState').textContent = inspected !== null ? 'История' : live ? 'Сейчас' : !online ? 'Нет связи' : 'Последняя цена';
            el('chartState').dataset.state = inspected === null && live ? 'live' : 'idle';
            el('chartReturn').hidden = pinnedAt === null;
            el('chartReturn').textContent = live ? 'К текущей цене' : 'К последней цене';
            el('chartInspection').setAttribute('visibility', inspected === null ? 'hidden' : 'visible');
            tip.hidden = inspected === null;
            if (inspected === null) return;
            const px = x(at), py = y(price);
            el('chartHair').setAttribute('d', 'M' + px + ' 3V' + (h - 2));
            el('chartDot').setAttribute('cx', px); el('chartDot').setAttribute('cy', py);
            tip.children[0].textContent = sideNames[side] + ' · ' + percent(price);
            tip.children[1].textContent = timeText;
            tip.children[2].textContent = 'Объём за интервал · ' + fmt.format(qty);
            const tw = tip.offsetWidth, th = tip.offsetHeight;
            tip.style.left = clamp(px + tw + 10 < w ? px + 9 : px - tw - 9, 2, w - tw - 2) + 'px';
            tip.style.top = clamp(py > h / 2 ? py - th - 8 : py + 8, 2, h - th - 2) + 'px';
        }

        function draw(at) {
            if (!market || !svg.clientWidth || !svg.clientHeight) return;
            const points = market.chart;
            const latest = Math.max(market.openedAt, Math.min(online ? Math.max(at, points.at(-1).at) : lastSeen, market.closedAt ?? market.endAt));
            const span = range === 'hour' ? 3600000 : range === 'day' ? 86400000 : Infinity;
            const end = pinnedAt === null ? latest : Math.min(latest, pinnedAt + span);
            const start = Math.max(market.openedAt, end - span);
            const first = pointAt(points, start), last = pointAt(points, end);
            const lastPrice = priceForSide(points[last].p), current = priceForSide(points[pointAt(points, latest)].p);
            let low = priceForSide(points[first].p), high = low;
            for (let i = first + 1; i <= last; i++) {
                const p = priceForSide(points[i].p);
                low = Math.min(low, p); high = Math.max(high, p);
            }
            const { bottom, top, step } = scaleFor(low, high);
            const w = svg.clientWidth, h = svg.clientHeight, right = w - pad, plotWidth = right - pad;
            const band = clamp(h * .12, 16, 32), floor = h - band - 12;
            const x = t => end === start ? right : pad + plotWidth * (t - start) / (end - start);
            const y = p => pad + (top - p) / (top - bottom) * (floor - pad);
            const volume = tradeVolume(market.trades, start, end, plotWidth);
            const live = online && market.phase === 'open' && at < market.endAt;
            frame = { start, end, x, y, h, w, volume, live };
            svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
            el('chartGradient').setAttribute('y2', floor);
            let grid = '';
            const ticks = el('chartScale').children;
            for (let i = 0; i < ticks.length; i++) {
                const value = top - i * step, py = y(value);
                ticks[i].textContent = percent(value);
                ticks[i].style.top = py + 'px';
                ticks[i].style.visibility = Math.abs(py - y(lastPrice)) < 16 ? 'hidden' : '';
                grid += 'M' + pad + ' ' + py + 'H' + right;
            }
            for (const fraction of [.25, .5, .75]) grid += 'M' + (pad + plotWidth * fraction) + ' ' + pad + 'V' + floor;
            el('chartGrid').setAttribute('d', grid);
            const path = stepPath(points, first, last, x, p => y(priceForSide(p)), start, end, plotWidth);
            el('chartLine').setAttribute('d', path);
            el('chartArea').setAttribute('d', path + 'V' + floor + 'H' + x(start) + 'Z');
            el('chartGuide').setAttribute('d', 'M' + pad + ' ' + y(lastPrice) + 'H' + right);
            el('chartMarker').setAttribute('transform', 'translate(' + right + ' ' + y(lastPrice) + ')');
            const maxBin = Math.max(1, ...volume.bins), binWidth = plotWidth / volume.bins.length;
            let bars = '';
            volume.bins.forEach((qty, i) => {
                if (!qty) return;
                const height = Math.max(1, band * qty / maxBin);
                bars += 'M' + (pad + i * binWidth + 1) + ' ' + (h - 2) + 'v-' + height + 'h' + Math.max(1, binWidth - 2) + 'v' + height + 'Z';
            });
            el('chartVolumes').setAttribute('d', bars);
            svg.dataset.live = String(live && end === latest);
            svg.setAttribute('aria-label', market.question + ' Вероятность «' + sideNames[side] + '» в конце графика ' + percent(lastPrice) + '. Шкала от ' + percent(bottom) + ' до ' + percent(top) + '.');
            el('chartPriceTag').textContent = percent(lastPrice); el('chartPriceTag').style.top = y(lastPrice) + 'px';
            el('probability').textContent = percent(current);
            el('chartLow').textContent = percent(low); el('chartHigh').textContent = percent(high);
            el('chartVolume').textContent = fmt.format(volume.total);
            const delta = lastPrice - priceForSide(points[first].p);
            el('chartDelta').hidden = !delta;
            el('chartDelta').dataset.direction = delta > 0 ? 'up' : 'down';
            el('chartDelta').textContent = (delta > 0 ? '+' : '−') + fmt.format(Math.abs(delta)) + ' п. п.';
            const axis = end - start < 120000 ? seconds : window.PhysicsForecast.dayKey(start) === window.PhysicsForecast.dayKey(end) ? minutes : dated;
            const leftLabel = axis.format(start), rightLabel = axis.format(end), middle = axis.format((start + end) / 2);
            el('chartStart').textContent = leftLabel; el('chartEnd').textContent = rightLabel;
            el('chartMiddle').textContent = middle === leftLabel || middle === rightLabel ? '' : middle;
            readPoint();
            const motion = motionLevel();
            if (motion !== 'off') {
                if (reveal) {
                    const frames = motion === 'full'
                        ? [{ opacity: .2, clipPath: 'inset(0 95% 0 0)' }, { opacity: 1, clipPath: 'inset(0)' }]
                        : [{ opacity: .65 }, { opacity: 1 }];
                    el('chartSeries').animate?.(frames, { duration: motion === 'full' ? 380 : 160, easing: 'ease-out' });
                } else if (live && latest === end) {
                    if (previousPrice !== null && current !== previousPrice) {
                        const frames = [{ opacity: .62 }, { opacity: 1 }];
                        if (motion === 'full') {
                            frames[0].transform = current > previousPrice ? 'translateY(4px)' : 'translateY(-4px)';
                            frames[1].transform = 'translateY(0)';
                        }
                        el('probability').animate?.(frames, { duration: 220, easing: 'ease-out' });
                        if (motion === 'full' && last > first) {
                            const change = el('chartChange');
                            change.setAttribute('d', 'M' + x(points[last].at) + ' ' + y(priceForSide(points[last - 1].p)) + 'V' + y(current) + 'H' + right);
                            change.animate?.([{ opacity: .75 }, { opacity: 0 }], { duration: 550, easing: 'ease-out' });
                        }
                    }
                    if (motion === 'full' && market.trades.length > previousTrades) {
                        el('chartVolumes').animate?.([{ opacity: 1 }, { opacity: .5 }], { duration: 320 });
                    }
                }
            }
            previousPrice = current; previousTrades = market.trades.length; reveal = false;
        }

        function update(next, connected) {
            if (market?.id !== next.id) reset();
            const at = clock();
            if (connected || online) lastSeen = Math.max(at, next.chart.at(-1).at);
            else if (!lastSeen) lastSeen = next.chart.at(-1).at;
            market = next; online = connected; draw(at);
        }
        function tick(at) { if (frame?.live && inView) draw(at); }
        function fromPointer(event) {
            const rect = svg.getBoundingClientRect();
            const ratio = clamp((event.clientX - rect.left - pad) / Math.max(1, rect.width - 2 * pad), 0, 1);
            return frame.start + ratio * (frame.end - frame.start);
        }
        for (const button of periodButtons) button.addEventListener('click', () => {
            if (button.dataset.range !== range) { selectRange(button.dataset.range); draw(clock()); }
        });
        for (const button of sides) button.addEventListener('click', () => {
            if (button.dataset.chartSide !== side) { selectSide(button.dataset.chartSide); draw(clock()); }
        });
        slider.addEventListener('input', () => {
            if (!frame) return;
            const ratio = slider.valueAsNumber / 100;
            hoverAt = null; pinnedAt = ratio >= 1 ? null : frame.start + ratio * (frame.end - frame.start);
            if (pinnedAt === null) draw(clock()); else readPoint();
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
        new IntersectionObserver(([entry]) => {
            inView = entry.isIntersecting; svg.dataset.visible = String(inView);
            if (inView) draw(clock());
        }).observe(card);
        return { update, tick, reset };
    };
}());
