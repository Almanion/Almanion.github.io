window.createForecastRanking = function (account, amount) {
    'use strict';
    const byId = id => document.getElementById(id);
    const dialog = byId('forecastRanking'), list = byId('rankRows');
    const modes = [...dialog.querySelectorAll('[data-rank-mode]')];
    const pageSize = 25;
    const watched = new Map();
    let state, user, rows = [], mode = 'settled', limit = pageSize;

    function alias(uid) {
        let hash = 2166136261;
        for (let i = 0; i < uid.length; i++) hash = Math.imul(hash ^ uid.charCodeAt(i), 16777619);
        return 'Игрок ' + (hash >>> 0).toString(36).padStart(7, '0').toUpperCase();
    }
    function cell(tag, className) {
        const el = document.createElement(tag);
        el.className = className;
        el.setAttribute('role', 'cell');
        return el;
    }
    function paintName(item, identity) {
        const name = identity?.nickname || alias(item.uid);
        item.name.textContent = name;
        if (account?.profile) item.avatar.innerHTML = account.profile.avatarMarkup(identity, identity?.nickname || 'И');
    }
    function forget(item) {
        watched.delete(item.uid);
        item.visibilityRef?.off('value', item.onVisible);
        item.identityRef?.off('value', item.onIdentity);
    }
    function watch(uid) {
        const item = { uid, root: document.createElement('div'), rank: cell('span', 'rank-place'), score: cell('strong', 'rank-score') };
        item.root.className = 'rank-row';
        item.root.setAttribute('role', 'row');
        item.root.classList.toggle('is-mine', uid === user.uid);
        const person = cell('div', 'rank-person');
        item.avatar = document.createElement('span');
        item.name = document.createElement('span');
        person.append(item.avatar, item.name);
        if (uid === user.uid) {
            const badge = document.createElement('small');
            badge.textContent = 'Вы'; person.append(badge);
        }
        item.root.append(item.rank, person, item.score);
        watched.set(uid, item);
        paintName(item, null);
        if (!account?.profile) return item;
        const ref = account.database.ref('accountProfiles/' + uid);
        item.visibilityRef = ref.child('rankVisible');
        item.onVisible = snap => {
            if (watched.get(uid) !== item) return;
            if (item.identityRef) item.identityRef.off('value', item.onIdentity);
            item.identityRef = null;
            paintName(item, null);
            if (snap?.val() !== true) return;
            const identityRef = ref.child('identity');
            const onIdentity = snapshot => {
                if (watched.get(uid) === item && item.onIdentity === onIdentity && item.identityRef) paintName(item, snapshot?.val());
            };
            item.identityRef = identityRef; item.onIdentity = onIdentity;
            identityRef.on('value', onIdentity, () => onIdentity(null));
        };
        item.visibilityRef.on('value', item.onVisible, () => item.onVisible(null));
        return item;
    }
    function render() {
        if (!dialog.open || !user) return;
        const visible = rows.slice(0, limit);
        const wanted = new Set(visible.map(row => row.uid));
        for (const item of watched.values()) if (!wanted.has(item.uid)) forget(item);
        const nodes = [];
        for (const row of visible) {
            const item = watched.get(row.uid) || watch(row.uid);
            item.rank.textContent = row.rank;
            item.score.textContent = amount(row.score);
            nodes.push(item.root);
        }
        list.replaceChildren(...nodes);
        byId('rankTable').hidden = !rows.length;
        byId('rankMore').hidden = limit >= rows.length;
        const mine = rows.find(row => row.uid === user.uid);
        byId('rankMine').textContent = mine ? 'Ваше место — ' + mine.rank + ' · ' + amount(mine.score) + ' оч.'
            : rows.length ? 'Ваша первая сделка добавит вас в рейтинг.' : 'Сделок пока нет. Рейтинг появится после первой сделки.';
        for (const button of modes) button.setAttribute('aria-pressed', String(button.dataset.rankMode === mode));
    }
    function refresh() {
        if (!dialog.open || !state || !user) return;
        rows = window.PhysicsForecast.standings(state, mode);
        render();
    }
    function release() {
        for (const item of watched.values()) forget(item);
        list.replaceChildren();
        rows = [];
        byId('rankMine').textContent = '';
    }
    byId('rankOpen').addEventListener('click', () => {
        if (!user || !state || dialog.open) return;
        limit = pageSize;
        dialog.showModal();
        refresh();
    });
    byId('rankClose').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => {
        if (e.target !== dialog) return;
        const r = dialog.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => { if (!dialog.open) release(); });
    for (const button of modes) button.addEventListener('click', () => { mode = button.dataset.rankMode; refresh(); });
    byId('rankMore').addEventListener('click', () => { limit += pageSize; render(); });
    return {
        update(engine, actor) { state = engine; user = actor; refresh(); },
        reset() {
            state = user = null; mode = 'settled';
            if (dialog.open) dialog.close();
            release();
        }
    };
};
