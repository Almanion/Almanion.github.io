(function () {
    'use strict';

    // Keep the first visit across sign-in, including when only session storage is available.
    function firstVisit() {
        const key = 'almanion:forecast:guide-seen:v1';
        let seen = false;
        for (const name of ['localStorage', 'sessionStorage']) {
            try {
                const storage = window[name];
                if (storage.getItem(key)) seen = true;
                storage.setItem(key, '1');
            } catch { /* Storage can be disabled by the browser. */ }
        }
        return !seen;
    }

    window.createForecastGuide = function () {
        const byId = id => document.getElementById(id);
        const guide = byId('marketGuide'), tour = byId('marketTour');
        const body = guide.querySelector('.forecast-guide-body'), card = tour.querySelector('.forecast-tour-card');
        const ring = tour.querySelector('.forecast-tour-focus'), mainLink = document.querySelector('[data-market-guide="start"]');
        const start = byId('startMarketTour'), next = byId('nextMarketTour'), back = byId('backMarketTour');
        const phone = matchMedia('(max-width: 759px), (orientation: landscape) and (max-width: 1024px) and (max-height: 540px) and (pointer: coarse)');
        let market = null, phase = '', winner = '', index = 0, frame = 0, returnTop = 0, trigger = mainLink;

        function openGuide(button) {
            trigger = button;
            returnTop = window.scrollY;
            guide.showModal();
            if (button.dataset.marketGuide === 'orders') {
                const details = byId('guideOrders'), summary = details.querySelector('summary');
                details.open = true;
                summary.focus({ preventScroll: true });
                body.scrollTop += summary.getBoundingClientRect().top - body.getBoundingClientRect().top;
            } else body.scrollTop = 0;
        }
        function restoreFocus() {
            (trigger.getClientRects().length ? trigger : mainLink).focus({ preventScroll: true });
        }
        for (const button of document.querySelectorAll('[data-market-guide]')) {
            button.addEventListener('click', () => openGuide(button));
        }
        byId('dismissMarketGuide').addEventListener('click', () => guide.close());
        guide.addEventListener('click', event => { if (event.target === guide) guide.close(); });
        guide.addEventListener('close', () => { if (!tour.open) restoreFocus(); });

        const steps = [
            ['eventPicker', 'Выбери событие', 'В «Событиях» можно открыть другой прогноз или посмотреть исход завершённого.'],
            ['probChart', 'Посмотри вероятность', 'Выбери вариант ответа над графиком. Проведи по графику или передвинь ползунок, чтобы увидеть оценку в выбранный момент.'],
            ['ticketChoices', 'Купи или продай доли', 'Выбери действие и исход. Можно совершить сделку сразу или задать свою цену. Перед подтверждением увидишь расчёт.'],
            ['portfolio', 'Проверь свой портфель', 'Свободные очки и очки в заявках всегда видны сверху. Открой портфель, чтобы увидеть доли, заявки и историю сделок.']
        ];
        const phoneSteps = [
            'Открой список, чтобы сменить событие или посмотреть его итог.',
            'Выбери исход над графиком. Коснись линии и проведи по ней, чтобы посмотреть прошлые значения.',
            'Выбери «Купить» или «Продать» и нужный исход. Перед отправкой проверь расчёт.',
            'Здесь твои очки и доли. Ниже — открытые заявки и история сделок.'
        ];
        const finished = { lock: 'Торги закрыты. Владелец объявит исход здесь.',
            void: 'Событие отменено. Очки за сделки по нему возвращены.' };

        function positionStep() {
            if (!tour.open) return;
            const target = byId(steps[index][0]);
            const viewport = tour.getBoundingClientRect();
            const short = viewport.width >= 510 && (viewport.height <= 440 || phone.matches && viewport.height <= 540 && viewport.width > viewport.height);
            let rect = target.getBoundingClientRect();
            const onLeft = short && rect.left > viewport.width / 2;
            tour.toggleAttribute('data-card-left', onLeft);
            const panel = card.getBoundingClientRect();
            const top = viewport.top + 10;
            const covered = rect.right > panel.left && rect.left < panel.right;
            const bottom = !short && covered ? panel.top - 10 : viewport.bottom - 8;
            if (rect.bottom > bottom || rect.top < top) {
                const desiredTop = top + Math.max(0, (bottom - top - rect.height) / 2);
                window.scrollBy({ top: rect.top - desiredTop, behavior: 'instant' });
                rect = target.getBoundingClientRect();
            }
            const left = Math.max(rect.left - 3, short && onLeft ? panel.right + 7 : viewport.left + 4);
            const right = Math.min(rect.right + 3, short && !onLeft ? panel.left - 7 : viewport.right - 4);
            const y = Math.max(rect.top - 3, top - 5);
            Object.assign(ring.style, {
                left: (left - viewport.left) + 'px', top: (y - viewport.top) + 'px',
                width: Math.max(0, right - left) + 'px', height: Math.max(0, Math.min(bottom + 3, rect.bottom + 3) - y) + 'px'
            });
        }
        function scheduleLayout() {
            if (!tour.open || frame) return;
            frame = requestAnimationFrame(() => { frame = 0; positionStep(); });
        }
        function showStep() {
            const [target, title, text] = steps[index];
            const result = target === 'ticketChoices' && (finished[phase] || (winner && 'Итог — «' + winner + '». За каждую оставшуюся долю «' + winner + '» начислено 1 очко.'));
            byId('tourProgress').textContent = 'Шаг ' + (index + 1) + ' из ' + steps.length;
            byId('tourTitle').textContent = result ? 'Проверь итог' : title;
            const ownerHint = target === 'eventPicker' && !byId('forecastAdminLink').hidden ? ' Кнопка «Админ-панель» откроет управление этим событием.' : '';
            byId('tourText').textContent = (result || (phone.matches ? phoneSteps[index] : text)) + ownerHint;
            back.disabled = index === 0;
            next.textContent = index === steps.length - 1 ? 'Готово' : 'Дальше';
            positionStep();
        }

        start.addEventListener('click', () => {
            if (!market) return;
            guide.close();
            index = 0;
            tour.showModal();
            showStep();
        });
        next.addEventListener('click', () => {
            if (index === steps.length - 1) tour.close();
            else { index++; showStep(); }
        });
        back.addEventListener('click', () => {
            index--;
            showStep();
            if (!index) next.focus({ preventScroll: true });
        });
        byId('skipMarketTour').addEventListener('click', () => tour.close());
        tour.addEventListener('close', () => {
            cancelAnimationFrame(frame); frame = 0;
            window.scrollTo({ top: returnTop, behavior: 'instant' });
            restoreFocus();
        });
        window.addEventListener('scroll', scheduleLayout, { passive: true });
        window.addEventListener('resize', () => { if (tour.open) showStep(); });
        window.visualViewport?.addEventListener('resize', scheduleLayout);
        if (window.ResizeObserver) new ResizeObserver(scheduleLayout).observe(card);

        if (firstVisit()) openGuide(mainLink);
        return {
            setMarket(event, status) {
                const id = event?.id;
                if (market !== id) {
                    const example = event?.answers[event.sides[0]] || 'Да';
                    for (const label of guide.querySelectorAll('[data-example-answer]')) label.textContent = example;
                }
                if (tour.open && market !== id) tour.close();
                const phaseChanged = status !== phase;
                market = id; phase = status; winner = event?.answers[status] || '';
                start.hidden = !id;
                const availability = byId('guideAvailability');
                availability.textContent = !id && status === 'guest' ? 'Обзор доступен после входа.'
                    : !id && status === 'empty' ? 'Обзор появится с первым событием.' : '';
                availability.hidden = !availability.textContent;
                if (tour.open && phaseChanged) showStep();
            }
        };
    };
}());
