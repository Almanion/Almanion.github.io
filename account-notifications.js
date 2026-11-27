(function () {
    'use strict';

    const kinds = {
        notes: { label: 'Конспекты', page: 'admin.html', section: 'reviews', icon: 'notes' },
        art: { label: 'Фон', page: 'index.html', section: 'background-review', icon: 'art' },
        forecast: { label: 'Прогнозы', page: 'forecast.html', section: '', icon: 'forecast' }
    };
    const subjects = {
        physics: 'Физика · 9 класс', 'physics-10': 'Физика · 10 класс',
        math: 'Алгебра', geometry: 'Геометрия', chemistry: 'Химия · 9 класс',
        'chemistry-10': 'Химия · 10 класс', 'literature-10': 'Литература · 10 класс', likbez: 'Ликбезы'
    };
    const icons = {
        bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/>',
        notes: '<path d="M12 6a8 8 0 0 0-8-1v14a8 8 0 0 1 8 1 8 8 0 0 1 8-1V5a8 8 0 0 0-8 1v14M7 9h2m6 0h2m-2 4h2"/>',
        art: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="9" r="1.5"/><path d="m4 17 4-4 4 3 4-5 4 5"/>',
        forecast: '<path d="M4 5v14h16M7 14l4-4 3 2 5-6"/><path d="M15 6h4v4"/>',
        close: '<path d="m6 6 12 12M18 6 6 18"/>',
        arrow: '<path d="m9 6 6 6-6 6"/>',
        check: '<path d="m7 12 3 3 7-7"/><circle cx="12" cy="12" r="9"/>',
        error: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16h.01"/>',
        loading: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>'
    };
    const zone = 'Europe/Moscow';
    const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const year = new Intl.DateTimeFormat('ru-RU', { timeZone: zone, year: 'numeric' });
    const dateLong = new Intl.DateTimeFormat('ru-RU', { timeZone: zone, day: 'numeric', month: 'long', year: 'numeric' });
    const dateShort = new Intl.DateTimeFormat('ru-RU', { timeZone: zone, day: 'numeric', month: 'long' });
    const time = new Intl.DateTimeFormat('ru-RU', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const formatter = new Intl.NumberFormat('ru-RU');

    function counts(model) {
        const awaiting = (model.notes?.count || 0) + (model.art?.count || 0);
        const unread = model.forecast?.count || 0;
        const summary = [awaiting && formatter.format(awaiting) + ' на проверке',
            unread && formatter.format(unread) + (unread === 1 ? ' новое' : ' новых')].filter(Boolean).join(' · ');
        return { count: awaiting + unread, summary };
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function icon(node, name) {
        node.insertAdjacentHTML('beforeend',
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            icons[name] + '</svg>');
    }

    function button(className, text) {
        const node = element('button', className, text);
        node.type = 'button';
        return node;
    }

    function dayOf(at, now) {
        if (!at) return { key: '', label: 'Без даты' };
        const key = dayKey.format(at);
        if (key === dayKey.format(now)) return { key, label: 'Сегодня' };
        if (key === dayKey.format(now - 86400000)) return { key, label: 'Вчера' };
        const sameYear = year.format(at) === year.format(now);
        return { key, label: (sameYear ? dateShort : dateLong).format(at) };
    }

    function create({ baseUrl, retry, markForecast }) {
        const bell = button('account-notifications-trigger');
        bell.id = 'accountNotificationsBtn';
        bell.setAttribute('aria-haspopup', 'dialog');
        bell.setAttribute('aria-controls', 'accountNotifications');
        bell.setAttribute('aria-expanded', 'false');
        icon(bell, 'bell');
        const badge = element('span', 'account-review-count');
        badge.setAttribute('aria-hidden', 'true');
        bell.append(badge);

        const dialog = element('dialog', 'account-notifications');
        dialog.id = 'accountNotifications';
        dialog.setAttribute('aria-labelledby', 'accountNotificationsTitle');
        const head = element('header', 'account-notifications-head');
        const heading = element('h2', 'account-notifications-title', 'Уведомления');
        heading.id = 'accountNotificationsTitle';
        const summary = element('p', 'account-notifications-summary');
        summary.setAttribute('role', 'status');
        const headingGroup = element('div');
        headingGroup.append(heading, summary);
        const close = button('account-notifications-close');
        close.setAttribute('aria-label', 'Закрыть уведомления');
        icon(close, 'close');
        head.append(headingGroup, close);

        const filters = element('div', 'account-notifications-filters');
        filters.setAttribute('role', 'group');
        filters.setAttribute('aria-label', 'Тип уведомления');
        const filterButtons = {};
        for (const [key, label] of [['all', 'Все'], ...Object.entries(kinds).map(([key, kind]) => [key, kind.label])]) {
            const filterButton = button('', label);
            filterButton.addEventListener('click', () => {
                filter = key;
                scroll.scrollTop = 0;
                renderDialog();
            });
            filterButtons[key] = filterButton;
            filters.append(filterButton);
        }

        const scroll = element('div', 'account-notifications-scroll');
        const state = element('div', 'account-notifications-state');
        const groups = element('div', 'account-notifications-groups');
        scroll.append(state, groups);
        const footer = element('footer', 'account-notifications-footer');
        const footerLinks = {
            notes: linkTo('notes', '', 'К проверке конспектов'),
            art: linkTo('art', '', 'К проверке фона'),
            forecast: linkTo('forecast', '', 'К прогнозам')
        };
        const markAll = button('account-notifications-mark', 'Прочитать все');
        markAll.addEventListener('click', () => { close.focus({ preventScroll: true }); markForecast(); });
        footer.append(...Object.values(footerLinks), markAll);
        dialog.append(head, filters, scroll, footer);

        let model = null;
        let filter = 'all';
        let returnFocus = null;
        let backdropPress = false;

        function linkTo(kind, id, label) {
            const target = kinds[kind];
            const url = new URL(target.page, baseUrl);
            url.hash = target.section;
            if (id) url.searchParams.set('review', id);
            const link = element('a', '', label);
            link.href = url.href;
            return link;
        }

        function renderEntry(item) {
            const row = element('li');
            const link = item.href ? element('a') : linkTo(item.kind, item.id);
            if (item.href) link.href = item.href;
            link.className = 'account-notifications-entry';
            link.dataset.kind = item.kind;
            link.dataset.notificationKey = item.kind + ':' + item.id;
            if (item.seenKey) link.dataset.seenKey = item.seenKey;
            link.toggleAttribute('data-unread', Boolean(item.unread));
            const decoration = element('span', 'account-notifications-entry-icon');
            icon(decoration, kinds[item.kind].icon);
            const copy = element('span', 'account-notifications-entry-copy');
            const context = item.context || (item.kind === 'notes' ? subjects[item.subject] || 'Конспекты' : 'Фон главной');
            copy.append(element('span', 'account-notifications-context', context),
                element('strong', 'account-notifications-entry-title', item.title));
            if (item.author) copy.append(element('span', 'account-notifications-author', item.author));
            if (item.description) copy.append(element('span', 'account-notifications-author', item.description));
            if (item.unread) link.append(element('span', 'account-review-sr', 'Новое уведомление'));
            const tail = element('span', 'account-notifications-entry-tail');
            if (item.at) {
                const stamp = element('time', '', time.format(item.at));
                stamp.dateTime = new Date(item.at).toISOString();
                stamp.title = dateLong.format(item.at) + ', ' + time.format(item.at) + ' МСК';
                tail.append(stamp);
            }
            icon(tail, 'arrow');
            link.append(decoration, copy, tail);
            row.append(link);
            return row;
        }

        function renderGroups(entries) {
            const fragment = document.createDocumentFragment();
            const now = Date.now();
            let sectionKey = null, list;
            for (const item of entries) {
                const day = dayOf(item.at, now);
                if (day.key !== sectionKey) {
                    sectionKey = day.key;
                    const section = element('section');
                    list = element('ul', 'account-notifications-list');
                    section.append(element('h3', 'account-notifications-day', day.label), list);
                    fragment.append(section);
                }
                list.append(renderEntry(item));
            }
            groups.replaceChildren(fragment);
        }

        function renderState(status, compact, forecasts) {
            state.hidden = !status;
            state.replaceChildren();
            if (!status) return;
            state.dataset.state = status;
            state.toggleAttribute('data-compact', compact);
            const decoration = element('span', 'account-notifications-state-icon');
            icon(decoration, status === 'empty' ? 'check' : status);
            const title = {
                loading: 'Загружаем уведомления…',
                empty: forecasts ? 'По прогнозам пока нет уведомлений' : 'Нет заявок на проверку',
                error: compact ? 'Часть уведомлений недоступна' : 'Не удалось загрузить уведомления'
            }[status];
            state.append(decoration, element('strong', '', title));
            if (status === 'error') {
                const again = button('account-notifications-retry', 'Повторить');
                again.addEventListener('click', () => {
                    close.focus({ preventScroll: true });
                    retry();
                });
                state.append(again);
            }
        }

        function renderDialog() {
            if (!dialog.open || !model) return;
            const active = document.activeElement;
            const activeKey = active?.dataset.notificationKey;
            const stateWasFocused = state.contains(active);
            const caption = counts(model).summary;
            if (summary.textContent !== caption) summary.textContent = caption;
            summary.hidden = !caption;
            const offerFilter = Object.keys(kinds).filter(kind => kind === 'forecast'
                ? Boolean(model.forecast) : model[kind]?.count);
            filters.hidden = offerFilter.length < 2;
            if (filter !== 'all' && !offerFilter.includes(filter)) filter = 'all';
            if (filters.hidden) {
                if (filters.contains(active)) close.focus({ preventScroll: true });
                filter = 'all';
            }
            for (const [key, filterButton] of Object.entries(filterButtons)) {
                filterButton.hidden = key !== 'all' && !offerFilter.includes(key);
                filterButton.setAttribute('aria-pressed', String(filter === key));
            }
            const sources = filter === 'all' ? Object.values(model) : [model[filter]];
            const entries = sources.flatMap(source => source.entries).sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
            const error = sources.some(source => source.status === 'error');
            const loading = sources.some(source => source.status === 'loading');
            renderState(error ? 'error' : loading && !entries.length ? 'loading' : !entries.length ? 'empty' : '',
                Boolean(entries.length), filter === 'forecast' || Boolean(model.forecast));
            for (const [kind, link] of Object.entries(footerLinks)) link.hidden = !model[kind] || (filter === 'forecast' && kind !== 'forecast');
            markAll.hidden = !model.forecast?.count || !['all', 'forecast'].includes(filter);
            renderGroups(entries);
            if (activeKey || stateWasFocused) {
                const replacement = Array.from(groups.querySelectorAll('.account-notifications-entry'))
                    .find(link => link.dataset.notificationKey === activeKey);
                (replacement || (stateWasFocused && state.querySelector('button')) || close).focus({ preventScroll: true });
            }
        }

        function update(next) {
            model = next;
            const { count, summary } = counts(next);
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.hidden = !count;
            bell.setAttribute('aria-label', summary ? 'Уведомления · ' + summary : 'Уведомления');
            bell.title = 'Уведомления';
            renderDialog();
        }

        function place() {
            const anchored = returnFocus === bell && bell.isConnected;
            dialog.toggleAttribute('data-anchor', anchored);
            if (!anchored) return;
            const rect = bell.getBoundingClientRect();
            dialog.style.setProperty('--notification-top', Math.max(12, rect.bottom + 10) + 'px');
            dialog.style.setProperty('--notification-right', Math.max(12, document.documentElement.clientWidth - rect.right) + 'px');
        }

        function show(origin) {
            if (dialog.open || !document.body) return;
            if (!dialog.isConnected) document.body.append(dialog);
            returnFocus = origin;
            filter = 'all';
            place();
            dialog.showModal();
            bell.setAttribute('aria-expanded', 'true');
            scroll.scrollTop = 0;
            renderDialog();
            close.focus({ preventScroll: true });
        }

        bell.addEventListener('click', () => show(bell));
        close.addEventListener('click', () => dialog.close());
        dialog.addEventListener('pointerdown', event => { backdropPress = event.target === dialog; });
        dialog.addEventListener('click', event => {
            if (backdropPress && event.target === dialog) dialog.close();
            backdropPress = false;
        });
        dialog.addEventListener('close', () => {
            if (dialog.open) return;
            bell.setAttribute('aria-expanded', 'false');
            if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
        });
        dialog.addEventListener('click', event => {
            const link = event.target.closest('a');
            if (!link) return;
            if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) dialog.close();
            if (link.hasAttribute('data-unread')) markForecast(link.dataset.seenKey, true);
        });
        const adjustPosition = () => { if (dialog.open) place(); };
        window.addEventListener('resize', adjustPosition);

        return {
            bell, show, update,
            reset() {
                if (dialog.open) dialog.close();
                returnFocus = null;
                model = null;
                groups.replaceChildren();
                state.replaceChildren();
                summary.textContent = '';
                bell.remove();
                dialog.remove();
                window.removeEventListener('resize', adjustPosition);
            }
        };
    }

    window.AlmanionAccountNotifications = { create };
})();
