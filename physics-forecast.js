(function () {
    'use strict';
    const M = window.PhysicsForecast;
    const $ = id => document.getElementById(id);
    const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
    const percentFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
    const stampFmt = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
    const amount = cents => fmt.format(cents / 100);
    const points = cents => amount(cents) + ' оч.';
    const shareForms = { one: 'доля', few: 'доли', many: 'долей' };
    const plurals = new Intl.PluralRules('ru');
    function shares(qty, accusative = false) {
        const form = plurals.select(qty);
        return qty + ' ' + (accusative && form === 'one' ? 'долю' : shareForms[form]);
    }
    const priceInput = cents => (cents / 100).toFixed(2).replace('.', ',');
    function readPoints(value) {
        const match = /^(\d*)(?:[.,](\d{1,2}))?$/.exec(value.trim());
        if (!match || (!match[1] && !match[2])) return NaN;
        const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
        return Number.isSafeInteger(cents) ? cents : NaN;
    }
    const ledger = window.ForecastLedger;
    const { date, phaseLabel } = ledger;
    let outcomesVersion = '', walletVersion = '', bookVersion = '';
    let engine = M.create(), readLedger = ledger.createReader(), selectedId = '', user = null, connected = false, offset = 0, ready = false, busy = false;
    let epoch = 0, clock = 0, connectionTimer, feedOff, pendingSnapshot, historyLimit = 12, ticket = null;
    const review = $('tradeReview'), sheet = $('tradeSheet'), tradeForm = $('tradeForm'), tradeTicket = $('tradeTicket');
    let reviewedOrder = null, receivedOrder = '', sheetTrigger = null;
    let orderLimit = 12;
    let firstPaint = true, renderedToday = '', nextClose = Infinity;
    let buyQuantity = '5';
    const api = window.AlmanionAccount;
    const now = () => Date.now() + offset;
    const chart = window.createPhysicsForecastChart(now);
    const guide = window.createForecastGuide(() => {
        if (!sheet.open) return;
        const trigger = sheetTrigger, day = selectedId, scroll = sheet.scrollTop;
        closeTradeSheet(false);
        return () => {
            if (!ready || day !== selectedId || !phone.matches || M.status(market(), now()) !== 'open') return;
            openTradeSheet(trigger);
            sheet.scrollTop = scroll;
        };
    });
    const ranking = window.createForecastRanking(api, amount);
    const eventPicker = $('eventPicker'), eventDialog = $('forecastEvents'), eventList = $('forecastEventList');
    let eventListVersion = '';
    const execution = tradeForm.elements.execution;
    const market = () => engine.markets.get(selectedId);
    const jumpBar = $('forecastJumps'), jumpLinks = [...jumpBar.querySelectorAll('a')];
    const wallet = $('portfolio'), walletToggle = $('walletToggle');
    const walletJump = jumpBar.querySelector('a[href="#portfolio"]');
    const sectionJumps = jumpLinks.filter(link => link !== walletJump);
    const phone = matchMedia('(max-width: 759px), (orientation: landscape) and (max-width: 1024px) and (max-height: 540px) and (pointer: coarse)');
    const book = $('publicOrders'), moreBookLevels = $('moreBookLevels');
    const bookJump = jumpBar.querySelector('a[href="#publicOrders"]');
    let jumpFrame = 0;
    function updateJumps() {
        if (!phone.matches || jumpBar.hidden || jumpFrame) return;
        jumpFrame = requestAnimationFrame(() => {
            jumpFrame = 0;
            if (jumpBar.hidden || $('chartDialog').open || sheet.open) return;
            let active = walletJump;
            if (!wallet.open) {
                const edge = wallet.getBoundingClientRect().height + Math.min(80, innerHeight * .2);
                const visible = sectionJumps.filter(link => !link.hidden);
                active = visible[0];
                for (const link of visible) {
                    if ($(link.hash.slice(1)).getBoundingClientRect().top <= edge) active = link;
                }
                const bottom = document.scrollingElement.scrollHeight - scrollY - innerHeight;
                if (bottom <= 2 && scrollY > 0) {
                    const destination = visible.find(link => link.hash === location.hash);
                    const target = destination && $(destination.hash.slice(1)).getBoundingClientRect();
                    active = target && target.bottom >= edge && target.top < innerHeight * .6 ? destination : visible.at(-1);
                }
            }
            for (const link of jumpLinks) {
                if (link === active) link.setAttribute('aria-current', 'location');
                else link.removeAttribute('aria-current');
            }
        });
    }
    function updateWalletSize() {
        document.body.style.setProperty('--forecast-wallet-height', Math.ceil(wallet.getBoundingClientRect().height) + 'px');
        updateJumps();
    }
    function applyWalletHash() {
        if (!wallet.hidden) wallet.open = location.hash === '#portfolio';
        updateJumps();
    }
    function updateTradeViewport() {
        if (!sheet.open || !window.visualViewport) return;
        const typing = document.activeElement?.matches('#budget, #quantity, #limitPrice');
        const { height, offsetTop } = window.visualViewport;
        sheet.style.setProperty('--trade-viewport-height', height + 'px');
        sheet.style.setProperty('--trade-viewport-top', offsetTop + 'px');
        sheet.toggleAttribute('data-keyboard', Boolean(typing && innerHeight - height > 100));
        if (typing && document.activeElement.getBoundingClientRect().bottom > offsetTop + height - 12) {
            document.activeElement.scrollIntoView({ block: 'center', behavior: 'instant' });
        }
    }
    phone.addEventListener('change', updateJumps);
    window.addEventListener('scroll', updateJumps, { passive: true });
    window.addEventListener('resize', updateWalletSize);
    window.addEventListener('hashchange', applyWalletHash);
    if (typeof ResizeObserver === 'function') new ResizeObserver(updateWalletSize).observe(wallet);
    wallet.addEventListener('toggle', updateJumps);
    document.addEventListener('click', event => {
        const target = event.target;
        if (target.closest('a[href="#portfolio"]') && !wallet.hidden
            && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
            event.preventDefault();
            if (location.hash !== '#portfolio') history.pushState(history.state, '', '#portfolio');
            wallet.open = true;
            walletToggle.focus({ preventScroll: true });
        } else if (wallet.open && (!wallet.contains(target) || target.closest('.forecast-portfolio-jumps a'))) {
            wallet.open = false;
        }
    });
    wallet.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !wallet.open) return;
        event.preventDefault();
        wallet.open = false;
        walletToggle.focus({ preventScroll: true });
    });
    window.visualViewport?.addEventListener('resize', updateTradeViewport);
    window.visualViewport?.addEventListener('scroll', updateTradeViewport);
    document.addEventListener('focusin', updateTradeViewport);
    document.addEventListener('focusout', () => requestAnimationFrame(updateTradeViewport));
    function node(tag, text, cls) {
        const element = document.createElement(tag);
        if (text !== undefined) element.textContent = text;
        if (cls) element.className = cls;
        return element;
    }

    function positionEventDialog() {
        if (!eventDialog.open || phone.matches) return;
        const rect = eventPicker.getBoundingClientRect();
        const { clientWidth, clientHeight } = document.documentElement;
        const gap = 8, edge = 12;
        const below = clientHeight - rect.bottom - gap - edge, above = rect.top - gap - edge;
        const placeBelow = below >= 270 || below >= above;
        eventDialog.style.setProperty('--event-room', Math.max(200, placeBelow ? below : above) + 'px');
        const top = placeBelow ? rect.bottom + gap : rect.top - gap - eventDialog.offsetHeight;
        const left = Math.max(edge, Math.min(rect.left, clientWidth - eventDialog.offsetWidth - edge));
        eventDialog.style.setProperty('--event-left', left + 'px');
        eventDialog.style.setProperty('--event-top', Math.max(edge, Math.min(top, clientHeight - eventDialog.offsetHeight - edge)) + 'px');
    }

    function renderEventList(markets, at) {
        const info = markets.map(item => {
            const phase = M.status(item, at);
            const position = M.position(item, user.uid);
            const quantity = item.sides.reduce((sum, side) => sum + position[side], 0);
            const orders = phase === 'open' ? item.orders.filter(order => order.actor === user.uid).length : 0;
            return { phase, quantity, orders };
        });
        const version = JSON.stringify([selectedId, markets.map((item, i) => [item.id, item.endAt, info[i]])]);
        if (eventListVersion === version) return;
        eventListVersion = version;
        const focusedId = document.activeElement?.dataset?.eventId;
        const scroll = eventList.scrollTop;
        const lists = ['Открытые', 'Ждут итога', 'Завершённые'].map(label => {
            const group = node('section', undefined, 'forecast-event-group');
            const list = node('ul');
            group.append(node('h3', label), list);
            return { group, list };
        });
        let restoreFocus;
        markets.forEach((item, i) => {
            const { phase, quantity, orders } = info[i];
            const button = node('button', undefined, 'forecast-event-choice');
            button.type = 'button';
            button.dataset.eventId = item.id;
            if (item.id === selectedId) button.setAttribute('aria-current', 'true');
            const detail = phase === 'open' ? 'До ' + ledger.cutoff(item.endAt, item.date)
                : phase !== 'lock' ? phaseLabel(item, phase) : '';
            button.append(node('span', item.question, 'forecast-event-question'),
                node('span', date(item.date) + (detail ? ' · ' + detail : ''), 'forecast-event-caption'));
            if ((phase === 'open' || phase === 'lock') && (quantity || orders)) {
                const exposure = [quantity && 'У тебя ' + shares(quantity), orders && 'Заявки · ' + orders].filter(Boolean).join(' · ');
                button.append(node('span', exposure, 'forecast-event-exposure'));
            }
            const row = node('li');
            row.append(button);
            lists[phase === 'open' ? 0 : phase === 'lock' ? 1 : 2].list.append(row);
            if (item.id === focusedId) restoreFocus = button;
        });
        eventList.replaceChildren(...lists.filter(({ list }) => list.childElementCount).map(({ group }) => group));
        eventList.scrollTop = scroll;
        restoreFocus?.focus({ preventScroll: true });
        positionEventDialog();
    }

    eventPicker.addEventListener('click', () => {
        if (busy || !ready || eventDialog.open) return;
        const at = now(), markets = ledger.orderedMarkets(engine, at);
        if (!markets.length) return;
        renderEventList(markets, at);
        eventDialog.showModal();
        positionEventDialog();
        eventPicker.setAttribute('aria-expanded', 'true');
        eventList.querySelector('[aria-current="true"]')?.focus();
    });
    $('closeForecastEvents').addEventListener('click', () => eventDialog.close());
    eventDialog.addEventListener('click', e => {
        if (e.target !== eventDialog) return;
        const rect = eventDialog.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) eventDialog.close();
    });
    eventDialog.addEventListener('close', () => {
        eventPicker.setAttribute('aria-expanded', 'false');
        if (!eventPicker.hidden && !eventPicker.disabled) eventPicker.focus({ preventScroll: true });
    });
    eventList.addEventListener('click', e => {
        const id = e.target.closest('[data-event-id]')?.dataset.eventId;
        if (!id || busy || !ready || !engine.markets.has(id)) return;
        eventDialog.close();
        if (id !== selectedId) {
            selectMarket(id);
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
    });
    eventList.addEventListener('keydown', e => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
        const buttons = [...eventList.querySelectorAll('[data-event-id]')];
        const index = buttons.indexOf(document.activeElement);
        if (index < 0) return;
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : index + (e.key === 'ArrowUp' ? -1 : 1);
        e.preventDefault();
        buttons[next]?.focus();
    });
    window.addEventListener('resize', positionEventDialog);

    function gate(title, body, action) {
        wallet.open = false;
        wallet.hidden = true;
        updateWalletSize();
        jumpBar.hidden = true;
        $('rankOpen').hidden = true;
        guide.setMarket(null, action === 'login' ? 'guest' : 'loading');
        $('accessGate').hidden = false;
        $('gameSurface').hidden = $('connectionNotice').hidden = true;
        eventPicker.hidden = true;
        if (eventDialog.open) eventDialog.close();
        $('roundState').textContent = '';
        $('roundState').removeAttribute('data-state');
        $('marketDeadline').hidden = true;
        renderHeading(null);
        $('eventResult').hidden = true;
        $('gateTitle').textContent = title;
        $('gateText').textContent = body;
        const button = $('gateAction');
        button.hidden = !action;
        if (action) {
            button.textContent = action === 'login' ? 'Войти' : 'Повторить';
            button.onclick = action === 'login' ? () => api.openLogin() : () => location.reload();
        }
    }
    function notice(text) {
        $('feedback').textContent = text;
    }

    function syncSnapshot(snapshot) {
        engine = readLedger(snapshot);
        ready = true;
        ranking.update(engine, user);
        paint();
    }

    function clearMarket() {
        clearTimeout(connectionTimer);
        if (review.open) review.close();
        reviewedOrder = null; receivedOrder = '';
        closeTradeSheet(false);
        outcomesVersion = walletVersion = bookVersion = '';
        for (const id of ['walletBalances', 'walletEventOrders', 'walletOtherList', 'walletFinishedList']) $(id).replaceChildren();
        if (feedOff) feedOff();
        feedOff = undefined;
        epoch++; ready = busy = false; selectedId = ''; readLedger = ledger.createReader(); engine = M.create(); ticket = pendingSnapshot = null;
        chart.reset();
        ranking.reset();
        resetDraft(); expandBook(false); toggleCriteria(false);
        $('forecastAdminLink').href = 'admin.html#forecasts';
        $('feedback').textContent = $('orderFeedback').textContent = '';
        if (eventDialog.open) eventDialog.close();
        eventList.replaceChildren();
        eventListVersion = '';
        for (const id of ['outcomeList', 'tradeHistory', 'myOrders', 'orderHistory', 'bookAsks', 'bookBids']) $(id).replaceChildren();
    }

    function subscribe() {
        gate('Загружаем рынок…', 'Получаем заявки и сделки класса.');
        const session = epoch;
        connectionTimer = setTimeout(() => {
            if (session === epoch && !ready) gate('Нет ответа сервера', 'Продолжим, как только появится подключение.', 'retry');
        }, 8000);
        const query = api.database.ref('physicsForecast/events').orderByChild('n');
        const loaded = snapshot => {
            if (session !== epoch) return;
            if (busy) { pendingSnapshot = snapshot; return; }
            try { syncSnapshot(snapshot); }
            catch { clearMarket(); gate('Не удалось прочитать рынок', 'Обнови данные, чтобы продолжить.', 'retry'); }
        };
        feedOff = () => query.off('value', loaded);
        query.on('value', loaded, () => {
            if (session !== epoch) return;
            clearMarket(); gate('Рынок недоступен', 'Проверь подключение и доступ к игре.', 'retry');
        });
    }

    function activate(account) {
        clearMarket();
        user = account && !account.isAnonymous ? account : null;
        $('forecastAdminLink').hidden = user?.uid !== M.OWNER;
        if (!user) {
            gate('Войди, чтобы открыть рынок', 'На старте — 100 бесплатных виртуальных очков на прогнозы класса.', 'login');
            return;
        }
        subscribe();
    }

    const suffix = side => side[0].toUpperCase() + side.slice(1);
    function renderOutcomes(m, phase) {
        const open = phase === 'open', key = m.id + ':' + open;
        const list = $('outcomeList');
        if (outcomesVersion !== key) {
            outcomesVersion = key;
            list.replaceChildren(...m.sides.map(side => {
                const row = node('li'), name = m.answers[side];
                const choice = node(open ? 'button' : 'div', undefined, 'forecast-outcome');
                if (open) choice.type = 'button';
                choice.dataset.outcome = side;
                choice.toggleAttribute('data-long', name.length > 26);
                choice.style.setProperty('--outcome', 'var(--' + side + ')');
                choice.append(node('span', name, 'forecast-outcome-name'), node('strong', '', 'forecast-outcome-value'));
                row.append(choice);
                return row;
            }));
            $('bookSide').replaceChildren(...m.sides.map(side => new Option(m.answers[side], side)));
        }
        $('outcomesEstimate').textContent = !m.trades.length ? 'Оценка до первой сделки' : open ? 'Оценка рынка' : 'Оценка при закрытии';
        for (const choice of list.querySelectorAll('[data-outcome]')) {
            const side = choice.dataset.outcome;
            choice.lastElementChild.textContent = percentFmt.format(m.series[side].at(-1).p) + '%';
            if (open) {
                choice.disabled = busy;
                if (side === tradeForm.elements.side.value) choice.setAttribute('aria-current', 'true');
                else choice.removeAttribute('aria-current');
            }
        }
    }

    function bookLevel({ bookPrice, bookAction } = {}) {
        if (!bookPrice || book.hidden) return null;
        return book.querySelector('[data-book-price="' + bookPrice + '"][data-book-action="' + bookAction + '"]');
    }

    function renderBook(m, phase) {
        book.hidden = phase !== 'open';
        bookJump.hidden = book.hidden;
        if (phase !== 'open') return;
        const selected = $('bookSide').value, lanes = [['bookBids', 'bid', 'sell'], ['bookAsks', 'ask', 'buy']];
        const label = m.answers[selected];
        $('bookSideLabel').textContent = label;
        $('bookSideLabel').parentElement.toggleAttribute('data-long', label.length > 12);
        const books = lanes.map(([id, lane, action]) => {
            const levels = new Map();
            for (const order of M.ranked(m, lane, selected)) {
                const price = M.quotePrice(order, selected);
                levels.set(price, (levels.get(price) || 0) + order.qty);
            }
            return { id, action, levels };
        });
        const version = JSON.stringify([m.id, selected, busy, books.map(({ levels }) => [...levels])]);
        if (bookVersion === version) return;
        bookVersion = version;
        const focused = document.activeElement?.dataset;
        for (const { id, action, levels } of books) {
            let cumulative = 0;
            const depth = [...levels.values()].reduce((sum, qty) => sum + qty, 0);
            const rows = Array.from(levels, ([price, qty]) => {
                cumulative += qty;
                const row = node('tr'), priceCell = node('td'), quantity = node('td');
                const control = node('button', priceInput(price), 'forecast-level');
                control.type = 'button';
                control.dataset.bookPrice = String(price);
                control.dataset.bookAction = action;
                control.disabled = busy;
                control.setAttribute('aria-label', (action === 'buy' ? 'Купить' : 'Продать') + ' по ' + points(price));
                const bar = node('span', undefined, 'forecast-depth');
                bar.setAttribute('aria-hidden', 'true');
                row.style.setProperty('--depth', (100 * cumulative / depth).toFixed(1) + '%');
                quantity.append(bar, node('span', fmt.format(qty)));
                if (cumulative > qty) {
                    const total = node('small', 'всего ' + fmt.format(cumulative), 'forecast-book-total');
                    total.title = 'Долей на этом уровне и по более выгодной цене';
                    quantity.append(total);
                }
                priceCell.append(control);
                row.append(priceCell, quantity);
                return row;
            });
            const empty = id === 'bookBids' ? 'Пока нет покупателей' : 'Пока нет продавцов';
            if (!rows.length) {
                const row = node('tr'), cell = node('td', empty, 'forecast-book-empty');
                cell.colSpan = 2; row.append(cell); rows.push(row);
            }
            $(id).replaceChildren(...rows);
        }
        if (focused?.bookPrice && !busy) {
            const control = bookLevel(focused);
            (control || $('bookSide')).focus({ preventScroll: true });
        }
        moreBookLevels.hidden = books.every(({ levels }) => levels.size <= 6);
    }

    function expandBook(expanded) {
        book.toggleAttribute('data-expanded', expanded);
        moreBookLevels.setAttribute('aria-expanded', String(expanded));
        moreBookLevels.textContent = expanded ? 'Свернуть уровни цен' : 'Все уровни цен';
    }

    function renderHistory(m) {
        const trades = m.trades.filter(t => t.taker === user.uid || t.maker === user.uid).reverse();
        const rows = trades.slice(0, historyLimit).map(t => {
            const isMaker = t.maker === user.uid;
            const side = isMaker ? t.makerSide : t.side;
            const action = isMaker ? t.makerAction : t.action;
            const price = isMaker ? t.makerPrice : t.price;
            const row = node('div', undefined, 'forecast-row');
            const info = node('div'); info.append(node('b', (action === 'buy' ? 'Покупка' : 'Продажа') + ' · ' + m.answers[side]),
                node('small', stampFmt.format(t.at) + ' мск · ' + shares(t.qty) + ' по ' + points(price)));
            row.append(info, node('strong', (m.phase === 'void' ? 'Отменено · ' : action === 'buy' ? 'Списано ' : 'Получено ') + points(price * t.qty))); return row;
        });
        $('tradeHistory').replaceChildren(...(rows.length ? rows : [node('p', 'В этом прогнозе у тебя пока нет сделок.', 'forecast-footnote')]));
        $('moreTrades').hidden = trades.length <= historyLimit;
        $('walletTradeCount').textContent = fmt.format(trades.length);
    }

    function resetDraft() {
        tradeForm.reset();
        tradeForm.elements.side.value = 'yes';
        buyQuantity = $('quantity').value;
        ticket = null;
    }

    function draftOrder() {
        const { action, side } = tradeForm.elements;
        const mode = execution.value;
        return { kind: 'order', day: selectedId, actor: user.uid, action: action.value, side: side.value, mode,
            limit: mode === 'limit' ? readPoints($('limitPrice').value) : action.value === 'buy' ? 99 : 1 };
    }

    function bestPrice(m, action, side) {
        const best = M.ranked(m, action === 'buy' ? 'ask' : 'bid', side)[0];
        return best ? M.quotePrice(best, side) : null;
    }

    function freeShares(m, side, at) {
        return M.position(m, user.uid)[side] - M.held(m, user.uid, at)[side];
    }

    function suggestPrice() {
        const { action, side } = tradeForm.elements;
        const m = market();
        $('limitPrice').value = priceInput(bestPrice(m, action.value, side.value) ?? Math.round(m.marks[side.value]));
    }

    function sizePresets(order, byBudget, free, maximum, disabled) {
        const sell = order.action === 'sell';
        const current = byBudget ? readPoints($('budget').value) : $('quantity').valueAsNumber;
        const sizes = sell ? [1, Math.floor(free / 4), Math.floor(free / 2)] : byBudget ? [100, 500, 1000] : [1, 5, 10];
        const names = sell ? ['1 доля', '25%', '50%'] : sizes.map(size => byBudget ? points(size) : shares(size));
        sizes.push(maximum);
        names.push(sell && free === maximum ? 'Все' : 'Макс.');
        const buttons = $('sizePresets').querySelectorAll('button');
        sizes.forEach((size, i) => {
            const button = buttons[i];
            const isMax = i === sizes.length - 1;
            button.hidden = !isMax && (size === maximum || (sell && (size < 1 || size > maximum || sizes.indexOf(size) !== i)));
            button.disabled = disabled || !size || size > maximum;
            button.dataset.value = String(size);
            button.textContent = names[i];
            const exact = byBudget ? points(size) : shares(size);
            button.title = exact;
            button.setAttribute('aria-label', names[i] === exact ? exact : names[i] + ' · ' + exact);
            button.setAttribute('aria-pressed', String(size > 0 && size === current));
        });
    }

    function quoteRow(label, value) {
        const row = node('div', undefined, 'forecast-quote-row');
        row.append(node('span', label), node('strong', value));
        return row;
    }
    function showEstimate(order, plan, free, unusedLimit) {
        const buy = order.action === 'buy';
        const average = plan.filled ? plan.cash / plan.filled : 0;
        const rows = plan.filled
            ? [quoteRow((buy ? 'К оплате сейчас' : 'К получению сейчас') + ' · ' + shares(plan.filled), points(plan.cash)),
                quoteRow('Средняя цена за долю', (Number.isInteger(average) ? '' : '≈ ') + points(average))]
            : [quoteRow('Сразу исполнится', '0 долей')];
        if (unusedLimit > 0) rows.push(quoteRow('Из лимита останется', points(unusedLimit)));
        if (plan.left) {
            if (buy) rows.push(quoteRow('В резерв на ' + shares(plan.left, true), points(plan.reserved)));
            else rows.push(quoteRow('Доли в резерве', shares(plan.left)),
                quoteRow('При продаже остатка', 'от ' + points(plan.left * order.limit)));
        }
        if (buy && order.mode === 'limit' && order.qty * order.limit > plan.cash + plan.reserved) {
            rows.push(quoteRow('Максимум за всю заявку', points(order.qty * order.limit)));
        }
        if (buy && plan.filled) {
            const payout = plan.filled * 100;
            const gain = quoteRow('Прибыль при победе', '+' + points(payout - plan.cash));
            gain.dataset.result = 'gain';
            rows.push(quoteRow(plan.left ? 'Выплата за купленные доли при победе' : 'Выплата при победе', points(payout)), gain);
        } else if (!buy) {
            rows.push(quoteRow('Останется свободных долей', String(free - order.qty)));
        }
        $('quotePreview').replaceChildren(...rows);
    }

    function quoteForSize(order, at, byBudget, balance, maxQty, maxValue) {
        if (order.mode === 'limit' && !(order.limit >= 1 && order.limit <= 99)) {
            return { error: 'price', message: 'Введи цену от 0,01 до 0,99 очка.' };
        }
        if (byBudget) {
            const budget = readPoints($('budget').value);
            if (order.mode === 'market' && bestPrice(market(), 'buy', order.side) === null) return { error: 'depth' };
            if (!Number.isFinite(budget) || budget < 1) return { error: 'budget', message: 'Введи сумму в очках с точностью до сотых.' };
            if (budget > balance) return { error: 'cash', message: 'На покупку доступно ' + points(balance) };
            order.qty = budget >= maxValue ? maxQty : M.maxOrderSize(engine, order, at, budget);
            if (!order.qty) {
                const one = M.preview(engine, { ...order, qty: 1 }, at);
                return one.error ? one : { error: 'budget', message: 'На одну долю нужно ' + points(order.mode === 'limit' ? order.limit : one.cash) };
            }
        } else order.qty = $('quantity').valueAsNumber;
        return M.preview(engine, order, at);
    }

    function showQuoteError(plan, order, byBudget, maxValue, maxQty) {
        const { error } = plan;
        let message = plan.message || M.errors[error];
        if (error === 'depth') {
            const side = '«' + market().answers[order.side] + '»', buy = order.action === 'buy';
            if (bestPrice(market(), order.action, order.side) === null) {
                message = 'Сейчас никто не ' + (buy ? 'продаёт' : 'покупает') + ' доли ' + side + '.';
            } else if (maxQty > 0) {
                message = 'Сейчас можно ' + (buy ? 'купить ' : 'продать ') + shares(maxQty, true) + ' ' + side + '.';
            } else message = 'Сейчас не хватает предложений на весь выбранный объём.';
        }
        $('quotePreview').textContent = message;
        const canResize = maxValue > 0 && ['depth', 'shares', 'cash', 'own', 'size'].includes(error);
        $('useCapacity').hidden = !canResize;
        if (canResize) $('useCapacity').textContent = 'Выбрать ' + (byBudget ? points(maxValue) : shares(maxValue, true));
        $('useLimit').hidden = error !== 'depth' || order.mode !== 'market';
        $('explainDepth').hidden = error !== 'depth';
        $('explainDepth').disabled = false;
        $('showOrders').hidden = error !== 'reserved' && error !== 'own';
        $('buyInstead').hidden = error !== 'empty';
        $('buyInstead').textContent = 'Купить «' + market().answers[order.side] + '»';
        $('quoteActions').hidden = !Array.from($('quoteActions').children).some(control => !control.hidden);
    }

    function renderTicket() {
        const m = market();
        if (!ready || !m || !user) return;
        const at = now(), order = draftOrder(), buy = order.action === 'buy';
        const open = M.status(m, at) === 'open', disabled = !open || !connected || busy;
        const byBudget = buy && $('buyUnit').value === 'points';
        const free = freeShares(m, order.side, at), balance = M.available(engine, user.uid, selectedId, at);
        const emptySale = !buy && !free, own = M.position(m, user.uid)[order.side];
        const maxQty = open && !emptySale ? M.maxOrderSize(engine, order, at, byBudget ? balance : Infinity) : 0;
        let maxValue = maxQty;
        if (byBudget && maxQty) maxValue = order.mode === 'limit' ? maxQty * order.limit : M.preview(engine, { ...order, qty: maxQty }, at).cash;
        const preview = $('quotePreview'), submit = $('placeOrder');
        ticket = null;
        $('ticketOutcome').textContent = m.answers[order.side];
        $('ticketOutcome').style.setProperty('--outcome', 'var(--' + order.side + ')');
        $('closeTradeSheet').disabled = busy;
        $('changeOutcome').disabled = busy;
        $('changeOutcome').hidden = !open;
        for (const group of tradeForm.querySelectorAll('fieldset')) {
            group.hidden = !open;
            group.disabled = disabled;
        }
        $('limitField').hidden = order.mode !== 'limit' || emptySale || !open;
        $('limitPrice').disabled = disabled || $('limitField').hidden;
        $('limitLabel').textContent = buy ? 'Максимальная цена за долю, оч.' : 'Минимальная цена за долю, оч.';
        $('sizeFields').hidden = emptySale || !open;
        $('buyUnit').hidden = !buy;
        $('buyUnit').disabled = disabled;
        $('sellUnit').hidden = buy;
        $('budget').hidden = !byBudget; $('budget').disabled = disabled || !byBudget;
        $('quantity').hidden = byBudget; $('quantity').disabled = disabled || byBudget || emptySale;
        $('sizeLabel').htmlFor = byBudget ? 'budget' : 'quantity';
        $('sizeLabel').textContent = byBudget ? 'Лимит покупки' : 'Количество долей';
        const saleBalance = maxQty > 0 && maxQty < free ? 'Свободно ' + free + ' · за раз до ' + maxQty : 'Свободно ' + free + ' из ' + own;
        $('sizeAvailable').textContent = buy ? 'Доступно ' + points(balance) : saleBalance;
        const ask = bestPrice(m, 'buy', order.side), bid = bestPrice(m, 'sell', order.side);
        $('ticketBuyPrice').textContent = ask === null ? 'Нет продавцов' : 'от ' + points(ask) + ' за долю';
        $('ticketSellPrice').textContent = bid === null ? 'Нет покупателей' : 'до ' + points(bid) + ' за долю';
        sizePresets(order, byBudget, free, maxValue, disabled);
        submit.disabled = true; submit.hidden = !open || emptySale;
        submit.textContent = busy ? 'Отправляем…' : buy ? 'Проверить покупку' : 'Проверить продажу';
        $('quoteActions').hidden = true;
        if (!open) { preview.replaceChildren(); return; }
        if (emptySale) {
            const message = own ? 'Все доли «' + market().answers[order.side] + '» уже выставлены на продажу.' : 'У тебя пока нет долей «' + market().answers[order.side] + '».';
            showQuoteError({ error: own ? 'reserved' : 'empty', message }, order, byBudget, maxValue, maxQty);
            return;
        }
        const plan = quoteForSize(order, at, byBudget, balance, maxQty, maxValue);
        if (plan.error) { showQuoteError(plan, order, byBudget, maxValue, maxQty); return; }
        if (order.mode === 'market') {
            order.limit = plan.fills.at(-1).price;
            order.totalLimit = plan.cash;
        }
        ticket = order;
        submit.disabled = disabled;
        if (!busy && plan.left) submit.textContent = 'Проверить заявку';
        const unusedLimit = byBudget ? readPoints($('budget').value) - plan.cash - plan.reserved : 0;
        showEstimate(order, plan, free, unusedLimit);
    }

    function settlementText(m, phase, pos) {
        if (phase === 'lock') return 'Торги завершены. Ждём объявления результата.';
        if (phase === 'void') {
            if (pos.cash < 0) return 'Возвращено ' + points(-pos.cash);
            if (pos.cash > 0) return 'Отменён доход по событию · ' + points(pos.cash);
            return 'Баланс по событию восстановлен.';
        }
        if (m.sides.includes(phase)) {
            const payout = pos[phase] * 100, net = pos.cash + payout;
            return 'Выплата ' + points(payout) + ' · результат ' + (net > 0 ? '+' : '') + points(net);
        }
        return '';
    }

    function walletHoldings({ item, phase, pos, reserve }) {
        if (phase !== 'open' && phase !== 'lock') return [];
        return item.sides.filter(side => pos[side] > 0).map(side => {
            const holding = node('div'), value = node('dd'), quantity = node('span', String(pos[side]));
            holding.dataset.holding = side;
            holding.style.setProperty('--outcome', 'var(--' + side + ')');
            if (item.id === selectedId) quantity.id = 'wallet' + suffix(side);
            value.append(quantity, node('small', ' ' + shareForms[plurals.select(pos[side])]));
            if (phase === 'open' && pos[side] > reserve[side]) {
                const sell = node('button', 'Продать');
                sell.type = 'button'; sell.dataset.sell = side; sell.dataset.market = item.id;
                sell.setAttribute('aria-label', 'Продать доли «' + item.answers[side] + '»');
                sell.disabled = busy || !connected;
                value.append(sell);
            }
            holding.append(node('dt', item.answers[side]), value);
            if (reserve[side]) holding.append(node('dd', 'В продаже ' + shares(reserve[side]), 'forecast-reserve'));
            return holding;
        });
    }

    function walletOrderButtons({ item, orders }) {
        return orders.map(order => {
            const buy = order.action === 'buy';
            const label = buy ? 'Резерв ' + points(order.qty * order.limit) : 'В продаже ' + shares(order.qty);
            const button = node('button', label + ' · ' + item.answers[order.side]);
            button.type = 'button'; button.dataset.walletOrder = order.id; button.dataset.market = item.id;
            button.disabled = busy;
            return button;
        });
    }

    function walletGroup(entry) {
        const { item, phase, pos } = entry;
        const group = node('section', undefined, 'forecast-wallet-event');
        const holdings = node('dl'), orders = node('div', undefined, 'forecast-wallet-orders');
        const open = node('button', 'Открыть событие');
        open.type = 'button'; open.dataset.walletEvent = item.id; open.disabled = busy;
        holdings.append(...walletHoldings(entry)); orders.append(...walletOrderButtons(entry));
        group.append(node('h4', item.question), holdings,
            node('p', settlementText(item, phase, pos), 'forecast-footnote'), orders, open);
        return group;
    }

    function renderWallet(markets, at) {
        const entries = markets.map(item => {
            const phase = M.status(item, at), pos = M.position(item, user.uid), reserve = M.held(item, user.uid, at);
            const orders = phase === 'open' ? item.orders.filter(order => order.actor === user.uid) : [];
            return { item, phase, pos, reserve, orders };
        });
        const current = entries.find(({ item }) => item.id === selectedId);
        const active = [], finished = [];
        for (const entry of entries) {
            const { item, phase, orders } = entry;
            if (entry === current) continue;
            const hasPreviousOrder = phase !== 'open' && [...item.orderHistory.values()].some(order => order.actor === user.uid);
            if (!orders.length && !item.positions.has(user.uid) && !hasPreviousOrder) continue;
            (phase === 'open' || phase === 'lock' ? active : finished).push(entry);
        }
        $('walletCash').textContent = points(M.available(engine, user.uid, selectedId, at));
        $('walletHeld').textContent = points(entries.reduce((sum, { reserve }) => sum + reserve.cash, 0));
        $('walletOrderCount').textContent = fmt.format(current.orders.length);
        $('eventResult').textContent = settlementText(current.item, current.phase, current.pos);
        const version = JSON.stringify([selectedId, busy, connected, [current, ...active, ...finished].map(({ item, phase, pos, reserve, orders }) =>
            [item.id, phase, pos, reserve, orders])]);
        if (walletVersion === version) return;
        walletVersion = version;
        const focused = wallet.contains(document.activeElement) ? document.activeElement.dataset : null;
        const holdings = walletHoldings(current);
        $('walletEventTitle').textContent = current.item.question;
        $('walletBalances').replaceChildren(...holdings);
        $('walletEmpty').hidden = holdings.length > 0 || !['open', 'lock'].includes(current.phase);
        $('walletOutcome').textContent = $('eventResult').textContent;
        $('walletEventOrders').replaceChildren(...walletOrderButtons(current));
        $('walletOtherEvents').hidden = !active.length;
        $('walletOtherList').replaceChildren(...active.map(walletGroup));
        $('walletFinished').hidden = !finished.length;
        $('walletFinishedList').replaceChildren(...finished.map(walletGroup));
        if (focused?.market || focused?.walletEvent) {
            const next = [...wallet.querySelectorAll('button:not(:disabled)')].find(({ dataset }) =>
                dataset.market === focused.market && dataset.walletEvent === focused.walletEvent
                && dataset.sell === focused.sell && dataset.walletOrder === focused.walletOrder);
            (next || walletToggle).focus({ preventScroll: true });
        }
    }

    function isOpenOrder(order, phase) {
        return phase === 'open' && order.filled < order.qty && order.cancelledAt === null;
    }

    function orderReceipt(m, order, phase) {
        if (phase === 'void') {
            return { title: phaseLabel(m, phase), text: settlementText(m, phase, M.position(m, user.uid)) };
        }
        const left = order.qty - order.filled, open = isOpenOrder(order, phase), buy = order.action === 'buy';
        const title = open ? 'Заявка выставлена' : !left ? 'Сделка принята'
            : order.cancelledAt !== null ? 'Заявка снята' : 'Торги закрыты';
        const outcome = ' «' + m.answers[order.side] + '»';
        const parts = [];
        if (order.filled) parts.push((buy ? 'Покупка' : 'Продажа') + ' · ' + shares(order.filled) + outcome + ' за ' + points(order.cash));
        if (open) parts.push('В открытой заявке ' + shares(left) + outcome + ' по ' + points(order.limit));
        else if (left) parts.push('Резерв снят · ' + (buy ? points(left * order.limit) : shares(left)));
        return { title, text: parts.join(' · ') };
    }

    function renderReceipt(m, phase) {
        if (!review.open || !receivedOrder) return;
        const order = m.orderHistory.get(receivedOrder);
        if (!order) return;
        const { title, text } = orderReceipt(m, order, phase);
        if ($('reviewTitle').textContent !== title) $('reviewTitle').textContent = title;
        if ($('reviewStatus').textContent !== text) $('reviewStatus').textContent = text;
        if ($('feedback').textContent !== text) notice(text);
        $('reviewOrders').hidden = order.mode !== 'limit';
    }

    function orderRow(m, order, phase) {
        const left = order.qty - order.filled, stopped = order.cancelledAt !== null;
        const open = isOpenOrder(order, phase), buy = order.action === 'buy';
        const row = node('div', undefined, 'forecast-row'), info = node('div');
        row.dataset.order = order.id; row.tabIndex = -1;
        const status = !left ? 'Исполнена' : stopped ? 'Снята' : !open ? 'Торги закрыты' : order.filled ? 'Частично исполнена' : 'Открыта';
        const limit = order.mode === 'limit' ? ' по ' + points(order.limit) : ' · сразу';
        info.append(node('small', stampFmt.format(order.at) + ' мск · ' + status, 'forecast-order-state'),
            node('b', (buy ? 'Покупка' : 'Продажа') + ' · ' + m.answers[order.side]),
            node('small', 'Запрошено ' + shares(order.qty) + limit));
        if (order.filled) {
            const label = phase === 'void' ? 'До отмены' : 'Исполнено';
            info.append(node('small', label + ' · ' + shares(order.filled) + ' за ' + points(order.cash)
                + ' · средняя цена ' + points(order.cash / order.filled)));
        }
        if (left) {
            const reserved = buy ? points(left * order.limit) : shares(left);
            info.append(node('small', open ? 'В ожидании ' + shares(left) + ' · в резерве ' + reserved
                : 'Резерв снят · ' + reserved));
        }
        row.append(info);
        if (open) {
            const cancel = node('button', 'Снять заявку', 'forecast-secondary');
            cancel.type = 'button'; cancel.disabled = busy || !connected;
            cancel.dataset.orderId = order.id;
            row.append(cancel);
        }
        return row;
    }

    function renderOrders(m, phase) {
        const panel = $('orderHistoryPanel'), openList = $('myOrders');
        const all = phase !== 'open' || $('allOrders').getAttribute('aria-pressed') === 'true';
        $('openOrders').hidden = phase !== 'open';
        $('openOrders').setAttribute('aria-pressed', String(!all));
        $('allOrders').setAttribute('aria-pressed', String(all));
        $('allOrders').hidden = phase !== 'open';
        openList.hidden = all;
        panel.hidden = !all;
        const allEntries = [...m.orderHistory.values()].filter(order => order.actor === user.uid).reverse();
        const entries = all ? allEntries : allEntries.filter(order => isOpenOrder(order, phase));
        const list = all ? $('orderHistory') : openList;
        const focused = document.activeElement, orderId = focused.closest('[data-order]')?.dataset.order;
        const rows = (all ? entries.slice(0, orderLimit) : entries).map(order => orderRow(m, order, phase));
        list.replaceChildren(...(rows.length ? rows : [node('p', all ? 'В этом прогнозе у тебя ещё нет заявок.'
            : 'У тебя нет заявок в ожидании сделки.', 'forecast-footnote')]));
        $('moreOrders').hidden = !all || entries.length <= orderLimit;
        if (orderId && !busy && !focused.isConnected) {
            const row = rows.find(element => element.dataset.order === orderId);
            const button = focused.matches('button') && row?.querySelector('button:not(:disabled)');
            (button || row || $('orderListTitle')).focus({ preventScroll: true });
        }
    }

    function openOrderHistory(id) {
        const m = market(), phase = M.status(m, now());
        const all = phase !== 'open' || Boolean(id && !m.orders.some(order => order.id === id && order.actor === user.uid));
        $('allOrders').setAttribute('aria-pressed', String(all));
        if (all) {
            const entries = [...m.orderHistory.values()].filter(order => order.actor === user.uid).reverse();
            orderLimit = Math.max(orderLimit, entries.findIndex(order => order.id === id) + 1);
        }
        renderOrders(m, phase);
        const list = all ? $('orderHistory') : $('myOrders');
        const row = [...list.children].find(element => element.dataset.order === id) || $('orderListTitle');
        row.focus({ preventScroll: true });
        row.scrollIntoView({ block: 'start' });
    }

    function renderHeading(m) {
        $('lessonQuestion').textContent = m?.question || 'Прогнозы класса';
        $('lessonQuestion').toggleAttribute('data-long', (m?.question.length || 0) > 70);
        $('lessonDate').textContent = m ? date(m.date) : '';
        $('lessonDate').hidden = !m;
        $('eventCriteria').textContent = m?.criteria || '';
        $('eventCriteria').hidden = !m?.criteria || $('criteriaToggle').getAttribute('aria-expanded') !== 'true';
        $('criteriaToggle').hidden = !m?.criteria;
    }

    function paint() {
        if (!ready || !user) return;
        $('rankOpen').hidden = false;
        $('accessGate').hidden = true; $('gameSurface').hidden = false; $('connectionNotice').hidden = connected;
        const at = now(), markets = ledger.orderedMarkets(engine, at);
        if (!engine.markets.has(selectedId)) {
            const requested = new URLSearchParams(location.search).get('event');
            selectedId = engine.markets.has(requested) ? requested : markets[0]?.id || '';
        }
        const m = market();
        renderedToday = M.dayKey(at);
        nextClose = Infinity;
        for (const item of markets) {
            if (item.phase === 'open' && item.endAt > at) nextClose = Math.min(nextClose, item.endAt);
        }
        eventPicker.disabled = busy;
        eventPicker.hidden = !markets.length;
        if (eventDialog.open) {
            if (busy || eventPicker.hidden) eventDialog.close();
            else renderEventList(markets, at);
        }
        renderHeading(m);
        $('emptyRound').hidden = !!m; $('roundBody').hidden = !m; jumpBar.hidden = !m;
        const walletWasHidden = wallet.hidden;
        wallet.hidden = !m;
        if (!m) wallet.open = false;
        else if (walletWasHidden) applyWalletHash();
        if (wallet.hidden !== walletWasHidden) updateWalletSize();
        const phase = m ? M.status(m, at) : '';
        guide.setMarket(m, m ? phase : 'empty');
        $('roundState').textContent = phaseLabel(m, phase); $('roundState').dataset.state = phase;
        $('marketDeadline').hidden = !m || phase !== 'open';
        if (phase === 'open') {
            $('marketDeadline').dateTime = new Date(m.endAt).toISOString();
            $('marketDeadline').textContent = 'До ' + ledger.cutoff(m.endAt, m.date);
        }
        if (user.uid === M.OWNER) $('forecastAdminLink').href = 'admin.html' + (m ? '?event=' + encodeURIComponent(m.id) : '') + '#forecasts';
        $('eventResult').hidden = !m || phase === 'open';
        $('ticketConnection').hidden = connected || phase !== 'open';
        $('ticketPosition').hidden = phase !== 'open';
        if (!m) { chart.reset(); return; }
        $('roundSummary').textContent = phase === 'open' ? '' : phase === 'lock' ? 'Торги закрыты. Ждём итог события.' : phaseLabel(m, phase) + '.';
        renderOutcomes(m, phase); chart.update(m, connected);
        renderTicket(); renderBook(m, phase); renderWallet(markets, at); renderOrders(m, phase); renderHistory(m);
        renderReceipt(m, phase);
        if (reviewedOrder && !sameReview()) invalidateReview();
        updateJumps();
        if (firstPaint) {
            firstPaint = false; $('gameSurface').classList.add('forecast-enter');
            const anchor = $(location.hash === '#tradeTicket' ? 'marketOutcomes' : location.hash.slice(1));
            if (phone.matches && anchor && !anchor.closest('[hidden]') && $('roundBody').contains(anchor)) {
                requestAnimationFrame(() => anchor.scrollIntoView({ block: 'start' }));
            }
        }
    }

    async function send(command) {
        if (busy || !ready || !user || !connected) return;
        if (!['order', 'cancel'].includes(command.kind)) return;
        const actor = user.uid, session = epoch;
        busy = true; pendingSnapshot = null;
        const feedback = $(command.kind === 'cancel' ? 'orderFeedback' : 'feedback');
        const report = text => { if (selectedId === command.day) feedback.textContent = text; };
        feedback.textContent = ''; paint();
        try {
            const { id, snapshot } = await ledger.append({ database: api.database, actor, command, now,
                active: () => session === epoch && connected });
            if (session !== epoch) return;
            // The append-only feed can advance while the read confirming our write is in flight.
            const latest = pendingSnapshot?.numChildren() > snapshot.numChildren() ? pendingSnapshot : snapshot;
            pendingSnapshot = null; busy = false;
            syncSnapshot(latest);
            const result = engine.receipts.get(id);
            if (!result || result.error) throw Error(M.errors[result?.error] || 'Не удалось подтвердить действие.');
            if (command.kind === 'cancel') report('Заявка снята.');
            else {
                const m = engine.markets.get(command.day);
                report(orderReceipt(m, m.orderHistory.get(id), M.status(m, now())).text);
                return id;
            }
        } catch (err) { if (session === epoch) report(err.message || 'Не удалось подтвердить действие.'); }
        finally {
            if (session === epoch) {
                busy = false;
                if (pendingSnapshot) { const snapshot = pendingSnapshot; pendingSnapshot = null; syncSnapshot(snapshot); }
                else paint();
            }
        }
    }

    function selectMarket(key, record = true) {
        if (!engine.markets.has(key)) return;
        selectedId = key; historyLimit = 12;
        const url = new URL(location.href);
        if (review.open) review.close();
        closeTradeSheet(false);
        if (record && url.searchParams.get('event') !== key && /^https?:$/.test(url.protocol)) {
            url.searchParams.set('event', key);
            history.pushState(history.state, '', url);
        }
        resetDraft(); expandBook(false); toggleCriteria(false);
        orderLimit = 12; $('allOrders').setAttribute('aria-pressed', 'false');
        $('orderFeedback').textContent = ''; notice(''); paint();
    }
    window.addEventListener('popstate', () => {
        if (!ready) return;
        const requested = new URL(location.href).searchParams.get('event');
        const key = engine.markets.has(requested) ? requested : ledger.orderedMarkets(engine, now())[0]?.id;
        if (key && key !== selectedId) selectMarket(key, false);
    });
    function selectedOutcome() {
        return $('outcomeList').querySelector('[aria-current="true"]') || $('marketOutcomes');
    }

    function closeTradeSheet(restore = true) {
        if (!sheet.contains(tradeTicket)) return;
        if (sheet.open) sheet.close();
        $('ticketPosition').append(tradeTicket);
        if (restore) {
            const price = bookLevel(sheetTrigger?.dataset);
            const fallback = sheetTrigger?.dataset.bookPrice && !book.hidden ? $('bookSide') : selectedOutcome();
            const original = sheetTrigger?.isConnected ? sheetTrigger : price;
            const trigger = original?.getClientRects().length ? original : fallback;
            trigger.focus({ preventScroll: true });
        }
        sheetTrigger = null;
        updateJumps();
    }

    $('closeTradeSheet').addEventListener('click', () => closeTradeSheet());
    sheet.addEventListener('cancel', event => {
        event.preventDefault();
        if (!busy) closeTradeSheet();
    });
    $('changeOutcome').addEventListener('click', () => {
        closeTradeSheet(false);
        selectedOutcome().focus({ preventScroll: true });
        selectedOutcome().scrollIntoView({ block: 'nearest' });
    });
    phone.addEventListener('change', () => {
        if (!phone.matches && sheet.open) {
            closeTradeSheet(false);
            if (!review.open) $('ticketTitle').focus({ preventScroll: true });
        }
        renderTicket();
    });

    function openTradeSheet(trigger) {
        if (sheet.open) return;
        sheetTrigger = trigger;
        sheet.append(tradeTicket);
        sheet.showModal();
        sheet.scrollTop = 0;
        updateTradeViewport();
    }

    function tradeSide(side, trigger, { action, price } = {}) {
        const m = market(), phase = m && M.status(m, now());
        if (!m?.sides.includes(side) || phase !== 'open' || busy) return;
        const fields = tradeForm.elements;
        const changed = fields.side.value !== side || (action && fields.action.value !== action);
        if (changed || action) {
            fields.action.value = action || 'buy';
            fields.side.value = side;
            fields.execution.value = price === undefined ? 'market' : 'limit';
            $('quantity').value = fields.action.value === 'sell' ? '1' : buyQuantity;
        }
        if (price !== undefined) {
            $('limitPrice').value = priceInput(price);
            if (action === 'buy') $('buyUnit').value = 'shares';
            $('quantity').value = '';
        }
        if ($('bookSide').value !== side) {
            $('bookSide').value = side;
            expandBook(false);
        }
        notice(''); renderOutcomes(m, phase); renderTicket(); renderBook(m, phase);
        if (phone.matches) openTradeSheet(trigger);
        else tradeTicket.scrollIntoView({ block: 'nearest' });
        $('ticketTitle').focus({ preventScroll: true });
    }
    $('outcomeList').addEventListener('click', event => {
        const button = event.target.closest('button[data-outcome]');
        if (button) tradeSide(button.dataset.outcome, button);
    });
    book.addEventListener('click', event => {
        const control = event.target.closest('[data-book-price]');
        if (control) tradeSide($('bookSide').value, control,
            { action: control.dataset.bookAction, price: Number(control.dataset.bookPrice) });
    });
    $('bookTrade').addEventListener('click', event => tradeSide($('bookSide').value, event.currentTarget));
    $('chartTrade').addEventListener('click', event => {
        if ($('chartDialog').open) $('chartExpand').click();
        tradeSide($('marketChart').dataset.side, event.currentTarget);
    });
    function toggleCriteria(expanded) {
        $('criteriaToggle').setAttribute('aria-expanded', String(expanded));
        $('eventCriteria').hidden = !expanded;
    }
    $('criteriaToggle').addEventListener('click', () => toggleCriteria($('eventCriteria').hidden));
    $('bookSide').addEventListener('change', () => {
        expandBook(false); renderBook(market(), M.status(market(), now()));
    });
    moreBookLevels.addEventListener('click', () => expandBook(!book.hasAttribute('data-expanded')));
    tradeForm.addEventListener('input', e => {
        if (!['budget','quantity','limitPrice'].includes(e.target.id)) return;
        if (e.target.id === 'quantity' && tradeForm.elements.action.value === 'buy') buyQuantity = e.target.value;
        notice(''); renderTicket();
    });
    tradeForm.addEventListener('change', e => {
        const { action } = tradeForm.elements;
        if (e.target.id === 'buyUnit') {
            if (ticket && $('buyUnit').value === 'shares') $('quantity').value = buyQuantity = String(ticket.qty);
            else if (ticket) {
                const plan = M.preview(engine, ticket, now());
                if (!plan.error) {
                    const cost = ticket.mode === 'limit' ? ticket.qty * ticket.limit : plan.cash;
                    $('budget').value = priceInput(Math.min(cost, M.available(engine, user.uid, selectedId, now())));
                }
            }
        } else if (['action', 'execution'].includes(e.target.name)) {
            if (e.target.name === 'action') $('quantity').value = action.value === 'sell' ? '1' : buyQuantity;
            if (execution.value === 'limit') suggestPrice();
        } else return;
        notice(''); renderTicket();
    });
    function setSize(value) {
        const buy = tradeForm.elements.action.value === 'buy';
        if (buy && $('buyUnit').value === 'points') $('budget').value = String(value / 100).replace('.', ',');
        else {
            $('quantity').value = String(value);
            if (buy) buyQuantity = $('quantity').value;
        }
        notice(''); renderTicket();
    }
    $('sizePresets').addEventListener('click', e => {
        const button = e.target.closest('button');
        if (button && !button.disabled) setSize(Number(button.dataset.value));
    });
    $('useCapacity').addEventListener('click', () => setSize(Number($('sizePresets').lastElementChild.dataset.value)));
    $('useLimit').addEventListener('click', () => {
        execution.value = 'limit'; suggestPrice(); notice(''); renderTicket(); $('limitPrice').focus(); $('limitPrice').select();
    });
    $('buyInstead').addEventListener('click', () => {
        tradeForm.elements.action.value = 'buy'; $('quantity').value = buyQuantity;
        if (execution.value === 'limit') suggestPrice();
        notice(''); renderTicket(); tradeForm.querySelector('[name="action"]:checked').focus();
    });
    $('showOrders').addEventListener('click', event => {
        event.preventDefault(); closeTradeSheet(false); openOrderHistory();
    });
    wallet.addEventListener('click', event => {
        const button = event.target.closest('button[data-market], button[data-wallet-event]');
        if (!button || button.disabled || busy) return;
        const { market: eventId, sell, walletOrder, walletEvent } = button.dataset;
        wallet.open = false;
        const id = eventId || walletEvent;
        const changed = id !== selectedId;
        if (changed) selectMarket(id);
        if (sell) tradeSide(sell, changed ? null : walletToggle, { action: 'sell' });
        else if (walletOrder) openOrderHistory(walletOrder);
        else {
            $('marketOutcomes').focus({ preventScroll: true });
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
    });
    function sameReview() {
        return connected && ticket && reviewedOrder && JSON.stringify(ticket) === JSON.stringify(reviewedOrder.command)
            && reviewedOrder.quote === $('quotePreview').textContent;
    }

    function invalidateReview() {
        reviewedOrder = null;
        $('reviewConfirm').hidden = true;
        $('reviewStatus').textContent = !connected ? 'Связь потеряна. Вернись к форме после подключения.'
            : 'Условия изменились. Вернись к расчёту и проверь его ещё раз.';
        $('reviewBack').focus({ preventScroll: true });
    }

    tradeForm.addEventListener('submit', event => {
        event.preventDefault();
        renderTicket();
        if (!ticket || busy || !connected || review.open) return;
        reviewedOrder = { command: { ...ticket }, quote: $('quotePreview').textContent };
        receivedOrder = '';
        $('reviewTitle').textContent = 'Проверка сделки';
        $('reviewEvent').textContent = market().question;
        const action = ticket.action === 'buy' ? 'Покупка' : 'Продажа';
        $('reviewOrder').textContent = action + ' · ' + shares(ticket.qty) + ' «' + market().answers[ticket.side] + '»';
        $('reviewQuote').replaceChildren(...Array.from($('quotePreview').children, row => row.cloneNode(true)));
        if (ticket.mode === 'limit') $('reviewQuote').prepend(quoteRow(ticket.action === 'buy' ? 'Максимальная цена за долю' : 'Минимальная цена за долю', points(ticket.limit)));
        $('reviewStatus').textContent = '';
        $('reviewBack').textContent = 'Изменить';
        $('reviewBack').disabled = false;
        $('reviewOrders').hidden = true;
        $('reviewConfirm').textContent = ticket.mode === 'limit' ? 'Подтвердить заявку' : ticket.action === 'buy' ? 'Подтвердить покупку' : 'Подтвердить продажу';
        $('reviewConfirm').hidden = false;
        $('reviewConfirm').disabled = false;
        review.showModal();
        $('reviewTitle').focus();
    });
    $('reviewBack').addEventListener('click', () => review.close());
    review.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    review.addEventListener('close', () => {
        if (review.open) return;
        reviewedOrder = null;
        if (receivedOrder) closeTradeSheet();
        receivedOrder = '';
    });
    $('reviewConfirm').addEventListener('click', async () => {
        if (!reviewedOrder || busy) return;
        renderTicket();
        if (!sameReview()) { invalidateReview(); return; }
        const command = reviewedOrder.command, session = epoch;
        reviewedOrder = null;
        $('reviewConfirm').disabled = true;
        $('reviewBack').disabled = true;
        $('reviewStatus').textContent = 'Отправляем…';
        const id = await send(command);
        if (session !== epoch || selectedId !== command.day || !review.open) return;
        $('reviewConfirm').hidden = true;
        $('reviewBack').disabled = false;
        $('reviewQuote').replaceChildren();
        $('reviewBack').textContent = id ? 'Готово' : 'К расчёту';
        if (id) {
            receivedOrder = id;
            renderReceipt(market(), M.status(market(), now()));
        } else {
            $('reviewTitle').textContent = 'Сделка не подтверждена';
            $('reviewStatus').textContent = $('feedback').textContent;
        }
        $('reviewTitle').focus();
    });
    $('reviewOrders').addEventListener('click', () => {
        const id = receivedOrder;
        review.close(); closeTradeSheet(false); openOrderHistory(id);
    });
    for (const button of [$('openOrders'), $('allOrders')]) {
        button.addEventListener('click', () => {
            $('allOrders').setAttribute('aria-pressed', String(button === $('allOrders')));
            renderOrders(market(), M.status(market(), now()));
        });
    }
    $('moreOrders').addEventListener('click', () => {
        orderLimit += 24; renderOrders(market(), M.status(market(), now()));
    });
    $('orderListTitle').closest('.forecast-orders').addEventListener('click', async event => {
        const target = event.target.closest('button[data-order-id]')?.dataset.orderId;
        if (!target || busy || !connected) return;
        const day = selectedId;
        await send({ kind: 'cancel', day, target });
        if (document.activeElement === document.body && ready && selectedId === day) $('orderListTitle').focus({ preventScroll: true });
    });
    $('moreTrades').addEventListener('click', () => { historyLimit += 24; renderHistory(market()); });
    if (!api?.database || !api.auth) { gate('Не удалось подключиться', 'Для входа нужен доступ к серверу аккаунтов.', 'retry'); return; }
    api.database.ref('.info/connected').on('value', snap => { connected = snap.val() === true; paint(); });
    api.database.ref('.info/serverTimeOffset').on('value', snap => { offset = Number(snap.val()) || 0; paint(); });
    api.auth.onAuthStateChanged(activate);
    function tick() {
        if (!ready || document.hidden) return;
        const at = now(), m = market();
        if (at >= nextClose || M.dayKey(at) !== renderedToday || (m && M.status(m, at) !== $('roundState').dataset.state)) paint();
        else chart.tick(at);
    }
    clock = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('pagehide', () => clearInterval(clock));
    window.addEventListener('pageshow', e => { if (e.persisted) { tick(); clock = window.setInterval(tick, 1000); } });
}());
