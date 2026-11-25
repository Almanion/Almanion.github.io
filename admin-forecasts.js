(function () {
    'use strict';
    const M = window.PhysicsForecast, ledger = window.ForecastLedger;
    const byId = id => document.getElementById(id);
    const numbers = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
    const timestamp = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

    window.createAdminForecasts = function ({ database, currentUser, accountName }) {
        const picker = byId('forecastPicker'), feedback = byId('adminFeedback'), workspace = byId('forecastWorkspace');
        const statusLine = byId('forecastLoadStatus'), retry = byId('forecastRetry'), marketLink = byId('forecastMarketLink');
        const subscriptions = [];
        let active = false, initialized = false, connected = false, busy = false, generation = 0;
        let offset = 0, selected = '', limit = 15, interval, timeout, pending = null;
        let readLedger = ledger.createReader(), engine = M.create();
        const now = () => Date.now() + offset;
        const isOwner = () => currentUser()?.uid === M.OWNER;
        const chart = window.createPhysicsForecastChart(now);
        const form = window.createForecastAdmin({ now, formatDate: ledger.date, phaseLabel: ledger.phases, selectMarket, send });

        function selectMarket(id) {
            if (!engine.markets.has(id)) return;
            selected = id;
            limit = 15;
            form.showSelected();
            const url = new URL(location.href);
            if (/^https?:$/.test(url.protocol) && url.searchParams.get('event') !== id) {
                url.searchParams.set('event', id);
                history.replaceState(history.state, '', url);
            }
            paint();
        }

        function actorName(uid) {
            return uid === M.MAKER ? 'Стартовая ликвидность' : accountName(uid) || 'Участник';
        }

        function renderTrades(market) {
            const trades = market?.trades || [], rows = [];
            for (let i = trades.length - 1; i >= Math.max(0, trades.length - limit); i--) {
                const trade = trades[i], row = document.createElement('li');
                const main = document.createElement('div'), amount = document.createElement('div');
                const title = document.createElement('strong'), parties = document.createElement('span');
                const value = document.createElement('strong'), moment = document.createElement('time');
                const price = (trade.side === 'yes' ? trade.yesPrice : 100 - trade.yesPrice) / 100;
                title.textContent = (trade.action === 'buy' ? 'Покупка' : 'Продажа') + ' · ' + (trade.side === 'yes' ? 'Да' : 'Нет');
                parties.textContent = actorName(trade.taker) + ' · ' + actorName(trade.maker);
                value.textContent = trade.qty + ' × ' + numbers.format(price) + ' оч.';
                moment.dateTime = new Date(trade.at).toISOString();
                moment.textContent = timestamp.format(trade.at) + ' мск';
                main.append(title, parties); amount.append(value, moment); row.append(main, amount); rows.push(row);
            }
            byId('forecastTape').replaceChildren(...rows);
            byId('forecastTradeCount').textContent = trades.length ? 'Всего сделок · ' + numbers.format(trades.length) : 'Сделок пока нет.';
            byId('forecastMoreTrades').hidden = trades.length <= limit;
        }

        function paint() {
            if (!active || !isOwner() || !initialized) return;
            const at = now(), markets = ledger.orderedMarkets(engine, at);
            if (!engine.markets.has(selected)) {
                const requested = new URLSearchParams(location.search).get('event');
                selected = engine.markets.has(requested) ? requested : markets[0]?.id || '';
            }
            const market = engine.markets.get(selected);
            const traders = new Set();
            let open = 0, locked = 0, fills = 0;
            for (const item of markets) {
                const phase = M.status(item, at);
                if (phase === 'open') open++;
                if (phase === 'lock') locked++;
                fills += item.trades.length;
                for (const uid of item.positions.keys()) if (uid !== M.MAKER) traders.add(uid);
            }
            byId('forecastOpen').textContent = numbers.format(open);
            byId('forecastPending').textContent = numbers.format(locked);
            byId('forecastTraders').textContent = numbers.format(traders.size);
            byId('forecastFills').textContent = numbers.format(fills);
            statusLine.textContent = connected ? '' : 'Нет связи. Показаны последние данные.';
            workspace.hidden = false;
            retry.hidden = connected;
            ledger.fillPicker(picker, markets, selected, at);
            picker.disabled = busy;
            byId('forecastPickerLabel').hidden = !market;
            byId('forecastEventData').hidden = !market;
            marketLink.href = 'physics-forecast.html' + (market ? '?event=' + encodeURIComponent(selected) : '');
            form.render(true, market, markets, busy, connected);
            renderTrades(market);
            if (market) chart.update(market, connected);
            else chart.reset();
        }

        function accept(snapshot) {
            engine = readLedger(snapshot);
            initialized = true;
            clearTimeout(timeout);
            paint();
        }

        async function send(command) {
            if (!active || !isOwner() || !initialized || busy || !connected) return;
            const session = generation;
            const current = () => active && session === generation && isOwner();
            busy = true; pending = null; feedback.textContent = '';
            paint();
            try {
                const { id, day, snapshot } = await ledger.append({ actor: M.OWNER, command, database, engine, now,
                    active: () => current() && connected });
                if (!current()) return;
                pending = null;
                accept(snapshot);
                const result = engine.receipts.get(id);
                if (!result || result.error) throw Error(M.errors[result?.error] || 'Сервер не подтвердил действие.');
                if (command.kind === 'open') { form.resetForm(); selectMarket(day); }
                feedback.textContent = command.kind === 'open' ? 'Прогноз открыт.' : ledger.phases[command.kind] + '.';
            } catch (error) {
                if (current()) feedback.textContent = error.message || 'Не удалось подтвердить действие.';
            } finally {
                if (current()) {
                    busy = false;
                    if (pending) { const snapshot = pending; pending = null; accept(snapshot); }
                    else paint();
                }
            }
        }

        function stop() {
            generation++;
            active = initialized = connected = busy = false;
            clearTimeout(timeout); clearInterval(interval);
            for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
            selected = ''; limit = 15; offset = 0; pending = null;
            engine = M.create(); readLedger = ledger.createReader();
            form.reset(); chart.reset();
            workspace.hidden = retry.hidden = true;
            statusLine.textContent = '';
            picker.replaceChildren(); byId('forecastTape').replaceChildren();
            for (const id of ['forecastOpen', 'forecastPending', 'forecastTraders', 'forecastFills', 'forecastTradeCount']) byId(id).textContent = '';
            marketLink.href = 'physics-forecast.html';
        }

        function start() {
            if (active || !isOwner()) return;
            active = true;
            const session = ++generation;
            function failed() {
                if (session !== generation) return;
                stop();
                statusLine.textContent = 'Не удалось загрузить прогнозы.';
                retry.hidden = false;
            }
            function listen(ref, callback) {
                const handler = snapshot => {
                    if (session !== generation || !isOwner()) return;
                    try { callback(snapshot); } catch { failed(); }
                };
                subscriptions.push(() => ref.off('value', handler));
                ref.on('value', handler, failed);
            }
            statusLine.textContent = 'Загружаем прогнозы…';
            retry.hidden = true;
            timeout = setTimeout(() => {
                if (session !== generation || initialized) return;
                statusLine.textContent = 'Нет ответа от сервера.';
                retry.hidden = false;
            }, 8000);
            listen(database.ref('.info/connected'), snap => { connected = snap.val() === true; paint(); });
            listen(database.ref('.info/serverTimeOffset'), snap => { offset = Number(snap.val()) || 0; paint(); });
            listen(database.ref('physicsForecast/events').orderByChild('n'), snap => {
                if (busy) pending = snap; else accept(snap);
            });
            let lastMinute = Math.floor(now() / 60000);
            interval = setInterval(() => {
                if (!initialized || document.hidden) return;
                const at = now(), minute = Math.floor(at / 60000);
                // Status changes at Moscow midnight, even without another journal entry.
                if (minute !== lastMinute) { lastMinute = minute; paint(); }
                else chart.tick(at);
            }, 1000);
        }

        retry.addEventListener('click', () => { stop(); start(); });
        picker.addEventListener('change', () => selectMarket(picker.value));
        byId('forecastMoreTrades').addEventListener('click', () => { limit += 30; renderTrades(engine.markets.get(selected)); });
        return { start, stop, refreshNames: () => { if (active && isOwner() && initialized) renderTrades(engine.markets.get(selected)); } };
    };
}());
