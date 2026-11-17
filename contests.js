(function () {
    'use strict';

    const byId = id => document.getElementById(id);
    const core = window.AlmanionContests;
    const preferencesKey = 'almanion:contests:view';
    const compactScreen = window.matchMedia('(max-width: 640px)');
    let config = null;
    let contests = [];
    let sourceRef = null;
    let roleRef = null;
    let request = null;
    let accessTimeout = 0;
    let generation = 0;
    let lastUpdated = 0;
    let lastAttempt = 0;
    let viewPreference = '';

    function element(tag, text, className) {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
    }

    function clearNote() {
        byId('contestNote').close();
        for (const id of ['contestNoteTitle', 'contestNoteScore', 'contestNoteText']) byId(id).textContent = '';
    }

    function loading(active) {
        byId('contestRefresh').disabled = active;
        byId('contestRefresh').classList.toggle('is-loading', active);
        byId('contestLoading').hidden = !active || !!lastUpdated;
        byId('contestContent').setAttribute('aria-busy', String(active));
    }

    function gate(title, message, signIn) {
        clearNote();
        loading(false);
        byId('contestGate').hidden = false;
        byId('contestContent').hidden = true;
        byId('contestGateTitle').textContent = title;
        byId('contestGateMessage').textContent = message;
        byId('contestLogin').hidden = !signIn;
        byId('contestResults').replaceChildren();
        byId('contestSelection').replaceChildren();
        byId('contestSource').removeAttribute('href');
        byId('contestStatus').textContent = '';
        config = null;
        contests = [];
        lastUpdated = 0;
        lastAttempt = 0;
        request?.abort();
    }

    function status(message, state = '') {
        byId('contestStatus').textContent = message;
        byId('contestStatus').dataset.state = state;
    }

    function updatedStatus() {
        const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(lastUpdated);
        status('Обновлено в ' + time, 'ready');
    }

    function applyView() {
        const view = viewPreference || (compactScreen.matches ? 'cards' : 'table');
        byId('contestResults').dataset.view = view;
        document.querySelectorAll('[data-contest-view]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.contestView === view));
        });
    }

    function rankBadge(rank) {
        const badge = element('span', rank ?? '—', 'contest-rank');
        badge.setAttribute('aria-label', rank ? 'Место ' + rank : 'Место не определено');
        return badge;
    }

    function scoreValue(person, column) {
        const cell = person.cells[column.index];
        const text = cell?.text || '—';
        const score = core.scoreNumber(cell);
        const value = element(cell?.note ? 'button' : 'span', text, 'contest-score');
        value.classList.toggle('is-positive', score !== null && score > 0);
        value.classList.toggle('is-empty', !cell?.text);
        if (!column.total && cell?.text && Number.isFinite(cell?.hue)) {
            value.dataset.sheetColor = '';
            value.style.setProperty('--score-hue', String(cell.hue));
        }
        if (cell?.note) {
            value.type = 'button';
            value.classList.add('has-note');
            value.setAttribute('aria-label', person.name + ', ' + column.label + ': ' + text + '. Примечание');
            value.setAttribute('aria-haspopup', 'dialog');
            value.addEventListener('click', () => {
                byId('contestNoteTitle').textContent = person.name + ' · ' + column.label;
                byId('contestNoteScore').textContent = text;
                byId('contestNoteText').textContent = cell.note;
                byId('contestNote').showModal();
            });
        }
        return value;
    }

    function columnLabel(column) {
        const label = element(column.link ? 'a' : 'span', column.label);
        if (column.link) {
            label.href = column.link;
            label.target = '_blank';
            label.rel = 'noopener noreferrer';
        }
        return label;
    }

    function sortHeading(label, order, contestId) {
        const th = element('th');
        th.scope = 'col';
        const active = byId('contestOrder').value === order;
        th.setAttribute('aria-sort', active ? (order === 'name' ? 'ascending' : 'descending') : 'none');
        const button = element('button', label, 'contest-sort');
        button.type = 'button';
        button.dataset.contestFocus = contestId + ':' + order;
        button.append(element('span', active ? (order === 'name' ? '↑' : '↓') : '↕', 'contest-sort-arrow'));
        button.setAttribute('aria-label', label + (order === 'name' ? ': по алфавиту' : ': по убыванию баллов'));
        button.addEventListener('click', () => {
            byId('contestOrder').value = order;
            render();
        });
        th.append(button);
        return th;
    }

    function render() {
        const selected = byId('contestSelection').value;
        const results = byId('contestResults');
        const focusKey = document.activeElement?.dataset.contestFocus;
        const scrollPositions = new Map(Array.from(results.querySelectorAll('[data-contest-scroll]'), node => [node.dataset.contestScroll, node.scrollLeft]));
        const fragment = document.createDocumentFragment();
        let visible = 0;
        for (const contest of contests) {
            if (selected && selected !== contest.id) continue;
            const people = core.filterPeople(contest, byId('contestSearch').value, byId('contestOrder').value);
            if (!people.length && byId('contestSearch').value.trim()) continue;
            const ranks = core.rankPeople(contest);
            visible++;
            const section = element('section', undefined, 'contest-section');
            const header = element('div', undefined, 'contest-section-header');
            const heading = element('h2');
            const title = element('a', contest.title, 'contest-title');
            title.href = contest.link;
            title.target = '_blank';
            title.rel = 'noopener noreferrer';
            heading.append(title);
            const count = element('span', people.length === contest.people.length ? people.length + ' уч.' : people.length + ' / ' + contest.people.length + ' уч.', 'contest-count');
            header.append(heading, count);
            section.append(header);
            if (!people.length) {
                section.append(element('p', 'Участники пока не добавлены', 'contest-empty'));
                fragment.append(section);
                continue;
            }
            const scroll = element('div', undefined, 'contest-table-scroll');
            scroll.tabIndex = 0;
            scroll.dataset.contestScroll = contest.id;
            scroll.dataset.contestFocus = contest.id + ':scroll';
            scroll.setAttribute('role', 'region');
            scroll.setAttribute('aria-label', 'Результаты: ' + contest.title);
            const table = element('table');
            const caption = element('caption', contest.title, 'sr-only');
            const thead = element('thead');
            const headings = element('tr');
            const nameHeading = sortHeading('Участник', 'name', contest.id);
            headings.append(nameHeading);
            for (const column of contest.columns) {
                const th = column.total ? sortHeading(column.label, 'total', contest.id) : element('th');
                if (!column.total) th.append(columnLabel(column));
                th.classList.toggle('contest-total', column.total);
                th.scope = 'col';
                headings.append(th);
            }
            thead.append(headings);
            const body = element('tbody');
            const cards = element('div', undefined, 'contest-people');
            for (const person of people) {
                const row = element('tr');
                const name = element('th');
                name.scope = 'row';
                const identity = element('div', undefined, 'contest-identity');
                if (ranks.size) identity.append(rankBadge(ranks.get(person)));
                identity.append(element('span', person.name));
                name.append(identity);
                row.append(name);
                const card = element('article', undefined, 'contest-person');
                const personHeader = element('div', undefined, 'contest-person-header');
                const cardIdentity = element('div', undefined, 'contest-identity');
                if (ranks.size) cardIdentity.append(rankBadge(ranks.get(person)));
                cardIdentity.append(element('h3', person.name));
                personHeader.append(cardIdentity);
                const scores = element('dl', undefined, 'contest-scores');
                for (const column of contest.columns) {
                    const td = element('td', undefined, column.total ? 'contest-total' : '');
                    const tableValue = scoreValue(person, column);
                    tableValue.dataset.contestFocus = person.id + ':' + column.index + ':table';
                    td.append(tableValue);
                    row.append(td);
                    const pair = element(column.total ? 'dl' : 'div');
                    const term = element('dt');
                    term.append(columnLabel(column));
                    const description = element('dd');
                    const cardValue = scoreValue(person, column);
                    cardValue.dataset.contestFocus = person.id + ':' + column.index + ':cards';
                    description.append(cardValue);
                    pair.append(term, description);
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
            fragment.append(section);
        }
        results.replaceChildren(fragment);
        results.querySelectorAll('[data-contest-scroll]').forEach(node => { node.scrollLeft = scrollPositions.get(node.dataset.contestScroll) || 0; });
        if (focusKey) Array.from(results.querySelectorAll('[data-contest-focus]')).find(node => node.dataset.contestFocus === focusKey)?.focus({ preventScroll: true });
        byId('contestEmpty').hidden = visible > 0;
        byId('contestEmptyMessage').textContent = contests.length ? 'Участники не найдены' : 'В таблице пока нет контестов';
        byId('contestReset').hidden = !byId('contestSearch').value.trim();
    }

    async function refresh() {
        if (!config || request) return;
        if (!navigator.onLine) {
            status(lastUpdated ? 'Нет сети · показаны загруженные результаты' : 'Нет сети · подключитесь и обновите таблицу', 'error');
            return;
        }
        const current = generation;
        const controller = new AbortController();
        request = controller;
        lastAttempt = Date.now();
        const timeout = setTimeout(() => controller.abort(), 20000);
        loading(true);
        byId('contestEmpty').hidden = true;
        status('Обновление…', 'loading');
        try {
            const url = new URL('https://sheets.googleapis.com/v4/spreadsheets/' + config.spreadsheetId);
            url.searchParams.set('key', config.apiKey);
            url.searchParams.set('includeGridData', 'true');
            url.searchParams.set('ranges', config.range);
            url.searchParams.set('prettyPrint', 'false');
            url.searchParams.set('fields', 'properties(title),sheets(properties(sheetId,title,hidden),data(startRow,startColumn,rowData(values(formattedValue,effectiveValue,hyperlink,note))))');
            const response = await fetch(url, { signal: controller.signal, credentials: 'omit', cache: 'no-store' });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            if (current !== generation || request !== controller || !config) return;
            // Request colors only within populated cells. Asking for effectiveFormat
            // across the configured 1000-row range expands defaults to megabytes.
            let hasFormatting = true;
            const ranges = core.formatRanges(data);
            if (ranges.length) {
                const formattingUrl = new URL(url);
                formattingUrl.searchParams.delete('ranges');
                ranges.forEach(range => formattingUrl.searchParams.append('ranges', range));
                formattingUrl.searchParams.set('fields', 'sheets(properties(sheetId),data(startRow,startColumn,rowData(values(formattedValue,effectiveFormat(backgroundColor,backgroundColorStyle)))))');
                try {
                    const formatting = await fetch(formattingUrl, { signal: controller.signal, credentials: 'omit', cache: 'no-store' });
                    if (!formatting.ok) throw new Error('HTTP ' + formatting.status);
                    core.mergeFormats(data, await formatting.json());
                } catch (_) {
                    hasFormatting = false;
                }
            }
            if (current !== generation || request !== controller || !config) return;
            const next = core.parseSpreadsheet(data, config);
            // An unchanged poll must not rebuild focused controls or reset table scrolling.
            const changed = !lastUpdated || JSON.stringify(next) !== JSON.stringify(contests);
            if (changed) {
                const selected = byId('contestSelection').value;
                contests = next;
                const select = byId('contestSelection');
                select.replaceChildren(new Option('Все контесты', ''));
                for (const contest of contests) select.append(new Option(contest.title, contest.id));
                select.value = contests.some(contest => contest.id === selected) ? selected : '';
                byId('contestSelectionLabel').hidden = contests.length < 2;
                clearNote();
            }
            lastUpdated = Date.now();
            if (hasFormatting) updatedStatus();
            else status('Баллы обновлены; цвета временно недоступны.', 'error');
            if (changed) render();
            else byId('contestEmpty').hidden = byId('contestResults').childElementCount > 0;
        } catch (_) {
            if (current !== generation || request !== controller || !config) return;
            status(lastUpdated ? 'Не удалось обновить. Показаны загруженные данные.' : 'Не удалось загрузить таблицу. Нажмите «Обновить».', 'error');
            if (lastUpdated) byId('contestEmpty').hidden = byId('contestResults').childElementCount > 0;
        } finally {
            clearTimeout(timeout);
            if (request === controller) request = null;
            if (current === generation && !request) loading(false);
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
                const next = snapshot.val();
                if (config && JSON.stringify(config) === JSON.stringify(next)) return;
                request?.abort();
                request = null;
                contests = [];
                lastUpdated = 0;
                loading(false);
                clearNote();
                byId('contestResults').replaceChildren();
                byId('contestSelection').replaceChildren();
                byId('contestEmpty').hidden = true;
                config = next;
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
        try { viewPreference = localStorage.getItem(preferencesKey) || ''; } catch (_) { /* Storage may be blocked. */ }
        if (!['table', 'cards'].includes(viewPreference)) viewPreference = '';
        applyView();
        compactScreen.addEventListener('change', applyView);
        document.querySelectorAll('[data-contest-view]').forEach(button => {
            button.addEventListener('click', () => {
                viewPreference = button.dataset.contestView;
                try { localStorage.setItem(preferencesKey, viewPreference); } catch (_) { /* The view still works in memory. */ }
                applyView();
            });
        });
        byId('contestNoteClose').addEventListener('click', clearNote);
        byId('contestNote').addEventListener('click', event => {
            if (event.target !== byId('contestNote')) return;
            const rect = event.target.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) clearNote();
        });
        byId('contestLogin').addEventListener('click', () => {
            if (!window.AlmanionAccount) {
                location.reload();
                return;
            }
            const user = window.AlmanionAccount.getUser();
            if (user && !user.isAnonymous && user.email) onAccount(user);
            else window.AlmanionAccount.openLogin();
        });
        byId('contestReset').addEventListener('click', () => {
            byId('contestSearch').value = '';
            render();
            byId('contestSearch').focus();
        });
        byId('contestRefresh').addEventListener('click', refresh);
        byId('contestSearch').addEventListener('input', render);
        byId('contestSelection').addEventListener('change', render);
        byId('contestOrder').addEventListener('change', render);
        window.addEventListener('almanion-account-ready', event => onAccount(event.detail?.user));
        window.addEventListener('pagehide', () => { detach(); gate('Проверяем доступ', '', false); });
        window.addEventListener('pageshow', event => { if (event.persisted) onAccount(window.AlmanionAccount?.getUser()); });
        window.addEventListener('offline', () => { if (config) status(lastUpdated ? 'Нет сети · показаны загруженные результаты' : 'Нет сети · подключитесь и обновите таблицу', 'error'); });
        window.addEventListener('online', () => { if (!document.hidden) refresh(); });
        document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastAttempt >= 60000) refresh(); });
        setInterval(() => { if (!document.hidden && navigator.onLine && Date.now() - lastAttempt >= 60000) refresh(); }, 60000);
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
