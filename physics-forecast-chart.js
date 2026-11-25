(function () {
    'use strict';

    const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
    const time = options => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', ...options });
    const minutes = time({}), seconds = time({ second: '2-digit' }), dated = time({ day: '2-digit', month: '2-digit' });
    const calendarDate = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit' });
    const hour = 3600000, day = 24 * hour;
    const rangeSpans = { quarter: hour / 4, hour, day, all: Infinity };
    const tickIntervals = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 604800].map(s => s * 1000);
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

    // Move across distinct timestamps, including the visible window's two boundaries.
    function adjacentTime(points, start, end, at, forward) {
        if (forward ? at >= end : at <= start) return null;
        let low = 0, high = points.length;
        while (low < high) {
            const mid = (low + high) >>> 1;
            if (forward ? points[mid].at <= at : points[mid].at < at) low = mid + 1;
            else high = mid;
        }
        return forward ? Math.min(points[low]?.at ?? end, end) : Math.max(points[low - 1]?.at ?? start, start);
    }

    function timeTicks(start, end, width, fontSize) {
        const duration = end - start;
        const crossDay = window.PhysicsForecast.dayKey(start) !== window.PhysicsForecast.dayKey(end);
        const format = duration >= 2 * day ? calendarDate : duration < 120000 ? seconds : minutes;
        const edgeLabel = at => crossDay && format !== calendarDate ? calendarDate.format(at) + ' ' + format.format(at) : format.format(at);
        const left = edgeLabel(start), right = edgeLabel(end);
        const last = { fraction: 1, label: right, align: 'end' };
        if (left === right) return [last];

        // The axis uses the same monospaced face at every tick. Reserve space for the edge labels first.
        const measure = label => label.length * fontSize * .64;
        const gap = fontSize * 1.1;
        const ticks = [{ fraction: 0, label: left, align: 'start' }];
        const rightLimit = width - measure(right) - gap;
        if (measure(left) > rightLimit) return [last];
        const desired = duration * (measure(format.format(start)) + gap * 2.5) / width;
        const interval = tickIntervals.find(step => step >= desired && (format !== calendarDate || step >= day)) || Math.ceil(desired / day) * day;
        const midnight = Date.parse(window.PhysicsForecast.dayKey(start) + 'T00:00:00+03:00');
        let nextFree = measure(left) + gap;
        for (let at = midnight + (Math.floor((start - midnight) / interval) + 1) * interval; at < end; at += interval) {
            const fraction = (at - start) / duration;
            const label = format.format(at), half = measure(label) / 2, x = width * fraction;
            if (x - half < nextFree || x + half > rightLimit || label === ticks.at(-1).label || label === right) continue;
            ticks.push({ fraction, label, align: 'middle' });
            nextFree = x + half + gap;
        }
        ticks.push(last);
        return ticks;
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
        const card = el('marketChart'), statistics = card.hasAttribute('data-statistics');
        card.innerHTML = `
            <p id="chartDialogQuestion" hidden></p>
            <div class="forecast-section-head forecast-chart-head">
                <div class="forecast-chart-heading"><h2 id="chartTitle">Вероятность</h2>
                    <div class="forecast-chart-sides" role="group" aria-label="Исход на графике">
                        <button type="button" data-chart-side="yes" aria-pressed="true">Да</button>
                        <button type="button" data-chart-side="no" aria-pressed="false">Нет</button>
                    </div>
                </div>
                <button type="button" id="chartExpand" aria-label="Развернуть график" title="Развернуть график" aria-haspopup="dialog" aria-expanded="false" aria-controls="chartDialog">
                    <svg viewBox="0 0 20 20" aria-hidden="true"><path class="expand-icon" d="M4 8V4h4m4 0h4v4m0 4v4h-4m-4 0H4v-4"/><path class="collapse-icon" d="M3 7h4V3m6 0v4h4m0 6h-4v4m-6 0v-4H3"/></svg>
                </button>
            </div>
            <div class="forecast-chart-controls">
                <div class="forecast-reading"><strong id="probability">—</strong>${statistics ? '<span id="chartDelta" title="Изменение за выбранный период" hidden></span>' : ''}</div>
                <div class="forecast-ranges" role="group" aria-label="Период графика">
                    <button type="button" data-range="quarter" aria-label="15 минут" aria-pressed="false">15 мин</button>
                    <button type="button" data-range="hour" aria-label="1 час" aria-pressed="false">1 ч</button>
                    <button type="button" data-range="day" aria-pressed="false">День</button>
                    <button type="button" data-range="all" aria-pressed="true">Всё</button>
                </div>
            </div>
            <div class="forecast-chart-stage">
                <div class="forecast-plot">
                    <div class="forecast-canvas">
                        <svg id="probChart" viewBox="0 0 560 220" role="img" aria-label="История вероятности" preserveAspectRatio="none">
                            <defs><linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1" gradientUnits="userSpaceOnUse"><stop stop-color="currentColor" stop-opacity=".24"/><stop offset="1" stop-color="currentColor" stop-opacity=".02"/></linearGradient></defs>
                            <path class="chart-grid" id="chartGrid"/><path class="chart-grid" id="chartTimeGrid"/>
                            <path id="chartGuide"/>
                            <g id="chartSeries"><path id="chartArea" fill="url(#chartGradient)"/><path id="chartLine"/>${statistics ? '<path id="chartVolumes"/>' : ''}</g>
                            <path id="chartChange" fill="none" stroke="currentColor" opacity="0" stroke-width="4"/>
                            <g id="chartMarker"><circle class="chart-halo" r="7"/><circle class="chart-dot" r="3.6"/></g>
                            <g id="chartInspection" visibility="hidden"><path id="chartHair"/>${statistics ? '<path id="chartActiveVolume"/>' : ''}<circle id="chartDot" class="chart-dot" r="4"/></g>
                        </svg>
                    </div>
                    <div class="forecast-scale-column" aria-hidden="true"><div id="chartScale" class="forecast-scale"><span></span><span></span><span></span><span></span><span></span></div><b id="chartPriceTag"></b>${statistics ? '<small>доли</small>' : ''}</div>
                </div>
                <div class="forecast-axis" id="chartAxis" aria-hidden="true"></div>
                <div class="forecast-scrubber">
                    <button type="button" class="forecast-chart-step" id="chartPrev" aria-label="Предыдущая точка графика" title="Предыдущая точка графика" hidden>
                        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 5l-5 5 5 5"/></svg>
                    </button>
                    <input id="chartCursor" type="range" min="0" max="100" value="100" step=".1" aria-label="Посмотреть вероятность на графике по времени">
                    <button type="button" class="forecast-chart-step" id="chartNext" aria-label="Следующая точка графика" title="Следующая точка графика" hidden>
                        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 5 5 5-5 5"/></svg>
                    </button>
                </div>
                <div class="forecast-chart-readout" id="chartStrip">
                    <div class="forecast-chart-clock"><span class="forecast-live" id="chartState"></span><output id="chartReadout" for="chartCursor" aria-live="off"></output></div>
                    <div id="chartTip" class="forecast-tooltip" aria-hidden="true" hidden><b></b><span></span>${statistics ? '<small></small>' : ''}</div>
                    <button type="button" id="chartReturn" aria-label="К текущей цене" hidden>
                        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h12m-5-5 5 5-5 5m6-10v10"/></svg><span class="chart-return-full">К текущей цене</span><span class="chart-return-short" aria-hidden="true">Сейчас</span>
                    </button>
                </div>
            </div>
            <span class="forecast-sr" id="chartAnnouncement" role="status" aria-live="polite" aria-atomic="true"></span>
            ${statistics ? `
                <dl class="forecast-chart-stats" aria-label="За выбранный период">
                    <div><dt>Минимум</dt><dd id="chartLow">—</dd></div><div><dt>Максимум</dt><dd id="chartHigh">—</dd></div><div><dt>Объём, доли</dt><dd id="chartVolume">—</dd></div>
                </dl>` : ''}`;
        const svg = el('probChart'), slider = el('chartCursor'), tip = el('chartTip');
        const dialog = el('chartDialog'), expand = el('chartExpand'), spacer = document.createElement('div');
        const periodButtons = [...card.querySelectorAll('[data-range]')], sides = [...card.querySelectorAll('[data-chart-side]')];
        const returnButton = el('chartReturn'), strip = el('chartStrip');
        const axis = el('chartAxis'), previousPoint = el('chartPrev'), nextPoint = el('chartNext');
        const compact = matchMedia('(max-width: 759px), (orientation: landscape) and (max-width: 1024px) and (max-height: 540px)');
        const reduced = matchMedia('(prefers-reduced-motion: reduce)');
        const priceForSide = yes => side === 'yes' ? yes : 100 - yes;
        let market = null, online = false, lastSeen = 0, range = 'all', side = 'yes', frame = null, inView = true;
        let pinnedAt = null, hoverAt = null, pointer = null, previousPrice = null, previousTrades = 0, reveal = true;
        let scheduledReading = 0;
        spacer.className = 'forecast-chart-space';
        spacer.setAttribute('aria-hidden', 'true');

        function motionLevel() {
            const mode = document.documentElement.dataset.pageMotion, classes = document.body.classList;
            if (!inView || document.hidden || reduced.matches || mode === 'off' || classes.contains('animations-off')) return 'off';
            return mode === 'medium' || classes.contains('animations-medium') ? 'medium' : 'full';
        }

        function cancelTransitions() {
            for (const id of ['chartSeries', 'chartChange', 'chartVolumes', 'probability']) {
                for (const animation of el(id)?.getAnimations?.() || []) animation.cancel();
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
            if (!focus) return;
            expand.focus({ preventScroll: true });
            // WebKit can finish releasing the modal's focus scope after the element has moved.
            requestAnimationFrame(() => {
                if (!dialog.open && !card.closest('[hidden]') && document.activeElement === document.body) {
                    expand.focus({ preventScroll: true });
                }
            });
        }
        function closeExpanded(focus) {
            if (dialog.open) dialog.close();
            restore(focus);
        }
        expand.hidden = typeof dialog.showModal !== 'function';
        expand.addEventListener('click', () => {
            if (dialog.open) { closeExpanded(true); return; }
            if (!market) return;
            spacer.style.height = card.getBoundingClientRect().height + 'px';
            card.replaceWith(spacer); dialog.append(card);
            el('chartDialogQuestion').textContent = market.question;
            resizeButton(true);
            dialog.showModal();
            expand.focus({ preventScroll: true });
            draw(clock());
        });
        dialog.addEventListener('cancel', event => { event.preventDefault(); closeExpanded(true); });
        dialog.addEventListener('close', () => { if (!dialog.open) restore(true); });
        dialog.addEventListener('click', e => { if (e.target === dialog) closeExpanded(true); });

        function reset() {
            closeExpanded(false);
            market = frame = pointer = previousPrice = null; previousTrades = lastSeen = 0; online = false;
            selectRange('all'); selectSide('yes'); tip.hidden = true;
            svg.dataset.live = 'false'; el('chartDialogQuestion').textContent = '';
            el('chartAnnouncement').textContent = '';
            svg.setAttribute('aria-label', 'История вероятности');
            for (const id of ['chartReadout', 'chartPriceTag', 'probability', 'chartState', 'chartDelta', 'chartLow', 'chartHigh', 'chartVolume']) {
                const label = el(id);
                if (label) label.textContent = '';
            }
            for (const path of svg.querySelectorAll('path')) path.removeAttribute('d');
            for (const label of [...tip.children, ...el('chartScale').children]) label.textContent = '';
            axis.replaceChildren();
            slider.removeAttribute('aria-valuetext');
        }

        function readPoint() {
            if (!frame) return;
            const { start, end, x, y, h, w, volume, barPaths, live } = frame;
            const inspected = hoverAt ?? pinnedAt, at = clamp(inspected ?? end, start, end);
            const price = priceForSide(market.chart[pointAt(market.chart, at)].p);
            const position = inspected === null || start === end ? 100 : 100 * (at - start) / (end - start);
            const sameDay = window.PhysicsForecast.dayKey(at) === window.PhysicsForecast.dayKey(end);
            const timeText = (sameDay ? seconds : dated).format(at);
            const qty = volume ? volume.bins[volume.indexAt(at)] : 0;
            slider.value = String(position);
            slider.style.setProperty('--cursor-position', position + '%');
            slider.setAttribute('aria-valuetext', timeText + ' по Москве, «' + sideNames[side] + '» ' + percent(price) + (statistics ? ', объём за интервал ' + fmt.format(qty) : ''));
            el('chartReadout').textContent = timeText + ' мск' + (inspected === null ? '' : ' · ' + percent(price));
            el('chartState').textContent = inspected !== null ? 'История' : live ? 'Сейчас' : !online ? 'Нет связи' : 'Последняя цена';
            el('chartState').dataset.state = inspected === null && live ? 'live' : 'idle';
            returnButton.hidden = pinnedAt === null;
            previousPoint.disabled = at <= start;
            nextPoint.disabled = at >= end;
            strip.toggleAttribute('data-inspecting', inspected !== null);
            el('chartInspection').setAttribute('visibility', inspected === null ? 'hidden' : 'visible');
            tip.hidden = inspected === null;
            if (inspected === null) return;
            const px = x(at), py = y(price);
            el('chartHair').setAttribute('d', 'M' + px + ' 3V' + (h - 2));
            el('chartDot').setAttribute('cx', px); el('chartDot').setAttribute('cy', py);
            tip.children[0].textContent = sideNames[side] + ' · ' + percent(price);
            tip.children[1].textContent = timeText + ' мск';
            if (statistics) {
                el('chartActiveVolume').setAttribute('d', barPaths[volume.indexAt(at)]);
                tip.children[2].textContent = 'Объём за интервал · ' + fmt.format(qty);
            }
            if (compact.matches) return;
            const tw = tip.offsetWidth, th = tip.offsetHeight;
            tip.style.left = clamp(px + tw + 10 < w ? px + 9 : px - tw - 9, 2, w - tw - 2) + 'px';
            tip.style.top = clamp(py > h / 2 ? py - th - 8 : py + 8, 2, h - th - 2) + 'px';
        }

        function draw(at) {
            if (!market || !svg.clientWidth || !svg.clientHeight) return;
            const points = market.chart;
            const latest = Math.max(market.openedAt, Math.min(online ? Math.max(at, points.at(-1).at) : lastSeen, market.closedAt ?? market.endAt));
            const span = rangeSpans[range];
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
            const band = statistics ? clamp(h * .12, 16, 32) : 0, floor = h - band - 12;
            const x = t => end === start ? right : pad + plotWidth * (t - start) / (end - start);
            const y = p => pad + (top - p) / (top - bottom) * (floor - pad);
            const volume = statistics ? tradeVolume(market.trades, start, end, plotWidth) : null;
            const live = online && market.phase === 'open' && at < market.endAt;
            const barPaths = [];
            frame = { start, end, x, y, h, w, volume, live, barPaths };
            previousPoint.hidden = nextPoint.hidden = last === first;
            const returnLabel = live ? 'К текущей цене' : 'К последней цене';
            if (returnButton.getAttribute('aria-label') !== returnLabel || !returnButton.title) {
                returnButton.querySelector('.chart-return-full').textContent = returnLabel;
                returnButton.querySelector('.chart-return-short').textContent = live ? 'Сейчас' : 'В конец';
                returnButton.setAttribute('aria-label', returnLabel);
                returnButton.title = returnLabel;
            }
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
            el('chartGrid').setAttribute('d', grid);
            const timeMarks = timeTicks(start, end, plotWidth, parseFloat(getComputedStyle(axis).fontSize));
            let timeGrid = '';
            while (axis.children.length > timeMarks.length) axis.lastElementChild.remove();
            timeMarks.forEach(({ fraction, label, align }, index) => {
                const tick = axis.children[index] || axis.appendChild(document.createElement('span'));
                tick.textContent = label; tick.dataset.align = align;
                tick.style.left = (fraction * 100) + '%';
                if (align === 'middle') timeGrid += 'M' + (pad + plotWidth * fraction) + ' ' + pad + 'V' + floor;
            });
            el('chartTimeGrid').setAttribute('d', timeGrid);
            const path = stepPath(points, first, last, x, p => y(priceForSide(p)), start, end, plotWidth);
            el('chartLine').setAttribute('d', path);
            el('chartArea').setAttribute('d', path + 'V' + floor + 'H' + x(start) + 'Z');
            el('chartGuide').setAttribute('d', 'M' + pad + ' ' + y(lastPrice) + 'H' + right);
            el('chartMarker').setAttribute('transform', 'translate(' + right + ' ' + y(lastPrice) + ')');
            if (statistics) {
                const maxBin = Math.max(1, ...volume.bins), binWidth = plotWidth / volume.bins.length;
                volume.bins.forEach((qty, i) => {
                    const height = Math.max(1, band * qty / maxBin);
                    const left = pad + i * binWidth + 1;
                    barPaths.push(qty ? 'M' + left + ' ' + (h - 2) + 'v-' + height + 'h' + Math.max(1, binWidth - 2) + 'v' + height + 'Z' : '');
                });
                el('chartVolumes').setAttribute('d', barPaths.join(''));
            }
            svg.dataset.live = String(live && end === latest);
            svg.setAttribute('aria-label', market.question + ' Вероятность «' + sideNames[side] + '» в конце графика ' + percent(lastPrice) + '. Шкала от ' + percent(bottom) + ' до ' + percent(top) + '.');
            el('chartPriceTag').textContent = percent(lastPrice); el('chartPriceTag').style.top = y(lastPrice) + 'px';
            el('probability').textContent = percent(current);
            if (statistics) {
                el('chartLow').textContent = percent(low); el('chartHigh').textContent = percent(high);
                el('chartVolume').textContent = fmt.format(volume.total);
                const delta = lastPrice - priceForSide(points[first].p);
                el('chartDelta').hidden = !delta;
                el('chartDelta').dataset.direction = delta > 0 ? 'up' : 'down';
                el('chartDelta').textContent = (delta > 0 ? '+' : '−') + fmt.format(Math.abs(delta)) + ' п. п.';
            }
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
                    if (statistics && motion === 'full' && market.trades.length > previousTrades) {
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
        function pin(at, announce = true) {
            hoverAt = null; pinnedAt = at;
            if (at === null) draw(clock()); else readPoint();
            if (announce) el('chartAnnouncement').textContent = el('chartState').textContent + '. ' + slider.getAttribute('aria-valuetext');
        }
        function step(forward) {
            if (!frame) return;
            const at = adjacentTime(market.chart, frame.start, frame.end, pinnedAt ?? frame.end, forward);
            if (at !== null) pin(forward && at === frame.end ? null : at);
        }
        previousPoint.addEventListener('click', () => step(false));
        nextPoint.addEventListener('click', () => step(true));
        slider.addEventListener('input', () => {
            if (!frame) return;
            const ratio = slider.valueAsNumber / 100;
            pin(ratio >= 1 ? null : frame.start + ratio * (frame.end - frame.start), false);
        });
        returnButton.addEventListener('click', event => {
            pin(null);
            if (event.detail === 0) slider.focus({ preventScroll: true });
        });

        function releasePointer() {
            pointer = hoverAt = null;
            if (scheduledReading) cancelAnimationFrame(scheduledReading);
            scheduledReading = 0; readPoint();
        }
        svg.addEventListener('pointerdown', event => {
            if (!event.isPrimary) { releasePointer(); return; }
            if (!frame || event.button !== 0) return;
            pointer = { x: event.clientX, y: event.clientY, id: event.pointerId, dragging: false };
            if (svg.setPointerCapture && event.isTrusted) svg.setPointerCapture(event.pointerId);
        });
        svg.addEventListener('pointermove', event => {
            if (!frame || !event.isPrimary || (pointer && pointer.id !== event.pointerId)) return;
            if (!pointer && event.pointerType !== 'mouse') return;
            if (pointer && !pointer.dragging && event.pointerType !== 'mouse') {
                const dx = Math.abs(event.clientX - pointer.x), dy = Math.abs(event.clientY - pointer.y);
                if (Math.max(dx, dy) < 6) return;
                if (dy >= dx) { releasePointer(); return; }
                pointer.dragging = true;
            }
            hoverAt = fromPointer(event);
            if (!scheduledReading) scheduledReading = requestAnimationFrame(() => { scheduledReading = 0; readPoint(); });
        });
        svg.addEventListener('pointerup', event => {
            if (!frame || pointer?.id !== event.pointerId) return;
            // A native scroll may end without delivering an intermediate move to this element.
            const dx = Math.abs(event.clientX - pointer.x), dy = Math.abs(event.clientY - pointer.y);
            if (event.pointerType !== 'mouse' && !pointer.dragging && dy >= 6 && dy >= dx) { releasePointer(); return; }
            pointer = null; pin(fromPointer(event));
        });
        svg.addEventListener('pointercancel', releasePointer);
        svg.addEventListener('lostpointercapture', event => { if (pointer?.id === event.pointerId) releasePointer(); });
        svg.addEventListener('pointerleave', event => {
            if (!pointer || !svg.hasPointerCapture?.(event.pointerId)) releasePointer();
        });
        new ResizeObserver(() => draw(clock())).observe(svg);
        new IntersectionObserver(([entry]) => {
            inView = entry.isIntersecting; svg.dataset.visible = String(inView);
            if (inView) draw(clock());
        }).observe(card);
        return { update, tick, reset };
    };
}());
