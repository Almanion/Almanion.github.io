// ============================================
// ЗАКЛАДКИ
// ============================================

(function () {
    'use strict';

    const VISITOR_ID_KEY = 'almanion_visitor_id';
    const LOCAL_BOOKMARKS_KEY = 'almanion_bookmarks';
    const RESTORE_TARGET_KEY = 'almanion_bookmark_target';
    const BLOCK_SELECTOR = [
        '.definition-box', '.formula-box', '.theorem-box', '.remark-box',
        '.lemma-box', '.example-box', '.statement-box', '.corollary-box',
        '.properties-box', '.experiment-box', '.derivation-box', '.system-box'
    ].join(', ');

    const isEnglish = document.documentElement.lang.toLowerCase().startsWith('en')
        || /(^|\/)english(?:\.html)?$/i.test(location.pathname);
    const copy = isEnglish ? {
        sidebar: 'Bookmarks', title: 'Bookmarks', close: 'Close bookmarks',
        search: 'Search bookmarks', clear: 'Clear search', all: 'All',
        current: 'This page', reorder: 'Drag the handle to reorder bookmarks',
        emptyTitle: 'No bookmarks yet', emptyText: 'Save a useful block and it will appear here.',
        noResultsTitle: 'Nothing found', noResultsText: 'Try a different query or reset the filter.',
        open: 'Open block', remove: 'Remove bookmark', add: 'Add bookmark',
        move: 'Reorder bookmark', undoText: 'Bookmark removed', undo: 'Undo',
        currentPage: 'Current page', unavailable: 'The original block is unavailable.',
        types: {
            definition: 'Definition', formula: 'Formula', theorem: 'Theorem', remark: 'Note',
            lemma: 'Lemma', example: 'Example', statement: 'Statement', corollary: 'Corollary',
            properties: 'Properties', experiment: 'Experiment', derivation: 'Derivation', system: 'System', other: 'Block'
        }
    } : {
        sidebar: 'Закладки', title: 'Закладки', close: 'Закрыть закладки',
        search: 'Поиск по закладкам', clear: 'Очистить поиск', all: 'Все',
        current: 'Эта страница', reorder: 'Тяните за ручку, чтобы менять порядок закладок',
        emptyTitle: 'Закладок пока нет', emptyText: 'Сохраните полезный блок — он появится здесь.',
        noResultsTitle: 'Ничего не найдено', noResultsText: 'Попробуйте другой запрос или сбросьте фильтр.',
        open: 'Перейти к блоку', remove: 'Удалить закладку', add: 'Добавить в закладки',
        move: 'Изменить порядок закладки', undoText: 'Закладка удалена', undo: 'Отменить',
        currentPage: 'Текущая страница', unavailable: 'Исходный блок больше недоступен.',
        types: {
            definition: 'Определение', formula: 'Формула', theorem: 'Теорема', remark: 'Замечание',
            lemma: 'Лемма', example: 'Пример', statement: 'Утверждение', corollary: 'Следствие',
            properties: 'Свойства', experiment: 'Опыт', derivation: 'Вывод', system: 'Система', other: 'Блок'
        }
    };

    let db = null;
    let auth = null;
    let authSubscribed = false;
    let bookmarkRef = null;
    let bookmarkStore = null;
    let bookmarkOwnerUid = null;
    let bookmarkCacheKey = LOCAL_BOOKMARKS_KEY + '_guest';
    let bookmarks = {};
    let panelOpen = false;
    let panelScope = 'all';
    let panelQuery = '';
    let lastFocusedElement = null;
    let lastRemoved = null;
    let lastLocalWriteAt = 0;
    let restoreAttempts = 0;
    let restoreTimer = 0;
    let savedBodyOverflow = '';
    let activeDrag = null;
    let pendingPanelRender = false;
    let orderPersisting = false;

    const safeGet = window.safeStorageGet || function (key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    };
    const safeSet = window.safeStorageSet || function (key, value) {
        try { localStorage.setItem(key, value); return true; } catch (_) { return false; }
    };

    function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function normalizePath(value) {
        try {
            const url = new URL(value || location.pathname, location.href);
            return url.pathname.replace(/\/+$/, '') || '/';
        } catch (_) {
            return String(value || '').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
        }
    }

    function pageKey() {
        const file = location.pathname.split('/').pop() || 'index.html';
        return file.replace(/\.html$/i, '') || 'index';
    }

    function getVisitorId() {
        let id = safeGet(VISITOR_ID_KEY);
        if (!id) {
            id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
            safeSet(VISITOR_ID_KEY, id);
        }
        return id;
    }

    function initFirebase() {
        if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined' || !firebaseConfig) return false;
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        auth = typeof firebase.auth === 'function' ? firebase.auth() : null;
        return true;
    }

    function syncApi() {
        return window.AlmanionDataSync || null;
    }

    function bookmarkUpdatedAt(entry) {
        return Number(entry && (entry.updatedAt || entry.timestamp)) || 0;
    }

    function mergeBookmarkStores(local, remote) {
        const api = syncApi();
        if (api) return api.mergeRecords(local, remote);
        const merged = {};
        new Set(Object.keys(local || {}).concat(Object.keys(remote || {}))).forEach(function (id) {
            const a = local && local[id];
            const b = remote && remote[id];
            if (!a) merged[id] = b;
            else if (!b) merged[id] = a;
            else merged[id] = bookmarkUpdatedAt(b) >= bookmarkUpdatedAt(a) ? b : a;
        });
        return merged;
    }

    function handleBookmarkStoreChange(nextBookmarks, detail) {
        bookmarks = nextBookmarks || {};
        if (detail && detail.type === 'error') console.warn('Almanion bookmarks: sync deferred.', detail.error);
        refreshAllButtons();
        refreshSidebarCount();
        if (!panelOpen) return;
        if (activeDrag || orderPersisting) {
            pendingPanelRender = true;
            return;
        }
        if (Date.now() - lastLocalWriteAt > 500) renderBookmarksList();
    }

    function openBookmarkStore(owner, key, migrateGuest) {
        const api = syncApi();
        if (!api) return null;
        const options = {
            namespace: 'bookmarks',
            owner: owner || 'guest',
            storageKey: key,
            onChange: handleBookmarkStoreChange
        };
        if (migrateGuest) {
            options.guestStorageKey = LOCAL_BOOKMARKS_KEY + '_guest';
            options.accountStorageKey = key;
            return api.migrateGuest(options);
        }
        return api.createCollection(options);
    }

    function loadBookmarks() {
        try {
            const guest = safeGet(bookmarkCacheKey);
            const legacy = safeGet(LOCAL_BOOKMARKS_KEY);
            if (!guest && legacy) safeSet(bookmarkCacheKey, legacy);
            bookmarkStore = openBookmarkStore('guest', bookmarkCacheKey, false);
            bookmarks = bookmarkStore
                ? bookmarkStore.snapshot({ includeDeleted: true })
                : JSON.parse(guest || legacy || '{}');
        } catch (_) {
            bookmarks = {};
        }
        refreshSidebarCount();
    }

    function subscribeToAccount() {
        initFirebase();
        if (auth && !authSubscribed) {
            authSubscribed = true;
            auth.onAuthStateChanged(connectBookmarksAccount, function () { connectBookmarksAccount(null); });
            return;
        }
        const knownUser = window.AlmanionAccount && typeof window.AlmanionAccount.getUser === 'function'
            ? window.AlmanionAccount.getUser()
            : null;
        if (knownUser) connectBookmarksAccount(knownUser);
    }

    function connectBookmarksAccount(user) {
        const nextUid = user && user.uid ? user.uid : null;
        if (nextUid === bookmarkOwnerUid && bookmarkStore) return;

        if (bookmarkStore) bookmarkStore.disconnect();
        else safeSet(bookmarkCacheKey, JSON.stringify(bookmarks));
        if (bookmarkRef) {
            try { bookmarkRef.off(); } catch (_) {}
            bookmarkRef = null;
        }

        const previousUid = bookmarkOwnerUid;
        bookmarkOwnerUid = nextUid;
        bookmarkCacheKey = nextUid
            ? LOCAL_BOOKMARKS_KEY + '_uid_' + nextUid
            : LOCAL_BOOKMARKS_KEY + '_guest';

        let cachedForOwner = {};
        if (syncApi()) {
            bookmarkStore = openBookmarkStore(nextUid || 'guest', bookmarkCacheKey, !!nextUid && !previousUid);
            bookmarks = bookmarkStore.snapshot({ includeDeleted: true });
        } else {
            try { cachedForOwner = JSON.parse(safeGet(bookmarkCacheKey) || '{}'); } catch (_) {}
            bookmarks = nextUid && !previousUid ? mergeBookmarkStores(cachedForOwner, bookmarks) : cachedForOwner;
        }

        if (!db || !nextUid) {
            refreshAllButtons();
            refreshSidebarCount();
            if (panelOpen) renderBookmarksList();
            return;
        }

        bookmarkRef = db.ref('bookmarks/' + nextUid);
        if (bookmarkStore) {
            bookmarkStore.connect(bookmarkRef);
        } else {
            const ref = bookmarkRef;
            ref.once('value').then(function (snapshot) {
                if (bookmarkRef !== ref) return null;
                bookmarks = mergeBookmarkStores(bookmarks, snapshot.val() || {});
                safeSet(bookmarkCacheKey, JSON.stringify(bookmarks));
                return ref.update(bookmarks);
            }).then(function () {
                if (bookmarkRef !== ref) return;
                ref.on('value', function (snapshot) {
                    bookmarks = mergeBookmarkStores(bookmarks, snapshot.val() || {});
                    safeSet(bookmarkCacheKey, JSON.stringify(bookmarks));
                    handleBookmarkStoreChange(bookmarks);
                }, function () {});
            }).catch(function () {});
        }
        refreshAllButtons();
        refreshSidebarCount();
    }

    function hasBookmark(id) {
        return !!(bookmarks[id] && !bookmarks[id].deleted);
    }

    function saveBookmark(id, data, options) {
        const updatedAt = Date.now();
        const value = Object.assign({}, data, { deleted: false, updatedAt: updatedAt });
        bookmarks[id] = value;
        lastLocalWriteAt = updatedAt;
        if (bookmarkStore) {
            bookmarkStore.set(id, value, { updatedAt: updatedAt, flush: !(options && options.deferFlush) });
            bookmarks = bookmarkStore.snapshot({ includeDeleted: true });
        } else {
            if (bookmarkRef) bookmarkRef.child(id).set(value).catch(function () {});
            safeSet(bookmarkCacheKey, JSON.stringify(bookmarks));
        }
        refreshSidebarCount();
    }

    function removeBookmark(id) {
        const updatedAt = Date.now();
        const value = { deleted: true, updatedAt: updatedAt, timestamp: bookmarkUpdatedAt(bookmarks[id]) };
        bookmarks[id] = value;
        lastLocalWriteAt = updatedAt;
        if (bookmarkStore) {
            bookmarkStore.remove(id, value, { updatedAt: updatedAt });
            bookmarks = bookmarkStore.snapshot({ includeDeleted: true });
        } else {
            if (bookmarkRef) bookmarkRef.child(id).set(value).catch(function () {});
            safeSet(bookmarkCacheKey, JSON.stringify(bookmarks));
        }
        refreshSidebarCount();
    }

    function getBlockKey(box) {
        return normalizeText(box && (box.dataset.noteBlock || box.dataset.kcId));
    }

    function isTopLevelBlock(box) {
        const parentBlock = box.parentElement && box.parentElement.closest(BLOCK_SELECTOR);
        return !parentBlock;
    }

    function positionalBookmarkId(box) {
        const topic = box.closest('.topic[id], .content-section[id]');
        const topicId = topic ? topic.id : 'unknown';
        const boxes = topic ? Array.from(topic.querySelectorAll(BLOCK_SELECTOR)).filter(isTopLevelBlock) : [];
        return pageKey() + '__' + topicId + '_' + boxes.indexOf(box);
    }

    function generateBookmarkId(box) {
        const key = getBlockKey(box);
        return key ? pageKey() + '__b__' + encodeURIComponent(key) : positionalBookmarkId(box);
    }

    function pageMatches(entry) {
        return !entry.page || normalizePath(entry.page) === normalizePath(location.pathname);
    }

    function migrateLegacyBookmark(box, stableId) {
        const stableExists = !!(bookmarks[stableId] && !bookmarks[stableId].deleted);
        const topic = box.closest('.topic[id], .content-section[id]');
        if (!topic) return;
        const boxes = Array.from(topic.querySelectorAll(BLOCK_SELECTOR)).filter(isTopLevelBlock);
        const index = boxes.indexOf(box);
        const exactIds = [pageKey() + '__' + topic.id + '_' + index, topic.id + '_' + index];
        const preview = normalizeText(getBookmarkPreview(box)).toLocaleLowerCase();
        let legacyId = exactIds.find(function (id) {
            const item = bookmarks[id];
            return item && !item.deleted && pageMatches(item)
                && (!item.preview || normalizeText(item.preview).toLocaleLowerCase() === preview);
        });
        if (!legacyId) {
            legacyId = Object.keys(bookmarks).find(function (id) {
                const item = bookmarks[id];
                return item && !item.deleted && !id.includes('__b__') && pageMatches(item)
                    && (!item.topicId || item.topicId === topic.id)
                    && normalizeText(item.preview).toLocaleLowerCase() === preview;
            });
        }
        if (!legacyId) return;
        const legacy = bookmarks[legacyId];
        if (!stableExists) {
            saveBookmark(stableId, Object.assign({}, legacy, bookmarkMetadata(box), {
                timestamp: legacy.timestamp || Date.now()
            }), { deferFlush: true });
        }
        removeBookmark(legacyId);
    }

    function getBookmarkPreview(box) {
        return normalizeText(box && (box.innerText || box.textContent)).slice(0, 320);
    }

    function getBookmarkTitle(box) {
        const strong = box.querySelector('strong');
        if (strong && normalizeText(strong.textContent)) return normalizeText(strong.textContent).slice(0, 140);
        const preview = getBookmarkPreview(box);
        return preview.split(/[.!?]\s/)[0].slice(0, 140) || copy.types.other;
    }

    function getBookmarkExcerpt(box, title) {
        let preview = getBookmarkPreview(box);
        if (title && preview.toLocaleLowerCase().startsWith(title.toLocaleLowerCase())) {
            preview = preview.slice(title.length).replace(/^\s*(?:—|–|-|:|\.)\s*/, '');
        }
        return preview.slice(0, 260);
    }

    function getBoxType(box) {
        const types = ['definition', 'formula', 'theorem', 'remark', 'lemma', 'example', 'statement', 'corollary', 'properties', 'experiment', 'derivation', 'system'];
        return types.find(function (type) { return box.classList.contains(type + '-box'); }) || 'other';
    }

    function getTopicTitle(topic) {
        if (!topic) return '';
        const heading = topic.querySelector(':scope > .topic-title, :scope > h1, :scope > h2, :scope > h3');
        return normalizeText(heading && heading.textContent);
    }

    function cleanPageTitle() {
        const subject = document.querySelector('.subject-header h1, .subject-title, .page-title');
        if (subject && normalizeText(subject.textContent)) return normalizeText(subject.textContent);
        return normalizeText(document.title).split(/\s+[|·—]\s+/)[0] || location.pathname;
    }

    function bookmarkMetadata(box) {
        const topic = box.closest('.topic[id], .content-section[id]');
        const title = getBookmarkTitle(box);
        return {
            page: location.pathname,
            pageTitle: cleanPageTitle(),
            topicId: topic ? topic.id : '',
            topicTitle: getTopicTitle(topic),
            blockKey: getBlockKey(box),
            title: title,
            excerpt: getBookmarkExcerpt(box, title),
            preview: getBookmarkPreview(box),
            type: getBoxType(box)
        };
    }

    function bookmarkSvg(filled) {
        return '<svg class="bookmark-icon" viewBox="0 0 24 24" fill="' + (filled ? 'currentColor' : 'none')
            + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            + '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
    }

    function setBookmarkButtonState(button, active) {
        button.classList.toggle('bookmarked', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.setAttribute('aria-label', active ? copy.remove : copy.add);
        button.title = active ? copy.remove : copy.add;
        button.innerHTML = bookmarkSvg(active);
    }

    function addBookmarkButtons(root) {
        (root || document).querySelectorAll(BLOCK_SELECTOR).forEach(function (box) {
            if (!isTopLevelBlock(box) || box.querySelector(':scope > .bookmark-btn')) return;
            const id = generateBookmarkId(box);
            migrateLegacyBookmark(box, id);

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'bookmark-btn block-action-btn';
            button.dataset.bmId = id;
            setBookmarkButtonState(button, hasBookmark(id));
            button.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                if (hasBookmark(id)) {
                    removeBookmark(id);
                    setBookmarkButtonState(button, false);
                } else {
                    saveBookmark(id, Object.assign(bookmarkMetadata(box), { timestamp: Date.now() }));
                    setBookmarkButtonState(button, true);
                    button.classList.remove('bookmark-pop');
                    requestAnimationFrame(function () { button.classList.add('bookmark-pop'); });
                }
                if (panelOpen) renderBookmarksList();
            });
            box.style.position = 'relative';
            box.classList.add('has-bookmark-action');
            box.appendChild(button);
        });
    }

    function initLazyBookmarkButtons() {
        const topics = Array.from(document.querySelectorAll('.main-content .topic[id]'));
        if (!topics.length || !('IntersectionObserver' in window)) {
            addBookmarkButtons(document);
            return;
        }
        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                observer.unobserve(entry.target);
                addBookmarkButtons(entry.target);
            });
        }, { rootMargin: '900px 0px' });
        const hashTarget = location.hash
            ? document.getElementById(decodeURIComponent(location.hash.slice(1)))?.closest('.topic[id]')
            : null;
        const initial = hashTarget || topics[0];
        if (initial) addBookmarkButtons(initial);
        topics.forEach(function (topic) { if (topic !== initial) observer.observe(topic); });
        window.addEventListener('almanion:topic-visible', function (event) {
            const topic = event.detail && event.detail.topic;
            if (!topic) return;
            observer.unobserve(topic);
            addBookmarkButtons(topic);
        });
    }

    function refreshAllButtons() {
        document.querySelectorAll('.bookmark-btn').forEach(function (button) {
            setBookmarkButtonState(button, hasBookmark(button.dataset.bmId));
        });
    }

    function bookmarkFingerprint(entry) {
        if (!entry) return '';
        const page = normalizePath(entry.page || location.pathname);
        const blockKey = normalizeText(entry.blockKey);
        return blockKey ? page + '|block:' + blockKey : '';
    }

    function legacyBookmarkFingerprint(entry) {
        if (!entry) return '';
        const page = normalizePath(entry.page || location.pathname);
        const preview = normalizeText(entry.preview || entry.excerpt || entry.title).toLocaleLowerCase();
        return preview && entry.topicId
            ? page + '|legacy:' + normalizeText(entry.topicId) + '|' + preview
            : '';
    }

    function preferBookmarkEntry(first, second) {
        const firstStable = !!normalizeText(first && first.blockKey);
        const secondStable = !!normalizeText(second && second.blockKey);
        if (firstStable !== secondStable) return firstStable ? first : second;
        return bookmarkUpdatedAt(second) > bookmarkUpdatedAt(first) ? second : first;
    }

    function deduplicateEntries(entries) {
        const stableByFingerprint = new Map();
        const stableByLegacyFingerprint = new Map();
        entries.forEach(function (entry) {
            if (!normalizeText(entry.blockKey)) return;
            const fingerprint = bookmarkFingerprint(entry);
            const current = stableByFingerprint.get(fingerprint);
            const preferred = current ? preferBookmarkEntry(current, entry) : entry;
            stableByFingerprint.set(fingerprint, preferred);
            const legacyFingerprint = legacyBookmarkFingerprint(preferred);
            if (legacyFingerprint) stableByLegacyFingerprint.set(legacyFingerprint, preferred);
        });

        const output = [];
        const seenIds = new Set();
        const seenStable = new Map();
        entries.forEach(function (entry) {
            if (!entry || !entry.id || seenIds.has(entry.id)) return;
            seenIds.add(entry.id);
            const fingerprint = bookmarkFingerprint(entry);
            if (!normalizeText(entry.blockKey) && stableByLegacyFingerprint.has(legacyBookmarkFingerprint(entry))) return;
            if (normalizeText(entry.blockKey) && fingerprint) {
                const existingIndex = seenStable.get(fingerprint);
                if (existingIndex != null) {
                    output[existingIndex] = preferBookmarkEntry(output[existingIndex], entry);
                    return;
                }
                seenStable.set(fingerprint, output.length);
            }
            output.push(entry);
        });
        return output;
    }

    function sortedEntries() {
        const entries = Object.entries(bookmarks)
            .filter(function (pair) { return pair[1] && !pair[1].deleted; })
            .map(function (pair) { return Object.assign({ id: pair[0] }, pair[1]); });
        return deduplicateEntries(entries).sort(function (a, b) {
                const aOrder = typeof a.order === 'number' ? a.order : Infinity;
                const bOrder = typeof b.order === 'number' ? b.order : Infinity;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return (b.timestamp || 0) - (a.timestamp || 0);
            });
    }

    function currentPageEntries(entries) {
        return entries.filter(function (entry) { return pageMatches(entry); });
    }

    function refreshSidebarCount() {
        const badge = document.querySelector('#bookmarksBtn .bookmarks-sidebar-count');
        if (!badge) return;
        const count = sortedEntries().length;
        badge.textContent = String(count);
        badge.hidden = count === 0;
    }

    function addBookmarksSidebarButton() {
        let button = document.getElementById('bookmarksBtn');
        if (!button) {
            const container = document.querySelector('.sidebar-actions') || document.querySelector('.nav-menu');
            if (!container) return;
            button = document.createElement('button');
            button.type = 'button';
            button.className = 'knowledge-check-btn bookmarks-sidebar-button';
            button.id = 'bookmarksBtn';
            button.innerHTML = bookmarkSvg(false) + '<span>' + copy.sidebar + '</span><span class="bookmarks-sidebar-count" hidden></span>';
            container.appendChild(button);
        }
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-controls', 'bookmarksOverlay');
        button.setAttribute('aria-expanded', 'false');
        if (button.dataset.bookmarksBound !== 'true') {
            button.dataset.bookmarksBound = 'true';
            button.addEventListener('click', openBookmarksPanel);
        }
        refreshSidebarCount();
    }

    function ensurePanel() {
        let overlay = document.getElementById('bookmarksOverlay');
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = 'bookmarksOverlay';
        overlay.className = 'auth-overlay bookmarks-overlay hidden';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = [
            '<section id="bookmarksModal" class="bookmarks-panel" role="dialog" aria-modal="true" aria-labelledby="bookmarksTitle">',
            '  <div class="bookmarks-grabber" aria-hidden="true"></div>',
            '  <header class="bookmarks-header">',
            '    <div class="bookmarks-heading-icon">' + bookmarkSvg(false) + '</div>',
            '    <div class="bookmarks-heading-copy"><h2 id="bookmarksTitle">' + copy.title + '</h2><p><span id="bookmarksTotal">0</span></p></div>',
            '    <button type="button" class="bookmarks-close" aria-label="' + copy.close + '"><span aria-hidden="true">×</span></button>',
            '  </header>',
            '  <div class="bookmarks-tools">',
            '    <label class="bookmarks-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="bookmarksSearch" type="search" autocomplete="off" placeholder="' + copy.search + '" aria-label="' + copy.search + '"><button type="button" class="bookmarks-search-clear" aria-label="' + copy.clear + '" hidden>×</button></label>',
            '    <div class="bookmarks-scope" role="group" aria-label="' + copy.title + '">',
            '      <button type="button" data-bm-scope="all" aria-pressed="true"><span>' + copy.all + '</span><b id="bookmarksAllCount">0</b></button>',
            '      <button type="button" data-bm-scope="current" aria-pressed="false"><span>' + copy.current + '</span><b id="bookmarksCurrentCount">0</b></button>',
            '    </div>',
            '    <p class="bookmarks-reorder-hint" id="bookmarksReorderHint">' + copy.reorder + '</p>',
            '  </div>',
            '  <div class="bookmarks-list" id="bookmarksList" tabindex="-1"></div>',
            '  <div class="bookmarks-undo" id="bookmarksUndo" role="status" aria-live="polite" hidden><span>' + copy.undoText + '</span><button type="button">' + copy.undo + '</button></div>',
            '  <p class="bookmarks-live" id="bookmarksLive" aria-live="polite"></p>',
            '</section>'
        ].join('');
        document.body.appendChild(overlay);

        overlay.addEventListener('pointerdown', function (event) {
            if (event.target === overlay) closeBookmarksPanel();
        });
        overlay.querySelector('.bookmarks-close').addEventListener('click', closeBookmarksPanel);
        const search = overlay.querySelector('#bookmarksSearch');
        const clear = overlay.querySelector('.bookmarks-search-clear');
        search.addEventListener('input', function () {
            panelQuery = normalizeText(search.value).toLocaleLowerCase();
            clear.hidden = !search.value;
            renderBookmarksList();
        });
        clear.addEventListener('click', function () {
            search.value = '';
            panelQuery = '';
            clear.hidden = true;
            search.focus();
            renderBookmarksList();
        });
        overlay.querySelectorAll('[data-bm-scope]').forEach(function (button) {
            button.addEventListener('click', function () {
                panelScope = button.dataset.bmScope;
                renderBookmarksList();
            });
        });
        overlay.querySelector('#bookmarksUndo button').addEventListener('click', undoLastRemoval);
        overlay.addEventListener('keydown', handlePanelKeydown);
        initBookmarksSwipe(overlay);
        return overlay;
    }

    function openBookmarksPanel() {
        const overlay = ensurePanel();
        if (panelOpen) {
            renderBookmarksList();
            requestAnimationFrame(function () { overlay.querySelector('#bookmarksSearch').focus(); });
            return;
        }
        lastFocusedElement = document.activeElement;
        panelOpen = true;
        savedBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.body.classList.add('bookmarks-open');
        overlay.classList.remove('hidden');
        overlay.setAttribute('aria-hidden', 'false');
        document.getElementById('bookmarksBtn')?.setAttribute('aria-expanded', 'true');
        renderBookmarksList();
        requestAnimationFrame(function () { overlay.querySelector('#bookmarksSearch').focus(); });
    }

    function closeBookmarksPanel() {
        const overlay = document.getElementById('bookmarksOverlay');
        if (!overlay || !panelOpen) return;
        if (activeDrag) finishActiveDrag(true);
        panelOpen = false;
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = savedBodyOverflow;
        document.body.classList.remove('bookmarks-open');
        document.getElementById('bookmarksBtn')?.setAttribute('aria-expanded', 'false');
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
    }

    function handlePanelKeydown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeBookmarksPanel();
            return;
        }
        if (event.key !== 'Tab') return;
        const overlay = document.getElementById('bookmarksOverlay');
        const focusable = Array.from(overlay.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'))
            .filter(function (node) { return !node.hidden && node.offsetParent !== null; });
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function initBookmarksSwipe(overlay) {
        const handle = overlay.querySelector('.bookmarks-grabber');
        const header = overlay.querySelector('.bookmarks-header');
        let startY = 0;
        let deltaY = 0;
        let tracking = false;
        function start(event) {
            if (innerWidth > 720 || event.pointerType === 'mouse') return;
            startY = event.clientY;
            deltaY = 0;
            tracking = true;
            try { event.currentTarget.setPointerCapture(event.pointerId); } catch (_) {}
        }
        function move(event) {
            if (!tracking) return;
            deltaY = Math.max(0, event.clientY - startY);
            overlay.querySelector('.bookmarks-panel').style.transform = 'translateY(' + deltaY + 'px)';
        }
        function end() {
            if (!tracking) return;
            tracking = false;
            const panel = overlay.querySelector('.bookmarks-panel');
            if (deltaY > 90) closeBookmarksPanel();
            panel.style.transform = '';
        }
        [handle, header].forEach(function (target) {
            target.addEventListener('pointerdown', start);
            target.addEventListener('pointermove', move);
            target.addEventListener('pointerup', end);
            target.addEventListener('pointercancel', end);
        });
    }

    function matchesSearch(bookmark) {
        if (!panelQuery) return true;
        return [bookmark.title, bookmark.excerpt, bookmark.preview, bookmark.topicTitle, bookmark.pageTitle, copy.types[bookmark.type]]
            .map(normalizeText).join(' ').toLocaleLowerCase().includes(panelQuery);
    }

    function canReorder() {
        return panelScope === 'all' && !panelQuery;
    }

    function renderBookmarksList() {
        if (activeDrag || orderPersisting) {
            pendingPanelRender = true;
            return;
        }
        pendingPanelRender = false;
        const overlay = ensurePanel();
        const list = overlay.querySelector('#bookmarksList');
        const previousScroll = list.scrollTop;
        const activeId = document.activeElement && document.activeElement.closest('.bm-card')?.dataset.bmId;
        const all = sortedEntries();
        const current = currentPageEntries(all);
        const scoped = panelScope === 'current' ? current : all;
        const visible = scoped.filter(matchesSearch);

        overlay.querySelector('#bookmarksTotal').textContent = all.length === 1
            ? (isEnglish ? '1 saved block' : '1 сохранённый блок')
            : (isEnglish ? all.length + ' saved blocks' : all.length + ' сохранённых блоков');
        overlay.querySelector('#bookmarksAllCount').textContent = all.length;
        overlay.querySelector('#bookmarksCurrentCount').textContent = current.length;
        overlay.querySelectorAll('[data-bm-scope]').forEach(function (button) {
            button.setAttribute('aria-pressed', button.dataset.bmScope === panelScope ? 'true' : 'false');
        });
        overlay.querySelector('#bookmarksReorderHint').hidden = !canReorder() || all.length < 2;

        list.textContent = '';
        if (!visible.length) {
            const empty = document.createElement('div');
            empty.className = 'bookmarks-empty';
            const noResults = !!panelQuery || (panelScope === 'current' && all.length > 0);
            empty.innerHTML = bookmarkSvg(false)
                + '<h3>' + (noResults ? copy.noResultsTitle : copy.emptyTitle) + '</h3>'
                + '<p>' + (noResults ? copy.noResultsText : copy.emptyText) + '</p>';
            list.appendChild(empty);
        } else {
            const fragment = document.createDocumentFragment();
            visible.forEach(function (bookmark) { fragment.appendChild(createBookmarkCard(bookmark, canReorder())); });
            list.appendChild(fragment);
            if (canReorder()) initDragSort(list);
        }
        requestAnimationFrame(function () {
            list.scrollTop = previousScroll;
            if (activeId) list.querySelector('[data-bm-id="' + CSS.escape(activeId) + '"] button')?.focus();
        });
        refreshSidebarCount();
    }

    function bookmarkDisplayData(bookmark) {
        const box = pageMatches(bookmark) ? findBoxById(bookmark.id, bookmark) : null;
        if (!box) return {
            title: bookmark.title || bookmark.preview || copy.types.other,
            excerpt: bookmark.excerpt || bookmark.preview || '',
            type: bookmark.type || 'other'
        };
        const title = getBookmarkTitle(box);
        return { title: title, excerpt: getBookmarkExcerpt(box, title), type: getBoxType(box) };
    }

    function createBookmarkCard(bookmark, reorderEnabled) {
        const data = bookmarkDisplayData(bookmark);
        const card = document.createElement('article');
        card.className = 'bm-card';
        card.dataset.bmId = bookmark.id;
        card.dataset.bmType = data.type;
        card.style.setProperty('--bm-type', getTypeColor(data.type));

        const meta = document.createElement('div');
        meta.className = 'bm-card-meta';
        const type = document.createElement('span');
        type.className = 'bm-card-type';
        type.textContent = copy.types[data.type] || copy.types.other;
        meta.appendChild(type);
        const context = document.createElement('span');
        context.className = 'bm-card-context';
        context.textContent = [bookmark.pageTitle, bookmark.topicTitle].filter(Boolean).join(' · ') || copy.currentPage;
        context.title = context.textContent;
        meta.appendChild(context);
        card.appendChild(meta);

        const main = document.createElement('button');
        main.type = 'button';
        main.className = 'bm-card-main';
        main.innerHTML = '<span class="bm-card-copy"><strong></strong><span></span></span><span class="bm-card-open-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg></span>';
        main.querySelector('strong').textContent = data.title;
        main.querySelector('.bm-card-copy > span').textContent = data.excerpt;
        main.setAttribute('aria-label', copy.open + ': ' + data.title);
        main.addEventListener('click', function () { navigateToBookmark(bookmark); });
        card.appendChild(main);

        const actions = document.createElement('div');
        actions.className = 'bm-card-actions';
        if (reorderEnabled) {
            const handle = document.createElement('button');
            handle.type = 'button';
            handle.className = 'bm-drag-handle';
            handle.setAttribute('aria-label', copy.move + ': ' + data.title);
            handle.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';
            handle.addEventListener('keydown', function (event) {
                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                event.preventDefault();
                moveCardByKeyboard(card, event.key === 'ArrowUp' ? -1 : 1);
            });
            actions.appendChild(handle);
        }
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'bm-card-delete';
        remove.setAttribute('aria-label', copy.remove + ': ' + data.title);
        remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6"/></svg>';
        remove.addEventListener('click', function () { deleteBookmarkFromPanel(bookmark); });
        actions.appendChild(remove);
        card.appendChild(actions);
        return card;
    }

    function deleteBookmarkFromPanel(bookmark) {
        const all = sortedEntries();
        lastRemoved = { id: bookmark.id, data: Object.assign({}, bookmark), index: all.findIndex(function (item) { return item.id === bookmark.id; }) };
        removeBookmark(bookmark.id);
        refreshAllButtons();
        const undo = document.getElementById('bookmarksUndo');
        undo.hidden = false;
        renderBookmarksList();
    }

    function undoLastRemoval() {
        if (!lastRemoved) return;
        const restored = Object.assign({}, lastRemoved.data);
        delete restored.id;
        delete restored.deleted;
        saveBookmark(lastRemoved.id, restored);
        lastRemoved = null;
        document.getElementById('bookmarksUndo').hidden = true;
        refreshAllButtons();
        renderBookmarksList();
    }

    function persistOrder(orderedIds) {
        orderedIds = Array.from(new Set((orderedIds || []).filter(function (id) { return hasBookmark(id); })));
        if (!orderedIds.length) return;
        const updatedAt = Date.now();
        lastLocalWriteAt = updatedAt;
        orderPersisting = true;
        try {
            orderedIds.forEach(function (id, index) {
                bookmarks[id].order = (index + 1) * 1000;
                bookmarks[id].updatedAt = updatedAt;
                if (bookmarkStore) bookmarkStore.set(id, bookmarks[id], { updatedAt: updatedAt, flush: false });
            });
            if (bookmarkStore) {
                bookmarks = bookmarkStore.snapshot({ includeDeleted: true });
                bookmarkStore.flush();
            } else {
                safeSet(bookmarkCacheKey, JSON.stringify(bookmarks));
                if (bookmarkRef) {
                    const updates = {};
                    orderedIds.forEach(function (id, index) {
                        updates[id + '/order'] = (index + 1) * 1000;
                        updates[id + '/updatedAt'] = updatedAt;
                    });
                    bookmarkRef.update(updates).catch(function () {});
                }
            }
        } finally {
            orderPersisting = false;
        }
    }

    function moveCardByKeyboard(card, direction) {
        const sibling = direction < 0 ? card.previousElementSibling : card.nextElementSibling;
        if (!sibling || !sibling.classList.contains('bm-card')) return;
        const list = card.parentElement;
        const movedId = card.dataset.bmId;
        if (direction < 0) list.insertBefore(card, sibling);
        else list.insertBefore(sibling, card);
        persistOrder(Array.from(list.querySelectorAll('.bm-card')).map(function (item) { return item.dataset.bmId; }));
        announce((isEnglish ? 'Bookmark moved to position ' : 'Закладка перемещена на позицию ')
            + (Array.from(list.querySelectorAll('.bm-card')).indexOf(card) + 1));
        renderBookmarksList();
        requestAnimationFrame(function () {
            list.querySelector('[data-bm-id="' + CSS.escape(movedId) + '"] .bm-drag-handle')?.focus();
        });
    }

    function cardIdsInList(list) {
        return Array.from(new Set(Array.from(list.querySelectorAll(':scope > .bm-card')).map(function (item) {
            return item.dataset.bmId;
        }).filter(Boolean)));
    }

    function sameOrder(first, second) {
        return first.length === second.length && first.every(function (id, index) { return id === second[index]; });
    }

    function placeDropPlaceholder(state, clientY) {
        const cards = Array.from(state.list.querySelectorAll(':scope > .bm-card'));
        const before = cards.find(function (item) {
            const rect = item.getBoundingClientRect();
            return clientY < rect.top + rect.height / 2;
        });
        if (before) state.list.insertBefore(state.placeholder, before);
        else state.list.appendChild(state.placeholder);
    }

    function onActiveDragMove(event) {
        const state = activeDrag;
        if (!state || event.pointerId !== state.pointerId) return;
        event.preventDefault();
        state.moved = state.moved || Math.abs(event.clientY - state.startY) > 3;
        const top = Math.max(8, Math.min(innerHeight - state.height - 8, event.clientY - state.offsetY));
        state.card.style.top = top + 'px';
        placeDropPlaceholder(state, event.clientY);

        const bounds = state.list.getBoundingClientRect();
        const edge = 58;
        if (event.clientY < bounds.top + edge) {
            state.list.scrollTop -= Math.ceil((bounds.top + edge - event.clientY) / 4);
        } else if (event.clientY > bounds.bottom - edge) {
            state.list.scrollTop += Math.ceil((event.clientY - (bounds.bottom - edge)) / 4);
        }
    }

    function finishActiveDrag(cancelled) {
        const state = activeDrag;
        if (!state) return;
        document.removeEventListener('pointermove', onActiveDragMove);
        document.removeEventListener('pointerup', onActiveDragEnd);
        document.removeEventListener('pointercancel', onActiveDragCancel);
        try { state.handle.releasePointerCapture(state.pointerId); } catch (_) {}

        if (state.placeholder.isConnected) state.placeholder.replaceWith(state.card);
        else state.list.appendChild(state.card);
        state.card.classList.remove('bm-dragging');
        if (state.originalStyle == null) state.card.removeAttribute('style');
        else state.card.setAttribute('style', state.originalStyle);
        document.body.classList.remove('bookmarks-reordering');

        if (cancelled) {
            const cards = new Map(Array.from(state.list.querySelectorAll(':scope > .bm-card')).map(function (card) {
                return [card.dataset.bmId, card];
            }));
            state.originalOrder.forEach(function (id) {
                const card = cards.get(id);
                if (card) state.list.appendChild(card);
            });
        }

        const nextOrder = cardIdsInList(state.list);
        const changed = !cancelled && state.moved && !sameOrder(state.originalOrder, nextOrder);
        const movedId = state.card.dataset.bmId;
        activeDrag = null;
        if (changed) {
            persistOrder(nextOrder);
            announce((isEnglish ? 'Bookmark moved to position ' : 'Закладка перемещена на позицию ')
                + (nextOrder.indexOf(movedId) + 1));
        }

        const shouldRender = changed || pendingPanelRender;
        pendingPanelRender = false;
        if (shouldRender && panelOpen) renderBookmarksList();
        if (!cancelled && panelOpen) requestAnimationFrame(function () {
            state.list.querySelector('[data-bm-id="' + CSS.escape(movedId) + '"] .bm-drag-handle')?.focus();
        });
    }

    function onActiveDragEnd(event) {
        if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
        finishActiveDrag(false);
    }

    function onActiveDragCancel(event) {
        if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
        finishActiveDrag(true);
    }

    function startActiveDrag(event, handle, list) {
        if (activeDrag || !canReorder()) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const card = handle.closest('.bm-card');
        if (!card || card.parentElement !== list) return;
        event.preventDefault();

        const rect = card.getBoundingClientRect();
        const placeholder = document.createElement('div');
        placeholder.className = 'bm-drop-placeholder';
        placeholder.setAttribute('aria-hidden', 'true');
        placeholder.style.height = rect.height + 'px';
        card.after(placeholder);

        activeDrag = {
            pointerId: event.pointerId,
            handle: handle,
            card: card,
            list: list,
            placeholder: placeholder,
            originalOrder: cardIdsInList(list),
            originalStyle: card.getAttribute('style'),
            startY: event.clientY,
            offsetY: event.clientY - rect.top,
            height: rect.height,
            moved: false
        };
        // The dragged card becomes a single floating preview; the placeholder is
        // the only element that changes position inside the list.
        document.body.appendChild(card);
        card.classList.add('bm-dragging');
        card.style.position = 'fixed';
        card.style.left = rect.left + 'px';
        card.style.top = rect.top + 'px';
        card.style.width = rect.width + 'px';
        card.style.height = rect.height + 'px';
        card.style.margin = '0';
        card.style.zIndex = '14020';
        card.style.pointerEvents = 'none';
        document.body.classList.add('bookmarks-reordering');
        try { handle.setPointerCapture(event.pointerId); } catch (_) {}
        document.addEventListener('pointermove', onActiveDragMove, { passive: false });
        document.addEventListener('pointerup', onActiveDragEnd);
        document.addEventListener('pointercancel', onActiveDragCancel);
    }

    function initDragSort(list) {
        if (list.dataset.dragSortBound === 'true') return;
        list.dataset.dragSortBound = 'true';
        list.addEventListener('pointerdown', function (event) {
            const handle = event.target.closest('.bm-drag-handle');
            if (handle && list.contains(handle)) startActiveDrag(event, handle, list);
        });
    }

    function getTypeColor(type) {
        return {
            definition: '#4f78b8', formula: '#7967ad', theorem: '#a46f35', remark: '#4e8775',
            lemma: '#9a6944', example: '#477f91', statement: '#9a5e78', corollary: '#6672a5',
            properties: '#4d827c', experiment: '#a85e59', derivation: '#8065a1', system: '#4d7996'
        }[type] || '#727889';
    }

    function findBoxById(bookmarkId, bookmark) {
        let key = bookmark && bookmark.blockKey;
        const marker = String(bookmarkId || '').indexOf('__b__');
        if (!key && marker >= 0) {
            try { key = decodeURIComponent(String(bookmarkId).slice(marker + 5)); } catch (_) {}
        }
        if (key) {
            const found = Array.from(document.querySelectorAll(BLOCK_SELECTOR)).find(function (box) {
                return getBlockKey(box) === key;
            });
            if (found) return found;
        }

        const scoped = String(bookmarkId || '').includes('__')
            ? String(bookmarkId).slice(String(bookmarkId).indexOf('__') + 2)
            : String(bookmarkId || '');
        const parts = scoped.split('_');
        const index = Number.parseInt(parts.pop(), 10);
        const topic = document.getElementById(parts.join('_'));
        if (!topic || !Number.isFinite(index)) return null;
        return Array.from(topic.querySelectorAll(BLOCK_SELECTOR)).filter(isTopLevelBlock)[index] || null;
    }

    function navigateToBookmark(bookmark) {
        if (pageMatches(bookmark)) {
            const box = findBoxById(bookmark.id, bookmark);
            if (!box) {
                announce(copy.unavailable);
                return;
            }
            if (window.experimentalReader && window.experimentalReader.isActive()) {
                window.experimentalReader.revealElement(box, { source: 'bookmark', animate: false, scroll: false, updateHash: true });
            }
            closeBookmarksPanel();
            if (typeof window.closeMobileMenu === 'function') window.closeMobileMenu();
            setTimeout(function () { highlightBookmarkTarget(box, true); }, 80);
            return;
        }

        let target;
        try { target = new URL(bookmark.page, location.href); } catch (_) { return; }
        if (target.origin !== location.origin) return;
        if (bookmark.topicId) target.hash = bookmark.topicId;
        try { sessionStorage.setItem(RESTORE_TARGET_KEY, bookmark.id); } catch (_) {}
        location.href = target.href;
    }

    function highlightBookmarkTarget(box, smooth) {
        box.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
        box.classList.add('nav-highlight');
        setTimeout(function () { box.classList.remove('nav-highlight'); }, 1500);
    }

    function restoreBookmarkTarget() {
        clearTimeout(restoreTimer);
        let id = '';
        try { id = sessionStorage.getItem(RESTORE_TARGET_KEY) || ''; } catch (_) {}
        if (!id) return;
        const bookmark = bookmarks[id] && !bookmarks[id].deleted ? Object.assign({ id: id }, bookmarks[id]) : null;
        const box = findBoxById(id, bookmark);
        if (!box && restoreAttempts < 12) {
            restoreAttempts += 1;
            restoreTimer = setTimeout(restoreBookmarkTarget, 180);
            return;
        }
        restoreAttempts = 0;
        try { sessionStorage.removeItem(RESTORE_TARGET_KEY); } catch (_) {}
        if (!box) return;
        if (window.experimentalReader && window.experimentalReader.isActive()) {
            window.experimentalReader.revealElement(box, { source: 'bookmark', animate: false, scroll: false, updateHash: true });
        }
        setTimeout(function () { highlightBookmarkTarget(box, false); }, 100);
    }

    function announce(message) {
        const live = document.getElementById('bookmarksLive');
        if (live) live.textContent = message;
    }

    function initializeBookmarks() {
        if (initializeBookmarks.done) return;
        initializeBookmarks.done = true;
        getVisitorId();
        loadBookmarks();
        subscribeToAccount();
        initLazyBookmarkButtons();
        addBookmarksSidebarButton();
        restoreBookmarkTarget();
        document.addEventListener('keydown', function (event) {
            if (event.key !== 'Escape' || !panelOpen) return;
            event.preventDefault();
            closeBookmarksPanel();
        });

        window.addEventListener('almanion-account-ready', function (event) {
            initFirebase();
            connectBookmarksAccount(event.detail && event.detail.user);
        });
        window.addEventListener('almanion-sync-retry', function () {
            if (bookmarkStore) bookmarkStore.flush();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeBookmarks, { once: true });
    else initializeBookmarks();

    window.addEventListener('almanion:content-ready', function (event) {
        addBookmarkButtons((event.detail && event.detail.root) || document);
        restoreBookmarkTarget();
    });

    window.AlmanionBookmarks = Object.freeze({
        open: openBookmarksPanel,
        close: closeBookmarksPanel,
        refresh: renderBookmarksList
    });
})();
