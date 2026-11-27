(function () {
    'use strict';
    const M = window.PhysicsForecast;
    const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'Europe/Moscow' });
    const date = day => dayFormat.format(M.endOfDay(day) - M.DAY);
    const time = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });
    const cutoff = (at, eventDate) => (M.dayKey(at) === eventDate ? '' : date(M.dayKey(at)) + ', ') + time.format(at) + ' мск';
    const phaseLabel = (market, phase) => ({ open: 'Торги открыты', lock: 'Торги закрыты', void: 'Прогноз отменён' })[phase]
        || (market?.answers[phase] ? 'Итог «' + market.answers[phase] + '»' : '');
    function eventUrl(base, id, { order, result } = {}) {
        const url = new URL('forecast.html', base);
        url.searchParams.set('event', id);
        if (order) {
            url.searchParams.set('order', order);
            url.hash = 'orderListTitle';
        } else if (result) url.hash = 'eventResult';
        return url;
    }
    const groupFor = phase => phase === 'open' ? 0 : phase === 'lock' ? 1 : 2;
    const pickerVersions = new WeakMap();

    function orderedMarkets(engine, at) {
        return [...engine.markets.values()].sort((a, b) => {
            const first = groupFor(M.status(a, at)), second = groupFor(M.status(b, at));
            return first - second || (first === 2 ? b.endAt - a.endAt : a.endAt - b.endAt)
                || b.openedAt - a.openedAt || a.id.localeCompare(b.id);
        });
    }

    function fillPicker(select, markets, selected, at) {
        const signature = markets.map(m => m.id + ':' + M.status(m, at)).join('|');
        if (pickerVersions.get(select) !== signature || (markets.length && !select.options.length)) {
            const sections = ['Открытые', 'Ждут итога', 'Завершённые'].map(label => {
                const group = document.createElement('optgroup');
                group.label = label;
                return group;
            });
            for (const market of markets) {
                const phase = M.status(market, at), group = groupFor(phase);
                const suffix = group === 2 ? ' · ' + phaseLabel(market, phase) : '';
                sections[group].append(new Option(date(market.date) + ' · ' + market.question + suffix, market.id));
            }
            select.replaceChildren(...sections.filter(group => group.childElementCount));
            pickerVersions.set(select, signature);
        }
        select.value = selected;
    }

    function createReader() {
        let engine = M.create(), applied = [];
        return snapshot => {
            const rows = [];
            snapshot.forEach(item => { rows.push([item.key, item.val()]); });
            // A rejected append can disappear and a provisional server timestamp can change.
            if (applied.length > rows.length || applied.some(([key, at], i) => key !== rows[i][0] || at !== rows[i][1].at)) {
                engine = M.create();
                applied = [];
            }
            for (let i = applied.length; i < rows.length; i++) {
                const [key, event] = rows[i];
                M.apply(engine, event, key);
                applied.push([key, event.at]);
            }
            return engine;
        };
    }

    async function append({ database, actor, command, now, active }) {
        const admin = !['order', 'cancel'].includes(command.kind);
        const balance = command.kind === 'balance';
        const liquidity = command.kind === 'liquidity';
        if (admin && (actor !== M.OWNER || !['open', 'deadline', 'lock', 'void', 'balance', 'liquidity', ...M.SIDE_IDS].includes(command.kind))) {
            throw Error(M.errors.invalid);
        }
        if (balance && !M.validBalanceChange(command)) throw Error(M.errors.invalid);
        const root = database.ref('physicsForecast');
        const id = root.child('events').push().key;
        if (command.kind === 'open') command = { ...command, day: id };
        const expires = Math.floor(now()) + 30000;
        function checkSession() {
            if (!active() || now() > expires) throw Error('Подключись и подтверди действие заново.');
        }
        async function confirmed() {
            return { id, day: command.day, snapshot: await root.child('events').orderByChild('n').get() };
        }
        for (let attempt = 0; attempt < 5; attempt++) {
            checkSession();
            const head = (await root.child('head').get()).val();
            checkSession();
            const n = (head?.n || 0) + 1;
            const event = { ...command, actor, n, at: firebase.database.ServerValue.TIMESTAMP };
            const patch = { head: { n, id }, ['events/' + id]: event, ['lastBy/' + actor]: id };
            if (head?.v === 5 || liquidity || command.liquidity === 1) patch.head.v = 5;
            else if (head?.v === 4 || balance) patch.head.v = 4;
            else if (head?.v === 3 || command.eventEnd !== undefined || command.answers || command.kind === 'deadline') patch.head.v = 3;
            else if (head?.v === 2 || command.kind === 'open') patch.head.v = 2;
            if (admin && !balance && !liquidity) {
                const creating = command.kind === 'open';
                const previous = creating ? null : (await root.child('rounds/' + command.day).get()).val();
                checkSession();
                if (!creating && !previous) throw Error(M.errors.invalid);
                const endAt = command.endAt ?? previous?.endAt;
                const eventEnd = command.eventEnd ?? previous?.eventEnd ?? (command.kind === 'deadline' ? previous?.endAt : null);
                const phase = command.kind === 'deadline' ? 'open' : command.kind;
                patch['rounds/' + command.day] = { last: id, phase, endAt, ...(eventEnd ? { eventEnd } : {}) };
            } else event.expires = expires;
            try { await root.update(patch); }
            catch {
                checkSession();
                if ((await root.child('events/' + id).get()).exists()) return confirmed();
                const latest = (await root.child('head').get()).val();
                if ((latest?.n || 0) >= n) continue;
                if (!admin || liquidity || command.kind === 'deadline') {
                    const round = (await root.child('rounds/' + command.day).get()).val();
                    if (round && (round.phase !== 'open' || now() >= round.endAt)) throw Error(M.errors.closed);
                }
                if (!admin) {
                    const previous = (await root.child('lastBy/' + actor).get()).val();
                    const at = previous && (await root.child('events/' + previous + '/at').get()).val();
                    const delay = at && at + 550 - now();
                    if (delay > 0 && delay <= 1000) {
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                }
                throw Error('Действие отклонено. Проверь состояние рынка и повтори.');
            }
            return confirmed();
        }
        throw Error('Рынок изменился. Проверь состояние и попробуй ещё раз.');
    }

    window.ForecastLedger = { date, time, cutoff, phaseLabel, eventUrl, orderedMarkets, fillPicker, createReader, append };
}());
