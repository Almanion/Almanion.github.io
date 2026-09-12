(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root && root.document) {
        root.AlmanionHomeDashboard = api;
        api.init(root);
    }
}(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    const SETTINGS_KEY = 'homeQuickAccessByUser';
    const MAX_ITEMS = 3;
    const DEFAULT_PUBLIC = ['physics-10', 'matcenter', 'likbez'];
    const DEFAULT_WITH_ENGLISH = ['english', 'matcenter', 'likbez'];
    const CATALOG = [
        { id: 'physics-10', href: 'physics-10.html', title: 'Физика', context: '10 класс', subject: 'physics', icon: 'academic-physics', category: 'grade-10' },
        { id: 'chemistry-10', href: 'chemistry-10.html', title: 'Химия', context: '10 класс', subject: 'chemistry', icon: 'academic-chemistry', category: 'grade-10' },
        { id: 'literature-10', href: 'literature-10.html', title: 'Литература', context: '10 класс', subject: 'literature', icon: 'academic-literature', category: 'grade-10' },
        { id: 'physics-9', href: 'physics.html', title: 'Физика', context: '9 класс', subject: 'physics', icon: 'academic-physics', category: 'grade-9' },
        { id: 'chemistry-9', href: 'chemistry.html', title: 'Химия', context: '9 класс', subject: 'chemistry', icon: 'academic-chemistry', category: 'grade-9' },
        { id: 'math-9', href: 'math.html', title: 'Алгебра', context: '9 класс', subject: 'math', icon: 'academic-algebra', category: 'grade-9' },
        { id: 'geometry-9', href: 'geometry.html', title: 'Геометрия', context: '9 класс', subject: 'geometry', icon: 'academic-geometry', category: 'grade-9' },
        { id: 'physics-exam-9', href: 'physics-exam.html', title: 'Физика: билеты', context: '9 класс', subject: 'physics-exam', icon: 'academic-physics-exam', category: 'grade-9' },
        { id: 'matcenter', href: 'matcenter.html', title: 'МатЦентр', context: 'Задачи', subject: 'matcenter', icon: 'academic-matcenter', category: 'services' },
        { id: 'likbez', href: 'likbez.html', title: 'Ликбезы', context: 'Короткие курсы', subject: 'likbez', icon: 'academic-likbez', category: 'services' },
        { id: 'english', href: 'english.html', title: 'Английский', context: 'Vocabulary', subject: 'english', icon: 'academic-english', category: 'services', requiresEnglish: true },
        { id: 'duty-10-1', href: 'duty-10-1.html', title: 'Дежурство', context: '10‑1', subject: 'duty', icon: 'academic-duty', category: 'class-10-1' },
        { id: 'tour-10-1', href: 'tour-10-1.html', title: 'Туристический слёт', context: '10‑1', subject: 'tour', icon: 'academic-tour', category: 'class-10-1' }
    ];

    let controller = null;

    function normalizeSelection(value, allowedIds) {
        if (!Array.isArray(value)) return [];
        const allowed = new Set(allowedIds || CATALOG.map(function (item) { return item.id; }));
        const seen = new Set();
        return value.reduce(function (result, entry) {
            const id = String(entry || '');
            if (id && allowed.has(id) && !seen.has(id) && result.length < MAX_ITEMS) {
                seen.add(id);
                result.push(id);
            }
            return result;
        }, []);
    }

    function availableItems(englishAllowed) {
        return CATALOG.filter(function (item) { return !item.requiresEnglish || englishAllowed; });
    }

    function selectionFromSettings(settings, uid, englishAllowed) {
        const allowed = availableItems(englishAllowed).map(function (item) { return item.id; });
        const map = settings && settings[SETTINGS_KEY];
        const stored = uid && map && typeof map === 'object' && !Array.isArray(map) ? map[uid] : null;
        const selected = normalizeSelection(stored, allowed);
        return selected.length ? selected : normalizeSelection(englishAllowed ? DEFAULT_WITH_ENGLISH : DEFAULT_PUBLIC, allowed);
    }

    function init(win) {
        const doc = win.document;
        const grid = doc.getElementById('homeQuickGrid');
        const customize = doc.getElementById('homeQuickCustomize');
        if (!grid || !customize || grid.dataset.dashboardReady === 'true') return;
        grid.dataset.dashboardReady = 'true';

        let user = null;
        let englishAllowed = false;
        let englishKnown = false;
        let accessGeneration = 0;
        let editorPromise = null;

        function settingsApi() {
            return win.AlmanionSettings && win.AlmanionSettings.ready ? win.AlmanionSettings : null;
        }

        function readSettings() {
            const api = settingsApi();
            return api && typeof api.get === 'function' ? api.get() : (win.siteSettings || {});
        }

        function selected() {
            if (user && !englishKnown) return DEFAULT_PUBLIC.slice();
            return user
                ? selectionFromSettings(readSettings(), user.uid, englishAllowed)
                : DEFAULT_PUBLIC.slice();
        }

        function quickCard(item) {
            const card = doc.createElement('a');
            card.href = item.href;
            card.className = 'subject-card home-quick-card';
            card.dataset.subject = item.subject;
            card.dataset.quickId = item.id;
            card.innerHTML = '<div class="card-header"><div class="subject-icon">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#' + item.icon + '"/></svg>' +
                '</div></div><div class="card-body"><div class="home-quick-copy"><h2>' + item.title +
                '</h2><span class="home-quick-context">' + item.context +
                '</span></div><svg class="home-quick-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></div>';
            return card;
        }

        function render() {
            const byId = new Map(availableItems(englishAllowed).map(function (item) { return [item.id, item]; }));
            const fragment = doc.createDocumentFragment();
            selected().forEach(function (id) { if (byId.has(id)) fragment.appendChild(quickCard(byId.get(id))); });
            grid.replaceChildren(fragment);
            grid.dataset.count = String(grid.childElementCount);
        }

        function setAccount(account) {
            user = account || null;
            englishAllowed = false;
            englishKnown = !user;
            customize.hidden = !user;
            if (!user && win.AlmanionHomeQuickEditor) win.AlmanionHomeQuickEditor.close();
            render();
            const generation = ++accessGeneration;
            const accountApi = win.AlmanionAccount;
            if (!user || !accountApi || typeof accountApi.hasEnglishAccess !== 'function') return;
            Promise.resolve(accountApi.hasEnglishAccess(user)).then(function (allowed) {
                if (generation !== accessGeneration || !user || user.uid !== account.uid) return;
                englishAllowed = allowed === true;
                englishKnown = true;
                render();
            }).catch(function () {
                if (generation !== accessGeneration) return;
                englishKnown = true;
                render();
            });
        }

        function saveSelection(ids) {
            const api = settingsApi();
            if (!user || !api || typeof api.update !== 'function') return false;
            const settings = api.get();
            const oldMap = settings[SETTINGS_KEY];
            const map = oldMap && typeof oldMap === 'object' && !Array.isArray(oldMap) ? { ...oldMap } : {};
            map[user.uid] = normalizeSelection(ids, availableItems(englishAllowed).map(function (item) { return item.id; }));
            if (!map[user.uid].length) return false;
            api.update({ [SETTINGS_KEY]: map }, { apply: false });
            render();
            return true;
        }

        function loadEditor() {
            if (win.AlmanionHomeQuickEditor) return Promise.resolve(win.AlmanionHomeQuickEditor);
            if (editorPromise) return editorPromise;
            editorPromise = new Promise(function (resolve, reject) {
                const script = doc.createElement('script');
                script.src = 'home-quick-editor.js?v=20260912-1';
                script.onload = function () { resolve(win.AlmanionHomeQuickEditor); };
                script.onerror = function () { editorPromise = null; reject(new Error('Quick access editor failed to load')); };
                doc.head.appendChild(script);
            });
            return editorPromise;
        }

        customize.addEventListener('click', function () {
            if (!user) return;
            loadEditor().then(function (editor) { if (editor) editor.open(); }).catch(function () {
                if (win.AlmanionToast) win.AlmanionToast.show('Не удалось открыть настройку. Обновите страницу.', { type: 'error' });
            });
        });
        win.addEventListener('almanion-account-ready', function (event) { setAccount(event && event.detail && event.detail.user); });
        win.addEventListener('almanion-settings-changed', render);
        win.addEventListener('almanion-settings-applied', render);
        win.addEventListener('pageshow', function (event) {
            if (!event.persisted) return;
            const api = win.AlmanionAccount;
            setAccount(api && api.getUser ? api.getUser() : null);
        });

        controller = {
            getState: function () { return { user: user, englishAllowed: englishAllowed, selection: selected() }; },
            getAvailableItems: function () { return availableItems(englishAllowed).slice(); },
            saveSelection: saveSelection
        };
        const accountApi = win.AlmanionAccount;
        setAccount(accountApi && accountApi.getUser ? accountApi.getUser() : null);
    }

    return {
        init: init,
        catalog: CATALOG.slice(),
        maxItems: MAX_ITEMS,
        normalizeSelection: normalizeSelection,
        selectionFromSettings: selectionFromSettings,
        getState: function () { return controller && controller.getState(); },
        getAvailableItems: function () { return controller ? controller.getAvailableItems() : []; },
        saveSelection: function (ids) { return !!(controller && controller.saveSelection(ids)); }
    };
}));
