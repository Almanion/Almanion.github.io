(function () {
    'use strict';
    const M = window.PhysicsForecast, ledger = window.ForecastLedger;
    const byId = id => document.getElementById(id);
    const numbers = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
    const names = new Intl.Collator('ru-RU', { sensitivity: 'base', numeric: true });
    const timestamp = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
    const points = amount => numbers.format(amount / 100) + ' оч.';
    const balancePageSize = 24;
    const successMessages = {
        open: 'Прогноз открыт.',
        deadline: 'Время закрытия изменено.',
        liquidity: 'Пополнение долей включено.'
    };

    window.createAdminForecasts = function ({ database, currentUser, accountName }) {
        const picker = byId('forecastPicker'), feedback = byId('adminFeedback'), workspace = byId('forecastWorkspace');
        const statusLine = byId('forecastLoadStatus'), retry = byId('forecastRetry'), marketLink = byId('forecastMarketLink');
        const balances = byId('forecastBalances'), balanceSearch = byId('forecastBalanceSearch');
        const balanceList = byId('forecastBalanceList'), balanceStatus = byId('forecastBalanceStatus'), moreBalances = byId('forecastMoreBalances');
        const balanceEditor = byId('forecastBalanceEditor'), balanceAmount = byId('forecastBalanceAmount');
        const balanceAccount = byId('forecastBalanceAccount'), balanceDetail = byId('forecastBalanceIdentity'), balanceCurrent = byId('forecastBalanceCurrent');
        const balanceFeedback = byId('forecastBalanceFeedback'), balanceSave = byId('forecastBalanceSave'), balanceCancel = byId('forecastBalanceCancel');
        const subscriptions = [];
        let active = false, initialized = false, connected = false, busy = false, generation = 0;
        let offset = 0, selected = '', limit = 15, interval, timeout, pending = null;
        let accounts = {}, directoryState = 'loading', balanceLimit = balancePageSize, balanceSignature = '';
        let editingUid = '', confirmingBalance = false;
        let readLedger = ledger.createReader(), engine = M.create();
        const now = () => Date.now() + offset;
        const isOwner = () => {
            const user = currentUser();
            return user?.uid === M.OWNER && !user.isAnonymous;
        };
        const chart = window.createPhysicsForecastChart(now);
        const form = window.createForecastAdmin({ now, formatDate: ledger.date, phaseLabel: ledger.phaseLabel, selectMarket, send });

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

        function balanceIdentity(uid) {
            const account = accounts[uid] || (uid === M.OWNER ? currentUser() : null) || {};
            return { uid, name: account.displayName || account.email || 'Участник', detail: account.email || uid };
        }

        function balancesFor(uid, at) {
            let reserved = 0;
            for (const market of engine.markets.values()) reserved += M.held(market, uid, at).cash;
            return { available: M.available(engine, uid, undefined, at), reserved };
        }

        function balanceRow({ uid, name, detail, available, reserved }) {
            const row = document.createElement('li'), identity = document.createElement('div');
            const title = document.createElement('strong'), subtitle = document.createElement('small');
            identity.className = 'admin-balance-identity';
            title.textContent = name;
            subtitle.textContent = detail;
            identity.append(title);
            if (detail !== name) identity.append(subtitle);
            const values = document.createElement('dl');
            for (const [label, amount] of [['Доступно', available], ['В заявках', reserved]]) {
                const metric = document.createElement('div'), term = document.createElement('dt'), value = document.createElement('dd');
                term.textContent = label;
                value.textContent = points(amount);
                metric.append(term, value);
                values.append(metric);
            }
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'forecast-secondary';
            edit.dataset.balanceUid = uid;
            edit.textContent = 'Изменить';
            edit.setAttribute('aria-label', 'Изменить баланс ' + name + (detail === name ? '' : ', ' + detail));
            edit.disabled = busy || !connected;
            row.append(identity, values, edit);
            return row;
        }

        function renderBalances() {
            if (!active || !initialized || !isOwner() || !balances.open) return;
            const at = now(), uids = new Set([M.OWNER, ...Object.keys(accounts), ...engine.participants, ...engine.adjustments.keys()]);
            uids.delete(M.MAKER);
            const query = balanceSearch.value.trim().toLowerCase();
            const entries = [...uids].map(balanceIdentity).filter(entry => !query ||
                [entry.name, entry.detail, entry.uid].some(value => value.toLowerCase().includes(query)));
            entries.sort((a, b) => names.compare(a.name, b.name) || names.compare(a.detail, b.detail) || a.uid.localeCompare(b.uid));
            const rows = entries.slice(0, balanceLimit).map(entry => ({ ...entry, ...balancesFor(entry.uid, at) }));
            const signature = JSON.stringify([rows, busy || !connected]);
            if (signature !== balanceSignature) {
                const focused = document.activeElement?.dataset?.balanceUid;
                balanceList.replaceChildren(...rows.map(balanceRow));
                if (focused) balanceButton(focused)?.focus({ preventScroll: true });
                balanceSignature = signature;
            }
            moreBalances.hidden = entries.length <= balanceLimit;
            const status = directoryState === 'loading' ? 'Загружаем аккаунты…' :
                directoryState === 'error' ? 'Не удалось загрузить каталог аккаунтов. Показаны известные участники.' :
                entries.length ? '' : 'Пользователи не найдены.';
            if (balanceStatus.textContent !== status) balanceStatus.textContent = status;
            if (editingUid) {
                const { name, detail } = balanceIdentity(editingUid);
                const { available, reserved } = balancesFor(editingUid, at);
                balanceAccount.textContent = name;
                balanceDetail.textContent = name === detail ? '' : detail;
                balanceCurrent.textContent = 'Доступно ' + points(available) + ' · В заявках ' + points(reserved);
                balanceAmount.disabled = balanceCancel.disabled = busy;
                balanceSave.disabled = busy || !connected;
            }
        }

        function balanceButton(uid) {
            return [...balanceList.querySelectorAll('[data-balance-uid]')].find(button => button.dataset.balanceUid === uid);
        }

        function closeBalanceEditor(restoreFocus) {
            const uid = editingUid;
            editingUid = '';
            balanceAmount.setCustomValidity('');
            balanceEditor.reset();
            balanceEditor.hidden = true;
            balanceAccount.textContent = balanceDetail.textContent = balanceCurrent.textContent = '';
            if (restoreFocus) (balanceButton(uid) || balanceSearch).focus();
        }

        balanceList.addEventListener('click', event => {
            const uid = event.target.closest('[data-balance-uid]')?.dataset.balanceUid;
            if (!uid || !active || !isOwner() || busy || !connected) return;
            editingUid = uid;
            balanceFeedback.textContent = '';
            balanceAmount.setCustomValidity('');
            balanceAmount.value = String(M.available(engine, uid, undefined, now()) / 100).replace('.', ',');
            balanceEditor.hidden = false;
            renderBalances();
            balanceAmount.focus();
            balanceAmount.select();
        });
        balanceEditor.addEventListener('submit', async event => {
            event.preventDefault();
            if (!editingUid || !active || !initialized || !isOwner() || busy || !connected || confirmingBalance) return;
            const input = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(balanceAmount.value.trim().replace(/[ \u00a0\u202f]/g, ''));
            const amount = input ? Number(input[1]) * 100 + Number((input[2] || '').padEnd(2, '0')) : NaN;
            if (!Number.isSafeInteger(amount) || amount > M.MAX_BALANCE) {
                balanceAmount.setCustomValidity('Введите сумму от 0 до ' + points(M.MAX_BALANCE) + ' с точностью до двух знаков.');
                balanceAmount.reportValidity();
                return;
            }
            const uid = editingUid, session = generation, expected = M.available(engine, uid, undefined, now());
            const { name, detail } = balanceIdentity(uid);
            if (amount === expected) { balanceFeedback.textContent = 'Баланс уже равен ' + points(amount); return; }
            confirmingBalance = true;
            const confirmed = await window.AdminUI.confirm(
                (name === detail ? name : name + ' · ' + detail) + '. Доступно ' + points(expected) + ' → ' + points(amount),
                { title: 'Изменить баланс?', confirmLabel: 'Подтвердить', danger: amount < expected });
            if (session !== generation || !active || !isOwner()) return;
            confirmingBalance = false;
            if (!confirmed || editingUid !== uid) return;
            if (!connected) { balanceFeedback.textContent = 'Нет связи. Повторите после подключения.'; return; }
            if (await send({ kind: 'balance', uid, amount, expected }) && session === generation && editingUid === uid) {
                closeBalanceEditor(true);
            }
        });
        balanceAmount.addEventListener('input', () => {
            balanceAmount.setCustomValidity('');
            balanceFeedback.textContent = '';
        });
        balanceCancel.addEventListener('click', () => { closeBalanceEditor(true); balanceFeedback.textContent = ''; });
        balanceSearch.addEventListener('input', () => {
            if (editingUid && !busy) closeBalanceEditor(false);
            if (!busy) balanceFeedback.textContent = '';
            balanceLimit = balancePageSize;
            renderBalances();
        });
        moreBalances.addEventListener('click', () => {
            const index = balanceLimit;
            balanceLimit += balancePageSize;
            renderBalances();
            balanceList.children[index]?.querySelector('button')?.focus({ preventScroll: true });
        });
        balances.addEventListener('toggle', renderBalances);

        function renderTrades(market) {
            const trades = market?.trades || [], rows = [];
            for (let i = trades.length - 1; i >= Math.max(0, trades.length - limit); i--) {
                const trade = trades[i], row = document.createElement('li');
                const main = document.createElement('div'), amount = document.createElement('div');
                const title = document.createElement('strong'), parties = document.createElement('span');
                const value = document.createElement('strong'), moment = document.createElement('time');
                const price = trade.price / 100;
                title.textContent = (trade.action === 'buy' ? 'Покупка' : 'Продажа') + ' · ' + market.answers[trade.side];
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
            marketLink.href = 'forecast.html' + (market ? '?event=' + encodeURIComponent(selected) : '');
            form.render(true, market, markets, busy, connected);
            renderBalances();
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

        function acceptPending(authoritative) {
            const snapshot = pending;
            pending = null;
            if (!snapshot) return false;
            let lastSequence = 0;
            snapshot.forEach(item => { lastSequence = item.val().n; });
            if (lastSequence < engine.n || (authoritative && lastSequence === engine.n)) return false;
            accept(snapshot);
            return true;
        }

        async function send(command) {
            if (!active || !isOwner() || !initialized || busy || !connected) return;
            const session = generation;
            const current = () => active && session === generation && isOwner();
            const targetFeedback = command.kind === 'balance' ? balanceFeedback : feedback;
            let authoritative = false;
            busy = true; pending = null; targetFeedback.textContent = '';
            paint();
            try {
                const { id, day, snapshot } = await ledger.append({ actor: M.OWNER, command, database, engine, now,
                    active: () => current() && connected });
                if (!current()) return;
                accept(snapshot);
                authoritative = true;
                const result = engine.receipts.get(id);
                if (!result || result.error) throw Error(M.errors[result?.error] || 'Сервер не подтвердил действие.');
                if (command.kind === 'open') { form.resetForm(); selectMarket(day); }
                targetFeedback.textContent = command.kind === 'balance' ? 'Баланс обновлён. Доступно ' + points(result.after) :
                    successMessages[command.kind] || ledger.phaseLabel(engine.markets.get(day), command.kind) + '.';
                return true;
            } catch (error) {
                if (current()) targetFeedback.textContent = error.message || 'Не удалось подтвердить действие.';
            } finally {
                if (current()) {
                    busy = false;
                    if (!acceptPending(authoritative)) paint();
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
            if (confirmingBalance) window.AdminUI.dismiss();
            confirmingBalance = false;
            accounts = {}; directoryState = 'loading'; balanceLimit = balancePageSize; balanceSignature = '';
            closeBalanceEditor(false);
            balances.open = false; balanceSearch.value = '';
            balanceStatus.textContent = balanceFeedback.textContent = '';
            balanceList.replaceChildren(); moreBalances.hidden = true;
            form.reset(); chart.reset();
            workspace.hidden = retry.hidden = true;
            statusLine.textContent = '';
            picker.replaceChildren(); byId('forecastTape').replaceChildren();
            for (const id of ['forecastOpen', 'forecastPending', 'forecastTraders', 'forecastFills', 'forecastTradeCount']) byId(id).textContent = '';
            marketLink.href = 'forecast.html';
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
            function listen(ref, callback, onError = failed) {
                const handler = snapshot => {
                    if (session !== generation || !isOwner()) return;
                    try { callback(snapshot); } catch { failed(); }
                };
                subscriptions.push(() => ref.off('value', handler));
                ref.on('value', handler, () => {
                    if (session === generation && isOwner()) onError();
                });
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
            listen(database.ref('accountDirectory'), snap => {
                accounts = snap.val() || {};
                directoryState = 'ready';
                renderBalances();
            }, () => { directoryState = 'error'; renderBalances(); });
            listen(database.ref('physicsForecast/events').orderByChild('n'), snap => {
                if (busy) pending = snap; else accept(snap);
            });
            let lastMinute = Math.floor(now() / 60000);
            interval = setInterval(() => {
                if (!initialized || document.hidden) return;
                const at = now(), minute = Math.floor(at / 60000);
                // Deadlines are aligned to minutes on the server clock.
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
