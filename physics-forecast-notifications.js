(function () {
    'use strict';
    const M = window.PhysicsForecast, ledger = window.ForecastLedger;
    const recentLimit = 40;
    const format = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
    const plural = new Intl.PluralRules('ru-RU');
    const points = value => format.format(value / 100) + ' оч.';
    const shares = qty => format.format(qty) + ' ' + ({ one: 'доля', few: 'доли', many: 'долей' })[plural.select(qty)];

    function entries(engine, uid, baseUrl) {
        const items = [];
        for (const market of engine.markets.values()) {
            const { id: eventId, question: title } = market;
            let participated = false;
            for (const order of market.orderHistory.values()) {
                if (order.actor !== uid) continue;
                participated = true;
                if (!order.lastFill) continue;
                const { id, side, action, qty, filled, cash, lastFill } = order;
                const partial = filled < qty;
                const quantity = partial ? format.format(filled) + ' из ' + shares(qty) : shares(qty);
                const direction = action === 'buy' ? 'Покупка' : 'Продажа';
                items.push({ id, title, kind: 'forecast', at: lastFill.at, n: lastFill.n,
                    seenKey: id + ':' + lastFill.id,
                    context: partial ? 'Заявка исполнена частично' : 'Заявка исполнена',
                    description: direction + ' «' + market.answers[side] + '» · ' + quantity + ' · ' + points(cash),
                    href: ledger.eventUrl(baseUrl, eventId, { order: id }).href });
            }
            const resolution = market.resolution;
            if (!participated || !resolution) continue;
            const result = M.settlement(market, uid);
            const outcome = market.answers[market.phase];
            const context = result.payout ? 'Начислена выплата' : result.refund ? 'Очки возвращены'
                : outcome ? 'Объявлен итог' : 'Прогноз отменён';
            const description = outcome ? 'Итог «' + outcome + '» · выплата ' + points(result.payout)
                : result.refund ? 'Возврат ' + points(result.refund)
                    : result.reversed ? 'Отменён доход · ' + points(result.reversed) : 'Баланс по прогнозу восстановлен';
            items.push({ id: resolution.id, kind: 'forecast', title, context, description,
                at: resolution.at, n: resolution.n, seenKey: resolution.id,
                href: ledger.eventUrl(baseUrl, eventId, { result: true }).href });
        }
        return items.sort((a, b) => b.n - a.n).slice(0, recentLimit);
    }

    function create({ uid, baseUrl, read, write, changed }) {
        const key = 'almanion:forecast:read:' + uid;
        let seen = new Set(), items = [], status = 'loading';
        function syncRead() {
            try {
                const stored = JSON.parse(read(key));
                if (Array.isArray(stored)) for (const id of stored.slice(-200)) seen.add(id);
            } catch { /* Keep read state in memory when browser storage is unavailable. */ }
        }
        function publish() {
            const current = items.map(item => ({ ...item, unread: !seen.has(item.seenKey) }));
            changed({ status, entries: current, count: current.filter(item => item.unread).length });
        }
        syncRead();
        const onStorage = event => { if (event.key === key) { syncRead(); publish(); } };
        window.addEventListener('storage', onStorage);
        let currentEngine, sequence;
        return {
            update(engine, nextStatus = 'ready') {
                if (currentEngine === engine && sequence === engine?.n && status === nextStatus) return;
                currentEngine = engine;
                sequence = engine?.n;
                status = nextStatus;
                if (engine) items = entries(engine, uid, baseUrl);
                publish();
            },
            mark(id, afterClick) {
                syncRead();
                for (const item of items) if (!id || id === item.seenKey) seen.add(item.seenKey);
                seen = new Set([...seen].slice(-200));
                write(key, JSON.stringify([...seen]));
                if (afterClick) setTimeout(publish, 0);
                else publish();
            },
            stop() { window.removeEventListener('storage', onStorage); }
        };
    }

    window.ForecastNotifications = { create };
}());
