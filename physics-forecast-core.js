(function (root) {
    'use strict';

    const DAY = 86400000;
    const INITIAL = 10000; // Integer hundredths of a point throughout the exchange.
    const MAX_BALANCE = 100000000;
    const MAX_QTY = 100;
    const OWNER = '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';
    const MAKER = '@liquidity';
    const SIDE_IDS = ['yes', 'no', 'third', 'fourth'];
    const DEFAULT_ANSWERS = { yes: 'Да', no: 'Нет' };
    const ANSWER_LIMIT = 40;
    const physics = {
        question: 'Будет ли работа по физике?',
        criteria: 'Работа — любое письменное задание, за которое выставляется оценка.'
    };
    const QUESTION_LIMIT = 160, CRITERIA_LIMIT = 400;
    const moscow = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
    const dayKey = time => moscow.format(new Date(time));

    function endOfDay(day) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NaN;
        const start = Date.parse(day + 'T00:00:00+03:00');
        return Number.isFinite(start) && dayKey(start) === day ? start + DAY : NaN;
    }

    function deadline(day, time) {
        const end = endOfDay(day);
        if (!time) return end;
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN;
        const [hours, minutes] = time.split(':').map(Number);
        return end - DAY + (hours * 60 + minutes) * 60000;
    }

    function validDeadline(endAt, at, eventEnd) {
        return Number.isSafeInteger(endAt) && Number.isSafeInteger(eventEnd) && endAt % 60000 === 0 && endAt > at
            && endAt <= eventEnd && eventEnd <= at + 32 * DAY && eventEnd % DAY === 21 * 3600000;
    }

    function validAnswers(answers) {
        if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return false;
        const count = Object.keys(answers).length;
        if (count < 2 || count > SIDE_IDS.length) return false;
        const labels = SIDE_IDS.slice(0, count).map(id => answers[id]);
        return labels.every(label => validText(label, ANSWER_LIMIT) && label === label.trim().replace(/\s+/gu, ' '))
            && new Set(labels.map(label => label.toLowerCase())).size === count;
    }

    function create() {
        return { markets: new Map(), participants: new Set(), adjustments: new Map(), receipts: new Map(), n: 0 };
    }

    function emptyPosition(market) {
        return { ...Object.fromEntries(market.sides.map(id => [id, 0])), cash: 0 };
    }

    function position(market, uid) {
        return market.positions.get(uid) || emptyPosition(market);
    }

    function held(market, uid, at) {
        const reserved = emptyPosition(market);
        if (at >= market.endAt || market.phase !== 'open') return reserved;
        for (const order of market.orders) {
            if (order.actor !== uid) continue;
            if (order.action === 'buy') reserved.cash += order.qty * order.limit;
            else reserved[order.side] += order.qty;
        }
        return reserved;
    }

    function startingBalance(state, uid) {
        return INITIAL + (state.adjustments.get(uid) ?? 0);
    }

    function available(state, uid, marketId, at) {
        let cash = startingBalance(state, uid);
        for (const market of state.markets.values()) {
            if (market.phase === 'void') continue;
            const pos = position(market, uid);
            if (market.sides.includes(market.phase)) cash += pos.cash + 100 * pos[market.phase];
            else {
                const free = pos.cash - held(market, uid, at).cash;
                // Profits still subject to cancellation can only fund this same market.
                cash += market.id === marketId ? free : Math.min(0, free);
            }
        }
        return cash;
    }

    function status(market, now) {
        return market.phase === 'open' && now >= market.endAt ? 'lock' : market.phase;
    }

    // Only two mutually exclusive shares are complements. Larger markets match by outcome.
    const quotePrice = (order, side) => order.side === side ? order.limit : 100 - order.limit;
    function ranked(market, lane, side = 'yes') {
        const sign = lane === 'ask' ? 1 : -1, action = lane === 'ask' ? 'sell' : 'buy';
        return market.orders.filter(order => order.side === side ? order.action === action
            : market.sides.length === 2 && order.action !== action)
            .sort((a, b) => sign * (quotePrice(a, side) - quotePrice(b, side)) || a.priority - b.priority);
    }

    function midpoint(market, side = 'yes') {
        const bid = ranked(market, 'bid', side)[0], ask = ranked(market, 'ask', side)[0];
        if (bid && ask && quotePrice(ask, side) - quotePrice(bid, side) <= 10) return (quotePrice(ask, side) + quotePrice(bid, side)) / 2;
        return market.lastPrices[side] ?? market.marks[side] ?? null;
    }

    function recordMark(market, at) {
        let total = 0;
        for (const side of market.sides) {
            market.marks[side] = midpoint(market, side);
            total += market.marks[side];
        }
        for (const side of market.sides) {
            const p = 100 * market.marks[side] / total, line = market.series[side];
            if (p !== line.at(-1)?.p) line.push({ at, p });
        }
    }

    // Use executed prices, so an unfilled order cannot move a player's score.
    // Untraded outcomes start equally likely. A complete set is worth exactly one point.
    function standings(state, mode = 'settled') {
        const players = new Map();
        for (const market of state.markets.values()) {
            const resolved = market.sides.includes(market.phase);
            const prices = market.sides.map(side => market.lastPrices[side] ?? 100 / market.sides.length);
            const sum = prices.reduce((total, price) => total + price, 0);
            for (const [uid, pos] of market.positions) {
                if (uid === MAKER) continue;
                let player = players.get(uid);
                if (!player) {
                    const balance = startingBalance(state, uid);
                    player = { uid, settled: balance, live: balance };
                    players.set(uid, player);
                }
                if (market.phase === 'void') continue;
                if (resolved) {
                    const gain = pos.cash + 100 * pos[market.phase];
                    player.settled += gain;
                    player.live += gain;
                } else {
                    const valuation = market.sides.reduce((value, side, i) => value + pos[side] * prices[i], 0);
                    player.live += pos.cash + valuation * 100 / sum;
                }
            }
        }
        const rows = [...players.values()];
        for (const row of rows) {
            row.live = Math.round(row.live);
            row.score = mode === 'live' ? row.live : row.settled;
        }
        rows.sort((a, b) => b.score - a.score || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
        rows.forEach((row, i) => { row.rank = i && row.score === rows[i - 1].score ? rows[i - 1].rank : i + 1; });
        return rows;
    }

    function validText(value, limit) {
        return typeof value === 'string' && value.length > 0 && value.length <= limit
            && !value.startsWith(' ') && !value.endsWith(' ') && !/[\r\n\t]/.test(value);
    }

    function eventDetails(e, id) {
        if (!(e.endAt > e.at)) return null;
        // The original ledger used the Moscow calendar date as the market key.
        if (e.endAt === endOfDay(e.day) && e.question === undefined && e.criteria === undefined && e.answers === undefined && e.eventEnd === undefined)
            return { date: e.day, ...physics };
        if (e.day !== id || !/^[-_a-zA-Z0-9]{20}$/.test(id) || !validText(e.question, QUESTION_LIMIT)
            || (e.criteria !== undefined && !validText(e.criteria, CRITERIA_LIMIT))
            || (e.answers !== undefined && !validAnswers(e.answers))
            || !validDeadline(e.endAt, e.at, e.eventEnd ?? e.endAt)) return null;
        return { date: dayKey((e.eventEnd ?? e.endAt) - 1), question: e.question, criteria: e.criteria || '' };
    }

    function openMarket(e, details) {
        const answers = e.answers || DEFAULT_ANSWERS;
        const sides = SIDE_IDS.filter(id => Object.hasOwn(answers, id));
        const series = Object.fromEntries(sides.map(id => [id, []]));
        const market = { id: e.day, ...details, answers, sides, series, marks: {}, lastPrices: {},
            openedAt: e.at, eventEnd: e.eventEnd ?? e.endAt, endAt: e.endAt, phase: 'open', orders: [],
            positions: new Map(), trades: [], closedAt: null };
        function seed(side, action, limit, qty) {
            market.orders.push({ id: 'seed-' + side + limit, actor: MAKER, side, action, limit, qty, priority: 0 });
        }
        if (sides.length === 2) {
            for (const [price, qty] of [[49, 10], [45, 25], [35, 50]])
                for (const side of sides) seed(side, 'buy', price, qty);
        } else {
            // 50 points collateralize 50 complete sets. The remaining 50 cover all starter bids together.
            const inventory = emptyPosition(market), center = Math.round(100 / sides.length);
            inventory.cash = -5000;
            for (const side of sides) {
                inventory[side] = 50;
                for (const [spread, qty] of [[1, 5], [5, 15], [12, 30]]) {
                    seed(side, 'buy', center - spread, qty);
                    seed(side, 'sell', center + spread, qty);
                }
            }
            market.positions.set(MAKER, inventory);
        }
        recordMark(market, e.at);
        return market;
    }

    const errors = {
        closed: 'Приём заявок закрыт.', size: 'Укажите от 1 до 100 целых долей.',
        price: 'Цена доли должна быть от 1 до 99 сотых очка.', cash: 'Недостаточно свободных очков.',
        shares: 'Недостаточно свободных долей для продажи.', depth: 'Не хватает встречных заявок по этой цене. Уменьшите количество или задайте свою цену.',
        own: 'На пути исполнения ваша встречная заявка. Сначала снимите её.',
        limit: 'У вас уже 20 открытых заявок на это событие.', requote: 'Цена изменилась. Проверьте котировку и подтвердите заново.',
        missing: 'Эта заявка уже исполнена или снята.', invalid: 'Действие недоступно.',
        balanceChanged: 'Баланс изменился. Проверь текущую сумму и подтверди заново.'
    };

    function validBalanceChange({ uid, amount, expected }) {
        return typeof uid === 'string' && /^[-_a-zA-Z0-9]{1,128}$/.test(uid)
            && Number.isSafeInteger(amount) && amount >= 0 && amount <= MAX_BALANCE
            && Number.isSafeInteger(expected) && expected >= 0;
    }

    function changeBalance(state, event) {
        if (event.actor !== OWNER || event.day !== undefined || !validBalanceChange(event)) return { error: 'invalid' };
        const before = available(state, event.uid, undefined, event.at);
        if (before !== event.expected) return { error: 'balanceChanged' };
        const adjustment = startingBalance(state, event.uid) - INITIAL + event.amount - before;
        if (!Number.isSafeInteger(adjustment)) return { error: 'invalid' };
        state.adjustments.set(event.uid, adjustment);
        return { before, after: event.amount };
    }

    function preview(state, e, now) {
        const market = state.markets.get(e.day);
        if (!market || status(market, now) !== 'open') return { error: 'closed' };
        if (!market.sides.includes(e.side) || !['buy', 'sell'].includes(e.action) || !['market', 'limit'].includes(e.mode)) return { error: 'invalid' };
        if (!Number.isInteger(e.qty) || e.qty < 1 || e.qty > MAX_QTY) return { error: 'size' };
        if (!Number.isInteger(e.limit) || e.limit < 1 || e.limit > 99) return { error: 'price' };
        if (e.action === 'sell' && position(market, e.actor)[e.side] - held(market, e.actor, now)[e.side] < e.qty) return { error: 'shares' };
        const fills = [];
        let left = e.qty, cash = 0;
        const buying = e.action === 'buy';
        for (const maker of ranked(market, buying ? 'ask' : 'bid', e.side)) {
            const price = quotePrice(maker, e.side);
            if (buying ? price > e.limit : price < e.limit) break;
            if (maker.actor === e.actor) return { error: 'own' };
            const qty = Math.min(left, maker.qty);
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
            bookFill(market, e, qty, price);
            bookFill(market, maker, qty, maker.limit);
            maker.qty -= qty;
            market.lastPrices[e.side] = price;
            if (market.sides.length === 2) market.lastPrices[e.side === 'yes' ? 'no' : 'yes'] = 100 - price;
            market.trades.push({ at: e.at, qty, price, makerPrice: maker.limit, taker: e.actor, maker: maker.actor,
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
        if (e.kind === 'order' || e.kind === 'cancel') state.participants.add(e.actor);
        const market = state.markets.get(e.day);
        let receipt = { error: 'invalid' };
        if (e.kind === 'balance') {
            receipt = changeBalance(state, e);
        } else if (e.kind === 'open' && e.actor === OWNER && !market) {
            const details = eventDetails(e, id);
            if (details) {
                state.markets.set(e.day, openMarket(e, details));
                receipt = {};
            }
        } else if (market) {
            const phase = status(market, e.at);
            if (e.kind === 'order') receipt = match(state, market, e, id);
            else if (e.kind === 'cancel' && phase === 'open') {
                const index = market.orders.findIndex(o => o.id === e.target && o.actor === e.actor);
                if (index < 0) receipt = { error: 'missing' };
                else { market.orders.splice(index, 1); recordMark(market, e.at); receipt = {}; }
            } else if (e.actor === OWNER && e.kind === 'deadline' && phase === 'open' && validDeadline(e.endAt, e.at, market.eventEnd)) {
                market.endAt = e.endAt;
                receipt = {};
            } else if (e.actor === OWNER && (phase === 'open' || phase === 'lock')
                && (e.kind === 'lock' || e.kind === 'void' || (market.sides.includes(e.kind) && phase === 'lock' && e.at >= market.eventEnd - DAY))) {
                if (market.phase === 'open') market.closedAt = Math.min(e.at, market.endAt);
                market.phase = e.kind;
                market.orders.length = 0;
                receipt = {};
            }
        }
        state.receipts.set(id, receipt);
        return receipt;
    }
    const api = { DAY, OWNER, MAKER, INITIAL, MAX_BALANCE, MAX_QTY, physics, QUESTION_LIMIT, CRITERIA_LIMIT, SIDE_IDS, DEFAULT_ANSWERS, ANSWER_LIMIT,
        dayKey, endOfDay, deadline, validDeadline, validAnswers, create, status, held, position, available,
        ranked, quotePrice, midpoint, standings, preview, maxOrderSize, validBalanceChange, apply, errors };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.PhysicsForecast = api;
}(globalThis));
