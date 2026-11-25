(function (root) {
    'use strict';

    const DAY = 86400000;
    const INITIAL = 10000; // Integer hundredths of a point throughout the exchange.
    const MAX_QTY = 100;
    const OWNER = '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';
    const MAKER = '@liquidity';
    const sides = ['yes', 'no'];
    const moscow = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
    const dayKey = time => moscow.format(new Date(time));

    function endOfDay(day) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NaN;
        const start = Date.parse(day + 'T00:00:00+03:00');
        return Number.isFinite(start) && dayKey(start) === day ? start + DAY : NaN;
    }

    function create() {
        return { markets: new Map(), receipts: new Map(), n: 0 };
    }

    function position(market, uid) {
        return market.positions.get(uid) || { yes: 0, no: 0, cash: 0 };
    }

    function held(market, uid, at) {
        const reserved = { yes: 0, no: 0, cash: 0 };
        if (at >= market.endAt || market.phase !== 'open') return reserved;
        for (const order of market.orders) {
            if (order.actor !== uid) continue;
            if (order.action === 'buy') reserved.cash += order.qty * order.limit;
            else reserved[order.side] += order.qty;
        }
        return reserved;
    }

    function available(state, uid, day, at) {
        let cash = INITIAL;
        for (const market of state.markets.values()) {
            if (market.phase === 'void') continue;
            const pos = position(market, uid);
            if (sides.includes(market.phase)) cash += pos.cash + 100 * pos[market.phase];
            else {
                const free = pos.cash - held(market, uid, at).cash;
                // Profits still subject to cancellation can only fund this same market.
                cash += market.day === day ? free : Math.min(0, free);
            }
        }
        return cash;
    }

    function status(market, now) {
        return market.phase === 'open' && now >= market.endAt ? 'lock' : market.phase;
    }

    // Buying NO at 35 is equivalent to offering YES at 65. Match both in the same book.
    function bookSide(order) {
        return (order.side === 'yes') === (order.action === 'buy') ? 'bid' : 'ask';
    }
    const yesPrice = order => order.side === 'yes' ? order.limit : 100 - order.limit;

    function ranked(market, side) {
        const sign = side === 'ask' ? 1 : -1;
        return market.orders.filter(order => bookSide(order) === side)
            .sort((a, b) => sign * (yesPrice(a) - yesPrice(b)) || a.priority - b.priority);
    }

    function midpoint(market) {
        const bid = ranked(market, 'bid')[0], ask = ranked(market, 'ask')[0];
        if (bid && ask && yesPrice(ask) - yesPrice(bid) <= 10) return (yesPrice(ask) + yesPrice(bid)) / 2;
        return market.trades.at(-1)?.yesPrice ?? null;
    }

    function recordMark(market, at) {
        const p = midpoint(market);
        if (p !== null && p !== market.chart.at(-1)?.p) market.chart.push({ at, p });
    }

    function openMarket(e) {
        const market = { day: e.day, openedAt: e.at, endAt: e.endAt, phase: 'open', orders: [],
            positions: new Map(), trades: [], chart: [], closedAt: null };
        // Fully funded openings: 2 * (10*49 + 25*45 + 50*35) = 67.30 points per lesson.
        for (const [price, qty] of [[49, 10], [45, 25], [35, 50]]) {
            for (const side of sides) market.orders.push({ id: 'seed-' + side + price, actor: MAKER,
                side, action: 'buy', limit: price, qty, priority: 0 });
        }
        recordMark(market, e.at);
        return market;
    }

    const errors = {
        closed: 'Приём заявок закрыт.', size: 'Укажите от 1 до 100 целых долей.',
        price: 'Цена доли должна быть от 1 до 99 сотых очка.', cash: 'Недостаточно свободных очков.',
        shares: 'Недостаточно свободных долей для продажи.', depth: 'Не хватает встречных заявок по этой цене. Уменьшите количество или задайте свою цену.',
        own: 'На пути исполнения ваша встречная заявка. Сначала снимите её.',
        limit: 'У вас уже 20 открытых заявок на этот урок.', requote: 'Цена изменилась. Проверьте котировку и подтвердите заново.',
        missing: 'Эта заявка уже исполнена или снята.', invalid: 'Действие недоступно.'
    };

    function preview(state, e, now) {
        const market = state.markets.get(e.day);
        if (!market || status(market, now) !== 'open') return { error: 'closed' };
        if (!sides.includes(e.side) || !['buy', 'sell'].includes(e.action) || !['market', 'limit'].includes(e.mode)) return { error: 'invalid' };
        if (!Number.isInteger(e.qty) || e.qty < 1 || e.qty > MAX_QTY) return { error: 'size' };
        if (!Number.isInteger(e.limit) || e.limit < 1 || e.limit > 99) return { error: 'price' };
        if (e.action === 'sell' && position(market, e.actor)[e.side] - held(market, e.actor, now)[e.side] < e.qty) return { error: 'shares' };
        const fills = [];
        let left = e.qty, cash = 0;
        const bid = bookSide(e) === 'bid';
        for (const maker of ranked(market, bid ? 'ask' : 'bid')) {
            const p = yesPrice(maker);
            if (bid ? p > yesPrice(e) : p < yesPrice(e)) break;
            if (maker.actor === e.actor) return { error: 'own' };
            const qty = Math.min(left, maker.qty);
            const price = e.side === 'yes' ? p : 100 - p;
            fills.push({ maker, qty, price });
            cash += price * qty;
            left -= qty;
            if (!left) break;
        }
        if (e.mode === 'market' && left) return { error: 'depth' };
        if (e.mode === 'market' && e.totalLimit !== undefined && (e.action === 'buy' ? cash > e.totalLimit : cash < e.totalLimit)) return { error: 'requote' };
        if (left && market.orders.filter(o => o.actor === e.actor).length >= 20) return { error: 'limit' };
        const reserved = left * e.limit;
        if (e.action === 'buy' && cash + reserved > available(state, e.actor, e.day, now)) return { error: 'cash' };
        return { fills, left, cash, reserved, filled: e.qty - left };
    }

    function maxOrderSize(state, order, at, budget = Infinity) {
        // Each extra share can only increase the cost or consume more of the book.
        let low = 0, high = MAX_QTY;
        while (low < high) {
            const qty = Math.ceil((low + high) / 2);
            const plan = preview(state, { ...order, qty }, at);
            // A cheaper offer may disappear before a limit order reaches the book.
            const cost = order.mode === 'limit' ? qty * order.limit : plan.cash;
            if (!plan.error && (order.action === 'sell' || cost <= budget)) low = qty;
            else high = qty - 1;
        }
        return low;
    }

    function bookFill(market, order, qty, price) {
        const pos = position(market, order.actor);
        const change = order.action === 'buy' ? qty : -qty;
        pos[order.side] += change;
        pos.cash -= change * price;
        market.positions.set(order.actor, pos);
    }

    function match(state, market, e, id) {
        const plan = preview(state, e, e.at);
        if (plan.error) return { error: plan.error };
        for (const { maker, qty, price } of plan.fills) {
            const p = e.side === 'yes' ? price : 100 - price;
            bookFill(market, e, qty, price);
            bookFill(market, maker, qty, maker.side === 'yes' ? p : 100 - p);
            maker.qty -= qty;
            market.trades.push({ at: e.at, qty, yesPrice: p, taker: e.actor, maker: maker.actor,
                side: e.side, action: e.action, makerSide: maker.side, makerAction: maker.action });
        }
        market.orders = market.orders.filter(o => o.qty > 0);
        if (plan.left) market.orders.push({ id, actor: e.actor, side: e.side, action: e.action,
            limit: e.limit, qty: plan.left, priority: e.n });
        recordMark(market, e.at);
        return { filled: plan.filled, left: plan.left, cash: plan.cash };
    }

    function apply(state, e, id) {
        if (e.n !== state.n + 1) throw new Error('Разрыв журнала рынка');
        state.n = e.n;
        const market = state.markets.get(e.day);
        let receipt = { error: 'invalid' };
        if (e.kind === 'open' && e.actor === OWNER && !market && e.endAt === endOfDay(e.day) && e.endAt > e.at) {
            state.markets.set(e.day, openMarket(e));
            receipt = {};
        } else if (market) {
            const phase = status(market, e.at);
            if (e.kind === 'order') receipt = match(state, market, e, id);
            else if (e.kind === 'cancel' && phase === 'open') {
                const index = market.orders.findIndex(o => o.id === e.target && o.actor === e.actor);
                if (index < 0) receipt = { error: 'missing' };
                else { market.orders.splice(index, 1); recordMark(market, e.at); receipt = {}; }
            } else if (e.actor === OWNER && (phase === 'open' || phase === 'lock')
                && (e.kind === 'lock' || e.kind === 'void' || (sides.includes(e.kind) && phase === 'lock' && e.at >= market.endAt - DAY))) {
                if (market.phase === 'open') market.closedAt = Math.min(e.at, market.endAt);
                market.phase = e.kind;
                market.orders.length = 0;
                receipt = {};
            }
        }
        state.receipts.set(id, receipt);
        return receipt;
    }
    const api = { DAY, OWNER, INITIAL, MAX_QTY, dayKey, endOfDay, create, status, held, position, available,
        ranked, yesPrice, midpoint, preview, maxOrderSize, apply, errors };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.PhysicsForecast = api;
}(globalThis));
