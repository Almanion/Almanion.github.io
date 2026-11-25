(function () {
    'use strict';
    const M = window.PhysicsForecast;
    const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'Europe/Moscow' });
    const date = day => dayFormat.format(M.endOfDay(day) - M.DAY);
    const phases = { open: 'Торги открыты', lock: 'Торги закрыты', yes: 'Итог «Да»', no: 'Итог «Нет»', void: 'Прогноз отменён' };
    const groups = { open: 0, lock: 1, yes: 2, no: 2, void: 2 };
    const pickerVersions = new WeakMap();

    function orderedMarkets(engine, at) {
        return [...engine.markets.values()].sort((a, b) => {
            const first = groups[M.status(a, at)], second = groups[M.status(b, at)];
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
                const phase = M.status(market, at), group = groups[phase];
                const suffix = group === 2 ? ' · ' + phases[phase] : '';
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

    async function append({ database, actor, command, engine, now, active }) {
        const admin = !['order', 'cancel'].includes(command.kind);
        if (admin && (actor !== M.OWNER || !['open', 'lock', 'yes', 'no', 'void'].includes(command.kind))) throw Error(M.errors.invalid);
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
            if (head?.v === 2 || command.kind === 'open') patch.head.v = 2;
            if (admin) {
                const endAt = command.endAt ?? engine.markets.get(command.day)?.endAt;
                if (!endAt) throw Error(M.errors.invalid);
                patch['rounds/' + command.day] = { last: id, phase: command.kind, endAt };
            } else event.expires = expires;
            try { await root.update(patch); }
            catch {
                checkSession();
                if ((await root.child('events/' + id).get()).exists()) return confirmed();
                const latest = (await root.child('head').get()).val();
                if ((latest?.n || 0) >= n) continue;
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

    window.ForecastLedger = { date, phases, orderedMarkets, fillPicker, createReader, append };
}());
