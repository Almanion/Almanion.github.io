(function () {
    'use strict';

    const byId = id => document.getElementById(id);
    const core = window.AlmanionContests;
    let config = null;
    let contests = [];
    let sourceRef = null;
    let roleRef = null;
    let request = null;
    let accessTimeout = 0;
    let generation = 0;
    let lastUpdated = 0;

    function element(tag, text, className) {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
    }

    function gate(title, message, signIn) {
        byId('contestGate').hidden = false;
        byId('contestContent').hidden = true;
        byId('contestGateTitle').textContent = title;
        byId('contestGateMessage').textContent = message;
        byId('contestLogin').hidden = !signIn;
        byId('contestResults').replaceChildren();
        byId('contestSelection').replaceChildren();
        byId('contestSource').removeAttribute('href');
        config = null;
        contests = [];
        lastUpdated = 0;
        request?.abort();
    }

    function status(message, error) {
        byId('contestStatus').textContent = message;
        byId('contestStatus').classList.toggle('is-error', !!error);
    }

    function render() {
        const selected = byId('contestSelection').value;
        const results = byId('contestResults');
        results.replaceChildren();
        let visible = 0;
        for (const contest of contests) {
            if (selected && selected !== contest.id) continue;
            const people = core.filterPeople(contest, byId('contestSearch').value, byId('contestOrder').value);
            if (!people.length && byId('contestSearch').value.trim()) continue;
            visible++;
            const section = element('section', undefined, 'contest-section');
            const header = element('div', undefined, 'contest-section-header');
            const title = element('a', contest.title, 'contest-title');
            title.href = contest.link;
            title.target = '_blank';
            title.rel = 'noopener noreferrer';
            header.append(title, element('span', people.length + ' уч.', 'contest-count'));
            section.append(header);

            const scroll = element('div', undefined, 'contest-table-scroll');
            scroll.tabIndex = 0;
            scroll.setAttribute('aria-label', 'Результаты: ' + contest.title);
            const table = element('table');
            const caption = element('caption', contest.title, 'sr-only');
            const thead = element('thead');
            const headings = element('tr');
            const nameHeading = element('th', 'Участник');
            nameHeading.scope = 'col';
            headings.append(nameHeading);
            for (const column of contest.columns) {
                const th = element('th', column.label, column.total ? 'contest-total' : '');
                th.scope = 'col';
                headings.append(th);
            }
            thead.append(headings);
            const body = element('tbody');
            const cards = element('div', undefined, 'contest-people');
            for (const person of people) {
                const row = element('tr');
                const name = element('th', person.name);
                name.scope = 'row';
                row.append(name);
                const card = element('article', undefined, 'contest-person');
                const personHeader = element('div', undefined, 'contest-person-header');
                personHeader.append(element('h3', person.name));
                const scores = element('dl', undefined, 'contest-scores');
                for (const column of contest.columns) {
                    const cell = person.cells[column.index];
                    const value = cell?.text || '—';
                    const td = element('td', value, column.total ? 'contest-total' : '');
                    if (cell?.note) td.title = cell.note;
                    row.append(td);
                    const pair = element(column.total ? 'dl' : 'div');
                    pair.append(element('dt', column.label), element('dd', value));
                    if (cell?.note) pair.title = cell.note;
                    if (column.total) {
                        pair.className = 'contest-person-total';
                        personHeader.append(pair);
                    } else scores.append(pair);
                }
                body.append(row);
                card.append(personHeader, scores);
                cards.append(card);
            }
            table.append(caption, thead, body);
            scroll.append(table);
            section.append(scroll, cards);
            results.append(section);
        }
        byId('contestEmpty').hidden = visible > 0;
        byId('contestEmpty').textContent = contests.length ? 'Участники не найдены' : 'В таблице пока нет контестов';
    }

    async function refresh() {
        if (!config || request) return;
        const current = generation;
        const controller = new AbortController();
        request = controller;
        const timeout = setTimeout(() => controller.abort(), 20000);
        byId('contestRefresh').disabled = true;
        status('Обновление…');
        try {
            const url = new URL('https://sheets.googleapis.com/v4/spreadsheets/' + config.spreadsheetId);
            url.searchParams.set('key', config.apiKey);
            url.searchParams.set('includeGridData', 'true');
            url.searchParams.set('ranges', config.range);
            url.searchParams.set('fields', 'sheets(properties(sheetId,title,hidden),data(rowData(values(formattedValue,hyperlink,note))))');
            const response = await fetch(url, { signal: controller.signal, credentials: 'omit', cache: 'no-store' });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            if (current !== generation || request !== controller || !config) return;
            const selected = byId('contestSelection').value;
            contests = core.parseSpreadsheet(data, config);
            const select = byId('contestSelection');
            select.replaceChildren(new Option('Все контесты', ''));
            for (const contest of contests) select.append(new Option(contest.title, contest.id));
            select.value = contests.some(contest => contest.id === selected) ? selected : '';
            byId('contestSelectionLabel').hidden = contests.length < 2;
            lastUpdated = Date.now();
            status('Обновлено в ' + new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(lastUpdated));
            render();
        } catch (_) {
            if (current !== generation || request !== controller || !config) return;
            status(lastUpdated ? 'Не удалось обновить. Показаны загруженные данные.' : 'Не удалось загрузить таблицу. Нажмите «Обновить».', true);
        } finally {
            clearTimeout(timeout);
            if (request === controller) request = null;
            if (current === generation) byId('contestRefresh').disabled = !!request;
        }
    }

    function detach() {
        generation++;
        clearTimeout(accessTimeout);
        request?.abort();
        request = null;
        sourceRef?.off();
        roleRef?.off();
        sourceRef = null;
        roleRef = null;
    }

    function onAccount(user) {
        detach();
        byId('contestSearch').value = '';
        byId('contestLogin').textContent = 'Войти';
        gate('Проверяем доступ', '', false);
        if (!user || user.isAnonymous || !user.email) {
            gate('Войдите в аккаунт', 'Доступ к таблице открывает владелец сайта.', true);
            return;
        }
        const current = generation;
        const db = window.AlmanionAccount.database;
        accessTimeout = setTimeout(() => {
            if (current !== generation || config) return;
            gate('Не удалось проверить доступ', 'Проверьте соединение и повторите попытку.', true);
            byId('contestLogin').textContent = 'Повторить';
        }, 12000);
        function denied() {
            if (current !== generation) return;
            clearTimeout(accessTimeout);
            sourceRef?.off();
            sourceRef = null;
            gate('Доступ закрыт', 'Попросите владельца открыть доступ к контестам для вашего аккаунта.', false);
        }
        function subscribe() {
            if (sourceRef || current !== generation) return;
            const reference = db.ref('contestTable');
            sourceRef = reference;
            reference.on('value', snapshot => {
                if (current !== generation || sourceRef !== reference) return;
                clearTimeout(accessTimeout);
                request?.abort();
                request = null;
                contests = [];
                lastUpdated = 0;
                byId('contestResults').replaceChildren();
                byId('contestSelection').replaceChildren();
                byId('contestEmpty').hidden = true;
                config = snapshot.val();
                if (!config) {
                    gate('Таблица подключается', 'Подключение ещё не настроено.', false);
                    return;
                }
                byId('contestGate').hidden = true;
                byId('contestContent').hidden = false;
                const link = byId('contestSource');
                link.href = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(config.spreadsheetId) + '/edit';
                refresh();
            }, () => { if (sourceRef === reference) denied(); });
        }
        if (user.uid === '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2') subscribe();
        else {
            roleRef = db.ref('adminRoles/' + user.uid + '/contestsAccess');
            roleRef.on('value', snapshot => {
                if (snapshot.val() === true) subscribe();
                else denied();
            }, denied);
        }
    }

    function init() {
        byId('contestLogin').addEventListener('click', () => {
            if (!window.AlmanionAccount) {
                location.reload();
                return;
            }
            const user = window.AlmanionAccount.getUser();
            if (user && !user.isAnonymous && user.email) onAccount(user);
            else window.AlmanionAccount.openLogin();
        });
        byId('contestRefresh').addEventListener('click', refresh);
        byId('contestSearch').addEventListener('input', render);
        byId('contestSelection').addEventListener('change', render);
        byId('contestOrder').addEventListener('change', render);
        window.addEventListener('almanion-account-ready', event => onAccount(event.detail?.user));
        window.addEventListener('pagehide', () => { detach(); gate('Проверяем доступ', '', false); });
        window.addEventListener('pageshow', event => { if (event.persisted) onAccount(window.AlmanionAccount?.getUser()); });
        document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastUpdated >= 60000) refresh(); });
        setInterval(() => { if (!document.hidden && navigator.onLine && Date.now() - lastUpdated >= 60000) refresh(); }, 60000);
        if (window.AlmanionAccount) onAccount(window.AlmanionAccount.getUser());
        setTimeout(() => {
            if (window.AlmanionAccount) return;
            gate('Не удалось подключить аккаунт', 'Проверьте соединение и повторите попытку.', true);
            byId('contestLogin').textContent = 'Повторить';
        }, 12000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
}());
