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
    const { date, phases } = ledger;
    const labels = { yes: 'Да', no: 'Нет' };
    let engine = M.create(), readLedger = ledger.createReader(), selectedId = '', user = null, connected = false, offset = 0, ready = false, busy = false;
    let epoch = 0, clock = 0, connectionTimer, feedOff, pendingSnapshot, historyLimit = 12, ticket = null;
    let firstPaint = true, renderedToday = '';
    let buyQuantity = '5';
    const api = window.AlmanionAccount;
    const now = () => Date.now() + offset;
    const chart = window.createPhysicsForecastChart(now);
    const market = () => engine.markets.get(selectedId);
    const jumpLinks = [...document.querySelectorAll('.forecast-jumps a')];
    const phone = matchMedia('(max-width: 759px)');
    let jumpFrame = 0;
    function updateJumps() {
        if (!phone.matches || jumpFrame) return;
        jumpFrame = requestAnimationFrame(() => {
            jumpFrame = 0;
            if ($('roundBody').hidden || $('gameSurface').hidden || $('chartDialog').open) return;
            const edge = jumpLinks[0].parentElement.getBoundingClientRect().bottom + 14;
            let active = jumpLinks[0];
            for (const link of jumpLinks) {
                const rect = $(link.hash.slice(1)).getBoundingClientRect();
                if (rect.top <= edge) active = rect.bottom >= edge ? link : null;
            }
            for (const link of jumpLinks) {
                if (link === active) link.setAttribute('aria-current', 'location');
                else link.removeAttribute('aria-current');
            }
        });
    }
    window.addEventListener('scroll', updateJumps, { passive: true });
    window.addEventListener('resize', updateJumps);
    function node(tag, text, cls) {
        const element = document.createElement(tag);
        if (text !== undefined) element.textContent = text;
        if (cls) element.className = cls;
        return element;
    }
    function gate(title, body, action) {
        $('accessGate').hidden = false;
        $('gameSurface').hidden = $('connectionNotice').hidden = true;
        $('eventPicker').hidden = true;
        $('roundState').textContent = '';
        $('roundState').removeAttribute('data-state');
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
        paint();
    }

    function clearMarket() {
        clearTimeout(connectionTimer);
        if (feedOff) feedOff();
        feedOff = undefined;
        epoch++; ready = busy = false; selectedId = ''; readLedger = ledger.createReader(); engine = M.create(); ticket = pendingSnapshot = null;
        chart.reset();
        resetDraft();
        $('forecastAdminLink').href = 'admin.html#forecasts';
        $('feedback').textContent = $('orderFeedback').textContent = '';
        for (const id of ['tradeHistory', 'myOrders', 'bookAsks', 'bookBids', 'lessonSelect']) $(id).replaceChildren();
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

    function renderBook(m, phase) {
        const sides = [['bookBids', 'bid'], ['bookAsks', 'ask']];
        let largest = 0;
        const books = sides.map(([id, side]) => {
            const levels = new Map();
            if (phase === 'open') {
                for (const order of M.ranked(m, side)) {
                    const price = M.yesPrice(order);
                    const total = (levels.get(price) || 0) + order.qty;
                    levels.set(price, total);
                    largest = Math.max(largest, total);
                }
            }
            return { id, levels };
        });
        for (const { id, levels } of books) {
            const rows = Array.from(levels, ([price, qty]) => {
                const row = node('li');
                row.style.setProperty('--depth', (100 * qty / largest).toFixed(1) + '%');
                row.append(node('b', amount(price)), node('span', qty));
                return row;
            });
            $(id).replaceChildren(...(rows.length ? rows : [node('li', '—')]));
        }
    }

    function renderHistory(m) {
        const trades = m.trades.filter(t => t.taker === user.uid || t.maker === user.uid).reverse();
        const rows = trades.slice(0, historyLimit).map(t => {
            const isMaker = t.maker === user.uid;
            const side = isMaker ? t.makerSide : t.side;
            const action = isMaker ? t.makerAction : t.action;
            const price = side === 'yes' ? t.yesPrice : 100 - t.yesPrice;
            const row = node('div', undefined, 'forecast-row');
            const info = node('div'); info.append(node('b', (action === 'buy' ? 'Покупка' : 'Продажа') + ' · ' + labels[side]),
                node('small', stampFmt.format(t.at) + ' · ' + t.qty + ' × ' + amount(price)));
            row.append(info, node('strong', amount(price * t.qty) + ' оч.')); return row;
        });
        $('tradeHistory').replaceChildren(...(rows.length ? rows : [node('p', 'В этом прогнозе у тебя пока нет сделок.', 'forecast-footnote')]));
        $('moreTrades').hidden = trades.length <= historyLimit;
    }

    function resetDraft() {
        $('tradeForm').reset();
        buyQuantity = $('quantity').value;
        ticket = null;
    }

    function draftOrder() {
        const { action, side } = $('tradeForm').elements;
        const mode = $('orderMode').value;
        return { kind: 'order', day: selectedId, actor: user.uid, action: action.value, side: side.value, mode,
            limit: mode === 'limit' ? readPoints($('limitPrice').value) : action.value === 'buy' ? 99 : 1 };
    }

    function bestPrice(m, action, side) {
        const lane = (side === 'yes') === (action === 'buy') ? 'ask' : 'bid';
        const best = M.ranked(m, lane)[0];
        return best ? (side === 'yes' ? M.yesPrice(best) : 100 - M.yesPrice(best)) : null;
    }

    function freeShares(m, side, at) {
        return M.position(m, user.uid)[side] - M.held(m, user.uid, at)[side];
    }

    function suggestPrice() {
        const { action, side } = $('tradeForm').elements;
        $('limitPrice').value = priceInput(bestPrice(market(), action.value, side.value) ?? 50);
    }

    function prepareSale(side) {
        const form = $('tradeForm'), at = now();
        form.elements.action.value = 'sell';
        form.elements.side.value = side;
        if ($('orderMode').value === 'limit') suggestPrice();
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
    function showEstimate(order, plan, free) {
        const buy = order.action === 'buy';
        const rows = [quoteRow(buy ? 'К оплате сейчас' : 'К получению сейчас', points(plan.cash))];
        if (plan.left) {
            rows.push(quoteRow((buy ? 'В резерв' : 'К получению при продаже') + ' · ' + shares(plan.left), points(plan.left * order.limit)));
        }
        if (buy && order.mode === 'limit' && order.qty * order.limit > plan.cash + plan.reserved) {
            rows.push(quoteRow('Максимум за всю заявку', points(order.qty * order.limit)));
        }
        if (buy && plan.filled) {
            const factor = fmt.format(100 * plan.filled / plan.cash);
            const payout = plan.left ? 'За купленные доли при «' : 'Выплата при «';
            rows.push(quoteRow(payout + labels[order.side] + '» · ×' + factor, points(plan.filled * 100)));
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

    function showQuoteError(plan, order, byBudget, maxValue) {
        const { error } = plan;
        $('quotePreview').textContent = plan.message || M.errors[error];
        const canResize = maxValue > 0 && ['depth', 'shares', 'cash', 'own', 'size'].includes(error);
        $('useCapacity').hidden = !canResize;
        if (canResize) $('useCapacity').textContent = 'Выбрать ' + (byBudget ? points(maxValue) : shares(maxValue, true));
        $('useLimit').hidden = error !== 'depth' || order.mode !== 'market';
        $('showOrders').hidden = error !== 'reserved' && error !== 'own';
        $('buyInstead').hidden = error !== 'empty';
        $('buyInstead').textContent = 'Купить «' + labels[order.side] + '»';
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
        $('limitField').hidden = order.mode !== 'limit' || emptySale || !open;
        $('limitPrice').disabled = disabled || $('limitField').hidden;
        $('limitLabel').textContent = buy ? 'Максимальная цена за долю, оч.' : 'Минимальная цена за долю, оч.';
        $('sizeFields').hidden = emptySale || !open;
        $('buyUnit').hidden = !buy;
        $('sellUnit').hidden = buy;
        $('budget').hidden = !byBudget; $('budget').disabled = disabled || !byBudget;
        $('quantity').hidden = byBudget; $('quantity').disabled = disabled || byBudget || emptySale;
        $('sizeLabel').htmlFor = byBudget ? 'budget' : 'quantity';
        $('sizeLabel').textContent = byBudget ? 'Сумма покупки' : 'Количество долей';
        const saleBalance = maxQty > 0 && maxQty < free ? 'Свободно ' + free + ' · за раз до ' + maxQty : 'Свободно ' + free + ' из ' + own;
        $('sizeAvailable').textContent = buy ? 'Доступно ' + points(balance) : saleBalance;
        for (const side of ['yes','no']) {
            const price = open ? bestPrice(m, order.action, side) : null;
            $(side + 'Ask').textContent = price === null ? '—' : points(price);
        }
        sizePresets(order, byBudget, free, maxValue, disabled);
        submit.disabled = true; submit.hidden = !open || emptySale;
        submit.textContent = busy ? 'Отправляем…' : buy ? 'Купить доли' : 'Продать доли';
        $('quoteActions').hidden = true;
        if (!open) { preview.replaceChildren(); return; }
        if (emptySale) {
            const message = own ? 'Все доли «' + labels[order.side] + '» уже выставлены на продажу.' : 'У тебя пока нет долей «' + labels[order.side] + '».';
            showQuoteError({ error: own ? 'reserved' : 'empty', message }, order, byBudget, maxValue);
            return;
        }
        const plan = quoteForSize(order, at, byBudget, balance, maxQty, maxValue);
        if (plan.error) { showQuoteError(plan, order, byBudget, maxValue); return; }
        if (order.mode === 'market') {
            order.limit = plan.fills.at(-1).price;
            order.totalLimit = plan.cash;
        }
        ticket = order;
        submit.disabled = disabled;
        if (!busy) submit.textContent = (plan.left ? 'Выставить заявку' : buy ? 'Купить' : 'Продать') +
            (plan.left ? ' · ' : ' ') + shares(order.qty, !plan.left) + ' «' + labels[order.side] + '»';
        showEstimate(order, plan, free);
    }

    function renderAccount(m, phase) {
        const pos = M.position(m, user.uid), reserve = M.held(m, user.uid, now());
        $('walletCash').textContent = amount(M.available(engine, user.uid, selectedId, now())) + ' оч.';
        $('walletHeld').textContent = amount(reserve.cash) + ' оч.';
        $('walletYes').textContent = String(pos.yes); $('walletNo').textContent = String(pos.no);
        for (const side of ['yes', 'no']) {
            const held = $(side === 'yes' ? 'heldYes' : 'heldNo');
            held.textContent = 'В продаже ' + reserve[side] + ' из ' + pos[side];
            held.hidden = !reserve[side];
            const sellButton = document.querySelector('[data-sell="' + side + '"]');
            sellButton.hidden = phase !== 'open' || pos[side] <= reserve[side];
            sellButton.disabled = busy || !connected;
        }
        const paid = phase === 'yes' || phase === 'no';
        $('walletOutcome').textContent = phase === 'void' ? 'Все сделки по этому событию аннулированы.' : paid
            ? 'Выплата ' + pos[phase] + ' оч. · результат по событию ' + amount(pos.cash + pos[phase] * 100) + ' оч.' : '';
        const rows = m.orders.filter(o => phase === 'open' && o.actor === user.uid).map(o => {
            const row = node('div', undefined, 'forecast-row'), info = node('div');
            info.append(node('b', (o.action === 'buy' ? 'Покупка' : 'Продажа') + ' · ' + labels[o.side]), node('small', o.qty + ' дол. по ' + amount(o.limit)));
            const cancel = node('button', 'Снять', 'forecast-secondary'); cancel.type = 'button'; cancel.disabled = busy || !connected || phase !== 'open';
            cancel.addEventListener('click', () => send({ kind: 'cancel', day: selectedId, target: o.id })); row.append(info, cancel); return row;
        });
        $('myOrders').replaceChildren(...(rows.length ? rows : [node('p', 'Активных заявок нет.', 'forecast-footnote')]));
    }

    function renderHeading(m) {
        $('lessonQuestion').textContent = m?.question || 'Прогнозы класса';
        $('lessonQuestion').toggleAttribute('data-long', (m?.question.length || 0) > 70);
        $('lessonDate').textContent = m ? date(m.date) + ' · 10-1' : 'Класс 10-1';
        $('eventCriteria').textContent = m?.criteria || '';
        $('eventCriteria').hidden = !m?.criteria;
    }

    function paint() {
        if (!ready || !user) return;
        $('accessGate').hidden = true; $('gameSurface').hidden = false; $('connectionNotice').hidden = connected;
        const at = now(), markets = ledger.orderedMarkets(engine, at);
        if (!engine.markets.has(selectedId)) {
            const requested = new URLSearchParams(location.search).get('event');
            selectedId = engine.markets.has(requested) ? requested : markets[0]?.id || '';
        }
        const m = market();
        renderedToday = M.dayKey(at);
        ledger.fillPicker($('lessonSelect'), markets, selectedId, at);
        $('lessonSelect').disabled = busy;
        $('eventPicker').hidden = !markets.length;
        renderHeading(m);
        $('emptyRound').hidden = !!m; $('roundBody').hidden = !m;
        const phase = m ? M.status(m, at) : '';
        $('roundState').textContent = phases[phase] || ''; $('roundState').dataset.state = phase;
        if (user.uid === M.OWNER) $('forecastAdminLink').href = 'admin.html' + (m ? '?event=' + encodeURIComponent(m.id) : '') + '#forecasts';
        if (!m) { chart.reset(); return; }
        $('roundSummary').textContent = phase === 'open' ? '' : phase === 'lock' ? 'Ждём итог события.' : phases[phase] + '.';
        chart.update(m, connected); renderTicket(); renderBook(m, phase); renderAccount(m, phase); renderHistory(m);
        updateJumps();
        if (firstPaint) { firstPaint = false; $('gameSurface').classList.add('forecast-enter'); }
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
                const outcome = ' «' + labels[command.side] + '»';
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
        resetDraft(); $('orderFeedback').textContent = ''; notice(''); paint();
    }
    $('lessonSelect').addEventListener('change', e => selectMarket(e.target.value));
    $('tradeForm').addEventListener('input', e => {
        if (!['budget','quantity','limitPrice'].includes(e.target.id)) return;
        if (e.target.id === 'quantity' && $('tradeForm').elements.action.value === 'buy') buyQuantity = e.target.value;
        notice(''); renderTicket();
    });
    $('tradeForm').addEventListener('change', e => {
        const { action, side } = $('tradeForm').elements;
        if (e.target.name === 'action' && action.value === 'sell') {
            const other = side.value === 'yes' ? 'no' : 'yes', at = now(), m = market();
            prepareSale(!freeShares(m, side.value, at) && freeShares(m, other, at) ? other : side.value);
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
        } else if (['action','side'].includes(e.target.name) || e.target.id === 'orderMode') {
            if (e.target.name === 'action') $('quantity').value = buyQuantity;
            if ($('orderMode').value === 'limit') suggestPrice();
        } else return;
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
        $('orderMode').value = 'limit'; suggestPrice(); notice(''); renderTicket(); $('limitPrice').focus(); $('limitPrice').select();
    });
    $('buyInstead').addEventListener('click', () => {
        $('tradeForm').elements.action.value = 'buy'; $('quantity').value = buyQuantity;
        if ($('orderMode').value === 'limit') suggestPrice();
        notice(''); renderTicket(); $('tradeForm').querySelector('[name="action"]:checked').focus();
    });
    for (const button of document.querySelectorAll('[data-sell]')) {
        button.addEventListener('click', () => {
            $('orderMode').value = 'market'; prepareSale(button.dataset.sell); notice(''); renderTicket();
            $('ticketTitle').focus({ preventScroll: true });
            $('tradeTicket').scrollIntoView({ block: 'start' });
        });
    }
    $('tradeForm').addEventListener('submit', e => { e.preventDefault(); if (ticket) send({ ...ticket }); });
    $('moreTrades').addEventListener('click', () => { historyLimit += 24; renderHistory(market()); });
    if (!api?.database || !api.auth) { gate('Не удалось подключиться', 'Для входа нужен доступ к серверу аккаунтов.', 'retry'); return; }
    api.database.ref('.info/connected').on('value', snap => { connected = snap.val() === true; paint(); });
    api.database.ref('.info/serverTimeOffset').on('value', snap => { offset = Number(snap.val()) || 0; paint(); });
    api.auth.onAuthStateChanged(activate);
    function tick() {
        if (!ready || document.hidden) return;
        const at = now(), m = market();
        if (M.dayKey(at) !== renderedToday || (m && M.status(m, at) !== $('roundState').dataset.state)) paint();
        else chart.tick(at);
    }
    clock = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('pagehide', () => clearInterval(clock));
    window.addEventListener('pageshow', e => { if (e.persisted) { tick(); clock = window.setInterval(tick, 1000); } });
}());
