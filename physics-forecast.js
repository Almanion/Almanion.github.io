(function () {
    'use strict';
    const M = window.PhysicsForecast;
    const $ = id => document.getElementById(id);
    const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
    const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'Europe/Moscow' });
    const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
    const stampFmt = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
    const amount = cents => fmt.format(cents / 100);
    const date = day => dayFmt.format(M.endOfDay(day) - M.DAY);
    const labels = { yes: 'Будет', no: 'Не будет' };
    const phases = { open: 'Торги открыты', lock: 'Торги закрыты', yes: 'Работа была', no: 'Работы не было', void: 'Урок отменён' };
    const confirmations = { lock: 'Закрыть торги и снять все оставшиеся заявки?', yes: 'Подтвердить, что работа была, и начислить выплаты?',
        no: 'Подтвердить, что работы не было, и начислить выплаты?', void: 'Отменить этот рынок и полностью вернуть его участникам очки?' };
    let engine = M.create(), ids = [], day = '', user = null, connected = false, offset = 0, ready = false, busy = false;
    let epoch = 0, clock = 0, connectionTimer, roleOff, feedOff, pendingSnapshot, adminCommand, range = 'all', historyLimit = 12, ticket = null;
    let chartData = null, firstPaint = true;
    const api = window.AlmanionAccount;
    const now = () => Date.now() + offset;
    const market = () => engine.markets.get(day);
    function node(tag, text, cls) {
        const element = document.createElement(tag);
        if (text !== undefined) element.textContent = text;
        if (cls) element.className = cls;
        return element;
    }
    function gate(title, body, action) {
        $('accessGate').hidden = false;
        $('gameSurface').hidden = $('ownerTools').hidden = $('connectionNotice').hidden = true;
        $('lessonQuestion').textContent = 'Будет ли сегодня работа по физике?';
        $('lessonDate').textContent = 'Прогноз класса 10-1';
        $('gateTitle').textContent = title;
        $('gateText').textContent = body;
        const button = $('gateAction');
        button.hidden = !action;
        if (action) {
            button.textContent = action === 'login' ? 'Войти' : 'Повторить';
            button.onclick = action === 'login' ? () => api.openLogin() : () => location.reload();
        }
    }
    function notice(text, admin) {
        $(admin ? 'adminFeedback' : 'feedback').textContent = text;
    }

    function syncSnapshot(snapshot) {
        const rows = [];
        snapshot.forEach(item => { rows.push([item.key, item.val()]); });
        // Reconcile optimistic SDK data, a rejected append or a freshly restored session.
        if (ids.length > rows.length || ids.some((id, i) => id !== rows[i][0])) { engine = M.create(); ids = []; }
        for (let i = ids.length; i < rows.length; i++) {
            const [id, event] = rows[i];
            M.apply(engine, event, id);
            ids.push(id);
        }
        ready = true;
        if (!engine.markets.has(day)) {
            const days = [...engine.markets.keys()].sort();
            day = days.find(key => key >= M.dayKey(now())) || days.at(-1) || '';
        }
        paint();
    }

    function clearMarket() {
        clearTimeout(connectionTimer);
        if (feedOff) feedOff();
        feedOff = undefined;
        epoch++; ready = busy = false; day = ''; ids = []; engine = M.create(); ticket = pendingSnapshot = adminCommand = chartData = null;
        $('confirmAction').hidden = true;
        $('ownerTools').open = false;
        $('feedback').textContent = $('adminFeedback').textContent = '';
        for (const id of ['tradeHistory', 'myOrders', 'bookAsks', 'bookBids', 'lessonSelect']) $(id).replaceChildren();
    }

    function subscribe(allowed) {
        if (!allowed) {
            clearMarket();
            gate('Доступ для класса 10-1', 'Владелец сайта может добавить твой аккаунт в админ-панели.');
            return;
        }
        if (feedOff) return;
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
        if (roleOff) roleOff();
        roleOff = undefined;
        clearMarket();
        user = account && !account.isAnonymous ? account : null;
        if (!user) { gate('Войди, чтобы открыть рынок', 'Игра доступна участникам класса 10-1 через аккаунт Almanion.', 'login'); return; }
        if (user.uid === M.OWNER) { subscribe(true); return; }
        gate('Проверяем доступ…', 'Подключаемся к аккаунту Almanion.');
        const uid = user.uid, ref = api.database.ref('adminRoles/' + uid + '/forecastAccess');
        const check = snap => { if (user?.uid === uid) subscribe(snap.val() === true); };
        roleOff = () => ref.off('value', check);
        ref.on('value', check, () => { if (user?.uid === uid) subscribe(false); });
    }

    function drawChart(m) {
        const end = Math.max(m.openedAt, Math.min(now(), m.closedAt || m.endAt));
        const span = range === 'hour' ? 3600000 : range === 'day' ? M.DAY : Infinity;
        const start = Math.max(m.openedAt, end - span);
        let first = m.chart[0];
        for (const point of m.chart) { if (point.at <= start) first = point; else break; }
        const visible = [{ at: start, p: first.p }, ...m.chart.filter(p => p.at > start && p.at <= end)];
        const x = t => 5 + (t - start) / Math.max(end - start, 1) * 548;
        const y = p => 151 - 1.42 * p;
        let path = 'M5 ' + y(first.p);
        for (const point of visible.slice(1)) path += ' H' + x(point.at).toFixed(2) + ' V' + y(point.p);
        path += ' H553';
        $('chartLine').setAttribute('d', path);
        $('chartArea').setAttribute('d', path + ' V151 H5 Z');
        const current = visible.at(-1).p;
        const next = fmt.format(current) + '%', output = $('probability');
        if (output.textContent !== next && output.textContent !== '—' && output.animate && !document.hidden
            && !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.body.classList.contains('animations-off')
            && document.documentElement.dataset.pageMotion !== 'off') {
            output.animate([{ opacity: .65, transform: 'translateY(2px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, easing: 'ease-out' });
        }
        output.textContent = next;
        $('complement').textContent = 'Не будет · ' + fmt.format(100 - current) + '%';
        $('chartStart').textContent = stampFmt.format(start);
        $('chartEnd').textContent = stampFmt.format(end);
        $('probChart').setAttribute('aria-label', 'Рыночная вероятность работы ' + fmt.format(current) + ' процентов');
        chartData = { visible, start, end };
        showPoint();
    }

    function showPoint() {
        if (!chartData) return;
        const { visible, start, end } = chartData;
        const at = start + Number($('chartCursor').value) / 100 * (end - start);
        let point = visible[0];
        for (const next of visible) { if (next.at <= at) point = next; else break; }
        const x = 5 + Number($('chartCursor').value) * 5.48, y = 151 - point.p * 1.42;
        $('chartHair').setAttribute('d', 'M' + x + ' 9V151');
        $('chartDot').setAttribute('cx', x); $('chartDot').setAttribute('cy', y);
        $('chartReadout').textContent = stampFmt.format(at) + ' · ' + fmt.format(point.p) + '%';
    }

    function renderBook(m, phase) {
        for (const [id, side] of [['bookBids','bid'], ['bookAsks','ask']]) {
            const levels = new Map();
            if (phase === 'open') for (const o of M.ranked(m, side)) {
                const price = M.yesPrice(o);
                levels.set(price, (levels.get(price) || 0) + o.qty);
            }
            const rows = [...levels].map(([p, qty]) => {
                const li = node('li'); li.append(node('b', amount(p)), node('span', qty)); return li;
            });
            $(id).replaceChildren(...(rows.length ? rows : [node('li', '—')]));
        }
    }

    function renderHistory(m) {
        const mine = $('historyScope').value === 'mine';
        const trades = (mine ? m.trades.filter(t => t.taker === user.uid || t.maker === user.uid) : m.trades).slice().reverse();
        const rows = trades.slice(0, historyLimit).map(t => {
            const isMaker = mine && t.maker === user.uid;
            const side = isMaker ? t.makerSide : t.side;
            const action = isMaker ? t.makerAction : t.action;
            const price = side === 'yes' ? t.yesPrice : 100 - t.yesPrice;
            const row = node('div', undefined, 'forecast-row');
            const info = node('div'); info.append(node('b', (action === 'buy' ? 'Покупка' : 'Продажа') + ' · ' + labels[side]),
                node('small', stampFmt.format(t.at) + ' · ' + t.qty + ' × ' + amount(price)));
            row.append(info, node('strong', amount(price * t.qty) + ' оч.')); return row;
        });
        $('tradeHistory').replaceChildren(...(rows.length ? rows : [node('p', mine ? 'На этом уроке у тебя пока нет сделок.' : 'Первой сделки пока не было.', 'forecast-footnote')]));
        $('moreTrades').hidden = trades.length <= historyLimit;
    }

    function renderTicket() {
        const m = market();
        if (!ready || !m || !user) return;
        const form = $('tradeForm'), open = M.status(m, now()) === 'open';
        const action = form.elements.action.value, side = form.elements.side.value, mode = $('orderMode').value;
        for (const control of form.elements) control.disabled = !open || !connected || busy;
        $('limitField').hidden = mode !== 'limit';
        $('limitPrice').required = mode === 'limit';
        for (const s of ['yes','no']) {
            const lane = (s === 'yes') === (action === 'buy') ? 'ask' : 'bid';
            const best = open ? M.ranked(m, lane)[0] : null;
            $(s + 'Ask').textContent = best ? amount(s === 'yes' ? M.yesPrice(best) : 100 - M.yesPrice(best)) : '—';
        }
        const e = { kind: 'order', day, actor: user.uid, action, side, mode, qty: $('quantity').valueAsNumber,
            limit: mode === 'limit' ? $('limitPrice').valueAsNumber : action === 'buy' ? 99 : 1 };
        const plan = M.preview(engine, e, now());
        ticket = null;
        const submit = $('placeOrder');
        submit.disabled = !!plan.error || !open || busy || !connected;
        submit.textContent = busy ? 'Отправляем…' : action === 'buy' ? 'Купить доли' : 'Продать доли';
        if (!open) { $('quotePreview').textContent = ''; return; }
        if (plan.error) { $('quotePreview').textContent = M.errors[plan.error]; return; }
        if (mode === 'market') {
            e.limit = plan.fills.at(-1).price;
            e.totalLimit = plan.cash;
        }
        ticket = e;
        const parts = [];
        if (plan.filled) {
            parts.push((action === 'buy' ? 'Стоимость ' : 'К получению ') + amount(plan.cash) + ' оч.');
            if (action === 'buy') parts.push('Коэффициент ×' + fmt.format(100 * plan.filled / plan.cash));
        }
        if (plan.left) parts.push('В стакан ' + plan.left + ' по ' + amount(e.limit));
        $('quotePreview').textContent = parts.join(' · ');
    }

    function renderAccount(m, phase) {
        const pos = M.position(m, user.uid), reserve = M.held(m, user.uid, now());
        $('walletCash').textContent = amount(M.available(engine, user.uid, day, now())) + ' оч.';
        $('walletHeld').textContent = amount(reserve.cash) + ' оч.';
        $('walletYes').textContent = String(pos.yes); $('walletNo').textContent = String(pos.no);
        const paid = phase === 'yes' || phase === 'no';
        $('walletOutcome').textContent = phase === 'void' ? 'Все сделки этого урока аннулированы.' : paid
            ? 'Выплата ' + pos[phase] + ' оч. · результат урока ' + amount(pos.cash + pos[phase] * 100) + ' оч.' : '';
        const rows = m.orders.filter(o => phase === 'open' && o.actor === user.uid).map(o => {
            const row = node('div', undefined, 'forecast-row'), info = node('div');
            info.append(node('b', (o.action === 'buy' ? 'Покупка' : 'Продажа') + ' · ' + labels[o.side]), node('small', o.qty + ' дол. по ' + amount(o.limit)));
            const cancel = node('button', 'Снять', 'forecast-secondary'); cancel.type = 'button'; cancel.disabled = busy || !connected || phase !== 'open';
            cancel.addEventListener('click', () => send({ kind: 'cancel', day, target: o.id })); row.append(info, cancel); return row;
        });
        $('myOrders').replaceChildren(...(rows.length ? rows : [node('p', 'Активных заявок нет.', 'forecast-footnote')]));
    }

    function renderAdmin(m, phase) {
        const owner = user.uid === M.OWNER;
        $('ownerTools').hidden = !owner;
        if (!owner) return;
        const today = M.dayKey(now());
        $('newDay').min = today; $('newDay').max = M.dayKey(now() + 31 * M.DAY);
        if (!$('newDay').value) $('newDay').value = today;
        $('createRound').querySelector('button').disabled = busy || !connected;
        $('manageRound').hidden = !m || !['open','lock'].includes(phase);
        if (!m) return;
        $('manageTitle').textContent = 'Урок · ' + date(day);
        for (const button of document.querySelectorAll('[data-command]')) {
            const cmd = button.dataset.command;
            button.hidden = cmd === 'lock' ? phase !== 'open' : cmd !== 'void' && (phase !== 'lock' || now() < m.endAt - M.DAY);
            button.disabled = busy || !connected;
        }
        $('confirmGo').disabled = busy || !connected;
    }

    function paint() {
        if (!ready || !user) return;
        $('accessGate').hidden = true; $('gameSurface').hidden = false; $('connectionNotice').hidden = connected;
        const m = market(), today = M.dayKey(now());
        const days = [...engine.markets.keys()].sort().reverse();
        $('lessonSelect').replaceChildren(...days.map(d => { const o = node('option', date(d)); o.value = d; return o; }));
        $('lessonSelect').value = day;
        $('emptyRound').hidden = !!m; $('roundBody').hidden = !m;
        const phase = m ? M.status(m, now()) : '';
        $('roundState').textContent = phases[phase] || ''; $('roundState').dataset.state = phase;
        renderAdmin(m, phase);
        if (!m) return;
        const when = day === today ? 'сегодня ' : day === M.dayKey(now() + M.DAY) ? 'завтра ' : '';
        $('lessonQuestion').textContent = 'Будет ли ' + when + 'работа по физике?';
        $('lessonDate').textContent = date(day) + ' · 10-1';
        $('roundSummary').textContent = phase === 'open' ? '' : phase === 'lock' ? 'Ждём итог урока.' : phases[phase] + '.';
        drawChart(m); renderTicket(); renderBook(m, phase); renderAccount(m, phase); renderHistory(m);
        if (firstPaint) { firstPaint = false; $('gameSurface').classList.add('forecast-enter'); }
    }

    async function send(command) {
        if (busy || !ready || !user || !connected) return;
        const admin = !['order','cancel'].includes(command.kind);
        const actor = user.uid, session = epoch;
        const root = api.database.ref('physicsForecast');
        const id = root.child('events').push().key;
        const expires = Math.floor(now()) + 30000;
        busy = true; pendingSnapshot = null;
        notice('', admin); paint();
        try {
            let accepted = false;
            for (let attempt = 0; attempt < 5 && !accepted; attempt++) {
                const head = (await root.child('head').get()).val();
                if (session !== epoch || !connected || now() > expires) throw Error('Подключись и подтверди действие заново.');
                const n = (head?.n || 0) + 1;
                const e = { ...command, actor, n, at: firebase.database.ServerValue.TIMESTAMP };
                const patch = { head: { n, id }, ['events/' + id]: e, ['lastBy/' + actor]: id };
                if (admin) patch['rounds/' + command.day] = { last: id, phase: command.kind,
                    endAt: command.endAt || M.endOfDay(command.day) };
                else e.expires = expires;
                try { await root.update(patch); accepted = true; }
                catch {
                    if ((await root.child('events/' + id).get()).exists()) { accepted = true; break; }
                    const latest = (await root.child('head').get()).val();
                    if ((latest?.n || 0) < n) {
                        const lastId = (await root.child('lastBy/' + actor).get()).val();
                        const lastAt = lastId && (await root.child('events/' + lastId + '/at').get()).val();
                        const wait = lastAt && lastAt + 550 - now();
                        if (!admin && wait > 0 && wait <= 1000) { await new Promise(resolve => setTimeout(resolve, wait)); continue; }
                        throw Error('Действие отклонено. Проверь состояние рынка и повтори.');
                    }
                }
            }
            if (!accepted) throw Error('Рынок изменился. Проверь котировку и попробуй ещё раз.');
            const snapshot = await root.child('events').orderByChild('n').get();
            if (session !== epoch) return;
            pendingSnapshot = null; busy = false;
            syncSnapshot(snapshot);
            const result = engine.receipts.get(id);
            if (!result || result.error) throw Error(M.errors[result?.error] || 'Не удалось подтвердить действие.');
            if (command.kind === 'open') { day = command.day; paint(); }
            notice(admin ? 'Сохранено.' : command.kind === 'cancel' ? 'Заявка снята.' :
                [result.filled && 'Исполнено долей: ' + result.filled, result.left && 'В стакане: ' + result.left].filter(Boolean).join(' · '), admin);
        } catch (err) { if (session === epoch) notice(err.message || 'Не удалось подтвердить действие.', admin); }
        finally {
            if (session === epoch) {
                busy = false;
                if (pendingSnapshot) { const snapshot = pendingSnapshot; pendingSnapshot = null; syncSnapshot(snapshot); }
                else paint();
            }
        }
    }

    $('lessonSelect').addEventListener('change', e => {
        day = e.target.value; historyLimit = 12; adminCommand = null; $('confirmAction').hidden = true;
        $('chartCursor').value = 100; notice(''); notice('', true); paint();
    });
    $('tradeForm').addEventListener('input', renderTicket);
    $('tradeForm').addEventListener('submit', e => { e.preventDefault(); if (ticket) send({ ...ticket }); });
    $('chartCursor').addEventListener('input', showPoint);
    $('probChart').addEventListener('pointermove', e => {
        const rect = e.currentTarget.getBoundingClientRect();
        $('chartCursor').value = Math.round(100 * (e.clientX - rect.left) / rect.width); showPoint();
    });
    document.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => {
        range = button.dataset.range; $('chartCursor').value = 100;
        document.querySelectorAll('[data-range]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
        if (market()) drawChart(market());
    }));
    $('historyScope').addEventListener('change', () => { historyLimit = 12; renderHistory(market()); });
    $('moreTrades').addEventListener('click', () => { historyLimit += 24; renderHistory(market()); });
    $('createRound').addEventListener('submit', e => {
        e.preventDefault();
        const key = $('newDay').value;
        if (engine.markets.has(key)) { day = key; paint(); notice('Этот рынок уже создан.', true); return; }
        send({ kind: 'open', day: key, endAt: M.endOfDay(key) });
    });
    document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => {
        adminCommand = { kind: button.dataset.command, day };
        $('confirmText').textContent = date(day) + '. ' + confirmations[adminCommand.kind];
        $('confirmAction').hidden = false; $('confirmBack').focus();
    }));
    $('confirmBack').addEventListener('click', () => { adminCommand = null; $('confirmAction').hidden = true; });
    $('confirmGo').addEventListener('click', () => {
        if (adminCommand?.day === day) send(adminCommand);
        adminCommand = null; $('confirmAction').hidden = true;
    });
    if (!api?.database || !api.auth) { gate('Не удалось подключиться', 'Для входа нужен доступ к серверу аккаунтов.', 'retry'); return; }
    api.database.ref('.info/connected').on('value', snap => { connected = snap.val() === true; paint(); });
    api.database.ref('.info/serverTimeOffset').on('value', snap => { offset = Number(snap.val()) || 0; paint(); });
    api.auth.onAuthStateChanged(activate);
    function tick() { if (ready && !document.hidden) paint(); }
    clock = window.setInterval(tick, 30000);
    window.addEventListener('pagehide', () => clearInterval(clock));
    window.addEventListener('pageshow', e => { if (e.persisted) { tick(); clock = window.setInterval(tick, 30000); } });
}());
