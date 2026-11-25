(function () {
    'use strict';
    const M = window.PhysicsForecast;
    const $ = id => document.getElementById(id);
    const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
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
    let renderedMarket = '';
    let engine = M.create(), readLedger = ledger.createReader(), selectedId = '', user = null, connected = false, offset = 0, ready = false, busy = false;
    let epoch = 0, clock = 0, connectionTimer, feedOff, pendingSnapshot, historyLimit = 12, ticket = null;
    let firstPaint = true, renderedToday = '', nextClose = Infinity;
    let buyQuantity = '5';
    const api = window.AlmanionAccount;
    const now = () => Date.now() + offset;
    const chart = window.createPhysicsForecastChart(now);
    const guide = window.createForecastGuide();
    const ranking = window.createForecastRanking(api, amount);
    const eventPicker = $('eventPicker'), eventDialog = $('forecastEvents'), eventList = $('forecastEventList');
    let eventListVersion = '';
    const execution = $('tradeForm').elements.execution;
    const market = () => engine.markets.get(selectedId);
    const jumpBar = $('forecastJumps'), jumpLinks = [...jumpBar.querySelectorAll('a')];
    const phone = matchMedia('(max-width: 759px), (orientation: landscape) and (max-width: 1024px) and (max-height: 540px) and (pointer: coarse)');
    const book = $('publicOrders'), moreBookLevels = $('moreBookLevels');
    const bookJump = jumpBar.querySelector('a[href="#publicOrders"]');
    let jumpFrame = 0;
    function updateJumps() {
        if (!phone.matches || jumpBar.hidden || jumpFrame) return;
        jumpFrame = requestAnimationFrame(() => {
            jumpFrame = 0;
            if (jumpBar.hidden || $('chartDialog').open) return;
            const edge = Math.min(100, innerHeight * .24);
            let active = jumpLinks[0];
            for (const link of jumpLinks) {
                if (!link.hidden && $(link.hash.slice(1)).getBoundingClientRect().top <= edge) active = link;
            }
            const bottom = document.scrollingElement.scrollHeight - scrollY - innerHeight;
            if (bottom <= 2 && scrollY > 0) {
                const destination = jumpLinks.find(link => !link.hidden && link.hash === location.hash);
                const target = destination && $(destination.hash.slice(1)).getBoundingClientRect();
                active = target && target.bottom >= edge && target.top < innerHeight * .6
                    ? destination : jumpLinks.at(-1);
            }
            for (const link of jumpLinks) {
                if (link === active) link.setAttribute('aria-current', 'location');
                else link.removeAttribute('aria-current');
            }
        });
    }
    function arrangePanels() {
        if (phone.matches) $('portfolio').before(book);
        else $('roundBody').append(book);
        updateJumps();
    }
    function updateDockForKeyboard() {
        const typing = document.activeElement?.matches('#budget, #quantity, #limitPrice');
        const keyboard = window.visualViewport && innerHeight - window.visualViewport.height > 120;
        jumpBar.toggleAttribute('data-keyboard', Boolean(typing && keyboard));
    }
    arrangePanels();
    phone.addEventListener('change', arrangePanels);
    window.addEventListener('scroll', updateJumps, { passive: true });
    window.addEventListener('resize', updateJumps);
    window.addEventListener('hashchange', updateJumps);
    window.visualViewport?.addEventListener('resize', updateDockForKeyboard);
    document.addEventListener('focusin', updateDockForKeyboard);
    document.addEventListener('focusout', () => requestAnimationFrame(updateDockForKeyboard));
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
        const phases = markets.map(item => M.status(item, at));
        const version = JSON.stringify([selectedId, markets.map((item, i) => [item.id, phases[i], item.endAt])]);
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
            const phase = phases[i];
            const button = node('button', undefined, 'forecast-event-choice');
            button.type = 'button';
            button.dataset.eventId = item.id;
            if (item.id === selectedId) button.setAttribute('aria-current', 'true');
            const detail = phase === 'open' && item.endAt < item.eventEnd ? 'До ' + ledger.cutoff(item.endAt, item.date)
                : phase !== 'open' && phase !== 'lock' ? phaseLabel(item, phase) : '';
            button.append(node('span', item.question, 'forecast-event-question'),
                node('span', date(item.date) + (detail ? ' · ' + detail : ''), 'forecast-event-caption'));
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
        if (id !== selectedId) selectMarket(id);
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
        if (feedOff) feedOff();
        feedOff = undefined;
        epoch++; ready = busy = false; selectedId = ''; readLedger = ledger.createReader(); engine = M.create(); ticket = pendingSnapshot = null;
        chart.reset();
        ranking.reset();
        renderedMarket = '';
        resetDraft(); expandBook(false); toggleCriteria(false);
        $('forecastAdminLink').href = 'admin.html#forecasts';
        $('feedback').textContent = $('orderFeedback').textContent = '';
        if (eventDialog.open) eventDialog.close();
        eventList.replaceChildren();
        eventListVersion = '';
        for (const id of ['tradeHistory', 'myOrders', 'bookAsks', 'bookBids']) $(id).replaceChildren();
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
            gate('Войди, чтобы открыть рынок', 'Для участия нужен аккаунт Almanion.', 'login');
            return;
        }
        subscribe();
    }

    const suffix = side => side[0].toUpperCase() + side.slice(1);
    function buildAnswerControls(m) {
        if (renderedMarket === m.id) return;
        renderedMarket = m.id;
        const choices = $('tradeAnswers'), balances = $('walletBalances');
        choices.toggleAttribute('data-compact', m.sides.length === 2 && m.sides.every(side => m.answers[side].length <= 5));
        for (const label of choices.querySelectorAll('label')) label.remove();
        for (const row of balances.querySelectorAll('[data-holding]')) row.remove();
        for (const side of m.sides) {
            const name = m.answers[side], label = node('label'), radio = node('input'), content = node('span'), price = node('b');
            label.dataset.side = side;
            radio.type = 'radio'; radio.name = 'side'; radio.value = side; radio.defaultChecked = side === m.sides[0];
            price.id = side + 'Ask'; content.append(node('span', name), price); label.append(radio, content); choices.append(label);
            const holding = node('div'), value = node('dd'), quantity = node('span'), sell = node('button', 'Продать');
            const reserved = node('dd', '', 'forecast-reserve');
            holding.dataset.holding = side; quantity.id = 'wallet' + suffix(side); reserved.id = 'held' + suffix(side);
            sell.type = 'button'; sell.dataset.sell = side; sell.setAttribute('aria-label', 'Продать доли «' + name + '»');
            value.append(quantity, sell); holding.append(node('dt', 'Доли «' + name + '»'), value, reserved); balances.append(holding);
        }
        $('bookSide').replaceChildren(...m.sides.map(side => new Option(m.answers[side], side)));
    }

    function renderBook(m, phase) {
        book.hidden = phase !== 'open';
        bookJump.hidden = book.hidden;
        if (phase !== 'open') return;
        const selected = $('bookSide').value, lanes = [['bookBids', 'bid'], ['bookAsks', 'ask']];
        const label = m.answers[selected];
        $('bookSideLabel').textContent = label;
        $('bookSideLabel').parentElement.toggleAttribute('data-long', label.length > 12);
        let largest = 0;
        const books = lanes.map(([id, lane]) => {
            const levels = new Map();
            for (const order of M.ranked(m, lane, selected)) {
                const price = M.quotePrice(order, selected);
                const total = (levels.get(price) || 0) + order.qty;
                levels.set(price, total);
                largest = Math.max(largest, total);
            }
            return { id, levels };
        });
        for (const { id, levels } of books) {
            const rows = Array.from(levels, ([price, qty]) => {
                const row = node('tr'), quantity = node('td'), bar = node('span', undefined, 'forecast-depth');
                bar.setAttribute('aria-hidden', 'true');
                row.style.setProperty('--depth', (100 * qty / largest).toFixed(1) + '%');
                quantity.append(bar, node('span', fmt.format(qty)));
                row.append(node('td', priceInput(price)), quantity);
                return row;
            });
            const empty = id === 'bookBids' ? 'Пока нет покупателей' : 'Пока нет продавцов';
            if (!rows.length) {
                const row = node('tr'), cell = node('td', empty, 'forecast-book-empty');
                cell.colSpan = 2; row.append(cell); rows.push(row);
            }
            $(id).replaceChildren(...rows);
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
                node('small', stampFmt.format(t.at) + ' · ' + t.qty + ' × ' + amount(price)));
            row.append(info, node('strong', amount(price * t.qty) + ' оч.')); return row;
        });
        $('tradeHistory').replaceChildren(...(rows.length ? rows : [node('p', 'В этом прогнозе у тебя пока нет сделок.', 'forecast-footnote')]));
        $('moreTrades').hidden = trades.length <= historyLimit;
        $('walletTradeCount').textContent = fmt.format(trades.length);
    }

    function resetDraft() {
        $('tradeForm').reset();
        buyQuantity = $('quantity').value;
        ticket = null;
    }

    function draftOrder() {
        const { action, side } = $('tradeForm').elements;
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
        const { action, side } = $('tradeForm').elements;
        const m = market();
        $('limitPrice').value = priceInput(bestPrice(m, action.value, side.value) ?? Math.round(m.marks[side.value]));
    }

    function prepareSale(side) {
        const form = $('tradeForm'), at = now();
        form.elements.action.value = 'sell';
        form.elements.side.value = side;
        if (execution.value === 'limit') suggestPrice();
        const free = freeShares(market(), side, at);
        const tradable = free ? M.maxOrderSize(engine, draftOrder(), at) : 0;
        $('quantity').value = String(tradable || Math.min(free, M.MAX_QTY) || 1);
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
        const rows = [quoteRow(buy ? 'К оплате сейчас' : 'К получению сейчас', points(plan.cash))];
        if (unusedLimit > 0) rows.push(quoteRow('Из лимита останется', points(unusedLimit)));
        if (plan.left) {
            rows.push(quoteRow((buy ? 'В резерв' : 'К получению при продаже') + ' · ' + shares(plan.left), points(plan.left * order.limit)));
        }
        if (buy && order.mode === 'limit' && order.qty * order.limit > plan.cash + plan.reserved) {
            rows.push(quoteRow('Максимум за всю заявку', points(order.qty * order.limit)));
        }
        if (buy && plan.filled) {
            const factor = fmt.format(100 * plan.filled / plan.cash);
            const payout = plan.left ? 'За купленные доли при «' : 'Выплата при «';
            rows.push(quoteRow(payout + market().answers[order.side] + '» · ×' + factor, points(plan.filled * 100)));
        } else if (!buy && !plan.left) {
            rows.push(quoteRow('Останется свободных долей', String(free - plan.filled)));
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
        const form = $('tradeForm'), preview = $('quotePreview'), submit = $('placeOrder');
        ticket = null;
        for (const control of form.elements) control.disabled = disabled;
        for (const group of form.querySelectorAll('fieldset')) group.hidden = !open;
        $('closedPortfolio').hidden = open;
        $('limitField').hidden = order.mode !== 'limit' || emptySale || !open;
        $('limitPrice').disabled = disabled || $('limitField').hidden;
        $('limitLabel').textContent = buy ? 'Максимальная цена за долю, оч.' : 'Минимальная цена за долю, оч.';
        $('sizeFields').hidden = emptySale || !open;
        $('buyUnit').hidden = !buy;
        $('sellUnit').hidden = buy;
        $('budget').hidden = !byBudget; $('budget').disabled = disabled || !byBudget;
        $('quantity').hidden = byBudget; $('quantity').disabled = disabled || byBudget || emptySale;
        $('sizeLabel').htmlFor = byBudget ? 'budget' : 'quantity';
        $('sizeLabel').textContent = byBudget ? 'Лимит покупки' : 'Количество долей';
        const saleBalance = maxQty > 0 && maxQty < free ? 'Свободно ' + free + ' · за раз до ' + maxQty : 'Свободно ' + free + ' из ' + own;
        $('sizeAvailable').textContent = buy ? 'Доступно ' + points(balance) : saleBalance;
        for (const side of m.sides) {
            const price = open ? bestPrice(m, order.action, side) : null;
            const label = $(side + 'Ask');
            label.textContent = price === null ? (buy ? 'Нет продавцов' : 'Нет покупателей') : points(price);
            label.classList.toggle('forecast-price-empty', price === null);
        }
        sizePresets(order, byBudget, free, maxValue, disabled);
        submit.disabled = true; submit.hidden = !open || emptySale;
        submit.textContent = busy ? 'Отправляем…' : buy ? 'Купить доли' : 'Продать доли';
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
        if (!busy) submit.textContent = (plan.left ? 'Выставить заявку' : buy ? 'Купить' : 'Продать') +
            (plan.left ? ' · ' : ' ') + shares(order.qty, !plan.left) + ' «' + market().answers[order.side] + '»';
        const unusedLimit = byBudget && order.mode === 'market' && order.qty === maxQty
            ? readPoints($('budget').value) - plan.cash : 0;
        showEstimate(order, plan, free, unusedLimit);
    }

    function renderAccount(m, phase) {
        const pos = M.position(m, user.uid), reserve = M.held(m, user.uid, now());
        $('walletCash').textContent = amount(M.available(engine, user.uid, selectedId, now())) + ' оч.';
        $('walletHeld').textContent = amount(reserve.cash) + ' оч.';
        for (const side of m.sides) {
            $('wallet' + suffix(side)).textContent = String(pos[side]);
            const held = $('held' + suffix(side));
            held.textContent = 'В продаже ' + reserve[side] + ' из ' + pos[side];
            held.hidden = !reserve[side];
            const sellButton = document.querySelector('[data-sell="' + side + '"]');
            sellButton.hidden = phase !== 'open' || pos[side] <= reserve[side];
            sellButton.disabled = busy || !connected;
        }
        const paid = m.sides.includes(phase);
        $('walletOutcome').textContent = phase === 'void' ? 'Все сделки по этому событию аннулированы.' : paid
            ? 'Выплата ' + pos[phase] + ' оч. · результат по событию ' + amount(pos.cash + pos[phase] * 100) + ' оч.' : '';
        const rows = m.orders.filter(o => phase === 'open' && o.actor === user.uid).map(o => {
            const row = node('div', undefined, 'forecast-row'), info = node('div');
            info.append(node('b', (o.action === 'buy' ? 'Покупка' : 'Продажа') + ' · ' + m.answers[o.side]), node('small', shares(o.qty) + ' по ' + points(o.limit)));
            const cancel = node('button', 'Снять заявку', 'forecast-secondary'); cancel.type = 'button'; cancel.disabled = busy || !connected || phase !== 'open';
            cancel.addEventListener('click', () => send({ kind: 'cancel', day: selectedId, target: o.id })); row.append(info, cancel); return row;
        });
        $('myOrders').replaceChildren(...(rows.length ? rows : [node('p', 'У тебя нет заявок в ожидании сделки.', 'forecast-footnote')]));
        $('walletOrderCount').textContent = fmt.format(rows.length);
    }

    function renderHeading(m) {
        $('lessonQuestion').textContent = m?.question || 'Прогнозы класса';
        $('lessonQuestion').toggleAttribute('data-long', (m?.question.length || 0) > 70);
        $('lessonDate').textContent = m ? date(m.date) + ' · 10-1' : 'Класс 10-1';
        $('eventCriteria').textContent = m?.criteria || '';
        $('eventCriteria').hidden = !m?.criteria;
        $('criteriaToggle').hidden = (m?.criteria?.length || 0) <= 118;
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
        const phase = m ? M.status(m, at) : '';
        guide.setMarket(m, m ? phase : 'empty');
        $('roundState').textContent = phaseLabel(m, phase); $('roundState').dataset.state = phase;
        $('marketDeadline').hidden = !m || phase !== 'open';
        if (phase === 'open') {
            $('marketDeadline').dateTime = new Date(m.endAt).toISOString();
            $('marketDeadline').textContent = 'До ' + ledger.cutoff(m.endAt, m.date);
        }
        if (user.uid === M.OWNER) $('forecastAdminLink').href = 'admin.html' + (m ? '?event=' + encodeURIComponent(m.id) : '') + '#forecasts';
        if (!m) { chart.reset(); return; }
        buildAnswerControls(m);
        $('roundSummary').textContent = phase === 'open' ? '' : phase === 'lock' ? 'Торги закрыты. Ждём итог события.' : phaseLabel(m, phase) + '.';
        chart.update(m, connected); renderTicket(); renderBook(m, phase); renderAccount(m, phase); renderHistory(m);
        updateJumps();
        if (firstPaint) {
            firstPaint = false; $('gameSurface').classList.add('forecast-enter');
            const anchor = $(location.hash.slice(1));
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
        feedback.textContent = ''; paint();
        try {
            const { id, snapshot } = await ledger.append({ database: api.database, actor, command, engine, now,
                active: () => session === epoch && connected });
            if (session !== epoch) return;
            pendingSnapshot = null; busy = false;
            syncSnapshot(snapshot);
            const result = engine.receipts.get(id);
            if (!result || result.error) throw Error(M.errors[result?.error] || 'Не удалось подтвердить действие.');
            if (command.kind === 'cancel') feedback.textContent = 'Заявка снята.';
            else {
                const outcome = ' «' + engine.markets.get(command.day).answers[command.side] + '»';
                const parts = [];
                if (result.filled) parts.push((command.action === 'buy' ? 'Покупка' : 'Продажа') + ' · ' + shares(result.filled) + outcome + ' за ' + points(result.cash));
                if (result.left) parts.push('В открытой заявке ' + shares(result.left) + outcome + ' по ' + points(command.limit));
                feedback.textContent = parts.join(' · ');
            }
        } catch (err) { if (session === epoch) feedback.textContent = err.message || 'Не удалось подтвердить действие.'; }
        finally {
            if (session === epoch) {
                busy = false;
                if (pendingSnapshot) { const snapshot = pendingSnapshot; pendingSnapshot = null; syncSnapshot(snapshot); }
                else paint();
            }
        }
    }

    function selectMarket(key) {
        if (!engine.markets.has(key)) return;
        selectedId = key; historyLimit = 12;
        const url = new URL(location.href);
        if (url.searchParams.get('event') !== key && /^https?:$/.test(url.protocol)) {
            url.searchParams.set('event', key);
            history.replaceState(history.state, '', url);
        }
        resetDraft(); expandBook(false); toggleCriteria(false);
        $('orderFeedback').textContent = ''; notice(''); paint();
    }
    function toggleCriteria(expanded) {
        $('criteriaToggle').setAttribute('aria-expanded', String(expanded));
        $('criteriaToggle').textContent = expanded ? 'Свернуть условия' : 'Читать условия';
        $('eventCriteria').toggleAttribute('data-expanded', expanded);
    }
    $('criteriaToggle').addEventListener('click', () => toggleCriteria(!$('eventCriteria').hasAttribute('data-expanded')));
    $('bookSide').addEventListener('change', () => {
        expandBook(false); renderBook(market(), M.status(market(), now()));
    });
    moreBookLevels.addEventListener('click', () => expandBook(!book.hasAttribute('data-expanded')));
    $('tradeForm').addEventListener('input', e => {
        if (!['budget','quantity','limitPrice'].includes(e.target.id)) return;
        if (e.target.id === 'quantity' && $('tradeForm').elements.action.value === 'buy') buyQuantity = e.target.value;
        notice(''); renderTicket();
    });
    $('tradeForm').addEventListener('change', e => {
        const { action, side } = $('tradeForm').elements;
        if (e.target.name === 'action' && action.value === 'sell') {
            const at = now(), m = market();
            prepareSale(freeShares(m, side.value, at) ? side.value : m.sides.find(id => freeShares(m, id, at)) || side.value);
        } else if (e.target.name === 'side' && action.value === 'sell') {
            prepareSale(side.value);
        } else if (e.target.id === 'buyUnit') {
            if (ticket && $('buyUnit').value === 'shares') $('quantity').value = buyQuantity = String(ticket.qty);
            else if (ticket) {
                const plan = M.preview(engine, ticket, now());
                if (!plan.error) {
                    const cost = ticket.mode === 'limit' ? ticket.qty * ticket.limit : plan.cash;
                    $('budget').value = priceInput(Math.min(cost, M.available(engine, user.uid, selectedId, now())));
                }
            }
        } else if (['action', 'side', 'execution'].includes(e.target.name)) {
            if (e.target.name === 'action') $('quantity').value = buyQuantity;
            if (execution.value === 'limit') suggestPrice();
        } else return;
        if (e.target.name === 'side' || e.target.name === 'action') {
            $('bookSide').value = side.value;
            renderBook(market(), M.status(market(), now()));
        }
        notice(''); renderTicket();
    });
    function setSize(value) {
        const buy = $('tradeForm').elements.action.value === 'buy';
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
        $('tradeForm').elements.action.value = 'buy'; $('quantity').value = buyQuantity;
        if (execution.value === 'limit') suggestPrice();
        notice(''); renderTicket(); $('tradeForm').querySelector('[name="action"]:checked').focus();
    });
    $('walletBalances').addEventListener('click', event => {
        const button = event.target.closest('[data-sell]');
        if (!button || button.disabled) return;
        execution.value = 'market'; prepareSale(button.dataset.sell); notice(''); renderTicket();
        $('bookSide').value = button.dataset.sell; renderBook(market(), M.status(market(), now()));
        $('ticketTitle').focus({ preventScroll: true });
        $('tradeTicket').scrollIntoView({ block: 'start' });
    });
    $('tradeForm').addEventListener('submit', e => { e.preventDefault(); if (ticket) send({ ...ticket }); });
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
